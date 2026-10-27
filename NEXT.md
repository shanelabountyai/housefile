# NEXT

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
