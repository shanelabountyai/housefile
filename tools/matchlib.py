"""Housefile — reference normalization, blocking and scoring (test oracle).

Standard library only. This file is the executable form of docs/domain-brief.md
sections 5 to 8. It is a test oracle: product code under src/ must reproduce
its decisions on every pair, but must never import or port it line for line.
Every constant here has a row in the brief; change the brief first.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, timedelta

# ---------------------------------------------------------------------------
# Section 5 — normalization
# ---------------------------------------------------------------------------

# N1: nickname table. A raw first name maps to the set of canonical names it can
# stand for. Ambiguous nicknames (Ted, Sam, Alex, Pat, Chris) map to several.
NICKNAMES: dict[str, set[str]] = {}
_NICK_SOURCE = {
    "robert": ["bob", "rob", "bobby", "robbie"],
    "william": ["bill", "will", "billy", "willy"],
    "elizabeth": ["liz", "beth", "betty", "eliza", "lizzie", "betsy"],
    "margaret": ["peggy", "meg", "maggie", "marge"],
    "john": ["jack", "johnny"],
    "james": ["jim", "jimmy", "jamie"],
    "katherine": ["kate", "katie", "kathy", "kat"],
    "catherine": ["cathy", "cat", "kate"],
    "michael": ["mike", "mikey"],
    "thomas": ["tom", "tommy"],
    "susan": ["sue", "susie", "suzy"],
    "richard": ["rick", "dick", "richie", "ricky"],
    "christopher": ["chris", "kit"],
    "christine": ["chris", "chrissy"],
    "david": ["dave", "davey"],
    "daniel": ["dan", "danny"],
    "anthony": ["tony"],
    "andrew": ["andy", "drew"],
    "joseph": ["joe", "joey"],
    "patricia": ["pat", "patty", "trish", "tricia"],
    "patrick": ["pat", "paddy"],
    "edward": ["ed", "eddie", "ted", "teddy"],
    "theodore": ["ted", "teddy", "theo"],
    "charles": ["charlie", "chuck", "chas"],
    "jennifer": ["jen", "jenny"],
    "rebecca": ["becky", "becca"],
    "deborah": ["deb", "debbie"],
    "nicholas": ["nick", "nicky"],
    "matthew": ["matt"],
    "samuel": ["sam", "sammy"],
    "samantha": ["sam", "sammy"],
    "alexander": ["alex"],
    "alexandra": ["alex", "lexi"],
    "benjamin": ["ben", "benny"],
    "jonathan": ["jon"],
    "timothy": ["tim", "timmy"],
    "steven": ["steve"],
    "stephen": ["steve"],
    "lawrence": ["larry"],
    "gerald": ["gerry", "jerry"],
    "jerome": ["jerry"],
    "donald": ["don", "donny"],
    "ronald": ["ron", "ronnie"],
    "kenneth": ["ken", "kenny"],
    "raymond": ["ray"],
    "frederick": ["fred", "freddie"],
    "dorothy": ["dot", "dottie"],
    "barbara": ["barb", "barbie"],
    "virginia": ["ginny"],
    "victoria": ["vicky", "tori"],
    "josephine": ["jo", "josie"],
    "eleanor": ["ellie", "nora"],
    "abigail": ["abby"],
    "gabriel": ["gabe"],
    "nathaniel": ["nate", "nathan"],
    "leonard": ["leo", "lenny"],
    "maria": [],
    "jose": [],
}
for _canon, _nicks in _NICK_SOURCE.items():
    NICKNAMES.setdefault(_canon, set()).add(_canon)
    for _n in _nicks:
        NICKNAMES.setdefault(_n, set()).add(_canon)

SUFFIXES = {"jr": "JR", "jr.": "JR", "junior": "JR", "sr": "SR", "sr.": "SR",
            "senior": "SR", "ii": "II", "iii": "III", "iv": "IV"}

STREET_TYPES = {
    "street": "ST", "st": "ST", "str": "ST", "avenue": "AVE", "ave": "AVE", "av": "AVE",
    "road": "RD", "rd": "RD", "drive": "DR", "dr": "DR", "lane": "LN", "ln": "LN",
    "court": "CT", "ct": "CT", "boulevard": "BLVD", "blvd": "BLVD", "place": "PL",
    "pl": "PL", "circle": "CIR", "cir": "CIR", "way": "WAY", "terrace": "TER",
    "ter": "TER", "parkway": "PKWY", "pkwy": "PKWY", "trail": "TRL", "trl": "TRL",
    "highway": "HWY", "hwy": "HWY",
}
DIRECTIONS = {"north": "N", "n": "N", "south": "S", "s": "S", "east": "E", "e": "E",
              "west": "W", "w": "W", "northeast": "NE", "ne": "NE", "northwest": "NW",
              "nw": "NW", "southeast": "SE", "se": "SE", "southwest": "SW", "sw": "SW"}
UNIT_WORDS = {"apt", "apt.", "apartment", "unit", "ste", "ste.", "suite", "#", "no", "no.",
              "number", "bldg", "fl", "floor", "rm", "room"}

STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
    "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT",
    "virginia": "VA", "washington": "WA", "west virginia": "WV", "wisconsin": "WI",
    "wyoming": "WY", "district of columbia": "DC",
}
STATE_CODES = set(STATES.values())

EXCEL_EPOCH = date(1899, 12, 30)
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def fold(s: str) -> str:
    """Lowercase, strip diacritics, collapse whitespace."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip().lower()


def norm_name_token(s: str) -> str:
    s = fold(s)
    s = re.sub(r"[^a-z' \-]", "", s)
    return s.replace("'", "").replace("-", " ").strip()


@dataclass
class Name:
    first: str = ""      # folded raw first name
    middle: str = ""     # folded middle name or initial
    last: str = ""
    suffix: str = ""     # JR SR II III IV or ""

    def first_canon(self) -> set[str]:
        """Set of canonical first names (N1). A name not in the table maps to itself."""
        f = self.first.split(" ")[0] if self.first else ""
        if not f:
            return set()
        return set(NICKNAMES.get(f, {f}))


def parse_name(first: str = "", last: str = "", middle: str = "", suffix: str = "",
               full: str = "") -> Name:
    """N1. Accepts split columns or one 'full' column ('Last, First M.' or 'First M. Last Jr')."""
    if full and not (first or last):
        full = fold(full).replace(".", "")
        if "," in full:
            last_part, _, rest = full.partition(",")
            last = last_part
            toks = rest.split()
        else:
            toks = full.split()
            last = ""
        # pull suffix from wherever it sits
        toks2 = []
        for t in toks:
            if t in SUFFIXES and not suffix:
                suffix = t
            else:
                toks2.append(t)
        if last:
            lt = last.split()
            if lt and lt[-1] in SUFFIXES and not suffix:
                suffix = lt[-1]
                lt = lt[:-1]
            last = " ".join(lt)
            first = toks2[0] if toks2 else ""
            middle = " ".join(toks2[1:])
        else:
            if len(toks2) >= 2:
                first, last = toks2[0], toks2[-1]
                middle = " ".join(toks2[1:-1])
            elif toks2:
                first = toks2[0]
    f = norm_name_token(first)
    # a middle initial or name glued into the first column: "mary k"
    ft = f.split(" ")
    if len(ft) > 1 and not middle:
        middle = " ".join(ft[1:])
        f = ft[0]
    l = norm_name_token(last)
    lt = l.split(" ")
    if lt and lt[-1] in SUFFIXES and not suffix:
        suffix = lt[-1]
        l = " ".join(lt[:-1])
    m = norm_name_token(middle)
    sfx = SUFFIXES.get(fold(suffix).replace(".", "").replace(" ", "") or fold(suffix), "")
    if not sfx and fold(suffix) in SUFFIXES:
        sfx = SUFFIXES[fold(suffix)]
    return Name(first=f, middle=m, last=l, suffix=sfx)


EMAIL_RE = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$")
GMAIL = {"gmail.com", "googlemail.com"}


def norm_email(raw: str) -> tuple[str, str]:
    """N2. Returns (normalized, reason). reason '' when valid."""
    e = fold(raw).replace(" ", "")
    if not e:
        return "", "EMAIL_MISSING"
    if e.count("@") != 1 or not EMAIL_RE.match(e):
        return "", "EMAIL_INVALID"
    local, domain = e.split("@")
    local = local.split("+")[0]
    if domain in GMAIL:
        local = local.replace(".", "")
        domain = "gmail.com"
    return f"{local}@{domain}", ""


def norm_phone(raw: str) -> tuple[str, str]:
    """N3. Ten digits or nothing."""
    d = re.sub(r"\D", "", raw or "")
    if not d:
        return "", "PHONE_MISSING"
    if len(d) == 11 and d[0] == "1":
        d = d[1:]
    if len(d) != 10:
        return "", "PHONE_INVALID"
    return d, ""


def norm_zip(raw: str) -> tuple[str, str]:
    """N5. Five digits; 3- or 4-digit values are left-padded (Excel dropped the zero)."""
    s = (raw or "").strip()
    if not s:
        return "", "ZIP_MISSING"
    first = s.split("-")[0].strip()
    d = re.sub(r"\D", "", first)
    if len(d) == 9:
        d = d[:5]
    if len(d) in (3, 4):
        return d.zfill(5), "ZIP_PADDED"
    if len(d) != 5:
        return "", "ZIP_INVALID"
    return d, ""


def norm_state(raw: str) -> tuple[str, str]:
    s = fold(raw).replace(".", "")
    if not s:
        return "", "STATE_MISSING"
    if s.upper() in STATE_CODES:
        return s.upper(), ""
    if s in STATES:
        return STATES[s], ""
    return "", "STATE_INVALID"


@dataclass
class Address:
    number: str = ""
    street: str = ""     # normalized street name incl. direction and type, e.g. "N OAK ST"
    unit: str = ""       # "4B" — designator words removed
    pobox: str = ""      # "123" when the line is a PO box
    city: str = ""
    state: str = ""
    zip5: str = ""

    def line1_key(self) -> str:
        if self.pobox:
            return f"PO BOX {self.pobox}"
        return f"{self.number} {self.street}".strip()

    def is_empty(self) -> bool:
        return not (self.number or self.pobox)


_UNIT_RE = re.compile(r"(?:^|\s)(?:#|apt\.?|apartment|unit|ste\.?|suite|no\.?|rm|room|fl|floor)\s*#?\s*([a-z0-9\-]+)\s*$")
_POBOX_RE = re.compile(r"^(?:p\.?\s*o\.?\s*box|post office box|pob)\s*#?\s*(\d+)")


def norm_address(line1: str, line2: str = "", city: str = "", state: str = "", zipc: str = "") -> tuple[Address, list[str]]:
    """N4. USPS-style abbreviation, unit split, PO box detection."""
    reasons: list[str] = []
    a = Address()
    l1 = fold(line1).replace(",", " ")
    l2 = fold(line2).replace(",", " ")
    l1 = re.sub(r"\s+", " ", l1).strip()
    l2 = re.sub(r"\s+", " ", l2).strip()
    m = _POBOX_RE.match(l1) or _POBOX_RE.match(l2)
    if m:
        a.pobox = str(int(m.group(1)))
    # unit: from line2, or trailing on line1
    unit = ""
    if l2 and not _POBOX_RE.match(l2):
        um = _UNIT_RE.search(" " + l2)
        unit = um.group(1) if um else re.sub(r"[^a-z0-9\-]", "", l2)
    if not unit:
        um = _UNIT_RE.search(l1)
        if um:
            unit = um.group(1)
            l1 = l1[:um.start()].strip()
    a.unit = unit.replace("-", "").upper()
    if not a.pobox:
        toks = [t for t in re.sub(r"[.#]", " ", l1).split() if t]
        if toks and re.match(r"^\d+[a-z]?$", toks[0]):
            a.number = toks[0].upper()
            toks = toks[1:]
        out = []
        for t in toks:
            if t in DIRECTIONS:
                out.append(DIRECTIONS[t])
            elif t in STREET_TYPES:
                out.append(STREET_TYPES[t])
            else:
                out.append(t.upper())
        a.street = " ".join(out)
    a.city = fold(city).upper()
    a.state, r = norm_state(state)
    if r and r != "STATE_MISSING":
        reasons.append(r)
    a.zip5, r = norm_zip(zipc)
    if r:
        reasons.append(r)
    if line1.strip() and a.is_empty():
        reasons.append("ADDRESS_UNPARSED")
    return a, reasons


def norm_date(raw: str) -> tuple[str, str]:
    """N6. ISO, M/D/YYYY, M/D/YY, Excel serial, 'Mar 3, 2025'. US month-first."""
    s = fold(raw).replace(",", " ")
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return "", "DATE_MISSING"
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t].*)?$", s)
    if m:
        y, mo, d = map(int, m.groups())
        return _mkdate(y, mo, d)
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2}|\d{4})$", s)
    if m:
        mo, d, y = m.groups()
        y = int(y)
        if y < 100:
            y += 2000 if y < 70 else 1900
        return _mkdate(y, int(mo), int(d))
    if re.match(r"^\d{5}$", s) and 20000 <= int(s) <= 60000:
        dt = EXCEL_EPOCH + timedelta(days=int(s))
        return dt.isoformat(), "DATE_EXCEL_SERIAL"
    m = re.match(r"^([a-z]{3})[a-z]* (\d{1,2}) (\d{4})$", s)
    if m and m.group(1) in MONTHS:
        return _mkdate(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
    m = re.match(r"^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})$", s)
    if m and m.group(2) in MONTHS:
        return _mkdate(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1)))
    return "", "DATE_INVALID"


def _mkdate(y: int, mo: int, d: int) -> tuple[str, str]:
    try:
        return date(y, mo, d).isoformat(), ""
    except ValueError:
        return "", "DATE_INVALID"


def norm_amount(raw: str) -> tuple[int | None, str]:
    """N7. To integer cents. Parentheses mean negative. Two decimals at most."""
    s = fold(raw).replace("usd", "").replace("$", "").replace(",", "").replace(" ", "")
    if not s:
        return None, "AMOUNT_MISSING"
    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg, s = True, s[1:-1]
    if s.startswith("-"):
        neg, s = True, s[1:]
    m = re.match(r"^(\d+)(?:\.(\d{1,2}))?$", s)
    if not m:
        return None, "AMOUNT_INVALID"
    whole, frac = m.group(1), (m.group(2) or "").ljust(2, "0")
    cents = int(whole) * 100 + int(frac)
    if neg:
        return -cents, "AMOUNT_NEGATIVE"
    if cents == 0:
        return 0, "AMOUNT_ZERO"
    return cents, ""


# ---------------------------------------------------------------------------
# Section 6 — string similarity and blocking keys
# ---------------------------------------------------------------------------

def jaro_winkler(a: str, b: str, prefix_scale: float = 0.1, max_prefix: int = 4) -> float:
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    la, lb = len(a), len(b)
    window = max(la, lb) // 2 - 1
    if window < 0:
        window = 0
    ma = [False] * la
    mb = [False] * lb
    matches = 0
    for i in range(la):
        lo, hi = max(0, i - window), min(lb, i + window + 1)
        for j in range(lo, hi):
            if not mb[j] and a[i] == b[j]:
                ma[i] = mb[j] = True
                matches += 1
                break
    if matches == 0:
        return 0.0
    t = 0
    k = 0
    for i in range(la):
        if ma[i]:
            while not mb[k]:
                k += 1
            if a[i] != b[k]:
                t += 1
            k += 1
    t //= 2
    jaro = (matches / la + matches / lb + (matches - t) / matches) / 3
    p = 0
    for i in range(min(max_prefix, la, lb)):
        if a[i] == b[i]:
            p += 1
        else:
            break
    return round(jaro + p * prefix_scale * (1 - jaro), 4)


def soundex(s: str) -> str:
    s = re.sub(r"[^a-z]", "", fold(s))
    if not s:
        return ""
    codes = {**dict.fromkeys("bfpv", "1"), **dict.fromkeys("cgjkqsxz", "2"),
             **dict.fromkeys("dt", "3"), "l": "4", **dict.fromkeys("mn", "5"), "r": "6"}
    out = s[0].upper()
    last = codes.get(s[0], "")
    for ch in s[1:]:
        c = codes.get(ch, "")
        if c and c != last:
            out += c
        if ch not in "hw":
            last = c
    return (out + "000")[:4]


@dataclass
class Record:
    """A normalized constituent (existing) or import row."""
    rid: str
    name: Name
    email: str = ""
    phone: str = ""
    addr: Address = field(default_factory=Address)
    dob: str = ""  # ISO or ""

    def blocking_keys(self) -> set[str]:
        keys = set()
        if self.email:
            keys.add("B1:" + self.email)
        if self.phone:
            keys.add("B2:" + self.phone)
        if self.name.last and self.addr.zip5:
            keys.add(f"B3:{soundex(self.name.last)}:{self.addr.zip5}")
        if self.addr.zip5 and (self.addr.number or self.addr.pobox):
            keys.add(f"B4:{self.addr.line1_key()}:{self.addr.zip5}")
        if self.name.first and self.name.last:
            for c in sorted(self.name.first_canon()):
                keys.add(f"B5:{soundex(c)}:{soundex(self.name.last)}")
        return keys


# ---------------------------------------------------------------------------
# Section 7 — scoring model
# ---------------------------------------------------------------------------

POINTS = {
    "EMAIL_EXACT": 45,
    "PHONE_EXACT": 25,
    "FIRST_EXACT": 15,
    "FIRST_NICKNAME": 15,
    "FIRST_CLOSE": 10,
    "FIRST_INITIAL": 5,
    "FIRST_DIFF": -25,
    "SURNAME_EXACT": 15,
    "SURNAME_CLOSE": 10,
    "SURNAME_DIFF": -10,
    "NAME_TRANSPOSED": 25,
    "ADDRESS_EXACT": 20,
    "ADDRESS_SAME_BUILDING": 15,
    "ZIP_EXACT": 3,
    "DOB_EXACT": 20,
    "DOB_DIFF": -30,
    "SUFFIX_EXACT": 5,
    "SUFFIX_CONFLICT": -40,
    "SUFFIX_ONE_SIDED": -10,
    "MIDDLE_CONFLICT": -15,
}
T_MERGE = 70
T_REVIEW = 45
CLOSE = 0.90
DIFF = 0.80


@dataclass
class Score:
    total: int
    reasons: list[str]
    decision: str  # MERGE | REVIEW | NEW
    flags: list[str]


def score_pair(a: Record, b: Record) -> Score:
    reasons: list[str] = []
    flags: list[str] = []
    pts = 0

    def add(code: str) -> None:
        nonlocal pts
        reasons.append(code)
        pts += POINTS[code]

    # identifiers
    if a.email and b.email and a.email == b.email:
        add("EMAIL_EXACT")
    if a.phone and b.phone and a.phone == b.phone:
        add("PHONE_EXACT")

    # names
    an, bn = a.name, b.name
    transposed = (an.first and an.last and bn.first and bn.last
                  and an.first != an.last
                  and an.first_canon() & NICKNAMES.get(bn.last, {bn.last})
                  and bn.first_canon() & NICKNAMES.get(an.last, {an.last}))
    if transposed:
        add("NAME_TRANSPOSED")
    else:
        if an.first and bn.first:
            if an.first == bn.first:
                add("FIRST_EXACT")
            elif an.first_canon() & bn.first_canon():
                add("FIRST_NICKNAME")
            elif len(an.first) == 1 or len(bn.first) == 1:
                if an.first[0] == bn.first[0]:
                    add("FIRST_INITIAL")
                else:
                    add("FIRST_DIFF")
            else:
                jw = jaro_winkler(an.first, bn.first)
                if jw >= CLOSE:
                    add("FIRST_CLOSE")
                elif jw < DIFF:
                    add("FIRST_DIFF")
        if an.last and bn.last:
            if an.last == bn.last:
                add("SURNAME_EXACT")
            else:
                jw = jaro_winkler(an.last, bn.last)
                if jw >= CLOSE:
                    add("SURNAME_CLOSE")
                elif jw < DIFF:
                    add("SURNAME_DIFF")

    # suffix
    if an.suffix and bn.suffix:
        if an.suffix != bn.suffix:
            add("SUFFIX_CONFLICT")
        else:
            add("SUFFIX_EXACT")
    elif an.suffix or bn.suffix:
        add("SUFFIX_ONE_SIDED")

    # middle: only a conflict when both have one and the initials differ
    if an.middle and bn.middle and an.middle[0] != bn.middle[0]:
        add("MIDDLE_CONFLICT")

    # address
    aa, ba = a.addr, b.addr
    if not aa.is_empty() and not ba.is_empty() and aa.zip5 and aa.zip5 == ba.zip5:
        if aa.line1_key() == ba.line1_key() and aa.unit == ba.unit:
            add("ADDRESS_EXACT")
        elif aa.line1_key() == ba.line1_key():
            add("ADDRESS_SAME_BUILDING")
        else:
            add("ZIP_EXACT")
    elif aa.zip5 and aa.zip5 == ba.zip5:
        add("ZIP_EXACT")

    # dob
    if a.dob and b.dob:
        if a.dob == b.dob:
            add("DOB_EXACT")
        else:
            add("DOB_DIFF")

    # decision
    if "SUFFIX_CONFLICT" in reasons:
        decision = "NEW"
        flags.append("HARD_BLOCK_SUFFIX")
    elif pts >= T_MERGE and "FIRST_DIFF" in reasons:
        decision = "REVIEW"  # the machine never merges two clearly different first names
        flags.append("FIRST_NAME_CONFLICT_CAP")
    elif pts >= T_MERGE and "DOB_DIFF" in reasons:
        decision = "REVIEW"  # nor two different birth dates
        flags.append("DOB_CONFLICT_CAP")
    elif pts >= T_MERGE:
        decision = "MERGE"
    elif pts >= T_REVIEW:
        decision = "REVIEW"
    else:
        decision = "NEW"
        if "EMAIL_EXACT" in reasons or "PHONE_EXACT" in reasons:
            decision = "REVIEW"
            flags.append("IDENTIFIER_FLOOR")
        elif "ADDRESS_EXACT" in reasons and ("FIRST_EXACT" in reasons or "FIRST_NICKNAME" in reasons):
            decision = "REVIEW"
            flags.append("NAME_CHANGE_CANDIDATE")
    if decision == "NEW" and "ADDRESS_EXACT" in reasons and "FIRST_DIFF" in reasons:
        flags.append("HOUSEHOLD_CANDIDATE")
    if decision == "NEW" and "SUFFIX_CONFLICT" in reasons and "ADDRESS_EXACT" in reasons:
        flags.append("HOUSEHOLD_CANDIDATE")
    return Score(total=pts, reasons=reasons, decision=decision, flags=flags)
