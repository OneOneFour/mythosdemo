/* LAYER shell — THE LOOP. Fixed timestep, camera, and the wiring of input to
   rules. Imports every layer; the entry point `index.html` loads.

   No `rules` module ever sees a variable dt, so fall damage, mining time and
   machine throughput are functions of the world rather than of the display.
   The accumulator is capped, so a backgrounded tab does not simulate a minute
   in one frame. The journal drains once per FRAME, not per substep. */

import { VIEW, resize, stage } from '../core/canvas.js';
import { clamp } from '../core/math.js';
import { F } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { RECIPES } from '../data/recipes.js';
import { aim } from '../model/aim.js';
import { activeCount as digCount, isFull as digFull, queued as digMarks } from '../model/digqueue.js';
import { items } from '../model/items.js';
import { peek as journalPeek, push as journalPush } from '../model/journal.js';
import { machineAt, machines } from '../model/machines.js';
import { PH, PW, player, write as playerw } from '../model/player.js';
import { canCraft, canReroll, invCount, isKnown, machineIdFor, offerGod, pocketRows, rerollPrice, run, write as runw } from '../model/run.js';
import { linkedTo, segments } from '../model/segments.js';
import { bands, heightPx, widthPx, write as worldw } from '../model/world.js';
import * as draft from '../rules/draft.js';
import { dropHeaviest } from '../rules/items.js';
import { handOne } from '../rules/machines.js';
import { deconstruct, linkSegment, placeMachine, placeTile, placeableFromPockets, unlinkSegment } from '../rules/placement.js';
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

export const STEP = 1 / 120;
export const MAX_CATCHUP = 0.25;             // s of real time simulated per frame

export const clock = { t: 0, dt: 0, frame: 0, acc: 0 };
export const cam = { x: 0, y: 0 };

/* The cam position as of the LAST `draw()`. The UI dispatcher hit-tests
   against this, never the live easing `cam`. */
const drawCam = { x: 0, y: 0 };

/* The frame context handed to `view`. One object, reused, to avoid allocating
   sixty times a second. `mouse` is WORLD px, same space as `cam`. `ui` is
   `shell/ui.js`'s live state, which `view` may read and never write. */
const frameCtx = { cam, t: 0, dt: 0, frame: 0, W: 0, H: 0, flags, ui, mouse: { x: 0, y: 0, has: false } };

export function step(dt) {
  /* The four freezes are guarded HERE and not in `frame()`: the test hook
     calls `step()` directly, so a pause has to be a fact about this function.
     `frame()`'s accumulator keeps draining, so no catch-up backlog waits. */
  if (flags.showMap) return;

  /* The clock does not advance either, so a run entered from the menu starts
     at t = 0 however long the player spent reading. */
  if (ui.menu.open) return;

  /* `run.dead` is deliberately NOT on this line: death leaves the world live
     behind the death screen, and items still fall. */
  if (run.won) return;

  /* The predicate is `shell/ui.js#pausesRun`, stated once there and read by
     `applyIntents()` too, rather than a `'draft'` string in two functions. */
  if (pausesRun()) return;

  clock.dt = dt;
  clock.t += dt;
  clock.frame++;

  /* Left mouse and X are the same intent. Resolved here because which DEVICE
     asked is a shell question. */
  const digging = cmd.dig || cmd.mouse;
  /* The queue is a second device for a hold no key binds, folded here because
     `rules` may not import `shell`. Its head names the recipe, so a click on
     GEAR cannot produce a furnace; a hold naming nothing makes the first
     affordable row. */
  const craftId = ui.craftQueue[0] ?? cmd.craftId ?? null;
  const c = {
    left: cmd.left, right: cmd.right, up: cmd.up, down: cmd.down,
    hop: cmd.hop, dig: digging, place: cmd.place,
    craft: cmd.craft || craftId !== null, craftId,
    /* A HOLD, like `craft` and `dig`. `rules/drive.js` supplies torque for
       exactly the substeps it is down. This narrowed object is the whole of
       what `rules` may see of the input device. */
    action: cmd.action,
    /* A key and a preference folded into one hold. Either makes
       `rules/items.js` pick up. */
    collect: ui.autoCollect || cmd.collect,
    /* A preference with no key beside it, because the manual path is the feed
       verb (`cmd.feed`, a one-shot event, not a substep intent). The whole of
       what `rules/machines.js#step` asks before running the magnet. */
    autoFeed: ui.autoFeed,
    hasMouse: cmd.hasMouse, mx: cmd.mx, my: cmd.my
  };

  stepAll(dt, c);

  /* Presentational, so not a rule. The pick swings on the clock. */
  playerw.set('digging', digging && ((clock.t * 9) | 0) % 2 === 0);
  updateCamera(dt);
}

/* One-shot intents. Placement and drafting are EVENTS, not steps, so they run
   once per ANIMATION FRAME rather than once per substep. Below 120 Hz a frame
   runs several substeps and would re-read the same still-true intent; above
   120 Hz a frame can run ZERO substeps and `clearEdges()` would drop the
   press. Each branch self-clears the flag it consumed immediately, so a flag
   this function never reaches survives to the next frame.

   Exported so the harness can drive a one-shot intent without re-implementing
   the loop. */
export function applyIntents() {
  /* Resolved above the freeze it sits behind, because taking a row is the only
     thing that ends the pause. Everything after this call is a WORLD intent. */
  applyMenuIntents();
  if (ui.menu.open) return;

  /* Placing resolves against `aim`, a reading of the world the map covers. A
     press that lands while it is open is dropped, not queued. */
  if (flags.showMap) return;

  /* `wants.restart` is unaffected: `frame()` consumes it before either
     guard. */
  if (run.won) return;

  /* Before the guard, not beside the branches below, because taking a card is
     the only thing that ends the pause. */
  applyDraftIntents();
  if (pausesRun()) return;

  /* The arm is stale the instant the pockets no longer hold that exact pair.
     Swept once here, before anything below can act on it. */
  if (ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) <= 0) clearArmedPlace();

  /* Same sweep for the other armed thing. A hub deconstructed between the two
     `l` presses would leave `linkFrom` holding a ghost, and `linkCheck` would
     validate a span to it. `machines` is the authority on what exists. */
  if (ui.linkFrom && !machines.includes(ui.linkFrom)) clearLink();

  /* The panel draws over everything and pauses nothing, so placing with it
     open means aiming at a live world you cannot see. Closed HERE so the same
     press both closes it and places. Gated on the intent being present this
     frame, so an open panel alone does not close on an unrelated frame. */
  if (isOpen('main') && (cmd.place || cmd.deconstruct)) closeTop();

  if (cmd.place && aim.valid && aim.band) {
    /* Armed first: a clicked slot means THAT pair, not whichever placeable
       sorts first in HUD order. Re-checked as still held rather than trusted
       from the sweep above, since a craft or a drag could have spent it. */
    const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
      ? ui.armedPlace : null;
    /* An armed miracle is USED, not placed. `use` has no occupancy
       precondition, so this fires whether or not the aimed tile is solid. */
    if (armed && armed.form === F.phial) {
      miracles.use(aim.band, aim.tx, aim.ty);
      clearArmedPlace();
    } else {
      const p = armed || placeableFromPockets(pocketRows())[0];
      let placed = false;
      if (p && p.form === F.rig) {
        /* `machineIdFor` resolves a mirrored pair off the player's facing.
           Anchored bottom row at the aimed tile, so you point at the space a
           machine stands in, not at its top-left corner. */
        const id = machineIdFor(p.sub);
        const def = id && MACH[M[id]];
        if (def) placed = !!placeMachine(aim.band, id, aim.tx, aim.ty - def.th + 1);
      } else if (p) {
        placed = !!placeTile(aim.band, aim.tx, aim.ty, p.sub, p.form);
      }
      if (armed && placed) clearArmedPlace();
    }
    cmd.place = false;
  }

  /* `shell/input.js`'s `pointerdown` already resolved "this press means
     feed", reach test included, so this branch re-litigates none of it. It
     re-checks only the armed pair, the way `cmd.place` does. Nothing armed, or
     the machine gone, and the press evaporates with no journal row.

     THE ARM IS DELIBERATELY NOT CLEARED ON SUCCESS: ten ore into an altar is
     one action, and the sweep at the top clears it when the last unit goes. */
  if (cmd.feed && aim.valid && aim.band) {
    const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
      ? ui.armedPlace : null;
    const m = machineAt(aim.band, aim.tx, aim.ty);
    if (armed && m) handOne(m, armed.sub, armed.form);
    cmd.feed = false;
  }

  /* No aim needed; it acts at the player's feet, so no validity gate. */
  if (cmd.drop) {
    dropHeaviest();
    cmd.drop = false;
  }

  /* The inverse of `place`, on the same aim gate: you point at the machine
     you mean to remove. */
  if (cmd.deconstruct && aim.valid && aim.band) {
    deconstruct(aim.band, aim.tx, aim.ty);
    cmd.deconstruct = false;
  }

  /* Two presses, one key: arm on the first, act on the second. The four
     second-press cases:
       a DIFFERENT machine, not yet joined -> link it. The arm clears on
         SUCCESS only, so a mis-aimed second press costs one retry.
       a machine ALREADY joined -> cut that cable. One key, both directions.
       the SAME machine -> cancel the arm silently. There is no A-to-A cable.
       nothing armed -> arm it.
     `linkedTo` is a `model` query because "is there a cable" is a question;
     `unlinkSegment` is the consequence. */
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

  /* A debug key raises a request, not a gift, through the same `run.offer` a
     completed trial writes. `!run.offer` means a completion the same frame
     wins rather than the two overwriting each other. */
  if (wants.draft) { if (!run.offer) runw.offer(wants.draft, null); wants.draft = null; }

  raiseOffer();
  applyUiIntents();
}

/* The world stands BEHIND the menu, not after it: `boot()` generates a run and
   the menu opens over it, so there is one boot path and `view/scene.js` always
   has a world to draw under the wash. The cost is one worldgen a CONTINUE
   throws away. A row is taken by ID, never by index. */

/* The ids `view/ui/menu.js#settingsRows` draws, and the only coupling between
   the two files. A row this table does not name is a row that does nothing. */
const SETTING = {
  'set-grid':    () => { flags.showGrid = !flags.showGrid; },
  'set-chunks':  () => { flags.showChunks = !flags.showChunks; },
  'set-debug':   () => { flags.showDebug = !flags.showDebug; },
  'set-collect': toggleAutoCollect,
  'set-feed':    toggleAutoFeed,
  'set-hints':   toggleHints
};

/* The seed typed into the menu field, or undefined for "pick one", which is
   `newRun`'s own default, so blank means random without this knowing what
   random is. */
const menuSeed = () => {
  const n = Number.parseInt(ui.menu.seed, 10);
  return Number.isFinite(n) ? n : undefined;
};

/* The seed a debug entry point uses when nothing names one. Shared with
   `?test=1`, so a diorama is always reproducible. */
const DEBUG_SEED = 1337;

/* Is there a run behind the menu that taking a row would throw away? Read by
   the RESUME mirror, the confirmation gate and `persist()`.

   `run.t` is the test because a PLAYED run has time on it and a generated one
   does not -- both `boot()` and a refused `load()` sit at t = 0, since the
   menu freezes `step()`. */
const inRun = () => !!player.band && run.t > 0 && !run.dead && !run.won;

function startRun(seed) {
  newRun(seed);
  snapCam();
  setMenuNotice(null);
  closeMenu();
}

/* `load()` calls `newRun` itself with the stored seed, so a payload can never
   be applied to a world it did not generate, and a refusal leaves the menu
   over a clean run of that seed. `loadError.reason` is verbatim, because NO
   SAVE and CORRUPT SAVE are different events. */
function continueRun() {
  const ok = load(newRun);
  snapCam();
  setMenuNotice(ok ? null : loadError.reason);
  if (ok) closeMenu(); else setMenuSave(slotState() === 'ok');
}

/* A diorama is a scenario applied to a clean run, never a second boot path. A
   row naming content that cannot be built says so rather than dropping the
   player into a world that ignored the request. */
function startScenario(id) {
  newRun(menuSeed() ?? DEBUG_SEED);
  const ok = applyScenario(id);
  snapCam();
  setMenuNotice(ok ? null : 'NO SCENARIO: ' + id);
  if (ok) closeMenu();
}

/* The rows that discard a run in progress, and therefore the rows that ask
   twice. Nothing persists while the menu stands over an unplayed run, so a
   mistaken NEW RUN cannot be recovered from the slot. */
const discards = id => id === 'new' || id === 'continue' || id.startsWith('scenario-');

function applyMenuIntents() {
  if (!ui.menu.open) return;
  /* Storage is a device, so `shell` answers both questions and parks the
     answers for `view`. Affordable every frame because `slotState()` parses a
     58-byte header and never reads the body. */
  const slot = slotState();
  setMenuSave(slot === 'ok');
  setMenuStale(slot === 'stale');
  setMenuInRun(inRun());

  const id = wants.menuRow;
  if (!id) return;
  wants.menuRow = null;

  /* The first press on a destructive row draws CONFIRM? beside it; only a
     second press on the SAME row goes through. */
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

/* `shell` is the only layer that may see all four tiers at once, because each
   tier's `draftable()` lives in a `rules` module and those four are siblings
   that may not import one another. `rules/draft.js` owns what is between --
   which candidates are offered, what a reroll costs, whose favour pays. */
const TIERS = { trinket: trinkets, grant: grants, boon: boons, miracle: miracles };

const candidatesFor = tier => (TIERS[tier]?.draftable() ?? []).map(r => r.id);

/* Turn a half-built `run.offer`, a tier with no ids, into a real offer and
   raise the modal. An offer with nothing in it never opens, so the pause can
   never begin with no way to end it. */
function raiseOffer() {
  if (!run.offer) return;
  const o = run.offer;
  if (!o.ids && !draft.offer(o.tier, o.god, candidatesFor(o.tier)).length) return;
  /* Unreachable while the modal stands, since the caller's guard returns
     first, so this cannot churn the stack. */
  openPanel('draft');
}

function applyDraftIntents() {
  /* The same staleness sweep `armedPlace` and `linkFrom` get. A `newRun()`
     under an open modal would freeze a run with no offer and no way out. */
  if (isOpen('draft') && !run.offer?.ids) { closePanel('draft'); return; }
  if (!isOpen('draft')) return;

  /* `view/hud.js` draws `deathScreen` ABOVE the draft so the restart button
     stays reachable, so without this the 1/2/3 keys would grant a gift off an
     invisible panel. The window is narrow but real: `run.offer` is written in
     a SUBSTEP and the panel opens once per frame, so a lethal fall can land in
     the rest of that frame. */
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

/* `view/ui/draft.js`'s own ids. The index is the position in `run.offer.ids`,
   so a click and a number key reach the identical card. */
const DRAFT_CARD = /^draft-card-(\d+)$/;

/* A second CALLER, not a second dispatch. `applyUiIntents()` is unreachable
   while a draft stands, so the cards would have nothing to click. This sets
   only the same two `wants` the 1/2/3 and `r` keys set. Hit-tested in screen
   space against the `drawCam` snapshot.

   A press on the wash, or on the panel beneath the modal, is swallowed:
   `uiHitPanel` returns the topmost rect and the cards are recorded last. */
function draftPointer() {
  if (!cmd.hasMouse || !cmd.uiClick) return;
  const hit = uiHitPanel(cmd.mx - drawCam.x, cmd.my - drawCam.y);
  cmd.uiClick = false;
  if (!hit) return;
  const card = DRAFT_CARD.exec(hit.id);
  if (card) wants.takeCard = Number(card[1]);
  else if (hit.id === 'draft-reroll') wants.reroll = true;
}

/* A click that does something is `shell` calling `rules`. `view` only draws
   and RECORDS its rectangles into `view/ui/state.js#drawn`; this hit-tests the
   pointer against LAST FRAME's `drawn` and turns a hit into a `shell/ui.js`
   state change or a `rules` call. One frame of lag is accepted. */

let prevUiDown = false;

/* A plain click on a slot arms it for placement; a real drag does the
   equip/reposition job. Both start from the same pointerdown, so they are told
   apart by a movement threshold -- the release counts as a drag only if the
   pointer moved past a few px. Screen-space px, same as `sx`/`sy`. */
let dragStart = null;      // { sx, sy, gridId, index } | null, set at the down edge
let dragExceeded = false;  // has the pointer moved past the threshold since?
const DRAG_THRESHOLD = 3;

/* A local grid index to `run.inv`'s absolute index. The quickbar's cells are
   `run.inv[run.mainSlots ..]`, the inventory grid's are
   `run.inv[0 .. run.mainSlots)`, and this is the one place that translates. */
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
  /* A panel closing mid-drag strands `cmd.uiDown`, because `shell/input.js`
     only routes a pointerup into it while the panel is still open. Both halves
     of the drag state reset here, so no phantom drag survives. */
  if (!isOpen('main')) {
    prevUiDown = false;
    if (ui.drag) clearDrag();
    dragStart = null;
    /* The two controls drawn with no panel open: the KEYS legend toggle and
       the quickbar cells. Without a dispatch here the early return below
       swallows the click. Nothing else is live.

       Any OCCUPIED cell arms, the same gate the digit keys carry, so "press 3
       and the slot showing 3" cannot disagree. Armed on the PRESS, since with
       no panel open a drag out of a cell has no second meaning. */
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
      /* Hit-tested against its own registered rect, the way the search box
         and the hints toggle are. This is the one place that reacts. */
      const onAutoCollect = panelHit?.id === 'main-auto-collect';
      /* Its own registered rect, so a click is never mistaken for AUTO
         COLLECT above it or the inventory grid below. */
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
            /* Refused at the click, with the same `'refused'` journal row
               `rules/placement.js` uses. A queued entry spends nothing until
               its `secs` is reached, so an unaffordable one never completes --
               and a stalled queue looks exactly like a progressing one.
               `tickCraftQueue` covers a head that becomes unaffordable. */
            const r = RECIPES[id];
            const known = r && isKnown(id);
            if (known && canCraft(r.in)) queueCraft(id, cmd.uiCtrl ? 99 : cmd.uiShift ? 5 : 1);
            else journalPush('refused', null, { why: known ? 'CANNOT AFFORD' : 'UNKNOWN RECIPE' });
          }
        }
      }

      /* Any other click blurs the search field, the way clicking outside a
         real text input does. */
      if (ui.searchFocus && !onSearch) setSearchFocus(false);
    }
  }

  if (cmd.uiWheel) {
    const g = uiHitGrid(sx, sy);
    if (g) scrollBy('main', g.id, Math.sign(cmd.uiWheel));
  }

  /* `cmd.uiDown` is a HOLD. The rising edge picks a payload off the slot
     under the cursor; the falling edge resolves it against whatever slot is
     under the cursor NOW, which may be a different one. */
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

  /* Checked every frame the button is down, not only on the edges, so a slow
     drag crossing the threshold between polls is still caught. */
  if (cmd.uiDown && dragStart && !dragExceeded &&
      (Math.abs(sx - dragStart.sx) > DRAG_THRESHOLD || Math.abs(sy - dragStart.sy) > DRAG_THRESHOLD))
    dragExceeded = true;

  if (upEdge && ui.drag) {
    const hit = uiHitSlot(sx, sy);

    /* A plain click, no threshold crossed, released on the SAME slot: arm that
       exact pair rather than running the drag branches below. Restricted to
       the two grids a player holds material in, so it never steals a click an
       equip drag needed.

       Any OCCUPIED slot arms, with no form gate, because an arm has two
       consequences: LMB on open ground places, LMB on a machine feeds. A pair
       that can do neither arms and stays inert until aimed, when
       `placeTile`'s 'THAT DOES NOT BUILD' refuses it with a reason. The
       digit-arm gate in `shell/input.js` carries the identical test. */
    const clicked = !dragExceeded && hit && dragStart &&
      hit.gridId === dragStart.gridId && hit.slot.index === dragStart.index;
    if (clicked && (hit.gridId === 'inv' || hit.gridId === 'quickbar') &&
        hit.slot.sub != null) {
      armPlace(hit.slot.sub, hit.slot.form);
    } else if (hit && (hit.gridId === 'inv' || hit.gridId === 'quickbar') &&
               (ui.drag.from === 'inv' || ui.drag.from === 'quickbar')) {
      /* The Character grid and the quickbar are the SAME array, `run.inv`,
         sliced differently. `moveSlot` is an unconditional swap, so same-grid
         reorder, cross-grid move and swap-with-occupied are all this one
         call. */
      runw.moveSlot(absIndex(ui.drag.from, ui.drag.index), absIndex(hit.gridId, hit.slot.index));
    } else if (hit && hit.gridId === 'equip') {
      /* `write.equip(slot, sub)` trusts the caller to have checked that the
         equip is legal, which is what the three tests below do.
         `form === F.relic` is how `data/forms.js` says a pair IS a trinket,
         so this can never equip ordinary material. */
      if (ui.drag.from === 'inv' && ui.drag.form === F.relic &&
          invCount(ui.drag.sub, F.relic) > 0 && !run.equipped.includes(ui.drag.sub)) {
        runw.equip(hit.slot.index, ui.drag.sub);
      } else if (ui.drag.from === 'equip' && ui.drag.index !== hit.slot.index) {
        const other = run.equipped[hit.slot.index];
        runw.equip(hit.slot.index, ui.drag.sub);
        runw.equip(ui.drag.index, other ?? null);
      }
    } else if (ui.drag.from === 'equip') {
      /* Dropped anywhere that is not another equip slot clears it. */
      runw.equip(ui.drag.index, null);
    }
    clearDrag();
    dragStart = null;
  }
}

/* The completion signal is `rules/crafting.js`'s own `'produce'` journal row,
   shaped `{ sub, form, made }` -- no `def` key, which is what tells it apart
   from `rules/machines.js#produce`'s row (`{ def, made }`, no `sub`).
   `journal.js#peek()` is non-destructive, so `shell/notify.js` still drains
   the same rows for sound and text.

   A head the pockets cannot pay for says so ONCE. The entry is KEPT rather
   than dropped, since the answer is to go and mine. `refusedHead` is the id a
   row was pushed for, so a minute-long stall is one journal line, and it
   clears when the queue empties so a restart cannot leave it stale. */
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

/* Leads the player in the direction of travel, and looks further DOWN than up.
   Clamped to the band the player is in, so resizing the window moves the
   camera and nothing else. */
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
  /* A band narrower than the viewport centres rather than clamping to a
     corner. Bands differ in width, so X clamps to the CURRENT band only. */
  const w = widthPx(b);
  cam.x = w > VIEW.w ? clamp(cam.x, b.origin.x, b.origin.x + w - VIEW.w)
                     : b.origin.x + (w - VIEW.w) / 2;

  /* Y clamps to the UNION of every band, not the current one. Bands stack
     contiguously, each `origin.y` at the previous band's bottom edge, so this
     is one seamless column. A per-band clamp capped `cam.y` at the current
     floor while the player descended past it, then snapped a full viewport
     height the instant `player.band` flipped. */
  const top = bands[0].origin.y;
  const last = bands[bands.length - 1];
  const bottom = last.origin.y + heightPx(last);
  const totalH = bottom - top;
  cam.y = totalH > VIEW.h ? clamp(cam.y, top, bottom - VIEW.h)
                          : top + (totalH - VIEW.h) / 2;
}

/* `updateCamera` only EASES, so a camera parked over the previous world would
   spend a second sliding across the map. `shell/save.js` restores nothing
   about the camera; the follow and the clamp are this file's. */
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
  /* `render()` rounds `cam` to integers IN PLACE, and that is the position
     every rectangle in `drawn` was laid out against. `updateCamera()` eases
     `cam` again continuously, even at rest, so the live `cam` by the time
     `applyUiIntents()` runs can differ by more than a pixel. Snapshotted HERE,
     right after the rounding, so a click resolves against what was drawn. */
  drawCam.x = cam.x; drawCam.y = cam.y;
}

let last = 0;

export function frame(now) {
  const t = now / 1000;
  const real = last ? t - last : STEP;
  last = t;

  /* Self-cleared here rather than by `clearEdges()`, which is skipped on a
     zero-substep frame -- a restart left set would fire every frame until a
     substep finally ran. */
  if (wants.restart) { newRun(); wants.restart = false; }

  clock.acc += Math.min(MAX_CATCHUP, real);
  let n = 0;
  while (clock.acc >= STEP) { step(STEP); clock.acc -= STEP; n++; }
  if (!n) { clock.dt = real; }               // keep the FPS readout honest

  tickCraftQueue();
  applyIntents();

  /* `cmd.hop` is read inside a fixed substep, so it may only be cleared once
     one has run. Above 120 Hz a frame can run zero substeps, and clearing
     unconditionally erased a hop before the physics saw it. */
  if (n) clearEdges();
  stepFx(real);
  drainJournal(clock.t);

  draw();
  requestAnimationFrame(frame);
}

/* With `?test=1` the RAF loop does not start. The handle advances an exact
   number of substeps at an exact dt and renders once, so a screenshot is
   bit-reproducible. Nothing here runs in a normal session. */
function installTestHook() {
  globalThis.__mf = {
    ready: true,
    newRun, step, draw, resize,
    clock, cam, player, run, aim, items, machines, cmd, flags,

    /* The array itself, not a copy, as `items` and `machines` are. Records
       hold live band and machine references, so a Playwright test must project
       the fields it wants INSIDE `page.evaluate` rather than return a record
       across the boundary. */
    segments,

    /* Projected rather than handed over, unlike `segments` above: a mark holds
       its band RECORD, which holds typed arrays, so none of it survives
       `page.evaluate`'s structured clone. `ord` identifies the band instead. A
       getter, so every read is current. */
    get digQueue() {
      return {
        activeCount: digCount(),
        isFull: digFull(),
        marks: [...digMarks().values()].map(m => ({ ord: m.ord, tx: m.tx, ty: m.ty }))
      };
    },

    /* What a WORLD-hover tooltip would show right now. A panel's own tooltip
       is a separate read-back, `ui().tooltip` below. */
    hover: hoverInfo,

    /* Composed HERE, in `shell`, because it merges two layers that may not
       import each other: `shell/ui.js#ui` and `view/ui/state.js#drawn`. A
       GETTER, so every read reflects the last `draw()`. */
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
        /* Serialised to `{tx, ty, def}` rather than handed over, because
           `linkFrom` holds a live machine holding typed arrays and everything
           this getter returns must survive a structured clone. */
        linkFrom: ui.linkFrom
          ? { tx: ui.linkFrom.tx, ty: ui.linkFrom.ty, def: ui.linkFrom.def }
          : null,
        /* Recipe ids, FIFO, and the quickbar's slice of `run.inv` as
           `{sub,form,n}|null` per slot. */
        craftQueue: ui.craftQueue.slice(),
        quickbar: run.inv.slice(run.mainSlots).map(s => s ? { ...s } : null),
        hintsOpen: ui.hintsOpen,
        /* Readable, so a test can state the value it wants and verify it took
           rather than blind-toggle and assume. */
        autoCollect: ui.autoCollect,
        /* Decides whether a player standing beside a machine loses their
           pockets to it, so a test must read it back. */
        autoFeed: ui.autoFeed,
        /* Flattened into plain values that survive a structured clone. `god`
           is null for a debug-key draft, which can never be rerolled. `pool`
           is how many candidates the cards were drawn from, and a `pool` no
           bigger than `ids` is the other reason `canReroll` reads false.
           `ids` is what makes an offer real. */
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
        /* Both halves, not one merged view: `ui.menu` is the session state,
           `drawn.menu` is what was painted from it, and a disagreement is the
           bug worth seeing. Null while the menu drew nothing. */
        menu: { ...ui.menu },
        menuDrawn: uiDrawn.menu
          ? { ...uiDrawn.menu,
              rows: uiDrawn.menu.rows.map(r => ({ ...r })),
              keys: uiDrawn.menu.keys.map(k => ({ ...k })) }
          : null
      };
    },

    /* TEST ONLY, and the only caller of `write.revealAll`. Screenshot tests
       park the camera at a band the player never walked to, to prove terrain
       rendering, which fog of war would otherwise swallow. */
    revealAll: b => worldw.revealAll(b),

    /* Move the pointer to a SCREEN pixel without a real DOM event.
       `cmd.mx/my` are WORLD px, so this is `toWorld`'s arithmetic. */
    mouseAt(sx, sy) { cmd.mx = cam.x + sx; cmd.my = cam.y + sy; cmd.hasMouse = true; },

    /* Advance n substeps at a fixed dt, then draw once. `applyIntents()` runs
       per substep rather than per call, which is safe because it self-clears
       what it consumes, so an intent set once still fires exactly once. */
    frames(n, dt = STEP) {
      for (let i = 0; i < n; i++) { step(dt); applyIntents(); clearEdges(); }
      tickCraftQueue();
      stepFx(n * dt);
      drainJournal(clock.t);
      draw();
    },

    /* Hold a command set down for n substeps. Edge-triggered commands release
       after the first substep, as a real key would. */
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

    /* Driven through what the `ui` getter says was actually drawn, NEVER a
       hardcoded pixel coordinate -- one fails at a different base buffer size,
       and against a still-easing camera. Each case locates its rect, converts
       to a WORLD position as `mouseAt` does, arms the matching `cmd.ui*` flag
       and runs one substep. Returns false if the target was not drawn this
       frame. */
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

    /* TEST ONLY. Credits into the pockets, bypassing every mining and pickup
       rule, to arrange a scenario without re-proving either. */
    give(sub, form, n) { runw.collect(sub, form, n); }
  };
}

/* The slot is written when the page goes away, and there is no save key. A
   `save()` costs about 25 ms of baseline regenerate, three dropped frames, so
   it lands where there is no next frame to drop. `pagehide` backs
   `visibilitychange` up for the browsers that skip it; both firing on one
   reload costs a second identical write and nothing else.

   A dead or won run CLEARS the slot, because a slot that resumes from before
   the fall is a respawn with extra steps. A menu over an unplayed run persists
   nothing; a menu opened from INSIDE a run does write, or the one key that
   leaves a run would be a trap. */
function persist() {
  if (!player.band) return;
  if (ui.menu.open && !inRun()) return;
  if (run.dead || run.won) clearSave(); else save();
}

/* Both listeners are optional: the headless harness stands in a `document`
   with `getElementById` and nothing else. */
function installSaveTriggers() {
  if (typeof addEventListener === 'function') addEventListener('pagehide', persist);
  if (typeof document.addEventListener === 'function')
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
}

if (typeof document !== 'undefined' && document.getElementById('stage')) {
  /* The menu is the default boot state and a URL naming a world is the
     exception. `?test=1`, `?seed=` and `?scenario=` all skip it, so a diorama
     is one URL. A headless import has no URL and no player, and the menu
     freezes `step()`, so it must not open in front of a harness. */
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
