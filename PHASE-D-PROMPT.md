Work in /Users/jon/projects/murdoku — a static, dependency-free vanilla HTML/CSS/JS
puzzle app (no build step, no backend). Read CLAUDE.md first, then the "Phase D — the
story" section of PLAN-solve-and-story.md, which contains a full spec I want you to
follow rather than redesign.

**Plan this yourself in Opus first.** Work out what's actually outstanding by reading
the repo — don't trust my summary below as complete. Then delegate the implementation
to subagents, picking the model that fits each piece (my instinct: Sonnet for the
context-builder script and the panel UI, Opus for the story writing itself, since
that's a quality-sensitive creative task — but make your own call). Verify the results
yourself rather than taking a subagent's report at face value.

**Critical constraint: do NOT call the Anthropic API.** The stories must be written by
you in-session, reading the puzzle PDFs directly, the same way PUZZLE_IMPORT_PROMPT.md
handles puzzle import. No API keys, no fetch to an LLM, nothing at runtime — the app
stays 100% static and this stays on my normal Claude Code usage. The generated stories
are committed as plain JSON data files.

## Where things stand

Phases B and C are built, merged to master and live: completion detection, the
"Solved!?" button, the structural conflict check, the solution comparison, and the
verdict panel. Phase A is done bar one puzzle — 11 of 12 have a validated solution in
puzzles/solutions/<id>.json, checked by tools/check_solutions.py.

## Outstanding — confirm and correct this list against the repo

1. **Phase D, the main event** — per the plan: tools/story_context.py, STORY_PROMPT.md,
   the twelve puzzles/stories/<id>.json files, a tools/check_stories.py validator, and
   the story panel UI that replaces the verdict panel on a correct solve.

   **Build tools/story_context.py first, and do the facts in code.** It joins the puzzle
   and solution files and emits story_context/<id>.json: who shared a room with whom, who
   was orthogonally adjacent to whom, what each person was on or beside, what objects were
   in and around the murderer's cell, each person's clue verbatim, and an ASCII map of the
   solved board. All of it is plain deterministic code and costs nothing — no model should
   ever be asked to derive spatial facts from a roomGrid and a coordinate list, because
   that's the reasoning that goes quietly wrong, and a story that puts two characters
   together who were in different rooms is the most likely way this feature fails.

   Structured JSON rather than a prose brief specifically so the facts are checkable
   afterwards: check_stories.py should audit each finished story back against its context
   file — flagging characters described as together who weren't, objects wielded that were
   nowhere near that person's cell, names not in the cast, and any suspect missing a
   whereabouts or escape.byAccused line.

   Note especially section **D1b**, the triangulation step: each character's "what were
   they doing" line must be reasoned from room × portrait × clue *together*, written for
   the whole cast before any prose is drafted. A `whereabouts` line that just restates the
   room is the failure mode to watch for.

2. **All 12 solutions now validate** — tools/check_solutions.py is green across the
   board, so every puzzle has a verified solution to build a story from. Re-run it before
   you start rather than taking that on trust. Note the golf course's murderer is B
   (Berta): its source PDF misprints the letter as D in step 15, and the solution file
   carries a note saying so — don't "correct" it back.

3. **Two un-imported puzzles.** puzzles/source/ has a-walk-in-the-park-color.pdf and
   the-backyard-garden-color.pdf plus both their solution PDFs, but neither is in
   puzzles/index.json. Import per PUZZLE_IMPORT_PROMPT.md and extract their solutions
   with tools/extract_solutions.py (it works without vision on most of these pages).
   Ask me whether to do these before or after Phase D — don't assume.

4. **Phase E** — the opt-in "show me what happened anyway" path after a wrong solve,
   using the escape lines generated alongside each story.

## Decisions already locked — don't reopen these

- **Tone: cosy-comic.** Cluedo by way of Knives Out. Bloodless, wry, affectionate about
  its cast. Applies to all twelve.
- **Length: ~400 words in 3 acts**, plus one whereabouts line per character and a reveal
  paragraph.
- **No obfuscation** — solutions and stories ship as plain readable JSON.
- **Spoiler rule:** failure messaging must never name the real murderer or reveal where
  anyone belongs. It may say who is misplaced. Carry this into the Phase E escape copy.
- Solutions and stories live in their own files, never as keys inside puzzles/<id>.json.

## Working expectations

- Test the prompt on netflix-and-kill (6 suspects, simple) and the-hiking-trip (12
  suspects, portraits, rich clue flavour) and let me read both before you batch the
  other ten.
- Drive the real app in a browser to verify UI work; don't just assert it works.
- Branch rather than committing to master, and ask before pushing.
