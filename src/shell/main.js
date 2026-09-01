/* LAYER shell — THE LOOP. Fixed timestep, camera, and the wiring of input to
   rules. Imports every layer; this is the entry point `index.html` loads.

   A FIXED 1/120 s STEP, AND NOT FOR PERFORMANCE. No `rules` module ever sees a
   variable dt, which is what lets fall damage, mining time and machine
   throughput be functions of the WORLD rather than of the display. The
   accumulator is capped, so a tab that was backgrounded for a minute does not
   simulate a minute in one frame and teleport the player through the floor.
   See docs/DEVELOPER_GUIDE.md#the-frame-loop-and-determinism

   The journal is drained once per FRAME and not once per substep. Sound is a
   frame-rate phenomenon; the simulation is not. */

import { VIEW, resize, stage } from '../core/canvas.js';
import { clamp } from '../core/math.js';
import { F, FORM } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { RECIPES } from '../data/recipes.js';
import { aim } from '../model/aim.js';
import { items } from '../model/items.js';
import { peek as journalPeek, push as journalPush } from '../model/journal.js';
import { machineAt, machines } from '../model/machines.js';
import { PH, PW, player, write as playerw } from '../model/player.js';
import { canCraft, invCount, isKnown, machineIdFor, pocketRows, run, write as runw } from '../model/run.js';
import { linkedTo, segments } from '../model/segments.js';
import { bands, heightPx, widthPx, write as worldw } from '../model/world.js';
import { dropHeaviest } from '../rules/items.js';
import { deconstruct, linkSegment, placeMachine, placeTile, placeableFromPockets, unlinkSegment } from '../rules/placement.js';
import { step as stepFx } from '../view/fx.js';
import { render } from '../view/scene.js';
import { boot, newRun } from './boot.js';
import { clearEdges, cmd, flags, pointer, wants } from './input.js';
import { drainJournal } from './notify.js';
import { boons, grants, miracles, stepAll, trinkets } from './schedule.js';
import {
  armLink, armPlace, assignQuickbar, cancelQueued, clearArmedPlace, clearDrag, clearLink,
  close as closePanel, closeTop, isOpen,
  queueCraft, scrollBy, setDrag, setSearchFocus, setTab, toggleHints, ui
} from './ui.js';
import { hoverInfo } from '../view/hud.js';
import { drawn as uiDrawn } from '../view/ui/state.js';

export const STEP = 1 / 120;
export const MAX_CATCHUP = 0.25;             // s of real time simulated per frame

export const clock = { t: 0, dt: 0, frame: 0, acc: 0 };
export const cam = { x: 0, y: 0 };

/* The cam position as of the LAST `draw()` call -- see that function's own
   comment on why the UI dispatcher must use this snapshot rather than the
   live, continuously-easing `cam` above. */
const drawCam = { x: 0, y: 0 };

/* The frame context handed to `view`. One object, reused, because `view` may not
   import `shell` and allocating a fresh one sixty times a second is waste.
   `mouse` is `cmd.mx`/`cmd.my`/`cmd.hasMouse` copied in every `draw()` — WORLD
   px, same as `cam`, so `view/hover.js` can test world content directly and
   subtract `cam` itself for anything drawn in screen space (the HUD).
   `ui` is `shell/ui.js`'s live state object, passed through exactly as
   `flags` already is — `view` may read which panel is open, its active tab,
   the focused slot, the drag payload, the search string and scroll offsets,
   but may never write any of it.
   See docs/DEVELOPER_GUIDE.md#the-frame-context */
const frameCtx = { cam, t: 0, dt: 0, frame: 0, W: 0, H: 0, flags, ui, mouse: { x: 0, y: 0, has: false } };

/* ---------- one frame of simulation ---------- */
export function step(dt) {
  /* THE MAP OVERVIEW FREEZES THE RUN. Guarded HERE, not in `frame()`, so the
     pause is one fact true of `step()` itself rather than something only the
     real RAF loop knows to honour -- the headless test hook's `frames()`/
     `hold()` call this function directly (there is no RAF loop under
     `?test=1`), and a test proving the pause has to hold a movement key
     through exactly this entry point. Nothing advances: not the clock, not
     `stepAll` (so no substance rule runs), not the camera follow at the
     bottom of this function. `frame()`'s accumulator keeps draining in real
     time regardless -- each call here still costs the caller one `STEP` off
     `clock.acc` even though it does nothing, so no backlog of catch-up frames
     is waiting the instant the map closes. */
  if (flags.showMap) return;

  /* THE CRAFT QUEUE RE-ASSERTS THE SAME ONE INTENT, every substep it is
     non-empty -- see `shell/ui.js#ui.craftQueue`'s own header for why this is
     a convenience over `rules/crafting.js`'s one-pair-of-hands scalar rather
     than a change to it. `rules/crafting.js` cannot tell this apart from the
     'u' key being held, which is the point: there is exactly one hand-craft
     intent in this game, and the queue is a second way to hold it down.
     See docs/DEVELOPER_GUIDE.md#adding-a-recipe */
  if (ui.craftQueue.length) cmd.craft = true;

  clock.dt = dt;
  clock.t += dt;
  clock.frame++;

  /* Left mouse and X are the same intent. Resolved here because which DEVICE
     asked is a shell question. */
  const digging = cmd.dig || cmd.mouse;
  const c = {
    left: cmd.left, right: cmd.right, up: cmd.up, down: cmd.down,
    hop: cmd.hop, dig: digging, place: cmd.place, craft: cmd.craft,
    /* `turn` is a HOLD, like `craft` and `dig` above: `rules/drive.js` reads
       it every substep and supplies torque for exactly the substeps it is
       down. It has to be on THIS object and not read off `cmd` inside the
       rule, because this narrowed set is the whole of what `rules` may see of
       the input device (Phase 8f). */
    turn: cmd.turn,
    hasMouse: cmd.hasMouse, mx: cmd.mx, my: cmd.my
  };

  stepAll(dt, c);

  /* Purely presentational, and therefore not a rule: the pick swings on the
     clock, not on the simulation. */
  playerw.set('digging', digging && ((clock.t * 9) | 0) % 2 === 0);
  updateCamera(dt);
}

/* One-shot intents. Placement and drafting are EVENTS, not steps, which is why
   they are here and not in `shell/schedule.js` -- and, as of this fix, why this
   runs exactly once per real ANIMATION FRAME rather than once per fixed
   substep. It used to run from inside `step()`: at a refresh rate below 120 Hz
   a single frame runs several substeps and re-read the same still-true
   drafting intent, attempting the same grant several times; above 120 Hz a
   frame can run ZERO substeps, and `clearEdges()` still wiped the intent at
   the end of it, silently dropping a press. Each branch self-clears the flag
   it consumed, immediately, rather than waiting for `clearEdges()` -- so a
   flag this function never reaches (the game is paused, `aim` isn't valid
   yet) survives to the next frame instead of being erased on a schedule it
   knows nothing about.

   `wants.machine` (the old digit-driven BUILD menu's own one-shot field) is
   gone along with the menu that set it -- see `shell/input.js`'s own comment
   at its digit-key handler and `docs/FINDINGS.md`. Placement now has exactly
   one path, `cmd.place` below, whether the pair placed is a tile or a
   machine. */
function applyIntents() {
  /* Same freeze as `step()`, and the same reason: placing a machine or
     drafting a boon resolves against `aim`, which is a reading of the world
     the player cannot currently see -- the map covers it. A press that lands
     while the map is open is simply dropped, not queued: `clearEdges()` still
     wipes `wants.draft`/`cmd.place` on its own schedule whether or not this
     function consumed them. */
  if (flags.showMap) return;

  /* THE ARMED PAIR TRACKS THE POCKETS (Part 1, click-to-arm placement): the
     instant the pockets no longer hold the EXACT armed pair -- spent by a
     craft, dropped, or placed by some other path -- the arm is stale and
     must clear, checked once here before anything below (including the
     highlighted slot `view/ui/mainPanel.js#frameArmedSlot` draws off this
     SAME field) can act on a pair that is no longer true. See
     `shell/ui.js#ui.armedPlace`'s own header for the other two clear
     triggers (a successful placement, Escape). */
  if (ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) <= 0) clearArmedPlace();

  /* THE ARMED LINK ENDPOINT TRACKS THE PLACED MACHINES, the exact same sweep
     one line up, applied to the other armed thing: a hub deconstructed
     between the first `l` press and the second leaves `ui.linkFrom` holding a
     record nothing else does, and `model/segments.js#linkCheck` would happily
     validate a span between a live hub and a ghost. `machines` is the
     authority on what exists, and `linkFrom` is a RECORD (see
     `shell/ui.js#ui.linkFrom`), so this is one identity test. */
  if (ui.linkFrom && !machines.includes(ui.linkFrom)) clearLink();

  /* POLISH: auto-hide the panel when placement starts. Opening the menu and
     then trying to place/deconstruct something used to leave the player
     aiming at the world from BEHIND their own window -- the panel draws over
     everything (`view/hud.js#drawHUD`'s own ordering) and does not pause
     anything, so the world underneath was live but unseeable. Closing the
     top panel HERE, before either of the two placement-shaped intents below
     is consumed, lets the SAME key press both close the menu and (this very
     call, since the checks below run immediately after) carry out the
     placement -- not two separate presses. Gated on the intent actually
     being present this frame, not on `isOpen('main')` alone, so merely
     having the menu open does not close it on some unrelated frame. */
  if (isOpen('main') && (cmd.place || cmd.deconstruct)) closeTop();

  if (cmd.place && aim.valid && aim.band) {
    /* ARMED FIRST: a player who clicked a
       specific slot in the Character tab or the quickbar
       (`shell/ui.js#ui.armedPlace`) means THAT pair, not whichever
       placeable happens to sort first in HUD order. Re-checked as still
       held here rather than trusted from the top-of-frame sweep above -- a
       craft queue or a drag could have spent it in the meantime -- so a
       stale arm can never place the wrong thing; it simply falls through to
       the SAME "first placeable in HUD order" rule this branch has always
       used otherwise. A build menu would let the player choose; now one
       really does. */
    const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
      ? ui.armedPlace : null;
    const p = armed || placeableFromPockets(pocketRows())[0];
    let placed = false;
    if (p && p.form === F.rig) {
      /* `machineIdFor` resolves a mirrored pair (belt/talos_head/cyclops_maw)
         off the player's own facing --
         docs/DEVELOPER_GUIDE.md#mirrored-machine-pairs. Anchored bottom row at
         the aimed tile: you point at the space a machine should stand in, not
         at its top-left corner. */
      const id = machineIdFor(p.sub);
      const def = id && MACH[M[id]];
      if (def) placed = !!placeMachine(aim.band, id, aim.tx, aim.ty - def.th + 1);
    } else if (p) {
      placed = !!placeTile(aim.band, aim.tx, aim.ty, p.sub, p.form);
    }
    if (armed && placed) clearArmedPlace();
    cmd.place = false;
  }

  /* The drop verb (CLAUDE.md D4's prerequisite): no aim needed, it always
     acts at the player's own feet, so unlike `place` above it has no
     validity gate to wait on. */
  if (cmd.drop) {
    dropHeaviest();
    cmd.drop = false;
  }

  /* Deconstruct (Phase 3, `docs/BUILD_PLAN.md`): the inverse of `place`
     above, gated on the same `aim.valid && aim.band` a placement needs -- you
     point at the machine you mean to remove, exactly the way you point at
     where a new one should stand. */
  if (cmd.deconstruct && aim.valid && aim.band) {
    deconstruct(aim.band, aim.tx, aim.ty);
    cmd.deconstruct = false;
  }

  /* LINK two hubs into a segment (Phase 8d, docs/PLAN-gears-and-winches.md
     section 4.5), gated on `aim.valid && aim.band` for the same reason
     `cmd.place` and `cmd.deconstruct` above are: you point at the machine you
     mean. TWO PRESSES, ONE KEY, and the whole branch mirrors the `cmd.place`
     shape -- arm on the first, act on the second, self-clear the flag.

     Aiming at open ground with nothing armed does nothing at all: no arm, no
     journal row, no error, exactly what a `cmd.place` with nothing placeable
     in the pockets already does.

     THE FOUR SECOND-PRESS CASES, and why each is what it is:
       a DIFFERENT machine, not yet joined -> link it. The arm clears on
         SUCCESS only, so a mis-aimed second press ('NOT A HUB', 'TOO FAR
         APART') costs one retry rather than the whole gesture.
       a machine ALREADY joined to the armed one -> cut that cable. One key,
         both directions, which is what makes the verb learnable.
       the SAME machine -> cancel the arm, silently. There is no A-to-A cable,
         so claiming one was cut would be a lie; this is the second Escape.
       nothing armed -> arm it.
     `linkedTo` is a `model` query read here rather than a `rules` call
     because "is there already a cable between these two" is a question, not a
     decision -- `rules/placement.js#unlinkSegment` is the consequence. */
  if (cmd.link && aim.valid && aim.band) {
    const m = machineAt(aim.band, aim.tx, aim.ty);
    const from = ui.linkFrom;
    if (m && !from) armLink(m);
    else if (m && m === from) clearLink();
    else if (m && from) {
      const existing = linkedTo(from, m);
      if (existing) { unlinkSegment(existing); clearLink(); }
      else if (linkSegment(from, m)) clearLink();
    }
    cmd.link = false;
  }

  /* USE a held miracle (Phase 4 STEP 3, docs/BUILD_PLAN.md): the ONE-SHOT
     tier's own real verb, aimed exactly like a placement or a deconstruct --
     you point at the tile the terrain edit centres on. Not gated on
     `flags.showDebug`: this consumes something already held, it does not
     spawn anything from nothing. */
  if (cmd.miracle && aim.valid && aim.band) {
    miracles.use(aim.band, aim.tx, aim.ty);
    cmd.miracle = false;
  }

  /* EQUIP the first held-but-unequipped trinket (Phase 4 STEP 4): no aim
     needed, same reasoning `cmd.drop` above already states for the drop
     verb. The model-driven path Phase 5b's drag-to-equip UI replaces. */
  if (cmd.equip) {
    trinkets.equipFirst();
    cmd.equip = false;
  }

  /* Drafting, bound to a key so all four tiers are exercisable by hand. */
  if (wants.draft === 'trinket') {
    const t = trinkets.draftable()[0];
    if (t) trinkets.grant(t.id);
    wants.draft = null;
  }
  if (wants.draft === 'grant') {
    const g = grants.draftable()[0];
    if (g) grants.grant(g.id);
    wants.draft = null;
  }
  if (wants.draft === 'boon') {
    const b = boons.draftable()[0];
    if (b) boons.grant(b.id);
    wants.draft = null;
  }
  if (wants.draft === 'miracle') {
    const m = miracles.draftable()[0];
    if (m) miracles.grant(m.id);
    wants.draft = null;
  }

  applyUiIntents();
}

/* ---------- the widget layer's own dispatcher ----------
   A CLICK THAT DOES SOMETHING IS SHELL CALLING RULES: `view` only draws and
   RECORDS the rectangles it drew, into `view/ui/state.js#drawn`. This
   hit-tests the pointer (converted from world px to the SAME screen space
   those rectangles are drawn in) against LAST FRAME's `drawn` and turns a hit
   into a `shell/ui.js` state change or a `rules` call -- never the reverse,
   and `view` never sees any of this. One frame of lag between draw and
   hit-test is accepted, for the identical reason `buildGhost` already accepts
   it. See docs/DEVELOPER_GUIDE.md#record-what-you-drew */

let prevUiDown = false;

/* CLICK-VS-DRAG THRESHOLD (Part 1, click-to-arm placement). A plain click on
   an inventory or quickbar slot arms it for placement; an actual drag still
   does its existing equip/quickbar-assign job (`upEdge` below, unchanged).
   Both start from the exact same pointerdown -- `shell/input.js`'s own
   header on why `uiDown` exists at all -- so telling them apart needs the
   same movement-threshold trick every drag-and-drop UI uses: remember where
   the press started, and only call the release a "drag" if the pointer
   actually moved past a few pixels first. Screen-space px, the same space
   `sx`/`sy` below are already in. */
let dragStart = null;      // { sx, sy, gridId, index } | null, set at the down edge
let dragExceeded = false;  // has the pointer moved past the threshold since?
const DRAG_THRESHOLD = 3;

function uiHitPanelClose(sx, sy) {
  for (const p of uiDrawn.panels) {
    const c = p.closeHit;
    if (c && sx >= c.x && sx < c.x + c.w && sy >= c.y && sy < c.y + c.h) return p.id;
  }
  return null;
}

function uiHitPanel(sx, sy) {
  for (let i = uiDrawn.panels.length - 1; i >= 0; i--) {
    const p = uiDrawn.panels[i];
    if (sx >= p.x && sx < p.x + p.w && sy >= p.y && sy < p.y + p.h) return p;
  }
  return null;
}

function uiHitTab(sx, sy) {
  for (const t of uiDrawn.tabs)
    for (const h of t.hits)
      if (sx >= h.x && sx < h.x + h.w && sy >= h.y && sy < h.y + h.h) return { row: t.id, tab: h.id };
  return null;
}

function uiHitGrid(sx, sy) {
  for (const g of uiDrawn.grids)
    if (sx >= g.x && sx < g.x + g.w && sy >= g.y && sy < g.y + g.h) return g;
  return null;
}

function uiHitSlot(sx, sy) {
  const g = uiHitGrid(sx, sy);
  if (!g) return null;
  for (const s of g.slots)
    if (sx >= s.x && sx < s.x + s.w && sy >= s.y && sy < s.y + s.h) return { gridId: g.id, slot: s };
  return null;
}

function applyUiIntents() {
  /* The panel closing mid-drag (Escape, say) leaves `cmd.uiDown` with no
     panel-side pointerup left to clear it -- `shell/input.js` only routes a
     real pointerup into `uiDown` while `isOpen(top())` is STILL true at that
     moment, so a close in between strands it. Reset both halves of the drag
     state here rather than let a phantom drag survive into the next time the
     panel opens. */
  if (!isOpen('main')) {
    prevUiDown = false;
    if (ui.drag) clearDrag();
    dragStart = null;
    /* The quickbar's KEYS/legend toggle is drawn ALWAYS (`view/ui/quickbar.js`),
       not gated on the main panel being open, and `shell/input.js` now routes
       a click on it as a UI click regardless -- give it the one dispatch it
       needs here rather than let the early return above swallow it silently.
       Nothing else is live with no panel open: tabs, slots and search all
       belong to the window this branch has already established is closed. */
    if (cmd.hasMouse && cmd.uiClick && uiHitPanel(cmd.mx - drawCam.x, cmd.my - drawCam.y)?.id === 'hints-toggle')
      toggleHints();
    cmd.uiClick = false;
    return;
  }
  if (!cmd.hasMouse) { prevUiDown = cmd.uiDown; return; }

  const sx = cmd.mx - drawCam.x, sy = cmd.my - drawCam.y;

  if (cmd.uiClick) {
    const closeId = uiHitPanelClose(sx, sy);
    if (closeId) { closePanel(closeId); cmd.uiClick = false; }
    else {
      const tabHit = uiHitTab(sx, sy);
      const slotHit = !tabHit && uiHitSlot(sx, sy);
      const panelHit = uiHitPanel(sx, sy);
      const onSearch = panelHit?.id === 'main-craft-search';
      const onHints = panelHit?.id === 'hints-toggle';

      if (tabHit) setTab(tabHit.row, tabHit.tab);
      else if (onSearch) setSearchFocus(true);
      else if (onHints) toggleHints();
      else if (slotHit?.gridId === 'recipes' || slotHit?.gridId === 'craft-queue') {
        const ids = uiDrawn.recipeIndex[slotHit.gridId];
        const id = ids && ids[slotHit.slot.index];
        if (id) {
          if (slotHit.gridId === 'craft-queue') cancelQueued(slotHit.slot.index);
          else {
            /* BUG FIX (Bug 4): a click used to queue a recipe unconditionally,
               even one the player cannot currently afford --
               `rules/crafting.js#choose()` only ever runs the first
               HAND_RECIPES row it can fully pay for, so an unaffordable
               queued entry never spends anything (no bypass) but also never
               completes: it just sits there forever, indistinguishable from
               one actually progressing. Refuse the click outright instead,
               with the SAME `'refused'` journal row `rules/placement.js`
               already uses for a one-line reason, so the toast reads
               identically to every other refusal in the game. */
            const r = RECIPES[id];
            const known = r && isKnown(id);
            if (known && canCraft(r.in)) queueCraft(id, cmd.uiCtrl ? 99 : cmd.uiShift ? 5 : 1);
            else journalPush('refused', null, { why: known ? 'CANNOT AFFORD' : 'UNKNOWN RECIPE' });
          }
        }
      }

      /* Any other click closes the search field the same way clicking
         outside a real text input blurs it -- typing is otherwise the only
         way out, per `shell/input.js`'s own keydown branch. */
      if (ui.searchFocus && !onSearch) setSearchFocus(false);
    }
  }

  if (cmd.uiWheel) {
    const g = uiHitGrid(sx, sy);
    if (g) scrollBy('main', g.id, Math.sign(cmd.uiWheel));
  }

  /* Drag: `cmd.uiDown` is a HOLD (see `shell/input.js`'s own header on why
     `uiClick` alone cannot answer "is the button still down"). The rising
     edge picks a payload off whatever slot is under the cursor; the falling
     edge resolves it against whatever slot is under the cursor NOW, which
     may be a different one. */
  const downEdge = cmd.uiDown && !prevUiDown, upEdge = !cmd.uiDown && prevUiDown;
  prevUiDown = cmd.uiDown;

  if (downEdge) {
    const hit = uiHitSlot(sx, sy);
    if (hit && hit.slot.sub != null) {
      /* `index` added (Bug 1 audit): a per-slot equip/unequip below needs to
         know WHICH equip slot a drag started from, not just which grid --
         `from` alone was enough for "equip the first empty slot" but not for
         "clear THIS slot" or "swap these two". */
      setDrag({ sub: hit.slot.sub, form: hit.slot.form, n: hit.slot.n, from: hit.gridId, index: hit.slot.index });
      dragStart = { sx, sy, gridId: hit.gridId, index: hit.slot.index };
      dragExceeded = false;
    } else {
      dragStart = null;
    }
  }

  /* Checked every frame the button is down, not only on the edges, so a slow
     drag that crosses the threshold between polls is still caught. */
  if (cmd.uiDown && dragStart && !dragExceeded &&
      (Math.abs(sx - dragStart.sx) > DRAG_THRESHOLD || Math.abs(sy - dragStart.sy) > DRAG_THRESHOLD))
    dragExceeded = true;

  if (upEdge && ui.drag) {
    const hit = uiHitSlot(sx, sy);

    /* PLAIN CLICK, no drag threshold crossed, released on the SAME slot the
       press started on: arm that exact pair instead of running the
       drag-resolve branches below (Part 1, click-to-arm placement) -- see
       `shell/ui.js#ui.armedPlace`'s own header. Restricted to a pair that
       could actually BE placed (a tile-capable form or a machine's own
       `rig`) and to the two grids a player actually holds placeables in, so
       this never steals a click a real equip/quickbar drag needed, and never
       arms a slot with nothing coherent to do once 'E' is pressed. */
    const clicked = !dragExceeded && hit && dragStart &&
      hit.gridId === dragStart.gridId && hit.slot.index === dragStart.index;
    if (clicked && (hit.gridId === 'inv' || hit.gridId === 'quickbar') &&
        hit.slot.sub != null && (FORM[hit.slot.form]?.tile || hit.slot.form === F.rig)) {
      armPlace(hit.slot.sub, hit.slot.form);
    } else if (hit && hit.gridId === 'quickbar') {
      assignQuickbar(hit.slot.index, { sub: ui.drag.sub, form: ui.drag.form });
    } else if (hit && hit.gridId === 'equip') {
      /* BUG FIX (Bug 1 audit, docs/FINDINGS.md Phase 5b): dragging ONTO an
         equip slot used to always call `trinkets.equipFirst()` regardless of
         which of the (up to `eff('trinketSlots')`) slots was actually
         targeted, and dragging OUT of an equip slot did nothing at all -- no
         unequip path existed, `rules/trinkets.js` exposes no per-slot verb.
         `model/run.js#write.equip(slot, sub)` is already exported for
         exactly this (its own header: "the caller is trusted to have
         already checked equip is legal") -- wiring a REAL per-slot
         equip/unequip/swap needs no `rules/` or `model/` file edit, only
         calling a model write shell already calls elsewhere (`give` above
         does the same thing for `write.collect`). `ui.drag.form === F.relic`
         is the same test `data/forms.js` uses to say a pair IS a trinket
         (only a `relic`-tagged substance may cross into that form), so this
         can never equip ordinary material by accident. */
      if (ui.drag.from === 'inv' && ui.drag.form === F.relic &&
          invCount(ui.drag.sub, F.relic) > 0 && !run.equipped.includes(ui.drag.sub)) {
        runw.equip(hit.slot.index, ui.drag.sub);
      } else if (ui.drag.from === 'equip' && ui.drag.index !== hit.slot.index) {
        const other = run.equipped[hit.slot.index];
        runw.equip(hit.slot.index, ui.drag.sub);
        runw.equip(ui.drag.index, other ?? null);
      }
    } else if (ui.drag.from === 'equip') {
      /* Dropped anywhere that is not another equip slot (empty canvas, the
         inventory grid, outside the panel entirely) -- the real UNEQUIP
         path Phase 5b left unwired because `rules/trinkets.js` had no
         per-slot verb to call. It has a `model` write that does exactly
         this, so a drag-out now really clears the slot instead of silently
         doing nothing. */
      runw.equip(ui.drag.index, null);
    }
    clearDrag();
    dragStart = null;
  }
}

/* THE CRAFT QUEUE'S COMPLETION SIGNAL, read rather than invented:
   `rules/crafting.js#step` already pushes a `'produce'` journal row on every
   finished hand-craft, shaped `{ sub, form, made }` -- no `def` key, which is
   exactly what tells it apart from `rules/machines.js#produce`'s OWN
   `'produce'` row (`{ def, made }`, no `sub`). `model/journal.js#peek()` is
   the NON-DESTRUCTIVE read that exists for precisely this: `shell/notify.js`
   still drains the same rows for sound and text afterward, undisturbed.
   See docs/DEVELOPER_GUIDE.md#notification-and-the-journal */
function tickCraftQueue() {
  if (!ui.craftQueue.length) return;
  for (const row of journalPeek()) {
    if (row.kind === 'produce' && row.data && row.data.sub !== undefined && row.data.def === undefined)
      cancelQueued(0);
    if (!ui.craftQueue.length) break;
  }
}

/* ---------- camera ----------
   Leads the player in the direction of travel, and looks further DOWN than up,
   because down is where the game is. Clamped to the band the player is in:
   resizing the window moves the camera and nothing else (invariant 2). */
function updateCamera(dt) {
  const b = player.band;
  if (!b) return;
  const tx = player.x + PW / 2 - VIEW.w / 2 + player.face * VIEW.w * 0.08;
  const ty = player.y + PH / 2 - VIEW.h / 2 + Math.min(40, player.vy * 0.12);
  const k = Math.min(1, dt * 6);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  clampCam();
}

function clampCam() {
  const b = player.band;
  if (!b) return;
  /* A band narrower than the viewport centres rather than clamping to a corner,
     which is what a 96-tile astral platform on a wide monitor needs. Bands
     differ in width (astral is inset), so X still clamps to the CURRENT band
     only. */
  const w = widthPx(b);
  cam.x = w > VIEW.w ? clamp(cam.x, b.origin.x, b.origin.x + w - VIEW.w)
                     : b.origin.x + (w - VIEW.w) / 2;

  /* Y clamps to the UNION of every band, not just the current one -- bands
     stack contiguously in world space (`data/world.js` declares them
     top-to-bottom with each origin.y equal to the previous band's bottom
     edge), so this is one seamless column, not three separate ones. Clamping
     per-band used to cap `cam.y` at the current band's own floor even while
     the player kept descending past it: the camera pinned short of the seam,
     `view/scene.js#visible()` correctly stopped drawing the band below (there
     was nothing there to draw yet), and the instant `player.band` flipped,
     this function re-evaluated against the NEW band's range -- whose minimum
     is the seam itself -- snapping `cam.y` up to a full viewport height in one
     frame. That was "digging glitches at the bottom of the screen." A union
     clamp has no such seam: the smooth follow in `updateCamera` eases across
     a band change exactly like it eases across anything else. */
  const top = bands[0].origin.y;
  const last = bands[bands.length - 1];
  const bottom = last.origin.y + heightPx(last);
  const totalH = bottom - top;
  cam.y = totalH > VIEW.h ? clamp(cam.y, top, bottom - VIEW.h)
                          : top + (totalH - VIEW.h) / 2;
}

/* ---------- draw ---------- */
export function draw() {
  const g = stage.ctx;
  if (!g) return;
  frameCtx.t = clock.t;
  frameCtx.dt = clock.dt;
  frameCtx.frame = clock.frame;
  frameCtx.W = VIEW.w;
  frameCtx.H = VIEW.h;
  frameCtx.mouse.x = cmd.mx;
  frameCtx.mouse.y = cmd.my;
  frameCtx.mouse.has = cmd.hasMouse;
  render(g, frameCtx);
  /* `render()` rounds `cam.x`/`cam.y` to integers IN PLACE (its own header:
     "cam.x = Math.round(cam.x)") before drawing anything -- which is also
     the exact cam position every rectangle `view/ui/state.js#drawn` now
     holds was laid out against. `updateCamera()` (in `step()`, which runs
     BEFORE this on every subsequent frame) eases `cam` again immediately
     afterward, continuously, even at rest while it converges toward the
     player -- so the LIVE `cam` by the time `applyUiIntents()` runs can
     already differ from the value that produced `drawn` by more than a
     pixel. Snapshotting it HERE, once, right after the rounding that
     matters, is what lets the UI dispatcher recover the original screen
     coordinate a click landed on instead of round-tripping through a `cam`
     that moved in between. */
  drawCam.x = cam.x; drawCam.y = cam.y;
}

/* ---------- the loop ---------- */
let last = 0;

export function frame(now) {
  const t = now / 1000;
  const real = last ? t - last : STEP;
  last = t;

  /* Self-cleared here rather than by `clearEdges()` below: that call is now
     skipped on a zero-substep frame (see the comment further down), and a
     restart left set would otherwise fire again on every frame until one
     finally runs a substep. */
  if (wants.restart) { newRun(); wants.restart = false; }

  clock.acc += Math.min(MAX_CATCHUP, real);
  let n = 0;
  while (clock.acc >= STEP) { step(STEP); clock.acc -= STEP; n++; }
  if (!n) { clock.dt = real; }               // keep the FPS readout honest

  tickCraftQueue();
  applyIntents();

  /* `cmd.hop` is read inside a fixed substep (`rules/player.js`), so it must
     only be cleared once one has actually run -- above 120 Hz refresh a frame
     can run zero substeps, and clearing it here unconditionally erased a hop
     or a restart before the physics ever saw it. `applyIntents()` above
     already self-clears everything else it consumes, on its own schedule, so
     gating the rest of `clearEdges()` on `n` costs nothing extra. */
  if (n) clearEdges();
  stepFx(real);
  drainJournal(clock.t);

  draw();
  requestAnimationFrame(frame);
}

/* ---------- the test hook ----------
   With `?test=1` the RAF loop does not start. The page exposes a handle that
   advances an exact number of substeps at an exact dt and then renders once, so
   a screenshot is bit-reproducible. Nothing here runs in a normal session.
   See docs/DEVELOPER_GUIDE.md#the-test-hook */
function installTestHook() {
  globalThis.__mf = {
    ready: true,
    newRun, step, draw, resize,
    clock, cam, player, run, aim, items, machines, cmd, flags,

    /* THE LIVE SEGMENT LIST (Phase 8d), exposed exactly as `items` and
       `machines` already are -- the array itself, not a copy, so a test reads
       whatever is true right now. Phases 8e and 8f drive their scenes through
       this and through `ui.linkFrom` below, so neither needs a hardcoded click
       coordinate (CLAUDE.md: a click at (400, 300) fails at a different base
       buffer). Records hold live band and machine references, so a Playwright
       test must project the fields it wants INSIDE `page.evaluate` rather than
       returning a record across the boundary. */
    segments,

    /* Read-back of `view/hud.js`'s own last-frame output: what a WORLD-hover
       tooltip (a bare tile, a falling item, a machine) would show right now.
       A panel's OWN tooltip (hovering a slot inside the Character/Crafting
       tab) is a separate read-back, `ui().tooltip` below, fed by
       `view/ui/state.js#drawn` instead. */
    hover: hoverInfo,

    /* THE WIDGET-LAYER PROJECTION. One handle, not a second `window.__ui`
       global — composed HERE, in `shell`, rather than in `view`, because it
       merges two things that live in different layers and neither may
       import the other: `shell/ui.js#ui` (which panel is open, the active
       tab, focus, drag, search) and `view/ui/state.js#drawn` (the geometry
       and content the widget primitives actually painted last call). A
       GETTER, not a field snapshotted once at install time, so every read
       reflects whatever was true as of the last `draw()`.
       See docs/DEVELOPER_GUIDE.md#the-test-hook */
    get ui() {
      return {
        open: ui.stack.slice(),
        tab: { ...ui.tab },
        focus: ui.focus ? { ...ui.focus } : null,
        drag: ui.drag ? { ...ui.drag } : null,
        search: ui.search,
        searchFocus: ui.searchFocus,
        /* The pair, if any, a slot click has armed for the next `cmd.place`. */
        armedPlace: ui.armedPlace ? { ...ui.armedPlace } : null,
        /* The machine, if any, a first `l` press has armed as one end of the
           next cable. SERIALISED to `{tx, ty, def}` rather than handed over as
           the record: `ui.linkFrom` holds a live machine (which holds a live
           band, which holds typed arrays), and this getter's whole contract is
           that everything it returns survives `page.evaluate`'s structured
           clone. A projection of real state, never a copy of it -- the same
           rule the rest of this getter follows. */
        linkFrom: ui.linkFrom
          ? { tx: ui.linkFrom.tx, ty: ui.linkFrom.ty, def: ui.linkFrom.def }
          : null,
        /* The craft queue (recipe ids, FIFO) and the quickbar assignment
           (`{sub,form}|null` per slot). */
        craftQueue: ui.craftQueue.slice(),
        quickbar: ui.quickbar.map(s => s ? { ...s } : null),
        hintsOpen: ui.hintsOpen,
        panels: uiDrawn.panels.map(p => ({ ...p, closeHit: p.closeHit ? { ...p.closeHit } : null })),
        tabs: uiDrawn.tabs.map(t => ({ ...t, hits: t.hits.map(h => ({ ...h })) })),
        grids: uiDrawn.grids.map(gr => ({ ...gr, slots: gr.slots.map(s => ({ ...s })) })),
        bars: uiDrawn.bars.map(b => ({ ...b })),
        tooltip: uiDrawn.tooltip ? { ...uiDrawn.tooltip, lines: uiDrawn.tooltip.lines.slice() } : null
      };
    },

    /* Fog of war, TEST ONLY. `model/world.js#write.revealAll` has no other
       caller: several screenshot tests park the camera at a band the player
       never walked to, to prove TERRAIN rendering is correct, which is a
       question fog of war must not be allowed to swallow just because it now
       exists. Nothing a real playthrough does ever reaches this. */
    revealAll: b => worldw.revealAll(b),

    /* Move the pointer to a SCREEN pixel (canvas space, same units `hits`
       reports in) without a real DOM pointer event -- there is no browser
       gesture to synthesize headlessly, and `cmd.mx/my` are WORLD px, so this
       is `toWorld`'s own arithmetic with `cam` standing in for the click. */
    mouseAt(sx, sy) { cmd.mx = cam.x + sx; cmd.my = cam.y + sy; cmd.hasMouse = true; },

    /* Advance n substeps at a fixed dt, then draw once. `applyIntents()` runs
       once per substep here rather than once per call -- as it would inside a
       real `frame()` -- because it now self-clears whatever it consumes, so a
       `wants.draft`/`cmd.place` set once by a real key event
       still fires exactly once across the whole call, same as it would in one
       real frame; calling it every iteration just means the test hook does not
       have to guess which substep the real frame boundary would have been. */
    frames(n, dt = STEP) {
      for (let i = 0; i < n; i++) { step(dt); applyIntents(); clearEdges(); }
      tickCraftQueue();
      stepFx(n * dt);
      drainJournal(clock.t);
      draw();
    },

    /* Hold a command set down for n substeps. Edge-triggered commands are
       released after the first substep, exactly as a real key would be. */
    hold(keys, n, dt = STEP) {
      for (const k of Object.keys(keys)) cmd[k] = keys[k];
      for (let i = 0; i < n; i++) {
        step(dt);
        applyIntents();
        clearEdges();
        if (keys.hop) cmd.hop = false;
        if (keys.place) cmd.place = false;
      }
      tickCraftQueue();
      stepFx(n * dt);
      drainJournal(clock.t);
      draw();
    },

    /* The widget layer's own intents, driven through whatever `__mf.ui()`
       already says was actually drawn -- NEVER a hardcoded pixel coordinate
       (CLAUDE.md: a click at (400, 300) fails on the phone project, whose base
       buffer is a different size). Every case locates its target rect from
       THIS handle's own live `ui` getter, converts it to a WORLD position the
       same way `mouseAt` does, arms the matching `cmd.uiClick`/`uiShift`/
       `uiCtrl`/`uiWheel`/`uiDown` flags, and runs exactly one substep so
       `applyIntents()`'s dispatcher (which self-clears every edge flag it
       reads) actually processes it. Returns false, doing nothing, if the named
       target was not actually drawn this frame (a closed panel, an
       out-of-range slot). See docs/DEVELOPER_GUIDE.md#the-test-hook */
    intent(name, args = {}) {
      const proj = this.ui;
      const at = (sx, sy, { shift = false, ctrl = false, down = false } = {}) => {
        cmd.mx = cam.x + sx; cmd.my = cam.y + sy; cmd.hasMouse = true;
        cmd.uiShift = shift; cmd.uiCtrl = ctrl;
        if (down) cmd.uiDown = true; else cmd.uiClick = true;
      };

      if (name === 'tab') {
        const row = proj.tabs.find(t => t.id === args.row);
        const hit = row && row.hits.find(h => h.id === args.tab);
        if (!hit) return false;
        at(hit.x + hit.w / 2, hit.y + hit.h / 2);
        this.frames(1);
        return true;
      }

      if (name === 'slot') {
        const grid = proj.grids.find(g => g.id === args.grid);
        const slot = grid && grid.slots[args.index];
        if (!slot) return false;
        at(slot.x + slot.w / 2, slot.y + slot.h / 2, { shift: !!args.shift, ctrl: !!args.ctrl });
        this.frames(1);
        return true;
      }

      if (name === 'wheel') {
        const grid = proj.grids.find(g => g.id === args.grid);
        if (!grid) return false;
        cmd.mx = cam.x + grid.x + 1; cmd.my = cam.y + grid.y + 1; cmd.hasMouse = true;
        cmd.uiWheel = args.delta ?? 1;
        this.frames(1);
        return true;
      }

      if (name === 'drag') {
        const fromGrid = proj.grids.find(g => g.id === args.fromGrid);
        const fromSlot = fromGrid && fromGrid.slots[args.fromIndex];
        const toGrid = proj.grids.find(g => g.id === args.toGrid);
        const toSlot = toGrid && toGrid.slots[args.toIndex];
        if (!fromSlot || !toSlot) return false;
        at(fromSlot.x + fromSlot.w / 2, fromSlot.y + fromSlot.h / 2, { down: true });
        this.frames(1);
        cmd.mx = cam.x + toSlot.x + toSlot.w / 2; cmd.my = cam.y + toSlot.y + toSlot.h / 2;
        cmd.uiDown = false;
        this.frames(1);
        return true;
      }

      return false;
    },

    /* TEST ONLY, and inert outside `?test=1`. Credits directly into the
       pockets, bypassing every mining/pickup rule -- the point is to arrange a
       SCENARIO (e.g. "the pockets are over the hard cap") without spending a
       test's frame budget re-proving mining or pickup, which other tests
       already cover end to end. See docs/DEVELOPER_GUIDE.md#the-test-hook */
    give(sub, form, n) { runw.collect(sub, form, n); }
  };
}

if (typeof document !== 'undefined' && document.getElementById('stage')) {
  const testMode = typeof location !== 'undefined'
                && new URLSearchParams(location.search).has('test');
  boot(testMode ? 1337 : undefined);
  pointer.cam = cam;
  clampCam();
  cam.x = player.x + PW / 2 - VIEW.w / 2;
  cam.y = player.y + PH / 2 - VIEW.h / 2;
  clampCam();
  if (typeof addEventListener === 'function')
    addEventListener('resize', () => clampCam());
  if (testMode) { installTestHook(); draw(); }
  else requestAnimationFrame(frame);
}
