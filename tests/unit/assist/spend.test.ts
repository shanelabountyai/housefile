import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPrices } from '../../../experiments/assist/prices';
import {
  assertWithinCap, BudgetExceededError, CAPS_MICRO_USD, costMicroUsd, paidCall, readSpend, spentMicroUsd,
} from '../../../experiments/assist/spend';

const prices = loadPrices();
const HAIKU = 'claude-haiku-5-5';
const SONNET = 'claude-sonnet-5-5';
const logFile = () => join(mkdtempSync(join(tmpdir(), 'assist-spend-')), 'spend.jsonl');
const line = (runId: string, costMicroUsd: number, outcome = 'ok') =>
  JSON.stringify({ at: '2026-10-28T00:00:00.000Z', runId, model: SONNET, outcome, inputTokens: 1, outputTokens: 1, costMicroUsd }) + '\n';
const fetchThatMustNotRun = async (): Promise<never> => {
  throw new Error('fetch ran');
};

describe('assist spend and budget (task 4.2)', () => {
  it('prices a call in integer micro-USD, rounding up', () => {
    // Sonnet: 1000 in × $2/MTok + 200 out × $10/MTok = 2000 + 2000 micro-USD.
    expect(costMicroUsd(SONNET, 1000, 200, prices)).toBe(4000);
    // Haiku: 1 in token = 0.1 micro-USD, rounded up to 1; 0 tokens = 0.
    expect(costMicroUsd(HAIKU, 1, 0, prices)).toBe(1);
    expect(costMicroUsd(HAIKU, 0, 0, prices)).toBe(0);
    expect(costMicroUsd(HAIKU, 10, 0, prices)).toBe(1);
    expect(costMicroUsd(HAIKU, 11, 0, prices)).toBe(2);
  });

  it('refuses fractional or negative tokens, and prompts above the priced tier', () => {
    expect(() => costMicroUsd(SONNET, 1.5, 0, prices)).toThrow(/integers/);
    expect(() => costMicroUsd(SONNET, -1, 0, prices)).toThrow(/integers/);
    expect(() => costMicroUsd(HAIKU, 100_001, 0, prices)).toThrow(/tier/);
    expect(costMicroUsd(HAIKU, 100_000, 0, prices)).toBe(10_000);
  });

  it('a call whose estimate would cross the run cap is refused before fetch runs, and the refusal is logged', async () => {
    const file = logFile();
    writeFileSync(file, line('r1', CAPS_MICRO_USD.run - 3999));
    const call = { runId: 'r1', model: SONNET, estimateInputTokens: 1000, maxOutputTokens: 200 }; // 4000
    await expect(paidCall(call, fetchThatMustNotRun, { file, prices })).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED', scope: 'run' });
    const log = readSpend(file);
    expect(log.at(-1)).toMatchObject({ outcome: 'budget_exceeded', model: SONNET, costMicroUsd: 4000 });
    expect(spentMicroUsd(log, 'r1')).toBe(CAPS_MICRO_USD.run - 3999); // the refusal counts nothing
  });

  it('a call whose estimate would cross the experiment cap is refused, even in a fresh run', async () => {
    const file = logFile();
    writeFileSync(file, line('r1', 6_000_000) + line('r2', CAPS_MICRO_USD.experiment - 6_000_000 - 3999));
    const call = { runId: 'r3', model: SONNET, estimateInputTokens: 1000, maxOutputTokens: 200 };
    await expect(paidCall(call, fetchThatMustNotRun, { file, prices })).rejects.toMatchObject({ scope: 'experiment' });
  });

  it('landing exactly on a cap is allowed; one micro-USD over is not', () => {
    const file = logFile();
    writeFileSync(file, line('r1', CAPS_MICRO_USD.run - 4000));
    expect(() => assertWithinCap({ runId: 'r1', model: SONNET, estimateMicroUsd: 4000 }, file)).not.toThrow();
    expect(() => assertWithinCap({ runId: 'r1', model: SONNET, estimateMicroUsd: 4001 }, file)).toThrow(BudgetExceededError);
  });

  it('refusals in the log never count toward spend', () => {
    const file = logFile();
    writeFileSync(file, line('r1', CAPS_MICRO_USD.run, 'budget_exceeded'));
    expect(() => assertWithinCap({ runId: 'r1', model: SONNET, estimateMicroUsd: CAPS_MICRO_USD.run }, file)).not.toThrow();
  });

  it('a paid call appends one line with model, reported tokens and micro-USD', async () => {
    const file = logFile();
    const value = await paidCall(
      { runId: 'r1', model: HAIKU, estimateInputTokens: 2000, maxOutputTokens: 300 },
      async () => ({ value: 'reply', inputTokens: 1234, outputTokens: 56 }),
      { file, prices, now: () => new Date('2026-10-28T12:00:00Z') },
    );
    expect(value).toBe('reply');
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(1);
    // 1234 × 0.1 + 56 × 0.5 = 123.4 + 28 = 151.4 → 152
    expect(readSpend(file)[0]).toEqual({
      at: '2026-10-28T12:00:00.000Z', runId: 'r1', model: HAIKU, outcome: 'ok', inputTokens: 1234, outputTokens: 56, costMicroUsd: 152,
    });
  });

  it('a paid call that comes back above the priced tier is still logged, at the estimate, then throws', async () => {
    const file = logFile();
    const call = { runId: 'r1', model: HAIKU, estimateInputTokens: 1000, maxOutputTokens: 100 }; // 150
    await expect(paidCall(call, async () => ({ value: 1, inputTokens: 100_001, outputTokens: 1 }), { file, prices })).rejects.toThrow(/tier/);
    expect(readSpend(file)).toMatchObject([{ outcome: 'ok', inputTokens: 100_001, costMicroUsd: 150 }]);
  });
});
