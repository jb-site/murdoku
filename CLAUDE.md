# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Murdoku is a "whodunnit sudoku" puzzle game/tool. Each puzzle has a cast of people labelled
alphabetically (A, B, C, ... up to some letter), where **V is always the victim**. Given a set of
clues and rules, the solver must place every person onto a grid such that:

- Each person occupies exactly one cell.
- At most one person per row, and at most one person per column.
- Grids are divided into named **rooms** with irregular (non-rectangular) boundaries.
- Cells may hold **furniture objects** — some occupiable (bed, chair), some blocking (TV, shelf,
  table, plant) — a person can never be placed on a blocking object's cell.

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
- `puzzles/<id>.json` — one puzzle's full data: grid size, suspects, clues, room layout
  (`roomGrid`), and furniture layout (`objectGrid`). See the top of `app.js` for the exact schema
  and `OBJECT_TYPES` for the known furniture types.
- `puzzles/source/` — original photos/PDFs a puzzle was transcribed from, kept for reference.
- `PUZZLE_IMPORT_PROMPT.md` — the process (and literal prompt text) for turning a new puzzle
  photo/PDF into a `puzzles/<id>.json` file + manifest entry. Run this locally (Claude Code can
  read the image/PDF directly) rather than calling an external AI API — keeps the app 100% static.

## Persistence

- Progress auto-saves to `localStorage`, keyed per puzzle id, and restores on reload.
- "Save to file" / "Load from file" export/import a JSON snapshot of grid state for moving
  progress across browsers or devices.
- Puzzle *data* (the grid/rooms/objects/clues) and puzzle *progress* (what the player has filled
  in) are separate concerns — progress files are tagged with a `puzzleId` and never touch
  `puzzles/*.json`.

## Status / Next up

Core solving interactions (pencil marks, definitive placement, cross-out, erase, drag-painting,
undo) and the multi-puzzle library are working. Not yet built: a "report the crime" fun/finishing
feature once solving mechanics feel complete.

## Conventions

- This is a standalone project inside the `adhoc-projects` multi-project repo — keep everything
  Murdoku-related self-contained within this directory.
- No production dependencies; kept deliberately dependency-free to stay free-hostable as a static
  site with zero build step.
