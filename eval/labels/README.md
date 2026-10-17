# Hand labels (task 1.9) — pending

This directory is for Shane's 30 blind labels of review-band pairs from `fixtures/decisions_a.csv`
(D-31): `shane-30.json`, one entry per pair with `row_id`, `target`, `label` (`MERGE` | `KEEP_SEPARATE` |
`SAME_HOUSEHOLD`) and a one-line `reason`, written without opening the answer key.

Nothing here was produced by the unattended Phase 1 build session (2026-10-17): the labels are the only
non-synthetic signal in the project and must come from a person. When the file exists, the eval prints
agreement with the answer key (count and share), pairs Shane would have merged that the model held, pairs he
would have kept separate, and the score of each; O-2 (thresholds) and O-3 (GA-05) are decided on that
evidence and recorded in `docs/decisions.md` and `docs/EVAL.md`.

Suggested pick: the first 30 rows of `fixtures/decisions_a.csv` whose decision is `REVIEW`, in file order.
