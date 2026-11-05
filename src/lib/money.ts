// The one home for money representation (CLAUDE.md non-negotiable 6; D-6).
// Ported from LoanBook src/ledger/money.ts (commit fc8d736): MoneyError, assertCents, centsFromNumeric,
// formatCents. LoanBook's basis-point and rounding helpers are not needed here (gifts are sums, not a ledger)
// and were left behind. parseCents is new: LoanBook has no text-to-cents parser; brief N7 defines this one.
import { fold } from './fold';

export type MoneyErrorCode = 'non_integer_amount';

export class MoneyError extends Error {
  constructor(readonly code: MoneyErrorCode) {
    super(code);
  }
}

/** Boundary guard for an amount in cents. Sign is the caller's rule, not this one's. */
export function assertCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new MoneyError('non_integer_amount');
  return value;
}

/**
 * The read edge: a Postgres numeric as the text `pg` returns, to whole cents. Trailing zero scale is fine;
 * any fraction is refused, never rounded.
 */
export function centsFromNumeric(text: string): number {
  const whole = /^(-?\d+)(?:\.0+)?$/.exec(text)?.[1];
  return assertCents(whole === undefined ? NaN : Number(whole));
}

/** Display only: whole cents as dollars by string, never through a float ("-$12.05"). */
export function formatCents(value: number): string {
  const digits = String(Math.abs(assertCents(value))).padStart(3, '0');
  return `${value < 0 ? '-' : ''}$${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export type AmountCode = '' | 'AMOUNT_MISSING' | 'AMOUNT_INVALID' | 'AMOUNT_NEGATIVE' | 'AMOUNT_ZERO';
export type ParsedCents = { cents: number | null; code: AmountCode };

/**
 * N7: strip `$`, `USD`, commas and spaces; `(x)` or a leading `-` is negative (AMOUNT_NEGATIVE); at most two
 * decimals, assembled as whole*100 + fraction in integer arithmetic; zero is AMOUNT_ZERO; anything else
 * AMOUNT_INVALID. No float is created at any point.
 */
export function parseCents(raw: string | null | undefined): ParsedCents {
  let s = fold(raw).replaceAll('usd', '').replaceAll('$', '').replaceAll(',', '').replaceAll(' ', '');
  if (!s) return { cents: null, code: 'AMOUNT_MISSING' };
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1);
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return { cents: null, code: 'AMOUNT_INVALID' };
  const whole = m[1]!;
  const frac = (m[2] ?? '').padEnd(2, '0');
  // Integer arithmetic on digit strings; refuse anything a safe integer cannot hold.
  const digits = (whole + frac).replace(/^0+(?=\d)/, '');
  const cents = Number(digits);
  if (!Number.isSafeInteger(cents)) return { cents: null, code: 'AMOUNT_INVALID' };
  if (neg) return { cents: cents === 0 ? 0 : -cents, code: 'AMOUNT_NEGATIVE' };
  if (cents === 0) return { cents: 0, code: 'AMOUNT_ZERO' };
  return { cents, code: '' };
}
