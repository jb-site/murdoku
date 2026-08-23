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
> resolution. Read each quadrant of the grid separately if it's large.
>
> **2. Extract the grid structure:**
> - `rows` / `cols` — count the grid cells.
> - `rooms` — every named area (e.g. "Bedroom", "Kitchen"). Assign each a
>   short lowercase `id` (e.g. `bedroom`).
> - `roomGrid` — a `rows` × `cols` array of room ids, one per cell. Trace
>   the actual boundary lines cell-by-cell — rooms are often irregular
>   shapes, not clean rectangles. Look for a thicker/darker border between
>   cells in different rooms vs. a thin line between cells in the same room.
> - `objectGrid` — a `rows` × `cols` array where each cell is either `null`
>   (empty floor) or one of the known object type keys (see below). Match
>   furniture icons carefully — a chair and a sofa/bed can look similar at
>   low resolution.
>
> **3. Object types.** Use these existing keys if the icon matches:
> `bed`, `chair` (occupiable — a person can stand/sit there), `tv`, `shelf`,
> `table`, `plant` (blocking — a person can never be placed there). If you
> see an object that doesn't match any of these, say so explicitly rather
> than guessing — a new key needs a matching entry added to `OBJECT_TYPES`
> in `murdoku/app.js` (with an emoji and an `occupiable` flag) before the
> puzzle will render correctly.
>
> **4. Extract suspects and clues:**
> - List every named person, in the order they appear.
> - Assign each a single-letter id: A, B, C, ... in reading order — **except**
>   the victim, who is always assigned letter `V` regardless of where they'd
>   fall alphabetically.
> - `names` maps each letter to the full display name (append "(victim)" to
>   V's name).
> - `clues` — transcribe each suspect's clue text as faithfully as possible.
>   Keep them short and in the format `"Name (Letter) <clue text>."` for
>   readability, but don't paraphrase away meaningful detail (adjacency,
>   room references, counts like "the only person...").
>
> **5. Output.** Produce one JSON file matching this exact shape:
>
> ```json
> {
>   "id": "kebab-case-slug-of-the-title",
>   "title": "Puzzle Title",
>   "sourceFile": "source/original-filename.pdf",
>   "rows": 6,
>   "cols": 6,
>   "suspects": ["A", "B", "C", "V"],
>   "names": { "A": "Full Name", "V": "Full Name (victim)" },
>   "clues": ["..."],
>   "rooms": { "roomid": { "name": "Display Name" } },
>   "roomGrid": [["roomid", "..."], ["...", "..."]],
>   "objectGrid": [["bed", null], [null, "chair"]]
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
> - Every row in `roomGrid` and `objectGrid` has exactly `cols` entries, and
>   there are exactly `rows` rows in each.
> - Every suspect letter is unique, and `V` appears exactly once.
> - `puzzles/index.json` stays valid JSON (comma-separated array entries).
> - Spot-check a handful of cells against the source image one more time —
>   room/object misreads are the most common mistake.

---

## Reference example

`murdoku/puzzles/netflix-and-kill.json` (source: `murdoku/puzzles/source/netflix-and-kill-color.pdf`)
was built by following this exact process — use it as a worked example of
the expected shape and level of detail.
