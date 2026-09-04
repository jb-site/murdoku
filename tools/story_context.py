#!/usr/bin/env python3
"""Build story_context/<id>.json from puzzles/<id>.json + puzzles/solutions/<id>.json.

This does every piece of *spatial* reasoning (who shares a room, who's next to whom,
what someone is on/beside) in plain code, so the model that later drafts a story from
this file never has to re-derive geometry from a roomGrid and a coordinate list — see
PLAN-solve-and-story.md's Phase D1 for why that's the failure mode this file exists to
prevent.

Usage:
    tools/story_context.py <puzzle-id>       # one puzzle
    tools/story_context.py --all             # every puzzle with a solution file
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUZZLES_DIR = ROOT / "puzzles"
SOLUTIONS_DIR = PUZZLES_DIR / "solutions"
RULES_DIR = PUZZLES_DIR / "rules"
OUT_DIR = ROOT / "story_context"

# Natural-language phrasing for what it means to be placed on an occupiable object's
# cell. Anything occupiable but not listed here falls back to a generic "on/at the X".
ON_PHRASES = {
    None: "on open floor",
    "bed": "on the bed",
    "chair": "sitting in a chair",
    "oilslick": "standing in an oil slick",
    "car": "in the car",
    "path": "standing on the path",
    "carpet": "standing on the carpet",
    "boat": "in the boat",
    "framedpainting": "standing in front of a framed painting",
    "mudpuddle": "standing in a mud puddle",
    "house": "inside the house",
    "sand": "standing in the sand",
    "tee": "standing on the tee",
    "flag": "standing by the flag",
    "cart": "in the golf cart",
}

OBJECT_LABELS = {
    "bed": "bed", "chair": "chair", "tv": "TV", "shelf": "shelf", "table": "table",
    "plant": "plant", "oilslick": "oil slick", "car": "car", "tree": "tree",
    "bonsai": "bonsai", "cactus": "cactus", "lilypad": "lily pad", "flower": "flower",
    "shrub": "shrub", "path": "path", "bear": "bear", "boulder": "boulder",
    "carpet": "carpet", "boat": "boat", "box": "box", "crate": "crate", "safe": "safe",
    "statue": "statue", "easel": "easel", "framedpainting": "framed painting",
    "water": "water", "lion": "lion", "penguin": "penguin", "crocodile": "crocodile",
    "shark": "shark", "elephant": "elephant", "mudpuddle": "mud puddle",
    "barrel": "barrel", "rubble": "rubble", "catapult": "catapult", "camera": "camera",
    "house": "house", "sand": "sand", "tee": "tee", "flag": "flag", "cart": "golf cart",
}

DIRS = [(-1, 0, "north"), (1, 0, "south"), (0, -1, "west"), (0, 1, "east")]


def on_phrase(obj_type):
    if obj_type in ON_PHRASES:
        return ON_PHRASES[obj_type]
    label = OBJECT_LABELS.get(obj_type, obj_type)
    return f"on/at the {label}"


def on_phrase_combined(obj_type, ground_type):
    """An object phrase wins (it's the more specific fact); ground alone still says where
    someone stands; both present reads as "<object phrase>, on the <ground label>"."""
    if obj_type:
        base = on_phrase(obj_type)
        if ground_type:
            return f"{base}, on the {object_label(ground_type)}"
        return base
    if ground_type:
        return on_phrase(ground_type)
    return on_phrase(None)


def object_label(obj_type):
    return OBJECT_LABELS.get(obj_type, obj_type)


def build_object_at_map(puzzle):
    """cell "r,c" -> object type, for every cell covered by an object."""
    obj_at = {}
    for obj in puzzle.get("objects", []):
        for (r, c) in obj["cells"]:
            obj_at[f"{r},{c}"] = obj["type"]
    return obj_at


def extra_rules_text(puzzle):
    """Flattened verbatim text of every puzzles/rules/<id>.json this puzzle references,
    in "rulesets" array order — same flat-list-of-strings shape as generalClues, since a
    story author needs to read these as part of the puzzle's premise, not decode a nested
    per-ruleset structure. A referenced ruleset with no file is skipped with a warning
    rather than raising: reference integrity is tools/check_rules.py's job, not this
    tool's — a broken reference here shouldn't block drafting a story for every OTHER
    puzzle in a --all run."""
    lines = []
    for ruleset_id in puzzle.get("rulesets", []) or []:
        path = RULES_DIR / f"{ruleset_id}.json"
        if not path.exists():
            print(f"  ! {puzzle.get('id', '?')}: no puzzles/rules/{ruleset_id}.json "
                  f"(run tools/check_rules.py to audit references)")
            continue
        ruleset = json.loads(path.read_text())
        lines.extend(ruleset.get("text", []))
    return lines


def build_ground_at_map(puzzle):
    """cell "r,c" -> ground (floor/terrain) type, for every cell covered by ground."""
    ground_at = {}
    for obj in puzzle.get("ground", []):
        for (r, c) in obj["cells"]:
            ground_at[f"{r},{c}"] = obj["type"]
    return ground_at


def ascii_map(puzzle, obj_at, ground_at, occupant_at):
    rows, cols = puzzle["rows"], puzzle["cols"]
    room_grid = puzzle["roomGrid"]

    # Rooms are often named alike (hole1..hole8), so a bare first-letter initial collides
    # constantly. Assign short, unique 1-3 char codes instead, and pad every token in the
    # map to a shared width so columns still line up regardless of code length.
    import re
    room_code = {}
    used = set()
    for room_id in puzzle.get("rooms", {}):
        m = re.match(r"^([a-zA-Z]+?)(\d+)$", room_id)
        if m:
            # "hole4" -> "H4": trailing digits are meaningful (which hole), so preserve
            # them rather than assigning an arbitrary disambiguator suffix.
            cand = f"{m.group(1)[0].upper()}{m.group(2)}"
        else:
            cand = room_id[0].upper()
        base = cand
        i = 1
        while cand in used:
            cand = f"{base}x{i}"
            i += 1
        used.add(cand)
        room_code[room_id] = cand

    grid_tokens = [[None] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            room_id = room_grid[r][c]
            if room_id is None:
                grid_tokens[r][c] = "#"
                continue
            key = f"{r},{c}"
            obj = obj_at.get(key)
            oc = obj[0].lower() if obj else "."
            ground = ground_at.get(key)
            gc = ground[0].upper() if ground else "."
            occ = occupant_at.get(key, ".")
            grid_tokens[r][c] = f"{room_code[room_id]}{oc}{gc}{occ}"

    width = max(len(tok) for row in grid_tokens for tok in row)
    lines = [" ".join(tok.ljust(width) for tok in row) for row in grid_tokens]
    return "\n".join(lines), room_code


def build_context(puzzle_id):
    puzzle = json.loads((PUZZLES_DIR / f"{puzzle_id}.json").read_text())
    solution = json.loads((SOLUTIONS_DIR / f"{puzzle_id}.json").read_text())

    rows, cols = puzzle["rows"], puzzle["cols"]
    room_grid = puzzle["roomGrid"]
    names = puzzle.get("names", {})
    placements = solution["placements"]
    murderer = solution["murderer"]

    obj_at = build_object_at_map(puzzle)
    ground_at = build_ground_at_map(puzzle)
    occupant_at = {f"{r},{c}": letter for letter, (r, c) in placements.items()}
    cell_of = {letter: tuple(rc) for letter, rc in placements.items()}
    room_of = {letter: room_grid[r][c] for letter, (r, c) in cell_of.items()}

    clues_by_suspect = {}
    general_clues = []
    for clue in puzzle.get("clues", []):
        if clue.get("suspect"):
            clues_by_suspect.setdefault(clue["suspect"], []).append(clue["text"])
        else:
            general_clues.append(clue["text"])

    amap, room_initial = ascii_map(puzzle, obj_at, ground_at, occupant_at)

    people = []
    for letter in puzzle["suspects"]:
        r, c = cell_of[letter]
        room_id = room_of[letter]
        own_obj = obj_at.get(f"{r},{c}")
        own_ground = ground_at.get(f"{r},{c}")

        beside_types = set()
        adjacent_people = []
        for dr, dc, direction in DIRS:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols):
                continue
            if room_grid[nr][nc] is None:
                continue
            key = f"{nr},{nc}"
            if key in obj_at:
                beside_types.add(obj_at[key])
            if key in ground_at:
                beside_types.add(ground_at[key])
            if key in occupant_at:
                adjacent_people.append({
                    "letter": occupant_at[key],
                    "name": names.get(occupant_at[key], occupant_at[key]),
                    "direction": direction,
                })

        with_in_room = [
            {"letter": other, "name": names.get(other, other)}
            for other in puzzle["suspects"]
            if other != letter and room_of.get(other) == room_id
        ]

        role = "victim" if letter == "V" else ("murderer" if letter == murderer else "suspect")

        entry = {
            "letter": letter,
            "name": names.get(letter, letter),
            "role": role,
            "position": [r, c],
            "room": {"id": room_id, "name": puzzle["rooms"].get(room_id, {}).get("name", room_id)},
            "onObjectType": own_obj,
            "onGroundType": own_ground,
            "on": on_phrase_combined(own_obj, own_ground),
            "besideObjectTypes": sorted(object_label(t) for t in beside_types),
            "withInRoom": with_in_room,
            "adjacentPeople": adjacent_people,
            "clues": clues_by_suspect.get(letter, []),
        }

        if role == "murderer":
            nearby = set(beside_types)
            if own_obj:
                nearby.add(own_obj)
            if own_ground:
                nearby.add(own_ground)
            entry["nearbyObjectTypesForMethod"] = sorted(object_label(t) for t in nearby)

        people.append(entry)

    ctx = {
        "id": puzzle["id"],
        "title": puzzle["title"],
        "difficulty": puzzle.get("difficulty"),
        "rooms": {rid: r.get("name", rid) for rid, r in puzzle.get("rooms", {}).items()},
        "generalClues": general_clues,
        "victim": "V",
        "murderer": murderer,
        "asciiMapLegend": {
            "format": "each cell is <room-code><object-code-or-.><ground-code-or-.><occupant-letter-or-.>, space-padded to align columns; # = void (not part of the board)",
            "roomCodes": room_initial,
            "note": "object-code is the object type's first letter lowercase, ground-code is the ground type's first letter uppercase (e.g. a statue on a carpet is s + C); see people[].onObjectType / onGroundType / besideObjectTypes for full type names instead of decoding the code",
        },
        "asciiMap": amap,
        "people": people,
        "hasPortraits": bool(puzzle.get("art", {}).get("portraits")),
        "sourceFile": puzzle.get("sourceFile"),
    }

    # Only added when the puzzle actually references a ruleset, so a puzzle with none
    # (every puzzle as of this writing) gets byte-identical output to before this field
    # existed — same "conditionally included" convention as exportPuzzleJSON()'s ground/
    # customObjectTypes/rulesets keys in app.js.
    extra_rules = extra_rules_text(puzzle)
    if extra_rules:
        ctx["extraRules"] = extra_rules

    return ctx


def main():
    OUT_DIR.mkdir(exist_ok=True)
    if len(sys.argv) == 2 and sys.argv[1] == "--all":
        ids = sorted(p.stem for p in SOLUTIONS_DIR.glob("*.json"))
    elif len(sys.argv) == 2:
        ids = [sys.argv[1]]
    else:
        print(__doc__)
        sys.exit(1)

    for puzzle_id in ids:
        ctx = build_context(puzzle_id)
        out_path = OUT_DIR / f"{puzzle_id}.json"
        out_path.write_text(json.dumps(ctx, indent=1) + "\n")
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
