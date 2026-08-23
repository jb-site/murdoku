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

The grid is four aligned CSS-grid layers stacked in one `#grid` container, sharing the same
`grid-template-rows/columns` so a cell at `(r,c)` lines up across all of them:

1. `layer-cells` — room background tint + borders (thick between different rooms, thin within one).
   **This is the only interactive layer** — all pointer listeners are delegated here.
2. `layer-objects` — one SVG per object (`OBJECT_TYPES[type].art(colSpan, rowSpan)`), spanning
   multiple grid cells for multi-cell objects.
3. `layer-labels` — room-name pills, anchored to each room's longest bottom-most horizontal run.
4. `layer-marks` — the definite letter / ✕ / pencil-mark grid, plus the highlight rings.

`renderStatic()` rebuilds all four layers and runs once per puzzle load. `renderMarks()` (after
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

## Status / Next up

Core solving interactions (pencil marks, definitive placement via click/hold/drag, cross-out,
erase, undo), room/object rendering with SVG art and multi-cell spans, room labels, a legend,
hover status, clue-ref highlighting, and the multi-puzzle library are all working. Not yet built:
a "report the crime" fun/finishing feature once solving mechanics feel complete.

## Conventions

- This is a standalone project inside the `adhoc-projects` multi-project repo — keep everything
  Murdoku-related self-contained within this directory.
- No production dependencies; kept deliberately dependency-free to stay free-hostable as a static
  site with zero build step.
