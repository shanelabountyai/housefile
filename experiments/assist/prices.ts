// Pinned model prices for the Phase 4 experiment (task 4.1, P4-3). Ported from footnote `src/lib/spend/prices.ts`
// (D-88): read config/prices.json, an unknown model throws naming the file, a stale price fails before any call.
// Prices are integer micro-USD per MTok here, where footnote kept dollars, so nothing downstream touches a float.
import { readFileSync } from 'node:fs';

export const PRICES_FILE = 'config/prices.json';
export const PRICE_MAX_AGE_DAYS = 60;

export type ModelPrice = { inputMicroUsdPerMTok: number; outputMicroUsdPerMTok: number; promptTokensUpTo?: number };
export type Prices = { checkedAt: string; models: Record<string, ModelPrice> };

export function loadPrices(file = PRICES_FILE): Prices {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function priceFor(model: string, prices = loadPrices()): ModelPrice {
  const p = prices.models[model];
  if (!p) throw new Error(`no price for model "${model}" in ${PRICES_FILE}; add it from Anthropic's pricing page, never from memory`);
  return p;
}

/** Called by assist:run before the first call: a price older than 60 days, or an unreadable date, refuses. */
export function assertPricesFresh(prices = loadPrices(), now = new Date()): void {
  const age = Math.floor((now.getTime() - Date.parse(prices.checkedAt)) / 86_400_000);
  if (!(age <= PRICE_MAX_AGE_DAYS))
    throw new Error(`${PRICES_FILE} checkedAt ${prices.checkedAt} is ${age} days old (max ${PRICE_MAX_AGE_DAYS}); re-check the prices`);
}
