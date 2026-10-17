# Housefile — Resolved Decisions & Open Items

The PRD leaves several rules open. The golden pairs and measurements in `docs/domain-brief.md` §9–§11 encode the answers below. If you change a decision, change `tools/matchlib.py`, the brief and the fixtures deliberately, not the tests. **This file outranks PRD text.**

## Resolved

### Owner decisions (Shane, 2026-10-14)

| # | Decision | Why |
|---|----------|-----|
| D-1 | **Import data is synthetic with mess injected on purpose and a ground-truth answer key.** `tools/build_fixtures.py` (Python 3, stdlib, a test oracle never imported by product code) generates a clean true population, the existing CRM state, two messy import files with the defect catalog in brief §3, and per-row answer keys naming the true person, the CRM record, in-file duplicates, gift duplicates, expected validation and trap codes. Seed 20261014; sha256 of every file in brief §12 and `fixtures/MANIFEST.json`. Deliberate traps where merging is wrong: Jr/Sr at one address with a shared phone; two different people with a common name in one city; spouses sharing an email. | No real people, ever. A key is the only way to report precision and recall as numbers |
| D-2 | **Matcher is deterministic, explainable, additive scoring with no model in Phases 1–3.** An LLM review-assist is a Phase 4 experiment against the same answer key with a cost cap (O-1). | The lesson is the discipline, not the model. A number that can't be explained can't be reviewed |
| D-3 | **Model pinned to Claude Fable 5.1** (`claude-fable-5-1`) in `.claude/settings.json` for specs and build. | Owner's call |
| D-4 | **Stack:** clone of saas-foundation v1.2.1 (Next.js 16, Prisma 7, PostgreSQL 17, vitest, Playwright). **Port 5500 proposed.** The first session confirms it is unclaimed in `~/.claude/CLAUDE.md`'s port table and adds the row in the same commit as the config. Known at kickoff: 3000–4200 in use, 4173, 4400 reserved, 4901, 5000, 5100, 5200 reserved (gridline), 5300 (opsagent) and 5400 proposed for another build. Template-owned paths never edited. Python only in `tools/`. | House rules |
| D-5 | **Foundation modules:** keep orgs, roles, invites, audit log, notifications/outbox. **Remove or leave unwired:** billing, share links. Use the template's module switch if it has one (`foundation:check-modules`); if not, leave the module unwired and record it here. | Nothing is billed or shared out of this product |

### Data model

| # | Decision | Why |
|---|----------|-----|
| D-6 | **Gifts are append-only money in integer cents.** A correction is a new `Gift` row with `supersedesGiftId` and `reason`; undo writes a superseding row with `status = VOIDED`, `reason = BATCH_UNDONE`. "Active" is derived: a gift with no superseding row. UPDATE/DELETE on `Gift`, `MergeEvent`, `ImportBatch`, `ReviewDecision` rejected by DB triggers. Amount parsing (N7) goes straight to cents; no float anywhere under `src/`. | LoanBook D11 ported; Gridline D1 pattern |
| D-7 | **Constituent fields are versioned.** `ConstituentVersion` rows hold the full field set with `importBatchId`/`mergeEventId`/`userId` as the writer; the current version is the latest. Aliases (prior names), alternate emails/phones/addresses carry `source` and `asOf`. Nothing on a constituent is lost by a merge or an import; it moves to an alias/alternate. | Undo needs the pre-batch version; survivorship needs the losers |
| D-8 | **Household is a group at one address**, at most one per constituent, with a derived display name ("The Johnson Household" when surnames agree, "Robert Johnson and Mary Lee" otherwise). Household giving = Σ members' hard credits. Household links are rows tagged with the batch or review that made them, so undo can remove them. | Letters and totals need it; NPSP household account model is the reference |
| D-9 | **Fund / Campaign / Appeal** per brief §2: a gift references one appeal; the appeal belongs to one campaign; the fund is on the gift. Pledges are promises with a schedule as data; balance derived. Soft credits are their own rows and never count in raised totals. | Raiser's Edge vocabulary; the three concepts are routinely conflated and the data model should not |

### Import, preview, commit

| # | Decision | Why |
|---|----------|-----|
| D-10 | **The batch stores the raw bytes and a content hash.** Encoding detection order: BOM → UTF-8 → cp1252, and the result is recorded. Parsed rows, the column map (with unmapped columns kept as `extras`), normalized values and the rules that fired are stored on the batch, so a preview can be reproduced from the batch alone. | Reproducibility; "what did the file actually say" is the first question in any dispute |
| D-11 | **Effective-state hash.** `stateHash(orgId)` = SHA-256 of canonical JSON (sorted keys, integers, ISO dates) of every active constituent's current fields, aliases, alternates and household; every active gift; every soft credit and household link; sorted by stable business ids. Excludes row ids, `createdAt`, batch ids, audit rows. One canonical serializer, ported from Adjuster. | Lets commit-then-undo hash equal; the proof in D-13 depends on it |
| D-12 | **Preview is the only input to commit.** Preview computes the full write plan and `beforeHash`, stores both on the batch. Commit recomputes `stateHash()`; if it differs from `beforeHash` → `STATE_MOVED`, no write, preview rebuilt. Commit applies the stored plan in one transaction, tags every row with the batch, and is idempotent on (batch id, plan hash). | Goal 1. The plan a person approved is the plan that runs |
| D-13 | **Undo is compensating rows, proven by hash.** `undoBatch` reverts every tagged write per brief §8, then asserts `stateHash() == beforeHash` inside the transaction; mismatch rolls back and marks `UNDO_FAILED` with both hashes. Refused with `UNDO_BLOCKED_BY_LATER_BATCH` when a later batch wrote to any touched constituent; batches undo in reverse order only. Created constituents are retired, not deleted (O-7). | Goal 4; append-only and exact restore reconcile at the effective-state layer |
| D-14 | **A batch can commit with reviews open.** Rows decided MERGE/NEW commit; REVIEW rows wait as `ReviewItem`s and are written when decided, tagged with the batch. Undo of the batch also reverts review decisions made under it. A batch is `COMPLETE` when no review item is open. | Otherwise one ambiguous row blocks 400 clean ones |
| D-15 | **Rows resolve in file order against the CRM plus rows accepted earlier in the batch.** On MERGE the target absorbs identifiers it lacked (S1) and the row's blocking keys point at the target; REVIEW rows index as themselves; REJECT rows are not indexed. | Found at kickoff: without it a third occurrence of a person whose second occurrence merged into the first never blocks (A-0041/A-0062) |

### Matching

| # | Decision | Why |
|---|----------|-----|
| D-16 | **Closed vocabularies as data.** Scoring features and points in `matching/model.v1.json` (brief §7, content-hashed, hash recorded here when the file is created); segment filters as `{field, op, value}` with a closed op set; column-map synonyms in `import/synonyms.json`. No expressions, no `eval`. | Adjuster D1 reasoning |
| D-17 | **Scoring model v1** exactly as brief §7: 20 features, thresholds MERGE ≥ 70 / REVIEW ≥ 45, suffix hard block, **first-name conflict cap and DOB conflict cap** (a pair with `FIRST_DIFF` or `DOB_DIFF` never auto-merges, whatever its score), identifier floor, name-change floor, household-candidate flag. Symmetric in argument order. Jaro-Winkler (prefix 0.1, max 4) at CLOSE ≥ 0.90 and DIFF < 0.80; American Soundex for blocking. | Set by hand, then measured (brief §11): the caps were added after the first fixture run auto-merged four spouse pairs per file (GA-19); re-checked against Shane's labels (O-2) |
| D-18 | **Blocking keys B1–B5** (brief §6). A pair that shares no key is not scored, and the count of true matches that were never blocked is a reported number, not a silent miss. | Cheap, explainable, and the miss is visible (B-0154) |
| D-19 | **Nickname table is a fixed list** mapping a raw first name to a *set* of canonicals; ambiguous nicknames map to several; agreement is set intersection. Unknown names map to themselves. The list lives in `matching/nicknames.json`. | A single-valued table turns Sam/Samantha into a wrong merge |
| D-20 | **Gmail dots and `+tags` are folded** (O-4 default); `+tag` folded on every domain. Recorded as a normalization, so the original is kept as an alternate. | Common in gala exports; reversible because the raw value survives |
| D-21 | **Two-digit years:** 00–69 → 20xx, 70–99 → 19xx. Day-first dates are `DATE_INVALID`, never guessed. Excel serials accepted in 20000–60000 (1954–2064). | A guessed day/month swap is worse than a reject |

### Review, survivorship, merge

| # | Decision | Why |
|---|----------|-----|
| D-22 | **Review actions are exactly** `MERGE`, `KEEP_SEPARATE`, `SAME_HOUSEHOLD`, `DEFER`; who, when and a reason (required for `MERGE` and `KEEP_SEPARATE`) are audited. `KEEP_SEPARATE` is remembered: the pair is not re-queued by a later import unless a new identifier agrees. | One queue entity (storage B-095 lesson); the memory stops the same spouse pair returning every month |
| D-23 | **Survivorship S1–S6** per brief §8. Names: existing wins, import kept as alias; contact fields: newer `asOf` wins, loser kept as alternate (O-5); suffix and DOB never changed by survivorship; gifts never deduped except exact `DUP_GIFT` / `DUP_GIFT_IN_FILE`; existing-to-existing merges never automatic. | Every rule names what it keeps, so a merge can be read back |
| D-24 | **`MergeEvent` snapshots both records' effective state** plus the ids of gifts and soft credits moved; `unmerge` restores from the snapshot and is refused (`UNMERGE_BLOCKED`) when a later merge touched either record. Proof by hash of each record's effective state against its snapshot. | Goal 4 at the record level |
| D-25 | **Duplicate gift rule:** same constituent (after resolution), same date, same cents, and same `externalRef` when the file has one; when it has none, date and cents only. Anything else is a new gift and the preview says how many gifts matched date+cents but had a different reference, so Marcus can look. | A gift silently dropped is as bad as one doubled |

### Letters, segments, campaigns

| # | Decision | Why |
|---|----------|-----|
| D-26 | **Acknowledgement letters are sample letters** queued to the notifications outbox as `QUEUED`, never sent. Template fields: constituent name (household name when combined), gift date, cents formatted, fund, appeal, and the fixed sentence "No goods or services were provided in exchange for this contribution." The letter page cites IRS Pub 1771 / irs.gov/node/551 for the $250 acknowledgment and $75 quid-pro-quo figures (read 2026-10-14) and states that this project does not claim to meet them. A gift superseded after its letter was queued raises `LETTER_STALE`. | Scope honesty; the outbox pattern comes from callboard/showcall |
| D-27 | **Segments are saved definitions plus a reproducible materialization** with count and run time; aggregates (total in window, last gift date, gift count, LYBUNT/SYBUNT, household vs individual) are computed from active gifts at run time; nothing derived is stored as truth. | Pulseboard's segment/aggregation discipline |
| D-28 | **Campaign roll-ups are derived views** over active gifts: raised, gifts, donors, average (integer division, remainder shown), by fund. | Marcus ties to the cent |

### Evaluation

| # | Decision | Why |
|---|----------|-----|
| D-29 | **`import:eval` reports the same fields as `tools/reference_matcher.py`** and must reproduce `fixtures/decisions_*.csv` pair for pair; CI fails on drift. Targets are stated as targets: pair precision ≥ 0.99, pair recall ≥ 0.90, rows in review ≤ 20%. Kickoff reference: A 1.000 / 0.946 / 14.5%; B 1.000 / 0.955 / 13.2%. | Goal 3 and 6 |
| D-30 | **The reference numbers are labeled as an upper bound.** Every write-up that quotes them says: reference matcher, generator's own defect catalog, same author; plus brief §3's list of defects not generated. The hand-labeled 30 pairs (task 1.9) are the only non-synthetic signal and are reported next to them. | Overclaiming is the failure mode this owner cares most about |
| D-31 | **Shane labels 30 review-band pairs blind** from `fixtures/decisions_a.csv` (the pair page shows both records and the reasons, not the answer key). Recorded in `eval/labels/shane-30.json` with per-pair notes. Eval prints: his agreement with the key, pairs he would have merged, pairs he would have kept separate, and whether any threshold change would follow (then O-2 is decided). | A person checks the thresholds, not the generator |
| D-32 | **A rejected row writes nothing.** No constituent, no gift; it is not matched and not indexed, so a later duplicate of it in the same file finds nothing and becomes new (visible in §11 as `DUP_IN_FILE → NEW`). The person fixes the file and re-imports; the re-import's rows match what the first batch wrote. | A half-written row (person without gift) is the kind of silent partial write the preview exists to prevent |

## Open — need Shane's call (defaults are in force until changed)

| # | Question | Default | Why it's open |
|---|----------|---------|---------------|
| O-1 | Use an LLM anywhere in matching? | **No** in Phases 1–3. Phase 4 experiment: review-assist on the review band only, suggests `MERGE`/`KEEP_SEPARATE`/`SAME_HOUSEHOLD` with a one-line reason, scored against the answer key and against Shane's labels; hard cost cap $10 enforced in the runner with spend logged per run; model id and price confirmed from Anthropic's docs at the time, never from memory | The deterministic matcher already sends 14–16% of rows to review; whether an assistant moves that number is an empirical question |
| O-2 | Thresholds 70 / 45 and the floors | As set | Measured only against the generator; re-decide after the 30 labels |
| O-3 | Surname change with the same email and address auto-merges (GA-05 = 70) | Yes | A shared family email could in principle belong to an adult child with a different surname and the same first name as a parent; rare, but Dana may want it in review |
| O-4 | Fold Gmail dots and `+tags` | Fold | Gmail ignores dots; other providers don't; `+tag` folding on every domain is a convenience |
| O-5 | Conflicting non-empty contact values on merge | Newer `asOf` wins, loser kept as alternate | A CRM admin may prefer "existing wins unless the import is from a source we trust"; needs a source-trust field (seam) |
| O-6 | `HOUSEHOLD_CANDIDATE` flags | Suggest only; a person links | Auto-linking spouses at one address is common practice but wrong for roommates and adult children who moved out |
| O-7 | Constituents created by a batch that is then undone | Retired version, not deleted | Deleting breaks the append-only rule; retired rows are excluded from the effective state and from screens |
| O-8 | A second, hand-written messy file (not from the generator) | P1, Phase 3 or later | The only way to measure beyond the generator's defect catalog |
| O-9 | Existing CRM duplicates at kickoff | None generated | A "find duplicates" run of the matcher over the CRM itself is P1; the generator could seed a few known CRM-internal dupes with a key when that lands |

## Not modeled (seams only)

Organizations as constituents · online giving and recurring gifts · pledge reminders · events, memberships, grants · wealth screening · NCOA / address verification · email verification · sending anything · tax receipts proper · multi-tenant billing · public API.

## Review log (2026-10-14)

Two reviews of the draft kit before handoff: a product owner (scope, contradictions, buildability, is Phase 1 finishable) and a CRM data-quality / entity-resolution specialist (defect catalog realism, traps, survivorship, household logic, honesty of the precision/recall targets). Both read the generated fixtures and the matcher output, not only the documents.

| Finding | Source | Outcome |
|---|---|---|
| Third occurrence of a person never blocked after the second merged into the first (A-0041 → A-0020 merged; A-0062 shared A-0041's email and found nothing) | Specialist, from the run | D-15: merged row's identifiers enrich the target; `true_pairs_not_blocked` A went 1 → 0 |
| Answer key labelled a person's second random draw as a second `NEW` row | PO, from the run | Generator now marks it `DUP_IN_FILE` with `dup_of_row_id`; `expected_link` counts changed (NEW 173 → 125, DUP 65 → 113) |
| Byte-identical duplicate of a rejected row expected `OK` | PO, from the run | Exact dups inherit the source row's `expected_validation` and `gift_dup_of`; validation mismatches B 2 → 0 |
| Surname change at the same address with no identifiers scored 25 → `NEW`; a Raiser's Edge admin would always look at that pair | Specialist | `NAME_CHANGE_CANDIDATE` floor; GA-17 frozen at 25 → REVIEW |
| Agreeing suffixes earned nothing, so "Robert E. Adams Sr." vs the Sr record scored the same as vs a suffix-less stranger | Specialist | `SUFFIX_EXACT` +5 |
| Same name, same building, different unit scored 42 → `NEW`; in an apartment file a unit typo is more likely than two David Nguyens | Specialist | `ADDRESS_SAME_BUILDING` 12 → 15; GA-18 frozen at 45 → REVIEW |
| Three of seven cities had leading-zero ZIPs and were drawn as often as Tulsa; 23% of rows carried `D-ZIP-LOSTZERO`, unrealistic for an Oklahoma shop | Specialist | Tulsa ×3, Edmond ×2 weighting; applied count 148 → 105 |
| Trap persons drawn repeatedly by the random pool (one Jr appeared five times in file A) | PO | Trap persons excluded from the random draw; each appears once plus any in-file duplicate |
| "Maiden name" is wrong for a defect applied to anyone | Specialist | Brief says "prior surname"; code keeps `D-MAIDEN` as the label |
| Precision 1.000 would be read as a product claim | PO, specialist | D-30 labelling; brief §11 wording; §3 "not generated" list; O-8 |
| Spouse pairs with a shared email: review every month forever | Specialist | D-22 `KEEP_SEPARATE` is remembered |
| Undo vs append-only looked contradictory (how do you "restore exactly" without deleting?) | PO | D-11/D-13: exactness is at the effective-state layer; raw history keeps both the batch and its undo |
| Undo after a later batch changed the same field is ambiguous | PO | D-13 refuses; reverse order only |
| Commit could run against a database that moved since the preview | PO | D-12 `STATE_MOVED` |
| Review items would block the whole batch | PO | D-14 |
| Gift duplicates: file B has no transaction id | Specialist | D-25 two-tier rule, with the near-miss count shown |
| "Receipts" overstates what the letters are; IRS figures needed a source | PO | Letters renamed "acknowledgement letters (sample)"; $250 / $75 cited to irs.gov/node/551 and Pub 1771, read 2026-10-14; D-26 |
| Phase 1 originally included schema, commit and the review queue | PO | Phase 1 cut to pipeline + matcher + eval with no writes; schema and commit moved to Phase 2 |
| Household as "shared address" would glue roommates | Specialist | O-6 suggest-only; `SAME_HOUSEHOLD` is a human action |
| Nickname table single-valued | Specialist | D-19 sets; GN tests for Ted/Sam |
| Two-digit year pivot and day-first dates unstated | Specialist | D-21 |
| Spouses sharing email **and** phone at one address with one surname scored 80 and auto-merged: 4 wrong merges per file on the regenerated fixtures (precision 0.985 A, 0.977 B) | Specialist, from the second run | First-name conflict cap and DOB conflict cap (D-17, brief §7 step 2); GA-19 and GA-20 frozen; wrong merges 0, recall unchanged |
| Generated phones ran past 555-0199, outside the block reserved for fiction; invented `name@gmail.com` addresses could be real mailboxes | Specialist | Phones confined to 555-0100..0199 across seven area codes (asserted on the population); emails only on RFC 2606 documentation domains; `D-EMAIL-GMAIL` replaced by `D-EMAIL-PLUSTAG`; Gmail dot-folding tested by GN-01 only |
| Validation code names `GIFT_DATE_DATE_*` were a concatenation artifact; fund text ("General" vs `GEN`) had no rule | PO, specialist | `GIFT_DATE_MISSING` / `GIFT_DATE_INVALID`; `FUND_UNKNOWN` warning with a default fund and a synonyms file |
| A rejected row's person was silently dropped with no stated rule | PO | D-32 |
| `decisions_*.csv` were not covered by the freeze check | PO | `verify_fixtures.py` regenerates them when present; their hashes are in brief §12 |
| Fixture hashes drifted during review (four regenerations) | PO | Final hashes in brief §12 and `fixtures/MANIFEST.json`; verified by two independent runs, decisions compared byte for byte |

**Not taken:** sending GA-05 to review (left as O-3); auto-linking households (left as O-6); a learned model (D-2); a third import file (O-8, P1); organizations as donors (seam only).
