// Puzzle config — hardcoded for now, until puzzle import (photo/PDF) exists.
// Sourced from puzzles/netflix-and-kill-color.pdf ("Netflix and Kill", easy).
// NOTE: the real puzzle also has 4 rooms (Bedroom/Bathroom/Kitchen/Living Room)
// and furniture objects that block some cells — that's next-stage work. For now
// this is just a plain 6x6 grid so the core click/pencil/place/X mechanics can
// be tested against real dimensions and real clues.
const PUZZLE = {
  rows: 6,
  cols: 6,
  suspects: ["A", "B", "C", "D", "E", "V"], // V is always the victim
  names: { A: "Austin", B: "Barbara", C: "Charlotte", D: "Dean", E: "Enid", V: "Vaughn (victim)" },
  clues: [
    "Austin (A) was beside a shelf.",
    "Barbara (B) was on the bed.",
    "Charlotte (C) was the only person sitting in a chair.",
    "Dean (D) was in the Kitchen.",
    "Enid (E) was beside the TV.",
    "Vaughn (V), the victim, was alone with the murderer — the killer was in the same area as him.",
  ],
};

// --- State ---------------------------------------------------------------

// cell = { pencil: Set<letter>, definite: letter|null, x: boolean }
const grid = [];
for (let r = 0; r < PUZZLE.rows; r++) {
  const row = [];
  for (let c = 0; c < PUZZLE.cols; c++) {
    row.push({ pencil: new Set(), definite: null, x: false });
  }
  grid.push(row);
}

let currentTool = "pencil"; // 'pencil' | 'place' | 'x' | 'erase'
let selectedSuspect = null;
let hoveredSuspect = null;

let dragging = false;
let dragApply = null; // true = "turn on", false = "turn off" — decided by the first cell touched

// --- DOM setup -------------------------------------------------------------

const gridEl = document.getElementById("grid");
const paletteEl = document.getElementById("suspectPalette");
const hintEl = document.getElementById("hint");
const toolGroupEl = document.getElementById("toolGroup");
const clearBtn = document.getElementById("clearBtn");
const undoBtn = document.getElementById("undoBtn");

gridEl.style.gridTemplateColumns = `repeat(${PUZZLE.cols}, 1fr)`;
gridEl.style.gridTemplateRows = `repeat(${PUZZLE.rows}, 1fr)`;

// Build suspect palette
PUZZLE.suspects.forEach((letter) => {
  const btn = document.createElement("button");
  btn.className = "suspect-chip" + (letter === "V" ? " victim" : "");
  btn.textContent = letter;
  btn.title = PUZZLE.names[letter] || letter;
  btn.dataset.letter = letter;
  btn.addEventListener("click", () => {
    selectedSuspect = selectedSuspect === letter ? null : letter;
    updatePaletteSelection();
    updateHint();
    renderGrid();
  });
  btn.addEventListener("mouseenter", () => {
    hoveredSuspect = letter;
    renderGrid();
  });
  btn.addEventListener("mouseleave", () => {
    hoveredSuspect = null;
    renderGrid();
  });
  paletteEl.appendChild(btn);
});

function updatePaletteSelection() {
  [...paletteEl.children].forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.letter === selectedSuspect);
  });
}

// Tool buttons
toolGroupEl.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentTool = btn.dataset.tool;
    toolGroupEl.querySelectorAll(".tool-btn[data-tool]").forEach((b) => b.classList.toggle("active", b === btn));
    updateHint();
  });
});

clearBtn.addEventListener("click", () => {
  if (!confirm("Clear the whole grid?")) return;
  pushHistory();
  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      grid[r][c] = { pencil: new Set(), definite: null, x: false };
    }
  }
  renderGrid();
});

undoBtn.addEventListener("click", undo);

// --- Undo history --------------------------------------------------------

const HISTORY_LIMIT = 200;
const history = [];

function snapshotGrid() {
  return grid.map((row) => row.map((cell) => ({
    pencil: [...cell.pencil],
    definite: cell.definite,
    x: cell.x,
  })));
}

function pushHistory() {
  history.push(snapshotGrid());
  if (history.length > HISTORY_LIMIT) history.shift();
  updateUndoButton();
}

function undo() {
  if (history.length === 0) return;
  const snapshot = history.pop();
  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      const s = snapshot[r][c];
      grid[r][c] = { pencil: new Set(s.pencil), definite: s.definite, x: s.x };
    }
  }
  updateUndoButton();
  renderGrid();
}

function updateUndoButton() {
  undoBtn.disabled = history.length === 0;
}

function updateHint() {
  if (currentTool === "pencil") {
    hintEl.textContent = selectedSuspect
      ? `Pencil mode: click or drag to toggle ${selectedSuspect} as a candidate in cells.`
      : "Pencil mode: select a suspect first, then click or drag across cells.";
  } else if (currentTool === "place") {
    hintEl.textContent = selectedSuspect
      ? `Place mode: click a cell to definitively place ${selectedSuspect} there (crosses out the rest of the row & column).`
      : "Place mode: select a suspect first, then click a cell to place them.";
  } else if (currentTool === "x") {
    hintEl.textContent = "Cross-out mode: click or drag across cells to mark them impossible.";
  } else if (currentTool === "erase") {
    hintEl.textContent = "Erase mode: click or drag across cells to clear everything in them.";
  }
}

// --- Grid rendering ----------------------------------------------------

function renderGrid() {
  gridEl.innerHTML = "";
  const highlightLetter = hoveredSuspect || selectedSuspect;

  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      const cell = grid[r][c];
      const cellEl = document.createElement("div");
      cellEl.className = "cell";
      cellEl.dataset.r = r;
      cellEl.dataset.c = c;

      if (cell.definite) {
        cellEl.classList.add("definite");
        cellEl.textContent = cell.definite;
        if (highlightLetter && cell.definite === highlightLetter) {
          cellEl.classList.add("highlighted");
        }
      } else if (cell.x) {
        cellEl.classList.add("crossed");
        cellEl.textContent = "✕";
      } else if (cell.pencil.size > 0) {
        const pencilGrid = document.createElement("div");
        pencilGrid.className = "pencil-grid";
        PUZZLE.suspects.forEach((letter) => {
          const span = document.createElement("span");
          if (cell.pencil.has(letter)) {
            span.textContent = letter;
            if (highlightLetter && letter === highlightLetter) {
              span.classList.add("pencil-highlighted");
            }
          }
          pencilGrid.appendChild(span);
        });
        cellEl.appendChild(pencilGrid);
        if (highlightLetter && cell.pencil.has(highlightLetter)) {
          cellEl.classList.add("highlighted");
        }
      }

      cellEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (!canApplyTool(r, c)) return;
        pushHistory();
        const applied = applyToolToCell(r, c, null);
        // Place is a single-shot action — never drag-paint the same person into more cells.
        if (currentTool !== "place") {
          dragging = true;
          dragApply = applied;
        }
        renderGrid();
      });
      cellEl.addEventListener("mouseenter", (e) => {
        // Require the primary button to still be physically held — a missed mouseup
        // (e.g. released outside the window) must not leave drag-painting stuck on.
        if (dragging && currentTool !== "place" && e.buttons === 1) {
          applyToolToCell(r, c, dragApply);
          renderGrid();
        } else if (dragging && e.buttons !== 1) {
          dragging = false;
          dragApply = null;
        }
      });

      gridEl.appendChild(cellEl);
    }
  }
}

document.addEventListener("mouseup", () => {
  dragging = false;
  dragApply = null;
});
window.addEventListener("blur", () => {
  dragging = false;
  dragApply = null;
});

// --- Tool logic ----------------------------------------------------------

// Whether mousedown on this cell would actually change anything, given the current tool/selection.
function canApplyTool(r, c) {
  const cell = grid[r][c];
  if (currentTool === "pencil") return !!selectedSuspect && !cell.definite;
  if (currentTool === "x") return !cell.definite;
  if (currentTool === "place") return !!selectedSuspect && (!cell.definite || cell.definite === selectedSuspect);
  if (currentTool === "erase") return !!cell.definite || cell.x || cell.pencil.size > 0;
  return false;
}

// forceApply: null = toggle and report which way it went; true/false = force that state (for drag painting)
// Returns the resulting "applied" boolean (true = turned on / added, false = turned off / removed) or null if no-op.
function applyToolToCell(r, c, forceApply) {
  const cell = grid[r][c];

  if (currentTool === "pencil") {
    if (!selectedSuspect || cell.definite) return null;
    const has = cell.pencil.has(selectedSuspect);
    const shouldHave = forceApply === null ? !has : forceApply;
    if (shouldHave) cell.pencil.add(selectedSuspect);
    else cell.pencil.delete(selectedSuspect);
    return shouldHave;
  }

  if (currentTool === "x") {
    if (cell.definite) return null;
    const shouldHave = forceApply === null ? !cell.x : forceApply;
    cell.x = shouldHave;
    if (shouldHave) cell.pencil.clear();
    return shouldHave;
  }

  if (currentTool === "place") {
    if (!selectedSuspect) return null;
    if (cell.definite === selectedSuspect) {
      // toggle off
      cell.definite = null;
      return false;
    }
    if (cell.definite) return null; // occupied by someone else — no-op
    cell.definite = selectedSuspect;
    cell.pencil.clear();
    cell.x = false;
    // cross out the rest of the row and column
    for (let cc = 0; cc < PUZZLE.cols; cc++) {
      if (cc === c) continue;
      const other = grid[r][cc];
      if (!other.definite) {
        other.x = true;
        other.pencil.clear();
      }
    }
    for (let rr = 0; rr < PUZZLE.rows; rr++) {
      if (rr === r) continue;
      const other = grid[rr][c];
      if (!other.definite) {
        other.x = true;
        other.pencil.clear();
      }
    }
    return true;
  }

  if (currentTool === "erase") {
    if (!cell.definite && !cell.x && cell.pencil.size === 0) return null;
    cell.definite = null;
    cell.x = false;
    cell.pencil.clear();
    return true;
  }

  return null;
}

// Clue list
const clueListEl = document.getElementById("clueList");
PUZZLE.clues.forEach((text) => {
  const li = document.createElement("li");
  li.textContent = text;
  clueListEl.appendChild(li);
});

updatePaletteSelection();
updateHint();
updateUndoButton();
renderGrid();
