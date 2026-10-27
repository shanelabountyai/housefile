// Task 3.6 (D-9, D-71, D-80): pledges seeded from fixtures/phase3/ hash equal to the fixture in memory; every balance
// read from the database equals the oracle; voiding a payment raises its balance by its cents; a merge moves a pledge
// with its payments to the survivor and unmerge moves both back, each record hashing equal to its snapshot.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { loadEffectiveConstituent, loadEffectiveState, type ConstituentSnapshot } from '@/commit/db-state';
import { voidGift } from '@/commit/gifts';
import { mergeConstituents } from '@/commit/merge';
import { decideReview } from '@/commit/review';
import { seedFixtures } from '@/commit/seed';
import { effectiveStateHash } from '@/commit/state';
import { undoBatch } from '@/commit/undo';
import { snapshotHash, unmerge } from '@/commit/unmerge';
import { pledgeBalances } from '@/derive/pledges';
import { loadConstituents } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { ROBERT, smallOrg } from '../helpers/housefile';
import { addMember, makeOrg } from '../helpers/org';
import { answers, phase3Pledges, phase3SeedGifts, phase3State } from '../helpers/phase3';

beforeEach(resetAuthTables);
const SLOW = { timeout: 180_000 };
const bytes = (p: string) => new Uint8Array(readFileSync(p));
/** The Phase 3 seed's effective-state hash (D-80): constituents, corrected gifts with payments, 18 pledges. */
const PHASE3_SEED_HASH = 'b405b676dda29596912ea274e101f211019ee197158a6ebdeb3169b71c2fe853';

describe('pledges (task 3.6)', () => {
  it('seed hashes as the fixture, balances equal the oracle, a void raises one, merge and unmerge move pledge and payments', SLOW, async () => {
    const o = await makeOrg();
    const owner = await addMember(o.id, 'owner', 'owner@example.test');
    const seeded = await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: phase3SeedGifts(), pledges: phase3Pledges() });
    expect(seeded.pledges).toBe(18);
    const state = async () => loadEffectiveState(db, o.id);

    const seededHash = effectiveStateHash(await state());
    expect(seededHash).toBe(effectiveStateHash(phase3State()));
    expect(seededHash).toBe(PHASE3_SEED_HASH);
    expect(pledgeBalances(await state(), answers.asOf)).toEqual(answers.pledges);

    // Voiding a payment raises its pledge's balance by exactly its cents; nothing else moves.
    const pay = await db.gift.findFirstOrThrow({ where: { orgId: o.id, pledgeRef: 'PL001', supersededBy: null }, orderBy: { giftRef: 'asc' } });
    expect((await voidGift(db, { orgId: o.id, userId: owner.id, giftRef: pay.giftRef, reason: 'payment bounced' })).status).toBe('VOIDED');
    const voided = pledgeBalances(await state(), answers.asOf);
    expect(voided.PL001!.balanceCents - answers.pledges.PL001.balanceCents).toBe(pay.amountCents);
    expect({ ...voided, PL001: answers.pledges.PL001 }).toEqual(answers.pledges);

    // Merge: the pledger loses to an earlier record; the pledge and its payments move to the survivor.
    const pledger = await db.constituent.findFirstOrThrow({ where: { orgId: o.id, businessId: answers.pledges.PL002.constituentId } });
    const earlier = await db.constituent.findFirstOrThrow({ where: { orgId: o.id, createdAt: { lt: pledger.createdAt }, pledges: { none: {} } }, orderBy: { createdAt: 'asc' } });
    const before = effectiveStateHash(await state());
    const m = await mergeConstituents(db, { aId: pledger.id, bId: earlier.id, userId: owner.id, reason: 'same person' });
    expect(m).toMatchObject({ status: 'MERGED', survivorId: earlier.id, loserId: pledger.id });
    const ev = await db.mergeEvent.findUniqueOrThrow({ where: { id: m.mergeEventId! } });
    const loserSnap = ev.loserSnapshot as unknown as ConstituentSnapshot;
    expect(loserSnap.pledgeRefs).toEqual(['PL002']);
    const merged = await state();
    expect(merged.pledges!.find((p) => p.pledgeRef === 'PL002')!.constituent).toBe(earlier.businessId);
    const payments = merged.gifts.filter((g) => g.pledgeRef === 'PL002');
    expect(payments.length).toBe(answers.pledges.PL002.payments);
    expect(payments.every((g) => g.constituent === earlier.businessId)).toBe(true);
    expect(pledgeBalances(merged, answers.asOf).PL002).toEqual({ ...answers.pledges.PL002, constituentId: earlier.businessId });
    expect((await loadEffectiveConstituent(db, pledger.id)).pledgeRefs).toEqual([]);

    // Unmerge: both records hash equal to their snapshots (pledgeRefs included), the pledge and payments are back.
    const u = await unmerge(db, { mergeEventId: ev.id, userId: owner.id, reason: 'not the same person' });
    expect(u.status).toBe('UNMERGED');
    const sv = await loadEffectiveConstituent(db, earlier.id);
    const lo = await loadEffectiveConstituent(db, pledger.id);
    expect(snapshotHash(sv)).toBe(snapshotHash(ev.survivorSnapshot as unknown as ConstituentSnapshot));
    expect(snapshotHash(lo)).toBe(snapshotHash(loserSnap));
    expect(lo.pledgeRefs).toEqual(['PL002']);
    expect(snapshotHash({ ...lo, pledgeRefs: [] })).not.toBe(snapshotHash(lo)); // the unmerge proof itself covers the pledge
    expect(effectiveStateHash(await state())).toBe(before);
    expect(await db.pledge.count({ where: { orgId: o.id, pledgeRef: 'PL002' } })).toBe(3); // seed, merge, unmerge: a chain, nothing updated
  });

  it('batch undo moves back a pledge that a review MERGE on a pair-memory item moved (D-59)', SLOW, async () => {
    const t = await smallOrg(ROBERT + 'C0002,Bob,,Johnson,,bob@example.com,(918) 555-0142,12 Oak St,,Tulsa,OK,74105,,H0001,2025-07-01\n', 'G00001,C0001,2024-02-07,250000,BLDG,AF2024,Year-End 2024,GIFT,CHK1\n');
    const bob = await t.byBiz('C0002');
    const fund = await db.fund.findFirstOrThrow({ where: { orgId: t.orgId } });
    await db.pledge.create({ data: { orgId: t.orgId, pledgeRef: 'PL001', constituentId: bob.id, pledgeDate: new Date('2026-01-01'), totalCents: 100000, schedule: [{ due: '2026-06-01', cents: 100000 }], fundId: fund.id, userId: t.owner.id } });
    const { batchId, beforeHash } = await t.run('');
    const item = await db.reviewItem.create({ data: { orgId: t.orgId, importBatchId: batchId, rowIndex: 0, constituentId: bob.id, score: 60, reasons: ['PHONE_EXACT'], flags: ['PAIR_MEMORY', 'MERGED_INTO:C0001'] } });
    expect((await decideReview(db, { itemId: item.id, action: 'MERGE', reason: 'same person after all', userId: t.owner.id })).status).toBe('DECIDED');
    expect((await loadEffectiveState(db, t.orgId)).pledges!.map((p) => p.constituent)).toEqual(['C0001']);
    const r = await undoBatch(db, { batchId, userId: t.owner.id });
    expect(r).toMatchObject({ status: 'UNDONE', afterHash: beforeHash, reverted: { pledgesRestored: 1 } });
    expect((await loadEffectiveState(db, t.orgId)).pledges!.map((p) => p.constituent)).toEqual(['C0002']);
  });

  it('refuses UPDATE and DELETE on a pledge row (append-only)', SLOW, async () => {
    const o = await makeOrg();
    const owner = await addMember(o.id, 'owner', 'owner@example.test');
    await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: phase3SeedGifts(), pledges: phase3Pledges() });
    const p = await db.pledge.findFirstOrThrow({ where: { orgId: o.id } });
    await expect(db.pledge.update({ where: { id: p.id }, data: { totalCents: p.totalCents + 1 } })).rejects.toThrow(/append-only/);
    await expect(db.pledge.delete({ where: { id: p.id } })).rejects.toThrow(/append-only/);
  });
});
