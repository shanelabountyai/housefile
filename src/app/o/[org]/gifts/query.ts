import { db } from '@/core/db';
import { loadAppealCampaigns, loadEffectiveState } from '@/commit/db-state';
import { rollups } from '@/derive/rollups';

// Task 3.10: Marcus's gift list. The totals are `rollups` over the filtered gifts, so with no filter they are the
// roll-up page's numbers to the cent; the page and the CSV share this one query.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (v: string | undefined) => (v && ISO.test(v) ? v : '');

export type GiftQuery = { asOf: string; from: string; to: string; fund: string; campaign: string };
export const parseGiftQuery = (sp: Record<string, string | undefined>): GiftQuery => ({
  asOf: iso(sp.asOf) || new Date().toISOString().slice(0, 10), from: iso(sp.from), to: iso(sp.to), fund: sp.fund ?? '', campaign: sp.campaign ?? '',
});

export async function giftList(orgId: string, q: GiftQuery) {
  const state = await loadEffectiveState(db, orgId);
  const campaignOf = await loadAppealCampaigns(db, orgId);
  const gifts = state.gifts
    .filter((g) => g.giftDate <= q.asOf && (!q.from || g.giftDate >= q.from) && (!q.to || g.giftDate <= q.to) && (!q.fund || g.fund === q.fund) && (!q.campaign || campaignOf[g.appeal] === q.campaign))
    .sort((a, b) => (a.giftDate < b.giftDate ? -1 : a.giftDate > b.giftDate ? 1 : a.giftRef < b.giftRef ? -1 : 1));
  const names = new Map(state.constituents.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));
  const byDate = new Map<string, number>();
  for (const g of gifts) byDate.set(g.giftDate, (byDate.get(g.giftDate) ?? 0) + g.amountCents);
  return {
    gifts, names, byDate: [...byDate], view: rollups({ ...state, gifts }, q.asOf, campaignOf),
    funds: [...new Set(state.gifts.map((g) => g.fund))].sort(), campaigns: [...new Set(Object.values(campaignOf))].sort(),
  };
}
