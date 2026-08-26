#!/usr/bin/env python3
"""Extract each puzzle's official solution from its solution PDF, without vision.

Two properties of these PDFs make this deterministic:

1. The grid letters are real text with coordinates (`pdftotext -bbox`), not artwork.
2. A Murdoku solution is a permutation — exactly one person per row and per column. So
   when a puzzle has as many suspects as it has columns, the column a letter belongs to is
   simply its rank when the letters are sorted by x. Same for rows. No grid geometry, no
   pixel measuring, and — importantly — no reliance on the printed R#/C# labels, which are
   demonstrably wrong on some pages (netflix-and-kill prints C1..C9 under a 6-column grid).

The one hard part is telling the *final* grid's letters apart from the step-by-step grids
and the prose. Solved by searching every contiguous window of letters sorted by glyph
height for one whose letter multiset is exactly the cast, then confirming the candidate
against facts read out of the solution text: the murderer's letter, and the fact that the
murderer is the only person sharing the victim's room.

Usage: python3 tools/extract_solutions.py [id ...]
"""

import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUZZLES = ROOT / "puzzles"
SOLUTIONS = PUZZLES / "solutions"

WORD_RE = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([A-Z])</word>')
# The murderer is stated twice in the step text — once as a letter ("alone with B", possibly
# with a room clause in between) and once as a name ("Barbara is the murderer!"). Both are
# parsed and required to agree, which makes this the most trustworthy field on the page.
MURDERER_LETTER_RE = re.compile(r"alone (?:[^.!?]*?)with ([A-Z])\b")
MURDERER_NAME_RE = re.compile(r"([A-Z][a-z]+) is the murderer")
BLOCKING = {"tv", "shelf", "table", "plant", "tree", "bonsai", "cactus",
            "lilypad", "flower", "shrub", "bear", "boulder"}


def pdf_letters(pdf):
    xml = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"],
                         capture_output=True, text=True).stdout
    return [{"x": (float(a) + float(c)) / 2, "y": (float(b) + float(d)) / 2,
             "h": float(d) - float(b), "ch": e}
            for a, b, c, d, e in WORD_RE.findall(xml)]


def pdf_text(pdf):
    raw = subprocess.run(["pdftotext", str(pdf), "-"], capture_output=True, text=True).stdout
    return re.sub(r"\s+", " ", raw)


def read_murderer(text, puz):
    """Returns (letter, note). The letter is only trusted when the name agrees with it."""
    letter = None
    m = MURDERER_LETTER_RE.search(text)
    if m:
        letter = m.group(1)
    name = None
    n = MURDERER_NAME_RE.search(text)
    if n:
        name = n.group(1)
        by_name = {v.replace(" (victim)", "").strip().lower(): k for k, v in puz["names"].items()}
        from_name = by_name.get(name.lower())
        if from_name and letter and from_name != letter:
            return letter, f"letter says {letter}, name says {name} ({from_name}) — disagree"
        if from_name and not letter:
            return from_name, None
    return letter, None


def candidate_windows(letters, suspects):
    """Every contiguous run of height-sorted letters whose multiset is exactly the cast."""
    ws = sorted(letters, key=lambda w: w["h"])
    want = sorted(suspects)
    n = len(want)
    out = []
    for i in range(len(ws) - n + 1):
        window = ws[i:i + n]
        if sorted(w["ch"] for w in window) == want:
            out.append(window)
    return out


def placements_from_window(window, puz):
    """Rank-order the letters into cells. Returns None if an axis isn't rank-determined."""
    rows, cols = puz["rows"], puz["cols"]
    n = len(window)
    if n != rows or n != cols:
        return None
    by_y = sorted(window, key=lambda w: w["y"])
    by_x = sorted(window, key=lambda w: w["x"])
    row_of = {w["ch"]: i for i, w in enumerate(by_y)}
    col_of = {w["ch"]: i for i, w in enumerate(by_x)}
    return {ch: [row_of[ch], col_of[ch]] for ch in row_of}


def fit_free_axis(window, puz, known_axis):
    """One axis is rank-determined, the other isn't (more lines than suspects).

    Cells are square, so the pitch measured on the determined axis is the pitch on the free
    one too. That leaves a single unknown — where the grid's edge sits — so try every whole-
    cell offset and keep the one that lands all the letters on distinct, in-range lines.
    Ambiguity (or none fitting) returns None and the puzzle falls back to reading by eye.
    """
    known_key, free_key = ("x", "y") if known_axis == "col" else ("y", "x")
    free_n = puz["rows"] if known_axis == "col" else puz["cols"]

    ranked = sorted(window, key=lambda w: w[known_key])
    spans = [ranked[i + 1][known_key] - ranked[i][known_key] for i in range(len(ranked) - 1)]
    if not spans:
        return None
    pitch = sum(spans) / len(spans)  # one line apart each, since it's a full permutation

    vals = [w[free_key] for w in window]
    base = min(vals)
    fits = []
    for k in range(free_n):
        idx = [round((v - base) / pitch) + k for v in vals]
        if len(set(idx)) == len(idx) and all(0 <= i < free_n for i in idx):
            fits.append(idx)
    if len(fits) != 1:
        return None
    return {w["ch"]: i for w, i in zip(window, fits[0])}


def plausible(placements, puz, murderer):
    """Cheap structural + narrative checks, used to pick between candidate windows."""
    room_grid = puz["roomGrid"]
    blocked = {(r, c) for o in puz.get("objects", []) if o["type"] in BLOCKING for r, c in o["cells"]}
    for letter, (r, c) in placements.items():
        if room_grid[r][c] is None or (r, c) in blocked:
            return False
    v = placements.get("V")
    if not v:
        return False
    v_room = room_grid[v[0]][v[1]]
    with_victim = [l for l, (r, c) in placements.items() if l != "V" and room_grid[r][c] == v_room]
    if len(with_victim) != 1:
        return False
    return murderer is None or with_victim[0] == murderer


def extract(puzzle_id):
    puz = json.loads((PUZZLES / f"{puzzle_id}.json").read_text())
    pdf = PUZZLES / "source" / f"{puzzle_id}-solution.pdf"
    if not pdf.exists():
        return None, f"no solution PDF at {pdf.name}"

    text = pdf_text(pdf)
    murderer, note = read_murderer(text, puz)
    if note:
        return None, note

    letters = pdf_letters(pdf)
    windows = candidate_windows(letters, puz["suspects"])
    if not windows:
        return None, "couldn't isolate a set of letters matching the cast"

    rows, cols = puz["rows"], puz["cols"]
    n = len(puz["suspects"])
    good = []
    for w in windows:
        p = placements_from_window(w, puz)
        if p is None and n == cols and n != rows:
            fitted = fit_free_axis(w, puz, "col")
            if fitted:
                col_of = {x["ch"]: i for i, x in enumerate(sorted(w, key=lambda z: z["x"]))}
                p = {ch: [fitted[ch], col_of[ch]] for ch in col_of}
        elif p is None and n == rows and n != cols:
            fitted = fit_free_axis(w, puz, "row")
            if fitted:
                row_of = {x["ch"]: i for i, x in enumerate(sorted(w, key=lambda z: z["y"]))}
                p = {ch: [row_of[ch], fitted[ch]] for ch in row_of}
        if p and plausible(p, puz, murderer) and p not in [g[0] for g in good]:
            good.append((p, w))

    if not good:
        if len(puz["suspects"]) not in (rows, cols):
            return None, (f"{rows}x{cols} with {len(puz['suspects'])} suspects — not rank-determined "
                          f"on both axes, needs reading by eye")
        return None, f"{len(windows)} candidate letter-set(s), none structurally plausible"
    if len({json.dumps(p, sort_keys=True) for p, _ in good}) > 1:
        return None, f"{len(good)} different plausible readings — ambiguous, needs reading by eye"

    placements, window = good[0]
    return {
        "puzzleId": puzzle_id,
        "sourceFile": f"source/{puzzle_id}-solution.pdf",
        "derivedBy": "pdf-text-extraction",
        "placements": {k: placements[k] for k in puz["suspects"]},
        "murderer": murderer,
    }, None


def main():
    ids = sys.argv[1:] or [e["id"] for e in json.loads((PUZZLES / "index.json").read_text())]
    failures = []
    for pid in ids:
        sol, err = extract(pid)
        if err:
            print(f"  ✗ {pid}: {err}")
            failures.append(pid)
            continue
        out = SOLUTIONS / f"{pid}.json"
        out.write_text(json.dumps(sol, indent=2) + "\n")
        print(f"  ✓ {pid}: murderer {sol['murderer']}, wrote {out.name}")
    if failures:
        print(f"\n{len(failures)} need reading by eye: {', '.join(failures)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
