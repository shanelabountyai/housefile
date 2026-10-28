// Spend caps for the Phase 4 experiment (task 4.2, P4-6): $10 for the whole experiment, $2 per run, checked before
// every call. Ported from footnote `src/lib/spend/budget.ts` (D-89): refuse, log and throw BUDGET_EXCEEDED before the
// call; spend is a sum over logged calls, refusals never count. footnote logged to a ModelCall table; here the log is
// an append-only JSONL so it is committed beside the run cache and needs no database.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { loadPrices, priceFor, PRICES_FILE } from './prices';

export const SPEND_FILE = 'eval/assist/spend.jsonl';
export const CAPS_MICRO_USD = { experiment: 10_000_000, run: 2_000_000 } as const;
export type CapScope = keyof typeof CAPS_MICRO_USD;

export type SpendLine = {
  at: string;
  runId: string;
  model: string;
  outcome: 'ok' | 'budget_exceeded';
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
};

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED' as const;
  constructor(readonly scope: CapScope, readonly spentMicroUsd: number, readonly estimateMicroUsd: number) {
    super(`BUDGET_EXCEEDED: ${scope} cap ${CAPS_MICRO_USD[scope]} micro-USD; spent ${spentMicroUsd} + estimate ${estimateMicroUsd}`);
  }
}

/** Integer micro-USD for a call, rounded up so an estimate never under-counts. Above a model's prompt tier it throws:
 * the higher tier is not in prices.json, and a guessed price is not a cap. */
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number, prices = loadPrices()): number {
  if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens) || inputTokens < 0 || outputTokens < 0)
    throw new Error(`token counts must be non-negative integers (got ${inputTokens}, ${outputTokens})`);
  const p = priceFor(model, prices);
  if (p.promptTokensUpTo !== undefined && inputTokens > p.promptTokensUpTo)
    throw new Error(`${inputTokens} input tokens is above ${model}'s ${p.promptTokensUpTo}-token tier in ${PRICES_FILE}`);
  const n = inputTokens * p.inputMicroUsdPerMTok + outputTokens * p.outputMicroUsdPerMTok;
  return (n - (n % 1_000_000)) / 1_000_000 + (n % 1_000_000 ? 1 : 0);
}

export function readSpend(file = SPEND_FILE): SpendLine[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function spentMicroUsd(lines: SpendLine[], runId?: string): number {
  return lines
    .filter((l) => l.outcome === 'ok' && (runId === undefined || l.runId === runId))
    .reduce((s, l) => s + l.costMicroUsd, 0);
}

function append(file: string, line: Omit<SpendLine, 'at'>, now: Date) {
  appendFileSync(file, JSON.stringify({ at: now.toISOString(), ...line }) + '\n');
}

/** Refuses, logs and throws before any call whose estimate would push the experiment or the run over its cap. */
export function assertWithinCap(
  call: { runId: string; model: string; estimateMicroUsd: number },
  file = SPEND_FILE,
  now = new Date(),
): void {
  const lines = readSpend(file);
  const checks: [CapScope, number][] = [
    ['experiment', spentMicroUsd(lines)],
    ['run', spentMicroUsd(lines, call.runId)],
  ];
  for (const [scope, spent] of checks) {
    if (spent + call.estimateMicroUsd > CAPS_MICRO_USD[scope]) {
      append(file, { runId: call.runId, model: call.model, outcome: 'budget_exceeded', inputTokens: 0, outputTokens: 0, costMicroUsd: call.estimateMicroUsd }, now);
      throw new BudgetExceededError(scope, spent, call.estimateMicroUsd);
    }
  }
}

/**
 * The only way 4.5 makes a paid call: cap check on the estimate (prompt tokens + max output tokens), then `send`,
 * then one log line priced from the tokens the API reported. A refusal means `send` never runs.
 */
export async function paidCall<T>(
  call: { runId: string; model: string; estimateInputTokens: number; maxOutputTokens: number },
  send: () => Promise<{ value: T; inputTokens: number; outputTokens: number }>,
  opts: { file?: string; prices?: ReturnType<typeof loadPrices>; now?: () => Date } = {},
): Promise<T> {
  const file = opts.file ?? SPEND_FILE;
  const prices = opts.prices ?? loadPrices();
  const now = opts.now ?? (() => new Date());
  const estimateMicroUsd = costMicroUsd(call.model, call.estimateInputTokens, call.maxOutputTokens, prices);
  assertWithinCap({ runId: call.runId, model: call.model, estimateMicroUsd }, file, now());
  const r = await send();
  // A paid call is always logged: if the reported tokens cannot be priced (above the tier), log the estimate and throw.
  let cost = estimateMicroUsd;
  let unpriced: unknown;
  try {
    cost = costMicroUsd(call.model, r.inputTokens, r.outputTokens, prices);
  } catch (e) {
    unpriced = e;
  }
  append(file, { runId: call.runId, model: call.model, outcome: 'ok', inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicroUsd: cost }, now());
  if (unpriced) throw unpriced;
  return r.value;
}
