// The one Anthropic Messages call for the Phase 4 experiment (task 4.5). Ported from footnote
// `src/lib/llm/anthropic.ts` (plain fetch, no SDK, key read at call time) with thinking turned off per model, and footnote's
// `fetchWithRetry` (src/lib/retrieval/voyage.ts) inlined: a 429 is not billed, so waiting it out is not a second
// paid call. The key goes only into the x-api-key header; no message or log line here carries it.
const URL = 'https://api.anthropic.com/v1/messages';

export function anthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set — paste it into .env.local');
  return key;
}

// ponytail: fixed sleep unless Retry-After says otherwise, 10 tries; token-aware pacing if limits ever bite.
async function fetchWithRetry(call: () => Promise<Response>, tries = 10, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  for (let attempt = 1; ; attempt++) {
    const res = await call();
    if (res.status !== 429 || attempt >= tries) return res;
    await res.text();
    await sleep((Number(res.headers.get('retry-after')) || 20) * 1000);
  }
}

// Haiku 5.5 and Sonnet 5.5 reject any non-default temperature (400), so there is no sampling knob; the committed run
// file is what makes the experiment reproducible (D-94). Thinking is off so the 200-token cap holds only the reply:
// Haiku 5.5 takes `disabled` (default effort `medium`), Sonnet 5.5 rejects it and turns thinking off with `between_tools`.
export const THINKING_OFF: Record<string, { type: string }> = {
  'claude-haiku-5-5': { type: 'disabled' },
  'claude-sonnet-5-5': { type: 'between_tools' },
};

/** One non-streaming call with thinking off; returns the joined text blocks and the billed token counts. Throws on a non-2xx reply. */
export async function callMessages(m: { model: string; maxTokens: number; system: string; user: string }) {
  const key = anthropicKey();
  const thinking = THINKING_OFF[m.model];
  if (!thinking) throw new Error(`no thinking-off setting for ${m.model} — add it to THINKING_OFF`);
  const res = await fetchWithRetry(() => fetch(URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: m.model, max_tokens: m.maxTokens, thinking, system: m.system, messages: [{ role: 'user', content: m.user }] }),
  }));
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number } };
  return { text: body.content.filter((b) => b.type === 'text').map((b) => b.text).join(''), inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens };
}
