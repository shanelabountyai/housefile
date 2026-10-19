# NEXT

## ▶ Next session: clone and set up on the Mac, then plan Phase 1 (stop before code)

Paste the block in `KICKOFF.md` into Claude Code started in `~/Projects`, on Fable.

**2026-10-14 (kickoff kit):** Kit written and reviewed in the cloud workspace: PRD v1.1, decisions D-1..D-32 + O-1..O-9, domain brief with the defect catalog, scoring model, golden pairs GA-01..GA-20, normalization goldens GN-01..GN-20 and the kickoff measurements, portfolio overlap, Phase 1 tasks, CLAUDE.md, KICKOFF.md, `.claude/settings.json` (Fable pin). Tools in `tools/` (Python 3, stdlib): `matchlib.py` (spec made executable), `build_fixtures.py` (seed 20261014), `reference_matcher.py`, `golden_answers.py` (prints OK), `verify_fixtures.py` (prints OK). Fixtures were generated twice in separate directories with identical sha256 values (brief §12); only small samples and `MANIFEST.json` are in the kit under `fixtures/samples/`. **Not done:** the clone, `npm ci`, `db:setup`, any commit, the port-table row (not reachable from this workspace), the GitHub repo, the build-log card.

Kickoff measurements (reference matcher on the frozen fixtures, thresholds 70/45): file A precision 1.000, recall 0.946, 58 of 400 rows to review, 0 wrong merges; file B 1.000, 0.955, 33 of 250, 0 wrong merges. The first run had 4 wrong spouse merges per file; the first-name and DOB conflict caps (brief §7 step 2) fixed it at no recall cost. These are an upper bound (D-30), not a product claim; Shane's 30 hand labels (task 1.9) are the honest check.

Kit was reviewed by a product owner and a CRM data-quality specialist before handoff; see `docs/decisions.md` §Review log. Open items O-1..O-9 have defaults in force.

Not verified from this workspace: the donor repos' file paths named in `docs/portfolio-overlap.md` (read the donors before porting); whether `reuse-scan.py` parses a checkbox task list; whether saas-foundation v1.2.1 has a module switch for billing and share links (D-5 says what to do either way).

**2026-10-19 (foundation upgrade):** saas-foundation v1.2.1 -> v1.3.0 (security release, due 2026-10-21) is merged on branch `foundation-v1.3.0`, PR open against `main`, awaiting merge. After it merges, update housefile's row in the template's `CLONES.md` to v1.3.0 and run `npm run db:migrate` locally (adds the `scorekeeper` enum value). The `phase-1` branch will need `main` merged in after that.
