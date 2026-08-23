# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Murdoku is a "whodunnit sudoku" puzzle game/tool. Each puzzle has a cast of people labelled
alphabetically (A, B, C, ... up to some letter X), where **V is always the victim**. Given a set of
clues and rules, the solver must place every person onto a grid such that:

- Each person occupies exactly one cell.
- At most one person per row, and at most one person per column (classic non-attacking-rook
  constraint, like sudoku/N-queens row/column rules — but no diagonal constraint).
- The grid can have more rows and/or columns than there are people, so some rows and/or columns
  may end up empty.

The tool's job (still to be designed) is some combination of: representing puzzles, generating
solvable puzzles, solving puzzles from clues via constraint propagation/search, and/or rendering
the grid and clues for a player to solve interactively.

## Status

Early setup — no application code yet. This file will be updated as the architecture, data model,
and entry points solidify.

## Environment

Python virtual environment lives in `venv/`. Activate with:

```bash
source venv/bin/activate
```

Add dependencies to `requirements.txt` as they're introduced (none yet).

## Conventions

- This is a standalone project inside the `adhoc-projects` multi-project repo — keep everything
  Murdoku-related self-contained within this directory.
- No production dependencies chosen yet; prefer stdlib where reasonable for a puzzle/constraint
  solver before reaching for external libraries.
