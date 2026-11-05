// Pledge balances (D-9, D-71, task 3.6): paid = Σ active payments (gifts carrying the pledgeRef) dated on or before
// asOf; balance = total − paid. Derived, never stored; the state holds no superseded or voided gift, so voiding a
// payment raises the balance by its cents. No scheduler and no reminders: the schedule is data only (seam).
import type { EffectiveState } from '../commit/state';

export type PledgeBalance = { constituentId: string; totalCents: number; paidCents: number; payments: number; balanceCents: number };

export function pledgeBalances(state: EffectiveState, asOf: string): Record<string, PledgeBalance> {
  const out: Record<string, PledgeBalance> = {};
  for (const p of state.pledges ?? []) {
    const paid = state.gifts.filter((g) => g.pledgeRef === p.pledgeRef && g.giftDate <= asOf);
    const paidCents = paid.reduce((s, g) => s + g.amountCents, 0);
    out[p.pledgeRef] = { constituentId: p.constituent, totalCents: p.totalCents, paidCents, payments: paid.length, balanceCents: p.totalCents - paidCents };
  }
  return out;
}
