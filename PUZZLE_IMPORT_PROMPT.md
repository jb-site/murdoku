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
> **1–2. Get the text and the geometry, by source type.** The two capture
> methods diverge here — pick the branch that matches how you got this
> puzzle, then continue with step 3, which is the same either way.
>
> ### Source: PDF
>
> > **1. Extract the text layer first — it's nearly free and gives verbatim
> > wording.** Before touching the image, run `pdftotext -layout input.pdf -`
> > and read the output. For puzzles produced from this template, it cleanly
> > yields the `title`, `difficulty`, every room label, the legend's
> > occupiable/non-occupiable object names, and — most importantly — every
> > suspect's clue sentence(s), character-for-character. Treat this text as
> > the **authoritative source for clue wording** (see step 5) rather than
> > transcribing clues by eye off a rendered image; it's both cheaper (no
> > vision tokens) and more accurate (no OCR-by-eye drift). Two caveats to
> > watch for: (a) the PDF's own column/portrait layout can make `pdftotext`
> > interleave text in a jumbled order, so a sentence's *wording* is reliable
> > but which suspect it belongs to sometimes isn't — confirm attribution
> > against the image if a name-to-clue pairing looks ambiguous or a stray
> > extra name appears; (b) some PDFs have leftover invisible/placeholder
> > "Lorem ipsum" design text sitting behind the real clue text, which
> > `pdftotext` will happily extract mixed in with the real sentence — if a
> > clue's extracted text looks garbled or contains obvious filler Latin,
> > that one clue must be read directly off the rendered image instead.
> >
> > **2. Look closely at the image for everything spatial.** Render the PDF
> > to a high-resolution PNG (e.g. `pdftoppm -png -r 300 input.pdf output`)
> > and crop/zoom into the grid region — furniture icons and thin grid lines
> > are easy to misread at low resolution. Read each quadrant of the grid
> > separately if it's large. For a large grid (8+ per side), it's worth
> > detecting the exact pixel row/column boundaries programmatically (look
> > for the dark grid-line bands) and overlaying row/col labels on a copy of
> > the image before reading cells — far less error-prone than eyeballing
> > coordinates. Room boundaries, void cells, furniture positions/spans, and
> > suspect portraits/reading order are genuinely spatial information that
> > `pdftotext` can't give you — this pass is still required even when step 1
> > supplied the text.
>
> ### Source: photo
>
> > A photo has no text layer and no guaranteed flat, axis-aligned page —
> > perspective, roll, page curl and uneven light all stand between the raw
> > shot and something the usual reading techniques work on. Fix the input
> > before reading anything off it; don't try to read a skewed, unevenly-lit
> > photo directly.
> >
> > **1. Rectify the page first, so every read below happens on a flat
> > page.** Run `tools/photo_prep.py <id> --guide` to get a labelled
> > coordinate overlay, read the four page corners (TL, TR, BR, BL) off it,
> > then `tools/photo_prep.py <id> --page-quad x0,y0,x1,y1,x2,y2,x3,y3`. This
> > writes `puzzles/art/<id>/_page.png` — exactly the artefact `pdftoppm`
> > produces on the PDF path — and normalises illumination/white-balance/
> > sharpness so the same detectors `tools/extract_art.py` already has still
> > fire. If the book won't lie flat, shoot the grid and the clue block as
> > two separate photos (`--part grid` / `--part clues`) rather than fighting
> > one warped shot; see the shooting checklist below before you shoot at
> > all.
> >
> > **2. Transcribe the text with a doubled-read, since there's no text
> > layer to fall back on.**
> > - Crop the clue block out of the rectified page and read each suspect's
> >   card in isolation, at full resolution — a whole-page read is where
> >   OCR-by-eye drift lives, a single 400px-tall card crop is close to
> >   trivial. `tools/photo_prep.py <id> --clue-crops --rows N --cols M
> >   --clue-bbox x0,y0,x1,y1` (bbox read off the guide) slices the card grid
> >   automatically once `_page.png` exists.
> > - **Transcribe each clue twice, independently, and diff the two
> >   readings.** Any mismatch gets re-read at higher zoom before you accept
> >   it. This is the cheap substitute for having ground truth, and it costs
> >   far less than a wrong clue discovered after the story is written. Do
> >   the same doubled-read for the title, difficulty, room labels and the
> >   legend's occupiable/non-occupiable labels.
> > - **Write the result to `puzzles/source/<id>-transcript.txt` before
> >   writing any JSON.** This is the artefact that replaces the `pdftotext`
> >   output for this puzzle — step 8's verbatim diff below then works
> >   exactly as written, against this file instead of against recall.
> >
> > **Look closely at the rectified page for everything spatial** — the same
> > pass step 2 describes on the PDF branch, just against `_page.png` (or a
> > `--board-quad`-warped `board.png`, which needs zero further calibration —
> > see the checklist below) instead of a `pdftoppm` render. Room boundaries,
> > void cells, furniture positions/spans and suspect portraits/reading order
> > are still genuinely spatial and still need this pass regardless of where
> > the text came from.
> >
> > **Shooting checklist**, cheap to follow and expensive to skip after the
> > fact:
> > - Flatten the book; if a page won't lie flat, shoot the grid and the clue
> >   block separately — two clean quads beat one warped one.
> > - Diffuse, indirect light, camera parallel to the page, no flash. Glare
> >   over a grid line is unrecoverable; glare over blank paper is harmless.
> > - Frame the *whole* board plus a margin — the quad corners need to exist
> >   in the shot.
> > - Shoot at 8MP+ so a single grid cell comes out ≥120px after warping;
> >   furniture icons are the limiting detail.
> >
> > **Repo weight**: commit the rectified derivatives (`board.png`,
> > portraits, `legend.png`) as usual, plus the original photo downscaled to
> > 2400px on the long edge, JPEG quality 85, as `puzzles/source/<id>-page.jpg`
> > (preserves the "keep the source for reference" convention at a fraction
> > of the size). Full-resolution originals live under `puzzles/source/raw/`,
> > which is gitignored — they stay local, never committed.
>
> **3. Extract the grid structure:**
> - `rows` / `cols` — count the grid cells.
> - `rooms` — every named area (e.g. "Bedroom", "Kitchen"). Assign each a
>   short lowercase `id` (e.g. `bedroom`).
> - `roomGrid` — a `rows` × `cols` array of room ids, one per cell. Trace
>   the actual boundary lines cell-by-cell — rooms are often irregular
>   shapes, not clean rectangles. Look for a thicker/darker border between
>   cells in different rooms vs. a thin line between cells in the same room.
> - `roomGrid` voids — `rows`/`cols` always describe the **bounding
>   rectangle**, and every row still has exactly `cols` entries. If the
>   board's outline isn't a full rectangle, write `null` (JSON null, not the
>   string `"null"`) for each cell that isn't part of the board at all. This
>   covers cut corners, L-shapes and staircase edges, and equally a hole
>   punched in the middle of an otherwise solid grid.
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
> **Tall art bleeds into the cell above — anchor on the base, not the whole
> shape.** Some object art (trees especially) is taller than one cell and
> visually overlaps into the cell above it, even though it's a single 1×1
> object. A grid-line overlay tells you *which cell a pixel is in*, but it
> doesn't tell you whether that pixel is the object's true cell or bleed
> from the object below it — that's a separate judgment call. Resolve it by
> finding a small anchor feature that doesn't bleed (a trunk, a base, a
> shadow — something roughly the same size as the object's footprint) and
> checking which cell *that* falls in, rather than treating "this cell has
> some of the object's art in it" as proof the object is there. When two
> same-type objects are stacked vertically with overlapping canopies, expect
> to find only as many distinct anchors as there are real objects — don't
> assume every cell showing canopy has its own trunk.
>
> **A cell that isn't there is not the same as a cell nobody can stand on.**
> Two different things look similar at a glance: a cell holding a blocking
> object (a tree, a table) that a person can never occupy, and a cell that
> simply isn't part of the board. Encode the first with an `objects` entry —
> it still has a room, still draws its room's borders, still shows its
> furniture. Encode the second as `null` in `roomGrid` — it has no room, no
> art, and no borders of its own. Tell them apart by asking whether the
> **thick outer boundary line runs between that cell and the board**: if it
> does, the cell is outside, so `null`. A blocking object always sits
> *inside* the outline, tinted with its room's colour like every other cell
> in that room.
>
> **Trace the outer boundary before you read a single cell.** It's easy to
> assume the grid is a plain rectangle because the last puzzle was, and then
> quietly mis-index every row after the first irregularity. Follow the heavy
> outline all the way round first and write down where it steps in or out;
> the steps always land on cell boundaries, so each one is a whole number of
> rows/columns. Then lay your row/column overlay over the **bounding
> rectangle** (not the visible shape) so coordinates stay stable, and mark
> the excluded cells. Do this before object extraction — background artwork
> often bleeds into the excluded region and will otherwise read as
> furniture. Never infer that a row is "shorter" — infer that specific cells
> are absent; a row whose visible left edge starts two columns in still uses
> its true column indices (`2..11`, not `0..9`), or every object and room id
> in that row shifts.
>
> **If the puzzle is a vector PDF, measure rather than eyeball.**
> Illustrator-produced Murdoku PDFs often draw the full lattice and then
> clip it with a single polygon that *is* the outline, so the exact void set
> can sometimes be read straight out of the page's content stream instead of
> guessed from pixels — and the same stream can distinguish room boundaries
> from ordinary grid lines by the gap between adjacent cell rectangles (thin
> ≈ same room, roughly 3× thicker ≈ room divider). This is a heavier
> technique than the usual pixel-render-and-overlay approach and is worth
> reaching for only when a puzzle's irregularity makes the visual method
> genuinely unreliable — `puzzles/source/the-hiking-trip-color.pdf` is the
> worked example.
>
> **4. Object types.** Use these existing keys if the icon matches — occupiable
> (a person can be there): `bed`, `chair`, `car`, `oilslick`, `path`;
> blocking (a person can never be placed there): `tv`, `shelf`, `table`,
> `plant`, `tree`, `bonsai`, `cactus`, `lilypad`, `flower`, `shrub`, `bear`,
> `boulder`. Check
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
> **Two things drawn on one square** (a statue standing on a carpet, a house
> on sand) are a **ground + object pair**, not one object. Put the
> floor/terrain type (`carpet`, `sand`, `path`, `water`, `mudpuddle`,
> `oilslick`, `rubble`, `lilypad` — the types flagged `ground: true` in
> `OBJECT_TYPES`) in the puzzle's `ground` array, and the thing standing on
> it as a normal `objects` entry over the same cell. Don't use `ground` for
> an object that's alone on its square with nothing on top — that's still
> just a plain `objects` entry, exactly as before. A ground type keeps its
> own occupiability (e.g. `water` is blocking even with nothing on it), and
> unlike `objects`, `ground` cells don't need to form a rectangle.
>
> **5. Extract suspects and clues — verbatim, sourced from step 1's text.**
> - List every named person, in the order their portrait appears in the
>   image (use the image for reading order and name attribution even though
>   the wording comes from `pdftotext` — see step 1's caveats).
> - Assign each a single-letter id: A, B, C, ... in reading order — **except**
>   the victim, who is always assigned letter `V` regardless of where they'd
>   fall alphabetically.
> - `names` maps each letter to the full display name (append "(victim)" to
>   V's name).
> - Each clue is an object: `{ "suspect": "A", "text": "...", "refs": {...} }`.
>   `text` must be the clue **verbatim** from the pdftotext extraction (or
>   the image, for a clue step 1 flagged as garbled) — do not paraphrase,
>   restructure, or summarize away detail, and do not merge two separately
>   printed sentences into one reworded composite. The only transformation
>   allowed is substituting the printed pronoun for the person's name, per
>   this house style:
>   - If the printed clue starts with a pronoun ("He was beside a shelf."),
>     replace just the pronoun: `"Austin (A) was beside a shelf."`
>   - If the printed clue doesn't lead with a pronoun ("There was a woman
>     beside a crate in his area."), prefix `"Name (Letter): "` and
>     lowercase the original first letter, but otherwise leave the sentence
>     exactly as printed: `"Barry (B): there was a woman beside a crate in
>     his area."` — don't rewrite it into a pronoun-led sentence yourself
>     (e.g. don't turn this into "Barry (B) had a woman beside a crate in
>     his area.").
>   - A clue that's printed as two separate sentences (e.g. a personal line
>     plus a general board-rule line, or two numbered rules) may combine
>     them under one entry if they're printed together as one suspect's
>     clue, but two sentences that are printed as *distinct*, separately
>     numbered/labelled clues (e.g. a per-suspect clue and a general puzzle
>     rule that happens to appear near it) must become two separate `clues[]`
>     entries, the general one with `suspect: null` — never blended into a
>     single reworded sentence.
> - `refs` — the room ids and/or object type keys that clue actually talks
>   about, used to highlight the board on hover: e.g. a clue about "beside a
>   shelf" gets `"refs": {"objects": ["shelf"]}`; a clue about "in the
>   Kitchen" gets `"refs": {"rooms": ["kitchen"]}`. Leave both arrays empty
>   (or omit `refs` entirely) for a clue that references neither. Don't guess
>   refs from vague language — only add one when the clue clearly names that
>   room or object type.
>
> **6. Output.** Produce one JSON file matching this exact shape:
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
>   "roomGrid": [["roomid", null, "..."], ["...", "..."]],
>   "objects": [
>     { "type": "bed", "cells": [[0,0],[0,1]] },
>     { "type": "chair", "cells": [[2,3]] }
>   ],
>   "ground": [
>     { "type": "carpet", "cells": [[2,3]] }
>   ]
> }
> ```
>
> Omit `ground` entirely if the puzzle has no stacked ground+object squares.
>
> **7. Save and register it:**
> - Write the JSON to `murdoku/puzzles/<id>.json`.
> - Copy the original source image/PDF to `murdoku/puzzles/source/<id>.<ext>`.
> - Add `{ "id": "<id>", "title": "<title>", "file": "<id>.json" }` to the
>   array in `murdoku/puzzles/index.json` so it shows up in the app's puzzle
>   picker.
>
> **8. Verify in the in-app editor, then double-check the data.** Serve the
> app (`python3 -m http.server 8000` from `murdoku/`), click **✏️ Edit
> puzzle → 📂 Open file…** and load the JSON you just wrote. The editor
> renders the rooms, boundaries and furniture exactly as the app will, and
> its validation panel lists structural problems automatically (out-of-
> bounds or overlapping objects, cells with no room, unknown object types,
> clue refs pointing at rooms/objects that don't exist). Put the source
> image side by side with the browser and compare room boundaries and
> furniture cell-by-cell — this catches misreads far more reliably than
> re-reading your own JSON. Fix anything wrong with the Rooms/Objects tools
> and **⬇️ Download JSON** to get the corrected file back.
>
> Then a final manual pass:
> - Every row in `roomGrid` has exactly `cols` entries, and there are exactly
>   `rows` rows — `null` void entries count towards `cols` like any other
>   entry. Every row and every column contains at least one non-`null` cell.
> - Every `objects[].cells` entry is in-bounds, no cell is claimed by more
>   than one object, no cell is `null` in `roomGrid`, and each object's cells
>   form a filled rectangle.
> - Every `ground[].cells` entry is in-bounds, no cell is claimed by more
>   than one ground entry, no cell is `null` in `roomGrid`, and every
>   `ground[].type` is flagged `ground: true` in `OBJECT_TYPES`.
> - Every `refs.rooms` id exists in `rooms`, and every `refs.objects` type
>   exists in `OBJECT_TYPES`.
> - Every suspect letter is unique, `V` appears exactly once, and every
>   `clues[].suspect` (when not `null`) is one of `suspects`.
> - `puzzles/index.json` stays valid JSON (comma-separated array entries).
> - Spot-check a handful of cells against the source image one more time —
>   room/object misreads (and missed multi-cell spans) are the most common
>   mistakes.
> - Every `clues[].text` matches the `pdftotext` extraction verbatim (modulo
>   only the pronoun→name substitution from step 5) — diff it against the
>   raw extraction one more time and watch for reworded/merged sentences.
> - For a photo-sourced puzzle, run this same verbatim diff against
>   `puzzles/source/<id>-transcript.txt` instead — it plays the role the
>   `pdftotext` output plays on the PDF path.

---

## Importing multiple puzzles at once

When importing several puzzles in one session, run `pdftotext -layout` on
every source PDF **yourself, centrally, before dispatching any per-puzzle
work** (whether that's separate subagents or just separate passes of your
own). Read the output, assemble each puzzle's title/difficulty/room-labels/
clue-pool text, and hand that pre-extracted text directly into each
puzzle's import step instead of having each one re-derive it from the
image. This is the single biggest lever on both cost and accuracy: it cuts
the redundant "read this whole prompt doc + a full reference JSON + do a
full-page vision pass for text" overhead per puzzle, and it makes verbatim
clue capture (step 5) close to automatic instead of relying on careful
transcription-by-eye under time/token pressure. Each puzzle's remaining
work — grid/room/object extraction, suspect reading-order and clue
attribution, resolving any garbled/contaminated text flagged in step 1 — is
still genuinely visual and still needs the full image-inspection guidance
above; only the clue *wording* moves out of the image-reading budget.

This central pre-pass is a PDF-path optimisation and doesn't apply to a
photo-sourced puzzle in the batch — there's no single `pdftotext` step to
front-load, and each photo needs its own `tools/photo_prep.py --page-quad`
rectification (and, if the book's print stock is unusual, its own
`tools/extract_art.py --from-image --white-threshold ... --dark-threshold
...` values) before any reading happens. Run that per-puzzle prep first for
every photo in the batch, the same way `pdftotext` is run first for every
PDF, then dispatch each puzzle's remaining (still per-puzzle) grid/clue work
as normal.

---

## Reference example

`murdoku/puzzles/netflix-and-kill.json` (source: `murdoku/puzzles/source/netflix-and-kill-color.pdf`)
was built by following this exact process — use it as a worked example of
the expected shape and level of detail.
