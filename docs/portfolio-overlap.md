# Housefile — Portfolio Overlap Check

Checked 2026-10-14 against the build-log card list and the sibling kickoff kits that were readable from the workspace (gridline-kickoff, bracketry, opsagent, the saas-foundation CLONES table). **The donor projects' source trees were not readable from here**; the "Where" column names what to look for and the first session must read each donor before porting (CLAUDE.md working rule "port before you write"). Purpose: keep Housefile from re-teaching what a sibling built, and keep the comfortable half (a CRM) from eating the new half (the import).

## Verdict

The card lists six chips. Read literally, three are already built somewhere:

| Card chip | Already in the portfolio? | What Housefile does instead |
|---|---|---|
| CRM (contact records) | **Yes, in substance** — every saas-foundation clone has people, orgs and roles; rental/storage/showcall have contact records with audit | Constituents are *versioned* with aliases and alternates so a merge and an undo can be exact. The record is the floor, not the lesson |
| campaigns | Partly — event toolkit and showcall have campaign-like containers | Fund / campaign / appeal hierarchy as data; roll-ups derived from append-only gifts |
| segmentation | **Yes — Pulseboard** owns segments and aggregations | Segment definitions as closed-vocabulary data with a reproducible materialization; ported, not redesigned |
| receipts | No, but close to callboard/showcall notifications | Sample acknowledgement letters queued to the outbox; `LETTER_STALE` when the gift is superseded |
| CSV import | Partly — Pulseboard `/ingest` (per-row dead-lettering), Gridline P1 "read-file CSV import with column map and preview" (never built) | **New:** mapping with saved synonyms, normalization with the rule recorded, row reasons, and a preview that is the only input to commit |
| dedupe + entity resolution | **No.** Pulseboard dedupes on an exact `(orgId, eventId)` key; nothing in the portfolio decides whether two *different-looking* rows are one person | **New, and the core:** blocking, explainable scoring, three-way decision, review queue, survivorship, merge/unmerge, batch undo with a hash proof, precision/recall against a key |

Suggested card chips once it ships: `column mapping + validation` · `explainable matching (merge / review / new)` · `survivorship + unmerge` · `batch undo proven by hash` · `precision / recall vs answer key`.

## Reuse — port, do not rebuild

| Capability | Donor | Where to read first | Housefile use |
|---|---|---|---|
| Auth, orgs, roles, invites, audit log, cron, outbox, CI, invariants | saas-foundation v1.2.1 | template | As cloned; billing and share links removed or unwired (D-5) |
| Money as integers (cents), one money module, no floats, ledger discipline | LoanBook | `src/ledger/money.ts` (its D11), `ledger:verify` | Gift amounts; N7 parses to cents; the lint |
| Reversing entry that references the original; "voided" derived | LoanBook | reversal entries | `supersedesGiftId`, `VOIDED` rows on undo (D-6) |
| Versioned rules as data; closed vocabulary; immutable published versions with content hash | Adjuster | `RuleSetVersion`, canonical serializer (`src/rules/canonical.ts`), its D1/D2/D5 | `matching/model.v1.json` hashed; `stateHash` canonical JSON (D-11, D-16) |
| Decision explanations: a decision carries the rules that fired and why | Adjuster | decision trace / explanation output | Match `reasons[]` and `flags[]` are the same idea applied to pairs |
| Replay-and-compare verify with coded failures | Adjuster / LoanBook | `decisions:verify`, `ledger:verify` | `import:eval` drift check against `decisions_*.csv` |
| Append-only superseding versions | Adjuster | `DocumentVersion` (its D53) | `ConstituentVersion`, `Gift` supersession |
| Segments and aggregations over events | Pulseboard | `src/lib/rollups.ts`, segment definitions | Segment materialization and campaign roll-ups (D-27, D-28); read before Phase 3 |
| Per-row intake with dead-lettering and an exact-key dedupe | Pulseboard | `src/app/ingest/route.ts` | Parse stage shape and the `REJECT` list; **not** the matcher |
| Notifications outbox: queued, templated, never sent in tests | callboard / showcall | templates registered into the notifications module at runtime (callboard CLONES note) | Acknowledgement letters `QUEUED` (D-26) |
| Magic-link person without a `User` | callboard | `Person` model | Seam only: constituents never log in |
| Frozen fixtures + Python oracle + golden answers script | Gridline kit / LoanBook / Adjuster | `tools/`, `fixtures/`, `golden_answers.py` | Same workflow (`build_fixtures.py`, `verify_fixtures.py`, `golden_answers.py`, `reference_matcher.py`) |
| One queue entity for all human work items | storage / rental | B-095 | `ReviewItem` with four actions (D-22) |
| Pure engine, deterministic, one scoring function, append-only history | Bracketry | `src/lib/league/` rules in its CLAUDE.md | `src/matching/` purity rules; "never optimal, say what was measured" |
| Frontmatter model tier per subagent, model pin in settings | opsagent / gridline | `.claude/settings.json` | D-3 |

## New — each with the fixture that proves it

| # | Lesson | Not in any sibling because | Proven by |
|---|---|---|---|
| 1 | Column mapping from header synonyms with saved maps and `extras` never dropped | Pulseboard ingests a fixed JSON shape | Both fixture files map with no hand edits; `Table #`, `Notes`, `Source` land in `extras` |
| 2 | Normalization with the rule recorded per value (N1–N9), including Excel damage (lost ZIP zeros, serial dates) and encodings | No sibling takes human-made spreadsheets | GN-01..GN-20; `expected_validation` matches on 650 rows |
| 3 | Candidate blocking with the miss count reported | Pulseboard dedupes on an exact key | `true_pairs_not_blocked` = 0 (A) and 1 (B), named |
| 4 | Additive, explainable match scoring with a three-way outcome, floors and a hard block | Adjuster explains *rule* decisions on one record; nothing scores *pairs* | GA-01..GA-20 |
| 5 | Traps where merging is wrong, built into the data on purpose | No sibling has an answer key for identity | T1 Jr/Sr → 0 wrong merges; T2 same-name → 0; T3 shared email → review (GA-19 cap) |
| 6 | Precision, recall and review load as the product's own reported numbers | Siblings verify exactness (replay), not a heuristic's quality | `import:eval` §11 table; D-29/D-30 |
| 7 | A human review queue whose decisions are remembered and audited | storage's queue tracks work, not identity | `KEEP_SEPARATE` memory test; review audit rows |
| 8 | Field-level survivorship with every losing value kept | Siblings never merge two records | S1–S6 tests; alias/alternate rows after GA-02 accepted |
| 9 | Merge/unmerge with an exact-restore proof by hash | LoanBook reverses entries; nothing re-splits a record | Unmerge hash test (P0-5) |
| 10 | Dry-run preview that *is* the commit plan, with `beforeHash` and `STATE_MOVED` | BoxLoop/Gridline runs are idempotent but not previewed | P0-4 tests |
| 11 | Undo of a whole batch over append-only tables, proven by effective-state hash | Gridline cancels one bill; nothing undoes a batch of mixed writes | Undo proof on both fixture files and the hand-built merge batch |
| 12 | A hand-labeled set from a person compared with the generator's key | Siblings' oracles are the only truth | `eval/labels/shane-30.json` and its agreement numbers |

## Guardrails — lessons Housefile must not take

| Lesson | Owner | Rule here |
|---|---|---|
| High-volume ingestion, rollup performance | 07 Pulseboard | 650 rows; no load test |
| Double-entry ledger, accrual, delinquency | 08 LoanBook | Gifts are append-only rows, not a ledger; totals are sums |
| Rules engine, authoring UI, impact diff | 09 Adjuster | A fixed feature table in JSON; no editor |
| Billing from measurements, cancel-and-rebill | 10 Gridline (shelved) | Not applicable; no bills |
| Document extraction, confidence per field, OCR | A3 Claims Intake (adjuster repo) | Input is structured CSV; no extraction |
| Live CRM writes with approval rows and hash chains against HubSpot | A2 Marketing-Ops Agent | Housefile writes only its own database; no external CRM |
| Tenant isolation, per-tenant billing | 19 Multi-Tenant Shell (planned) | Foundation orgs as cloned |
| Public API, webhooks | 20 Public API (planned) | None |
| Real-time collaboration | planned | Review queue is request/response |
| Learned matching models | — | D-2; Phase 4 is an experiment with a cap, not the product path |

## How this was checked

- Read: gridline-kickoff (CLAUDE.md, PRD, decisions, brief, overlap, phase-1 tasks, SHELVED), bracketry CLAUDE.md and CLONES.md, opsagent KICKOFF.md, adjuster and showcall NEXT.md, the owner's global conventions, the Startup Reuse Check template. The source trees of loanbook, adjuster, pulseboard, callboard and showcall were **not** reachable from the kickoff workspace; the "Where" column is from their kickoff docs and CLONES notes and must be confirmed by reading the code before each port (task 1.3).
- `reuse-scan.py` exists at `~/Projects/reuse-scan.py` and indexes markdown backlog tables; whether it parses a checkbox task list is unverified. KICKOFF step 6 runs it and records the result either way.
