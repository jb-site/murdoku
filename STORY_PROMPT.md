# Murdoku story-generation prompt

Use this prompt to turn one puzzle's solved board into its cosy-comic reveal story — the
`puzzles/stories/<id>.json` file the app shows in place of the terse "Case closed" verdict
when a player solves a puzzle correctly. This is a manual-but-AI-assisted authoring step run
locally by an assistant that can read PDFs and JSON directly — no API call, no backend,
nothing at runtime. See `PLAN-solve-and-story.md`'s "Phase D — the story" section for the
full design rationale; this file is the literal prompt, kept in sync with it.

---

## Prompt

> You are writing the reveal story for one Murdoku puzzle. You'll be given:
>
> 1. **`story_context/<id>.json`** — every spatial fact about the solved board, computed by
>    plain code from the puzzle and solution files: who's in which room, what they're on or
>    beside, who's adjacent to whom, everyone's clue verbatim, and an ASCII map of the whole
>    board. **Treat every fact in this file as inviolable ground truth.** Do not move anyone,
>    invent furniture that isn't listed, put two people in the same scene unless the context
>    says they share a room, or contradict a clue. Where the story needs a detail the file
>    doesn't supply (a first name's nickname, a snippet of dialogue, a motive's specifics),
>    invent freely — but it must be *unfalsifiable* from the board, never contradictory to it.
> 2. **The puzzle's portraits** — either actual portrait images (when `hasPortraits` is
>    true — `puzzles/<id>.json`'s `art.portraits[letter].src`) or the relevant page of
>    `puzzles/source/<id>-color.pdf` to read the portrait row from directly. Describe each
>    character's look as **concrete observable detail, not vibes** — clothing, props held,
>    posture, apparent age, expression, anything worn or carried. "Middle-aged man in a
>    stained apron holding a ladle" is usable; "looks suspicious" is not. A prop in someone's
>    hands is often the strongest hook the story has — it frequently explains *why* they were
>    where they were, or becomes the method.
>
> **Step 1 — triangulate a `whereabouts` line for every person, before writing any prose.**
> For each entry in `people` (victim included), write one line answering "what were they
> doing at the moment of the murder?", reasoned from three inputs *together*, not any one
> alone:
>
> | Input | What it contributes |
> |---|---|
> | Their room | the activity available there — a Kitchen, a Courtroom, a Ranger's Hut each imply a different reason to be standing in them |
> | Their portrait | who they are and what they brought — clothing, props, apparent role |
> | Their clue | the specific, printed, canonical detail about them |
>
> Also fold in the cell-level facts already in the context: what they're on/beside
> (`on`, `besideObjectTypes`), and who else is with them (`withInRoom`, `adjacentPeople`).
> The interesting answer comes from the **intersection** of all of these, not from restating
> the room. A woman in gardening gloves beside a plant is watering it; the same woman beside
> a plant in a Courtroom is a much funnier proposition — reach for that reading. Where the
> inputs pull against each other (beach clothes in the boiler room), that tension is a gift,
> not a discrepancy to smooth over.
>
> **The failure mode to actively avoid:** a `whereabouts` line that just restates the room
> ("Dean was in the Kitchen") is a sign the triangulation step was skipped. Every line must
> name an activity, not just a location.
>
> **Step 2 — check the method is physically available.** The murder method should plausibly
> involve something in or beside the murderer's cell or the victim's
> (`nearbyObjectTypesForMethod` on the murderer's entry is exactly this list), or at minimum
> not be something the scene visibly rules out.
>
> **Step 3 — write the story**, only once every `whereabouts` line exists:
>
> - **Tone: cosy-comic** — *Cluedo* by way of *Knives Out*. Bloodless, wry, affectionate
>   about its cast. No gore, no real-world sensitive material. This applies uniformly; don't
>   drift darker or sillier than the rest of the set.
> - **Interweave the cast.** Every named character (everyone in `people`, including minor
>   suspects) gets at least one line of business. At least three characters should have a
>   thread connecting them to someone else — use `withInRoom`/`adjacentPeople` as the seed.
> - **Rooms are scenes, not labels.** Where several people share a room, write them as one
>   scene together, not as separate people who happen to share a room name.
> - **Length: 3 short acts, ~350–450 words total** (`acts: [string, string, string]`), plus
>   the per-character `whereabouts` lines, plus a short `reveal` paragraph naming the
>   murderer, the room, and roughly how it was done.
> - **No spoilers before the reveal.** Acts 1–2 must not name the murderer or give away the
>   room/method directly — that's what `reveal` is for.
> - **Also write the escape variants** — `escape.generic` (one wry sentence: the case went
>   unsolved, the real killer walks) plus one `escape.byAccused[<letter>]` sentence per
>   *non-murderer, non-victim* suspect, each specifically about that person being wrongly
>   hauled off while the real killer gets away. Write these in the same pass so they stay
>   consistent with the story's established characterisation and tone. **These lines must
>   never name the real murderer or the real room/cell** — a player who reads a wrong-arrest
>   escape line and keeps trying must not be spoiled.
> - **Write a `victoryHeadline`** — a short, punchy, tailored "you caught the murderer!"
>   style headline shown as the panel title on a correct solve, in place of the plain puzzle
>   title. Playful and specific to this puzzle's premise/method (a golf pun for the golf
>   course, a wrap/film pun for the movie studio), not a generic template repeated across
>   puzzles. One line, no spoiler concerns — the player has already solved it correctly by
>   the time they see this.
>
> **Output exactly this JSON shape and nothing else** (no markdown fence commentary, no
> preamble) — write it to `puzzles/stories/<id>.json`:
>
> ```json
> {
>   "id": "<puzzle id>",
>   "title": "<puzzle title>",
>   "victoryHeadline": "<short tailored 'caught!' headline>",
>   "acts": ["act one prose", "act two prose", "act three prose"],
>   "whereabouts": { "<letter>": "one-line triangulated activity", "...": "..." },
>   "reveal": "paragraph naming the murderer, room, and method",
>   "escape": {
>     "generic": "one wry sentence",
>     "byAccused": { "<letter>": "one wry sentence", "...": "..." }
>   }
> }
> ```
>
> `whereabouts` must have one entry per person in `people` (victim included). `escape.byAccused`
> must have one entry per suspect letter that is neither the victim nor the murderer.

---

## Testing before the batch

Generate against `netflix-and-kill` (6 suspects, 6×6, the floor case) and `the-hiking-trip`
(12 suspects, portraits available, rich clue flavour — the stress case) first. Run
`tools/check_stories.py <id>` on each — it mechanically catches a `whereabouts`/act that
puts two people together across rooms, a named object not in or beside that person's cell, a
cast name that doesn't exist, or a missing `whereabouts`/`escape.byAccused` entry. Then read
by eye for what code can't judge: anyone silently relocated, furniture invented, a method
that contradicts the scene, characters mentioned only in a list rather than given business,
the reveal spoiling itself early, and the D1b-specific tell — a `whereabouts` line that only
restates the room. Fix the prompt, re-run both, then batch the remaining puzzles.
