// N1 / D-19: a raw first name maps to the *set* of canonical names it can stand for. Built from
// matching/nicknames.json (data, not code). A canonical maps to itself; an unknown name maps to itself.
import table from '../../matching/nicknames.json';

const NICKNAMES: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const m = new Map<string, Set<string>>();
  const add = (raw: string, canon: string) => {
    let s = m.get(raw);
    if (!s) m.set(raw, (s = new Set()));
    s.add(canon);
  };
  for (const [canon, nicks] of Object.entries(table.canonicals as Record<string, string[]>)) {
    add(canon, canon);
    for (const n of nicks) add(n, canon);
  }
  return m;
})();

/** The set of canonical names a folded first-name token can stand for (itself when unknown). */
export function canonicalSet(token: string): ReadonlySet<string> {
  return NICKNAMES.get(token) ?? new Set([token]);
}

export const setsIntersect = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
  for (const x of a) if (b.has(x)) return true;
  return false;
};
