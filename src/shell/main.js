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

  /* AND THE MENU FREEZES IT HARDER, because the menu is the state the game
     boots into and the world is generated BEHIND it (see `applyMenuIntents`).
     Guarded here for the reason the map freeze above gives: under `?test=1`
     there is no RAF loop, so the pause has to be a fact about `step()` itself.
     Nothing advances -- not the clock, not the camera -- so the run a player
     takes NEW RUN or CONTINUE into starts at t = 0 however long they spent
     reading the CONTROLS page. */
  if (ui.menu.open) return;

  /* A WON RUN IS OVER (Phase 13d, docs/SPEC.md section 20.2). `run.won` is
     set by `rules/cycles.js` the frame `run.cycle` passes the last shipped
     trial, and from that frame nothing advances: not the clock, not
     `stepAll`, not the camera. Guarded HERE rather than as a `if (run.won)
     return` added to fifteen `rules` modules -- the map freeze one line up is
     the precedent, and it is the same fact ("this frame does not simulate")
     stated once. `run.dead` is deliberately NOT on this line: death leaves
     the world live behind the death screen, items still fall, and changing
     that is not this phase's business. */
  if (run.won) return;

  /* AND A MODAL THE GAME RAISED (D17-A): the draft offer freezes the run the
     same way and in the same place the two guards above do -- nothing
     advances, a carrier under the player holds where it is, and a falling
     item stays in the air until a card is taken. The predicate is
     `shell/ui.js#pausesRun`, stated once there and consulted by
     `applyIntents()` below too, rather than a `'draft'` string written into
     two functions. Guarded HERE and not in `frame()` for the reason the map
     freeze gives at the top of this function: under `?test=1` there is no
     RAF loop, and a test proving the freeze drives exactly this entry
     point. */
  if (pausesRun()) return;

  clock.dt = dt;
  clock.t += dt;
  clock.frame++;

  /* Left mouse and X are the same intent. Resolved here because which DEVICE
     asked is a shell question. */
  const digging = cmd.dig || cmd.mouse;
  /* THE CRAFT QUEUE HOLDS THE ONE CRAFT INTENT DOWN, AND ITS HEAD NAMES THE
     RECIPE. The queue is a second device for a hold no key binds, which is why
     it is folded here and not read inside the rule -- `rules` may not import
     `shell`, and which device asked is the shell question `digging` above
     already answers for mining. What the head buys is the player's own click:
     `rules/crafting.js` makes the row `craftId` names or nothing at all, so a
     click on GEAR can no longer produce a furnace. A hold naming nothing still
     makes the first affordable row (`rules/crafting.js#choose`), which is what
     the two harnesses drive. See `shell/ui.js#ui.craftQueue` for why the queue
     is a convenience over the one-pair-of-hands scalar rather than a change to
     it, and docs/DEVELOPER_GUIDE.md#adding-a-recipe */
  const craftId = ui.craftQueue[0] ?? cmd.craftId ?? null;
  const c = {
    left: cmd.left, right: cmd.right, up: cmd.up, down: cmd.down,
    hop: cmd.hop, dig: digging, place: cmd.place,
    craft: cmd.craft || craftId !== null, craftId,
    /* `action` is a HOLD, like `craft` and `dig` above: `rules/drive.js` reads
       it every substep and supplies torque for exactly the substeps it is
       down. It has to be on THIS object and not read off `cmd` inside the
       rule, because this narrowed set is the whole of what `rules` may see of
       the input device. Renamed from `turn`/`cmd.turn`
       (docs/PLAN-phase12.md §3 D-J): the brief asked for a GENERIC
       "hold to operate a placed machine" verb on `r`, not a crank-specific
       one, so the field name moved with the key. */
    action: cmd.action,
    /* `collect` folds a KEY and a UI PREFERENCE into one HOLD (docs/PLAN-
       phase12.md §3 D-F): `ui.autoCollect` restores the old always-on magnet,
       `cmd.collect` is the manual 'c' hold -- either makes `rules/items.js`
       pick up. Which of the two asked is exactly the "which device/preference
       asked is a shell question" this function already states for `digging`
       above. */
    collect: ui.autoCollect || cmd.collect,
    /* `autoFeed` is a PREFERENCE WITH NO KEY BESIDE IT (Phase 16b, D16-C),
       which is the one way it differs in shape from `collect` above: the
       proximity drain has no manual hold to fold into, because the manual
       path is the feed verb itself (`cmd.feed`, a one-shot EVENT dispatched
       from `applyIntents`, not a substep intent). So this field is the whole
       of the question `rules/machines.js#step` asks before running the
       magnet -- and it is on THIS object rather than read off `ui` inside the
       rule because this narrowed set is the whole of what `rules` may see of
       the session, and `rules` may not import `shell` at all. */
    autoFeed: ui.autoFeed,
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
   machine.

   EXPORTED only so `tools/check.mjs` can drive a
   one-shot intent for real. Every behavioural probe in that file goes through
   `main.step()` (its own `stepReal` helper) precisely so nothing
   re-implements the loop -- but `step()` is the fixed substep and one-shot
   intents are not in it, so an intent probe had no honest entry point at all
   and the harness could only reach `rules` directly (the exception
   `tools/check.mjs` documents for the link verb). One export is cheaper than
   a second copy of this dispatch, and `frame()` and `__mf.frames`/`hold`
   still call it exactly as they did. */
export function applyIntents() {
  /* THE MENU'S OWN INTENTS RESOLVE ABOVE THE FREEZE THEY SIT BEHIND, exactly
     as the draft modal's do below: taking a row is the only thing that ends
     the pause, so it cannot be gated on the pause. Everything after this call
     is a WORLD intent and none of it may happen while the menu stands. */
  applyMenuIntents();
  if (ui.menu.open) return;

  /* Same freeze as `step()`, and the same reason: placing a machine or
     drafting a boon resolves against `aim`, which is a reading of the world
     the player cannot currently see -- the map covers it. A press that lands
     while the map is open is simply dropped, not queued: `clearEdges()` still
     wipes `wants.draft`/`cmd.place` on its own schedule whether or not this
     function consumed them. */
  if (flags.showMap) return;

  /* And the same for a won run, for the same reason `step()` above returns on
     it: the run is over, so a press that lands on the win screen resolves
     nothing in a world that is no longer advancing. `wants.restart` is
     unaffected -- `frame()` consumes it before either guard. */
  if (run.won) return;

  /* THE MODAL'S OWN INTENTS RESOLVE ABOVE THE FREEZE IT CAUSES, which is
     why this call sits before the guard rather than beside the four branches
     at the bottom of this function: taking a card is the only thing that
     ends the pause, so it cannot be gated on the pause. Everything below the
     guard is a WORLD intent -- placing, linking, feeding, raising another
     draft -- and none of it may happen while a god is waiting for an
     answer. */
  applyDraftIntents();
  if (pausesRun()) return;

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
    /* D-A rule 1 (docs/PLAN-phase12.md §4.4): an armed miracle is USED, not
       placed -- `rules/miracles.js#use` takes (band, tx, ty) with no
       occupancy precondition of its own, so this fires whether or not the
       aimed tile is solid, and never falls into the tile/rig resolution
       below. */
    if (armed && armed.form === F.phial) {
      miracles.use(aim.band, aim.tx, aim.ty);
      clearArmedPlace();
    } else {
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
    }
    cmd.place = false;
  }

  /* THE FEED VERB (Phase 16a, docs/SPEC.md section 23), gated on the same
     `aim.valid && aim.band` `cmd.place` above and `cmd.deconstruct` below
     are, and for the same reason: you point at the machine you mean.

     THE DECISION WAS ALREADY MADE. `shell/input.js`'s `pointerdown` resolved
     "this press means feed" once, at the instant of the press, including the
     reach test -- that is D-A's whole design and the reason this branch does
     not re-litigate any of it. What it DOES re-check is the armed pair,
     exactly the way `cmd.place` above re-checks it (`invCount > 0`): a craft
     queue or a drag could have spent the pair between the press and this
     call, and a stale arm must never hand over the wrong material. With
     nothing armed, or with the aimed machine gone (deconstructed in the
     interval), the press evaporates -- no journal row, the same as a
     `cmd.place` with nothing placeable held.

     THE ARM IS DELIBERATELY NOT CLEARED ON SUCCESS. Ten ore into an altar is
     one continuous action, not ten gestures; the staleness sweep at the top
     of this function clears the arm on its own the moment the last unit is
     gone. That is the one way this branch differs in shape from `cmd.place`,
     and docs/SPEC.md section 23.3 is where it is locked. */
  if (cmd.feed && aim.valid && aim.band) {
    const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
      ? ui.armedPlace : null;
    const m = machineAt(aim.band, aim.tx, aim.ty);
    if (armed && m) handOne(m, armed.sub, armed.form);
    cmd.feed = false;
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

  /* A DEBUG KEY RAISES A REQUEST, NOT A GIFT (the four tiers are each
     exercisable by hand behind `flags.showDebug`). It goes through the same
     `run.offer` field a completed trial writes, so there is one raise path
     and one dispatch, and `!run.offer` means a completion the same frame
     wins rather than the two silently overwriting each other -- the
     precedence the old `!wants.draft` test already gave it. */
  if (wants.draft) { if (!run.offer) runw.offer(wants.draft, null); wants.draft = null; }

  raiseOffer();
  applyUiIntents();
}

/* ---------- the main menu (docs/SPEC.md section 30) ----------
   THE WORLD STANDS BEHIND THE MENU RATHER THAN AFTER IT. `boot()` generates a
   run in the order `shell/boot.js`'s header locks, and the menu is opened over
   the result -- so there is one boot path rather than two, `view/scene.js`
   always has a world to draw under the wash, and NEW RUN is the same
   `newRun()` call a restart already makes. The cost is one worldgen that a
   CONTINUE then throws away.

   A ROW IS TAKEN BY ID, never by index: `shell/input.js` reports the id off
   `view/ui/state.js#drawn.menu` and this dispatches it, which is the
   record-what-you-drew idiom `applyUiIntents` below already runs on panels. */

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

/* The seed typed into the menu's own field, or undefined for "pick one" --
   which is `shell/boot.js#newRun`'s own default parameter, so blank means
   random without this function knowing what random is. */
const menuSeed = () => {
  const n = Number.parseInt(ui.menu.seed, 10);
  return Number.isFinite(n) ? n : undefined;
};

/* The seed a debug entry point uses when nothing names one. Shared with
   `?test=1` deliberately: a diorama you cannot reproduce is a diorama you
   cannot report a bug against. */
const DEBUG_SEED = 1337;

/* IS THERE A RUN BEHIND THE MENU THAT TAKING A ROW WOULD THROW AWAY? Three
   callers read this one answer -- the `ui.menu.inRun` mirror `view` draws
   RESUME from, the confirmation gate below, and `persist()` at the bottom of
   this file.

   `run.t` IS THE TEST BECAUSE A PLAYED RUN HAS TIME ON IT AND A GENERATED ONE
   does not. `boot()` generates a world behind the menu and `load()` leaves a
   clean run of the stored seed behind a refusal, and both sit at t = 0 because
   the menu freezes `step()`. A dead or won run is not in progress either,
   since there is nothing to go back to and the slot is cleared rather than
   written (docs/SPEC.md section 27.8). */
const inRun = () => !!player.band && run.t > 0 && !run.dead && !run.won;

function startRun(seed) {
  newRun(seed);
  snapCam();
  setMenuNotice(null);
  closeMenu();
}

/* CONTINUE. `load()` calls `newRun` itself with the stored seed, so a payload
   can never be applied to a world it did not generate (docs/SPEC.md section
   27.4) -- and a refusal therefore leaves the menu standing over a clean run
   of that seed, with the reason on it. `loadError.reason` is verbatim: NO SAVE
   and CORRUPT SAVE are different events and the player can act on the
   difference. */
function continueRun() {
  const ok = load(newRun);
  snapCam();
  setMenuNotice(ok ? null : loadError.reason);
  if (ok) closeMenu(); else setMenuSave(slotState() === 'ok');
}

/* A DIORAMA IS A SCENARIO APPLIED TO A CLEAN RUN, never a second boot path
   (docs/SPEC.md section 29.1). A row naming content that cannot be built says
   so on the menu rather than dropping the player into a world that silently
   ignored the request -- which is only reachable from `?scenario=`, since the
   DEBUG page is generated from the table itself. */
function startScenario(id) {
  newRun(menuSeed() ?? DEBUG_SEED);
  const ok = applyScenario(id);
  snapCam();
  setMenuNotice(ok ? null : 'NO SCENARIO: ' + id);
  if (ok) closeMenu();
}

/* THE ROWS THAT DISCARD A RUN IN PROGRESS, and therefore the rows that ask
   twice (docs/SPEC.md section 30.6). Nothing persists while the menu stands
   over a run that has not been played, so a mistaken NEW RUN here cannot be
   recovered from the slot -- and the row itself is the confirmation, which
   costs no modal and no second owner of the keyboard. A scenario row belongs
   here because it is a `newRun()` with a diorama on top. */
const discards = id => id === 'new' || id === 'continue' || id.startsWith('scenario-');

function applyMenuIntents() {
  if (!ui.menu.open) return;
  /* THE MIRRORS, REFRESHED WHILE THE MENU STANDS. Storage is a device and
     `model` is a layer `view` may only read through the frame context, so
     `shell` answers both questions and parks the answers (docs/SPEC.md
     section 30.2). Affordable every frame because `slotState()` parses a
     58-byte header and never reads the body. */
  const slot = slotState();
  setMenuSave(slot === 'ok');
  setMenuStale(slot === 'stale');
  setMenuInRun(inRun());

  const id = wants.menuRow;
  if (!id) return;
  wants.menuRow = null;

  /* ARMED, NOT TAKEN. The first press on a destructive row records it and
     draws CONFIRM? beside it, and only a second press on the SAME row goes
     through. Any other row taken clears it, as does leaving the page
     (`shell/ui.js#menuPage`) and closing the menu. */
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

/* ---------- the draft (D17-A/D17-B/D17-F) ----------
   SHELL IS THE ONLY LAYER THAT MAY SEE ALL FOUR TIERS AT ONCE. Each tier's
   `draftable()` lives in its own `rules` module and those four are siblings
   that may not import one another, so gathering the candidates, and
   dispatching a taken card back to the tier's own `grant()`, are both here.
   `rules/draft.js` owns what is between: which of the candidates are
   offered, what a reroll costs and whose favour pays for it. */
const TIERS = { trinket: trinkets, grant: grants, boon: boons, miracle: miracles };

const candidatesFor = tier => (TIERS[tier]?.draftable() ?? []).map(r => r.id);

/* Turn a half-built `run.offer` -- a tier with no ids, written by
   `rules/cycles.js#complete` or by a debug key above -- into a real offer,
   and raise the modal over it. An offer with nothing to put in it never
   opens: `rules/draft.js#offer` clears the request and refuses out loud
   instead, so the pause can never begin with no way to end it. */
function raiseOffer() {
  if (!run.offer) return;
  const o = run.offer;
  if (!o.ids && !draft.offer(o.tier, o.god, candidatesFor(o.tier)).length) return;
  /* Unreachable while the modal stands -- the guard above this function's
     caller returns first -- so this cannot churn the stack. It runs when an
     offer exists and the modal does not, which also re-raises one that was
     closed out from under it. */
  openPanel('draft');
}

function applyDraftIntents() {
  /* THE MODAL TRACKS THE OFFER, the same staleness sweep `ui.armedPlace` and
     `ui.linkFrom` get above: a `newRun()` under an open modal would leave a
     panel on the stack freezing a run that has no offer in it, and the
     freeze would have no way out. */
  if (isOpen('draft') && !run.offer?.ids) { closePanel('draft'); return; }
  if (!isOpen('draft')) return;

  /* A DEAD PLAYER CANNOT TAKE A CARD OFF A MODAL THEY CANNOT SEE.
     `view/hud.js#drawHUD` draws `deathScreen` ABOVE the draft, deliberately,
     because the restart button must stay reachable -- so without this the
     1/2/3 keys would grant a permanent gift off an invisible panel. The
     window is narrow but real: `rules/cycles.js#complete` writes `run.offer`
     inside a SUBSTEP and `raiseOffer()` only opens the panel once per frame,
     so the rest of that frame still simulates and a lethal fall lands in it.
     Not merged with the `run.won` guard in the caller: that one stops every
     intent, and death deliberately leaves the world live. The pointer half
     needs no guard -- nothing records a `draft-card-*` rect on a frame the
     modal is not drawn. */
  if (run.dead) return;

  draftPointer();

  if (wants.takeCard !== null) {
    const id = run.offer.ids[wants.takeCard];
    const tier = TIERS[run.offer.tier];
    /* A card index the offer does not hold (three keys, two cards) takes
       nothing and leaves the offer standing. */
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
   which is what makes a click and a number key reach the identical card. */
const DRAFT_CARD = /^draft-card-(\d+)$/;

/* THE MODAL'S POINTER, AND IT IS A SECOND CALLER, NOT A SECOND DISPATCH.
   `applyUiIntents()` below is unreachable while a draft stands -- the pause
   guard in `applyIntents()` returns above it -- so the cards it draws would
   otherwise have nothing to click. This only sets the SAME two `wants`
   `shell/input.js`'s 1/2/3 and `r` branch sets; the take and the favour
   spend stay where they already are, immediately below. Hit-tested in the
   space `view/ui/state.js#drawn` recorded (screen, pre-camera) against the
   `drawCam` snapshot, exactly as `applyUiIntents` does -- see
   docs/DEVELOPER_GUIDE.md#record-what-you-drew.

   A press that lands on the wash, or on the main panel still open beneath
   the modal, is swallowed: `uiHitPanel` returns the topmost recorded rect,
   the draft's cards are recorded last, and nothing below the guard runs. */
function draftPointer() {
  if (!cmd.hasMouse || !cmd.uiClick) return;
  const hit = uiHitPanel(cmd.mx - drawCam.x, cmd.my - drawCam.y);
  cmd.uiClick = false;
  if (!hit) return;
  const card = DRAFT_CARD.exec(hit.id);
  if (card) wants.takeCard = Number(card[1]);
  else if (hit.id === 'draft-reroll') wants.reroll = true;
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
   does its existing equip/reposition job (`upEdge` below, unchanged).
   Both start from the exact same pointerdown -- `shell/input.js`'s own
   header on why `uiDown` exists at all -- so telling them apart needs the
   same movement-threshold trick every drag-and-drop UI uses: remember where
   the press started, and only call the release a "drag" if the pointer
   actually moved past a few pixels first. Screen-space px, the same space
   `sx`/`sy` below are already in. */
let dragStart = null;      // { sx, sy, gridId, index } | null, set at the down edge
let dragExceeded = false;  // has the pointer moved past the threshold since?
const DRAG_THRESHOLD = 3;

/* A local grid index (0-based within EITHER the Character tab's grid or the
   quickbar) to `run.inv`'s own absolute index -- the quickbar's cells are
   `run.inv[run.mainSlots ..]` (docs/PLAN-phase12.md §3 D-H), the inventory
   grid's are `run.inv[0 .. run.mainSlots)`, and this is the one place that
   translation happens. */
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
    /* THE TWO CONTROLS DRAWN WITH NO PANEL OPEN, and the only dispatch this
       branch owes: the KEYS legend toggle and the quickbar's own cells
       (`view/ui/quickbar.js`'s header -- a quickbar is part of the permanent
       HUD). `shell/input.js#onAlwaysOnUi` routes a press on either as a UI
       click, so without a dispatch here the early return below swallows it and
       a cell click arms nothing. Nothing else is live: tabs, the other grids
       and search all belong to the window this branch has established is
       closed.

       ANY OCCUPIED CELL ARMS (docs/SPEC.md section 23.1), the identical gate
       the digit keys carry in `shell/input.js` -- and it must be, because
       `view/ui/quickbar.js#DIGITS`'s "press 3 and the slot showing 3 cannot
       disagree" property only holds while both ways into a slot accept the
       same slots. Armed on the PRESS, not on the release: the click-vs-drag
       threshold below is the panel's, and with no panel open a drag out of a
       cell has no second meaning to be told apart from a click. */
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
      /* AUTO COLLECT (docs/PLAN-phase12.md §3 D-F, §4.5): a click on the
         Character tab's own toggle row, hit-tested against ITS registered
         rect the exact same way the search box and the hints toggle already
         are -- `view/ui/mainPanel.js#drawCharacterTab` draws it and records
         it; this is the one place that reacts. */
      const onAutoCollect = panelHit?.id === 'main-auto-collect';
      /* AUTO FEED (Phase 16b, D16-C): the same row, one line lower, for the
         proximity drain the feed verb replaced. Its own registered rect, so
         a click on it is never mistaken for a click on AUTO COLLECT above it
         or the inventory grid below. */
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
            /* A CLICK THE PLAYER CANNOT PAY FOR IS REFUSED AT THE CLICK, with
               the SAME `'refused'` journal row `rules/placement.js` uses, so
               the toast reads identically to every other refusal in the game.
               This is the immediate half of one answer: a queued entry spends
               nothing until its `secs` is reached, so an unaffordable one
               never bypasses anything -- it simply never completes, and a
               queue that sits still is indistinguishable from one making
               progress. `tickCraftQueue` says the same thing for a head that
               becomes unaffordable after it was queued. */
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
       `shell/ui.js#ui.armedPlace`'s own header. Still restricted to the two
       grids a player actually holds material in, so this never steals a
       click a real equip drag needed.

       ANY OCCUPIED SLOT ARMS (Phase 16a, docs/SPEC.md section 23.1). The
       form gate that used to be on this line -- a tile-capable form, a
       machine's `rig`, or a `phial` -- is gone, because an arm now has two
       possible consequences rather than one: LMB on open ground places it,
       and LMB on a machine that wants it feeds it. Every ore, ingot, plate
       and brand was click-inert before this phase (a confirmed silent
       no-op), and those are precisely what the feed verb hands over. A pair
       that can do neither still arms and is simply inert until aimed;
       `rules/placement.js#placeTile`'s own 'THAT DOES NOT BUILD' is what
       refuses it then, with a reason. `shell/input.js`'s digit-arm gate
       carries the IDENTICAL test and must -- see
       `view/ui/quickbar.js#DIGITS`. */
    const clicked = !dragExceeded && hit && dragStart &&
      hit.gridId === dragStart.gridId && hit.slot.index === dragStart.index;
    if (clicked && (hit.gridId === 'inv' || hit.gridId === 'quickbar') &&
        hit.slot.sub != null) {
      armPlace(hit.slot.sub, hit.slot.form);
    } else if (hit && (hit.gridId === 'inv' || hit.gridId === 'quickbar') &&
               (ui.drag.from === 'inv' || ui.drag.from === 'quickbar')) {
      /* REAL DRAG, real storage (docs/PLAN-phase12.md §3 D-H): the Character
         tab's grid and the quickbar are the SAME array, `run.inv`, sliced
         differently -- `absIndex` below just resolves a local grid index
         back to that array's own index. `runw.moveSlot` is an unconditional
         swap, so same-grid reorder, cross-grid move, and swap-with-occupied
         are all this ONE call: swapping a slot with an empty one already IS
         a move, and swapping two occupied slots already IS the reorder. */
      runw.moveSlot(absIndex(ui.drag.from, ui.drag.index), absIndex(hit.gridId, hit.slot.index));
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
         path was left unwired because `rules/trinkets.js` had no
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
   See docs/DEVELOPER_GUIDE.md#notification-and-the-journal

   AND A HEAD THE POCKETS CANNOT PAY FOR SAYS SO, ONCE. The head is what
   `step()` above hands `rules/crafting.js` as its target, so an unaffordable
   one now makes nothing at all -- a stall indistinguishable from progress,
   which is the same complaint the click-time refusal in `applyUiIntents`
   answers
   for a click that has not been queued yet. The entry is KEPT rather than
   dropped: the answer is to go and mine, and a click on the queue slot
   already cancels. `refusedHead` is the id a row was pushed for, so a stall
   lasting a minute is one journal line and not 3,600 -- and it clears itself
   whenever the queue empties, so a restart cannot leave it stale. */
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

/* THE CAMERA, PUT WHERE A FRESH OR FRESHLY LOADED RUN NEEDS IT. `updateCamera`
   only EASES toward the player, so a camera still parked over the previous
   world spends a second sliding across the map. `shell/save.js` deliberately
   restores nothing about the camera, because the follow and the clamp are this
   file's (docs/SPEC.md section 27.2). */
function snapCam() {
  cam.x = player.x + PW / 2 - VIEW.w / 2;
  cam.y = player.y + PH / 2 - VIEW.h / 2;
  clampCam();
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

    /* THE LIVE SEGMENT LIST, exposed exactly as `items` and
       `machines` already are -- the array itself, not a copy, so a test reads
       whatever is true right now. Segment-transport scenes drive through
       this and through `ui.linkFrom` below, so neither needs a hardcoded click
       coordinate (CLAUDE.md: a click at (400, 300) fails at a different base
       buffer). Records hold live band and machine references, so a Playwright
       test must project the fields it wants INSIDE `page.evaluate` rather than
       returning a record across the boundary. */
    segments,

    /* THE DIG QUEUE, PROJECTED RATHER THAN HANDED OVER, which is the one way
       it differs from `segments` above: `model/digqueue.js#queued()` returns
       the live `Map`, and a mark holds its band RECORD, which holds typed
       arrays -- so none of it survives `page.evaluate`'s structured clone.
       `ord` identifies the band instead (docs/SPEC.md section 28.2). A
       getter, so every read is current. */
    get digQueue() {
      return {
        activeCount: digCount(),
        isFull: digFull(),
        marks: [...digMarks().values()].map(m => ({ ord: m.ord, tx: m.tx, ty: m.ty }))
      };
    },

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
        /* The craft queue (recipe ids, FIFO) and the quickbar's own slice of
           `run.inv` (`{sub,form,n}|null` per slot -- a deliberate, named
           breaking change to this test hook's shape from the old assignment
           table's `{sub,form}|null`, docs/PLAN-phase12.md §3 D-H/§4.6). */
        craftQueue: ui.craftQueue.slice(),
        quickbar: run.inv.slice(run.mainSlots).map(s => s ? { ...s } : null),
        hintsOpen: ui.hintsOpen,
        /* AUTO COLLECT, readable at last (docs/PLAN-phase13.md §4.5). Until
           this line a test could only BLIND-TOGGLE it through
           `toggleAutoCollect()` and had to assume it knew the current value;
           with `setAutoCollect(bool)` beside it a test can now state the
           state it wants and then verify it took -- which is what the
           newRun-resets-it probe (D13-A) actually asserts. */
        autoCollect: ui.autoCollect,
        /* AUTO FEED, readable from day one (Phase 16b, D16-C's own note on
           13c §4.5's complaint): the flag is what decides whether a player
           standing beside a machine loses their pockets to it, so a test
           asserting either half of that has to be able to read the value
           back rather than assume `setAutoFeed` took. */
        autoFeed: ui.autoFeed,
        /* THE STANDING DRAFT OFFER, projected rather than handed over: the
           ids are a live array on `run.offer` and the price and its
           availability are `model/run.js` queries, so all of it is read HERE
           and flattened into plain values that survive `page.evaluate`'s
           structured clone. `god` is null for a debug-key draft, which
           nobody asked for and which therefore can never be rerolled; `pool`
           is how many candidates the cards were drawn from, and a `pool` no
           bigger than `ids` is the other reason `canReroll` reads false.
           Null while no offer stands, and never while one is only
           half-built -- `ids` is what makes an offer real. */
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
        /* THE MENU, BOTH HALVES AND NOT ONE MERGED VIEW: `shell/ui.js#ui.menu`
           is the session state and `drawn.menu` is what was painted from it,
           and a disagreement between the two is exactly the bug worth being
           able to see. Null while the menu drew nothing. */
        menu: { ...ui.menu },
        menuDrawn: uiDrawn.menu
          ? { ...uiDrawn.menu,
              rows: uiDrawn.menu.rows.map(r => ({ ...r })),
              keys: uiDrawn.menu.keys.map(k => ({ ...k })) }
          : null
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

/* ---------- the save triggers (docs/SPEC.md section 27.8) ----------
   THE SLOT IS WRITTEN WHEN THE PAGE GOES AWAY, and there is no save key. A
   `save()` costs about 25 ms of baseline regenerate (section 27.5), which is
   three dropped frames wherever it lands, so it lands where there is no next
   frame to drop: `visibilitychange` to hidden, which fires on a reload, a tab
   switch and a close alike, with `pagehide` behind it for the browsers that
   skip it. Two triggers can both fire on one reload, which costs a second
   identical write and nothing else.

   A DEAD OR WON RUN CLEARS THE SLOT INSTEAD OF WRITING IT. Health is five
   hearts with no respawn (invariant 6), and a slot that resumes the run from
   before the fall is a respawn with extra steps.

   A MENU OVER A RUN NOBODY HAS PLAYED PERSISTS NOTHING, because the run behind
   it is either the one `boot()` generated or the one CONTINUE has just
   refused, and neither is worth the player's only slot. A menu opened from
   INSIDE a run (`shell/input.js`'s Escape branch) is the third case and it
   DOES write -- the run behind it is the player's, and losing it to the one
   key that leaves it would make the menu a trap. `inRun()` is the same
   predicate the RESUME row and the confirmation gate read. */
function persist() {
  if (!player.band) return;
  if (ui.menu.open && !inRun()) return;
  if (run.dead || run.won) clearSave(); else save();
}

/* Both listeners are optional, the same way `shell/boot.js`'s resize listener
   is: `tools/check.mjs` stands in a `document` with `getElementById` and
   nothing else. */
function installSaveTriggers() {
  if (typeof addEventListener === 'function') addEventListener('pagehide', persist);
  if (typeof document.addEventListener === 'function')
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
}

if (typeof document !== 'undefined' && document.getElementById('stage')) {
  /* THE MENU IS THE DEFAULT BOOT STATE AND A URL THAT NAMES A WORLD IS THE
     EXCEPTION, which is the whole of the rule. `?test=1` must reach a live run
     without passing through the menu: the test hook drives a run directly and
     every screenshot baseline photographs a scene rather than a menu.
     `?seed=` and `?scenario=` skip it for the same reason at a keystroke's
     cost, which is what makes a diorama one URL.

     AND A HEADLESS IMPORT HAS NO URL AND NO PLAYER: `tools/check.mjs` stands
     in a `document` and drives `step()` itself, and the menu freezes `step()`,
     so the menu must not open in front of a harness that never asked for
     it. */
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
    /* A `?scenario=` naming no row lands on the DEBUG page with the reason,
       which is the one place every real id is listed. */
    if (!applyScenario(scenario)) {
      openMenu('debug');
      setMenuNotice('NO SCENARIO: ' + scenario);
    }
  } else if (inPage && !testMode && !named) {
    openMenu('root');
    /* A `?seed=` that is not a number does not silently become a random one. */
    if (seedText !== null) setMenuNotice('BAD SEED: ' + seedText);
  }

  /* NOT UNDER `?test=1`. There is no RAF loop there and the page is a harness:
     a hidden-page autosave would overwrite the slot a save test had just
     written, between the write and the reload it is measuring. */
  if (testMode) { installTestHook(); draw(); }
  else { installSaveTriggers(); requestAnimationFrame(frame); }
}
