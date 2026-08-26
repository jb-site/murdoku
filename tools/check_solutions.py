#!/usr/bin/env python3
"""Validate puzzles/solutions/*.json against their puzzles.

A green run means each solution is a structurally legal Murdoku answer. That isn't proof
it's *the* answer, but a letter misread off a solution PDF almost always breaks one of
these rules — which is the point: transcribing a grid by eye is the error-prone step, and
this is the cheap mechanical net under it.

Usage:  python3 tools/check_solutions.py [id ...]
Exits non-zero if any solution has errors.
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUZZLES = ROOT / "puzzles"
SOLUTIONS = PUZZLES / "solutions"

# Mirrors OBJECT_TYPES[...].occupiable in app.js. Kept as the blocking set (the shorter,
# slower-growing half) so a new occupiable type doesn't silently start failing here.
BLOCKING = {"tv", "shelf", "table", "plant", "tree", "bonsai", "cactus",
            "lilypad", "flower", "shrub", "bear", "boulder"}


def check(puzzle_id):
    """Returns (errors, warnings) for one puzzle id."""
    errors, warnings = [], []
    sol_path = SOLUTIONS / f"{puzzle_id}.json"
    puz_path = PUZZLES / f"{puzzle_id}.json"

    if not puz_path.exists():
        return [f"no puzzle file {puz_path.name} for this solution"], []

    puz = json.loads(puz_path.read_text())
    sol = json.loads(sol_path.read_text())

    if sol.get("puzzleId") != puzzle_id:
        errors.append(f'puzzleId is "{sol.get("puzzleId")}" but the file is named {puzzle_id}.json')

    rows, cols = puz["rows"], puz["cols"]
    room_grid = puz["roomGrid"]
    suspects = puz["suspects"]
    placements = sol.get("placements", {})

    # Which cells are blocked by a non-occupiable object.
    blocked = set()
    for obj in puz.get("objects", []):
        if obj["type"] in BLOCKING:
            blocked.update((r, c) for r, c in obj["cells"])

    # --- every suspect placed exactly once, no strangers ---
    for letter in suspects:
        if letter not in placements:
            errors.append(f"suspect {letter} has no placement")
    for letter in placements:
        if letter not in suspects:
            errors.append(f'placement for "{letter}", who is not in this puzzle\'s cast')

    # --- each placement is a legal cell ---
    seen = {}
    for letter, cell in sorted(placements.items()):
        if not (isinstance(cell, list) and len(cell) == 2 and all(isinstance(n, int) for n in cell)):
            errors.append(f"{letter}: placement {cell!r} is not a [row, col] pair of integers")
            continue
        r, c = cell
        if not (0 <= r < rows and 0 <= c < cols):
            errors.append(f"{letter}: [{r},{c}] is outside the {rows}x{cols} grid "
                          f"(placements are 0-indexed — check for an off-by-one against the printed labels)")
            continue
        if room_grid[r][c] is None:
            errors.append(f"{letter}: [{r},{c}] is a void cell, not part of the board")
        if (r, c) in blocked:
            errors.append(f"{letter}: [{r},{c}] holds a blocking object — nobody can stand there")
        if (r, c) in seen:
            errors.append(f"{letter} and {seen[(r, c)]} are both on [{r},{c}]")
        seen[(r, c)] = letter

    # --- the core rule: at most one person per row, one per column ---
    for axis, idx in (("row", 0), ("column", 1)):
        lines = {}
        for letter, cell in sorted(placements.items()):
            if isinstance(cell, list) and len(cell) == 2:
                lines.setdefault(cell[idx], []).append(letter)
        for line, occupants in sorted(lines.items()):
            if len(occupants) > 1:
                errors.append(f"{axis} {line} holds {', '.join(occupants)} — "
                              f"only one person per {axis} is allowed")

    # --- the victim was alone with the murderer ---
    victim = placements.get("V")
    murderer = sol.get("murderer")
    if murderer and murderer not in suspects:
        errors.append(f'murderer "{murderer}" is not in this puzzle\'s cast')
    elif murderer == "V":
        errors.append("murderer is recorded as V, the victim")
    if isinstance(victim, list) and len(victim) == 2 and 0 <= victim[0] < rows and 0 <= victim[1] < cols:
        victim_room = room_grid[victim[0]][victim[1]]
        with_victim = sorted(
            letter for letter, cell in placements.items()
            if letter != "V" and isinstance(cell, list) and len(cell) == 2
            and 0 <= cell[0] < rows and 0 <= cell[1] < cols
            and room_grid[cell[0]][cell[1]] == victim_room
        )
        # A warning, not an error: every puzzle so far carries the "alone with the murderer"
        # clue, but it's a per-puzzle clue rather than a rule of the game, so a puzzle that
        # words it differently shouldn't fail the whole run.
        if len(with_victim) != 1:
            warnings.append(f"{len(with_victim)} people share the victim's room "
                            f"({', '.join(with_victim) or 'nobody'}) — expected exactly the murderer")
        elif murderer and with_victim[0] != murderer:
            errors.append(f'murderer is recorded as {murderer}, but {with_victim[0]} is the one '
                          f"in the victim's room — the grid and the stated murderer disagree")

    return errors, warnings


def main():
    wanted = sys.argv[1:]
    if not SOLUTIONS.exists():
        print(f"no {SOLUTIONS.relative_to(ROOT)} directory yet — nothing to check")
        return 0

    paths = sorted(SOLUTIONS.glob("*.json"))
    if wanted:
        paths = [p for p in paths if p.stem in wanted]
        missing = set(wanted) - {p.stem for p in paths}
        for m in sorted(missing):
            print(f"  ✗ {m}: no solution file")
        if missing:
            return 1

    if not paths:
        print("no solution files found")
        return 0

    manifest_ids = {e["id"] for e in json.loads((PUZZLES / "index.json").read_text())}
    failed = False

    for path in paths:
        errors, warnings = check(path.stem)
        if errors:
            failed = True
            print(f"  ✗ {path.stem}")
            for e in errors:
                print(f"      {e}")
        else:
            print(f"  ✓ {path.stem}")
        for w in warnings:
            print(f"      ! {w}")

    if not wanted:
        for missing in sorted(manifest_ids - {p.stem for p in paths}):
            print(f"  · {missing}: no solution yet")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
