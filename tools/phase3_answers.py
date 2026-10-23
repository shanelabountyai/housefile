"""Housefile — Phase 3 answer key (test oracle, never product code). D-67.

Derives every Phase 3 number from the frozen fixtures (fixtures/crm_*.csv + fixtures/phase3/*.csv)
and the reference segments (segments/reference/*.json), checks the data's own invariants, and compares
the result with the committed fixtures/phase3/answers.json. Prints a summary and ends with OK, or exits 1.
`--write` rewrites answers.json (only after a decisions.md entry says why the numbers moved).

Rules, as written in docs/decisions.md:
  active gifts   CRM gifts + pledge payments, corrections applied (CORRECT replaces one field, VOID drops
                 the gift), gift_date <= AS_OF. Soft credits are never in raised totals (D-9).
  roll-ups       per campaign -> appeal and per fund; raised, gifts, distinct donors, average = raised // gifts
                 with remainder (D-28). A gift with no appeal rolls up as "(no appeal)" (D-70).
  households     members ordered by constituent id; surnames agree after N1 folding -> "The <Last> Household"
                 with the first member's stored surname, else "First Last and First Last" (D-8). Giving = sum of
                 members' active hard credits.
  pledges        paid = sum of active payments; balance = total - paid (D-9).
  recognition    hard + soft, a soft credit counting while its gift is active.
  segments       all filters AND (D-27). A giftDate `between` filter sets the window for totalInWindow,
                 giftCount and lastGiftDate; lybunt/sybunt are calendar years of AS_OF (D-69) and ignore it.
                 A missing value (no gift) fails every comparison. isHousehold = household of two or more.
"""
from __future__ import annotations

import csv
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from matchlib import norm_name_token  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = os.path.join(ROOT, "fixtures")
P3 = os.path.join(FIX, "phase3")
AS_OF = "2026-10-14"
NO_APPEAL = "(no appeal)"

PERSON_FIELDS = {"firstName": "first_name", "lastName": "last_name", "city": "city", "state": "state",
                 "zip": "zip", "householdId": "household_id"}
AGG_FIELDS = {"totalInWindow", "lastGiftDate", "giftCount", "lybunt", "sybunt", "isHousehold"}
OPS = {"eq", "ne", "in", "gte", "lte", "between", "isTrue"}


def read(path: str) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def stat(gifts: list[dict]) -> dict:
    raised = sum(g["amount_cents"] for g in gifts)
    n = len(gifts)
    return {"raised": raised, "gifts": n, "donors": len({g["constituent_id"] for g in gifts}),
            "average": raised // n if n else 0, "remainder": raised % n if n else 0}


def household_name(members: list[dict]) -> str:
    if len({norm_name_token(m["last_name"]) for m in members}) == 1:
        return f"The {members[0]['last_name']} Household"
    names = [f"{m['first_name']} {m['last_name']}" for m in members]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def evaluate(seg: dict, people: list[dict], gifts_by: dict[str, list[dict]], hh_size: dict[str, int]) -> list[str]:
    year = int(AS_OF[:4])
    window = ("0000-00-00", AS_OF)
    for f in seg["filters"]:
        if f["op"] not in OPS:
            raise ValueError(f"{seg['name']}: unknown op {f['op']}")
        if f["field"] == "giftDate":
            assert f["op"] == "between", f
            window = (f["value"][0], min(f["value"][1], AS_OF))
        elif f["field"] not in PERSON_FIELDS and f["field"] not in AGG_FIELDS:
            raise ValueError(f"{seg['name']}: unknown field {f['field']}")
    out = []
    for p in people:
        cid = p["constituent_id"]
        all_g = gifts_by.get(cid, [])
        win = [g for g in all_g if window[0] <= g["gift_date"] <= window[1]]
        years = {int(g["gift_date"][:4]) for g in all_g}
        vals = {
            "totalInWindow": sum(g["amount_cents"] for g in win),
            "giftCount": len(win),
            "lastGiftDate": max((g["gift_date"] for g in win), default=None),
            "lybunt": (year - 1) in years and year not in years,
            "sybunt": any(y < year - 1 for y in years) and (year - 1) not in years and year not in years,
            "isHousehold": hh_size[p["household_id"]] >= 2,
        }
        vals.update({k: p[col] for k, col in PERSON_FIELDS.items()})
        ok = True
        for f in seg["filters"]:
            if f["field"] == "giftDate":
                continue
            v, op, want = vals[f["field"]], f["op"], f.get("value")
            if v is None:
                ok = False
            elif op == "eq":
                ok = v == want
            elif op == "ne":
                ok = v != want
            elif op == "in":
                ok = v in want
            elif op == "gte":
                ok = v >= want
            elif op == "lte":
                ok = v <= want
            elif op == "between":
                ok = want[0] <= v <= want[1]
            elif op == "isTrue":
                ok = v is True
            if not ok:
                break
        if ok:
            out.append(cid)
    return out


def derive() -> tuple[dict, list[str]]:
    errors: list[str] = []
    people = read(os.path.join(FIX, "crm_constituents.csv"))
    pid = {p["constituent_id"]: p for p in people}
    crm = read(os.path.join(FIX, "crm_gifts.csv"))
    pledges = read(os.path.join(P3, "pledges.csv"))
    payments = read(os.path.join(P3, "pledge_payments.csv"))
    softs = read(os.path.join(P3, "soft_credits.csv"))
    corrections = read(os.path.join(P3, "corrections.csv"))

    gifts = {g["gift_id"]: dict(g, amount_cents=int(g["amount_cents"]), pledge_id=g.get("pledge_id", "")) for g in crm + payments}
    if len(gifts) != len(crm) + len(payments):
        errors.append("gift ids collide between crm_gifts.csv and pledge_payments.csv")
    appeal_campaign: dict[str, str] = {}
    for g in gifts.values():
        if g["constituent_id"] not in pid:
            errors.append(f"{g['gift_id']}: unknown constituent {g['constituent_id']}")
        if g["appeal"] and appeal_campaign.setdefault(g["appeal"], g["campaign"]) != g["campaign"]:
            errors.append(f"{g['gift_id']}: appeal {g['appeal']} in two campaigns")
    for c in corrections:
        g = gifts.get(c["gift_id"])
        if g is None:
            errors.append(f"{c['correction_id']}: unknown gift {c['gift_id']}")
        elif not c["reason"]:
            errors.append(f"{c['correction_id']}: no reason")
        elif c["action"] == "VOID":
            g["voided"] = True
        elif c["action"] == "CORRECT" and c["field"] in ("amount_cents", "fund", "gift_date"):
            g[c["field"]] = int(c["new_value"]) if c["field"] == "amount_cents" else c["new_value"]
        else:
            errors.append(f"{c['correction_id']}: bad action/field {c['action']}/{c['field']}")
    active = sorted((g for g in gifts.values() if not g.get("voided") and g["gift_date"] <= AS_OF), key=lambda g: g["gift_id"])
    if any(g["amount_cents"] <= 0 for g in active):
        errors.append("an active gift has amount <= 0")
    gifts_by: dict[str, list[dict]] = {}
    for g in active:
        gifts_by.setdefault(g["constituent_id"], []).append(g)

    # roll-ups
    campaigns: dict[str, dict] = {}
    for camp in sorted({g["campaign"] for g in active}):
        cg = [g for g in active if g["campaign"] == camp]
        campaigns[camp] = stat(cg)
        campaigns[camp]["appeals"] = {a: stat([g for g in cg if (g["appeal"] or NO_APPEAL) == a])
                                      for a in sorted({g["appeal"] or NO_APPEAL for g in cg})}
        if sum(a["raised"] for a in campaigns[camp]["appeals"].values()) != campaigns[camp]["raised"]:
            errors.append(f"{camp}: appeals do not sum to the campaign")
    funds = {f: stat([g for g in active if g["fund"] == f]) for f in sorted({g["fund"] for g in active})}
    total = stat(active)
    for label, rows in (("campaigns", campaigns), ("funds", funds)):
        if sum(r["raised"] for r in rows.values()) != total["raised"]:
            errors.append(f"{label} do not sum to active gifts")

    # households
    members: dict[str, list[dict]] = {}
    for p in sorted(people, key=lambda p: p["constituent_id"]):
        members.setdefault(p["household_id"], []).append(p)
    households = {h: {"name": household_name(ms), "members": [m["constituent_id"] for m in ms],
                      "givingCents": sum(g["amount_cents"] for m in ms for g in gifts_by.get(m["constituent_id"], []))}
                  for h, ms in sorted(members.items())}

    # pledges
    pledge_out = {}
    for pl in pledges:
        sched = [(d, int(c)) for d, c in (part.split(":") for part in pl["installments"].split("|"))]
        tot = int(pl["total_cents"])
        if sum(c for _, c in sched) != tot:
            errors.append(f"{pl['pledge_id']}: schedule does not sum to total")
        paid = [g for g in active if g["pledge_id"] == pl["pledge_id"]]
        if any(g["constituent_id"] != pl["constituent_id"] for g in paid):
            errors.append(f"{pl['pledge_id']}: payment by another constituent")
        p_cents = sum(g["amount_cents"] for g in paid)
        if p_cents > tot:
            errors.append(f"{pl['pledge_id']}: overpaid")
        pledge_out[pl["pledge_id"]] = {"constituentId": pl["constituent_id"], "totalCents": tot,
                                       "paidCents": p_cents, "payments": len(paid), "balanceCents": tot - p_cents}

    # recognition
    active_ids = {g["gift_id"] for g in active}
    recognition: dict[str, dict] = {}
    for g in active:
        r = recognition.setdefault(g["constituent_id"], {"hardCents": 0, "softCents": 0})
        r["hardCents"] += g["amount_cents"]
    for s in softs:
        g = gifts.get(s["gift_id"])
        if g is None or s["constituent_id"] not in pid:
            errors.append(f"{s['soft_credit_id']}: dangling id")
            continue
        if s["constituent_id"] == g["constituent_id"]:
            errors.append(f"{s['soft_credit_id']}: soft credit to the hard donor")
        if s["gift_id"] in active_ids:
            recognition.setdefault(s["constituent_id"], {"hardCents": 0, "softCents": 0})["softCents"] += int(s["amount_cents"])
    for r in recognition.values():
        r["totalCents"] = r["hardCents"] + r["softCents"]
    recognition = dict(sorted(recognition.items()))

    # segments
    hh_size = {h: len(ms) for h, ms in members.items()}
    segments = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "segments", "reference", "*.json"))):
        seg = json.load(open(path, encoding="utf-8"))
        ids = evaluate(seg, people, gifts_by, hh_size)
        segments[os.path.basename(path)] = {"name": seg["name"], "count": len(ids), "members": ids}

    return {"asOf": AS_OF, "total": total, "campaigns": campaigns, "funds": funds, "households": households,
            "pledges": pledge_out, "recognition": recognition, "segments": segments}, errors


def main() -> int:
    answers, errors = derive()
    t = answers["total"]
    print(f"asOf {answers['asOf']}  active gifts {t['gifts']}  raised {t['raised']}  donors {t['donors']}  avg {t['average']} r {t['remainder']}")
    for camp, c in answers["campaigns"].items():
        print(f"  campaign {camp:8s} raised {c['raised']:9d} gifts {c['gifts']:4d} donors {c['donors']:3d} avg {c['average']} r {c['remainder']}")
    for fund, f in answers["funds"].items():
        print(f"  fund     {fund:8s} raised {f['raised']:9d} gifts {f['gifts']:4d} donors {f['donors']:3d} avg {f['average']} r {f['remainder']}")
    hh = answers["households"]
    print(f"  households {len(hh)} ({sum(len(h['members']) > 1 for h in hh.values())} of two+), giving {sum(h['givingCents'] for h in hh.values())}")
    pl = answers["pledges"]
    print(f"  pledges {len(pl)} total {sum(p['totalCents'] for p in pl.values())} paid {sum(p['paidCents'] for p in pl.values())} balance {sum(p['balanceCents'] for p in pl.values())}")
    print(f"  recognition {len(answers['recognition'])} constituents, soft {sum(r['softCents'] for r in answers['recognition'].values())}")
    for name, s in answers["segments"].items():
        print(f"  segment {name:26s} {s['count']}")
    for e in errors:
        print(f"ERROR {e}")

    out = os.path.join(P3, "answers.json")
    text = json.dumps(answers, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    if "--write" in sys.argv[1:]:
        if errors:
            return 1
        open(out, "w", encoding="utf-8").write(text)
        print(f"wrote {out}")
    elif not os.path.exists(out) or open(out, encoding="utf-8").read() != text:
        print("answers.json differs from the derivation (run with --write only after a decisions.md entry)")
        return 1
    if errors:
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
