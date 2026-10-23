"""Housefile — Phase 3 synthetic data (test oracle, never product code). D-67.

Reads the frozen Phase 1 CRM (fixtures/crm_constituents.csv, crm_gifts.csv) and writes,
under fixtures/phase3/ (default) or --out DIR:
  pledges.csv          promises with a schedule: installments "YYYY-MM-DD:cents|..." summing to total_cents
  pledge_payments.csv  new gifts (ids continue after the CRM's last G…) paying an installment, all on or before AS_OF
  soft_credits.csv     recognition rows on existing gifts: SPOUSE (household partner) or PEER_TO_PEER
  corrections.csv      hand corrections to existing gifts: CORRECT one field, or VOID; each with a reason
  MANIFEST.json        seed, counts, sha256 of every file

The Phase 1 fixtures are read only; nothing here moves their hashes.
Deterministic: same seed and same CRM in, same bytes out. Standard library only.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import random
import sys
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SEED_DEFAULT = 20261014
AS_OF = "2026-10-14"  # D-37 / D-69: payments never fall after it

PLEDGE_COLS = ["pledge_id", "constituent_id", "pledge_date", "total_cents", "fund", "campaign", "appeal", "installments"]
PAYMENT_COLS = ["gift_id", "pledge_id", "constituent_id", "gift_date", "amount_cents", "fund", "campaign", "appeal", "gift_type"]
SOFT_COLS = ["soft_credit_id", "gift_id", "constituent_id", "role", "amount_cents"]
CORR_COLS = ["correction_id", "gift_id", "action", "field", "new_value", "reason"]

# (fund, campaign, appeal, totals in cents, installments count, months between)
PLEDGE_KINDS = [
    ("BLDG", "CAP2025", "Capital Phase 1", [300000, 500000, 1000000, 2500000], [4, 5, 8], 3),
    ("SCHOL", "AF2025", "Year-End 2025", [120000, 240000, 360000], [3, 4, 12], 1),
    ("GEN", "AF2026", "Gala 2026", [100000, 250000], [2, 4], 6),
]


def read_csv(path: str) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, min(d.day, 28))


def write_csv(path: str, rows: list[dict], cols: list[str]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    data = buf.getvalue().encode("utf-8")
    with open(path, "wb") as f:
        f.write(data)
    return hashlib.sha256(data).hexdigest()


def build(seed: int, crm_dir: str) -> dict[str, list[dict]]:
    R = random.Random(seed)
    people = read_csv(os.path.join(crm_dir, "crm_constituents.csv"))
    gifts = read_csv(os.path.join(crm_dir, "crm_gifts.csv"))
    ids = [p["constituent_id"] for p in people]
    households: dict[str, list[str]] = {}
    for p in people:
        households.setdefault(p["household_id"], []).append(p["constituent_id"])
    as_of = date.fromisoformat(AS_OF)

    # pledges and their payments; pledgers drawn without replacement so one pledge per constituent
    pledges, payments = [], []
    next_gift = max(int(g["gift_id"][1:]) for g in gifts) + 1
    pledgers = R.sample(ids, 18)
    for i, cid in enumerate(pledgers, 1):
        fund, campaign, appeal, totals, counts, step = PLEDGE_KINDS[i % len(PLEDGE_KINDS)]
        total = R.choice(totals)
        n = R.choice(counts)
        start = date(2025, 1, 15) + timedelta(days=R.randrange(0, 420))
        each = total // n
        cents = [each] * (n - 1) + [total - each * (n - 1)]  # last installment carries the remainder
        sched = [(add_months(start, step * k), c) for k, c in enumerate(cents)]
        pid = f"PL{i:03d}"
        pledges.append({"pledge_id": pid, "constituent_id": cid, "pledge_date": (start - timedelta(days=R.randrange(1, 30))).isoformat(),
                        "total_cents": total, "fund": fund, "campaign": campaign, "appeal": appeal,
                        "installments": "|".join(f"{d.isoformat()}:{c}" for d, c in sched)})
        for due, c in sched:
            if due > as_of or R.random() < 0.2:  # not yet due, or missed
                continue
            paid = min(due + timedelta(days=R.randrange(0, 21)), as_of)
            payments.append({"gift_id": f"G{next_gift:05d}", "pledge_id": pid, "constituent_id": cid,
                             "gift_date": paid.isoformat(), "amount_cents": c, "fund": fund, "campaign": campaign,
                             "appeal": appeal, "gift_type": "PLEDGE_PAYMENT"})
            next_gift += 1
    payments.sort(key=lambda g: g["gift_id"])

    # corrections first, so soft credits can avoid gifts whose amount a correction changes
    picked = R.sample(gifts, 8)
    corrections = []
    funds = sorted({g["fund"] for g in gifts})
    for k, g in enumerate(picked):
        kind = k % 4
        if kind == 0:
            row = ("CORRECT", "amount_cents", str(int(g["amount_cents"]) * 10), "keyed one zero short; bank deposit shows the larger amount")
        elif kind == 1:
            row = ("CORRECT", "fund", next(f for f in funds if f != g["fund"]), "donor's reply card designated a different fund")
        elif kind == 2:
            row = ("CORRECT", "gift_date", (date.fromisoformat(g["gift_date"]) - timedelta(days=3)).isoformat(), "postmark date, not deposit date")
        else:
            row = ("VOID", "", "", "check returned unpaid")
        corrections.append({"correction_id": f"CR{k + 1:02d}", "gift_id": g["gift_id"], "action": row[0],
                            "field": row[1], "new_value": row[2], "reason": row[3]})
    # and one void of a pledge payment, so a balance rises
    corrections.append({"correction_id": f"CR{len(corrections) + 1:02d}", "gift_id": R.choice(payments)["gift_id"],
                        "action": "VOID", "field": "", "new_value": "", "reason": "payment entered against the wrong pledge"})

    # soft credits: SPOUSE to the household partner, PEER_TO_PEER on P2P appeal gifts
    corrected = {c["gift_id"] for c in corrections if c["action"] == "CORRECT"}
    softs = []
    couples = [g for g in gifts if len(households[next(p["household_id"] for p in people if p["constituent_id"] == g["constituent_id"])]) == 2
               and g["gift_id"] not in corrected]
    for g in R.sample(couples, 30):
        hid = next(p["household_id"] for p in people if p["constituent_id"] == g["constituent_id"])
        partner = next(c for c in households[hid] if c != g["constituent_id"])
        softs.append((g["gift_id"], partner, "SPOUSE", g["amount_cents"]))
    p2p = [g for g in gifts if g["appeal"] == "P2P Run 2026" and g["gift_id"] not in corrected]
    runners = R.sample(ids, 4)
    for g in R.sample(p2p, 12):
        runner = R.choice([c for c in runners if c != g["constituent_id"]])
        softs.append((g["gift_id"], runner, "PEER_TO_PEER", g["amount_cents"]))
    softs.sort()
    soft_rows = [{"soft_credit_id": f"SC{i:03d}", "gift_id": gid, "constituent_id": cid, "role": role, "amount_cents": amt}
                 for i, (gid, cid, role, amt) in enumerate(softs, 1)]

    return {"pledges.csv": pledges, "pledge_payments.csv": payments, "soft_credits.csv": soft_rows, "corrections.csv": corrections}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=SEED_DEFAULT)
    ap.add_argument("--crm", default=os.path.join(ROOT, "fixtures"), help="directory holding the Phase 1 CRM csvs")
    ap.add_argument("--out", default=os.path.join(ROOT, "fixtures", "phase3"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    files = build(args.seed, args.crm)
    cols = {"pledges.csv": PLEDGE_COLS, "pledge_payments.csv": PAYMENT_COLS, "soft_credits.csv": SOFT_COLS, "corrections.csv": CORR_COLS}
    manifest = {"seed": args.seed, "as_of": AS_OF,
                "counts": {name: len(rows) for name, rows in files.items()},
                "sha256": {name: write_csv(os.path.join(args.out, name), rows, cols[name]) for name, rows in files.items()}}
    with open(os.path.join(args.out, "MANIFEST.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write("\n")
    for name in sorted(files):
        print(f"{name:22s} {manifest['counts'][name]:4d}  {manifest['sha256'][name]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
