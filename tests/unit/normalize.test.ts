import { describe, expect, it } from 'vitest';
import { parseCents, assertCents } from '@/import/normalize/amount';
import { normalizeEmail, normalizePhone, normalizeZip } from '@/import/normalize/contact';
import { normalizeDate } from '@/import/normalize/date';

// Golden values GN-01..GN-14 copied from docs/domain-brief.md (never adjusted to pass).
describe('GN goldens', () => {
  it('GN-01 gmail dots, plus tag and case', () => {
    expect(normalizeEmail('Bob.Johnson+gala@Gmail.com')).toEqual({ value: 'bobjohnson@gmail.com', codes: [] });
  });
  it('GN-02 non-gmail dots are kept', () => {
    expect(normalizeEmail('bob.johnson@example.com').value).toBe('bob.johnson@example.com');
  });
  it('GN-03 double @ is invalid', () => {
    expect(normalizeEmail('jane@@example.com')).toEqual({ value: null, codes: ['EMAIL_INVALID'] });
  });
  it('GN-04 phone drops country code', () => {
    expect(normalizePhone('+1 (918) 555-0142').value).toBe('9185550142');
  });
  it('GN-05 short phone invalid', () => {
    expect(normalizePhone('918-555-014').codes).toEqual(['PHONE_INVALID']);
  });
  it('GN-06 ZIP padded', () => {
    expect(normalizeZip('7102')).toEqual({ value: '07102', codes: ['ZIP_PADDED'] });
  });
  it('GN-07 ZIP+4 truncated', () => {
    expect(normalizeZip('01605-1234').value).toBe('01605');
  });
  it('GN-08 Excel serial', () => {
    expect(normalizeDate('46113')).toEqual({ value: '2026-04-01', codes: ['DATE_EXCEL_SERIAL'] });
  });
  it('GN-09 two-digit year, month first', () => {
    expect(normalizeDate('5/4/26').value).toBe('2026-05-04');
  });
  it('GN-10 month name', () => {
    expect(normalizeDate('Sep 19, 2026').value).toBe('2026-09-19');
  });
  it('GN-11 dollars to cents', () => {
    expect(parseCents('$1,250.00')).toEqual({ value: 125000, codes: [] });
  });
  it('GN-12 parentheses are negative', () => {
    expect(parseCents('(50.00)')).toEqual({ value: -5000, codes: ['AMOUNT_NEGATIVE'] });
  });
  it('GN-13 words are invalid', () => {
    expect(parseCents('fifty')).toEqual({ value: null, codes: ['AMOUNT_INVALID'] });
  });
  it('GN-14 one decimal digit', () => {
    expect(parseCents('$1250.5').value).toBe(125050);
  });
});

describe('edges beyond the goldens', () => {
  it('day-first date is DATE_INVALID, not guessed', () => {
    expect(normalizeDate('13/02/2026')).toEqual({ value: null, codes: ['DATE_INVALID'] });
  });
  it('impossible calendar dates are invalid', () => {
    expect(normalizeDate('2026-02-30').codes).toEqual(['DATE_INVALID']);
    expect(normalizeDate('2/29/2027').codes).toEqual(['DATE_INVALID']);
  });
  it('leap day is valid', () => {
    expect(normalizeDate('2/29/2028').value).toBe('2028-02-29');
  });
  it('two-digit year pivot', () => {
    expect(normalizeDate('1/1/69').value).toBe('2069-01-01');
    expect(normalizeDate('1/1/70').value).toBe('1970-01-01');
  });
  it('D Mon YYYY and ISO with time', () => {
    expect(normalizeDate('3 March 2025').value).toBe('2025-03-03');
    expect(normalizeDate('2026-03-04 10:00').value).toBe('2026-03-04');
  });
  it('empty values report MISSING', () => {
    expect(normalizeDate('').codes).toEqual(['DATE_MISSING']);
    expect(parseCents('  ').codes).toEqual(['AMOUNT_MISSING']);
    expect(normalizeEmail('').codes).toEqual(['EMAIL_MISSING']);
    expect(normalizePhone('').codes).toEqual(['PHONE_MISSING']);
    expect(normalizeZip('').codes).toEqual(['ZIP_MISSING']);
  });
  it('amounts: leading minus, USD, zero, >2 decimals, no float rounding', () => {
    expect(parseCents('-12.30')).toEqual({ value: -1230, codes: ['AMOUNT_NEGATIVE'] });
    expect(parseCents('USD 5')).toEqual({ value: 500, codes: [] });
    expect(parseCents('0.00')).toEqual({ value: 0, codes: ['AMOUNT_ZERO'] });
    expect(parseCents('1.234').codes).toEqual(['AMOUNT_INVALID']);
    expect(parseCents('19.99').value).toBe(1999); // 19.99 * 100 would be 1998.9999999999998
    expect(parseCents('99999999999999999999').codes).toEqual(['AMOUNT_INVALID']);
  });
  it('assertCents rejects floats', () => {
    expect(() => assertCents(1.5)).toThrow();
    expect(() => assertCents(150)).not.toThrow();
  });
  it('plus tag removed on every domain; empty local invalid', () => {
    expect(normalizeEmail(' A+b@Example.org ').value).toBe('a@example.org');
    expect(normalizeEmail('+tag@example.org').codes).toEqual(['EMAIL_INVALID']);
    expect(normalizeEmail('a@localhost').codes).toEqual(['EMAIL_INVALID']);
  });
  it('11-digit phone not starting with 1 is invalid; ZIP of 9 digits', () => {
    expect(normalizePhone('29185550142').codes).toEqual(['PHONE_INVALID']);
    expect(normalizeZip('741333517').value).toBe('74133');
    expect(normalizeZip('123456').codes).toEqual(['ZIP_INVALID']);
  });
});
