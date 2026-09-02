/* LAYER view — THE MAIN PANEL: the one tabbed window, built on the primitives
   in this directory. Imports `core`, `data` and READ-ONLY `model` queries,
   plus those primitives (same-layer imports are legal). No `rules`, no
   `shell`.

   IT PAUSES NOTHING. Unlike `flags.showMap` (guarded inside
   `shell/main.js#step`), opening this panel does not freeze the simulation --
   this is an automation game and the factory keeps running while you read
   about it. Nothing here reads `flags.showMap` for that reason; it is drawn
   from `view/hud.js#drawHUD` exactly like every other HUD element, over
   whatever the world is doing this frame.

   A CLICK THAT DOES SOMETHING IS SHELL CALLING RULES: every function below
   only DRAWS and RECORDS the rectangles it drew, via the `./state.js#drawn`
   idiom the primitives already use. `shell/main.js`'s UI dispatcher hit-tests
   those rectangles against the pointer and calls into `rules`/`shell/ui.js`
   itself; nothing in this file ever does that. This also means the panel is
   read ONE FRAME STALE by the dispatcher, which is invisible at any real
   frame rate. See docs/DEVELOPER_GUIDE.md#record-what-you-drew */

import { drawText, textWidth } from '../../core/font.js';
import { mix } from '../../core/palette.js';
import { expand, F, FORM, matches } from '../../data/forms.js';
import { MACH } from '../../data/machines.js';
import { colour } from '../../data/palette.js';
import { HAND_RECIPES, RECIPES } from '../../data/recipes.js';
import { MIRACLE } from '../../data/miracles.js';
import { S, SUB } from '../../data/substances.js';
import { SPAWN_BAND } from '../../data/world.js';
import { TRINKET } from '../../data/trinkets.js';
import { massOfPair, parseKey } from '../../model/items.js';
import { count, defOf, machines } from '../../model/machines.js';
import { eff, explain } from '../../model/mods.js';
import { bandOf, worldY } from '../../model/world.js';
import {
  burdenFrac, burdenOf, canCraft, isKnown, pocketRows, pocketsHave, run
} from '../../model/run.js';
import { drawBar } from './bar.js';
import { drawGrid } from './grid.js';
import { drawPanel } from './panel.js';
import { frameSlot, SLOT_SIZE } from './slot.js';
import { drawn } from './state.js';
import { drawTabs } from './tabs.js';
import { drawTooltip } from './tooltip.js';

const INK = colour('ui'), DIM = colour('uiDim'), BACK = colour('uiBack');
const GOOD = colour('uiGood'), AMBER = colour('uiAmber'), HEART = colour('uiHeart');
const RELIC = colour('ichor');

const MAIN_TABS = [
  { id: 'char',  label: 'CHARACTER' },
  { id: 'craft', label: 'CRAFTING' },
  { id: 'log',   label: 'LOGISTICS' }
];

/* `f.ui.tab.main` is a plain string handed through by `shell/main.js`'s frame
   context, per Phase 5a's own precedent (`f.flags`) -- `view` may not import
   `shell/ui.js`, so its `activeTab()` fallback (first tab if the stored one
   is stale or absent) is re-stated here in one line rather than called. */
const activeOf = (stored, list) => list.some(t => t.id === stored) ? stored : list[0].id;

/* `sub`/`form` ordinals plus a resolved swatch hex -- the one shape
   `slot.js#drawSlot` accepts, built here because `view/hud.js#pockets`
   already proves the rule this file must also respect: a swatch colour is a
   fact about a substance's `look`, and `slot.js` may not know how to look
   one up itself. */
function swatchOf(sub) {
  const l = SUB[sub].look;
  return l?.item ? colour(l.item[0]) : DIM;
}

/* A PLACEHOLDER ICON, not real art: a 1-2 letter code off the substance's own
   `short`/`name`. Callers that already have a MORE useful glyph (a locked
   recipe's '?', a missing ingredient's own letter, the quickbar's slot digit)
   keep that instead -- this is only ever the fallback. */
function glyphOf(sub) {
  const s = SUB[sub];
  return (s.short || s.name || '').slice(0, 2).toUpperCase();
}

/* A unique held THING: a trinket or a miracle, the two tags `data/forms.js`
   reserves the `relic`/`phial` forms for. `view/hud.js#pockets` already
   frames a relic in this same `ichor` divine-gold; extended to `miracle`
   here rather than a second "this is special" colour, per Phase 5b's own
   instruction. */
const isUnique = sub => !!sub.tags?.some(t => t === 'relic' || t === 'miracle');

/* `grid.js#drawSlot` draws no per-item border of its own (its contract is
   `{sub,form,n,mass,colour,glyph}` -- see that file's own header). Rather
   than teach the Phase 5a primitive a new field, this overlays the frame
   directly on the ABSOLUTE rectangles `drawGrid` already returned for each
   slot, the same "read back what was actually drawn" discipline every hit
   test in this project already uses. */
function frameUniqueSlots(g, gridResult) {
  for (const s of gridResult.slots) {
    if (s.sub == null || !isUnique(SUB[s.sub])) continue;
    frameSlot(g, s, RELIC);
  }
}

/* THE ARMED-PLACEMENT HIGHLIGHT (Part 1, click-to-arm placement): whichever
   slot's pair matches `ui.armedPlace` gets the SAME border treatment a
   relic's frame above already uses, just in `GOOD` -- the "this is what
   will happen" colour the crafting grid's craftable tint and the placement
   ghost's ok tint both already use, rather than `RELIC`'s divine gold, so
   arming reads as a placement fact and not a second "this is special"
   marker. `armed` is `ui.armedPlace` itself (`{sub,form}|null`), read
   straight off the frame context exactly as `f.flags`/`f.ui.drag` already
   are. */
function frameArmedSlot(g, gridResult, armed) {
  if (!armed) return;
  for (const s of gridResult.slots) {
    if (s.sub === armed.sub && s.form === armed.form) frameSlot(g, s, GOOD);
  }
}

/* ---------------------------------------------------------------------- */
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

/* ========================================================================
   TAB 1 -- CHARACTER
   ======================================================================== */

/* The one place this project deliberately diverges from every other factory
   game's inventory: slots are stack-based, but the BINDING constraint is
   mass, so the burden bar is the most legible thing this tab draws --
   amber past the soft cap, red (and spelled out in words) at the hard one.
   See docs/DEVELOPER_GUIDE.md#buffers-and-pockets */
function drawCharacterTab(g, f, body) {
  const { x, y, w, vw, vh } = body;
  const cap = eff('burden'), frac = burdenFrac();
  const col = frac >= 1 ? HEART : frac >= eff('burdenSoft') ? AMBER : GOOD;
  const label = frac >= 1 ? 'BURDEN -- TOO HEAVY TO CLIMB' : 'BURDEN';

  const bar = drawBar(g, {
    id: 'burden', x, y: y + 8, w, frac, fillColour: col, vw,
    label, valueText: `${burdenOf().toFixed(1)} / ${cap.toFixed(0)} T`
  });

  let ry = bar.y + bar.h + 5;

  /* Inventory grid: `pocketRows()`, `byHudOrder`-sorted already, filtered to
     what is actually held -- the strip's zero-count teaching slots have
     nothing to fill a slot with. */
  const rows = pocketRows().filter(r => r.n > 0);
  const items = rows.map(r => ({
    sub: r.sub, form: r.form, n: r.n, mass: massOfPair(r.sub, r.form) * r.n,
    colour: swatchOf(r.sub),
    /* The tile-capable marker '#' carries real meaning (this is what a
       ladder is built from) and keeps priority; everything else falls back
       to the placeholder identity glyph rather than no glyph at all. */
    glyph: FORM[r.form].tile ? '#' : glyphOf(r.sub)
  }));
  const invRows = Math.min(3, Math.max(1, Math.floor((body.bottom - ry - 22) / (SLOT_SIZE + 1))));
  const grid = drawGrid(g, {
    id: 'inv', x, y: ry, h: invRows * (SLOT_SIZE + 1) - 1, vw, vh,
    cols: Math.max(1, Math.floor((w + 1) / (SLOT_SIZE + 1))),
    items, scroll: f.ui.scroll['main:inv'] || 0
  });
  frameUniqueSlots(g, grid);
  frameArmedSlot(g, grid, f.ui.armedPlace);
  ry = grid.y + grid.h + 4;

  /* Equipment: `eff('trinketSlots')` slots over `run.equipped`. */
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

  /* Each equipped trinket's own rows, RESOLVED through `model/mods.js#explain`
     -- the same query the debug overlay reads to answer "why is my walk
     speed 71" -- rather than the raw `{key,mul,add}` a content row carries. */
  for (const t of Object.values(TRINKET)) {
    if (!run.equipped.includes(S[t.id])) continue;
    for (const line of trinketDeltaLines(t)) {
      if (ry > body.bottom - 8) break;
      drawText(g, line, x + 2, ry, GOOD, 1, 1);
      ry += 8;
    }
  }

  ry += 2;
  /* Stat readout: the numbers a player can actually bend, so a trinket or a
     boon's effect is legible rather than inferred from feel. */
  const stats = [
    { id: 'walk', label: 'WALK' }, { id: 'climb', label: 'CLIMB' },
    { id: 'pickPower', label: 'PICK POWER' },
    { id: 'rate', scope: 'furnace', label: 'FURNACE RATE' }
  ];
  if (ry <= body.bottom - 8) drawText(g, 'STATS', x, ry, INK, 1, 1);
  ry += 8;
  for (const s of stats) {
    if (ry > body.bottom - 8) break;
    const v = eff(s.id, s.scope);
    drawText(g, `${s.label} ${fmtNum(v)}${unitOf(s.id)}`, x + 2, ry, DIM, 1, 1);
    ry += 8;
  }

  drawCharacterTooltip(g, f, grid, eqGrid);
}

/* `data/tuning.js` may only ever be imported by `model/mods.js`, so this file
   cannot read a tunable's own `unit` off the frozen row -- and does not need
   to: the stat readout only ever names a handful of ids, so their units are
   spelled out here as presentation text, the same way `view/hud.js#billOf`
   already turns a content key into a word without importing the table it
   came from. See docs/DEVELOPER_GUIDE.md#the-tunable-pipeline */
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

/* A pair's tooltip: name, mass each/total, tier, what it is for -- and, for a
   unique drop, its god and flavour line. Driven off TAGS, not a hand-written
   per-substance switch. See docs/DEVELOPER_GUIDE.md#colour-and-appearance */
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

/* ========================================================================
   TAB 2 -- CRAFTING
   ======================================================================== */

const CATEGORY_TABS = [
  { id: 'raw', label: 'RAW' }, { id: 'refined', label: 'REFINED' },
  { id: 'tools', label: 'TOOLS' }, { id: 'placeables', label: 'PLACE' },
  { id: 'divine', label: 'DIVINE' }
];

/* Category is DERIVED from substance/form TAGS on the recipe's own output --
   never a hand-written per-recipe list. `out[0]` is enough: nothing in
   `data/recipes.js` ships a recipe whose clauses disagree about what kind of
   thing they make. */
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

/* The substance a recipe's icon should show right now: a literal `sub` names
   it outright; a `subFrom` clause is resolved against whichever pocketed
   pair currently satisfies it (so a smelt slot shows tin the moment tin ore
   is what is actually held), falling back to the first substance the
   selector could EVER cross (`data/forms.js#expand`) when nothing does. */
function representativePair(r) {
  const out = r.out?.[0];
  if (!out) return null;
  if (out.sub !== undefined) return { sub: S[out.sub], form: F[out.form] };
  const need = r.in[out.subFrom] || 1;
  for (const k in run.inv) {
    if (run.inv[k] < need) continue;
    const p = parseKey(k);
    if (matches(out.subFrom, p.sub, p.form)) return { sub: p.sub, form: F[out.form] };
  }
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

  /* The search field: a borderless little box, its own `drawPanel` id so the
     dispatcher can hit-test it apart from every other panel-shaped rect this
     frame -- see `shell/main.js`'s UI dispatcher. */
  const searchBox = drawPanel(g, { id: 'main-craft-search', x, y: ry, w, h: 9, vw, vh, alpha: 0.7 });
  const searchText = f.ui.search ? f.ui.search.toUpperCase() : (f.ui.searchFocus ? '_' : 'SEARCH...');
  drawText(g, searchText, searchBox.x + 2, searchBox.y + 1, f.ui.search ? INK : DIM, 1, 1);
  ry = searchBox.y + searchBox.h + 2;

  const needle = (f.ui.search || '').toLowerCase();
  const recipes = HAND_RECIPES.filter(r => categoryOf(r) === catActive &&
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
    /* A craftable recipe used to show a bare swatch with no glyph at all --
       the placeholder identity glyph fills that in (Polish 5). A recipe
       missing an ingredient keeps its own, more useful, single-letter
       selector glyph instead. */
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
  /* Recorded so the dispatcher (`shell/main.js`) can turn a slot index back
     into a recipe id -- a grid slot only carries `{sub,form,n,mass}` (Phase
     5a's own contract), which is not enough to name a recipe with a
     `subFrom` output. Own map, own key, reset every call by
     `./state.js#resetDrawn` alongside everything else in `drawn`, so it
     cannot be confused with the widget layer's `drawn.grids` and does not
     need that shape to change. */
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
    /* POLISH: the SHORT name/label here, not the full one -- this is an
       inline reference inside an already-multi-line tooltip, the exact
       "recipe tooltips' inline references" spot named for abbreviation,
       unlike `r.name` above (the recipe's own title line, which stays full
       length) and unlike the Character tab's `pairTooltip` (deliberately
       left full, see that function's own header). */
    const name = out.sub !== undefined ? (SUB[S[out.sub]].short || SUB[S[out.sub]].name) : 'MATCHED';
    lines.push(`-> ${n} ${name} ${form.short || form.label}`);
  }
  const machineName = MACH.find(m => (m.recipes || []).some(x => x === r.id || x?.id === r.id))?.name;
  lines.push(`BY HAND: ${r.secs.toFixed(1)} S` + (machineName ? ` -- SAME AS ${machineName}` : ''));
  if (!isKnown(r.id)) lines.push('', 'UNKNOWN -- NOT YET STOLEN');
  return lines;
}

/* Best count currently pocketed toward a selector, for the tooltip's
   have/need line -- the single-largest-matching-pair rule every other
   reader of `run.inv` in this project already uses (`model/run.js`'s own
   `pocketsHave`, `rules/crafting.js`'s `bestPocketed`), re-derived here
   rather than shared because it is eight lines and this is `view`, which may
   not import `rules`.
   See docs/DEVELOPER_GUIDE.md#duplication-across-a-layer-boundary */
function countTowards(sel) {
  let best = 0;
  for (const k in run.inv) {
    const p = parseKey(k);
    if (matches(sel, p.sub, p.form) && run.inv[k] > best) best = run.inv[k];
  }
  return best;
}

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

/* ========================================================================
   TAB 3 -- LOGISTICS (a stub, honestly labelled)
   ======================================================================== */

/* State is a HEURISTIC over what `model/machines.js` already exposes, not a
   duplicate of `rules/machines.js`'s own decisions (`view` may not import
   `rules`, and should not want to: this tab is explicitly a stub).
   RUNNING mirrors `m.running`, plus a banked belt/brazier charge (`m.charges`)
   reads as doing its job even on the frame it is not literally ticking.
   UNFUELLED fires only for a machine that actually HAS a fuel-accepting
   port and none buffered. Anything else with SOME buffer contents reads as
   STALLED (present but not moving -- a full output port, a cold `needs`
   gate, a servo throttle: this file cannot tell those apart without
   importing `rules`); an entirely empty buffer reads as BLOCKED. */
/* EXPORTED FOR THE OVERVIEW'S MACHINES LAYER (Phase 9 section 4), which was
   told in as many words to read the same query as this tab rather than write a
   second one. Same-layer import, and the heuristic above is stated once, here,
   where the tab that made it lives. */
export function machineState(m) {
  const def = defOf(m);
  if (m.running || m.charges > 0 || m.torque > 0) return 'RUNNING';
  /* A DRIVETRAIN OR STRUCTURAL MACHINE IS NOT A PROCESSOR, and the clause
     below cannot say anything true about one. A hub, a crank, a gear and an
     axle have no `ports` and no `recipes` at all, so they fell through to
     "empty buffer, therefore BLOCKED" -- which read as a red alarm on a hub
     doing exactly what a hub does. The Phase 9 map is what made it visible
     (every hub in a working chain drawn in the colour of a fault); the tab
     has been saying it since the drivetrain landed. `m.torque > 0` above
     already catches one that is actively turning, so what is left here is
     honestly IDLE.

     PHASE 10c, FINDINGS #15's second instance: a receiver -- the Cloud Dock,
     the altar -- carries `ports` (a `mode:'in'` catch for cargo) and no
     `recipes`, so the ORIGINAL "no ports AND no recipes" clause still fell
     through to BLOCKED on an empty buffer, a red alarm on a dock that has
     simply not been fed yet. Dropping the `ports` check on its own would
     overshoot, though: `talos_head`/`cyclops_maw` ALSO have `ports` (a
     fuel intake) and no `recipes` -- they are active miners, not receivers,
     and their `mine:{}` block is what says so, so their fuel/stalled reading
     below must stay reachable. The clause that is actually true of every
     structural-or-receiver machine and false of every active one is "no
     recipes AND no mine job" -- verified against every row in
     `data/machines.js`: the only rows with `recipes:[]` and no `mine` are
     the drivetrain parts (already IDLE before this change) and the two
     receivers this change is for. */
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
    drawText(g, 'NOTHING PLACED', x, ry, DIM, 1, 1);
    return;
  }

  drawText(g, 'MACHINE', x, ry, DIM, 1, 1);
  drawText(g, 'STATE', x + Math.max(60, w - 90), ry, DIM, 1, 1);
  drawText(g, 'DEPTH', x + w - 28, ry, DIM, 1, 1);
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
    drawText(g, ds, x + w - textWidth(ds), ry, DIM, 1, 1);
    ry += 9;
  }
  if (machines.length > shown.length)
    drawText(g, `+${machines.length - shown.length} MORE`, x, ry, DIM, 1, 1);
}
