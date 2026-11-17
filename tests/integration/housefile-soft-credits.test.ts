// Task 3.7 (D-9, D-74c, D-81): soft credits seeded from fixtures/phase3/ hash equal to the fixture in memory; recognition
// read from the database equals the oracle; add and remove are append-only rows; a merge moves the loser's soft credits
// (softCreditsMoved) and unmerge moves them back, both records hashing equal to their snapshots; batch undo restores a
// soft credit a review MERGE moved, and its afterHash equals beforeHash.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { loadEffectiveConstituent, loadEffectiveState, type ConstituentSnapshot } from '@/commit/db-state';
import { voidGift } from '@/commit/gifts';
import { mergeConstituents } from '@/commit/merge';
import { decideReview } from '@/commit/review';
import { seedFixtures } from '@/commit/seed';
import { addSoftCredit, removeSoftCredit } from '@/commit/soft-credits';
import { effectiveStateHash } from '@/commit/state';
import { undoBatch } from '@/commit/undo';
import { snapshotHash, unmerge } from '@/commit/unmerge';
import { recognition } from '@/derive/recognition';
import { rollups } from '@/derive/rollups';
import { loadAppealCampaigns } from '@/commit/db-state';
import { loadConstituents } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { ROBERT, smallOrg } from '../helpers/housefile';
import { addMember, makeOrg } from '../helpers/org';
import { answers, phase3Pledges, phase3SeedGifts, phase3SoftCredits, phase3State } from '../helpers/phase3';

beforeEach(resetAuthTables);
const SLOW = { timeout: 180_000 };
const bytes = (p: string) => new Uint8Array(readFileSync(p));

async function phase3Org() {
  const o = await makeOrg();
  const owner = await addMember(o.id, 'owner', 'owner@example.test');
  const seeded = await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: phase3SeedGifts(), pledges: phase3Pledges(), softCredits: phase3SoftCredits() });
  return { orgId: o.id, owner, seeded, state: () => loadEffectiveState(db, o.id) };
}

describe('soft credits (task 3.7)', () => {
  it('seed hashes as the fixture, recognition equals the oracle, raised totals ignore soft; add and remove are rows', SLOW, async () => {
    const t = await phase3Org();
    expect(t.seeded.softCredits).toBe(42);
    const seededHash = effectiveStateHash(await t.state());
    expect(seededHash).toBe(effectiveStateHash(phase3State()));
    expect(recognition(await t.state(), answers.asOf)).toEqual(answers.recognition);
    const s = await t.state();
    const campaignOf = await loadAppealCampaigns(db, t.orgId);
    expect(rollups(s, answers.asOf, campaignOf)).toEqual(rollups({ ...s, softCredits: [] }, answers.asOf, campaignOf));

    // add: a new SC ref after the fixture's, counted in recognition at its own cents; the hard donor is refused
    const g = s.gifts.find((x) => x.giftRef === 'G00001')!;
    const other = s.constituents.find((c) => c.id !== g.constituent && !answers.recognition[c.id])!;
    const base = { orgId: t.orgId, userId: t.owner.id, giftRef: g.giftRef, role: 'SPOUSE' };
    expect(await addSoftCredit(db, { ...base, constituent: g.constituent, amountCents: 100 })).toMatchObject({ status: 'REFUSED', code: 'HARD_DONOR' });
    expect(await addSoftCredit(db, { ...base, constituent: other.id, amountCents: 0 })).toMatchObject({ code: 'BAD_AMOUNT' });
    const added = await addSoftCredit(db, { ...base, constituent: other.id, amountCents: 12345 });
    expect(added).toEqual({ status: 'ADDED', softCreditRef: 'SC043' });
    expect(await addSoftCredit(db, { ...base, constituent: other.id, amountCents: 1 })).toMatchObject({ code: 'DUPLICATE' });
    expect(recognition(await t.state(), answers.asOf)[other.id]).toEqual({ hardCents: 0, softCents: 12345, totalCents: 12345 });

    // remove: a superseding REMOVED row with a reason; the state hashes as seeded again
    expect(await removeSoftCredit(db, { orgId: t.orgId, userId: t.owner.id, softCreditRef: 'SC043', reason: ' ' })).toMatchObject({ code: 'REASON_REQUIRED' });
    expect(await removeSoftCredit(db, { orgId: t.orgId, userId: t.owner.id, softCreditRef: 'SC043', reason: 'entered on the wrong gift' })).toEqual({ status: 'REMOVED', softCreditRef: 'SC043' });
    expect(await removeSoftCredit(db, { orgId: t.orgId, userId: t.owner.id, softCreditRef: 'SC043', reason: 'again' })).toMatchObject({ code: 'ALREADY_REMOVED' });
    expect(effectiveStateHash(await t.state())).toBe(seededHash);
    expect(await db.softCredit.count({ where: { orgId: t.orgId, softCreditRef: 'SC043' } })).toBe(2);
    expect(await db.auditEvent.count({ where: { orgId: t.orgId, action: { in: ['softCredit.add', 'softCredit.remove'] } } })).toBe(2);

    // a voided gift's soft credit drops out of recognition; a new one on it is refused
    const sc = phase3SoftCredits().find((x) => x.gift_id === 'G00002')!;
    await voidGift(db, { orgId: t.orgId, userId: t.owner.id, giftRef: 'G00002', reason: 'test void' });
    const r = recognition(await t.state(), answers.asOf);
    expect(answers.recognition[sc.constituent_id].softCents - (r[sc.constituent_id]?.softCents ?? 0)).toBe(sc.amount_cents);
    expect(await addSoftCredit(db, { ...base, giftRef: 'G00002', constituent: other.id, amountCents: 1 })).toMatchObject({ code: 'GIFT_VOIDED' });

    const member = await addMember(t.orgId, 'member', 'member@example.test');
    expect(await addSoftCredit(db, { ...base, userId: member.id, constituent: other.id, amountCents: 1 })).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('merge moves the loser soft credits to the survivor; unmerge moves them back, both snapshot hashes equal', SLOW, async () => {
    const t = await phase3Org();
    const loser = await db.constituent.findFirstOrThrow({ where: { orgId: t.orgId, businessId: 'C0271' } });
    const survivor = await db.constituent.findFirstOrThrow({ where: { orgId: t.orgId, createdAt: { lt: loser.createdAt }, softCredits: { none: {} }, pledges: { none: {} } }, orderBy: { createdAt: 'asc' } });
    const refs = phase3SoftCredits().filter((x) => x.constituent_id === 'C0271').map((x) => x.soft_credit_id);
    const before = effectiveStateHash(await t.state());
    const m = await mergeConstituents(db, { aId: loser.id, bId: survivor.id, userId: t.owner.id, reason: 'same person' });
    expect(m).toMatchObject({ status: 'MERGED', survivorId: survivor.id, loserId: loser.id });
    const ev = await db.mergeEvent.findUniqueOrThrow({ where: { id: m.mergeEventId! } });
    expect(ev.softCreditsMoved).toEqual(refs);
    const loserSnap = ev.loserSnapshot as unknown as ConstituentSnapshot;
    expect(loserSnap.softCreditRefs).toEqual(refs);

    const merged = await t.state();
    expect(merged.softCredits.filter((x) => refs.includes(x.softCreditRef)).every((x) => x.constituent === survivor.businessId)).toBe(true);
    const rec = recognition(merged, answers.asOf);
    const sv = answers.recognition[survivor.businessId] ?? { hardCents: 0, softCents: 0 };
    const lo = answers.recognition.C0271;
    expect(rec[survivor.businessId]!.softCents).toBe(sv.softCents + lo.softCents);
    expect(rec.C0271).toBeUndefined();

    const u = await unmerge(db, { mergeEventId: ev.id, userId: t.owner.id, reason: 'not the same person' });
    expect(u.status).toBe('UNMERGED');
    const svNow = await loadEffectiveConstituent(db, survivor.id);
    const loNow = await loadEffectiveConstituent(db, loser.id);
    expect(snapshotHash(svNow)).toBe(snapshotHash(ev.survivorSnapshot as unknown as ConstituentSnapshot));
    expect(snapshotHash(loNow)).toBe(snapshotHash(loserSnap));
    expect(loNow.softCreditRefs).toEqual(refs);
    expect(snapshotHash({ ...loNow, softCreditRefs: [] })).not.toBe(snapshotHash(loNow)); // the proof covers the soft credits
    expect(effectiveStateHash(await t.state())).toBe(before);
    expect(recognition(await t.state(), answers.asOf)).toEqual(answers.recognition);
  });

  it('batch undo moves back a soft credit that a review MERGE on a pair-memory item moved (D-59)', SLOW, async () => {
    const t = await smallOrg(ROBERT + 'C0002,Bob,,Johnson,,bob@example.com,(918) 555-0142,12 Oak St,,Tulsa,OK,74105,,H0001,2025-07-01\nC0003,Ann,,Lee,,ann@example.com,(918) 555-0199,9 Elm St,,Tulsa,OK,74105,,H0002,2025-05-01\n', 'G00001,C0003,2024-02-07,250000,BLDG,AF2024,Year-End 2024,GIFT,CHK1\n');
    const bob = await t.byBiz('C0002');
    await db.softCredit.create({ data: { orgId: t.orgId, softCreditRef: 'SC001', giftRef: 'G00001', constituentId: bob.id, role: 'PEER_TO_PEER', amountCents: 5000, userId: t.owner.id } });
    const { batchId, beforeHash } = await t.run('');
    const item = await db.reviewItem.create({ data: { orgId: t.orgId, importBatchId: batchId, rowIndex: 0, constituentId: bob.id, score: 60, reasons: ['PHONE_EXACT'], flags: ['PAIR_MEMORY', 'MERGED_INTO:C0001'] } });
    expect((await decideReview(db, { itemId: item.id, action: 'MERGE', reason: 'same person after all', userId: t.owner.id })).status).toBe('DECIDED');
    expect((await loadEffectiveState(db, t.orgId)).softCredits.map((s) => s.constituent)).toEqual(['C0001']);
    const r = await undoBatch(db, { batchId, userId: t.owner.id });
    expect(r).toMatchObject({ status: 'UNDONE', afterHash: beforeHash, reverted: { softCreditsRestored: 1 } });
    expect((await loadEffectiveState(db, t.orgId)).softCredits.map((s) => s.constituent)).toEqual(['C0002']);
  });

  it('refuses UPDATE and DELETE on a soft credit row (append-only)', SLOW, async () => {
    const t = await phase3Org();
    const s = await db.softCredit.findFirstOrThrow({ where: { orgId: t.orgId } });
    await expect(db.softCredit.update({ where: { id: s.id }, data: { amountCents: s.amountCents + 1 } })).rejects.toThrow(/append-only/);
    await expect(db.softCredit.delete({ where: { id: s.id } })).rejects.toThrow(/append-only/);
  });
});
