/* LAYER shell — KEYBOARD AND POINTER. Imports `core`, `model` (read), `view`
   (read, the drawn-rect registry only) and `shell`.

   `hop` and `place` are EDGE-TRIGGERED, because a held key must not
   repeat-fire: a held space bar turned a one-tile hop into flight, and a held
   place key emptied the pockets into a wall in half a second. `clearEdges()`
   runs once per frame AFTER the rules read them, which is why the flag lives
   here rather than on the key state.

   Audio unlocks from the first gesture, on both paths, because browsers refuse
   to start an AudioContext before one. */

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

/* The command set the rules read. One object, mutated by property. `craft` is
   a HOLD, like `dig`, accumulated while true and forgotten the instant it is
   not. `craftId` is WHICH recipe that hold is on, or null for "whatever the
   hands can make" -- also a hold, so absent from `clearEdges()`. No key
   writes it; the CRAFTING queue is the source and `shell/main.js#step` folds
   its head in. Declared here anyway, because this object is the whole of what
   `rules` may see of the input. */
export const cmd = {
  left: false, right: false, up: false, down: false,
  hop: false, dig: false, place: false, craft: false, craftId: null, drop: false,
  deconstruct: false, link: false, action: false, collect: false,
  /* EDGE-TRIGGERED, like `place`: one press hands over exactly ONE unit, so a
     player can count what they gave. A hold at 120 Hz is what made the
     automatic proximity drain unreadable. */
  feed: false,
  mouse: false, mx: 0, my: 0, hasMouse: false,

  /* An open panel captures input: the pointer handlers route to THESE fields
     instead of `mouse`/`place`, so a click on a slot can never also place a
     tile in the world under the panel.

     `uiClick`/`uiRight` are EDGE, cleared every frame regardless of button
     state, which answers "was this clicked" but not "is it still down". A drag
     needs the second question, so `uiDown` mirrors `cmd.mouse` instead and is
     untouched by `clearEdges()`. `uiWheel` is a per-FRAME signed delta, so a
     fast scroll is not dropped. */
  uiClick: false, uiRight: false, uiCtrl: false, uiShift: false, uiWheel: 0, uiDown: false
};

/* One-shot intents, consumed and cleared by `shell/main.js`. Separate from
   `cmd` because these are requests to the shell, not movement. `draft`
   REQUESTS an offer of a tier; `takeCard` is the 0-based index taken;
   `reroll` asks for a second look, and the last two are the only intents
   dispatched while the run is frozen behind the modal.

   `menuRow` is the row id a key or click took, out of `drawn.menu.rows`. An
   intent rather than a direct call, because taking a row reaches
   `shell/boot.js`, which imports THIS file -- a cycle inside `shell`. */
export const wants = { restart: false, draft: null, takeCard: null, reroll: false, menuRow: null };

/* Presentation toggles, handed to `view` on the frame context because `view`
   may not import `shell`. `showMap` freezes the substep loop in
   `shell/main.js` and switches `view/scene.js` to the overview path. */
export const flags = { showGrid: false, showChunks: false, showDebug: false, showMap: false };

const KEYS = {
  a: 'left',  arrowleft: 'left',
  d: 'right', arrowright: 'right',
  w: 'up',    arrowup: 'up',
  s: 'down',  arrowdown: 'down'
};

let hopHeld = false, dropHeld = false, deconHeld = false, linkHeld = false;

/* THE LIVE BINDING SET, stated once rather than reconstructed from the
   `if (key === ...)` clauses below:
     wasd/arrows move · space hop · e main panel · q drop
     backspace deconstruct · r hold to act on a machine · c hold to collect
     l link/unlink two hubs · g/h overlays · o map · m mute
     z cancel a selection · Escape close, then cancel, then the menu
     digits arm that quickbar slot · t/b/k/y/p behind `flags.showDebug`
   While an offer stands, 1/2/3 take a card and r rerolls, and every other key
   is swallowed. Mining, placing, hand-feeding and using a miracle have no key
   at all: all four are LMB, resolved once at `pointerdown`. */
function set(k, down) {
  const key = k.toLowerCase();
  if (KEYS[key]) cmd[KEYS[key]] = down;
  if (key === ' ')                  { if (down && !hopHeld) cmd.hop = true; hopHeld = down; }
  /* ACT on a placed machine within reach, today only a crank. A generic verb
     rather than a crank-specific one. A HOLD and deliberately NOT an edge:
     the design is that the player stands there holding it, so the
     repeat-fire warning does not apply -- `rules/drive.js` supplies torque
     for exactly the frames it is down. Released on blur, and NOT in
     `clearEdges()`, which would turn a hold into an edge. */
  if (key === 'r')                  cmd.action = down;
  /* EDGE-TRIGGERED, same `*Held` latch as `hop`: a held drop would empty the
     pockets a pair at a time as fast as a held place emptied them into a
     wall. */
  if (key === 'q')                  { if (down && !dropHeld) cmd.drop = true; dropHeld = down; }
  /* The inverse of placement, edge-triggered for the same reason: a held key
     would tear down every machine the reticle crossed. */
  if (key === 'backspace')          { if (down && !deconHeld) cmd.deconstruct = true; deconHeld = down; }
  /* COLLECT: a HOLD, like `craft` and `action`. Items do not auto-collect by
     default, so standing in a pile with this held sweeps it up over a couple
     of frames. */
  if (key === 'c')                  cmd.collect = down;
  /* LINK two hubs into a segment. Edge-triggered, or a held key would lay and
     cut the same cable sixty times a second. Two presses are ONE gesture --
     arm an endpoint, then choose the other -- which is why the second must be
     a second physical press and not frame 2 of the first. */
  if (key === 'l')                  { if (down && !linkHeld) cmd.link = true; linkHeld = down; }
}

/* THE MENU TAKES THE WHOLE KEYBOARD AND POINTER, as the first branch of both
   handlers below, above even the draft modal. The run is frozen behind it and
   it covers the screen, so nothing under it can mean anything. Every
   unrecognised key is swallowed, because a stray 'g' toggling an overlay the
   player cannot see is worse than a dropped keystroke.

   The four verbs come from `shell/ui.js#KEYMAP` rather than key literals, so
   the CONTROLS page and the handler that obeys it cannot disagree. The rest of
   this file still dispatches on literals. */
const MENU_VERBS = ['menuMove', 'menuPage', 'menuSelect', 'menuBack'];

/* Lowercased `e.key` -> the menu verb it means. Built once at import; `KEYMAP`
   is frozen. First declaration wins, which is what keeps 'a' paging rather
   than being claimed by `move`'s own row. */
const MENU_BIND = new Map();
for (const group of KEYMAP)
  for (const row of group.rows ?? [])
    if (MENU_VERBS.includes(row.id))
      for (const c of row.codes ?? []) if (!MENU_BIND.has(c)) MENU_BIND.set(c, row.id);

/* Both directional verbs run their two axes the same way round, so one list
   covers "the previous one" for the cursor and for the page. */
const MENU_PREV = ['w', 'a', 'arrowup', 'arrowleft'];

/* Ten digits covers every seed the game can pick for itself --
   `shell/boot.js#newRun`'s default is `(Math.random() * 1e9) | 0`, which is
   nine -- and bounds the field against a held key. */
const SEED_DIGITS = 10;

/* What the menu actually drew, or null. The record carries its own `page`,
   tested against the live one, so a key cannot take a CONTROLS row while the
   DEBUG page shows. Row indices are never recomputed here. */
const menuDrawn = () => {
  const rec = uiDrawn.menu;
  return rec && rec.page === ui.menu.page ? rec : null;
};

function menuKey(e, k) {
  /* A browser shortcut passes through untouched. No menu verb uses a modifier,
     and swallowing ctrl/cmd here would take reload with it. */
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const rec = menuDrawn();
  const rows = rec ? rec.rows : [];
  e.preventDefault();

  /* Captures keys above the navigation verbs, because with the field focused
     's' is not "move down". Digits only. */
  if (ui.menu.seedFocus) {
    if (k === 'escape' || k === 'enter') setMenuSeedFocus(false);
    else if (k === 'backspace') setMenuSeed(ui.menu.seed.slice(0, -1));
    else if (k >= '0' && k <= '9') setMenuSeed((ui.menu.seed + k).slice(0, SEED_DIGITS));
    return;
  }

  switch (MENU_BIND.get(k)) {
    case 'menuMove': menuMove(MENU_PREV.includes(k) ? -1 : 1, rows.length); break;
    /* Paging is the CONTROLS table's only movement, and a no-op everywhere
       else because a page that does not page reports one page. */
    case 'menuPage':
      menuScrollTo(ui.menu.scroll + (MENU_PREV.includes(k) ? -1 : 1), rec ? rec.pages : 1);
      break;
    case 'menuSelect': {
      const row = rows.find(r => r.focused);
      if (row && row.live) wants.menuRow = row.id;
      break;
    }
    /* ESC is BACK, THEN PLAY, which is `KEYMAP`'s own label for it: a sub-page
       returns to the root, and the root closes the menu into the run already
       standing behind it. */
    case 'menuBack':
      if (ui.menu.page === 'root') closeMenu(); else menuPage('root');
      break;
  }
}

/* A drag that started on LMB rule 4 paints; one that started on rules 1-3
   does not. Which rule fired is decided once at `pointerdown`, and `paintAt`
   is set in that one branch, so a press that meant "place" or "feed" cannot
   become a paint stroke by moving the mouse. The POINTER, not the reticle:
   `model/aim.js` is clamped to `eff('reach')` and the point of painting is
   marking well past where you stand. */

/* The tile under the pointer, in whichever band it is over, or null off the
   world. `cmd.mx`/`my` are WORLD px and `toWorld` has already set them. */
function tileUnderPointer() {
  const b = bandAt(cmd.mx, cmd.my);
  return b ? { b, tx: tileX(b, cmd.mx), ty: tileY(b, cmd.my) } : null;
}

/* `paintAt` is the last tile this stroke painted, null when no stroke is
   live, which is also how the pointer handlers know the button is still down.
   `paintFull` is a once-per-stroke latch on the cap's refusal, so a 256-tile
   drag into a full queue says so once rather than 256 times. */
let paintAt = null, paintFull = false;

/* `model/digqueue.js` cannot push the row itself, because no `model` module
   imports `model/journal.js`, so the cap's refusal is the caller's. */
function markOne(b, tx, ty) {
  if (dqw.mark(b, tx, ty) !== 'full' || paintFull) return;
  paintFull = true;
  journalPush('refused', { x: worldX(b, tx), y: worldY(b, ty) }, { why: 'DIG QUEUE FULL' });
}

/* Every tile on the straight line between two pointer samples, both ends
   included. A fast drag reports positions several tiles apart, and a gap in a
   painted run reads as dropped input rather than as a stroke. */
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

/* THE MAP IS A MODE, so it takes the keyboard. Nothing simulates while
   `flags.showMap` is true, so the movement keys are free to mean "scroll".
   Pre-empted BEFORE `set()` rather than layered on top: a key that latched
   `cmd.up` on the way in would still be latched on the way out. Same reason
   the digits do not also arm a quickbar slot. Unrecognised keys fall through,
   so 'o' still closes the map and 'm' still mutes.

   Pan and zoom are in SCREEN px, converted through `mapView.scale`, so one
   press moves the same visible distance at every zoom -- a fixed world-px
   step would crawl at x8. */
const MAP_PAN = 24;        // screen px per arrow/WASD press
const MAP_WHEEL_PAN = 48;  // screen px per wheel notch
const MAP_FAST = 4;        // shift multiplier

/* World px for a screen-px distance, or 0 before the map has ever drawn (there
   is no scale to divide by yet, and nothing to look at either). */
const mapWorld = px => (mapView.active && mapView.scale > 0 ? px / mapView.scale : 0);

/* Every pan seeds the offset from WHERE THE VIEW ACTUALLY IS, which fixes
   two things. `ui.map.x/y` is unrelated to the screen while FOLLOW is on, so
   seeding from `mapView.wx/wy` -- the clamped position the last frame drew --
   is what makes the handoff seamless.

   The stored offset is unclamped, because `view` owns the clamp, so holding
   pan at the world's bottom parked it thousands of px past the edge. Clamping
   the SEED through `mapClamp` bounds it to one press outside the world. Two
   presses in one frame still both count. */
function mapPan(dx, dy) {
  const m = ui.map;
  const seed = m.follow && mapView.active
    ? { x: mapView.wx, y: mapView.wy }
    : mapClamp(m.x, m.y);
  mapPark(seed.x, seed.y);
  mapScroll(dx, dy);
}

/* Zoom keeps the CENTRE, not the top-left. The new scale is derived from the
   recorded one by ratio rather than recomputed, so `view/overview.js` stays
   the only owner of that arithmetic. With FOLLOW on there is nothing to
   re-anchor, because the transform recentres every frame. */
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

/* A digit toggles the Nth layer, in `ui.map.layers`' own key order, which the
   legend also iterates -- so "press 3" and the third legend row cannot
   disagree. Every digit is swallowed whether or not a layer sits there, or it
   would arm a placement the player cannot see. */
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
    /* 'f' means only "toggle follow" here. 'r' is not claimed either and falls
       through like any unrecognised key, but `cmd.action` cannot latch
       anything while the run is frozen. */
    case 'f': toggleMapFollow(); return true;
    default: return mapDigit(k);
  }
}

export function installInput() {
  if (typeof addEventListener !== 'function') return;

  addEventListener('keydown', e => {
    unlockAudio();

    const k = e.key.toLowerCase();

    /* THE MENU IS ABOVE EVERYTHING, including the draft modal below: it is the
       state the game boots into, the run is frozen behind it, and nothing else
       can be standing when it is. See `menuKey`'s own header. */
    if (ui.menu.open) { menuKey(e, k); return; }

    /* The draft modal claims the whole keyboard, above the search field and the
       map, because it is the topmost thing the game can raise. FIRST, not
       merely early: with the search field focused when a trial pays, it
       swallowed 1/2/3/r into the search string and let Escape pop the modal
       off the stack. 1/2/3 take a card, 'r' asks for a second look, and every
       other key is swallowed.

       Escape is deliberately NOT a way out, the one place this differs from
       every other panel here. An un-taken permanent gift is unrecoverable, so
       it must not be losable to a reflex keypress. */
    if (isOpen('draft')) {
      const card = '123'.indexOf(k);
      if (card >= 0) wants.takeCard = card;
      if (k === 'r') wants.reroll = true;
      e.preventDefault();
      return;
    }

    /* The search field is captured HERE rather than inside `set()`, because it
       must pre-empt every binding except the draft modal -- a typed search
       string must not also walk the player into a wall. Only one thing owns
       the keyboard, enforced by hand because there is no DOM input to
       delegate to. Unrecognised keys are swallowed rather than passed
       through. */
    if (ui.searchFocus) {
      /* Escape does BOTH in one press: blur, then pop the panel stack as it
         would have if the field had never been focused. Enter stays
         blur-only, because it commits a search rather than meaning "leave".
         'i' is deliberately not special-cased out; it is a legitimate search
         character. */
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

    /* The map claims its keys first, pre-empting `set()` rather than running
       alongside it. Escape leaves the mode. */
    if (flags.showMap) {
      if (k === 'escape') { flags.showMap = false; e.preventDefault(); return; }
      if (mapKey(k, e.shiftKey)) { e.preventDefault(); return; }
    }

    set(e.key, true);
    if (k === 'g') flags.showGrid   = !flags.showGrid;
    if (k === 'h') flags.showDebug  = !flags.showDebug;
    /* 'e' opens and closes the main panel. */
    if (k === 'e') toggle('main');
    /* ESCAPE ESCALATES, one step per press, and the menu is last:
         a raised draft    swallowed above; it means nothing at all there
         the search field  blurs and pops the panel under it, above
         the map           leaves the mode, above
         the panel stack   pops exactly the top entry
         an armed pair     cancels it, panel open or not
         nothing           opens the menu over the run

       The menu does not steal a close: `claimed` and `armed` are read BEFORE
       anything is cleared. Escape inside the menu is BACK, then PLAY. */
    if (k === 'escape') {
      const claimed = isOpen(top());
      const armed = !!ui.armedPlace || !!ui.linkFrom;
      if (claimed) closeTop();
      clearArmedPlace();
      clearLink();
      if (!claimed && !armed) openMenu('root');
      e.preventDefault();
    }
    /* The same cancel pair as Escape's middle step, but it does NOT touch the
       panel stack, so a player mid-build can drop a selection without
       closing the panel they have open. */
    if (k === 'z') { clearArmedPlace(); clearLink(); }
    /* Same edge-triggered boolean-flip idiom as `showGrid`/`showChunks`/
       `showDebug` -- a held key does not matter here, since the map is a
       mode you sit in, not an action you repeat. */
    if (k === 'o') flags.showMap    = !flags.showMap;
    if (k === 'm') audio.muted = !audio.muted;
    
    /* Every "spawn a tier from nothing" path is behind `flags.showDebug` and
       nowhere else: 't' trinket, 'b' timed boon, 'k' machine grant, 'y'
       miracle phial, 'p' the chunk overlay. */
    if (flags.showDebug) {
      if (k === 't') wants.draft = 'trinket';
      if (k === 'b') wants.draft = 'boon';
      if (k === 'k') wants.draft = 'grant';
      if (k === 'y') wants.draft = 'miracle';
      if (k === 'p') flags.showChunks = !flags.showChunks;
    }

    /* A digit does what a click on that quickbar slot does: arm its pair for
       the next placement. Through `slotForDigit`, the same mapping the cell
       glyphs are drawn from, so "press 3" and "the slot showing 3" cannot
       disagree. Unconditional, because the quickbar is permanent HUD.

       Any OCCUPIED slot arms, with no form gate, because an arm has two
       consequences -- place or feed. `shell/main.js`'s click-to-arm branch
       carries the identical gate and must. Reads `run.inv` by position, so an
       occupied slot always has `n >= 1` and there is no staleness. */
    const qslot = slotForDigit(k);
    if (qslot >= 0) {
      const slot = run.inv[run.mainSlots + qslot];
      if (slot && slot.sub != null) armPlace(slot.sub, slot.form);
    }

    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k))
      e.preventDefault();
  });

  addEventListener('keyup', e => set(e.key, false));

  /* Losing focus must release everything. A key that was down when the tab
     changed stays down forever otherwise, and the player returns to a character
     walking into a wall. */
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

  /* Pointer position in WORLD pixels. The canvas is upscaled by CSS, so the
     divide by `VIEW.scale` is what maps a screen pixel back to a world one. The
     camera offset is supplied by `shell/main.js` because the camera is its. */
  const toWorld = (e, cam) => {
    const r = cv.getBoundingClientRect();
    cmd.mx = cam.x + (e.clientX - r.left) / VIEW.scale;
    cmd.my = cam.y + (e.clientY - r.top) / VIEW.scale;
    cmd.hasMouse = true;
  };
  pointer.toWorld = toWorld;

  /* Pointer position in the SCREEN space `view/ui/state.js#drawn` records its
     rectangles in: the same conversion `toWorld` above does, minus the camera
     offset it adds. Shared by the always-on-UI test, by the menu and by the
     map, which has no camera at all and could not use `toWorld`'s answer if it
     wanted to. */
  const toScreen = e => {
    const r = cv.getBoundingClientRect();
    return { sx: (e.clientX - r.left) / VIEW.scale, sy: (e.clientY - r.top) / VIEW.scale };
  };

  const inRect = (r, sx, sy) => sx >= r.x && sx < r.x + r.w && sy >= r.y && sy < r.y + r.h;

  /* THE TWO CONTROLS DRAWN WITH NO PANEL OPEN: the quickbar and its KEYS
     legend toggle (`view/ui/quickbar.js`'s own header -- "a quickbar is part of
     the permanent HUD"). A click on either needs the identical "cannot also dig
     through to the world" guarantee `isOpen(top())` gives every control inside
     a panel; without it the control is visible and a click on it falls through
     to an ordinary mine at whatever the reticle happens to be aimed at, which
     is what made a quickbar cell click-inert. The rects are the ones those
     widgets really drew, which is also how `view/hud.js`'s ruler finds the
     quickbar rather than re-deriving where it "should" be. */
  const onAlwaysOnUi = e => {
    const { sx, sy } = toScreen(e);
    const p = uiDrawn.panels.find(p => p.id === 'hints-toggle');
    const q = uiDrawn.grids.find(g => g.id === 'quickbar');
    return (!!p && inRect(p, sx, sy)) || (!!q && inRect(q, sx, sy));
  };

  /* `view/hud.js#endScreen` draws the button and registers its rect into
     `drawn.panels`, the same idiom `onAlwaysOnUi` uses for the hints toggle.

     Two ids, one hit-test: death records `'death-restart'`, win records
     `'win-restart'`, and the gate is `run.dead || run.won`, so a stale id
     from a previous frame cannot fire. One function rather than two, because
     a second copy would be a second place to forget that gate. */
  const onEndRestart = e => {
    if (!run.dead && !run.won) return false;
    const { sx, sy } = toScreen(e);
    const p = uiDrawn.panels.find(p => p.id === 'death-restart' || p.id === 'win-restart');
    return !!p && sx >= p.x && sx < p.x + p.w && sy >= p.y && sy < p.y + p.h;
  };

  /* A click on the band ruler jumps to that band, CENTRED rather than pinned
     to its top edge -- a band shorter than the viewport would otherwise show
     mostly the band after it. The rect carries its own world range, so
     nothing here re-derives which band was hit.

     The hit area is wider than the bar, because the bar is 6 px at the very
     edge of the canvas and nothing else there is clickable. */
  const mapRulerJump = (sx, sy) => {
    const p = uiDrawn.panels.find(p =>
      typeof p.id === 'string' && p.id.startsWith('map-ruler-band-') &&
      sx >= p.x - 4 && sx < p.x + p.w + 12 && sy >= p.y && sy < p.y + p.h);
    if (!p || p.wy0 == null) return false;
    mapMoveTo(mapView.wx, (p.wy0 + p.wy1) / 2 - mapWorld(mapView.vh) / 2);
    return true;
  };

  cv.addEventListener('pointermove', e => {
    /* `toWorld` STILL RUNS IN MAP MODE, even though the map has no camera:
       `cmd.mx`/`my` are what `shell/main.js` hands `view` as the frame's mouse
       position, and the overview's HOVER layer subtracts the (frozen, rounded)
       camera back off it to recover this exact screen point. Skipping it would
       leave the hover reading a stale position from before the map opened. */
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

    /* THE MENU TAKES THE POINTER FIRST, for the reason `menuKey` gives about
       the keyboard: the run is frozen behind it and the menu covers the world.
       A press on a live row takes it; a press on the wash, or on a dead row
       (CONTINUE with no save), does nothing at all rather than falling through
       to the world under the menu. */
    if (ui.menu.open) {
      const { sx, sy } = toScreen(e);
      const rec = menuDrawn();
      const row = rec && rec.rows.find(r => inRect(r, sx, sy));
      if (row && row.live) wants.menuRow = row.id;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    /* THE MAP TAKES THE POINTER TOO, and it claims it above the world for the
       same reason it claims the keyboard: there is no world to dig
       or place into while the run is frozen behind a full-screen map. A press
       on the ruler jumps; a press anywhere else grabs the map and drags it. */
    if (flags.showMap) {
      const { sx, sy } = toScreen(e);
      if (!mapRulerJump(sx, sy)) mapDragStart(sx, sy, mapView.wx, mapView.wy);
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    /* THE END-SCREEN RESTART BUTTON (death or win), checked before anything
       else below -- a click on it means "restart", full stop, never a
       same-press mine or place at whatever the reticle happens to be aimed at
       underneath the screen it covers. */
    if (onEndRestart(e)) {
      wants.restart = true;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    /* An open panel captures input, routing to the UI intents instead of the
       gameplay ones, so a click meant for a slot can never also dig or place
       through to the world underneath. */
    if (isOpen(top()) || onAlwaysOnUi(e)) {
      if (e.button === 2) cmd.uiRight = true; else { cmd.uiClick = true; cmd.uiDown = true; }
      cmd.uiCtrl = e.ctrlKey || e.metaKey;
      cmd.uiShift = e.shiftKey;
    /* A right-click ON A PLACED MACHINE deconstructs it instead of placing --
       the same edge-triggered flag `Backspace` already sets and
       `shell/main.js#applyIntents` already consumes via
       `rules/placement.js#deconstruct`, from a second input source rather
       than a second implementation. `aim` is read directly (not re-resolved
       here) because it is already this frame's answer to "what tile is the
       reticle over" -- the identical value `cmd.place`'s own dispatch trusts
       one tick later. Aiming at open ground (no machine) falls through to
       the unchanged `cmd.place = true` below. */
    } else if (e.button === 2 && aim.valid && aim.band && machineAt(aim.band, aim.tx, aim.ty)) {
      cmd.deconstruct = true;
    } else if (e.button === 2) {
      cmd.place = true;
    } else {
      /* The LMB dispatch, decided ONCE here at pointerdown rather than every
         frame of a held press: if this press decides "place" or "feed",
         `cmd.mouse` is never set true for the rest of the hold, so mining
         cannot start on the tile just placed. `aim.mode` records which rule
         fired, so the reticle colour reflects it.

         Rule 2 sits above rule 3 deliberately, following RMB a dozen lines
         up -- a machine under the reticle means the machine. The cost is that
         a machine cannot be mined through while something is armed, and `z`
         clears the hand in one press. */
      const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
        ? ui.armedPlace : null;
      if (armed && armed.form === F.phial && aim.valid && aim.band) {
        aw.mode('place');                 // rule 1 -- a miracle armed always wins
        cmd.place = true;
      } else if (feedTarget(armed)) {
        aw.mode('place');                 // rule 2 -- a reachable machine that wants it
        cmd.feed = true;
      } else if (armed && aim.valid && aim.band && tileAt(aim.band, aim.tx, aim.ty) === AIR) {
        aw.mode('place');                 // rule 3 -- open ground, something armed
        cmd.place = true;
      } else {
        aw.mode('dig');                   // rule 4 -- mine, exactly as today
        cmd.mouse = true;
        /* Only rule 4 arms the paint stroke, and the press itself marks nothing:
           a stroke starts on the first `pointermove` that leaves this tile,
           so an ordinary mining click leaves no mark on the tile it is
           already breaking. */
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
  /* A drag ends when the pointer leaves too, or a press released outside the
     canvas leaves the map stuck to the cursor for the rest of the session --
     the same "losing focus must release everything" rule the `blur` handler
     above states for the keyboard. */
  cv.addEventListener('pointerleave', () => {
    cmd.hasMouse = false; cmd.mouse = false;
    mapDragEnd();
    paintEnd();
  });

  /* Wheel scrolls a panel's grid, never the page -- only routed, and only
     preventDefault'd, while a panel is open; with none open the wheel does
     whatever the browser would do anyway. `cmd.uiWheel` is a per-FRAME
     signed delta (see its declaration above), consumed and zeroed in
     `clearEdges()`. */
  cv.addEventListener('wheel', e => {
    /* THE MAP SCROLLS, AND CTRL-WHEEL ZOOMS. Ctrl is not a second binding
       invented here: a trackpad pinch arrives as exactly this event, so the
       gesture a player already makes to zoom a page zooms the map. */
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
   camera object once, rather than this file importing the loop and creating a
   cycle inside `shell`. */
export const pointer = { cam: { x: 0, y: 0 }, toWorld: null };

/* Called once per frame after the rules have read the command set. */
export function clearEdges() {
  cmd.hop = false;
  cmd.place = false;
  cmd.feed = false;
  cmd.drop = false;
  cmd.deconstruct = false;
  cmd.link = false;
  /* Same one-shot-per-physical-click trick `place` already relies on above:
     a pointer held down fires no repeat event, so clearing these every
     frame regardless of button state still leaves exactly one true frame
     per press. `uiWheel` is a per-frame delta, zeroed after being read. */
  cmd.uiClick = false;
  cmd.uiRight = false;
  cmd.uiWheel = 0;
  wants.restart = false;
  wants.draft = null;
  wants.takeCard = null;
  wants.reroll = false;
  wants.menuRow = null;
}
