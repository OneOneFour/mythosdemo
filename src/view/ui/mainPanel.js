/* view layer — the main panel: the one tabbed window, built on the primitives
   in this directory.

   Opening it does not freeze the simulation, and nothing here reads
   `flags.showMap`; it is drawn from `view/hud.js#drawHUD` like every other HUD
   element, over whatever the world is doing. Every function below only draws
   and records the rectangles it drew into `./state.js#drawn`, which
   `shell/main.js`'s UI dispatcher hit-tests -- so the panel is read one frame
   stale. */

import { drawText, textWidth } from '../../core/font.js';
import { mix } from '../../core/palette.js';
import { R } from '../../core/pixels.js';
import { expand, F, FORM } from '../../data/forms.js';
import { MACH } from '../../data/machines.js';
import { colour } from '../../data/palette.js';
import { HAND_RECIPES, RECIPES } from '../../data/recipes.js';
import { MIRACLE } from '../../data/miracles.js';
import { S, SUB } from '../../data/substances.js';
import { SPAWN_BAND } from '../../data/world.js';
import { TRINKET } from '../../data/trinkets.js';
import { massOfPair } from '../../model/items.js';
import { count, defOf, machines } from '../../model/machines.js';
import { eff, explain } from '../../model/mods.js';
import { bandOf, worldY } from '../../model/world.js';
import {
  burdenFrac, burdenOf, canCraft, isKnown, pocketedBest, pocketedPair, pocketsHave, run
} from '../../model/run.js';
import { drawBar } from './bar.js';
import { drawGrid } from './grid.js';
import { drawPanel } from './panel.js';
import { frameSlot, SLOT_SIZE } from './slot.js';
import { drawn } from './state.js';
import { drawTabs } from './tabs.js';
import { drawTooltip } from './tooltip.js';

/* `DIM` is the state tone in this file and `INK2` the secondary body tone; the
   UNFUELLED/IDLE rungs of `STATE_COLOUR` reach `view/overview.js#drawMachines`
   too. No shadow anywhere: every line draws inside `view/ui/panel.js`'s frame. */
const INK = colour('ui'), INK2 = colour('uiInk2'), DIM = colour('uiDim'), BACK = colour('uiBack');
const GOOD = colour('uiGood'), AMBER = colour('uiAmber'), HEART = colour('uiHeart');
const RELIC = colour('ichor');
/* The same track mix `view/ui/bar.js` paints a bar's own track with. */
const TRACK = mix(BACK, DIM, 0.3);

const MAIN_TABS = [
  { id: 'char',  label: 'CHARACTER' },
  { id: 'craft', label: 'CRAFTING' },
  { id: 'log',   label: 'LOGISTICS' }
];

/* `f.ui.tab.main` arrives on the frame context because `view` may not import
   `shell/ui.js`; this restates that file's `activeTab()` fallback -- the first
   tab when the stored one is stale or absent -- in one line. */
const activeOf = (stored, list) => list.some(t => t.id === stored) ? stored : list[0].id;

/* `sub`/`form` ordinals plus a resolved swatch hex, the one shape
   `slot.js#drawSlot` accepts: a swatch colour is a fact about a substance's
   `look`, and `slot.js` may not look one up itself. */
function swatchOf(sub) {
  const l = SUB[sub].look;
  return l?.item ? colour(l.item[0]) : DIM;
}

/* A placeholder 1-2 letter code off the substance's own `short`/`name`, used
   only where the caller has no more useful glyph of its own. */
function glyphOf(sub) {
  const s = SUB[sub];
  return (s.short || s.name || '').slice(0, 2).toUpperCase();
}

/* A unique held thing: the `relic`/`phial` tags `data/forms.js` reserves. */
const isUnique = sub => !!sub.tags?.some(t => t === 'relic' || t === 'miracle');

/* `drawSlot` draws no per-item border, so the frame is overlaid on the absolute
   rectangles `drawGrid` already returned for each slot. */
function frameUniqueSlots(g, gridResult) {
  for (const s of gridResult.slots) {
    if (s.sub == null || !isUnique(SUB[s.sub])) continue;
    frameSlot(g, s, RELIC);
  }
}

/* The armed-placement highlight: the relic frame's border in `GOOD`, the tint
   the craftable grid and the placement ghost already use. `armed` is
   `ui.armedPlace` (`{sub,form}` or null), read off the frame context. */
function frameArmedSlot(g, gridResult, armed) {
  if (!armed) return;
  for (const s of gridResult.slots) {
    if (s.sub === armed.sub && s.form === armed.form) frameSlot(g, s, GOOD);
  }
}


export function drawMainPanel(g, f) {
  if (!f.ui.stack.includes('main')) return;
  const { W: vw, H: vh } = f;

  const w = Math.min(vw - 8, 236);
  const h = Math.min(vh - 8, vh < 300 ? vh - 8 : 176);
  const x = (vw - w) >> 1, y = (vh - h) >> 1;

  const p = drawPanel(g, { id: 'main', x, y, w, h, vw, vh, title: 'MENU', closable: true });
  const cx = p.x + 2, cw = p.w - 4;

  const active = activeOf(f.ui.tab.main, MAIN_TABS);
  const tabs = drawTabs(g, { id: 'main', x: cx, y: p.contentY, w: cw, tabs: MAIN_TABS, active, vw });
  const bodyY = tabs.y + tabs.h + 2;
  const bodyBottom = p.y + p.h - 2;

  const body = { x: cx, y: bodyY, w: cw, bottom: bodyBottom, vw, vh };
  if (active === 'char') drawCharacterTab(g, f, body);
  else if (active === 'craft') drawCraftingTab(g, f, body);
  else drawLogisticsTab(g, f, body);
}

function drawCharacterTab(g, f, body) {
  const { x, y, w, vw, vh } = body;
  const bottom = contentBottom(body);
  const cap = eff('burden'), frac = burdenFrac();
  const col = frac >= 1 ? HEART : frac >= eff('burdenSoft') ? AMBER : GOOD;
  const label = frac >= 1 ? 'BURDEN -- TOO HEAVY TO CLIMB' : 'BURDEN';

  const bar = drawBar(g, {
    id: 'burden', x, y: y + 8, w, frac, fillColour: col, vw,
    label, valueText: `${burdenOf().toFixed(1)} / ${cap.toFixed(0)} T`
  });

  let ry = bar.y + bar.h + 5;

  /* Each toggle gets its own `drawPanel` id, so a click here is never taken for
     one on the grid beneath. They share a row because stacking them costs 11 px
     this tab has not got; the stacked fallback still fits a longer label. */
  const acLabel = 'AUTO COLLECT ' + (f.ui.autoCollect ? 'ON' : 'OFF');
  const afLabel = 'AUTO FEED ' + (f.ui.autoFeed ? 'ON' : 'OFF');
  const acW = Math.min(textWidth(acLabel) + 4, w);
  const afW = Math.min(textWidth(afLabel) + 4, w);
  const oneRow = acW + 2 + afW <= w;

  drawPanel(g, { id: 'main-auto-collect', x, y: ry, w: acW, h: 9, vw, vh, alpha: 0.6 });
  drawText(g, acLabel, x + 2, ry + 1, f.ui.autoCollect ? GOOD : DIM, 1, 1);

  const afX = oneRow ? x + acW + 2 : x;
  const afY = oneRow ? ry : ry + 11;
  drawPanel(g, { id: 'main-auto-feed', x: afX, y: afY, w: afW, h: 9, vw, vh, alpha: 0.6 });
  drawText(g, afLabel, afX + 2, afY + 1, f.ui.autoFeed ? GOOD : DIM, 1, 1);

  ry = afY + 11;

  /* One cell per slot, empty slots included and drawn empty, so how much room
     is left stays legible. */
  const invSlots = run.inv.slice(0, run.mainSlots);
  const items = invSlots.map(slot => !slot ? null : {
    sub: slot.sub, form: slot.form, n: slot.n, mass: massOfPair(slot.sub, slot.form) * slot.n,
    colour: swatchOf(slot.sub),
    /* The tile-capable marker '#' keeps priority; everything else falls back to
       the placeholder identity glyph rather than to no glyph at all. */
    glyph: FORM[slot.form].tile ? '#' : glyphOf(slot.sub)
  });
  /* The 22 px is the TRINKETS heading plus its own row of slots, and
     `STAT_MIN_H` what the scroll region needs to show anything. Both come out
     of the inventory grid's budget, since the inventory already scrolls. */
  const invRows = Math.min(3, Math.max(1,
    Math.floor((bottom - ry - 22 - STAT_MIN_H) / (SLOT_SIZE + 1))));
  const grid = drawGrid(g, {
    id: 'inv', x, y: ry, h: invRows * (SLOT_SIZE + 1) - 1, vw, vh,
    cols: Math.max(1, Math.floor((w + 1) / (SLOT_SIZE + 1))),
    items, scroll: f.ui.scroll['main:inv'] || 0
  });
  frameUniqueSlots(g, grid);
  frameArmedSlot(g, grid, f.ui.armedPlace);
  ry = grid.y + grid.h + 4;

  const slots = eff('trinketSlots') | 0;
  const equipItems = Array.from({ length: slots }, (_, i) => {
    const sub = run.equipped[i];
    if (sub == null) return null;
    return { sub, form: F.relic, n: 1, mass: massOfPair(sub, F.relic), colour: swatchOf(sub), glyph: glyphOf(sub) };
  });
  drawText(g, 'TRINKETS', x, ry, INK, 1, 1);
  ry += 8;
  const eqGrid = drawGrid(g, { id: 'equip', x, y: ry, h: SLOT_SIZE, vw, vh, cols: slots, items: equipItems });
  frameUniqueSlots(g, eqGrid);
  ry = eqGrid.y + eqGrid.h + 5;

  /* Each equipped trinket's rows resolved through `model/mods.js#explain`
     rather than the raw `{key,mul,add}` a content row carries, sharing the
     scroll region below with the stat rows. */
  const lines = [];
  for (const t of Object.values(TRINKET)) {
    if (!run.equipped.includes(S[t.id])) continue;
    for (const line of trinketDeltaLines(t)) lines.push({ s: line, col: GOOD, ind: 2 });
  }
  lines.push({ s: 'STATS', col: INK, ind: 0 });
  for (const st of STAT_ROWS)
    lines.push({ s: `${st.label} ${fmtNum(eff(st.id, st.scope))}${unitOf(st.id)}`, col: INK2, ind: 2 });

  statList(g, f, { x, y: ry + 2, w, bottom, lines });

  drawCharacterTooltip(g, f, grid, eqGrid);
}

/* The numbers a player can bend, so a trinket or a boon's effect is legible. */
const STAT_ROWS = [
  { id: 'walk', label: 'WALK' }, { id: 'climb', label: 'CLIMB' },
  { id: 'pickPower', label: 'PICK POWER' },
  { id: 'rate', scope: 'furnace', label: 'FURNACE RATE' }
];

const STAT_LINE_H = 8;
const STAT_MIN_H = 3 * STAT_LINE_H;

/* Where this tab's content stops. `shell/main.js#uiHitGrid` scans `drawn.grids`
   in draw order with the quickbar recorded first, so a grid overlapping the
   strip's rectangle hands its wheel notches to a strip the panel covers. */
function contentBottom(body) {
  const qb = drawn.grids.find(gr => gr.id === 'quickbar');
  if (!qb || qb.y >= body.bottom) return body.bottom;
  if (body.x >= qb.x + qb.w || body.x + body.w <= qb.x) return body.bottom;
  return Math.max(body.y + STAT_MIN_H, qb.y - 2);
}

/* The tab's last block scrolls on the inventory grid's mechanism: the rectangle
   goes into `drawn.grids`, which is what a wheel notch is hit-tested against.
   `slots` is empty, so the region is wheel-only with no click path into it. */
function statList(g, f, { x, y, w, bottom, lines }) {
  const visible = Math.floor((bottom - y) / STAT_LINE_H);
  if (visible < 1) return;

  const first = Math.max(0, Math.min(f.ui.scroll['main:stats'] || 0, lines.length - visible));
  const shown = lines.slice(first, first + visible);
  shown.forEach((l, i) => drawText(g, l.s, x + l.ind, y + i * STAT_LINE_H, l.col, 1, 1));

  /* A 2 px thumb against the region's right edge, drawn only when something is
     off one of the ends. */
  const trackH = visible * STAT_LINE_H;
  if (lines.length > visible) {
    const thumbH = Math.max(2, Math.round(trackH * visible / lines.length));
    const thumbY = y + Math.round((trackH - thumbH) * first / (lines.length - visible));
    R(g, x + w - 2, y, 2, trackH, TRACK);
    R(g, x + w - 2, thumbY, 2, thumbH, INK2);
  }

  drawn.grids.push({
    id: 'stats', x, y, w, h: trackH, cols: 1, rows: lines.length,
    scroll: first, cell: STAT_LINE_H, slots: [], lines: shown.map(l => l.s)
  });
}

/* `data/tuning.js` may only be imported by `model/mods.js`, so a tunable's own
   `unit` is out of reach here; the handful of ids this readout names carry
   their units as presentation text instead. */
const UNITS = { walk: ' PX/S', climb: ' PX/S', pickPower: 'X', rate: 'X' };
const unitOf = id => UNITS[id] || '';

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function trinketDeltaLines(t) {
  const out = [];
  const seenKeys = new Set();
  for (const raw of t.mods) {
    if (seenKeys.has(raw.key)) continue;
    seenKeys.add(raw.key);
    const base = raw.key.includes('.') ? raw.key.slice(0, raw.key.indexOf('.')) : raw.key;
    for (const row of explain(base)) {
      if (row.src !== t.id || row.key !== raw.key) continue;
      out.push(...formatModRow(row));
    }
  }
  return out;
}

function formatModRow(row) {
  const dot = row.key.indexOf('.');
  const base = dot < 0 ? row.key : row.key.slice(0, dot);
  const scope = dot < 0 ? null : row.key.slice(dot + 1);
  const label = (scope ? scope.toUpperCase() + ' ' : '') + base.toUpperCase();
  const lines = [];
  if (row.mul !== undefined && row.mul !== 1) {
    const pct = Math.round((row.mul - 1) * 100);
    lines.push(`${pct >= 0 ? '+' : ''}${pct}% ${label}`);
  }
  if (row.add !== undefined && row.add !== 0) {
    lines.push(`${row.add >= 0 ? '+' : ''}${row.add} ${label}`);
  }
  return lines;
}

/* A pair's tooltip: name, mass each and total, tier, what it is for, and a
   unique drop's god and flavour line. Driven off tags, not a per-substance
   switch. */
function pairTooltip(sub, form, n) {
  const label = FORM[form] ? `${SUB[sub].name} ${FORM[form].label}`.trim() : SUB[sub].name;
  const each = massOfPair(sub, form);
  const lines = [label, `MASS ${each.toFixed(1)} EACH${n > 1 ? '  ' + (each * n).toFixed(1) + ' TOTAL' : ''}`];

  const s = SUB[sub], fm = FORM[form];
  if (s.tile?.tier) lines.push('TIER ' + s.tile.tier);

  const tags = fm.tags || [];
  let purpose = 'MATERIAL';
  if (s.item?.tool) purpose = 'TOOL';
  else if (tags.includes('ore')) purpose = 'SMELTABLE (FURNACE)';
  else if (tags.includes('ingot')) purpose = 'PRESSES TO PLATE';
  else if (tags.includes('plate')) purpose = 'REFINED GOOD';
  else if (fm.tile) purpose = 'BUILDS A LADDER';
  else if (tags.includes('fuel')) purpose = 'FUEL';
  else if (tags.includes('miracle')) purpose = 'ONE-SHOT MIRACLE';
  else if (s.tags?.includes('relic')) purpose = 'RELIC';
  lines.push(purpose);

  const unique = TRINKET?.[s.id] || MIRACLE?.[s.id];
  if (unique) lines.push('', unique.name, 'OF ' + unique.god.toUpperCase(), unique.text);

  return lines;
}

function drawCharacterTooltip(g, f, grid, eqGrid) {
  if (!f.mouse?.has) return;
  const sx = f.mouse.x - f.cam.x, sy = f.mouse.y - f.cam.y;
  for (const gr of [grid, eqGrid]) {
    for (const s of gr.slots) {
      if (s.sub == null) continue;
      if (sx < s.x || sx >= s.x + s.w || sy < s.y || sy >= s.y + s.h) continue;
      drawTooltip(g, { sections: [pairTooltip(s.sub, s.form, s.n || 1)], cx: sx, cy: sy, vw: f.W, vh: f.H });
      return;
    }
  }
}

/* `all` filters nothing and comes first, so `activeOf`'s first-row fallback
   makes it the default; it bypasses `categoryOf` instead of becoming a branch
   in it. The six labels cost 204 px against the floor's 188, so DIVINE wraps. */
const CATEGORY_TABS = [
  { id: 'all', label: 'ALL' },
  { id: 'raw', label: 'RAW' }, { id: 'refined', label: 'REFINED' },
  { id: 'tools', label: 'TOOLS' }, { id: 'placeables', label: 'PLACE' },
  { id: 'divine', label: 'DIVINE' }
];

/* Category is derived from substance/form tags on the recipe's own output,
   never a per-recipe list. `out[0]` is enough: no shipped recipe's clauses
   disagree about what kind of thing they make. */
function categoryOf(r) {
  const out = r.out?.[0];
  if (!out) return 'raw';
  const form = FORM[F[out.form]];
  if (out.sub !== undefined) {
    const sub = SUB[S[out.sub]];
    if (sub.item?.tool) return 'tools';
    if (sub.tags?.includes('relic') || sub.tags?.includes('miracle')) return 'divine';
  }
  if (form.tile) return 'placeables';
  if (form.tags?.includes('refined')) return 'refined';
  return 'raw';
}

/* The substance a recipe's icon shows right now: a literal `sub` names it
   outright, a `subFrom` clause resolves against whichever pocketed pair
   satisfies it, and the fallback is `data/forms.js#expand`'s first crossing. */
function representativePair(r) {
  const out = r.out?.[0];
  if (!out) return null;
  if (out.sub !== undefined) return { sub: S[out.sub], form: F[out.form] };
  const need = r.in[out.subFrom] || 1;
  const pair = pocketedPair(out.subFrom, need);
  if (pair) return { sub: pair.sub, form: F[out.form] };
  const options = expand(out.subFrom);
  return options.length ? { sub: options[0].sub, form: F[out.form] } : null;
}

const missingSelector = r => Object.keys(r.in).find(sel => !pocketsHave(sel, r.in[sel]));

function selectorGlyph(sel) {
  const raw = sel.includes('/') ? sel.slice(sel.indexOf('/') + 1) : sel;
  const word = raw[0] === '#' ? raw.slice(1) : raw;
  return (word[0] || '?').toUpperCase();
}

function drawCraftingTab(g, f, body) {
  const { x, y, w, vw, vh } = body;

  const catActive = activeOf(f.ui.tab['main-craft-cat'], CATEGORY_TABS);
  const catTabs = drawTabs(g, { id: 'main-craft-cat', x, y, w, tabs: CATEGORY_TABS, active: catActive, vw });
  let ry = catTabs.y + catTabs.h + 2;

  /* The search field: its own `drawPanel` id so the dispatcher can hit-test it
     apart from every other panel-shaped rect this frame. */
  const searchBox = drawPanel(g, { id: 'main-craft-search', x, y: ry, w, h: 9, vw, vh, alpha: 0.7 });
  const searchText = f.ui.search ? f.ui.search.toUpperCase() : (f.ui.searchFocus ? '_' : 'SEARCH...');
  drawText(g, searchText, searchBox.x + 2, searchBox.y + 1, f.ui.search ? INK : DIM, 1, 1);
  ry = searchBox.y + searchBox.h + 2;

  const needle = (f.ui.search || '').toLowerCase();
  const recipes = HAND_RECIPES.filter(r => (catActive === 'all' || categoryOf(r) === catActive) &&
    (!needle || r.name.toLowerCase().includes(needle)));

  const queueH = f.ui.craftQueue.length ? SLOT_SIZE + 6 : 0;
  const gridH = Math.max(SLOT_SIZE, body.bottom - ry - queueH - 2);

  const items = recipes.map(r => {
    const known = isKnown(r.id);
    const craftable = known && canCraft(r.in);
    const rep = representativePair(r);
    if (!known) {
      return { sub: rep?.sub ?? null, form: rep?.form ?? null, n: 0, mass: 0,
               colour: BACK, glyph: '?', frameColour: DIM };
    }
    const base = rep ? swatchOf(rep.sub) : DIM;
    /* The placeholder identity glyph shows on a craftable recipe; one missing an
       ingredient keeps its own single-letter selector glyph instead. */
    if (craftable) return { sub: rep?.sub, form: rep?.form, n: 0, mass: 0, colour: base, frameColour: GOOD,
                             glyph: rep ? glyphOf(rep.sub) : null };
    const miss = missingSelector(r);
    return { sub: rep?.sub, form: rep?.form, n: 0, mass: 0,
             colour: mix(base, BACK, 0.55),
             glyph: miss ? selectorGlyph(miss) : (rep ? glyphOf(rep.sub) : null) };
  });

  const grid = drawGrid(g, {
    id: 'recipes', x, y: ry, h: gridH, vw, vh,
    cols: Math.max(1, Math.floor((w + 1) / (SLOT_SIZE + 1))), items
  });
  /* Recorded so `shell/main.js` can turn a slot index back into a recipe id: a
     grid slot carries only `{sub,form,n,mass}`, which cannot name a recipe with
     a `subFrom` output. Reset by `./state.js#resetDrawn` with the rest. */
  drawn.recipeIndex[grid.id] = recipes.map(r => r.id);

  let qy = grid.y + grid.h + 3;
  if (f.ui.craftQueue.length) {
    const qItems = f.ui.craftQueue.map(id => {
      const rep = representativePair(RECIPES[id]);
      return rep ? { sub: rep.sub, form: rep.form, n: 0, mass: 0, colour: swatchOf(rep.sub) } : null;
    });
    const qGrid = drawGrid(g, {
      id: 'craft-queue', x, y: qy, h: SLOT_SIZE, vw, vh,
      cols: Math.max(1, Math.floor((w + 1) / (SLOT_SIZE + 1))), items: qItems
    });
    drawn.recipeIndex[qGrid.id] = f.ui.craftQueue.slice();

    const headId = f.ui.craftQueue[0];
    const secs = RECIPES[headId]?.secs || 1;
    const frac = run.craftRecipe === headId ? Math.min(1, run.craftProgress / secs) : 0;
    drawBar(g, { id: 'craft-progress', x, y: qGrid.y + qGrid.h + 1, w, h: 2, frac, fillColour: GOOD, vw });
  }

  drawCraftingTooltip(g, f, grid, recipes);
}

function recipeTooltip(r) {
  const lines = [r.name];
  for (const sel in r.in) {
    const need = r.in[sel];
    const have = pocketsHave(sel, need) ? need : countTowards(sel);
    const word = sel.includes('/') ? sel.slice(sel.indexOf('/') + 1) : sel;
    lines.push(`${(word[0] === '#' ? word.slice(1) : word).toUpperCase()} ${have}/${need}`);
  }
  const out = r.out?.[0];
  if (out) {
    const form = FORM[F[out.form]];
    const n = out.n || 1;
    /* The short name here, not the full one: this is an inline reference inside
       an already multi-line tooltip, unlike `r.name` above. */
    const name = out.sub !== undefined ? (SUB[S[out.sub]].short || SUB[S[out.sub]].name) : 'MATCHED';
    lines.push(`-> ${n} ${name} ${form.short || form.label}`);
  }
  const machineName = MACH.find(m => (m.recipes || []).some(x => x === r.id || x?.id === r.id))?.name;
  lines.push(`BY HAND: ${r.secs.toFixed(1)} S` + (machineName ? ` -- SAME AS ${machineName}` : ''));
  /* The one body line that keeps the state tone -- not de-emphasis but the same
     "you have not stolen this yet" state the '?' glyph says -- handed its own
     colour rather than letting the tooltip primitive guess from the string. */
  if (!isKnown(r.id)) lines.push('', { s: 'UNKNOWN -- NOT YET STOLEN', col: DIM });
  return lines;
}

/* Best count currently pocketed toward a selector, for the tooltip's have/need
   line. */
const countTowards = sel => pocketedBest(sel);

function drawCraftingTooltip(g, f, grid, recipes) {
  if (!f.mouse?.has) return;
  const sx = f.mouse.x - f.cam.x, sy = f.mouse.y - f.cam.y;
  for (const s of grid.slots) {
    if (sx < s.x || sx >= s.x + s.w || sy < s.y || sy >= s.y + s.h) continue;
    const r = recipes[s.index];
    if (!r) return;
    drawTooltip(g, { sections: [recipeTooltip(r)], cx: sx, cy: sy, vw: f.W, vh: f.H });
    return;
  }
}


/* A heuristic over what `model/machines.js` exposes, since `view` may not import
   `rules`: UNFUELLED needs a fuel-accepting port and nothing buffered, STALLED is
   some buffer contents, BLOCKED an empty one. `view/overview.js` reads it too. */
export function machineState(m) {
  const def = defOf(m);
  if (m.running || m.charges > 0 || m.torque > 0) return 'RUNNING';
  /* A drivetrain or structural machine is not a processor, so its empty buffer
     is not BLOCKED: "no recipes and no mine job" is the clause true of every
     hub, crank, gear, axle and receiver, and false of every active machine. */
  if (!def.recipes?.length && !def.mine) return 'IDLE';
  const fuelSels = [];
  for (const p of def.ports || [])
    if (p.mode === 'in' && p.accepts) for (const sel of p.accepts) if (sel.includes('#fuel')) fuelSels.push(sel);
  if (fuelSels.length && !fuelSels.some(sel => count(m, sel) > 0)) return 'UNFUELLED';
  return Object.keys(m.buf).length ? 'STALLED' : 'BLOCKED';
}

export const STATE_COLOUR = {
  RUNNING: GOOD, STALLED: AMBER, UNFUELLED: DIM, BLOCKED: HEART, IDLE: DIM
};

function depthOf(band, ty) {
  const ref = bandOf(SPAWN_BAND);
  if (!ref) return 0;
  const datum = worldY(ref, ref.cfg.floorTy ?? 0);
  return Math.round((worldY(band, ty) - datum) / ref.tile);
}

function drawLogisticsTab(g, f, body) {
  const { x, y, w, bottom } = body;
  let ry = y + 2;

  if (!machines.length) {
    drawText(g, 'NOTHING PLACED', x, ry, INK2, 1, 1);
    return;
  }

  drawText(g, 'MACHINE', x, ry, INK2, 1, 1);
  drawText(g, 'STATE', x + Math.max(60, w - 90), ry, INK2, 1, 1);
  drawText(g, 'DEPTH', x + w - 28, ry, INK2, 1, 1);
  ry += 9;

  const rowMax = Math.max(0, Math.floor((bottom - ry) / 9));
  const shown = machines.slice(0, rowMax);
  for (const m of shown) {
    const def = defOf(m);
    const st = machineState(m);
    const nameW = Math.max(60, w - 90);
    drawText(g, def.name.slice(0, Math.floor(nameW / 6)), x, ry, INK, 1, 1);
    drawText(g, st, x + nameW, ry, STATE_COLOUR[st] || DIM, 1, 1);
    const d = depthOf(m.band, m.ty);
    const ds = (d >= 0 ? d : '+' + -d) + 'M';
    drawText(g, ds, x + w - textWidth(ds), ry, INK2, 1, 1);
    ry += 9;
  }
  if (machines.length > shown.length)
    drawText(g, `+${machines.length - shown.length} MORE`, x, ry, INK2, 1, 1);
}
