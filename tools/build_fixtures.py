"""Housefile — seeded synthetic data generator (test oracle, never product code).

Produces, under fixtures/ (default) or --out DIR:
  truth_persons.csv       the clean "true" population (hidden answer key)
  crm_constituents.csv    the existing CRM state the import lands on
  crm_gifts.csv           existing giving history (amounts in integer cents)
  import_a.csv            messy donor file A: split name columns, UTF-8 with BOM, CRLF
  import_b.csv            messy donor file B: one "Name" column, cp1252, Excel serial dates
  answer_key_a.csv / answer_key_b.csv   per-row truth: person, CRM record, dup-of, defects, trap
  MANIFEST.json           seed, counts, defect rates as applied, sha256 of every file

Deterministic: python3 tools/build_fixtures.py --seed 20261014 twice gives identical bytes.
Standard library only. No real people: every name, address, email and phone is invented;
phone numbers use the 555-01xx reserved range; emails use example.* documentation domains.
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
from dataclasses import dataclass, field, asdict
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from matchlib import NICKNAMES, EXCEL_EPOCH  # noqa: E402

SEED_DEFAULT = 20261014

FIRST_NAMES = [
    "Robert", "William", "Elizabeth", "Margaret", "John", "James", "Katherine", "Michael",
    "Thomas", "Susan", "Richard", "Christopher", "David", "Daniel", "Anthony", "Andrew",
    "Joseph", "Patricia", "Edward", "Charles", "Jennifer", "Rebecca", "Deborah", "Nicholas",
    "Matthew", "Samuel", "Samantha", "Alexander", "Alexandra", "Benjamin", "Timothy", "Steven",
    "Lawrence", "Donald", "Ronald", "Kenneth", "Raymond", "Dorothy", "Barbara", "Virginia",
    "Victoria", "Eleanor", "Abigail", "Gabriel", "Nathaniel", "Maria", "Jose", "Linda",
    "Carol", "Sandra", "Nancy", "Karen", "Lisa", "Mark", "Paul", "George", "Brian", "Kevin",
    "Jason", "Emily", "Hannah", "Olivia", "Sophia", "Ethan", "Noah", "Renée", "José", "Zoë",
    "Anaïs", "Björn", "Priya", "Wei", "Aisha", "Omar", "Fatima", "Hiroshi", "Yuki", "Diego",
]
# Nicknames that stand for exactly one canonical name (for the D-NICK defect)
UNAMBIGUOUS_NICKS = {
    c: [n for n, cs in NICKNAMES.items() if cs == {c} and n != c] for c in NICKNAMES
}
SURNAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez",
    "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor",
    "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez",
    "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright",
    "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall",
    "Rivera", "Campbell", "Mitchell", "Carter", "Roberts", "Okafor", "Patel", "Kim", "Chen",
    "Nakamura", "O'Brien", "McCarthy", "Fitzgerald", "Van der Berg", "Delacroix", "Kowalski",
    "Lindqvist", "Haddad", "Abernathy", "Whitfield", "Castellano", "Brennan", "Oyelaran",
]
STREET_NAMES = ["Oak", "Maple", "Cedar", "Elm", "Pine", "Walnut", "Birch", "Hickory", "Willow",
                "Peoria", "Lewis", "Harvard", "Yale", "Riverside", "Lakeview", "Sunset", "Hillcrest",
                "Meadow", "Prairie", "Church", "Main", "Market", "Washington", "Lincoln", "Jefferson"]
STREET_TYPES = ["St", "Ave", "Rd", "Dr", "Ln", "Ct", "Blvd", "Pl", "Cir", "Way"]
CITIES = [  # (city, state, zip prefixes); weighted toward Oklahoma; four have leading-zero ZIPs on purpose
    ("Tulsa", "OK", ["74105", "74114", "74119", "74133", "74137"]),
    ("Tulsa", "OK", ["74105", "74114", "74119", "74133", "74137"]),
    ("Tulsa", "OK", ["74105", "74114", "74119", "74133", "74137"]),
    ("Edmond", "OK", ["73003", "73012", "73013", "73034"]),
    ("Edmond", "OK", ["73003", "73012", "73013", "73034"]),
    ("Newark", "NJ", ["07102", "07104", "07106"]),
    ("Worcester", "MA", ["01602", "01605", "01609"]),
    ("Burlington", "VT", ["05401", "05408"]),
    ("Denver", "CO", ["80202", "80206", "80210"]),
    ("Austin", "TX", ["78701", "78704", "78745"]),
]
# Only reserved documentation domains (RFC 2606): an invented name at a real provider could be
# somebody's real mailbox. Gmail dot-folding is exercised by GN-01, not by the fixtures.
EMAIL_DOMAINS = ["example.com", "example.com", "example.org", "example.net", "mail.example.com"]
PHONE_AREAS = ["918", "405", "973", "508", "802", "303", "512"]
FUNDS = ["GEN", "GEN", "GEN", "BLDG", "SCHOL"]
CAMPAIGNS = {"AF2024": ["Spring Mailer 2024", "Year-End 2024"],
             "AF2025": ["Spring Mailer 2025", "Gala 2025", "Year-End 2025"],
             "CAP2025": ["Capital Phase 1"],
             "AF2026": ["Spring Mailer 2026", "Gala 2026", "P2P Run 2026"]}
AMOUNTS = [2500, 2500, 5000, 5000, 5000, 10000, 10000, 10000, 15000, 25000, 25000, 50000, 100000, 250000]


@dataclass
class Addr:
    number: str
    street: str
    stype: str
    direction: str
    unit: str
    city: str
    state: str
    zip5: str
    pobox: str = ""

    def line1(self) -> str:
        if self.pobox:
            return f"PO Box {self.pobox}"
        d = f"{self.direction} " if self.direction else ""
        return f"{self.number} {d}{self.street} {self.stype}"


@dataclass
class Person:
    pid: str
    first: str
    middle: str
    last: str
    suffix: str
    dob: str
    email: str
    phone: str
    addr: Addr
    prior_last: str = ""
    prior_addr: Addr | None = None
    household: str = ""
    trap: str = ""
    in_crm: bool = False
    crm_id: str = ""


class Gen:
    def __init__(self, seed: int):
        self.r = random.Random(seed)
        self.seed = seed
        self.persons: list[Person] = []
        self.used_emails: set[str] = set()
        self.phone_counter = 0
        self.defect_counts: dict[str, int] = {}

    # -- helpers --------------------------------------------------------------
    def tick(self, code: str) -> None:
        self.defect_counts[code] = self.defect_counts.get(code, 0) + 1

    def mk_addr(self) -> Addr:
        city, state, zips = self.r.choice(CITIES)
        unit = ""
        if self.r.random() < 0.22:
            unit = f"{self.r.randint(1, 40)}{self.r.choice(['', '', 'A', 'B', 'C'])}"
        direction = self.r.choice(["", "", "", "N", "S", "E", "W"])
        return Addr(number=str(self.r.randint(10, 9899)), street=self.r.choice(STREET_NAMES),
                    stype=self.r.choice(STREET_TYPES), direction=direction, unit=unit,
                    city=city, state=state, zip5=self.r.choice(zips))

    def mk_email(self, first: str, last: str) -> str:
        base_first = _ascii(first).lower()
        base_last = _ascii(last).lower().replace(" ", "").replace("'", "")
        styles = [f"{base_first}.{base_last}", f"{base_first[0]}{base_last}", f"{base_first}{base_last}",
                  f"{base_first}.{base_last}{self.r.randint(1, 99)}", f"{base_last}.{base_first}"]
        for _ in range(20):
            e = f"{self.r.choice(styles)}@{self.r.choice(EMAIL_DOMAINS)}"
            if e not in self.used_emails:
                self.used_emails.add(e)
                return e
        e = f"{base_first}{self.r.randint(100, 999)}@example.com"
        self.used_emails.add(e)
        return e

    def mk_phone(self) -> str:
        """Only 555-0100..555-0199, the block reserved for fictional use; 7 area codes x 100 = 700 unique."""
        n = self.phone_counter
        self.phone_counter += 1
        if n >= 700:
            raise RuntimeError("out of fictional phone numbers")
        area = PHONE_AREAS[n // 100]
        return f"{area}555{100 + n % 100:04d}"

    def mk_dob(self) -> str:
        return (date(1940, 1, 1) + timedelta(days=self.r.randint(0, 365 * 62))).isoformat()

    def new_person(self, first=None, last=None, addr=None, suffix="", trap="") -> Person:
        pid = f"P{len(self.persons) + 1:04d}"
        first = first or self.r.choice(FIRST_NAMES)
        last = last or self.r.choice(SURNAMES)
        middle = self.r.choice(["", "", "", "A", "E", "J", "K", "L", "M", "R", "Marie", "Lee"])
        p = Person(pid=pid, first=first, middle=middle, last=last, suffix=suffix, dob=self.mk_dob(),
                   email=self.mk_email(first, last) if self.r.random() < 0.85 else "",
                   phone=self.mk_phone() if self.r.random() < 0.85 else "",
                   addr=addr or self.mk_addr(), trap=trap)
        self.persons.append(p)
        return p

    # -- population -----------------------------------------------------------
    def build_population(self, n_households: int = 300) -> None:
        hid = 0
        for _ in range(n_households):
            hid += 1
            h = f"H{hid:04d}"
            a = self.mk_addr()
            p1 = self.new_person(addr=a)
            p1.household = h
            roll = self.r.random()
            if roll < 0.30:  # spouse / partner, same surname 70% of the time
                same = self.r.random() < 0.70
                p2 = self.new_person(last=p1.last if same else None, addr=a)
                p2.household = h
                if self.r.random() < 0.35 and p1.email:  # shared family email
                    p2.email = p1.email
                    p2.trap = "T3_SHARED_EMAIL"
                if self.r.random() < 0.50 and p1.phone:  # shared landline
                    p2.phone = p1.phone
        # married-name change history on 15% of persons
        for p in self.persons:
            if self.r.random() < 0.15:
                p.prior_last = self.r.choice([s for s in SURNAMES if s != p.last])
            if self.r.random() < 0.20:
                p.prior_addr = self.mk_addr()
            if self.r.random() < 0.06:  # a PO box as mailing address
                p.addr.pobox = str(self.r.randint(100, 9999))
        # traps -----------------------------------------------------------------
        # T1: Jr / Sr, same name, same address, shared phone (4 households)
        for _ in range(4):
            hid += 1
            a = self.mk_addr()
            first = self.r.choice(["Robert", "William", "John", "James", "Charles"])
            last = self.r.choice(SURNAMES)
            sr = self.new_person(first=first, last=last, addr=a, suffix="Sr", trap="T1_JR_SR")
            jr = self.new_person(first=first, last=last, addr=a, suffix="Jr", trap="T1_JR_SR")
            jr.phone = sr.phone = sr.phone or self.mk_phone()
            jr.middle = sr.middle  # same middle initial: nothing but the suffix separates them
            sr.household = jr.household = f"H{hid:04d}"
            sr.dob = (date(1948, 1, 1) + timedelta(days=self.r.randint(0, 3000))).isoformat()
            jr.dob = (date(1976, 1, 1) + timedelta(days=self.r.randint(0, 3000))).isoformat()
        # T2: two different people, same common name, same city (4 pairs)
        for first, last in [("Maria", "Garcia"), ("John", "Smith"), ("James", "Johnson"), ("David", "Nguyen")]:
            city = self.r.choice(CITIES)
            for k in range(2):
                hid += 1
                a = self.mk_addr()
                a.city, a.state = city[0], city[1]
                a.zip5 = self.r.choice(city[2])
                p = self.new_person(first=first, last=last, addr=a, trap="T2_SAME_NAME")
                p.household = f"H{hid:04d}"
                p.middle = ["A", "L"][k]
        # T4: a parent and adult child with different first names at one address
        # is covered by the household roll above (HOUSEHOLD_CANDIDATE flag).

    # -- existing CRM ----------------------------------------------------------
    def build_crm(self) -> tuple[list[dict], list[dict]]:
        constituents: list[dict] = []
        gifts: list[dict] = []
        gid = 0
        for p in self.persons:
            take = self.r.random() < 0.70
            if p.trap == "T1_JR_SR":
                take = True  # both generations are on file
            if p.trap == "T2_SAME_NAME":
                take = True
            if not take:
                continue
            p.in_crm = True
            p.crm_id = f"C{len(constituents) + 1:04d}"
            first = p.first
            if self.r.random() < 0.10 and UNAMBIGUOUS_NICKS.get(_ascii(p.first).lower()):
                first = self.r.choice(UNAMBIGUOUS_NICKS[_ascii(p.first).lower()]).capitalize()
            a = p.addr
            constituents.append({
                "constituent_id": p.crm_id, "first_name": first, "middle_name": p.middle,
                "last_name": p.last, "suffix": p.suffix,
                "email": p.email if self.r.random() < 0.90 else "",
                "phone": fmt_phone(p.phone, "paren") if p.phone and self.r.random() < 0.90 else "",
                "address_line1": a.line1(), "address_line2": f"Apt {a.unit}" if a.unit and not a.pobox else "",
                "city": a.city, "state": a.state, "zip": a.zip5,
                "dob": p.dob if self.r.random() < 0.45 else "",
                "household_id": p.household, "created_at": (date(2023, 1, 1) + timedelta(days=self.r.randint(0, 900))).isoformat(),
            })
            n_gifts = self.r.choice([0, 1, 1, 2, 2, 3, 4, 6, 8])
            for _ in range(n_gifts):
                gid += 1
                camp = self.r.choice(list(CAMPAIGNS))
                year = int(camp[-4:])
                d = date(year, 1, 1) + timedelta(days=self.r.randint(0, 364))
                if d > date(2026, 9, 30):
                    d = date(2026, self.r.randint(1, 9), self.r.randint(1, 28))
                gifts.append({
                    "gift_id": f"G{gid:05d}", "constituent_id": p.crm_id, "gift_date": d.isoformat(),
                    "amount_cents": self.r.choice(AMOUNTS), "fund": self.r.choice(FUNDS),
                    "campaign": camp, "appeal": self.r.choice(CAMPAIGNS[camp]),
                    "gift_type": "GIFT", "external_ref": f"CHK{self.r.randint(1000, 9999)}" if self.r.random() < 0.5 else "",
                })
        return constituents, gifts

    # -- import files ----------------------------------------------------------
    def build_import(self, tag: str, n_rows: int, crm_gifts: list[dict]) -> tuple[list[dict], list[dict], list[str]]:
        """Returns (rows, answer_rows, column_order)."""
        R = self.r
        rows: list[dict] = []
        keys: list[dict] = []
        in_crm = [p for p in self.persons if p.in_crm and p.trap not in ("T1_JR_SR", "T2_SAME_NAME")]
        not_crm = [p for p in self.persons if not p.in_crm]
        traps = [p for p in self.persons if p.trap in ("T1_JR_SR", "T2_SAME_NAME")]
        crm_gifts_by_c: dict[str, list[dict]] = {}
        for g in crm_gifts:
            crm_gifts_by_c.setdefault(g["constituent_id"], []).append(g)

        plan: list[tuple[Person, str]] = []
        for p in traps:
            plan.append((p, "EXISTING"))
        while len(plan) < int(n_rows * 0.90):
            if R.random() < 0.70:
                plan.append((R.choice(in_crm), "EXISTING"))
            else:
                plan.append((R.choice(not_crm), "NEW"))
        R.shuffle(plan)

        def row_id(i: int) -> str:
            return f"{tag}-{i + 1:04d}"

        i = 0
        first_row_of: dict[str, str] = {}  # person -> first row id in this file
        while i < n_rows:
            dup_of = ""
            gift_dup_of = ""
            src_validation = ""
            if plan:
                p, kind = plan.pop()
                defects: list[str] = []
                raw = self.messy_row(p, tag, defects)
                if p.pid in first_row_of:  # the plan drew the same person twice
                    dup_of = first_row_of[p.pid]
                    if kind == "NEW":
                        kind = "DUP_IN_FILE"
            else:
                # in-file duplicate of an earlier row, re-messed independently
                src_idx = R.randrange(0, len(rows))
                src_key = keys[src_idx]
                p = next(pp for pp in self.persons if pp.pid == src_key["true_person_id"])
                kind = "DUP_IN_FILE"
                dup_of = src_key["dup_of_row_id"] or src_key["row_id"]
                defects = ["D-DUPROW"]
                self.tick("D-DUPROW")
                if R.random() < 0.5:
                    raw = dict(rows[src_idx])  # byte-identical duplicate
                    defects.append("D-DUPROW-EXACT")
                    self.tick("D-DUPROW-EXACT")
                    src_validation = src_key["expected_validation"]
                    gift_dup_of = src_key["gift_dup_of"]
                else:
                    raw = self.messy_row(p, tag, defects)
            # gift columns
            gift_amount_cents = R.choice(AMOUNTS)
            gift_date = date(2026, R.randint(3, 9), R.randint(1, 28))
            ext_ref = f"TXN{R.randint(100000, 999999)}"
            # D-GIFTDUP: 5% of EXISTING rows carry a gift already keyed into the CRM
            if kind == "EXISTING" and crm_gifts_by_c.get(p.crm_id) and R.random() < 0.05:
                g = R.choice(crm_gifts_by_c[p.crm_id])
                gift_amount_cents = g["amount_cents"]
                gift_date = date.fromisoformat(g["gift_date"])
                ext_ref = g["external_ref"] or ext_ref
                gift_dup_of = g["gift_id"]
                defects.append("D-GIFTDUP")
                self.tick("D-GIFTDUP")
            if dup_of and "D-DUPROW-EXACT" in defects:
                pass  # gift columns already copied with the row
            else:
                raw.update(self.messy_gift(tag, gift_amount_cents, gift_date, ext_ref, defects))
            # validation expectations
            expected_validation = "OK"
            if "D-AMOUNT-INVALID" in defects or "D-AMOUNT-MISSING" in defects:
                expected_validation = "REJECT:AMOUNT_INVALID" if "D-AMOUNT-INVALID" in defects else "REJECT:AMOUNT_MISSING"
            elif "D-NAME-MISSING" in defects:
                expected_validation = "REJECT:NAME_MISSING"
            elif "D-DATE-FUTURE" in defects:
                expected_validation = "REJECT:DATE_FUTURE"
            elif "D-AMOUNT-NEGATIVE" in defects:
                expected_validation = "WARN:AMOUNT_NEGATIVE"
            elif "D-EMAIL-INVALID" in defects:
                expected_validation = "WARN:EMAIL_INVALID"
            elif "D-ZIP-LOSTZERO" in defects:
                expected_validation = "WARN:ZIP_PADDED"
            if src_validation:
                expected_validation = src_validation
            rows.append(raw)
            first_row_of.setdefault(p.pid, row_id(i))
            keys.append({
                "row_id": row_id(i), "true_person_id": p.pid, "household_id": p.household,
                "crm_constituent_id": p.crm_id if p.in_crm else "",
                "expected_link": kind, "dup_of_row_id": dup_of, "gift_dup_of": gift_dup_of,
                "expected_validation": expected_validation,
                "defects": "|".join(defects), "trap": p.trap,
            })
            i += 1
        cols = COLUMNS[tag]
        return rows, keys, cols

    def messy_row(self, p: Person, tag: str, defects: list[str]) -> dict:
        R = self.r
        first, middle, last, suffix = p.first, p.middle, p.last, p.suffix
        # name defects
        if R.random() < 0.12 and UNAMBIGUOUS_NICKS.get(_ascii(first).lower()):
            first = R.choice(UNAMBIGUOUS_NICKS[_ascii(first).lower()]).capitalize()
            defects.append("D-NICK"); self.tick("D-NICK")
        if p.prior_last and R.random() < 0.40:
            last = p.prior_last
            defects.append("D-MAIDEN"); self.tick("D-MAIDEN")
        if R.random() < 0.06:
            if R.random() < 0.5:
                first = typo(R, first)
            else:
                last = typo(R, last)
            defects.append("D-TYPO"); self.tick("D-TYPO")
        if R.random() < 0.03:
            first, last = last, first
            defects.append("D-TRANSPOSE"); self.tick("D-TRANSPOSE")
        if R.random() < 0.08 and middle:
            first = f"{first} {middle[0]}."
            middle = ""
            defects.append("D-MIDDLE-IN-FIRST"); self.tick("D-MIDDLE-IN-FIRST")
        if R.random() < 0.04 and first:
            first = first[0] + "."
            defects.append("D-FIRST-INITIAL"); self.tick("D-FIRST-INITIAL")
        if suffix and R.random() < 0.30:
            suffix = ""
            defects.append("D-SUFFIX-DROPPED"); self.tick("D-SUFFIX-DROPPED")
        elif suffix and R.random() < 0.30:
            suffix = {"Jr": "Jr.", "Sr": "Sr."}.get(suffix, suffix)
        if R.random() < 0.10:
            first, last = first.upper(), last.upper()
            defects.append("D-CASE"); self.tick("D-CASE")
        if R.random() < 0.01:
            first, last = "", ""
            defects.append("D-NAME-MISSING"); self.tick("D-NAME-MISSING")
        # email
        email = p.email
        if email and R.random() < 0.15:
            email = ""
            defects.append("D-EMAIL-MISSING"); self.tick("D-EMAIL-MISSING")
        elif email:
            if R.random() < 0.20:
                email = email.upper() if R.random() < 0.3 else email.capitalize()
                defects.append("D-EMAIL-CASE"); self.tick("D-EMAIL-CASE")
            if R.random() < 0.08:
                local, dom = email.split("@")
                email = f"{local}+{R.choice(['gala', 'run', 'news'])}@{dom}"
                defects.append("D-EMAIL-PLUSTAG"); self.tick("D-EMAIL-PLUSTAG")
            if R.random() < 0.02:
                email = email.replace("@", "@@") if R.random() < 0.5 else email.split("@")[0]
                defects.append("D-EMAIL-INVALID"); self.tick("D-EMAIL-INVALID")
        # phone
        phone = p.phone
        if phone and R.random() < 0.20:
            phone = ""
            defects.append("D-PHONE-MISSING"); self.tick("D-PHONE-MISSING")
        elif phone:
            phone = fmt_phone(phone, R.choice(["paren", "dash", "dot", "plain", "intl", "spaces"]))
        # address
        a = p.addr
        if p.prior_addr and R.random() < 0.50:
            a = p.prior_addr
            defects.append("D-MOVED"); self.tick("D-MOVED")
        if R.random() < 0.05:
            line1 = line2 = city = state = zipc = ""
            defects.append("D-ADDRESS-MISSING"); self.tick("D-ADDRESS-MISSING")
        else:
            line1 = a.line1()
            if not a.pobox and R.random() < 0.5:
                line1 = expand_street(line1)
            line2 = ""
            if a.unit and not a.pobox:
                style = R.choice(["Apt {u}", "#{u}", "Unit {u}", "Apartment {u}", "APT {u}", "Ste {u}"])
                if R.random() < 0.5:
                    line2 = style.format(u=a.unit)
                else:
                    line1 = f"{line1} {style.format(u=a.unit)}"
                defects.append("D-UNITFMT"); self.tick("D-UNITFMT")
            if a.pobox:
                line1 = R.choice([f"PO Box {a.pobox}", f"P.O. Box {a.pobox}", f"Post Office Box {a.pobox}", f"POB {a.pobox}"])
                defects.append("D-POBOX"); self.tick("D-POBOX")
            city, state, zipc = a.city, a.state, a.zip5
            if R.random() < 0.10:
                state = state_full(state)
                defects.append("D-STATE-FULL"); self.tick("D-STATE-FULL")
            if zipc.startswith("0") and R.random() < 0.60:
                zipc = zipc.lstrip("0")
                defects.append("D-ZIP-LOSTZERO"); self.tick("D-ZIP-LOSTZERO")
            elif R.random() < 0.10:
                zipc = f"{zipc}-{R.randint(1000, 9999)}"
                defects.append("D-ZIP-PLUS4"); self.tick("D-ZIP-PLUS4")
        # whitespace
        if R.random() < 0.10:
            first, last = f"  {first}", f"{last} "
            defects.append("D-WHITESPACE"); self.tick("D-WHITESPACE")
        dob = p.dob if R.random() < 0.25 else ""
        if dob:
            dob = fmt_date(R, dob, tag, defects, self)
        if tag == "A":
            return {"Donor First Name": first, "Donor Last Name": last, "Middle": middle, "Suffix": suffix,
                    "Email Address": email, "Phone #": phone, "Street Address": line1, "Apt/Unit": line2,
                    "City": city, "ST": state, "Zip Code": zipc, "Birth Date": dob,
                    "Table #": str(R.randint(1, 30)) if R.random() < 0.7 else "",
                    "Notes": R.choice(["", "", "", "VIP", "wants no mail", "board contact", "matching gift?"])}
        # file B: a single Name column in mixed styles
        sfx = f" {suffix}" if suffix else ""
        mid = f" {middle[0]}." if middle and R.random() < 0.6 else ""
        style = R.random()
        if style < 0.55:
            name = f"{last},{'' if R.random() < 0.2 else ' '}{first}{mid}{sfx}"
        else:
            name = f"{first}{mid} {last}{sfx}"
        if not first and not last:
            name = ""
        return {"Name": name, "E-mail": email, "Phone": phone, "Address 1": line1, "Address 2": line2,
                "City": city, "State": state, "Postal": zipc, "DOB": dob,
                "Source": R.choice(["Web", "Event", "Mail", "P2P"])}

    def messy_gift(self, tag: str, cents: int, d: date, ext_ref: str, defects: list[str]) -> dict:
        R = self.r
        dollars = cents / 100
        roll = R.random()
        if roll < 0.40:
            amt = f"${dollars:,.2f}"
        elif roll < 0.70:
            amt = f"{dollars:.0f}" if cents % 100 == 0 else f"{dollars:.2f}"
        elif roll < 0.85:
            amt = f"{dollars:,.0f}"
        elif roll < 0.95:
            amt = f"${dollars:.1f}".rstrip("0").rstrip(".") if cents % 100 == 0 else f"${dollars:.2f}"
        elif roll < 0.96:
            amt = f"({dollars:.2f})"
            defects.append("D-AMOUNT-NEGATIVE"); self.tick("D-AMOUNT-NEGATIVE")
        elif roll < 0.98:
            amt = ""
            defects.append("D-AMOUNT-MISSING"); self.tick("D-AMOUNT-MISSING")
        else:
            amt = R.choice(["fifty", "100 dollars", "N/A"])
            defects.append("D-AMOUNT-INVALID"); self.tick("D-AMOUNT-INVALID")
        if R.random() < 0.01:
            d = date(2027, 1, R.randint(1, 28))
            defects.append("D-DATE-FUTURE"); self.tick("D-DATE-FUTURE")
        ds = fmt_date(R, d.isoformat(), tag, defects, self)
        if tag == "A":
            return {"Gift Date": ds, "Gift Amount": amt, "Designation": R.choice(["General", "General", "Building Fund", "Scholarship", ""]),
                    "Transaction ID": ext_ref}
        return {"Date": ds, "Amt": amt, "Fund": R.choice(["GEN", "GEN", "BLDG", "SCHOL", "General"])}


COLUMNS = {
    "A": ["Donor First Name", "Donor Last Name", "Middle", "Suffix", "Email Address", "Phone #",
          "Street Address", "Apt/Unit", "City", "ST", "Zip Code", "Birth Date", "Gift Date",
          "Gift Amount", "Designation", "Transaction ID", "Table #", "Notes"],
    "B": ["Name", "E-mail", "Phone", "Address 1", "Address 2", "City", "State", "Postal", "DOB",
          "Date", "Amt", "Fund", "Source"],
}


def _ascii(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def typo(R: random.Random, s: str) -> str:
    if len(s) < 4:
        return s
    i = R.randint(1, len(s) - 2)
    kind = R.random()
    if kind < 0.4:      # drop a letter
        return s[:i] + s[i + 1:]
    if kind < 0.7:      # swap neighbours
        return s[:i] + s[i + 1] + s[i] + s[i + 2:]
    return s[:i] + R.choice("aeiou") + s[i + 1:]  # replace


def fmt_phone(d: str, style: str) -> str:
    if not d:
        return ""
    a, b, c = d[:3], d[3:6], d[6:]
    return {"paren": f"({a}) {b}-{c}", "dash": f"{a}-{b}-{c}", "dot": f"{a}.{b}.{c}", "plain": d,
            "intl": f"+1 {a} {b} {c}", "spaces": f"{a} {b} {c}"}[style]


def expand_street(line1: str) -> str:
    m = {"St": "Street", "Ave": "Avenue", "Rd": "Road", "Dr": "Drive", "Ln": "Lane", "Ct": "Court",
         "Blvd": "Boulevard", "Pl": "Place", "Cir": "Circle", "Way": "Way",
         "N": "North", "S": "South", "E": "East", "W": "West"}
    return " ".join(m.get(t, t) for t in line1.split())


def state_full(code: str) -> str:
    from matchlib import STATES
    return next(k.title() for k, v in STATES.items() if v == code)


def fmt_date(R: random.Random, iso: str, tag: str, defects: list[str], g: Gen) -> str:
    d = date.fromisoformat(iso)
    roll = R.random()
    if roll < 0.30:
        return iso
    if roll < 0.70:
        return f"{d.month}/{d.day}/{d.year}"
    if roll < 0.85:
        return f"{d.month}/{d.day}/{d.year % 100:02d}"
    if roll < 0.95 and tag == "B":
        defects.append("D-DATE-EXCEL"); g.tick("D-DATE-EXCEL")
        return str((d - EXCEL_EPOCH).days)
    return d.strftime("%b %-d, %Y") if os.name != "nt" else d.strftime("%b %d, %Y")


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def write_csv(path: str, rows: list[dict], cols: list[str], encoding: str = "utf-8", bom: bool = False,
              newline: str = "\n") -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator=newline, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow({c: r.get(c, "") for c in cols})
    data = buf.getvalue().encode(encoding, errors="replace")
    if bom:
        data = b"\xef\xbb\xbf" + data
    with open(path, "wb") as f:
        f.write(data)
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=SEED_DEFAULT)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fixtures"))
    ap.add_argument("--rows-a", type=int, default=400)
    ap.add_argument("--rows-b", type=int, default=250)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    g = Gen(args.seed)
    g.build_population()
    constituents, gifts = g.build_crm()
    rows_a, key_a, cols_a = g.build_import("A", args.rows_a, gifts)
    rows_b, key_b, cols_b = g.build_import("B", args.rows_b, gifts)

    persons_rows = []
    for p in g.persons:
        persons_rows.append({
            "person_id": p.pid, "first": p.first, "middle": p.middle, "last": p.last, "suffix": p.suffix,
            "prior_last": p.prior_last, "dob": p.dob, "email": p.email, "phone": p.phone,
            "line1": p.addr.line1(), "unit": p.addr.unit if not p.addr.pobox else "", "city": p.addr.city,
            "state": p.addr.state, "zip": p.addr.zip5,
            "prior_line1": p.prior_addr.line1() if p.prior_addr else "", "prior_zip": p.prior_addr.zip5 if p.prior_addr else "",
            "household_id": p.household, "in_crm": "1" if p.in_crm else "0", "crm_constituent_id": p.crm_id, "trap": p.trap,
        })
    hashes = {}
    hashes["truth_persons.csv"] = sha256_bytes(write_csv(os.path.join(args.out, "truth_persons.csv"), persons_rows, list(persons_rows[0].keys())))
    hashes["crm_constituents.csv"] = sha256_bytes(write_csv(os.path.join(args.out, "crm_constituents.csv"), constituents, list(constituents[0].keys())))
    hashes["crm_gifts.csv"] = sha256_bytes(write_csv(os.path.join(args.out, "crm_gifts.csv"), gifts, list(gifts[0].keys())))
    hashes["import_a.csv"] = sha256_bytes(write_csv(os.path.join(args.out, "import_a.csv"), rows_a, cols_a, encoding="utf-8", bom=True, newline="\r\n"))
    hashes["import_b.csv"] = sha256_bytes(write_csv(os.path.join(args.out, "import_b.csv"), rows_b, cols_b, encoding="cp1252"))
    hashes["answer_key_a.csv"] = sha256_bytes(write_csv(os.path.join(args.out, "answer_key_a.csv"), key_a, list(key_a[0].keys())))
    hashes["answer_key_b.csv"] = sha256_bytes(write_csv(os.path.join(args.out, "answer_key_b.csv"), key_b, list(key_b[0].keys())))

    link_counts = {}
    for k in key_a + key_b:
        link_counts[k["expected_link"]] = link_counts.get(k["expected_link"], 0) + 1
    manifest = {
        "generator": "tools/build_fixtures.py", "seed": args.seed,
        "counts": {"persons": len(g.persons), "households": len({p.household for p in g.persons}),
                   "crm_constituents": len(constituents), "crm_gifts": len(gifts),
                   "import_a_rows": len(rows_a), "import_b_rows": len(rows_b),
                   "traps": {t: sum(1 for p in g.persons if p.trap == t) for t in sorted({p.trap for p in g.persons if p.trap})},
                   "expected_link": link_counts},
        "defects_applied": dict(sorted(g.defect_counts.items())),
        "sha256": hashes,
    }
    mj = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    with open(os.path.join(args.out, "MANIFEST.json"), "w", encoding="utf-8") as f:
        f.write(mj)
    print(mj)
    return 0


if __name__ == "__main__":
    sys.exit(main())
