// Task 2.9 (D-12, D-13): with the append-only triggers disabled, a changed gift, a changed version and a changed
// stored plan are each caught by name: commit refuses (STATE_MOVED, PLAN_TAMPERED) and undo writes UNDO_FAILED.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { loadEffectiveState } from '@/commit/db-state';
import { previewBatch } from '@/commit/preview';
import { batchStatus } from '@/commit/review';
import { seedFixtures } from '@/commit/seed';
import { effectiveStateHash } from '@/commit/state';
import { undoBatch } from '@/commit/undo';
import { loadConstituents, loadGifts } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);
const SLOW = { timeout: 120_000 };
const bytes = (p: string) => new Uint8Array(readFileSync(p));

/** Runs `sql` with a table's append-only trigger off, then on again: what a DBA with the wrong grant could do. */
async function tamper(table: string, sql: string, ...args: unknown[]) {
  await db.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${table}_append_only"`);
  try {
    expect(await db.$executeRawUnsafe(sql, ...args)).toBe(1);
  } finally {
    await db.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${table}_append_only"`);
  }
}

async function previewedA() {
  const o = await makeOrg();
  const owner = await addMember(o.id, 'owner', 'owner@example.test');
  await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: loadGifts(bytes('fixtures/crm_gifts.csv')) });
  const p = await previewBatch(db, { orgId: o.id, userId: owner.id, fileName: 'fixtures/import_a.csv', bytes: bytes('fixtures/import_a.csv'), map: JSON.parse(readFileSync('import/maps/import_a.map.json', 'utf8')), asOf: '2026-10-14' });
  return { orgId: o.id, owner, ...p };
}

describe('tamper (task 2.9)', () => {
  it('one gift\'s cents changed under the trigger: commit says STATE_MOVED, 0 rows', SLOW, async () => {
    const t = await previewedA();
    const g = await db.gift.findFirstOrThrow({ where: { orgId: t.orgId, giftRef: 'G00001' } });
    await tamper('Gift', `UPDATE "Gift" SET "amountCents" = "amountCents" + 1 WHERE id = $1::uuid`, g.id);
    const r = await commitBatch(db, { batchId: t.batchId, userId: t.owner.id });
    expect(r.status).toBe('STATE_MOVED');
    expect(r.expected).toBe(t.beforeHash);
    expect(r.actual).toBe(effectiveStateHash(await loadEffectiveState(db, t.orgId)));
    expect(await db.importBatchEvent.count()).toBe(0);
    expect(await db.mergeEvent.count()).toBe(0);
  });

  it('one version\'s email changed under the trigger: commit says STATE_MOVED', SLOW, async () => {
    const t = await previewedA();
    const v = await db.constituentVersion.findFirstOrThrow({ where: { orgId: t.orgId, email: { not: '' } } });
    await tamper('ConstituentVersion', `UPDATE "ConstituentVersion" SET email = 'tampered@example.test' WHERE id = $1::uuid`, v.id);
    const r = await commitBatch(db, { batchId: t.batchId, userId: t.owner.id });
    expect(r.status).toBe('STATE_MOVED');
    expect(await db.mergeEvent.count()).toBe(0);
  });

  it('the stored plan changed under the trigger: commit says PLAN_TAMPERED with both hashes', SLOW, async () => {
    const t = await previewedA();
    await tamper('ImportBatch', `UPDATE "ImportBatch" SET plan = jsonb_set(plan, '{gifts,0,cents}', to_jsonb((plan->'gifts'->0->>'cents')::int + 100)) WHERE id = $1::uuid`, t.batchId);
    const r = await commitBatch(db, { batchId: t.batchId, userId: t.owner.id });
    expect(r.status).toBe('PLAN_TAMPERED');
    expect(r.expected).toBe(t.planHash);
    expect(r.actual).not.toBe(t.planHash);
    expect(await db.mergeEvent.count()).toBe(0);
  });

  it('a gift changed under the trigger after commit: undo writes UNDO_FAILED with both hashes and changes nothing else', SLOW, async () => {
    const t = await previewedA();
    expect((await commitBatch(db, { batchId: t.batchId, userId: t.owner.id })).status).toBe('COMMITTED');
    const g = await db.gift.findFirstOrThrow({ where: { orgId: t.orgId, giftRef: 'G00002' } });
    await tamper('Gift', `UPDATE "Gift" SET "amountCents" = "amountCents" + 1 WHERE id = $1::uuid`, g.id);
    const after = effectiveStateHash(await loadEffectiveState(db, t.orgId));
    const counts = { v: await db.constituentVersion.count(), g: await db.gift.count(), u: await db.unmergeEvent.count() };
    const r = await undoBatch(db, { batchId: t.batchId, userId: t.owner.id });
    expect(r.status).toBe('UNDO_FAILED');
    expect(r.expected).toBe(t.beforeHash);
    expect(r.actual).not.toBe(t.beforeHash);
    expect(await batchStatus(db, t.batchId)).toBe('UNDO_FAILED');
    expect((await db.importBatchEvent.findFirstOrThrow({ where: { importBatchId: t.batchId, kind: 'UNDO_FAILED' } })).actualHash).toBe(r.actual);
    expect(effectiveStateHash(await loadEffectiveState(db, t.orgId))).toBe(after); // the undo's own writes rolled back
    expect({ v: await db.constituentVersion.count(), g: await db.gift.count(), u: await db.unmergeEvent.count() }).toEqual(counts);
  });
});
