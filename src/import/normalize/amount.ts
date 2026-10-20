// N7. Amounts go straight to integer cents. No float ever touches an amount (CLAUDE.md #6).
// NOTE: written fresh from docs/domain-brief.md N7 — the LoanBook donor module was not
// reachable from this workspace (see PR open issues).
import type { Normalized } from './result';

export type Cents = number & { readonly __brand: 'cents' };

export function assertCents(n: unknown): asserts n is Cents {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new TypeError('cents must be a safe integer');
}

const BODY = /^(\d+)(?:\.(\d{1,2}))?$/;

export function parseCents(raw: string): Normalized<Cents> {
  let s = (raw ?? '').trim();
  if (!s) return { value: null, codes: ['AMOUNT_MISSING'] };
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/usd/gi, '').replace(/[$,\s]/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const m = BODY.exec(s);
  if (!m) return { value: null, codes: ['AMOUNT_INVALID'] };
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return { value: null, codes: ['AMOUNT_INVALID'] };
  if (cents === 0) return { value: 0 as Cents, codes: ['AMOUNT_ZERO'] };
  const signed = negative ? -cents : cents;
  return { value: signed as Cents, codes: negative ? ['AMOUNT_NEGATIVE'] : [] };
}
