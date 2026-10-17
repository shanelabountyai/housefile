"""Housefile — fixture freeze check (test oracle, never product code).

Regenerates the fixtures with the pinned seed into a temporary directory and
compares every sha256 with fixtures/MANIFEST.json, then re-runs golden_answers.
Prints OK or names the first file whose bytes moved. Used by `npm run fixtures:check`.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def main() -> int:
    fixtures = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "fixtures")
    manifest_path = os.path.join(fixtures, "MANIFEST.json")
    if not os.path.exists(manifest_path):
        print(f"no MANIFEST.json in {fixtures}; run tools/build_fixtures.py first")
        return 1
    manifest = json.load(open(manifest_path, encoding="utf-8"))
    seed = manifest["seed"]
    with tempfile.TemporaryDirectory() as tmp:
        r = subprocess.run([sys.executable, os.path.join(HERE, "build_fixtures.py"), "--seed", str(seed), "--out", tmp],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr)
            return 1
        fresh = json.load(open(os.path.join(tmp, "MANIFEST.json"), encoding="utf-8"))
        # decisions_*.csv are written by the reference matcher; if the fixtures dir has them, they must reproduce too
        for tag in ("a", "b"):
            if os.path.exists(os.path.join(fixtures, f"decisions_{tag}.csv")):
                r = subprocess.run([sys.executable, os.path.join(HERE, "reference_matcher.py"), "--fixtures", tmp, "--write-decisions"],
                                   capture_output=True, text=True)
                if r.returncode != 0:
                    print(r.stderr)
                    return 1
                for t in ("a", "b"):
                    old = hashlib.sha256(open(os.path.join(fixtures, f"decisions_{t}.csv"), "rb").read()).hexdigest()
                    new = hashlib.sha256(open(os.path.join(tmp, f"decisions_{t}.csv"), "rb").read()).hexdigest()
                    manifest["sha256"][f"decisions_{t}.csv"] = old
                    fresh["sha256"][f"decisions_{t}.csv"] = new
                break
    bad = 0
    for name, h in sorted(manifest["sha256"].items()):
        got = fresh["sha256"].get(name)
        if got != h:
            bad += 1
            print(f"MOVED {name}: manifest {h[:12]}… regenerated {str(got)[:12]}…")
        else:
            print(f"ok    {name} {h[:12]}…")
    r = subprocess.run([sys.executable, os.path.join(HERE, "golden_answers.py")], capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.rstrip().endswith("OK"):
        bad += 1
        print("golden_answers.py did not end with OK")
        print(r.stdout[-2000:])
    if bad:
        print(f"FAIL: {bad}")
        return 1
    print(f"OK seed={seed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
