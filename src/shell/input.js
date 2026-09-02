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
import { AIR, F, FORM } from '../data/forms.js';
import { aim, write as aw } from '../model/aim.js';
import { machineAt } from '../model/machines.js';
import { invCount } from '../model/run.js';
import { tileAt } from '../model/tiles.js';
import { drawn as uiDrawn } from '../view/ui/state.js';
import { slotForDigit } from '../view/ui/quickbar.js';
import { MAP_ZOOM, mapClamp, mapView } from '../view/overview.js';
import { audio, unlockAudio } from './audio.js';
import {
  armPlace, clearArmedPlace, clearLink, closeTop, isOpen, mapDragEnd, mapDragStart,
  mapDragTo, mapMoveTo, mapPark, mapScroll, setMapZoom, setSearch, setSearchFocus,
  toggleMapFollow, toggleMapLayer, top, toggle, ui
} from './ui.js';

/* The command set the rules read. One object, mutated by property, per
   docs/DEVELOPER_GUIDE.md#cross-module-mutable-state. `craft` is a HOLD, like
   `dig`, not an edge -- `rules/crafting.js` accumulates while it is true and
   forgets the bar the instant it is not. */
export const cmd = {
  left: false, right: false, up: false, down: false,
  hop: false, dig: false, place: false, craft: false, drop: false,
  deconstruct: false, miracle: false, equip: false, link: false, turn: false,
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
   key comment and `docs/FINDINGS.md`. */
export const wants = { restart: false, draft: null };

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

let hopHeld = false, placeHeld = false, dropHeld = false, deconHeld = false,
    miracleHeld = false, equipHeld = false, linkHeld = false;

function set(k, down) {
  const key = k.toLowerCase();
  if (KEYS[key]) cmd[KEYS[key]] = down;
  if (key === ' ')                  { if (down && !hopHeld) cmd.hop = true; hopHeld = down; }
  if (key === 'x' || key === 'j')   cmd.dig = down;
  if (key === 'e')                  { if (down && !placeHeld) cmd.place = true; placeHeld = down; }
  if (key === 'u')                  cmd.craft = down;
  /* 'f' to TURN a crank within reach (Phase 8f,
     docs/PLAN-gears-and-winches.md section 4.2) -- a HOLD, exactly like
     `craft` above and `dig` before it, and deliberately NOT an edge: the whole
     design is that the player must stand there holding it, so this file's
     "a held key must not repeat-fire" warning does not apply. There is nothing
     to fire; there is only a key that is either down or not, and
     `rules/drive.js` supplies torque for exactly the frames it is down.
     `f` is free: the live binding set is wasd/arrows, space, x/j, e, u, q,
     backspace, v, p, l, g, c, h, i, escape, o, m, r, the digits, and t/b/k/y
     behind `flags.showDebug`. Released on blur with the other holds below;
     NOT listed in `clearEdges()`, which would turn a hold into an edge. */
  if (key === 'f')                  cmd.turn = down;
  /* 'q' for the drop verb -- EDGE-TRIGGERED, same `*Held` latch idiom as
     `hop`/`place` above: this file's own header already records that a held
     key emptying the pockets into a wall in half a second is a bug, and a held
     drop would empty the pockets one pair at a time just as fast. */
  if (key === 'q')                  { if (down && !dropHeld) cmd.drop = true; dropHeld = down; }
  /* 'backspace' for deconstruct -- the inverse of `e`'s place,
     EDGE-TRIGGERED for the identical reason: a held key that tore down every
     machine the aim reticle crossed in half a second would be the same bug
     this file's header already warns about for `place`, running backwards. */
  if (key === 'backspace')          { if (down && !deconHeld) cmd.deconstruct = true; deconHeld = down; }
  /* 'v' to USE a held miracle -- EDGE-TRIGGERED, same idiom again: a held key
     that collapsed a whole stack of miracles into the terrain in half a second
     would be the same bug class. This is a REAL action, not a debug spawn --
     it consumes something the player already holds -- so it is NOT gated on
     `flags.showDebug`. */
  if (key === 'v')                  { if (down && !miracleHeld) cmd.miracle = true; miracleHeld = down; }
  /* 'p' to EQUIP the first held-but-unequipped trinket into the first empty
     slot -- "put on". A real action like 'v' above, not a debug spawn, so
     also ungated. */
  if (key === 'p')                  { if (down && !equipHeld) cmd.equip = true; equipHeld = down; }
  /* 'l' to LINK two hubs into a segment (Phase 8d,
     docs/PLAN-gears-and-winches.md section 4.5) -- EDGE-TRIGGERED, the same
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

     NO OVERSCROLL (Phase 9 section 2 says so in as many words). The stored
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
    /* 'f' is the crank hold in play. It is not doubled up here: this branch
       returns before `set()` ever sees the press, so `cmd.turn` cannot latch,
       and nothing is cranking anyway while the run is frozen. */
    case 'f': toggleMapFollow(); return true;
    default: return mapDigit(k);
  }
}

export function installInput() {
  if (typeof addEventListener !== 'function') return;

  addEventListener('keydown', e => {
    unlockAudio();

    /* THE CRAFTING TAB'S SEARCH FIELD (Phase 5b), captured HERE rather than
       inside `set()` below, because it must pre-empt EVERY other binding in
       this file -- 'wasd' are movement, 'e' places, 'p' equips, and a typed
       search string must not also walk the player into a wall or place a
       tile. `ui.searchFocus` is set by a click on the field itself
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

    const k = e.key.toLowerCase();

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
    if (k === 'c') flags.showChunks = !flags.showChunks;
    if (k === 'h') flags.showDebug  = !flags.showDebug;
    if (k === 'i') toggle('main');
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
    /* Same edge-triggered boolean-flip idiom as `showGrid`/`showChunks`/
       `showDebug` -- a held key does not matter here, since the map is a
       mode you sit in, not an action you repeat. */
    if (k === 'o') flags.showMap    = !flags.showMap;
    if (k === 'm') audio.muted = !audio.muted;
    if (k === 'r') wants.restart = true;

    /* Every "spawn a tier from nothing" path lives behind `flags.showDebug`
       and nowhere else: 't' trinket, 'b' the timed boon tier, 'k' the machine
       grant, 'y' a miracle phial. */
    if (flags.showDebug) {
      if (k === 't') wants.draft = 'trinket';
      if (k === 'b') wants.draft = 'boon';
      if (k === 'k') wants.draft = 'grant';
      if (k === 'y') wants.draft = 'miracle';
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

       An empty slot, a slot whose item is no longer held (spent by a craft,
       dropped, picked clean since it was assigned), or a slot holding a pair
       that could never be placed at all (dragged in, not armed by a click)
       does nothing at all -- no arm, no journal row, no error -- mirroring
       exactly what a click on that same slot would do in each of those
       cases (`shell/main.js`'s own "clicked" branch gates arming on the
       identical tile-form-or-rig check). */
    const qslot = slotForDigit(k);
    if (qslot >= 0) {
      const pair = ui.quickbar[qslot];
      if (pair && invCount(pair.sub, pair.form) > 0 &&
          (FORM[pair.form]?.tile || pair.form === F.rig || pair.form === F.phial))
        armPlace(pair.sub, pair.form);
    }

    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k))
      e.preventDefault();
  });

  addEventListener('keyup', e => set(e.key, false));

  /* Losing focus must release everything. A key that was down when the tab
     changed stays down forever otherwise, and the player returns to a character
     walking into a wall. */
  addEventListener('blur', () => {
    for (const k of ['left', 'right', 'up', 'down', 'dig', 'place', 'craft', 'turn', 'mouse', 'uiClick', 'uiRight', 'uiDown'])
      cmd[k] = false;
    cmd.uiCtrl = false; cmd.uiShift = false; cmd.uiWheel = 0;
    hopHeld = false; placeHeld = false; dropHeld = false; deconHeld = false;
    miracleHeld = false; equipHeld = false; linkHeld = false;
    mapDragEnd();
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

  /* The quickbar's KEYS/legend toggle is drawn ALWAYS, not only while a panel
     is open (`view/ui/quickbar.js`'s own header: "a quickbar is part of the
     permanent HUD"), so a click on it needs the identical "cannot also dig
     through to the world" guarantee `isOpen(top())` gives every other UI
     control below -- otherwise the button is visible but a click on it just
     falls through to an ordinary mine/place at whatever the reticle happens
     to be aimed at. Hit-tested in SCREEN space (pre-camera), matching exactly
     the space `view/ui/state.js#drawn` records rects in -- this is the same
     conversion `toWorld` below does, minus the `cam` offset it adds. */
  /* Pointer position in the SCREEN space `view/ui/state.js#drawn` records its
     rectangles in: the same conversion `toWorld` above does, minus the camera
     offset it adds. Shared by the always-on-UI test and by the map, which has
     no camera at all and could not use `toWorld`'s answer if it wanted to. */
  const toScreen = e => {
    const r = cv.getBoundingClientRect();
    return { sx: (e.clientX - r.left) / VIEW.scale, sy: (e.clientY - r.top) / VIEW.scale };
  };

  const onAlwaysOnUi = e => {
    const { sx, sy } = toScreen(e);
    const p = uiDrawn.panels.find(p => p.id === 'hints-toggle');
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
  });
  cv.addEventListener('pointerdown', e => {
    unlockAudio();
    toWorld(e, pointer.cam);

    /* THE MAP TAKES THE POINTER TOO, and it is the first branch for the same
       reason it is the first branch on the keyboard: there is no world to dig
       or place into while the run is frozen behind a full-screen map. A press
       on the ruler jumps; a press anywhere else grabs the map and drags it. */
    if (flags.showMap) {
      const { sx, sy } = toScreen(e);
      if (!mapRulerJump(sx, sy)) mapDragStart(sx, sy, mapView.wx, mapView.wy);
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
      /* LMB, D-A's three-rule dispatch (docs/PLAN-phase12.md §4.4), decided
         ONCE here at pointerdown rather than every frame of a held press: if
         this press decides "place", `cmd.mouse` is never set true for the
         rest of the hold, so mining cannot spuriously start on the tile just
         placed even if the button stays down through a later frame.
         `aim.mode` records which rule fired, through the previously-dead
         `model/aim.js#write.mode` setter, so the reticle colour
         (`view/hud.js:513`) finally reflects it. */
      const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
        ? ui.armedPlace : null;
      if (armed && armed.form === F.phial && aim.valid && aim.band) {
        aw.mode('place');                 // rule 1 -- a miracle armed always wins
        cmd.place = true;
      } else if (armed && aim.valid && aim.band && tileAt(aim.band, aim.tx, aim.ty) === AIR) {
        aw.mode('place');                 // rule 2 -- open ground, something armed
        cmd.place = true;
      } else {
        aw.mode('dig');                   // rule 3 -- mine, exactly as today
        cmd.mouse = true;
      }
    }
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener('pointerup', e => {
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
  cmd.drop = false;
  cmd.deconstruct = false;
  cmd.miracle = false;
  cmd.equip = false;
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
}
