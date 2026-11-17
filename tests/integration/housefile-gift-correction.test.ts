// Task 3.5 (D-6, D-60, D-72, P-14): correcting or voiding a gift by hand writes one superseding row with a reason and
// the actor as its writer, audited in the same transaction. The original row is unchanged, the chain gains exactly one
// successor, and the roll-ups move by exactly the difference. A member, an empty reason or a bad change writes nothing.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { correctGift, voidGift } from '@/commit/gifts';
import { loadAppealCampaigns, loadEffectiveState } from '@/commit/db-state';
import { seedFixtures } from '@/commit/seed';
import { rollups } from '@/derive/rollups';
import { loadConstituents } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';
import { answers, phase3SeedGifts } from '../helpers/phase3';

beforeEach(resetAuthTables);
const SLOW = { timeout: 180_000 };
const bytes = (p: string) => new Uint8Array(readFileSync(p));

describe('gift correction and void (task 3.5)', () => {
  it('supersedes once, leaves the original, moves roll-ups by the difference, refuses what it must', SLOW, async () => {
    const o = await makeOrg();
    const owner = await addMember(o.id, 'owner', 'owner@example.test');
    const member = await addMember(o.id, 'member', 'member@example.test');
    await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts: phase3SeedGifts() });
    const view = async () => rollups(await loadEffectiveState(db, o.id), answers.asOf, await loadAppealCampaigns(db, o.id));
    const funds = await db.fund.findMany({ where: { orgId: o.id }, orderBy: { code: 'asc' } });
    const heads = await db.gift.findMany({ where: { orgId: o.id, supersededBy: null, giftDate: { lte: new Date(`${answers.asOf}T00:00:00Z`) } }, include: { fund: true }, orderBy: { giftRef: 'asc' }, take: 2 });
    const [g1, g2] = [heads[0]!, heads[1]!];
    const counts = async () => ({ gifts: await db.gift.count({ where: { orgId: o.id } }), audits: await db.auditEvent.count({ where: { orgId: o.id } }) });

    // Refusals write nothing.
    const quiet = await counts();
    expect(await correctGift(db, { orgId: o.id, userId: member.id, giftRef: g1.giftRef, change: { amountCents: g1.amountCents + 1 }, reason: 'typo' })).toMatchObject({ status: 'REFUSED', code: 'FORBIDDEN' });
    expect(await voidGift(db, { orgId: o.id, userId: member.id, giftRef: g1.giftRef, reason: 'typo' })).toMatchObject({ status: 'REFUSED', code: 'FORBIDDEN' });
    expect(await correctGift(db, { orgId: o.id, userId: owner.id, giftRef: g1.giftRef, change: { amountCents: g1.amountCents + 1 }, reason: '   ' })).toMatchObject({ status: 'REFUSED', code: 'REASON_REQUIRED' });
    expect(await voidGift(db, { orgId: o.id, userId: owner.id, giftRef: g1.giftRef, reason: '' })).toMatchObject({ status: 'REFUSED', code: 'REASON_REQUIRED' });
    for (const [change, code] of [
      [{}, 'NO_CHANGE'], [{ amountCents: g1.amountCents }, 'NO_CHANGE'], [{ amountCents: 0 }, 'BAD_AMOUNT'], [{ amountCents: -500 }, 'BAD_AMOUNT'],
      [{ amountCents: 10.5 }, 'BAD_AMOUNT'], [{ giftDate: '2025-02-30' }, 'BAD_DATE'], [{ fundCode: 'NOPE' }, 'UNKNOWN_FUND'],
    ] as const) expect(await correctGift(db, { orgId: o.id, userId: owner.id, giftRef: g1.giftRef, change, reason: 'x' })).toMatchObject({ status: 'REFUSED', code });
    expect(await correctGift(db, { orgId: o.id, userId: owner.id, giftRef: 'G99999', change: { amountCents: 100 }, reason: 'x' })).toMatchObject({ status: 'REFUSED', code: 'NOT_FOUND' });
    expect(await counts()).toEqual(quiet);

    // Amount correction: one successor, original unchanged, roll-ups move by the difference.
    const before = await view();
    const original = await db.gift.findUniqueOrThrow({ where: { id: g1.id } });
    const c = await correctGift(db, { orgId: o.id, userId: owner.id, giftRef: g1.giftRef, change: { amountCents: g1.amountCents + 1234 }, reason: 'pledge card says $12.34 more' });
    expect(c.status).toBe('CORRECTED');
    expect(await db.gift.findUniqueOrThrow({ where: { id: g1.id } })).toEqual(original);
    const chain = await db.gift.findMany({ where: { orgId: o.id, giftRef: g1.giftRef } });
    expect(chain).toHaveLength(2);
    const head = chain.find((g) => g.id === c.giftId)!;
    expect(head).toMatchObject({ supersedesGiftId: g1.id, amountCents: g1.amountCents + 1234, reason: 'pledge card says $12.34 more', userId: owner.id, status: 'ACTIVE', importBatchId: null });
    const after = await view();
    expect(after.total.raised - before.total.raised).toBe(1234);
    expect(after.total.gifts).toBe(before.total.gifts);
    expect(after.funds[g1.fund.code]!.raised - before.funds[g1.fund.code]!.raised).toBe(1234);
    expect(await db.auditEvent.findFirst({ where: { orgId: o.id, action: 'gift.correct', targetId: c.giftId } })).not.toBeNull();

    // Fund move: the whole amount leaves one fund and lands in the other; the total does not move.
    const other = funds.find((f) => f.id !== g1.fundId)!;
    expect((await correctGift(db, { orgId: o.id, userId: owner.id, giftRef: g1.giftRef, change: { fundCode: other.code }, reason: 'coded to the wrong fund' })).status).toBe('CORRECTED');
    const moved = await view();
    expect(moved.total).toEqual(after.total);
    expect(after.funds[g1.fund.code]!.raised - (moved.funds[g1.fund.code]?.raised ?? 0)).toBe(g1.amountCents + 1234);
    expect(moved.funds[other.code]!.raised - (after.funds[other.code]?.raised ?? 0)).toBe(g1.amountCents + 1234);

    // Void: the gift drops out by its amount; a voided gift cannot be voided or corrected again.
    const v = await voidGift(db, { orgId: o.id, userId: owner.id, giftRef: g2.giftRef, reason: 'bounced cheque' });
    expect(v.status).toBe('VOIDED');
    expect(await db.gift.findUniqueOrThrow({ where: { id: v.giftId! } })).toMatchObject({ supersedesGiftId: g2.id, status: 'VOIDED', amountCents: g2.amountCents, reason: 'bounced cheque', userId: owner.id });
    const voided = await view();
    expect(moved.total.raised - voided.total.raised).toBe(g2.amountCents);
    expect(moved.total.gifts - voided.total.gifts).toBe(1);
    expect(await db.auditEvent.findFirst({ where: { orgId: o.id, action: 'gift.void', targetId: v.giftId } })).not.toBeNull();
    const done = await counts();
    expect(await voidGift(db, { orgId: o.id, userId: owner.id, giftRef: g2.giftRef, reason: 'again' })).toMatchObject({ status: 'REFUSED', code: 'VOIDED' });
    expect(await correctGift(db, { orgId: o.id, userId: owner.id, giftRef: g2.giftRef, change: { amountCents: 100 }, reason: 'x' })).toMatchObject({ status: 'REFUSED', code: 'VOIDED' });
    expect(await counts()).toEqual(done);

    // The triggers still refuse UPDATE/DELETE on any row of the chain.
    for (const id of [g1.id, c.giftId!, v.giftId!]) {
      await expect(db.$executeRawUnsafe(`UPDATE "Gift" SET "amountCents" = 1 WHERE id = $1::uuid`, id)).rejects.toThrow('Gift is append-only');
      await expect(db.$executeRawUnsafe(`DELETE FROM "Gift" WHERE id = $1::uuid`, id)).rejects.toThrow('Gift is append-only');
    }
  });
});
