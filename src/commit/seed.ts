// db:seed:fixtures (task 2.2): crm_constituents.csv and crm_gifts.csv into one org as version 1 and active gifts,
// written by a user (D-52b). Phase 3 (task 3.6) adds pledges and the payments' pledgeRef from fixtures/phase3/. Idempotent: an org that already holds a constituent gets 0 rows. Never in production.
import type { PrismaClient } from '@/generated/prisma/client';
import type { CrmConstituent, CrmGift, CrmPledge } from '../import/crm';
import { CRM_SOURCE, META_FIELDS } from './state';

export type SeedCounts = { constituents: number; households: number; funds: number; campaigns: number; appeals: number; versions: number; gifts: number; pledges: number };

const date = (iso: string): Date | null => (iso ? new Date(iso) : null);
const uniq = (xs: string[]) => [...new Set(xs)].sort();

export async function seedFixtures(db: PrismaClient, input: { orgId: string; userId: string; constituents: CrmConstituent[]; gifts: CrmGift[]; pledges?: CrmPledge[] }): Promise<SeedCounts> {
  if (process.env.NODE_ENV === 'production') throw new Error('seedFixtures: refused in production (synthetic fixture data only)');
  const { orgId, userId } = input;
  return db.$transaction(
    async (tx) => {
      if (await tx.constituent.count({ where: { orgId } })) return { constituents: 0, households: 0, funds: 0, campaigns: 0, appeals: 0, versions: 0, gifts: 0, pledges: 0 };
      const f = (c: CrmConstituent, k: string) => c.fields[k] ?? '';

      const households = uniq(input.constituents.map((c) => f(c, 'household_id')).filter(Boolean));
      await tx.household.createMany({ data: households.map((businessId) => ({ orgId, businessId })) });
      const hhId = new Map((await tx.household.findMany({ where: { orgId } })).map((h) => [h.businessId, h.id]));

      await tx.constituent.createMany({ data: input.constituents.map((c) => ({ orgId, businessId: c.id, createdAt: date(f(c, 'created_at')) ?? undefined })) });
      const conId = new Map((await tx.constituent.findMany({ where: { orgId } })).map((c) => [c.businessId, c.id]));

      await tx.constituentVersion.createMany({
        data: input.constituents.map((c) => {
          const asOf = f(c, 'created_at');
          return {
            orgId, constituentId: conId.get(c.id)!, version: 1, userId,
            firstName: f(c, 'first_name'), middleName: f(c, 'middle_name'), lastName: f(c, 'last_name'), suffix: f(c, 'suffix'),
            email: f(c, 'email'), phone: f(c, 'phone'),
            addressLine1: f(c, 'address_line1'), addressLine2: f(c, 'address_line2'), city: f(c, 'city'), state: f(c, 'state'), zip: f(c, 'zip'),
            dob: date(f(c, 'dob')),
            fieldMeta: Object.fromEntries(META_FIELDS.map((k) => [k, { asOf, source: CRM_SOURCE }])),
            aliases: [], alternates: [],
            householdId: hhId.get(f(c, 'household_id')) ?? null,
          };
        }),
      });

      const pledges = input.pledges ?? [];
      const coded = [...input.gifts, ...pledges]; // funds, campaigns and appeals come from both
      const funds = uniq(coded.map((g) => g.fund));
      await tx.fund.createMany({ data: funds.map((code) => ({ orgId, code })) });
      const fundId = new Map((await tx.fund.findMany({ where: { orgId } })).map((x) => [x.code, x.id]));
      const campaigns = uniq(coded.map((g) => g.campaign).filter(Boolean));
      await tx.campaign.createMany({ data: campaigns.map((code) => ({ orgId, code })) });
      const campaignId = new Map((await tx.campaign.findMany({ where: { orgId } })).map((x) => [x.code, x.id]));
      const appeals = new Map<string, string>(); // name → campaign code (one campaign per appeal, D-52g)
      for (const g of coded) {
        if (!g.appeal) continue;
        const prev = appeals.get(g.appeal);
        if (prev !== undefined && prev !== g.campaign) throw new Error(`seedFixtures: appeal "${g.appeal}" belongs to campaigns ${prev} and ${g.campaign}`);
        appeals.set(g.appeal, g.campaign);
      }
      await tx.appeal.createMany({ data: [...appeals].sort().map(([name, campaign]) => ({ orgId, name, campaignId: campaignId.get(campaign)! })) });
      const appealId = new Map((await tx.appeal.findMany({ where: { orgId } })).map((x) => [x.name, x.id]));

      await tx.gift.createMany({
        data: input.gifts.map((g) => ({
          orgId, giftRef: g.gift_id, constituentId: conId.get(g.constituent_id)!, giftDate: new Date(g.gift_date), amountCents: g.amount_cents,
          fundId: fundId.get(g.fund)!, appealId: g.appeal ? appealId.get(g.appeal)! : null, giftType: g.gift_type, externalRef: g.external_ref, pledgeRef: g.pledge_id ?? '', userId,
        })),
      });
      await tx.pledge.createMany({
        data: pledges.map((p) => ({
          orgId, pledgeRef: p.pledge_id, constituentId: conId.get(p.constituent_id)!, pledgeDate: new Date(p.pledge_date), totalCents: p.total_cents, schedule: p.schedule,
          fundId: fundId.get(p.fund)!, appealId: p.appeal ? appealId.get(p.appeal)! : null, userId,
        })),
      });
      return { constituents: input.constituents.length, households: households.length, funds: funds.length, campaigns: campaigns.length, appeals: appeals.size, versions: input.constituents.length, gifts: input.gifts.length, pledges: pledges.length };
    },
    { timeout: 60_000 },
  );
}
