#!/usr/bin/env python3
"""Rectify a book photo into the flat, evenly-lit raster tools/extract_art.py expects.

See PLAN-photo-import.md §2 for the full design. This is authoring-time
tooling, not runtime code: corners are picked by the author off a labelled
guide image, never auto-detected unattended (auto-detecting a page's quad is
the classic place this kind of tool fails silently — a printed border, a
table edge, a shadow line all read as "the page").

Usage:
    python3 tools/photo_prep.py <puzzle-id> --guide
        # -> puzzles/art/<id>/photo-guide.png, a coordinate grid over the
        # raw photo (labelled in ORIGINAL photo pixels). Read the page and/or
        # board quad corners off it (TL, TR, BR, BL order), then:

    python3 tools/photo_prep.py <puzzle-id> --page-quad x0,y0,x1,y1,x2,y2,x3,y3
        # -> puzzles/art/<id>/_page.png, the whole page deskewed to upright —
        # exactly the path/role tools/extract_art.py's render_page() produces
        # from a PDF. Run this before anything else touches a photo import.

    python3 tools/photo_prep.py <puzzle-id> --board-quad x0,y0,x1,y1,x2,y2,x3,y3 \\
        --rows 6 --cols 6
        # -> puzzles/art/<id>/board.png, the OUTER GRID corners warped to an
        # exact cols*80 x rows*80 canvas, plus the ready-to-paste `art` JSON.

    python3 tools/photo_prep.py <puzzle-id> --clue-crops --rows 5 --cols 1 \\
        --clue-bbox x0,y0,x1,y1
        # -> puzzles/art/<id>/clues/clue-r<r>c<c>.png, one crop per card,
        # sliced out of an already-warped _page.png. Read --clue-bbox off
        # the guide (or off _page.png directly) — not detected.

Several photos can back one puzzle id (a book page that won't lie flat is
better shot as two clean quads than one warped one) — add --part
grid|clues|legend to any mode to pick a specific source photo.

Source photo resolution order (first match wins), for puzzle id <id> and
optional --part <part>:
    puzzles/source/raw/<id>[-<part>].{jpg,jpeg,png}
    puzzles/source/<id>[-<part>].{jpg,jpeg,png}

Normalisation (flatten illumination, white-balance, mild unsharp) is OPT-IN,
via --normalise. It exists to rescue a photo whose paper white sank below the
thresholds tools/extract_art.py's detectors use — a gutter shadow, a warm
bulb. It is deliberately NOT the default, because every warp this tool
performs is written straight to committed, player-facing artwork
(board.png, and the portraits/legend that extract_art.py crops out of
_page.png), and measured against the 12 known-good PDF-path boards the
correction moves colour by a mean of 18-33 levels per channel — a visible
recolour, not a touch-up. Recolouring the artwork to suit a detector is the
wrong trade when the detector has its own threshold knobs.

So reach for these in order when a photo's detection misbehaves:
    1. tools/extract_art.py --white-threshold / --dark-threshold, which tell
       the detectors what this book's stock actually photographs as. Run this
       tool with the same flags and it reports the pair back for you.
    2. --normalise, accepting the colour cost on that puzzle.
    3. Reshoot with flatter light. Always the best answer for severe glare or
       a gutter gradient steep enough that step 2 can't fix it either.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "puzzles" / "source"
RAW_DIR = SOURCE_DIR / "raw"
ART_DIR = ROOT / "puzzles" / "art"
PUZZLES_DIR = ROOT / "puzzles"

GUIDE_W = 1100  # width of the coordinate-guide render, matches extract_art.py's legend guide

# Matches tools/extract_art.py's BOARD_TARGET_CELL_W — board.png cells must
# come out the same size the PDF path already produces, since everything
# downstream (app.js's rendering, the editor) treats art/<id>/board.png the
# same regardless of where it came from.
BOARD_TARGET_CELL_W = 80

# Defaults mirror tools/extract_art.py's own PORTRAIT_MIN_AREA white check
# (arr > 230) and BOARD_DARK_THRESHOLD (128) — this tool doesn't threshold
# anything itself, it just reports these back so the two tools agree.
DEFAULT_WHITE_THRESHOLD = 230
DEFAULT_DARK_THRESHOLD = 128

# Illumination estimate: the "what does paper white look like here" field, built as a
# local high percentile of luminance over a large window (the standard document-imaging
# background estimate) rather than a Gaussian blur. A blur cannot tell a dark room tile
# from a shadow — both are simply "locally dark" — so a blur-based field drags down over
# genuine content and the correction then washes that content out. A local high
# percentile instead reads the brightest paper *near* each pixel, which grid lines,
# furniture and mid-size colour blocks cannot pull down.
#
# Estimated on a heavily downscaled copy (ILLUM_FIELD_W px wide) and scaled back up:
# illumination is by nature the lowest-frequency thing in the image, and a percentile
# filter at full resolution would be needlessly slow.
ILLUM_FIELD_W = 48        # width of the downscaled copy the field is estimated on
ILLUM_FIELD_PERCENTILE = 90  # local percentile taken as "paper white here"
ILLUM_FIELD_WINDOW = 9    # percentile-filter window, in ILLUM_FIELD_W-scale pixels
# Gains are clamped hard and centred on the field's own median, so the correction is
# relative — an evenly-lit photo comes back essentially untouched. That "no-op on good
# input" property is the one to preserve: this runs before board.png, every portrait and
# legend.png is written, so any systematic drift it introduces is baked into committed
# artwork with nothing left to compare against. It is deliberately a GENTLE correction;
# the real lever for a badly-lit book is extract_art.py's --white-threshold /
# --dark-threshold, which tell the detectors what this stock actually photographs as
# rather than beating the pixels into shape.
ILLUM_MAX_GAIN = 1.25  # cap on brightening a shadowed region
ILLUM_MIN_GAIN = 0.85  # ...and on darkening a glare-bright one; a gutter photo needs both
WHITE_BALANCE_PERCENTILE = 95  # per-channel scale so this percentile maps to white
WB_MAX_GAIN = 1.6  # cap how much any channel can be scaled correcting a colour cast
UNSHARP_RADIUS = 2
UNSHARP_PERCENT = 120
UNSHARP_THRESHOLD = 3


def find_source_photo(puzzle_id, part=None):
    """Resolve the input photo per the module docstring's search order."""
    stem = f"{puzzle_id}-{part}" if part else puzzle_id
    exts = ("jpg", "jpeg", "png")
    tried = []
    for base in (RAW_DIR, SOURCE_DIR):
        for ext in exts:
            candidate = base / f"{stem}.{ext}"
            tried.append(candidate)
            if candidate.exists():
                return candidate
    tried_str = "\n  ".join(str(p) for p in tried)
    sys.exit(f"No source photo found for '{puzzle_id}'"
              f"{f' (part={part})' if part else ''}. Tried:\n  {tried_str}")


def parse_quad(spec):
    """Parse 'x0,y0,x1,y1,x2,y2,x3,y3' (TL,TR,BR,BL) into 4 (x,y) tuples."""
    vals = [float(v) for v in spec.split(",")]
    if len(vals) != 8:
        sys.exit(f"--*-quad needs 8 comma-separated numbers (x0,y0,...,x3,y3), got {len(vals)}")
    return [(vals[i], vals[i + 1]) for i in range(0, 8, 2)]


def parse_box(spec):
    x0, y0, x1, y1 = (float(v) for v in spec.split(","))
    return (x0, y0, x1, y1)


def _dist(p, q):
    return ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) ** 0.5


def solve_perspective_coeffs(src_quad, dst_quad):
    """8 coefficients for PIL's Image.transform(..., Image.PERSPECTIVE, coeffs).

    PIL's PERSPECTIVE transform maps DESTINATION pixel coordinates to SOURCE
    pixel coordinates (for each output pixel, where in the input to sample) —
    the opposite direction from how the quad correspondence is naturally
    stated ("this source corner should land here in the output"). So the
    least-squares system below is built dst -> src: rows are indexed by
    destination points, and the unknowns map a destination (x, y) to the
    source (x', y') it should sample. Solving it the other way round (src ->
    dst) is the classic bug here — the output comes out mirrored/skewed in a
    way that looks almost-but-not-quite right.
    """
    a = []
    b = []
    for (dx, dy), (sx, sy) in zip(dst_quad, src_quad):
        a.append([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx])
        b.append(sx)
        a.append([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy])
        b.append(sy)
    a = np.array(a, dtype=np.float64)
    b = np.array(b, dtype=np.float64)
    coeffs, *_ = np.linalg.lstsq(a, b, rcond=None)
    return tuple(coeffs)


def warp_quad_to_rect(img, quad, out_w, out_h):
    """Warp the quadrilateral `quad` (TL,TR,BR,BL, in img's pixel space) to
    fill an out_w x out_h upright rectangle."""
    dst_quad = [(0, 0), (out_w, 0), (out_w, out_h), (0, out_h)]
    coeffs = solve_perspective_coeffs(quad, dst_quad)
    return img.transform((out_w, out_h), Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC)


def quad_output_size(quad):
    """Derive an upright output size from a TL,TR,BR,BL quad at roughly
    native scale: average each pair of opposite edges so we neither
    upsample past what the photo actually resolved nor throw detail away
    by picking the shorter edge."""
    tl, tr, br, bl = quad
    top, bottom = _dist(tl, tr), _dist(bl, br)
    left, right = _dist(tl, bl), _dist(tr, br)
    out_w = round((top + bottom) / 2)
    out_h = round((left + right) / 2)
    return max(out_w, 1), max(out_h, 1)


def estimate_illumination(luminance):
    """Per-pixel "paper white here", at the same shape as `luminance`."""
    h, w = luminance.shape
    small_w = min(ILLUM_FIELD_W, w)
    small_h = max(round(h * small_w / w), 1)
    small = np.asarray(
        Image.fromarray(luminance.astype(np.uint8)).resize((small_w, small_h), Image.BILINEAR),
        dtype=np.float64,
    )
    # mode="nearest" so the page's own edges don't read as a shadow and trigger a
    # phantom brightening ring around the border.
    field = ndimage.percentile_filter(
        small, ILLUM_FIELD_PERCENTILE, size=ILLUM_FIELD_WINDOW, mode="nearest"
    )
    field = np.asarray(
        Image.fromarray(field.astype(np.uint8)).resize((w, h), Image.BICUBIC),
        dtype=np.float64,
    )
    return np.clip(field, 1.0, 255.0)  # avoid divide-by-zero in a fully black corner


def normalise_photo(img):
    """Flatten illumination, white-balance, then mildly unsharp-mask — see
    PLAN-photo-import.md §2.5, and the module docstring for why this is
    opt-in (--normalise) rather than the default it was planned as."""
    rgb = np.asarray(img.convert("RGB"), dtype=np.float64)

    # 1. Flatten illumination: a gutter shadow or angled light is a
    # brightness phenomenon, so correct it from LUMINANCE alone and apply
    # the same gain to all three channels. Dividing each channel by its own
    # blurred self (a literal per-channel read of "divide by a blurred
    # copy") looks right for a mostly-white scanned page, but on an
    # illustrated puzzle board a large uniformly-coloured room tile is
    # locally flat relative to the blur kernel too — its blurred self is
    # nearly identical to itself, so a per-channel version rescales it
    # straight to white regardless of hue, destroying real colour. A shared
    # luminance-only gain leaves hue alone.
    #
    # The gain map is centred on the field's median and clamped both ways, so
    # an evenly-lit photo comes back essentially untouched and only genuine
    # page-scale gradients move. That "no-op on good input" property is the
    # thing to preserve here: this runs unconditionally before board.png and
    # every portrait is written, so any systematic drift it introduces is
    # baked into committed artwork with nothing left to compare against.
    luminance = rgb.mean(axis=2)
    field = estimate_illumination(luminance)
    target = np.median(field)
    gain = np.clip(target / field, ILLUM_MIN_GAIN, ILLUM_MAX_GAIN)
    flattened = np.clip(rgb * gain[:, :, None], 0, 255)

    # 2. White balance: per-channel scale so the Nth percentile is white —
    # fixes a warm-bulb colour cast. Clamped to WB_MAX_GAIN so a page with
    # little true white in frame (e.g. a --part crop of just the board)
    # can't get its whole palette shoved toward white the way step 1's old
    # per-channel version did.
    balanced = np.empty_like(flattened)
    for c in range(3):
        channel = flattened[:, :, c]
        p = np.percentile(channel, WHITE_BALANCE_PERCENTILE)
        if p > 0:
            scale = min(255.0 / p, WB_MAX_GAIN)
            balanced[:, :, c] = np.clip(channel * scale, 0, 255)
        else:
            balanced[:, :, c] = channel

    out = Image.fromarray(balanced.astype(np.uint8), mode="RGB")

    # 3. Mild unsharp mask, to recover grid lines softened by the perspective resample.
    out = out.filter(ImageFilter.UnsharpMask(
        radius=UNSHARP_RADIUS, percent=UNSHARP_PERCENT, threshold=UNSHARP_THRESHOLD
    ))
    return out


def write_guide(img, dest):
    """Downscaled photo with a labelled coordinate grid overlaid, tick labels
    in ORIGINAL photo pixel coordinates — mirrors extract_art.py's
    write_legend_guide() so corners read straight off the image with no
    scaling arithmetic."""
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


def do_guide(args):
    photo_path = find_source_photo(args.puzzle_id, args.part)
    img = Image.open(photo_path).convert("RGB")
    out_dir = ART_DIR / args.puzzle_id
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / "photo-guide.png"
    write_guide(img, dest)
    print(f"  source: {photo_path} ({img.width}x{img.height}px)")
    print(f"  guide -> {dest}")
    print("  Read TL,TR,BR,BL corners off it (labels are ORIGINAL photo pixels), "
          "then rerun with --page-quad and/or --board-quad.")


def do_page_quad(args):
    photo_path = find_source_photo(args.puzzle_id, args.part)
    img = Image.open(photo_path).convert("RGB")
    quad = parse_quad(args.page_quad)
    out_w, out_h = quad_output_size(quad)
    warped = warp_quad_to_rect(img, quad, out_w, out_h)
    if args.normalise:
        warped = normalise_photo(warped)

    out_dir = ART_DIR / args.puzzle_id
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / "_page.png"
    warped.save(dest)
    print(f"  source: {photo_path} ({img.width}x{img.height}px)")
    print(f"  page   -> {dest} ({warped.width}x{warped.height}px)")
    _print_threshold_hint(args)


def do_board_quad(args):
    if not args.rows or not args.cols:
        sys.exit("--board-quad requires --rows and --cols")
    photo_path = find_source_photo(args.puzzle_id, args.part)
    img = Image.open(photo_path).convert("RGB")
    quad = parse_quad(args.board_quad)
    out_w = args.cols * BOARD_TARGET_CELL_W
    out_h = args.rows * BOARD_TARGET_CELL_W
    warped = warp_quad_to_rect(img, quad, out_w, out_h)
    if args.normalise:
        warped = normalise_photo(warped)

    out_dir = ART_DIR / args.puzzle_id
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / "board.png"
    warped.save(dest)
    print(f"  source: {photo_path} ({img.width}x{img.height}px)")
    print(f"  board  -> {dest} ({warped.width}x{warped.height}px)")

    # boardCrop is the identity here, unlike the PDF path: the destination
    # canvas of the warp *is* the board (we warped exactly the outer grid
    # corners to fill it), so there's no further crop to calibrate — this
    # is what removes the editor's Art-tab calibration pass the PDF path
    # needed on 9 of 12 puzzles.
    print()
    print('  "art": {')
    print(f'    "board": "art/{args.puzzle_id}/board.png",')
    print('    "boardCrop": { "x": 0, "y": 0, "w": 1, "h": 1 },')
    print(f'    "calibratedFor": {{ "rows": {args.rows}, "cols": {args.cols} }}')
    print("  }")
    _print_threshold_hint(args)


def do_clue_crops(args):
    if not args.rows or not args.cols:
        sys.exit("--clue-crops requires --rows and --cols")
    if not args.clue_bbox:
        sys.exit("--clue-crops requires --clue-bbox x0,y0,x1,y1 (read it off the guide "
                  "or off _page.png)")
    page_path = ART_DIR / args.puzzle_id / "_page.png"
    if not page_path.exists():
        sys.exit(f"No {page_path} yet. Run --page-quad first.")

    img = Image.open(page_path).convert("RGB")
    x0, y0, x1, y1 = parse_box(args.clue_bbox)
    block_w, block_h = x1 - x0, y1 - y0
    cell_w, cell_h = block_w / args.cols, block_h / args.rows

    out_dir = ART_DIR / args.puzzle_id / "clues"
    out_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for r in range(args.rows):
        for c in range(args.cols):
            cx0 = x0 + c * cell_w
            cy0 = y0 + r * cell_h
            cx1 = cx0 + cell_w
            cy1 = cy0 + cell_h
            crop = img.crop((round(cx0), round(cy0), round(cx1), round(cy1)))
            dest = out_dir / f"clue-r{r}c{c}.png"
            crop.save(dest)
            count += 1
    print(f"  {args.rows}x{args.cols} = {count} clue crops -> {out_dir}/")


def _print_threshold_hint(args):
    white = args.white_threshold if args.white_threshold is not None else DEFAULT_WHITE_THRESHOLD
    dark = args.dark_threshold if args.dark_threshold is not None else DEFAULT_DARK_THRESHOLD
    print(f"  When running tools/extract_art.py --from-image, pass "
          f"--white-threshold {white} --dark-threshold {dark} if this book's "
          f"print stock needed different thresholds than the default.")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("puzzle_id")
    p.add_argument("--guide", action="store_true", help="write a labelled coordinate-grid guide")
    p.add_argument("--page-quad", help="x0,y0,x1,y1,x2,y2,x3,y3 (TL,TR,BR,BL) whole-page corners")
    p.add_argument("--board-quad", help="x0,y0,x1,y1,x2,y2,x3,y3 (TL,TR,BR,BL) outer grid corners")
    p.add_argument("--clue-crops", action="store_true", help="slice the clue block out of _page.png")
    p.add_argument("--clue-bbox", help="x0,y0,x1,y1 clue block bbox in _page.png pixels (--clue-crops)")
    p.add_argument("--rows", type=int, help="grid rows (--board-quad) or clue-card rows (--clue-crops)")
    p.add_argument("--cols", type=int, help="grid cols (--board-quad) or clue-card cols (--clue-crops)")
    p.add_argument("--part", choices=["grid", "clues", "legend"],
                    help="pick a specific source photo when several back one puzzle id")
    p.add_argument("--white-threshold", type=int,
                    help="reported back as the value to pass to extract_art.py --white-threshold")
    p.add_argument("--dark-threshold", type=int,
                    help="reported back as the value to pass to extract_art.py --dark-threshold")
    p.add_argument("--normalise", action="store_true",
                    help="flatten illumination / white-balance / unsharp after warping. "
                         "Opt-in: it visibly recolours the artwork (see the module docstring), "
                         "so prefer extract_art.py's threshold flags first")
    args = p.parse_args()

    modes = [args.guide, bool(args.page_quad), bool(args.board_quad), args.clue_crops]
    if sum(1 for m in modes if m) != 1:
        sys.exit("Pass exactly one of --guide, --page-quad, --board-quad, --clue-crops")

    if args.guide:
        do_guide(args)
    elif args.page_quad:
        do_page_quad(args)
    elif args.board_quad:
        do_board_quad(args)
    elif args.clue_crops:
        do_clue_crops(args)


if __name__ == "__main__":
    main()
