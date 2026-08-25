#!/usr/bin/env python3
"""Extract portrait (and, eventually, board) artwork from a puzzle's source PDF.

See PLAN-artwork.md for the full design. This is a one-time authoring tool, not
runtime code, so the portrait detection is deliberately a starting point: the
contact sheet is meant to be looked at, not trusted blindly.

Usage:
    python3 tools/extract_art.py <puzzle-id> --portraits --letters A,B,C,D,...
    python3 tools/extract_art.py <puzzle-id> --portraits --letters A,B,...  \\
        --extra-box V=920,1090,1106,1316

The rendered page is at 200dpi by default (--dpi). Detected/extra boxes are
sorted into reading order (row-clusters top-to-bottom, then left-to-right
within a row) and matched positionally against --letters. Inspect
puzzles/art/<id>/contact-sheet.png before trusting the mapping.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "puzzles" / "source"
ART_DIR = ROOT / "puzzles" / "art"
PUZZLES_DIR = ROOT / "puzzles"

PORTRAIT_MIN_AREA = 20000
PORTRAIT_ASPECT_RANGE = (0.55, 1.05)  # width / height
ROW_CLUSTER_TOLERANCE_PX = 60  # boxes within this many px of y0 are "the same row"
PORTRAIT_TARGET_W = 400


def render_page(puzzle_id, dpi):
    pdf = SOURCE_DIR / f"{puzzle_id}-color.pdf"
    if not pdf.exists():
        sys.exit(f"No source PDF at {pdf}")
    out_prefix = ART_DIR / puzzle_id / "_page"
    out_prefix.parent.mkdir(parents=True, exist_ok=True)
    stale = out_prefix.parent / "_page.png"
    if stale.exists():
        stale.unlink()
    subprocess.run(
        ["pdftoppm", "-png", "-r", str(dpi), str(pdf), str(out_prefix)],
        check=True, capture_output=True, text=True,
    )
    pages = sorted(out_prefix.parent.glob("_page*.png"))
    if not pages:
        sys.exit("pdftoppm produced no output")
    page = pages[0]
    dest = out_prefix.parent / "_page.png"
    page.rename(dest)
    for extra in pages[1:]:
        extra.unlink()
    return dest


def detect_portrait_boxes(arr):
    """Near-white polaroid cards, by area/aspect. Misses non-white (e.g. a
    highlighted victim card) — use --extra-box for those."""
    mask = np.all(arr > 230, axis=2)
    labels, n = ndimage.label(mask)
    boxes = []
    for sl in ndimage.find_objects(labels):
        if sl is None:
            continue
        y0, y1 = sl[0].start, sl[0].stop
        x0, x1 = sl[1].start, sl[1].stop
        area = (y1 - y0) * (x1 - x0)
        if area < PORTRAIT_MIN_AREA:
            continue
        ratio = (x1 - x0) / (y1 - y0)
        if not (PORTRAIT_ASPECT_RANGE[0] <= ratio <= PORTRAIT_ASPECT_RANGE[1]):
            continue
        boxes.append((x0, y0, x1, y1))
    return boxes


def parse_box(spec):
    x0, y0, x1, y1 = (int(v) for v in spec.split(","))
    return (x0, y0, x1, y1)


def sort_reading_order(boxes):
    """Cluster into rows by y0, then sort left-to-right within each row."""
    remaining = sorted(boxes, key=lambda b: b[1])
    rows = []
    for b in remaining:
        placed = False
        for row in rows:
            if abs(row[0][1] - b[1]) <= ROW_CLUSTER_TOLERANCE_PX:
                row.append(b)
                placed = True
                break
        if not placed:
            rows.append([b])
    rows.sort(key=lambda row: min(b[1] for b in row))
    ordered = []
    for row in rows:
        row.sort(key=lambda b: b[0])
        ordered.extend(row)
    return ordered


def pad_box(box, pad, img_w, img_h):
    """Expand box by `pad` fraction of its own size on each axis, clamped to
    the image. Returns (expanded_px_box, normalized_crop_of_original_within_it)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    pad_w, pad_h = w * pad, h * pad
    ex0 = max(0, x0 - pad_w)
    ey0 = max(0, y0 - pad_h)
    ex1 = min(img_w, x1 + pad_w)
    ey1 = min(img_h, y1 + pad_h)
    ew, eh = ex1 - ex0, ey1 - ey0
    crop = {
        "x": round((x0 - ex0) / ew, 4),
        "y": round((y0 - ey0) / eh, 4),
        "w": round(w / ew, 4),
        "h": round(h / eh, 4),
    }
    return (ex0, ey0, ex1, ey1), crop


def write_contact_sheet(img, boxes, letters, dest):
    sheet = img.copy()
    draw = ImageDraw.Draw(sheet)
    for i, box in enumerate(boxes):
        draw.rectangle(box, outline=(255, 0, 0), width=4)
        label = letters[i] if letters and i < len(letters) else str(i)
        draw.text((box[0] + 6, box[1] + 6), label, fill=(255, 0, 0))
    sheet.save(dest)


def load_puzzle_json(puzzle_id):
    path = PUZZLES_DIR / f"{puzzle_id}.json"
    with open(path) as f:
        return path, json.load(f)


def patch_art_block(path, data, key, value):
    """Text-level splice of an `art.<key>` block onto the end of the file, so
    puzzles authored with compact array formatting don't get fully
    reformatted by a round-trip through json.dump (huge, noisy diffs)."""
    art = data.get("art", {})
    art[key] = value
    art_json = json.dumps(art, indent=2)
    art_json = "\n".join("  " + line if line.strip() else line for line in art_json.splitlines())

    raw = path.read_text()
    if '"art":' in raw:
        # Replace the whole existing art block (from `"art":` to its matching close brace).
        start = raw.index('"art":')
        depth = 0
        i = raw.index("{", start)
        for j in range(i, len(raw)):
            if raw[j] == "{":
                depth += 1
            elif raw[j] == "}":
                depth -= 1
                if depth == 0:
                    end = j + 1
                    break
        prefix = raw[:start]
        suffix = raw[end:]
        new_raw = f'{prefix}"art": {art_json.strip()}{suffix}'
    else:
        stripped = raw.rstrip()
        assert stripped.endswith("}")
        body = stripped[:-1].rstrip()
        assert body.endswith(",") is False
        new_raw = f'{body},\n  "art": {art_json.strip()}\n}}\n'

    path.write_text(new_raw)
    data["art"] = art
    return data


def do_portraits(args, page_path):
    puzzle_path, data = load_puzzle_json(args.puzzle_id)
    suspects = data["suspects"]

    img = Image.open(page_path).convert("RGB")
    arr = np.array(img)
    img_h, img_w = arr.shape[:2]

    boxes = detect_portrait_boxes(arr)
    for spec in args.extra_box:
        letter, coords = spec.split("=", 1)
        boxes.append(parse_box(coords))

    boxes = sort_reading_order(boxes)

    if not args.letters:
        write_contact_sheet(img, boxes, None, ART_DIR / args.puzzle_id / "contact-sheet.png")
        print(f"Detected {len(boxes)} boxes (puzzle has {len(suspects)} suspects). "
              f"Inspect puzzles/art/{args.puzzle_id}/contact-sheet.png, then rerun with "
              f"--letters matching reading order (top-to-bottom, left-to-right).")
        for i, b in enumerate(boxes):
            print(f"  [{i}] {b}")
        return

    letters = args.letters.split(",")
    if len(letters) != len(boxes):
        sys.exit(f"--letters has {len(letters)} entries but {len(boxes)} boxes were found "
                  f"(use --extra-box for missed cards, e.g. highlighted victim). Boxes: {boxes}")

    write_contact_sheet(img, boxes, letters, ART_DIR / args.puzzle_id / "contact-sheet.png")

    out_dir = ART_DIR / args.puzzle_id
    out_dir.mkdir(parents=True, exist_ok=True)
    portraits = {}
    for letter, box in zip(letters, boxes):
        expanded, crop = pad_box(box, args.pad, img_w, img_h)
        crop_img = img.crop(tuple(round(v) for v in expanded))
        scale = PORTRAIT_TARGET_W / crop_img.width
        crop_img = crop_img.resize(
            (PORTRAIT_TARGET_W, round(crop_img.height * scale)), Image.LANCZOS
        )
        dest = out_dir / f"{letter}.png"
        crop_img.save(dest)
        entry = {"src": f"art/{args.puzzle_id}/{letter}.png"}
        if crop != {"x": 0, "y": 0, "w": 1, "h": 1}:
            entry["crop"] = crop
        portraits[letter] = entry
        print(f"  {letter} -> {dest}")

    patch_art_block(puzzle_path, data, "portraits", portraits)
    print(f"Patched art.portraits into {puzzle_path}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("puzzle_id")
    p.add_argument("--board", action="store_true", help="not yet implemented")
    p.add_argument("--portraits", action="store_true")
    p.add_argument("--bbox", help="x0,y0,x1,y1 board bbox override (--board only)")
    p.add_argument("--pad", type=float, default=0.15)
    p.add_argument("--dpi", type=int, default=200)
    p.add_argument("--letters", help="comma-separated letters in reading order, e.g. A,B,C,D,...,V")
    p.add_argument("--extra-box", action="append", default=[],
                    help="LETTER=x0,y0,x1,y1 for a card the auto-detector missed (repeatable)")
    args = p.parse_args()

    if args.board:
        sys.exit("--board is not implemented yet (see PLAN-artwork.md step 3)")
    if not args.portraits:
        sys.exit("Nothing to do: pass --portraits (or --board, once implemented)")

    page_path = render_page(args.puzzle_id, args.dpi)
    do_portraits(args, page_path)


if __name__ == "__main__":
    main()
