/* view layer — the main menu and the keyboard-shortcuts page. Four pages, one
   draw call; which is showing, the cursor row and what has been typed into the
   seed field are `shell/ui.js#ui.menu`, handed over read-only. Every row
   registers into `./state.js#drawn.menu` with a stable id for `shell` to
   hit-test; nothing here dispatches or touches `model`.

   CONTINUE is not gated on `hasSave()` here, because `view` may not reach
   `localStorage`: `shell` answers, with `stale` telling another build's header
   from an empty slot and `notice` carrying the reason. `inRun` is the same kind
   of mirror, since this file may not import `model` either. The controls page is
   generated from `f.ui.keymap`, and every page is laid out over measured text,
   wrapping rather than overrunning. */

import { drawText, textWidth, wrap } from '../../core/font.js';
import { mix } from '../../core/palette.js';
import { R } from '../../core/pixels.js';
import { colour } from '../../data/palette.js';
import { SCENARIOS } from '../../data/scenarios.js';
import { drawPanel } from './panel.js';
import { drawn, resetDrawn } from './state.js';

const INK = colour('ui'), INK2 = colour('uiInk2'), DIM = colour('uiDim');
const BACK = colour('uiBack');
const AMBER = colour('uiAmber'), GOOD = colour('uiGood');
/* The divine accent the draft cards and the band ruler use for a heading. */
const HEAD = colour('ichor');
/* The same active-row fill `./tabs.js` paints behind the active tab. */
const FOCUS_BG = mix(BACK, INK, 0.28);
/* A divider between the parts of one panel, in `./panel.js`'s shadow tone. */
const RULE_COL = mix(BACK, DIM, 0.35);
const RULE = (g, p, y) => R(g, p.x + 1, y, p.w - 2, 1, RULE_COL);

const M = 4;        // outer margin, screen px
const PAD = 3;      // panel inner padding, screen px
const LINE = 8;     // 7 px glyph cell + 1 px leading
const GAP = 3;      // between the parts of a block
const COL_GAP = 8;  // between shortcut columns
/* One whole character between a binding and what it does: `GAP`'s 3 px is half
   a glyph, and 'WASD/ARROWS' -- the widest key cell -- ran into its own label. */
const KEY_GAP = 6;

const TITLE = 'MYTHOS FACTORY';
const TAGLINE = 'DOWN IS FREE. UP IS EXPENSIVE.';

/* A preferred width, not a cap: the layout takes the larger of this and what
   the rows actually measure, so a long row widens the panel rather than being
   squeezed into it. */
const WANT_W = 168;

/* The 5x7 font covers ASCII 0x20..0x7E (`vendor/font5x7.js`) and `drawText`
   substitutes '?' for anything else, so a data row's em dash would render as a
   fault. 0x2010..0x2015 is Unicode's dash run. */
function ascii(s) {
  let out = '';
  for (const c of String(s)) {
    const k = c.codePointAt(0);
    out += k >= 0x20 && k <= 0x7e ? c : (k >= 0x2010 && k <= 0x2015 ? '-' : '?');
  }
  return out;
}

/* Is the menu standing? `f.ui.menu` is `shell/ui.js`'s own record. */
export const menuOpen = f => !!f.ui?.menu?.open;

/* A page's rows are `{ id, label, value, live, note }`. `id` is what `shell`
   dispatches on and is stable across viewports, `live` false means the row
   states why it cannot be taken, and `note` draws only for the focused row. */

/* The row taken once and waiting to be taken again: it says so where its value
   would sit, and keeps its own note about what is being thrown away. */
const confirming = r => ({ ...r, value: 'CONFIRM?', valueCol: AMBER });

/* A dead CONTINUE states which kind of nothing it is: an absent slot and a
   header from another build are different events, and `hasSave` is false for
   both. */
function continueRow(m) {
  if (!m.hasSave) return {
    id: 'continue', label: 'CONTINUE', live: false,
    value: m.stale ? 'STALE SAVE' : 'NO SAVE',
    note: m.stale ? 'THAT SAVE WAS WRITTEN BY ANOTHER BUILD.' : 'NOTHING IS SAVED YET.'
  };
  return {
    id: 'continue', label: 'CONTINUE', live: true,
    note: m.inRun ? 'DROPS THE RUN BEHIND THIS MENU AND LOADS THE SAVED ONE.'
                  : 'RESUME THE ONE SAVED RUN.'
  };
}

function rootRows(m) {
  const seed = m.seedFocus ? m.seed + '_' : (m.seed || 'RANDOM');
  const rows = [];
  /* RESUME exists only while a run stands behind the menu, and it is first: the
     row the cursor starts on has to be the one that changes nothing. */
  if (m.inRun) rows.push({ id: 'resume', label: 'RESUME', live: true,
    note: 'BACK INTO THE RUN, EXACTLY WHERE IT STOPPED.' });
  rows.push(
    { id: 'new', label: 'NEW RUN', live: true,
      note: m.inRun ? 'ABANDONS THE RUN BEHIND THIS MENU. NOTHING IS KEPT.'
                    : 'GENERATE A WORLD AND DROP IN.' },
    { id: 'seed', label: 'SEED', value: seed, live: true,
      note: 'A RUN IS REPRODUCIBLE FROM ITS SEED. BLANK MEANS PICK ONE.' },
    continueRow(m),
    { id: 'controls', label: 'CONTROLS', live: true, note: 'EVERY KEY, IN ONE TABLE.' },
    { id: 'settings', label: 'SETTINGS', live: true, note: 'OVERLAYS AND THE TWO ASSISTS.' },
    { id: 'debug', label: 'DEBUG', live: true, note: 'NAMED WORLDS TO TEST WITH.' }
  );
  return rows.map(r => (r.id === m.confirm ? confirming(r) : r));
}

/* Every toggle here is readable from the frame context. MUTE is absent: it
   lives on `shell/audio.js#audio.muted`, which the frame context does not
   carry. */
function settingsRows(f) {
  const state = v => ({ value: v ? 'ON' : 'OFF', valueCol: v ? GOOD : DIM });
  return [
    { id: 'set-grid', label: 'GRID OVERLAY', live: true, ...state(f.flags.showGrid),
      note: 'THE TILE LATTICE, DRAWN OVER THE WORLD.' },
    { id: 'set-chunks', label: 'CHUNK OVERLAY', live: true, ...state(f.flags.showChunks),
      note: 'PAINT-CACHE BOUNDARIES. DEBUG MODE ONLY.' },
    { id: 'set-debug', label: 'DEBUG MODE', live: true, ...state(f.flags.showDebug),
      note: 'THE READOUT, AND THE KEYS THAT FORCE A DRAFT.' },
    { id: 'set-collect', label: 'AUTO COLLECT', live: true, ...state(f.ui.autoCollect),
      note: 'OFF MEANS HOLD C TO PICK THINGS UP. RESET EVERY RUN.' },
    { id: 'set-feed', label: 'AUTO FEED', live: true, ...state(f.ui.autoFeed),
      note: 'OFF MEANS A MACHINE TAKES ONE UNIT PER PRESS. RESET EVERY RUN.' },
    { id: 'set-hints', label: 'KEY HINTS', live: true, ...state(f.ui.hintsOpen),
      note: 'THE QUICKBAR HINT LINE ALONG THE BOTTOM BAR.' }
  ];
}

function scenarioRows() {
  return SCENARIOS.map(s => ({
    id: 'scenario-' + s.id, label: ascii(s.name), live: true,
    /* The id keeps its case -- it is a URL parameter value and `?scenario=` is
       matched literally. The prose does not. */
    note: '?scenario=' + s.id + '  ' + ascii(s.note ?? '').toUpperCase()
  }));
}

const debugIntro = f =>
  'DEBUG MODE IS ' + (f.flags.showDebug ? 'ON' : 'OFF') +
  '. H TOGGLES IT, AND T B K Y P DO NOTHING UNTIL IT IS ON. EACH ROW BELOW ' +
  'BUILDS ONE NAMED WORLD TO TEST IN.';

function contentRows(f, m) {
  if (m.page === 'controls') return [];
  if (m.page === 'settings') return settingsRows(f);
  if (m.page === 'debug') return scenarioRows();
  return rootRows(m);
}


/* Draws nothing and records nothing when the menu is not standing. Assumes an
   identity canvas transform (screen space) and leaves `globalAlpha` at 1. Calls
   `resetDrawn` itself, standing instead of the HUD that otherwise owns it. */
export function drawMenu(g, f) {
  if (!menuOpen(f)) return;
  resetDrawn();
  const vw = f.W, vh = f.H, m = f.ui.menu;

  g.globalAlpha = 0.94;
  R(g, 0, 0, vw, vh, BACK);
  g.globalAlpha = 1;

  const rec = { page: m.page, rows: [], keys: [], focus: 0, scroll: 0, pages: 1,
    notice: m.notice ?? null };
  drawn.menu = rec;

  const rows = contentRows(f, m);
  /* The root page is the top of the stack; every other page carries BACK as its
     last row, in the footer. */
  const backable = m.page !== 'root';
  const count = rows.length + (backable ? 1 : 0);
  const focus = count > 0 ? (((m.index | 0) % count) + count) % count : 0;
  rec.focus = focus;

  const footY = vh - M - LINE;
  if (m.page === 'controls') controls(g, f, m, rec, M, footY - GAP);
  else list(g, f, m, rec, rows, focus, M, footY - GAP);

  footer(g, f, m, rec, rows.length, focus, footY, backable);
}

/* The wordmark's scale, as large as both the width and the height afford: a
   taller viewport is what buys a bigger title, because the rows under it must
   still fit. */
const titleScale = (f, availW) => {
  for (const [sc, minH] of [[3, 340], [2, 240]])
    if (f.H >= minH && textWidth(TITLE, sc) <= availW) return sc;
  return 1;
};

/* Measured and drawn by one function, because the root page centres the
   wordmark and the list as one block and needs the height before the top.
   `g` null measures without painting. */
function wordmark(g, f, top) {
  const availW = f.W - 2 * M;
  const sc = titleScale(f, availW);
  if (g) drawText(g, TITLE, M + ((availW - textWidth(TITLE, sc)) >> 1), top, INK, sc, 1);
  let y = top + sc * 7 + 2 + sc;
  if (textWidth(TAGLINE) <= availW) {
    if (g) drawText(g, TAGLINE, M + ((availW - textWidth(TAGLINE)) >> 1), y, INK2, 1, 1);
    y += LINE;
  }
  return y + GAP;
}


function list(g, f, m, rec, rows, focus, top, bottom) {
  const vw = f.W, vh = f.H, availW = vw - 2 * M;
  const title = m.page === 'root' ? '' : m.page.toUpperCase();
  /* Measured before anything is placed, so the wordmark and the list centre as
     one block. */
  const headH = m.page === 'root' ? wordmark(null, f, 0) : 0;
  /* `./panel.js#drawPanel`'s own content offset: 3 px of padding, plus the
     title bar when there is a title. */
  const chrome = title ? 12 : 3;

  let need = 0, valueW = 0;
  for (const r of rows) {
    if (r.value) valueW = Math.max(valueW, textWidth(r.value));
    need = Math.max(need, textWidth(r.label) + (r.value ? 6 + textWidth(r.value) : 0));
  }
  const panelW = Math.min(availW, Math.max(need + 2 * PAD + 2, Math.min(WANT_W, availW)));
  const inner = panelW - 2 * PAD - 2;

  /* A label that does not fit wraps: the longest shipped trial name is 185 px
     against the 184 px the 200 px floor affords, and painted outside the frame
     without it. */
  const laid = rows.map(r => ({
    row: r,
    lines: wrap(r.label, inner - (r.value ? 6 + valueW : 0))
  }));
  const rowsH = laid.reduce((h, l) => h + l.lines.length * LINE, 0);

  let intro = m.page === 'debug' ? wrap(debugIntro(f), inner) : [];
  let note = wrap(rows[focus]?.note ?? '', inner);
  let notice = m.notice ? wrap(ascii(m.notice), inner) : [];

  const block = () => chrome + rowsH
    + (intro.length ? intro.length * LINE + GAP : 0)
    + (note.length ? GAP + note.length * LINE : 0)
    + (notice.length ? GAP + notice.length * LINE : 0) + 3;

  /* In priority order, last dropped first, and dropped whole: the rows and a
     load refusal survive a short viewport, the page's own blurb is what goes. */
  const regionH = Math.max(LINE, bottom - top - headH);
  if (block() > regionH) intro = [];
  if (block() > regionH) note = [];
  if (block() > regionH) notice = [];

  const h = Math.min(block(), regionH);
  const x = M + ((availW - panelW) >> 1);
  const blockTop = top + Math.max(0, (bottom - top - headH - h) >> 1);
  if (headH) wordmark(g, f, blockTop);
  const y = blockTop + headH;
  const p = drawPanel(g, { id: 'menu', x, y, w: panelW, h, vw, vh, title, alpha: 0.96 });

  let ly = p.contentY;
  const floor = p.y + p.h - 2;
  for (const s of intro) {
    if (ly + 7 > floor) break;
    drawText(g, s, p.x + PAD, ly, INK2, 1, 1);
    ly += LINE;
  }
  if (intro.length) {
    RULE(g, p, ly + 1);
    ly += GAP;
  }

  for (let i = 0; i < laid.length; i++) {
    const { row, lines } = laid[i];
    const rh = lines.length * LINE;
    if (ly + rh > floor + 1) break;
    const on = i === focus;
    if (on) R(g, p.x + 1, ly - 1, p.w - 2, rh, FOCUS_BG);
    const col = row.live ? (on ? INK : INK2) : DIM;
    for (let k = 0; k < lines.length; k++)
      drawText(g, lines[k], p.x + PAD, ly + k * LINE, col, 1, 1);
    if (row.value)
      drawText(g, row.value, p.x + p.w - PAD - textWidth(row.value), ly,
        row.valueCol ?? (row.live ? INK2 : AMBER), 1, 1);
    rec.rows.push({ id: row.id, x: p.x + 1, y: ly - 1, w: p.w - 2, h: rh,
      live: !!row.live, focused: on, label: row.label });
    ly += rh;
  }

  if (note.length) {
    RULE(g, p, ly + 1);
    ly += GAP;
    for (const s of note) {
      if (ly + 7 > floor) break;
      drawText(g, s, p.x + PAD, ly, INK2, 1, 1);
      ly += LINE;
    }
  }
  if (notice.length) {
    RULE(g, p, ly + 1);
    ly += GAP;
    for (const s of notice) {
      if (ly + 7 > floor) break;
      drawText(g, s, p.x + PAD, ly, AMBER, 1, 1);
      ly += LINE;
    }
  }
}


const keyCell = r => r.keys + (r.hold ? ' HOLD' : '');

/* The keymap flattened to drawable lines -- a heading per group, a line per
   binding, a blank between groups -- in one pass, so the table's order is the
   declaration's order. */
function keymapLines(km) {
  const out = [];
  for (const group of km) {
    if (out.length) out.push({ kind: 'gap' });
    out.push({ kind: 'head', text: ascii(group.when ?? '') });
    for (const r of group.rows ?? [])
      out.push({ kind: 'row', id: r.id, keys: ascii(keyCell(r)), bare: ascii(r.keys),
        hold: !!r.hold, label: ascii(r.label) });
  }
  return out;
}

/* Push a heading off the bottom of a column rather than leaving it with nothing
   under it. Changes the line count, so pages are counted after. */
function reflow(lines, perCol) {
  const out = [];
  for (const l of lines) {
    if (l.kind === 'head' && out.length % perCol === perCol - 1) out.push({ kind: 'gap' });
    out.push(l);
  }
  return out;
}

function controls(g, f, m, rec, top, bottom) {
  const vw = f.W, vh = f.H, availW = vw - 2 * M;
  const regionH = Math.max(LINE + 15, bottom - top);
  const km = f.ui.keymap ?? [];

  /* A missing keymap is a content gap and must be visible. */
  if (!km.length) {
    const p = drawPanel(g, { id: 'menu', x: M, y: top, w: availW,
      h: Math.min(regionH, 12 + LINE + 3), vw, vh, title: 'CONTROLS', alpha: 0.96 });
    drawText(g, 'NO KEYMAP DECLARED', p.x + PAD, p.contentY, AMBER, 1, 1);
    return;
  }

  let lines = keymapLines(km);
  let keysW = 0, labelW = 0;
  for (const l of lines) {
    if (l.kind !== 'row') continue;
    keysW = Math.max(keysW, textWidth(l.keys));
    labelW = Math.max(labelW, textWidth(l.label));
  }

  const roomW = availW - 2 * PAD - 2;
  const colW = Math.min(roomW, keysW + KEY_GAP + labelW);
  const bodyH = regionH - 12 - 3;
  const perCol = Math.max(1, Math.floor(bodyH / LINE));
  const maxCols = Math.max(1, Math.floor((roomW + COL_GAP) / (colW + COL_GAP)));
  /* As many columns as the table needs and the width affords, then balanced:
     the count comes from the line total, or the whole table lands in the first
     column and the rest sit empty. */
  const cols = Math.min(maxCols, Math.max(1, Math.ceil(lines.length / perCol)));
  lines = reflow(lines, perCol);
  const fits = lines.length <= cols * perCol;
  const rowsPerCol = fits ? Math.ceil(lines.length / cols) : perCol;
  const pages = Math.max(1, Math.ceil(lines.length / (cols * rowsPerCol)));
  const page = Math.max(0, Math.min(pages - 1, m.scroll | 0));
  rec.pages = pages;
  rec.scroll = page;

  const panelW = Math.min(availW, cols * colW + (cols - 1) * COL_GAP + 2 * PAD + 2);
  const h = Math.min(regionH, rowsPerCol * LINE + 12 + 3);
  const x = M + ((availW - panelW) >> 1);
  const y = top + Math.max(0, (regionH - h) >> 1);
  const title = pages > 1 ? `CONTROLS  ${page + 1}/${pages}` : 'CONTROLS';
  const p = drawPanel(g, { id: 'menu', x, y, w: panelW, h, vw, vh, title, alpha: 0.96 });

  const first = page * cols * rowsPerCol;
  const floor = p.y + p.h - 2;
  for (let c = 0; c < cols; c++) {
    const cx = p.x + PAD + c * (colW + COL_GAP);
    let i = first + c * rowsPerCol;
    const end = Math.min(lines.length, i + rowsPerCol);
    /* A blank at the top of a column is a separator with nothing above it. */
    while (i < end && lines[i].kind === 'gap') i++;
    let cy = p.contentY;
    for (; i < end && cy + 7 <= floor; i++, cy += LINE) {
      const l = lines[i];
      if (l.kind === 'gap') continue;
      if (l.kind === 'head') { drawText(g, l.text, cx, cy, HEAD, 1, 1); continue; }
      drawText(g, l.bare, cx, cy, INK, 1, 1);
      if (l.hold) drawText(g, 'HOLD', cx + textWidth(l.bare) + 6, cy, DIM, 1, 1);
      drawText(g, l.label, cx + keysW + KEY_GAP, cy, INK2, 1, 1);
      /* Recorded so an assertion can prove a binding was reached: with the
         table paged, a group dropped by the column arithmetic would otherwise
         photograph as a tidy page. */
      rec.keys.push({ id: l.id, keys: l.keys, label: l.label,
        x: cx, y: cy, w: keysW + KEY_GAP + textWidth(l.label), h: 7 });
    }
  }
}

/* One line along the bottom edge. BACK is a real recorded row and always the
   last index, so the cursor reaches it by moving past the content and a click
   reaches the same id. The rest of the line is a hint and is not clickable. */
function footer(g, f, m, rec, backIndex, focus, y, backable) {
  const vw = f.W;
  if (!backable) {
    const hint = '[W/S] MOVE   [ENTER] TAKE';
    if (textWidth(hint) <= vw - 2 * M)
      drawText(g, hint, M + ((vw - 2 * M - textWidth(hint)) >> 1), y, DIM, 1, 1);
    return;
  }

  const back = '[ESC] BACK';
  const bw = textWidth(back);
  const on = focus === backIndex;
  if (on) R(g, M - 1, y - 1, bw + 2, LINE, FOCUS_BG);
  drawText(g, back, M, y, on ? INK : DIM, 1, 1);
  rec.rows.push({ id: 'back', x: M - 1, y: y - 1, w: bw + 2, h: LINE,
    live: true, focused: on, label: back });

  /* The page count is in the panel title; the footer names the key. The
     controls page has one row and offers no cursor hint at all. */
  const hint = rec.pages > 1 ? '[A/D] PAGE'
    : m.page === 'controls' ? '' : '[W/S] MOVE   [ENTER] TAKE';
  const hx = vw - M - textWidth(hint);
  if (hint && hx > M + bw + 6) drawText(g, hint, hx, y, DIM, 1, 1);
}
