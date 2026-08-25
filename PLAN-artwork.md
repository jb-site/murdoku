# Plan: source artwork in Murdoku (background board art + suspect portraits)

Planning doc for a Sonnet implementation session. Written against `app.js` @ cc79e00.
Read `CLAUDE.md` first for architecture. **Both features are strictly optional and off by
default; the existing grid-only rendering stays the default and stays fully intact.**

## Decisions already taken

| Question | Decision |
|---|---|
| Trait clues ("wore a cap") | **Portraits, not structured `traits` data.** Fidelity to the book over machine-readability. |
| Background image mode | **Immersive replacement** — app's own room tints / object SVGs / labels go transparent. |
| Where cropping happens | **Offline script for the bulk + in-app nudge to override.** |
| Copyright | Not a concern; commit rendered PNGs. |

## Findings that shape the plan

Established by rendering the source PDFs during planning:

1. **Sources are clean vector PDFs, not photos.** Grids are axis-aligned and undistorted.
   There is no perspective/warp problem. Calibration is at most 4 numbers.
2. **Source cells are square**, matching the app's `aspect-ratio: 1`.
3. Auto-detecting the grid bbox (threshold dark pixels, find outermost long runs in the
   right ~55% of the page) is **exact** on bordered grids — Netflix and Kill 6x6 gave
   912x912 px (152.0 px cells), The Zoo 16x16 gave 1069x1070 px (66.8 px cells). It missed
   by a partial cell on The Hiking Trip, which has no hard border and scenery bleeding past
   the board. Hence the override paths below.
4. **Portraits are load-bearing, not decoration.** `the-hiking-trip.json` contains
   *"everyone there wore a cap"* and *"everyone there wore glasses"*, and nothing in any
   puzzle JSON records who wears what. **That puzzle is currently unsolvable in the app.**
   Portraits close that gap.
5. Polaroid cards include the handwritten name caption inside the crop, so crops are
   self-labelling — the app never needs to overlay a name.

---

## Shared data model

One new optional top-level key in `puzzles/<id>.json`, covering both features:

```json
"art": {
  "board": "art/the-zoo/board.png",
  "boardCrop": { "x": 0.12, "y": 0.08, "w": 0.76, "h": 0.80 },
  "calibratedFor": { "rows": 16, "cols": 16 },
  "portraits": {
    "A": { "src": "art/the-zoo/A.png", "crop": { "x": 0.1, "y": 0.1, "w": 0.8, "h": 0.8 } },
    "B": { "src": "art/the-zoo/B.png" }
  }
}
```

Absent `art` -> both features invisible for that puzzle. No migration needed for the 12
existing puzzles. `crop` omitted -> identity `{0,0,1,1}` (use the whole PNG).

**`crop` is a normalized sub-rect of the exported PNG**, not scale/offset in pixels.
Resolution-independent, survives re-exporting the PNG at a different dpi, and is unaffected
by `CELL_MAX` or split-layout resizing.

### Critical: export PADDED PNGs

**The offline script must export with ~15% margin beyond the detected bbox**, and write the
corresponding inset `crop` into the JSON (so the default still renders exactly the detected
board). Without padding, an in-app nudge can only ever crop *tighter* — it cannot recover
pixels the offline crop already threw away, which is precisely the direction The Hiking Trip
needs. Padding is what makes the override actually able to override.

---

## Shared prerequisite: `tools/extract_art.py`

Needs `pdftoppm` (present) + Pillow/numpy (present in `venv/`).

```
python3 tools/extract_art.py <puzzle-id> [--board] [--portraits]
                             [--bbox x0,y0,x1,y1] [--pad 0.15] [--dpi 200]
```

- Renders `puzzles/source/<id>-color.pdf` at 200 dpi.
- **Board:** auto-detect bbox as described in finding 3; `--bbox` overrides. Expand by
  `--pad`, crop, downscale to roughly `cols * 80` px wide, write `puzzles/art/<id>/board.png`.
- **Portraits:** connected-component pass over near-white regions with ~4:5 aspect and area
  above a floor. Emits `portrait-1.png ... portrait-n.png` plus a contact sheet.
  **Do not try to auto-assign letters** — layout wraps in columns and the victim card sits
  out of sequence. Letter assignment is one manual pass reading the contact sheet.
- Patches the `art` block into `puzzles/<id>.json`, preserving key order.

---

# Feature 2: Suspect portraits  (BUILD THIS FIRST)

Small, no calibration risk, closes a real solvability gap.

### Rendering
- `buildClueList()` (`app.js:822`): when `PUZZLE.art?.portraits?.[clue.suspect]` exists,
  prepend `<img class="clue-portrait" loading="lazy" alt="{names[suspect]}">` before the
  existing `.suspect-chip`. **Keep the chip** — it is the selection affordance and carries
  the player colour.
- Apply `crop` via the same wrapper technique as the board (see feature 1) so one mechanism
  covers both.
- **Hover-to-enlarge is the point, not a nicety.** At 40px you cannot tell whether Aubrey
  wears a cap. `.clue-row` already has `mouseenter`/`mouseleave` driving `hoverRefs`; hook a
  CSS popover (~200px) into the same gesture. Without this the feature does not do the job
  it exists for.
- Toggle: `viewPrefs.portraits` alongside the existing two (`app.js:1833-1875`), same
  `localStorage["murdoku:viewPrefs"]` + body-class pattern. Hide the checkbox entirely when
  `!PUZZLE.art?.portraits` — set in `applyViewPrefs()`, called at the end of `initPuzzle()`.
- `exportPuzzleJSON()` (`app.js:2518`): add `if (PUZZLE.art) ordered.art = PUZZLE.art;`
  so edit-mode round-trips do not silently drop it.

### Layout gotcha
`CLUES_MIN = 280` (`app.js:556`). A 40px portrait plus gap eats ~50px of that, and
`clampCluesWidth()`/`canSplit()` are built on it. **Do not bump `CLUES_MIN`** — that changes
which puzzles get the split layout. Float the portrait left and let clue text wrap beside it,
then measure the 16x16 puzzles at the narrow end.

### Skip
Portraits in the palette (28px chips — useless at that size) and in the legend.

**Cost:** ~30 lines JS, ~25 CSS, plus the script's detection pass.

---

# Feature 1: Immersive background board art

### Rendering
A sixth layer, `layer-art`, inserted as the **first** child of `#grid`. Positioned elements
with no `z-index` paint in DOM order and `.layer-cells` is `position:relative`, so it lands
underneath with no z-index juggling.

It is **not** a CSS grid — one absolutely-positioned box covering only the cell area:

```css
.layer-art { position:absolute; left:var(--hdr-size); top:var(--hdr-size);
             right:0; bottom:0; overflow:hidden; pointer-events:none; }
.layer-art img { position:absolute;
                 width:  calc(100% / var(--art-w));
                 height: calc(100% / var(--art-h));
                 left:   calc(-100% * var(--art-x) / var(--art-w));
                 top:    calc(-100% * var(--art-y) / var(--art-h)); }
```

Four CSS custom properties set from `boardCrop`. Prefer this over
`background-size`/`background-position` percentages — the percentage-positioning formula
(`x/(1-w)`) is correct but degenerate at `w == 1`, which is the default case.

Because the image is stretched to the cell area independently on each axis, a source whose
cells are not perfectly square still lines up. No squareness assumption anywhere in the code.

`renderStatic()` gains one call to build/update this layer. Everything else is a CSS switch
on `body.art-mode`:
- `.cell` background and borders -> transparent
- `.void-cell` hatch -> transparent (Hiking Trip's voids are mountain scenery in the source;
  showing it is the whole point)
- `.layer-objects`, `.layer-labels` -> `display:none`
- **keep a faint 1px cell grid line**, or the player loses cell boundaries where the source
  art's own lines are subtle. Worth a sub-toggle.

### The actual risk (not calibration)
Calibration is easy. **The real cost is mark legibility.** Current marks are light-on-dark:
`.mark.definite` uses `--sc`/`--accent`, pencil glyphs use `--muted` grey at 0.85 opacity
(`style.css:454-490`). Over pastel artwork — sand, pale water, white polaroids — those will
be close to invisible. Mitigation is a translucent scrim on cells carrying content plus a
text-shadow, but that fights the immersion the mode exists for.

**This is a design iteration with no clean answer and it is what could make the mode
pretty-but-unusable. Timebox it, and validate it early** (see Sequencing).

### No layout impact
`gridMinWidth()` measures `.cell` min-width, unchanged.

---

# Crop overriding in the app (the "Art" tab)

Both crops are author-overridable in edit mode. Same data type, same pan/zoom math, two
presentation surfaces.

New fourth tab beside Rooms / Objects / Details. `setEditTab()` (`app.js:2096`) already sets
`EDIT.tool = tab` and `buildEditorPalette()` dispatches on it — add an `"art"` branch to both.

### Board crop
- Nudged **against the live grid**, which is the whole point — the preview is the real board.
- While the Art tab is active, force art mode on with `.cell` at ~50% opacity rather than
  fully transparent, so misalignment is obvious.
- Drag on the grid to pan; wheel or a slider to zoom; arrow keys for fine nudge; reset button.
- Also expose the four raw numbers, for reproducing a value or typing an exact one.

**Gesture-plumbing detail:** `onEditPointerDown()` (`app.js:2295`) starts with
`const hit = cellFromEvent(e); if (!hit) return;` before dispatching on `EDIT.tool`. Art
panning needs raw pointer coordinates, not a cell hit, and must work over void cells — where
`cellFromEvent()` returns null by design. **Move that early return down into the `rooms` and
`objects` branches** so the `art` branch can see the event. Same for `onEditPointerMove()`.
This matches the existing "divert at the existing entry point" convention rather than adding
a parallel listener.

### Portrait crops
- A strip of thumbnails, one per suspect, in the Art tab. Click one to open it enlarged;
  drag on the enlarged image to pan, wheel/slider to zoom, reset button.
- **Drag-on-image, not number inputs** — there are 6-12 portraits per puzzle and nudging
  four numbers twelve times is miserable.
- Extract the pan/zoom pointer math into one helper shared with the board so there is a
  single implementation of "drag a normalized crop rect around".

### Wiring (identical to `buildDetailsPanel()`, `app.js:2216`)
Mutate `PUZZLE.art.*` -> `scheduleEditRerender()` -> `EDIT.dirty = true` ->
`scheduleDraftSave()`. Because `enterEditMode()` does `structuredClone(PUZZLE)`, the `art`
block is carried into the draft and stashed for Discard automatically. No new plumbing.

### Resize interaction
A dimension change does not mathematically invalidate `boardCrop`, but semantically does.
**Do not silently drop it.** Compare `calibratedFor` against current `rows`/`cols` in
`validateDraft()` (`app.js:2418`) and push a **warning, not an error** — a resize that only
trims void margin often needs no recalibration, and blocking export on it would be wrong.

**Cost:** ~120 lines JS + ~40 CSS for the render path, ~130 lines for the Art tab,
~20 extra lines in the script — plus the legibility design pass, which is the unbounded part.

---

# Recommendation and sequencing

**Feature 2 is a correctness fix, not polish.** Build it first and build it definitely.
~55 lines of app code, no risky subsystem, no calibration, no edit-mode work required.

**Feature 1 is a separable second commit, and should be abandonable.** The calibration
problem that looked scary is genuinely easy here. The risk moved rather than disappeared:
it is now mark legibility over busy pastel artwork, which cannot be fully evaluated until
it is built.

Sequence so that risk surfaces early:

1. `tools/extract_art.py` — portraits path only.
2. Feature 2 end to end on The Hiking Trip. Ship it.
3. `extract_art.py` — board path.
4. **One puzzle rendering in art mode with real marks on it**, before building the Art tab or
   scripting the other eleven. If it reads badly, ~1 hour spent and you stop.
5. Art tab (board crop, then portrait crops).
6. Remaining puzzles.

### Explicitly out of scope
- Structured `traits` data. The door stays open and the two compose cleanly; the consequence
  of the portraits-only choice is that trait info is not machine-readable, so you cannot hover
  "cap" to highlight everyone wearing one, and the editor cannot validate it.
- Portraits in the palette or legend.
- Per-puzzle toggles — global `viewPrefs` plus per-puzzle availability is strictly better.
- Loading images from disk in the browser. Script-authored files only.

---

# Kickoff notes for the implementing session

You are starting cold — none of this exists yet. No puzzle has an `art` block, and
`tools/` does not exist. Read `CLAUDE.md`, then `app.js`, before starting.

### Environment
- System `python3` has Pillow 12.3.0 and numpy 2.4.3. The repo's `venv/` is not needed.
- `pdftoppm` is at `/opt/homebrew/bin/pdftoppm`. No ImageMagick.
- `pdftoppm -png -r 200 puzzles/source/<id>-color.pdf <out-prefix>` produces a 2200x1700
  PNG. Ignore the "Invalid Font Weight" syntax warnings; they are harmless.
- Serve with `python3 -m http.server 8000` from `murdoku/` and verify in the browser.
  Playwright MCP is available and has been used on this project before.

### What was actually verified during planning, and what was not
- **Verified:** board bbox auto-detection on three puzzles. Netflix and Kill 6x6 ->
  912x912 px, cells exactly 152.0 px. The Zoo 16x16 -> 1069x1070 px, cells 66.8 px.
  The Hiking Trip 14x12 -> off by a partial cell (no hard border, scenery bleeds past
  the board). Source cells are square in all three.
- **NOT verified:** portrait detection. The connected-component heuristic in this plan is
  reasoning, not a measurement. Expect to iterate. **Acceptable fallback:** read the
  rendered page PNG directly and write the portrait bounding boxes out by eye — there are
  only ~12 per puzzle and it is a one-time authoring step, not runtime code. Do not burn
  hours tuning a threshold when looking at the image is faster and more reliable.
- Letter assignment for portraits is a manual pass either way. The polaroid captions carry
  the names, so reading the contact sheet and mapping name -> letter via the puzzle's
  `names` block is straightforward.

### Stop and check in with the user at step 4
Step 4 of the sequencing (one puzzle in art mode with real marks on it) is a **go/no-go
gate, not a task to push through.** Whether light-on-dark marks read acceptably over pastel
artwork is an aesthetic call the user has to make. Get one puzzle rendering, screenshot it
with a few definite letters, X marks and pencil marks placed, and show them before building
the Art tab or scripting the remaining puzzles. Feature 1 is explicitly designed to be
abandonable at that point.

### Start here
Steps 1 and 2 of the sequencing (portraits script, then portraits in the clue list) are
self-contained, carry no design risk, and fix a real bug: The Hiking Trip cannot currently
be solved in the app because two of its clues depend on appearance information that exists
nowhere in the JSON. Ship that before touching feature 1.
