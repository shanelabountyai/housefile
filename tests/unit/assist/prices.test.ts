import { describe, expect, it } from 'vitest';
import { assertPricesFresh, loadPrices, priceFor } from '../../../experiments/assist/prices';

describe('assist prices (task 4.1)', () => {
  const prices = loadPrices();

  it('prices both P4-3 models in integer micro-USD', () => {
    for (const id of ['claude-haiku-5-5', 'claude-sonnet-5-5']) {
      const p = priceFor(id, prices);
      expect(Number.isInteger(p.inputMicroUsdPerMTok) && Number.isInteger(p.outputMicroUsdPerMTok)).toBe(true);
    }
  });

  it('an unknown model id throws naming the file', () => {
    expect(() => priceFor('claude-made-up-1', prices)).toThrow(/config\/prices\.json/);
  });

  it('a price older than 60 days refuses; 60 days passes', () => {
    const day = (n: number) => new Date(Date.parse(prices.checkedAt) + n * 86_400_000);
    expect(() => assertPricesFresh(prices, day(60))).not.toThrow();
    expect(() => assertPricesFresh(prices, day(61))).toThrow(/61 days old/);
    expect(() => assertPricesFresh({ ...prices, checkedAt: 'soon' }, day(0))).toThrow(/re-check/);
  });
});
