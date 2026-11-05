// Soft credits by hand (D-9, D-74c, D-81, task 3.7): add writes a new chain (next SC ref), remove writes one superseding
// row with status REMOVED and a reason. Both by a member who can write results, audited in the same serializable
// transaction; nothing is updated or deleted (triggers refuse it anyway). Merge, unmerge and undo move them (./merge).
import type { PrismaClient } from '@/generated/prisma/client';
import { audit } from '@/core/audit';
import { can } from '@/core/authz/permissions';
import type { Tx } from './db-state';
import { headSoftCredit, nextSeq, supersedeSoftCredit } from './write';

export type SoftCreditRefusal = 'FORBIDDEN' | 'REASON_REQUIRED' | 'NOT_FOUND' | 'GIFT_VOIDED' | 'CONSTITUENT_RETIRED' | 'HARD_DONOR' | 'DUPLICATE' | 'BAD_AMOUNT' | 'ROLE_REQUIRED' | 'ALREADY_REMOVED';
export type SoftCreditResult = { status: 'ADDED' | 'REMOVED'; code?: undefined; softCreditRef: string } | { status: 'REFUSED'; code: SoftCreditRefusal; softCreditRef?: undefined };

const SERIAL = { isolationLevel: 'Serializable' as const };
const refuse = (code: SoftCreditRefusal) => ({ status: 'REFUSED' as const, code });
const canWrite = async (tx: Tx, orgId: string, userId: string) => {
  const m = await tx.membership.findUnique({ where: { orgId_userId: { orgId, userId } } });
  return !!m && can(m.role, 'results.write');
};

/** `constituent` is the business id (C0002) credited; the gift's hard donor cannot be (D-74c). */
export async function addSoftCredit(db: PrismaClient, i: { orgId: string; userId: string; giftRef: string; constituent: string; role: string; amountCents: number }): Promise<SoftCreditResult> {
  const role = i.role.trim();
  if (!role) return refuse('ROLE_REQUIRED');
  if (!(Number.isSafeInteger(i.amountCents) && i.amountCents > 0)) return refuse('BAD_AMOUNT');
  return db.$transaction(async (tx): Promise<SoftCreditResult> => {
    if (!(await canWrite(tx, i.orgId, i.userId))) return refuse('FORBIDDEN');
    const gift = await tx.gift.findFirst({ where: { orgId: i.orgId, giftRef: i.giftRef, supersededBy: null } });
    const c = await tx.constituent.findUnique({ where: { orgId_businessId: { orgId: i.orgId, businessId: i.constituent } }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!gift || !c) return refuse('NOT_FOUND');
    if (gift.status === 'VOIDED') return refuse('GIFT_VOIDED');
    if (c.versions[0]?.status !== 'ACTIVE') return refuse('CONSTITUENT_RETIRED');
    if (gift.constituentId === c.id) return refuse('HARD_DONOR');
    if (await tx.softCredit.findFirst({ where: { orgId: i.orgId, giftRef: i.giftRef, constituentId: c.id, status: 'ACTIVE', supersededBy: null } })) return refuse('DUPLICATE');
    const softCreditRef = `SC${String(await nextSeq(tx, 'SoftCredit', 'softCreditRef', 'SC', i.orgId)).padStart(3, '0')}`;
    const row = await tx.softCredit.create({ data: { orgId: i.orgId, softCreditRef, giftRef: i.giftRef, constituentId: c.id, role, amountCents: i.amountCents, userId: i.userId } });
    await audit({ orgId: i.orgId, userId: i.userId }, 'softCredit.add', { targetType: 'SoftCredit', targetId: row.id, data: { softCreditRef, giftRef: i.giftRef, constituent: i.constituent, role, amountCents: i.amountCents } }, tx);
    return { status: 'ADDED', softCreditRef };
  }, SERIAL);
}

export async function removeSoftCredit(db: PrismaClient, i: { orgId: string; userId: string; softCreditRef: string; reason: string }): Promise<SoftCreditResult> {
  const reason = i.reason.trim();
  if (!reason) return refuse('REASON_REQUIRED');
  return db.$transaction(async (tx): Promise<SoftCreditResult> => {
    if (!(await canWrite(tx, i.orgId, i.userId))) return refuse('FORBIDDEN');
    const cur = await headSoftCredit(tx, i.orgId, i.softCreditRef).catch(() => null);
    if (!cur) return refuse('NOT_FOUND');
    if (cur.status === 'REMOVED') return refuse('ALREADY_REMOVED');
    const row = await supersedeSoftCredit(tx, cur, { status: 'REMOVED' }, reason, { userId: i.userId });
    await audit({ orgId: i.orgId, userId: i.userId }, 'softCredit.remove', { targetType: 'SoftCredit', targetId: row.id, data: { softCreditRef: i.softCreditRef, supersedes: cur.id, reason, amountCents: cur.amountCents } }, tx);
    return { status: 'REMOVED', softCreditRef: i.softCreditRef };
  }, SERIAL);
}
