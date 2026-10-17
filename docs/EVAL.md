# Housefile — Evaluation (Phase 1, measured by TypeScript)

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
On 2026-10-17 its output was byte-identical to `fixtures/samples/reference_matcher.output.txt` (`diff` of the
two: empty) and it printed `drift vs fixtures/decisions_*.csv: 0 rows`.

| | File A | File B |
|---|---|---|
| Rows | 400 | 250 |
| Encoding detected | utf-8-sig | cp1252 |
| Rejected (validation) | 15 (NAME_MISSING 2, AMOUNT_MISSING 10, AMOUNT_INVALID 1, DATE_FUTURE 2) | 14 (AMOUNT_MISSING 7, AMOUNT_INVALID 6, DATE_FUTURE 1) |
| Rows → MERGE / REVIEW / NEW | 256 / 58 / 71 | 166 / 33 / 37 |
| Rows in review | **14.5%** (58/400) | **13.2%** (33/250) |
| Pairs compared (after blocking) | 685 | 394 |
| Auto-merge pairs: correct / wrong | 264 / **0** | 169 / **0** |
| True pairs scored below review | 13 | 8 |
| True pairs never blocked | 2 (A-0238, A-0312) | 0 |
| Review pairs: total / true matches | 128 / 70 | 65 / 37 |
| **Pair precision** (auto-merge) | **1.0** | **1.0** |
| **Pair recall** (auto-merge over all true pairs) | **0.9462** | **0.9548** |
| Validation mismatches vs key | 0 | 0 |
| Per-pair decision drift vs `decisions_*.csv` | 0 rows | 0 rows |

Row confusion (expected link → decision), from the same command:

- A: DUP_IN_FILE→MERGE 65, →NEW 6, →REJECT 2, →REVIEW 9; EXISTING→MERGE 191, →NEW 5, →REJECT 9, →REVIEW 43; NEW→NEW 60, →REJECT 4, →REVIEW 6
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
| beforeHash `dcd67106e94405e05fa1cbd01dc37292567b390136cceaf1e890b0db12fc23b5` | same (same CRM fixture) |

File B with `--after fixtures/import_a.csv` gives 166 / 33 / 37 / 14, the `decisions_b.csv` figures (D-34).
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
| decisions_a.csv | `130190940bf8a58523f2e33e136defee0cdcc0a9a9e4c38f2d1b4a7fedfdf28d` |
| decisions_b.csv | `51e86237a56c66a0067244b04b88c9e2ef8f82dae45bcd47dedf0c1b9c245e36` |

All nine equal `docs/domain-brief.md` §12 and `fixtures/MANIFEST.json`.

## Model hash — `npm run model:lint`

`matching/model.v1.json` sha256 (canonical JSON, `src/lib/canonical.ts`):
`40312dfedce1ed59481bb610e4155ff90006f041700974825c48c63b37ee635b`, recorded under D-16. `model:lint` printed OK
on 2026-10-17: schema valid, hash equal, no forbidden token under `src/matching/`.

## Hand labels — pending (task 1.9)

`eval/labels/shane-30.json` does not exist yet. Shane labels the first 30 `REVIEW` rows of
`fixtures/decisions_a.csv` blind (D-31); then the eval prints agreement with the key (count and share), how
many he would have merged that the model held, how many he would have kept separate, and the score of each,
and O-2 / O-3 get a dated entry. Until then every number on this page is synthetic-only.
