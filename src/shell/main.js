/* shell layer — the loop — fixed timestep, camera, and the wiring of input to
   rules. The entry point `index.html` loads. */

import { VIEW, resize, stage } from '../core/canvas.js';
import { clamp } from '../core/math.js';
import { F } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { RECIPES } from '../data/recipes.js';
import { aim } from '../model/aim.js';
import { activeCount as digCount, isFull as digFull, queued as digMarks } from '../model/digqueue.js';
import { items, write as itemsw } from '../model/items.js';
import { peek as journalPeek, push as journalPush } from '../model/journal.js';
import { machineAt, machines } from '../model/machines.js';
import { PH, PW, player, playerCentre, write as playerw } from '../model/player.js';
import { canCraft, canReroll, invCount, isKnown, machineIdFor, offerGod, pocketRows, rerollPrice, run, write as runw } from '../model/run.js';
import { linkedTo, segments } from '../model/segments.js';
import { bands, heightPx, widthPx, worldX, worldY, write as worldw } from '../model/world.js';
import * as draft from '../rules/draft.js';
import { dropHeaviest } from '../rules/items.js';
import { handOne } from '../rules/machines.js';
import { attachCarrier, deconstruct, linkSegment, placeMachine, placeTile, placeableFromPockets, unlinkSegment } from '../rules/placement.js';
import { apply as applyScenario } from '../rules/scenarios.js';
import { step as stepFx } from '../view/fx.js';
import { render } from '../view/scene.js';
import { boot, newRun } from './boot.js';
import { clearEdges, cmd, flags, pointer, wants } from './input.js';
import { drainJournal } from './notify.js';
import { clearSave, load, loadError, save, slotState } from './save.js';
import { boons, grants, miracles, stepAll, trinkets } from './schedule.js';
import {
  armLink, armPlace, cancelQueued, clearArmedPlace, clearDrag, clearLink,
  close as closePanel, closeMenu, closeTop, isOpen, menuPage, open as openPanel,
  openMenu, pausesRun, queueCraft, scrollBy, setDrag, setMenuConfirm, setMenuInRun,
  setMenuNotice, setMenuSave, setMenuSeedFocus, setMenuStale, setSearchFocus, setTab,
  toggleAutoCollect, toggleAutoFeed, toggleHints, ui
} from './ui.js';
import { hoverInfo } from '../view/hud.js';
import { drawn as uiDrawn } from '../view/ui/state.js';

export const STEP = 1 / 120;                 // s; no rules module sees a variable dt
export const MAX_CATCHUP = 0.25;             // s of real time simulated per frame

export const clock = { t: 0, dt: 0, frame: 0, acc: 0 };
export const cam = { x: 0, y: 0 };

/* The camera as of the last `draw()`. The UI dispatcher hit-tests against
   this, never the live easing `cam`. */
const drawCam = { x: 0, y: 0 };

/* Reused rather than allocated per frame. `mouse` is world px, as `cam` is;
   `ui` is live state `view` may read and never write. */
const frameCtx = { cam, t: 0, dt: 0, frame: 0, W: 0, H: 0, flags, ui, mouse: { x: 0, y: 0, has: false } };

export function step(dt) {
  /* The four freezes guard here, not in `frame()`: the test hook calls
     `step()` directly. The accumulator keeps draining, so nothing backs up. */
  if (flags.showMap) return;
  if (ui.menu.open) return;   // the clock stops too, so a run starts at t = 0
  if (run.won) return;        // `run.dead` deliberately not here: items still fall
  if (pausesRun()) return;

  clock.dt = dt;
  clock.t += dt;
  clock.frame++;

  const digging = cmd.dig || cmd.mouse;
  /* The queue's head names the recipe, so a click on GEAR cannot produce a
     furnace; a hold naming nothing takes the first row. */
  const craftId = ui.craftQueue[0] ?? cmd.craftId ?? null;
  const c = {
    left: cmd.left, right: cmd.right, up: cmd.up, down: cmd.down,
    hop: cmd.hop, dig: digging, place: cmd.place,
    craft: cmd.craft || craftId !== null, craftId,
    action: cmd.action,                       // a hold, one substep's worth of torque
    collect: ui.autoCollect || cmd.collect,  // either the key or the preference
    autoFeed: ui.autoFeed,                   // no key: the manual path is `cmd.feed`
    hasMouse: cmd.hasMouse, mx: cmd.mx, my: cmd.my
  };

  stepAll(dt, c);

  // presentational, not a rule: the pick swings on the clock
  playerw.set('digging', digging && ((clock.t * 9) | 0) % 2 === 0);
  updateCamera(dt);
}

/* One-shot intents, once per animation frame rather than per substep: below
   120 Hz a frame would re-read a still-true intent, and above it a frame can
   run zero substeps. Each branch clears the flag it consumed. */
export function applyIntents() {
  /* Above the freeze it sits behind, since taking a row is the only thing that
     ends the pause. Everything past it is a world intent. */
  applyMenuIntents();
  if (ui.menu.open) return;
  if (flags.showMap) return;   // the map covers the world `aim` reads; drop, don't queue
  if (run.won) return;         // `frame()` consumes `wants.restart` before this
  applyDraftIntents();         // likewise above its own freeze
  if (pausesRun()) return;

  /* Both arms go stale silently — a spent pair, or a hub deconstructed between
     the two `l` presses — so they are swept before anything below acts. */
  if (ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) <= 0) clearArmedPlace();
  if (ui.linkFrom && !machines.includes(ui.linkFrom)) clearLink();

  /* The panel pauses nothing, so one press both closes it and places. */
  if (isOpen('main') && (cmd.place || cmd.deconstruct)) closeTop();

  if (cmd.place && aim.valid && aim.band) {
    /* Armed first: a clicked slot means that pair, not whichever sorts first
       in HUD order. Re-checked, since a craft or drag could have spent it. */
    const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
      ? ui.armedPlace : null;
    /* Used, not placed; `use` has no occupancy precondition. */
    if (armed && armed.form === F.phial) {
      miracles.use(aim.band, aim.tx, aim.ty);
      clearArmedPlace();
    } else {
      const p = armed || placeableFromPockets(pocketRows())[0];
      let placed = false;
      if (p && p.form === F.rig) {
        /* `machineIdFor` resolves a mirrored pair off the facing. The bottom
           row is anchored at the aimed tile, not the top-left corner. A rig
           naming no machine is a carrier, and hangs on a rope instead. */
        const id = machineIdFor(p.sub);
        const def = id && MACH[M[id]];
        if (def) placed = !!placeMachine(aim.band, id, aim.tx, aim.ty - def.th + 1);
        else placed = !!attachCarrier(worldX(aim.band, aim.tx) + aim.band.tile / 2,
                                      worldY(aim.band, aim.ty) + aim.band.tile / 2, p.sub);
      } else if (p) {
        placed = !!placeTile(aim.band, aim.tx, aim.ty, p.sub, p.form);
      }
      if (armed && placed) clearArmedPlace();
    }
    cmd.place = false;
  }

  /* `shell/input.js` already resolved "this press means feed", reach included.
     The arm is not cleared on success — ten ore into an altar is one action —
     and the sweep above clears it when the last unit goes. */
  if (cmd.feed && aim.valid && aim.band) {
    const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
      ? ui.armedPlace : null;
    const m = machineAt(aim.band, aim.tx, aim.ty);
    if (armed && m) handOne(m, armed.sub, armed.form);
    cmd.feed = false;
  }

  // acts at the player's feet, so no aim gate
  if (cmd.drop) {
    dropHeaviest();
    cmd.drop = false;
  }

  // the inverse of `place`, on the same aim gate
  if (cmd.deconstruct && aim.valid && aim.band) {
    deconstruct(aim.band, aim.tx, aim.ty);
    cmd.deconstruct = false;
  }

  /* Two presses, one key: arm on the first, then link, cut an existing cable,
     or cancel on the same machine. The arm clears on success only, so a
     mis-aimed second press costs one retry. */
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

  /* `!run.offer` lets a completion in the same frame win. */
  if (wants.draft) { if (!run.offer) runw.offer(wants.draft, null); wants.draft = null; }

  raiseOffer();
  applyUiIntents();
}

/* The ids `view/ui/menu.js#settingsRows` draws. A row not named here does
   nothing. */
const SETTING = {
  'set-grid':    () => { flags.showGrid = !flags.showGrid; },
  'set-chunks':  () => { flags.showChunks = !flags.showChunks; },
  'set-debug':   () => { flags.showDebug = !flags.showDebug; },
  'set-collect': toggleAutoCollect,
  'set-feed':    toggleAutoFeed,
  'set-hints':   toggleHints
};

/* The typed seed, or undefined to leave "pick one" to `newRun`'s default. */
const menuSeed = () => {
  const n = Number.parseInt(ui.menu.seed, 10);
  return Number.isFinite(n) ? n : undefined;
};

/* Shared with `?test=1`, so a diorama is reproducible. */
const DEBUG_SEED = 1337;

/* Would taking a menu row throw a run away? `run.t` is the test: the menu
   freezes `step()`, so a generated but unplayed run sits at t = 0. */
const inRun = () => !!player.band && run.t > 0 && !run.dead && !run.won;

function startRun(seed) {
  newRun(seed);
  snapCam();
  setMenuNotice(null);
  closeMenu();
}

/* `load()` calls `newRun` itself, so a payload never reaches a world it did
   not generate. `loadError.reason` is passed through verbatim. */
function continueRun() {
  const ok = load(newRun);
  snapCam();
  setMenuNotice(ok ? null : loadError.reason);
  if (ok) closeMenu(); else setMenuSave(slotState() === 'ok');
}

function startScenario(id) {
  newRun(menuSeed() ?? DEBUG_SEED);
  const ok = applyScenario(id);
  snapCam();
  setMenuNotice(ok ? null : 'NO SCENARIO: ' + id);
  if (ok) closeMenu();
}

/* The rows that discard a run, and so the rows that ask twice. */
const discards = id => id === 'new' || id === 'continue' || id.startsWith('scenario-');

function applyMenuIntents() {
  if (!ui.menu.open) return;
  /* Storage is a device, so `shell` parks the answers for `view`. Affordable
     per frame: `slotState()` parses a 58-byte header, never the body. */
  const slot = slotState();
  setMenuSave(slot === 'ok');
  setMenuStale(slot === 'stale');
  setMenuInRun(inRun());

  const id = wants.menuRow;
  if (!id) return;
  wants.menuRow = null;

  // first press draws CONFIRM?; only a second on the same row goes through
  if (discards(id) && ui.menu.inRun && ui.menu.confirm !== id) { setMenuConfirm(id); return; }
  setMenuConfirm(null);

  if (id === 'resume') closeMenu();
  else if (id === 'new') startRun(menuSeed());
  else if (id === 'seed') setMenuSeedFocus(true);
  else if (id === 'continue') continueRun();
  else if (id === 'controls' || id === 'settings' || id === 'debug') menuPage(id);
  else if (id === 'back') menuPage('root');
  else if (SETTING[id]) SETTING[id]();
  else if (id.startsWith('scenario-')) startScenario(id.slice('scenario-'.length));
}

/* All four tiers in one table: their `draftable()`s are `rules` siblings that
   may not import one another. */
const TIERS = { trinket: trinkets, grant: grants, boon: boons, miracle: miracles };

const candidatesFor = tier => (TIERS[tier]?.draftable() ?? []).map(r => r.id);

/* Fill a half-built `run.offer` and raise the modal. An empty offer never
   opens, so the pause cannot begin with no way to end it. */
function raiseOffer() {
  if (!run.offer) return;
  const o = run.offer;
  if (!o.ids && !draft.offer(o.tier, o.god, candidatesFor(o.tier)).length) return;
  // unreachable while the modal stands, so this cannot churn the stack
  openPanel('draft');
}

function applyDraftIntents() {
  /* A `newRun()` under an open modal would freeze a run with no way out. */
  if (isOpen('draft') && !run.offer?.ids) { closePanel('draft'); return; }
  if (!isOpen('draft')) return;

  /* `deathScreen` draws above the draft, so without this 1/2/3 grants off an
     invisible panel. `run.offer` is written in a substep and the panel opens
     once a frame, so a lethal fall can land between the two. */
  if (run.dead) return;

  draftPointer();

  if (wants.takeCard !== null) {
    const id = run.offer.ids[wants.takeCard];
    const tier = TIERS[run.offer.tier];
    /* A card index the offer does not hold takes nothing. */
    if (id && tier) { tier.grant(id); runw.offer(null); closePanel('draft'); }
    wants.takeCard = null;
    return;
  }

  if (wants.reroll) {
    draft.reroll(run.offer.god, candidatesFor(run.offer.tier));
    wants.reroll = false;
  }
}

/* `view/ui/draft.js`'s ids; the index is the position in `run.offer.ids`. */
const DRAFT_CARD = /^draft-card-(\d+)$/;

/* Sets only the `wants` the 1/2/3 and `r` keys set, in screen space against
   the `drawCam` snapshot. A press on the wash is swallowed: `uiHitPanel`
   returns the topmost rect and the cards are recorded last. */
function draftPointer() {
  if (!cmd.hasMouse || !cmd.uiClick) return;
  const hit = uiHitPanel(cmd.mx - drawCam.x, cmd.my - drawCam.y);
  cmd.uiClick = false;
  if (!hit) return;
  const card = DRAFT_CARD.exec(hit.id);
  if (card) wants.takeCard = Number(card[1]);
  else if (hit.id === 'draft-reroll') wants.reroll = true;
}

/* `view` records the rectangles it drew into `view/ui/state.js#drawn`; the
   hit-tests below run against last frame's, and one frame of lag is
   accepted. */

let prevUiDown = false;

/* A plain click arms a slot; a real drag equips or repositions. Both start
   from one pointerdown, so a movement threshold tells them apart. */
let dragStart = null;      // { sx, sy, gridId, index } | null, set at the down edge
let dragExceeded = false;  // has the pointer moved past the threshold since?
const DRAG_THRESHOLD = 3;

/* A local grid index to `run.inv`'s absolute one: the quickbar's cells are
   `run.inv[run.mainSlots ..]`, the inventory grid's the slots below. */
const absIndex = (gridId, i) => gridId === 'quickbar' ? run.mainSlots + i : i;

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
  /* A panel closing mid-drag strands `cmd.uiDown`, since `shell/input.js`
     routes a pointerup into it only while the panel is open. */
  if (!isOpen('main')) {
    prevUiDown = false;
    if (ui.drag) clearDrag();
    dragStart = null;
    /* The only two controls drawn with no panel open, so without a dispatch
       here the return below swallows the click. Any occupied cell arms on the
       press, the same gate the digit keys carry. */
    if (cmd.hasMouse && cmd.uiClick) {
      const sx = cmd.mx - drawCam.x, sy = cmd.my - drawCam.y;
      const hit = uiHitSlot(sx, sy);
      if (uiHitPanel(sx, sy)?.id === 'hints-toggle') toggleHints();
      else if (hit?.gridId === 'quickbar' && hit.slot.sub != null)
        armPlace(hit.slot.sub, hit.slot.form);
    }
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
      /* Each on its own registered rect, as the search box is. */
      const onAutoCollect = panelHit?.id === 'main-auto-collect';
      const onAutoFeed = panelHit?.id === 'main-auto-feed';

      if (tabHit) setTab(tabHit.row, tabHit.tab);
      else if (onSearch) setSearchFocus(true);
      else if (onHints) toggleHints();
      else if (onAutoCollect) toggleAutoCollect();
      else if (onAutoFeed) toggleAutoFeed();
      else if (slotHit?.gridId === 'recipes' || slotHit?.gridId === 'craft-queue') {
        const ids = uiDrawn.recipeIndex[slotHit.gridId];
        const id = ids && ids[slotHit.slot.index];
        if (id) {
          if (slotHit.gridId === 'craft-queue') cancelQueued(slotHit.slot.index);
          else {
            /* Refused at the click: a queued entry spends nothing until its
               `secs`, so a stalled queue would look like a progressing one. */
            const r = RECIPES[id];
            const known = r && isKnown(id);
            if (known && canCraft(r.in)) queueCraft(id, cmd.uiCtrl ? 99 : cmd.uiShift ? 5 : 1);
            else journalPush('refused', null, { why: known ? 'CANNOT AFFORD' : 'UNKNOWN RECIPE' });
          }
        }
      }

      // any other click blurs the search field
      if (ui.searchFocus && !onSearch) setSearchFocus(false);
    }
  }

  if (cmd.uiWheel) {
    const g = uiHitGrid(sx, sy);
    if (g) scrollBy('main', g.id, Math.sign(cmd.uiWheel));
  }

  /* A hold: the rising edge picks a payload up, the falling edge resolves it
     against whatever slot is under the cursor by then. */
  const downEdge = cmd.uiDown && !prevUiDown, upEdge = !cmd.uiDown && prevUiDown;
  prevUiDown = cmd.uiDown;

  if (downEdge) {
    const hit = uiHitSlot(sx, sy);
    if (hit && hit.slot.sub != null) {
      setDrag({ sub: hit.slot.sub, form: hit.slot.form, n: hit.slot.n, from: hit.gridId, index: hit.slot.index });
      dragStart = { sx, sy, gridId: hit.gridId, index: hit.slot.index };
      dragExceeded = false;
    } else {
      dragStart = null;
    }
  }

  // every frame the button is down, so a slow crossing is still caught
  if (cmd.uiDown && dragStart && !dragExceeded &&
      (Math.abs(sx - dragStart.sx) > DRAG_THRESHOLD || Math.abs(sy - dragStart.sy) > DRAG_THRESHOLD))
    dragExceeded = true;

  if (upEdge && ui.drag) {
    const hit = uiHitSlot(sx, sy);

    /* Released on the same slot with no threshold crossed arms that pair
       instead of running the drag branches. Restricted to the two grids a
       player holds material in, so it never steals an equip drag's click. */
    const clicked = !dragExceeded && hit && dragStart &&
      hit.gridId === dragStart.gridId && hit.slot.index === dragStart.index;
    if (clicked && (hit.gridId === 'inv' || hit.gridId === 'quickbar') &&
        hit.slot.sub != null) {
      armPlace(hit.slot.sub, hit.slot.form);
    } else if (hit && (hit.gridId === 'inv' || hit.gridId === 'quickbar') &&
               (ui.drag.from === 'inv' || ui.drag.from === 'quickbar')) {
      /* One array, sliced two ways. `moveSlot` is an unconditional swap, so
         reorder, cross-grid move and swap-with-occupied are all this call. */
      runw.moveSlot(absIndex(ui.drag.from, ui.drag.index), absIndex(hit.gridId, hit.slot.index));
    } else if (hit && hit.gridId === 'equip') {
      /* Slot to slot only: a relic has nowhere else to be, so the swap is the
         whole of rearranging one. `write.equip` trusts the caller. */
      if (ui.drag.from === 'equip' && ui.drag.index !== hit.slot.index) {
        const other = run.equipped[hit.slot.index];
        runw.equip(hit.slot.index, ui.drag.sub);
        runw.equip(ui.drag.index, other ?? null);
      }
    } else if (ui.drag.from === 'equip') {
      /* Dropped anywhere else puts the relic on the ground as an item, since
         the slot is the only place it was. Clearing it would destroy it. */
      const c = playerCentre();
      if (itemsw.spawn(player.band, c.x, c.y, ui.drag.sub, F.relic, 0, -50))
        runw.equip(ui.drag.index, null);
    }
    clearDrag();
    dragStart = null;
  }
}

/* The completion signal is `rules/crafting.js`'s `'produce'` row, which has no
   `def` key and so is told apart from `rules/machines.js#produce`'s. A head the
   pockets cannot pay for says so once, and clears when the queue empties. */
let refusedHead = null;

function tickCraftQueue() {
  if (!ui.craftQueue.length) { refusedHead = null; return; }
  for (const row of journalPeek()) {
    if (row.kind === 'produce' && row.data && row.data.sub !== undefined && row.data.def === undefined)
      cancelQueued(0);
    if (!ui.craftQueue.length) break;
  }
  const head = ui.craftQueue[0] ?? null;
  const r = head === null ? null : RECIPES[head];
  if (r && !canCraft(r.in)) {
    if (refusedHead !== head) journalPush('refused', null, { why: 'CANNOT AFFORD' });
    refusedHead = head;
  } else refusedHead = null;
}

/* Leads the direction of travel, and looks further down than up. */
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
  /* A band narrower than the viewport centres rather than cornering. Bands
     differ in width, so X clamps to the current band only. */
  const w = widthPx(b);
  cam.x = w > VIEW.w ? clamp(cam.x, b.origin.x, b.origin.x + w - VIEW.w)
                     : b.origin.x + (w - VIEW.w) / 2;

  /* Y clamps to the union of every band: they stack contiguously, each
     `origin.y` at the previous band's bottom edge, so this is one column. */
  const top = bands[0].origin.y;
  const last = bands[bands.length - 1];
  const bottom = last.origin.y + heightPx(last);
  const totalH = bottom - top;
  cam.y = totalH > VIEW.h ? clamp(cam.y, top, bottom - VIEW.h)
                          : top + (totalH - VIEW.h) / 2;
}

/* `updateCamera` only eases, so a camera over the previous world would spend a
   second sliding across the map. */
function snapCam() {
  cam.x = player.x + PW / 2 - VIEW.w / 2;
  cam.y = player.y + PH / 2 - VIEW.h / 2;
  clampCam();
}

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
  /* `render()` rounds `cam` in place, and that is what every rect in `drawn`
     was laid out against, so the snapshot has to be taken right after it. */
  drawCam.x = cam.x; drawCam.y = cam.y;
}

let last = 0;

export function frame(now) {
  const t = now / 1000;
  const real = last ? t - last : STEP;
  last = t;

  /* Cleared here, not by `clearEdges()`, which a zero-substep frame skips. */
  if (wants.restart) { newRun(); wants.restart = false; }

  clock.acc += Math.min(MAX_CATCHUP, real);
  let n = 0;
  while (clock.acc >= STEP) { step(STEP); clock.acc -= STEP; n++; }
  if (!n) { clock.dt = real; }               // keep the FPS readout honest

  tickCraftQueue();
  applyIntents();

  /* `cmd.hop` is read in a substep, so above 120 Hz an unconditional clear
     would erase a hop before the physics saw it. */
  if (n) clearEdges();
  stepFx(real);
  drainJournal(clock.t);

  draw();
  requestAnimationFrame(frame);
}

/* With `?test=1` the RAF loop does not start: the handle advances an exact
   number of substeps at an exact dt and renders once, so a screenshot is
   bit-reproducible. Nothing here runs in a normal session. */
function installTestHook() {
  globalThis.__mf = {
    ready: true,
    newRun, step, draw, resize,
    clock, cam, player, run, aim, items, machines, cmd, flags,

    /* The array itself, as `items` and `machines` are. Records hold live band
       references, so a test must project fields inside `page.evaluate`. */
    segments,

    /* Projected, unlike `segments`: a mark holds a band record holding typed
       arrays, which no structured clone survives. `ord` names the band. */
    get digQueue() {
      return {
        activeCount: digCount(),
        isFull: digFull(),
        marks: [...digMarks().values()].map(m => ({ ord: m.ord, tx: m.tx, ty: m.ty }))
      };
    },

    // a WORLD hover; a panel's own tooltip is `ui.tooltip` below
    hover: hoverInfo,

    /* Merges two layers that may not import each other. A getter, so every
       read reflects the last `draw()`. */
    get ui() {
      return {
        open: ui.stack.slice(),
        tab: { ...ui.tab },
        focus: ui.focus ? { ...ui.focus } : null,
        drag: ui.drag ? { ...ui.drag } : null,
        search: ui.search,
        searchFocus: ui.searchFocus,
        armedPlace: ui.armedPlace ? { ...ui.armedPlace } : null,
        /* Serialised: everything here must survive a structured clone. */
        linkFrom: ui.linkFrom
          ? { tx: ui.linkFrom.tx, ty: ui.linkFrom.ty, def: ui.linkFrom.def }
          : null,
        /* Recipe ids, FIFO; then the quickbar's slice of `run.inv`. */
        craftQueue: ui.craftQueue.slice(),
        quickbar: run.inv.slice(run.mainSlots).map(s => s ? { ...s } : null),
        hintsOpen: ui.hintsOpen,
        autoCollect: ui.autoCollect,
        autoFeed: ui.autoFeed,
        /* Flattened to values a structured clone survives. `god` is null for a
           debug draft, which can never be rerolled; `pool` is how many
           candidates the cards came from. */
        offer: run.offer?.ids
          ? {
              tier: run.offer.tier,
              ids: run.offer.ids.slice(),
              god: offerGod(),
              pool: run.offer.pool,
              rerollCost: rerollPrice(),
              canReroll: canReroll(offerGod())
            }
          : null,
        panels: uiDrawn.panels.map(p => ({ ...p, closeHit: p.closeHit ? { ...p.closeHit } : null })),
        tabs: uiDrawn.tabs.map(t => ({ ...t, hits: t.hits.map(h => ({ ...h })) })),
        grids: uiDrawn.grids.map(gr => ({ ...gr, slots: gr.slots.map(s => ({ ...s })) })),
        bars: uiDrawn.bars.map(b => ({ ...b })),
        tooltip: uiDrawn.tooltip ? { ...uiDrawn.tooltip, lines: uiDrawn.tooltip.lines.slice() } : null,
        /* Both halves, not a merged view: a disagreement between the state and
           what was painted from it is the bug worth seeing. */
        menu: { ...ui.menu },
        menuDrawn: uiDrawn.menu
          ? { ...uiDrawn.menu,
              rows: uiDrawn.menu.rows.map(r => ({ ...r })),
              keys: uiDrawn.menu.keys.map(k => ({ ...k })) }
          : null
      };
    },

    /* Test only: screenshot tests park the camera at a band the player never
       walked to, which fog of war would otherwise swallow. */
    revealAll: b => worldw.revealAll(b),

    /* A screen pixel without a DOM event; `cmd.mx/my` are world px. */
    mouseAt(sx, sy) { cmd.mx = cam.x + sx; cmd.my = cam.y + sy; cmd.hasMouse = true; },

    /* `applyIntents()` runs per substep rather than per call, which is safe
       because it clears what it consumes: an intent fires exactly once. */
    frames(n, dt = STEP) {
      for (let i = 0; i < n; i++) { step(dt); applyIntents(); clearEdges(); }
      tickCraftQueue();
      stepFx(n * dt);
      drainJournal(clock.t);
      draw();
    },

    /* Edge-triggered commands release after the first substep, as a key
       would. */
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

    /* Driven through what the `ui` getter says was drawn, never a hardcoded
       pixel, which fails at a different buffer size and against an easing
       camera. False if the target was not drawn this frame. */
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

    /* Test only: credits the pockets, bypassing mining and pickup. */
    give(sub, form, n) { runw.collect(sub, form, n); }
  };
}

/* There is no save key: the slot is written when the page goes away, since
   `save()` costs ~25 ms of baseline regenerate. A dead or won run clears the
   slot, and a menu over an unplayed run persists nothing. */
function persist() {
  if (!player.band) return;
  if (ui.menu.open && !inRun()) return;
  if (run.dead || run.won) clearSave(); else save();
}

/* Both are optional: the headless harness stands in a `document` with
   `getElementById` and nothing else. */
function installSaveTriggers() {
  if (typeof addEventListener === 'function') addEventListener('pagehide', persist);
  if (typeof document.addEventListener === 'function')
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
}

if (typeof document !== 'undefined' && document.getElementById('stage')) {
  /* The menu is the default and a URL naming a world the exception. The menu
     freezes `step()`, so it must never open in front of the headless harness,
     which has no URL at all. */
  const inPage = typeof location !== 'undefined';
  const q = new URLSearchParams(inPage ? location.search : '');
  const testMode = q.has('test');
  const scenario = q.get('scenario');
  const seedText = q.get('seed');
  const seedNum = seedText === null ? null : Number.parseInt(seedText, 10);
  const named = Number.isFinite(seedNum);

  boot(named ? seedNum : (testMode || scenario !== null ? DEBUG_SEED : undefined));
  pointer.cam = cam;
  snapCam();
  if (typeof addEventListener === 'function')
    addEventListener('resize', () => clampCam());

  if (scenario !== null) {
    /* A `?scenario=` naming no row lands on the DEBUG page, the one place
       every real id is listed. */
    if (!applyScenario(scenario)) {
      openMenu('debug');
      setMenuNotice('NO SCENARIO: ' + scenario);
    }
  } else if (inPage && !testMode && !named) {
    openMenu('root');
    /* A `?seed=` that is not a number does not silently become a random one. */
    if (seedText !== null) setMenuNotice('BAD SEED: ' + seedText);
  }

  /* Not under `?test=1`: a hidden-page autosave would overwrite the slot a
     save test just wrote, between the write and the reload it measures. */
  if (testMode) { installTestHook(); draw(); }
  else { installSaveTriggers(); requestAnimationFrame(frame); }
}
