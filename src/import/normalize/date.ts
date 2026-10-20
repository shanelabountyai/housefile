// N6. Dates as 'YYYY-MM-DD' strings. US month-first; a day-first date is DATE_INVALID, never guessed.
// Arithmetic is done on UTC components so the process timezone cannot shift a day.
import type { Normalized } from './result';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function mk(y: number, mo: number, d: number, codes: string[] = []): Normalized<string> {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1000 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return { value: null, codes: ['DATE_INVALID'] };
  }
  const p = (n: number, w: number) => String(n).padStart(w, '0');
  return { value: `${p(y, 4)}-${p(mo, 2)}-${p(d, 2)}`, codes };
}

const g = (m: RegExpExecArray, i: number): string => m[i] ?? '';

export function normalizeDate(raw: string): Normalized<string> {
  const s = (raw ?? '').toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return { value: null, codes: ['DATE_MISSING'] };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t].*)?$/.exec(s);
  if (m) return mk(+g(m, 1), +g(m, 2), +g(m, 3));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let y = +g(m, 3);
    if (g(m, 3).length === 2) y += y < 70 ? 2000 : 1900;
    return mk(y, +g(m, 1), +g(m, 2));
  }
  if (/^\d{5}$/.test(s) && +s >= 20000 && +s <= 60000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + +s * 86_400_000);
    return mk(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), ['DATE_EXCEL_SERIAL']);
  }
  m = /^([a-z]{3})[a-z]* (\d{1,2}) (\d{4})$/.exec(s);
  if (m && MONTHS.includes(g(m, 1))) return mk(+g(m, 3), MONTHS.indexOf(g(m, 1)) + 1, +g(m, 2));
  m = /^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})$/.exec(s);
  if (m && MONTHS.includes(g(m, 2))) return mk(+g(m, 3), MONTHS.indexOf(g(m, 2)) + 1, +g(m, 1));
  return { value: null, codes: ['DATE_INVALID'] };
}
