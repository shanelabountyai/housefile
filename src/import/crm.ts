// The CRM fixture loaded read-only in memory (Phase 1 has no database). crm_constituents.csv and
// crm_gifts.csv only; product code never reads truth_persons.csv, answer_key_*.csv or decisions_*.csv.
import { parseCsv } from './csv';
import { normAddress, normEmail, normPhone, parseName } from './normalize';
import type { MatchRecord } from '../matching/types';

export type CrmConstituent = {
  id: string;
  fields: Record<string, string>; // the fixture columns as stored
  record: MatchRecord; // normalized view for matching; mutated by in-batch survivorship (D-15)
  asOf?: Record<'email' | 'phone' | 'dob' | 'address', string>; // per-field asOf (S2); absent for the raw fixture, where created_at serves
};

export type CrmGift = {
  gift_id: string;
  constituent_id: string;
  gift_date: string;
  amount_cents: number;
  fund: string;
  campaign: string;
  appeal: string;
  gift_type: string;
  external_ref: string;
  pledge_id?: string; // set on a pledge payment (fixtures/phase3/pledge_payments.csv)
};

export type CrmPledge = {
  pledge_id: string;
  constituent_id: string;
  pledge_date: string;
  total_cents: number;
  fund: string;
  campaign: string;
  appeal: string;
  schedule: { due: string; cents: number }[];
};

export function crmRecord(c: Record<string, string>): MatchRecord {
  const name = parseName({ first: c.first_name, last: c.last_name, middle: c.middle_name, suffix: c.suffix });
  return {
    id: c.constituent_id ?? '',
    name,
    email: normEmail(c.email).value,
    phone: normPhone(c.phone).value,
    addr: normAddress(c.address_line1, c.address_line2, c.city, c.state, c.zip).value,
    dob: c.dob ?? '', // stored as ISO already; passed through as the oracle does
  };
}

export function loadConstituents(bytes: Uint8Array): CrmConstituent[] {
  return parseCsv(bytes).rows.map((r) => ({ id: r.cells.constituent_id ?? '', fields: r.cells, record: crmRecord(r.cells) }));
}

export function loadGifts(bytes: Uint8Array): CrmGift[] {
  return parseCsv(bytes).rows.map((r) => {
    const c = r.cells;
    const raw = c.amount_cents ?? '';
    const cents = /^-?\d+$/.test(raw) ? Number(raw) : NaN; // '' or ' ' must not become 0
    if (!Number.isSafeInteger(cents)) throw new Error(`crm_gifts: ${c.gift_id} amount_cents "${c.amount_cents}" is not an integer`);
    return {
      gift_id: c.gift_id ?? '',
      constituent_id: c.constituent_id ?? '',
      gift_date: c.gift_date ?? '',
      amount_cents: cents,
      fund: c.fund ?? '',
      campaign: c.campaign ?? '',
      appeal: c.appeal ?? '',
      gift_type: c.gift_type ?? '',
      external_ref: c.external_ref ?? '',
      ...(c.pledge_id && { pledge_id: c.pledge_id }),
    };
  });
}

const cents = (raw: string, what: string) => {
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`pledges: ${what} "${raw}" is not a positive integer`);
  return n;
};

/** pledges.csv: installments as `due:cents|due:cents`, which must sum to the total (D-9). */
export function loadPledges(bytes: Uint8Array): CrmPledge[] {
  return parseCsv(bytes).rows.map(({ cells: c }) => {
    const id = c.pledge_id ?? '';
    const schedule = (c.installments ?? '').split('|').map((part) => {
      const [due = '', amt = ''] = part.split(':');
      return { due, cents: cents(amt, `${id} installment`) };
    });
    const total = cents(c.total_cents ?? '', `${id} total_cents`);
    if (schedule.reduce((s, x) => s + x.cents, 0) !== total) throw new Error(`pledges: ${id} schedule does not sum to ${total}`);
    return { pledge_id: id, constituent_id: c.constituent_id ?? '', pledge_date: c.pledge_date ?? '', total_cents: total, fund: c.fund ?? '', campaign: c.campaign ?? '', appeal: c.appeal ?? '', schedule };
  });
}
