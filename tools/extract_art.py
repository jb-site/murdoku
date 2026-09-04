#!/usr/bin/env python3
"""Extract portrait/board/legend artwork from a puzzle's source PDF.

See PLAN-artwork.md for the full design. This is a one-time authoring tool, not
runtime code, so the portrait detection is deliberately a starting point: the
contact sheet is meant to be looked at, not trusted blindly.

Usage:
    python3 tools/extract_art.py <puzzle-id> --portraits --letters A,B,C,D,...
    python3 tools/extract_art.py <puzzle-id> --portraits --letters A,B,...  \\
        --extra-box V=920,1090,1106,1316
    python3 tools/extract_art.py <puzzle-id> --board
    python3 tools/extract_art.py <puzzle-id> --legend
        # -> writes puzzles/art/<id>/legend-guide.png, a labelled coordinate
        # overlay; read the legend's bbox off it, then:
    python3 tools/extract_art.py <puzzle-id> --legend --legend-bbox x0,y0,x1,y1

For a photo-sourced puzzle, run tools/photo_prep.py --page-quad first, then
pass --from-image to every call above (uses puzzles/art/<id>/_page.png
instead of shelling out to pdftoppm); --white-threshold/--dark-threshold
override the portrait/board detectors' thresholds for print stock that
doesn't photograph as bright/dark as a flat PDF scan.

The rendered page is at 200dpi by default (--dpi, PDF path only). Detected/extra boxes are
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
PORTRAIT_WHITE_THRESHOLD = 230  # grayscale value above which a pixel counts as "white card"
PORTRAIT_ASPECT_RANGE = (0.55, 1.05)  # width / height
ROW_CLUSTER_TOLERANCE_PX = 60  # boxes within this many px of y0 are "the same row"
PORTRAIT_TARGET_W = 400

BOARD_DARK_THRESHOLD = 128  # grayscale value below which a pixel counts as "dark" (grid line)
BOARD_SEARCH_X_FRACTION = 0.45  # only look right of this fraction of page width for the board
BOARD_RUN_FRACTION = 0.3  # a row/col counts as a border line if its longest dark run exceeds
                           # this fraction of the search region's width/height
BOARD_TARGET_CELL_W = 80  # downscaled board.png is roughly cols * this many px wide
BOARD_ASPECT_TOLERANCE = 0.03  # flag detected cell width/height ratios more than this off square

LEGEND_TARGET_W = 1200   # downscaled legend.png width in px
GUIDE_W = 1100           # width of the coordinate-guide render


def render_page(puzzle_id, dpi, from_image=False):
    if from_image:
        dest = ART_DIR / puzzle_id / "_page.png"
        if not dest.exists():
            sys.exit("Run tools/photo_prep.py --page-quad first")
        return dest

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


def detect_portrait_boxes(arr, white_threshold=PORTRAIT_WHITE_THRESHOLD):
    """Near-white polaroid cards, by area/aspect. Misses non-white (e.g. a
    highlighted victim card) — use --extra-box for those. `white_threshold`
    is overridable (--white-threshold) since photographed print stock varies
    book to book; the PDF path's default of 230 is untouched."""
    mask = np.all(arr > white_threshold, axis=2)
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


def _max_run_length_1d(mask):
    """Longest run of True values in a 1-D boolean array."""
    if not mask.any():
        return 0
    padded = np.concatenate(([0], mask.astype(int), [0]))
    diff = np.diff(padded)
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]
    return int((ends - starts).max())


def detect_board_bbox(arr, dark_threshold=BOARD_DARK_THRESHOLD):
    """Auto-detect the board's grid bbox: threshold dark pixels (grid lines), then
    find the outermost rows/cols in the right ~55% of the page whose longest
    contiguous dark run is long enough to be a border line. Exact on bordered
    grids (see PLAN-artwork.md); use --bbox to override when it isn't.
    `dark_threshold` is overridable (--dark-threshold) since photographed
    print stock varies book to book; the PDF path's default of 128 is
    untouched."""
    img_h, img_w = arr.shape[:2]
    gray = arr.mean(axis=2)
    dark = gray < dark_threshold

    x_start = int(img_w * BOARD_SEARCH_X_FRACTION)
    region = dark[:, x_start:]
    region_w = region.shape[1]

    row_runs = np.array([_max_run_length_1d(region[y]) for y in range(img_h)])
    candidate_rows = np.where(row_runs > region_w * BOARD_RUN_FRACTION)[0]
    if len(candidate_rows) == 0:
        sys.exit("Board bbox auto-detection found no horizontal border lines; use --bbox")
    y0, y1 = int(candidate_rows.min()), int(candidate_rows.max()) + 1

    col_runs = np.array([_max_run_length_1d(region[:, x]) for x in range(region_w)])
    candidate_cols = np.where(col_runs > img_h * BOARD_RUN_FRACTION)[0]
    if len(candidate_cols) == 0:
        sys.exit("Board bbox auto-detection found no vertical border lines; use --bbox")
    x0, x1 = int(candidate_cols.min()) + x_start, int(candidate_cols.max()) + x_start + 1

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


def write_legend_guide(img, dest):
    """Page render downscaled to GUIDE_W, overlaid with gridlines every 100px
    IN ORIGINAL PAGE PIXEL SPACE, each labelled with its original coordinate —
    so a bbox can be read straight off the image with no scaling arithmetic."""
    scale = GUIDE_W / img.width
    guide = img.resize((GUIDE_W, round(img.height * scale)), Image.LANCZOS)
    draw = ImageDraw.Draw(guide)
    for x in range(0, img.width, 100):
        gx = x * scale
        draw.line([(gx, 0), (gx, guide.height)], fill=(255, 0, 0), width=1)
        draw.text((gx + 2, 2), str(x), fill=(255, 0, 0))
    for y in range(0, img.height, 100):
        gy = y * scale
        draw.line([(0, gy), (guide.width, gy)], fill=(255, 0, 0), width=1)
        draw.text((2, gy + 2), str(y), fill=(255, 0, 0))
    guide.save(dest)


def load_puzzle_json(puzzle_id):
    path = PUZZLES_DIR / f"{puzzle_id}.json"
    with open(path) as f:
        return path, json.load(f)


def patch_art_block(path, data, updates):
    """Text-level splice of the `art` block onto the end of the file, so
    puzzles authored with compact array formatting don't get fully
    reformatted by a round-trip through json.dump (huge, noisy diffs).
    `updates` is a dict merged into the existing `art` object (one or more
    keys at once, e.g. board + boardCrop + calibratedFor)."""
    art = data.get("art", {})
    art.update(updates)
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

    boxes = detect_portrait_boxes(arr, white_threshold=args.white_threshold)
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

    patch_art_block(puzzle_path, data, {"portraits": portraits})
    print(f"Patched art.portraits into {puzzle_path}")


def do_board(args, page_path):
    puzzle_path, data = load_puzzle_json(args.puzzle_id)
    rows, cols = data["rows"], data["cols"]

    img = Image.open(page_path).convert("RGB")
    arr = np.array(img)
    img_h, img_w = arr.shape[:2]

    box = parse_box(args.bbox) if args.bbox else detect_board_bbox(arr, dark_threshold=args.dark_threshold)
    print(f"  board bbox: {box}")

    bx0, by0, bx1, by1 = box
    span_w, span_h = bx1 - bx0, by1 - by0
    cell_w, cell_h = span_w / cols, span_h / rows
    aspect = cell_w / cell_h if cell_h else float("inf")
    print(f"  detected span: {span_w}x{span_h}px, implied cell size: {cell_w:.1f}x{cell_h:.1f}px "
          f"(aspect {aspect:.3f})")
    if abs(aspect - 1) > BOARD_ASPECT_TOLERANCE:
        print(f"  WARNING: {args.puzzle_id} cell aspect {aspect:.3f} deviates >"
              f"{BOARD_ASPECT_TOLERANCE:.0%} from square — bbox auto-detection may be off. "
              f"Flagging for manual review; writing output anyway.")

    expanded, crop = pad_box(box, args.pad, img_w, img_h)
    crop_img = img.crop(tuple(round(v) for v in expanded))
    target_w = cols * BOARD_TARGET_CELL_W
    scale = target_w / crop_img.width
    crop_img = crop_img.resize((target_w, round(crop_img.height * scale)), Image.LANCZOS)

    out_dir = ART_DIR / args.puzzle_id
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / "board.png"
    crop_img.save(dest)
    print(f"  board -> {dest} ({crop_img.width}x{crop_img.height}px)")

    patch_art_block(puzzle_path, data, {
        "board": f"art/{args.puzzle_id}/board.png",
        "boardCrop": crop,
        "calibratedFor": {"rows": rows, "cols": cols},
    })
    print(f"Patched art.board/boardCrop/calibratedFor into {puzzle_path}")


def do_legend(args, page_path):
    puzzle_path, data = load_puzzle_json(args.puzzle_id)
    img = Image.open(page_path).convert("RGB")
    out_dir = ART_DIR / args.puzzle_id
    out_dir.mkdir(parents=True, exist_ok=True)

    if not args.legend_bbox:
        guide = out_dir / "legend-guide.png"
        write_legend_guide(img, guide)
        print(f"No --legend-bbox given. Page is {img.width}x{img.height}px.\n"
              f"Inspect {guide} (gridlines labelled in page pixels), read off the\n"
              f"legend's x0,y0,x1,y1, then rerun with --legend-bbox x0,y0,x1,y1.")
        return

    box = parse_box(args.legend_bbox)
    crop_img = img.crop(box)
    if crop_img.width > LEGEND_TARGET_W:
        scale = LEGEND_TARGET_W / crop_img.width
        crop_img = crop_img.resize(
            (LEGEND_TARGET_W, round(crop_img.height * scale)), Image.LANCZOS)
    dest = out_dir / "legend.png"
    crop_img.save(dest)
    print(f"  legend -> {dest} ({crop_img.width}x{crop_img.height}px, "
          f"aspect {crop_img.width / crop_img.height:.2f})")
    print(f"  INSPECT {dest} before committing — both pills fully inside, "
          f"no board edge or rules box bleeding in.")

    patch_art_block(puzzle_path, data, {"legend": f"art/{args.puzzle_id}/legend.png"})
    print(f"Patched art.legend into {puzzle_path}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("puzzle_id")
    p.add_argument("--board", action="store_true")
    p.add_argument("--portraits", action="store_true")
    p.add_argument("--legend", action="store_true")
    p.add_argument("--bbox", help="x0,y0,x1,y1 board bbox override (--board only)")
    p.add_argument("--legend-bbox", help="x0,y0,x1,y1 in rendered-page pixels (--legend only)")
    p.add_argument("--pad", type=float, default=0.15)
    p.add_argument("--dpi", type=int, default=200)
    p.add_argument("--letters", help="comma-separated letters in reading order, e.g. A,B,C,D,...,V")
    p.add_argument("--extra-box", action="append", default=[],
                    help="LETTER=x0,y0,x1,y1 for a card the auto-detector missed (repeatable)")
    p.add_argument("--from-image", action="store_true",
                    help="use puzzles/art/<id>/_page.png (from tools/photo_prep.py --page-quad) "
                         "instead of rendering the source PDF with pdftoppm")
    p.add_argument("--white-threshold", type=int, default=PORTRAIT_WHITE_THRESHOLD,
                    help=f"portrait-card white threshold, 0-255 (default {PORTRAIT_WHITE_THRESHOLD}; "
                         f"photographed print stock may need a lower value)")
    p.add_argument("--dark-threshold", type=int, default=BOARD_DARK_THRESHOLD,
                    help=f"board grid-line dark threshold, 0-255 (default {BOARD_DARK_THRESHOLD}; "
                         f"photographed print stock may need a higher value)")
    args = p.parse_args()

    if not args.board and not args.portraits and not args.legend:
        sys.exit("Nothing to do: pass --portraits and/or --board and/or --legend")

    page_path = render_page(args.puzzle_id, args.dpi, from_image=args.from_image)
    if args.board:
        do_board(args, page_path)
    if args.portraits:
        do_portraits(args, page_path)
    if args.legend:
        do_legend(args, page_path)


if __name__ == "__main__":
    main()
