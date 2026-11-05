import { describe, expect, it } from 'vitest';
import { MoneyError, assertCents, centsFromNumeric, formatCents, parseCents } from '@/lib/money';

// Ported from LoanBook tests/unit/money.test.ts (fc8d736); parseCents is new here (brief N7, GN-11..GN-14).

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MoneyError) return e.code;
    throw e;
  }
  return 'accepted';
};

describe('assertCents (LoanBook D1/D11; Housefile non-negotiable 6)', () => {
  it.each([0, 1, -1, 100000, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])('accepts %s', (v) => {
    expect(assertCents(v)).toBe(v);
  });
  it.each([
    ['a float', 100.5],
    ['a tiny fraction', 0.1 + 0.2],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['past the safe range', Number.MAX_SAFE_INTEGER + 1],
    ['true', true],
    ['a numeric string', '100'],
    ['a bigint', 100n],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_, v) => {
    expect(code(() => assertCents(v))).toBe('non_integer_amount');
  });
});

describe('centsFromNumeric: the read edge', () => {
  it.each([
    ['0', 0],
    ['100000', 100000],
    ['-1500', -1500],
    ['100000.000000000000000000000000000000', 100000],
  ])('reads %s', (text, cents) => expect(centsFromNumeric(text)).toBe(cents));
  it.each(['10.5', '9007199254740992', '', '1e5', '100.', ' 100'])('refuses %s', (text) => {
    expect(code(() => centsFromNumeric(text))).toBe('non_integer_amount');
  });
});

describe('formatCents (display)', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [125000, '$1250.00'],
    [-1205, '-$12.05'],
  ])('%i is %s', (c, s) => expect(formatCents(c)).toBe(s));
  it('refuses a fraction', () => expect(() => formatCents(1.5)).toThrow(MoneyError));
});

describe('parseCents (N7): text to integer cents, never through a float', () => {
  it('GN-11 $1,250.00 -> 125000', () => expect(parseCents('$1,250.00')).toEqual({ cents: 125000, code: '' }));
  it('GN-12 (50.00) -> -5000 AMOUNT_NEGATIVE', () => expect(parseCents('(50.00)')).toEqual({ cents: -5000, code: 'AMOUNT_NEGATIVE' }));
  it('GN-13 fifty -> AMOUNT_INVALID', () => expect(parseCents('fifty')).toEqual({ cents: null, code: 'AMOUNT_INVALID' }));
  it('GN-14 $1250.5 -> 125050', () => expect(parseCents('$1250.5')).toEqual({ cents: 125050, code: '' }));
  it.each([
    ['1250', 125000, ''],
    ['1,250', 125000, ''],
    ['USD 25', 2500, ''],
    ['-12.05', -1205, 'AMOUNT_NEGATIVE'],
    ['0', 0, 'AMOUNT_ZERO'],
    ['0.00', 0, 'AMOUNT_ZERO'],
    ['(0)', 0, 'AMOUNT_NEGATIVE'],
    ['  $ 7 ', 700, ''],
  ])('%s -> %s %s', (raw, cents, c) => expect(parseCents(raw)).toEqual({ cents, code: c }));
  it.each(['', '   ', null, undefined])('blank %s -> AMOUNT_MISSING', (raw) => {
    expect(parseCents(raw as string)).toEqual({ cents: null, code: 'AMOUNT_MISSING' });
  });
  it('a bare $ strips to nothing and is AMOUNT_MISSING (oracle N7 order: strip, then test for empty)', () => {
    expect(parseCents('$')).toEqual({ cents: null, code: 'AMOUNT_MISSING' });
  });
  it.each(['100 dollars', 'N/A', '1.234', '1.2.3', '1e3', '12.'])('%s -> AMOUNT_INVALID', (raw) => {
    expect(parseCents(raw)).toEqual({ cents: null, code: 'AMOUNT_INVALID' });
  });
  it('a value past the safe integer range is AMOUNT_INVALID, not a rounded float', () => {
    expect(parseCents('99999999999999999999')).toEqual({ cents: null, code: 'AMOUNT_INVALID' });
  });
});
