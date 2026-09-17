/* shell layer — keyboard and pointer. Writes `cmd`, `wants` and `flags`, which
   are all `rules` and `view` see of the input devices. */

import { VIEW, stage } from '../core/canvas.js';
import { AIR, F } from '../data/forms.js';
import { aim, write as aw } from '../model/aim.js';
import { write as dqw } from '../model/digqueue.js';
import { push as journalPush } from '../model/journal.js';
import { feedTarget, machineAt } from '../model/machines.js';
import { invCount, run } from '../model/run.js';
import { tileAt } from '../model/tiles.js';
import { bandAt, tileX, tileY, worldX, worldY } from '../model/world.js';
import { drawn as uiDrawn } from '../view/ui/state.js';
import { slotForDigit } from '../view/ui/quickbar.js';
import { MAP_ZOOM, mapClamp, mapView } from '../view/overview.js';
import { audio, unlockAudio } from './audio.js';
import {
  KEYMAP, armPlace, clearArmedPlace, clearLink, closeMenu, closeTop, isOpen, mapDragEnd,
  mapDragStart, mapDragTo, mapMoveTo, mapPark, mapScroll, menuMove, menuPage, menuScrollTo,
  openMenu, setMapZoom, setMenuSeed, setMenuSeedFocus, setSearch, setSearchFocus,
  toggleMapFollow, toggleMapLayer, top, toggle, ui
} from './ui.js';

/* The command set the rules read. One object, mutated by property. `craft` and
   `craftId` are holds, so they are absent from `clearEdges()`; no key writes
   `craftId` — `shell/main.js#step` folds in the craft queue's head. */
export const cmd = {
  left: false, right: false, up: false, down: false,
  hop: false, dig: false, place: false, craft: false, craftId: null, drop: false,
  deconstruct: false, link: false, action: false, collect: false,
  /* Edge-triggered, like `place`: one press hands over exactly one unit. */
  feed: false,
  mouse: false, mx: 0, my: 0, hasMouse: false,

  /* An open panel routes the pointer here instead of to `mouse`/`place`.
     `uiClick`/`uiRight` are edges; `uiDown` mirrors `cmd.mouse` for drags and
     survives `clearEdges()`; `uiWheel` is a per-frame signed delta. */
  uiClick: false, uiRight: false, uiCtrl: false, uiShift: false, uiWheel: 0, uiDown: false
};

/* One-shot intents, consumed and cleared by `shell/main.js`. `takeCard` is a
   0-based card index; `menuRow` is a row id out of `drawn.menu.rows`, an intent
   rather than a call because taking a row reaches `shell/boot.js`. */
export const wants = { restart: false, draft: null, takeCard: null, reroll: false, menuRow: null };

/* Presentation toggles, handed to `view` on the frame context. `showMap`
   freezes the substep loop in `shell/main.js` and switches `view/scene.js` to
   the overview path. */
export const flags = { showGrid: false, showChunks: false, showDebug: false, showMap: false };

const KEYS = {
  a: 'left',  arrowleft: 'left',
  d: 'right', arrowright: 'right',
  w: 'up',    arrowup: 'up',
  s: 'down',  arrowdown: 'down'
};

let hopHeld = false, dropHeld = false, deconHeld = false, linkHeld = false;

/* Mining, placing, hand-feeding and using a miracle have no key: all four are
   LMB, resolved once at `pointerdown`. `shell/ui.js#KEYMAP` is the declared
   binding set; the clauses below dispatch on literals. */
function set(k, down) {
  const key = k.toLowerCase();
  if (KEYS[key]) cmd[KEYS[key]] = down;
  if (key === ' ')                  { if (down && !hopHeld) cmd.hop = true; hopHeld = down; }
  /* Act on a placed machine within reach. A hold, not an edge: `rules/drive.js`
     supplies torque for exactly the frames it is down, so it is released on
     blur and never by `clearEdges()`. */
  if (key === 'r')                  cmd.action = down;
  /* Edge-triggered, same `*Held` latch as `hop`: a held key would empty the
     pockets a pair at a time. */
  if (key === 'q')                  { if (down && !dropHeld) cmd.drop = true; dropHeld = down; }
  /* Edge-triggered: a held key would tear down every machine the reticle
     crossed. */
  if (key === 'backspace')          { if (down && !deconHeld) cmd.deconstruct = true; deconHeld = down; }
  /* A hold: items do not auto-collect by default, so standing in a pile with
     this down sweeps it up over a few frames. */
  if (key === 'c')                  cmd.collect = down;
  /* Link two hubs into a segment. Edge-triggered: two presses are one gesture,
     arm an endpoint then choose the other. */
  if (key === 'l')                  { if (down && !linkHeld) cmd.link = true; linkHeld = down; }
}

/* The menu takes the whole keyboard and pointer, as the first branch of both
   handlers below, and swallows every unrecognised key. The verbs come from
   `shell/ui.js#KEYMAP`, so CONTROLS and this handler cannot disagree. */
const MENU_VERBS = ['menuMove', 'menuPage', 'menuSelect', 'menuBack'];

/* Lowercased `e.key` -> menu verb, built once at import. First declaration
   wins, which keeps 'a' paging rather than claimed by `move`'s row. */
const MENU_BIND = new Map();
for (const group of KEYMAP)
  for (const row of group.rows ?? [])
    if (MENU_VERBS.includes(row.id))
      for (const c of row.codes ?? []) if (!MENU_BIND.has(c)) MENU_BIND.set(c, row.id);

/* Both directional verbs run their axes the same way round, so one list covers
   "the previous one" for the cursor and for the page. */
const MENU_PREV = ['w', 'a', 'arrowup', 'arrowleft'];

/* Ten digits bounds the field, and covers `shell/boot.js#newRun`'s own
   nine-digit default seed. */
const SEED_DIGITS = 10;

/* What the menu actually drew, or null. The record carries its own `page`,
   tested against the live one, so a key cannot take a row from another page. */
const menuDrawn = () => {
  const rec = uiDrawn.menu;
  return rec && rec.page === ui.menu.page ? rec : null;
};

function menuKey(e, k) {
  /* No menu verb uses a modifier, so a browser shortcut passes through. */
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const rec = menuDrawn();
  const rows = rec ? rec.rows : [];
  e.preventDefault();

  /* Captures keys above the navigation verbs, since with the field focused 's'
     is not "move down". Digits only. */
  if (ui.menu.seedFocus) {
    if (k === 'escape' || k === 'enter') setMenuSeedFocus(false);
    else if (k === 'backspace') setMenuSeed(ui.menu.seed.slice(0, -1));
    else if (k >= '0' && k <= '9') setMenuSeed((ui.menu.seed + k).slice(0, SEED_DIGITS));
    return;
  }

  switch (MENU_BIND.get(k)) {
    case 'menuMove': menuMove(MENU_PREV.includes(k) ? -1 : 1, rows.length); break;
    /* A no-op outside CONTROLS: a page that does not page reports one page. */
    case 'menuPage':
      menuScrollTo(ui.menu.scroll + (MENU_PREV.includes(k) ? -1 : 1), rec ? rec.pages : 1);
      break;
    case 'menuSelect': {
      const row = rows.find(r => r.focused);
      if (row && row.live) wants.menuRow = row.id;
      break;
    }
    /* A sub-page returns to the root; the root closes the menu into the run
       already standing behind it. */
    case 'menuBack':
      if (ui.menu.page === 'root') closeMenu(); else menuPage('root');
      break;
  }
}

/* The tile under the pointer, in whichever band it is over, or null off the
   world. `cmd.mx`/`my` are world px, already set by `toWorld`. The pointer,
   not the reticle, which `model/aim.js` clamps to `eff('reach')`. */
function tileUnderPointer() {
  const b = bandAt(cmd.mx, cmd.my);
  return b ? { b, tx: tileX(b, cmd.mx), ty: tileY(b, cmd.my) } : null;
}

/* `paintAt` is the last tile this stroke painted, and null when no stroke is
   live, which is how the pointer handlers know the button is still down.
   `paintFull` latches the queue cap's refusal once per stroke. */
let paintAt = null, paintFull = false;

/* No `model` module imports `model/journal.js`, so the cap's refusal is the
   caller's to push. */
function markOne(b, tx, ty) {
  if (dqw.mark(b, tx, ty) !== 'full' || paintFull) return;
  paintFull = true;
  journalPush('refused', { x: worldX(b, tx), y: worldY(b, ty) }, { why: 'DIG QUEUE FULL' });
}

/* Every tile on the straight line between two pointer samples, both ends
   included, since a fast drag reports positions several tiles apart. */
function paintLine(b, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  if (!n) { markOne(b, x0, y0); return; }
  for (let i = 0; i <= n; i++)
    markOne(b, x0 + Math.round(dx * i / n), y0 + Math.round(dy * i / n));
}

function paintTo() {
  const t = tileUnderPointer();
  if (!t) return;
  if (paintAt.b !== t.b) markOne(t.b, t.tx, t.ty);
  else if (paintAt.tx !== t.tx || paintAt.ty !== t.ty)
    paintLine(t.b, paintAt.tx, paintAt.ty, t.tx, t.ty);
  paintAt = t;
}

const paintEnd = () => { paintAt = null; paintFull = false; };

/* The map claims its keys before `set()` runs, so no key can latch `cmd.up` on
   the way in; unrecognised keys fall through. Pan and zoom are screen px
   through `mapView.scale`, so one press moves the same distance at any zoom. */
const MAP_PAN = 24;        // screen px per arrow/WASD press
const MAP_WHEEL_PAN = 48;  // screen px per wheel notch
const MAP_FAST = 4;        // shift multiplier

/* World px for a screen-px distance, or 0 before the map has ever drawn. */
const mapWorld = px => (mapView.active && mapView.scale > 0 ? px / mapView.scale : 0);

/* Seeds the offset from where the view actually is: `mapView.wx/wy`, the
   clamped position last drawn, while follow is on, and the clamped stored
   offset otherwise, which bounds a held pan to one press outside the world. */
function mapPan(dx, dy) {
  const m = ui.map;
  const seed = m.follow && mapView.active
    ? { x: mapView.wx, y: mapView.wy }
    : mapClamp(m.x, m.y);
  mapPark(seed.x, seed.y);
  mapScroll(dx, dy);
}

/* Zoom keeps the centre. The new scale comes from the recorded one by ratio
   rather than recomputed, so `view/overview.js` stays the only owner of that
   arithmetic. With follow on there is nothing to re-anchor. */
function mapZoomBy(dir) {
  const i = MAP_ZOOM.indexOf(mapView.zoom);
  const next = MAP_ZOOM[Math.max(0, Math.min(MAP_ZOOM.length - 1, (i < 0 ? 0 : i) + dir))];
  if (next === mapView.zoom) return;
  if (!ui.map.follow && mapView.scale > 0) {
    const s2 = mapView.scale * (next / mapView.zoom);
    const cx = mapView.wx + mapView.vw / mapView.scale / 2;
    const cy = mapView.wy + mapView.vh / mapView.scale / 2;
    mapPark(cx - mapView.vw / s2 / 2, cy - mapView.vh / s2 / 2);
  }
  setMapZoom(next);
}

/* A digit toggles the Nth layer in `ui.map.layers`' key order, which the legend
   also iterates. Every digit is swallowed whether or not a layer sits there. */
function mapDigit(k) {
  const i = '1234567890'.indexOf(k);
  if (i < 0) return false;
  const ids = Object.keys(ui.map.layers);
  if (ids[i]) toggleMapLayer(ids[i]);
  return true;
}

function mapKey(k, shift) {
  const step = mapWorld(MAP_PAN) * (shift ? MAP_FAST : 1);
  switch (k) {
    case 'w': case 'arrowup':    mapPan(0, -step); return true;
    case 's': case 'arrowdown':  mapPan(0,  step); return true;
    case 'a': case 'arrowleft':  mapPan(-step, 0); return true;
    case 'd': case 'arrowright': mapPan( step, 0); return true;
    case '=': case '+': case ']': mapZoomBy(1);  return true;
    case '-': case '_': case '[': mapZoomBy(-1); return true;
    case 'f': toggleMapFollow(); return true;
    default: return mapDigit(k);
  }
}

export function installInput() {
  if (typeof addEventListener !== 'function') return;

  addEventListener('keydown', e => {
    unlockAudio();

    const k = e.key.toLowerCase();

    /* Above everything, including the draft modal below. */
    if (ui.menu.open) { menuKey(e, k); return; }

    /* The draft claims the whole keyboard above the search field and the map,
       and swallows everything but 1/2/3 and 'r'. Escape is deliberately not a
       way out: an un-taken permanent gift is unrecoverable. */
    if (isOpen('draft')) {
      const card = '123'.indexOf(k);
      if (card >= 0) wants.takeCard = card;
      if (k === 'r') wants.reroll = true;
      e.preventDefault();
      return;
    }

    /* Captured here rather than in `set()`, so it pre-empts every binding
       except the draft and a typed search string cannot also walk the player
       into a wall. Unrecognised keys are swallowed. */
    if (ui.searchFocus) {
      /* Escape blurs and pops the panel under it in one press; Enter blurs
         only, since it commits a search rather than meaning "leave". */
      if (e.key === 'Escape') {
        setSearchFocus(false);
        if (isOpen(top())) closeTop();
        clearArmedPlace();
        clearLink();
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') { setSearchFocus(false); e.preventDefault(); return; }
      if (e.key === 'Backspace') { setSearch(ui.search.slice(0, -1)); e.preventDefault(); return; }
      if (e.key.length === 1) { setSearch((ui.search + e.key).slice(0, 20)); e.preventDefault(); return; }
      e.preventDefault();
      return;
    }

    /* Claimed before `set()` runs; Escape leaves the mode. */
    if (flags.showMap) {
      if (k === 'escape') { flags.showMap = false; e.preventDefault(); return; }
      if (mapKey(k, e.shiftKey)) { e.preventDefault(); return; }
    }

    set(e.key, true);
    if (k === 'g') flags.showGrid   = !flags.showGrid;
    if (k === 'h') flags.showDebug  = !flags.showDebug;
    if (k === 'e') toggle('main');
    /* Escape escalates, one step per press: the panel stack pops its top entry,
       then an armed pair cancels, and only with nothing standing does the menu
       open. `claimed` and `armed` are read before anything is cleared. */
    if (k === 'escape') {
      const claimed = isOpen(top());
      const armed = !!ui.armedPlace || !!ui.linkFrom;
      if (claimed) closeTop();
      clearArmedPlace();
      clearLink();
      if (!claimed && !armed) openMenu('root');
      e.preventDefault();
    }
    /* Escape's middle step without touching the panel stack, so a selection
       can be dropped with a panel still open. */
    if (k === 'z') { clearArmedPlace(); clearLink(); }
    if (k === 'o') flags.showMap    = !flags.showMap;
    if (k === 'm') audio.muted = !audio.muted;
    
    /* Every "spawn a tier from nothing" path is behind `flags.showDebug`. */
    if (flags.showDebug) {
      if (k === 't') wants.draft = 'trinket';
      if (k === 'b') wants.draft = 'boon';
      if (k === 'k') wants.draft = 'grant';
      if (k === 'y') wants.draft = 'miracle';
      if (k === 'p') flags.showChunks = !flags.showChunks;
    }

    /* A digit arms that quickbar slot's pair through `slotForDigit`, the same
       mapping the cell glyphs are drawn from. Any occupied slot arms with no
       form gate, and the click-to-arm branch in `shell/main.js` matches. */
    const qslot = slotForDigit(k);
    if (qslot >= 0) {
      const slot = run.inv[run.mainSlots + qslot];
      if (slot && slot.sub != null) armPlace(slot.sub, slot.form);
    }

    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k))
      e.preventDefault();
  });

  addEventListener('keyup', e => set(e.key, false));

  /* Losing focus releases everything, or a key down at the tab change stays
     down forever. */
  addEventListener('blur', () => {
    for (const k of ['left', 'right', 'up', 'down', 'dig', 'place', 'feed', 'craft', 'action', 'collect', 'mouse', 'uiClick', 'uiRight', 'uiDown'])
      cmd[k] = false;
    cmd.craftId = null;
    cmd.uiCtrl = false; cmd.uiShift = false; cmd.uiWheel = 0;
    hopHeld = false; dropHeld = false; deconHeld = false; linkHeld = false;
    mapDragEnd();
    paintEnd();
  });

  const cv = stage.cv;
  if (!cv) return;

  /* Pointer position in world px: the canvas is upscaled by CSS, so dividing
     by `VIEW.scale` maps a screen pixel back to a world one. The camera comes
     from `shell/main.js`. */
  const toWorld = (e, cam) => {
    const r = cv.getBoundingClientRect();
    cmd.mx = cam.x + (e.clientX - r.left) / VIEW.scale;
    cmd.my = cam.y + (e.clientY - r.top) / VIEW.scale;
    cmd.hasMouse = true;
  };
  pointer.toWorld = toWorld;

  /* Pointer position in the screen space `view/ui/state.js#drawn` records its
     rectangles in: `toWorld` above, minus the camera offset it adds. */
  const toScreen = e => {
    const r = cv.getBoundingClientRect();
    return { sx: (e.clientX - r.left) / VIEW.scale, sy: (e.clientY - r.top) / VIEW.scale };
  };

  const inRect = (r, sx, sy) => sx >= r.x && sx < r.x + r.w && sy >= r.y && sy < r.y + r.h;

  /* The two controls drawn with no panel open: the quickbar and its KEYS
     toggle. A click on either needs the same "cannot also dig through" gate
     `isOpen(top())` gives a control in a panel, against the real rects. */
  const onAlwaysOnUi = e => {
    const { sx, sy } = toScreen(e);
    const p = uiDrawn.panels.find(p => p.id === 'hints-toggle');
    const q = uiDrawn.grids.find(g => g.id === 'quickbar');
    return (!!p && inRect(p, sx, sy)) || (!!q && inRect(q, sx, sy));
  };

  /* Two ids, one hit-test: `view/hud.js#endScreen` records `'death-restart'`
     on death and `'win-restart'` on a win, and the `run.dead || run.won` gate
     is what stops a stale rect from a previous frame firing. */
  const onEndRestart = e => {
    if (!run.dead && !run.won) return false;
    const { sx, sy } = toScreen(e);
    const p = uiDrawn.panels.find(p => p.id === 'death-restart' || p.id === 'win-restart');
    return !!p && sx >= p.x && sx < p.x + p.w && sy >= p.y && sy < p.y + p.h;
  };

  /* A click on the band ruler jumps to that band, centred rather than pinned
     to its top edge. The rect carries its own world range, and the hit area is
     wider than the 6 px bar because nothing else at that edge is clickable. */
  const mapRulerJump = (sx, sy) => {
    const p = uiDrawn.panels.find(p =>
      typeof p.id === 'string' && p.id.startsWith('map-ruler-band-') &&
      sx >= p.x - 4 && sx < p.x + p.w + 12 && sy >= p.y && sy < p.y + p.h);
    if (!p || p.wy0 == null) return false;
    mapMoveTo(mapView.wx, (p.wy0 + p.wy1) / 2 - mapWorld(mapView.vh) / 2);
    return true;
  };

  cv.addEventListener('pointermove', e => {
    /* `toWorld` still runs in map mode: `cmd.mx`/`my` are the frame's mouse
       position for `view`, and the overview's hover layer subtracts the frozen
       camera back off it to recover this screen point. */
    toWorld(e, pointer.cam);
    if (flags.showMap && ui.map.drag) {
      const { sx, sy } = toScreen(e);
      mapDragTo(sx, sy, mapView.scale);
    }
    if (paintAt) paintTo();
  });
  cv.addEventListener('pointerdown', e => {
    unlockAudio();
    toWorld(e, pointer.cam);

    /* The menu takes the pointer first: a press on a live row takes it, and a
       press on the wash or on a dead row does nothing rather than falling
       through to the world under it. */
    if (ui.menu.open) {
      const { sx, sy } = toScreen(e);
      const rec = menuDrawn();
      const row = rec && rec.rows.find(r => inRect(r, sx, sy));
      if (row && row.live) wants.menuRow = row.id;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    /* The map takes the pointer above the world too: a press on the ruler
       jumps, a press anywhere else drags the map. */
    if (flags.showMap) {
      const { sx, sy } = toScreen(e);
      if (!mapRulerJump(sx, sy)) mapDragStart(sx, sy, mapView.wx, mapView.wy);
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    /* Checked before everything below, so a click on the end-screen restart
       button is never also a same-press mine or place. */
    if (onEndRestart(e)) {
      wants.restart = true;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    /* An open panel routes to the UI intents instead of the gameplay ones, so
       a click meant for a slot cannot dig or place through to the world. */
    if (isOpen(top()) || onAlwaysOnUi(e)) {
      if (e.button === 2) cmd.uiRight = true; else { cmd.uiClick = true; cmd.uiDown = true; }
      cmd.uiCtrl = e.ctrlKey || e.metaKey;
      cmd.uiShift = e.shiftKey;
    /* A right-click on a placed machine deconstructs instead of placing, by
       setting the same edge flag `Backspace` does. `aim` is read rather than
       re-resolved; open ground falls through to `cmd.place` below. */
    } else if (e.button === 2 && aim.valid && aim.band && machineAt(aim.band, aim.tx, aim.ty)) {
      cmd.deconstruct = true;
    } else if (e.button === 2) {
      cmd.place = true;
    } else {
      /* Decided once at pointerdown, not per frame of a held press: if this
         press means place or feed, `cmd.mouse` stays false for the whole hold,
         so mining cannot start on the tile just placed. */
      const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
        ? ui.armedPlace : null;
      if (armed && armed.form === F.phial && aim.valid && aim.band) {
        aw.mode('place');                 // rule 1: a miracle armed wins
        cmd.place = true;
      } else if (feedTarget(armed)) {
        aw.mode('place');                 // rule 2: a reachable machine that wants it
        cmd.feed = true;
      } else if (armed && aim.valid && aim.band && tileAt(aim.band, aim.tx, aim.ty) === AIR) {
        aw.mode('place');                 // rule 3: open ground, something armed
        cmd.place = true;
      } else {
        aw.mode('dig');                   // rule 4: mine
        cmd.mouse = true;
        /* Only rule 4 arms a paint stroke, and the press marks nothing: a
           stroke starts on the first `pointermove` that leaves this tile. */
        paintAt = tileUnderPointer();
        paintFull = false;
      }
    }
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener('pointerup', e => {
    paintEnd();
    if (ui.menu.open) return;
    if (flags.showMap) { mapDragEnd(); return; }
    if (isOpen(top()) || onAlwaysOnUi(e)) {
      if (e.button === 2) cmd.uiRight = false; else { cmd.uiClick = false; cmd.uiDown = false; }
    } else if (e.button === 2) { cmd.place = false; cmd.deconstruct = false; } else cmd.mouse = false;
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  /* A press released outside the canvas must release here, or the map stays
     stuck to the cursor. */
  cv.addEventListener('pointerleave', () => {
    cmd.hasMouse = false; cmd.mouse = false;
    mapDragEnd();
    paintEnd();
  });

  /* Wheel scrolls a panel's grid; routed and preventDefault'd only while a
     panel is open. `cmd.uiWheel` is a per-frame delta, zeroed in
     `clearEdges()`. */
  cv.addEventListener('wheel', e => {
    /* The map scrolls, and ctrl-wheel zooms, which is also how a trackpad
       pinch arrives. */
    if (flags.showMap) {
      const dir = Math.sign(e.deltaY);
      if (e.ctrlKey || e.metaKey) mapZoomBy(-dir);
      else if (e.shiftKey) mapPan(mapWorld(MAP_WHEEL_PAN) * dir, 0);
      else mapPan(0, mapWorld(MAP_WHEEL_PAN) * dir);
      e.preventDefault();
      return;
    }
    if (!isOpen(top())) return;
    cmd.uiWheel += Math.sign(e.deltaY);
    e.preventDefault();
  }, { passive: false });
}

/* The camera the pointer maps against. `shell/main.js` points this at its own
   camera object once, rather than this file importing the loop. */
export const pointer = { cam: { x: 0, y: 0 }, toWorld: null };

/* Called once per frame after the rules have read the command set. */
export function clearEdges() {
  cmd.hop = false;
  cmd.place = false;
  cmd.feed = false;
  cmd.drop = false;
  cmd.deconstruct = false;
  cmd.link = false;
  /* A pointer held down fires no repeat event, so clearing these every frame
     regardless of button state still leaves one true frame per press. */
  cmd.uiClick = false;
  cmd.uiRight = false;
  cmd.uiWheel = 0;
  wants.restart = false;
  wants.draft = null;
  wants.takeCard = null;
  wants.reroll = false;
  wants.menuRow = null;
}
