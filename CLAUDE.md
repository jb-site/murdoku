# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Murdoku is a "whodunnit sudoku" puzzle game/tool. Each puzzle has a cast of people labelled
alphabetically (A, B, C, ... up to some letter), where **V is always the victim**. Given a set of
clues and rules, the solver must place every person onto a grid such that:

- Each person occupies exactly one cell.
- At most one person per row, and at most one person per column.
- Grids are divided into named **rooms** with irregular (non-rectangular) boundaries.
- Cells may hold **furniture objects**, some spanning multiple cells (a wide bed, a dining table) —
  some occupiable (bed, chair), some blocking (TV, shelf, table, plant) — a person can never be
  placed on a blocking object's cell.
- The grid's `rows`×`cols` is always a bounding rectangle, but a puzzle's actual playable board
  doesn't have to be a full rectangle — a cell can be a **void** (`roomGrid[r][c] === null`),
  meaning it isn't part of the board at all. This covers non-rectangular outlines (cut corners,
  staircases) and equally an interior hole fully surrounded by real cells. Void is distinct from a
  blocked furniture cell: a blocked cell is real board (it has a room, art, hover text, room
  borders); a void cell has none of those and simply doesn't exist.

This is a static, client-side web app (vanilla HTML/CSS/JS, no build step, no backend) hosted free
on GitHub Pages at `https://jonbaker99.github.io/adhoc-projects/murdoku/`.

## Running locally

```bash
python3 -m http.server 8000   # from within murdoku/
```

Then open `http://localhost:8000/index.html`. Must be served over HTTP (not opened as a `file://`
URL) because `app.js` fetches puzzle JSON via `fetch()`.

## Architecture

- `index.html` / `style.css` / `app.js` — the whole app. No dependencies, no build step.
- `puzzles/index.json` — manifest listing available puzzles (id, title, filename). The app's
  puzzle picker reads this on load.
- `puzzles/<id>.json` — one puzzle's full data: grid size, suspects, structured clues (with `refs`
  for hover highlighting), room layout (`roomGrid`), and furniture layout (`objects`, a list of
  `{type, cells}` — cells can span multiple cells, e.g. a 2-cell bed). See the top of `app.js` for
  the exact schema and `OBJECT_TYPES` for the known furniture types and their SVG art.
- `puzzles/source/` — original photos/PDFs a puzzle was transcribed from, kept for reference.
- `PUZZLE_IMPORT_PROMPT.md` — the process (and literal prompt text) for turning a new puzzle
  photo/PDF into a `puzzles/<id>.json` file + manifest entry. Run this locally (Claude Code can
  read the image/PDF directly) rather than calling an external AI API — keeps the app 100% static.

## Rendering

The grid is five aligned CSS-grid layers stacked in one `#grid` container, sharing the same
`grid-template-rows/columns` so a cell at `(r,c)` lines up across all of them. Each template has
a **fixed-size** leading track on both axes (`var(--hdr-size)`, a custom property on `.grid`) for
the row/column header buttons, followed by `repeat(N, 1fr)` for the puzzle cells — model row/col
`r`/`c` sit at CSS grid track `r+2`/`c+2`. The leading track must stay a fixed length, not `auto`:
the five layers are independent grid containers only visually aligned via identical templates over
the same shared box (four are `position:absolute;inset:0` against `layer-cells`' rendered box) —
an `auto` track sizes to each container's own content, and only `layer-headers` has real content
in that track, so it would drift every cell out of alignment in the other four.

1. `layer-cells` — room background tint + borders (thick between different rooms, thin within one).
   **This is the only interactive layer for single-cell actions** — all pointer listeners are
   delegated here. A void cell (`isVoid(r,c)`) gets no `.cell` element at all — just a
   non-interactive `.void-cell` skin — so the entire gesture layer is naturally void-unaware:
   `cellFromEvent()`'s `.closest(".cell")` can never land on one.
2. `layer-objects` — one SVG per object (`OBJECT_TYPES[type].art(colSpan, rowSpan)`), spanning
   multiple grid cells for multi-cell objects.
3. `layer-labels` — room-name pills, anchored to each room's longest bottom-most horizontal run.
4. `layer-marks` — the definite letter / ✕ / pencil-mark grid, plus the highlight rings.
5. `layer-headers` — clickable row/column number buttons (`.grid-header`) in the fixed leading
   track, delegated `click` listener attached once at boot.

`renderStatic()` rebuilds all five layers and runs once per puzzle load. `renderMarks()` (after
every state mutation) and `applyHighlights()` (on every hover change) only rewrite content/classes
on the existing `layer-marks` elements — never structure or listeners — so an in-progress
long-press/drag gesture never has its DOM pulled out from under it.

## Interaction

One unified palette: suspect letters plus `✕` and `Erase`, exactly one selected at a time (synced
between the palette and the clickable clue rows). With a suspect selected:

- **Short click** → pencil in that suspect as a candidate.
- **Hold** (~450ms) → place them definitively (auto-crosses the rest of their row & column).
- **Drag** → paint pencil candidates across cells (never places).

`✕`/`Erase` ignore hold — click or drag both just apply immediately. Implemented as a pointer-event
gesture state machine (`pending → paint → placed`) with pointer capture; see `app.js` for the exact
timing constants and edge cases. One long-press gesture (pencil + place + auto-cross) is a single
`pushHistory()` entry, so one Undo reverts it atomically.

Clicking a row/column header button (`layer-headers`) applies the current selection to every
eligible cell in that line as one atomic action (`applyToLine`/`canBulkApply`). Bulk pencil is
stricter than a single-cell pencil click: it also skips any cell already marked X, so it never
plants a hidden pencil mark under an existing X. A line where nothing would change pushes no undo
entry and the header dims (`.no-op`).

Hovering a grid cell shows what's in it (room + object + player state) in the status line. Hovering
a clue highlights the rooms/objects it references (`refs` in the puzzle JSON) with a teal dashed
outline, distinct from the yellow ring used for suspect-candidate highlighting — both can be active
on the same cell at once.

## Persistence

- Progress auto-saves to `localStorage`, keyed per puzzle id, and restores on reload.
- "Save to file" / "Load from file" export/import a JSON snapshot of grid state for moving
  progress across browsers or devices.
- Puzzle *data* (the grid/rooms/objects/clues) and puzzle *progress* (what the player has filled
  in) are separate concerns — progress files are tagged with a `puzzleId` and never touch
  `puzzles/*.json`.
- `sanitizeRestoredGrid()` runs after every restore (localStorage or file load) and clears state on
  any cell that's now blocked — guards against a puzzle data correction (or an older save) leaving
  a placement/pencil mark somewhere no longer legal.
- `localStorage["murdoku:cluesWidth"]` remembers the clues-column width from the split layout below
  (a bare pixel integer, puzzle-independent).
- `localStorage["murdoku:draft"]` holds an in-progress edit-mode session (see below), offered back
  to the player on next load via `checkForDraft()`.

## Editing puzzles (edit mode)

Clicking **✏️ Edit puzzle** enters an authoring mode for the loaded puzzle's rows/cols, rooms and
objects. The whole feature works by **swapping `PUZZLE`/`objectAt`/`grid` for a working clone**
(`enterEditMode()`), stashing the originals — so the entire solving render pipeline
(`renderStatic`/`renderMarks`/`applyHighlights`/`describeCell`/etc.) renders the draft with zero
changes, since it only ever reads those three globals. Solving-only code paths (the gesture state
machine, header bulk-fill, keyboard shortcuts, progress persistence) are diverted by `if (EDIT)`
guards at their existing entry points rather than duplicated. **Apply** keeps the edited `PUZZLE`
(resetting solving progress only if the dimensions changed); **Discard** restores the stash
verbatim. Both are session-only — there's no backend, so **Download JSON** (a client-side blob
download, same pattern as the progress Save-to-file button) is the only way to get an edit out of
the browser; the author places it into `puzzles/` and registers it in `puzzles/index.json` by hand.
`validateDraft()` mirrors `PUZZLE_IMPORT_PROMPT.md`'s checklist and blocks export on errors (not
on every keystroke — mid-edit invalidity is normal). Edits autosave to `murdoku:draft` (debounced)
so a refresh doesn't lose work.

## Layout

On wide viewports the clue list sits beside the grid instead of below it, with a draggable divider
(`#resizeHandle`) between them. This is a JS-computed mode, not a media query — `canSplit()` (in
`app.js`) measures the *currently loaded* puzzle's actual minimum grid width (`gridMinWidth()`,
puzzle sizes range 6×6 to 12×12+ with very different floors) against the viewport, since a fixed
breakpoint can't account for that. `desiredCluesWidth` is the player's *wish*, set only by an
explicit drag/keyboard/reset gesture and persisted; every render instead applies
`clampCluesWidth(desiredCluesWidth)`, so a puzzle switch that forces a visually narrower column
(or drops to stacked entirely) never overwrites the remembered preference — widening the viewport
or switching back to a smaller puzzle restores it exactly. `updateLayoutMode()` runs at boot, at
the end of every `initPuzzle()` (after `renderStatic()`, since it needs a real rendered `.cell` to
measure), and on window resize.

## Status / Next up

Core solving interactions (pencil marks, definitive placement via click/hold/drag, cross-out,
erase, undo), room/object rendering with SVG art and multi-cell spans, room labels, a legend,
hover status, clue-ref highlighting, irregular/non-rectangular grids (void cells), the row/column
bulk-fill headers, the side-by-side clues layout, the multi-puzzle library, and the in-app puzzle
editor mode (rows/cols, rooms, objects, JSON import/export/validation) are all working. Not yet
built: structured suspects/clues editing in the editor (currently a raw-JSON textarea) and a
"report the crime" fun/finishing feature once solving mechanics feel complete.

## Conventions

- This is a standalone project inside the `adhoc-projects` multi-project repo — keep everything
  Murdoku-related self-contained within this directory.
- No production dependencies; kept deliberately dependency-free to stay free-hostable as a static
  site with zero build step.
