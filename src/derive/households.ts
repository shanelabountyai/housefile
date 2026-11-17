// Households (D-8, D-74e, task 3.2): pure derivations over the effective state, the same function on the fixture in
// memory and on the database. Names are derived at read time and never hashed (P-13). Folded (lowercase) names from
// file B print as stored; title-casing is a seam.
import type { EffectiveConstituent, EffectiveState } from '../commit/state';
import { nameToken } from '../import/normalize/names';

/** Inclusive ISO dates. */
export type Window = { from: string; to: string };

const byId = (a: EffectiveConstituent, b: EffectiveConstituent) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const householdMembers = (state: EffectiveState, householdId: string): EffectiveConstituent[] =>
  householdId ? state.constituents.filter((c) => c.household === householdId).sort(byId) : [];

/** "The Rivera Household" when every surname agrees after N1 folding (first member's stored surname),
 *  else "Zoë Rivera and Victoria Whitfield", or "A, B and C" for three or more; members by business id. */
export function householdName(members: EffectiveConstituent[]): string {
  const ms = [...members].sort(byId);
  if (!ms.length) return '';
  if (new Set(ms.map((m) => nameToken(m.lastName))).size === 1) return `The ${ms[0]!.lastName} Household`;
  const names = ms.map((m) => `${m.firstName} ${m.lastName}`);
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** Σ members' active hard credits in cents (soft credits never count), optionally within a window. */
export function householdGiving(state: EffectiveState, householdId: string, window?: Window): number {
  const ids = new Set(householdMembers(state, householdId).map((m) => m.id));
  return state.gifts
    .filter((g) => ids.has(g.constituent) && (!window || (g.giftDate >= window.from && g.giftDate <= window.to)))
    .reduce((sum, g) => sum + g.amountCents, 0);
}
