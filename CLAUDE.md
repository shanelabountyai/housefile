# CLAUDE.md — Housefile

Learning project: donor management with a messy-import pipeline. Column mapping, row-level validation, normalization, blocking, explainable match scoring (merge / review / new), a human review queue, survivorship, a dry-run preview of every write, and an undo of a whole import batch proven by a hash. **Synthetic data only. Never real people, never real gifts. No compliance claims; acknowledgement letters are samples.** Keep the scope-honesty banner verbatim in README.md.

Read first: `prd-housefile.md` (what), `docs/decisions.md` (authoritative; outranks the PRD), `docs/domain-brief.md` (vocabulary, defect catalog, N/B/S rules, scoring model, golden pairs, measurements), `docs/portfolio-overlap.md` (what to port, what not to build). Current work: `docs/phase-1-tasks.md`. Session state: `NEXT.md`.

## Non-negotiables
1. **Nothing is written without a preview.** Every import commit writes exactly the previewed changes and nothing else. There is no code path from a parsed file to the database that skips the preview and its `beforeHash`.
2. **Every merge is explainable and undoable.** A merge decision carries its reasons and points; a `MergeEvent` stores both records' effective state; `unmerge` restores both exactly, proven by comparing effective-state hashes to the snapshots.
3. **Import-batch undo restores the exact prior state**, proven: `stateHash()` after `undoBatch` equals the `beforeHash` stored at preview, or the undo rolls back and the batch is marked `UNDO_FAILED` with both hashes.
4. **The matcher is pure and deterministic.** `src/matching/` imports no database, clock, randomness, network or model client. Same inputs, same decisions, in either argument order. The scoring model is a closed table in `matching/model.v1.json`, content-hashed; a new feature needs a `docs/decisions.md` entry and a golden pair.
5. **Fixtures are frozen.** `fixtures/` is generated once by `tools/build_fixtures.py --seed 20261014`; `tools/verify_fixtures.py` must print OK in CI. Product code never reads `truth_persons.csv`, `answer_key_*.csv` or `decisions_*.csv`; only `import:eval` does.
6. **Integers for money.** Gift amounts are `Int` cents. No float touches an amount; `N7` parses to cents directly. One money module (ported from LoanBook).
7. **Gifts and import batches are append-only.** A gift correction is a new row with `supersedesGiftId` and a reason; undo writes `VOIDED` superseding rows; "voided" and "active" are derived. UPDATE/DELETE on gifts, merge events and import batches is rejected by DB triggers.
8. **Never edit an expected value to pass a test.** GA/GN values and `decisions_*.csv` come from the oracle in `tools/`. If TypeScript disagrees, stop and show the owner both derivations.
9. **Never say "accurate", "optimal" or "deduplicated" without the number.** Screens, commit messages and write-ups report precision, recall, review share, pairs compared and the fixture hash.
10. **Nothing leaves.** Letters are queued to the outbox and never sent; no email, payment, address-verification or model API is called in Phases 1–3.

## Working rules
- **TDD order:** normalization (N1–N9, GN goldens) → parse and map → validation → blocking → scoring (GA goldens) → batch resolution and `import:eval` → (Phase 2) schema and triggers → preview and `beforeHash` → commit → review actions → survivorship and merge → unmerge → undo → tamper tests → (Phase 3) CRM surface. Write the failing test against a committed fixture first.
- **Fixtures:** tests read `fixtures/`; code never generates them. To change a fixture, change `docs/decisions.md` first, regenerate with `tools/build_fixtures.py`, confirm `tools/verify_fixtures.py` and `tools/golden_answers.py` print OK, update the hashes in `docs/domain-brief.md` §12, review the diff.
- `tools/*.py` are test oracles, not product code. Don't import or port them line for line; `matchlib.py` is the spec made executable, the TypeScript matcher is written from `docs/domain-brief.md` §5–§8 and must agree with it on every pair.
- **Port before you write.** Donors are listed in `docs/portfolio-overlap.md`. Read the donor, port it, record the lineage in `docs/decisions.md`.
- Phase gate: don't start the next phase until the current phase's exit criteria pass. Phases: 1 pipeline + matcher + eval (no writes) → 2 commit, review, merge, undo → 3 CRM surface → 4 LLM review-assist experiment (optional, O-1). Write the next phase's task list at the gate and stop for review.
- Adding a feature, floor, validation code, normalization rule or survivorship rule needs a `docs/decisions.md` entry and a golden pair or fixture.
- Column maps, the scoring model and segment definitions are JSON data, not TypeScript.
- Small commits, one concern each, naming specific files (never `git add -A`). Note seams for non-goals but don't build them.
- Ask before adding dependencies. No fuzzy-matching, phonetics or CSV library without asking: Jaro-Winkler, Soundex and the CSV reader are small and the point is to own them.
- **Model is pinned to Claude Fable 5.1 (`claude-fable-5-1`)** in `.claude/settings.json` (D-3). Recommend the model at the start of each item per the global rules; this project's matcher, hashes, undo and phase gates stay on Fable.
- End each session by updating `NEXT.md`: what was built, decided, left open, and the gate output.

## Session 0 — reuse check (run before sequencing the backlog)

Before any task is scoped or built, run the reuse scan against the task list and act on the output:

    cd ~/Projects
    python3 reuse-scan.py check "housefile/docs/phase-1-tasks.md" "housefile"

Three buckets come back:

- **🟢 REUSE** — already built elsewhere. Do NOT rebuild. Port the implementation, mark the task done, and cite the donor item ID (e.g. "lifted from loanbook `src/ledger/money.ts`") so the lineage survives.
- **🟡 ADAPT** — close to something built. Read the existing implementation before writing. Then either extend the shared module or fork it *with a written reason* recorded in `docs/decisions.md`.
- **🔵 NEW** — no prior implementation. This is the real size of the project. Sequence only these.

**Record the outcome in `docs/decisions.md`** as a dated decision: what was reused, from where, and which project governs when the two diverge. `docs/decisions.md` outranks any PRD text. The scanner indexes markdown backlog tables and may not parse a checkbox task list; record the result either way. Re-run the check after the task list is re-sequenced.

## Stack
TypeScript on a clone of saas-foundation v1.2.1: Next.js 16, Prisma 7, PostgreSQL 17, vitest, Playwright. **Port 5900** (5500 was taken by use-case-insurance-fnol-intake; row in `~/.claude/CLAUDE.md` — D-44). Foundation modules: keep orgs, roles, invites, audit, notifications (outbox for letters); remove or leave unwired billing and share links (D-5). Immutability via triggers as hand-written SQL in Prisma migrations. Python only in `tools/` (stdlib only). Template-owned paths (`src/core/**`, `tests/invariants/**`, core migrations) are never edited here. Local `DATABASE_URL`s carry `?connection_limit=10&pool_timeout=20`. `vercel.json` carries the house `ignoreCommand` even though no deploy is planned. CI runs with a non-UTC `TZ`.

## Commands (create in Phase 1, task 1.1)
- `npm test` — vitest against the local `housefile_test` database
- `npm run import:eval` — runs the matcher over `fixtures/import_a.csv` and `import_b.csv` against `fixtures/crm_constituents.csv`; prints the §11 table; exits non-zero if any per-pair decision differs from `fixtures/decisions_*.csv`. Prints `0 rows` and exits 0 until task 1.8
- `npm run fixtures:check` — `python3 tools/verify_fixtures.py && python3 tools/golden_answers.py && git diff --exit-code fixtures/ && test -z "$(git status --porcelain fixtures/)"`
- `npm run model:lint` — schema-validates `matching/model.v1.json`, confirms its hash matches the one recorded in `docs/decisions.md`, greps `src/matching/` for `Date.now`, `Math.random`, `prisma`, `fetch`, `anthropic`
- `npm run import:dry-run -- --file <csv> --map <json>` — Phase 1 CLI: prints the preview report, writes nothing
- `npm run import:undo -- --batch <id>` — Phase 2

## Definition of done (any task)
Tests green, `import:eval` matching the reference exactly, `fixtures:check` OK, `model:lint` OK, no float money and no forbidden import under `src/matching/`, decisions doc updated if a rule changed, `NEXT.md` updated, numbers (not adjectives) in the commit message when a measurement changed.
