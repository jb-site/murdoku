# PLAN — "Solved!?", verdict checking, and the reveal story

Delivers three linked features:

1. **Completion detection** → a `Solved!?` button appears once every suspect is on the board.
2. **Verdict checking** → row/column conflicts and a comparison against the official
   solution, with the offending people highlighted and a themed failure message.
3. **The reveal** → a per-puzzle, LLM-authored narrative of what actually happened,
   surfaced on a correct solve (and, on request, an "and so the killer walked free"
   variant after a wrong one).

Plus the one-off data work that underpins 2 and 3: extracting each puzzle's official
solution from its solution PDF.

---

## 0. Data model — where solutions and stories live

Two new directories, both fetched **lazily** (only when the player presses `Solved!?`),
never at puzzle load. This is a static site, so nothing is truly hidden — but not shipping
the answer in the same request as the puzzle means a curious player can't spoil themselves
by glancing at the network tab while solving.

```
puzzles/solutions/<id>.json     # factual extraction from the solution PDF
puzzles/stories/<id>.json       # LLM-authored narrative (spoiler content)
puzzles/source/<id>-solution.pdf  # the uploaded solution PDF, kept for reference
```

Keeping these **out of `puzzles/<id>.json`** matters for a second reason: the in-app editor
round-trips the puzzle file through `enterEditMode()` → `⬇️ Download JSON`, and any key the
editor doesn't know about is at risk of being dropped or stale-copied on export. Solution
and story data must not be able to ride along on that path.

Keeping solution and story as **separate files** (rather than one spoiler file) matters
because they have different lifecycles: the solution is a one-off mechanical extraction that
gets verified once and then never changes; the story is creative output we'll want to
regenerate and iterate on per puzzle without risking the verified facts.

### `puzzles/solutions/<id>.json`

```json
{
  "puzzleId": "netflix-and-kill",
  "sourceFile": "source/netflix-and-kill-solution.pdf",
  "placements": {
    "A": [2, 0], "B": [0, 1], "C": [1, 3], "D": [5, 0], "E": [4, 4], "V": [3, 2]
  },
  "murderer": "C",
  "solutionNotes": "verbatim explanatory text from the solution page, if any"
}
```

- `placements` — **0-indexed `[row, col]`**, matching the app's internal model exactly
  (`grid[r][c]`), *not* the 1-based row/column numbers printed on the puzzle. This is the
  single most likely source of a silent off-by-one, so the extraction prompt states it
  twice and the validator checks it.
- Every letter in the puzzle's `suspects` array must appear, **including `V`** — the player
  places the victim too, so the victim's cell is part of the answer being checked.
- `murderer` — the letter, derivable from the grid (the non-`V` suspect sharing `V`'s room)
  but captured verbatim from the solution page so we're never inferring the one fact the
  whole puzzle turns on. The validator cross-checks the two agree.

### `puzzles/stories/<id>.json`

```json
{
  "puzzleId": "netflix-and-kill",
  "title": "A Quiet Night In",
  "motive": "one-line summary",
  "method": "one-line summary",
  "acts": ["paragraph 1", "paragraph 2", "paragraph 3"],
  "whereabouts": { "A": "one line on what Austin was doing there", "...": "" },
  "reveal": "the closing paragraph naming the murderer",
  "escape": {
    "generic": "the killer slipped out while the police argued over the seating plan…",
    "byAccused": { "A": "…and Austin spent the night in a cell for it.", "...": "" }
  }
}
```

`escape.byAccused` gives the "you arrested the wrong person" path a specific, funny line per
suspect. It's one extra ask in the same LLM pass, so it costs almost nothing to produce and
makes the failure state feel authored rather than templated.

---

## 1. Phase A — extract the official solutions (one-off, blocked on the PDFs)

**Blocked on:** you dropping the solution PDFs into `puzzles/source/` as
`<id>-solution.pdf`. Everything in Phases B and C can proceed in parallel using a
hand-written solution for one puzzle as a fixture.

### A1. Extraction process — `SOLUTION_IMPORT_PROMPT.md`

Mirrors the existing `PUZZLE_IMPORT_PROMPT.md` in structure and philosophy, and reuses its
hard-won lessons — those exist because reading a Murdoku grid by eye is error-prone, and a
solution grid is the same grid with letters on it:

- `pdftotext -layout` first for any prose explanation and the murderer's name.
- `pdftoppm -png -r 300` and read the grid with a programmatic row/column overlay for
  anything spatial — the same technique the puzzle import prompt mandates.
- **Trace the outer boundary and reuse the puzzle's existing `roomGrid` as the coordinate
  frame.** The solution grid has the same bounding rectangle and the same voids as the
  puzzle we already transcribed, so we are not re-deriving geometry — we're only reading
  which cell each letter sits in, against a frame we already trust. Where the solution PDF's
  visible shape starts two columns in, the true column indices still apply.
- Output the JSON above; copy the PDF to `puzzles/source/<id>-solution.pdf`.

For all 12 at once, follow the "importing multiple puzzles" guidance: run `pdftotext` over
every solution PDF centrally first, then do the per-puzzle visual pass.

### A2. Validator — `tools/check_solutions.py`

Cheap, mechanical, and catches essentially every plausible transcription slip. For each
`puzzles/solutions/<id>.json`, cross-referenced against `puzzles/<id>.json`:

- every letter in `suspects` is present exactly once, and no extra letters;
- every cell is in bounds, is not a void (`roomGrid[r][c] === null`), and is not a blocking
  object cell (the same `isBlocked` rule the app enforces);
- **no two people share a row; no two share a column** — the puzzle's core rule, and the
  single best detector of a misread letter;
- exactly one non-`V` suspect shares `V`'s room, and it equals `murderer` — this is the
  standing "the victim was alone with the murderer" clue, present in every puzzle checked
  so far; where a puzzle words it differently the check downgrades to a warning;
- `puzzleId` matches the filename, and every solution file has a matching puzzle.

Run it as a gate before committing the extractions. A green run means the solution is a
structurally legal Murdoku answer — not proof it's *the* answer, but a misread letter almost
always breaks one of these rules.

### A3. Human verification — `?reveal=1`

A small authoring affordance: with `?reveal=1` in the URL, a `🔍 Reveal` button loads the
solution file and paints it onto the board (ghosted letters in `layer-marks`). Put the
solution PDF beside the browser and confirm cell-by-cell. This is the same
"render it and compare against the source" verification loop the puzzle import prompt uses
for rooms and furniture, and it's what actually catches the errors the validator can't.

---

## 2. Phase B — completion detection and the `Solved!?` button

### B1. Detection

```js
function isComplete() {
  const placed = getPlacedLetters();
  return PUZZLE.suspects.every((l) => placed.has(l));
}
```

`getPlacedLetters()` already exists and is already derived from `grid` rather than tracked
separately — so hooking the new `updateSolveButton()` onto the **end of `renderMarks()`**,
right beside the existing `updatePlacedStates()` call, makes completion correct for free
across undo, `Clear`, file load, and localStorage restore. That is exactly the reasoning in
the existing comment above `getPlacedLetters()`, and this feature is why it was worth
writing that way.

Guard: no-op when `EDIT` is set — the editor swaps `PUZZLE`/`grid` wholesale, and a draft
board is not something you can solve.

### B2. Placement in the UI

The button goes **below the grid inside `.grid-wrap`, next to `#status`** — not into the
toolbar. The toolbar is a flex row of persistent controls; a button that appears and
disappears there would reflow the whole row (and on narrow viewports, wrap it) every time
the player places or removes their last suspect. Below the grid it appears in dead space and
shifts nothing.

Styled as an accent button with a one-shot attention animation on appearance
(`@keyframes`), gated behind `prefers-reduced-motion`.

---

## 3. Phase C — the two checks and the verdict UI

On `Solved!?`, in order:

### C1. Structural check (2a) — no fetch needed

```js
function findConflicts() // → { rows: [...], cols: [...], duplicates: [...], cells: Set("r,c") }
```

Group the placed cells by row and by column; any line holding two or more is a conflict and
every cell in it is flagged. Also flag **the same letter placed in two cells** — currently
possible, because `placeDefinitely()` doesn't clear that suspect's existing placement
elsewhere, so `A` can legitimately end up on the board twice.

Worth stating plainly: this check *is* reachable in normal play. `placeDefinitely()`
auto-crosses the rest of the row and column, but `canApplySelection()` only refuses a cell
that already has a `definite` — a hold on a crossed cell places anyway. So a player who
places, changes their mind, and re-places without erasing can absolutely end up with two
people in a row.

Fires the "the criminal escaped!" class of message. **Stops here** — no solution fetch, so a
structurally broken grid never leaks the answer's shape.

### C2. Solution check (2b)

Fetch `puzzles/solutions/<id>.json` (cached in memory after the first fetch), then compare
cell-for-cell. Classify the outcome, most specific first:

| Outcome | Condition | Message |
|---|---|---|
| **Correct** | every letter on its solution cell | → the story (Phase D) |
| **Body misplaced** | `V` is on the wrong cell | "You don't even know where the body is." |
| **Wrong arrest** | exactly one non-`V` suspect shares `V`'s room, and it isn't `murderer` | "You arrested *Barbara*. *Charlotte* sends her regards from Rio." |
| **Nobody accused** | no suspect in `V`'s room | "You've left the victim alone. Case closed, unsolved." |
| **Generic** | anything else | "The criminal escaped!" |

The "wrong arrest" case is the one worth getting right — it's the near-miss where the player
had a coherent theory and picked the wrong person, and it deserves a different sting from a
grid that's simply scrambled.

Highlighting: every suspect **not on their solution cell** gets flagged, and the accused (if
any) gets a distinct treatment from the merely-misplaced.

### C3. Rendering the verdict

New module-level `verdict` state (`null` when none), applied to `layer-marks` cells by a
`applyVerdictClasses()` call folded into `applyHighlights()` — the same discipline the rest
of the app follows: `renderStatic()` owns structure, `renderMarks()`/`applyHighlights()`
only rewrite classes and content on existing elements, so an in-flight gesture never has DOM
pulled from under it.

**`verdict` must be cleared on any grid mutation** — `pushHistory()` is the single
choke-point every mutating action already passes through, plus `initPuzzle()` and the
progress-restore paths. A stale "you were wrong" ring on a cell the player has since
changed would be actively misleading.

The message itself goes in a new `#verdictPanel` — a dismissible overlay card (there's no
modal/dialog pattern in the app today, so this is new CSS). It carries the message, the
grid stays visible and highlighted behind it, and it offers:

- **wrong** → `Keep trying` (dismiss) · `Show me what happened anyway` (→ Phase E)
- **right** → `Read what happened` (→ Phase D)

### C4. Solved state persistence

`localStorage["murdoku:solved"]` — a set of puzzle ids solved correctly. Gives us a `✓` in
the puzzle picker and lets the story stay re-readable from a button rather than only in the
moment of solving.

---

## 4. Phase D — the story

### D1. Building the LLM input

The single biggest determinant of story quality is that the model gets an accurate,
unambiguous picture of *who was where, next to what, and next to whom* — inferring that from
raw JSON is exactly the kind of spatial reasoning that goes quietly wrong. So we build the
brief mechanically with `tools/story_context.py`, which joins `puzzles/<id>.json` +
`puzzles/solutions/<id>.json` and emits a markdown brief:

**Board level**
- title, difficulty, room names.
- An **ASCII map of the solved board** — one row per grid row, each cell showing its room
  initial, its object (if any), and its occupant. This is the ground truth the model reasons
  over, rather than re-deriving geometry from coordinate lists.
- The general (`suspect: null`) clues verbatim — these often carry scene-setting facts
  ("there are two empty rows, each contains a bear").

**Per person** — a block each, in letter order:
- name, letter, and role (`victim` / `murderer` / `suspect`);
- **room** they're in, and **what they're on/at** — the object in their cell, phrased for
  the object's semantics (`sitting in a chair`, `on the bed`, `in the car`, `standing on the
  path`, `on open floor`);
- **what's beside them** — the object types in the four orthogonally adjacent cells;
- **who's with them** — everyone else in the same room, and separately anyone in an adjacent
  cell. "Who was with whom at the moment of the murder" is precisely what makes an
  interwoven story possible, so it's computed and stated explicitly, not left to be inferred;
- their own clue verbatim — these are full of characterful detail worth reusing ("everyone
  on the Windy Trail wore a cap");
- for the murderer: an explicit list of every object in and adjacent to their cell, since
  that's the raw material for a plausible *method*.

**Appearance** — the puzzle's portrait art is the one input the script can't produce. Where
`art.portraits` exists (currently only *The Hiking Trip*), pass the images; otherwise pass
the relevant page of `puzzles/source/<id>-color.pdf` and have the model describe each
character's look from the portrait row. Since story generation is a one-off authoring task
run locally by an assistant that reads PDFs directly, this costs nothing at runtime.

Capture the portrait as **concrete observable detail, not vibes** — clothing, props held,
posture, apparent age, expression, anything they're carrying or wearing. "Middle-aged man in
a stained apron holding a ladle" is usable; "looks suspicious" is not. Props especially: an
object in someone's hands is the strongest single hook the story has, and it's frequently
the thing that explains why they were where they were.

### D1b. The triangulation step — *what was this person doing?*

This is the step that turns a list of facts into a scene, so the brief makes it an explicit,
per-person task rather than leaving it as a side effect of drafting prose. For each
character, the model first writes a one-line **occupation of the moment**, reasoned from
three inputs together:

| Input | What it contributes |
|---|---|
| **The room they're in** | the activity available there — a Kitchen, a Courtroom and a Ranger's Hut each imply a completely different reason to be standing in them |
| **Their portrait** | who they are and what they brought — clothing, props, apparent role |
| **Their clue** | the specific, printed, canonical detail about them ("was the only person sitting in a chair", "everyone on the Windy Trail wore a cap") |

Plus the cell-level facts already in the brief: the object they're on or beside, and who was
with them.

The interesting output comes from the **intersection** of the three, not from any one of
them. A woman in gardening gloves standing in the Greenhouse beside a plant is watering it;
the same woman in the Courtroom beside a shelf is a different, funnier proposition, and the
story should be reaching for that reading rather than describing the room generically. Where
the three inputs pull against each other, that tension is a gift — a person dressed for the
beach standing in the boiler room is a story hook, and the brief should say so explicitly
rather than smoothing it over.

These one-liners become `whereabouts` in the story JSON (so they're directly what the
"where everyone was" list renders), and they're also the raw material the acts draw on — the
model writes all of them **before** drafting the narrative, so the prose is assembled from a
cast who already have something to be doing, rather than characters being invented to fill
sentences.

### D2. The prompt — `STORY_PROMPT.md`

Same house pattern as `PUZZLE_IMPORT_PROMPT.md`: a literal prompt to paste, with the brief
from D1 pasted under it. Its shape:

- **Facts are inviolable.** Every stated position, room, object and adjacency is fact. The
  story must not move anyone, invent furniture that isn't on the board, or contradict a
  clue. Where the story needs a detail the board doesn't supply, invent freely — but it must
  be *unfalsifiable* from the board, not contradictory to it.
- **The method must be physically available.** It should plausibly involve something in or
  beside the murderer's cell (or the victim's), or at minimum not be something the scene
  visibly rules out.
- **Do the triangulation first.** Before writing a word of narrative, produce the
  `whereabouts` line for every character per D1b — room × portrait × clue. The acts are then
  written *from* those lines. This ordering is the difference between a story where everyone
  has a reason to be there and one where half the cast are furniture.
- **Interweave.** Every named character gets at least one line of business; at least three
  should have a thread connecting them to someone else. Use who-was-with-whom from the brief
  as the seed for those threads.
- **Rooms are settings, not labels.** Where several people share a room, they share a scene —
  write it as one, rather than as separate people who happen to have the same room name
  attached.
- **Tone.** Cosy-comic whodunnit — *Cluedo* by way of *Knives Out*. Bloodless, wry, no gore,
  no real-world sensitive material.
- **Length.** 3 short acts, ~350–450 words total, plus one line per character, plus a reveal
  paragraph.
- **Also produce the escape variants** — `escape.generic` plus one `escape.byAccused` line
  per suspect, each a single wry sentence on that person being hauled off while the real
  killer walks. Generating these in the same pass keeps them consistent with the story's
  established characterisation, which is the whole point of doing them per-puzzle.
- **Output** — the `puzzles/stories/<id>.json` shape above, and nothing else.

### D3. Testing the prompt before the batch

Generate against two deliberately different puzzles first and read the output critically:

- **`netflix-and-kill`** — 6 suspects, 6×6, one flat, four rooms. The floor case.
- **`the-hiking-trip`** — 12 suspects, portraits available, rich clue flavour (caps,
  glasses, bears), sprawling outdoor board. The stress case; if the interweaving works here
  it works anywhere.

Check specifically for: anyone silently relocated; furniture invented; a method that
contradicts the scene; characters mentioned only in a list rather than given business; the
reveal spoiling itself in act one. And the D1b-specific failure to watch for — a
`whereabouts` line that only restates the room ("Dean was in the Kitchen") instead of
triangulating room × portrait × clue into an actual activity. That's the tell that the model
skipped the reasoning step and went straight to prose. Fix the prompt, re-run both, then batch the remaining 10.
Re-run `tools/check_solutions.py`-style validation on the story files too — a small
`tools/check_stories.py` confirming every suspect letter has a `whereabouts` and an
`escape.byAccused` entry, and that no story references a name that isn't in the cast.

### D4. Surfacing it

On a correct solve, the verdict panel becomes the story panel: title, the acts, then a
"where everyone was" list — each line prefixed with the suspect's coloured chip (and their
portrait where the puzzle has them, reusing the existing `.clue-portrait` styling), with the
murderer's line revealed last. Re-openable afterwards from a `📖 The story` button for any
puzzle in the solved set.

---

## 5. Phase E — the escape narrative

Strictly opt-in: only ever behind `Show me what happened anyway` on the verdict panel, so a
player who wants to keep trying is never spoiled. It shows the full story (Phase D), topped
with the escape framing: `escape.byAccused[<who they arrested>]` when they made a wrong
arrest, otherwise `escape.generic`.

Solving the puzzle correctly afterwards should still work normally — the escape reveal marks
nothing as solved.

---

## Build order and dependencies

| Phase | Depends on | Ships |
|---|---|---|
| **B** — completion + button | nothing | immediately |
| **C** — checks + verdict UI | one solution file (hand-write `netflix-and-kill` as a fixture) | immediately |
| **A** — extract 12 solutions + validator | **your solution PDFs** | on upload |
| **D** — story pipeline + UI | A | after A |
| **E** — escape path | C + D | after D |

B and C are the whole interactive feature and don't need the PDFs — a hand-written fixture
solution for one puzzle exercises every code path, and Phase A then just fills in the data.

---

## Also to do

- **`CLAUDE.md`** — a new "Solving and the reveal" section covering the solution/story file
  split, the lazy-fetch rule, and the `verdict`-cleared-on-`pushHistory()` invariant.
- **`.gitignore` / repo hygiene** — solution PDFs go in `puzzles/source/` alongside the
  existing puzzle PDFs, same treatment.
- **Editor safety** — confirm `enterEditMode()`/`Download JSON` can't pick up solution or
  story data (they can't, given the file split, but worth an explicit check).

## Decisions (settled)

1. **Tone — cosy-comic.** *Cluedo* by way of *Knives Out*: bloodless, wry, affectionate
   about its cast. Matches the puzzles' own cartoon artwork and titles like "Netflix and
   Kill". `STORY_PROMPT.md` states this as a hard constraint, since it's a one-way door
   across all 12 puzzles.
2. **Length — ~400 words in 3 acts**, plus one `whereabouts` line per character and a
   reveal paragraph. Reads in one panel without much scrolling, and leaves room to give even
   a 12-suspect cast a piece of business each.
3. **No obfuscation.** Solution files ship as plain, readable JSON. Lazy-fetching already
   keeps the answer out of the puzzle load, which is the spoiler that actually matters;
   base64 would stop nobody determined while making the files unreadable to us during
   authoring and validation.
4. **Build order — Phases B and C first**, against a real `netflix-and-kill` solution, with
   Phase A extraction filling in the remaining 11 once the PDFs land.

---

## Phase A outcome — 11 of 12 solutions extracted

Done, and each one passes `tools/check_solutions.py` independently of how it was derived.
Two of the three methods needed no vision at all:

- **`tools/extract_solutions.py` (9 puzzles).** These PDFs draw the grid letters as real text,
  so `pdftotext -bbox` gives every letter a coordinate. And because a Murdoku solution is a
  permutation — exactly one person per row and per column — a letter's column is simply its
  rank when the letters are sorted by x, with no grid geometry to measure and nothing riding
  on the printed `R#`/`C#` labels (which are **wrong** on some pages: `netflix-and-kill`
  prints `C1..C9` beneath a 6-column grid). For the two puzzles with more lines than
  suspects (`the-hiking-trip`, `sleeping-with-the-fishes`) one axis still ranks cleanly, and
  the free axis is recovered by measuring the pitch on the determined axis and trying each
  whole-cell offset — cells are square, so only one offset lands every letter on a distinct
  in-range line.
- **Grid-rectangle geometry (`the-botanical-garden`).** Finding the largest square-ish
  dark-bordered box on the page and mapping letters into it.
- **Read by eye (`the-movie-studio`).** The 16×16 pages defeat both automatic methods,
  because glyph height varies by letter *shape* (an `O` and an `A` in the same grid differ by
  3pt), so height alone can't separate the final grid from the step grids.

The murderer is stated twice in every step text — once as a letter ("alone with B") and once
as a name ("Barbara is the murderer!") — and the extractor requires the two to agree before
accepting either, which is what surfaced the `the-golf-course` contradiction below.

### Still open: `the-golf-course`

Its 16 placements **have** been read and double-checked against both halves of the final
grid, and are recorded here so the work isn't lost:

```json
{"O":[0,11],"K":[1,10],"M":[2,14],"C":[3,5],"G":[4,1],"V":[5,15],"N":[6,6],"L":[7,7],
 "B":[8,13],"I":[9,2],"D":[10,9],"F":[11,3],"E":[12,4],"J":[13,8],"H":[14,0],"A":[15,12]}
```

It is deliberately **not** written to `puzzles/solutions/` yet, because two things must be
resolved first and both would make the verdict feature misbehave rather than merely be
incomplete:

1. **`puzzles/the-golf-course.json` has real data errors.** Checked against these verified
   placements, its `roomGrid`/`objects` put a `tree` on `[14,0]`, where the solution page
   plainly shows H standing; and they place five people in Hole 4, while the page's own steps
   state Hole 4 takes two occupants and Hole 3 takes three. The room boundaries need
   re-tracing against the source PDF before any solution over them means anything. This is a
   pre-existing transcription bug that the solution data has now exposed — nothing to do with
   the verdict feature.
2. **The PDF contradicts itself about the murderer.** Step 15 reads "This isolates V alone
   with **D**. **Berta** is the murderer!" — but `D` is Drew and Berta is `B`. The grid can't
   settle it while the `roomGrid` is untrustworthy, and guessing would mean the "you arrested
   the wrong person" path accuses the wrong person. Needs a decision once the rooms are fixed.
