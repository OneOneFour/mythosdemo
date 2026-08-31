/* LAYER shell — THE LOOP. Fixed timestep, camera, and the wiring of input to
   rules. Imports every layer; this is the entry point `index.html` loads.

   ============================================================================
   A FIXED 1/120 s STEP, AND NOT FOR PERFORMANCE.
   No `rules` module ever sees a variable dt. That is what lets fall damage,
   mining time and machine throughput be functions of the WORLD rather than of
   the display: a tile takes exactly its stated seconds at 30 fps and at 144 fps,
   and a 5-tile drop measures 40 px either way. The accumulator is capped, so a
   tab that was backgrounded for a minute does not simulate a minute in one
   frame and teleport the player through the floor.
   ============================================================================

   The journal is drained once per FRAME and not once per substep. Sound is a
   frame-rate phenomenon; the simulation is not. */

import { VIEW, resize, stage } from '../core/canvas.js';
import { clamp } from '../core/math.js';
import { M, MACH } from '../data/machines.js';
import { aim } from '../model/aim.js';
import { items } from '../model/items.js';
import { peek as journalPeek } from '../model/journal.js';
import { machines } from '../model/machines.js';
import { PH, PW, player, write as playerw } from '../model/player.js';
import { pocketRows, run, write as runw } from '../model/run.js';
import { bands, heightPx, widthPx, write as worldw } from '../model/world.js';
import { dropHeaviest } from '../rules/items.js';
import { deconstruct, placeMachine, placeTile, placeableFromPockets } from '../rules/placement.js';
import { step as stepFx } from '../view/fx.js';
import { render } from '../view/scene.js';
import { boot, newRun } from './boot.js';
import { clearEdges, cmd, flags, pointer, wants } from './input.js';
import { drainJournal } from './notify.js';
import { boons, grants, miracles, stepAll, trinkets } from './schedule.js';
import {
  assignQuickbar, cancelQueued, clearDrag, close as closePanel, isOpen,
  queueCraft, scrollBy, setDrag, setSearchFocus, setTab, toggleHints, ui
} from './ui.js';
import { hoverInfo, pocketHits } from '../view/hud.js';
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
   `flags` already is (D2 in CLAUDE.md §"Resolved decisions") — `view` may
   read which panel is open, its active tab, the focused slot, the drag
   payload, the search string and scroll offsets, but may never write any of
   it. No panel reads it yet (Phase 5a ships none); Phase 5b's is the first
   consumer. */
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

  /* THE CRAFT QUEUE RE-ASSERTS THE SAME ONE INTENT (Phase 5b,
     docs/BUILD_PLAN.md), every substep it is non-empty -- see
     `shell/ui.js#ui.craftQueue`'s own header for why this is a convenience
     over `rules/crafting.js`'s one-pair-of-hands scalar rather than a change
     to it. `rules/crafting.js` cannot tell this apart from the 'u' key
     being held, which is the point: there is exactly one hand-craft intent
     in this game, and the queue is a second way to hold it down. */
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
   `wants.machine`, attempting the same placement several times (one success
   plus refusal-toast spam); above 120 Hz a frame can run ZERO substeps, and
   `clearEdges()` still wiped the intent at the end of it, silently dropping a
   press. Each branch self-clears the flag it consumed, immediately, rather
   than waiting for `clearEdges()` -- so a flag this function never reaches
   (the game is paused, `aim` isn't valid yet) survives to the next frame
   instead of being erased on a schedule it knows nothing about. */
function applyIntents() {
  /* Same freeze as `step()`, and the same reason: placing a machine or
     drafting a boon resolves against `aim`, which is a reading of the world
     the player cannot currently see -- the map covers it. A press that lands
     while the map is open is simply dropped, not queued: `clearEdges()` still
     wipes `wants.machine`/`wants.draft`/`cmd.place` on its own schedule
     whether or not this function consumed them. */
  if (flags.showMap) return;

  if (wants.machine && aim.valid && aim.band) {
    /* Anchor the footprint so its BOTTOM row is the aimed tile: you point at the
       space a machine should stand in, not at its top-left corner. `th` comes
       off the row, so this line does not know how tall a furnace is. */
    const def = MACH[M[wants.machine]];
    if (def) placeMachine(aim.band, wants.machine, aim.tx, aim.ty - def.th + 1);
    wants.machine = null;
  }

  if (cmd.place && aim.valid && aim.band) {
    /* The first tile-capable pair in the pockets, in HUD order. A build menu
       would let the player choose; the rule is the same either way. */
    const p = placeableFromPockets(pocketRows())[0];
    if (p) placeTile(aim.band, aim.tx, aim.ty, p.sub, p.form);
    cmd.place = false;
  }

  /* The drop verb (CLAUDE.md D4's prerequisite): no aim needed, it always
     acts at the player's own feet, so unlike `place`/`wants.machine` above
     it has no validity gate to wait on. */
  if (cmd.drop) {
    dropHeaviest();
    cmd.drop = false;
  }

  /* Deconstruct (Phase 3, `docs/BUILD_PLAN.md`): the inverse of `wants.machine`
     above, gated on the same `aim.valid && aim.band` a placement needs -- you
     point at the machine you mean to remove, exactly the way you point at
     where a new one should stand. */
  if (cmd.deconstruct && aim.valid && aim.band) {
    deconstruct(aim.band, aim.tx, aim.ty);
    cmd.deconstruct = false;
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

  /* Drafting, bound to a key so all four tiers are exercisable by hand. The
     director that decides WHEN a god offers something is not built; these
     are the calls it would make. */
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

/* ---------- the widget layer's own dispatcher (Phase 5b) ----------
   A CLICK THAT DOES SOMETHING IS SHELL CALLING RULES (Phase 5a's own rule):
   `view/ui/mainPanel.js` and `view/ui/quickbar.js` only draw and RECORD the
   rectangles they drew, into `view/ui/state.js#drawn` -- the exact
   `pocketHits`/`buildHits` idiom `view/hud.js` already uses. This hit-tests
   the pointer (converted from world px to the SAME screen space those
   rectangles are drawn in, `cam` standing in for the conversion exactly the
   way `view/hud.js#buildGhost` already does it) against LAST FRAME's `drawn`
   and turns a hit into a `shell/ui.js` state change or a `rules` call --
   never the reverse, and `view` never sees any of this. One frame of lag
   between draw and hit-test is accepted here for the identical reason
   `buildGhost` already accepts it against `buildHits`: invisible at any real
   frame rate, and the alternative is `view` calling back into `shell`. */

let prevUiDown = false;

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
          else queueCraft(id, cmd.uiCtrl ? 99 : cmd.uiShift ? 5 : 1);
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
    if (hit && hit.slot.sub != null)
      setDrag({ sub: hit.slot.sub, form: hit.slot.form, n: hit.slot.n, from: hit.gridId });
  }
  if (upEdge && ui.drag) {
    const hit = uiHitSlot(sx, sy);
    if (hit) {
      if (hit.gridId === 'quickbar')
        assignQuickbar(hit.slot.index, { sub: ui.drag.sub, form: ui.drag.form });
      else if (hit.gridId === 'equip' && ui.drag.from === 'inv')
        /* THE SAME UNDERLYING ACTION the 'p' key already dispatches
           (docs/BUILD_PLAN.md Phase 5b's own instruction): with one trinket
           in the game, "equip whatever was dragged" and "equip the first
           held-but-unequipped trinket" are the same trinket, and adding a
           slot-specific rules call is not this task's to write --
           `rules/trinkets.js` is out of Phase 5b's FILE OWNERSHIP. */
        trinkets.equipFirst();
    }
    clearDrag();
  }
}

/* THE CRAFT QUEUE'S COMPLETION SIGNAL (Phase 5b), read rather than invented:
   `rules/crafting.js#step` already pushes a `'produce'` journal row on every
   finished hand-craft, shaped `{ sub, form, made }` -- no `def` key, which is
   exactly what tells it apart from `rules/machines.js#produce`'s OWN
   `'produce'` row (`{ def, made }`, no `sub`). `model/journal.js#peek()` is
   the NON-DESTRUCTIVE read that exists for precisely this: `shell/notify.js`
   still drains the same rows for sound and text afterward, undisturbed. */
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
   a screenshot is bit-reproducible. Nothing here runs in a normal session, and
   a later phase writes screenshot tests against it. */
function installTestHook() {
  globalThis.__mf = {
    ready: true,
    newRun, step, draw, resize,
    clock, cam, player, run, aim, items, machines, cmd, flags,

    /* Read-back of `view/hud.js`'s own last-frame output, for hover assertions.
       `hover` is what a tooltip would show right now; `hits` are the hitboxes
       the HUD strip/panel actually drew, so a test can find the exact rect for
       a `{sub, form}` pair instead of guessing a pixel coordinate — the same
       trap CLAUDE.md's "hardcoded click coordinates" mistake describes. */
    hover: hoverInfo, hits: pocketHits,

    /* THE WIDGET-LAYER PROJECTION (D2 in CLAUDE.md §"Resolved decisions";
       docs/BUILD_PLAN.md Phase 5a). One handle, not a second `window.__ui`
       global — composed HERE, in `shell`, rather than in `view`, because it
       merges two things that live in different layers and neither may
       import the other: `shell/ui.js#ui` (which panel is open, the active
       tab, focus, drag, search) and `view/ui/state.js#drawn` (the geometry
       and content the widget primitives actually painted last call — the
       exact `pocketHits`/`hoverInfo` idiom above, one layer over). A GETTER,
       not a field snapshotted once at install time, so every read reflects
       whatever was true as of the last `draw()` — the "rebuilt each draw,
       never a copy" requirement, satisfied by reading the two live objects
       fresh rather than caching a merged one. Phase 5a registers no panel,
       so today every array here is empty and `open`/`focus`/`drag` are
       empty/null; the shape exists for Phase 5b's panels to fill. */
    get ui() {
      return {
        open: ui.stack.slice(),
        tab: { ...ui.tab },
        focus: ui.focus ? { ...ui.focus } : null,
        drag: ui.drag ? { ...ui.drag } : null,
        search: ui.search,
        searchFocus: ui.searchFocus,
        /* Phase 5b additions: the craft queue (recipe ids, FIFO) and the
           quickbar assignment (`{sub,form}|null` per slot) -- both plain
           `shell/ui.js` state already, exposed for the identical "read what
           is actually true" reason every other field on this handle is. */
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
       `wants.machine`/`wants.draft`/`cmd.place` set once by a real key event
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

    /* Phase 6 (docs/BUILD_PLAN.md) TIER 3: the widget layer's own intents,
       driven through whatever `__mf.ui()` already says was actually drawn --
       NEVER a hardcoded pixel coordinate (CLAUDE.md: a click at (400, 300)
       fails on the phone project, whose base buffer is a different size).
       Every case locates its target rect from THIS handle's own live `ui`
       getter (the exact `pocketHits`/`hoverInfo` idiom every other read-back
       on this object already uses), converts it to a WORLD position the same
       way `mouseAt` does, arms the matching `cmd.uiClick`/`uiShift`/`uiCtrl`/
       `uiWheel`/`uiDown` flags, and runs exactly one substep so
       `applyIntents()`'s dispatcher (which self-clears every edge flag it
       reads) actually processes it -- a caller never has to know that detail
       to use this. Returns false, doing nothing, if the named target was not
       actually drawn this frame (a closed panel, an out-of-range slot). */
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

    /* TEST ONLY, and inert outside `?test=1`: this whole function --
       `installTestHook` -- is only ever called from the bottom of this file
       behind the SAME `testMode` guard as everything else on `__mf`
       (`new URLSearchParams(location.search).has('test')`), so there is no
       second gate to add here. Credits directly into the pockets, bypassing
       every mining/pickup rule -- the point is to arrange a SCENARIO (e.g.
       "the pockets are over the hard cap") without spending a test's frame
       budget re-proving mining or pickup, which other tests already cover
       end to end. */
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
