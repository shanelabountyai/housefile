// Task 2.8 (brief §8, D-13, D-63): undoBatch restores the exact prior state, proven by stateHash == beforeHash inside
// the transaction; a mismatch rolls back and marks UNDO_FAILED with both hashes; batches undo in reverse order only.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { loadEffectiveState } from '@/commit/db-state';
import { previewBatch } from '@/commit/preview';
import { batchStatus, decideReview } from '@/commit/review';
import { seedFixtures } from '@/commit/seed';
import { effectiveStateHash } from '@/commit/state';
import { undoBatch } from '@/commit/undo';
import { loadConstituents, loadGifts } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { ROBERT, smallOrg } from '../helpers/housefile';
import { addMember, makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);
const SLOW = { timeout: 180_000 };
const bytes = (p: string) => new Uint8Array(readFileSync(p));
const mapOf = (tag: string) => JSON.parse(readFileSync(`import/maps/import_${tag.toLowerCase()}.map.json`, 'utf8'));

async function fixtureOrg() {
  const o = await makeOrg();
  const owner = await addMember(o.id, 'owner', 'owner@example.test');
  await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: loadGifts(bytes('fixtures/crm_gifts.csv')) });
  const commit = async (tag: 'A' | 'B') => {
    const p = await previewBatch(db, { orgId: o.id, userId: owner.id, fileName: `fixtures/import_${tag.toLowerCase()}.csv`, bytes: bytes(`fixtures/import_${tag.toLowerCase()}.csv`), map: mapOf(tag), asOf: '2026-10-14' });
    expect((await commitBatch(db, { batchId: p.batchId, userId: owner.id })).status).toBe('COMMITTED');
    return p;
  };
  const hash = async () => effectiveStateHash(await loadEffectiveState(db, o.id));
  return { orgId: o.id, owner, commit, hash };
}

describe('undoBatch (task 2.8)', () => {
  it('file A: the hash proof passes; constituents created are retired, gifts voided, merges reversed', SLOW, async () => {
    const t = await fixtureOrg();
    const a = await t.commit('A');
    expect(await t.hash()).not.toBe(a.beforeHash);
    const r = await undoBatch(db, { batchId: a.batchId, userId: t.owner.id });
    expect(r.status).toBe('UNDONE');
    expect(r.afterHash).toBe(a.beforeHash);
    expect(await t.hash()).toBe(a.beforeHash);
    expect(await batchStatus(db, a.batchId)).toBe('UNDONE');
    const ev = await db.importBatchEvent.findFirstOrThrow({ where: { importBatchId: a.batchId, kind: 'UNDONE' } });
    expect(ev).toMatchObject({ expectedHash: a.beforeHash, actualHash: a.beforeHash, userId: t.owner.id });
    expect(r.reverted).toMatchObject({ constituentsRetired: a.plan.totals.new, giftsVoided: a.plan.totals.giftsToAdd - 11 }); // 11 gifts waited with pending rows (D-55) and were never written
    expect(await db.unmergeEvent.count()).toBe(r.reverted!.mergesReversed);
    expect((await undoBatch(db, { batchId: a.batchId, userId: t.owner.id })).code).toBe('ALREADY_UNDONE');
    // the state is back for real: a fresh preview of A plans the same thing again
    const again = await previewBatch(db, { orgId: t.orgId, userId: t.owner.id, fileName: 'fixtures/import_a.csv', bytes: bytes('fixtures/import_a.csv'), map: mapOf('A'), asOf: '2026-10-14' });
    expect(again.beforeHash).toBe(a.beforeHash);
    expect(again.planHash).toBe(a.planHash);
  });

  it('file B alone: the hash proof passes', SLOW, async () => {
    const t = await fixtureOrg();
    const b = await t.commit('B');
    const r = await undoBatch(db, { batchId: b.batchId, userId: t.owner.id });
    expect(r.status).toBe('UNDONE');
    expect(await t.hash()).toBe(b.beforeHash);
  });

  it('A then B: undoing A first is refused; B then A restores each beforeHash in turn', SLOW, async () => {
    const t = await fixtureOrg();
    const a = await t.commit('A');
    const b = await t.commit('B');
    expect(b.beforeHash).not.toBe(a.beforeHash);
    const refused = await undoBatch(db, { batchId: a.batchId, userId: t.owner.id });
    expect(refused.code).toBe('UNDO_BLOCKED_BY_LATER_BATCH');
    expect(refused.detail).toContain(b.batchId);
    expect(await db.importBatchEvent.count({ where: { importBatchId: a.batchId } })).toBe(1); // nothing written on a refusal
    expect((await undoBatch(db, { batchId: b.batchId, userId: t.owner.id })).status).toBe('UNDONE');
    expect(await t.hash()).toBe(b.beforeHash);
    expect((await undoBatch(db, { batchId: a.batchId, userId: t.owner.id })).status).toBe('UNDONE');
    expect(await t.hash()).toBe(a.beforeHash);
  });

  it('a hand-built batch: auto-merge with an S3 alias, a reviewed MERGE, a SAME_HOUSEHOLD, a KEEP_SEPARATE; all reverted', SLOW, async () => {
    const t = await smallOrg(
      ROBERT +
        'C0002,Mary,,Smith,,mary@example.com,,40 Pine Rd,,Tulsa,OK,74105,,H0002,2025-06-01\n' +
        'C0003,Linda,,Park,,family@example.com,,77 Elm St,,Tulsa,OK,74105,,H0003,2025-06-01\n',
      'G00001,C0001,2024-02-07,250000,BLDG,AF2024,Year-End 2024,GIFT,CHK1\n',
    );
    const before = effectiveStateHash(await loadEffectiveState(db, t.orgId));
    const { batchId, beforeHash, rowsOpen, committed } = await t.run(
      'Bob,Johnson,,robert.johnson@example.com,(918) 555-0142,12 Oak St,,Tulsa,OK,74105,,2026-01-15,25.00\n' + // auto-merge, S3 alias "Bob"
        'Mary,Smith,,,,40 Pine Rd,,Tulsa,OK,74105,,2026-02-01,30.00\n' + // review → MERGE
        'John,Smith,,mary@example.com,,40 Pine Rd,,Tulsa,OK,74105,,2026-02-02,40.00\n' + // review (GA-06) → SAME_HOUSEHOLD
        'Tom,Nguyen,,family@example.com,,,,,,,,2026-02-03,50.00\n', // review (GA-07) → KEEP_SEPARATE
    );
    expect(beforeHash).toBe(before);
    expect(committed.written).toMatchObject({ mergeEvents: 1, reviewRows: 3 });
    expect((await t.effective('C0001')).aliases).toHaveLength(1);
    const item = (rowIndex: number) => rowsOpen.find((r) => r.rowIndex === rowIndex)!.items[0]!.id;
    expect((await decideReview(db, { itemId: item(1), action: 'MERGE', reason: 'same', userId: t.owner.id })).status).toBe('DECIDED');
    expect((await decideReview(db, { itemId: item(2), action: 'SAME_HOUSEHOLD', userId: t.owner.id })).status).toBe('DECIDED');
    expect((await decideReview(db, { itemId: item(3), action: 'KEEP_SEPARATE', reason: 'different', userId: t.owner.id })).status).toBe('DECIDED');
    expect(await batchStatus(db, batchId)).toBe('COMPLETE');
    expect((await loadEffectiveState(db, t.orgId)).constituents.length).toBe(5);
    expect(await db.pairMemory.count()).toBe(1);

    const r = await undoBatch(db, { batchId, userId: t.owner.id });
    expect(r.status).toBe('UNDONE');
    expect(await effectiveStateHash(await loadEffectiveState(db, t.orgId))).toBe(before);
    expect((await loadEffectiveState(db, t.orgId)).constituents.map((c) => c.id)).toEqual(['C0001', 'C0002', 'C0003']);
    expect((await t.effective('C0001')).aliases).toEqual([]);
    expect(await db.pairMemory.count()).toBe(0);
    expect(r.reverted).toMatchObject({ constituentsRetired: 2, giftsVoided: 4, mergesReversed: 2 });
    expect(await db.gift.count({ where: { status: 'VOIDED', reason: 'BATCH_UNDONE' } })).toBe(4);
  });

  it('an injected fault makes UNDO_FAILED with both hashes and leaves the state unchanged', SLOW, async () => {
    const t = await smallOrg(ROBERT, 'G00001,C0001,2024-02-07,250000,BLDG,AF2024,Year-End 2024,GIFT,CHK1\n');
    const { batchId, beforeHash } = await t.run('Robert,Johnson,,robert.johnson@example.com,918-555-0177,12 Oak St,,Tulsa,OK,74105,,2026-02-20,10.00\n');
    const after = effectiveStateHash(await loadEffectiveState(db, t.orgId));
    const c = await t.byBiz('C0001');
    const r = await undoBatch(db, {
      batchId, userId: t.owner.id,
      beforeProof: async (tx) => {
        const v = await tx.constituentVersion.findFirstOrThrow({ where: { constituentId: c.id }, orderBy: { version: 'desc' } });
        await tx.constituentVersion.create({ data: { ...v, id: undefined, createdAt: undefined, fieldMeta: v.fieldMeta ?? {}, aliases: v.aliases ?? [], alternates: v.alternates ?? [], version: v.version + 1, email: 'fault@example.test', importBatchId: null, mergeEventId: null, reviewDecisionId: null, userId: t.owner.id } });
      },
    });
    expect(r.status).toBe('UNDO_FAILED');
    expect(r.expected).toBe(beforeHash);
    expect(r.actual).not.toBe(beforeHash);
    expect(effectiveStateHash(await loadEffectiveState(db, t.orgId))).toBe(after); // rolled back
    const ev = await db.importBatchEvent.findFirstOrThrow({ where: { importBatchId: batchId, kind: 'UNDO_FAILED' } });
    expect(ev).toMatchObject({ expectedHash: beforeHash, actualHash: r.actual });
    expect(await batchStatus(db, batchId)).toBe('UNDO_FAILED');
    expect((await undoBatch(db, { batchId, userId: t.owner.id })).status).toBe('UNDONE'); // a clean undo still works
  });

  it('a later write on a touched constituent blocks the undo', SLOW, async () => {
    const t = await smallOrg(ROBERT);
    const { batchId } = await t.run('Robert,Johnson,,robert.johnson@example.com,918-555-0177,12 Oak St,,Tulsa,OK,74105,,2026-02-20,10.00\n');
    const c = await t.byBiz('C0001');
    const v = await db.constituentVersion.findFirstOrThrow({ where: { constituentId: c.id }, orderBy: { version: 'desc' } });
    await db.constituentVersion.create({ data: { ...v, id: undefined, createdAt: undefined, fieldMeta: v.fieldMeta ?? {}, aliases: v.aliases ?? [], alternates: v.alternates ?? [], version: v.version + 1, email: 'edited@example.test', importBatchId: null, mergeEventId: null, reviewDecisionId: null, userId: t.owner.id } });
    expect((await undoBatch(db, { batchId, userId: t.owner.id })).code).toBe('UNDO_BLOCKED_BY_LATER_WRITE');
  });
});
