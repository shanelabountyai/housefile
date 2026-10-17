// Shapes shared by normalization (src/import) and the matcher (src/matching). Plain data, no behaviour.

export type Name = {
  first: string; // folded raw first name (may hold a glued middle when the middle column was also set)
  middle: string; // folded middle name or initial
  last: string;
  suffix: '' | 'JR' | 'SR' | 'II' | 'III' | 'IV';
};

export type Address = {
  number: string; // "1611"
  street: string; // "N CHURCH LN" — direction and type abbreviated, uppercased
  unit: string; // "33C" — designator removed, hyphens removed, uppercased
  pobox: string; // "123" when the line is a PO box
  city: string;
  state: string;
  zip5: string;
};

export const emptyAddress = (): Address => ({ number: '', street: '', unit: '', pobox: '', city: '', state: '', zip5: '' });

export const line1Key = (a: Address): string => (a.pobox ? `PO BOX ${a.pobox}` : `${a.number} ${a.street}`.trim());
export const addressIsEmpty = (a: Address): boolean => !(a.number || a.pobox);

/** A normalized constituent (existing CRM record) or import row, as the matcher sees it. */
export type MatchRecord = {
  id: string;
  name: Name;
  email: string;
  phone: string;
  addr: Address;
  dob: string; // ISO or ""
};

export type Decision = 'MERGE' | 'REVIEW' | 'NEW';

export type Score = {
  total: number;
  reasons: string[]; // feature codes in firing order (brief §7)
  decision: Decision;
  flags: string[];
};
