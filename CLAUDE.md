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

## Solving and the verdict

Once every suspect (including `V`) is placed — `isComplete()`, checked at the end of every
`renderMarks()` call alongside the existing `updatePlacedStates()` — a `Solved!?` button appears
below the grid, next to `#status`. Clicking it runs two checks, in order:

1. **Structural check (`findConflicts()`), no fetch.** Two placements sharing a row, two sharing
   a column, or the same letter placed twice (all genuinely reachable — see `placeDefinitely()`'s
   auto-cross behaviour) short-circuit straight to a verdict. A scrambled grid never triggers a
   solution fetch, so it can't leak the answer's shape.
2. **Solution check**, only once the grid is structurally legal. `puzzles/solutions/<id>.json`
   is fetched lazily — on click, never at puzzle load — and cached in memory per puzzle id
   (`solutionCache`; a 404 or parse failure caches as the string `"none"`). It's kept as a
   separate file from `puzzles/<id>.json`, not a key inside it, for two reasons: the in-app
   editor round-trips the puzzle file through `enterEditMode()` → `Download JSON`, and a spoiler
   key living inside that object would be one silent bug away from riding along on that export;
   and lazy-fetching only works at all if the answer isn't already sitting in the response the
   puzzle loaded from. All 12 puzzles currently have a solution file, checked for internal
   consistency (a legal placement, and the murderer named in the source PDF is exactly the
   single person sharing the victim's room) by `tools/check_solutions.py`.

The outcome is stored in a module-level `verdict` (`null` when there isn't one) and rendered two
ways: a dismissible `#verdictPanel`/`#verdictBackdrop` overlay carries the cosy-comic verdict
copy, and `applyHighlights()` reads `verdict.cells` / `verdict.accusedCell` on every pass to ring
the wrongly-placed suspects (and, distinctly, a wrongly-accused one) directly on the grid. That
highlighting is deliberately independent of the panel — dismissing the panel leaves the rings up
so the player can go fix the flagged cells. The invariant that makes this safe: **`verdict` is
cleared at the very top of `renderMarks()`**, the same choke-point every mutation already passes
through (place, pencil, undo, Clear, file/localStorage load, edit-mode enter/exit), so a stale
"you were wrong" ring can never survive a real change to the board. A `gridGeneration` counter is
bumped alongside it so an in-flight solution fetch that outlives a mid-check mutation (or a
puzzle switch) is detected and discarded when it resolves, rather than painted onto a different
board.

## Solving and the reveal (the story)

On a `correct` verdict, the terse "Case closed" text is replaced by a short cosy-comic reveal
story instead — the same `#verdictPanel`/`#verdictBackdrop` overlay becomes the story panel
(`.story-panel` class added for a wider layout), rather than being a separate UI surface.

- **`puzzles/stories/<id>.json`** holds the story: `title`, `acts` (3 short prose paragraphs),
  `whereabouts` (one line per suspect, keyed by letter — "what were they doing"), `reveal` (a
  paragraph naming the murderer/room/method), and `escape` (`generic` plus one `byAccused[letter]`
  line per non-murderer suspect, used by the not-yet-built Phase E wrong-arrest reveal). Like the
  solution files, this is a separate file from `puzzles/<id>.json` for the same reason: it must
  never ride along on the editor's `Download JSON` export, and lazy-fetching it (`storyCache`,
  same pattern as `solutionCache`) only works if it isn't already sitting in the puzzle's own
  load response.
- **`tools/story_context.py <id>`** (or `--all`) builds `story_context/<id>.json` by joining a
  puzzle and its solution file — every spatial fact a story needs (who shares a room with whom,
  who's orthogonally adjacent, what someone's on/beside, each clue verbatim, an ASCII map of the
  solved board) computed by plain code, so the model drafting the actual prose never has to
  re-derive geometry from a `roomGrid` and a coordinate list — that's exactly the kind of
  reasoning that goes quietly wrong, and a story that puts two characters in the same scene when
  they were in different rooms is the most likely way this feature fails. This is authoring-time
  tooling only; nothing under `story_context/` is fetched by the app.
- **`STORY_PROMPT.md`** is the literal authoring prompt (same house pattern as
  `PUZZLE_IMPORT_PROMPT.md`) — run manually per puzzle by an assistant that reads the
  `story_context/<id>.json` output plus the puzzle's portraits (`art.portraits` if present,
  otherwise the source PDF's portrait row) and writes `puzzles/stories/<id>.json` by hand. No
  API call, nothing at runtime — this keeps the app 100% static.
- **`tools/check_stories.py <id>`** (or `--all`) audits a finished story back against its
  `story_context/<id>.json`: every suspect must have a `whereabouts` line and (if not the
  murderer or victim) an `escape.byAccused` line, no name from a *different* puzzle's cast may
  leak in, and no `escape` line may name the real murderer or the murder-scene room (the
  spoiler rule — a player who guessed wrong and reads the escape copy must not be spoiled). It
  also flags (as non-blocking warnings, since these are text heuristics) a `whereabouts` line
  that just restates the room instead of naming an activity, and two characters named in the
  same act paragraph when the context never puts them in the same room or adjacent.
- **`murdoku:solved`** (localStorage) is the set of puzzle ids ever solved correctly
  (`markSolved()`), independent of per-puzzle progress. It drives a `📖 The story` button
  (`storyBtn`, next to `Solved!?`) that reopens the story panel for any already-solved puzzle
  without re-running the solve checks.

## Status / Next up

Core solving interactions (pencil marks, definitive placement via click/hold/drag, cross-out,
erase, undo), room/object rendering with SVG art and multi-cell spans, room labels, a legend,
hover status, clue-ref highlighting, irregular/non-rectangular grids (void cells), the row/column
bulk-fill headers, the side-by-side clues layout, the multi-puzzle library, the in-app puzzle
editor mode (rows/cols, rooms, objects, JSON import/export/validation), completion detection plus
the two-check verdict, and the cosy-comic reveal story on a correct solve are all working for all
12 puzzles. Not yet built: structured suspects/clues editing in the editor (currently a raw-JSON
textarea), the opt-in "show me what happened anyway" escape path after a wrong solve (Phase E —
the `escape` data already exists in every story file), and importing the two puzzles still sitting
unimported in `puzzles/source/` (`a-walk-in-the-park`, `the-backyard-garden`).

## Conventions

- This is a standalone project inside the `adhoc-projects` multi-project repo — keep everything
  Murdoku-related self-contained within this directory.
- No production dependencies; kept deliberately dependency-free to stay free-hostable as a static
  site with zero build step.
