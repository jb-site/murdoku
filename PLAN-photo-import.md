# PLAN — importing puzzles from book photos

Goal: import puzzles from photos of a printed book instead of the template PDFs, keeping
everything the PDF path gives us (board art background, portraits, legend graphic, verbatim
clues, solutions, stories, the in-app editor), plus a new collapsible **extra rules** panel
fed by separately-photographed rule pages that are shared across several puzzles.

---

## 1. What actually changes

The PDF import is four capabilities glued together. Only two of them break on a photo.

| Capability | PDF path | Photo path |
| --- | --- | --- |
| Verbatim text (title, difficulty, room labels, legend labels, **clues**) | `pdftotext -layout` | **BREAKS** — no text layer. Replaced by a disciplined vision transcription pass (§3). |
| Flat, axis-aligned, evenly-lit raster | `pdftoppm -r 300` | **BREAKS** — a photo has perspective, roll, page curl, glare, gutter shadow. Replaced by a rectification tool (§2). |
| Art extraction (board / portraits / legend) | `tools/extract_art.py` blob + dark-run detection | Works **unchanged** once the input is rectified and light-normalised. |
| Everything downstream (`puzzles/<id>.json`, `art.boardCrop`, the seven render layers, the editor, solutions, stories) | — | Works **unchanged**. Nothing in `app.js` cares where the PNG came from. |

**That's the whole efficiency thesis: fix the input, not the app.** If the photo is turned into
the same flat page raster `pdftoppm` would have produced, the existing tooling and the entire
runtime are untouched. The only app-side work in this plan is the extra-rules feature (§5), which
is genuinely new and unrelated to the capture method.

---

## 2. Phase 1 — rectification (`tools/photo_prep.py`)

New authoring-time tool. Turns one photo into the artefacts the rest of the chain expects.

### 2.1 No new dependencies

PIL already does projective warps: `Image.transform(size, Image.PERSPECTIVE, coeffs)` takes the 8
coefficients of a homography, and those coefficients are an 8×8 least-squares solve in numpy from
four point correspondences. `tools/` already imports `PIL`, `numpy` and `scipy`. **No OpenCV, no
new install step** — matters because the whole project is deliberately dependency-light.

### 2.2 Corners are picked, not detected

Auto-detecting a book page's quad is the classic place this kind of tool fails silently (a printed
border, a table edge, a shadow line all read as "the page"). Reuse the pattern `extract_art.py
--legend` already established: emit a labelled coordinate-overlay PNG, let the author read four
numbers off it, pass them back.

```
python3 tools/photo_prep.py <puzzle-id> --guide
    # -> puzzles/art/<id>/photo-guide.png, a coordinate grid over the raw photo

python3 tools/photo_prep.py <puzzle-id> --page-quad  x0,y0,x1,y1,x2,y2,x3,y3
python3 tools/photo_prep.py <puzzle-id> --board-quad x0,y0,x1,y1,x2,y2,x3,y3
```

Corners in TL, TR, BR, BL order. Two quads because they serve different masters — see below.
Optionally add a `--auto` first guess (largest quadrilateral of near-white) that just *pre-fills*
the guide's suggested numbers; never trust it unattended.

### 2.3 `--page-quad`: deskew the whole page

Warps the page to an upright rectangle at the photo's native scale and writes it to
`puzzles/art/<id>/_page.png` — **exactly the path and role `extract_art.py`'s `render_page()`
produces from the PDF.** Then a one-branch refactor in `extract_art.py`:

```python
def render_page(puzzle_id, dpi, from_image=False):
    if from_image:
        dest = ART_DIR / puzzle_id / "_page.png"
        if not dest.exists(): sys.exit("Run tools/photo_prep.py --page-quad first")
        return dest
    ...existing pdftoppm path...
```

with a `--from-image` flag threaded through. That is the *entire* change to `extract_art.py`'s
structure. Its `--portraits`, `--board` and `--legend` modes then run as they always have.
`_page.png` is already gitignored, so nothing bulky lands in the repo by accident.

### 2.4 `--board-quad`: warp the grid to exact cells

Warps the four **outer grid corners** to a canvas of exactly `cols*K × rows*K` pixels
(`K = BOARD_TARGET_CELL_W = 80`, matching what `extract_art.py --board` already downscales to) and
writes `puzzles/art/<id>/board.png`.

This is strictly better than the PDF path. Because the destination canvas *is* the board, the
resulting `art.boardCrop` is the identity `{x:0, y:0, w:1, h:1}` and cells are square by
construction. The PDF path needed the editor's Art tab to hand-calibrate the crop on 9 of 12
puzzles; **the photo path needs zero calibration.** The Art tab stays as the verification surface
(overlay the app's own object SVGs on the artwork to check the transcription) rather than as a
correction surface.

**Picking the board quad accurately.** Detecting the board's black border and
taking its extreme points gets you within ~1% but is systematically off, because the
border has thickness and perspective means the extremes of `x+y`/`x-y` aren't quite the
corners — on the pilot the top border came out 2px thick against 23px at the bottom,
i.e. the top row was being clipped. The reliable refinement is to **warp once with the
rough quad, fit a regular lattice to the rectified board** (scan pitch and phase against
a thin-dark-line profile; the best fit also *confirms* the row/column count), then
back-project the fitted boundary through the same homography to get the real corners.
On the pilot this converged to pitch 178.0/179.0 over a 1440px canvas — square cells to
within a pixel — and the resulting `board.png` needed no calibration at all.

**Counting rows and columns.** Don't eyeball it, and don't score a free-floating lattice
either: a lattice of `n` cells at the wrong pitch happily fits *inside* an oversized canvas
and reports a plausible-looking `n`. On this batch that silently returned 8x8 for two boards
that are really 9x9, producing a `board.png` with a column cropped off. Because the rough quad
already hugs the board, the real boundaries must sit at `k*N/n` — so score only the *interior*
lines at that fixed spacing, for each candidate `n`, and take the winner. That separated cleanly
(9 scoring 23.5 against 5.6 for the runner-up) and re-confirmed the pilot's 8x8. Useful free
check in this book: **rows == cols == the number of suspects**, so a count that disagrees with
the cast size is wrong.

**A board that isn't a rectangle.** Taking the extreme points of the border mask assumes the
board *is* its bounding box; for a stepped outline (Demolition Zone) that cuts a diagonal across
the shape. Take the **minimum-area bounding rectangle** instead — sweep a rotation angle, pick
the one minimising the axis-aligned bbox area, and rotate its corners back. That yields the
`rows x cols` bounding rectangle the schema wants, with the missing cells transcribed as `null`
void entries.

Emit the `art` block ready to paste:

```json
"art": {
  "board": "art/<id>/board.png",
  "boardCrop": { "x": 0, "y": 0, "w": 1, "h": 1 },
  "calibratedFor": { "rows": R, "cols": C }
}
```

### 2.5 Light normalisation — opt-in, not default

`detect_portrait_boxes()` thresholds at `arr > 230` (near-white polaroid cards) and
`detect_board_bbox()` at `< 128` (dark grid lines). Both assume a flat scan. On a photo, a gutter
shadow or a warm bulb sinks paper white to ~190 and the detectors return nothing.

**Implementation note — this was planned as an always-on step, and it should not be.** Every warp
this tool performs is written straight to committed, player-facing artwork: `board.png` directly,
and the portraits and legend that `extract_art.py` crops out of `_page.png`. Measured against the
12 known-good PDF-path boards, the correction moves colour by a **mean of 18–33 levels per
channel** (95th percentile 55–87). That is a visible recolour, not a touch-up, and recolouring the
artwork to suit a detector is the wrong trade when the detector has its own threshold knobs.

So `photo_prep.py` ships it behind `--normalise`, and the escalation order when detection
misbehaves on a photo is:

1. **`extract_art.py --white-threshold / --dark-threshold`** — tell the detectors what this book's
   stock actually photographs as. This is why those flags exist; `photo_prep.py` reports the pair
   back for you.
2. **`--normalise`**, accepting the colour cost on that puzzle.
3. **Reshoot with flatter light** — always the best answer for severe glare, or a gutter gradient
   steep enough that step 2 cannot fix it either.

**Validated on the pilot.** The first real photograph did exactly what this section
predicted: portrait detection returned zero boxes because the book's card white
photographs at ~200-215, not >230. Escalation step 1 (`--white-threshold 180`) fixed it
outright, so `--normalise` was never reached and the committed artwork kept its true
colours. Making normalisation opt-in was the right call, and the threshold flags are
indeed the primary lever.

What `--normalise` does, when asked:

1. **Estimate illumination as a local high percentile of luminance** over a large window — the
   standard document-imaging background estimate, computed on a heavily downscaled copy and scaled
   back up. A Gaussian blur cannot tell a dark room tile from a shadow (both are simply "locally
   dark"), so a blur-based field drags down over genuine content and the correction then washes
   that content out. A local high percentile reads the brightest paper *near* each pixel instead,
   which grid lines, furniture and mid-size colour blocks cannot pull down.
2. **Apply the gain from luminance only**, shared across all three channels, centred on the field's
   median and clamped to `[0.85, 1.25]`, so hue is preserved and an evenly-lit photo comes back
   essentially untouched. Correcting each channel against its own blurred self — the obvious
   reading of "divide by a blurred copy" — collapses any large uniformly-coloured region toward
   white regardless of hue, which is precisely what a puzzle board is made of.
3. **White-balance** per channel to the 95th percentile, capped, for a warm-bulb cast.
4. **Mild unsharp mask**, recovering the thin grid lines the perspective resample softens.

Either way, make the two detector constants CLI-overridable (`--white-threshold`,
`--dark-threshold`) rather than editing the module, since print stock varies book to book. That is
the primary lever.

### 2.6 Shooting guidance (goes in the prompt doc)

Cheap to state, expensive to skip:

- Flatten the book; if the page won't lie flat, **shoot the grid and the clue block separately** —
  two clean quads beat one warped one. `photo_prep.py` should accept a `--part grid|clues|legend`
  suffix so several photos can back one puzzle id.
- Diffuse, indirect light, camera parallel to the page, no flash. Glare over a grid line is
  unrecoverable; glare over blank paper is harmless.
- Shoot with the *whole* board plus a margin in frame — the quad corners need to exist.
- 8MP+ so a single grid cell is ≥ 120px after warping; furniture icons are the limiting detail.
- Phone photos carry **EXIF orientation** rather than rotated pixels. `photo_prep.py`
  applies `ImageOps.exif_transpose()` on load so the guide and every warp share the frame
  a viewer shows; without it, corners read off the photo land transposed. Always read
  corners off `photo-guide.png`.
- A book puzzle is a **two-page spread**, not a page: clues left, board (and legend)
  right. `_page.png` must be one page, not both — see §2.8.

### 2.8 One spread is two pages (learned on the pilot)

`_page.png` stands in for `pdftoppm`'s single-page raster, and the whole of
`extract_art.py` assumes that page holds exactly one puzzle. A book spread breaks the
assumption: run portrait detection over both pages and it finds blobs on the facing page
(the pilot picked up a false card at x≈3816, on the board page, and mis-numbered the set).
The fix needs no new code — `--page-quad` simply takes **one page's** quad:

1. `--page-quad <clue page>` → `_page.png` → `extract_art --portraits` and `--clue-crops`.
2. `--board-quad <board's outer grid corners>` → `board.png`, independent of `_page.png`.
3. Legend only: re-run `--page-quad <board page>`, then `extract_art --legend`.

Two consequences worth stating plainly, because both contradict how the PDF path reads:

- **Never pass `--board` to `extract_art` on the photo path.** It writes the same
  `board.png` that `--board-quad` produced, trading an exact identity-crop warp for a
  detected bbox needing calibration. §2.4 supersedes it.
- **`--portraits` requires `puzzles/<id>.json` to exist** (it maps cards to suspect
  letters), so the photo path runs transcribe → puzzle JSON → portraits. Art extraction
  cannot fully precede transcription the way step 3 of the prompt implies.

### 2.7 Repo weight

`puzzles/source/` is 14MB for 28 PDFs; `puzzles/art/` is 19MB. A 12MP phone photo is ~4MB, and 20
puzzles × 2–3 pages would add ~200MB to a repo that ships as a GitHub Pages site. Rule:

- Commit the **rectified derivatives** (`board.png`, portraits, `legend.png`) — as now.
  Not `contact-sheet.png`: it is authoring scratch (11MB on the pilot), no existing puzzle
  tracks one, and it is now gitignored alongside the guide PNGs.
- Commit originals **downscaled to 2400px on the long edge, JPEG q85** (~600KB each) under
  `puzzles/source/<id>-page.jpg`, preserving the "keep the source for reference" convention at a
  twentieth of the cost.
- Drop the originals in `puzzles/source/photo-source/` — the first directory
  `photo_prep.py` searches (then `puzzles/source/raw/`, then `puzzles/source/`). Both
  `photo-source/` and `raw/` are gitignored; full-resolution originals stay local.

---

## 3. Phase 2 — text capture without a text layer

Losing `pdftotext` is the real accuracy risk, not the geometry. The current prompt calls the
extraction "the authoritative source for clue wording" and step 8 ends with "diff it against the
raw extraction one more time". Both need a replacement artefact or the verification loop
collapses into "the model checks its own memory".

**Fork `PUZZLE_IMPORT_PROMPT.md` in place; do not write a second document.** Steps 3–8 (grid
structure, void vs blocked, tall-art anchoring, object types, ground pairs, the output shape, the
final checklist) are all source-agnostic and are the bulk of the hard-won guidance. Duplicating
them into a `PUZZLE_IMPORT_PROMPT_PHOTO.md` guarantees the two drift. Instead, replace steps 1–2
with a short **"Source: PDF"** / **"Source: photo"** fork, and add one line to step 8's checklist.

The photo branch of step 1:

1. Run `tools/photo_prep.py --page-quad` first, so every read happens on a flat page.
2. **Crop the clue block per suspect and read each crop in isolation** at full resolution. A
   whole-page read is where OCR-by-eye drift lives; a 400px-tall crop of one card is close to
   trivial. `photo_prep.py --clue-crops --rows N` can slice the card grid automatically once the
   page is rectified.
3. **Transcribe each clue twice, independently, and diff.** Any mismatch is re-read at higher zoom.
   This is the cheap substitute for having ground truth, and it costs far less than a wrong clue
   discovered after the story is written.
4. **Write the result to `puzzles/source/<id>-transcript.txt`** before writing any JSON. This is
   the artefact that replaces the `pdftotext` output: step 8's verbatim diff then works exactly as
   written, against a file rather than against recall. Same for title, difficulty, room labels and
   legend occupiable/non-occupiable labels.

Everything else in step 5 — the letter assignment, `V` for the victim, the pronoun→name house
style, the "two separately printed clues never merge" rule, `refs` — is unchanged.

---

## 4. Phase 3 — new icons from the book

The book will use furniture the 40-odd existing `OBJECT_TYPES` keys don't cover. The mechanism for
this already exists and is currently underused.

### 4.1 Transcribe first with placeholders, draw art later

The editor's **custom object type** path (`app.js:3535`) already records
`{key, label, occupiable, ground, color}` into `PUZZLE.customObjectTypes`, renders it as a coloured
placeholder swatch, and round-trips it through `Download JSON` (`app.js:4820`). Its own status
message says as much: *"For proper artwork, add a matching entry to `OBJECT_TYPES` in app.js
later."*

So: **never block a transcription on missing art.** Define the placeholder, finish the puzzle, and
batch every new icon across all the book's puzzles into one art session at the end. One session
drawing eight icons is far cheaper — and far more stylistically consistent — than eight
interruptions.

### 4.2 The fidelity ladder

For each unmatched icon, in order, stopping at the first that genuinely fits:

1. **An existing key**, if the semantics match. Check the book's own legend for occupiability —
   the current prompt is right that this is a design choice, not something to read off the drawing.
2. **A Twemoji glyph**, via `twemojiArt("<codepoint>")` — the `chair`/`tv` pattern, a single line
   plus `label` and `occupiable`. Cost: paste the glyph's paths into the `TWEMOJI_ICONS` map at
   `app.js:37` keyed by its lowercase hex codepoint. Twemoji is CC-BY 4.0; note the attribution
   alongside the map if it isn't already there.
3. **A bespoke SVG**, via `svgObject()` (1×1) or `spanArt()` (anything with a long axis — the
   authored-landscape-then-rotate scaffolding at `app.js:90` is what keeps a vertical 1×3 table
   from looking squashed). Trace the source icon's silhouette from the rectified board PNG at full
   zoom, and use the existing `var(--obj-fill)` / `--obj-fill2` / `--obj-stroke` custom properties
   so it inherits the app's palette instead of hard-coding colours.

Add `ground: true` for anything that is floor/terrain rather than furniture, and add the key to the
prompt's step-4 occupiable/blocking lists so the next import can reuse it.

---

## 5. Phase 4 — extra rules pages

New feature, independent of capture method. Requirement: a rules page photographed once, shown
collapsibly on the puzzle page, applying to **several** puzzles.

### 5.1 Linking direction — puzzle → ruleset

This is the key design call, and it goes one way:

```jsonc
// puzzles/<id>.json  gains one optional field
"rulesets": ["diagonal-adjacency", "house-rules-v2"]
```

**The puzzle names its rulesets. A ruleset never lists its puzzles.** Three reasons:

1. The app loads exactly one puzzle file and must know that puzzle's rules from it. The reverse
   direction would force a global manifest fetch on every load just to answer "does this puzzle
   have extra rules?".
2. Adding a new puzzle then touches only the new puzzle's file. The reverse direction means
   editing a shared file every time, which is where merge pain and stale references come from.
3. It matches how `refs`, `sourceFile` and `art` already work — a puzzle points outward at its
   assets, nothing points back in.

An array, not a string, because a puzzle can carry two rule pages, and because ordering the panel
is then just array order. One rules file serving six puzzles is six one-line edits and zero
duplication.

### 5.2 The ruleset file

`puzzles/rules/<ruleset-id>.json`:

```json
{
  "id": "diagonal-adjacency",
  "title": "Diagonal adjacency",
  "text": [
    "No two suspects may stand on diagonally touching squares.",
    "The victim is exempt from this rule."
  ],
  "image": "rules/diagonal-adjacency.png",
  "imageAlt": "Photographed rules page showing diagonal adjacency",
  "constraints": []
}
```

- `text` is the **verbatim transcription**, under the same house rules as clues (§3) — it is the
  playable content; the photo is corroboration.
- `image` is the rectified page photo, produced by the same `photo_prep.py --page-quad`, stored at
  `puzzles/rules/<id>.png`, downscaled to ~1200px wide (the `LEGEND_TARGET_W` convention).
- `constraints` is discussed in §5.4 and **starts empty**.

### 5.3 Runtime: lazy fetch + a `<details>` panel

Copy the `solutionCache` / `storyCache` pattern exactly — the third instance of it, so it's
established house style:

```js
const rulesetCache = {};   // ruleset id -> parsed JSON | "none"
```

Keyed by **ruleset** id, not puzzle id, so six puzzles sharing a page fetch it once per session.
Fetch on puzzle load (not lazily on click — unlike a solution or a story, a rule you haven't read
makes the puzzle unsolvable, so there's nothing to protect here).

Render into a `<details class="rules-panel">` inserted **above `#clueList`, inside
`section.clues`** in `index.html`. That position gets both layouts for free: it travels with the
clues into the sticky right-hand column under `main.split`, and sits directly above them when
stacked. No new layout logic, no `canSplit()` change.

- `<summary>` reads e.g. `📜 Extra rules — Diagonal adjacency`.
- **Open by default.** Persist the collapsed state as `localStorage["murdoku:rulesOpen"]`
  (puzzle-independent, bare string, matching `murdoku:gridZoom` / `murdoku:controlsCollapsed`).
  Defaulting it closed hides information the puzzle can't be solved without — a trap.
- Body: the `text` lines as `<p>`s, then the photo as a `<figure>` with a click-to-enlarge, reusing
  the `#boardLegend` figure's styling.
- Hide the whole `<details>` when the puzzle has no `rulesets` — same availability gating as
  `prefPortraitsLabel` / `prefArtModeLabel`.

Three small plumbing edits so `rulesets` survives a round trip through the editor:
`blankPuzzle()` (`app.js:3113`), `exportPuzzleJSON()`'s ordered key list (`app.js:4804`), and the
Details tab if the ids should be editable in-app (optional — a raw field is fine to start).

### 5.4 "Taken account of in the puzzle design"

Two separate touchpoints, deliberately kept apart:

**Authoring.** `tools/story_context.py` should fold the ruleset `text` into `story_context/<id>.json`
so the story author sees the puzzle's real premise. One-line join, same shape as the clue list it
already emits.

**Verification.** Extra rules are mostly prose, and prose can't be checked mechanically. Do *not*
build a general rule engine. Instead:

- `constraints: []` on the ruleset file is a slot for a small, closed vocabulary of machine-checkable
  predicates (`noDiagonalAdjacency`, `victimIsolated`, …), each implemented in a new
  `tools/check_rules.py` as it is first genuinely needed by a real puzzle. Ship with **zero**
  implemented. Speculative generality here is pure cost.
- What `tools/check_rules.py --all` *should* do from day one, and what actually catches bugs:
  verify every `rulesets` id referenced by any puzzle has a file in `puzzles/rules/`, that every
  file's `image` exists, and that every ruleset file is referenced by at least one puzzle. That's
  the whole class of "I renamed the rules file" errors.
- Leave `validateDraft()` in the browser out of it — it can't check a file's existence without a
  fetch, and mid-edit invalidity is normal there by design.

---

## 6. Sequencing

Do a **single-puzzle pilot end to end before batching anything.** The PDF import's hardest lessons
(tall art bleeding upward, void vs blocked cells, spans that aren't spans) were all learned on real
puzzles, and the photo path will have its own — glare on a grid line, a page-curl residual the
homography can't fix, a book that prints its legend on a different page.

| Phase | Work | Unblocks |
| --- | --- | --- |
| 1 | `tools/photo_prep.py` + the `--from-image` branch in `extract_art.py` | Everything. No app change, no risk to the 12 existing puzzles. |
| 1.5 | **Pilot: one puzzle, photo → playable, art mode on** | Confirms the geometry story before the prompt is rewritten around it. |
| 2 | Fork steps 1–2 of `PUZZLE_IMPORT_PROMPT.md`; add the `-transcript.txt` artefact and the shooting guidance | Batch import. |
| 3 | Import the book's puzzles, placeholdering unknown icons; one art session at the end for all new `OBJECT_TYPES` | — |
| 4 | Extra rules: schema, `rulesets` field, the `<details>` panel, `tools/check_rules.py`, `story_context.py` join | Puzzles that need rule pages; can run in parallel with 3. |

While in there: the two unimported PDFs (`a-walk-in-the-park`, `the-backyard-garden`) are still
sitting in `puzzles/source/` and are unaffected by any of this.

---

## 7. Explicitly not doing

- **A browser-side photo importer.** Rectification, transcription and icon authoring all need
  tools and judgement the static site doesn't have, and the app is deliberately backend-free. This
  stays authoring-time tooling, like `extract_art.py` and `story_context.py`.
- **Non-linear dewarping for page curl.** A homography fixes perspective and roll, not a curved
  page. The fix for curl is flattening the book or shooting two halves — much cheaper than a
  thin-plate-spline pipeline.
- **A general rule engine** (§5.4).
- **Auto-detecting board corners unattended** (§2.2).
