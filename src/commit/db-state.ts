// The effective state read from Postgres (task 2.2): the latest ACTIVE version of every constituent, every gift
// no row supersedes, every soft credit. Same shape as ./state's fixtureState, so the two hash equal.
import type { Prisma } from '@/generated/prisma/client';
import type { ConstituentVersion } from '@/generated/prisma/client';
import { sortState, type AliasEntry, type AlternateEntry, type EffectiveConstituent, type EffectivePledge, type EffectiveState, type FieldMeta } from './state';

export type Tx = Prisma.TransactionClient;

/** A `@db.Date` column comes back as a Date at UTC midnight (the client pins timezone=UTC); the state holds ISO. */
export const isoDate = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : '');

/** One version as effective state; the household's business id is passed in. */
export function effectiveOf(businessId: string, v: ConstituentVersion, household: string): EffectiveConstituent {
  return {
    id: businessId,
    firstName: v.firstName, middleName: v.middleName, lastName: v.lastName, suffix: v.suffix,
    email: v.email, phone: v.phone,
    addressLine1: v.addressLine1, addressLine2: v.addressLine2, city: v.city, state: v.state, zip: v.zip,
    dob: isoDate(v.dob),
    fieldMeta: v.fieldMeta as FieldMeta,
    aliases: v.aliases as AliasEntry[],
    alternates: v.alternates as AlternateEntry[],
    household,
  };
}

/** The latest version of one constituent (any status). */
export async function latestVersion(tx: Tx, constituentId: string): Promise<ConstituentVersion> {
  return tx.constituentVersion.findFirstOrThrow({ where: { constituentId }, orderBy: { version: 'desc' } });
}

export type ConstituentSnapshot = { constituent: EffectiveConstituent; status: 'ACTIVE' | 'RETIRED'; giftRefs: string[]; pledgeRefs?: string[] }; // pledgeRefs: task 3.6; absent on older snapshots

/** One constituent's effective state plus its active gift and pledge refs: the MergeEvent snapshot (D-24, D-71). */
export async function loadEffectiveConstituent(tx: Tx, constituentId: string): Promise<ConstituentSnapshot> {
  const c = await tx.constituent.findUniqueOrThrow({ where: { id: constituentId }, include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { household: true } } } });
  const v = c.versions[0]!;
  const gifts = await tx.gift.findMany({ where: { constituentId, status: 'ACTIVE', supersededBy: null }, select: { giftRef: true }, orderBy: { giftRef: 'asc' } });
  const pledges = await tx.pledge.findMany({ where: { constituentId, supersededBy: null }, select: { pledgeRef: true }, orderBy: { pledgeRef: 'asc' } });
  return { constituent: effectiveOf(c.businessId, v, v.household?.businessId ?? ''), status: v.status, giftRefs: gifts.map((g) => g.giftRef), pledgeRefs: pledges.map((p) => p.pledgeRef) };
}

export async function loadEffectiveState(tx: Tx, orgId: string): Promise<EffectiveState> {
  const cons = await tx.constituent.findMany({
    where: { orgId },
    include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { household: true } } },
  });
  const gifts = await tx.gift.findMany({ where: { orgId, status: 'ACTIVE', supersededBy: null }, include: { fund: true, appeal: true, constituent: true } });
  const softCredits = await tx.softCredit.findMany({ where: { orgId }, include: { constituent: true } });
  const pledges = await tx.pledge.findMany({ where: { orgId, supersededBy: null }, include: { fund: true, appeal: true, constituent: true } });
  return sortState({
    constituents: cons.flatMap((c) => {
      const v = c.versions[0];
      if (!v || v.status !== 'ACTIVE') return [];
      return [effectiveOf(c.businessId, v, v.household?.businessId ?? '')];
    }),
    gifts: gifts.map((g) => ({ giftRef: g.giftRef, constituent: g.constituent.businessId, giftDate: isoDate(g.giftDate), amountCents: g.amountCents, fund: g.fund.code, appeal: g.appeal?.name ?? '', giftType: g.giftType, externalRef: g.externalRef, ...(g.pledgeRef && { pledgeRef: g.pledgeRef }) })),
    softCredits: softCredits.map((s) => ({ giftRef: s.giftRef, constituent: s.constituent.businessId })),
    pledges: pledges.map((p) => ({ pledgeRef: p.pledgeRef, constituent: p.constituent.businessId, pledgeDate: isoDate(p.pledgeDate), totalCents: p.totalCents, schedule: p.schedule as EffectivePledge['schedule'], fund: p.fund.code, appeal: p.appeal?.name ?? '' })),
  });
}

/** Appeal name → campaign code for an org (D-75): roll-ups read a gift's campaign through its appeal. */
export async function loadAppealCampaigns(tx: Tx, orgId: string): Promise<Record<string, string>> {
  const appeals = await tx.appeal.findMany({ where: { orgId }, include: { campaign: true } });
  return Object.fromEntries(appeals.map((a) => [a.name, a.campaign.code]));
}
