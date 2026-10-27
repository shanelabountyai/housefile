// The effective state and its hash (D-11, task 2.2). Pure: no database, no clock. One shape for the fixture
// loaded in memory (Phase 1 dry-run) and for the database (loadEffectiveState in ./db-state), so the dry-run's
// beforeHash and the database's hash agree, and a commit followed by its undo hashes equal (D-13).
// Excluded on purpose: row ids, createdAt, batch and event ids, audit rows, RETIRED constituents, superseded gifts.
// Pledges (D-71, task 3.6) and a gift's pledgeRef enter the hash only when present, so a state without pledges
// (the Phase 1 fixture, seeded hash 7d3bd174…) hashes exactly as before.
import { sha256Hex } from '../lib/canonical';
import { crmRecord, type CrmConstituent, type CrmGift, type CrmPledge } from '../import/crm';

export type FieldMeta = Record<string, { asOf: string; source: string }>; // email | phone | dob | address (S2)
export type AliasEntry = { first: string; middle: string; last: string; suffix: string; source: string; asOf: string }; // S3
export type AlternateEntry = { field: string; value: string; source: string; asOf: string }; // S2

export type EffectiveConstituent = {
  id: string; // business id, C0001
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  dob: string; // ISO or ""
  fieldMeta: FieldMeta;
  aliases: AliasEntry[];
  alternates: AlternateEntry[];
  household: string; // household business id or ""
};

export type EffectiveGift = {
  giftRef: string; // G00001, stable across supersession (D-48)
  constituent: string; // business id
  giftDate: string; // ISO
  amountCents: number;
  fund: string;
  appeal: string;
  giftType: string;
  externalRef: string;
  pledgeRef?: string; // set on a pledge payment only (D-71)
};

/** One active pledge (D-9): a promise with its schedule. Paid and balance are derived (src/derive/pledges). */
export type EffectivePledge = {
  pledgeRef: string; // PL001, stable across supersession
  constituent: string;
  pledgeDate: string;
  totalCents: number;
  schedule: { due: string; cents: number }[];
  fund: string;
  appeal: string;
};

export type EffectiveSoftCredit = { giftRef: string; constituent: string };

export type EffectiveState = { constituents: EffectiveConstituent[]; gifts: EffectiveGift[]; softCredits: EffectiveSoftCredit[]; pledges?: EffectivePledge[] };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The state with every list in its canonical order (by business id), so equality and the hash ignore input order. */
export function sortState(s: EffectiveState): EffectiveState {
  return {
    constituents: [...s.constituents].sort((a, b) => cmp(a.id, b.id)),
    gifts: [...s.gifts].sort((a, b) => cmp(a.giftRef, b.giftRef)),
    softCredits: [...s.softCredits].sort((a, b) => cmp(a.giftRef, b.giftRef) || cmp(a.constituent, b.constituent)),
    ...(s.pledges?.length && { pledges: [...s.pledges].sort((a, b) => cmp(a.pledgeRef, b.pledgeRef)) }),
  };
}

export const effectiveStateHash = (s: EffectiveState): string => sha256Hex(sortState(s));

/** Source tag for values that came with the seeded CRM fixture. */
export const CRM_SOURCE = 'crm';
export const META_FIELDS = ['email', 'phone', 'dob', 'address'] as const;

/** The CRM fixture as effective state: version 1 of every constituent, every gift and pledge active, no soft credits. */
export function fixtureState(constituents: CrmConstituent[], gifts: CrmGift[], pledges: CrmPledge[] = []): EffectiveState {
  const f = (c: CrmConstituent, k: string) => c.fields[k] ?? '';
  return sortState({
    constituents: constituents.map((c) => {
      const asOf = f(c, 'created_at');
      return {
        id: c.id,
        firstName: f(c, 'first_name'), middleName: f(c, 'middle_name'), lastName: f(c, 'last_name'), suffix: f(c, 'suffix'),
        email: f(c, 'email'), phone: f(c, 'phone'),
        addressLine1: f(c, 'address_line1'), addressLine2: f(c, 'address_line2'), city: f(c, 'city'), state: f(c, 'state'), zip: f(c, 'zip'),
        dob: f(c, 'dob'),
        fieldMeta: Object.fromEntries(META_FIELDS.map((k) => [k, { asOf, source: CRM_SOURCE }])),
        aliases: [], alternates: [],
        household: f(c, 'household_id'),
      };
    }),
    gifts: gifts.map((g) => ({ giftRef: g.gift_id, constituent: g.constituent_id, giftDate: g.gift_date, amountCents: g.amount_cents, fund: g.fund, appeal: g.appeal, giftType: g.gift_type, externalRef: g.external_ref, ...(g.pledge_id && { pledgeRef: g.pledge_id }) })),
    softCredits: [],
    pledges: pledges.map((p) => ({ pledgeRef: p.pledge_id, constituent: p.constituent_id, pledgeDate: p.pledge_date, totalCents: p.total_cents, schedule: p.schedule, fund: p.fund, appeal: p.appeal })),
  });
}

/** The effective state as the Phase 1 pipeline reads a CRM (src/import/crm): fixture column names, normalized record,
 *  per-field asOf from fieldMeta so survivorship (S2) plans against each field's own date, not the row's. */
/** One effective constituent as the Phase 1 pipeline reads a CRM record: fixture column names, normalized record,
 *  per-field asOf from fieldMeta so survivorship (S2) plans against each field's own date, not the row's. */
export function crmConstituentOf(c: EffectiveConstituent): CrmConstituent {
  const fields: Record<string, string> = {
    constituent_id: c.id, first_name: c.firstName, middle_name: c.middleName, last_name: c.lastName, suffix: c.suffix,
    email: c.email, phone: c.phone, address_line1: c.addressLine1, address_line2: c.addressLine2, city: c.city, state: c.state, zip: c.zip,
    dob: c.dob, household_id: c.household,
  };
  const asOf = Object.fromEntries(META_FIELDS.map((k) => [k, c.fieldMeta[k]?.asOf ?? ''])) as Record<(typeof META_FIELDS)[number], string>;
  return { id: c.id, fields, record: crmRecord(fields), asOf };
}

/** The effective state as the Phase 1 pipeline reads a CRM (src/import/crm). */
export function stateToCrm(s: EffectiveState): { crm: CrmConstituent[]; gifts: CrmGift[] } {
  const crm = s.constituents.map(crmConstituentOf);
  const gifts = s.gifts.map((g) => ({ gift_id: g.giftRef, constituent_id: g.constituent, gift_date: g.giftDate, amount_cents: g.amountCents, fund: g.fund, campaign: '', appeal: g.appeal, gift_type: g.giftType, external_ref: g.externalRef }));
  return { crm, gifts };
}
