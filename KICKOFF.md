# Kickoff — Housefile (Build Log #22, Nonprofit / Donor Management)

Paste the block below into Claude Code started in `~/Projects`, on Fable (`/model claude-fable-5-1`). The kit lives at `~/Projects/housefile-kickoff/`; nothing has been cloned, installed or committed yet.

```
Housefile — donor management with a messy-import pipeline (Build Log #22, main track).
The kickoff kit is in ~/Projects/housefile-kickoff/. Nothing exists yet besides the kit.

Read, in order, from the kit: CLAUDE.md, prd-housefile.md, docs/decisions.md
(authoritative), docs/domain-brief.md, docs/portfolio-overlap.md, docs/phase-1-tasks.md.

Steps, in order:
1. Port check. Read the port table in ~/.claude/CLAUDE.md. If 5500 is claimed, stop and
   tell me which port is free. If not, continue; you will add the row in step 3.
2. Clone the template: from ~/Projects/saas foundation at tag v1.2.1, create
   ~/Projects/housefile with the new-project script (name housefile, port 5500), remote
   renamed to `template`. Do not run new-project twice. Copy the kit in: CLAUDE.md,
   KICKOFF.md, NEXT.md, prd-housefile.md, docs/*.md, tools/*.py, fixtures/samples/,
   .claude/settings.json (merge the model pin; keep anything the template put there).
   Add the scope-honesty banner from the PRD to README.md verbatim.
3. Add the port row (housefile -> 5500) and the clone row in saas-foundation/CLONES.md
   (v1.2.1, 2026-10-14, "donor CRM + messy import with entity resolution; synthetic only;
   not deployed"). Put ?connection_limit=10&pool_timeout=20 on the local DATABASE_URLs.
   Confirm vercel.json has the house ignoreCommand.
4. npm ci, then npm run db:setup. Confirm the template is unchanged:
   npm run foundation:drift and npm test pass before any Housefile code exists.
5. Oracle check: python3 tools/golden_answers.py ends with OK. Then
   python3 tools/build_fixtures.py --seed 20261014 (writes fixtures/), then
   python3 tools/reference_matcher.py --write-decisions, then
   python3 tools/verify_fixtures.py ends with OK. Compare the sha256 values with
   docs/domain-brief.md section 12 and fixtures/samples/MANIFEST.json, and the
   matcher output with fixtures/samples/reference_matcher.output.txt. Report any
   mismatch; do not fix either side.
6. Run the reuse check from ~/Projects/_templates/STARTUP-REUSE-CHECK.md against
   docs/phase-1-tasks.md (it may not parse a task list; record the result either way)
   and record it in docs/decisions.md.
7. Read every doc. List anything that contradicts itself or can't be built as written,
   and anything in docs/portfolio-overlap.md whose donor path you could not find when
   you read the donor repos (loanbook, adjuster, pulseboard, callboard). Don't resolve
   these yourself.
8. Commit in three commits, naming files explicitly (never git add -A):
   (a) the new-project rewrite (package.json, playwright.config.ts, CI workflow,
       README.md, vercel.json);
   (b) the kickoff docs and tools (CLAUDE.md, KICKOFF.md, NEXT.md, prd-housefile.md,
       docs/*.md, tools/*.py, fixtures/samples/, .claude/settings.json);
   (c) the generated fixtures (fixtures/*.csv, fixtures/MANIFEST.json) — show me the
       hash table first.
   Then in ~/Projects/saas foundation commit CLONES.md; show me the diff first.
9. Plan first: write the Phase 1 plan as the order you will do tasks 1.1 to 1.8 and 1.10
   to 1.12 in, which donor you will read for each port in 1.3, and what you need from me
   for 1.9. Stop and show me the plan, the step 5 output, the contradictions list and the
   reuse-check result before writing any product code.

Stop there. Do not create Prisma models, migrations, UI or matcher code before I have
reviewed the plan. Task 1.9 (30 hand labels) is mine to do once 1.8 prints the eval
table. Update NEXT.md before you stop.

Rules from the first commit: nothing written to the database without a preview and its
beforeHash; the matcher under src/matching/ imports no database, clock, randomness,
network or model client; fixtures are never generated or read by product code; money
is integer cents; never edit an expected value to pass a test; never edit template-owned
paths (src/core/**, tests/invariants/**, core migrations); no new dependencies without
asking; no "accurate" or "optimal" anywhere without the number.
```

## Still to do by hand

- Private GitHub repo `shanelabountyai/housefile`, then `git remote add origin <url>`; before the first push, `git ls-files | grep -iE "\.env|secret|credential|\.pem$|\.key$"` (only `.env.example` may appear), and confirm `.gitignore` covers `.env` and `.env*.local`.
- Build-log card #22: name **Housefile**, PRD and repo links, status `in progress`, chips per `docs/portfolio-overlap.md` "Suggested card chips".
- Neon and Vercel only if this is ever deployed (not planned; synthetic data).
- Task 1.9: label 30 review-band pairs blind when the session says `import:eval` is printing.
- Decide O-1..O-9 when they come up; defaults are in force.
