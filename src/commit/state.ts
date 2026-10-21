// The effective state and its hash (D-11, task 2.2). Pure: no database, no clock. One shape for the fixture
// loaded in memory (Phase 1 dry-run) and for the database (loadEffectiveState in ./db-state), so the dry-run's
// beforeHash and the database's hash agree, and a commit followed by its undo hashes equal (D-13).
// Excluded on purpose: row ids, createdAt, batch and event ids, audit rows, RETIRED constituents, superseded gifts.
import { sha256Hex } from '../lib/canonical';
import type { CrmConstituent, CrmGift } from '../import/crm';

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
};

export type EffectiveSoftCredit = { giftRef: string; constituent: string };

export type EffectiveState = { constituents: EffectiveConstituent[]; gifts: EffectiveGift[]; softCredits: EffectiveSoftCredit[] };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The state with every list in its canonical order (by business id), so equality and the hash ignore input order. */
export function sortState(s: EffectiveState): EffectiveState {
  return {
    constituents: [...s.constituents].sort((a, b) => cmp(a.id, b.id)),
    gifts: [...s.gifts].sort((a, b) => cmp(a.giftRef, b.giftRef)),
    softCredits: [...s.softCredits].sort((a, b) => cmp(a.giftRef, b.giftRef) || cmp(a.constituent, b.constituent)),
  };
}

export const effectiveStateHash = (s: EffectiveState): string => sha256Hex(sortState(s));

/** Source tag for values that came with the seeded CRM fixture. */
export const CRM_SOURCE = 'crm';
export const META_FIELDS = ['email', 'phone', 'dob', 'address'] as const;

/** The CRM fixture as effective state: version 1 of every constituent, every gift active, no soft credits. */
export function fixtureState(constituents: CrmConstituent[], gifts: CrmGift[]): EffectiveState {
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
    gifts: gifts.map((g) => ({ giftRef: g.gift_id, constituent: g.constituent_id, giftDate: g.gift_date, amountCents: g.amount_cents, fund: g.fund, appeal: g.appeal, giftType: g.gift_type, externalRef: g.external_ref })),
    softCredits: [],
  });
}
