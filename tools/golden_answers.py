"""Housefile — kickoff answer key (test oracle, never product code).

Re-derives every worked example in docs/domain-brief.md sections 9 and 10 from
tools/matchlib.py and checks each against the number worked by hand in the brief.
Prints one line per example and ends with OK, or exits 1 naming the first mismatch.

The hand-derived values are the EXPECTED column below. If matchlib disagrees, the
brief and matchlib are out of step: fix the brief and matchlib deliberately, never
this file's expected value to make it pass.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from matchlib import (Record, Address, parse_name, norm_email, norm_phone, norm_zip, norm_date,  # noqa: E402
                      norm_amount, norm_address, score_pair, jaro_winkler, soundex)


def rec(rid, first="", last="", middle="", suffix="", email="", phone="", line1="", line2="", zipc="", dob="", full=""):
    name = parse_name(first=first, last=last, middle=middle, suffix=suffix, full=full)
    e, _ = norm_email(email)
    p, _ = norm_phone(phone)
    a, _ = norm_address(line1, line2, "", "", zipc)
    return Record(rid=rid, name=name, email=e, phone=p, addr=a, dob=dob)


# (id, description, record A, record B, expected points, expected decision, expected reasons, expected flags)
PAIRS = [
    ("GA-01", "Exact duplicate, clean",
     rec("a", "Robert", "Johnson", email="robert.johnson@example.com", phone="918-555-0142", line1="12 Oak St", zipc="74105"),
     rec("b", "Robert", "Johnson", email="Robert.Johnson@example.com", phone="(918) 555-0142", line1="12 Oak Street", zipc="74105"),
     120, "MERGE", "EMAIL_EXACT+PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+ADDRESS_EXACT", ""),
    ("GA-02", "Nickname + address, no identifiers",
     rec("a", "Bob", "Johnson", line1="12 Oak Street", zipc="74105"),
     rec("b", "Robert", "Johnson", line1="12 Oak St", zipc="74105"),
     50, "REVIEW", "FIRST_NICKNAME+SURNAME_EXACT+ADDRESS_EXACT", ""),
    ("GA-03", "Nickname + address + phone",
     rec("a", "Bob", "Johnson", phone="9185550142", line1="12 Oak Street", zipc="74105"),
     rec("b", "Robert", "Johnson", phone="(918) 555-0142", line1="12 Oak St", zipc="74105"),
     75, "MERGE", "PHONE_EXACT+FIRST_NICKNAME+SURNAME_EXACT+ADDRESS_EXACT", ""),
    ("GA-04", "Email + name, moved (different ZIP)",
     rec("a", "Robert", "Johnson", email="robert.johnson@example.com", line1="900 Elm Dr", zipc="80202"),
     rec("b", "Robert", "Johnson", email="robert.johnson@example.com", line1="12 Oak St", zipc="74105"),
     75, "MERGE", "EMAIL_EXACT+FIRST_EXACT+SURNAME_EXACT", ""),
    ("GA-05", "Surname change, same address, same email",
     rec("a", "Mary", "Jones", email="mary.j@example.com", line1="12 Oak St", zipc="74105"),
     rec("b", "Mary", "Smith", email="mary.j@example.com", line1="12 Oak St", zipc="74105"),
     70, "MERGE", "EMAIL_EXACT+FIRST_EXACT+SURNAME_DIFF+ADDRESS_EXACT", ""),
    ("GA-06", "Shared family email: spouse, same surname and address",
     rec("a", "John", "Smith", email="smithfamily@example.com", line1="12 Oak St", zipc="74105"),
     rec("b", "Mary", "Smith", email="smithfamily@example.com", line1="12 Oak St", zipc="74105"),
     55, "REVIEW", "EMAIL_EXACT+FIRST_DIFF+SURNAME_EXACT+ADDRESS_EXACT", ""),
    ("GA-07", "Shared email, nothing else in common",
     rec("a", "Tom", "Nguyen", email="family@example.com"),
     rec("b", "Linda", "Park", email="family@example.com"),
     10, "REVIEW", "EMAIL_EXACT+FIRST_DIFF+SURNAME_DIFF", "IDENTIFIER_FLOOR"),
    ("GA-08", "TRAP Jr/Sr, both suffixes present, same address, shared phone",
     rec("a", "William", "O'Brien", suffix="Sr", phone="405-555-0414", line1="3101 S Oak Ln", line2="Apt 24", zipc="73013"),
     rec("b", "William", "O'Brien", suffix="Jr.", phone="405-555-0414", line1="3101 South Oak Lane #24", zipc="73013"),
     35, "NEW", "PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+SUFFIX_CONFLICT+ADDRESS_EXACT", "HARD_BLOCK_SUFFIX;HOUSEHOLD_CANDIDATE"),
    ("GA-09", "TRAP Jr/Sr, suffix dropped on the import side",
     rec("a", "William", "O'Brien", phone="405-555-0414", line1="3101 S Oak Ln", line2="Apt 24", zipc="73013"),
     rec("b", "William", "O'Brien", suffix="Jr", phone="405-555-0414", line1="3101 S Oak Ln Apt 24", zipc="73013"),
     65, "REVIEW", "PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+SUFFIX_ONE_SIDED+ADDRESS_EXACT", ""),
    ("GA-10", "TRAP two different Maria Garcias, same ZIP, different middle initial",
     rec("a", "Maria", "Garcia", middle="A", email="maria.a.garcia@example.com", line1="44 Peoria Ave", zipc="74105"),
     rec("b", "Maria", "Garcia", middle="L", email="mgarcia77@example.org", line1="910 Lewis Ct", zipc="74105"),
     18, "NEW", "FIRST_EXACT+SURNAME_EXACT+MIDDLE_CONFLICT+ZIP_EXACT", ""),
    ("GA-11", "Transposed first/last + email",
     rec("a", "Flores", "Hiroshi", email="hiroshi.flores@example.com"),
     rec("b", "Hiroshi", "Flores", email="hiroshi.flores@example.com"),
     70, "MERGE", "EMAIL_EXACT+NAME_TRANSPOSED", ""),
    ("GA-12", "Transposed first/last + address only",
     rec("a", "Flores", "Hiroshi", line1="8633 W Oak Ct", zipc="73003"),
     rec("b", "Hiroshi", "Flores", line1="8633 West Oak Court", zipc="73003"),
     45, "REVIEW", "NAME_TRANSPOSED+ADDRESS_EXACT", ""),
    ("GA-13", "Initial only + phone + surname + address",
     rec("a", "M.", "Garcia", phone="918 555 0190", line1="44 Peoria Ave", zipc="74105"),
     rec("b", "Maria", "Garcia", phone="9185550190", line1="44 Peoria Ave", zipc="74105"),
     65, "REVIEW", "PHONE_EXACT+FIRST_INITIAL+SURNAME_EXACT+ADDRESS_EXACT", ""),
    ("GA-14", "Household member: different first name, same surname and address, no identifiers",
     rec("a", "Emily", "Baker", line1="5544 Hillcrest Pl", line2="#23A", zipc="80210"),
     rec("b", "Barbara", "Baker", line1="5544 Hillcrest Pl #23A", zipc="80210"),
     10, "NEW", "FIRST_DIFF+SURNAME_EXACT+ADDRESS_EXACT", "HOUSEHOLD_CANDIDATE"),
    ("GA-15", "One-letter typo in first name + email",
     rec("a", "Jon", "Smith", email="john.smith@example.com"),
     rec("b", "John", "Smith", email="john.smith@example.com"),
     70, "MERGE", "EMAIL_EXACT+FIRST_CLOSE+SURNAME_EXACT", ""),
    ("GA-16", "Strong match but DOB conflicts",
     rec("a", "Robert", "Johnson", phone="9185550142", line1="12 Oak St", zipc="74105", dob="1961-03-09"),
     rec("b", "Robert", "Johnson", phone="9185550142", line1="12 Oak St", zipc="74105", dob="1961-09-03"),
     45, "REVIEW", "PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+ADDRESS_EXACT+DOB_DIFF", ""),
    ("GA-17", "Surname change, same address, no email (name-change floor)",
     rec("a", "Mary", "Jones", line1="12 Oak St", zipc="74105"),
     rec("b", "Mary", "Smith", line1="12 Oak St", zipc="74105"),
     25, "REVIEW", "FIRST_EXACT+SURNAME_DIFF+ADDRESS_EXACT", "NAME_CHANGE_CANDIDATE"),
    ("GA-18", "Same name, same building, different unit, nothing else",
     rec("a", "David", "Nguyen", line1="9382 Market Blvd", line2="Apt 3", zipc="78704"),
     rec("b", "David", "Nguyen", line1="9382 Market Blvd", line2="Apt 11", zipc="78704"),
     45, "REVIEW", "FIRST_EXACT+SURNAME_EXACT+ADDRESS_SAME_BUILDING", ""),
    ("GA-19", "TRAP spouses sharing email, phone, surname and address",
     rec("a", "John", "Smith", email="smiths@example.com", phone="9185550142", line1="12 Oak St", zipc="74105"),
     rec("b", "Mary", "Smith", email="smiths@example.com", phone="(918) 555-0142", line1="12 Oak Street", zipc="74105"),
     80, "REVIEW", "EMAIL_EXACT+PHONE_EXACT+FIRST_DIFF+SURNAME_EXACT+ADDRESS_EXACT", "FIRST_NAME_CONFLICT_CAP"),
    ("GA-20", "TRAP everything agrees but the birth date (both generations lost their suffix)",
     rec("a", "James", "Perez", email="jperez@example.com", phone="5085550116", line1="2353 Elm St", zipc="73003", dob="1952-02-16"),
     rec("b", "James", "Perez", email="jperez@example.com", phone="508-555-0116", line1="2353 Elm St", zipc="73003", dob="1981-04-24"),
     90, "REVIEW", "EMAIL_EXACT+PHONE_EXACT+FIRST_EXACT+SURNAME_EXACT+ADDRESS_EXACT+DOB_DIFF", "DOB_CONFLICT_CAP"),
]

# Normalization goldens: (id, description, actual, expected)
NORMS = [
    ("GN-01", "email: case, Gmail dots and +tag", norm_email("Bob.Johnson+gala@Gmail.com"), ("bobjohnson@gmail.com", "")),
    ("GN-02", "email: dots kept on a non-Gmail domain", norm_email("bob.johnson@example.com"), ("bob.johnson@example.com", "")),
    ("GN-03", "email: double @ is invalid", norm_email("jane@@example.com"), ("", "EMAIL_INVALID")),
    ("GN-04", "phone: +1 and punctuation", norm_phone("+1 (918) 555-0142"), ("9185550142", "")),
    ("GN-05", "phone: 9 digits is invalid", norm_phone("918-555-014"), ("", "PHONE_INVALID")),
    ("GN-06", "zip: Excel dropped the leading zero", norm_zip("7102"), ("07102", "ZIP_PADDED")),
    ("GN-07", "zip: ZIP+4 truncates", norm_zip("01605-1234"), ("01605", "")),
    ("GN-08", "date: Excel serial 46113", norm_date("46113"), ("2026-04-01", "DATE_EXCEL_SERIAL")),
    ("GN-09", "date: two-digit year", norm_date("5/4/26"), ("2026-05-04", "")),
    ("GN-10", "date: month name", norm_date("Sep 19, 2026"), ("2026-09-19", "")),
    ("GN-11", "amount: dollars and commas", norm_amount("$1,250.00"), (125000, "")),
    ("GN-12", "amount: parentheses are negative", norm_amount("(50.00)"), (-5000, "AMOUNT_NEGATIVE")),
    ("GN-13", "amount: words are invalid", norm_amount("fifty"), (None, "AMOUNT_INVALID")),
    ("GN-14", "amount: one decimal place", norm_amount("$1250.5"), (125050, "")),
    ("GN-15", "name: 'Last, First M. Suffix'", parse_name(full="O'Brien, Edward L. Jr."),
     parse_name(first="Edward", last="OBrien", middle="L", suffix="Jr")),
    ("GN-16", "name: middle initial glued into the first column", parse_name(first="Mary K.", last="Lee"),
     parse_name(first="Mary", middle="K", last="Lee")),
    ("GN-17", "jaro-winkler jon/john", jaro_winkler("jon", "john"), 0.9333),
    ("GN-18", "soundex Flores / Florse (typo survives blocking)", (soundex("Flores"), soundex("Florse")), ("F462", "F462")),
]


def main() -> int:
    bad = 0
    print(f"{'ID':6} {'pts':>4} {'decision':8} reasons / flags")
    for gid, desc, a, b, pts, dec, reasons, flags in PAIRS:
        s = score_pair(a, b)
        got = (s.total, s.decision, "+".join(s.reasons), ";".join(s.flags))
        exp = (pts, dec, reasons, flags)
        mark = "" if got == exp else "   <-- MISMATCH expected " + repr(exp)
        if mark:
            bad += 1
        print(f"{gid:6} {s.total:>4} {s.decision:8} {'+'.join(s.reasons)} {('[' + ';'.join(s.flags) + ']') if s.flags else ''}  — {desc}{mark}")
        # symmetry: scoring must not depend on argument order
        s2 = score_pair(b, a)
        if (s2.total, s2.decision) != (s.total, s.decision):
            bad += 1
            print(f"{gid:6} ASYMMETRIC: reversed gives {s2.total} {s2.decision}")
    print()
    a1, _ = norm_address("1611 North Church Lane Ste 33C", "", "Tulsa", "Oklahoma", "74133-3517")
    a2, _ = norm_address("1611 N Church Ln", "#33C", "Tulsa", "OK", "74133")
    NORMS.append(("GN-19", "address: street words, unit designator, ZIP+4, state name",
                  (a1.number, a1.street, a1.unit, a1.state, a1.zip5, a1.line1_key() == a2.line1_key() and a1.unit == a2.unit),
                  ("1611", "N CHURCH LN", "33C", "OK", "74133", True)))
    a3, _ = norm_address("P.O. Box 0123", "", "Tulsa", "OK", "74105")
    NORMS.append(("GN-20", "address: PO box", (a3.pobox, a3.line1_key()), ("123", "PO BOX 123")))
    for gid, desc, got, exp in NORMS:
        ok = got == exp
        bad += 0 if ok else 1
        print(f"{gid:6} {'ok ' if ok else 'BAD'} {desc}: {got!r}" + ("" if ok else f"  expected {exp!r}"))
    print()
    if bad:
        print(f"FAIL: {bad} mismatch(es)")
        return 1
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
