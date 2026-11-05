// The Phase 4 runner (task 4.5, P4-5): one call per review item through `paidCall`, strict parse, one cached JSONL
// line per item. Resume reads the run file and skips every item already in it, so nothing is called twice and an
// ABSTAIN is a recorded answer, never a reason to call again. The scorer (4.6) reads only these files.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { callMessages } from './anthropic';
import type { ReviewItem } from './items';
import { assertPricesFresh, loadPrices, type Prices } from './prices';
import { buildPrompt, LABELS, promptHash, type Label, type Prompt } from './prompt';
import { costMicroUsd, paidCall, SPEND_FILE } from './spend';

export const MAX_OUTPUT_TOKENS = 200;
export const RUNS_DIR = 'eval/assist/runs';

export type Decision = Label | 'ABSTAIN';
export type RunLine = {
  at: string;
  itemId: string;
  model: string;
  promptHash: string;
  raw: string;
  decision: Decision;
  reason: string | null;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
};

// Items are keyed by id, not prompt hash: 8 items share a prompt with another (D-91).
export const itemId = (i: Pick<ReviewItem, 'file' | 'rowId' | 'candidate'>) => `${i.file}:${i.rowId}:${i.candidate}`;
export const runFileFor = (model: string, date: string) => `${RUNS_DIR}/${model}-${date}.jsonl`;

// A token is at least one UTF-8 byte, so the byte count bounds the prompt from above; 64 covers the message framing.
export const estimateInputTokens = (p: Prompt) => Buffer.byteLength(p.system, 'utf8') + Buffer.byteLength(p.user, 'utf8') + 64;

/** Exactly `{decision, reason}` with a known label and a string reason, or ABSTAIN. No fence stripping, no repair. */
export function parseReply(raw: string): { decision: Decision; reason: string | null } {
  const abstain = { decision: 'ABSTAIN' as const, reason: null };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return abstain;
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return abstain;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  if (keys.length !== 2 || keys[0] !== 'decision' || keys[1] !== 'reason') return abstain;
  if (!LABELS.includes(o.decision as Label) || typeof o.reason !== 'string') return abstain;
  return { decision: o.decision as Label, reason: o.reason };
}

export function readRun(file: string): RunLine[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export async function runAssist(o: {
  model: string;
  items: ReviewItem[];
  limit?: number;
  runFile?: string;
  spendFile?: string;
  prices?: Prices;
  now?: () => Date;
}): Promise<{ called: number; skipped: number }> {
  const prices = o.prices ?? loadPrices();
  const now = o.now ?? (() => new Date());
  assertPricesFresh(prices, now());
  const runFile = o.runFile ?? runFileFor(o.model, now().toISOString().slice(0, 10));
  const runId = basename(runFile, '.jsonl');
  mkdirSync(dirname(runFile), { recursive: true });

  const cached = new Map(readRun(runFile).map((l) => [l.itemId, l]));
  let called = 0;
  let skipped = 0;
  for (const item of o.items) {
    const id = itemId(item);
    const prompt = buildPrompt(item.row, item.candidateRecord);
    const hash = promptHash(prompt);
    const hit = cached.get(id);
    if (hit) {
      if (hit.promptHash !== hash) throw new Error(`${runFile}: ${id} was cached under prompt hash ${hit.promptHash}, the prompt is now ${hash}; start a new run file`);
      skipped++;
      continue;
    }
    if (o.limit !== undefined && called >= o.limit) break;
    const r = await paidCall(
      { runId, model: o.model, estimateInputTokens: estimateInputTokens(prompt), maxOutputTokens: MAX_OUTPUT_TOKENS },
      async () => {
        const res = await callMessages({ model: o.model, maxTokens: MAX_OUTPUT_TOKENS, ...prompt });
        return { value: res, inputTokens: res.inputTokens, outputTokens: res.outputTokens };
      },
      { file: o.spendFile ?? SPEND_FILE, prices, now },
    );
    const line: RunLine = {
      at: now().toISOString(), itemId: id, model: o.model, promptHash: hash, raw: r.text, ...parseReply(r.text),
      inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicroUsd: costMicroUsd(o.model, r.inputTokens, r.outputTokens, prices),
    };
    appendFileSync(runFile, JSON.stringify(line) + '\n');
    cached.set(id, line);
    called++;
  }
  return { called, skipped };
}
