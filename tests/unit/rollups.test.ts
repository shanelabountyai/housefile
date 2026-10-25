// Task 3.3 (D-28, D-70, D-75): campaign and fund roll-ups equal tools/phase3_answers.py to the cent.
import { describe, expect, it } from 'vitest';
import type { EffectiveGift, EffectiveState } from '@/commit/state';
import { NO_APPEAL, rollups, type Rollup } from '@/derive/rollups';
import { answers, phase3CampaignOf, phase3State } from '../helpers/phase3';

const state = phase3State();
const campaignOf = phase3CampaignOf();
const flat = (rows: Record<string, Rollup>) => Object.fromEntries(Object.entries(rows).map(([k, { appeals: _, ...s }]) => [k, s]));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const gift = (giftRef: string, constituent: string, amountCents: number, fund: string, appeal: string, giftDate = '2026-01-01') =>
  ({ giftRef, constituent, amountCents, fund, appeal, giftDate, giftType: 'GIFT', externalRef: '' }) as EffectiveGift;
const of = (gifts: EffectiveGift[], softCredits: EffectiveState['softCredits'] = []): EffectiveState => ({ constituents: [], gifts, softCredits });

describe('rollups (task 3.3)', () => {
  const r = rollups(state, answers.asOf, campaignOf);

  it('campaigns → appeals, funds and the total equal the oracle', () => {
    expect(r.campaigns).toEqual(answers.campaigns);
    expect(flat(r.funds)).toEqual(answers.funds);
    expect(r.total).toEqual(answers.total);
    expect(r.total).toEqual({ raised: 37572500, gifts: 929, donors: 255, average: 40444, remainder: 24 });
  });

  it('Σ every row ties to Σ active amountCents; corrections and voids are in, after-asOf is out', () => {
    const active = sum(state.gifts.map((g) => g.amountCents));
    expect(r.total.raised).toBe(active);
    expect(sum(Object.values(r.campaigns).map((c) => c.raised))).toBe(active);
    expect(sum(Object.values(r.funds).flatMap((f) => Object.values(f.appeals).map((a) => a.raised)))).toBe(active);
    for (const row of [...Object.values(r.campaigns), ...Object.values(r.funds)]) {
      expect(sum(Object.values(row.appeals).map((a) => a.raised))).toBe(row.raised);
      expect(row.average * row.gifts + row.remainder).toBe(row.raised);
    }
  });

  it('(no appeal) rolls up under its fund and in no campaign; soft credits never count', () => {
    const s = of([gift('G1', 'C1', 10000, 'GEN', 'Gala 2025'), gift('G2', 'C2', 333, 'GEN', ''), gift('G3', 'C2', 334, 'BLDG', '')], [{ giftRef: 'G1', constituent: 'C9' }]);
    const x = rollups(s, '2026-10-14', { 'Gala 2025': 'AF2025' });
    expect(Object.keys(x.campaigns)).toEqual(['AF2025']);
    expect(x.campaigns.AF2025).toMatchObject({ raised: 10000, donors: 1 });
    expect(x.funds.GEN!.appeals).toEqual({ [NO_APPEAL]: { raised: 333, gifts: 1, donors: 1, average: 333, remainder: 0 }, 'Gala 2025': { raised: 10000, gifts: 1, donors: 1, average: 10000, remainder: 0 } });
    expect(x.funds.BLDG!.appeals[NO_APPEAL]!.raised).toBe(334);
    expect(x.total).toEqual({ raised: 10667, gifts: 3, donors: 2, average: 3555, remainder: 2 });
  });

  it('a removed (voided) gift drops out of its fund, appeal and campaign by exactly its cents', () => {
    const g = state.gifts.find((x) => x.appeal)!;
    const without = rollups({ ...state, gifts: state.gifts.filter((x) => x !== g) }, answers.asOf, campaignOf);
    expect(r.funds[g.fund]!.raised - without.funds[g.fund]!.raised).toBe(g.amountCents);
    expect(r.campaigns[campaignOf[g.appeal]!]!.appeals[g.appeal]!.raised - without.campaigns[campaignOf[g.appeal]!]!.appeals[g.appeal]!.raised).toBe(g.amountCents);
    expect(r.total.gifts - without.total.gifts).toBe(1);
  });

  it('asOf is inclusive; an appeal with no campaign fails loudly', () => {
    expect(rollups(of([gift('G1', 'C1', 500, 'GEN', '', '2026-10-14'), gift('G2', 'C1', 700, 'GEN', '', '2026-10-15')]), '2026-10-14', {}).total.raised).toBe(500);
    expect(() => rollups(of([gift('G1', 'C1', 500, 'GEN', 'Mystery')]), '2026-10-14', {})).toThrow(/G1 appeal "Mystery" has no campaign/);
  });
});
