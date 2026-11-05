# Housefile — demo script

A 15-minute walk through a messy donor import: preview, commit, review, letters, then undo, with every step proven by a
number or a hash. Drafted from the e2e path (`e2e/imports-review.spec.ts`, `e2e/crm-pages.spec.ts`). Every command and
click below was run on 2026-10-27 against `npm run dev` on port 5900.

> **Synthetic data only.** Every person and gift comes from `tools/build_fixtures.py --seed 20261014`. Letters are
> *sample letters* and are never sent. No compliance claim. (README banner, verbatim there.)

## Before the audience arrives

```bash
cd ~/Projects/housefile
npm run demo:setup            # org "demo": 286 constituents, 929 gifts, 18 pledges, 42 soft credits, 6 segments
npm run dev                   # http://localhost:5900
```

`demo:setup` prints `effectiveStateHash c2159b32…83fe3f`. Keep it visible: the undo at the end comes back to it.

**Accounts.** No passwords. `/demo` lists them while `DEMO_MODE=1` is set in `.env.local` (it is; `grep DEMO_MODE .env.local`).

| Account | Role | What it can do |
|---|---|---|
| `scorekeeper@housefile.demo.test` | scorekeeper | everything in this script (`results.write`) |
| `member@housefile.demo.test` | member | read only: same pages, no buttons |
| `owner@housefile.demo.test` | owner | seed actor and the CLI merge only; not on `/demo` (an owner must be TOTP-enrolled) |

**Data is append-only, so a demo cannot be reset.** Each run takes a fresh org: `npm run demo:setup -- demo2`, then
use `/o/demo2/…` everywhere below. The seed hash is the same for every fresh org.

## The walk

**1. Sign in.** `http://localhost:5900/demo` → *scorekeeper@housefile.demo.test*.
Say: "No passwords on a demo build; the real sign-in is a magic link plus TOTP for admins."

**2. The CRM as it stands.** `/o/demo/gifts?asOf=2026-10-14`
Shows **$375725.00 in 929 gift(s) from 255 donor(s)**. Then `/o/demo/campaigns?asOf=2026-10-14`: average
**$404.44 r 24**.
Say: "Money is integer cents everywhere. The average shows its remainder instead of rounding it away. These totals
equal an independent Python oracle to the cent; CI fails if they drift by one cent."

**3. A segment.** `/o/demo/segments` → *lybunt* → As of `2026-10-14` → **Run** → **86** members.
Say: "Segments are JSON definitions, not code. A run records the definition hash and the member-list hash, so last
month's list can be reproduced exactly."

**4. A household.** `/o/demo/constituents/C0001?asOf=2026-10-14` shows household **H0001**, two members, gave
**$6750.00**, with the source and as-of date of every field.

**5. The messy import.** `/o/demo/imports` → choose `fixtures/import_a.csv` → **Upload and preview**.
The totals line reads **rows 400 = merged 259 + reviewed 55 + new 71 + rejected 15**.
Say: "Nothing is written yet. This preview is the whole write, and it carries a hash of the database as it stood. If
anything changes before commit, the commit refuses."
Scroll the report: every merge shows its reasons and points.

**6. Commit.** **Commit exactly this preview** → status **COMMITTED**.

**7. Review queue.** `/o/demo/review` → **68 open row(s)**. Open any row: the import row beside each candidate, the
reasons, and four actions (MERGE, KEEP_SEPARATE, SAME_HOUSEHOLD, DEFER), each needing a reason.
Say: "17% of the file waits for a person. That is the measured price of 0 wrong auto-merges on this file."

**8. Letters.** `/o/demo/letters` → As of `2026-10-14` → **Queue letters for gifts with none** →
**Queued 1227 letter(s). Nothing was sent.** Open any letter: **SAMPLE LETTER** banner.

**9. Undo the whole import.** Back to the batch page (`/o/demo/imports` → the batch) → **Undo is available** →
**Undo this batch** → status **UNDONE**, and the proof line:
`state hash c2159b32… == before hash c2159b32…`.
Say: "Undo is not a soft delete. It restores the exact state from before the preview, proves it by hash, or rolls back
and marks the batch UNDO_FAILED with both hashes."

**10. Stale letters.** `/o/demo/letters` → **1227 letter(s): 929 queued, 298 stale**.
Say: "The 298 letters covered gifts the undo just voided. The letter rows stay, because they are append-only too, and
they are marked stale so nobody mails them."

**11. Merge and unmerge.** In a terminal:

```bash
npm run constituents:merge -- --a C0005 --b C0006 --reason "demo: same person" --org demo --user owner@housefile.demo.test
# MERGED C0005 into C0006: MergeEvent <id>
```

Then `/o/demo/constituents/C0006` → **Unmerge is available** → **Unmerge** →
`Survivor hash … == its snapshot …; loser hash … == its snapshot …`.
Do this beat **before step 5** on a fresh org, or on a second fresh org: after the import, C0006 also carries the
import's (reversed) merge history and the page lists two merge sections.

**12. Read-only.** Sign out, `/demo` → *member@housefile.demo.test*. Same pages, no upload form, no queue button, no
Unmerge button.

## The proof behind the demo

```bash
npm run phase3:proof:test     # seed → oracle → commit A → letters → correct a gift → 1 stale → undo A → hash; about 7 s quiet
```

The full transcript and a deliberately broken run are in `docs/EVAL.md` → *Phase 3*.

**13. The AI experiment (no key needed).**

```bash
npm run assist:eval    # reads the committed run files only; no network, no key
```

Expect two lines: `P4-4 claude-haiku-5-5-2026-10-30: NO MEASURED GAIN (wrong MERGE 1; ...)` and the same for Sonnet
(wrong MERGE 2). Say: "I asked two models to label the 98 pairs the matcher leaves for a person. They removed 64% and
81% of the review work, but each made wrong merges, and the bar was zero. So the product does not call a model."
Spend: $0.24 over 196 calls, logged per call. `src/` never imports `experiments/`; `npm run model:lint` enforces it.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/demo` is a 404 | `DEMO_MODE` not `1` | `grep DEMO_MODE .env.local`; restart `npm run dev` |
| `/demo` lists no housefile accounts | `demo:setup` not run against this database | `npm run demo:setup` |
| `/o/demo/...` is a 404 | signed in as a user who is not in that org | sign in again through `/demo` |
| Letters already queued, or batches already there | the org was used by an earlier demo | `npm run demo:setup -- demo2` and use `/o/demo2` |
| Two "merge" sections on C0006 | the import ran before the merge beat | use a fresh org for step 11 |
| Preview or commit spins for minutes | machine under load (another project's sweep) | `uptime`; stop other dev servers and sweeps, then reload |
| `connect ECONNREFUSED 5432` | local Postgres not running | `brew services start postgresql@17` |

## Concede before you're asked

- **Synthetic data, one file shape.** The matcher's numbers (0 wrong merges, 17% review) are measured on generated
  files. A real donor file would need its own answer key before any number is claimed.
- **No gift-correction button.** Corrections and voids are built and tested (`correctGift`, `voidGift`) but only reachable
  from code; the page shows the chain once one exists. The merge in step 11 is a CLI for the same reason.
- **No pagination.** The gift and letter lists render every row: fine at 1,227, not at 100,000.
- **Letters are never sent** and make no IRS claim. There is no address block and no re-issue of a stale letter.
- **Not deployed.** It runs on a laptop against local Postgres, on purpose.
- **The model experiment is a negative result.** Verdict NO MEASURED GAIN on 98 synthetic pairs, one prompt, two
  models; it says nothing about other prompts or real files. Re-running `assist:run` needs a key and costs money.
- **Review load is the price of caution.** 68 of 400 rows go to a person. A looser threshold would cut that and start
  making wrong merges; the floor is a decision (`docs/decisions.md`), not a tuning accident.
