import { describe, expect, it } from 'vitest';
import { civilFromDays, decodeBytes, normAddress, normAmount, normDate, normEmail, normPhone, normState, normZip, parseName } from '@/import/normalize';
import { canonicalSet, setsIntersect } from '@/matching/nicknames';
import { line1Key } from '@/matching/types';

// Brief §10 normalization goldens GN-01..GN-16, GN-19, GN-20, copied verbatim (GN-17/18 live in tests/unit/matching).
// The expected values are the oracle's (tools/golden_answers.py); never edit them to pass.

describe('N2 email', () => {
  it('GN-01 Bob.Johnson+gala@Gmail.com -> bobjohnson@gmail.com', () => expect(normEmail('Bob.Johnson+gala@Gmail.com')).toEqual({ value: 'bobjohnson@gmail.com', code: '', rule: 'N2' }));
  it('GN-02 bob.johnson@example.com unchanged', () => expect(normEmail('bob.johnson@example.com').value).toBe('bob.johnson@example.com'));
  it('GN-03 jane@@example.com -> EMAIL_INVALID', () => expect(normEmail('jane@@example.com')).toEqual({ value: '', code: 'EMAIL_INVALID', rule: 'N2' }));
  it('+tag is folded on every domain (D-20)', () => expect(normEmail('a.b+run@example.org').value).toBe('a.b@example.org'));
  it('blank is EMAIL_MISSING', () => expect(normEmail('  ').code).toBe('EMAIL_MISSING'));
  it('no domain is EMAIL_INVALID', () => expect(normEmail('jane@example').code).toBe('EMAIL_INVALID'));
});

describe('N3 phone', () => {
  it('GN-04 +1 (918) 555-0142 -> 9185550142', () => expect(normPhone('+1 (918) 555-0142')).toEqual({ value: '9185550142', code: '', rule: 'N3' }));
  it('GN-05 918-555-014 -> PHONE_INVALID', () => expect(normPhone('918-555-014')).toEqual({ value: '', code: 'PHONE_INVALID', rule: 'N3' }));
  it.each(['(918) 555-0142', '918.555.0142', '9185550142', '918 555 0142'])('%s -> 9185550142', (p) => expect(normPhone(p).value).toBe('9185550142'));
});

describe('N5 ZIP', () => {
  it('GN-06 7102 -> 07102, ZIP_PADDED', () => expect(normZip('7102')).toEqual({ value: '07102', code: 'ZIP_PADDED', rule: 'N5' }));
  it('GN-07 01605-1234 -> 01605', () => expect(normZip('01605-1234')).toEqual({ value: '01605', code: '', rule: 'N5' }));
  it('9 digits without a hyphen keeps the first five', () => expect(normZip('741053517').value).toBe('74105'));
  it('6 digits is ZIP_INVALID', () => expect(normZip('123456').code).toBe('ZIP_INVALID'));
});

describe('N8 state', () => {
  it('Oklahoma -> OK', () => expect(normState('Oklahoma').value).toBe('OK'));
  it('ok -> OK', () => expect(normState('ok').value).toBe('OK'));
  it('Narnia -> STATE_INVALID', () => expect(normState('Narnia').code).toBe('STATE_INVALID'));
});

describe('N6 dates', () => {
  it('GN-08 Excel 46113 -> 2026-04-01', () => expect(normDate('46113')).toEqual({ value: '2026-04-01', code: 'DATE_EXCEL_SERIAL', rule: 'N6' }));
  it('GN-09 5/4/26 -> 2026-05-04', () => expect(normDate('5/4/26')).toEqual({ value: '2026-05-04', code: '', rule: 'N6' }));
  it('GN-10 Sep 19, 2026 -> 2026-09-19', () => expect(normDate('Sep 19, 2026')).toEqual({ value: '2026-09-19', code: '', rule: 'N6' }));
  it('ISO passes through', () => expect(normDate('2026-10-14').value).toBe('2026-10-14'));
  it('M/D/YYYY', () => expect(normDate('8/8/2026').value).toBe('2026-08-08'));
  it('D Mon YYYY', () => expect(normDate('3 March 2026').value).toBe('2026-03-03'));
  it('two-digit pivot: 70 -> 1970, 69 -> 2069 (D-21)', () => {
    expect(normDate('1/1/70').value).toBe('1970-01-01');
    expect(normDate('1/1/69').value).toBe('2069-01-01');
  });
  it('day-first 13/02/2026 is DATE_INVALID, never guessed (task 1.5 acceptance, D-21)', () => expect(normDate('13/02/2026')).toEqual({ value: '', code: 'DATE_INVALID', rule: 'N6' }));
  it('2026-02-30 is DATE_INVALID', () => expect(normDate('2026-02-30').code).toBe('DATE_INVALID'));
  it('Excel serial outside 20000–60000 is DATE_INVALID', () => expect(normDate('19999').code).toBe('DATE_INVALID'));
  it('blank is DATE_MISSING', () => expect(normDate('').code).toBe('DATE_MISSING'));
  it('civilFromDays agrees with known anchors', () => {
    expect(civilFromDays(0)).toEqual([1970, 1, 1]);
    expect(civilFromDays(-25569)).toEqual([1899, 12, 30]);
    expect(civilFromDays(20544)).toEqual([2026, 4, 1]);
  });
});

describe('N7 amounts (through src/lib/money parseCents)', () => {
  it('GN-11 $1,250.00 -> 125000', () => expect(normAmount('$1,250.00')).toEqual({ value: 125000, code: '', rule: 'N7' }));
  it('GN-12 (50.00) -> -5000, AMOUNT_NEGATIVE', () => expect(normAmount('(50.00)')).toEqual({ value: -5000, code: 'AMOUNT_NEGATIVE', rule: 'N7' }));
  it('GN-13 fifty -> AMOUNT_INVALID', () => expect(normAmount('fifty')).toEqual({ value: null, code: 'AMOUNT_INVALID', rule: 'N7' }));
  it('GN-14 $1250.5 -> 125050', () => expect(normAmount('$1250.5')).toEqual({ value: 125050, code: '', rule: 'N7' }));
});

describe('N1 names', () => {
  it("GN-15 'O'Brien, Edward L. Jr.' -> edward / l / obrien / JR", () => {
    expect(parseName({ full: "O'Brien, Edward L. Jr." })).toEqual({ first: 'edward', middle: 'l', last: 'obrien', suffix: 'JR' });
    expect(parseName({ full: "O'Brien, Edward L. Jr." })).toEqual(parseName({ first: 'Edward', last: 'OBrien', middle: 'L', suffix: 'Jr' }));
  });
  it("GN-16 first column 'Mary K.' -> mary / k", () => {
    expect(parseName({ first: 'Mary K.', last: 'Lee' })).toEqual({ first: 'mary', middle: 'k', last: 'lee', suffix: '' });
    expect(parseName({ first: 'Mary K.', last: 'Lee' })).toEqual(parseName({ first: 'Mary', middle: 'K', last: 'Lee' }));
  });
  it('First M. Last Suffix', () => expect(parseName({ full: 'Edward L. O’Brien Jr' })).toEqual({ first: 'edward', middle: 'l', last: 'obrien', suffix: 'JR' }));
  it('no space after the comma', () => expect(parseName({ full: 'Gonzalez,Karen R.' })).toEqual({ first: 'karen', middle: 'r', last: 'gonzalez', suffix: '' }));
  it('suffix at the end of the last-name column', () => expect(parseName({ first: 'Robert', last: 'Adams Sr.' }).suffix).toBe('SR'));
  it('diacritics fold, case folds, hyphen becomes a space', () => expect(parseName({ first: 'RENÉE', last: 'Smith-Jones' })).toEqual({ first: 'renee', middle: '', last: 'smith jones', suffix: '' }));
  it('an empty name parses to empty parts', () => expect(parseName({ first: '', last: '' })).toEqual({ first: '', middle: '', last: '', suffix: '' }));
});

describe('N1 nickname sets (D-19)', () => {
  it('Bob -> {robert}; unknown maps to itself', () => {
    expect([...canonicalSet('bob')]).toEqual(['robert']);
    expect([...canonicalSet('hiroshi')]).toEqual(['hiroshi']);
  });
  it('Ted -> {edward, theodore}; Sam -> {samuel, samantha}; agreement is intersection', () => {
    expect([...canonicalSet('ted')].sort()).toEqual(['edward', 'theodore']);
    expect([...canonicalSet('sam')].sort()).toEqual(['samantha', 'samuel']);
    expect(setsIntersect(canonicalSet('sam'), canonicalSet('samantha'))).toBe(true);
    expect(setsIntersect(canonicalSet('samuel'), canonicalSet('samantha'))).toBe(false);
  });
});

describe('N4 address', () => {
  it('GN-19 street words, unit designator, ZIP+4, state name; equal to the abbreviated form', () => {
    const a1 = normAddress('1611 North Church Lane Ste 33C', '', 'Tulsa', 'Oklahoma', '74133-3517');
    const a2 = normAddress('1611 N Church Ln', '#33C', 'Tulsa', 'OK', '74133');
    expect([a1.value.number, a1.value.street, a1.value.unit, a1.value.state, a1.value.zip5]).toEqual(['1611', 'N CHURCH LN', '33C', 'OK', '74133']);
    expect(line1Key(a1.value)).toBe(line1Key(a2.value));
    expect(a1.value.unit).toBe(a2.value.unit);
    expect(a1.codes).toEqual([]);
    expect(a1.rule).toBe('N4');
  });
  it('GN-20 P.O. Box 0123 -> PO BOX 123', () => {
    const a = normAddress('P.O. Box 0123', '', 'Tulsa', 'OK', '74105');
    expect(a.value.pobox).toBe('123');
    expect(line1Key(a.value)).toBe('PO BOX 123');
  });
  it.each(['Apt 4B', '#4B', 'Unit 4B', 'Apartment 4B', 'APT 4B', 'Ste 4B'])('unit %s on line 1 -> 4B', (u) => {
    const a = normAddress(`12 Oak St ${u}`, '', '', '', '74105').value;
    expect([a.number, a.street, a.unit]).toEqual(['12', 'OAK ST', '4B']);
  });
  it('unit on line 2 as a whole; PO box on line 2', () => {
    expect(normAddress('12 Oak St', 'Apt 4-B', '', '', '74105').value.unit).toBe('4B');
    expect(normAddress('12 Oak St', 'POB 9', '', '', '74105').value.pobox).toBe('9');
  });
  it('ZIP_PADDED and STATE_INVALID are carried as codes', () => {
    expect(normAddress('12 Oak St', '', 'Newark', 'Narnia', '7102').codes).toEqual(['STATE_INVALID', 'ZIP_PADDED']);
  });
  it('a line with no number and no box is ADDRESS_UNPARSED', () => {
    expect(normAddress('Oak Street', '', '', '', '74105').codes).toEqual(['ADDRESS_UNPARSED']);
  });
});

describe('N9 encoding', () => {
  it('strips the BOM and records utf-8-sig', () => {
    const d = decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x5a, 0x6f, 0xc3, 0xab]));
    expect(d).toEqual({ text: 'Zoë', encoding: 'utf-8-sig', rule: 'N9' });
  });
  it('plain UTF-8 is utf-8', () => expect(decodeBytes(new Uint8Array([0x41])).encoding).toBe('utf-8'));
  it('falls back to cp1252 on a decode error', () => {
    const d = decodeBytes(new Uint8Array([0x5a, 0x6f, 0xeb, 0x20, 0x93, 0x78, 0x94]));
    expect(d).toEqual({ text: 'Zoë “x”', encoding: 'cp1252', rule: 'N9' });
  });
});
