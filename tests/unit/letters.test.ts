// Task 3.8 (D-26, D-66 / P-8, D-82): the letter plan over the Phase 3 fixture in memory. One letter per gift, or one per
// household whose Σ equals the oracle's household giving; the fixed sentence, banner and citation in every body; stale
// iff a covered giftRef's current row is not the rendered one; and nothing under the letter code can reach a sender.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BANNER, CITATION, isStale, NO_GOODS, planLetters, renderLetter } from '@/letters/letters';
import { answers, phase3State } from '../helpers/phase3';

const state = phase3State();
const asOf = answers.asOf as string;
const dated = state.gifts.filter((g) => g.giftDate <= asOf);
const sum = (xs: { totalCents: number }[]) => xs.reduce((s, x) => s + x.totalCents, 0);

describe('letters (task 3.8)', () => {
  it('one letter per gift dated ≤ asOf, each for that gift and donor; a second plan over the lettered refs is empty', () => {
    const drafts = planLetters(state, new Set(), asOf, { combine: false });
    expect(drafts).toHaveLength(dated.length);
    expect(drafts.length).toBeGreaterThan(800);
    for (const d of drafts) {
      const g = dated.find((x) => x.giftRef === d.giftRefs[0])!;
      expect(d).toMatchObject({ recipient: g.constituent, household: false, giftRefs: [g.giftRef], totalCents: g.amountCents });
    }
    expect(sum(drafts)).toBe(dated.reduce((s, g) => s + g.amountCents, 0));
    expect(planLetters(state, new Set(drafts.flatMap((d) => d.giftRefs)), asOf, { combine: false })).toEqual([]);
  });

  it('combined: one letter per household, Σ = the oracle household giving, named as the household', () => {
    const drafts = planLetters(state, new Set(), asOf, { combine: true });
    const households = Object.entries(answers.households as Record<string, { givingCents: number; name: string }>).filter(([, h]) => h.givingCents > 0);
    expect(drafts.filter((d) => d.household).map((d) => d.recipient).sort()).toEqual(households.map(([id]) => id).sort());
    for (const [id, h] of households) {
      const d = drafts.find((x) => x.recipient === id)!;
      expect(d.totalCents).toBe(h.givingCents);
      expect(d.body).toContain(`Dear ${h.name},`);
    }
    expect(drafts.filter((d) => !d.household).every((d) => d.giftRefs.length === 1)).toBe(true);
    expect(sum(drafts)).toBe(dated.reduce((s, g) => s + g.amountCents, 0));
  });

  it('the window is inclusive and a gift after asOf is never lettered', () => {
    const g = dated[0]!;
    const one = planLetters(state, new Set(), asOf, { from: g.giftDate, to: g.giftDate, combine: false });
    expect(one.map((d) => d.giftRefs[0])).toEqual(dated.filter((x) => x.giftDate === g.giftDate).map((x) => x.giftRef).sort());
    const late = { ...state, gifts: [{ ...g, giftRef: 'G99999', giftDate: '2099-01-01' }] };
    expect(planLetters(late, new Set(), asOf, { combine: false })).toEqual([]);
  });

  it('every body carries the banner, the fixed sentence, the cited IRS note and whole-cent amounts', () => {
    const r = renderLetter('The Rivera Household', [dated[0]!, { ...dated[1]!, amountCents: 5 }], asOf);
    expect(r.totalCents).toBe(dated[0]!.amountCents + 5);
    for (const text of [BANNER, NO_GOODS, CITATION, '$0.05', `Dear The Rivera Household,`, asOf]) expect(r.body).toContain(text);
    expect(CITATION).toContain('irs.gov/node/551');
    expect(CITATION).toContain('Publication 1771');
    expect(CITATION).toContain('does not claim to meet');
  });

  it('stale iff any covered giftRef has a row other than the one rendered from', () => {
    const heads = new Map([['G1', 'a'], ['G2', 'b']]);
    expect(isStale(['G1', 'G2'], ['a', 'b'], heads)).toBe(false);
    expect(isStale(['G1', 'G2'], ['a', 'x'], heads)).toBe(true);
  });

  it('the letter code imports no notifications, email or fetch (P-8, non-negotiable 10)', () => {
    const FORBIDDEN = /\bfrom\s+['"][^'"]*(notifications|email|outbox|resend)[^'"]*['"]|\bimport\s*\(\s*['"][^'"]*(notifications|email|outbox|resend)|\bfetch\s*\(/i;
    for (const planted of ["import { enqueue } from '@/modules/notifications/outbox';", "import { sendEmail } from '@/core/email';", "await fetch('https://x')", "await import('@/modules/notifications/outbox')"]) expect(planted).toMatch(FORBIDDEN);
    const files = [...readdirSync('src/letters').map((f) => `src/letters/${f}`), 'src/commit/letters.ts'];
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(FORBIDDEN);
  });
});
