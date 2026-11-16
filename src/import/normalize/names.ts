// N1: names. Written from brief §5 (N1) and §10 (GN-15, GN-16).
import { fold } from '../../lib/fold';
import type { Name } from '../../matching/types';

export const RULE = 'N1';

const SUFFIX_TABLE: Record<string, Name['suffix']> = {
  jr: 'JR',
  'jr.': 'JR',
  junior: 'JR',
  sr: 'SR',
  'sr.': 'SR',
  senior: 'SR',
  ii: 'II',
  iii: 'III',
  iv: 'IV',
};
const isSuffix = (t: string): boolean => Object.hasOwn(SUFFIX_TABLE, t);
const suffixOf = (t: string): Name['suffix'] | undefined => (Object.hasOwn(SUFFIX_TABLE, t) ? SUFFIX_TABLE[t] : undefined);

/** Fold, keep letters/apostrophe/space/hyphen, then drop apostrophes and turn hyphens into spaces. */
export function nameToken(s: string | null | undefined): string {
  let t = fold(s).replace(/[^a-z' -]/g, '');
  t = t.replaceAll("'", '').replaceAll('-', ' ');
  return t.trim();
}

export type NameInput = { first?: string | null; last?: string | null; middle?: string | null; suffix?: string | null; full?: string | null };

/**
 * Accepts split columns or one full-name column: "Last, First M. Suffix" or "First M. Last Suffix".
 * A suffix may sit in its own column, at the end of the last name, or anywhere in a full name.
 * A second token in the first-name column is a middle name when no middle column was given.
 */
export function parseName(input: NameInput): Name {
  let first = input.first ?? '';
  let last = input.last ?? '';
  let middle = input.middle ?? '';
  let suffix = input.suffix ?? '';
  const fullRaw = input.full ?? '';

  if (fullRaw && !(first || last)) {
    const full = fold(fullRaw).replaceAll('.', '');
    let toks: string[];
    if (full.includes(',')) {
      const i = full.indexOf(',');
      last = full.slice(0, i);
      toks = full.slice(i + 1).split(/\s+/).filter(Boolean);
    } else {
      toks = full.split(/\s+/).filter(Boolean);
      last = '';
    }
    const rest: string[] = [];
    for (const t of toks) {
      if (isSuffix(t) && !suffix) suffix = t;
      else rest.push(t);
    }
    if (last) {
      let lt = last.split(/\s+/).filter(Boolean);
      const tail = lt[lt.length - 1];
      if (tail !== undefined && isSuffix(tail) && !suffix) {
        suffix = tail;
        lt = lt.slice(0, -1);
      }
      last = lt.join(' ');
      first = rest[0] ?? '';
      middle = rest.slice(1).join(' ');
    } else if (rest.length >= 2) {
      first = rest[0]!;
      last = rest[rest.length - 1]!;
      middle = rest.slice(1, -1).join(' ');
    } else if (rest.length === 1) {
      first = rest[0]!;
    }
  }

  let f = nameToken(first);
  const ft = f.split(' ');
  if (ft.length > 1 && !middle) {
    middle = ft.slice(1).join(' ');
    f = ft[0]!;
  }
  let l = nameToken(last);
  const lt = l.split(' ');
  const ltail = lt[lt.length - 1]!;
  if (isSuffix(ltail) && !suffix) {
    suffix = ltail;
    l = lt.slice(0, -1).join(' ');
  }
  const m = nameToken(middle);
  const sKey = fold(suffix).replaceAll('.', '').replaceAll(' ', '');
  const sfx: Name['suffix'] = suffixOf(sKey) ?? suffixOf(fold(suffix)) ?? '';
  return { first: f, middle: m, last: l, suffix: sfx };
}

/** The canonical-set lookup key: the first token of the folded first name. */
export const firstToken = (n: Name): string => (n.first ? n.first.split(' ')[0]! : '');
