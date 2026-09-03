#!/usr/bin/env python3
"""Validate puzzles/rules/*.json and the puzzles that reference them.

Extra rules are mostly prose — most of what could go wrong in them can't be checked
mechanically (see PLAN-photo-import.md §5.4: no general rule engine here). What CAN be
checked mechanically, and does catch real bugs, is reference integrity: a puzzle naming
a "rulesets" id that has no file (a rename that missed a puzzle), a ruleset file naming
an "image" that doesn't exist on disk (same for a photo path), and each ruleset file
having the shape the app's fetchRuleset()/renderRulesPanel() expect.

"constraints" stays an inert, unimplemented slot on every ruleset file — see the plan.
Each predicate (noDiagonalAdjacency, victimIsolated, ...) gets implemented HERE, and only
here, the day a real puzzle first needs it checked. Shipping any of them speculatively,
before a puzzle exists that uses them, is pure cost: a vocabulary nobody has validated
against a real rule page, for a check nothing calls.

Usage:
    tools/check_rules.py <puzzle-id>     # this puzzle's own ruleset references
    tools/check_rules.py --all           # every puzzle, plus orphaned ruleset files
Exits non-zero if any hard error is found (a missing file, a malformed ruleset).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUZZLES_DIR = ROOT / "puzzles"
RULES_DIR = PUZZLES_DIR / "rules"

REQUIRED_FIELDS = ("id", "title", "text")


def load_all_puzzles():
    """{puzzle_id: parsed puzzle} for every puzzles/<id>.json (index.json excluded).
    A puzzle file that fails to parse is reported here and simply excluded — the puzzle
    JSON's own shape isn't this tool's job, only its "rulesets" references are."""
    out = {}
    for path in sorted(PUZZLES_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        try:
            out[path.stem] = json.loads(path.read_text())
        except Exception as e:
            print(f"  ✗ {path.name}: invalid JSON ({e})")
    return out


def check_ruleset_file(ruleset_id):
    """Returns a list of hard errors for puzzles/rules/<ruleset_id>.json's own shape —
    existence, required fields, a non-empty text array, and (when present) that its
    image actually exists on disk."""
    path = RULES_DIR / f"{ruleset_id}.json"
    if not path.exists():
        return [f"no puzzles/rules/{ruleset_id}.json for this reference"]

    try:
        data = json.loads(path.read_text())
    except Exception as e:
        return [f"puzzles/rules/{ruleset_id}.json: invalid JSON ({e})"]

    errors = []
    for field in REQUIRED_FIELDS:
        if field not in data:
            errors.append(f"puzzles/rules/{ruleset_id}.json: missing required field '{field}'")
    if data.get("id") is not None and data["id"] != ruleset_id:
        errors.append(f"puzzles/rules/{ruleset_id}.json: id field is '{data['id']}', filename says '{ruleset_id}'")

    text = data.get("text")
    if "text" in data and not (isinstance(text, list) and text and all(isinstance(t, str) and t.strip() for t in text)):
        errors.append(f"puzzles/rules/{ruleset_id}.json: 'text' must be a non-empty array of non-empty strings")

    if "constraints" in data and not isinstance(data["constraints"], list):
        errors.append(f"puzzles/rules/{ruleset_id}.json: 'constraints' must be an array (ship it empty — see this file's own docstring)")

    image = data.get("image")
    if image:
        if not (PUZZLES_DIR / image).exists():
            errors.append(f"puzzles/rules/{ruleset_id}.json: image '{image}' does not exist (puzzles/{image})")

    return errors


def check_puzzle(puzzle_id, puzzle):
    """Returns a list of hard errors for one puzzle's own "rulesets" reference list."""
    rulesets = puzzle.get("rulesets", [])
    if not isinstance(rulesets, list):
        return [f"'rulesets' must be an array of ruleset ids, got {rulesets!r}"]

    errors = []
    for rid in rulesets:
        errors.extend(check_ruleset_file(rid))
    return errors


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--all":
        mode = "all"
    elif len(sys.argv) == 2:
        mode = "one"
    else:
        print(__doc__)
        sys.exit(1)

    puzzles = load_all_puzzles()

    if mode == "one":
        puzzle_id = sys.argv[1]
        if puzzle_id not in puzzles:
            print(f"  ✗ {puzzle_id}: no puzzles/{puzzle_id}.json")
            sys.exit(1)
        target_ids = [puzzle_id]
    else:
        target_ids = sorted(puzzles)

    any_errors = False
    for pid in target_ids:
        rulesets = puzzles[pid].get("rulesets") or []
        if not rulesets:
            print(f"  · {pid}: no rulesets")
            continue
        errors = check_puzzle(pid, puzzles[pid])
        if errors:
            any_errors = True
            print(f"  ✗ {pid}")
            for e in errors:
                print(f"      {e}")
        else:
            print(f"  ✓ {pid} ({', '.join(rulesets)})")

    if mode == "all" and RULES_DIR.exists():
        # Every ruleset a puzzle actually references, across the whole library — not just
        # target_ids, which happens to already be every puzzle in --all mode, but this
        # stays correct if that ever changes.
        referenced = set()
        for p in puzzles.values():
            for rid in (p.get("rulesets") or []):
                if isinstance(rid, str):
                    referenced.add(rid)
        # A warning, not an error: an unreferenced ruleset file is dead weight (or a
        # worked example / a page transcribed ahead of the puzzle that will use it), not
        # breakage — nothing downstream fails because of it, unlike a puzzle pointing at
        # a file that doesn't exist.
        for path in sorted(RULES_DIR.glob("*.json")):
            if path.stem not in referenced:
                print(f"      ! puzzles/rules/{path.name} is not referenced by any puzzle")

    sys.exit(1 if any_errors else 0)


if __name__ == "__main__":
    main()
