// Task 3.8 (D-26, D-66 / P-8, D-82): letters queued on the seeded Phase 3 org. One per gift, or one per household with the
// oracle's Σ; a second queue writes nothing; correcting or voiding a gift after queueing marks exactly its letter stale;
// the table is append-only; and no letter test moves a row in Outbox or CapturedMessage.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { loadEffectiveState } from '@/commit/db-state';
import { correctGift, voidGift } from '@/commit/gifts';
import { loadLetters, queueLetters } from '@/commit/letters';
import { seedFixtures } from '@/commit/seed';
import { planLetters } from '@/letters/letters';
import { loadConstituents } from '@/import/crm';
import { resetAuthTables } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';
import { answers, phase3Pledges, phase3SeedGifts, phase3SoftCredits } from '../helpers/phase3';

beforeEach(resetAuthTables);
const SLOW = { timeout: 180_000 };
const asOf = answers.asOf as string;
const sent = async () => ({ outbox: await db.outbox.count(), captured: await db.capturedMessage.count() });

async function phase3Org() {
  const o = await makeOrg();
  const owner = await addMember(o.id, 'owner', 'owner@example.test');
  const member = await addMember(o.id, 'member', 'member@example.test');
  await seedFixtures(db, { orgId: o.id, userId: owner.id, constituents: loadConstituents(new Uint8Array(readFileSync('fixtures/crm_constituents.csv'))), gifts: phase3SeedGifts(), pledges: phase3Pledges(), softCredits: phase3SoftCredits() });
  return { orgId: o.id, owner, member };
}

describe('acknowledgement letters (task 3.8)', () => {
  it('one letter per gift; a re-queue writes none; a correction or void marks exactly its letter stale', SLOW, async () => {
    const before = await sent();
    const t = await phase3Org();
    const base = { orgId: t.orgId, userId: t.owner.id, asOf, combine: false };
    expect(await queueLetters(db, { ...base, userId: t.member.id })).toEqual({ status: 'REFUSED', code: 'FORBIDDEN' });
    expect(await queueLetters(db, { ...base, asOf: '14/10/2026' })).toMatchObject({ code: 'BAD_AS_OF' });
    expect(await queueLetters(db, { ...base, from: '2025-02-01', to: '2025-01-01' })).toMatchObject({ code: 'BAD_WINDOW' });
    expect(await db.letter.count({ where: { orgId: t.orgId } })).toBe(0);

    const drafts = planLetters(await loadEffectiveState(db, t.orgId), new Set(), asOf, { combine: false });
    const q = await queueLetters(db, base);
    expect(q.status).toBe('QUEUED');
    expect(q.letters!.map(({ letterRef, ...l }) => l)).toEqual(drafts.map(({ subject, body, ...d }) => d));
    expect(q.letters![0]!.letterRef).toBe('L0001');
    expect(await queueLetters(db, base)).toEqual({ status: 'QUEUED', letters: [] });

    const stale = async () => (await loadLetters(db, t.orgId)).filter((l) => l.status === 'LETTER_STALE').map((l) => l.letterRef);
    expect(await stale()).toEqual([]);
    const [a, b] = q.letters!;
    expect((await correctGift(db, { orgId: t.orgId, userId: t.owner.id, giftRef: a!.giftRefs[0]!, change: { amountCents: a!.totalCents + 100 }, reason: 'card says $1 more' })).status).toBe('CORRECTED');
    expect(await stale()).toEqual([a!.letterRef]);
    await voidGift(db, { orgId: t.orgId, userId: t.owner.id, giftRef: b!.giftRefs[0]!, reason: 'bounced' });
    expect(await stale()).toEqual([a!.letterRef, b!.letterRef]);
    // the stale letter still covers its giftRef, so the corrected gift is not lettered twice (re-issue is a seam, D-82)
    expect(await queueLetters(db, base)).toEqual({ status: 'QUEUED', letters: [] });

    const row = (await db.letter.findFirstOrThrow({ where: { orgId: t.orgId, letterRef: a!.letterRef } }));
    expect(row.body).toContain('No goods or services were provided in exchange for this contribution.');
    expect(row.status).toBe('QUEUED');
    await expect(db.letter.update({ where: { id: row.id }, data: { totalCents: row.totalCents + 1 } })).rejects.toThrow(/append-only/);
    await expect(db.letter.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(db.letter.create({ data: { orgId: t.orgId, letterRef: 'L9999', giftRefs: ['G00001'], giftIds: [row.giftIds[0]!], totalCents: 1, asOf: row.asOf, subject: 's', body: 'b', userId: t.owner.id } })).rejects.toThrow(/one_recipient/);
    expect(await db.auditEvent.count({ where: { orgId: t.orgId, action: 'letters.queue' } })).toBe(3);
    expect(await sent()).toEqual(before);
  });

  it('combined: one letter per household with the oracle Σ; correcting one member gift stales only that letter', SLOW, async () => {
    const before = await sent();
    const t = await phase3Org();
    const q = await queueLetters(db, { orgId: t.orgId, userId: t.owner.id, asOf, combine: true });
    const hh = Object.entries(answers.households as Record<string, { givingCents: number }>).filter(([, h]) => h.givingCents > 0);
    const letters = q.letters!.filter((l) => l.household);
    expect(Object.fromEntries(letters.map((l) => [l.recipient, l.totalCents]))).toEqual(Object.fromEntries(hh.map(([id, h]) => [id, h.givingCents])));
    const h1 = letters.find((l) => l.recipient === 'H0001')!;
    expect(h1.totalCents).toBe(675000);
    await correctGift(db, { orgId: t.orgId, userId: t.owner.id, giftRef: h1.giftRefs.at(-1)!, change: { amountCents: 100 }, reason: 'keyed wrong' });
    expect((await loadLetters(db, t.orgId)).filter((l) => l.status === 'LETTER_STALE').map((l) => l.letterRef)).toEqual([h1.letterRef]);
    expect(await sent()).toEqual(before);
  });
});
