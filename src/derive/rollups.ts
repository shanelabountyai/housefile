// Campaign and fund roll-ups (D-28, D-70, D-75, task 3.3): pure derivations over the effective state, the same function
// on the fixture in memory and on the database. Active gifts only (the state holds no superseded or voided row), dated
// on or before asOf; soft credits are never counted (D-9). A gift with no appeal rolls up in a "(no appeal)" row under
// its fund and in no campaign (D-70). The campaign is read through the appeal (D-75), not stored on the gift.
import type { EffectiveGift, EffectiveState } from '../commit/state';

export const NO_APPEAL = '(no appeal)';

/** Integer cents throughout: average = raised ÷ gifts by integer division, remainder shown (D-28). */
export type Stat = { raised: number; gifts: number; donors: number; average: number; remainder: number };
export type Rollup = Stat & { appeals: Record<string, Stat> };
export type Rollups = { asOf: string; total: Stat; campaigns: Record<string, Rollup>; funds: Record<string, Rollup> };

export function stat(gifts: EffectiveGift[]): Stat {
  const raised = gifts.reduce((s, g) => s + g.amountCents, 0);
  const n = gifts.length;
  const remainder = n ? raised % n : 0;
  return { raised, gifts: n, donors: new Set(gifts.map((g) => g.constituent)).size, average: n ? raised / n : 0, remainder }; // exact: raised − remainder divides by n
}

const group = (gifts: EffectiveGift[], key: (g: EffectiveGift) => string): Record<string, EffectiveGift[]> => {
  const out: Record<string, EffectiveGift[]> = {};
  for (const g of gifts) (out[key(g)] ??= []).push(g);
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]!]));
};

const rollup = (gifts: EffectiveGift[]): Rollup => ({
  ...stat(gifts),
  appeals: Object.fromEntries(Object.entries(group(gifts, (g) => g.appeal || NO_APPEAL)).map(([a, gs]) => [a, stat(gs)])),
});

/** `campaignOf` maps each appeal name to its campaign code (the Appeal table, or the fixture's campaign column). */
export function rollups(state: EffectiveState, asOf: string, campaignOf: Record<string, string>): Rollups {
  const active = state.gifts.filter((g) => g.giftDate <= asOf);
  const appealed = active.filter((g) => g.appeal);
  const campaignFor = (g: EffectiveGift) => {
    const c = campaignOf[g.appeal];
    if (!c) throw new Error(`rollups: ${g.giftRef} appeal "${g.appeal}" has no campaign`);
    return c;
  };
  const by = (gifts: EffectiveGift[], key: (g: EffectiveGift) => string) => Object.fromEntries(Object.entries(group(gifts, key)).map(([k, gs]) => [k, rollup(gs)]));
  return { asOf, total: stat(active), campaigns: by(appealed, campaignFor), funds: by(active, (g) => g.fund) };
}
