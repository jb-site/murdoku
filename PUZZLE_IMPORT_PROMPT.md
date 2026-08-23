# Murdoku puzzle import prompt

Use this prompt (paste it into a fresh Claude Code session, or hand it to any
vision-capable AI assistant along with the puzzle image/PDF) to turn a photo
or PDF of a Murdoku puzzle into a puzzle file this app can load. This is a
manual-but-AI-assisted process — no backend or API key needed, since it's run
locally by an assistant that can already read images/PDFs directly.

---

## Prompt

> You are converting a photo or PDF of a "Murdoku" (whodunnit-sudoku) puzzle
> into a JSON file for the Murdoku web app at `murdoku/`.
>
> **1. Look closely.** If it's a PDF, render it to a high-resolution PNG
> (e.g. `pdftoppm -png -r 300 input.pdf output`) and crop/zoom into the grid
> region — furniture icons and thin grid lines are easy to misread at low
> resolution. Read each quadrant of the grid separately if it's large. For a
> large grid (8+ per side), it's worth detecting the exact pixel row/column
> boundaries programmatically (look for the dark grid-line bands) and
> overlaying row/col labels on a copy of the image before reading cells —
> far less error-prone than eyeballing coordinates. Also note the `title`
> and `difficulty` shown near the puzzle's logo (e.g. "difficulty: easy").
>
> **2. Extract the grid structure:**
> - `rows` / `cols` — count the grid cells.
> - `rooms` — every named area (e.g. "Bedroom", "Kitchen"). Assign each a
>   short lowercase `id` (e.g. `bedroom`).
> - `roomGrid` — a `rows` × `cols` array of room ids, one per cell. Trace
>   the actual boundary lines cell-by-cell — rooms are often irregular
>   shapes, not clean rectangles. Look for a thicker/darker border between
>   cells in different rooms vs. a thin line between cells in the same room.
> - `objects` — a list of every physical object and every cell it covers:
>   `{ "type": "bed", "cells": [[0,0],[0,1]] }`. Look extremely carefully at
>   whether a piece of furniture spans more than one grid cell (a wide bed or
>   dining table often does) — that's ONE object with multiple `cells`
>   entries. **Never infer a span from two same-type icons sitting next to
>   each other** (e.g. two side-by-side chairs are TWO separate 1×1 objects,
>   not one 1×2 object) — a span exists only when it's genuinely one piece of
>   furniture drawn across cells with no dividing line through it. Each
>   object's `cells` must form a filled rectangle (1×1, 1×N, N×1 or N×M).
>
> **3. Object types.** Use these existing keys if the icon matches — occupiable
> (a person can be there): `bed`, `chair`, `car`, `oilslick`, `path`;
> blocking (a person can never be placed there): `tv`, `shelf`, `table`,
> `plant`, `tree`, `bonsai`, `cactus`, `lilypad`, `flower`, `shrub`. Check
> the legend on the puzzle image itself ("Can be occupied" / "Cannot be
> occupied") — occupiability is a puzzle-design choice, not something to
> guess from the icon alone. Note `path` is a real object type (a distinct
> paved-tile floor), not the same as a plain unmarked floor cell (`null`) —
> only mark a cell `path` if the artwork shows a distinct tile/brick texture
> the legend calls out, not just "any walkable floor". If you see an object
> that doesn't match any of these, say so explicitly rather than
> guessing — a new key needs a matching `art(colSpan, rowSpan)` SVG
> renderer plus `label` and `occupiable` added to `OBJECT_TYPES` in
> `murdoku/app.js` before the puzzle will render correctly.
>
> **4. Extract suspects and clues:**
> - List every named person, in the order they appear.
> - Assign each a single-letter id: A, B, C, ... in reading order — **except**
>   the victim, who is always assigned letter `V` regardless of where they'd
>   fall alphabetically.
> - `names` maps each letter to the full display name (append "(victim)" to
>   V's name).
> - Each clue is an object: `{ "suspect": "A", "text": "...", "refs": {...} }`.
>   `text` should faithfully transcribe the clue (format
>   `"Name (Letter) <clue text>."` reads well, but don't paraphrase away
>   meaningful detail — adjacency, room references, counts like "the only
>   person..."). Use `suspect: null` for a general/rule clue that isn't tied
>   to one person (e.g. a fact about the victim's murder).
> - `refs` — the room ids and/or object type keys that clue actually talks
>   about, used to highlight the board on hover: e.g. a clue about "beside a
>   shelf" gets `"refs": {"objects": ["shelf"]}`; a clue about "in the
>   Kitchen" gets `"refs": {"rooms": ["kitchen"]}`. Leave both arrays empty
>   (or omit `refs` entirely) for a clue that references neither. Don't guess
>   refs from vague language — only add one when the clue clearly names that
>   room or object type.
>
> **5. Output.** Produce one JSON file matching this exact shape:
>
> ```json
> {
>   "id": "kebab-case-slug-of-the-title",
>   "title": "Puzzle Title",
>   "difficulty": "easy",
>   "sourceFile": "source/original-filename.pdf",
>   "rows": 6,
>   "cols": 6,
>   "suspects": ["A", "B", "C", "V"],
>   "names": { "A": "Full Name", "V": "Full Name (victim)" },
>   "clues": [
>     { "suspect": "A", "text": "...", "refs": { "objects": ["shelf"] } }
>   ],
>   "rooms": { "roomid": { "name": "Display Name" } },
>   "roomGrid": [["roomid", "..."], ["...", "..."]],
>   "objects": [
>     { "type": "bed", "cells": [[0,0],[0,1]] },
>     { "type": "chair", "cells": [[2,3]] }
>   ]
> }
> ```
>
> **6. Save and register it:**
> - Write the JSON to `murdoku/puzzles/<id>.json`.
> - Copy the original source image/PDF to `murdoku/puzzles/source/<id>.<ext>`.
> - Add `{ "id": "<id>", "title": "<title>", "file": "<id>.json" }` to the
>   array in `murdoku/puzzles/index.json` so it shows up in the app's puzzle
>   picker.
>
> **7. Double-check before finishing:**
> - Every row in `roomGrid` has exactly `cols` entries, and there are exactly
>   `rows` rows.
> - Every `objects[].cells` entry is in-bounds, no cell is claimed by more
>   than one object, and each object's cells form a filled rectangle.
> - Every `refs.rooms` id exists in `rooms`, and every `refs.objects` type
>   exists in `OBJECT_TYPES`.
> - Every suspect letter is unique, `V` appears exactly once, and every
>   `clues[].suspect` (when not `null`) is one of `suspects`.
> - `puzzles/index.json` stays valid JSON (comma-separated array entries).
> - Spot-check a handful of cells against the source image one more time —
>   room/object misreads (and missed multi-cell spans) are the most common
>   mistakes.

---

## Reference example

`murdoku/puzzles/netflix-and-kill.json` (source: `murdoku/puzzles/source/netflix-and-kill-color.pdf`)
was built by following this exact process — use it as a worked example of
the expected shape and level of detail.
