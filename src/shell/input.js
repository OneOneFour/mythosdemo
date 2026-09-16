/* LAYER shell — KEYBOARD AND POINTER. Imports `core`, `model` (read), `view`
   (read, the drawn-rect registry only) and `shell`.

   ============================================================================
   NOTE FOR FUTURE EDITS, kept from the previous codebase because it is still
   the relevant warning: in the original mockup this module existed, was
   imported by nothing, and did not even parse. It is wired into
   `shell/main.js` now, and the test hook exercises it, so it cannot silently
   rot again.
   ============================================================================

   `hop` and `place` are EDGE-TRIGGERED. A held key must not repeat-fire: a held
   space bar that re-launched every frame turned a one-tile hop into flight, and
   a held place key emptied the pockets into a wall in half a second.
   `clearEdges()` is called once per frame AFTER the rules have read them, which
   is why the flag lives here and not on the key state.

   AUDIO IS UNLOCKED FROM THE FIRST GESTURE, on both the key and pointer paths.
   Browsers refuse to start an AudioContext before one, and the gesture is not
   ours to fake. */

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
  setMapZoom, setMenuSeed, setMenuSeedFocus, setSearch, setSearchFocus, toggleMapFollow,
  toggleMapLayer, top, toggle, ui
} from './ui.js';

/* The command set the rules read. One object, mutated by property, per
   docs/DEVELOPER_GUIDE.md#cross-module-mutable-state. `craft` is a HOLD, like
   `dig`, not an edge -- `rules/crafting.js` accumulates while it is true and
   forgets the bar the instant it is not.

   `craftId` is WHICH recipe that hold is on: a `data/recipes.js` id, or null
   for "whatever the hands can make". It travels with `craft` and is therefore
   a HOLD too, absent from `clearEdges()` and released with the other holds on
   blur. No key writes it -- the CRAFTING panel's queue is the live source and
   `shell/main.js#step` folds its head in, the same way that function folds a
   device and a preference into `dig` and `collect`. It is declared here
   anyway, because this object is the whole of what `rules` may see of the
   input and a test naming a target needs somewhere to write it. */
export const cmd = {
  left: false, right: false, up: false, down: false,
  hop: false, dig: false, place: false, craft: false, craftId: null, drop: false,
  deconstruct: false, link: false, action: false, collect: false,
  /* THE FEED VERB (Phase 16a, docs/SPEC.md section 23.3). EDGE-TRIGGERED, the
     same shape as `place` beside it and for the same reason this file's own
     header gives: one physical press hands over exactly ONE unit, so a player
     can count what they gave. A hold at 120 Hz is precisely what made the
     automatic proximity drain (`rules/machines.js#handFeed`) unreadable.
     Set by `pointerdown`'s LMB rule 2 below, consumed and self-cleared by
     `shell/main.js#applyIntents`, and cleared by `clearEdges()` regardless. */
  feed: false,
  mouse: false, mx: 0, my: 0, hasMouse: false,

  /* UI pointer intents -- see docs/DEVELOPER_GUIDE.md#input-intents.
     THE OPEN PANEL STACK CAPTURES INPUT: the pointer handlers below route to
     THESE fields instead of `mouse`/`place` whenever `shell/ui.js#top()` is
     open, so a click on a slot can never also place a tile in the world the
     panel is sitting over.

     `uiClick`/`uiRight` are EDGE, cleared every real frame by `clearEdges()`
     regardless of button state -- correct for "was this clicked", but it
     cannot answer "is the button still down", and a DRAG needs the second
     question to tell a press-and-hold apart from a press-and-release one
     frame later. So `uiDown` mirrors `cmd.mouse`'s shape instead: true on
     pointerdown, false on pointerup, untouched by `clearEdges()`.
     `shell/main.js`'s dispatcher watches its RISING edge to pick a drag
     payload and its FALLING edge to resolve the drop.

     `uiCtrl`/`uiShift` are the modifier snapshot taken at click time.
     `uiWheel` is a per-FRAME signed delta, not one-shot -- it accumulates
     between clears so a fast scroll is not dropped. There is no drag FIELD
     here: `shell/ui.js#setDrag`/`clearDrag` already hold that payload. */
  uiClick: false, uiRight: false, uiCtrl: false, uiShift: false, uiWheel: 0, uiDown: false
};

/* One-shot intents, consumed and cleared by `shell/main.js`. Separate from
   `cmd` because these are requests to the shell, not movement. `machine`
   (the old digit-driven BUILD menu's own field) is gone along with the menu
   that set it -- placement now has exactly one path, `cmd.place`, whether
   the pair placed is a tile or a machine; see `shell/input.js`'s own digit-
   key comment and `docs/FINDINGS.md`.

   `draft` REQUESTS an offer of a tier (a debug key); `takeCard` is the
   0-based index of the card taken from the offer standing now, and `reroll`
   asks for a second look at the same tier. The three are separate fields
   rather than one because they are three different verbs, and the last two
   are the only intents `applyIntents` still dispatches while the run is
   frozen behind the modal.

   `menuRow` is the ID of the main-menu row a key or a click has taken, out of
   `view/ui/state.js#drawn.menu.rows`. It is an intent rather than a direct
   call because taking a row starts a run, loads a save or applies a scenario,
   which means `shell/boot.js`, `shell/save.js` and `rules/scenarios.js` --
   and `shell/boot.js` imports THIS file, so reaching them from here would be
   a cycle inside `shell`. `shell/main.js#applyMenuIntents` dispatches it. */
export const wants = { restart: false, draft: null, takeCard: null, reroll: false, menuRow: null };

/* Presentation toggles. Read by `view` through the frame context — `view` may
   not import `shell`, so they are passed in rather than imported. `showMap` is
   the full-world overview: `shell/main.js#frame()` reads it to freeze the
   substep loop, and `view/scene.js#render()` reads it to take the overview
   render path instead of the normal camera-relative one. */
export const flags = { showGrid: false, showChunks: false, showDebug: false, showMap: false };

const KEYS = {
  a: 'left',  arrowleft: 'left',
  d: 'right', arrowright: 'right',
  w: 'up',    arrowup: 'up',
  s: 'down',  arrowdown: 'down'
};

let hopHeld = false, dropHeld = false, deconHeld = false, linkHeld = false;

/* THE LIVE BINDING SET, per docs/PLAN-phase12.md §4.1's final keymap --
   the one place this file states it in prose
   rather than leaving it to be reconstructed from every `if (key === ...)`
   clause below: wasd/arrows (move), space (hop), e (open/close the main
   panel), q (drop), backspace (deconstruct), r (hold to act on a placed
   machine -- turn a crank), c (hold to collect), l (link/unlink two hubs),
   g/h (grid/debug overlays), o (map overview), m (mute), z (cancel a
   selection, additive to Escape), Escape (close panel / cancel selection),
   the digits (arm the quickbar slot at that index), and t/b/k/y/p behind
   `flags.showDebug` (debug drafts, and the chunk overlay). While a draft
   offer stands, 1/2/3 take a card and r rerolls it, and every other key --
   Escape included -- is swallowed; see that branch's own header. Mining, placing,
   feeding a machine by hand and using a held miracle have no dedicated key at
   all -- they are all LMB, resolved once at `pointerdown` (D-A, widened to
   four rules -- docs/SPEC.md section 23.2) -- and restart is a clickable button
   on the death screen (D-C), not a key. `x`/`j` (dig), `v` (use miracle),
   `i` (open panel) and `f` (crank) are RETIRED; `p` (equip) was retired
   and its letter reused for the chunk toggle; `u` (hand-craft) is
   RETIRED too -- the recipe-click queue already covers it with no key held
   at all, so its own hold was fully redundant (D-B). */
function set(k, down) {
  const key = k.toLowerCase();
  if (KEYS[key]) cmd[KEYS[key]] = down;
  if (key === ' ')                  { if (down && !hopHeld) cmd.hop = true; hopHeld = down; }
  /* 'r' to ACT on a placed machine within reach -- turn a crank, today's only
     such machine (Phase 8f, docs/PLAN-gears-and-winches.md section 4.2),
     renamed from `f`/`cmd.turn` per docs/PLAN-phase12.md §3 D-J: the brief
     asked for a GENERIC "hold to operate" verb, not a crank-specific one that
     happens to sit on `r`, so both the key and the field moved together. A
     HOLD, exactly like `craft` above, and deliberately NOT an edge: the whole
     design is that the player must stand there holding it, so this file's
     "a held key must not repeat-fire" warning does not apply. There is nothing
     to fire; there is only a key that is either down or not, and
     `rules/drive.js` supplies torque for exactly the frames it is down.
     `r` was restart until this relocated that onto a real death-screen
     button (D-C), shared with the win screen -- see
     `pointerdown`'s own end-restart branch below.
     Released on blur with the other holds below; NOT listed in
     `clearEdges()`, which would turn a hold into an edge. */
  if (key === 'r')                  cmd.action = down;
  /* 'q' for the drop verb -- EDGE-TRIGGERED, same `*Held` latch idiom as
     `hop` above: this file's own header already records that a held
     key emptying the pockets into a wall in half a second is a bug, and a held
     drop would empty the pockets one pair at a time just as fast. */
  if (key === 'q')                  { if (down && !dropHeld) cmd.drop = true; dropHeld = down; }
  /* 'backspace' for deconstruct -- the inverse of placement,
     EDGE-TRIGGERED for the identical reason: a held key that tore down every
     machine the aim reticle crossed in half a second would be the same bug
     this file's header already warns about for `place`, running backwards. */
  if (key === 'backspace')          { if (down && !deconHeld) cmd.deconstruct = true; deconHeld = down; }
  /* 'c' to COLLECT: a HOLD, exactly like `craft`/`action` above --
     docs/PLAN-phase12.md §3 D-E. By default items no longer auto-collect
     (`rules/items.js#step`'s pickup branch is now gated on this, folded
     with `ui.autoCollect` in `shell/main.js#step`'s narrowed command
     object); standing in a small pile with this held sweeps it up over a
     couple of frames, the same "must stand there holding it" idiom `r`'s
     own comment above already states for the crank. */
  if (key === 'c')                  cmd.collect = down;
  /* 'l' to LINK two hubs into a segment
     (docs/PLAN-gears-and-winches.md section 4.5) -- EDGE-TRIGGERED, the same
     `*Held` latch every other real verb on this list uses, and for the same
     reason this file's header already records: a held key that laid and cut
     the same cable sixty times a second would be the identical bug as a held
     place key emptying the pockets into a wall. TWO PRESSES ARE ONE GESTURE
     (arm an endpoint, then choose the other), which is exactly why the second
     press must be a second physical press and not frame 2 of the first.
     `l` is free -- the old `L` machine-spawn key was retired in `66ad0e7`. */
  if (key === 'l')                  { if (down && !linkHeld) cmd.link = true; linkHeld = down; }
}

/* ============================================================================
   THE MAIN MENU'S OWN INPUT (docs/SPEC.md section 30).

   THE MENU TAKES THE WHOLE KEYBOARD AND THE WHOLE POINTER, and it is the first
   branch of both handlers below -- above the draft modal, which is otherwise
   the topmost thing the game can raise. The run is frozen behind the menu
   (`shell/main.js#step`) and the menu covers the screen, so there is nothing
   under it for a key to mean. Every key it does not recognise is swallowed,
   for the reason the search field's branch already gives: a stray 'g' toggling
   an overlay the player cannot see is worse than a dropped keystroke.

   THE FOUR VERBS COME FROM `shell/ui.js#KEYMAP` rather than from key literals,
   so the CONTROLS page the menu draws and the handler that obeys it cannot
   disagree. The rest of this file still dispatches on key literals, which
   docs/SPEC.md section 30.3 states and does not excuse.
   ============================================================================ */
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

/* WHAT THE MENU ACTUALLY DREW, or null. The record carries its own `page` and
   it is tested against the live one, so a key can never take a CONTROLS row
   while the DEBUG page is showing (docs/SPEC.md section 30.2). Row indices are
   never recomputed here: the focused row is the one that says it is. */
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

  /* THE SEED FIELD CAPTURES KEYS, above the navigation verbs and for the same
     reason the CRAFTING search field pre-empts movement: with the field
     focused, 's' is not "move down". Digits only -- a seed is a number, and a
     field that accepted a letter would then have to reject it. */
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

/* ============================================================================
   THE DIG QUEUE'S DRAG-PAINT (docs/SPEC.md section 28, wave 6 U5).

   A DRAG THAT STARTED ON RULE 4 PAINTS; ONE THAT STARTED ON RULES 1-3 DOES
   NOT. Which rule fired is decided once at `pointerdown` (section 23.2), and
   `paintAt` is set in that one branch and nowhere else -- so a press that meant
   "place" or "feed" cannot turn into a paint stroke by moving the mouse. That
   is the same decide-once hysteresis that stops mining starting on a tile the
   press just placed.

   THE POINTER, NOT THE RETICLE. `model/aim.js` is clamped to `eff('reach')`
   (`rules/mining.js#aimAtWorld`) and U5's whole point is marking well past
   where you stand, so the tile is resolved from the pointer's own world
   position instead.
   ============================================================================ */

/* The tile under the pointer, in whichever band it is over, or null off the
   world. `cmd.mx`/`my` are WORLD px and `toWorld` has already set them. */
function tileUnderPointer() {
  const b = bandAt(cmd.mx, cmd.my);
  return b ? { b, tx: tileX(b, cmd.mx), ty: tileY(b, cmd.my) } : null;
}

/* `paintAt` is the last tile this stroke painted, and null when no stroke is
   live -- which is also how the pointer handlers know whether the button is
   still down for painting purposes. `paintFull` is a once-per-stroke latch on
   the cap's refusal, so a 256-tile drag into a full queue says so once rather
   than 256 times (docs/SPEC.md section 28.3 makes the same argument for
   granite). */
let paintAt = null, paintFull = false;

/* `model/digqueue.js` cannot push the row itself: no `model` module imports
   `model/journal.js`, so the cap's refusal is the caller's (section 28.5). */
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

/* ============================================================================
   THE OVERVIEW'S OWN INPUT (docs/BUILD_PLAN.md Phase 9 section 2).

   THE MAP IS A MODE, SO IT TAKES THE KEYBOARD. While `flags.showMap` is true
   `shell/main.js#step` returns immediately -- nothing simulates -- so the
   movement keys have nothing to move and are free to mean "scroll". They are
   pre-empted BEFORE `set()` below rather than doubled up on top of it, for the
   reason that function's own header gives: a key that latched `cmd.up` on the
   way into the map would still be latched on the way out, and the player would
   come back to a character climbing a ladder they never asked to climb. The
   same pre-emption is why the digits do not also arm a quickbar slot.

   Unrecognised keys FALL THROUGH to the ordinary handler on purpose, so 'o'
   still closes the map, 'r' still restarts and 'm' still mutes: this function
   claims the keys the map has a use for and no others.

   PAN AND ZOOM ARE MEASURED IN SCREEN PIXELS, converted to world px through
   `mapView.scale`, so one press moves the view the same visible distance at
   every zoom level -- a fixed world-px step would crawl at x8 and leap a third
   of the world at x1.
   ============================================================================ */
const MAP_PAN = 24;        // screen px per arrow/WASD press
const MAP_WHEEL_PAN = 48;  // screen px per wheel notch
const MAP_FAST = 4;        // shift multiplier

/* World px for a screen-px distance, or 0 before the map has ever drawn (there
   is no scale to divide by yet, and nothing to look at either). */
const mapWorld = px => (mapView.active && mapView.scale > 0 ? px / mapView.scale : 0);

/* EVERY PAN GOES THROUGH HERE, and it seeds the offset from WHERE THE VIEW
   ACTUALLY IS before adding the delta. Two bugs, one fix, both found by driving
   the real key events rather than by reading the code:

     HANDING OFF FROM FOLLOW. `ui.map.x/y` is whatever it was last set to, which
     while FOLLOW is on is nothing to do with what is on screen -- so the first
     manual scroll used to JUMP to a stale offset (0,0 on a fresh run) instead of
     nudging the view the player was looking at. Seeding from `mapView.wx/wy`,
     the clamped position the last frame actually drew, makes the handoff
     seamless.

     NO OVERSCROLL. The stored
     offset is deliberately unclamped -- `view` owns the clamp -- so holding the
     pan key at the bottom of the world parked it thousands of pixels past the
     edge, and it then took as many presses the other way before anything moved.
     Clamping the SEED through `view/overview.js#mapClamp` (the same `fit` the
     transform uses, not a second copy) bounds the stored value to one press
     outside the world at worst.

   Two presses inside one frame still both count: the first leaves a value
   already inside the bounds, so clamping it again is a no-op and the second adds
   to it. */
function mapPan(dx, dy) {
  const m = ui.map;
  const seed = m.follow && mapView.active
    ? { x: mapView.wx, y: mapView.wy }
    : mapClamp(m.x, m.y);
  mapPark(seed.x, seed.y);
  mapScroll(dx, dy);
}

/* ZOOM KEEPS THE CENTRE, not the top-left corner. The new scale is derived from
   the recorded one by ratio rather than recomputed from `minTile` -- one file
   owns that arithmetic (`view/overview.js`) and this is the same number it just
   used. FOLLOW ON MEANS THERE IS NOTHING TO RE-ANCHOR: the transform recentres
   on the player every frame, so parking an offset would be writing a value
   nothing reads. See `shell/ui.js#mapPark`. */
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

/* A DIGIT TOGGLES THE NTH LAYER, and the order is `ui.map.layers`' own key
   order -- the single declaration in `shell/ui.js`, which `view/overview.js`'s
   legend also iterates. One list, so "press 3" and "the third row of the
   legend" cannot disagree about which layer that is. Every digit is swallowed
   whether or not a layer sits at that index, because falling through to the
   quickbar while the world is frozen behind a full-screen map would arm a
   placement the player cannot see. */
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
    /* 'f' means only "toggle follow" here -- it stopped being doubled up with
       the crank hold once that moved to `r` (docs/PLAN-phase12.md §3 D-J).
       'r' is not claimed by this switch either; it falls through to
       `mapDigit`, then to `set()` below, exactly like every other
       unrecognised key, but `cmd.action` cannot latch anything anyway while
       the run is frozen -- nothing is cranking while the map is open. */
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

    /* THE DRAFT MODAL CLAIMS THE WHOLE KEYBOARD, above the search field and
       above the map, because it is the topmost thing the game can raise and
       the run is frozen behind it (D17-A). FIRST, and not merely early: the
       CRAFTING search field below is the only other branch that captures
       every key, and with the field focused when a trial pays it swallowed
       1/2/3/r into the search string and let Escape pop the modal off the
       stack. A raised offer outranks a text field for the same reason it
       outranks the world. 1/2/3 take a card, 'r' asks for a second look, and
       every other key is swallowed -- a stray 'e' opening the tabbed window
       UNDER a modal the player cannot leave is worse than a dropped
       keystroke.

       ESCAPE IS DELIBERATELY NOT A WAY OUT, which is the one place this
       block differs from every other panel in this file. An un-taken
       permanent gift is not recoverable, so it must not be losable to the
       key a player presses reflexively -- the offer stands until a card is
       taken. */
    if (isOpen('draft')) {
      const card = '123'.indexOf(k);
      if (card >= 0) wants.takeCard = card;
      if (k === 'r') wants.reroll = true;
      e.preventDefault();
      return;
    }

    /* THE CRAFTING TAB'S SEARCH FIELD, captured HERE rather than
       inside `set()` below, because it must pre-empt every other binding in
       this file except the draft modal above -- 'wasd' are movement, 'e'
       places, 'p' equips, and a typed search string must not also walk the
       player into a wall or place a tile. `ui.searchFocus` is set by a click on the field itself
       (`shell/main.js`'s UI dispatcher) and cleared by Enter, Escape or a
       click elsewhere -- the same "only one thing owns the keyboard" rule a
       real text input enforces, done by hand because this project has no
       DOM input element to delegate to (invariant 11: no `fillText`, and no
       markup at all under `stage.cv`). Every other key this branch does not
       recognise is swallowed, not passed through -- a stray 'g'/'h' toggling
       a debug overlay while the player is mid-sentence would be worse than
       one dropped keystroke. */
    if (ui.searchFocus) {
      /* BUG FIX: Escape used to only blur the field, stopping short of the
         `isOpen(top())` close-panel branch further down this function --
         reachable only once the field had already lost focus, i.e. after a
         SECOND press. A player who clicked into search had no single key
         that reliably left the window. Escape now does both in the one
         press it already owns: blur, then pop the panel stack exactly as it
         would have if the field had never been focused. Enter stays
         blur-only -- it commits a search, it does not mean "leave". 'i' is
         deliberately NOT special-cased out of this block: it is a legitimate
         search character (filtering for "ingot"), and the same Escape fix is
         the actual way out, not carving a hole in the search alphabet. */
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

    /* THE MAP CLAIMS ITS KEYS FIRST -- see `mapKey`'s own header for why this
       pre-empts `set()` rather than running alongside it. Escape leaves the
       mode, so a player who opened the map has the same one way out of it
       every other panel in this game has. */
    if (flags.showMap) {
      if (k === 'escape') { flags.showMap = false; e.preventDefault(); return; }
      if (mapKey(k, e.shiftKey)) { e.preventDefault(); return; }
    }

    set(e.key, true);
    if (k === 'g') flags.showGrid   = !flags.showGrid;
    if (k === 'h') flags.showDebug  = !flags.showDebug;
    /* 'e' opens/closes the main panel -- moved off `i` outright
       (docs/PLAN-phase12.md §3 D-K, one binding per verb), and off its own
       former "place" meaning, which the LMB/RMB dispatch below already
       covers redundantly (D-A). */
    if (k === 'e') toggle('main');
    /* Escape closes the TOP of the panel stack only -- a modal above the
       window (none exists yet) would close before the window under it.
       No-op on an empty stack, so Escape is otherwise free for the browser
       (leaving pointer capture, etc.) exactly as it was before this phase. */
    if (k === 'escape' && isOpen(top())) { closeTop(); e.preventDefault(); }
    /* Escape also cancels an armed placement (Part 1, click-to-arm), whether
       or not a panel happens to be open -- a player who armed a pair, then
       closed the panel to go aim, still has one visible "cancel" key. */
    /* ...and an armed link endpoint, on the same line and for the same
       reason: a player who armed one hub, then thought better of it, needs one
       visible cancel key rather than two verbs with different escapes. */
    if (k === 'escape') { clearArmedPlace(); clearLink(); }
    /* 'z' fires the identical cancel pair, ADDITIVELY (docs/PLAN-phase12.md
       §4.4 item 5): a narrower synonym for Escape's own cancel half that does
       NOT touch the panel stack, so a player mid-build can drop a selection
       without also closing whatever panel they have open. */
    if (k === 'z') { clearArmedPlace(); clearLink(); }
    /* Same edge-triggered boolean-flip idiom as `showGrid`/`showChunks`/
       `showDebug` -- a held key does not matter here, since the map is a
       mode you sit in, not an action you repeat. */
    if (k === 'o') flags.showMap    = !flags.showMap;
    if (k === 'm') audio.muted = !audio.muted;
    /* Restart used to be `r`, live at any time -- `r` is now the crank/action
       hold (D-J), so restart moved to a real clickable button on the death
       screen, and the win screen shares it: see
       `pointerdown`'s own end-restart branch below. */

    /* Every "spawn a tier from nothing" path lives behind `flags.showDebug`
       and nowhere else: 't' trinket, 'b' the timed boon tier, 'k' the machine
       grant, 'y' a miracle phial. 'p' joins this gate too (docs/PLAN-
       phase12.md §3 D-D) -- freed by retiring the equip key, and folded
       behind the same single debug gate rather than left a bare letter, per
       the brief's own suggestion. A no-op with `flags.showDebug` off. */
    if (flags.showDebug) {
      if (k === 't') wants.draft = 'trinket';
      if (k === 'b') wants.draft = 'boon';
      if (k === 'k') wants.draft = 'grant';
      if (k === 'y') wants.draft = 'miracle';
      if (k === 'p') flags.showChunks = !flags.showChunks;
    }

    /* DIGIT KEYS ARM THE MATCHING QUICKBAR SLOT.
       A digit key does exactly what a click on that quickbar slot
       already does (`shell/main.js#applyUiIntents`'s click-to-arm branch):
       arm the slot's assigned pair for the next placement. Reached through
       `view/ui/quickbar.js#slotForDigit`, the SAME digit-to-slot mapping
       that file's own `digitOf` draws each cell's glyph from, so "press 3"
       and "the slot showing 3" cannot disagree about which slot that is.
       Unconditional -- no panel gate at all -- because the
       quickbar is part of the PERMANENT HUD (`view/ui/quickbar.js`'s own
       header), the same reasoning that already made its KEYS/legend toggle
       clickable with no panel open.

       ANY OCCUPIED SLOT ARMS (Phase 16a, docs/SPEC.md section 23.1). The
       tile-form-or-rig-or-phial gate that used to be here is gone: an arm
       now has two possible consequences, not one, and every ore, ingot,
       plate and brand -- click-inert before this phase, a confirmed silent
       no-op -- is exactly what the feed verb hands over. A pair that can
       neither be placed nor fed still arms, and is inert until it is aimed
       at something; `rules/placement.js#placeTile`'s own
       'THAT DOES NOT BUILD' is what refuses it then, one press later, with a
       reason. `shell/main.js`'s click-to-arm branch carries the IDENTICAL
       gate, and must: `view/ui/quickbar.js#DIGITS`'s "press 3 and the slot
       showing 3 cannot disagree" property is only true while the two ways of
       reaching a slot accept the same slots.

       An empty slot still does nothing at all -- no arm, no journal row, no
       error. Reads `run.inv[run.mainSlots + qslot]` directly (docs/
       PLAN-phase12.md §3 D-H) -- a positioned slot, not an assignment table
       or a derived list, so there is no staleness to guard: an occupied slot
       always has `n >= 1` by construction (`write.spend` clears to `null` at
       `n <= 0`), and the old `invCount(...) > 0` check this replaced has
       nothing left to disagree with. */
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

  /* THE END-SCREEN RESTART BUTTON (docs/PLAN-phase12.md §3 D-C). Restart
     moved off `r` (now the crank/action hold, D-J) onto a real, discoverable
     control -- `view/hud.js#endScreen` draws it and registers its rect
     into `drawn.panels`, the identical idiom `onAlwaysOnUi` above already
     uses for the hints toggle.

     TWO IDS, ONE HIT-TEST: the death screen records
     `'death-restart'` and the win screen `'win-restart'`, and the gate below
     is `run.dead || run.won` -- so the id existing at all (from a stale
     previous frame) can never fire outside a frame in which one of the two
     screens is actually being drawn. Kept as one function rather than two
     because the button means the same thing on both screens, and a second
     copy would be a second place to forget the `run.*` gate. */
  const onEndRestart = e => {
    if (!run.dead && !run.won) return false;
    const { sx, sy } = toScreen(e);
    const p = uiDrawn.panels.find(p => p.id === 'death-restart' || p.id === 'win-restart');
    return !!p && sx >= p.x && sx < p.x + p.w && sy >= p.y && sy < p.y + p.h;
  };

  /* A CLICK ON THE BAND RULER JUMPS TO THAT BAND, centred rather than pinned to
     the band's top edge -- the question a click there asks is "show me that
     band", and a band shorter than the viewport pinned to its top would show
     mostly the band after it. The rect carries its own world range
     (`view/ui/ruler.js` records `wy0`/`wy1`), so nothing here re-derives which
     band a click landed on.

     THE HIT AREA IS WIDER THAN THE BAR. The bar is 6 px and the numeral column
     sits beside it, which is a 6 px target at the very edge of the canvas --
     unhittable in practice. Nothing else on the map's right edge is clickable,
     so the strip is generous on both sides of it. */
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
    /* THE OPEN PANEL STACK CAPTURES INPUT: route to the UI intents instead of
       the gameplay ones whenever a panel is open, so a click meant for a slot
       can never also dig, mine or place through to the world underneath it.
       See docs/DEVELOPER_GUIDE.md#input-intents */
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
      /* LMB, D-A's dispatch (docs/PLAN-phase12.md §4.4, widened to FOUR rules
         by Phase 16a -- docs/SPEC.md section 23.2), decided ONCE here at
         pointerdown rather than every frame of a held press: if this press
         decides "place" or "feed", `cmd.mouse` is never set true for the rest
         of the hold, so mining cannot spuriously start on the tile just
         placed even if the button stays down through a later frame.
         `aim.mode` records which rule fired, through the previously-dead
         `model/aim.js#write.mode` setter, so the reticle colour
         (`view/hud.js#reticle`) finally reflects it.

         RULE 2 SITS ABOVE RULE 3 DELIBERATELY, and the precedent is a dozen
         lines up in this same handler: RMB already puts "a machine is under
         the reticle, so deconstruct" above "place". A machine under the
         reticle means the machine. The stated cost is that a machine cannot
         be mined through while something is armed -- `z` clears the hand in
         one press, the same mitigation D-A already accepted for rule 1. */
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
        /* AND ONLY RULE 4 ARMS THE PAINT STROKE (docs/SPEC.md section 28.5).
           The press itself marks nothing: a stroke starts on the first
           `pointermove` that leaves this tile, so an ordinary mining click
           does not leave a mark behind on the tile it is already breaking. */
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
