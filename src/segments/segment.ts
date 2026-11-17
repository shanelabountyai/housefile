// Segments as data (D-16, D-27, D-69, D-74d, D-76, task 3.4): a definition is a closed vocabulary from
// segments/schema.json, validated at save, and evaluated by a pure function over the effective state and an explicit
// asOf, so the same definition and asOf always give the same members and the same member-list hash. No clock, no
// database (`npm run model:lint` greps this tree). The oracle is tools/phase3_answers.py `evaluate`.
import schemaJson from '../../segments/schema.json';
import type { EffectiveState } from '../commit/state';
import { sha256Hex } from '../lib/canonical';

type Kind = 'scalar' | 'list' | 'pair' | 'none';
type FieldType = 'string' | 'date' | 'integer' | 'boolean' | 'window';
const OPS = schemaJson.ops as Record<string, Kind>;
const TYPES = schemaJson.types as Record<FieldType, string[]>;
const FIELDS = schemaJson.fields as Record<string, FieldType>;

export type Scalar = string | number;
export type Filter = { field: string; op: string; value?: Scalar | Scalar[] };
export type SegmentDefinition = { name: string; description: string; filters: Filter[] };
export type SegmentRefusal = 'BAD_SHAPE' | 'UNKNOWN_FIELD' | 'UNKNOWN_OP' | 'OP_NOT_ALLOWED' | 'BAD_VALUE' | 'DUPLICATE_WINDOW';
export type Validation = { ok: true; def: SegmentDefinition } | { ok: false; code: SegmentRefusal; detail: string };
export type SegmentResult = { asOf: string; members: string[]; count: number; definitionHash: string; memberListHash: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const okScalar = (t: FieldType, v: unknown) => (t === 'string' ? typeof v === 'string' : t === 'integer' ? Number.isSafeInteger(v) : typeof v === 'string' && ISO.test(v));

/** The definition reduced to its known keys, or the first refusal with a code (unknown fields and ops never save). */
export function validateSegment(raw: unknown): Validation {
  const no = (code: SegmentRefusal, detail: string): Validation => ({ ok: false, code, detail });
  if (!isObj(raw) || typeof raw.name !== 'string' || !raw.name.trim() || !Array.isArray(raw.filters)) return no('BAD_SHAPE', 'need { name, filters: [] }');
  if (raw.description !== undefined && typeof raw.description !== 'string') return no('BAD_SHAPE', 'description must be text');
  const extra = Object.keys(raw).filter((k) => !['name', 'description', 'filters'].includes(k));
  if (extra.length) return no('BAD_SHAPE', `unknown key ${extra[0]}`);
  const filters: Filter[] = [];
  for (const [i, f] of raw.filters.entries()) {
    const at = `filters[${i}]`;
    if (!isObj(f) || Object.keys(f).some((k) => !['field', 'op', 'value'].includes(k))) return no('BAD_SHAPE', `${at}: need { field, op, value }`);
    const type = FIELDS[f.field as string];
    if (typeof f.field !== 'string' || !Object.hasOwn(FIELDS, f.field) || !type) return no('UNKNOWN_FIELD', `${at}: ${String(f.field)}`);
    const kind = OPS[f.op as string];
    if (typeof f.op !== 'string' || !Object.hasOwn(OPS, f.op) || !kind) return no('UNKNOWN_OP', `${at}: ${String(f.op)}`);
    if (!TYPES[type].includes(f.op)) return no('OP_NOT_ALLOWED', `${at}: ${f.field} (${type}) takes ${TYPES[type].join(', ')}`);
    const v = f.value;
    const scalarType = type === 'window' ? 'date' : type;
    const good =
      kind === 'none' ? v === undefined
      : kind === 'scalar' ? okScalar(scalarType, v)
      : kind === 'list' ? Array.isArray(v) && v.length > 0 && v.every((x) => okScalar(scalarType, x))
      : Array.isArray(v) && v.length === 2 && v.every((x) => okScalar(scalarType, x)) && v[0] <= v[1];
    if (!good) return no('BAD_VALUE', `${at}: ${f.field} ${f.op} ${JSON.stringify(v)}`);
    if (type === 'window' && filters.some((x) => x.field === f.field)) return no('DUPLICATE_WINDOW', `${at}: one giftDate window per segment`);
    filters.push(v === undefined ? { field: f.field, op: f.op } : { field: f.field, op: f.op, value: v as Scalar | Scalar[] });
  }
  return { ok: true, def: { name: raw.name.trim(), description: typeof raw.description === 'string' ? raw.description : '', filters } };
}

export const definitionHash = (def: SegmentDefinition) => sha256Hex(def);

function test(v: Scalar | boolean | null, f: Filter): boolean {
  if (v === null) return false; // a missing value (no gift in the window) fails every comparison (D-74d)
  const want = f.value;
  switch (f.op) {
    case 'eq': return v === want;
    case 'ne': return v !== want;
    case 'in': return (want as Scalar[]).includes(v as Scalar);
    case 'gte': return v >= (want as Scalar);
    case 'lte': return v <= (want as Scalar);
    case 'between': return (want as Scalar[])[0]! <= v && v <= (want as Scalar[])[1]!;
    case 'isTrue': return v === true;
    default: throw new Error(`segment: op ${f.op}`); // unreachable after validateSegment
  }
}

/** Members (constituent business ids, ascending) of a validated definition at asOf, with the run's hashes. */
export function evaluateSegment(def: SegmentDefinition, state: EffectiveState, asOf: string): SegmentResult {
  const year = Number(asOf.slice(0, 4));
  const w = def.filters.find((f) => FIELDS[f.field] === 'window')?.value as [string, string] | undefined;
  const [from, to] = w ?? ['0000-00-00', asOf]; // gifts after asOf are dropped below, so a window never reaches past it
  const giftsBy = new Map<string, { date: string; cents: number }[]>();
  for (const g of state.gifts) if (g.giftDate <= asOf) giftsBy.set(g.constituent, [...(giftsBy.get(g.constituent) ?? []), { date: g.giftDate, cents: g.amountCents }]);
  const hhSize = new Map<string, number>();
  for (const c of state.constituents) if (c.household) hhSize.set(c.household, (hhSize.get(c.household) ?? 0) + 1);
  const filters = def.filters.filter((f) => FIELDS[f.field] !== 'window');

  const members = [...state.constituents]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((c) => {
      const all = giftsBy.get(c.id) ?? [];
      const win = all.filter((g) => from <= g.date && g.date <= to);
      const years = new Set(all.map((g) => Number(g.date.slice(0, 4))));
      const vals: Record<string, Scalar | boolean | null> = {
        firstName: c.firstName, lastName: c.lastName, city: c.city, state: c.state, zip: c.zip, householdId: c.household,
        totalInWindow: win.reduce((s, g) => s + g.cents, 0),
        giftCount: win.length,
        lastGiftDate: win.reduce<string | null>((m, g) => (m === null || g.date > m ? g.date : m), null),
        lybunt: years.has(year - 1) && !years.has(year),
        sybunt: [...years].some((y) => y < year - 1) && !years.has(year - 1) && !years.has(year),
        isHousehold: (hhSize.get(c.household) ?? 0) >= 2,
      };
      return filters.every((f) => test(vals[f.field]!, f));
    })
    .map((c) => c.id);
  return { asOf, members, count: members.length, definitionHash: definitionHash(def), memberListHash: sha256Hex(members) };
}
