# NEXT

## ▶ Next session: closure deliverables 2-4. DEMO.md is done (Phase 4 stop 13, assist:eval run and verified).
Phase 4 gate: PASSED 2026-10-30 (model:lint, money:lint, write:lint, fixtures:check, assist:eval rc 0; verdict NO MEASURED GAIN both models; spend 241004 micro-USD of 10000000 cap).
Remaining, in order: (2) exec brief via `exec-brief` skill, scope honesty near the top (synthetic, negative AI result, not deployed); (3) LinkedIn posts into the Ledger (mine Defects Found / Hardest Bug; the NO MEASURED GAIN result is a post); (4) cost review: ANTHROPIC_API_KEY in .env.local bills only on `assist:run`, nothing scheduled, no deploy, record keep/off + restore note in docs/decisions.md.
Record every artifact URL here.

**2026-10-30 closure item 2 DONE.** Exec brief: https://claude.ai/artifact/3rVWkDhCKMPAL89t1xRJxf (private until shared; no screenshots, project has no capture spec; numbers re-run today: vitest 68 files / 506, import:eval 0 wrong auto-merges in 434, recall A 0.9464 / B 0.9548). Remaining: (4) cost review.
**2026-11-02 closure item 3 DONE.** Ledger posts #141 (AI: assist NO MEASURED GAIN, $0.24) and #142 (Scale: 4/3/51 became 2051) added to https://claude.ai/artifact/Ai5xKScgT2sWtqXRQ1ZA8i, source = the brief, tech null (no technical write-up). "Housefile" added to the page's project list (ledger v76). Held for later: threshold post (D-41/D-77), fingerprint-undo post (D-12/13/64).

---

## ▶ Next session: Phase 4 gate, then closure. Check the Phase 4 exit criteria in `docs/phase-4-tasks.md` (all met as of 4.8), then the definition-of-done deliverables: `docs/DEMO.md` updated for Phase 4 (the `assist:eval` stop), the exec brief (`exec-brief` skill), LinkedIn posts into the Ledger, and the cost review (`ANTHROPIC_API_KEY` in `.env.local` bills only on `assist:run`; nothing scheduled; no deploy). Record every artifact URL here.

**2026-10-30 task 4.8 DONE (D-95). Phase 4 tasks complete (4.1–4.8).** `model:lint` scans all of `src/` (`.ts`/`.tsx`) for a quoted `experiments/` path or `api.anthropic.com`; CI `phase1-gate` runs `assist:eval` with no key.
- **Red run:** https://github.com/shanelabountyai/housefile/actions/runs/41091908999 (draft PR #8, closed, branch deleted): planted `export { LABELS } from '../../experiments/assist/prompt'` in `src/matching/model.ts` → `model:lint FAIL src/matching/model.ts:94`; the `ci` job stayed green, so only this lint catches it.
- **Green run:** https://github.com/shanelabountyai/housefile/actions/runs/41091891903 (`710e3e0`): ci, phase1-gate, modules-removed green; `assist:eval` prints Haiku and Sonnet NO MEASURED GAIN, same numbers as D-94.
- Local red-check also caught a bug in the new scan: the comment stripper ate `//` in `https://`, so a planted host URL passed. Fixed; planted URL and `import()` now exit 1, a comment naming the host passes.

---

## ▶ Next session: task 4.8 — Gate wiring (CI runs `assist:eval` from the cache with no key; `model:lint` fails on `src/` importing `experiments/` or naming `api.anthropic.com`; red + green run linked here); read its entry in `docs/phase-4-tasks.md`. Then the Phase 4 gate and closure (exec brief, posts, cost review).

**2026-10-30 task 4.7 DONE (D-94). Verdict: NO MEASURED GAIN for both models.** 98 items × 2 models, run files committed (`eval/assist/runs/*-2026-10-30.jsonl`). Haiku: wrong MERGE **1**, merge-only removes 64.3% at 98.4%, Shane 22/28, $0.011. Sonnet: wrong MERGE **2**, merge-only 80.6% at 97.5%, Shane 27/28, $0.230. Both fail only P4-4's 0-wrong-merge clause (`B:B-0024:C0271` SR suffix, both; `B:B-0175:C0173`, Sonnet; truth SAME_HOUSEHOLD). Spend 241004 micro-USD over 196 calls, `spend.jsonl` Σ == run files. Call shape changed: both models 400 on `temperature`, so it is gone; thinking off via `disabled` (Haiku) / `between_tools` (Sonnet); unknown model refuses. Table and caveats in `docs/EVAL.md` → Phase 4. Gate: `tests/unit/assist` 34/34, `model:lint`, `money:lint`, `write:lint`, `fixtures:check`, `import:eval`, `tsc`, eslint exit 0. Full vitest not re-run (no `src/` change). Cost review note for closure: the API key in `.env.local` bills only when `assist:run` is invoked; nothing scheduled.

---

## ▶ Next session: task 4.7 — The run (both models over all 98 items, commit the JSONL, `docs/EVAL.md` → Phase 4, a decisions entry with the verdict); read its entry in `docs/phase-4-tasks.md`. **Needs `ANTHROPIC_API_KEY` pasted into `.env.local` first** (owner).

**2026-10-29 task 4.6 DONE (D-93).** `npm run assist:eval` (`experiments/assist/score.ts`): per run file, a confusion matrix against the key and against Shane's 28, wrong MERGE, abstains, rules `merge-only` / `non-merge-only` / `any-label` with removal and agreement, cost, and `P4-4 <run>: PASS | NO MEASURED GAIN | INCOMPLETE`. A missing item makes the run INCOMPLETE. The matcher's Shane agreement on items is 0 by construction (all REVIEW), so P4-4's binding clauses are 0 wrong merges and 30% at 95%. Exit 0 on any verdict, 1 on a malformed file; prints `0 run files` today. Tests `tests/unit/assist/score.test.ts` 8/8 (34/34 in `tests/unit/assist/`), 10/10 mutations killed. Gate: `model:lint`, `money:lint`, `write:lint`, `fixtures:check`, `import:eval` exit 0, `tsc`, eslint OK. Full vitest not re-run (no `src/` change). 4.8 wires `assist:eval` into CI.

---

## ▶ Next session: task 4.6 — Scorer (`npm run assist:eval`, reads only `eval/assist/runs/*.jsonl` + `truth.csv`); read its entry in `docs/phase-4-tasks.md`

**2026-10-29 task 4.5 DONE (D-92).** `npm run assist:run -- --model <id> [--limit n] [--date YYYY-MM-DD]`: `experiments/assist/run.ts` `runAssist` → `paidCall` → `experiments/assist/anthropic.ts` `callMessages` (footnote port, temperature 0, 429 retry inlined). Run file `eval/assist/runs/<model>-<date>.jsonl`, one line per item keyed `file:rowId:candidate` with `promptHash`, `raw`, `decision`, `reason`, tokens, `costMicroUsd`. Strict parse: exactly `{decision, reason}` or `ABSTAIN` (fenced replies too), never re-called; resume skips cached items, refuses a cached item under a different prompt hash. 4.6 should treat `ABSTAIN` as "left with a person" and count it. Tests `tests/unit/assist/run.test.ts` 8/8 (26/26 in `tests/unit/assist/`), 6 of 7 mutations killed (7th equivalent, code deleted). CLI smoke-tested with the empty key: clean refusal, exit 1, nothing written. Gate: `model:lint`, `money:lint`, `write:lint`, `fixtures:check`, `import:eval` exit 0, `tsc`, eslint OK. Full vitest not re-run (no `src/` change). `ANTHROPIC_API_KEY` still empty in `.env.local`; needed at 4.7 only.

---

## ▶ Next session: task 4.5 — Runner (`npm run assist:run`, port footnote `src/lib/llm/anthropic.ts`); read its entry in `docs/phase-4-tasks.md`

**2026-10-29 task 4.4 DONE (D-91).** `experiments/assist/prompt.ts`: `buildPrompt(row, candidate)` → `{system, user}` (two tagged blocks, 14 `field: value` lines each, no record ids, footnote `escapeTags`), `promptHash`, `LABELS`. **98 items → 90 distinct prompts**; the 8 repeats all share truth MERGE. 4.5 must cache by item id (not prompt hash alone) and store `promptHash` per line. Output is `{decision, reason}` with no confidence field, as the task entry says; 4.6's confidence rules are over the decision. Tests `tests/unit/assist/prompt.test.ts` 4/4 (18/18 in `tests/unit/assist/`), 3 mutations killed. Gate: `model:lint`, `money:lint`, `fixtures:check`, `import:eval` exit 0, `tsc`, eslint OK. Full vitest not re-run (no `src/` change). `ANTHROPIC_API_KEY` still empty in `.env.local`; 4.5's tests stub `fetch`, the key is needed only at 4.7.

---

## ▶ Next session: task 4.4 — Prompt (pure) `buildPrompt(row, candidate)`; read its entry in `docs/phase-4-tasks.md`

**2026-10-28 task 4.3 DONE (D-90).** Item = (REVIEW row, candidate tied at its best score): **A 61, B 37 = 98 items** (55 + 33 rows plus 10 tie items). `tools/assist_truth.py` writes `eval/assist/truth.csv` (`file,row_id,candidate,truth,shane_label`); `--check` now runs in `fixtures:check`. Truth: **87 MERGE / 11 SAME_HOUSEHOLD / 0 KEEP_SEPARATE** — an always-MERGE assist scores 89% and makes 11 wrong merges, so P4-4's 0-wrong-merge bar is what binds. **Shane's labels on items: 28, not 30** (A-0064, A-0185 auto-merge since D-43). `experiments/assist/items.ts` `reviewItems()` returns both `MatchRecord`s as scored, ready for 4.4's prompt. `reference_matcher.run_file` got an optional `review_items` collector; its stdout is byte-identical. Tests `tests/unit/assist/items.test.ts` 3/3 (14/14 in `tests/unit/assist/`), tie mutation killed, tampered truth.csv caught. Gate: `model:lint`, `fixtures:check` (incl. assist truth OK), `import:eval` exit 0, `money:lint`, `tsc`, eslint OK. Full vitest not re-run (no `src/` change).

---

## ▶ Next session: task 4.3 — Pair set and truth (`tools/assist_truth.py` + TS `reviewItems()`); read its entry in `docs/phase-4-tasks.md`

**2026-10-28 task 4.2 DONE (D-89).** `experiments/assist/spend.ts`: `costMicroUsd` (integer, rounds up, throws above Haiku's 100K tier), `assertWithinCap` over `eval/assist/spend.jsonl` (caps 10000000 / 2000000 micro-USD, refusal logged and counts nothing, exactly-at-cap allowed), `paidCall(call, send)`: check, then send, then one log line. **4.5 must route every call through `paidCall`.** `money:lint` walks `experiments/` with `micro` as a money word (red-checked with a planted `* 0.5`). Tests `tests/unit/assist/spend.test.ts` 8/8 (11/11 with prices), 5 mutations killed. Gate: `model:lint`, `fixtures:check`, `import:eval` exit 0, `money:lint`, `write:lint`, `tsc`, eslint OK. Full vitest not re-run (no `src/` change).

---

## ▶ Next session: task 4.2 — Spend and budget (port footnote `src/lib/spend/budget.ts`); read its entry in `docs/phase-4-tasks.md`

**2026-10-28 task 4.1 DONE (D-88).** `config/prices.json` (checked 2026-10-28 against Anthropic's pricing page): `claude-haiku-5-5` 100000 / 500000 and `claude-sonnet-5-5` 2000000 / 10000000 micro-USD per MTok (Haiku tier ends at 100K-token prompts). `experiments/assist/prices.ts`: `priceFor` (unknown id throws naming the file), `assertPricesFresh` (> 60 days refuses; 4.5 must call it before the first call). `tests/unit/assist/prices.test.ts` 3/3, INV-14 green. `ANTHROPIC_API_KEY=` is an empty line in `.env.local` — **owner pastes the key before 4.7**; `.env.example` carries the name as a comment because INV-14 ties live names to template-owned `src/core/env.ts`. Gate: `model:lint` OK, `fixtures:check` OK, `import:eval` exit 0, `money:lint` OK, `tsc` clean. 4.2 note: extend `money:lint` to `experiments/`; the price fields are named `…MicroUsdPerMTok`, not `cents`/`amount`, so widen its MONEY pattern to `micro` too.

**2026-10-28 Phase 3 gate: owner chose Phase 4 before closure (D-86).** `docs/phase-4-tasks.md` written: 8 tasks, 6 proposals, all accepted as written (D-87). Donors: footnote `src/lib/llm/anthropic.ts`, `src/lib/spend/prices.ts`, `src/lib/spend/budget.ts`. Closure (exec brief, posts, cost review) follows the Phase 4 gate.

**2026-10-27 task 3.11 DONE (D-85). Phase 3 complete (3.1–3.11).**
- `npm run phase3:proof` (`scripts/phase3-proof.ts`, CI step after `phase2:proof`): seed with Phase 3 data, stateHash `c2159b32…` == fixture in memory → roll-ups (total **$375,725.00 / 929 / 255, avg 40444 r 24**), campaigns, funds and 6 segments (lybunt **86**) == `answers.json` → commit A → raised **+9,962,500** == A's written gifts, campaigns unchanged → **1227** letters, Σ == raised, 0 outbox → correct G00933 +1234 → exactly **L0930** stale → undo A → stateHash == beforeHash `c2159b32…`, roll-ups == oracle again. About 7 s locally. Transcript in `docs/EVAL.md` → Phase 3.
- **Green run:** https://github.com/shanelabountyai/housefile/actions/runs/40615505347 (`38c6e80`): ci (vitest 62 files **472 / 472**, `phase2:proof`, `phase3:proof OK`, e2e **15 passed** on the production build), phase1-gate, modules-removed all green.
- **Red run:** https://github.com/shanelabountyai/housefile/actions/runs/40615308383 (draft PR #7, closed, branch deleted): `average: n ? raised / n : 0` → `phase3:proof FAILED: roll-ups: total == answers.json` (40444.0258… != 40444), plus 4 roll-up tests red. `money:lint` passes that change; the oracle comparison is what catches it (recorded in D-85).
- **CI `modules-removed` was red since task 3.8** (the deleted notifications module broke `db.outbox` in the letters test). Fixed: `REQUIRED_MODULES = ['notifications']` per D-5; billing still deleted.
- `npm run demo:setup [-- slug]` + `docs/DEMO.md`, walked end to end on `npm run dev` (every page, upload/commit A, 68 open rows, 1227 letters, undo hash ==, 298 stale, CLI merge then page unmerge with both hashes ==). Local dev DB now holds orgs `demo` (used) and `demo-check` (used); a fresh demo takes `npm run demo:setup -- demo2`.
- `fixtures:check` already covered Phase 3 (task 3.1); the e2e step already ran the Phase 3 specs; both unchanged.
- Uncommitted on purpose: a `CLAUDE.md` block that `next dev` writes (nextjs-agent-rules). Commit it or leave it; it comes back after every `next dev`.
- Gate (local): typecheck, lint (6 old warnings), `write:lint`, `money:lint`, `model:lint`, `fixtures:check`, `import:eval` OK, `foundation:check-modules` OK, `phase3:proof:test` OK. Full vitest and e2e run in CI (above), not locally.

---

## ▶ Next session: task 3.11 — Gate wiring; read its entry in `docs/phase-3-tasks.md`

**2026-10-27 task 3.10 DONE (D-84).** Pages under `src/app/o/[org]/`: `constituents` (+ `[id]`: fields with source/as-of, aliases, household, gift chains with superseded rows struck through and their reason, pledge balances, soft credits and recognition, merge history, unmerge button with blocked state and both hashes after), `gifts` (as-of, date range, fund, campaign filters; totals are `rollups` over the filtered gifts; by-date totals; `gifts.csv`), `campaigns`, `segments` (+ `[key]`: definition, run, count, members, run time), `letters` (banner, queue form, QUEUED / LETTER_STALE, body on `?letter=`). Actions: `unmergeMerge`, `runSegmentAction`, `queueLettersAction`, each one call into `unmerge` / `runSegment` / `queueLetters`.
- `e2e/crm-pages.spec.ts` (serial, one test per page, seeded Phase 3 org): gift list total **$375725.00 / 929 gifts / 255 donors** and every fund, GEN and AF2025 filters equal `answers.json`, CSV sums to the total; campaign and fund rows equal the oracle; lybunt run count **86** equals the reference, members listed; 929 letters queued, 0 outbox rows, member has no queue form; a correction strikes the old row with its reason and stales exactly 1 letter; H0001 name, PL002 balance, soft credit shown; merge C0005/C0006 then unmerge from the page with both hashes `==` their snapshots, member has no button. 5 / 5.
- Caught by the harness: a Zod regex on `asOf` ran before the ownership check, so a foreign segment id was a form error, not not-found (INV-02); `asOf` is now checked by `runSegment`. Two pages first awaited `params`, not `requireOrg` (FR-06).
- Playwright's loader cannot import JSON the commit layer reads; correction, merge and segment saves run via `scripts/e2e-crm-ops.ts` under tsx.
- Seams: no pagination (gifts, letters), no segment editor, no gift correct/void button, no household or campaign detail page.
- Gate (local): `npm test` 62 files **472 / 472**, typecheck, lint (6 old warnings), `fixtures:check`, `model:lint`, `money:lint`, `write:lint` OK, `import:eval` drift 0 rows, `foundation:drift` clean v1.3.0, INV harness 14 / 14 (its 180 s timeout needs a quiet machine: it timed out at load average 50-66 from another project), e2e spec 5 / 5. The rest of the e2e suite was not re-run.

---

## ▶ Next session: task 3.10 — Constituent, gift, campaign, segment and letter pages; read its entry in `docs/phase-3-tasks.md`

**2026-10-27 task 3.9 DONE (D-83).** `/o/[org]/imports` (upload with as-of date, batch list), `/imports/[batch]` (map, correct-the-map form, totals, full report, `preview.csv`, commit, written counts, undo state and proof line), `/o/[org]/review` (filters by batch and flag, `?decided=` notice) and `/review/[batch]/[row]` (import row beside each candidate, reasons, flags, the four actions with a reason). Actions in `imports/actions.ts` and `review/actions.ts` call `previewBatch` / `commitBatch` / `undoBatch` / `decideReview` only. Undo "blocked or available" is the real `undoBatch` rolled back at the proof step.
- `e2e/imports-review.spec.ts` (fresh org per run, rows stay in the test DB): import A through the UI, batch page counts = `phase2:proof` A line (**71 constituents, 172 versions, 298 gifts, 246 merges, 74 items over 68 rows**, rows 68 not 55 since D-77), one MERGE (refused without a reason first), KEEP_SEPARATE, SAME_HOUSEHOLD, DEFER, undo with state hash == before hash `7d3bd174…`, a `member` sees the queue and the pair but no buttons and no upload form. Passes (about 10-25 s quiet; waits are 120 s because the preview/commit are slow under load, load average hit 67 from another project's vitest).
- Harness: `tests/fixtures/app.ts` now seeds a batch and a review item per org (fixed ids); cross-org ids are `notFound()`; the upload `File` passes through `z.looseObject`.
- Seams: map not saved per source, no queue pagination, a committed batch page runs an undo dry-run per load.
- Gate (local): `npm test` 62 files **472 / 472**, typecheck, lint (old warnings), `fixtures:check`, `model:lint`, `money:lint`, `write:lint` OK, `import:eval` drift 0 rows, labels 30 / 30, `foundation:drift` clean v1.3.0, e2e spec 1 / 1. The rest of the e2e suite was not re-run.

---

## ▶ Next session: task 3.9 — Import and review pages; read its entry in `docs/phase-3-tasks.md`

**2026-10-27 task 3.8 DONE (D-82).** `Letter` table (migration `20261027220000_letters`): clone-owned, append-only trigger, one recipient (constituent, or household when combined; CHECK), `giftRefs` + the `giftIds` rendered from (CHECK same length), `totalCents` > 0, `asOf`, rendered subject/body, status `QUEUED` only. Pure `planLetters` / `renderLetter` / `isStale` in `src/letters/letters.ts`; `queueLetters` (results.write, serializable, one `letters.queue` audit row) and `loadLetters` (derives `LETTER_STALE`: a covered giftRef's current row ≠ rendered row) in `src/commit/letters.ts`. `Letter` added to `write:lint`'s guarded models. Letters are not in the state hash; Phase 2 proofs unchanged.
- Measured on the Phase 3 fixture at asOf 2026-10-14: **929** per-gift letters, Σ **$375,725.00** = Σ active gifts; combined: **212** household letters (every constituent has a household), each Σ = `phase3_answers.py` givingCents.
- Tests: `tests/unit/letters.test.ts` (per gift, household Σ = oracle, window/asOf, banner + fixed sentence + IRS note, stale rule, no-send import grep red on 4 planted lines), `tests/integration/housefile-letters.test.ts` (member refused, BAD_AS_OF/BAD_WINDOW, DB letters = plan, re-queue writes none, correction then void stale exactly those letters, combined H0001 675000 stale after one member gift corrected, UPDATE/DELETE/two-null-recipient refused, Outbox and CapturedMessage counts unchanged). Mutation-checked 6: 5 killed, 1 equivalent (voided heads dropped from the stale map still reads stale).
- Seams: re-issuing a stale letter, address block, title-casing folded names, fiscal-year scopes.
- Gate (local): `npm test` 62 files **472 / 472**, typecheck (+phase1), lint, `fixtures:check`, `model:lint`, `money:lint`, `write:lint` OK, `import:eval` drift 0 rows, labels 30 / 30, `phase2:proof:test` OK (2c035193…/7d3bd174…/9eab0c8a…/5af937d9… unchanged). Migration applied to test and local dev DBs.

---

## ▶ Earlier: task 3.8 — Acknowledgement letters; read its entry in `docs/phase-3-tasks.md`

**2026-10-27 task 3.7 DONE (D-81).** `SoftCredit` is now an append-only chain like `Pledge` (migration `20261027180000_soft_credits`: `softCreditRef`, `role`, own `amountCents`, `status` ACTIVE/REMOVED, supersedes, reason, one writer, triggers). `addSoftCredit` / `removeSoftCredit` in `src/commit/soft-credits.ts` (audited, refusals listed in D-81); `loadSoftCredits` in `src/import/crm.ts`; `seedFixtures(..., softCredits)`; pure `recognition(state, asOf)` in `src/derive/recognition.ts`. **Phase 3 seed hash `c2159b32…83fe3f`** (was `b405b676…`; memory == DB); Phase 1 `7d3bd174…` unchanged. Merge moves the soft credits naming the loser (`softCreditsMoved`, Phase 2 seam closed; snapshot `softCreditRefs` in `snapshotHash` when non-empty); unmerge moves exactly those back; batch undo restores them (`reverted.softCreditsRestored`). New rule: a soft credit naming its gift's hard donor counts nothing (D-81).
- Tests: `tests/unit/recognition.test.ts` (recognition = `answers.json`, raised totals unchanged by soft credits, void/after-asOf/self-credit excluded), `tests/integration/housefile-soft-credits.test.ts` (seed hash, DB recognition = oracle, add/remove + refusals + audit, void drops soft, merge/unmerge of C0271's 8 soft credits with both snapshot hashes equal and state hash back, batch undo, UPDATE/DELETE refused). Mutation-checked 8 (merge move, unmerge move-back, undo restore, snapshot hash, recognition active and self filters, loader REMOVED filter, hard-donor guard): all killed.
- Seams: no soft-credit amount cap vs the gift, no role vocabulary, imports never write soft credits.
- Gate (local): `npm test` 60 files **464 / 464**, typecheck (+phase1), lint (old warnings only), `fixtures:check`, `model:lint`, `money:lint`, `write:lint` OK, `import:eval` drift 0 rows, labels 30 / 30, `phase2:proof:test` OK (9eab0c8a…/5af937d9…/6af1c76a… unchanged). Migration applied to test and local dev DBs.

---

## ▶ Next session: task 3.7 — Soft credits; read its entry in `docs/phase-3-tasks.md`

**2026-10-27 task 3.6 DONE (D-80).** `Pledge` table (append-only chain like `Gift`, migration `20261027120000_pledges`), `Gift.pledgeRef`; `loadPledges` in `src/import/crm.ts`; `seedFixtures(..., pledges)`; pure `pledgeBalances(state, asOf)` in `src/derive/pledges.ts`. Pledges and `pledgeRef` enter the state hash only when present: `7d3bd174…` unchanged; **Phase 3 seed hash `b405b676…fe853`** (memory == DB). Merge moves the loser's pledges (snapshot `pledgeRefs`, in `snapshotHash` when non-empty); unmerge moves them back; batch undo restores a pledge moved by a pair-memory review MERGE (`reverted.pledgesRestored`).
- Tests: `tests/unit/pledges.test.ts` (18 balances = `answers.json`, void +cents, after-asOf payment not counted, empty pledges hash unchanged), `tests/integration/housefile-pledges.test.ts` (seed hash, DB balances = oracle, void PL001 payment, merge/unmerge PL002 with both snapshot hashes equal and state hash back, batch undo, UPDATE/DELETE refused). Mutation-checked 6 (merge move, unmerge move-back, pledgeRef carry, asOf filter, snapshot hash, undo restore): all killed.
- Seams: no scheduler/reminders, no pledge correction or write-off, imports never write pledges.
- Gate (local): `npm test` 58 files **458 / 458**, typecheck, lint (3 old warnings), `fixtures:check`, `model:lint` (40312dfe…), `money:lint`, `write:lint` OK, `import:eval` drift 0 rows, labels 30 / 30, `phase2:proof:test` OK (unmerge snapshot hashes 9eab0c8a…/5af937d9…/6af1c76a… unchanged).

---

## ▶ Next session: task 3.6 — read its entry in `docs/phase-3-tasks.md`

**2026-10-27 task 3.5 DONE (D-79).** `correctGift` / `voidGift` in `src/commit/gifts.ts`: one superseding row via the shared `supersedeGift` (patch widened to amount, date, fund), writer = actor, reason required, `results.write`, audited in the same serializable transaction. `tests/integration/housefile-gift-correction.test.ts`: original row unchanged, chain length 2, roll-ups move by exactly +1234 (amount), fund move shifts the whole amount with the total unchanged, void drops raised by the amount and gifts by 1; member, blank reason, zero/negative/fractional amount, bad date, unknown fund, no-op change, unknown ref and an already-voided gift all refused with no gift or audit row; UPDATE/DELETE still refused on every chain row. Mutation-checked (role check, `> 0`, voided guard, no-op guard, void status): all 5 fail.
- Seams: appeal not correctable; zero/negative still held (D-57).
- Gate (local): `npm test` 56 files **451 / 451**, typecheck, lint (3 old warnings), `fixtures:check`, `model:lint`, `money:lint`, `write:lint` OK, `import:eval` drift 0 rows.

---

## 2026-10-26 owner follow-up on PR #5 (D-77, D-78) — done

- **D-55 → re-queue for a person (D-77).** A planned auto-merge (score ≥ 70) into an earlier row that is itself in review no longer follows it. Commit writes it as its own review row, flag `TARGET_IN_REVIEW` (replaces `PLANNED_MERGE`); `decideReview` refuses it `CANDIDATE_PENDING` until the target row is decided, then it is an ordinary item against what that row became and a person decides it. `followPending`, `followed` and the `review.follow` audit event are gone. Plan, `planHash`, matcher and `decisions_*.csv` unchanged; only the report wording for those rows changed.
- **Measured** (`phase2:proof:test`, which now derives and checks rows-for-a-person = REVIEW + pending MERGE rows): A **55 → 68** rows (13.8% → 17.0%), B after A **39 → 45** (15.6% → 18.0%); review items unchanged (74, 49); merges at commit unchanged (246, 174), **0 wrong** against the answer keys in each (scratch script, outside the repo); all 19 re-queued rows are truly the target row's person, so this costs 19 decisions and changes no outcome on the fixture. Commit/undo hashes unchanged. `import:eval` drift 0 rows.
- **D-34..D-40 → resolved, owner decision 2026-10-26, as built (D-78).** D-34 stays sequential. Stale "provisional" wording removed from `src/import/resolve.ts`, `tests/unit/import/eval.test.ts`, `import/synonyms.json`.
- Gate and CI: see PR #5 body ("Owner follow-up 2026-10-26").
- Sandbox notes: `npm ci` needs `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true`; migrations applied with `psql -f`; `foundation:drift` needs the `v1.3.0` tag fetched from `shanelabountyai/saas-foundation`; `foundation:check-modules` fails locally on the base branch too (needs `rsync`), CI runs it.

---

## ▶ Earlier: task 3.4 — Segments as data (D-16, D-27, P-10, P-11)

**2026-10-25 task 3.3 DONE (dad4539).** `src/derive/rollups.ts`: pure `rollups(state, asOf, campaignOf)` → `{ total, campaigns{…appeals}, funds{…appeals} }`, `(no appeal)` only under funds (D-70). Campaign read through the appeal: `loadAppealCampaigns(tx, orgId)` in `db-state.ts`, `phase3CampaignOf()` in memory (**D-75**, the third argument; `EffectiveGift` unchanged so no hash moved). Average = `(raised − raised mod n) / n`. Tests: `tests/unit/rollups.test.ts` (campaigns/funds/total = `answers.json`, total 37572500 / 929 gifts / 255 donors / avg 40444 r 24; Σ rows tie), `tests/integration/housefile-rollups.test.ts` (seeded Phase 3 org = oracle; file A → `(no appeal)` per fund = plan's written gifts; undo → roll-ups back). Mutation-checked: `Math.round` average and guessing no-appeal gifts into a campaign both fail.
- The DB test seeds the *corrected* Phase 3 gifts as plain rows (`phase3SeedGifts`); corrections as superseding rows come with 3.5, whose acceptance ("roll-ups move by exactly the difference") should reuse `view()` from this test.
- Gate (local): `npm test` 53 files **444 / 444**, typecheck, lint, `fixtures:check`, `model:lint` (40312dfe…), `money:lint`, `write:lint` OK, `import:eval` drift 0 rows, labels 30 / 30.

**Next:** 3.4 — `segments/schema.json`, pure `evaluateSegment(def, state, asOf)` against `answers.json` `segments` and `segments/reference/*.json` (6), `SegmentDefinition`/`SegmentRun` tables, refusal codes, grep lint over `src/segments/`. Model: Opus (schema + migration + run hash).

---

## ▶ Earlier: task 3.3 — Campaign and fund roll-ups (D-28, P-12)

**2026-10-24 task 3.2 DONE.** `src/derive/households.ts`: pure `householdMembers`, `householdName`, `householdGiving(state, id, window?)` over `EffectiveState`. `tests/helpers/phase3.ts` builds the Phase 3 fixture as in-memory effective state (CRM + pledge payments, corrections applied, ≤ asOf); 3.3 reuses it with `answers`. Tests: `tests/unit/households.test.ts` (all 236 `H…` names/members/totals equal `answers.json`; H0001 "Zoë Rivera and Victoria Whitfield" 675000), `tests/integration/housefile-households.test.ts` (SAME_HOUSEHOLD: "The Smith Household" 250000 → "Mary Smith and John Whitfield" 254000; undo → name, total and state hash back). Mutation-checked: dropping N1 folding and an off-by-one cent both fail.
- Note: the fixture has no household whose surnames differ only in case or accents, so the oracle comparison alone does not cover N1 folding. The hand-built `GARCÍA-LOPEZ` case covers it.
- Gate (local): typecheck, lint, `fixtures:check`, `model:lint` (40312dfe…), `money:lint`, `write:lint` all OK. `import:eval` labels 30 / 30. Full `npm test` **not completed locally**: load average 57 from another project's vitest sweep (`alongside/backend`) timed out `inv-01-04-22` "passes INV-01/02/03/04/22" (180 s). The 2 failures after it were cascade. That file passes alone (14/14, 102 s). CI run 40113687547 on `006bc0c`: **green** (full suite).

**Next:** 3.3 — `rollups(state, asOf)` against `answers.json` `campaigns`/`funds`/`total`; then file-A `(no appeal)` per fund on the DB. Model: Opus (money roll-up; the DB half touches commit).

---

## ▶ Earlier: task 3.2 — Households (D-8)

**2026-10-23 task 3.1 DONE.** `tools/build_phase3_fixtures.py` → `fixtures/phase3/` (18 pledges, 54 payments G00879+, 42 soft credits, 9 corrections; twice in separate dirs, identical bytes), `tools/phase3_answers.py` → `fixtures/phase3/answers.json` (`743f8043…`, the expected values TS tests read), `segments/reference/*.json` (6). `verify_fixtures.py` regenerates the set; `fixtures:check` runs the oracle. Rules the oracle chose are **D-74** (soft credit counts only while its gift is active, segment window semantics, `isHousehold` = 2+, missing value fails). Hashes and headline numbers in brief §12.
- Gate: `fixtures:check` OK, `model:lint` OK, `import:eval` drift 0 rows, labels 30 / 30, Phase 1 hashes unchanged. Red-checked: a tampered `answers.json` and a tampered `pledges.csv` both fail. No TS changed, so `npm test` not re-run (434/434 at the Phase 2 gate).

**Next:** 3.2 — pure `householdName` / `householdGiving` against `answers.json` `households` (H0001 = "Zoë Rivera and Victoria Whitfield", 675000). Model: Sonnet fits (pure derivation, oracle exists); undo/hash part stays Opus.

PR #5 still open (draft); Phase 3 builds on this branch.

---

## ▶ Next session: task 3.1 — Phase 3 oracle and fixtures (D-67)

**2026-10-23 P-8..P-15 decided by Shane, all as written → D-66..D-73** in `docs/decisions.md` (D-66 amends D-26; D-68 corrects D-33's segment lineage). Don't reopen.

Still open: PR #5 (draft, no review, mergeable) https://github.com/shanelabountyai/housefile/pull/5. Phase 3 builds on this branch until Shane merges it.

**Next:** 3.1 — `tools/build_phase3_fixtures.py` + `tools/phase3_answers.py` (stdlib, seed 20261014), `fixtures/phase3/`, hashes in brief §12, `verify_fixtures.py` covers both; acceptance in `docs/phase-3-tasks.md`. Model: Opus/Fable (oracle, fixture hashes).

---

## ▶ Next session: Shane reviews `docs/phase-3-tasks.md` (P-8..P-15) and PR #5; then task 3.1

**2026-10-22 Phase 2 gate PASSED (local, one sequential run, stopped on first failure, none failed):** `typecheck` clean · `fixtures:check` OK · `model:lint` OK (40312dfe…) · `money:lint` OK · `write:lint` OK · `import:eval` A 259/55/71 P 1.0 R 0.9464, B 166/33/37 P 1.0 R 0.9548, drift 0 rows, labels 30 / 30 · `foundation:drift` clean v1.3.0 · `npm test` 49 files **434 / 434** · `phase2:proof:test` OK (undo B `2c035193…` == beforeHash, undo A `7d3bd174…` == beforeHash, both unmerge snapshots equal). CI green/red runs: below (task 2.10).

**Written, stopped for review:** `docs/phase-3-tasks.md`, tasks 3.1–3.11 and **proposals P-8..P-15 (defaults in force; each becomes D-66+ on confirmation)**. The two that came from reading code, not docs:
- **P-8** letters go in a clone-owned `Letter` table, not the foundation `Outbox`: `drainOutbox` (daily cron) sends through Resend when `VERCEL_ENV=production` or `EMAIL_SANDBOX_TO` is set, and the template file is drift-checked. Amends D-26.
- **P-10** Pulseboard has no segment code to port (rollups/funnels/retention only, stored tables). Segments are new; D-33's lineage should not claim a port.
- **P-9** matters most for effort: the fixtures have no pledges or soft credits (878 × `GIFT`), so 3.1 adds a second small generator + oracle rather than regenerating the frozen Phase 1 set.

PR #5 still has no review. Model for 3.1: Opus/Fable (oracle, fixture hashes).

---

## ▶ Next session: review the Phase 2 overnight PR, decide D-55, then the Phase 2 gate

**2026-10-20/21 unattended overnight run, branch `phase-2-overnight-2026-10-20` (off `phase-2`), draft PR #5 against `phase-2`: https://github.com/shanelabountyai/housefile/pull/5.** Tasks **2.2–2.10 all done**, each test-first against `housefile_test`, 19 commits, pushed. Nothing merged, nothing deployed, `main` untouched.

**CI runs (task 2.10 acceptance):** green = PR #5 https://github.com/shanelabountyai/housefile/actions/runs/39620837179 · red = throwaway PR #6 (`phase2-red-proof`, undo leaves created constituents ACTIVE so `phase2:proof` and the undo tests fail) https://github.com/shanelabountyai/housefile/actions/runs/39620844263. **Green: all three jobs succeeded (ci incl. `phase2:proof`, phase1-gate incl. `write:lint`, modules-removed). Red: `ci` failed on the three fixture undo tests with `expected 'UNDO_FAILED' to be 'UNDONE'`; phase1-gate stayed green.** PR #6 closed, branch deleted (precedent: task 1.12, PR #3). Task 2.10 ticked.

**Built** (all in `src/commit/`, CLIs in `scripts/`, every write path starts from a stored preview):
- 2.2 `state.ts` (`effectiveStateHash`, D-11 shape shared by the fixture in memory and the database), `db-state.ts` (`loadEffectiveState`, `loadEffectiveConstituent`), `seed.ts` + `db:seed:fixtures` / `:test` (org `housefile`, user `seed@housefile.test`). The dry-run `beforeHash` moved `dcd67106…` → `7d3bd174…` (D-53; our own serializer, no oracle value).
- 2.3 `preview.ts` `previewBatch` → one `ImportBatch` row; `import:preview`. File A report byte-identical to the Phase 1 dry-run; B alone 166/32/38/14 (D-51).
- 2.4 `write.ts` + `commit.ts` `commitBatch`; `import:commit`. `STATE_MOVED` / `PLAN_TAMPERED` / `ALREADY_COMMITTED` return 0 rows.
- 2.5 `review.ts` (`listReview`, `decideReview`, `batchStatus`); `review:list`, `review:decide`; `PairMemory` table; `results.write` gates it (D-60).
- 2.6 `merge.ts` `mergeConstituents` (D-49); `constituents:merge`; S6 `EXISTING_PAIR` and pair memory in the plan (D-61).
- 2.7 `unmerge.ts` + `UnmergeEvent` table (append-only, both proof hashes); `constituents:unmerge`.
- 2.8 `undo.ts` `undoBatch`; `import:undo`. Compensating rows by version number; proof inside the transaction; `UNDO_FAILED` written outside it with both hashes.
- 2.9 `tests/integration/housefile-tamper.test.ts`; `scripts/write-guard.ts` + `npm run write:lint` (only `src/commit/` writes the Phase 2 tables; red on a planted violation).
- 2.10 `scripts/phase2-proof.ts` + `npm run phase2:proof` (in the CI `ci` job); `write:lint` in `phase1-gate`; `docs/EVAL.md` Phase 2 section.
- Schema: three clone migrations (`20261021011809_review_candidate_row`, `20261021013521_pair_memory`, `20261021143843_unmerge_event`), `Org` back-relations marked `// app`, `foundation:drift` clean against v1.3.0.

**Decided (D-53..D-65 in `docs/decisions.md`, each with the alternative not taken).** The ones Shane should read: **D-55** (rows whose auto-merge target is a row still in review: 13 MERGE + 1 REVIEW rows in A, 5 in B; they wait and then *follow* the target row into whatever it became), D-56 (fund synonyms at plan time, default `GEN`), D-57 (zero/negative gifts held, never written), D-59 (open is per row; pair memory never suppresses on its own, it re-queues when a new identifier agrees), D-61 (S6 lives in the plan, not the matcher), D-63 (undo blocks on a later batch, or a later write that is not net neutral).

**Left open — needs Shane**
1. ~~**D-55**~~ ~~DECIDED 2026-10-21: follow, as built~~ → **re-decided by Shane 2026-10-26: re-queue for a person (D-77).**
2. D-57: no refund/correction path for held gifts yet (seam: a superseding row with a reason, D-6).
3. Names from a single full-name column (file B) land parsed and folded (lowercase) on new constituents.
4. Soft credits are not moved by a merge (`softCreditsMoved: []`, ponytail seam in `merge.ts`) until Phase 3 writes the table.
5. Pre-existing branch `overnight/2026-10-20-hardening` (draft PR #4, off `main`) re-does Phase 1 normalizers that `phase-2` already has; left untouched. Probably close it.
6. Observed, not fixed (template-owned): Prisma's pg adapter prints `DeprecationWarning: Calling client.query() when the client is already executing a query` when a `findMany` with `include` runs inside an interactive transaction. Harmless; all frames in `node_modules`.

**Gate, local, 2026-10-21 (verbatim tails)**

```
$ npm test                 Test Files  49 passed (49)   Tests  434 passed (434)
$ npm run typecheck        clean
$ npm run fixtures:check   OK
$ npm run model:lint       model matching/model.v1.json sha256 40312dfedce1ed59481bb610e4155ff90006f041700974825c48c63b37ee635b / model:lint OK
$ npm run money:lint       money:lint OK
$ npm run write:lint       write:lint OK (only src/commit writes the Phase 2 tables)
$ npm run import:eval      A 259/55/71 · 679 pairs · P 1.0 · R 0.9464 · wrong 0; B 166/33/37 · 394 pairs · P 1.0 · R 0.9548 · wrong 0; drift vs fixtures/decisions_*.csv: 0 rows; labels 30 / 30
$ npm run foundation:drift foundation:drift: clean against v1.3.0 (modules removed: billing)
$ npm run phase2:proof:test
  A: commit 71 constituents, 172 versions, 298 gifts (+11 waiting, 21 skipped), 246 merges, 74 review items over 55 rows (13.8%)
  B: commit 17 constituents, 133 versions, 178 gifts (+5 waiting, 11 skipped), 174 merges, 49 items over 39 rows (15.6%)
  undo B: stateHash == beforeHash: 2c035193ee43d9b4c08425e79cebfa6406c69cfb4a75a228f9ae39422a1acbd8
  undo A: stateHash == beforeHash: 7d3bd174503f2a77a35d3d820c1085de112ce2b0d3d2db73ca6fa98127205adb
  unmerge (constituent) survivor 9eab0c8a… == snapshot; loser 5af937d9… == snapshot; unmerge (row 399) survivor 6af1c76a… == snapshot
  phase2:proof OK
```

Gotchas learned: `prisma migrate dev` here did **not** regenerate the client (run `npx prisma generate` after a schema change, or the new column is "unknown argument"); `git checkout prisma/migrations/migration_lock.toml` before committing; a `@db.Date` reads back as a UTC-midnight Date (`isoDate` in `db-state.ts`).

**Next:** Shane reviews PR #5 (D-55 decided 2026-10-21); then the Phase 2 gate (exit criteria in `docs/phase-2-tasks.md` all pass locally) → write `docs/phase-3-tasks.md` and stop for review. Model: Fable/Opus (phase gate).

---

## ▶ Next session: Phase 2 task 2.2 — effective state and seed

**2026-10-19 task 2.1 DONE (branch `phase-2`).** `prisma/schema/housefile.prisma` (13 tables), `Org` back-relations marked `// app`, migration `20261019212236_housefile_init` with hand-written SQL: `housefile_append_only()` trigger on `ConstituentVersion`, `Gift`, `ImportBatch`, `ImportBatchEvent`, `ReviewDecision`, `MergeEvent`; CHECKs for one writer (version, gift, merge), `amountCents > 0`, supersede reason, review reason (D-22), merge kind shape. Choices recorded as **D-52** (org FK Restrict, etc.). `money:lint` now also fails a `Float`/`Decimal` cents column in `prisma/schema/` (red on a planted `Float`, then green).
- Gate, local: `tests/integration/housefile-append-only.test.ts` 11/11 (red first: tables absent), `npm test` **393/393**, `typecheck` clean, `db:migrate` + `db:migrate:test` applied, `migrate diff` vs test DB: no difference, `foundation:drift` clean vs v1.3.0, `fixtures:check` OK, `model:lint` OK, `money:lint` OK, `test:phase1` 228/228, `import:eval` drift 0 rows.
- Found and fixed: INV-14 was red on `phase-1` since 1a0a09c (D-5 dropped the `STRIPE_*` names from `.env.example`, template-owned `src/core/env.ts` still declares them). Names restored, empty, with a comment.
- Gotchas: never run `prisma format` on `core.prisma` (it realigns template lines = drift); `prisma migrate dev` re-adds a header to `migration_lock.toml` — `git checkout` it before committing.
- For 2.2: a seeded version needs a writer (D-52b): the seed writes with a `userId`.

**Next:** 2.2 (pure `effectiveStateHash`, `loadEffectiveState`, `db:seed:fixtures`). Model: Opus/Fable (hashes).

---

## Earlier: Phase 2 task 2.1 — schema and triggers

**2026-10-19 Phase 1 gate PASSED; Phase 2 task list written, stopped for review.** Gate re-run this session: `fixtures:check` OK, `model:lint` OK (40312dfe…), `money:lint` OK, `typecheck:phase1` clean, `test:phase1` 228/228, `import:eval` A 259/55/71 · 679 pairs · P 1.0 · R 0.9464, B 166/33/37 · 394 pairs · P 1.0 · R 0.9548, drift 0 rows, no forbidden import under `src/matching/`. Phase 1 boxes 1.2–1.8, 1.10, 1.11 ticked (built 2026-10-17, gated today).
- `docs/phase-2-tasks.md`: tasks 2.1–2.10 in CLAUDE.md's TDD order, exit criteria, and **seven proposals P-1..P-7 with defaults in force**. On confirmation each becomes a D-entry (D-45 onward). The ones that change the schema: P-1 (aliases/alternates/household inside `ConstituentVersion`), P-2 (MergeEvent for every merge, incl. row merges), P-3 (immutable ImportBatch + event rows), P-4 (`giftRef` stable across supersession).
- Phase 2 work goes on a new branch off `phase-1` (or off `main` once PR #1 merges).

**Proposals decided 2026-10-19 (D-45..D-51):** P-1, P-2, P-6, P-7 chosen by Shane as written; P-3..P-5 defaults in force (follow from D-6, D-11). Don't reopen.

**Next:** branch `phase-2` off `phase-1`, then 2.1 (schema and triggers, failing trigger tests first). Model: Fable/Opus (schema, hashes, undo).

---

## Earlier: Next session: Phase 1 gate — write `docs/phase-2-tasks.md` and stop for review

**2026-10-19 D-5 DONE, task 1.1 complete.** Billing deleted by the template manifest plus clone migration `20261019000000_housefile_drop_billing` (drops `BillingAccount`, `StripeEvent`); share links unwired (share/revoke gone from the Projects example; `src/core/share`, `/s/[token]`, INV-07/08/09 untouched). Shane chose both options; recorded in D-5.
- Gate, local, 2026-10-19: `foundation:drift` clean against v1.3.0 (modules removed: billing), `npm test` **382/382** on `housefile_test`, `npm run typecheck` clean, `fixtures:check` OK, `model:lint` OK, `test:phase1` 228/228, `import:eval` drift 0 rows. `db:migrate` (dev) and `db:migrate:test` applied, schema diff empty.
- Drift needs the `v1.3.0` tag locally: `git fetch ~/Projects/"saas foundation" tag v1.3.0 --no-tags` (this repo has no foundation remote).
- D-34..D-40 and task 1.9 were offered again this session; Shane kept them as decided. Don't reopen.

**Next:** Phase 1 exit criteria all pass → write `docs/phase-2-tasks.md` (TDD order in CLAUDE.md: schema and triggers → preview/`beforeHash` → commit → review → survivorship/merge → unmerge → undo → tamper tests) and stop for review. Model: Fable/Opus (phase gate).

---

## Earlier: 1.1 leftovers (all done 2026-10-19)

**2026-10-19 D-43 DONE (two-digit DOB years).** Shane chose to pivot on `asOf`: a DOB written `M/D/YY` whose 20xx reading falls after `asOf` loses 100 years. Gift dates are unchanged. Oracle `matchlib.norm_dob`, TS `normDob`, golden GN-21; `decisions_a.csv` and `fixtures/samples/reference_matcher.output.txt` regenerated from the oracle; brief §10–§12, EVAL.md and the snapshot tests updated. Commits 9fa52f5 (rule) and 3951ea6 (`import:eval` now prints each labelled pair's current decision: REVIEW 28, MERGE 2).
- File A: 256/58/71 → **259/55/71**, pairs 685 → 679, auto-merge 265 correct / 0 wrong, recall 0.9462 → 0.9464, precision 1.0. File B unchanged. Labels still 30 / 30.
- Gate, local, 2026-10-19: `fixtures:check` OK, `model:lint` OK, `money:lint` OK, `typecheck:phase1` clean, `test:phase1` 228/228, `import:eval` byte-identical to the sample, drift 0 rows.

**Next, in order (1.1 leftovers, then the gate):**
1. ~~Port collision~~ **DONE 2026-10-19 (D-44):** housefile is on **5900** (package.json, playwright.config.ts, CI `APP_URL`); row added to `~/.claude/CLAUDE.md`, *next project* now 6000.
2. ~~Clone rows~~ **DONE 2026-10-19:** housefile row in `saas foundation/CLONES.md` (e13c770, v1.3.0, port 5900); this repo's copy synced to it. The foundation still has an uncommitted footnote row from another session — left alone.
3. ~~Reuse scan~~ **DONE 2026-10-19 (D-33):** 0 items parsed (the scanner reads tables, not the checkbox list; its index holds 1 project), recorded as inconclusive; the manual port lineage stands.
4. D-5: unwire billing and share links.
5. `npm run db:migrate` locally (v1.3.0 `scorekeeper` enum), then full `npm test` + `npm run typecheck` on the Mac (never run in the container).
6. Phase 1 gate: write `docs/phase-2-tasks.md` and stop for review.

**2026-10-19 task 1.12 CI gate DONE.** `.github/workflows/ci.yml` job `phase1-gate` (no DB, `TZ=America/Chicago`): `fixtures:check`, `model:lint`, `money:lint` (new, `scripts/money-lint.ts`: a line naming cents/amount may not use parseFloat, toFixed, Math.round-family, a decimal literal or /100), `typecheck:phase1`, `test:phase1`, `import:eval`; every step runs even after one fails.
- **Red:** https://github.com/shanelabountyai/housefile/actions/runs/39292269677 — throwaway PR #3 (closed, branch deleted), `FIRST_NICKNAME` 15→10: `model:lint` red (hash b5ae0211… ≠ D-16 40312dfe…), `test:phase1` red (zero-drift and model-is-data cases), `import:eval` red; `fixtures:check`, `money:lint`, typecheck green. `ci` job's vitest also red.
- **Green:** https://github.com/shanelabountyai/housefile/actions/runs/39292725637 — `phase-1` at 958d6a7: all three jobs green, `drift vs fixtures/decisions_*.csv: 0 rows`.
- PR #1 had stopped running CI because it conflicted with `main` (foundation v1.3.0, NEXT.md only); `main` merged into `phase-1` (958d6a7), PR #1 now mergeable. **Run `npm run db:migrate` locally** (v1.3.0 adds the `scorekeeper` enum value).


**2026-10-17 (unattended Phase 1 build, branch `phase-1`, pushed; PR open, not merged):** tasks 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.10, 1.11 and the 1.1 npm scripts are built and committed in small commits (`git log --oneline main..phase-1`). Nothing touched the database, Prisma, the UI, `fixtures/`, `src/core/**`, `tests/invariants/**` or `.github/workflows`.

**What was built**
- `src/lib/`: `money.ts` (LoanBook port + new `parseCents`), `canonical.ts` (Adjuster port + `sha256Bytes`), `fold.ts`.
- `src/import/`: `normalize/` (N1–N9, rule code per value), `csv.ts` (own reader, BOM/UTF-8→cp1252/CRLF/quotes), `map.ts` (+ `import/synonyms.json`, `import/maps/*.map.json`), `validate.ts` (closed codes, explicit `asOf`), `crm.ts` (fixture loaded read-only), `pipeline.ts`, `resolve.ts` (D-15, tie-break by score then id), `preview.ts` + `report.ts` (dry-run write plan, S1–S4, DUP_GIFT, D-11 `beforeHash`).
- `src/matching/`: pure matcher — `similarity.ts` (JW, Soundex), `blocking.ts` (B1–B5), `score.ts` (from `matching/model.v1.json`), `nicknames.ts` (from `matching/nicknames.json`), `model.ts` (shape lint + loader).
- `src/eval/import-eval.ts` (the only reader of truth/answer keys/decisions), `scripts/import-eval.ts`, `scripts/import-dry-run.ts`, `scripts/model-lint.ts`; npm scripts `import:eval`, `import:dry-run`, `fixtures:check`, `model:lint`, `typecheck:phase1`, `test:phase1`; `tsconfig.phase1.json`.
- Tests: `tests/unit/import/*` and `tests/unit/matching/*` (226 cases: GN-01..20, GA-01..20 + symmetry, 650-row validation, eval numbers and 0 drift, dry-run reconciliation, carry-over and model-is-data checks).
- Docs: `docs/EVAL.md`; `docs/decisions.md` D-33 (ports/lineage) and **D-34..D-40 PROVISIONAL — awaiting Shane**; D-16 hash line; `eval/labels/README.md`.

**Gate output, verbatim (2026-10-17)**

```
$ npx tsx scripts/import-eval.ts
thresholds: MERGE>=70 REVIEW>=45
A file: A
A encoding: utf-8-sig
A rows: 400
A rejected: 15
A rows_merge: 256
A rows_review: 58
A rows_new: 71
A pairs_compared: 685
A auto_merge_pairs: 264
A auto_merge_correct: 264
A auto_merge_wrong: 0
A true_pairs_scored_below_review: 13
A true_pairs_not_blocked: 2
A review_pairs: 128
A review_pairs_true: 70
A pair_precision: 1.0
A pair_recall: 0.9462
A validation_mismatches: 0
A row_confusion: {'DUP_IN_FILE->MERGE': 65, 'DUP_IN_FILE->NEW': 6, 'DUP_IN_FILE->REJECT': 2, 'DUP_IN_FILE->REVIEW': 9, 'EXISTING->MERGE': 191, 'EXISTING->NEW': 5, 'EXISTING->REJECT': 9, 'EXISTING->REVIEW': 43, 'NEW->NEW': 60, 'NEW->REJECT': 4, 'NEW->REVIEW': 6}
A rejects: {'NAME_MISSING': 2, 'AMOUNT_MISSING': 10, 'AMOUNT_INVALID': 1, 'DATE_FUTURE': 2}
A NOT BLOCKED: A-0238 (no candidate blocked) [D-TRANSPOSE|D-MOVED|D-UNITFMT]
A NOT BLOCKED: A-0312 (no candidate blocked) [D-EMAIL-MISSING|D-MOVED]

B file: B
B encoding: cp1252
B rows: 250
B rejected: 14
B rows_merge: 166
B rows_review: 33
B rows_new: 37
B pairs_compared: 394
B auto_merge_pairs: 169
B auto_merge_correct: 169
B auto_merge_wrong: 0
B true_pairs_scored_below_review: 8
B true_pairs_not_blocked: 0
B review_pairs: 65
B review_pairs_true: 37
B pair_precision: 1.0
B pair_recall: 0.9548
B validation_mismatches: 0
B row_confusion: {'DUP_IN_FILE->MERGE': 35, 'DUP_IN_FILE->NEW': 2, 'DUP_IN_FILE->REJECT': 1, 'DUP_IN_FILE->REVIEW': 3, 'EXISTING->MERGE': 131, 'EXISTING->NEW': 3, 'EXISTING->REJECT': 10, 'EXISTING->REVIEW': 28, 'NEW->NEW': 32, 'NEW->REJECT': 3, 'NEW->REVIEW': 2}
B rejects: {'AMOUNT_MISSING': 7, 'AMOUNT_INVALID': 6, 'DATE_FUTURE': 1}

pipeline: typescript (src/import, src/matching, model matching/model.v1.json, as-of 2026-10-14)
drift vs fixtures/decisions_*.csv: 0 rows
exit 0

$ npm run fixtures:check   (last line)
OK
model matching/model.v1.json sha256 40312dfedce1ed59481bb610e4155ff90006f041700974825c48c63b37ee635b
model:lint OK
foundation:drift: clean against v1.2.1
 Test Files  9 passed (9)
      Tests  226 passed (226)
tsc -p tsconfig.phase1.json --noEmit: clean
```

Two dry-runs of each fixture file were byte-identical (`cmp`); totals A 400 = 256 + 58 + 71 + 15, B (fresh CRM) 250 = 166 + 32 + 38 + 14.

**Provisional decisions — all seven confirmed by Shane 2026-10-19 as written (docs/decisions.md; brief wording fixed for D-40 a/b/c):** D-34 A→B carry-over (reference runs B over the CRM enriched by A; B alone differs on 10 rows, not the 5 the audit named) · D-35 tie-break highest score then highest id · D-36 synonyms `middle`, `suffix`, `donor last name` · D-37 `asOf` input, default 2026-10-14 · D-38 reject precedence · D-39 dry-run gift rules (D-25 literal: blank CRM reference ≠ file reference → 7 near misses in A listed, not skipped), FUND_UNKNOWN not implemented, `beforeHash` by business id, row `asOf` = gift date · D-40 brief-vs-oracle wording (N1 hyphen→space, N4 uppercase, DATE_INVALID vs GIFT_DATE_INVALID, S6/GA-09 one best candidate, DATE_EXCEL_SERIAL warn, duplicate HOUSEHOLD_CANDIDATE flag emitted once, cp1252 undefined bytes).

**Left for Shane**
- **1.9** labels DONE 2026-10-19: `eval/labels/shane-30.json` (30 labels: 26 MERGE, 4 SAME_HOUSEHOLD, 0 KEEP_SEPARATE; answer key not opened). Compared 2026-10-19: `import:eval` prints agreement after its reference block, **30 / 30** (caveats in `docs/EVAL.md`: synthetic, no true KEEP_SEPARATE in the sample, option picked was listed first every time). Threshold sweep: any MERGE threshold below 70 adds wrong merges. O-2 (thresholds unchanged, D-41) and O-3 (GA-05 keeps auto-merging, D-42) decided 2026-10-19. **Task 1.9 complete.**
- **Finding from labelling — DECIDED as D-43 2026-10-19 (see top):** pairs A-0064 and A-0185 show `DOB_DIFF` although both sides are the same date. `tools/matchlib.py` `norm_date` (line 348) maps two-digit years < 70 to 20xx, so DOB `4/3/51` becomes 2051. Right for gift dates, wrong for birth dates. A fix (e.g. DOB pivot: a parsed year after `asOf` drops 100 years) changes the oracle, the brief N6 and the fixtures, so it needs a `docs/decisions.md` entry first.
- **1.12** DONE 2026-10-19, runs linked at the top.
- Remaining 1.1 items: port-5500 row in `~/.claude/CLAUDE.md`, clone row in `saas-foundation/CLONES.md` and this repo's `CLONES.md`, reuse scan (`~/Projects/reuse-scan.py`) recorded under D-33, D-5 billing/share-link unwiring. None were reachable from the build container.
- Not run here (no Prisma engines in the container): full `npm test` and `npm run typecheck`; Phase 1 code was checked with `tsconfig.phase1.json` and `vitest run tests/unit/import tests/unit/matching` instead. The new tests have no DB dependency and should pass inside `npm test` as well.
- Before Phase 2: the "FIRST_NICKNAME → 10 moves the review count and fails the drift check" check is already a vitest case and was run by hand; write `docs/phase-2-tasks.md` and stop for review.

---

## ▶ Next session: clone and set up on the Mac, then plan Phase 1 (stop before code)

Paste the block in `KICKOFF.md` into Claude Code started in `~/Projects`, on Fable.

**2026-10-14 (kickoff kit):** Kit written and reviewed in the cloud workspace: PRD v1.1, decisions D-1..D-32 + O-1..O-9, domain brief with the defect catalog, scoring model, golden pairs GA-01..GA-20, normalization goldens GN-01..GN-20 and the kickoff measurements, portfolio overlap, Phase 1 tasks, CLAUDE.md, KICKOFF.md, `.claude/settings.json` (Fable pin). Tools in `tools/` (Python 3, stdlib): `matchlib.py` (spec made executable), `build_fixtures.py` (seed 20261014), `reference_matcher.py`, `golden_answers.py` (prints OK), `verify_fixtures.py` (prints OK). Fixtures were generated twice in separate directories with identical sha256 values (brief §12); only small samples and `MANIFEST.json` are in the kit under `fixtures/samples/`. **Not done:** the clone, `npm ci`, `db:setup`, any commit, the port-table row (not reachable from this workspace), the GitHub repo, the build-log card.

Kickoff measurements (reference matcher on the frozen fixtures, thresholds 70/45): file A precision 1.000, recall 0.946, 58 of 400 rows to review, 0 wrong merges; file B 1.000, 0.955, 33 of 250, 0 wrong merges. The first run had 4 wrong spouse merges per file; the first-name and DOB conflict caps (brief §7 step 2) fixed it at no recall cost. These are an upper bound (D-30), not a product claim; Shane's 30 hand labels (task 1.9) are the honest check.

Kit was reviewed by a product owner and a CRM data-quality specialist before handoff; see `docs/decisions.md` §Review log. Open items O-1..O-9 have defaults in force.

Not verified from this workspace: the donor repos' file paths named in `docs/portfolio-overlap.md` (read the donors before porting); whether `reuse-scan.py` parses a checkbox task list; whether saas-foundation v1.2.1 has a module switch for billing and share links (D-5 says what to do either way).

**2026-10-17 review fixes (independent review, no blockers):** `import:dry-run --after` now refuses (it planned field changes against a mix of the committed CRM and an uncommitted batch); `crm_gifts` loader rejects blank `amount_cents` instead of reading 0; `model:lint` scans `src/import` too and ignores comments; snapshot tests are labelled and listed apart from oracle agreement in `docs/EVAL.md`. Left as nits: two commits mix concerns (8352899, 0e5a191); the dated D-16 hash line sits after D-21 in `docs/decisions.md`; EVAL.md's percentages are arithmetic on `import:eval` counts.

**2026-10-19 (foundation upgrade):** saas-foundation v1.2.1 -> v1.3.0 (security release, due 2026-10-21) is merged on branch `foundation-v1.3.0`, PR open against `main`, merged to `main` as 72281cc, and `main` merged into `phase-1` 2026-10-19. After it merges, update housefile's row in the template's `CLONES.md` to v1.3.0 and run `npm run db:migrate` locally (adds the `scorekeeper` enum value). The `phase-1` branch will need `main` merged in after that.
