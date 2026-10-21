// The effective state read from Postgres (task 2.2): the latest ACTIVE version of every constituent, every gift
// no row supersedes, every soft credit. Same shape as ./state's fixtureState, so the two hash equal.
import type { Prisma } from '@/generated/prisma/client';
import { sortState, type AliasEntry, type AlternateEntry, type EffectiveState, type FieldMeta } from './state';

export type Tx = Prisma.TransactionClient;

/** A `@db.Date` column comes back as a Date at UTC midnight (the client pins timezone=UTC); the state holds ISO. */
export const isoDate = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : '');

export async function loadEffectiveState(tx: Tx, orgId: string): Promise<EffectiveState> {
  const cons = await tx.constituent.findMany({
    where: { orgId },
    include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { household: true } } },
  });
  const gifts = await tx.gift.findMany({ where: { orgId, status: 'ACTIVE', supersededBy: null }, include: { fund: true, appeal: true, constituent: true } });
  const softCredits = await tx.softCredit.findMany({ where: { orgId }, include: { constituent: true } });
  return sortState({
    constituents: cons.flatMap((c) => {
      const v = c.versions[0];
      if (!v || v.status !== 'ACTIVE') return [];
      return [{
        id: c.businessId,
        firstName: v.firstName, middleName: v.middleName, lastName: v.lastName, suffix: v.suffix,
        email: v.email, phone: v.phone,
        addressLine1: v.addressLine1, addressLine2: v.addressLine2, city: v.city, state: v.state, zip: v.zip,
        dob: isoDate(v.dob),
        fieldMeta: v.fieldMeta as FieldMeta,
        aliases: v.aliases as AliasEntry[],
        alternates: v.alternates as AlternateEntry[],
        household: v.household?.businessId ?? '',
      }];
    }),
    gifts: gifts.map((g) => ({ giftRef: g.giftRef, constituent: g.constituent.businessId, giftDate: isoDate(g.giftDate), amountCents: g.amountCents, fund: g.fund.code, appeal: g.appeal?.name ?? '', giftType: g.giftType, externalRef: g.externalRef })),
    softCredits: softCredits.map((s) => ({ giftRef: s.giftRef, constituent: s.constituent.businessId })),
  });
}
