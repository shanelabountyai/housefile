// Queueing sample acknowledgement letters (D-26, D-66 / P-8, D-82, task 3.8). One serializable transaction: plan over the
// effective state (src/letters), write one append-only Letter row per draft with the gift rows it was rendered from,
// one audit row. Letters are not in the state hash and nothing here sends: the Outbox and email are never imported.
import type { PrismaClient } from '@/generated/prisma/client';
import { audit } from '@/core/audit';
import { can } from '@/core/authz/permissions';
import { isStale, planLetters, type LetterScope } from '../letters/letters';
import { isoDate, loadEffectiveState, type Tx } from './db-state';

export type QueueRefusal = 'FORBIDDEN' | 'BAD_AS_OF' | 'BAD_WINDOW';
export type QueuedLetter = { letterRef: string; recipient: string; household: boolean; giftRefs: string[]; totalCents: number };
export type QueueResult = { status: 'QUEUED'; code?: undefined; letters: QueuedLetter[] } | { status: 'REFUSED'; code: QueueRefusal; letters?: undefined };
export type LetterRow = QueuedLetter & { asOf: string; subject: string; body: string; status: 'QUEUED' | 'LETTER_STALE' };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SERIAL = { isolationLevel: 'Serializable' as const };
const refuse = (code: QueueRefusal) => ({ status: 'REFUSED' as const, code });

/** Current row id per giftRef (voided heads included), the yardstick for LETTER_STALE. */
async function headIds(tx: Tx, orgId: string): Promise<Map<string, string>> {
  const heads = await tx.gift.findMany({ where: { orgId, supersededBy: null }, select: { id: true, giftRef: true } });
  return new Map(heads.map((g) => [g.giftRef, g.id]));
}

export async function queueLetters(db: PrismaClient, i: { orgId: string; userId: string; asOf: string } & LetterScope): Promise<QueueResult> {
  if (!ISO.test(i.asOf)) return refuse('BAD_AS_OF');
  if ((i.from && !ISO.test(i.from)) || (i.to && !ISO.test(i.to)) || (i.from && i.to && i.from > i.to)) return refuse('BAD_WINDOW');
  return db.$transaction(async (tx): Promise<QueueResult> => {
    const m = await tx.membership.findUnique({ where: { orgId_userId: { orgId: i.orgId, userId: i.userId } } });
    if (!m || !can(m.role, 'results.write')) return refuse('FORBIDDEN');
    const existing = await tx.letter.findMany({ where: { orgId: i.orgId }, select: { giftRefs: true, letterRef: true } });
    const lettered = new Set(existing.flatMap((l) => l.giftRefs));
    const drafts = planLetters(await loadEffectiveState(tx, i.orgId), lettered, i.asOf, i);
    const heads = await headIds(tx, i.orgId);
    const byBusinessId = (rows: { id: string; businessId: string }[]) => new Map(rows.map((r) => [r.businessId, r.id]));
    const people = byBusinessId(await tx.constituent.findMany({ where: { orgId: i.orgId }, select: { id: true, businessId: true } }));
    const households = byBusinessId(await tx.household.findMany({ where: { orgId: i.orgId }, select: { id: true, businessId: true } }));
    let seq = Math.max(0, ...existing.map((l) => Number(l.letterRef.slice(1))));
    const letters: QueuedLetter[] = [];
    for (const d of drafts) {
      const letterRef = `L${String(++seq).padStart(4, '0')}`;
      await tx.letter.create({
        data: {
          orgId: i.orgId, letterRef, giftRefs: d.giftRefs, giftIds: d.giftRefs.map((r) => heads.get(r)!), totalCents: d.totalCents,
          asOf: new Date(`${i.asOf}T00:00:00Z`), subject: d.subject, body: d.body, userId: i.userId,
          ...(d.household ? { householdId: households.get(d.recipient)! } : { constituentId: people.get(d.recipient)! }),
        },
      });
      letters.push({ letterRef, recipient: d.recipient, household: d.household, giftRefs: d.giftRefs, totalCents: d.totalCents });
    }
    await audit({ orgId: i.orgId, userId: i.userId }, 'letters.queue', { targetType: 'Letter', targetId: i.orgId, data: { asOf: i.asOf, from: i.from ?? null, to: i.to ?? null, combine: i.combine, count: letters.length, totalCents: letters.reduce((s, l) => s + l.totalCents, 0), letterRefs: letters.map((l) => l.letterRef) } }, tx);
    return { status: 'QUEUED', letters };
  }, SERIAL);
}

/** Every letter in the org by ref, with QUEUED or the derived LETTER_STALE. */
export async function loadLetters(tx: Tx, orgId: string): Promise<LetterRow[]> {
  const rows = await tx.letter.findMany({ where: { orgId }, include: { constituent: true, household: true }, orderBy: { letterRef: 'asc' } });
  const heads = await headIds(tx, orgId);
  return rows.map((l) => ({
    letterRef: l.letterRef, recipient: l.household?.businessId ?? l.constituent!.businessId, household: !!l.household, giftRefs: l.giftRefs,
    totalCents: l.totalCents, asOf: isoDate(l.asOf), subject: l.subject, body: l.body,
    status: isStale(l.giftRefs, l.giftIds, heads) ? 'LETTER_STALE' : 'QUEUED',
  }));
}
