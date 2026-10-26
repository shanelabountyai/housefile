# Housefile — Evaluation (Phases 1 and 2, measured by TypeScript)

Every number below names the command that produced it. Run the command; the number must come back the same.
Built 2026-10-17 on branch `phase-1`, Node 22, fixtures seed 20261014.

## What these numbers are, and are not (D-30)

These are **the TypeScript pipeline scored on the generator's own defect catalog, against the generator's own
answer key, reproducing a reference matcher written by the same author**. Pair precision 1.000 means the
matcher made zero wrong auto-merges on *this* synthetic file, whose defects are the ones listed in
`docs/domain-brief.md` §3. It is an upper bound, not a claim about real donor files. Brief §3 lists what the
generator does **not** produce: OCR noise, hyphenated double surnames, family-name-first name order,
international addresses, organizations, donor-advised-fund intermediaries, two genuinely different emails for
one person in one file, deceased flags, "Mr. & Mrs." joint rows, duplicate gifts with fees deducted. None of
those is measured here. The only non-synthetic signal the project will have is the 30 hand labels (task 1.9),
and they are not in yet (see the last section).

The review band is where the work is: 14.5% of file A's rows and 13.2% of file B's go to a person, and only
55% / 57% of the pairs in that band are true matches. A precision of 1.000 does not mean "nothing left for a
person"; it means the machine declined to decide those.

## Brief §11 table, as measured by `npm run import:eval`

`npm run import:eval` runs `src/import` + `src/matching` over `fixtures/import_a.csv` then `import_b.csv` against
`fixtures/crm_constituents.csv` (one in-memory state, file B over the CRM as enriched by file A — D-34), prints
the reference matcher's line format, and exits 1 on any per-pair difference from `fixtures/decisions_*.csv`.
On 2026-10-17, and again on 2026-10-19 after D-43 regenerated the sample, its output was byte-identical to `fixtures/samples/reference_matcher.output.txt` (`diff` of the
two: empty) and it printed `drift vs fixtures/decisions_*.csv: 0 rows`.

| | File A | File B |
|---|---|---|
| Rows | 400 | 250 |
| Encoding detected | utf-8-sig | cp1252 |
| Rejected (validation) | 15 (NAME_MISSING 2, AMOUNT_MISSING 10, AMOUNT_INVALID 1, DATE_FUTURE 2) | 14 (AMOUNT_MISSING 7, AMOUNT_INVALID 6, DATE_FUTURE 1) |
| Rows → MERGE / REVIEW / NEW | 259 / 55 / 71 | 166 / 33 / 37 |
| Rows in review | **13.8%** (55/400) | **13.2%** (33/250) |
| Pairs compared (after blocking) | 679 | 394 |
| Auto-merge pairs: correct / wrong | 265 / **0** | 169 / **0** |
| True pairs scored below review | 13 | 8 |
| True pairs never blocked | 2 (A-0238, A-0312) | 0 |
| Review pairs: total / true matches | 124 / 66 | 65 / 37 |
| **Pair precision** (auto-merge) | **1.0** | **1.0** |
| **Pair recall** (auto-merge over all true pairs) | **0.9464** | **0.9548** |
| Validation mismatches vs key | 0 | 0 |
| Per-pair decision drift vs `decisions_*.csv` | 0 rows | 0 rows |

Row confusion (expected link → decision), from the same command:

- A: DUP_IN_FILE→MERGE 65, →NEW 6, →REJECT 2, →REVIEW 9; EXISTING→MERGE 194, →NEW 5, →REJECT 9, →REVIEW 40; NEW→NEW 60, →REJECT 4, →REVIEW 6
- B: DUP_IN_FILE→MERGE 35, →NEW 2, →REJECT 1, →REVIEW 3; EXISTING→MERGE 131, →NEW 3, →REJECT 10, →REVIEW 28; NEW→NEW 32, →REJECT 3, →REVIEW 2

Precision = correct auto-merge pairs / all auto-merge pairs. Recall = correct auto-merge pairs / (correct +
true pairs scored below review + true pairs never blocked); a pair the floors or caps hold at REVIEW counts as
not auto-merged. Thresholds 70 / 45 (`matching/model.v1.json`), unchanged from kickoff; O-2 stays open until
the hand labels are in.

**The model is data, and the gate bites:** `npx tsx scripts/import-eval.ts --model <copy with FIRST_NICKNAME 10>`
on 2026-10-17 gave review rows 59 / 34 (from 58 / 33), 60 drifting rows, exit code 1, with no code change
(the same check is a vitest case in `tests/unit/import/eval.test.ts`).

## Goldens and unit tests — `npx vitest run tests/unit/import tests/unit/matching`

226 tests in 9 files passed on 2026-10-17. Among them: GN-01..GN-20 (`tests/unit/import/normalize.test.ts`,
`tests/unit/matching/similarity.test.ts`), GA-01..GA-20 with exact points, reasons in order and flags, plus a
symmetry case per pair (`tests/unit/matching/golden-pairs.test.ts`), JW(`jon`,`john`) = 0.9333, Soundex
`Flores` = `Florse` = F462, `expected_validation` on 650/650 rows (`tests/unit/import/validate.test.ts`), the
eval numbers above (`tests/unit/import/eval.test.ts`) and the dry-run reconciliation
(`tests/unit/import/preview.test.ts`). Typecheck: `npm run typecheck:phase1` (clean). Oracle side:
`python3 tools/golden_answers.py` prints OK.

## Dry-run preview — `npm run import:dry-run -- --file <csv> --map <json>`

Nothing is written. Totals reconcile by construction (rows = merged + reviewed + new + rejected) and two runs
are byte-identical (`cmp` of the two outputs: identical, 2026-10-17).

| `--file fixtures/import_a.csv --map import/maps/import_a.map.json` | `--file fixtures/import_b.csv --map import/maps/import_b.map.json` (fresh CRM) |
|---|---|
| rows 400 = merged 256 + reviewed 58 + new 71 + rejected 15 | rows 250 = merged 166 + reviewed 32 + new 38 + rejected 14 |
| gifts to add 306; pending review 58; DUP_GIFT 2; DUP_GIFT_IN_FILE 19 | gifts to add 193; pending review 32; DUP_GIFT 4; DUP_GIFT_IN_FILE 7 |
| date+cents matched, reference differed: 7 (listed, added — D-39) | 0 (file B maps no reference column: date + cents only) |
| field changes on existing constituents 52; alternates kept 18; aliases 63 | 38; 10; 79 |
| beforeHash `7d3bd174503f2a77a35d3d820c1085de112ce2b0d3d2db73ca6fa98127205adb` (D-53; was `dcd67106…` before task 2.2) | same (same CRM fixture) |

`import:dry-run --after` was removed after review (2026-10-17): it planned against a state that never exists. The A-then-B sequence is measured by `import:eval` only (D-34).
`FUND_UNKNOWN` is not implemented in Phase 1; the report says so.

## Fixture hashes — `sha256sum fixtures/*.csv` and `npm run fixtures:check`

`npm run fixtures:check` (verify_fixtures.py, golden_answers.py, clean `fixtures/` tree) printed OK on 2026-10-17.

| File | sha256 |
|---|---|
| truth_persons.csv | `9e25059c772bbe98583fe977c8163aef34d6c0fb7240315d1296bfdc0a3eef5f` |
| crm_constituents.csv | `dea6cf1e28d0dc320be23ea4c5748ecdf9eb0a4d2cab43330de88281fb913aa4` |
| crm_gifts.csv | `5a02baa0fe140783d4a8211a0cf5af8924caf46ab54c9fd64dc29f2bec11906c` |
| import_a.csv | `a4d3e08af9606d75dcc396e247e444342eccade6ee060af378975485ce6792bb` |
| import_b.csv | `a4e0df19787138089b4daf78cec0ba4a1c612d1e2c73a02a32d97f263d0f1aa6` |
| answer_key_a.csv | `87c9946619f76f32818a93da4abd35cf9c70b44e327ed28cadc79218d4a35b1a` |
| answer_key_b.csv | `03bda5b76e73e53b066f5b39071e79047b0c2b38ce78a097a250c42ec0cdb825` |
| decisions_a.csv | `2bf91d7ec98a5c84d0a740178e85e0c19f59dc153c6c97c912a573c8803e2e00` |
| decisions_b.csv | `51e86237a56c66a0067244b04b88c9e2ef8f82dae45bcd47dedf0c1b9c245e36` |

All nine equal `docs/domain-brief.md` §12 and `fixtures/MANIFEST.json`.

## Model hash — `npm run model:lint`

`matching/model.v1.json` sha256 (canonical JSON, `src/lib/canonical.ts`):
`40312dfedce1ed59481bb610e4155ff90006f041700974825c48c63b37ee635b`, recorded under D-16. `model:lint` printed OK
on 2026-10-17: schema valid, hash equal, no forbidden token under `src/matching/`.

## Hand labels (task 1.9) — `npm run import:eval`, 2026-10-19

Shane labelled the first 30 `REVIEW` rows of `fixtures/decisions_a.csv` on 2026-10-19 (D-31), in
`eval/labels/shane-30.json`. `import:eval` compares them with the truth after its reference-format block:
same true person = `MERGE`, different people in one true household = `SAME_HOUSEHOLD`, else `KEEP_SEPARATE`
(`labelAgreement` in `src/eval/import-eval.ts`).

| Measure | Value |
|---|---|
| Agreement, three-way | 30 / 30 |
| Agreement, merge vs not | 30 / 30 |
| Would merge (all held for review when labelled) | 26, all 26 truly the same person |
| Would keep apart | 4 (all `SAME_HOUSEHOLD`), all 4 truly different people |
| Truly `KEEP_SEPARATE` in the sample | 0 |

Scores of the 30: twenty-one at 50, two each at 55 and 65, and one each at 20, 25, 30, 45 and 80. The four household pairs
scored 80, 65, 30 and 25: A-0052 (80) was held by the first-name cap, A-0199 (65) fell in the review band, and the
other two by the identifier floor. Per-pair lines are in the `import:eval` output.

**What this does and does not show.**
- It is 30 pairs of synthetic data whose defects are clean by construction. It shows the review band is
  readable by a person, not that the matcher is right on real files.
- The sample contains no true `KEEP_SEPARATE` pair, so it says nothing about that class.
- The labeller saw the matcher's reason codes, and picked from options that Claude drafted and ordered. The
  option Shane picked was listed first on all 30 pairs. Treat the 30 / 30 as an upper bound on independent
  agreement.

**Threshold check for O-2** (`import:eval --model <copy>` with only `thresholds.MERGE` changed, 2026-10-19):

| MERGE ≥ | A review rows | A wrong merges | B review rows | B wrong merges |
|---|---|---|---|---|
| 70 (v1) | 58 | 0 | 33 | 0 |
| 65 | 57 | 2 | 31 | 1 |
| 60 | 56 | 3 | 31 | 1 |
| 55 | 51 | 3 | 24 | 1 |
| 50 | 15 | 3 | 10 | 1 |

Every lower merge threshold adds wrong merges. 26 of 30 review pairs being true merges is the cost of 0 wrong
merges at 70, not slack in the threshold.

**Finding, fixed by D-43 (2026-10-19).** A-0064 (score 20) and A-0185 (65) carried `DOB_DIFF` although both sides were the same date:
N6 read a two-digit year below 70 as 20xx, so a DOB of `4/3/51` became 2051. Birth dates now pivot on `asOf`, and both pairs
auto-merge (70 and 115). The labels were taken before the fix, when all 30 pairs were REVIEW; `import:eval` now prints
each pair's current decision (REVIEW 28, MERGE 2) and the agreement is unchanged at 30 / 30.

## Phase 2 — commit, review, merge, undo, proven by hash (`npm run phase2:proof`, 2026-10-21; review rows re-measured 2026-10-26 under D-77)

Measured by `scripts/phase2-proof.ts` on a fresh org seeded from the frozen fixtures (local `housefile_test`; the same step runs in CI's `ci` job). These are snapshots of this code's own hashes (D-53): the proof is that the hash *after* an undo or unmerge equals the hash recorded *before*, not that any hash matches an oracle.

```
$ npm run phase2:proof:test
seed: 286 constituents, 878 gifts; stateHash 7d3bd174503f2a77a35d3d820c1085de112ce2b0d3d2db73ca6fa98127205adb
A: preview: rows 400 = merged 259 + reviewed 55 + new 71 + rejected 15; review load 55/400 = 13.8%; pending-target 14; beforeHash 7d3bd174…; planHash bf0e2926…
A: commit: constituents 71, versions 172, gifts 298 (+11 waiting, 21 skipped), merges 246, review items 74 over 68 rows; stateHash 2c035193…
A: rows for a person 68 = reviewed 55 + target-in-review 13 (D-77); review load 68/400 = 17.0%
B: preview: rows 250 = merged 180 + reviewed 39 + new 17 + rejected 14; review load 39/250 = 15.6%; pending-target 6; beforeHash 2c035193…; planHash f272ebb4…
B: commit: constituents 17, versions 133, gifts 178 (+5 waiting, 11 skipped), merges 174, review items 49 over 45 rows; stateHash b6352902…
B: rows for a person 45 = reviewed 39 + target-in-review 6 (D-77); review load 45/250 = 18.0%
undo B: retired 17, versions restored 89, gifts voided 178, merges reversed 174
undo B: stateHash == beforeHash: 2c035193ee43d9b4c08425e79cebfa6406c69cfb4a75a228f9ae39422a1acbd8 == 2c035193ee43d9b4c08425e79cebfa6406c69cfb4a75a228f9ae39422a1acbd8
undo A: retired 71, versions restored 76, gifts voided 298, merges reversed 246
undo A: stateHash == beforeHash: 7d3bd174503f2a77a35d3d820c1085de112ce2b0d3d2db73ca6fa98127205adb == 7d3bd174503f2a77a35d3d820c1085de112ce2b0d3d2db73ca6fa98127205adb
unmerge (constituent) survivor hash == snapshot: 9eab0c8a… == 9eab0c8a…
unmerge (constituent) loser hash == snapshot: 5af937d9… == 5af937d9…
unmerge (row 399) survivor hash == snapshot: 6af1c76a… == 6af1c76a…
phase2:proof OK
```

**Review load (D-77, owner decision 2026-10-26).** File A against the seeded org: **68 of 400 rows (17.0%)** wait for a person, as 74 items (one per tied candidate, D-35): the plan's 55 REVIEW rows plus 13 rows the matcher would auto-merge (score ≥ 70) into an earlier row that is itself in review. Those 13 are `TARGET_IN_REVIEW` review rows; they are never followed into what the target becomes (before D-77: 55 rows, 13.8%, the 13 followed without a decision). File B after A on the database: **45 of 250 rows (18.0%)**, 49 items, 39 REVIEW + 6 `TARGET_IN_REVIEW` (before: 39, 15.6%). Merges written at commit are unchanged (A 246, B 174) and checked against the answer keys by a scratch script outside the repo: 0 wrong in each; all 19 re-queued rows are the same true person as their target row, so on this fixture D-77 adds 19 decisions and changes no outcome. B-after-A has no oracle (D-51): 180/39/17 here against 166/33/37 in the in-memory reference, because A also wrote 71 new constituents and left 55 rows open; the proof for B is the undo hash, not the counts.

**Undo and unmerge, one line each:** `npm run import:undo -- --batch <id>` prints `stateHash <h> == beforeHash <h>` or `UNDO_FAILED expected <h> actual <h>`; `npm run constituents:unmerge -- --event <id>` prints both records' hashes next to their snapshots. The tamper tests (`tests/integration/housefile-tamper.test.ts`) show the failing side: a changed gift or version → `STATE_MOVED`, a changed stored plan → `PLAN_TAMPERED`, a change after commit → `UNDO_FAILED` with both hashes and nothing else written.

**What this does not show.** The counts for B-after-A and the TARGET_IN_REVIEW rule (D-55, D-77) have no reference value; the proof derives the rows-for-a-person count from the plan (REVIEW + pending MERGE rows) and fails on any difference, it does not compare it to an oracle. Soft credits are not moved by a merge (Phase 3 writes the table). All data is synthetic.

## Which tests are oracle agreement and which are snapshots

Oracle agreement (expected values come from `tools/` or the brief, not from this code): GN-01..GN-21, GA-01..GA-20, `expected_validation` on 650 rows, and the byte-for-byte match of `import:eval` with `fixtures/samples/reference_matcher.output.txt` plus 0-row drift against `fixtures/decisions_*.csv`.

Snapshots (expected values were measured by this TypeScript and have no independent reference): the 10-row A→B carry-over list and `rows_review 32` (`tests/unit/import/eval.test.ts`), the tie-break score of 50, and every dry-run figure in `tests/unit/import/preview.test.ts`. They catch change, not error; they are not counted toward "matches the reference".
