"""Housefile — reference matcher and evaluation (test oracle, never product code).

Reads a fixtures directory produced by build_fixtures.py, runs the brief's pipeline
(parse -> normalize -> validate -> block -> score -> decide) over import_a.csv and
import_b.csv against crm_constituents.csv, and scores the decisions against the
answer keys. Prints measured numbers only. The TypeScript matcher must reproduce
the per-pair decisions this script makes (tools/verify_fixtures: decisions_*.csv).

Usage: python3 tools/reference_matcher.py [--fixtures DIR] [--write-decisions]
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from matchlib import (Record, Address, parse_name, norm_email, norm_phone, norm_address,  # noqa: E402
                      norm_date, norm_dob, norm_amount, score_pair, T_MERGE, T_REVIEW)

# Column maps the session's auto-mapper must also discover (brief section 4).
MAP_A = {"first": "Donor First Name", "last": "Donor Last Name", "middle": "Middle", "suffix": "Suffix",
         "email": "Email Address", "phone": "Phone #", "line1": "Street Address", "line2": "Apt/Unit",
         "city": "City", "state": "ST", "zip": "Zip Code", "dob": "Birth Date", "gift_date": "Gift Date",
         "amount": "Gift Amount", "fund": "Designation", "external_ref": "Transaction ID"}
MAP_B = {"full": "Name", "email": "E-mail", "phone": "Phone", "line1": "Address 1", "line2": "Address 2",
         "city": "City", "state": "State", "zip": "Postal", "dob": "DOB", "gift_date": "Date",
         "amount": "Amt", "fund": "Fund"}


def read_csv_bytes(path: str) -> tuple[list[dict], str]:
    """N9: BOM stripped; UTF-8 first, cp1252 fallback. Returns (rows, encoding_used)."""
    raw = open(path, "rb").read()
    enc = "utf-8-sig"
    try:
        text = raw.decode(enc)
    except UnicodeDecodeError:
        enc = "cp1252"
        text = raw.decode(enc)
    rows = list(csv.DictReader(io.StringIO(text)))
    return rows, enc


def to_record(rid: str, row: dict, m: dict) -> tuple[Record, list[str], str]:
    """Normalize one import row. Returns (record, warnings, reject_code)."""
    warnings: list[str] = []
    g = lambda k: row.get(m.get(k, ""), "") if m.get(k) else ""  # noqa: E731
    name = parse_name(first=g("first"), last=g("last"), middle=g("middle"), suffix=g("suffix"), full=g("full"))
    email, r = norm_email(g("email"))
    if r and r != "EMAIL_MISSING":
        warnings.append(r)
    phone, r = norm_phone(g("phone"))
    if r and r != "PHONE_MISSING":
        warnings.append(r)
    addr, rs = norm_address(g("line1"), g("line2"), g("city"), g("state"), g("zip"))
    warnings += [x for x in rs if x not in ("ZIP_MISSING",)]
    dob, r = norm_dob(g("dob"), "2026-10-14")
    if r and r not in ("DATE_MISSING",):
        warnings.append("DOB_" + r)
        dob = dob if r == "DATE_EXCEL_SERIAL" else ""
    reject = ""
    if not name.first and not name.last:
        reject = "NAME_MISSING"
    cents, r = norm_amount(g("amount"))
    if r in ("AMOUNT_MISSING", "AMOUNT_INVALID"):
        reject = reject or r
    elif r:
        warnings.append(r)
    gd, r = norm_date(g("gift_date"))
    if r == "DATE_INVALID" or r == "DATE_MISSING":
        reject = reject or ("GIFT_DATE_MISSING" if r == "DATE_MISSING" else "GIFT_DATE_INVALID")
    elif gd > "2026-10-14":
        reject = reject or "DATE_FUTURE"
    return Record(rid=rid, name=name, email=email, phone=phone, addr=addr, dob=dob), warnings, reject


def crm_record(c: dict) -> Record:
    name = parse_name(first=c["first_name"], last=c["last_name"], middle=c["middle_name"], suffix=c["suffix"])
    email, _ = norm_email(c["email"])
    phone, _ = norm_phone(c["phone"])
    addr, _ = norm_address(c["address_line1"], c["address_line2"], c["city"], c["state"], c["zip"])
    return Record(rid=c["constituent_id"], name=name, email=email, phone=phone, addr=addr, dob=c["dob"])


def run_file(tag: str, fixtures: str, crm: list[Record], write_decisions: bool, review_items: list | None = None) -> dict:
    """review_items, when given, collects (row_id, candidate_id) for every candidate tied at the best score of a
    REVIEW row (Phase 4 pair set, P4-1); it changes nothing else."""
    rows, enc = read_csv_bytes(os.path.join(fixtures, f"import_{tag.lower()}.csv"))
    key = {k["row_id"]: k for k in csv.DictReader(open(os.path.join(fixtures, f"answer_key_{tag.lower()}.csv"), encoding="utf-8"))}
    m = MAP_A if tag == "A" else MAP_B

    # blocking index over CRM + accepted earlier rows
    index: dict[str, list[Record]] = defaultdict(list)
    for c in crm:
        for k in c.blocking_keys():
            index[k].append(c)

    decisions = []
    stats = defaultdict(int)
    tp = fp = fn = 0           # auto-merge pairs
    review_pairs = 0
    review_true = 0
    rows_review = rows_new = rows_merge = rows_reject = 0
    comparisons = 0
    missed: list[str] = []
    wrong: list[str] = []
    truth_of: dict[str, str] = {}  # record id -> true person id (crm from key; rows from key)
    crm_truth = {}
    for k in key.values():
        if k["crm_constituent_id"]:
            crm_truth[k["crm_constituent_id"]] = k["true_person_id"]
    # also from truth_persons for CRM records the keys never mention
    for p in csv.DictReader(open(os.path.join(fixtures, "truth_persons.csv"), encoding="utf-8")):
        if p["crm_constituent_id"]:
            crm_truth[p["crm_constituent_id"]] = p["person_id"]
    truth_of.update(crm_truth)

    for i, row in enumerate(rows):
        rid = f"{tag}-{i + 1:04d}"
        k = key[rid]
        truth_of[rid] = k["true_person_id"]
        rec, warnings, reject = to_record(rid, row, m)
        exp_v = k["expected_validation"]
        if reject:
            rows_reject += 1
            stats[f"reject:{reject}"] += 1
            if not exp_v.startswith("REJECT"):
                stats["validation_mismatch"] += 1
            decisions.append((rid, "REJECT", reject, "", 0, ""))
            continue
        if exp_v.startswith("REJECT"):
            stats["validation_mismatch"] += 1
        # candidates
        cands: dict[str, Record] = {}
        for bk in rec.blocking_keys():
            for c in index.get(bk, []):
                cands[c.rid] = c
        comparisons += len(cands)
        best = None
        for c in cands.values():
            s = score_pair(rec, c)
            truth_same = truth_of.get(c.rid) == k["true_person_id"]
            if s.decision == "MERGE":
                if truth_same:
                    tp += 1
                else:
                    fp += 1
                    wrong.append(f"{rid}->{c.rid} {s.total} {'+'.join(s.reasons)} [{k['trap'] or k['defects']}]")
            elif s.decision == "REVIEW":
                review_pairs += 1
                if truth_same:
                    review_true += 1
            else:
                if truth_same:
                    fn += 1
            if best is None or (s.total, c.rid) > (best[0].total, best[1].rid):
                best = (s, c)
        # row-level decision: best candidate
        if best and best[0].decision == "MERGE":
            rows_merge += 1
            decisions.append((rid, "MERGE", best[1].rid, best[0].total, "+".join(best[0].reasons), ";".join(best[0].flags)))
            # survivorship S1 within the batch: the target absorbs identifiers it lacked,
            # and the row's blocking keys now point at the target
            t = best[1]
            t.email = t.email or rec.email
            t.phone = t.phone or rec.phone
            t.dob = t.dob or rec.dob
            if t.addr.is_empty() and not rec.addr.is_empty():
                t.addr = rec.addr
            for bk in rec.blocking_keys():
                if t not in index[bk]:
                    index[bk].append(t)
        elif best and best[0].decision == "REVIEW":
            rows_review += 1
            decisions.append((rid, "REVIEW", best[1].rid, best[0].total, "+".join(best[0].reasons), ";".join(best[0].flags)))
            if review_items is not None:
                tied = sorted(c.rid for c in cands.values() if score_pair(rec, c).total == best[0].total)
                review_items.extend((rid, cid) for cid in tied)
            # a reviewed row still joins the index as itself so later dups find it
            for bk in rec.blocking_keys():
                index[bk].append(rec)
        else:
            rows_new += 1
            decisions.append((rid, "NEW", "", best[0].total if best else 0, "+".join(best[0].reasons) if best else "", ";".join(best[0].flags) if best else ""))
            for bk in rec.blocking_keys():
                index[bk].append(rec)
        # did a true match exist among anything indexed at all? (recall denominator incl. unblocked)
        indexed_ids = {x.rid for lst in index.values() for x in lst}
        true_targets = [r for r in indexed_ids if truth_of.get(r) == k["true_person_id"] and r != rid]
        if true_targets and not any(truth_of.get(c.rid) == k["true_person_id"] for c in cands.values()):
            stats["true_match_not_blocked"] += 1
            missed.append(f"{rid} (no candidate blocked) [{k['defects']}]")

    # row-level confusion: expected link x decision
    confusion: dict[str, int] = defaultdict(int)
    for d in decisions:
        k = key[d[0]]
        confusion[f"{k['expected_link']}->{d[1]}"] += 1
    # recall denominator: every (row, indexed-true-match) pair that was blocked or not
    precision = tp / (tp + fp) if tp + fp else float("nan")
    recall = tp / (tp + fn + stats["true_match_not_blocked"]) if (tp + fn + stats["true_match_not_blocked"]) else float("nan")
    out = {
        "file": tag, "encoding": enc, "rows": len(rows), "rejected": rows_reject,
        "rows_merge": rows_merge, "rows_review": rows_review, "rows_new": rows_new,
        "pairs_compared": comparisons, "auto_merge_pairs": tp + fp, "auto_merge_correct": tp, "auto_merge_wrong": fp,
        "true_pairs_scored_below_review": fn, "true_pairs_not_blocked": stats["true_match_not_blocked"],
        "review_pairs": review_pairs, "review_pairs_true": review_true,
        "pair_precision": round(precision, 4), "pair_recall": round(recall, 4),
        "validation_mismatches": stats["validation_mismatch"],
        "row_confusion": dict(sorted(confusion.items())),
        "rejects": {k[7:]: v for k, v in stats.items() if k.startswith("reject:")},
        "wrong_merges": wrong, "unblocked": missed[:10],
    }
    if write_decisions:
        with open(os.path.join(fixtures, f"decisions_{tag.lower()}.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(["row_id", "decision", "target", "score", "reasons", "flags"])
            w.writerows(decisions)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures"))
    ap.add_argument("--write-decisions", action="store_true")
    a = ap.parse_args()
    crm_rows = list(csv.DictReader(open(os.path.join(a.fixtures, "crm_constituents.csv"), encoding="utf-8")))
    crm = [crm_record(c) for c in crm_rows]
    print(f"thresholds: MERGE>={T_MERGE} REVIEW>={T_REVIEW}")
    for tag in ("A", "B"):
        r = run_file(tag, a.fixtures, crm, a.write_decisions)
        wrong = r.pop("wrong_merges")
        unb = r.pop("unblocked")
        for k, v in r.items():
            print(f"{tag} {k}: {v}")
        for w in wrong:
            print(f"{tag} WRONG MERGE: {w}")
        for u in unb:
            print(f"{tag} NOT BLOCKED: {u}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
