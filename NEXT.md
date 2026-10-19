# NEXT

## ▶ Next session: Phase 1 gate — write `docs/phase-2-tasks.md` and stop for review

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
