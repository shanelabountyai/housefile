# Phase 4: LLM review-assist experiment (O-1, optional)

The question O-1 left open: on the pairs the deterministic matcher sends to a person, does a model's suggestion
(`MERGE` / `KEEP_SEPARATE` / `SAME_HOUSEHOLD` plus a one-line reason) agree with the answer key and with Shane's 30
labels well enough to cut review load without a single wrong merge? The deliverable is **numbers**, not a feature.
The matcher stays the product path unless the pre-registered rule (P-4) is met, and even then Phase 4 changes nothing
in `src/`. The decision to adopt would be its own `docs/decisions.md` entry and a later phase.

Order: prices and budget first (nothing can call before the cap exists), then the pair set and its truth, then the
prompt, then the runner, then the scorer, then one recorded run, then gate wiring. Each task writes the failing test
first. Nothing under `src/` changes except one new grep in `model:lint`.

**Written at the Phase 3 gate, 2026-10-28.** Gate: CI green run
https://github.com/shanelabountyai/housefile/actions/runs/40615505347 (vitest 62 files 472 / 472, `phase2:proof`,
`phase3:proof` OK, e2e 15 passed on the production build, phase1-gate and modules-removed green); red run
https://github.com/shanelabountyai/housefile/actions/runs/40615308383. Owner chose Phase 4 before closure (D-86).

**Donors (port before you write).** footnote `src/lib/llm/anthropic.ts` (one Messages call, plain `fetch`, no SDK, key
read at call time), `src/lib/spend/prices.ts` (prices pinned in `config/prices.json` with `checkedAt`, unknown model
throws, integer micro-USD), `src/lib/spend/budget.ts` (refuses *before* a call whose estimate would cross the cap, logs,
throws `BUDGET_EXCEEDED`). No dependency added.

## Proposals (decided 2026-10-28 as D-87, all as written)

| # | Proposal | Why | Alternative |
|---|---|---|---|
| P4-1 | **Pair set = every review item the TypeScript matcher produces in memory** for file A and file B against `crm_constituents.csv` (Phase 1 path, no database): A 55 REVIEW rows, B 33. One item per (row, candidate), ties included. Shane's 30 are a subset of A. | The same pairs `import:eval` already scores, so the baseline is the matcher's own review band and the answer key covers every item | The database review queue after commit (68 + 45 rows under D-77): larger, but needs a DB and B-after-A has no oracle (D-51) |
| P4-2 | **The model sees both records' fields only**, normalized as the matcher sees them, never the matcher's score, reasons or flags. | Measures independent signal. Showing the score invites the model to echo it, and then agreement means nothing | Two arms (blind and with reasons), which doubles the calls and splits a small sample |
| P4-3 | **Two models: one small, one mid-tier**, each id and price confirmed from Anthropic's docs on the day (O-1), written to `config/prices.json` with the date. | Shows whether size buys accuracy on this task; at about 120 items × ~1k tokens each the total is cents | One model, half the work, no size comparison |
| P4-4 | **Pre-registered success rule, written before the first call:** adopt-worthy only if, on the answer key, the assist makes **0 wrong `MERGE` suggestions** and, at whatever confidence cut it uses, **removes ≥ 30% of review items** from a person with **≥ 95% agreement** on those it removes; and agrees with Shane's 30 at least as often as the matcher's own band rules would. Otherwise the result is "no measured gain" and that is the finding. | A rule set after seeing the numbers is not a test. The bar is the matcher's own: 0 wrong merges at 17% review | Report numbers only, with no rule (honest but decides nothing) |
| P4-5 | **Responses cached to a committed JSONL** (`eval/assist/runs/<model>-<date>.jsonl`: item id, prompt hash, raw text, parsed decision, tokens, micro-USD). The scorer reads only the cache, so CI re-scores for $0 with no key and the numbers reproduce. | "Run the command; the number must come back the same" (EVAL.md) cannot hold for a live model; a frozen transcript can | Re-call in CI (costs money each push, needs a secret in CI, not reproducible) |
| P4-6 | **Caps: $10 for the whole experiment (O-1), $2 per run**, integer micro-USD, checked before every call against the summed spend log. | O-1's hard cap; a per-run cap stops one bad loop from spending the lot | Experiment cap only |

## Tasks

- [x] **4.1 Prices and key.** *(done 2026-10-28, D-88)* Load the `claude-api` skill, confirm the two model ids and per-MTok prices from Anthropic's docs, write `config/prices.json` (`checkedAt`, `models`). Add `ANTHROPIC_API_KEY=` (empty) to `.env.local` after `git check-ignore`; the owner pastes the value. `.env.example` gets the name only. *Acceptance:* an unknown model id throws naming the file; a price older than 60 days fails `assist:run` before any call.
- [x] **4.2 Spend and budget (port from footnote).** *(done 2026-10-28, D-89)* `experiments/assist/spend.ts`: `costMicroUsd`, `assertWithinCap(estimate)` against `eval/assist/spend.jsonl` (append-only), caps from P4-6. *Acceptance:* a call whose estimate would cross either cap is refused **before** `fetch` runs (test with a fetch that throws if called); integers only (`money:lint` extended to `experiments/`); the log line carries model, tokens and micro-USD.
- [x] **4.3 Pair set and truth.** *(done 2026-10-28, D-90)* `tools/assist_truth.py` (stdlib, oracle) writes `eval/assist/truth.csv`: per item `row_id, candidate, truth` (`MERGE` when the answer key links the row to that candidate's person, `SAME_HOUSEHOLD` when only the household matches, else `KEEP_SEPARATE`) and Shane's label where one exists. TypeScript `reviewItems()` (in `experiments/assist/`, reusing the Phase 1 pipeline) must list exactly the same items. *Acceptance:* item counts per file equal the oracle; `fixtures:check` style verify prints OK; the truth rule recorded in `docs/decisions.md`.
- [x] **4.4 Prompt (pure).** *(done 2026-10-29, D-91)* `buildPrompt(row, candidate)`: a fixed system prompt, both records' fields as escaped, tagged data (fixture text is untrusted; footnote's `escapeTags` pattern), the three labels, strict JSON out `{decision, reason}`. *Acceptance:* a leak test fails if any answer-key column name or value (`true_person_id`, `household_id` from the key, `defects`, `trap`, `P0…` ids) or the matcher's score or reasons appears in any prompt; snapshot of one prompt; the prompt hash is stable.
- [x] **4.5 Runner.** *(done 2026-10-29, D-92)* `npm run assist:run -- --model <id> [--limit n]`: temperature 0, one call per item through the ported `callMessages`, cap checked before each call, strict parse (an unparseable reply is an `ABSTAIN`, never retried into a different answer), append to the run's JSONL, resume skips items already cached. *Acceptance:* tests with a stubbed `fetch`: cap refusal, abstain on bad JSON, resume calls nothing twice, the key is never logged.
- [ ] **4.6 Scorer.** `npm run assist:eval` reads only `eval/assist/runs/*.jsonl` and `truth.csv`: per model a confusion matrix against the answer key and against Shane's 30, wrong `MERGE` count, abstains, review items removable at each confidence rule with agreement on them, cost per item and total, and the P4-4 verdict line. *Acceptance:* a hand-made 6-item cache gives a known matrix; the verdict line flips when one wrong `MERGE` is planted.
- [ ] **4.7 The run.** Run both models over all items within the caps, commit the JSONL, write `docs/EVAL.md` → *Phase 4* (the table, the verdict, spend against the cap, what the numbers do not show: synthetic data, one fixture author, n ≈ 88 rows) and a `docs/decisions.md` entry with the verdict. *Acceptance:* `assist:eval` reproduces every number in EVAL.md from the committed cache.
- [ ] **4.8 Gate wiring.** CI runs `assist:eval` from the cache (no key in CI); `model:lint` also fails if anything under `src/` imports `experiments/` or names `api.anthropic.com`; Phase 1–3 gates unchanged. *Acceptance:* a red run (a planted `import` of `experiments/assist` in `src/matching/`) and a green run linked in `NEXT.md`.

**Exit criteria:** P4-4's verdict is computed and recorded, with every number reproducible from the committed cache;
total spend ≤ $10 and logged per call; no file under `src/` calls a model or imports `experiments/`; the Phase 1–3
gates are still green; CI enforces it. Then closure (definition of done: exec brief, LinkedIn posts, cost review;
DEMO.md exists).
