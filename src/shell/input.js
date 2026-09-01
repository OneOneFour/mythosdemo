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
import { F, FORM } from '../data/forms.js';
import { aim } from '../model/aim.js';
import { machineAt } from '../model/machines.js';
import { invCount } from '../model/run.js';
import { drawn as uiDrawn } from '../view/ui/state.js';
import { slotForDigit } from '../view/ui/quickbar.js';
import { audio, unlockAudio } from './audio.js';
import { armPlace, clearArmedPlace, closeTop, isOpen, setSearch, setSearchFocus, top, toggle, ui } from './ui.js';

/* The command set the rules read. One object, mutated by property, per
   docs/DEVELOPER_GUIDE.md#cross-module-mutable-state. `craft` is a HOLD, like
   `dig`, not an edge -- `rules/crafting.js` accumulates while it is true and
   forgets the bar the instant it is not. */
export const cmd = {
  left: false, right: false, up: false, down: false,
  hop: false, dig: false, place: false, craft: false, drop: false,
  deconstruct: false, miracle: false, equip: false,
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
    miracleHeld = false, equipHeld = false;

function set(k, down) {
  const key = k.toLowerCase();
  if (KEYS[key]) cmd[KEYS[key]] = down;
  if (key === ' ')                  { if (down && !hopHeld) cmd.hop = true; hopHeld = down; }
  if (key === 'x' || key === 'j')   cmd.dig = down;
  if (key === 'e')                  { if (down && !placeHeld) cmd.place = true; placeHeld = down; }
  if (key === 'u')                  cmd.craft = down;
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
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') { setSearchFocus(false); e.preventDefault(); return; }
      if (e.key === 'Backspace') { setSearch(ui.search.slice(0, -1)); e.preventDefault(); return; }
      if (e.key.length === 1) { setSearch((ui.search + e.key).slice(0, 20)); e.preventDefault(); return; }
      e.preventDefault();
      return;
    }

    set(e.key, true);
    const k = e.key.toLowerCase();
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
    if (k === 'escape') clearArmedPlace();
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
          (FORM[pair.form]?.tile || pair.form === F.rig))
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
    for (const k of ['left', 'right', 'up', 'down', 'dig', 'place', 'craft', 'mouse', 'uiClick', 'uiRight', 'uiDown'])
      cmd[k] = false;
    cmd.uiCtrl = false; cmd.uiShift = false; cmd.uiWheel = 0;
    hopHeld = false; placeHeld = false; dropHeld = false; deconHeld = false;
    miracleHeld = false; equipHeld = false;
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
  const onAlwaysOnUi = e => {
    const r = cv.getBoundingClientRect();
    const sx = (e.clientX - r.left) / VIEW.scale, sy = (e.clientY - r.top) / VIEW.scale;
    const p = uiDrawn.panels.find(p => p.id === 'hints-toggle');
    return !!p && sx >= p.x && sx < p.x + p.w && sy >= p.y && sy < p.y + p.h;
  };

  cv.addEventListener('pointermove', e => toWorld(e, pointer.cam));
  cv.addEventListener('pointerdown', e => {
    unlockAudio();
    toWorld(e, pointer.cam);
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
    } else if (e.button === 2) cmd.place = true; else cmd.mouse = true;
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener('pointerup', e => {
    if (isOpen(top()) || onAlwaysOnUi(e)) {
      if (e.button === 2) cmd.uiRight = false; else { cmd.uiClick = false; cmd.uiDown = false; }
    } else if (e.button === 2) { cmd.place = false; cmd.deconstruct = false; } else cmd.mouse = false;
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerleave', () => { cmd.hasMouse = false; cmd.mouse = false; });

  /* Wheel scrolls a panel's grid, never the page -- only routed, and only
     preventDefault'd, while a panel is open; with none open the wheel does
     whatever the browser would do anyway. `cmd.uiWheel` is a per-FRAME
     signed delta (see its declaration above), consumed and zeroed in
     `clearEdges()`. */
  cv.addEventListener('wheel', e => {
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
