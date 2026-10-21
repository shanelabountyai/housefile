// Task 2.4 (D-12, D-14, D-35, D-46, D-55): commit writes exactly the stored plan, once, and only when the state
// still hashes to the batch's beforeHash. The only input is the batch id.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { commitBatch } from '@/commit/commit';
import { loadEffectiveState } from '@/commit/db-state';
import { previewBatch } from '@/commit/preview';
import { seedFixtures } from '@/commit/seed';
import { effectiveStateHash } from '@/commit/state';
import { loadConstituents, loadGifts } from '@/import/crm';
import { allTables, resetAuthTables } from '../helpers/auth';
import { makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);

const SLOW = { timeout: 120_000 }; // seed + preview + commit of file A is ~1,800 queries (ponytail: one query per written row; batch the reads if it matters)

const USER = '00000000-0000-4000-8000-000000000001';
const bytes = (p: string) => new Uint8Array(readFileSync(p));
const crm = loadConstituents(bytes('fixtures/crm_constituents.csv'));
const gifts = loadGifts(bytes('fixtures/crm_gifts.csv'));
const mapOf = (tag: string) => JSON.parse(readFileSync(`import/maps/import_${tag.toLowerCase()}.map.json`, 'utf8'));
const pathOf = (tag: string) => `fixtures/import_${tag.toLowerCase()}.csv`;

async function tableCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await allTables()) out[t] = (await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t}"`))[0]!.n;
  return out;
}

async function previewed(tag: 'A' | 'B') {
  const org = await makeOrg();
  await seedFixtures(db, { orgId: org.id, userId: USER, constituents: crm, gifts });
  const r = await previewBatch(db, { orgId: org.id, userId: USER, fileName: pathOf(tag), bytes: bytes(pathOf(tag)), map: mapOf(tag), asOf: '2026-10-14' });
  return { orgId: org.id, ...r };
}

describe('commitBatch (task 2.4)', () => {
  it('file A: the written rows equal the plan, count for count, every one tagged with the batch', SLOW, async () => {
    const { orgId, batchId, plan } = await previewed('A');
    const t = plan.totals;
    const before = await tableCounts();
    const r = await commitBatch(db, { batchId, userId: USER });
    expect(r.status).toBe('COMMITTED');
    const w = r.written;
    // D-55: a row whose target is an earlier row still in review waits as a review item instead of being written
    expect(w.pendingTargetRows).toBe(t.pendingTarget);
    expect(w.constituents).toBe(t.new);
    expect(w.mergeEvents + plan.pending.filter((p) => p.decision === 'MERGE').length).toBe(t.merged);
    expect(w.reviewRows).toBe(t.reviewed);
    expect(w.gifts + w.giftsPending).toBe(t.giftsToAdd);
    expect(w.giftsSkipped).toBe(t.dupGift + t.dupGiftInFile);
    expect(w.reviewItems).toBeGreaterThanOrEqual(t.reviewed + t.pendingTarget);
    expect([t.new, t.merged, t.reviewed, t.pendingTarget]).toEqual([71, 259, 55, 14]);

    const after = await tableCounts();
    expect(after.Constituent).toBe(before.Constituent! + w.constituents);
    expect(after.MergeEvent).toBe(before.MergeEvent! + w.mergeEvents);
    expect(after.ReviewItem).toBe(before.ReviewItem! + w.reviewItems);
    expect(after.Gift).toBe(before.Gift! + w.gifts);
    expect(after.ConstituentVersion).toBe(before.ConstituentVersion! + w.versions);
    expect(after.ImportBatchEvent).toBe(before.ImportBatchEvent! + 1);
    expect(after.ImportBatch).toBe(before.ImportBatch);
    expect(await db.constituentVersion.count({ where: { importBatchId: batchId } })).toBe(w.constituents);
    expect(await db.constituentVersion.count({ where: { mergeEvent: { importBatchId: batchId } } })).toBe(w.versions - w.constituents);
    expect(await db.gift.count({ where: { importBatchId: batchId } })).toBe(w.gifts);
    expect(await db.mergeEvent.count({ where: { importBatchId: batchId, kind: 'ROW_INTO_CONSTITUENT' } })).toBe(w.mergeEvents);
    expect(await db.reviewItem.count({ where: { importBatchId: batchId, candidateRowIndex: { not: null } } })).toBe(w.pendingTargetItems);
    expect(w.pendingTargetItems).toBeGreaterThanOrEqual(w.pendingTargetRows);
    expect(await db.importBatchEvent.findFirst({ where: { importBatchId: batchId } })).toMatchObject({ kind: 'COMMITTED' });
    const state = await loadEffectiveState(db, orgId);
    expect(effectiveStateHash(state)).not.toBe(plan.crm.beforeHash);
    expect(state.constituents.length).toBe(286 + t.new);
    expect(state.gifts.length).toBe(878 + w.gifts);
    // S1/S2 landed: the plan's field changes are on the survivors
    const c = plan.changes[0]!;
    const survivor = state.constituents.find((x) => x.id === c.constituentId)!;
    const field = c.field === 'address' ? 'addressLine1' : c.field;
    expect(String(survivor[field as 'email' | 'phone' | 'dob' | 'addressLine1'])).not.toBe(c.old === '(empty)' ? '' : undefined);
    expect(survivor.fieldMeta[c.field]?.asOf).toBe(c.asOfNew);
  });

  it('a second commit writes 0 rows (idempotent on batch id + planHash)', SLOW, async () => {
    const { batchId } = await previewed('B');
    const first = await commitBatch(db, { batchId, userId: USER });
    expect(first.status).toBe('COMMITTED');
    const counts = await tableCounts();
    const again = await commitBatch(db, { batchId, userId: USER });
    expect(again.status).toBe('ALREADY_COMMITTED');
    expect(Object.values(again.written).every((n) => n === 0)).toBe(true);
    expect(await tableCounts()).toEqual(counts);
  });

  it('a constituent changed between preview and commit → STATE_MOVED with 0 rows written', SLOW, async () => {
    const { orgId, batchId, plan } = await previewed('A');
    const c = await db.constituent.findUniqueOrThrow({ where: { orgId_businessId: { orgId, businessId: 'C0001' } } });
    const v1 = await db.constituentVersion.findUniqueOrThrow({ where: { constituentId_version: { constituentId: c.id, version: 1 } } });
    await db.constituentVersion.create({ data: { ...v1, id: undefined, createdAt: undefined, fieldMeta: v1.fieldMeta ?? {}, aliases: v1.aliases ?? [], alternates: v1.alternates ?? [], version: 2, email: 'moved@example.test' } });
    const counts = await tableCounts();
    const r = await commitBatch(db, { batchId, userId: USER });
    expect(r.status).toBe('STATE_MOVED');
    expect(r.expected).toBe(plan.crm.beforeHash);
    expect(r.actual).not.toBe(plan.crm.beforeHash);
    expect(await tableCounts()).toEqual(counts);
  });
});
