// Task 2.1 (+2.7): the seven append-only tables refuse UPDATE and DELETE at the database, and the CHECKs
// in migration 20261019212236_housefile_init hold. Raw SQL on purpose: the triggers, not the app, are the control.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { resetAuthTables } from '../helpers/auth';
import { makeOrg } from '../helpers/org';

beforeEach(resetAuthTables);

const USER = '00000000-0000-4000-8000-000000000001';

/** One row in every Phase 2 table, written the way the commit path will write them. */
async function seedOne() {
  const org = await makeOrg();
  const orgId = org.id;
  const c = await db.constituent.create({ data: { orgId, businessId: 'C0001' } });
  const hh = await db.household.create({ data: { orgId, businessId: 'H0001' } });
  const fund = await db.fund.create({ data: { orgId, code: 'GEN' } });
  const batch = await db.importBatch.create({
    data: { orgId, fileName: 'a.csv', rawBytes: Buffer.from('x'), contentHash: 'h', encoding: 'utf-8', asOf: new Date('2026-10-01'), map: {}, rows: [], plan: {}, planHash: 'p', beforeHash: 'b' },
  });
  const version = await db.constituentVersion.create({ data: { orgId, constituentId: c.id, version: 1, firstName: 'Zoë', householdId: hh.id, userId: USER } });
  const gift = await db.gift.create({ data: { orgId, giftRef: 'G00001', constituentId: c.id, giftDate: new Date('2024-02-07'), amountCents: 250000, fundId: fund.id, importBatchId: batch.id } });
  const event = await db.importBatchEvent.create({ data: { orgId, importBatchId: batch.id, kind: 'COMMITTED' } });
  const item = await db.reviewItem.create({ data: { orgId, importBatchId: batch.id, rowIndex: 3, constituentId: c.id, score: 55, reasons: [], flags: [] } });
  const decision = await db.reviewDecision.create({ data: { orgId, reviewItemId: item.id, action: 'DEFER', userId: USER } });
  const merge = await db.mergeEvent.create({
    data: { orgId, kind: 'ROW_INTO_CONSTITUENT', survivorId: c.id, rowIndex: 3, survivorSnapshot: {}, loserSnapshot: {}, choices: {}, giftRefsMoved: [], softCreditsMoved: [], importBatchId: batch.id },
  });
  const unmerge = await db.unmergeEvent.create({ data: { orgId, mergeEventId: merge.id, survivorHash: 'h', loserHash: '', userId: USER } });
  return { orgId, c, fund, batch, item, ids: { ConstituentVersion: version.id, Gift: gift.id, ImportBatch: batch.id, ImportBatchEvent: event.id, ReviewDecision: decision.id, MergeEvent: merge.id, UnmergeEvent: unmerge.id } };
}

describe('append-only tables (D-6, D-46, D-47, D-62)', () => {
  for (const table of ['ConstituentVersion', 'Gift', 'ImportBatch', 'ImportBatchEvent', 'ReviewDecision', 'MergeEvent', 'UnmergeEvent'] as const) {
    it(`${table} rejects UPDATE and DELETE`, async () => {
      const { ids } = await seedOne();
      const id = ids[table];
      await expect(db.$executeRawUnsafe(`UPDATE "${table}" SET "orgId" = "orgId" WHERE id = $1::uuid`, id)).rejects.toThrow(`${table} is append-only`);
      await expect(db.$executeRawUnsafe(`DELETE FROM "${table}" WHERE id = $1::uuid`, id)).rejects.toThrow(`${table} is append-only`);
      const [row] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}" WHERE id = $1::uuid`, id);
      expect(row?.n).toBe(1);
    });
  }

  it('an org holding donor records cannot be deleted by cascade (D-52)', async () => {
    const { orgId } = await seedOne();
    await expect(db.org.delete({ where: { id: orgId } })).rejects.toThrow();
    expect(await db.org.count({ where: { id: orgId } })).toBe(1);
  });
});

describe('CHECK constraints', () => {
  it('a version has exactly one writer (D-7)', async () => {
    const { orgId, c, batch } = await seedOne();
    await expect(db.constituentVersion.create({ data: { orgId, constituentId: c.id, version: 2 } })).rejects.toThrow(/ConstituentVersion_one_writer/);
    await expect(db.constituentVersion.create({ data: { orgId, constituentId: c.id, version: 2, userId: USER, importBatchId: batch.id } })).rejects.toThrow(/ConstituentVersion_one_writer/);
  });

  it('a gift is positive integer cents with one writer; a superseding row needs a reason (D-6)', async () => {
    const { orgId, c, fund, batch, ids } = await seedOne();
    const base = { orgId, giftRef: 'G00001', constituentId: c.id, giftDate: new Date('2024-02-07'), fundId: fund.id };
    await expect(db.gift.create({ data: { ...base, amountCents: 0, userId: USER } })).rejects.toThrow(/Gift_amount_positive/);
    await expect(db.gift.create({ data: { ...base, amountCents: 100 } })).rejects.toThrow(/Gift_one_writer/);
    await expect(db.gift.create({ data: { ...base, amountCents: 250000, supersedesGiftId: ids.Gift, status: 'VOIDED', importBatchId: batch.id } })).rejects.toThrow(/Gift_supersede_reason/);
    const voided = await db.gift.create({ data: { ...base, amountCents: 250000, supersedesGiftId: ids.Gift, status: 'VOIDED', reason: 'BATCH_UNDONE', importBatchId: batch.id } });
    // one successor per row: history is a chain, never a fork
    await expect(db.gift.create({ data: { ...base, amountCents: 250000, supersedesGiftId: ids.Gift, reason: 'again', userId: USER } })).rejects.toThrow();
    expect(voided.status).toBe('VOIDED');
  });

  it('MERGE and KEEP_SEPARATE need a reason; DEFER does not (D-22)', async () => {
    const { orgId, item } = await seedOne();
    for (const action of ['MERGE', 'KEEP_SEPARATE'] as const) {
      await expect(db.reviewDecision.create({ data: { orgId, reviewItemId: item.id, action, userId: USER } })).rejects.toThrow(/ReviewDecision_reason/);
      await expect(db.reviewDecision.create({ data: { orgId, reviewItemId: item.id, action, reason: '  ', userId: USER } })).rejects.toThrow(/ReviewDecision_reason/);
    }
    await expect(db.reviewDecision.create({ data: { orgId, reviewItemId: item.id, action: 'MERGE', reason: 'same phone and DOB', userId: USER } })).resolves.toBeTruthy();
  });

  it('a merge event has one writer and the shape of its kind (D-46)', async () => {
    const { orgId, c, batch } = await seedOne();
    const base = { orgId, survivorId: c.id, survivorSnapshot: {}, loserSnapshot: {}, choices: {}, giftRefsMoved: [], softCreditsMoved: [] };
    await expect(db.mergeEvent.create({ data: { ...base, kind: 'ROW_INTO_CONSTITUENT', rowIndex: 1 } })).rejects.toThrow(/MergeEvent_one_writer/);
    await expect(db.mergeEvent.create({ data: { ...base, kind: 'ROW_INTO_CONSTITUENT', importBatchId: batch.id } })).rejects.toThrow(/MergeEvent_kind_shape/);
    await expect(db.mergeEvent.create({ data: { ...base, kind: 'CONSTITUENT_INTO_CONSTITUENT', rowIndex: 1, userId: USER } })).rejects.toThrow(/MergeEvent_kind_shape/);
  });
});
