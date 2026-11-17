"""Housefile — Phase 4 pair set and truth (test oracle, never product code).

Lists every review item the reference matcher produces over import_a.csv then import_b.csv against
crm_constituents.csv: one item per (REVIEW row, candidate tied at the row's best score) (P4-1). For each item the
truth is MERGE when both sides are the same true person, SAME_HOUSEHOLD when they are different people in one true
household, else KEEP_SEPARATE (the D-31 label rule; D-90). Shane's label is attached where eval/labels/shane-30.json
has that exact pair.

Usage: python3 tools/assist_truth.py           writes eval/assist/truth.csv
       python3 tools/assist_truth.py --check   regenerates in memory, prints OK or the first difference
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from reference_matcher import crm_record, run_file  # noqa: E402

FIXTURES = os.path.join(ROOT, "fixtures")
OUT = os.path.join(ROOT, "eval", "assist", "truth.csv")
LABELS = os.path.join(ROOT, "eval", "labels", "shane-30.json")


def rows_of(name: str) -> list[dict]:
    return list(csv.DictReader(open(os.path.join(FIXTURES, name), encoding="utf-8")))


def build() -> str:
    crm = [crm_record(c) for c in rows_of("crm_constituents.csv")]
    persons = rows_of("truth_persons.csv")
    person_of = {p["crm_constituent_id"]: p["person_id"] for p in persons if p["crm_constituent_id"]}
    household_of = {p["person_id"]: p["household_id"] for p in persons}
    shane = {(l["row_id"], l["target"]): l["label"] for l in json.load(open(LABELS, encoding="utf-8"))["labels"]}

    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(["file", "row_id", "candidate", "truth", "shane_label"])
    seen_labels = 0
    for tag in ("A", "B"):
        for k in rows_of(f"answer_key_{tag.lower()}.csv"):
            person_of[k["row_id"]] = k["true_person_id"]
        items: list[tuple[str, str]] = []
        # file B runs over the CRM as enriched by file A, as import:eval does (D-34)
        run_file(tag, FIXTURES, crm, False, items)
        for rid, cand in items:
            a, b = person_of[rid], person_of[cand]
            truth = "MERGE" if a == b else "SAME_HOUSEHOLD" if household_of[a] == household_of[b] else "KEEP_SEPARATE"
            label = shane.get((rid, cand), "")
            seen_labels += bool(label)
            w.writerow([tag, rid, cand, truth, label])
    # 28 of the 30: A-0064 and A-0185 auto-merge since D-43 (Shane labelled both MERGE). A different count means
    # the pair set moved and the label comparison in 4.6 would silently shrink or grow.
    if seen_labels != 28:
        raise SystemExit(f"{seen_labels} of Shane's {len(shane)} labelled pairs are review items, expected 28 (D-90)")
    return out.getvalue()


def main() -> int:
    text = build()
    if "--check" in sys.argv:
        old = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if old != text:
            for i, (x, y) in enumerate(zip(old.splitlines() + [""] * 999, text.splitlines())):
                if x != y:
                    print(f"eval/assist/truth.csv line {i + 1}: committed {x!r}, oracle {y!r}")
                    return 1
            print("eval/assist/truth.csv differs from the oracle")
            return 1
        print("assist truth OK")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8", newline="").write(text)
    lines = text.splitlines()[1:]
    for tag in ("A", "B"):
        print(f"{tag}: {sum(l.startswith(tag + ',') for l in lines)} items")
    print("truth:", {t: sum(l.split(',')[3] == t for l in lines) for t in ("MERGE", "SAME_HOUSEHOLD", "KEEP_SEPARATE")})
    return 0


if __name__ == "__main__":
    sys.exit(main())
