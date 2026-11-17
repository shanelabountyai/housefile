// Task 3.7 (D-9, D-74c, D-81): recognition = hard + soft per constituent; a soft credit counts only while its gift is
// active and dated on or before asOf; raised totals never see it. Against answers.json (tools/phase3_answers.py).
import { describe, expect, it } from 'vitest';
import type { EffectiveGift, EffectiveState } from '@/commit/state';
import { recognition } from '@/derive/recognition';
import { rollups } from '@/derive/rollups';
import { answers, phase3CampaignOf, phase3State } from '../helpers/phase3';

const gift = (giftRef: string, constituent: string, amountCents: number, giftDate = '2026-01-01') =>
  ({ giftRef, constituent, amountCents, giftDate, fund: 'GEN', appeal: '', giftType: 'GIFT', externalRef: '' }) as EffectiveGift;
const sc = (softCreditRef: string, giftRef: string, constituent: string, amountCents: number) => ({ softCreditRef, giftRef, constituent, role: 'SPOUSE', amountCents });

describe('recognition (task 3.7)', () => {
  it('every constituent equals the oracle; soft credits are in the state and out of raised totals', () => {
    const s = phase3State();
    expect(s.softCredits.length).toBe(42);
    expect(recognition(s, answers.asOf)).toEqual(answers.recognition);
    expect(rollups(s, answers.asOf, phase3CampaignOf()).total).toEqual(rollups({ ...s, softCredits: [] }, answers.asOf, phase3CampaignOf()).total);
  });

  it('a soft credit drops out with its gift (voided or after asOf), and never credits the hard donor (D-81)', () => {
    const s: EffectiveState = { constituents: [], gifts: [gift('G1', 'C1', 10000), gift('G2', 'C1', 500, '2099-01-01')], softCredits: [sc('SC1', 'G1', 'C2', 4000), sc('SC2', 'G2', 'C3', 500), sc('SC3', 'G9', 'C4', 700), sc('SC4', 'G1', 'C1', 9000)] };
    expect(recognition(s, '2026-10-14')).toEqual({ C1: { hardCents: 10000, softCents: 0, totalCents: 10000 }, C2: { hardCents: 0, softCents: 4000, totalCents: 4000 } });
  });
});
