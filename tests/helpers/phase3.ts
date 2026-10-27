// The Phase 3 fixture as effective state in memory: CRM constituents and gifts plus fixtures/phase3/ pledges, payments, soft credits,
// corrections applied (CORRECT replaces one field, VOID drops the gift; D-74b). Tests compare against answers.json,
// which only tools/phase3_answers.py writes (D-74f); product code never reads either.
import { readFileSync } from 'node:fs';
import { fixtureState, type EffectiveState } from '@/commit/state';
import { loadConstituents, loadGifts, loadPledges, loadSoftCredits, type CrmGift, type CrmPledge, type CrmSoftCredit } from '@/import/crm';
import { parseCsv } from '@/import/csv';

const bytes = (p: string) => new Uint8Array(readFileSync(p));

export const answers = JSON.parse(readFileSync('fixtures/phase3/answers.json', 'utf8'));

export function phase3State(): EffectiveState {
  const gifts = [...loadGifts(bytes('fixtures/crm_gifts.csv')), ...loadGifts(bytes('fixtures/phase3/pledge_payments.csv'))];
  const s = fixtureState(loadConstituents(bytes('fixtures/crm_constituents.csv')), gifts, phase3Pledges(), phase3SoftCredits());
  const byRef = new Map(s.gifts.map((g) => [g.giftRef, g]));
  for (const { cells: c } of parseCsv(bytes('fixtures/phase3/corrections.csv')).rows) {
    const g = byRef.get(c.gift_id!)!;
    if (c.action === 'VOID') byRef.delete(c.gift_id!);
    else if (c.field === 'amount_cents') g.amountCents = Number(c.new_value);
    else if (c.field === 'fund') g.fund = c.new_value!;
    else if (c.field === 'gift_date') g.giftDate = c.new_value!;
    else throw new Error(`${c.correction_id}: ${c.action}/${c.field}`);
  }
  return { ...s, gifts: [...byRef.values()].filter((g) => g.giftDate <= answers.asOf) };
}

export const phase3Pledges = (): CrmPledge[] => loadPledges(bytes('fixtures/phase3/pledges.csv'));
/** All 42, including any on a voided gift: the row stays active and drops out of recognition with its gift (D-74b/c). */
export const phase3SoftCredits = (): CrmSoftCredit[] => loadSoftCredits(bytes('fixtures/phase3/soft_credits.csv'));

/** Appeal name → campaign code from the fixture's campaign column (D-75). */
export const phase3CampaignOf = (): Record<string, string> =>
  Object.fromEntries([...loadGifts(bytes('fixtures/crm_gifts.csv')), ...loadGifts(bytes('fixtures/phase3/pledge_payments.csv'))].map((g) => [g.appeal, g.campaign]));

/** The Phase 3 gifts with corrections applied, as seedable CRM rows (until task 3.5 writes corrections as superseding rows). */
export function phase3SeedGifts(): CrmGift[] {
  const orig = new Map([...loadGifts(bytes('fixtures/crm_gifts.csv')), ...loadGifts(bytes('fixtures/phase3/pledge_payments.csv'))].map((g) => [g.gift_id, g]));
  return phase3State().gifts.map((g) => ({ ...orig.get(g.giftRef)!, gift_date: g.giftDate, amount_cents: g.amountCents, fund: g.fund }));
}
