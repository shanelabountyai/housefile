// N6: dates to ISO. Written from brief §5 (N6), D-21 and §10 (GN-08..GN-10).
// No Date object anywhere: the calendar arithmetic is done on integers so the result cannot depend on the
// host clock or time zone (CI runs with a non-UTC TZ).
import { fold } from '../../lib/fold';

export const RULE = 'N6';
export type DateCode = '' | 'DATE_MISSING' | 'DATE_INVALID' | 'DATE_EXCEL_SERIAL';
export type NormalizedDate = { value: string; code: DateCode; rule: string };

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;

const pad = (n: number, w: number) => String(n).padStart(w, '0');
const iso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;

function mkdate(y: number, m: number, d: number): NormalizedDate {
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return { value: '', code: 'DATE_INVALID', rule: RULE };
  return { value: iso(y, m, d), code: '', rule: RULE };
}

/** Days since 1970-01-01 → (y, m, d), proleptic Gregorian (Howard Hinnant's civil_from_days). */
export function civilFromDays(z: number): [number, number, number] {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [m <= 2 ? y + 1 : y, m, d];
}

// Excel's day 0 is 1899-12-30, which is 25569 days before 1970-01-01.
const EXCEL_EPOCH_DAYS = -25569;

/** ISO; M/D/YYYY; M/D/YY (00–69 → 20xx, 70–99 → 19xx); Excel serial 20000–60000; `Mon D, YYYY`; `D Mon YYYY`. US month-first. */
export function normDate(raw: string | null | undefined): NormalizedDate {
  const s = fold(raw).replaceAll(',', ' ').replace(/\s+/g, ' ').trim();
  if (!s) return { value: '', code: 'DATE_MISSING', rule: RULE };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t].*)?$/.exec(s);
  if (m) return mkdate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    return mkdate(y, Number(m[1]), Number(m[2]));
  }
  if (/^\d{5}$/.test(s) && Number(s) >= 20000 && Number(s) <= 60000) {
    const [y, mo, d] = civilFromDays(EXCEL_EPOCH_DAYS + Number(s));
    return { value: iso(y, mo, d), code: 'DATE_EXCEL_SERIAL', rule: RULE };
  }
  m = /^([a-z]{3})[a-z]* (\d{1,2}) (\d{4})$/.exec(s);
  if (m && Object.hasOwn(MONTHS, m[1]!)) return mkdate(Number(m[3]), MONTHS[m[1]!]!, Number(m[2]));
  m = /^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})$/.exec(s);
  if (m && Object.hasOwn(MONTHS, m[2]!)) return mkdate(Number(m[3]), MONTHS[m[2]!]!, Number(m[1]));
  return { value: '', code: 'DATE_INVALID', rule: RULE };
}
