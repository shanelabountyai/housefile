// Recognition (D-9, D-74c, D-81, task 3.7): per constituent, hard = Σ its active gifts dated on or before asOf, soft =
// Σ the cents of active soft credits on those gifts; total = hard + soft. Raised totals (./rollups) never read soft
// credits. A soft credit whose gift is voided, superseded away or later than asOf counts nothing; one naming the gift's
// own hard donor (only a merge can produce it) counts nothing either, so a merge never double-counts a gift.
import type { EffectiveState } from '../commit/state';

export type Recognition = { hardCents: number; softCents: number; totalCents: number };

export function recognition(state: EffectiveState, asOf: string): Record<string, Recognition> {
  const out: Record<string, Recognition> = {};
  const row = (c: string) => (out[c] ??= { hardCents: 0, softCents: 0, totalCents: 0 });
  const donorOf = new Map<string, string>();
  for (const g of state.gifts) {
    if (g.giftDate > asOf) continue;
    donorOf.set(g.giftRef, g.constituent);
    row(g.constituent).hardCents += g.amountCents;
  }
  for (const s of state.softCredits) {
    const donor = donorOf.get(s.giftRef);
    if (donor !== undefined && donor !== s.constituent) row(s.constituent).softCents += s.amountCents;
  }
  for (const r of Object.values(out)) r.totalCents = r.hardCents + r.softCents;
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]!]));
}
