# PLAN — working opacity controls, and per-room base colours

Two changes to the puzzle editor, plus one that reaches into play mode.

---

## 1. Make the opacity sliders actually work in Rooms/Objects mode

**The bug.** The Art / Grid / Objects sliders render in the `#editorArtView` row on every
tab, are enabled, and respond to dragging — but they change nothing unless board art is
switched on. Every CSS rule that reads `--calib-art-opacity` / `--calib-grid-opacity` /
`--calib-obj-opacity` is scoped to `body.art-mode.art-calibrate`, and `art-calibrate` is
only set when art is on. Confirmed: with art off, dragging Grid to 15% leaves
`.cell`'s computed opacity at `1`. They read as broken controls, which is exactly how
they were reported.

**The tension to resolve.** A previous, explicit requirement says unticking Board art must
leave the board **pixel-identical to playing with art off** — verified by comparing the
computed styles of all 36 cells, 15 objects and 4 labels. Naively applying the sliders
whenever in edit mode breaks that, because Grid defaults to 50%: the board would render at
half-strength tints the moment you entered edit mode with art off.

**The fix — one slider set per context.** Opacity means something different depending on
whether there's artwork underneath, so keep two persisted sets and switch on art state:

| Art state | Values used | Defaults | Notes |
|---|---|---|---|
| **on** | `artCalibView` (existing) | Art 100 / Grid 50 / Objects 100 | unchanged — the Art tab's calibration workflow depends on these |
| **off** | new `editorLayerView` | Grid 100 / Objects 100 | so the neutral state is exactly play mode |

- Persist the new set alongside the existing one (`localStorage["murdoku:editorLayerView"]`).
- The **Art slider is disabled** when art is off — there's no artwork to fade. Disable it
  with a title rather than hiding it, matching how the Board art checkbox behaves on the
  Art tab.
- Scope the grid/object opacity CSS so it applies in edit mode generally, not only under
  `.art-calibrate`, reading whichever set is active.
- **Reset opacities** resets whichever set is currently in play.

This keeps the earlier parity requirement intact *by default* — enter edit mode with art
off, touch nothing, and the board is identical to play mode. It only diverges if the
author deliberately dims a layer in that context, which is a requested action rather than
a surprise.

Why the sliders are worth having with art off at all: dimming objects while painting rooms
makes room boundaries much easier to read, and dimming the grid while placing objects cuts
the visual clutter. Both are the same reason they're useful over artwork.

---

## 2. Per-room base colours

**Today.** `ROOM_COLORS` in `app.js` is a hardcoded map keyed by room id, shared across all
puzzles, falling back to `DEFAULT_ROOM_COLOR`. It's read in exactly two places: the cell
background in `renderStatic()`, and the editor's room chips. Rooms whose id isn't in the
map all render the same default grey, and even the listed ones are close in tone — which
is the complaint: they're hard to tell apart.

**Store the colour in the puzzle.** Add an optional `color` to each room:

```json
"rooms": { "bedroom": { "name": "Bedroom", "color": "#3d3348" } }
```

`exportPuzzleJSON()` passes `PUZZLE.rooms` through wholesale, so this round-trips through
Download JSON with no exporter change.

**Resolution order** (one helper, used by both existing call sites):
`PUZZLE.rooms[id].color` → `ROOM_COLORS[id]` (keeps existing puzzles looking as they do
today) → `DEFAULT_ROOM_COLOR`.

**Auto mode.** A button on the Rooms tab that assigns a generated palette to every room in
the puzzle at once, writing real values into `PUZZLE.rooms[*].color` so the result is
visible, editable afterwards, and exported. Generate by walking evenly-spaced hues around
the wheel — `hue = i * 360 / roomCount` — at a fixed saturation and lightness, so N rooms
are maximally separated in hue whatever N is.

**On "pastel" — a deliberate deviation worth flagging.** The board is dark-themed and the
marks drawn on it are white/light suspect letters. Genuine pastels (high lightness) would
wreck contrast and make placed letters hard to read, and would clash with the surrounding
UI. So: keep the *approach* of pastel — evenly spaced hues, low saturation, uniform
lightness — but at the existing dark tones' lightness rather than a light tint. That
delivers "easily differentiable" without breaking legibility. If light pastels are really
wanted, that's a broader theme change and should be its own decision.

**Manual mode.** Each room chip on the Rooms tab gets a colour swatch (`<input
type="color">`) writing straight to `PUZZLE.rooms[id].color`. Plus a **Clear colours**
action dropping the `color` keys to fall back to the built-in map.

**Applies in play mode too**, automatically: both play and edit read the same helper, and
the values live in the puzzle file. No player-facing control is needed. Nothing special is
required for the "no art overlay" caveat either — art mode already makes cells transparent,
so room tints only show when art is off, which is the desired behaviour by construction.

**Validation.** `validateDraft()` should reject a `color` that isn't a `#rrggbb` string.
