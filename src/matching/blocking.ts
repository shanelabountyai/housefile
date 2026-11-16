// Brief §6 / D-18: blocking keys B1–B5. A pair is scored only when the two records share at least one key.
import { canonicalSet } from './nicknames';
import { soundex } from './similarity';
import { addressIsEmpty, line1Key, type MatchRecord } from './types';

export function blockingKeys(r: MatchRecord): Set<string> {
  const keys = new Set<string>();
  if (r.email) keys.add(`B1:${r.email}`);
  if (r.phone) keys.add(`B2:${r.phone}`);
  if (r.name.last && r.addr.zip5) keys.add(`B3:${soundex(r.name.last)}:${r.addr.zip5}`);
  if (r.addr.zip5 && !addressIsEmpty(r.addr)) keys.add(`B4:${line1Key(r.addr)}:${r.addr.zip5}`);
  if (r.name.first && r.name.last) {
    const first = r.name.first.split(' ')[0]!;
    for (const c of canonicalSet(first)) keys.add(`B5:${soundex(c)}:${soundex(r.name.last)}`);
  }
  return keys;
}
