# Plan: source artwork in Murdoku (background board art + suspect portraits)

## Progress (updated 2026-08-25)

**Done — sequencing steps 1 and 2, shipped:**

1. `tools/extract_art.py` exists, portraits path only (`--board` is a stub that exits with
   "not implemented yet"). CLI: `python3 tools/extract_art.py <puzzle-id> --portraits
   [--extra-box LETTER=x0,y0,x1,y1 ...] --letters A,B,C,...`. Renders the source PDF at
   200dpi, auto-detects near-white polaroid cards by connected-component area/aspect,
   accepts `--extra-box` for cards the detector misses (needed for The Hiking Trip's
   Vincenza — her card is pink/highlighted as the victim, not white), sorts all boxes into
   reading order (row-cluster by y, then x), matches them positionally against `--letters`,
   exports padded PNGs to `puzzles/art/<id>/<LETTER>.png` (400px wide, ~15% margin per the
   plan's padding requirement), and text-splices the resulting `art.portraits` block onto
   the end of the puzzle JSON — a raw string splice, not a `json.dump` round-trip, so puzzles
   using compact array formatting don't get fully reformatted into noisy diffs.
   Also writes `puzzles/art/<id>/contact-sheet.png` (detected boxes overlaid with their
   assigned letters) for visually checking the mapping before trusting it.
2. Feature 2 (suspect portraits in the clue list) is built and working end to end on
   The Hiking Trip, all 12 suspects. `buildClueList()` (app.js) prepends a crop-positioned
   `<img class="clue-portrait">` before the suspect chip when `PUZZLE.art?.portraits?.[suspect]`
   exists; CSS-only hover (`scale(5)`, `transform-origin: top left`) enlarges it to ~200px
   since that's the entire point of the feature (checking for a cap/glasses at 40px is
   impossible). New `viewPrefs.portraits` toggle ("Suspect portraits" checkbox), hidden via
   `[hidden]` when the loaded puzzle has no `art.portraits` — re-evaluated at the end of
   `initPuzzle()` (`applyViewPrefs()` now runs there too, not just at boot).
   `exportPuzzleJSON()` round-trips `PUZZLE.art` so edit mode doesn't silently drop it.

**Bugs found and fixed during this pass (both are traps worth remembering):**
- `.view-options label[hidden]` needed an explicit `display: none` rule — same issue
  CLAUDE.md already documents for `.editor-bar[hidden]`: the author `display: flex` on
  `.view-options label` beats the UA `[hidden]` stylesheet rule, so toggling the `hidden`
  property alone did nothing without it.
- Portrait `src` values in the JSON are relative to `puzzles/` (matching the plan's own
  `"art/the-zoo/A.png"` example), but `index.html`/`app.js` run from the repo root — image
  tags need `puzzles/${portrait.src}`, not `portrait.src` directly. Got this wrong on the
  first pass (images 404'd silently, rendered as a small broken-image glyph that was easy to
  mistake for "working but ugly" in a screenshot — check network/console, not just the
  screenshot, if this trips again for board art).

**Verified in-browser** (headless Chrome via `Google Chrome for Testing`, since the
Playwright MCP browser profile was locked by another session — see Environment note below):
portraits render correctly cropped and self-labelled for all 12 Hiking Trip suspects, hover
enlarges to ~200px, the checkbox is hidden on puzzles without `art` (e.g. Netflix and Kill)
and shown on Hiking Trip, and the `art` block round-trips through the JSON diff cleanly
(114 insertions, 0 reformatting noise).

**Done — steps 3 and 4:**

3. `--board` implemented in `tools/extract_art.py`: auto-detects the grid bbox (dark-pixel
   border-line runs in the right ~55% of the page — same technique validated during
   planning), pads 15% (clamped at page edges, so a board flush against the source page
   edge gets less padding on that side — expected, not a bug), downscales to `cols*80`px,
   writes `board.png` + `art.board`/`boardCrop`/`calibratedFor`. `patch_art_block()` is now
   `(path, data, updates_dict)` instead of a single key/value pair, so board's three keys
   patch in one call; `do_portraits()` updated to the new signature. Ran once, on Netflix
   and Kill: bbox came out 914×914px (912×912 found during planning — within rounding),
   confirming auto-detection is exact on bordered grids as expected.
4. Legibility checkpoint — done and resolved. Built `layer-art` (new first child of
   `#grid`, `renderArtLayer()` in `app.js`, CSS per the plan) and the `body.art-mode`
   switch (`.cell`/`.void-cell` transparent, `.layer-objects`/`.layer-labels` hidden). No
   Art tab, no toggle UI — verified with a throwaway `_seed.html` (localStorage progress
   seed) + a temporary `?artdebug=` URL hook in `app.js`, both since deleted. Screenshotted
   plain / halo / scrim / dim variants on Netflix and Kill with real definite letters, X
   marks and pencil marks, all with the grid-lines sub-toggle on. **User decision: halo,
   with grid lines on by default.** Both are now baked into `style.css` as the unconditional
   `body.art-mode` rules (no more modifier classes) — scrim/dim variant CSS was removed,
   not kept dead. Plain was already close to acceptable; halo's dark text-shadow gave a bit
   more separation for a few lines of CSS. Scrim was visibly the most reliable but
   reintroduced exactly the visual noise immersive mode exists to remove; dim cost the
   artwork's vibrancy for a similar gain to halo.

**Done — player-facing toggle (not explicitly in the original step numbering, but needed
so art-mode is reachable without devtools):** a "Board art" checkbox next to "Suspect
portraits" in the toolbar, same pattern exactly — `viewPrefs.artMode` (default `false`,
unlike portraits' default `true`: it's a bigger visual change and only one puzzle has
`art.board` so far, so defaulting it on would surprise players everywhere else),
`localStorage`-persisted, gated on `PUZZLE.art?.board` and hidden via `[hidden]` when
absent (`prefArtModeLabelEl`, mirrors `prefPortraitsLabelEl`). Verified in-browser: shows
and works on Netflix and Kill, stays hidden on The Zoo (no board art yet).

**Not started:** the Art tab (board crop nudge, then portrait crop nudge — original step 5)
and scripting board art for the remaining 11 puzzles (step 6). Stopping here at the user's
request — do not start either without checking in again.

### Next steps for the following session

1. **Step 3**: implement `--board` in `tools/extract_art.py` (currently a stub). Bbox
   auto-detection logic is already validated during planning (see "Findings that shape the
   plan" — exact on bordered grids, off by a partial cell on Hiking Trip's borderless one),
   so this is mostly wiring: detect/accept `--bbox` override, pad, downscale to `cols * 80`px,
   write `board.png` + `art.board`/`art.boardCrop`/`art.calibratedFor` into the JSON using the
   same text-splice `patch_art_block()` helper already written (extend it or generalize it —
   it currently take a single `key`/`value` pair, which already fits `board`/`boardCrop`/
   `calibratedFor` as three separate calls, or bundle them into one dict and call once).
2. **Step 4 — the go/no-go gate, do this before anything else in feature 1.** Get ONE puzzle
   (suggest The Zoo or Netflix and Kill — both had exact bbox detection during planning, so
   no calibration fighting) rendering in art mode with real marks on it (a few definite
   letters, X marks, pencil marks) and screenshot it for the user. Whether light-on-dark marks
   read over pastel artwork is an aesthetic call only the user can make — do not build the Art
   tab or script the remaining puzzles first. Feature 1 is explicitly abandonable here.
3. If step 4 gets a go: Art tab (board crop nudge, then portrait crop nudge — see "Crop
   overriding in the app" section below for the gesture-plumbing detail about
   `onEditPointerDown()`'s early return), then script + verify the remaining 11 puzzles.

### Environment note for next session
The Playwright MCP browser (profile `~/Library/Caches/ms-playwright-mcp/mcp-chrome-886e7bd`)
was locked by another concurrent session throughout this one, so verification used a second,
independent Chrome instance directly: `~/Library/Caches/ms-playwright/chromium-1200/chrome-mac-arm64/Google
Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --headless --disable-gpu
--no-sandbox --window-size=W,H --screenshot=out.png --virtual-time-budget=6000 <url>`. To land
on a specific puzzle without clicking the `<select>` (headless `--screenshot` can't script
interaction), a throwaway `_seed.html` at the site root set `localStorage['murdoku:lastPuzzle']`
then redirected to `index.html` — delete it after use, it's not part of the app. If the
Playwright MCP browser is free next session, prefer it — it can actually click/hover, which
matters for verifying the portrait hover-enlarge interaction and, later, Art-tab dragging.


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

**Feature 1 is wanted. Confirmed by the user 2026-08-25, after feature 2 shipped.**
Earlier drafts of this plan called it "abandonable" on the grounds that the payoff might not
justify the risk. That is no longer the framing: the immersive board art is the feature the
user actually cares about, and portraits landing has not reduced that.

The calibration problem that looked scary is genuinely easy here. The risk moved rather than
disappeared: it is now mark legibility over busy pastel artwork, which cannot be evaluated
until it is built. **That is a checkpoint, not an exit.** See step 4 below.

Sequence so that risk surfaces early:

1. `tools/extract_art.py` — portraits path only.
2. Feature 2 end to end on The Hiking Trip. Ship it.
3. `extract_art.py` — board path.
4. **Legibility checkpoint — one puzzle rendering in art mode with real marks on it**,
   before building the Art tab or scripting the other eleven. Come back to the user with
   screenshots. This exists to decide *how* the marks are made readable, not *whether* to
   continue. If the plain rendering reads badly, do not stop and do not pick a fix
   unilaterally — implement two or three of the mitigations below and screenshot each, so
   the user chooses from real options:
   - **halo** — dark `text-shadow` outline on marks, no scrim. Cheapest; may be enough alone.
   - **scrim** — translucent rounded rect behind cells that have content. Most reliable,
     but reintroduces exactly the visual noise immersive mode exists to remove.
   - **dim** — uniform dark overlay or `filter: brightness(.6)` on the art layer so light
     marks pop everywhere. Keeps the artwork whole; costs its vibrancy.

   Also settle at this checkpoint whether the faint 1px cell grid line stays on by default.
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

Read `CLAUDE.md`, then `app.js`, before starting.

**Steps 1 and 2 are DONE and shipped** (commits `f99c4af`, `9d01dcd`). `tools/extract_art.py`
exists with a working portraits path; The Hiking Trip has an `art.portraits` block and 12
portrait PNGs under `puzzles/art/the-hiking-trip/`; the clue list renders click-to-enlarge
portraits. No puzzle has an `art.board` block yet and `extract_art.py` has no `--board` path
yet — that is step 3, where you pick up.

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

### Check in with the user at step 4 (do not stop, do not decide alone)
Whether light-on-dark marks read acceptably over pastel artwork is an aesthetic call the
user has to make, and it is the one thing in this plan that cannot be settled by reasoning.
Get one puzzle rendering, place a few definite letters, X marks and pencil marks, and
screenshot it — plus a screenshot per mitigation variant if the plain version reads badly.
Then ask. Do not carry on into the Art tab or the remaining puzzles until they have picked,
because the mitigation choice affects what the Art tab has to preview.

**The user wants this feature.** Your job at the checkpoint is to present real options with
evidence, not to recommend dropping it.

### Start here
Step 3: add the `--board` path to `tools/extract_art.py`. Then step 4, the legibility
checkpoint. Do not go past step 4 without checking in.

---

# Follow-up fixes (planned 2026-08-25, after step 4 shipped)

Three fixes requested after the art-mode legibility checkpoint landed (`005b780`).
Fix 3 is the important one. Do them in one branch; they are independent of each other.

**Still not started, and out of scope for this pass:** the Art tab (crop-nudging UI) and
running board extraction on the remaining 11 puzzles. Do not start either.

## Fix 1 — make the ✕ marks larger

`.mark` sets `font-size: 1.4rem` for all mark content (`style.css:454-460`), so the ✕ is
rendered at the same size as a definite letter. It reads as too faint next to the letters.

- Add a `.mark.crossed .cell-main` rule bumping the ✕ to roughly `1.9rem`. Do not raise
  `.mark`'s base size — that would enlarge definite letters too.
- Cells have `min-width/min-height: 52px`, so ~30px of glyph fits with room to spare. Check
  the smallest rendered case anyway (a 16x16 puzzle in the split layout, where cells sit at
  their floor).
- The ✕ already picks up the art-mode halo via
  `body.art-mode .mark.crossed .cell-main` (`style.css:553-556`) — no change needed there,
  but re-check the halo still looks right at the larger size.

## Fix 2 — placing a suspect clears their pencil marks board-wide and ticks them off

Two separate changes. Interpretation of the request: "tick off" = mark as done in the
suspect list, i.e. strike through their letter once they are placed.

### 2a. Board-wide pencil sweep
`placeDefinitely()` (`app.js:1607`) currently clears pencil marks only in the placed cell and
in the cells it auto-crosses along that row and column. Pencil marks for the same suspect
elsewhere on the board survive, which is wrong — once A is placed, A cannot be anywhere.

- After the existing row/column loops, sweep every cell and delete `letter` from its pencil
  set. Skip the placed cell itself (already cleared).
- **Do not** touch other suspects' pencil marks, and **do not** clear `x` flags.
- No history work needed: `placeDefinitely()` is already called inside the gesture's single
  `pushHistory()` entry, so one Undo still reverts the whole thing atomically. Verify this
  rather than assuming it.

### 2b. Strike through a placed suspect's letter
- Add a helper returning the set of letters currently placed (scan `grid` for `definite`).
- Toggle a `.placed` class on the palette chips (`addPaletteChip`, `app.js:777`) and on the
  clue-row chips (`buildClueList`) for those letters, with `text-decoration: line-through`
  and reduced opacity in CSS.
- **Drive it from `renderMarks()`**, not from a new call at each mutation site. There are 19
  `renderMarks()` call sites; deriving the state there means undo, file load, localStorage
  restore and Clear all stay correct for free. Add a small `updatePlacedStates()` and call it
  at the end of `renderMarks()`.
- The chips must stay clickable and selectable when struck through — this is a status
  indicator, not a disable.
- Guard for edit mode: `buildPalette()` runs there too, and `grid` is a blank clone.

**Done — all three fixes, 2026-08-25.** Verified in-browser (Playwright MCP) on Netflix and
Kill, the only puzzle with `art.board`. Fix 3's diagnosis held up with one correction: the
`.cell.ref-room` dashed outline was NOT invisible — it drew, just weakly, exactly as
predicted for reason 2 (no scrim). Object refs (reason 1) were indeed completely dead —
confirmed by hovering Austin/shelf and seeing nothing at all before the fix. Implemented the
plan's approach as written: `.object-art` (not the whole `.layer-objects`) goes
`display:none` in art mode, so `.object-cell` wrappers stay in flow and pick up a new
`body.art-mode .object-cell.ref-object` outline+fill rule; the opacity-based dim was
replaced with a real `rgba(0,0,0,0.45)` scrim scoped to `body.art-mode`, plus a teal fill on
`.cell.ref-room`. Screenshotted marks (definite letter, X, pencil) sitting inside the
scrimmed/highlighted kitchen room — all stayed legible with the existing halo. Confirmed
non-art-mode pixel-identical: opacity dim, dashed outline, and object drop-shadow all still
behave exactly as before (checked computed styles, not just a screenshot). Dropped the
optional room-label-pill idea — the teal wash + scrim already made the spotlight unambiguous
without it, and the clue text itself names the room.

## Fix 3 — clue-ref highlighting is invisible in art mode  (MOST IMPORTANT)

### Diagnosis
`applyHighlights()` (`app.js:1303-1341`) still sets the right classes in art mode — the JS is
not broken. The styling those classes rely on is what art mode disables:

1. **Object refs are completely dead.** `body.art-mode .layer-objects { display: none }`
   (`style.css:534-537`) hides the whole layer, and `.object-cell.ref-object .object-art`
   (`style.css:420-422`) is the only thing that draws an object highlight. Nothing renders.
2. **Room refs lose their spotlight.** The "dim everything else" effect comes from
   `.grid.refs-active .layer-cells .cell:not(.ref-room) { opacity: 0.55 }`
   (`style.css:506`). In art mode cells are `background: transparent !important`, so
   lowering their opacity dims nothing — the artwork lives on `layer-art`, a different
   layer, which is never dimmed. The `.cell.ref-room` dashed outline (`style.css:382`)
   should still draw, but on its own, per-cell, over busy artwork, it is weak.

**Confirm both in the browser before changing anything** — particularly whether the dashed
outline is drawing at all. This diagnosis is from reading the CSS, not from seeing it.

### Approach
The app still knows all the geometry in art mode; it just stopped drawing anything stylable.
Fix by keeping the geometry present-but-invisible and giving art mode its own highlight
treatment, rather than by changing `applyHighlights()`.

**Stop hiding the objects layer wholesale — hide only the artwork inside it.**
Replace the `body.art-mode .layer-objects { display: none }` rule with one that hides
`.object-cell .object-art` (the SVG) while leaving the `.object-cell` wrappers in the flow.
Those wrappers already carry the correct multi-cell grid spans and already receive the
`ref-object` class from `applyHighlights()`, so a `body.art-mode .object-cell.ref-object`
rule (dashed teal outline plus a soft teal fill) lights up the right cells with **zero JS
change**. The layer is `pointer-events: none`, so nothing becomes clickable.

**Replace the no-op opacity dim with a real scrim.** In art mode, give
`.refs-active .cell:not(.ref-room)` a translucent dark background instead of reduced
opacity — roughly `rgba(0,0,0,0.45)`. The cells layer sits above `layer-art`, so this dims
the artwork everywhere except the referenced room, restoring the spotlight the tinted
rendering gets for free. Needs `!important` or higher specificity to beat the inline
per-cell background from `renderStatic()`.

**Give ref'd rooms a positive fill too**, not just the outline — a light teal wash
(`var(--ref)` at low alpha) over the art reads far better than a dashed outline alone.

**Watch the interaction with the halo.** Marks sitting on scrimmed cells will now be
light-on-dark, which is fine, but marks on the highlighted room sit on a teal wash. Check a
definite letter, a ✕ and pencil marks in a highlighted room before calling it done.

### Optional, decide by eye
Room name pills are hidden in art mode (`body.art-mode .layer-labels { display: none }`).
When a clue references a room, the player may not know which room the spotlight is. Consider
showing the pill for referenced rooms only while refs are active. This *does* need a small
JS change — a `ref-label` class toggled on `.room-label[data-room]` in `applyHighlights()`,
next to the existing room/object loops. Try it; drop it if it looks cluttered.

### Verification
Netflix and Kill is the only puzzle with `art.board`. Test with art mode both on and off,
hovering a clue that references a room (e.g. Dean/Kitchen) and one that references an object
(e.g. Austin/shelf, Enid/TV), and confirm the non-art rendering is completely unchanged.


---

# Next up: board art across the remaining puzzles

Board art currently exists for **Netflix and Kill only**. `tools/extract_art.py --board`
works. The Art tab (in-app crop nudging) is still NOT built, and is still out of scope —
without it, the only way to correct a bad crop is re-running the script with `--bbox`.

## Known bug to fix first: voids are not scrimmed

`body.art-mode .grid.refs-active .layer-cells .cell:not(.ref-room)` applies the clue-ref
scrim to `.cell` elements only. Void cells are deliberately **not** `.cell` (see CLAUDE.md),
and `body.art-mode .void-cell` sets `background: transparent !important`. So with refs
active in art mode, every real cell outside the referenced room darkens while void areas
stay at full brightness — bright holes punched through the scrim.

Invisible today: Netflix and Kill has no voids, and it is the only puzzle with board art.
**The Hiking Trip is the only puzzle in the set that has voids (10 of them)**, so this bites
the moment it gets board art. Fix the rule to cover `.void-cell` too before extracting there.

## Per-puzzle alignment is the real work

Verified during planning: detection is exact on bordered grids (Netflix and Kill, The Zoo)
and lands a partial cell off on The Hiking Trip, which has no hard border and scenery
bleeding past the board. Expect most puzzles to be fine and a minority to need `--bbox`.

Alignment must be checked **per puzzle, by eye** — a crop that is off by a fraction of a
cell still renders, it just puts every mark slightly wrong relative to the art. The check:
turn art mode on and confirm the app's faint 1px grid lines sit on the artwork's own cell
boundaries, and that room boundaries in the art coincide with where `roomGrid` changes room.


## Revised sequencing (decided 2026-08-25)

Agent-driven per-puzzle alignment verification is the wrong division of labour: judging
sub-cell misalignment 12 times is slow and unreliable for an agent, and fast and obvious for
a human dragging it live. So **build the Art tab and let the author calibrate**, rather than
having an agent eyeball screenshots.

Order: extract all 12 unverified -> build the Art tab (board crop only) -> author calibrates.

Two ergonomic requirements that only matter at 12-puzzle scale:

1. **Squareness triage in the script.** Source cells are square (measured: 152.0x152.0 on
   Netflix and Kill, 66.8x66.8 on The Zoo). Bad detection skews the ratio — The Hiking Trip
   came out 70.5x63.8, a 0.905 aspect. Flag any puzzle whose detected cell aspect deviates
   >3% from square, so the author knows which to scrutinise instead of checking all 12 blind.
2. **"Copy boardCrop" button, not Download JSON.** Edit mode's only export today is a full
   puzzle-JSON download the author hand-places in `puzzles/`. Twelve times, that is
   unusable. Emit just the four numbers for copy/paste.

**Portrait crops stay out of scope.** The plan's Art tab section describes a portrait-crop
strip too; portraits already look right, so build the board half only.

## Done — void scrim fix + the board half of the Art tab (2026-08-25)

- **Void scrim fix** shipped. The art-mode refs scrim selector now covers `.void-cell`
  alongside `.cell:not(.ref-room)`. Verified only at the computed-style level (force
  `body.art-mode` + `.grid.refs-active` on The Hiking Trip: voids report
  `rgba(0,0,0,0.45)`, same as the scrimmed cells) — it cannot be seen end to end until
  The Hiking Trip gets board art, since it is the only puzzle with voids and Netflix
  and Kill, the only puzzle with board art, has none.
- **Art tab** built, board crop only. Fourth tab beside Rooms/Objects/Details; renders
  into `editorDetails` (the column layout) rather than the chip-row palette. Forces art
  mode on via a new `art-calibrate` body class — same immersive rendering but with the
  room tints and real room borders left in at 50% opacity, so misalignment against the
  artwork's own cell boundaries is obvious. Drag to pan, arrow keys to nudge (1/8 cell,
  Shift for a whole cell), four zoom buttons (±1%, ±5%) scaling about the crop centre,
  raw x/y/w/h number inputs, Reset to the extracted values, and **Copy boardCrop** —
  the primary output, putting `"boardCrop": { ... },` on the clipboard so 12 puzzles
  can be calibrated and pasted back in one batch.
- `onEditPointerDown()`/`onEditPointerMove()`'s `cellFromEvent()` early return moved down
  into the rooms/objects branches, per the plan's gesture-plumbing note. Room painting
  and object place/erase re-verified after the change.
- `validateDraft()` warns (never errors) when `art.calibratedFor` disagrees with the
  current rows/cols.
- Two incidental fixes: `.editor-palette[hidden]`/`.editor-details[hidden]` needed an
  explicit `display: none` (the same author-`display` vs UA-`[hidden]` trap already
  logged twice above — the room chips were showing under the Details panel too, not
  just under Art), and `renderArtLayer()` now reuses the existing `<img>` when the src
  is unchanged, since the Art tab drives a full re-render per drag frame.
### Follow-up (same day): two-point alignment, the loupe, and the square-cell lock

Board art landed for all 12 puzzles (`7174887`), and extraction went badly for 9 of them —
auto-detection's vertical search collapsed to the page edges, leaving them at
`boardCrop ~ {x:.2, y:0, w:.8, h:1}` with the board sitting somewhere inside a
full-page-height image. That makes calibration a large crop-down, not a nudge, so the Art
tab gained three things:

1. **Align by 2 points (correspondence pairs).** Not "click the board's two corners" —
   the outer corner is ambiguous on exactly the puzzles that need this most (The Hiking
   Trip's board edge is fuzzy mountain scenery), while interior grid intersections are
   sharp. The author gives two correspondences: a grid intersection, then its matching
   point in the artwork, twice. The grid half **snaps to the nearest cell intersection**,
   so it carries zero human error, and a marker shows exactly what was registered.
   Corner-picking is just the special case where the grid points are (0,0) and
   (cols,rows). Throughout the mode the WHOLE padded PNG is fitted (contain, letterboxed)
   into the cell area, because the point being clicked is usually outside the current
   crop. Escape cancels at any stage, including mid-pair; nothing is written until both
   pairs are complete.

   Closed-form, since the transform is axis-aligned scale + translate:
   `w = (ix2-ix1)/(gx2-gx1)`, `x = ix1 - gx1*w`, and the mirror on y. Refuses the
   degenerate case (two points sharing a row or column) and the inverted case, and warns
   when the picks are less than a third of the board apart, since the error in `w` scales
   as `1/(gx2-gx1)`.

2. **Magnifier loupe**, 140px at 5x, following the cursor while picking the image half of
   a pair, with crosshairs on the exact point that will be registered. Implemented as a
   `background-position` offset on the same PNG — no canvas, no pixel readback.

3. **Square-cell lock, on by default.** `boardCrop` is normalized against a PNG that is
   not itself square, so equal w and h do NOT mean square cells — the condition is in
   pixels: `(w*imgW)/cols == (h*imgH)/rows`. With the lock on, the author manipulates
   three degrees of freedom (pan x, pan y, scale) and "every cell subtly rectangular"
   becomes unreachable. A "cell px" input exposes the scale directly, and a readout
   shows the cell size on both axes, flagged in red when off-square. The checkbox
   unlocks it for a source that genuinely needs a stretch, and the independent w/h
   inputs keep working when unlocked.

   Which axis is authoritative: **hold w and derive h** for typed/zoomed changes and when
   the lock is switched on (it was the *vertical* search that collapsed, so x/w is the
   trustworthy pair on the badly-detected puzzles). For two-point alignment, the axis with
   the **greater pick separation** wins — that is the more accurate measurement — and the
   panel states which one it used. The derived axis is anchored on the midpoint of the two
   picks, so the correspondence the author clicked stays as true as the constraint allows.

**Verified on car-repair** (one of the badly-detected 9). Starting crop
`{x:0.2, y:0, w:0.8, h:1}`, cells 64.00 x 96.33 px, aspect 0.664. Two pairs — grid (1,1)
to image pixel (190.5, 235.5) and grid (5,5) to (392.5, 437.5) — produced
`{x:0.2917, y:0.3201, w:0.6313, h:0.5242}`, cells 50.50 x 50.50 px, aspect 1.0001. That
matches an independent offline detection of the board's border lines in the PNG
(x0=140, y0=185, x1=443, y1=488 in a 480x578 image -> 0.29167, 0.32007, 0.63125, 0.52422)
to four decimal places.

- **Gotcha for the calibration pass:** `python3 -m http.server` sends no cache headers,
  and Chrome will heuristically serve a stale `puzzles/<id>.json` from disk cache without
  revalidating — a freshly extracted `art` block can appear to be missing entirely. If a
  puzzle with board art shows "This puzzle has no board art", hard-reload
  (Cmd+Shift+R) before believing it.
