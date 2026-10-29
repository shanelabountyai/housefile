import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewItems } from '../../../experiments/assist/items';
import { loadPrices } from '../../../experiments/assist/prices';
import { buildPrompt, promptHash } from '../../../experiments/assist/prompt';
import { estimateInputTokens, itemId, MAX_OUTPUT_TOKENS, parseReply, readRun, runAssist } from '../../../experiments/assist/run';
import { BudgetExceededError, CAPS_MICRO_USD, costMicroUsd } from '../../../experiments/assist/spend';

const HAIKU = 'claude-haiku-5-5';
const KEY = 'sk-ant-test-0123456789abcdef';
const prices = { ...loadPrices(), checkedAt: '2026-10-28' };
const now = () => new Date('2026-10-29T12:00:00.000Z');
const items = reviewItems().slice(0, 4);
const first = items[0]!;

const reply = (text: string, status = 200) =>
  new Response(
    status === 200 ? JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 900, output_tokens: 30 } }) : text,
    { status },
  );
const good = '{"decision": "MERGE", "reason": "same email and phone"}';

let dir: string;
type Init = { body: string; headers: Record<string, string> };
let fetchMock: ReturnType<typeof vi.fn<(url: string, init: Init) => Promise<Response>>>;
const sent = (n: number) => fetchMock.mock.calls[n]!;
const opts = () => ({
  model: HAIKU, items, prices, now,
  runFile: join(dir, 'run.jsonl'), spendFile: join(dir, 'spend.jsonl'),
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'assist-run-'));
  fetchMock = vi.fn(async () => reply(good));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('ANTHROPIC_API_KEY', KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('assist runner (task 4.5)', () => {
  it('one call per item at temperature 0, one cached line each with prompt hash, tokens and micro-USD', async () => {
    const r = await runAssist(opts());
    expect(r).toEqual({ called: 4, skipped: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [url, init] = sent(0);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(init.body);
    expect(body.temperature).toBe(0);
    expect(body.model).toBe(HAIKU);
    const p = buildPrompt(first.row, first.candidateRecord);
    expect(body.system).toBe(p.system);
    expect(body.messages).toEqual([{ role: 'user', content: p.user }]);
    const lines = readRun(opts().runFile);
    expect(lines.map((l) => l.itemId)).toEqual(items.map(itemId));
    expect(lines[0]).toMatchObject({
      model: HAIKU, promptHash: promptHash(p), raw: good, decision: 'MERGE', reason: 'same email and phone',
      inputTokens: 900, outputTokens: 30, costMicroUsd: 105, // 900 × 0.1 + 30 × 0.5 = 105
    });
    expect(readFileSync(opts().spendFile, 'utf8').trim().split('\n')).toHaveLength(4);
  });

  it('an unparseable or off-label reply is ABSTAIN, and is never retried', async () => {
    for (const bad of ['MERGE', '```json\n' + good + '\n```', '{"decision": "maybe", "reason": "x"}',
      '{"decision": "MERGE"}', '{"decision": "MERGE", "reason": "x", "confidence": 0.9}', '{"decision": "MERGE", "reason": "x", "zzz": 1}', '', 'null', '[]'])
      expect(parseReply(bad)).toEqual({ decision: 'ABSTAIN', reason: null });
    expect(parseReply(` ${good}\n`)).toEqual({ decision: 'MERGE', reason: 'same email and phone' });

    fetchMock.mockImplementation(async () => reply('I think these are the same person.'));
    await runAssist(opts());
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(readRun(opts().runFile).map((l) => l.decision)).toEqual(['ABSTAIN', 'ABSTAIN', 'ABSTAIN', 'ABSTAIN']);
  });

  it('resume calls nothing twice: cached items are skipped, an ABSTAIN included', async () => {
    fetchMock.mockImplementationOnce(async () => reply('garbage'));
    await runAssist({ ...opts(), limit: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const r = await runAssist(opts());
    expect(r).toEqual({ called: 2, skipped: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const ids = readRun(opts().runFile).map((l) => l.itemId);
    expect(ids).toEqual(items.map(itemId));
    expect(await runAssist(opts())).toEqual({ called: 0, skipped: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('a cached line for the same item under a different prompt is refused, not silently reused', async () => {
    await runAssist({ ...opts(), limit: 1 });
    const f = opts().runFile;
    writeFileSync(f, readFileSync(f, 'utf8').replace(/"promptHash":"[0-9a-f]+"/, '"promptHash":"00"'));
    await expect(runAssist(opts())).rejects.toThrow(/prompt hash/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the cap is checked before each call: a refusal stops the run before fetch, cached lines are kept', async () => {
    // Leave room for item 0's estimate plus 10: it fits, then its real cost (105) leaves too little for item 1's.
    const p0 = buildPrompt(first.row, first.candidateRecord);
    const room = costMicroUsd(HAIKU, estimateInputTokens(p0), MAX_OUTPUT_TOKENS, prices) + 10;
    writeFileSync(opts().spendFile, JSON.stringify({
      at: '2026-10-29T00:00:00.000Z', runId: 'other', model: HAIKU, outcome: 'ok',
      inputTokens: 0, outputTokens: 0, costMicroUsd: CAPS_MICRO_USD.experiment - room,
    }) + '\n');
    await expect(runAssist(opts())).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readRun(opts().runFile)).toHaveLength(1);
    const spend = readFileSync(opts().spendFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(spend.map((l) => l.outcome)).toEqual(['ok', 'ok', 'budget_exceeded']);
  });

  it('stale prices refuse before any call', async () => {
    await expect(runAssist({ ...opts(), prices: { ...prices, checkedAt: '2026-08-01' } })).rejects.toThrow(/days old/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the key is never logged: not in the cache, the spend log, console output or an error', async () => {
    const out = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
    await runAssist({ ...opts(), limit: 2 });
    fetchMock.mockImplementation(async () => reply('{"type":"error","error":{"message":"invalid x-api-key"}}', 401));
    const err = await runAssist(opts()).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toMatch(/anthropic 401/);
    const seen = [
      readFileSync(opts().runFile, 'utf8'), readFileSync(opts().spendFile, 'utf8'),
      (err as Error).message, String((err as Error).stack),
      ...out.flatMap((s) => s.mock.calls.flat().map(String)),
    ].join('\n');
    expect(seen).not.toContain(KEY);
    expect(sent(0)[1].headers['x-api-key']).toBe(KEY); // it was sent, only as the header
  });

  it('no key is a clear refusal before any call', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(runAssist(opts())).rejects.toThrow(/ANTHROPIC_API_KEY is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
