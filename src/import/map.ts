// Stage 2, Map (brief §4): which column is which field. Synonyms come from import/synonyms.json (D-16);
// a proposed map can be confirmed or overridden by a JSON map file {field: header}. Unmapped columns are
// kept as `extras`. A map that leaves amount, gift_date, or both name forms unmapped is refused.
import synonyms from '../../import/synonyms.json';

export const FIELDS = [
  'first', 'last', 'middle', 'suffix', 'full', 'email', 'phone', 'line1', 'line2', 'city', 'state', 'zip', 'dob',
  'gift_date', 'amount', 'fund', 'external_ref',
] as const;
export type Field = (typeof FIELDS)[number];
export type ColumnMap = Partial<Record<Field, string>>;

export type MapProposal = {
  map: ColumnMap;
  extras: string[]; // headers no field claimed, in file order
  conflicts: { header: string; field: Field; keptHeader: string }[]; // a second header for an already-claimed field
};

/** Case-insensitive, punctuation as spaces, whitespace collapsed: "Phone #" and "phone" agree, "Apt/Unit" and "apt unit" agree. */
export const headerKey = (h: string): string =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SYNONYM_TO_FIELD: ReadonlyMap<string, Field> = (() => {
  const m = new Map<string, Field>();
  for (const f of FIELDS) for (const s of (synonyms.fields as Record<string, string[]>)[f] ?? []) m.set(headerKey(s), f);
  return m;
})();

export function proposeMap(headers: string[]): MapProposal {
  const map: ColumnMap = {};
  const extras: string[] = [];
  const conflicts: MapProposal['conflicts'] = [];
  for (const h of headers) {
    const f = SYNONYM_TO_FIELD.get(headerKey(h));
    if (!f) {
      extras.push(h);
      continue;
    }
    const kept = map[f];
    if (kept !== undefined) {
      conflicts.push({ header: h, field: f, keptHeader: kept });
      extras.push(h);
      continue;
    }
    map[f] = h;
  }
  return { map, extras, conflicts };
}

export class MapRefused extends Error {
  constructor(readonly missing: string[]) {
    super(`column map refused: missing ${missing.join(', ')}`);
  }
}

/** The checks the pipeline needs before a row can be validated. Returns the refusal reasons, empty when OK. */
export function mapProblems(map: ColumnMap, headers: string[]): string[] {
  const out: string[] = [];
  for (const [f, h] of Object.entries(map) as [Field, string][]) {
    if (!(FIELDS as readonly string[]).includes(f)) out.push(`unknown field ${f}`);
    else if (!headers.includes(h)) out.push(`${f}: header "${h}" is not in the file`);
  }
  if (!map.amount) out.push('amount unmapped');
  if (!map.gift_date) out.push('gift_date unmapped');
  if (!map.full && !(map.first && map.last)) out.push('name unmapped (needs full, or first and last)');
  return out;
}

/** Confirm the proposal, or override it with a map file. Throws MapRefused when a required field is missing. */
export function resolveMap(headers: string[], override?: ColumnMap): { map: ColumnMap; extras: string[]; proposal: MapProposal } {
  const proposal = proposeMap(headers);
  const map = override ?? proposal.map;
  const problems = mapProblems(map, headers);
  if (problems.length) throw new MapRefused(problems);
  const used = new Set(Object.values(map));
  const extras = headers.filter((h) => !used.has(h));
  return { map, extras, proposal };
}
