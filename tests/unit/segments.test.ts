// Task 3.4 (D-16, D-27, D-69, D-74d, D-76): every reference segment's members equal tools/phase3_answers.py; the same
// definition and asOf give the same member-list hash; unknown fields and ops are refused with a code.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EffectiveConstituent, EffectiveGift, EffectiveState } from '@/commit/state';
import { evaluateSegment, validateSegment, type SegmentDefinition } from '@/segments/segment';
import { answers, phase3State } from '../helpers/phase3';

const state = phase3State();
const refs = readdirSync('segments/reference').sort();
const load = (f: string) => JSON.parse(readFileSync(`segments/reference/${f}`, 'utf8'));
const valid = (raw: unknown): SegmentDefinition => {
  const v = validateSegment(raw);
  if (!v.ok) throw new Error(`${v.code} ${v.detail}`);
  return v.def;
};
const person = (id: string, household = '', st = 'CO') => ({ id, firstName: 'A', lastName: 'B', city: 'X', state: st, zip: '', household }) as EffectiveConstituent;
const gift = (constituent: string, giftDate: string, amountCents: number) => ({ giftRef: `G${giftDate}${constituent}`, constituent, giftDate, amountCents }) as EffectiveGift;
const of = (constituents: EffectiveConstituent[], gifts: EffectiveGift[]): EffectiveState => ({ constituents, gifts, softCredits: [] });

describe('segments (task 3.4)', () => {
  it('the six reference segments equal the oracle, member for member', () => {
    expect(refs).toEqual(Object.keys(answers.segments).sort());
    expect(refs).toHaveLength(6);
    for (const f of refs) {
      const r = evaluateSegment(valid(load(f)), state, answers.asOf);
      expect({ f, members: r.members, count: r.count }).toEqual({ f, members: answers.segments[f].members, count: answers.segments[f].count });
    }
  });

  it('same definition and asOf → same member-list hash, in any input order; a different asOf can move it', () => {
    const def = valid(load('lybunt.json'));
    const a = evaluateSegment(def, state, answers.asOf);
    const shuffled = { ...state, constituents: [...state.constituents].reverse(), gifts: [...state.gifts].reverse() };
    expect(evaluateSegment(def, shuffled, answers.asOf)).toEqual(a);
    expect(a.memberListHash).toMatch(/^[0-9a-f]{64}$/);
    expect(evaluateSegment(def, state, '2027-01-01').memberListHash).not.toBe(a.memberListHash);
  });

  it('windows, LYBUNT/SYBUNT years and the missing-value rule', () => {
    const s = of([person('C1', 'H1'), person('C2', 'H1'), person('C3', 'H2'), person('C4')],
      [gift('C1', '2025-03-01', 60000), gift('C1', '2025-11-01', 50000), gift('C2', '2026-02-01', 100), gift('C3', '2023-05-05', 900), gift('C1', '2026-10-15', 1)]);
    const run = (filters: unknown[], asOf = '2026-10-14') => evaluateSegment(valid({ name: 't', filters }), s, asOf).members;
    expect(run([{ field: 'giftDate', op: 'between', value: ['2025-01-01', '2025-12-31'] }, { field: 'totalInWindow', op: 'gte', value: 110000 }])).toEqual(['C1']);
    expect(run([{ field: 'giftDate', op: 'between', value: ['2025-01-01', '2025-12-31'] }, { field: 'totalInWindow', op: 'gte', value: 110001 }])).toEqual([]);
    expect(run([{ field: 'lybunt', op: 'isTrue' }])).toEqual(['C1']); // C1's 2026-10-15 gift is after asOf
    expect(run([{ field: 'lybunt', op: 'isTrue' }], '2026-10-15')).toEqual([]);
    expect(run([{ field: 'giftDate', op: 'between', value: ['2026-01-01', '2026-12-31'] }, { field: 'lybunt', op: 'isTrue' }])).toEqual(['C1']); // years ignore the window
    expect(run([{ field: 'giftDate', op: 'between', value: ['2026-01-01', '2026-12-31'] }, { field: 'giftCount', op: 'gte', value: 1 }])).toEqual(['C2']); // window stops at asOf
    expect(run([{ field: 'sybunt', op: 'isTrue' }])).toEqual(['C3']);
    expect(run([{ field: 'lastGiftDate', op: 'lte', value: '2099-01-01' }])).toEqual(['C1', 'C2', 'C3']); // C4 has no gift: fails
    expect(run([{ field: 'giftCount', op: 'eq', value: 0 }])).toEqual(['C4']);
    expect(run([{ field: 'isHousehold', op: 'isTrue' }])).toEqual(['C1', 'C2']);
    expect(run([{ field: 'householdId', op: 'ne', value: 'H1' }, { field: 'state', op: 'in', value: ['CO', 'TX'] }])).toEqual(['C3', 'C4']);
  });

  it('refuses unknown fields and ops, wrong ops for a type, bad values and expressions, each with a code', () => {
    const code = (filters: unknown[], extra = {}) => { const v = validateSegment({ name: 'x', filters, ...extra }); return v.ok ? 'OK' : v.code; };
    expect(code([{ field: 'favouriteColour', op: 'eq', value: 'red' }])).toBe('UNKNOWN_FIELD');
    expect(code([{ field: 'toString', op: 'eq', value: 'x' }])).toBe('UNKNOWN_FIELD');
    expect(code([{ field: 'state', op: 'regex', value: '.*' }])).toBe('UNKNOWN_OP');
    expect(code([{ field: 'state', op: 'gte', value: 'A' }])).toBe('OP_NOT_ALLOWED');
    expect(code([{ field: 'giftDate', op: 'gte', value: '2025-01-01' }])).toBe('OP_NOT_ALLOWED');
    expect(code([{ field: 'totalInWindow', op: 'gte', value: 10.5 }])).toBe('BAD_VALUE');
    expect(code([{ field: 'totalInWindow', op: 'gte', value: '100' }])).toBe('BAD_VALUE');
    expect(code([{ field: 'lastGiftDate', op: 'lte', value: '10/14/2025' }])).toBe('BAD_VALUE');
    expect(code([{ field: 'giftDate', op: 'between', value: ['2026-01-01', '2025-01-01'] }])).toBe('BAD_VALUE');
    expect(code([{ field: 'state', op: 'in', value: [] }])).toBe('BAD_VALUE');
    expect(code([{ field: 'lybunt', op: 'isTrue', value: true }])).toBe('BAD_VALUE');
    expect(code([{ field: 'giftDate', op: 'between', value: ['2025-01-01', '2025-12-31'] }, { field: 'giftDate', op: 'between', value: ['2026-01-01', '2026-12-31'] }])).toBe('DUPLICATE_WINDOW');
    expect(code([{ field: 'state', op: 'eq', value: 'CO', expr: 'x || 1' }])).toBe('BAD_SHAPE');
    expect(code([], { where: 'state = CO' })).toBe('BAD_SHAPE');
    expect(validateSegment({ filters: [] })).toMatchObject({ ok: false, code: 'BAD_SHAPE' });
    for (const f of refs) expect(validateSegment(load(f)).ok).toBe(true);
  });
});
