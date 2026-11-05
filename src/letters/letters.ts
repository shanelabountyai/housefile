// Sample acknowledgement letters (D-26, D-66 / P-8, D-82, task 3.8): pure. Which active gifts still need a letter, how
// they group (one per gift, or one per household when combined), and the rendered text. No clock (the letter is dated
// asOf), no database, nothing that sends: letters are queued rows in a clone-owned table, never the Outbox.
import type { EffectiveGift, EffectiveState } from '../commit/state';
import { householdMembers, householdName } from '../derive/households';
import { formatCents } from '../lib/money';

/** Inclusive ISO dates; both optional. Gifts dated after asOf are never lettered. */
export type LetterScope = { from?: string; to?: string; combine: boolean };
/** recipient is a constituent business id, or a household's when household is set. */
export type LetterDraft = { recipient: string; household: boolean; giftRefs: string[]; totalCents: number; subject: string; body: string };

export const BANNER = 'SAMPLE LETTER: synthetic data from a learning project. Not a tax receipt, never sent.';
export const NO_GOODS = 'No goods or services were provided in exchange for this contribution.';
export const CITATION =
  'IRS Publication 1771 and irs.gov/node/551 (read 2026-10-14) describe the written acknowledgment a donor needs for a contribution of $250 or more, and the disclosure a charity gives for a quid pro quo contribution over $75. This sample letter does not claim to meet them.';

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const giftLine = (g: EffectiveGift) => `${g.giftDate}  ${formatCents(g.amountCents)}  ${g.fund}${g.appeal ? `  ${g.appeal}` : ''}`;

export function renderLetter(name: string, gifts: EffectiveGift[], asOf: string): { subject: string; body: string; totalCents: number } {
  const totalCents = gifts.reduce((s, g) => s + g.amountCents, 0);
  const one = gifts.length === 1;
  const thanks = one
    ? `Thank you for your gift of ${formatCents(totalCents)} on ${gifts[0]!.giftDate} to the ${gifts[0]!.fund} fund${gifts[0]!.appeal ? ` (${gifts[0]!.appeal})` : ''}.`
    : [`Thank you for your ${gifts.length} gifts, totalling ${formatCents(totalCents)}:`, ...gifts.map((g) => `  ${giftLine(g)}`)].join('\n');
  const body = [BANNER, '', asOf, '', `Dear ${name},`, '', thanks, '', NO_GOODS, '', 'With gratitude,', 'Housefile (sample)', '', CITATION].join('\n');
  return { subject: `Thank you, ${name}: ${formatCents(totalCents)}`, body, totalCents };
}

/** Drafts for the active gifts dated ≤ asOf, inside the scope's window, whose giftRef no letter covers yet.
 *  combine: a donor in a household is lettered with the household (Σ all its members' such gifts); others per gift. */
export function planLetters(state: EffectiveState, lettered: ReadonlySet<string>, asOf: string, scope: LetterScope): LetterDraft[] {
  const people = new Map(state.constituents.map((c) => [c.id, c]));
  const gifts = state.gifts
    .filter((g) => g.giftDate <= asOf && (!scope.from || g.giftDate >= scope.from) && (!scope.to || g.giftDate <= scope.to) && !lettered.has(g.giftRef))
    .sort((a, b) => cmp(a.giftRef, b.giftRef));
  const groups = new Map<string, { recipient: string; household: boolean; gifts: EffectiveGift[] }>();
  for (const g of gifts) {
    const hh = scope.combine ? (people.get(g.constituent)?.household ?? '') : '';
    const key = hh ? `H:${hh}` : `G:${g.giftRef}`;
    const grp = groups.get(key) ?? { recipient: hh || g.constituent, household: !!hh, gifts: [] };
    grp.gifts.push(g);
    groups.set(key, grp);
  }
  return [...groups.values()].map((grp) => {
    const p = people.get(grp.recipient);
    const name = grp.household ? householdName(householdMembers(state, grp.recipient)) : p ? `${p.firstName} ${p.lastName}` : grp.recipient;
    const r = renderLetter(name, grp.gifts, asOf);
    return { recipient: grp.recipient, household: grp.household, giftRefs: grp.gifts.map((g) => g.giftRef), totalCents: r.totalCents, subject: r.subject, body: r.body };
  });
}

/** LETTER_STALE when any covered giftRef's current row is not the one the letter was rendered from (D-82). */
export const isStale = (giftRefs: string[], giftIds: string[], headIdByRef: ReadonlyMap<string, string>): boolean =>
  giftRefs.some((ref, i) => headIdByRef.get(ref) !== giftIds[i]);
