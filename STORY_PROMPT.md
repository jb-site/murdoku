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
> **Step 1 — write a `whereabouts` vignette for every person, before writing any prose.**
>
> The framing question is **NOT** "what were they doing at the moment of the murder?" That is
> the question a detective asks, and every answer to it comes out shaped like an alibi. The
> question is:
>
> > **"What was the most interesting thing going on in this person's own life that afternoon —
> > the thing they'd tell a friend about later, if the murder had never happened at all?"**
>
> Almost everyone on this board does not know a murder is taking place. They are not building
> an alibi, not hiding anything, not watching anyone. They are having a mildly annoying,
> mildly delightful ordinary day. Write that day.
>
> Each line should be a **complete miniature** — a setup and a turn, or a small ongoing
> grievance, or a quiet private pleasure. Not a position report. Reason it from three inputs
> together:
>
> | Input | What it contributes |
> |---|---|
> | Their room | the activity available there — a Kitchen, a Courtroom, a Ranger's Hut each imply a different reason to be standing in them |
> | Their portrait | who they are and what they brought — clothing, props, apparent age, expression |
> | Their clue | the specific, printed, canonical detail about them |
>
> Cell facts (`on`, `besideObjectTypes`, `withInRoom`, `adjacentPeople`) are **constraints you
> must not contradict, not a checklist you must discharge.** If someone is beside a chair and
> a table and the chair is the joke, use the chair and let the table go unmentioned. A line
> whose second half is a furniture inventory ("…beside the table and its spare chair, with a
> plant to her left") has stopped being a story.
>
> **Two failure modes to actively avoid:**
>
> 1. **Restating the room.** "Dean was in the Kitchen" means the triangulation step was skipped.
>    Every line must name an activity.
> 2. **The sting in the tail.** A line that ends by hinting at guilt, motive, evasion, or a
>    conspicuously-constructed innocence. This is the more common and more damaging failure,
>    because when every line does it, the whole cast reads as co-conspirators and the reveal
>    means nothing. **Banned outright**, in `whereabouts` and in the acts:
>
>    - the words *alibi*, *suspicious*, *suspiciously*, *conspicuously*, *plausibly*
>    - "very casually", "pointedly", "nothing to do with anything", "for reasons of his own"
>    - "would later insist / would later claim / as he would tell the police"
>    - "watching someone she shouldn't have been", "counting what he'd been told not to count"
>    - any hand resting on any catch, lever, trigger, or release
>    - narrating a sudoku constraint as evasiveness — "careful, as ever, never to be seen at
>      either edge of anything" is the puzzle's row/column rule wearing a trench coat. If a
>      clue says someone wasn't in the outer rows, find an innocent reason they'd be mid-course.
>
> **The murderer's line follows the same rules as everyone else's.** No wink, no foreshadow,
> no "one small final correction." The app already renders the murderer last and visually
> flagged, and the player has already solved the puzzle — the telegraph buys nothing and costs
> the `reveal` its punch. The ideal murderer line reads completely innocently the first time
> and turns cold on a re-read *after* the reveal explains it. Aim for that double meaning; if
> you can't get it, plain innocence is still better than a wink.
>
> **Step 1b — the complicity budget.**
>
> Genuine complicity is allowed and welcome when it earns its place — someone who knew, who
> covered, who was being blackmailed by the victim, who saw and said nothing. It is a spice,
> not a base note.
>
> **Hard cap: at most TWO suspects besides the murderer may have any real connection to the
> crime.** For a cast of 6 or fewer, at most ONE. Zero is a perfectly good answer and should
> be the outcome for at least some puzzles in the set.
>
> Why a cap: the solution is already fixed — the player has solved the board before they read
> a word of this, so complicity adds nothing mechanically. It is pure flavour, and flavour
> stops registering the moment it's everywhere. One person who knew something is a shiver.
> Nine people who knew something is a committee meeting.
>
> Everyone outside the budget gets: **no motive, no secret, no grudge against the victim, no
> furtive behaviour, and no awareness that anything is wrong.** If you find yourself giving a
> third person a reason to want the victim gone, delete it and give them a hobby instead.
>
> **Step 1c — vary the register across the cast.**
>
> The commonest smell of machine-written casts is sixteen lines with identical cadence and an
> identical wry sign-off. Deliberately spread them. In any cast of 8+, include at least one of
> each:
>
> - **Comic disaster** — something is going visibly, escalatingly wrong for them.
> - **Petty rivalry** — a grievance about something trivially small, held with total conviction.
> - **Sweet or quietly sad** — a small kindness, a private pleasure, a hope that won't pan out.
> - **Utterly mundane** — an errand, a chore, a nap. No joke at all. Plainly stated.
> - **Coincidentally suspicious but completely innocent** — they were somewhere odd, holding
>   something odd, for a reason that is fully explained and fully boring. Crucially, the story
>   must **resolve** this — the explanation lands in the acts or the reveal. An unexplained
>   oddity is just another sting in the tail.
> - **Secret hobby / hidden competence** — the thing nobody at work knows they do.
>
> Vary sentence shape too. Not every line ends on a punchline. Two or three per cast should be
> flatly, warmly declarative.
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
> - **The acts are NOT a roll-call.** The failure mode here is a tour of the board — one clause
>   per suspect, room by room, in grid order. Instead: pick **two to four running subplots**
>   and give them roughly 60% of the wordcount. Each subplot opens in Act 1 and pays off by
>   Act 3. The rest of the cast appears in a glancing half-clause, or only in their own
>   `whereabouts` line, and that is fine — a suspect who gets one great vignette and no act
>   mention is better served than one who gets a name-check in a list of sixteen.
> - **Build subplots from `withInRoom` and `adjacentPeople`.** Two people who share a room are
>   a scene; two adjacent across a boundary are an overheard argument or a shouted exchange.
>   (Naming two people in the same act paragraph when the context puts them neither in the same
>   room nor adjacent will trip a `check_stories.py` warning — keep subplots on same-room or
>   adjacent pairs unless you're deliberately referencing someone elsewhere.)
> - **Make ONE subplot semi-related to the murder — without either participant being involved.**
>   This is the most valuable single move in the whole story. Options:
>     - Their unrelated drama is *why nobody noticed* the murder happening.
>     - One of them saw or heard something and completely misread it.
>     - Their squabble is why the victim ended up alone in that room.
>   The participants stay innocent, ignorant, and unpunished. This is a *coincidence*, not a
>   conspiracy — the moment either of them knows what they've brushed against, it stops working.
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
> - **Vary the escape lines' shape.** A common failure is every single one being
>   "[Name] was hauled off still [doing their thing], while the real killer [wry beat]." At most
>   HALF may use that frame. Rotate through the others:
>     - the payoff their own subplot never got, now permanently unresolved
>     - a bystander's or colleague's reaction to the arrest
>     - the character's own indignant one-liner, in their voice
>     - a small practical consequence of them being gone (the picnic, the pose, the inventory)
>     - the wrong thing the wider world concludes about them
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

## Before / after — the target, in the project's own words

**Murderer, telegraphed → murderer, innocent-until-re-read**

- OLD: "Berta, silver-bobbed and serene, was standing beside a tree on Hole 4 doing absolutely
  nothing suspicious with a young springy sapling she had bent all the way back to the ground."
- NEW: "Berta was on Hole 4 with a young sapling bent double under one hand, explaining to
  nobody in particular that this is how you train a tree to grow straight, that her late
  husband had taught her, and that the whole trick is patience."

**Alibi-coded → a life of their own**

- OLD: "Antonio was out in the boat rowing in ostentatious slow motion, manufacturing the most
  boring alibi in maritime history one stroke at a time."
- NEW: "Antonio was out in the boat rowing at a pace he was calling 'considered', having been
  told rowing was excellent for the back and having discovered around stroke nine that this was
  not, in his case, going to be true."

**Naked motive → a hobby instead**

- OLD: "Crystal was sitting in her chair beside the front table, working out — with a
  calculator and an unusual amount of enthusiasm — exactly how much Vaughn had skimmed off her
  commission."
- NEW: "Crystal was at the front desk with a calculator, running the finance on a caravan she
  had no intention of buying and had already, privately, named."

**Furniture inventory → one detail that does work**

- OLD: "Florian sat alone on the Gazebo floor beside the table and its spare chair, guarding a
  picnic for two that was rapidly becoming a picnic for one."
- NEW: "Florian sat alone in the Gazebo beside a spare chair nobody had come to sit in,
  guarding a picnic for two that was becoming, minute by minute, a picnic for one."
