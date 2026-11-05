// Gift correction and void by hand (D-6, D-60, D-72, task 3.5). Each writes one superseding row on the gift's active
// row with a reason and the actor as its writer, audited in the same serializable transaction. The original row is never
// touched (triggers refuse it anyway). Zero or negative amounts stay refused (D-57: no refund path). Appeal is not
// correctable here: seam. A letter queued before the correction goes LETTER_STALE by derivation (P-8, task 3.8).
import type { PrismaClient } from '@/generated/prisma/client';
import { audit } from '@/core/audit';
import { can } from '@/core/authz/permissions';
import { isoDate, type Tx } from './db-state';
import { supersedeGift } from './write';

export type GiftChange = { amountCents?: number; giftDate?: string; fundCode?: string };
export type GiftRefusal = 'FORBIDDEN' | 'REASON_REQUIRED' | 'NOT_FOUND' | 'VOIDED' | 'NO_CHANGE' | 'BAD_AMOUNT' | 'BAD_DATE' | 'UNKNOWN_FUND';
export type GiftResult = { status: 'CORRECTED' | 'VOIDED'; code?: undefined; giftId: string } | { status: 'REFUSED'; code: GiftRefusal; giftId?: undefined };
type Input = { orgId: string; userId: string; giftRef: string; reason: string };

const SERIAL = { isolationLevel: 'Serializable' as const };
const refuse = (code: GiftRefusal) => ({ status: 'REFUSED' as const, code });
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(new Date(`${s}T00:00:00Z`)) === s;

/** Shared guard: reason, role, an active row that is not voided. Returns the head row or a refusal. */
async function head(tx: Tx, i: Input) {
  const m = await tx.membership.findUnique({ where: { orgId_userId: { orgId: i.orgId, userId: i.userId } } });
  if (!m || !can(m.role, 'results.write')) return refuse('FORBIDDEN');
  const g = await tx.gift.findFirst({ where: { orgId: i.orgId, giftRef: i.giftRef, supersededBy: null } });
  if (!g) return refuse('NOT_FOUND');
  return g.status === 'VOIDED' ? refuse('VOIDED') : g;
}

export async function correctGift(db: PrismaClient, i: Input & { change: GiftChange }): Promise<GiftResult> {
  const reason = i.reason.trim();
  if (!reason) return refuse('REASON_REQUIRED');
  const { amountCents, giftDate, fundCode } = i.change;
  if (amountCents !== undefined && !(Number.isSafeInteger(amountCents) && amountCents > 0)) return refuse('BAD_AMOUNT');
  if (giftDate !== undefined && !validDate(giftDate)) return refuse('BAD_DATE');
  return db.$transaction(async (tx): Promise<GiftResult> => {
    const cur = await head(tx, i);
    if (cur.status === 'REFUSED') return cur;
    const fund = fundCode === undefined ? null : await tx.fund.findUnique({ where: { orgId_code: { orgId: i.orgId, code: fundCode } } });
    if (fundCode !== undefined && !fund) return refuse('UNKNOWN_FUND');
    const patch = {
      ...(amountCents !== undefined && amountCents !== cur.amountCents && { amountCents }),
      ...(giftDate !== undefined && giftDate !== isoDate(cur.giftDate) && { giftDate: new Date(`${giftDate}T00:00:00Z`) }),
      ...(fund && fund.id !== cur.fundId && { fundId: fund.id }),
    };
    if (Object.keys(patch).length === 0) return refuse('NO_CHANGE');
    const row = await supersedeGift(tx, cur, patch, reason, { userId: i.userId });
    await audit({ orgId: i.orgId, userId: i.userId }, 'gift.correct', { targetType: 'Gift', targetId: row.id, data: { giftRef: i.giftRef, supersedes: cur.id, reason, from: { amountCents: cur.amountCents, giftDate: isoDate(cur.giftDate), fundId: cur.fundId }, change: i.change } }, tx);
    return { status: 'CORRECTED', giftId: row.id };
  }, SERIAL);
}

export async function voidGift(db: PrismaClient, i: Input): Promise<GiftResult> {
  const reason = i.reason.trim();
  if (!reason) return refuse('REASON_REQUIRED');
  return db.$transaction(async (tx): Promise<GiftResult> => {
    const cur = await head(tx, i);
    if (cur.status === 'REFUSED') return cur;
    const row = await supersedeGift(tx, cur, { status: 'VOIDED' }, reason, { userId: i.userId });
    await audit({ orgId: i.orgId, userId: i.userId }, 'gift.void', { targetType: 'Gift', targetId: row.id, data: { giftRef: i.giftRef, supersedes: cur.id, reason, amountCents: cur.amountCents } }, tx);
    return { status: 'VOIDED', giftId: row.id };
  }, SERIAL);
}
