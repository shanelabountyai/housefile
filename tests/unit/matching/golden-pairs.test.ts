import { describe, expect, it } from 'vitest';
import { normAddress, normEmail, normPhone, parseName } from '@/import/normalize';
import { scorePair, type MatchRecord } from '@/matching';

// Brief §9 golden pairs GA-01..GA-20, copied verbatim: exact points, reasons in order, flags. The expected
// values are the brief's hand derivations as confirmed by tools/golden_answers.py; never edit them to pass.
// A symmetry check swaps the arguments on every pair (D-17: symmetric in argument order).

type R = { first?: string; last?: string; middle?: string; suffix?: string; email?: string; phone?: string; line1?: string; line2?: string; zip?: string; dob?: string };
const rec = (id: string, r: R): MatchRecord => ({
  id,
  name: parseName({ first: r.first, last: r.last, middle: r.middle, suffix: r.suffix }),
  email: normEmail(r.email).value,
  phone: normPhone(r.phone).value,
  addr: normAddress(r.line1, r.line2, '', '', r.zip).value,
  dob: r.dob ?? '',
});

const GA: [string, string, MatchRecord, MatchRecord, number, string, string, string][] = [
  ['GA-01', 'Exact duplicate, clean',
    rec('a', { first: 'Robert', last: 'Johnson', email: 'robert.johnson@example.com', phone: '918-555-0142', line1: '12 Oak St', zip: '74105' }),
    rec('b', { first: 'Robert', last: 'Johnson', email: 'Robert.Johnson@example.com', phone: '(918) 555-0142', line1: '12 Oak Street', zip: '74105' }),
    120, 'MERGE', 'EMAIL_EXACT+PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+ADDRESS_EXACT', ''],
  ['GA-02', 'Nickname + address, no identifiers',
    rec('a', { first: 'Bob', last: 'Johnson', line1: '12 Oak Street', zip: '74105' }),
    rec('b', { first: 'Robert', last: 'Johnson', line1: '12 Oak St', zip: '74105' }),
    50, 'REVIEW', 'FIRST_NICKNAME+SURNAME_EXACT+ADDRESS_EXACT', ''],
  ['GA-03', 'Nickname + address + phone',
    rec('a', { first: 'Bob', last: 'Johnson', phone: '9185550142', line1: '12 Oak Street', zip: '74105' }),
    rec('b', { first: 'Robert', last: 'Johnson', phone: '(918) 555-0142', line1: '12 Oak St', zip: '74105' }),
    75, 'MERGE', 'PHONE_EXACT+FIRST_NICKNAME+SURNAME_EXACT+ADDRESS_EXACT', ''],
  ['GA-04', 'Email + name, moved (different ZIP)',
    rec('a', { first: 'Robert', last: 'Johnson', email: 'robert.johnson@example.com', line1: '900 Elm Dr', zip: '80202' }),
    rec('b', { first: 'Robert', last: 'Johnson', email: 'robert.johnson@example.com', line1: '12 Oak St', zip: '74105' }),
    75, 'MERGE', 'EMAIL_EXACT+FIRST_EXACT+SURNAME_EXACT', ''],
  ['GA-05', 'Surname change, same address, same email (O-3)',
    rec('a', { first: 'Mary', last: 'Jones', email: 'mary.j@example.com', line1: '12 Oak St', zip: '74105' }),
    rec('b', { first: 'Mary', last: 'Smith', email: 'mary.j@example.com', line1: '12 Oak St', zip: '74105' }),
    70, 'MERGE', 'EMAIL_EXACT+FIRST_EXACT+SURNAME_DIFF+ADDRESS_EXACT', ''],
  ['GA-06', 'Shared family email: spouse, same surname and address',
    rec('a', { first: 'John', last: 'Smith', email: 'smithfamily@example.com', line1: '12 Oak St', zip: '74105' }),
    rec('b', { first: 'Mary', last: 'Smith', email: 'smithfamily@example.com', line1: '12 Oak St', zip: '74105' }),
    55, 'REVIEW', 'EMAIL_EXACT+FIRST_DIFF+SURNAME_EXACT+ADDRESS_EXACT', ''],
  ['GA-07', 'Shared email, nothing else in common',
    rec('a', { first: 'Tom', last: 'Nguyen', email: 'family@example.com' }),
    rec('b', { first: 'Linda', last: 'Park', email: 'family@example.com' }),
    10, 'REVIEW', 'EMAIL_EXACT+FIRST_DIFF+SURNAME_DIFF', 'IDENTIFIER_FLOOR'],
  ['GA-08', 'TRAP Jr/Sr, both suffixes present, same address, shared phone',
    rec('a', { first: 'William', last: "O'Brien", suffix: 'Sr', phone: '405-555-0414', line1: '3101 S Oak Ln', line2: 'Apt 24', zip: '73013' }),
    rec('b', { first: 'William', last: "O'Brien", suffix: 'Jr.', phone: '405-555-0414', line1: '3101 South Oak Lane #24', zip: '73013' }),
    35, 'NEW', 'PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+SUFFIX_CONFLICT+ADDRESS_EXACT', 'HARD_BLOCK_SUFFIX;HOUSEHOLD_CANDIDATE'],
  ['GA-09', 'TRAP Jr/Sr, suffix dropped on the import side',
    rec('a', { first: 'William', last: "O'Brien", phone: '405-555-0414', line1: '3101 S Oak Ln', line2: 'Apt 24', zip: '73013' }),
    rec('b', { first: 'William', last: "O'Brien", suffix: 'Jr', phone: '405-555-0414', line1: '3101 S Oak Ln Apt 24', zip: '73013' }),
    65, 'REVIEW', 'PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+SUFFIX_ONE_SIDED+ADDRESS_EXACT', ''],
  ['GA-10', 'TRAP two different Maria Garcias, same ZIP, different middle initial',
    rec('a', { first: 'Maria', last: 'Garcia', middle: 'A', email: 'maria.a.garcia@example.com', line1: '44 Peoria Ave', zip: '74105' }),
    rec('b', { first: 'Maria', last: 'Garcia', middle: 'L', email: 'mgarcia77@example.org', line1: '910 Lewis Ct', zip: '74105' }),
    18, 'NEW', 'FIRST_EXACT+SURNAME_EXACT+MIDDLE_CONFLICT+ZIP_EXACT', ''],
  ['GA-11', 'Transposed first/last + email',
    rec('a', { first: 'Flores', last: 'Hiroshi', email: 'hiroshi.flores@example.com' }),
    rec('b', { first: 'Hiroshi', last: 'Flores', email: 'hiroshi.flores@example.com' }),
    70, 'MERGE', 'EMAIL_EXACT+NAME_TRANSPOSED', ''],
  ['GA-12', 'Transposed first/last + address only',
    rec('a', { first: 'Flores', last: 'Hiroshi', line1: '8633 W Oak Ct', zip: '73003' }),
    rec('b', { first: 'Hiroshi', last: 'Flores', line1: '8633 West Oak Court', zip: '73003' }),
    45, 'REVIEW', 'NAME_TRANSPOSED+ADDRESS_EXACT', ''],
  ['GA-13', 'Initial only + phone + surname + address',
    rec('a', { first: 'M.', last: 'Garcia', phone: '918 555 0190', line1: '44 Peoria Ave', zip: '74105' }),
    rec('b', { first: 'Maria', last: 'Garcia', phone: '9185550190', line1: '44 Peoria Ave', zip: '74105' }),
    65, 'REVIEW', 'PHONE_EXACT+FIRST_INITIAL+SURNAME_EXACT+ADDRESS_EXACT', ''],
  ['GA-14', 'Household member: different first name, same surname and address, no identifiers',
    rec('a', { first: 'Emily', last: 'Baker', line1: '5544 Hillcrest Pl', line2: '#23A', zip: '80210' }),
    rec('b', { first: 'Barbara', last: 'Baker', line1: '5544 Hillcrest Pl #23A', zip: '80210' }),
    10, 'NEW', 'FIRST_DIFF+SURNAME_EXACT+ADDRESS_EXACT', 'HOUSEHOLD_CANDIDATE'],
  ['GA-15', 'One-letter typo in first name + email',
    rec('a', { first: 'Jon', last: 'Smith', email: 'john.smith@example.com' }),
    rec('b', { first: 'John', last: 'Smith', email: 'john.smith@example.com' }),
    70, 'MERGE', 'EMAIL_EXACT+FIRST_CLOSE+SURNAME_EXACT', ''],
  ['GA-16', 'Strong match but DOB conflicts',
    rec('a', { first: 'Robert', last: 'Johnson', phone: '9185550142', line1: '12 Oak St', zip: '74105', dob: '1961-03-09' }),
    rec('b', { first: 'Robert', last: 'Johnson', phone: '9185550142', line1: '12 Oak St', zip: '74105', dob: '1961-09-03' }),
    45, 'REVIEW', 'PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+ADDRESS_EXACT+DOB_DIFF', ''],
  ['GA-17', 'Surname change, same address, no email (name-change floor)',
    rec('a', { first: 'Mary', last: 'Jones', line1: '12 Oak St', zip: '74105' }),
    rec('b', { first: 'Mary', last: 'Smith', line1: '12 Oak St', zip: '74105' }),
    25, 'REVIEW', 'FIRST_EXACT+SURNAME_DIFF+ADDRESS_EXACT', 'NAME_CHANGE_CANDIDATE'],
  ['GA-18', 'Same name, same building, different unit, nothing else',
    rec('a', { first: 'David', last: 'Nguyen', line1: '9382 Market Blvd', line2: 'Apt 3', zip: '78704' }),
    rec('b', { first: 'David', last: 'Nguyen', line1: '9382 Market Blvd', line2: 'Apt 11', zip: '78704' }),
    45, 'REVIEW', 'FIRST_EXACT+SURNAME_EXACT+ADDRESS_SAME_BUILDING', ''],
  ['GA-19', 'TRAP spouses sharing email, phone, surname and address',
    rec('a', { first: 'John', last: 'Smith', email: 'smiths@example.com', phone: '9185550142', line1: '12 Oak St', zip: '74105' }),
    rec('b', { first: 'Mary', last: 'Smith', email: 'smiths@example.com', phone: '(918) 555-0142', line1: '12 Oak Street', zip: '74105' }),
    80, 'REVIEW', 'EMAIL_EXACT+PHONE_EXACT+FIRST_DIFF+SURNAME_EXACT+ADDRESS_EXACT', 'FIRST_NAME_CONFLICT_CAP'],
  ['GA-20', 'TRAP everything agrees but the birth date',
    rec('a', { first: 'James', last: 'Perez', email: 'jperez@example.com', phone: '5085550116', line1: '2353 Elm St', zip: '73003', dob: '1952-02-16' }),
    rec('b', { first: 'James', last: 'Perez', email: 'jperez@example.com', phone: '508-555-0116', line1: '2353 Elm St', zip: '73003', dob: '1981-04-24' }),
    90, 'REVIEW', 'EMAIL_EXACT+PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+ADDRESS_EXACT+DOB_DIFF', 'DOB_CONFLICT_CAP'],
];

describe('golden pairs GA-01..GA-20 (brief §9)', () => {
  for (const [id, desc, a, b, pts, decision, reasons, flags] of GA) {
    it(`${id} ${desc}: ${pts} ${decision} ${reasons}${flags ? ` [${flags}]` : ''}`, () => {
      const s = scorePair(a, b);
      expect([s.total, s.decision, s.reasons.join('+'), s.flags.join(';')]).toEqual([pts, decision, reasons, flags]);
    });
    it(`${id} is symmetric: swapping the arguments gives the same points, decision and flags`, () => {
      const s = scorePair(a, b);
      const r = scorePair(b, a);
      expect([r.total, r.decision, r.flags]).toEqual([s.total, s.decision, s.flags]);
      expect([...r.reasons].sort()).toEqual([...s.reasons].sort());
    });
  }
});
