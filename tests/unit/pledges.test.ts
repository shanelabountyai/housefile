// Task 3.6 (D-9, D-71): a pledge's balance is total − Σ its active payments dated on or before asOf, derived, never
// stored. Same function on the fixture in memory and on the database; here against answers.json (tools/phase3_answers.py).
import { describe, expect, it } from 'vitest';
import { effectiveStateHash, fixtureState } from '@/commit/state';
import { pledgeBalances } from '@/derive/pledges';
import { answers, phase3State } from '../helpers/phase3';

describe('pledge balances (task 3.6)', () => {
  it('every balance equals the oracle', () => {
    expect(pledgeBalances(phase3State(), answers.asOf)).toEqual(answers.pledges);
  });

  it('voiding a payment raises its pledge balance by exactly its cents', () => {
    const s = phase3State();
    const pay = s.gifts.find((g) => g.pledgeRef === 'PL001')!;
    const after = pledgeBalances({ ...s, gifts: s.gifts.filter((g) => g !== pay) }, answers.asOf);
    expect(after.PL001!.balanceCents - answers.pledges.PL001.balanceCents).toBe(pay.amountCents);
    expect(after.PL001!.payments).toBe(answers.pledges.PL001.payments - 1);
  });

  it('a payment dated after asOf does not count yet', () => {
    const s = phase3State();
    const pay = s.gifts.find((g) => g.pledgeRef === 'PL001')!;
    const late = { ...s, gifts: s.gifts.map((g) => (g === pay ? { ...g, giftDate: '2099-01-01' } : g)) };
    expect(pledgeBalances(late, answers.asOf).PL001!.balanceCents).toBe(pay.amountCents);
  });

  it('a state with no pledges hashes as before (D-71: the Phase 1 seed hash does not move)', () => {
    const s = fixtureState([], []);
    expect(effectiveStateHash({ ...s, pledges: [] })).toBe(effectiveStateHash(s));
  });
});
