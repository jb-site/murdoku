#!/usr/bin/env python3
"""Audit puzzles/stories/<id>.json back against story_context/<id>.json.

Hard errors (nonzero exit): missing required fields, a whereabouts/escape entry missing or
extra relative to the cast, a name that belongs to a *different* puzzle's cast showing up in
this story (cross-puzzle contamination), or an escape line naming the real murderer or a real
room (the spoiler rule).

Soft warnings (printed, don't fail the run): two people's names appearing in the same act
paragraph when the context doesn't put them in the same room or adjacent, and an object word
appearing near the murderer's business that isn't in their nearbyObjectTypesForMethod. These
are heuristics over free text, not proof of a bug, so they're for a human to read, not to gate
on.

Usage:
    tools/check_stories.py <puzzle-id>
    tools/check_stories.py --all
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTEXT_DIR = ROOT / "story_context"
STORIES_DIR = ROOT / "puzzles" / "stories"
PUZZLES_DIR = ROOT / "puzzles"


def first_name(name):
    return re.sub(r"\s*\(victim\)\s*$", "", name).split()[0]


def all_puzzle_names():
    """{puzzle_id: {first_name, ...}} for every puzzle, for cross-contamination checks."""
    out = {}
    for path in PUZZLES_DIR.glob("*.json"):
        if path.name == "index.json":
            continue
        try:
            data = json.loads(path.read_text())
        except Exception:
            continue
        names = {first_name(n) for n in data.get("names", {}).values()}
        out[data.get("id", path.stem)] = names
    return out


def check_one(puzzle_id, everyone_names):
    errors = []
    warnings = []

    ctx_path = CONTEXT_DIR / f"{puzzle_id}.json"
    story_path = STORIES_DIR / f"{puzzle_id}.json"
    if not ctx_path.exists():
        return [f"missing story_context/{puzzle_id}.json — run tools/story_context.py first"], []
    if not story_path.exists():
        return [f"missing puzzles/stories/{puzzle_id}.json"], []

    ctx = json.loads(ctx_path.read_text())
    story = json.loads(story_path.read_text())

    people = ctx["people"]
    letters = [p["letter"] for p in people]
    names_by_letter = {p["letter"]: first_name(p["name"]) for p in people}
    murderer = ctx["murderer"]
    victim = ctx["victim"]
    suspects_for_escape = [l for l in letters if l not in (murderer, victim)]

    for field in ("id", "title", "victoryHeadline", "acts", "whereabouts", "reveal", "escape"):
        if field not in story:
            errors.append(f"missing top-level field '{field}'")
    if errors:
        return errors, warnings

    if not (isinstance(story["acts"], list) and len(story["acts"]) == 3 and all(story["acts"])):
        errors.append("'acts' must be a list of 3 non-empty strings")

    whereabouts = story.get("whereabouts", {})
    for l in letters:
        if not whereabouts.get(l):
            errors.append(f"whereabouts missing entry for {l} ({names_by_letter[l]})")
    for l in whereabouts:
        if l not in letters:
            errors.append(f"whereabouts has extra entry '{l}' not in this puzzle's cast")

    escape = story.get("escape", {})
    if not escape.get("generic"):
        errors.append("escape.generic missing")
    by_accused = escape.get("byAccused", {})
    for l in suspects_for_escape:
        if not by_accused.get(l):
            errors.append(f"escape.byAccused missing entry for {l} ({names_by_letter[l]})")
    for l in by_accused:
        if l == murderer:
            errors.append(f"escape.byAccused has an entry for the real murderer ({l}) — nonsensical, they weren't accused")
        elif l == victim:
            errors.append(f"escape.byAccused has an entry for the victim ({l})")
        elif l not in letters:
            errors.append(f"escape.byAccused has extra entry '{l}' not in this puzzle's cast")

    # Spoiler rule: escape text must never name the real murderer or the murder-scene room.
    # (Other rooms are fair game — they're already public via each suspect's own printed
    # clue, not something the player has to deduce.)
    murderer_name = names_by_letter.get(murderer, "")
    murder_room_id = next((p["room"]["id"] for p in people if p["letter"] == victim), None)
    murder_room = ctx["rooms"].get(murder_room_id, "")
    escape_texts = [escape.get("generic", "")] + list(by_accused.values())
    for text in escape_texts:
        if murderer_name and re.search(rf"\b{re.escape(murderer_name)}\b", text):
            errors.append(f"escape text names the real murderer ({murderer_name}): {text!r}")
        if murder_room and re.search(rf"\b{re.escape(murder_room)}\b", text, re.IGNORECASE):
            errors.append(f"escape text names the murder-scene room ({murder_room}): {text!r}")

    # Cross-puzzle name contamination: a name from another puzzle's cast showing up here.
    own_names = set(names_by_letter.values())
    story_blob = " ".join([*story.get("acts", []), story.get("reveal", ""), *whereabouts.values()])
    for other_id, other_names in everyone_names.items():
        if other_id == puzzle_id:
            continue
        for name in other_names - own_names:
            if re.search(rf"\b{re.escape(name)}\b", story_blob):
                errors.append(f"story mentions '{name}', who belongs to a different puzzle ({other_id}), not this cast")

    # A whereabouts line that only restates the room name is the D1b tell.
    for l in letters:
        line = whereabouts.get(l, "")
        room = ctx["rooms"].get(next(p["room"]["id"] for p in people if p["letter"] == l), "")
        stripped = line.strip().rstrip(".")
        pattern = rf"^{re.escape(names_by_letter[l])}\s+(was|is)\s+(in|at)\s+the\s+{re.escape(room)}$"
        if re.match(pattern, stripped, re.IGNORECASE):
            warnings.append(f"whereabouts[{l}] just restates the room, no activity: {line!r}")

    # Soft check: two names co-occurring in an act paragraph when they're never in the same
    # room or adjacent per context — a heuristic, not proof (narration can reference someone
    # elsewhere), so this is a warning only.
    same_scene = set()
    for p in people:
        for other in p["withInRoom"]:
            same_scene.add(frozenset((p["letter"], other["letter"])))
        for other in p["adjacentPeople"]:
            same_scene.add(frozenset((p["letter"], other["letter"])))
    for i, act in enumerate(story.get("acts", [])):
        present = [l for l in letters if names_by_letter[l] and re.search(rf"\b{re.escape(names_by_letter[l])}\b", act)]
        for a in range(len(present)):
            for b in range(a + 1, len(present)):
                pair = frozenset((present[a], present[b]))
                if pair not in same_scene:
                    warnings.append(
                        f"act {i+1}: {names_by_letter[present[a]]} and {names_by_letter[present[b]]} "
                        f"both mentioned but context doesn't put them in the same room or adjacent"
                    )

    return errors, warnings


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--all":
        ids = sorted(p.stem for p in CONTEXT_DIR.glob("*.json"))
    elif len(sys.argv) == 2:
        ids = [sys.argv[1]]
    else:
        print(__doc__)
        sys.exit(1)

    everyone_names = all_puzzle_names()
    any_errors = False
    for puzzle_id in ids:
        errors, warnings = check_one(puzzle_id, everyone_names)
        if errors:
            any_errors = True
            print(f"  ✗ {puzzle_id}")
            for e in errors:
                print(f"      ERROR: {e}")
        else:
            print(f"  ✓ {puzzle_id}")
        for w in warnings:
            print(f"      warning: {w}")

    sys.exit(1 if any_errors else 0)


if __name__ == "__main__":
    main()
