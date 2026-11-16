// N4: addresses. Written from brief §5 (N4) and §10 (GN-19, GN-20).
import { fold } from '../../lib/fold';
import { addressIsEmpty, emptyAddress, type Address } from '../../matching/types';
import { normState, normZip } from './contact';

export const RULE = 'N4';

const STREET_TYPES: Record<string, string> = {
  street: 'ST', st: 'ST', str: 'ST', avenue: 'AVE', ave: 'AVE', av: 'AVE', road: 'RD', rd: 'RD', drive: 'DR', dr: 'DR',
  lane: 'LN', ln: 'LN', court: 'CT', ct: 'CT', boulevard: 'BLVD', blvd: 'BLVD', place: 'PL', pl: 'PL', circle: 'CIR',
  cir: 'CIR', way: 'WAY', terrace: 'TER', ter: 'TER', parkway: 'PKWY', pkwy: 'PKWY', trail: 'TRL', trl: 'TRL',
  highway: 'HWY', hwy: 'HWY',
};
const DIRECTIONS: Record<string, string> = {
  north: 'N', n: 'N', south: 'S', s: 'S', east: 'E', e: 'E', west: 'W', w: 'W', northeast: 'NE', ne: 'NE',
  northwest: 'NW', nw: 'NW', southeast: 'SE', se: 'SE', southwest: 'SW', sw: 'SW',
};

// A trailing unit designator on line 1 (or line 2 as a whole, with a leading space prepended by the caller).
const UNIT_RE = /(?:^|\s)(?:#|apt\.?|apartment|unit|ste\.?|suite|no\.?|rm|room|fl|floor)\s*#?\s*([a-z0-9-]+)\s*$/;
const POBOX_RE = /^(?:p\.?\s*o\.?\s*box|post office box|pob)\s*#?\s*(\d+)/;

export type AddressCode = 'STATE_INVALID' | 'ZIP_MISSING' | 'ZIP_PADDED' | 'ZIP_INVALID' | 'ADDRESS_UNPARSED';
export type NormalizedAddress = { value: Address; codes: AddressCode[]; rule: string };

const squash = (s: string) => fold(s).replaceAll(',', ' ').replace(/\s+/g, ' ').trim();

/** USPS-style abbreviation, unit split, PO box detection, city uppercased, state (N8) and ZIP (N5) attached. */
export function normAddress(line1: string | null | undefined, line2?: string | null, city?: string | null, state?: string | null, zip?: string | null): NormalizedAddress {
  const codes: AddressCode[] = [];
  const a = emptyAddress();
  let l1 = squash(line1 ?? '');
  const l2 = squash(line2 ?? '');
  const pm = POBOX_RE.exec(l1) ?? POBOX_RE.exec(l2);
  if (pm) a.pobox = pm[1]!.replace(/^0+(?=\d)/, '');

  let unit = '';
  if (l2 && !POBOX_RE.test(l2)) {
    const um = UNIT_RE.exec(' ' + l2);
    unit = um ? um[1]! : l2.replace(/[^a-z0-9-]/g, '');
  }
  if (!unit) {
    const um = UNIT_RE.exec(l1);
    if (um) {
      unit = um[1]!;
      l1 = l1.slice(0, um.index).trim();
    }
  }
  a.unit = unit.replaceAll('-', '').toUpperCase();

  if (!a.pobox) {
    let toks = l1.replace(/[.#]/g, ' ').split(/\s+/).filter(Boolean);
    const head = toks[0];
    if (head !== undefined && /^\d+[a-z]?$/.test(head)) {
      a.number = head.toUpperCase();
      toks = toks.slice(1);
    }
    a.street = toks
      .map((t) => (Object.hasOwn(DIRECTIONS, t) ? DIRECTIONS[t]! : Object.hasOwn(STREET_TYPES, t) ? STREET_TYPES[t]! : t.toUpperCase()))
      .join(' ');
  }
  a.city = fold(city).toUpperCase();
  const st = normState(state);
  a.state = st.value;
  if (st.code && st.code !== 'STATE_MISSING') codes.push(st.code);
  const z = normZip(zip);
  a.zip5 = z.value;
  if (z.code) codes.push(z.code);
  if ((line1 ?? '').trim() && addressIsEmpty(a)) codes.push('ADDRESS_UNPARSED');
  return { value: a, codes, rule: RULE };
}
