// Task 3.2 (D-8, D-74e): household names and giving equal tools/phase3_answers.py for every H… id.
import { describe, expect, it } from 'vitest';
import type { EffectiveConstituent } from '@/commit/state';
import { householdGiving, householdMembers, householdName } from '@/derive/households';
import { answers, phase3State } from '../helpers/phase3';

const state = phase3State();
const person = (id: string, firstName: string, lastName: string) => ({ id, firstName, lastName }) as EffectiveConstituent;

describe('households (task 3.2)', () => {
  it('every household name, member list and total equals the oracle', () => {
    const got = Object.fromEntries(
      [...new Set(state.constituents.map((c) => c.household))].sort().map((h) => {
        const ms = householdMembers(state, h);
        return [h, { givingCents: householdGiving(state, h), members: ms.map((m) => m.id), name: householdName(ms) }];
      }),
    );
    expect(got).toEqual(answers.households);
    expect(got.H0001).toEqual({ givingCents: 675000, members: ['C0001', 'C0002'], name: 'Zoë Rivera and Victoria Whitfield' });
  });

  it('surnames compare after N1 folding, print the first member stored, order by business id', () => {
    expect(householdName([person('C2', 'Ana', 'GARCÍA-LOPEZ'), person('C1', 'Luis', "Garcia Lopez")])).toBe('The Garcia Lopez Household');
    expect(householdName([person('C3', 'C', 'Z'), person('C1', 'A', 'X'), person('C2', 'B', 'Y')])).toBe('A X, B Y and C Z');
    expect(householdName([person('C1', 'maria', 'garcia')])).toBe('The garcia Household'); // folded file-B names print as stored
    expect(householdName([])).toBe('');
  });

  it('a window bounds the total inclusively; no household is 0', () => {
    const all = householdGiving(state, 'H0001');
    const dates = state.gifts.filter((g) => ['C0001', 'C0002'].includes(g.constituent)).map((g) => g.giftDate).sort();
    expect(householdGiving(state, 'H0001', { from: dates[0]!, to: dates.at(-1)! })).toBe(all);
    expect(householdGiving(state, 'H0001', { from: '1900-01-01', to: '1900-12-31' })).toBe(0);
    expect(householdGiving(state, '')).toBe(0);
  });
});
