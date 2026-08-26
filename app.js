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
  bear: {
    label: "Bear", emoji: "🐻", occupiable: false,
    art() {
      return svgObject("#a38a70", "#625851", "#332c26", `
        <ellipse cx="50" cy="58" rx="30" ry="26" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <circle cx="30" cy="28" r="10" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <circle cx="60" cy="24" r="14" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <ellipse cx="62" cy="28" rx="6" ry="5" fill="var(--obj-fill2)"/>
      `, 100, 100);
    },
  },
  boulder: {
    label: "Boulder", emoji: "🪨", occupiable: false,
    art() {
      return svgObject("#7d7e80", "#ddd9df", "#333436", `
        <path d="M50 12 C74 12 88 30 84 52 C80 76 62 88 42 86 C20 84 10 66 14 46 C18 26 30 12 50 12Z"
          fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M38 30 C48 26 60 32 58 44" stroke="var(--obj-fill2)" stroke-width="3" fill="none" stroke-linecap="round"/>
      `, 100, 100);
    },
  },
  carpet: {
    label: "Carpet", emoji: "🧵", occupiable: true,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      return svgObject("#c96f6f", "#e8c15a", "#5c2f2f", `
        <rect x="${w * 0.06}" y="${h * 0.06}" width="${w * 0.88}" height="${h * 0.88}" rx="6" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="${w * 0.16}" y="${h * 0.16}" width="${w * 0.68}" height="${h * 0.68}" rx="4" fill="none" stroke="var(--obj-fill2)" stroke-width="3"/>
      `, w, h);
    },
  },
  boat: {
    label: "Boat", emoji: "🚤", occupiable: true,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      const horizontal = colSpan >= rowSpan;
      return svgObject("#d9974f", "#8a5a2e", "#4a3319", horizontal ? `
        <path d="M${w * 0.05} ${h * 0.55} Q${w * 0.5} ${h * 0.85} ${w * 0.95} ${h * 0.55} L${w * 0.85} ${h * 0.35} L${w * 0.15} ${h * 0.35} Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="${w * 0.42}" y="${h * 0.15}" width="${w * 0.16}" height="${h * 0.22}" fill="var(--obj-fill2)"/>
      ` : `
        <path d="M${w * 0.55} ${h * 0.05} Q${w * 0.85} ${h * 0.5} ${w * 0.55} ${h * 0.95} L${w * 0.35} ${h * 0.85} L${w * 0.35} ${h * 0.15} Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="${w * 0.15}" y="${h * 0.42}" width="${w * 0.22}" height="${h * 0.16}" fill="var(--obj-fill2)"/>
      `, w, h);
    },
  },
  box: {
    label: "Box", emoji: "📦", occupiable: false,
    art() {
      return svgObject("#c2a86a", "#8a6f3a", "#4a3c1f", `
        <rect x="12" y="18" width="76" height="64" rx="4" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <line x1="50" y1="18" x2="50" y2="82" stroke="var(--obj-fill2)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  crate: {
    label: "Crate", emoji: "🪵", occupiable: false,
    art() {
      return svgObject("#b98a4f", "#7a5528", "#40290f", `
        <rect x="10" y="14" width="80" height="72" rx="3" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <line x1="10" y1="14" x2="90" y2="86" stroke="var(--obj-fill2)" stroke-width="3"/>
        <line x1="90" y1="14" x2="10" y2="86" stroke="var(--obj-fill2)" stroke-width="3"/>
        <rect x="10" y="14" width="80" height="72" rx="3" fill="none" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  safe: {
    label: "Safe", emoji: "🔒", occupiable: false,
    art() {
      return svgObject("#8f96a3", "#3a3f4a", "#1c1f26", `
        <rect x="14" y="10" width="72" height="80" rx="6" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <circle cx="50" cy="48" r="16" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="46" y="44" width="8" height="8" fill="var(--obj-fill)"/>
      `, 100, 100);
    },
  },
  statue: {
    label: "Statue", emoji: "🗿", occupiable: false,
    art() {
      return svgObject("#c9c3b0", "#8a7fc9", "#4a4636", `
        <rect x="26" y="70" width="48" height="18" rx="2" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M50 14 C64 14 68 30 62 42 C70 48 70 62 60 70 L40 70 C30 62 30 48 38 42 C32 30 36 14 50 14Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  easel: {
    label: "Easel", emoji: "🖼️", occupiable: false,
    art() {
      return svgObject("#d9cdb0", "#8a5a2e", "#4a3319", `
        <rect x="24" y="14" width="52" height="42" rx="2" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <line x1="50" y1="56" x2="50" y2="90" stroke="var(--obj-fill2)" stroke-width="5"/>
        <line x1="50" y1="70" x2="22" y2="90" stroke="var(--obj-fill2)" stroke-width="5"/>
        <line x1="50" y1="70" x2="78" y2="90" stroke="var(--obj-fill2)" stroke-width="5"/>
      `, 100, 100);
    },
  },
  framedpainting: {
    label: "Framed Painting", emoji: "🖼️", occupiable: true,
    art() {
      return svgObject("#8fbde0", "#8a5a2e", "#4a3319", `
        <rect x="14" y="14" width="72" height="72" rx="2" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="4"/>
        <rect x="24" y="24" width="52" height="52" rx="1" fill="var(--obj-fill)"/>
      `, 100, 100);
    },
  },
  water: {
    label: "Water", emoji: "🌊", occupiable: false,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      return svgObject("#5ab0d9", "#2f7fa8", "#1a4d66", `
        <rect x="0" y="0" width="${w}" height="${h}" fill="var(--obj-fill)"/>
        <path d="M0 ${h * 0.3} Q${w * 0.25} ${h * 0.18} ${w * 0.5} ${h * 0.3} T${w} ${h * 0.3}" stroke="var(--obj-fill2)" stroke-width="4" fill="none"/>
        <path d="M0 ${h * 0.6} Q${w * 0.25} ${h * 0.48} ${w * 0.5} ${h * 0.6} T${w} ${h * 0.6}" stroke="var(--obj-fill2)" stroke-width="4" fill="none"/>
      `, w, h);
    },
  },
  lion: {
    label: "Lion", emoji: "🦁", occupiable: false,
    art() {
      return svgObject("#e0a94f", "#a86a2f", "#4a2f14", `
        <circle cx="50" cy="52" r="34" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <circle cx="50" cy="50" r="20" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  penguin: {
    label: "Penguin", emoji: "🐧", occupiable: false,
    art() {
      return svgObject("#2f333a", "#e8ecef", "#14161a", `
        <ellipse cx="50" cy="55" rx="26" ry="34" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <ellipse cx="50" cy="60" rx="14" ry="22" fill="var(--obj-fill2)"/>
        <path d="M44 32 L56 32 L50 42 Z" fill="#e8a940"/>
      `, 100, 100);
    },
  },
  crocodile: {
    label: "Crocodile", emoji: "🐊", occupiable: false,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      return svgObject("#5c9a5c", "#3a6b3a", "#1f3d1f", `
        <ellipse cx="${w * 0.5}" cy="${h * 0.55}" rx="${w * 0.42}" ry="${h * 0.24}" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M${w * 0.1} ${h * 0.55} L${w * 0.02} ${h * 0.4} L${w * 0.02} ${h * 0.7} Z" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, w, h);
    },
  },
  shark: {
    label: "Shark", emoji: "🦈", occupiable: false,
    art() {
      return svgObject("#8a97a3", "#5c6773", "#2c333a", `
        <path d="M12 60 Q50 30 88 60 Q50 74 12 60Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M46 34 L58 34 L50 14 Z" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, 100, 100);
    },
  },
  elephant: {
    label: "Elephant", emoji: "🐘", occupiable: false,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      return svgObject("#a3a8b3", "#6b7078", "#333640", `
        <ellipse cx="${w * 0.55}" cy="${h * 0.5}" rx="${w * 0.36}" ry="${h * 0.32}" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M${w * 0.24} ${h * 0.5} Q${w * 0.1} ${h * 0.7} ${w * 0.16} ${h * 0.9}" stroke="var(--obj-fill2)" stroke-width="8" fill="none" stroke-linecap="round"/>
        <circle cx="${w * 0.72}" cy="${h * 0.36}" r="${Math.min(w, h) * 0.06}" fill="var(--obj-stroke)"/>
      `, w, h);
    },
  },
  mudpuddle: {
    label: "Mud Puddle", emoji: "💧", occupiable: true,
    art() {
      return svgObject("#6b4a2c", "#8a6540", "#3a2716", `
        <ellipse cx="50" cy="55" rx="38" ry="24" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <ellipse cx="34" cy="48" rx="10" ry="6" fill="var(--obj-fill2)" opacity="0.6"/>
      `, 100, 100);
    },
  },
  barrel: {
    label: "Barrel", emoji: "🛢️", occupiable: false,
    art() {
      return svgObject("#a86a3a", "#5c3d20", "#2c1c0e", `
        <rect x="24" y="10" width="52" height="80" rx="16" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <line x1="24" y1="28" x2="76" y2="28" stroke="var(--obj-fill2)" stroke-width="4"/>
        <line x1="24" y1="72" x2="76" y2="72" stroke="var(--obj-fill2)" stroke-width="4"/>
      `, 100, 100);
    },
  },
  rubble: {
    label: "Rubble", emoji: "🪨", occupiable: false,
    art() {
      return svgObject("#8a8580", "#5c5854", "#2c2a28", `
        <path d="M14 70 L34 46 L50 62 L66 40 L88 70 Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <circle cx="30" cy="76" r="8" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="2"/>
        <circle cx="66" cy="78" r="10" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, 100, 100);
    },
  },
  catapult: {
    label: "Catapult", emoji: "🏹", occupiable: false,
    art() {
      return svgObject("#a8763f", "#5c3d20", "#2c1c0e", `
        <rect x="14" y="70" width="72" height="14" rx="3" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <line x1="30" y1="70" x2="30" y2="30" stroke="var(--obj-fill)" stroke-width="8"/>
        <line x1="70" y1="70" x2="70" y2="30" stroke="var(--obj-fill)" stroke-width="8"/>
        <line x1="30" y1="30" x2="70" y2="30" stroke="var(--obj-fill)" stroke-width="6"/>
        <circle cx="50" cy="30" r="10" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, 100, 100);
    },
  },
  camera: {
    label: "Camera", emoji: "🎥", occupiable: false,
    art() {
      return svgObject("#3a3f4a", "#1c1f26", "#0e0f13", `
        <rect x="14" y="30" width="56" height="42" rx="6" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <circle cx="42" cy="51" r="16" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <path d="M70 40 L90 30 L90 72 L70 62 Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
      `, 100, 100);
    },
  },
  house: {
    label: "House", emoji: "🏠", occupiable: true,
    art() {
      return svgObject("#d9974f", "#8a5a2e", "#4a3319", `
        <path d="M50 12 L88 44 L78 44 L78 88 L22 88 L22 44 L12 44Z" fill="var(--obj-fill2)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="34" y="56" width="32" height="32" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, 100, 100);
    },
  },
  sand: {
    label: "Sand", emoji: "🏖️", occupiable: true,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      return svgObject("#e8d29a", "#c9b06a", "#8a7440", `
        <rect x="0" y="0" width="${w}" height="${h}" fill="var(--obj-fill)"/>
        <circle cx="${w * 0.28}" cy="${h * 0.34}" r="4" fill="var(--obj-fill2)" opacity="0.7"/>
        <circle cx="${w * 0.62}" cy="${h * 0.58}" r="5" fill="var(--obj-fill2)" opacity="0.7"/>
        <circle cx="${w * 0.42}" cy="${h * 0.72}" r="3" fill="var(--obj-fill2)" opacity="0.7"/>
      `, w, h);
    },
  },
  tee: {
    label: "Tee", emoji: "⛳", occupiable: true,
    art() {
      return svgObject("#e8ecef", "#5c9a5c", "#2f4a2f", `
        <ellipse cx="50" cy="86" rx="30" ry="8" fill="var(--obj-fill2)" opacity="0.4"/>
        <line x1="50" y1="30" x2="50" y2="86" stroke="var(--obj-stroke)" stroke-width="4"/>
        <path d="M40 24 Q50 12 60 24 L50 34Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, 100, 100);
    },
  },
  flag: {
    label: "Flag", emoji: "🚩", occupiable: true,
    art() {
      return svgObject("#d94f4f", "#5c9a5c", "#2f4a2f", `
        <ellipse cx="50" cy="90" rx="26" ry="6" fill="var(--obj-fill2)" opacity="0.4"/>
        <line x1="30" y1="12" x2="30" y2="90" stroke="var(--obj-stroke)" stroke-width="4"/>
        <path d="M30 14 L70 26 L30 38Z" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="2"/>
      `, 100, 100);
    },
  },
  cart: {
    label: "Cart", emoji: "🛺", occupiable: true,
    art(colSpan, rowSpan) {
      const w = 100 * colSpan, h = 100 * rowSpan;
      return svgObject("#e8ecef", "#3a6b3a", "#1f3d1f", `
        <rect x="${w * 0.14}" y="${h * 0.34}" width="${w * 0.72}" height="${h * 0.4}" rx="8" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>
        <rect x="${w * 0.2}" y="${h * 0.14}" width="${w * 0.36}" height="${h * 0.24}" fill="none" stroke="var(--obj-fill2)" stroke-width="4"/>
        <circle cx="${w * 0.28}" cy="${h * 0.8}" r="${Math.min(w, h) * 0.09}" fill="var(--obj-stroke)"/>
        <circle cx="${w * 0.72}" cy="${h * 0.8}" r="${Math.min(w, h) * 0.09}" fill="var(--obj-stroke)"/>
      `, w, h);
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
  summit: "#3a3d44",
  rangershut: "#4a3547",
  windytrail: "#45403a",
  rockytrail: "#3f3c36",
  pineforest: "#28402e",
  bearwoods: "#443728",
  grove: "#2e4634",
  lake: "#23414a",
  booth: "#3b3a45",
};
const DEFAULT_ROOM_COLOR = "#2f313a";

// --- Per-suspect colour coding -----------------------------------------
// Indexed by letter (A=0, B=1, ...), not array position, so a given letter always
// gets the same colour across puzzles. 13 entries covers the max non-victim cast
// (14 players = A-M + V) without wrapping. No saturated red — that's reserved for
// the ✕ glyph, which shares the same marks layer.
const SUSPECT_COLORS = [
  "#7cb7ff", // A azure
  "#ffc04d", // B amber
  "#5fd3a6", // C mint
  "#ff9ec4", // D pink
  "#c79bff", // E violet
  "#a6d95a", // F lime
  "#57d6ea", // G cyan
  "#ff9d5c", // H orange
  "#8f8fe8", // I indigo
  "#d7c86a", // J olive
  "#4fbf87", // K forest
  "#e2a0f0", // L orchid
  "#b0b8c4", // M slate
];
const VICTIM_COLOR = "#efe4d0"; // V is not a suspect — kept out of the rotation

function suspectColor(letter) {
  if (letter === "V") return VICTIM_COLOR;
  return SUSPECT_COLORS[(letter.charCodeAt(0) - 65) % SUSPECT_COLORS.length];
}

function hexToRgbTriplet(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

let suspectColorStyleEl = null;

// Generates one <style> block mapping each suspect letter to CSS custom properties
// (--sc/--sc-rgb keyed off data-item/data-letter, --hl-rgb keyed off data-hl), so
// every colour-coded surface is plain CSS reading a shared var — no per-element
// inline style writes on every renderMarks()/applyHighlights() pass.
function applySuspectColors() {
  if (!suspectColorStyleEl) {
    suspectColorStyleEl = document.createElement("style");
    suspectColorStyleEl.id = "suspectColors";
    document.head.appendChild(suspectColorStyleEl);
  }
  const lines = [];
  PUZZLE.suspects.forEach((letter) => {
    const hex = suspectColor(letter);
    const rgb = hexToRgbTriplet(hex);
    lines.push(`[data-item="${letter}"], [data-letter="${letter}"] { --sc: ${hex}; --sc-rgb: ${rgb}; }`);
    lines.push(`[data-hl="${letter}"] { --hl-rgb: ${rgb}; }`);
  });
  suspectColorStyleEl.textContent = lines.join("\n");
}

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

// A cell that is not part of the board at all — outside an irregular boundary, or a
// hole punched inside one. Distinct from "blocked": a blocked cell is a real board
// cell holding furniture nobody can stand on (it has a room, art, hover text, and
// room borders); a void cell has none of those and simply doesn't exist. Cheap to
// test straight off roomGrid — no index to build.
function isVoid(r, c) {
  return PUZZLE.roomGrid[r][c] === null;
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

  // A wholly-void row/column would collapse to zero height/width in the CSS grid
  // (nothing left to size that track via .cell's min-width/aspect-ratio) — not
  // hardened against, just flagged, since no puzzle has needed one yet.
  for (let r = 0; r < rows; r++) {
    if (data.roomGrid[r].every((room) => room === null)) console.error(`Row ${r} is entirely void.`);
  }
  for (let c = 0; c < cols; c++) {
    if (data.roomGrid.every((row) => row[c] === null)) console.error(`Column ${c} is entirely void.`);
  }
  Object.keys(data.rooms || {}).forEach((roomId) => {
    const used = data.roomGrid.some((row) => row.includes(roomId));
    if (!used) console.error(`Room "${roomId}" has no cells — its label has nowhere to anchor.`);
  });

  return data;
}

// errors: optional array to also collect messages into (used by the editor's live
// validation panel) — existing callers pass nothing and are unaffected.
function buildObjectIndex(data, errors) {
  const rows = data.rows, cols = data.cols;
  const at = Array.from({ length: rows }, () => Array(cols).fill(null));
  const report = (msg) => { console.error(msg); errors?.push(msg); };

  data.objects.forEach((obj) => {
    if (!OBJECT_TYPES[obj.type]) {
      report(`Unknown object type "${obj.type}" — skipping.`);
      return;
    }
    const rs = obj.cells.map((cell) => cell[0]);
    const cs = obj.cells.map((cell) => cell[1]);
    const r0 = Math.min(...rs), r1 = Math.max(...rs);
    const c0 = Math.min(...cs), c1 = Math.max(...cs);
    const rowSpan = r1 - r0 + 1, colSpan = c1 - c0 + 1;

    if (obj.cells.length !== rowSpan * colSpan) {
      report(`Object "${obj.type}" at [${r0},${c0}] doesn't form a filled rectangle — skipping.`);
      return;
    }
    if (r0 < 0 || c0 < 0 || r1 >= rows || c1 >= cols) {
      report(`Object "${obj.type}" at [${r0},${c0}] is out of bounds — skipping.`);
      return;
    }
    if (obj.cells.some(([r, c]) => data.roomGrid[r][c] === null)) {
      report(`Object "${obj.type}" at [${r0},${c0}] covers a void cell — skipping.`);
      return;
    }

    const record = { type: obj.type, cells: obj.cells, r0, c0, r1, c1, rowSpan, colSpan, occupiable: OBJECT_TYPES[obj.type].occupiable };
    for (const [r, c] of obj.cells) {
      if (at[r][c]) {
        report(`Cell [${r},${c}] claimed by more than one object — skipping "${obj.type}".`);
        return;
      }
    }
    for (const [r, c] of obj.cells) at[r][c] = record;
  });

  return at;
}

// --- DOM setup -------------------------------------------------------------

const gridEl = document.getElementById("grid");
const layerArtEl = document.getElementById("layerArt");
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
const prefColorPencilsEl = document.getElementById("prefColorPencils");
const prefPlayerNotesEl = document.getElementById("prefPlayerNotes");
const prefPortraitsEl = document.getElementById("prefPortraits");
const prefPortraitsLabelEl = document.getElementById("prefPortraitsLabel");
const prefArtModeEl = document.getElementById("prefArtMode");
const prefArtModeLabelEl = document.getElementById("prefArtModeLabel");
const playerPanelEl = document.getElementById("playerPanel");

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
  if (EDIT) {
    if (EDIT.tool === "art") onArtKey(e);
    return;
  }

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
  // Display order only — PUZZLE.clues keeps the source's own order, which the import
  // process treats as verbatim. General rules ("there are two empty rows...") read as
  // preamble to the per-suspect clues, so they're floated to the top. Array.sort is
  // stable, so each group keeps its original relative order.
  const ordered = [...PUZZLE.clues].sort((a, b) => (a.suspect ? 1 : 0) - (b.suspect ? 1 : 0));
  ordered.forEach((clue) => {
    const li = document.createElement("li");
    li.className = "clue-row" + (clue.suspect ? "" : " no-suspect");
    if (clue.suspect) {
      li.dataset.item = clue.suspect;
      li.tabIndex = 0;
      li.setAttribute("role", "button");
    }

    if (clue.suspect) {
      const portrait = PUZZLE.art?.portraits?.[clue.suspect];
      if (portrait) {
        const wrap = document.createElement("span");
        wrap.className = "clue-portrait-wrap";
        const img = document.createElement("img");
        img.className = "clue-portrait";
        img.src = `puzzles/${portrait.src}`;
        img.loading = "lazy";
        img.alt = PUZZLE.names[clue.suspect] || clue.suspect;
        const crop = portrait.crop || { x: 0, y: 0, w: 1, h: 1 };
        img.style.setProperty("--pc-x", crop.x);
        img.style.setProperty("--pc-y", crop.y);
        img.style.setProperty("--pc-w", crop.w);
        img.style.setProperty("--pc-h", crop.h);
        wrap.appendChild(img);
        // Click, not hover, to enlarge — a hover trigger fires constantly while reading
        // down the clue list. stopPropagation keeps the row's own click (which selects
        // the suspect) from also firing, so the two gestures stay distinct.
        wrap.addEventListener("click", (e) => {
          e.stopPropagation();
          const wasZoomed = wrap.classList.contains("zoomed");
          clearPortraitZoom();
          if (!wasZoomed) wrap.classList.add("zoomed");
        });
        li.appendChild(wrap);
      }
      const chip = document.createElement("span");
      chip.className = "suspect-chip chip-inline" + (clue.suspect === "V" ? " victim" : "");
      chip.dataset.item = clue.suspect;
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

function clearPortraitZoom() {
  clueListEl.querySelectorAll(".clue-portrait-wrap.zoomed").forEach((el) => el.classList.remove("zoomed"));
}

// Attached once at module level, not per-clue in buildClueList() — that reruns on every
// puzzle switch and would stack duplicate document listeners.
document.addEventListener("click", clearPortraitZoom);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") clearPortraitZoom(); });

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

// --- Player panel (room dropdown + notes, pure solver scratch-space) -------
// Not validated against anything — a coarser, player-scoped deduction ("I think A is
// somewhere in the Windy Trail") the grid itself can't express. Kept separate from
// grid progress: its own per-puzzle localStorage key, its own debounce, and excluded
// from undo (folding debounced text edits into pushHistory() would make Undo erratic).

let annotations = {}; // letter -> {room: roomId, note: string}

function annotationsKey() {
  return `murdoku:notes:${PUZZLE.id}`;
}

// Drops entries for suspects/rooms that no longer exist — the annotation-side
// analogue of sanitizeRestoredGrid(), guarding against a puzzle edit (or an older
// save) leaving a dangling room reference.
function sanitizeAnnotations() {
  const valid = {};
  PUZZLE.suspects.forEach((letter) => {
    const a = annotations[letter];
    if (!a) return;
    const room = a.room && PUZZLE.rooms[a.room] ? a.room : "";
    const note = typeof a.note === "string" ? a.note.slice(0, 120) : "";
    if (room || note) valid[letter] = { room, note };
  });
  annotations = valid;
}

function loadAnnotations() {
  annotations = {};
  try {
    const raw = localStorage.getItem(annotationsKey());
    if (raw) annotations = JSON.parse(raw) || {};
  } catch (err) {
    console.warn("Couldn't load player notes:", err);
    annotations = {};
  }
  sanitizeAnnotations();
}

function saveAnnotations() {
  if (EDIT) return; // edit mode never owns real annotation state
  try {
    localStorage.setItem(annotationsKey(), JSON.stringify(annotations));
  } catch (err) {
    console.warn("Couldn't save player notes:", err);
  }
}

let annotationSaveTimer = null;
function scheduleAnnotationSave() {
  clearTimeout(annotationSaveTimer);
  annotationSaveTimer = setTimeout(saveAnnotations, 400);
}

function buildPlayerPanel() {
  playerPanelEl.innerHTML = "";
  const heading = document.createElement("h2");
  heading.textContent = "Player notes";
  playerPanelEl.appendChild(heading);

  PUZZLE.suspects.forEach((letter) => {
    const row = document.createElement("div");
    row.className = "player-row";
    row.dataset.letter = letter;

    const chip = document.createElement("span");
    chip.className = "suspect-chip chip-inline" + (letter === "V" ? " victim" : "");
    chip.dataset.item = letter;
    chip.textContent = letter;
    row.appendChild(chip);

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = PUZZLE.names[letter] || letter;
    row.appendChild(name);

    const select = document.createElement("select");
    select.className = "room-guess";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— room —";
    select.appendChild(blank);
    Object.entries(PUZZLE.rooms).forEach(([roomId, room]) => {
      const opt = document.createElement("option");
      opt.value = roomId;
      opt.textContent = room.name;
      select.appendChild(opt);
    });
    select.value = annotations[letter]?.room || "";
    select.addEventListener("change", () => {
      annotations[letter] = annotations[letter] || { room: "", note: "" };
      annotations[letter].room = select.value;
      scheduleAnnotationSave();
    });
    row.appendChild(select);

    const note = document.createElement("input");
    note.type = "text";
    note.className = "player-note";
    note.maxLength = 120;
    note.placeholder = "Notes…";
    note.value = annotations[letter]?.note || "";
    note.addEventListener("input", () => {
      annotations[letter] = annotations[letter] || { room: "", note: "" };
      annotations[letter].note = note.value;
      scheduleAnnotationSave();
    });
    row.appendChild(note);

    playerPanelEl.appendChild(row);
  });
}

// --- Grid rendering ----------------------------------------------------

// A real cell adjacent to a void (roomGrid entry null) compares null !== "someRoom" and
// gets the thick divider — exactly the out-of-bounds treatment, which is correct: from a
// real cell's view, a void is the edge of the world, whether it's the outer boundary or a
// hole punched inside one. (Two adjacent voids would compare null === null and get a thin
// border, but that's unobservable — void cells never get a .cell element to draw it on.)
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
      if (roomId === null) { c++; continue; } // voids belong to no room's run
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

// Immersive board art (layer-art, art-mode): a single absolutely-positioned img
// covering just the cell area (not the header gutter), stretched per-axis via CSS
// custom properties from art.boardCrop — see .layer-art/.layer-art img in style.css.
// Not a CSS grid like the other layers; no squareness assumption anywhere here.
function renderArtLayer() {
  const board = PUZZLE.art?.board;
  if (!board) { layerArtEl.innerHTML = ""; return; }
  const src = `puzzles/${board}`;
  // Reuse the existing img when the source hasn't changed. The Art tab's pan/zoom
  // drives a full scheduleEditRerender() per frame; tearing the img down and
  // recreating it each time would flicker for the length of the drag.
  let img = layerArtEl.querySelector("img");
  if (!img || img.getAttribute("src") !== src) {
    layerArtEl.innerHTML = "";
    img = document.createElement("img");
    img.setAttribute("src", src);
    img.alt = "";
    // naturalWidth is 0 until it decodes, and the Art tab's square-cell maths and
    // contain-fit both need it — refresh the panel once it lands.
    img.addEventListener("load", () => {
      if (EDIT?.tool === "art") { syncArtInputs(); updateArtCellNote(); }
    }, { once: true });
    layerArtEl.appendChild(img);
  }
  const crop = artCrop();
  img.style.setProperty("--art-x", crop.x);
  img.style.setProperty("--art-y", crop.y);
  img.style.setProperty("--art-w", crop.w);
  img.style.setProperty("--art-h", crop.h);

  // Two-point alignment abandons the crop and fits the WHOLE padded PNG into the cell
  // area, because the point being clicked is usually outside the current crop.
  if (EDIT?.artPick || EDIT?.artCropTool) applyArtFit(img); else clearArtFit(img);
  renderArtLattice();
  renderArtPickMarkers();
  renderArtCropRect();
}

const IDENTITY_CROP = { x: 0, y: 0, w: 1, h: 1 };
function artCrop() {
  return PUZZLE.art?.boardCrop || IDENTITY_CROP;
}

// Builds the three static layers (cells, objects, labels) and attaches interaction
// listeners once. Called only when a puzzle is (re)loaded — never on every render,
// so an in-progress long-press/drag gesture never has its DOM pulled out from under it.
function renderStatic() {
  renderArtLayer();
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
      if (isVoid(r, c)) {
        // Not part of the board at all — no .cell element, so it's automatically
        // non-interactive (cellFromEvent()'s .closest(".cell") can never find it) and
        // draws no room tint/borders of its own. Purely decorative "hole" skin.
        const voidEl = document.createElement("div");
        voidEl.className = "void-cell";
        voidEl.style.gridRow = r + 2;
        voidEl.style.gridColumn = c + 2;
        layerCellsEl.appendChild(voidEl);
      } else {
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
      }

      // Marks layer stays dense (one per bounding-box cell, same as for blocked cells)
      // so renderMarks()/applyHighlights()'s `r * PUZZLE.cols + c` indexing holds
      // unchanged — a void's mark div just stays permanently empty.
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
      delete markEl.dataset.letter;

      if (cell.definite) {
        markEl.classList.add("definite");
        markEl.dataset.letter = cell.definite;
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
  updatePlacedStates();
}

// Suspects with a definite placement somewhere on the board right now. Derived from `grid`
// rather than tracked separately, so undo / file load / localStorage restore / Clear all stay
// correct for free — the only place this needs calling is the end of renderMarks().
function getPlacedLetters() {
  const placed = new Set();
  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      if (grid[r][c].definite) placed.add(grid[r][c].definite);
    }
  }
  return placed;
}

// Strikes through a placed suspect's chip (palette + clue list) as a status indicator — the
// chip stays clickable/selectable, this is not a disabled state.
function updatePlacedStates() {
  const placed = getPlacedLetters();
  document.querySelectorAll(".suspect-chip[data-item]").forEach((el) => {
    el.classList.toggle("placed", placed.has(el.dataset.item));
  });
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
      if (has) markEl.dataset.hl = highlightLetter; else delete markEl.dataset.hl;
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
  if (EDIT) return; // rows/cols are edited via the editor bar's steppers, not the grid headers
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
  if (EDIT) return onEditPointerDown(e);
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
  if (EDIT) return onEditPointerMove(e);
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
  if (EDIT) return onEditPointerUp(e);
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
  if (isVoid(r, c) || isBlocked(r, c)) return false;
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
  if (isVoid(r, c) || isBlocked(r, c)) return false;
  const cell = grid[r][c];
  if (selection === "#x") return !cell.definite && !cell.x;
  if (selection === "#erase") return !!cell.definite || cell.x || cell.pencil.size > 0;
  if (isSuspectSelection(selection)) return !cell.definite && !cell.x && !cell.pencil.has(selection);
  return false;
}

function lineCells(kind, index) {
  const out = [];
  if (kind === "row") {
    for (let c = 0; c < PUZZLE.cols; c++) if (!isVoid(index, c)) out.push([index, c]);
  } else {
    for (let r = 0; r < PUZZLE.rows; r++) if (!isVoid(r, index)) out.push([r, index]);
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
  if (isVoid(r, c) || isBlocked(r, c)) return null;
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
    if (cc === c || isVoid(r, cc) || isBlocked(r, cc)) continue;
    const other = grid[r][cc];
    if (!other.definite) {
      other.x = true;
      other.pencil.clear();
    }
  }
  for (let rr = 0; rr < PUZZLE.rows; rr++) {
    if (rr === r || isVoid(rr, c) || isBlocked(rr, c)) continue;
    const other = grid[rr][c];
    if (!other.definite) {
      other.x = true;
      other.pencil.clear();
    }
  }
  // Once a suspect is placed they cannot be anywhere else on the board, so sweep every
  // remaining cell and drop them from its pencil candidates. Only their own pencil marks —
  // other suspects' pencils and existing X flags are untouched.
  for (let rr = 0; rr < PUZZLE.rows; rr++) {
    for (let cc = 0; cc < PUZZLE.cols; cc++) {
      if (rr === r && cc === c) continue;
      grid[rr][cc].pencil.delete(letter);
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
      if (isVoid(r, c) || isBlocked(r, c)) {
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
  if (EDIT) return; // edit-mode writes go to the draft key instead, via scheduleDraftSave()
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
  const payload = { puzzleId: PUZZLE.id, savedAt: Date.now(), grid: snapshotGrid(), annotations };
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
      if (data.annotations && typeof data.annotations === "object") {
        annotations = data.annotations;
        sanitizeAnnotations();
        buildPlayerPanel();
        saveAnnotations();
      }
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
  // .cell, not firstElementChild — a void tile (which carries no min-width) can be
  // the very first child once a puzzle has a void cell at or before its first real one.
  const firstCell = layerCellsEl.querySelector(".cell");
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

// --- View preferences (display toggles, puzzle-independent) ----------------

let viewPrefs = { colorPencils: true, playerNotes: false, portraits: true, artMode: false };

function loadViewPrefs() {
  try {
    const raw = localStorage.getItem("murdoku:viewPrefs");
    if (raw) {
      const parsed = JSON.parse(raw);
      viewPrefs = {
        colorPencils: typeof parsed.colorPencils === "boolean" ? parsed.colorPencils : true,
        playerNotes: typeof parsed.playerNotes === "boolean" ? parsed.playerNotes : false,
        portraits: typeof parsed.portraits === "boolean" ? parsed.portraits : true,
        // Opt-in, unlike portraits: a bigger visual change, and only one puzzle has
        // art.board so far — defaulting it on would surprise players on every other puzzle.
        artMode: typeof parsed.artMode === "boolean" ? parsed.artMode : false,
      };
    }
  } catch (err) {
    console.warn("Couldn't load view preferences:", err);
  }
}

function saveViewPrefs() {
  try {
    localStorage.setItem("murdoku:viewPrefs", JSON.stringify(viewPrefs));
  } catch (err) {
    console.warn("Couldn't save view preferences:", err);
  }
}

function applyViewPrefs() {
  document.body.classList.toggle("color-pencils", viewPrefs.colorPencils);
  document.body.classList.toggle("show-player-notes", viewPrefs.playerNotes);
  // Gated on availability as well as the preference: the class also drives the
  // .no-suspect indent, which must not shift on a puzzle that has no portraits.
  // Also covers Edit > New > Apply, which leaves PUZZLE.art undefined.
  const hasPortraits = !!PUZZLE?.art?.portraits;
  document.body.classList.toggle("show-portraits", viewPrefs.portraits && hasPortraits);
  // Same availability-gating as portraits, for the same reason (art.board is optional
  // per puzzle; only one puzzle has it so far).
  const hasBoard = !!PUZZLE?.art?.board;
  // The Art tab forces art mode on regardless of the player's preference — the whole
  // point is nudging the crop against the live board. `art-calibrate` is the same mode
  // with the room tints left in at half opacity instead of going transparent, so any
  // misalignment against the artwork's own cell boundaries is obvious.
  const calibrating = !!(EDIT && EDIT.tool === "art" && hasBoard);
  document.body.classList.toggle("art-mode", calibrating || (viewPrefs.artMode && hasBoard));
  document.body.classList.toggle("art-calibrate", calibrating);
  prefColorPencilsEl.checked = viewPrefs.colorPencils;
  prefPlayerNotesEl.checked = viewPrefs.playerNotes;
  prefPortraitsEl.checked = viewPrefs.portraits;
  prefPortraitsLabelEl.hidden = !PUZZLE?.art?.portraits;
  prefArtModeEl.checked = viewPrefs.artMode;
  prefArtModeLabelEl.hidden = !hasBoard;
}

prefColorPencilsEl.addEventListener("change", () => {
  viewPrefs.colorPencils = prefColorPencilsEl.checked;
  applyViewPrefs();
  saveViewPrefs();
});
prefPortraitsEl.addEventListener("change", () => {
  viewPrefs.portraits = prefPortraitsEl.checked;
  applyViewPrefs();
  saveViewPrefs();
});
prefArtModeEl.addEventListener("change", () => {
  viewPrefs.artMode = prefArtModeEl.checked;
  applyViewPrefs();
  saveViewPrefs();
});
prefPlayerNotesEl.addEventListener("change", () => {
  viewPrefs.playerNotes = prefPlayerNotesEl.checked;
  applyViewPrefs();
  saveViewPrefs();
});

// --- Edit mode -------------------------------------------------------------
// A puzzle-authoring mode that swaps PUZZLE for a working clone, so the entire solving
// render pipeline (renderStatic/renderMarks/applyHighlights/describeCell/isBlocked/
// isVoid/etc.) renders the draft with ZERO changes — it always just reads PUZZLE/
// objectAt/grid, and those stay internally consistent throughout an edit session.
// Solving-mode-only code paths (the gesture state machine, header bulk-fill, keyboard
// shortcuts, progress persistence) are diverted by `if (EDIT) ...` guards placed at
// their existing entry points — see onPointerDown/onPointerMove/endGesture/
// onHeaderClick/saveProgress/the keydown listener.
//
// There is no backend: "export" is always a client-side JSON download the author then
// places into puzzles/ by hand, exactly like the existing progress Save-to-file flow.

const VOID_TOOL = "__void__"; // editor-only sentinel for "paint no room" (writes null)

let EDIT = null; // null = solving mode. Otherwise {stash, tool, roomPaint, objPaint, drag, dirty}

const editBtn = document.getElementById("editBtn");
const editorBarEl = document.getElementById("editorBar");
const editApplyBtn = document.getElementById("editApplyBtn");
const editDiscardBtn = document.getElementById("editDiscardBtn");
const editDownloadBtn = document.getElementById("editDownloadBtn");
const editNewBtn = document.getElementById("editNewBtn");
const editOpenBtn = document.getElementById("editOpenBtn");
const editFileInput = document.getElementById("editFileInput");
const editRowsInput = document.getElementById("editRows");
const editColsInput = document.getElementById("editCols");
const editResizeBtn = document.getElementById("editResizeBtn");
const editorTabsEl = document.getElementById("editorTabs");
const editorPaletteEl = document.getElementById("editorPalette");
const editorDetailsEl = document.getElementById("editorDetails");

// The global keydown handler deliberately bails when focus is in an INPUT/SELECT/TEXTAREA
// (letter shortcuts must not fire while typing), which also swallowed Escape while the
// caret sat in one of the Art panel's number inputs — the one place the author is most
// likely to be when they want to bail out of a pick or the crop tool. A panel-local
// listener restores it without loosening the global rule.
editorDetailsEl.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !EDIT || EDIT.tool !== "art") return;
  if (!EDIT.artPick && !EDIT.artCropTool) return;
  e.preventDefault();
  e.stopPropagation();
  onArtKey(e);
});
const editorValidationEl = document.getElementById("editorValidation");

function blankPuzzle() {
  const rows = 6, cols = 6;
  return {
    id: "new-puzzle",
    title: "Untitled",
    difficulty: "easy",
    sourceFile: "",
    rows, cols,
    suspects: ["A", "B", "C", "D", "E", "V"],
    names: { A: "Suspect A", B: "Suspect B", C: "Suspect C", D: "Suspect D", E: "Suspect E", V: "Victim (victim)" },
    clues: [],
    rooms: { room1: { name: "Room 1" } },
    roomGrid: Array.from({ length: rows }, () => Array(cols).fill("room1")),
    objects: [],
  };
}

function enterEditMode(sourcePuzzle) {
  // artBase is the "Reset" target for the Art tab: the boardCrop as extracted by
  // tools/extract_art.py, captured before any nudging. Cloned so later mutation of
  // PUZZLE.art.boardCrop can't reach back into it.
  const baseCrop = (sourcePuzzle ?? PUZZLE)?.art?.boardCrop;
  EDIT = { stash: { puzzle: PUZZLE, objectAt, grid, history, selection }, tool: "rooms", roomPaint: null, objPaint: null, drag: null, dirty: false,
    artBase: baseCrop ? { ...baseCrop } : { x: 0, y: 0, w: 1, h: 1 },
    artSquareLock: true, artPick: null, artPickNote: "", artCropTool: false };
  PUZZLE = normalizePuzzle(structuredClone(sourcePuzzle ?? PUZZLE));
  objectAt = buildObjectIndex(PUZZLE);
  grid = freshGrid();
  history = [];
  selection = null;
  hoveredSuspect = null;
  hoverRefs = null;

  document.body.classList.add("edit-mode");
  editorBarEl.hidden = false;
  puzzleSelectEl.disabled = true;
  editRowsInput.value = PUZZLE.rows;
  editColsInput.value = PUZZLE.cols;
  applySuspectColors();
  refreshPuzzleMeta();
  clueListEl.innerHTML = "";
  setEditTab("rooms");
  renderStatic();
  renderMarks();
  applyHighlights();
  updateLayoutMode();
  validateDraft();
}

function exitEditMode(mode) {
  endArtPick();     // clears the pick overlay/loupe and the art-pick body class
  endArtCropTool(); // and the crop rectangle's fitted view
  if (mode === "discard") {
    ({ puzzle: PUZZLE, objectAt, grid, history, selection } = EDIT.stash);
  } else {
    const dimsChanged = PUZZLE.rows !== EDIT.stash.puzzle.rows || PUZZLE.cols !== EDIT.stash.puzzle.cols;
    if (dimsChanged) {
      grid = freshGrid();
      history = [];
    } else {
      grid = EDIT.stash.grid;
      history = EDIT.stash.history;
    }
    selection = null;
  }
  EDIT = null;
  localStorage.removeItem("murdoku:draft");
  document.body.classList.remove("edit-mode");
  editorBarEl.hidden = true;
  puzzleSelectEl.disabled = false;

  applySuspectColors();
  buildPalette();
  buildClueList();
  buildPlayerPanel();
  updateSelectionUI();
  updateHint();
  updateUndoButton();
  refreshPuzzleMeta();
  applyViewPrefs(); // PUZZLE.art may differ from the pre-edit puzzle (e.g. Edit > New)
  if (mode === "apply") sanitizeRestoredGrid();
  renderStatic();
  renderMarks();
  applyHighlights();
  updateLayoutMode();
  if (mode === "apply") saveProgress();
}

function refreshPuzzleMeta() {
  puzzleTitleEl.textContent = PUZZLE.title || "(untitled)";
  puzzleDifficultyEl.textContent = PUZZLE.difficulty ? `difficulty: ${PUZZLE.difficulty}` : "";
  puzzleDifficultyEl.className = "difficulty-badge" + (PUZZLE.difficulty ? ` difficulty-${PUZZLE.difficulty}` : "");
}

editBtn.addEventListener("click", () => enterEditMode(PUZZLE));

editApplyBtn.addEventListener("click", () => {
  const { errors } = validateDraft();
  if (errors.length && !confirm(`This puzzle has ${errors.length} validation error(s). Apply anyway?`)) return;
  exitEditMode("apply");
});

editDiscardBtn.addEventListener("click", () => {
  if (EDIT.dirty && !confirm("Discard your edits?")) return;
  exitEditMode("discard");
});

function loadDraftPuzzle(data) {
  PUZZLE = normalizePuzzle(data);
  objectAt = buildObjectIndex(PUZZLE);
  grid = freshGrid();
  history = [];
  editRowsInput.value = PUZZLE.rows;
  editColsInput.value = PUZZLE.cols;
  EDIT.dirty = true;
  applySuspectColors();
  refreshPuzzleMeta();
  renderStatic();
  renderMarks();
  applyHighlights();
  updateLayoutMode();
  buildEditorPalette();
  validateDraft();
  scheduleDraftSave();
}

editNewBtn.addEventListener("click", () => {
  if (EDIT.dirty && !confirm("Discard current edits and start a new blank puzzle?")) return;
  loadDraftPuzzle(blankPuzzle());
});

editOpenBtn.addEventListener("click", () => editFileInput.click());
editFileInput.addEventListener("change", () => {
  const file = editFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.rows || !data.cols || !data.roomGrid) throw new Error("Doesn't look like a Murdoku puzzle file.");
      loadDraftPuzzle(data);
    } catch (err) {
      alert("Couldn't open that file: " + err.message);
    } finally {
      editFileInput.value = "";
    }
  };
  reader.readAsText(file);
});

editResizeBtn.addEventListener("click", () => resizeDraft(+editRowsInput.value, +editColsInput.value));

function resizeDraft(newRows, newCols) {
  newRows = Math.max(1, Math.min(24, Math.round(newRows) || PUZZLE.rows));
  newCols = Math.max(1, Math.min(24, Math.round(newCols) || PUZZLE.cols));
  if (newRows === PUZZLE.rows && newCols === PUZZLE.cols) return;

  const droppedObjects = PUZZLE.objects.filter((o) => o.cells.some(([r, c]) => r >= newRows || c >= newCols));
  const droppedRoomCells = [];
  for (let r = newRows; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) if (PUZZLE.roomGrid[r][c] !== null) droppedRoomCells.push([r, c]);
  }
  for (let r = 0; r < Math.min(newRows, PUZZLE.rows); r++) {
    for (let c = newCols; c < PUZZLE.cols; c++) if (PUZZLE.roomGrid[r][c] !== null) droppedRoomCells.push([r, c]);
  }
  if (droppedObjects.length || droppedRoomCells.length) {
    const msg = `Resizing to ${newRows}×${newCols} will delete ${droppedObjects.length} object(s) and discard ${droppedRoomCells.length} room assignment(s). Continue?`;
    if (!confirm(msg)) return;
  }

  const newRoomGrid = Array.from({ length: newRows }, (_, r) =>
    Array.from({ length: newCols }, (_, c) => (r < PUZZLE.rows && c < PUZZLE.cols ? PUZZLE.roomGrid[r][c] : null))
  );
  PUZZLE.objects = PUZZLE.objects.filter((o) => !o.cells.some(([r, c]) => r >= newRows || c >= newCols));
  PUZZLE.rows = newRows;
  PUZZLE.cols = newCols;
  PUZZLE.roomGrid = newRoomGrid;

  objectAt = buildObjectIndex(PUZZLE);
  grid = freshGrid();
  history = [];
  EDIT.dirty = true;
  renderStatic();
  renderMarks();
  applyHighlights();
  updateLayoutMode();
  validateDraft();
  scheduleDraftSave();
}

// --- Editor tabs & palettes ------------------------------------------------

editorTabsEl.querySelectorAll(".edit-tab").forEach((btn) => {
  btn.addEventListener("click", () => setEditTab(btn.dataset.tab));
});

function setEditTab(tab) {
  if (EDIT.tool === "art" && tab !== "art") { endArtPick(); endArtCropTool(); }
  EDIT.tool = tab;
  editorTabsEl.querySelectorAll(".edit-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  // Both the Details and Art panels are column layouts and share .editor-details;
  // only Rooms/Objects use the chip-row palette.
  const panelTab = tab === "details" || tab === "art";
  editorDetailsEl.hidden = !panelTab;
  editorPaletteEl.hidden = panelTab;
  buildEditorPalette();
  applyViewPrefs(); // entering/leaving the Art tab flips forced art mode
}

function buildEditorPalette() {
  if (EDIT.tool === "rooms") buildRoomPalette();
  else if (EDIT.tool === "objects") buildObjectPalette();
  else if (EDIT.tool === "art") buildArtPanel();
  else buildDetailsPanel();
}

function addEditorChip(container, className, text, title, onClick, selected) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = className + (selected ? " selected" : "");
  chip.textContent = text;
  if (title) chip.title = title;
  chip.addEventListener("click", onClick);
  container.appendChild(chip);
  return chip;
}

function buildRoomPalette() {
  editorPaletteEl.innerHTML = "";
  Object.entries(PUZZLE.rooms).forEach(([id, room]) => {
    const chip = addEditorChip(editorPaletteEl, "suspect-chip room-chip", room.name, "Click to select, double-click to rename",
      () => { EDIT.roomPaint = id; buildRoomPalette(); }, EDIT.roomPaint === id);
    chip.style.background = ROOM_COLORS[id] || DEFAULT_ROOM_COLOR;
    chip.style.borderColor = ROOM_COLORS[id] || DEFAULT_ROOM_COLOR;
    chip.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const name = prompt("Rename room:", room.name);
      if (name && name.trim()) {
        room.name = name.trim();
        EDIT.dirty = true;
        buildRoomPalette();
        renderStatic();
        renderMarks();
        applyHighlights();
        scheduleDraftSave();
      }
    });
  });

  addEditorChip(editorPaletteEl, "suspect-chip room-chip special-chip", "⊘ No room", "Paint cells as not part of the board",
    () => { EDIT.roomPaint = VOID_TOOL; buildRoomPalette(); }, EDIT.roomPaint === VOID_TOOL);

  addEditorChip(editorPaletteEl, "suspect-chip room-chip special-chip", "＋ New room", null, () => {
    const name = prompt("New room name:");
    if (!name || !name.trim()) return;
    let id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "") || "room";
    let uniqueId = id, n = 2;
    while (PUZZLE.rooms[uniqueId]) uniqueId = id + n++;
    PUZZLE.rooms[uniqueId] = { name: name.trim() };
    EDIT.roomPaint = uniqueId;
    EDIT.dirty = true;
    buildRoomPalette();
    validateDraft();
    scheduleDraftSave();
  });

  addEditorChip(editorPaletteEl, "suspect-chip room-chip special-chip", "🗑 Delete room", "Delete the selected room (only if unused)", () => {
    const id = EDIT.roomPaint;
    if (!id || id === VOID_TOOL) { alert("Select a room chip first."); return; }
    if (PUZZLE.roomGrid.some((row) => row.includes(id))) {
      alert(`"${PUZZLE.rooms[id].name}" is still used by some cells — paint them a different room first.`);
      return;
    }
    delete PUZZLE.rooms[id];
    EDIT.roomPaint = null;
    EDIT.dirty = true;
    buildRoomPalette();
    validateDraft();
    scheduleDraftSave();
  });
}

function buildObjectPalette() {
  editorPaletteEl.innerHTML = "";
  [true, false].forEach((occupiable) => {
    Object.entries(OBJECT_TYPES).filter(([, t]) => t.occupiable === occupiable).forEach(([key, type]) => {
      const chip = addEditorChip(editorPaletteEl, "object-chip", "", `${type.label} (${occupiable ? "can be occupied" : "cannot be occupied"})`,
        () => { EDIT.objPaint = key; buildObjectPalette(); }, EDIT.objPaint === key);
      chip.innerHTML = type.art(1, 1);
    });
  });

  addEditorChip(editorPaletteEl, "suspect-chip special-chip", "🧽", "Erase object",
    () => { EDIT.objPaint = "#erase"; buildObjectPalette(); }, EDIT.objPaint === "#erase");

  addEditorChip(editorPaletteEl, "suspect-chip special-chip", "＋", "Define a new placeholder object type", openNewObjectTypeForm);
}

function openNewObjectTypeForm() {
  const key = (prompt('New object type key (lowercase, e.g. "wheelbarrow"):') || "").trim();
  if (!key) return;
  if (!/^[a-z][a-z0-9]*$/.test(key)) { alert("Use lowercase letters/numbers, starting with a letter."); return; }
  if (OBJECT_TYPES[key]) { alert(`"${key}" already exists.`); return; }
  const label = prompt("Display label:", key) || key;
  const occupiable = confirm("Can a person occupy this cell?\nOK = yes (occupiable), Cancel = no (blocking)");
  const color = prompt("Colour (hex):", "#8a5a2e") || "#8a5a2e";
  OBJECT_TYPES[key] = {
    label, emoji: "❓", occupiable,
    art() {
      return svgObject(color, color, "#1a1a1a",
        `<rect x="10" y="10" width="80" height="80" rx="14" fill="var(--obj-fill)" stroke="var(--obj-stroke)" stroke-width="3"/>`, 100, 100);
    },
  };
  PUZZLE.customObjectTypes = PUZZLE.customObjectTypes || [];
  PUZZLE.customObjectTypes.push({ key, label, occupiable, color });
  EDIT.objPaint = key;
  EDIT.dirty = true;
  buildObjectPalette();
  scheduleDraftSave();
  setStatus(`"${label}" defined as a placeholder. For proper artwork, add a matching entry to OBJECT_TYPES in app.js later.`);
}

function buildDetailsPanel() {
  editorDetailsEl.innerHTML = "";

  const row = document.createElement("div");
  row.className = "details-row";
  row.innerHTML = `
    <label>ID <input type="text" id="detailId"></label>
    <label>Title <input type="text" id="detailTitle"></label>
    <label>Difficulty
      <select id="detailDifficulty">
        <option value="">—</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>
    </label>
  `;
  editorDetailsEl.appendChild(row);
  row.querySelector("#detailId").value = PUZZLE.id || "";
  row.querySelector("#detailTitle").value = PUZZLE.title || "";
  row.querySelector("#detailDifficulty").value = PUZZLE.difficulty || "";

  row.querySelector("#detailId").addEventListener("input", (e) => {
    PUZZLE.id = e.target.value;
    EDIT.dirty = true;
    scheduleDraftSave();
  });
  row.querySelector("#detailTitle").addEventListener("input", (e) => {
    PUZZLE.title = e.target.value;
    refreshPuzzleMeta();
    EDIT.dirty = true;
    scheduleDraftSave();
  });
  row.querySelector("#detailDifficulty").addEventListener("change", (e) => {
    PUZZLE.difficulty = e.target.value || undefined;
    refreshPuzzleMeta();
    EDIT.dirty = true;
    scheduleDraftSave();
  });

  const label = document.createElement("p");
  label.className = "hint";
  label.style.margin = "0";
  label.textContent = "Suspects, names and clues (raw JSON — parsed when you click away):";
  editorDetailsEl.appendChild(label);

  const textarea = document.createElement("textarea");
  textarea.id = "detailsJson";
  textarea.value = JSON.stringify({ suspects: PUZZLE.suspects, names: PUZZLE.names, clues: PUZZLE.clues }, null, 2);
  editorDetailsEl.appendChild(textarea);

  const errorEl = document.createElement("p");
  errorEl.className = "json-error";
  editorDetailsEl.appendChild(errorEl);

  textarea.addEventListener("blur", () => {
    try {
      const parsed = JSON.parse(textarea.value);
      if (!Array.isArray(parsed.suspects) || typeof parsed.names !== "object" || !Array.isArray(parsed.clues)) {
        throw new Error("Expected {suspects: [...], names: {...}, clues: [...]}");
      }
      PUZZLE.suspects = parsed.suspects;
      PUZZLE.names = parsed.names;
      PUZZLE.clues = parsed.clues.map((clue) => (typeof clue === "string"
        ? { suspect: null, text: clue, refs: {} }
        : { suspect: clue.suspect ?? null, text: clue.text, refs: { rooms: clue.refs?.rooms || [], objects: clue.refs?.objects || [], suspects: clue.refs?.suspects || [] } }));
      errorEl.textContent = "";
      EDIT.dirty = true;
      applySuspectColors();
      validateDraft();
      scheduleDraftSave();
    } catch (err) {
      errorEl.textContent = "JSON error: " + err.message;
    }
  });
}

// --- Art tab (board crop calibration) --------------------------------------
//
// Nudges PUZZLE.art.boardCrop — a normalized sub-rect of the exported board PNG —
// against the live grid, which is the preview. Wired exactly like buildDetailsPanel():
// mutate -> scheduleEditRerender() -> EDIT.dirty -> scheduleDraftSave(). The art block
// rides along in enterEditMode()'s structuredClone, so there is no extra plumbing.
//
// The primary output is the "Copy boardCrop" button, NOT the whole-puzzle JSON download:
// the author calibrates all 12 puzzles in one sitting and pastes four numbers back each
// time. Portrait crops are deliberately out of scope (see PLAN-artwork.md).
//
// Two controls exist because auto-detection's vertical search collapsed to the page
// edges on 9 of the 12 puzzles, leaving them at boardCrop ~ {x:.2, y:0, w:.8, h:1} —
// the board sits somewhere inside a full-page-height image, so the correction is a big
// crop-down, not a nudge:
//   * corner picking (two clicks on the whole, un-cropped PNG), for the coarse move;
//   * the square-cell lock, which removes the fourth degree of freedom entirely.

const artInputEls = {};

function artImg() {
  const img = layerArtEl.querySelector("img");
  return img && img.naturalWidth ? img : null; // naturalWidth is 0 until it decodes
}

function artImgDims() {
  const img = artImg();
  return img ? { W: img.naturalWidth, H: img.naturalHeight } : null;
}

// Cell size in SOURCE IMAGE PIXELS on each axis. This — not w vs h — is what
// "square cells" means: boardCrop is normalized against a PNG that is itself not
// square, so a genuinely square board stores as unequal w/h (netflix-and-kill is
// w:0.8131 h:0.7692, and resolves to 65.05 x 65.00 px cells).
function artCellPx(crop = artCrop()) {
  const d = artImgDims();
  if (!d) return null;
  return { cw: (crop.w * d.W) / PUZZLE.cols, ch: (crop.h * d.H) / PUZZLE.rows };
}

// Force (w*W)/cols == (h*H)/rows. `from` picks which axis is authoritative:
//   "w"    — hold the horizontal extent, derive h. The default, and the right one for
//            the badly-detected puzzles: it was the vertical search that collapsed, so
//            x/w are the trustworthy pair.
//   "h"    — the mirror, used when the author types an explicit h.
//   "both" — neither is trustworthy (two hand-placed corner clicks), so split the
//            difference: the geometric mean of the two cell sizes.
// The derived axis is recomputed about its own centre, so nothing jumps sideways.
function squareifyCrop(crop, from) {
  const d = artImgDims();
  if (!d) return crop;
  const cw = (crop.w * d.W) / PUZZLE.cols;
  const ch = (crop.h * d.H) / PUZZLE.rows;
  if (!(cw > 0) || !(ch > 0)) return crop;
  const s = from === "h" ? ch : from === "both" ? Math.sqrt(cw * ch) : cw;
  const w = (s * PUZZLE.cols) / d.W;
  const h = (s * PUZZLE.rows) / d.H;
  return { x: crop.x + (crop.w - w) / 2, y: crop.y + (crop.h - h) / 2, w, h };
}

function buildArtPanel() {
  editorDetailsEl.innerHTML = "";
  ["x", "y", "w", "h", "cell"].forEach((k) => { artInputEls[k] = null; });

  if (!PUZZLE.art?.board) {
    const msg = document.createElement("p");
    msg.className = "hint";
    msg.style.textAlign = "left";
    msg.textContent = 'This puzzle has no board art. Run `python3 tools/extract_art.py ' +
      (PUZZLE.id || "<puzzle-id>") + ' --board` to generate puzzles/art/<id>/board.png and an ' +
      '"art" block in the puzzle JSON, then reload the puzzle and come back here to calibrate it.';
    editorDetailsEl.appendChild(msg);
    return;
  }

  const help = document.createElement("p");
  help.className = "hint art-instructions";
  help.id = "artInstructions";
  editorDetailsEl.appendChild(help);

  const controls = document.createElement("div");
  controls.className = "editor-row art-controls";
  controls.innerHTML = `
    <button type="button" class="tool-btn" id="artCornersBtn" title="Two clicks: the board's top-left corner in the artwork, then its bottom-right. The grid side is implied — (0,0) and (cols,rows).">⌖ Align by corners</button>
    <button type="button" class="tool-btn" id="artCropBtn" title="Drag the crop rectangle's corners, edges or middle over the whole fitted image">⬚ Crop tool</button>
    <button type="button" class="tool-btn" id="artPickBtn" title="Two correspondences — a grid intersection and its matching artwork point, twice. For boards whose outer corners are ambiguous.">⌖ Align by 2 points</button>
    <button type="button" class="tool-btn" data-zoom="0.99">Zoom −</button>
    <button type="button" class="tool-btn" data-zoom="1.01">Zoom +</button>
    <button type="button" class="tool-btn" data-zoom="0.95">− −</button>
    <button type="button" class="tool-btn" data-zoom="1.05">+ +</button>
    <button type="button" class="tool-btn" id="artResetBtn" title="Restore the crop as extracted by tools/extract_art.py">↺ Reset</button>
    <button type="button" class="tool-btn" id="artCopyBtn">📋 Copy boardCrop</button>
    <span class="art-copy-note" id="artCopyNote"></span>
  `;
  editorDetailsEl.appendChild(controls);
  controls.querySelectorAll("[data-zoom]").forEach((btn) => {
    btn.addEventListener("click", () => zoomArt(+btn.dataset.zoom));
  });
  controls.querySelector("#artCornersBtn").addEventListener("click", () => {
    if (EDIT.artPick?.mode === "corners") endArtPick(); else startArtPick("corners");
  });
  controls.querySelector("#artPickBtn").addEventListener("click", () => {
    if (EDIT.artPick?.mode === "pairs") endArtPick(); else startArtPick("pairs");
  });
  controls.querySelector("#artCropBtn").addEventListener("click", () => {
    if (EDIT.artCropTool) endArtCropTool(); else startArtCropTool();
  });
  controls.querySelector("#artResetBtn").addEventListener("click", () => {
    endArtPick();
    setArtCrop(EDIT.artBase); // verbatim: Reset means "as extracted", lock or no lock
    buildArtPanel();
  });
  controls.querySelector("#artCopyBtn").addEventListener("click", copyBoardCrop);

  const lockRow = document.createElement("div");
  lockRow.className = "editor-row art-lock-row";
  lockRow.innerHTML = `
    <label><input type="checkbox" id="artSquareLock"> Square cells (lock w/h together)</label>
    <span class="art-cell-note" id="artCellNote"></span>
  `;
  editorDetailsEl.appendChild(lockRow);
  const lockEl = lockRow.querySelector("#artSquareLock");
  lockEl.checked = EDIT.artSquareLock;
  lockEl.addEventListener("change", () => {
    EDIT.artSquareLock = lockEl.checked;
    // Turning it on snaps the current crop; turning it off changes nothing.
    if (EDIT.artSquareLock) setArtCrop(artCrop(), { lock: "w" });
    else syncArtInputs();
    updateArtCellNote();
  });

  const nums = document.createElement("div");
  nums.className = "details-row art-numbers";
  nums.innerHTML = ["x", "y", "w", "h"].map((k) =>
    `<label>${k}<input type="number" step="0.001" data-crop="${k}"></label>`).join("") +
    `<label>cell px<input type="number" step="0.1" data-crop="cell" title="Cell size in source-image pixels — the single scale control when the square lock is on"></label>`;
  editorDetailsEl.appendChild(nums);
  nums.querySelectorAll("[data-crop]").forEach((input) => {
    const key = input.dataset.crop;
    artInputEls[key] = input;
    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      if (!Number.isFinite(v)) return;
      if (key === "cell") {
        setScaleFromCellPx(v, input);
      } else {
        // Only w/h feed the lock; x/y are pure pan and can't break squareness.
        setArtCrop({ ...artCrop(), [key]: v }, { except: input, lock: key === "w" || key === "h" ? key : null });
      }
    });
  });

  if (EDIT.artPickNote) {
    const pn = document.createElement("p");
    pn.className = "hint art-pick-note";
    pn.textContent = EDIT.artPickNote;
    editorDetailsEl.appendChild(pn);
  }

  syncArtInputs();
  updateArtInstructions();
  updateArtCellNote();
  updateArtButtons();
}

// The three modes are mutually exclusive, and the panel is rebuilt from scratch after a
// commit, so the active state is derived here rather than toggled at each call site.
function updateArtButtons() {
  const set = (id, on) => document.getElementById(id)?.classList.toggle("active", !!on);
  set("artCornersBtn", EDIT?.artPick?.mode === "corners");
  set("artPickBtn", EDIT?.artPick?.mode === "pairs");
  set("artCropBtn", EDIT?.artCropTool);
}

function updateArtInstructions() {
  const el = document.getElementById("artInstructions");
  if (!el) return;
  const pick = EDIT?.artPick;
  el.classList.toggle("picking", !!pick || !!EDIT?.artCropTool);
  if (pick && pick.mode === "corners") {
    el.textContent = pick.pairs.length === 0
      ? "CORNERS — click 1 of 2: the TOP-LEFT corner of the BOARD in the artwork. The loupe magnifies where you are pointing. (Esc cancels)"
      : "CORNERS — click 2 of 2: now the BOTTOM-RIGHT corner of the BOARD. (Esc cancels)";
    return;
  }
  if (pick) {
    const n = pick.pairs.length + 1;
    el.textContent = pick.pending
      ? `ALIGN — pair ${n} of 2: now click the MATCHING point in the artwork. The loupe magnifies where you are pointing. (Esc cancels everything)`
      : `ALIGN — pair ${n} of 2: click a GRID INTERSECTION on the highlighted lattice; it snaps to the nearest one, and the ring shows which. Pick landmarks as far apart as you can. (Esc cancels everything)`;
    return;
  }
  if (EDIT?.artCropTool) {
    el.textContent = "CROP — the whole image is fitted in view with the current crop drawn over it. " +
      "Drag a corner or an edge to resize, drag inside to move. With the square-cell lock on, " +
      "corners scale proportionally and a single edge derives the other axis. (Esc exits)";
    return;
  }
  el.textContent = "Drag on the grid to pan the artwork. Arrow keys nudge (hold Shift for a coarse step). " +
    "Zoom scales about the centre of the visible board. Room tints are shown at half opacity so " +
    "misalignment against the art's own cell boundaries is obvious. For a big correction start with " +
    "Align by corners (two clicks), or the Crop tool to drag the crop rectangle; Align by 2 points is " +
    "for boards whose outer corners are too fuzzy to click.";
}

function updateArtCellNote() {
  const el = document.getElementById("artCellNote");
  if (!el) return;
  const px = artCellPx();
  if (!px) { el.textContent = "(artwork still loading…)"; return; }
  const aspect = px.cw / px.ch;
  const square = Math.abs(aspect - 1) < 0.003;
  el.textContent = `Cell: ${px.cw.toFixed(2)} × ${px.ch.toFixed(2)} px (aspect ${aspect.toFixed(4)})${square ? "" : " — NOT square"}`;
  el.classList.toggle("off-square", !square);
}

function syncArtInputs(except) {
  const crop = artCrop();
  ["x", "y", "w", "h"].forEach((k) => {
    const el = artInputEls[k];
    if (el && el !== except) el.value = round4(crop[k]);
  });
  const px = artCellPx(crop);
  if (artInputEls.cell && artInputEls.cell !== except) {
    artInputEls.cell.value = px ? Math.round(px.cw * 100) / 100 : "";
  }
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// The single write path for the crop. opts.except is the input currently being typed
// into, which must not have its value rewritten out from under the caret; opts.lock
// names the authoritative axis for the square-cell constraint (see squareifyCrop).
function setArtCrop(crop, opts = {}) {
  if (!PUZZLE.art) return;
  if (opts.lock && EDIT.artSquareLock) crop = squareifyCrop(crop, opts.lock);
  PUZZLE.art.boardCrop = {
    x: round4(crop.x),
    y: round4(crop.y),
    w: round4(Math.max(crop.w, 0.01)),
    h: round4(Math.max(crop.h, 0.01)),
  };
  EDIT.dirty = true;
  syncArtInputs(opts.except);
  updateArtCellNote();
  scheduleEditRerender();
  scheduleDraftSave();
}

// The scale degree of freedom, expressed the way the constraint is: pixels per cell.
function setScaleFromCellPx(s, except) {
  const d = artImgDims();
  if (!d || !(s > 0)) return;
  const crop = artCrop();
  const w = (s * PUZZLE.cols) / d.W;
  // Feeding it through the "w" branch derives h from the same s when the lock is on,
  // and leaves h alone when it isn't (scale then means horizontal scale only).
  setArtCrop({ ...crop, x: crop.x + (crop.w - w) / 2, w }, { except, lock: "w" });
}

// Zoom scales w/h about the CENTRE of the current crop, so the middle of the visible
// board stays put. Scaling about the top-left corner renders fine but is useless for
// calibration — every zoom step would also pan. A uniform factor on both axes preserves
// the square-cell ratio by construction, so no lock handling is needed here.
// factor > 1 = zoom in = a SMALLER window onto the source = bigger apparent artwork.
function zoomArt(factor) {
  const crop = artCrop();
  const w = crop.w / factor;
  const h = crop.h / factor;
  setArtCrop({ x: crop.x + (crop.w - w) / 2, y: crop.y + (crop.h - h) / 2, w, h });
}

// Screen-pixel drag delta -> normalized crop delta.
//
// A source point u maps to screen x = W * (u - crop.x) / crop.w, where W is the rendered
// width of the cell area (layer-art's box). To make the artwork follow the pointer by dx,
// the same u must land dx further right, which needs crop.x -= dx * crop.w / W. So the
// conversion is BOTH scaled by the current crop size (a zoomed-in crop moves less per
// pixel) and sign-inverted (dragging right decreases x).
function panArt(dx, dy) {
  const W = layerArtEl.clientWidth || 1;
  const H = layerArtEl.clientHeight || 1;
  const crop = artCrop();
  setArtCrop({ ...crop, x: crop.x - (dx * crop.w) / W, y: crop.y - (dy * crop.h) / H });
}

// Fine nudge. One step is 1/8 of a cell (Shift: one whole cell) in screen terms, which
// is the scale sub-cell misalignment actually shows up at.
function onArtKey(e) {
  if (e.key === "Escape") {
    if (EDIT.artPick) endArtPick();
    else if (EDIT.artCropTool) endArtCropTool();
    return;
  }
  if (!PUZZLE.art?.board || EDIT.artPick) return;
  const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const dir = dirs[e.key];
  if (!dir) return;
  e.preventDefault();
  const cellW = (layerArtEl.clientWidth || 1) / Math.max(PUZZLE.cols, 1);
  const cellH = (layerArtEl.clientHeight || 1) / Math.max(PUZZLE.rows, 1);
  const step = e.shiftKey ? 1 : 1 / 8;
  panArt(dir[0] * cellW * step, dir[1] * cellH * step);
}

// --- Two-point alignment (correspondence pairs) ----------------------------
//
// Not "click the board's two outer corners": the outer corner is ambiguous on exactly
// the puzzles that most need calibrating (The Hiking Trip's board edge is fuzzy mountain
// scenery with no crisp corner), while interior grid intersections are sharp. So the
// author gives two CORRESPONDENCES — "this grid intersection is that point in the
// artwork" — and any two identifiable landmarks will do. Outer-corner picking is just
// the special case where the grid points are (0,0) and (cols,rows).
//
// The transform is axis-aligned scale + translate, so it is exact and closed-form.
// A grid intersection at normalized board coords (gx,gy) maps to the image point
// ix = crop.x + gx*crop.w, so from two pairs:
//     crop.w = (ix2-ix1)/(gx2-gx1)      crop.x = ix1 - gx1*crop.w
//     crop.h = (iy2-iy1)/(gy2-gy1)      crop.y = iy1 - gy1*crop.h
//
// The GRID half of each pair snaps to the nearest cell intersection, so it carries zero
// human error — the app knows that geometry exactly. Only the image half needs care,
// which is what the magnifier loupe is for.
//
// Throughout the mode the WHOLE padded PNG is fitted (contain, letterboxed) into the
// cell area, because the point the author needs to click is usually OUTSIDE the current
// crop — on the badly-detected puzzles the board is scrolled well out of view.

const PICK_MIN_SEPARATION = 1 / 3; // below this, click error is amplified enough to warn

// Where the whole image sits inside layer-art's box under contain-fit. Recomputed on
// demand rather than cached, so a resize mid-pick can't desync the click mapping.
function artFitBox() {
  const d = artImgDims();
  if (!d) return null;
  const WB = layerArtEl.clientWidth, HB = layerArtEl.clientHeight;
  if (!WB || !HB) return null;
  const k = Math.min(WB / d.W, HB / d.H);
  const dw = d.W * k, dh = d.H * k;
  return { dw, dh, left: (WB - dw) / 2, top: (HB - dh) / 2 };
}

// Inline width/height/left/top beat .layer-art img's calc() rules from the stylesheet,
// so fit mode needs no extra CSS and clears by removing the four properties again.
function applyArtFit(img) {
  const fit = artFitBox();
  if (!fit) return;
  img.style.width = `${fit.dw}px`;
  img.style.height = `${fit.dh}px`;
  img.style.left = `${fit.left}px`;
  img.style.top = `${fit.top}px`;
}

function clearArtFit(img) {
  ["width", "height", "left", "top"].forEach((prop) => img.style.removeProperty(prop));
}

// mode "corners" — two clicks, both in the artwork: the board's top-left corner, then
// its bottom-right. The grid half is implied, (0,0) and (cols,rows), so it is half the
// clicks of a correspondence pair and is the common case, hence the default entry point.
// mode "pairs" — the original: a grid intersection then its artwork match, twice, for
// boards whose outer corner is ambiguous (The Hiking Trip's fuzzy mountain-scenery edge).
function startArtPick(mode = "corners") {
  if (!artImgDims()) { setStatus("The board artwork hasn't finished loading yet."); return; }
  endArtCropTool();
  EDIT.artPick = { mode, pairs: [], pending: null, hover: null };
  EDIT.artPickNote = "";
  document.body.classList.add("art-pick");
  updateArtButtons();
  scheduleEditRerender();
  updateArtInstructions();
}

// Cancels cleanly at any stage — including half-way through a pair — without touching
// the crop. Nothing is written until both pairs are complete.
function endArtPick() {
  if (!EDIT.artPick) return;
  EDIT.artPick = null;
  hideArtLoupe();
  document.body.classList.remove("art-pick");
  updateArtButtons();
  scheduleEditRerender();
  updateArtInstructions();
}

// Screen point -> normalized IMAGE coordinates, in fit space. Clamped, so a click on
// the letterbox margin still resolves to the nearest edge of the image.
function artPointFromEvent(e) {
  const fit = artFitBox();
  if (!fit) return null;
  const rect = layerArtEl.getBoundingClientRect();
  const u = (e.clientX - rect.left - fit.left) / fit.dw;
  const v = (e.clientY - rect.top - fit.top) / fit.dh;
  return { u: Math.min(Math.max(u, 0), 1), v: Math.min(Math.max(v, 0), 1) };
}

// Screen point -> nearest cell INTERSECTION, in normalized board coordinates. layer-art's
// box is exactly the cell area, so col/cols and row/rows are the whole conversion.
function artGridPointFromEvent(e) {
  const rect = layerArtEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const col = Math.min(Math.max(Math.round(((e.clientX - rect.left) / rect.width) * PUZZLE.cols), 0), PUZZLE.cols);
  const row = Math.min(Math.max(Math.round(((e.clientY - rect.top) / rect.height) * PUZZLE.rows), 0), PUZZLE.rows);
  return { col, row, gx: col / PUZZLE.cols, gy: row / PUZZLE.rows };
}

function onArtPickClick(e) {
  const pick = EDIT.artPick;
  if (pick.mode === "corners") {
    const p = artPointFromEvent(e);
    if (!p) return;
    // The grid side is not clicked at all: the board's outer corners ARE grid (0,0) and
    // (cols,rows) by definition, so the pair is completed here and fed to the same
    // closed-form solver the correspondence mode uses.
    const first = pick.pairs.length === 0;
    pick.pairs.push({ col: first ? 0 : PUZZLE.cols, row: first ? 0 : PUZZLE.rows,
                      gx: first ? 0 : 1, gy: first ? 0 : 1, ix: p.u, iy: p.v });
    hideArtLoupe();
    if (pick.pairs.length >= 2) { commitArtPick(); return; }
    scheduleEditRerender();
    updateArtInstructions();
    return;
  }
  if (pick.pending) {
    const p = artPointFromEvent(e);
    if (!p) return;
    pick.pairs.push({ ...pick.pending, ix: p.u, iy: p.v });
    pick.pending = null;
    hideArtLoupe();
    if (pick.pairs.length >= 2) { commitArtPick(); return; }
  } else {
    const g = artGridPointFromEvent(e);
    if (!g) return;
    pick.pending = g;
  }
  scheduleEditRerender();
  updateArtInstructions();
}

function commitArtPick() {
  const mode = EDIT.artPick.mode;
  const [p, q] = EDIT.artPick.pairs;
  const dgx = q.gx - p.gx, dgy = q.gy - p.gy;
  if (Math.abs(dgx) < 1e-9 || Math.abs(dgy) < 1e-9) {
    endArtPick();
    setStatus("Those two grid points share a row or a column, so the scale on that axis is undefined. Pick two points that differ both across and down.");
    return;
  }
  let w = (q.ix - p.ix) / dgx;
  let h = (q.iy - p.iy) / dgy;
  if (!(w > 0) || !(h > 0)) {
    endArtPick();
    setStatus("Those pairs invert the image (the second artwork point sits the other side of the first). Nothing changed — try again.");
    return;
  }
  let x = p.ix - p.gx * w;
  let y = p.iy - p.gy * h;

  const notes = [];
  if (mode !== "corners" && (Math.abs(dgx) < PICK_MIN_SEPARATION || Math.abs(dgy) < PICK_MIN_SEPARATION)) {
    notes.push("the two points were less than a third of the board apart, which amplifies click error — check the fit, or redo it with points further apart");
  }

  // Two pairs overdetermine the crop when the square lock is on. Honour the axis with
  // the GREATER pick separation — that is the more accurate measurement — and derive
  // the other from the square-cell constraint. The derived axis is anchored on the
  // midpoint of the two picks rather than on the crop's centre, so the correspondence
  // the author actually clicked stays as true as the constraint allows.
  if (EDIT.artSquareLock) {
    const d = artImgDims();
    if (d) {
      const holdX = Math.abs(dgx) >= Math.abs(dgy);
      if (holdX) {
        const s = (w * d.W) / PUZZLE.cols;
        h = (s * PUZZLE.rows) / d.H;
        y = (p.iy + q.iy) / 2 - ((p.gy + q.gy) / 2) * h;
      } else {
        const s = (h * d.H) / PUZZLE.rows;
        w = (s * PUZZLE.cols) / d.W;
        x = (p.ix + q.ix) / 2 - ((p.gx + q.gx) / 2) * w;
      }
      const sepA = Math.abs(holdX ? dgx : dgy), sepB = Math.abs(holdX ? dgy : dgx);
      const axis = holdX ? "horizontal" : "vertical";
      EDIT.artPickNote = `Square lock: the ${axis} axis was authoritative (separation ${sepA.toFixed(2)} vs ${sepB.toFixed(2)} of the board${Math.abs(sepA - sepB) < 1e-6 ? " — a tie, so horizontal wins" : ""}); the other axis was derived from it.`;
    }
  } else {
    EDIT.artPickNote = "Square lock off — both axes taken exactly as picked.";
  }

  const what = mode === "corners" ? "the board's two outer corners" : "2 correspondence pairs";
  endArtPick();
  setArtCrop({ x, y, w, h });
  buildArtPanel();
  setStatus(notes.length
    ? `Aligned from ${what}. Note: ` + notes.join("; ") + "."
    : `Aligned from ${what}. Fine-tune with the Crop tool, drag, the arrow keys or Zoom.`);
}

// Markers for what has been registered so far, drawn into layer-art (pointer-events:none,
// and already the cell-area box). Rebuilt by renderArtLayer on every edit re-render.
function renderArtPickMarkers() {
  layerArtEl.querySelectorAll(".art-marker").forEach((el) => el.remove());
  const pick = EDIT?.artPick;
  if (!pick) return;
  const WB = layerArtEl.clientWidth, HB = layerArtEl.clientHeight;
  const fit = artFitBox();
  const marker = (left, top, cls, label) => {
    const el = document.createElement("div");
    el.className = `art-marker ${cls}`;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.dataset.label = label;
    layerArtEl.appendChild(el);
  };
  pick.pairs.forEach((pair, i) => {
    const label = pick.mode === "corners" ? (i === 0 ? "TL" : "BR") : `${i + 1}`;
    if (pick.mode !== "corners") marker(pair.gx * WB, pair.gy * HB, "grid", `${label}G`);
    if (fit) marker(fit.left + pair.ix * fit.dw, fit.top + pair.iy * fit.dh, "image", pick.mode === "corners" ? label : `${label}A`);
  });
  if (pick.pending) marker(pick.pending.gx * WB, pick.pending.gy * HB, "grid pending", `${pick.pairs.length + 1}G`);
}

// --- The grid lattice, drawn while the GRID half of a pair is being picked ---
//
// The grid click snaps to the nearest intersection, so that half of a correspondence is
// meant to carry zero human error — but the snap guarantee is worthless if the author
// cannot SEE where the intersections are. In pick mode the room tints drop to 0.12 and
// the artwork underneath is arbitrary, so this draws its own high-contrast lattice:
// white lines ringed in black (legible over any artwork, light or dark), a dot at every
// intersection, and a ring following the cursor on the intersection that WILL be
// registered. Elements, not SVG: the count is (cols+1)*(rows+1) + cols + rows + 2, about
// 200 divs at 12x12, and layer-art's box is exactly the cell area so percentages are the
// whole conversion.
function renderArtLattice() {
  layerArtEl.querySelectorAll(".art-lattice").forEach((el) => el.remove());
  const pick = EDIT?.artPick;
  if (!pick || pick.mode !== "pairs" || pick.pending) return;
  const { rows, cols } = PUZZLE;
  const box = document.createElement("div");
  box.className = "art-lattice";
  const parts = [];
  for (let c = 0; c <= cols; c++) parts.push(`<i class="art-lat-v" style="left:${(c / cols) * 100}%"></i>`);
  for (let r = 0; r <= rows; r++) parts.push(`<i class="art-lat-h" style="top:${(r / rows) * 100}%"></i>`);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      parts.push(`<i class="art-lat-dot" style="left:${(c / cols) * 100}%;top:${(r / rows) * 100}%"></i>`);
    }
  }
  parts.push(`<i class="art-lat-hover" hidden></i>`);
  box.innerHTML = parts.join("");
  layerArtEl.appendChild(box);
  if (pick.hover) positionLatticeHover(pick.hover);
}

function positionLatticeHover(g) {
  const el = layerArtEl.querySelector(".art-lat-hover");
  if (!el) return;
  el.style.left = `${g.gx * 100}%`;
  el.style.top = `${g.gy * 100}%`;
  el.dataset.label = `${g.col},${g.row}`;
  el.hidden = false;
}

// Called from the bare pointer-move (no drag behind it), so it writes the DOM directly
// rather than going through a re-render — the ring has to track the cursor smoothly.
function updateArtLatticeHover(e) {
  const pick = EDIT?.artPick;
  if (!pick || pick.mode !== "pairs" || pick.pending) return;
  const g = artGridPointFromEvent(e);
  if (!g) return;
  pick.hover = g;
  positionLatticeHover(g);
}

// --- Magnifier loupe -------------------------------------------------------
// Only while picking the IMAGE half of a pair — hitting a specific artwork pixel at the
// fitted-down scale is otherwise guesswork. Implemented as a background-position offset
// on the same PNG (no canvas, no pixel readback).

const ART_LOUPE_SIZE = 140;
const ART_LOUPE_ZOOM = 5;
let artLoupeEl = null;

function updateArtLoupe(e) {
  const pick = EDIT?.artPick;
  const img = artImg();
  // Corner mode is image-picking all the way through, so it has no `pending` stage —
  // both of its clicks want the loupe.
  const wantsLoupe = pick && (pick.mode === "corners" || pick.pending);
  if (!wantsLoupe || !img) { hideArtLoupe(); return; }
  const fit = artFitBox();
  const p = artPointFromEvent(e);
  if (!fit || !p) { hideArtLoupe(); return; }

  if (!artLoupeEl) {
    artLoupeEl = document.createElement("div");
    artLoupeEl.className = "art-loupe";
    artLoupeEl.innerHTML = `<span class="art-loupe-x"></span><span class="art-loupe-y"></span>`;
    document.body.appendChild(artLoupeEl);
  }
  // Magnify the FITTED display by ART_LOUPE_ZOOM, then offset so the pointed-at point
  // lands under the loupe's centre crosshair.
  const bw = fit.dw * ART_LOUPE_ZOOM, bh = fit.dh * ART_LOUPE_ZOOM;
  artLoupeEl.style.backgroundImage = `url("${img.getAttribute("src")}")`;
  artLoupeEl.style.backgroundSize = `${bw}px ${bh}px`;
  artLoupeEl.style.backgroundPosition = `${ART_LOUPE_SIZE / 2 - p.u * bw}px ${ART_LOUPE_SIZE / 2 - p.v * bh}px`;
  // Sit beside the cursor, flipping near the viewport edge so it never runs off-screen.
  const pad = 22;
  const left = e.clientX + pad + ART_LOUPE_SIZE > window.innerWidth ? e.clientX - pad - ART_LOUPE_SIZE : e.clientX + pad;
  const top = e.clientY + pad + ART_LOUPE_SIZE > window.innerHeight ? e.clientY - pad - ART_LOUPE_SIZE : e.clientY + pad;
  artLoupeEl.style.left = `${left}px`;
  artLoupeEl.style.top = `${top}px`;
  artLoupeEl.hidden = false;
}

function hideArtLoupe() {
  if (artLoupeEl) artLoupeEl.hidden = true;
}

function copyBoardCrop() {
  const crop = artCrop();
  const text = `"boardCrop": { "x": ${round4(crop.x)}, "y": ${round4(crop.y)}, "w": ${round4(crop.w)}, "h": ${round4(crop.h)} },`;
  const note = document.getElementById("artCopyNote");
  const done = (ok) => { if (note) note.textContent = ok ? "Copied ✓" : text; };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  } else {
    done(false); // no clipboard API (or an insecure origin) — show it for manual copying
  }
}

// --- Crop tool (drag the crop rectangle's edges and corners) ----------------
//
// The familiar image-editor crop interaction, and usually the fastest way to a
// rough-but-close crop before the nudge controls take over for the last few pixels.
// Like pick mode it fits the WHOLE padded PNG into the cell area (the crop is often
// nowhere near the current view), then draws boardCrop as a rectangle over it.
//
// The rectangle lives in layer-art, which is pointer-events:none, so the handles are
// purely visual — hit-testing happens against the pointer position in
// onEditPointerDown/Move, reusing the existing layer-cells pointer path and its capture
// rather than adding a second, parallel gesture surface.

const ART_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const ART_HANDLE_HIT = 14; // px — generous, because the handles are small
const ART_HANDLE_CURSORS = {
  nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", move: "move",
};

function startArtCropTool() {
  if (!artImgDims()) { setStatus("The board artwork hasn't finished loading yet."); return; }
  endArtPick();
  EDIT.artCropTool = true;
  document.body.classList.add("art-crop");
  updateArtButtons();
  scheduleEditRerender();
  updateArtInstructions();
}

function endArtCropTool() {
  if (!EDIT?.artCropTool) return;
  EDIT.artCropTool = false;
  document.body.classList.remove("art-crop");
  layerCellsEl.style.cursor = "";
  updateArtButtons();
  scheduleEditRerender();
  updateArtInstructions();
}

// The crop rect in layer-art-box pixels, under the contain-fit used by this mode.
function artCropRectPx() {
  const fit = artFitBox();
  if (!fit) return null;
  const c = artCrop();
  return { fit, x0: fit.left + c.x * fit.dw, y0: fit.top + c.y * fit.dh,
           x1: fit.left + (c.x + c.w) * fit.dw, y1: fit.top + (c.y + c.h) * fit.dh };
}

function renderArtCropRect() {
  layerArtEl.querySelectorAll(".art-croprect").forEach((el) => el.remove());
  if (!EDIT?.artCropTool || EDIT.artPick) return;
  const r = artCropRectPx();
  if (!r) return;
  const box = document.createElement("div");
  box.className = "art-croprect";
  box.style.left = `${r.x0}px`;
  box.style.top = `${r.y0}px`;
  box.style.width = `${Math.max(r.x1 - r.x0, 0)}px`;
  box.style.height = `${Math.max(r.y1 - r.y0, 0)}px`;
  box.innerHTML = ART_HANDLES.map((h) => `<i class="art-handle h-${h}"></i>`).join("");
  layerArtEl.appendChild(box);
}

// Which part of the crop rect the pointer is over: a named handle, "move" for the
// interior, or null. Corners win over edges (they are tested first and by distance).
function artHandleAt(e) {
  const r = artCropRectPx();
  if (!r) return null;
  const box = layerArtEl.getBoundingClientRect();
  const px = e.clientX - box.left, py = e.clientY - box.top;
  const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  const pts = { nw: [r.x0, r.y0], ne: [r.x1, r.y0], se: [r.x1, r.y1], sw: [r.x0, r.y1],
                n: [cx, r.y0], s: [cx, r.y1], e: [r.x1, cy], w: [r.x0, cy] };
  let best = null, bestD = ART_HANDLE_HIT;
  for (const k of ART_HANDLES) {
    const d = Math.hypot(px - pts[k][0], py - pts[k][1]);
    if (d <= bestD) { bestD = d; best = k; }
  }
  if (best) return best;
  const nearX = px >= r.x0 - ART_HANDLE_HIT && px <= r.x1 + ART_HANDLE_HIT;
  const nearY = py >= r.y0 - ART_HANDLE_HIT && py <= r.y1 + ART_HANDLE_HIT;
  if (nearY && Math.abs(px - r.x0) <= ART_HANDLE_HIT) return "w";
  if (nearY && Math.abs(px - r.x1) <= ART_HANDLE_HIT) return "e";
  if (nearX && Math.abs(py - r.y0) <= ART_HANDLE_HIT) return "n";
  if (nearX && Math.abs(py - r.y1) <= ART_HANDLE_HIT) return "s";
  if (px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1) return "move";
  return null;
}

// h = w * ART_RATIO is exactly the square-cell condition (w*W)/cols == (h*H)/rows
// rearranged, in normalized crop units.
function artSquareRatio() {
  const d = artImgDims();
  if (!d) return null;
  return (d.W * PUZZLE.rows) / (d.H * PUZZLE.cols);
}

const CROP_MIN = 0.02;

// Keep the rect inside the image without breaking squareness: shrink both axes by the
// same factor first, then slide it back into bounds.
function clampCropRect(c, square) {
  let { x, y, w, h } = c;
  w = Math.max(w, CROP_MIN);
  h = Math.max(h, CROP_MIN);
  if (w > 1 || h > 1) {
    const k = Math.min(1 / w, 1 / h);
    if (square) { w *= k; h *= k; } else { w = Math.min(w, 1); h = Math.min(h, 1); }
  }
  x = Math.min(Math.max(x, 0), 1 - w);
  y = Math.min(Math.max(y, 0), 1 - h);
  return { x, y, w, h };
}

// Resize from one handle. The dragged edge/corner follows the pointer exactly; the
// OPPOSITE edge/corner is the anchor and never moves. With the square lock on, a corner
// scales proportionally (driven by whichever axis the pointer moved further on) and a
// single-edge drag derives the other axis about the rect's own centre on that axis, so
// the two edges the author is not touching stay symmetric about where they were.
function resizeArtCrop(handle, u, v) {
  const c = artCrop();
  let x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h;
  const square = !!EDIT.artSquareLock;
  const ratio = artSquareRatio();
  const horiz = handle.includes("w") ? "w" : handle.includes("e") ? "e" : null;
  const vert = handle.startsWith("n") ? "n" : handle.startsWith("s") ? "s" : null;

  if (horiz === "w") x0 = u; else if (horiz === "e") x1 = u;
  if (vert === "n") y0 = v; else if (vert === "s") y1 = v;

  let w = x1 - x0, h = y1 - y0;

  if (square && ratio) {
    if (horiz && vert) {
      // Corner: follow the axis that moved further, so the drag never feels ignored.
      w = Math.max(Math.abs(w), Math.abs(h) / ratio);
      h = w * ratio;
      if (horiz === "w") x0 = x1 - w; else x1 = x0 + w;
      if (vert === "n") y0 = y1 - h; else y1 = y0 + h;
    } else if (horiz) {
      w = Math.abs(w);
      h = w * ratio;
      const midY = (y0 + y1) / 2;
      y0 = midY - h / 2; y1 = midY + h / 2;
      if (horiz === "w") x0 = x1 - w; else x1 = x0 + w;
    } else if (vert) {
      h = Math.abs(h);
      w = h / ratio;
      const midX = (x0 + x1) / 2;
      x0 = midX - w / 2; x1 = midX + w / 2;
      if (vert === "n") y0 = y1 - h; else y1 = y0 + h;
    }
  } else {
    // Unlocked: an edge dragged past its opposite just flips, as in any crop tool.
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
  }

  setArtCrop(clampCropRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, square));
}

function moveArtCrop(du, dv) {
  const c = artCrop();
  setArtCrop(clampCropRect({ x: c.x + du, y: c.y + dv, w: c.w, h: c.h }, !!EDIT.artSquareLock));
}

// --- Edit-mode gestures (room paint / object rectangle place) --------------

function onEditPointerDown(e) {
  if (e.button !== 0) return;

  // The art branch must see the raw pointer, not a cell hit: panning is in screen
  // pixels, and it has to work over void cells, where cellFromEvent() returns null by
  // design. So the cell lookup lives inside the rooms/objects branches, not above them.
  if (EDIT.tool === "art") {
    if (!PUZZLE.art?.board) return;
    e.preventDefault();
    if (EDIT.artPick) { onArtPickClick(e); return; } // pick clicks, not a pan drag
    if (EDIT.artCropTool) {
      // Crop-tool drags replace panning entirely: dragging the rect's interior IS the
      // pan, and a drag starting outside it would otherwise move the crop out from under
      // the handle the author was aiming for.
      const handle = artHandleAt(e);
      if (!handle) return;
      const p = artPointFromEvent(e);
      if (!p) return;
      layerCellsEl.setPointerCapture(e.pointerId);
      EDIT.drag = { pointerId: e.pointerId, kind: "artcrop", handle, u: p.u, v: p.v };
      return;
    }
    layerCellsEl.setPointerCapture(e.pointerId);
    EDIT.drag = { pointerId: e.pointerId, kind: "art", px: e.clientX, py: e.clientY };
    return;
  }

  if (EDIT.tool === "rooms") {
    const hit = cellFromEvent(e);
    if (!hit) return;
    e.preventDefault();
    layerCellsEl.setPointerCapture(e.pointerId);
    if (!EDIT.roomPaint) { setStatus("Pick a room (or 'No room') first."); return; }
    EDIT.drag = { pointerId: e.pointerId, kind: "room" };
    paintRoom(hit.r, hit.c);
  } else if (EDIT.tool === "objects") {
    const hit = cellFromEvent(e);
    if (!hit) return;
    e.preventDefault();
    layerCellsEl.setPointerCapture(e.pointerId);
    if (!EDIT.objPaint) { setStatus("Pick an object type (or Erase) first."); return; }
    EDIT.drag = { pointerId: e.pointerId, kind: "object", r0: hit.r, c0: hit.c, r1: hit.r, c1: hit.c };
    updateObjectPreview();
  }
}

function onEditPointerMove(e) {
  // The loupe follows the bare pointer — there is no drag behind it — so it has to be
  // handled before the drag guard below.
  if (EDIT.tool === "art" && EDIT.artPick) {
    updateArtLoupe(e);          // image half of a pair, or either corner click
    updateArtLatticeHover(e);   // grid half: ring the intersection that will be taken
    return;
  }
  // Handle-proximity cursor feedback, also drag-free.
  if (EDIT.tool === "art" && EDIT.artCropTool && !EDIT.drag) {
    const handle = artHandleAt(e);
    layerCellsEl.style.cursor = handle ? ART_HANDLE_CURSORS[handle] : "";
  }
  if (!EDIT.drag || EDIT.drag.pointerId !== e.pointerId) return;

  if (EDIT.drag.kind === "artcrop") {
    const p = artPointFromEvent(e);
    if (!p) return;
    if (EDIT.drag.handle === "move") {
      moveArtCrop(p.u - EDIT.drag.u, p.v - EDIT.drag.v);
      EDIT.drag.u = p.u;
      EDIT.drag.v = p.v;
    } else {
      resizeArtCrop(EDIT.drag.handle, p.u, p.v);
    }
    return;
  }

  if (EDIT.drag.kind === "art") {
    panArt(e.clientX - EDIT.drag.px, e.clientY - EDIT.drag.py);
    EDIT.drag.px = e.clientX;
    EDIT.drag.py = e.clientY;
    return;
  }

  const hit = cellFromEvent(e);
  if (!hit) return;

  if (EDIT.drag.kind === "room") {
    paintRoom(hit.r, hit.c);
  } else if (EDIT.drag.kind === "object") {
    EDIT.drag.r1 = hit.r;
    EDIT.drag.c1 = hit.c;
    updateObjectPreview();
  }
}

function onEditPointerUp(e) {
  if (!EDIT.drag || EDIT.drag.pointerId !== e.pointerId) return;
  if (EDIT.drag.kind === "object") {
    const { r0, c0, r1, c1 } = EDIT.drag;
    const rr0 = Math.min(r0, r1), rr1 = Math.max(r0, r1);
    const cc0 = Math.min(c0, c1), cc1 = Math.max(c0, c1);
    if (EDIT.objPaint === "#erase") eraseObjectsInRect(rr0, cc0, rr1, cc1);
    else placeObject(rr0, cc0, rr1, cc1, EDIT.objPaint);
    clearObjectPreview();
  }
  EDIT.drag = null;
}

function paintRoom(r, c) {
  const value = EDIT.roomPaint === VOID_TOOL ? null : EDIT.roomPaint;
  if (PUZZLE.roomGrid[r][c] === value) return;
  if (value === null) {
    // An object can't sit on a void cell — clear anything covering this one.
    PUZZLE.objects = PUZZLE.objects.filter((o) => !o.cells.some(([or, oc]) => or === r && oc === c));
  }
  PUZZLE.roomGrid[r][c] = value;
  EDIT.dirty = true;
  scheduleEditRerender();
  scheduleDraftSave();
}

let editRerenderRaf = null;
function scheduleEditRerender() {
  if (editRerenderRaf) return;
  editRerenderRaf = requestAnimationFrame(() => {
    editRerenderRaf = null;
    objectAt = buildObjectIndex(PUZZLE);
    renderStatic();
    renderMarks();
    applyHighlights();
    validateDraft();
  });
}

function updateObjectPreview() {
  clearObjectPreview();
  if (!EDIT.drag) return;
  const { r0, c0, r1, c1 } = EDIT.drag;
  const rr0 = Math.min(r0, r1), rr1 = Math.max(r0, r1);
  const cc0 = Math.min(c0, c1), cc1 = Math.max(c0, c1);
  const preview = document.createElement("div");
  preview.className = "object-preview";
  preview.style.gridRow = `${rr0 + 2} / span ${rr1 - rr0 + 1}`;
  preview.style.gridColumn = `${cc0 + 2} / span ${cc1 - cc0 + 1}`;
  layerObjectsEl.appendChild(preview);
}

function clearObjectPreview() {
  layerObjectsEl.querySelectorAll(".object-preview").forEach((el) => el.remove());
}

function placeObject(r0, c0, r1, c1, type) {
  const cells = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push([r, c]);
  if (cells.some(([r, c]) => PUZZLE.roomGrid[r][c] === null)) {
    setStatus("Objects can't be placed on void cells.");
    return;
  }
  const doomed = new Set(cells.map(([r, c]) => objectAt[r]?.[c]).filter(Boolean));
  PUZZLE.objects = PUZZLE.objects.filter((o) => !doomed.has(objectAt[o.cells[0][0]]?.[o.cells[0][1]]));
  PUZZLE.objects.push({ type, cells });
  EDIT.dirty = true;
  objectAt = buildObjectIndex(PUZZLE);
  renderStatic();
  renderMarks();
  applyHighlights();
  validateDraft();
  scheduleDraftSave();
}

function eraseObjectsInRect(r0, c0, r1, c1) {
  const doomed = new Set();
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (objectAt[r]?.[c]) doomed.add(objectAt[r][c]);
  if (doomed.size === 0) return;
  PUZZLE.objects = PUZZLE.objects.filter((o) => !doomed.has(objectAt[o.cells[0][0]]?.[o.cells[0][1]]));
  EDIT.dirty = true;
  objectAt = buildObjectIndex(PUZZLE);
  renderStatic();
  renderMarks();
  applyHighlights();
  validateDraft();
  scheduleDraftSave();
}

// --- Validation --------------------------------------------------------

function validateDraft() {
  const errors = [], warnings = [];

  if (!PUZZLE.id || !/^[a-z0-9-]+$/.test(PUZZLE.id)) errors.push("id should be a non-empty kebab-case slug.");
  if (!PUZZLE.title) errors.push("title is empty.");
  if (!Number.isInteger(PUZZLE.rows) || PUZZLE.rows < 1) errors.push("rows must be a positive integer.");
  if (!Number.isInteger(PUZZLE.cols) || PUZZLE.cols < 1) errors.push("cols must be a positive integer.");
  if (PUZZLE.roomGrid.length !== PUZZLE.rows) errors.push(`roomGrid has ${PUZZLE.roomGrid.length} rows, expected ${PUZZLE.rows}.`);
  PUZZLE.roomGrid.forEach((row, r) => {
    if (row.length !== PUZZLE.cols) errors.push(`roomGrid row ${r} has ${row.length} entries, expected ${PUZZLE.cols}.`);
  });

  let voidCount = 0;
  for (let r = 0; r < PUZZLE.roomGrid.length; r++) {
    for (let c = 0; c < (PUZZLE.roomGrid[r] || []).length; c++) {
      const rid = PUZZLE.roomGrid[r][c];
      if (rid === null) { voidCount++; continue; }
      if (!PUZZLE.rooms[rid]) errors.push(`Cell [${r},${c}] uses unknown room "${rid}".`);
    }
  }
  if (voidCount) warnings.push(`${voidCount} cell(s) have no room assigned yet.`);

  // A dimension change doesn't mathematically invalidate boardCrop, but semantically
  // does — so warn, never error. A resize that only trims void margin off the edge of
  // the bounding box often needs no recalibration at all, and blocking export on it
  // would be wrong.
  const cal = PUZZLE.art?.calibratedFor;
  if (cal && (cal.rows !== PUZZLE.rows || cal.cols !== PUZZLE.cols)) {
    warnings.push(`Board art was calibrated for a ${cal.rows}x${cal.cols} grid, but this puzzle is now ${PUZZLE.rows}x${PUZZLE.cols} — check the alignment in the Art tab.`);
  }

  Object.keys(PUZZLE.rooms).forEach((id) => {
    if (!PUZZLE.roomGrid.some((row) => row.includes(id))) warnings.push(`Room "${PUZZLE.rooms[id].name}" has no cells.`);
  });

  const objErrors = [];
  buildObjectIndex(PUZZLE, objErrors);
  errors.push(...objErrors);

  const letters = PUZZLE.suspects || [];
  if (new Set(letters).size !== letters.length) errors.push("Suspect letters must be unique.");
  if (letters.filter((l) => l === "V").length !== 1) errors.push('Exactly one suspect must be "V" (the victim).');
  letters.forEach((l) => { if (!PUZZLE.names?.[l]) warnings.push(`No name set for suspect "${l}".`); });

  (PUZZLE.clues || []).forEach((clue, i) => {
    if (clue.suspect && !letters.includes(clue.suspect)) errors.push(`Clue ${i + 1} references unknown suspect "${clue.suspect}".`);
    (clue.refs?.rooms || []).forEach((rid) => { if (!PUZZLE.rooms[rid]) errors.push(`Clue ${i + 1} refs unknown room "${rid}".`); });
    (clue.refs?.objects || []).forEach((type) => { if (!OBJECT_TYPES[type]) errors.push(`Clue ${i + 1} refs unknown object type "${type}".`); });
  });
  letters.forEach((l) => { if (l !== "V" && !(PUZZLE.clues || []).some((c) => c.suspect === l)) warnings.push(`Suspect "${l}" has no clue.`); });

  renderValidation(errors, warnings);
  return { errors, warnings };
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function renderValidation(errors, warnings) {
  if (!errors.length && !warnings.length) {
    editorValidationEl.innerHTML = `<span class="valid">✓ Ready to export</span>`;
    return;
  }
  let html = "";
  if (errors.length) html += `<div class="error">${errors.length} error(s)<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>`;
  if (warnings.length) html += `<div class="warning">${warnings.length} warning(s)<ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>`;
  editorValidationEl.innerHTML = html;
}

// --- Draft persistence & export ---------------------------------------

let draftSaveTimer = null;
function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(saveDraft, 500);
}

function saveDraft() {
  if (!EDIT) return;
  try {
    localStorage.setItem("murdoku:draft", JSON.stringify({ savedAt: Date.now(), baseId: EDIT.stash.puzzle.id || null, puzzle: PUZZLE }));
  } catch (err) {
    console.warn("Couldn't save draft:", err);
  }
}

function checkForDraft() {
  const raw = localStorage.getItem("murdoku:draft");
  if (!raw) return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    localStorage.removeItem("murdoku:draft");
    return;
  }
  if (!data?.puzzle) {
    localStorage.removeItem("murdoku:draft");
    return;
  }
  const when = new Date(data.savedAt).toLocaleString();
  const label = data.puzzle.title ? ` (${data.puzzle.title})` : "";
  if (confirm(`You have unsaved puzzle edits from ${when}${label}. Resume editing them?`)) {
    enterEditMode(data.puzzle);
  } else {
    localStorage.removeItem("murdoku:draft");
  }
}

function exportPuzzleJSON() {
  const ordered = {
    id: PUZZLE.id,
    title: PUZZLE.title,
    difficulty: PUZZLE.difficulty,
    sourceFile: PUZZLE.sourceFile || "",
    rows: PUZZLE.rows,
    cols: PUZZLE.cols,
    suspects: PUZZLE.suspects,
    names: PUZZLE.names,
    clues: PUZZLE.clues,
    rooms: PUZZLE.rooms,
    roomGrid: PUZZLE.roomGrid,
    objects: PUZZLE.objects,
  };
  if (PUZZLE.customObjectTypes?.length) ordered.customObjectTypes = PUZZLE.customObjectTypes;
  if (PUZZLE.art) ordered.art = PUZZLE.art;
  return ordered;
}

editDownloadBtn.addEventListener("click", () => {
  const { errors } = validateDraft();
  if (errors.length) {
    alert(`Fix ${errors.length} error(s) before downloading:\n\n` + errors.join("\n"));
    return;
  }
  const payload = exportPuzzleJSON();
  const probeErrors = [];
  buildObjectIndex(normalizePuzzle(structuredClone(payload)), probeErrors);
  if (probeErrors.length) {
    alert("Round-trip check failed:\n\n" + probeErrors.join("\n"));
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${payload.id || "puzzle"}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const manifestLine = `{ "id": "${payload.id}", "title": "${payload.title}", "file": "${payload.id}.json" }`;
  setStatus(`Downloaded ${payload.id}.json — add to puzzles/index.json: ${manifestLine}`);
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

  applySuspectColors();
  buildPalette();
  buildClueList();
  updateSelectionUI();
  updateHint();
  updateUndoButton();
  loadProgressFromLocalStorage();
  loadAnnotations();
  buildPlayerPanel();
  renderStatic();
  renderMarks();
  applyHighlights();
  applyViewPrefs(); // re-evaluate portrait-checkbox visibility for the newly loaded puzzle
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
  loadViewPrefs();
  applyViewPrefs();
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

  checkForDraft(); // offer to resume an in-progress edit session, if any
}

boot();
