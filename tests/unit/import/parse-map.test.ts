import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv, parseCsvText } from '@/import/csv';
import { MapRefused, headerKey, proposeMap, resolveMap } from '@/import/map';

// Task 1.5 acceptance: both fixture files map without hand edits; Table #, Notes, Source land in extras;
// cp1252 recorded for file B; a day-first date is DATE_INVALID (tests/unit/import/normalize.test.ts).

const fixture = (name: string) => new Uint8Array(readFileSync(`fixtures/${name}`));

describe('CSV reader', () => {
  it('handles quotes, doubled quotes, embedded commas and newlines, CRLF and LF', () => {
    const { records, raws } = parseCsvText('a,b\r\n"x, y","say ""hi"""\n1,"two\nlines"\n\n3,4');
    expect(records).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', 'two\nlines'],
      ['3', '4'],
    ]);
    expect(raws[1]).toBe('"x, y","say ""hi"""');
  });
  it('a short row fills missing cells with "" and keeps extra cells', () => {
    const p = parseCsv(new TextEncoder().encode('a,b,c\n1\n1,2,3,4\n'));
    expect(p.rows[0]!.cells).toEqual({ a: '1', b: '', c: '' });
    expect(p.rows[1]!.extraCells).toEqual(['4']);
  });
  it('file A: BOM stripped, utf-8-sig, CRLF, 400 rows, 18 headers', () => {
    const p = parseCsv(fixture('import_a.csv'));
    expect(p.encoding).toBe('utf-8-sig');
    expect(p.rows).toHaveLength(400);
    expect(p.headers[0]).toBe('Donor First Name');
    expect(p.headers).toHaveLength(18);
    expect(p.contentHash).toBe('a4d3e08af9606d75dcc396e247e444342eccade6ee060af378975485ce6792bb');
  });
  it('file B: cp1252 detected and recorded, 250 rows, diacritics survive', () => {
    const p = parseCsv(fixture('import_b.csv'));
    expect(p.encoding).toBe('cp1252');
    expect(p.rows).toHaveLength(250);
    expect(p.contentHash).toBe('a4e0df19787138089b4daf78cec0ba4a1c612d1e2c73a02a32d97f263d0f1aa6');
    const text = p.rows.map((r) => r.raw).join('\n');
    expect(/[éëöïñ]/.test(text)).toBe(true);
  });
});

describe('header synonym mapper', () => {
  it('headerKey ignores case and punctuation', () => {
    expect(headerKey('Phone #')).toBe('phone');
    expect(headerKey('Apt/Unit')).toBe('apt unit');
    expect(headerKey('E-mail')).toBe('e mail');
  });
  it('file A maps every field without hand edits; Table # and Notes are extras', () => {
    const headers = parseCsv(fixture('import_a.csv')).headers;
    const { map, extras, conflicts } = proposeMap(headers);
    expect(map).toEqual({
      first: 'Donor First Name', last: 'Donor Last Name', middle: 'Middle', suffix: 'Suffix', email: 'Email Address',
      phone: 'Phone #', line1: 'Street Address', line2: 'Apt/Unit', city: 'City', state: 'ST', zip: 'Zip Code',
      dob: 'Birth Date', gift_date: 'Gift Date', amount: 'Gift Amount', fund: 'Designation', external_ref: 'Transaction ID',
    });
    expect(extras).toEqual(['Table #', 'Notes']);
    expect(conflicts).toEqual([]);
  });
  it('file B maps the one Name column to full; Source is an extra', () => {
    const headers = parseCsv(fixture('import_b.csv')).headers;
    const { map, extras } = proposeMap(headers);
    expect(map).toEqual({
      full: 'Name', email: 'E-mail', phone: 'Phone', line1: 'Address 1', line2: 'Address 2', city: 'City', state: 'State',
      zip: 'Postal', dob: 'DOB', gift_date: 'Date', amount: 'Amt', fund: 'Fund',
    });
    expect(extras).toEqual(['Source']);
  });
  it('a second header for a claimed field is a conflict and goes to extras', () => {
    const p = proposeMap(['Email', 'E-mail', 'Name', 'Date', 'Amount']);
    expect(p.map.email).toBe('Email');
    expect(p.conflicts).toEqual([{ header: 'E-mail', field: 'email', keptHeader: 'Email' }]);
    expect(p.extras).toEqual(['E-mail']);
  });
  it('refuses a map missing amount, gift_date or both name forms', () => {
    expect(() => resolveMap(['Name', 'Date'])).toThrow(MapRefused);
    expect(() => resolveMap(['Name', 'Amount'])).toThrow(/gift_date unmapped/);
    expect(() => resolveMap(['First Name', 'Date', 'Amount'])).toThrow(/name unmapped/);
    expect(() => resolveMap(['Name', 'Date', 'Amount'], { full: 'Nope', gift_date: 'Date', amount: 'Amount' })).toThrow(/not in the file/);
  });
  it('an override map wins over the proposal and recomputes extras', () => {
    const r = resolveMap(['Name', 'Date', 'Amount', 'Donation'], { full: 'Name', gift_date: 'Date', amount: 'Donation' });
    expect(r.map.amount).toBe('Donation');
    expect(r.extras).toEqual(['Amount']);
  });
});
