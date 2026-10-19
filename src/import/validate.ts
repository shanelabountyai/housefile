// Stages 3 and 4 (brief §4): normalize a mapped row (N1–N8, each value with its rule) and validate it with
// the closed code set. A REJECT row stops here: it is never matched or indexed (D-32).
// The as-of date is an explicit input (ISO string); nothing here reads a clock.
import type { ColumnMap } from './map';
import { normAddress, normAmount, normDate, normDob, normEmail, normPhone, parseName } from './normalize';
import type { MatchRecord } from '../matching/types';

export const REJECT_CODES = ['NAME_MISSING', 'AMOUNT_MISSING', 'AMOUNT_INVALID', 'GIFT_DATE_MISSING', 'GIFT_DATE_INVALID', 'DATE_FUTURE'] as const;
export const WARN_CODES = [
  'EMAIL_INVALID', 'PHONE_INVALID', 'ZIP_PADDED', 'ZIP_INVALID', 'STATE_INVALID', 'ADDRESS_UNPARSED', 'AMOUNT_NEGATIVE',
  'AMOUNT_ZERO', 'DOB_DATE_INVALID', 'DOB_DATE_EXCEL_SERIAL', 'DATE_EXCEL_SERIAL', 'FUND_UNKNOWN',
] as const;
export type RejectCode = (typeof REJECT_CODES)[number];
export type WarnCode = (typeof WARN_CODES)[number];

export type ImportRow = {
  id: string; // "A-0001"
  index: number;
  record: MatchRecord; // what the matcher sees
  giftDate: string; // ISO or ""
  cents: number | null;
  fund: string; // raw text
  externalRef: string;
  extras: Record<string, string>;
  raw: string; // the record's source text (S4: byte-identical duplicate rows)
  rules: string[]; // normalization rules that produced a value, e.g. "N2:email"
  warnings: WarnCode[];
  reject: RejectCode | '';
  status: string; // "OK" | "WARN:<codes>" | "REJECT:<code>"
};

export type ValidateOptions = { asOf: string; extras: string[] };

export function validateRow(id: string, index: number, cells: Record<string, string>, raw: string, map: ColumnMap, opts: ValidateOptions): ImportRow {
  const g = (k: keyof ColumnMap): string => {
    const h = map[k];
    return h ? (cells[h] ?? '') : '';
  };
  const rules: string[] = [];
  const warnings: WarnCode[] = [];

  const name = parseName({ first: g('first'), last: g('last'), middle: g('middle'), suffix: g('suffix'), full: g('full') });
  rules.push('N1:name');
  const email = normEmail(g('email'));
  if (email.code && email.code !== 'EMAIL_MISSING') warnings.push(email.code);
  if (g('email')) rules.push('N2:email');
  const phone = normPhone(g('phone'));
  if (phone.code && phone.code !== 'PHONE_MISSING') warnings.push(phone.code);
  if (g('phone')) rules.push('N3:phone');
  const addr = normAddress(g('line1'), g('line2'), g('city'), g('state'), g('zip'));
  for (const c of addr.codes) if (c !== 'ZIP_MISSING') warnings.push(c);
  if (g('line1') || g('line2')) rules.push('N4:address');
  if (g('zip')) rules.push('N5:zip');
  if (g('state')) rules.push('N8:state');
  const dobN = normDob(g('dob'), opts.asOf);
  let dob = dobN.value;
  if (dobN.code && dobN.code !== 'DATE_MISSING') {
    warnings.push(`DOB_${dobN.code}` as WarnCode);
    dob = dobN.code === 'DATE_EXCEL_SERIAL' ? dob : '';
  }
  if (g('dob')) rules.push('N6:dob');

  // Reject precedence follows the oracle: name, then amount, then gift date, then the as-of check.
  let reject: RejectCode | '' = '';
  if (!name.first && !name.last) reject = 'NAME_MISSING';
  const amount = normAmount(g('amount'));
  rules.push('N7:amount');
  if (amount.code === 'AMOUNT_MISSING' || amount.code === 'AMOUNT_INVALID') reject = reject || amount.code;
  else if (amount.code) warnings.push(amount.code);
  const gd = normDate(g('gift_date'));
  rules.push('N6:gift_date');
  if (gd.code === 'DATE_MISSING' || gd.code === 'DATE_INVALID') reject = reject || (gd.code === 'DATE_MISSING' ? 'GIFT_DATE_MISSING' : 'GIFT_DATE_INVALID');
  else {
    if (gd.code === 'DATE_EXCEL_SERIAL') warnings.push('DATE_EXCEL_SERIAL');
    if (gd.value > opts.asOf) reject = reject || 'DATE_FUTURE';
  }

  const extras: Record<string, string> = {};
  for (const h of opts.extras) extras[h] = cells[h] ?? '';

  const status = reject ? `REJECT:${reject}` : warnings.length ? `WARN:${warnings.join('+')}` : 'OK';
  return {
    id,
    index,
    record: { id, name, email: email.value, phone: phone.value, addr: addr.value, dob },
    giftDate: gd.value,
    cents: amount.value,
    fund: g('fund').trim(),
    externalRef: g('external_ref').trim(),
    extras,
    raw,
    rules,
    warnings,
    reject,
    status,
  };
}

export type ValidationTotals = { ok: number; warn: number; reject: number; byCode: Record<string, number> };

export function validationTotals(rows: ImportRow[]): ValidationTotals {
  const t: ValidationTotals = { ok: 0, warn: 0, reject: 0, byCode: {} };
  for (const r of rows) {
    if (r.reject) {
      t.reject++;
      t.byCode[`REJECT:${r.reject}`] = (t.byCode[`REJECT:${r.reject}`] ?? 0) + 1;
    } else if (r.warnings.length) t.warn++;
    else t.ok++;
    for (const w of r.warnings) t.byCode[`WARN:${w}`] = (t.byCode[`WARN:${w}`] ?? 0) + 1;
  }
  return t;
}
