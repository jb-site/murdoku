// Puzzle data model
// ------------------
// id/title         - puzzle identity (id used as localStorage key + save-file tag)
// rows/cols        - grid size
// suspects         - [letter, ...], one of which is always "V" (the victim)
// names            - {letter: display name}
// clues            - [{suspect: letter|null, text, refs: {rooms?, objects?, suspects?}}]
// rooms            - {roomId: {name}}
// roomGrid[r][c]   - room id string, defines room boundaries (thick borders drawn between differing rooms)
// objects          - [{type, cells: [[r,c], ...]}] — a physical object and every cell it covers.
//                    Cells of one object must form a filled rectangle. Two same-type objects sitting
//                    side by side (e.g. two chairs) are two separate entries, NOT one spanning object —
//                    a span is only ever inferred from what's authored here, never from adjacency.
//
// A cell is "blocked" (nobody can ever go there) when it's covered by a non-occupiable object
// (see OBJECT_TYPES[...].occupiable). Blocked cells are not interactive for placing/pencilling.
//
// Puzzles live as JSON files under puzzles/, listed in puzzles/index.json. See
// PUZZLE_IMPORT_PROMPT.md for how to turn a photo/PDF of a new puzzle into one of these files.

function svgObject(fill, fill2, stroke, inner, viewW, viewH) {
  return `<svg class="object-art" viewBox="0 0 ${viewW} ${viewH}" preserveAspectRatio="xMidYMid meet"
    style="--obj-fill:${fill};--obj-fill2:${fill2};--obj-stroke:${stroke}">${inner}</svg>`;
}

const OBJECT_TYPES = {
  bed: {
    label: "Bed", emoji: "🛏️", occupiable: true,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      const horizontal = colSpan >= rowSpan;
      const pillowW = horizontal ? w * 0.28 : w * 0.86;
      const pillowH = horizontal ? h * 0.86 : h * 0.28;
      const px = horizontal ? w * 0.07 : w * 0.07;
      const py = horizontal ? h * 0.07 : h * 0.07;
      return svgObject("#d8d3c8", "#8fae74", "#4a4636", `
        <rect x="${w * 0.04}" y="${h * 0.04}" width="${w * 0.92}" height="${h * 0.92}" rx="10" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="${px}" y="${py}" width="${pillowW}" height="${pillowH}" rx="8" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, w, h);
    },
  },
  chair: {
    label: "Chair", emoji: "🪑", occupiable: true,
    art() {
      return svgObject("#d9cdb0", "#a8895f", "#4a3d29", `
        <rect x="18" y="34" width="64" height="46" rx="10" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="14" y="10" width="72" height="34" rx="16" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  tv: {
    label: "TV", emoji: "📺", occupiable: false,
    art() {
      return svgObject("#7fd8ee", "#3a3f4a", "#1c1f26", `
        <rect x="10" y="18" width="80" height="52" rx="6" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="18" y="26" width="64" height="36" rx="2" fill="var(--obj-fill)"/>
        <rect x="34" y="72" width="32" height="8" rx="2" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, 100, 100);
    },
  },
  shelf: {
    label: "Shelf", emoji: "📚", occupiable: false,
    art() {
      return svgObject("#c9b98e", "#8a7248", "#4a3c24", `
        <rect x="12" y="8" width="76" height="84" rx="4" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <line x1="12" y1="34" x2="88" y2="34" stroke="var(--obj-stroke)" stroke-width="3"/>
        <line x1="12" y1="60" x2="88" y2="60" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="18" y="14" width="12" height="16" fill="var(--obj-fill)"/>
        <rect x="34" y="14" width="10" height="16" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="2"/>
        <rect x="18" y="40" width="30" height="16" fill="var(--obj-fill)"/>
        <rect x="18" y="66" width="14" height="16" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="2"/>
        <rect x="36" y="66" width="14" height="16" fill="var(--obj-fill)"/>
      `, 100, 100);
    },
  },
  table: {
    label: "Table", emoji: "🍽️", occupiable: false,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      const legW = 8, legH = h * 0.28;
      return svgObject("#d9b878", "#8a5a2e", "#4a3319", `
        <rect x="${w * 0.03}" y="${h * 0.08}" width="${w * 0.94}" height="${h * 0.52}" rx="8" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="${w * 0.08}" y="${h * 0.58}" width="${legW}" height="${legH}" fill="var(--obj-fill2)"/>
        <rect x="${w * 0.92 - legW}" y="${h * 0.58}" width="${legW}" height="${legH}" fill="var(--obj-fill2)"/>
      `, w, h);
    },
  },
  plant: {
    label: "Plant", emoji: "🪴", occupiable: false,
    art() {
      return svgObject("#7fae5c", "#3f8f6f", "#1f4d38", `
        <path d="M50 55 C20 55 15 20 30 8 C35 25 40 30 50 40 C60 30 65 25 70 8 C85 20 80 55 50 55Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M32 55 C40 82 60 82 68 55 L64 88 C58 94 42 94 36 88 Z" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  oilslick: {
    label: "Oil Slick", emoji: "🛢️", occupiable: true,
    art() {
      return svgObject("#3a3a42", "#54545e", "#17171b", `
        <ellipse cx="50" cy="52" rx="38" ry="24" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <ellipse cx="30" cy="38" rx="10" ry="7" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="2"/>
        <ellipse cx="72" cy="60" rx="7" ry="5" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, 100, 100);
    },
  },
  car: {
    label: "Car", emoji: "🚗", occupiable: true,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      const horizontal = colSpan >= rowSpan;
      const bodyW = horizontal ? w * 0.9 : h * 0.42;
      const bodyH = horizontal ? h * 0.42 : w * 0.9;
      const x = (w - bodyW) / 2, y = (h - bodyH) / 2;
      const cabinInset = horizontal ? bodyW * 0.22 : bodyH * 0.22;
      return svgObject("#9fb4e8", "#2d3140", "#14161e", `
        <rect x="${x}" y="${y}" width="${bodyW}" height="${bodyH}" rx="${Math.min(bodyW, bodyH) * 0.3}" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        ${horizontal
          ? `<rect x="${x + cabinInset}" y="${y + bodyH * 0.12}" width="${bodyW - cabinInset * 2}" height="${bodyH * 0.76}" rx="6" fill="var(--obj-fill)"/>`
          : `<rect x="${x + bodyW * 0.12}" y="${y + cabinInset}" width="${bodyW * 0.76}" height="${bodyH - cabinInset * 2}" rx="6" fill="var(--obj-fill)"/>`}
      `, w, h);
    },
  },
  tree: {
    label: "Tree", emoji: "🌲", occupiable: false,
    art() {
      return svgObject("#4fae7a", "#3d7a54", "#1f4530", `
        <ellipse cx="50" cy="90" rx="22" ry="6" fill="#000" opacity="0.15"/>
        <circle cx="50" cy="42" r="34" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <circle cx="50" cy="66" r="26" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="44" y="82" width="12" height="12" fill="#5b4630"/>
      `, 100, 100);
    },
  },
  bonsai: {
    label: "Bonsai", emoji: "🌳", occupiable: false,
    art() {
      return svgObject("#6bb06e", "#b98fc9", "#3a5c3c", `
        <path d="M50 46 C30 46 26 24 38 18 C40 30 44 34 50 40 C56 34 60 30 62 18 C74 24 70 46 50 46Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="47" y="42" width="6" height="18" fill="#6b4a2c"/>
        <path d="M28 60 L72 60 L66 84 L34 84 Z" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  cactus: {
    label: "Cactus", emoji: "🌵", occupiable: false,
    art() {
      return svgObject("#7fae5c", "#5c8a42", "#33501f", `
        <rect x="40" y="20" width="20" height="66" rx="10" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M40 40 Q18 40 18 58 Q18 68 30 68 L40 68" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M60 32 Q82 32 82 48 Q82 58 70 58 L60 58" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  lilypad: {
    label: "Lily Pad", emoji: "🍃", occupiable: false,
    art() {
      return svgObject("#4c9a5c", "#2f6b3c", "#1a3f22", `
        <path d="M50 50 L88 40 A38 38 0 1 1 50 12 Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M50 50 L50 20" stroke="var(--obj-stroke2, var(--obj-stroke))" stroke-width="2" fill="none"/>
      `, 100, 100);
    },
  },
  flower: {
    label: "Flower", emoji: "💐", occupiable: false,
    art() {
      const petals = [0, 60, 120, 180, 240, 300].map((a) => {
        const rad = (a * Math.PI) / 180;
        const cx = 50 + Math.cos(rad) * 18, cy = 50 + Math.sin(rad) * 18;
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="14" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="2"/>`;
      }).join("");
      return svgObject("#9b7fc9", "#f0c94d", "#3d2f5c", `
        ${petals}
        <circle cx="50" cy="50" r="12" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="2"/>
        <path d="M46 78 Q50 66 54 78" stroke="#4a8a4f" stroke-width="4" fill="none"/>
      `, 100, 100);
    },
  },
  shrub: {
    label: "Shrub", emoji: "🌿", occupiable: false,
    art() {
      return svgObject("#5cae5f", "#417d44", "#254a27", `
        <circle cx="34" cy="52" r="20" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <circle cx="62" cy="46" r="24" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <circle cx="50" cy="66" r="20" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  path: {
    label: "Path", emoji: "🧱", occupiable: true,
    art() {
      return svgObject("#d9cba8", "#c2b18a", "#8a7a54", `
        <rect x="8" y="8" width="84" height="84" rx="4" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="2"/>
        <line x1="8" y1="50" x2="92" y2="50" stroke="var(--obj-stroke)" stroke-width="2"/>
        <line x1="50" y1="8" x2="50" y2="50" stroke="var(--obj-stroke)" stroke-width="2"/>
        <line x1="30" y1="50" x2="30" y2="92" stroke="var(--obj-stroke)" stroke-width="2"/>
        <line x1="70" y1="50" x2="70" y2="92" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, 100, 100);
    },
  },
};

const ROOM_COLORS = {
  bedroom: "#3d3348",
  bathroom: "#33403d",
  kitchen: "#463b2e",
  livingroom: "#243a48",
  reception: "#2f3a4a",
  storage: "#463b52",
  waitingarea: "#2c4a4a",
  garage: "#3a3a3f",
  bonsai: "#2f4436",
  gazebo: "#453a52",
  flowergarden: "#4a3a52",
  desert: "#4a4130",
  infodesk: "#453a52",
  arboretum: "#2c4536",
  pond: "#234548",
  restingarea: "#2c4a40",
};
const DEFAULT_ROOM_COLOR = "#2f313a";

// --- Layout (side-by-side clues split) --------------------------------------

const CLUES_MIN = 280;
const CLUES_MAX = 560;
const CLUES_DEFAULT = 340;
const HANDLE_W = 10;
const SPLIT_MAX_WIDTH = 1280;
const SPLIT_HYSTERESIS = 16;
const CELL_MAX = 96; // caps how big a cell (and thus the whole square-ish grid) can render at

// --- State ---------------------------------------------------------------

let PUZZLE = null;
let objectAt = []; // [r][c] -> object record or null
let grid = [];

// selection: a suspect letter, or the sentinel strings "#x" / "#erase"
let selection = null;
let hoveredSuspect = null;
let hoverRefs = null; // {rooms:Set, objects:Set, suspects:Set} while hovering a clue

const HISTORY_LIMIT = 200;
let history = [];

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 8;
let gesture = null; // {pointerId, r, c, x0, y0, timer, mode, dragApply}

function isSuspectSelection(sel) {
  return sel && sel !== "#x" && sel !== "#erase";
}

function isBlocked(r, c) {
  const o = objectAt[r][c];
  return !!o && !OBJECT_TYPES[o.type].occupiable;
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

// --- Puzzle normalization --------------------------------------------------

function normalizePuzzle(data) {
  const rows = data.rows, cols = data.cols;

  // Back-compat: synthesise 1x1 objects from a legacy objectGrid.
  let objects = data.objects;
  if (!objects && data.objectGrid) {
    objects = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const type = data.objectGrid[r][c];
        if (type) objects.push({ type, cells: [[r, c]] });
      }
    }
  }
  data.objects = objects || [];

  data.clues = (data.clues || []).map((clue) => {
    if (typeof clue === "string") return { suspect: null, text: clue, refs: {} };
    return {
      suspect: clue.suspect ?? null,
      text: clue.text,
      refs: {
        rooms: clue.refs?.rooms || [],
        objects: clue.refs?.objects || [],
        suspects: clue.refs?.suspects || [],
      },
    };
  });

  return data;
}

function buildObjectIndex(data) {
  const rows = data.rows, cols = data.cols;
  const at = Array.from({ length: rows }, () => Array(cols).fill(null));

  data.objects.forEach((obj) => {
    if (!OBJECT_TYPES[obj.type]) {
      console.error(`Unknown object type "${obj.type}" — skipping.`);
      return;
    }
    const rs = obj.cells.map((cell) => cell[0]);
    const cs = obj.cells.map((cell) => cell[1]);
    const r0 = Math.min(...rs), r1 = Math.max(...rs);
    const c0 = Math.min(...cs), c1 = Math.max(...cs);
    const rowSpan = r1 - r0 + 1, colSpan = c1 - c0 + 1;

    if (obj.cells.length !== rowSpan * colSpan) {
      console.error(`Object "${obj.type}" at [${r0},${c0}] doesn't form a filled rectangle — skipping.`);
      return;
    }
    if (r0 < 0 || c0 < 0 || r1 >= rows || c1 >= cols) {
      console.error(`Object "${obj.type}" at [${r0},${c0}] is out of bounds — skipping.`);
      return;
    }

    const record = { type: obj.type, cells: obj.cells, r0, c0, r1, c1, rowSpan, colSpan, occupiable: OBJECT_TYPES[obj.type].occupiable };
    for (const [r, c] of obj.cells) {
      if (at[r][c]) {
        console.error(`Cell [${r},${c}] claimed by more than one object — skipping "${obj.type}".`);
        return;
      }
    }
    for (const [r, c] of obj.cells) at[r][c] = record;
  });

  return at;
}

// --- DOM setup -------------------------------------------------------------

const gridEl = document.getElementById("grid");
const layerCellsEl = document.getElementById("layerCells");
const layerObjectsEl = document.getElementById("layerObjects");
const layerLabelsEl = document.getElementById("layerLabels");
const layerMarksEl = document.getElementById("layerMarks");
const layerHeadersEl = document.getElementById("layerHeaders");
const paletteEl = document.getElementById("suspectPalette");
const hintEl = document.getElementById("hint");
const statusEl = document.getElementById("status");
const clearBtn = document.getElementById("clearBtn");
const undoBtn = document.getElementById("undoBtn");
const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");
const loadInput = document.getElementById("loadInput");
const autosaveNote = document.getElementById("autosaveNote");
const clueListEl = document.getElementById("clueList");
const puzzleSelectEl = document.getElementById("puzzleSelect");
const puzzleTitleEl = document.getElementById("puzzleTitle");
const puzzleDifficultyEl = document.getElementById("puzzleDifficulty");
const legendEl = document.getElementById("legend");
const mainEl = document.querySelector("main");
const workspaceEl = document.getElementById("workspace");
const resizeHandleEl = document.getElementById("resizeHandle");

clearBtn.addEventListener("click", () => {
  if (!confirm("Clear the whole grid?")) return;
  pushHistory();
  grid = freshGrid();
  renderMarks();
  applyHighlights();
  saveProgress();
});

undoBtn.addEventListener("click", undo);

function updateHint() {
  if (!selection) {
    hintEl.textContent = "Pick a suspect, ✕, or Erase below, then click, hold, or drag on the grid.";
  } else if (selection === "#x") {
    hintEl.textContent = "✕ selected: click or drag across cells to mark them impossible.";
  } else if (selection === "#erase") {
    hintEl.textContent = "Erase selected: click or drag across cells to clear everything in them.";
  } else {
    hintEl.textContent = `${selection} selected: click to pencil in, hold to place definitively, drag to paint candidates.`;
  }
}

function setStatus(text) {
  statusEl.textContent = text || "";
}

// --- Palette (suspects + X + Erase, unified) -------------------------------

function buildPalette() {
  paletteEl.innerHTML = "";
  PUZZLE.suspects.forEach((letter) => addPaletteChip(letter, letter, letter === "V"));
  const sep = document.createElement("span");
  sep.className = "palette-sep";
  paletteEl.appendChild(sep);
  addPaletteChip("#x", "✕", false, true);
  addPaletteChip("#erase", "🧽", false, true);
}

function addPaletteChip(id, label, victim, special) {
  const btn = document.createElement("button");
  btn.className = "suspect-chip" + (victim ? " victim" : "") + (special ? " special-chip" : "");
  btn.textContent = label;
  btn.title = special ? (id === "#x" ? "Cross out" : "Erase") : (PUZZLE.names[id] || id);
  btn.dataset.item = id;
  btn.addEventListener("click", () => selectItem(id));
  if (isSuspectSelectionId(id)) {
    btn.addEventListener("mouseenter", () => { hoveredSuspect = id; applyHighlights(); });
    btn.addEventListener("mouseleave", () => { hoveredSuspect = null; applyHighlights(); });
  }
  paletteEl.appendChild(btn);
}

function isSuspectSelectionId(id) {
  return id !== "#x" && id !== "#erase";
}

function selectItem(id) {
  selection = selection === id ? null : id;
  updateSelectionUI();
  updateHint();
  applyHighlights();
}

function updateSelectionUI() {
  document.querySelectorAll("[data-item]").forEach((el) => {
    el.classList.toggle("selected", el.dataset.item === selection);
  });
}

// Keyboard shortcuts: a suspect's letter selects them, "x" selects the cross-out tool.
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
  if (!PUZZLE) return;

  if (e.key.toLowerCase() === "x") {
    selectItem("#x");
    return;
  }
  const letter = e.key.toUpperCase();
  if (PUZZLE.suspects.includes(letter)) {
    selectItem(letter);
  }
});

// --- Clue list ---------------------------------------------------------

function buildClueList() {
  clueListEl.innerHTML = "";
  PUZZLE.clues.forEach((clue) => {
    const li = document.createElement("li");
    li.className = "clue-row" + (clue.suspect ? "" : " no-suspect");
    if (clue.suspect) {
      li.dataset.item = clue.suspect;
      li.tabIndex = 0;
      li.setAttribute("role", "button");
    }

    if (clue.suspect) {
      const chip = document.createElement("span");
      chip.className = "suspect-chip chip-inline" + (clue.suspect === "V" ? " victim" : "");
      chip.textContent = clue.suspect;
      li.appendChild(chip);
    }
    const text = document.createElement("span");
    text.className = "clue-text";
    text.textContent = clue.text;
    li.appendChild(text);

    const activate = () => { if (clue.suspect) selectItem(clue.suspect); };
    li.addEventListener("click", activate);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    });
    li.addEventListener("mouseenter", () => {
      if (clue.suspect) hoveredSuspect = clue.suspect;
      hoverRefs = {
        rooms: new Set(clue.refs.rooms),
        objects: new Set(clue.refs.objects),
        suspects: new Set(clue.refs.suspects),
      };
      applyHighlights();
    });
    li.addEventListener("mouseleave", () => {
      hoveredSuspect = null;
      hoverRefs = null;
      applyHighlights();
    });

    clueListEl.appendChild(li);
  });
}

// --- Legend --------------------------------------------------------------

function buildLegend() {
  const occupiable = Object.entries(OBJECT_TYPES).filter(([, t]) => t.occupiable);
  const blocking = Object.entries(OBJECT_TYPES).filter(([, t]) => !t.occupiable);

  const tile = ([key, type]) => `
    <div class="legend-item">
      <span class="legend-icon">${type.art(1, 1)}</span>
      <span>${type.label}</span>
    </div>`;

  legendEl.innerHTML = `
    <details open>
      <summary>Legend &amp; how to play</summary>
      <div class="legend-groups">
        <div class="legend-group">
          <h3>Can be occupied</h3>
          ${occupiable.map(tile).join("")}
        </div>
        <div class="legend-group">
          <h3>Cannot be occupied</h3>
          ${blocking.map(tile).join("")}
        </div>
      </div>
      <p class="legend-howto">
        Pick a suspect, then <strong>click</strong> to pencil in a candidate,
        <strong>hold</strong> to place them definitively (crosses out their row &amp; column),
        or <strong>drag</strong> to paint candidates across cells.
        Pick <strong>✕</strong> or <strong>Erase</strong> and click or drag the same way — holding does nothing extra.
        Click a row or column number to apply the selected tool to that whole line at once (existing ✕s are left alone).
      </p>
    </details>`;
}

// --- Grid rendering ----------------------------------------------------

function borderStyle(r, c, dr, dc) {
  const nr = r + dr, nc = c + dc;
  const outOfBounds = nr < 0 || nr >= PUZZLE.rows || nc < 0 || nc >= PUZZLE.cols;
  const sameRoom = !outOfBounds && PUZZLE.roomGrid[nr][nc] === PUZZLE.roomGrid[r][c];
  return sameRoom ? "1px solid var(--border)" : "3px solid #111318";
}

// Leading track on both axes is a fixed size (var(--hdr-size)) shared identically by
// every layer via the CSS custom property — NOT `auto`. The four content layers are
// independent grid containers only visually aligned because they're handed identical
// templates over the same shared box; an `auto` track would size to each container's
// own content (real header buttons in one, nothing in the others) and drift every
// cell out of alignment. A fixed length keeps the remaining `1fr` cell tracks pixel-
// identical across all layers at any grid size or viewport width.
function setLayerTemplate(el) {
  el.style.gridTemplateColumns = `var(--hdr-size) repeat(${PUZZLE.cols}, 1fr)`;
  el.style.gridTemplateRows = `var(--hdr-size) repeat(${PUZZLE.rows}, 1fr)`;
}

function computeRoomAnchors() {
  const anchors = {}; // roomId -> {r, c0, c1, score}
  for (let r = 0; r < PUZZLE.rows; r++) {
    let c = 0;
    while (c < PUZZLE.cols) {
      const roomId = PUZZLE.roomGrid[r][c];
      let c1 = c;
      while (c1 + 1 < PUZZLE.cols && PUZZLE.roomGrid[r][c1 + 1] === roomId) c1++;
      const runLength = c1 - c + 1;
      const score = runLength * 10 + r;
      if (!anchors[roomId] || score > anchors[roomId].score) {
        anchors[roomId] = { r, c0: c, c1, score };
      }
      c = c1 + 1;
    }
  }
  return anchors;
}

// Builds the three static layers (cells, objects, labels) and attaches interaction
// listeners once. Called only when a puzzle is (re)loaded — never on every render,
// so an in-progress long-press/drag gesture never has its DOM pulled out from under it.
function renderStatic() {
  [layerCellsEl, layerObjectsEl, layerLabelsEl, layerMarksEl, layerHeadersEl].forEach(setLayerTemplate);

  // Cap how wide (and, via aspect-ratio:1 cells, how tall) the grid can render.
  // Needed once the split layout can give it a much wider column than main's old
  // 720px cap ever allowed — without this a small grid in a wide left column would
  // render oversized, taller than the viewport.
  const gs = getComputedStyle(gridEl);
  const hdrPx = parseFloat(gs.getPropertyValue("--hdr-size")) || 28;
  const borderPx = parseFloat(gs.borderLeftWidth) + parseFloat(gs.borderRightWidth);
  gridEl.style.maxWidth = `${hdrPx + borderPx + PUZZLE.cols * CELL_MAX}px`;

  layerCellsEl.innerHTML = "";
  layerObjectsEl.innerHTML = "";
  layerLabelsEl.innerHTML = "";
  layerMarksEl.innerHTML = "";
  layerHeadersEl.innerHTML = "";

  // +2 offset (not +1): track 1 on each axis is the fixed header gutter, so model
  // row/col r/c sit at CSS grid track r+2/c+2. dataset.r/c etc. stay plain model
  // coordinates throughout — only the grid placement carries the offset.
  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      const blocked = isBlocked(r, c);
      const cellEl = document.createElement("div");
      cellEl.className = "cell" + (blocked ? " blocked" : "");
      cellEl.dataset.r = r;
      cellEl.dataset.c = c;
      cellEl.style.gridRow = r + 2;
      cellEl.style.gridColumn = c + 2;
      cellEl.style.background = ROOM_COLORS[PUZZLE.roomGrid[r][c]] || DEFAULT_ROOM_COLOR;
      cellEl.style.borderTop = borderStyle(r, c, -1, 0);
      cellEl.style.borderBottom = borderStyle(r, c, 1, 0);
      cellEl.style.borderLeft = borderStyle(r, c, 0, -1);
      cellEl.style.borderRight = borderStyle(r, c, 0, 1);
      layerCellsEl.appendChild(cellEl);

      const markEl = document.createElement("div");
      markEl.className = "mark";
      markEl.dataset.r = r;
      markEl.dataset.c = c;
      markEl.style.gridRow = r + 2;
      markEl.style.gridColumn = c + 2;
      layerMarksEl.appendChild(markEl);
    }
  }

  const seen = new Set();
  PUZZLE.objects.forEach((obj) => {
    const record = objectAt[obj.cells[0][0]][obj.cells[0][1]];
    if (!record || seen.has(record)) return;
    seen.add(record);
    const type = OBJECT_TYPES[record.type];
    const wrap = document.createElement("div");
    wrap.className = "object-cell " + (record.occupiable ? "occupiable" : "blocking");
    wrap.dataset.type = record.type;
    wrap.dataset.r0 = record.r0;
    wrap.dataset.c0 = record.c0;
    wrap.dataset.rowSpan = record.rowSpan;
    wrap.dataset.colSpan = record.colSpan;
    wrap.style.gridRow = `${record.r0 + 2} / span ${record.rowSpan}`;
    wrap.style.gridColumn = `${record.c0 + 2} / span ${record.colSpan}`;
    wrap.innerHTML = type.art(record.colSpan, record.rowSpan);
    layerObjectsEl.appendChild(wrap);
  });

  const anchors = computeRoomAnchors();
  Object.entries(PUZZLE.rooms).forEach(([roomId, room]) => {
    const anchor = anchors[roomId];
    if (!anchor) return;
    const pill = document.createElement("div");
    pill.className = "room-label";
    pill.dataset.room = roomId;
    pill.textContent = room.name;
    pill.style.gridRow = anchor.r + 2;
    pill.style.gridColumn = `${anchor.c0 + 2} / span ${anchor.c1 - anchor.c0 + 1}`;
    layerLabelsEl.appendChild(pill);
  });

  for (let c = 0; c < PUZZLE.cols; c++) {
    layerHeadersEl.appendChild(makeHeaderButton("col", c, 1, c + 2));
  }
  for (let r = 0; r < PUZZLE.rows; r++) {
    layerHeadersEl.appendChild(makeHeaderButton("row", r, r + 2, 1));
  }
}

function makeHeaderButton(kind, index, gridRow, gridColumn) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `grid-header ${kind}-header`;
  btn.dataset.line = kind; // "row" | "col"
  btn.dataset.index = index; // 0-based model index
  btn.textContent = index + 1; // 1-based display
  btn.setAttribute("aria-label", `Apply selected tool to ${kind === "row" ? "row" : "column"} ${index + 1}`);
  btn.style.gridRow = gridRow;
  btn.style.gridColumn = gridColumn;
  return btn;
}

// Rewrites cell content (definite letter / X / pencil marks) after a mutation.
// Does not touch DOM structure or listeners.
function renderMarks() {
  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      const cell = grid[r][c];
      const markEl = layerMarksEl.children[r * PUZZLE.cols + c];
      markEl.innerHTML = "";
      markEl.classList.remove("definite", "crossed");

      if (cell.definite) {
        markEl.classList.add("definite");
        const label = document.createElement("span");
        label.className = "cell-main";
        label.textContent = cell.definite;
        markEl.appendChild(label);
      } else if (cell.x) {
        markEl.classList.add("crossed");
        const label = document.createElement("span");
        label.className = "cell-main";
        label.textContent = "✕";
        markEl.appendChild(label);
      } else if (cell.pencil.size > 0) {
        const pencilGrid = document.createElement("div");
        pencilGrid.className = "pencil-grid";
        PUZZLE.suspects.forEach((letter) => {
          const span = document.createElement("span");
          span.dataset.letter = letter;
          if (cell.pencil.has(letter)) span.textContent = letter;
          pencilGrid.appendChild(span);
        });
        markEl.appendChild(pencilGrid);
      }
    }
  }
}

function findClueForSuspect(letter) {
  return PUZZLE.clues.find((c) => c.suspect === letter) || null;
}

// An object counts as "ruled out" (and shouldn't highlight as a clue reference) once every
// cell it occupies has been marked X — the player has already determined nobody's there.
function isObjectRuledOut(el) {
  const r0 = +el.dataset.r0, c0 = +el.dataset.c0;
  const rowSpan = +el.dataset.rowSpan, colSpan = +el.dataset.colSpan;
  for (let r = r0; r < r0 + rowSpan; r++) {
    for (let c = c0; c < c0 + colSpan; c++) {
      if (!grid[r][c].x) return false;
    }
  }
  return true;
}

// Toggles highlight classes only — suspect-candidate ring (yellow) and clue refs (teal).
// Called after every render and on every hover/selection change.
function applyHighlights() {
  const highlightLetter = hoveredSuspect || (isSuspectSelection(selection) ? selection : null);

  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      const cell = grid[r][c];
      const markEl = layerMarksEl.children[r * PUZZLE.cols + c];
      const has = highlightLetter && (cell.definite === highlightLetter || cell.pencil.has(highlightLetter));
      markEl.classList.toggle("highlighted", !!has);
      const pencilSpan = markEl.querySelector(`.pencil-grid span[data-letter="${highlightLetter}"]`);
      markEl.querySelectorAll(".pencil-grid span").forEach((s) => s.classList.remove("pencil-highlighted"));
      if (highlightLetter && pencilSpan) pencilSpan.classList.add("pencil-highlighted");
    }
  }

  // Refs come from whichever clue is currently hovered, PLUS — persistently, regardless of
  // hover — the selected suspect's own clue, so their refs stay visible while they're selected.
  const stickyClue = isSuspectSelection(selection) ? findClueForSuspect(selection) : null;
  const refRooms = new Set([...(hoverRefs?.rooms || []), ...(stickyClue?.refs.rooms || [])]);
  const refObjects = new Set([...(hoverRefs?.objects || []), ...(stickyClue?.refs.objects || [])]);
  const refsActive = refRooms.size > 0 || refObjects.size > 0;
  gridEl.classList.toggle("refs-active", refsActive);

  layerCellsEl.querySelectorAll(".cell").forEach((cellEl) => {
    const r = +cellEl.dataset.r, c = +cellEl.dataset.c;
    const inRoom = refsActive && refRooms.has(PUZZLE.roomGrid[r][c]);
    cellEl.classList.toggle("ref-room", !!inRoom);
  });

  layerObjectsEl.querySelectorAll(".object-cell").forEach((el) => {
    const inRefs = refsActive && refObjects.has(el.dataset.type) && !isObjectRuledOut(el);
    el.classList.toggle("ref-object", !!inRefs);
  });

  layerHeadersEl.querySelectorAll(".grid-header").forEach((btn) => {
    const dead = !selection || !lineCells(btn.dataset.line, +btn.dataset.index).some(([r, c]) => canBulkApply(r, c));
    btn.classList.toggle("no-op", dead);
  });
}

// --- Gesture handling (pointer events: short click = pencil, hold = place, drag = paint) --

function attachGestureListeners() {
  layerCellsEl.addEventListener("contextmenu", (e) => e.preventDefault());
  layerCellsEl.addEventListener("pointerdown", onPointerDown);
  layerCellsEl.addEventListener("pointermove", onPointerMove);
  layerCellsEl.addEventListener("pointerup", endGesture);
  layerCellsEl.addEventListener("pointercancel", endGesture);
  layerHeadersEl.addEventListener("click", onHeaderClick);
}

function onHeaderClick(e) {
  const btn = e.target.closest(".grid-header");
  if (!btn || !PUZZLE) return;
  applyToLine(btn.dataset.line, +btn.dataset.index);
}

function cellFromEvent(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest(".cell");
  if (!el) return null;
  return { el, r: +el.dataset.r, c: +el.dataset.c };
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  const hit = cellFromEvent(e);
  if (!hit) return;
  const { r, c } = hit;

  if (!selection) {
    setStatus("Pick a suspect, ✕, or Erase first.");
    return;
  }
  if (isBlocked(r, c)) return;

  e.preventDefault();
  layerCellsEl.setPointerCapture(e.pointerId);

  if (selection === "#x" || selection === "#erase") {
    if (!canApplySelection(r, c)) return;
    pushHistory();
    const applied = applySelectionToCell(r, c, null);
    renderMarks();
    applyHighlights();
    saveProgress();
    gesture = { pointerId: e.pointerId, r, c, x0: e.clientX, y0: e.clientY, mode: "paint", dragApply: applied, timer: null };
    return;
  }

  // Suspect selected: pencil immediately, arm a long-press timer to promote to a placement.
  if (!canApplySelection(r, c)) return;
  pushHistory();
  const applied = applySelectionToCell(r, c, null);
  renderMarks();
  applyHighlights();
  saveProgress();

  const cellEl = hit.el;
  cellEl.classList.add("pressing");
  cellEl.style.setProperty("--press-ms", `${LONG_PRESS_MS}ms`);

  gesture = { pointerId: e.pointerId, r, c, x0: e.clientX, y0: e.clientY, mode: "pending", dragApply: applied, timer: null };
  gesture.timer = setTimeout(() => promoteToPlace(r, c, cellEl), LONG_PRESS_MS);
}

function onPointerMove(e) {
  if (!gesture || gesture.pointerId !== e.pointerId) return;

  if (gesture.mode === "pending") {
    const moved = Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > MOVE_TOLERANCE_PX;
    const hit = cellFromEvent(e);
    const cellChanged = hit && (hit.r !== gesture.r || hit.c !== gesture.c);
    if (moved || cellChanged) {
      clearTimeout(gesture.timer);
      clearPressingClass();
      gesture.mode = "paint";
    } else {
      return;
    }
  }

  if (gesture.mode === "paint") {
    const hit = cellFromEvent(e);
    if (!hit) return;
    if (hit.r === gesture.r && hit.c === gesture.c) return;
    gesture.r = hit.r;
    gesture.c = hit.c;
    if (isBlocked(hit.r, hit.c)) return;
    applySelectionToCell(hit.r, hit.c, gesture.dragApply);
    renderMarks();
    applyHighlights();
    saveProgress();
  }
}

function promoteToPlace(r, c, cellEl) {
  if (!gesture || gesture.mode !== "pending") return;
  const cell = grid[r][c];
  if (cell.definite === selection) {
    cell.definite = null; // toggle off
  } else if (!cell.definite) {
    placeDefinitely(r, c, selection);
  }
  gesture.mode = "placed";
  cellEl.classList.remove("pressing");
  cellEl.classList.add("press-fired");
  setTimeout(() => cellEl.classList.remove("press-fired"), 200);
  renderMarks();
  applyHighlights();
  saveProgress();
}

function clearPressingClass() {
  layerCellsEl.querySelectorAll(".pressing").forEach((el) => el.classList.remove("pressing"));
}

function endGesture(e) {
  if (!gesture || gesture.pointerId !== e.pointerId) return;
  clearTimeout(gesture.timer);
  clearPressingClass();
  gesture = null;
}

window.addEventListener("blur", () => {
  if (gesture) {
    clearTimeout(gesture.timer);
    clearPressingClass();
    gesture = null;
  }
});

// --- Cell hover status line ------------------------------------------------

function describeCell(r, c) {
  const roomName = PUZZLE.rooms[PUZZLE.roomGrid[r][c]]?.name || "";
  const obj = objectAt[r][c];
  let what;
  if (obj) {
    const type = OBJECT_TYPES[obj.type];
    const spanNote = obj.cells.length > 1 ? ` · ${obj.cells.length} cells` : "";
    what = `${type.label} (${type.occupiable ? "can be occupied" : "cannot be occupied"}${spanNote})`;
  } else {
    what = "Empty floor";
  }
  const cell = grid[r][c];
  let stateNote = "";
  if (cell.definite) stateNote = ` · ${cell.definite} placed`;
  else if (cell.x) stateNote = " · ruled out";
  else if (cell.pencil.size > 0) stateNote = ` · candidates ${[...cell.pencil].join(", ")}`;
  return `${roomName} · ${what}${stateNote}`;
}

function setHoveredRoom(roomId) {
  layerLabelsEl.querySelectorAll(".room-label").forEach((el) => {
    el.classList.toggle("active", !!roomId && el.dataset.room === roomId);
  });
}

layerCellsEl?.addEventListener?.("pointerover", (e) => {
  const hit = cellFromEvent(e);
  if (hit) {
    setStatus(describeCell(hit.r, hit.c));
    setHoveredRoom(PUZZLE.roomGrid[hit.r][hit.c]);
  }
});
gridEl.addEventListener("pointerleave", () => {
  setStatus("");
  setHoveredRoom(null);
});

// --- Tool logic ----------------------------------------------------------

function canApplySelection(r, c) {
  if (isBlocked(r, c)) return false;
  const cell = grid[r][c];
  if (selection === "#x") return !cell.definite;
  if (selection === "#erase") return !!cell.definite || cell.x || cell.pencil.size > 0;
  if (isSuspectSelection(selection)) return !cell.definite;
  return false;
}

// Whether a whole-line (row/column) fill of the current selection would actually change
// this cell. Stricter than canApplySelection: pencil additionally skips cells already
// marked X ("respect the X's already in place") — a single-cell pencil click doesn't
// check that, but a bulk fill silently stashing a pencil mark under an X (invisible
// until the X is erased) would be surprising. Every case here is "turn on / clear",
// never a toggle, so a cell that already has the mark is correctly a no-op.
function canBulkApply(r, c) {
  if (isBlocked(r, c)) return false;
  const cell = grid[r][c];
  if (selection === "#x") return !cell.definite && !cell.x;
  if (selection === "#erase") return !!cell.definite || cell.x || cell.pencil.size > 0;
  if (isSuspectSelection(selection)) return !cell.definite && !cell.x && !cell.pencil.has(selection);
  return false;
}

function lineCells(kind, index) {
  const out = [];
  if (kind === "row") {
    for (let c = 0; c < PUZZLE.cols; c++) out.push([index, c]);
  } else {
    for (let r = 0; r < PUZZLE.rows; r++) out.push([r, index]);
  }
  return out;
}

// Applies the current selection to every eligible cell in a row/column as one atomic
// action: a single pushHistory() so one Undo reverts the whole line, and no history
// entry at all if nothing would change (mirrors the no-op guard used for single-cell
// actions). Reuses applySelectionToCell(r, c, true) — the same "force on" path used by
// drag-painting — since bulk semantics are always "turn on/clear", never toggle.
function applyToLine(kind, index) {
  if (!selection) {
    setStatus("Pick a suspect, ✕, or Erase first.");
    return;
  }
  const targets = lineCells(kind, index).filter(([r, c]) => canBulkApply(r, c));
  if (targets.length === 0) return;

  pushHistory();
  for (const [r, c] of targets) applySelectionToCell(r, c, true);
  renderMarks();
  applyHighlights();
  saveProgress();
}

// forceApply: null = toggle and report which way it went; true/false = force that state (for drag painting)
function applySelectionToCell(r, c, forceApply) {
  if (isBlocked(r, c)) return null;
  const cell = grid[r][c];

  if (selection === "#x") {
    if (cell.definite) return null;
    const shouldHave = forceApply === null ? !cell.x : forceApply;
    cell.x = shouldHave;
    if (shouldHave) cell.pencil.clear();
    return shouldHave;
  }

  if (selection === "#erase") {
    if (!cell.definite && !cell.x && cell.pencil.size === 0) return null;
    cell.definite = null;
    cell.x = false;
    cell.pencil.clear();
    return true;
  }

  if (isSuspectSelection(selection)) {
    if (cell.definite) return null;
    const has = cell.pencil.has(selection);
    const shouldHave = forceApply === null ? !has : forceApply;
    if (shouldHave) cell.pencil.add(selection);
    else cell.pencil.delete(selection);
    return shouldHave;
  }

  return null;
}

function placeDefinitely(r, c, letter) {
  const cell = grid[r][c];
  cell.definite = letter;
  cell.pencil.clear();
  cell.x = false;
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

// Clears state on any cell that is now blocked — guards against puzzle data corrections
// (or a save from an older schema) leaving a placement/pencil mark on an un-occupiable cell.
function sanitizeRestoredGrid() {
  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      if (isBlocked(r, c)) {
        grid[r][c] = { pencil: new Set(), definite: null, x: false };
      }
    }
  }
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
  renderMarks();
  applyHighlights();
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

function gridMatchesDimensions(g) {
  return Array.isArray(g) && g.length === PUZZLE.rows && g.every((row) => Array.isArray(row) && row.length === PUZZLE.cols);
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
    if (data.puzzleId !== PUZZLE.id || !gridMatchesDimensions(data.grid)) return false;
    restoreSnapshot(data.grid);
    sanitizeRestoredGrid();
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
      if (!gridMatchesDimensions(data.grid)) throw new Error("Save file doesn't match this puzzle's grid size.");
      pushHistory();
      restoreSnapshot(data.grid);
      sanitizeRestoredGrid();
      renderMarks();
      applyHighlights();
      saveProgress();
    } catch (err) {
      alert("Couldn't load that file: " + err.message);
    } finally {
      loadInput.value = "";
    }
  };
  reader.readAsText(file);
});

// --- Layout: side-by-side clues split with a draggable, remembered divider ---
//
// Split vs. stacked is a JS-computed mode (not a media query) because the grid's own
// minimum width is puzzle-dependent (6x6 vs 12x12+ have very different floors) and
// can only be known once a puzzle is loaded. desiredCluesWidth is the user's WISH —
// only ever written by an explicit drag/keyboard/reset gesture and persisted to
// localStorage; every render instead applies clampCluesWidth(desiredCluesWidth), so a
// puzzle switch that forces a visually narrower column never overwrites what the user
// actually asked for.

let desiredCluesWidth = CLUES_DEFAULT;
let appliedCluesWidth = CLUES_DEFAULT;
let splitDrag = null; // {pointerId, x0, w0}
let resizeRaf = null;

function gridMinWidth() {
  if (!PUZZLE) return 0;
  const gs = getComputedStyle(gridEl);
  const hdr = parseFloat(gs.getPropertyValue("--hdr-size")) || 28;
  const border = parseFloat(gs.borderLeftWidth) + parseFloat(gs.borderRightWidth);
  const firstCell = layerCellsEl.firstElementChild;
  const cellMin = firstCell ? parseFloat(getComputedStyle(firstCell).minWidth) : 52;
  return Math.ceil(hdr + border + PUZZLE.cols * cellMin);
}

function availableWidth() {
  const pad = parseFloat(getComputedStyle(document.body).paddingLeft) + parseFloat(getComputedStyle(document.body).paddingRight);
  return Math.min(document.documentElement.clientWidth - pad, SPLIT_MAX_WIDTH);
}

function canSplit() {
  return !!PUZZLE && availableWidth() >= gridMinWidth() + HANDLE_W + CLUES_MIN + SPLIT_HYSTERESIS;
}

function clampCluesWidth(w) {
  const max = Math.min(CLUES_MAX, availableWidth() - HANDLE_W - gridMinWidth());
  return Math.max(CLUES_MIN, Math.min(w, max));
}

function applySplit(w) {
  appliedCluesWidth = w;
  workspaceEl.style.gridTemplateColumns = `minmax(0, 1fr) ${HANDLE_W}px ${w}px`;
  resizeHandleEl.setAttribute("aria-valuenow", String(Math.round(w)));
  resizeHandleEl.setAttribute("aria-valuemin", String(CLUES_MIN));
  resizeHandleEl.setAttribute("aria-valuemax", String(CLUES_MAX));
}

function updateLayoutMode() {
  const split = canSplit();
  mainEl.classList.toggle("split", split);
  if (split) applySplit(clampCluesWidth(desiredCluesWidth));
  else workspaceEl.style.gridTemplateColumns = "";
}

function attachSplitListeners() {
  resizeHandleEl.addEventListener("pointerdown", onHandleDown);
  resizeHandleEl.addEventListener("pointermove", onHandleMove);
  resizeHandleEl.addEventListener("pointerup", endHandleDrag);
  resizeHandleEl.addEventListener("pointercancel", endHandleDrag);
  resizeHandleEl.addEventListener("dblclick", () => {
    desiredCluesWidth = CLUES_DEFAULT;
    if (mainEl.classList.contains("split")) applySplit(clampCluesWidth(desiredCluesWidth));
    saveSplitPref();
  });
  resizeHandleEl.addEventListener("keydown", onHandleKey);
  window.addEventListener("resize", () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      updateLayoutMode();
    });
  });
}

function onHandleDown(e) {
  if (e.button !== 0 || !mainEl.classList.contains("split")) return;
  e.preventDefault();
  resizeHandleEl.setPointerCapture(e.pointerId);
  splitDrag = { pointerId: e.pointerId, x0: e.clientX, w0: appliedCluesWidth };
  document.body.classList.add("resizing");
}

function onHandleMove(e) {
  if (!splitDrag || splitDrag.pointerId !== e.pointerId) return;
  // Dragging left widens the clues column (it sits to the right of the handle).
  applySplit(clampCluesWidth(splitDrag.w0 - (e.clientX - splitDrag.x0)));
}

function endHandleDrag(e) {
  if (!splitDrag || splitDrag.pointerId !== e.pointerId) return;
  splitDrag = null;
  document.body.classList.remove("resizing");
  desiredCluesWidth = appliedCluesWidth;
  saveSplitPref();
}

function onHandleKey(e) {
  if (!mainEl.classList.contains("split")) return;
  const step = e.shiftKey ? 64 : 24;
  if (e.key === "ArrowLeft") desiredCluesWidth = clampCluesWidth(appliedCluesWidth + step);
  else if (e.key === "ArrowRight") desiredCluesWidth = clampCluesWidth(appliedCluesWidth - step);
  else if (e.key === "Home") desiredCluesWidth = CLUES_DEFAULT;
  else return;
  e.preventDefault();
  applySplit(clampCluesWidth(desiredCluesWidth));
  saveSplitPref();
}

function loadSplitPref() {
  const raw = parseFloat(localStorage.getItem("murdoku:cluesWidth"));
  desiredCluesWidth = Number.isFinite(raw) && raw > 0
    ? Math.max(CLUES_MIN, Math.min(raw, CLUES_MAX))
    : CLUES_DEFAULT;
}

function saveSplitPref() {
  try {
    localStorage.setItem("murdoku:cluesWidth", String(Math.round(desiredCluesWidth)));
  } catch (err) {
    console.warn("Couldn't save layout preference:", err);
  }
}

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
  PUZZLE = normalizePuzzle(data);
  objectAt = buildObjectIndex(PUZZLE);
  grid = freshGrid();
  history = [];
  selection = null;
  hoveredSuspect = null;
  hoverRefs = null;
  gesture = null;

  puzzleTitleEl.textContent = PUZZLE.title;
  puzzleDifficultyEl.textContent = PUZZLE.difficulty ? `difficulty: ${PUZZLE.difficulty}` : "";
  puzzleDifficultyEl.className = "difficulty-badge" + (PUZZLE.difficulty ? ` difficulty-${PUZZLE.difficulty}` : "");

  buildPalette();
  buildClueList();
  updateSelectionUI();
  updateHint();
  updateUndoButton();
  loadProgressFromLocalStorage();
  renderStatic();
  renderMarks();
  applyHighlights();
  updateLayoutMode(); // depends on renderStatic() having produced a measurable .cell
}

async function selectPuzzle(id, manifest) {
  const entry = manifest.find((p) => p.id === id);
  if (!entry) return;
  const data = await loadPuzzleData(entry.file);
  initPuzzle(data);
  localStorage.setItem("murdoku:lastPuzzle", id);
}

async function boot() {
  attachGestureListeners(); // element is reused across puzzle switches — attach exactly once
  attachSplitListeners();
  loadSplitPref();
  buildLegend();

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
