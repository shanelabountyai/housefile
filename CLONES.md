# Clones

Every project cloned from this template, and the release it is on. Update the row when a clone upgrades.

| Clone | Repo | Version | Notes |
|---|---|---|---|
| tradepost | [shanelabountyai/tradepost](https://github.com/shanelabountyai/tradepost) (private) | v1.0.1 | first clone, 2026-09-25; provider = org (clone D-001) |
| pulseboard | [shanelabountyai/pulseboard](https://github.com/shanelabountyai/pulseboard) (private) | v1.2.0 | 2026-09-26, merged v1.2.0 2026-09-28; product = org, `/ingest` authenticated by hashed write key (clone D-001/D-003) |
| callboard | [shanelabountyai/callboard](https://github.com/shanelabountyai/callboard) (private) | v1.0.1 | 2026-09-26; onsite event staffing, port 4600; `Person` never needs a `User` (magic links per person per event), templates registered into the notifications module at runtime |
| loanbook | [shanelabountyai/loanbook](https://github.com/shanelabountyai/loanbook) (private) | v1.2.0 | 2026-09-29; microloan servicing on an append-only double-entry ledger, port 4700; not deployed, synthetic data only |
| boxloop | [shanelabountyai/boxloop](https://github.com/shanelabountyai/boxloop) (private) | v1.2.0 | 2026-09-30; subscription billing state machines, port 4800; not deployed, mock payments |
| adjuster | [shanelabountyai/adjuster](https://github.com/shanelabountyai/adjuster) (private) | v1.2.0 | 2026-10-01; insurance claims adjudication on versioned rules-as-data, port 4900; not deployed, synthetic data only, mock payments |
| bracketry | [shanelabountyai/bracketry](https://github.com/shanelabountyai/bracketry) (private) | v1.3.0 | 2026-10-06, merged v1.3.0 2026-10-14 (asked for its scorekeeper role, L-040); rec-league scheduler, port 5100; pure engine in `src/lib/league/` |
| housefile | [shanelabountyai/housefile](https://github.com/shanelabountyai/housefile) (private) | v1.3.0 | 2026-10-17 on v1.2.1, merged v1.3.0 2026-10-19; donor management with a messy-import pipeline (explainable match scoring, preview-before-write, hash-proven batch undo), port 5900; not deployed, synthetic data only; `tools/` (Python stdlib oracles), `fixtures/`, `matching/` are clone-owned |

**Portfolio scorecard artifact:** https://claude.ai/artifact/TognMvisj8T9GNQGtE9MbJ (data `audit/scorecard.json`, built by `audit/build-scorecard.py`, page from `audit/scorecard.template.html`; republish to the same URL after each release or batch of SEC fixes).
