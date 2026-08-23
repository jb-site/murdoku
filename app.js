// Puzzle data model
// ------------------
// id/title         - puzzle identity (id used as localStorage key + save-file tag)
// rows/cols        - grid size
// suspects         - [letter, ...], one of which is always "V" (the victim)
// names            - {letter: display name}
// clues            - freeform display text
// rooms            - {roomId: {name}}
// roomGrid[r][c]   - room id string, defines room boundaries (thick borders drawn between differing rooms)
// objectGrid[r][c] - object type key (see OBJECT_TYPES) or null
//
// A cell is "blocked" (nobody can ever go there) when it holds a non-occupiable object
// (see OBJECT_TYPES[...].occupiable). Blocked cells are not interactive.
//
// Puzzles live as JSON files under puzzles/, listed in puzzles/index.json. See
// PUZZLE_IMPORT_PROMPT.md for how to turn a photo/PDF of a new puzzle into one of these files.

const OBJECT_TYPES = {
  bed: { emoji: "🛏️", occupiable: true },
  chair: { emoji: "🪑", occupiable: true },
  tv: { emoji: "📺", occupiable: false },
  shelf: { emoji: "📚", occupiable: false },
  table: { emoji: "🍽️", occupiable: false },
  plant: { emoji: "🪴", occupiable: false },
};

const ROOM_COLORS = {
  bedroom: "#3d3348",
  bathroom: "#33403d",
  kitchen: "#463b2e",
  livingroom: "#243a48",
};

// --- State ---------------------------------------------------------------

let PUZZLE = null;
let grid = [];

let currentTool = "pencil"; // 'pencil' | 'place' | 'x' | 'erase'
let selectedSuspect = null;
let hoveredSuspect = null;

let dragging = false;
let dragApply = null; // true = "turn on", false = "turn off" — decided by the first cell touched

const HISTORY_LIMIT = 200;
let history = [];

function isBlocked(r, c) {
  const type = PUZZLE.objectGrid[r][c];
  return !!type && !OBJECT_TYPES[type].occupiable;
}

function freshGrid() {
  const g = [];
  for (let r = 0; r < PUZZLE.rows; r++) {
    const row = [];
    for (let c = 0; c < PUZZLE.cols; c++) {
      row.push({ pencil: new Set(), definite: null, x: false });
    }
    g.push(row);
  }
  return g;
}

// --- DOM setup -------------------------------------------------------------

const gridEl = document.getElementById("grid");
const paletteEl = document.getElementById("suspectPalette");
const hintEl = document.getElementById("hint");
const toolGroupEl = document.getElementById("toolGroup");
const clearBtn = document.getElementById("clearBtn");
const undoBtn = document.getElementById("undoBtn");
const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");
const loadInput = document.getElementById("loadInput");
const autosaveNote = document.getElementById("autosaveNote");
const clueListEl = document.getElementById("clueList");
const puzzleSelectEl = document.getElementById("puzzleSelect");

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
  grid = freshGrid();
  renderGrid();
  saveProgress();
});

undoBtn.addEventListener("click", undo);

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

function updatePaletteSelection() {
  [...paletteEl.children].forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.letter === selectedSuspect);
  });
}

function buildPalette() {
  paletteEl.innerHTML = "";
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
}

function buildClueList() {
  clueListEl.innerHTML = "";
  PUZZLE.clues.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    clueListEl.appendChild(li);
  });
}

// --- Grid rendering ----------------------------------------------------

function borderStyle(r, c, dr, dc) {
  const nr = r + dr, nc = c + dc;
  const outOfBounds = nr < 0 || nr >= PUZZLE.rows || nc < 0 || nc >= PUZZLE.cols;
  const sameRoom = !outOfBounds && PUZZLE.roomGrid[nr][nc] === PUZZLE.roomGrid[r][c];
  return sameRoom ? "1px solid var(--border)" : "3px solid #111318";
}

function renderGrid() {
  gridEl.innerHTML = "";
  const highlightLetter = hoveredSuspect || selectedSuspect;

  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      const cell = grid[r][c];
      const objectType = PUZZLE.objectGrid[r][c];
      const blocked = isBlocked(r, c);

      const cellEl = document.createElement("div");
      cellEl.className = "cell" + (blocked ? " blocked" : "");
      cellEl.dataset.r = r;
      cellEl.dataset.c = c;
      cellEl.style.background = ROOM_COLORS[PUZZLE.roomGrid[r][c]] || "";
      cellEl.style.borderTop = borderStyle(r, c, -1, 0);
      cellEl.style.borderBottom = borderStyle(r, c, 1, 0);
      cellEl.style.borderLeft = borderStyle(r, c, 0, -1);
      cellEl.style.borderRight = borderStyle(r, c, 0, 1);

      if (blocked) {
        const obj = document.createElement("span");
        obj.className = "object-icon blocked-icon";
        obj.textContent = OBJECT_TYPES[objectType].emoji;
        obj.title = objectType;
        cellEl.appendChild(obj);
        gridEl.appendChild(cellEl);
        continue; // no interaction, no further content
      }

      if (objectType) {
        const badge = document.createElement("span");
        badge.className = "object-icon badge-icon";
        badge.textContent = OBJECT_TYPES[objectType].emoji;
        badge.title = objectType;
        cellEl.appendChild(badge);
      }

      if (cell.definite) {
        cellEl.classList.add("definite");
        const label = document.createElement("span");
        label.className = "cell-main";
        label.textContent = cell.definite;
        cellEl.appendChild(label);
        if (highlightLetter && cell.definite === highlightLetter) {
          cellEl.classList.add("highlighted");
        }
      } else if (cell.x) {
        cellEl.classList.add("crossed");
        const label = document.createElement("span");
        label.className = "cell-main";
        label.textContent = "✕";
        cellEl.appendChild(label);
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
        saveProgress();
      });
      cellEl.addEventListener("mouseenter", (e) => {
        // Require the primary button to still be physically held — a missed mouseup
        // (e.g. released outside the window) must not leave drag-painting stuck on.
        if (dragging && currentTool !== "place" && e.buttons === 1) {
          applyToolToCell(r, c, dragApply);
          renderGrid();
          saveProgress();
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
  if (isBlocked(r, c)) return false;
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
  if (isBlocked(r, c)) return null;
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
    // cross out the rest of the row and column (skipping cells that are blocked or already occupied)
    for (let cc = 0; cc < PUZZLE.cols; cc++) {
      if (cc === c || isBlocked(r, cc)) continue;
      const other = grid[r][cc];
      if (!other.definite) {
        other.x = true;
        other.pencil.clear();
      }
    }
    for (let rr = 0; rr < PUZZLE.rows; rr++) {
      if (rr === r || isBlocked(rr, c)) continue;
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

// --- Undo history --------------------------------------------------------

function snapshotGrid() {
  return grid.map((row) => row.map((cell) => ({
    pencil: [...cell.pencil],
    definite: cell.definite,
    x: cell.x,
  })));
}

function restoreSnapshot(snapshot) {
  grid = snapshot.map((row) => row.map((s) => ({
    pencil: new Set(s.pencil),
    definite: s.definite,
    x: s.x,
  })));
}

function pushHistory() {
  history.push(snapshotGrid());
  if (history.length > HISTORY_LIMIT) history.shift();
  updateUndoButton();
}

function undo() {
  if (history.length === 0) return;
  restoreSnapshot(history.pop());
  updateUndoButton();
  renderGrid();
  saveProgress();
}

function updateUndoButton() {
  undoBtn.disabled = history.length === 0;
}

// --- Persistence -----------------------------------------------------------
// Auto-saves to localStorage (keyed per puzzle) so refreshing/reopening the
// browser just works. Save/Load-to-file gives an explicit, portable snapshot
// that works across browsers and devices.

function storageKey() {
  return `murdoku:progress:${PUZZLE.id}`;
}

function saveProgress() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ puzzleId: PUZZLE.id, savedAt: Date.now(), grid: snapshotGrid() }));
    localStorage.setItem("murdoku:lastPuzzle", PUZZLE.id);
    flashAutosaveNote();
  } catch (err) {
    console.warn("Autosave failed:", err);
  }
}

let autosaveNoteTimer = null;
function flashAutosaveNote() {
  autosaveNote.textContent = "Saved";
  clearTimeout(autosaveNoteTimer);
  autosaveNoteTimer = setTimeout(() => { autosaveNote.textContent = ""; }, 1200);
}

function loadProgressFromLocalStorage() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.puzzleId !== PUZZLE.id || !Array.isArray(data.grid)) return false;
    restoreSnapshot(data.grid);
    return true;
  } catch (err) {
    console.warn("Failed to load saved progress:", err);
    return false;
  }
}

saveBtn.addEventListener("click", () => {
  const payload = { puzzleId: PUZZLE.id, savedAt: Date.now(), grid: snapshotGrid() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `murdoku-${PUZZLE.id}-progress.json`;
  a.click();
  URL.revokeObjectURL(url);
});

loadBtn.addEventListener("click", () => loadInput.click());

loadInput.addEventListener("change", () => {
  const file = loadInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.grid)) throw new Error("Not a valid Murdoku save file.");
      if (data.puzzleId && data.puzzleId !== PUZZLE.id) {
        if (!confirm(`This save is for a different puzzle ("${data.puzzleId}"). Load it anyway?`)) return;
      }
      pushHistory();
      restoreSnapshot(data.grid);
      renderGrid();
      saveProgress();
    } catch (err) {
      alert("Couldn't load that file: " + err.message);
    } finally {
      loadInput.value = "";
    }
  };
  reader.readAsText(file);
});

// --- Puzzle library ----------------------------------------------------

async function loadManifest() {
  const res = await fetch("puzzles/index.json");
  if (!res.ok) throw new Error(`Failed to load puzzle list (${res.status})`);
  return res.json();
}

async function loadPuzzleData(file) {
  const res = await fetch(`puzzles/${file}`);
  if (!res.ok) throw new Error(`Failed to load puzzle "${file}" (${res.status})`);
  return res.json();
}

function initPuzzle(data) {
  PUZZLE = data;
  grid = freshGrid();
  history = [];
  selectedSuspect = null;
  hoveredSuspect = null;
  currentTool = "pencil";
  toolGroupEl.querySelectorAll(".tool-btn[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === "pencil"));

  gridEl.style.gridTemplateColumns = `repeat(${PUZZLE.cols}, 1fr)`;
  gridEl.style.gridTemplateRows = `repeat(${PUZZLE.rows}, 1fr)`;

  buildPalette();
  buildClueList();
  updatePaletteSelection();
  updateHint();
  updateUndoButton();
  loadProgressFromLocalStorage();
  renderGrid();
}

async function selectPuzzle(id, manifest) {
  const entry = manifest.find((p) => p.id === id);
  if (!entry) return;
  const data = await loadPuzzleData(entry.file);
  initPuzzle(data);
  localStorage.setItem("murdoku:lastPuzzle", id);
}

async function boot() {
  let manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    hintEl.textContent = "Couldn't load the puzzle list: " + err.message;
    return;
  }

  puzzleSelectEl.innerHTML = "";
  manifest.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = entry.id;
    opt.textContent = entry.title;
    puzzleSelectEl.appendChild(opt);
  });
  puzzleSelectEl.addEventListener("change", () => selectPuzzle(puzzleSelectEl.value, manifest));

  const lastId = localStorage.getItem("murdoku:lastPuzzle");
  const startId = manifest.some((p) => p.id === lastId) ? lastId : manifest[0]?.id;
  if (!startId) {
    hintEl.textContent = "No puzzles found in puzzles/index.json.";
    return;
  }
  puzzleSelectEl.value = startId;
  await selectPuzzle(startId, manifest);
}

boot();
