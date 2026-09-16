/* LAYER shell — MUTABLE UI STATE for the canvas-drawn widget layer (D2 in
   CLAUDE.md §"Resolved decisions", docs/BUILD_PLAN.md Phase 5a). Imports
   nothing.

   WHY THIS IS SHELL AND NOT VIEW: which panel is open, the active tab per
   panel, the focused slot, the drag payload, the search string and each
   grid's scroll offset are all facts about the SESSION, not about the WORLD.
   See docs/DEVELOPER_GUIDE.md#where-does-state-go. `view` may not import
   `shell`, so this object is handed to `view` through
   `shell/main.js#frameCtx`, exactly as `shell/input.js#flags` already is.

   `ui.stack` is a STACK, not a single id, so a future modal (a "really
   deconstruct this?" confirmation) can sit on top of the tabbed window
   without the window losing its own open/tab state. Escape pops exactly the
   top entry — see `closeTop()` — never the whole stack, so a modal closes
   without also closing the window underneath it.

   Every export here is a plain function mutating properties on the one `ui`
   object below, per docs/DEVELOPER_GUIDE.md#cross-module-mutable-state. */

/* ============================================================================
   THE KEYMAP, DECLARED ONCE, READ BY TWO LAYERS.

   `view/ui/menu.js`'s CONTROLS page is generated from this array. It is here
   and not in `view` because a binding is a DEVICE fact and `shell` owns
   devices, and it is reachable from `view` without an illegal import because
   `ui` below carries it (`keymap`) and `shell/main.js#frameCtx` already hands
   `ui` to every render — so the menu reads `f.ui.keymap` the same way it reads
   `f.ui.menu`. `shell/input.js` imports `KEYMAP` directly; same layer, legal.

   ONE LIST, NOT TWO. Before this, the binding set existed as prose in
   `shell/input.js`'s own header plus one `if (key === ...)` clause per verb,
   and a shortcuts page hand-copied from either would have drifted from both
   the first time a letter moved.

   ROW SHAPE, and what each field is for:

     id      the VERB. Unique across the whole table, and what
             `shell/input.js` is to dispatch on.
     codes   the `e.key` values, LOWERCASED, exactly as `input.js` compares
             them. `null` for a binding with no key (the pointer).
     keys    the DISPLAY string. Given rather than derived from `codes`,
             because the derived form of the movement row is
             'W A S D ARROWUP ARROWDOWN ARROWLEFT ARROWRIGHT'.
     label   what the verb does, in the present tense. Measured by the menu's
             layout pass, so a long one widens the page rather than
             overrunning it (CLAUDE.md D8).
     hold    the key must stay down for the verb to keep happening. Mining,
             cranking and collecting are holds on purpose; everything else is
             an edge.

   A GROUP'S `when` IS THE CONTEXT ITS ROWS ONLY EXIST IN, and it is drawn as
   the group heading, so a row that only works while the map is open says so
   rather than reading as a global binding that does nothing. */
export const KEYMAP = Object.freeze([
  { when: 'IN THE MENU', rows: [
    { id: 'menuMove',   codes: ['w', 's', 'arrowup', 'arrowdown'], keys: 'W/S', label: 'MOVE THE CURSOR' },
    { id: 'menuPage',   codes: ['a', 'd', 'arrowleft', 'arrowright'], keys: 'A/D', label: 'PAGE THIS LIST' },
    { id: 'menuSelect', codes: ['enter', ' '], keys: 'ENTER', label: 'TAKE THE ROW' },
    { id: 'menuBack',   codes: ['escape'], keys: 'ESC', label: 'BACK, THEN PLAY' }
  ] },
  /* ESCAPE ESCALATES, and this is its last step rather than a second binding
     beside `closeTop` below. The key closes a panel, cancels an armed pair or
     leaves the map first, and reaches the menu only when none of those is
     standing. `shell/input.js`'s Escape branch states that order. */
  { when: 'WITH NOTHING ELSE OPEN', rows: [
    { id: 'menu', codes: ['escape'], keys: 'ESC', label: 'OPEN THE MENU' }
  ] },
  { when: 'ON FOOT', rows: [
    { id: 'move', codes: ['a', 'd', 'w', 's', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
      keys: 'WASD/ARROWS', label: 'WALK, CLIMB' },
    { id: 'hop',  codes: [' '], keys: 'SPACE', label: 'HOP' }
  ] },
  { when: 'HANDS', rows: [
    { id: 'work',        codes: null,          keys: 'LMB', label: 'MINE, PLACE, FEED', hold: true },
    { id: 'action',      codes: ['r'],         keys: 'R',   label: 'TURN A CRANK', hold: true },
    { id: 'collect',     codes: ['c'],         keys: 'C',   label: 'COLLECT ITEMS', hold: true },
    { id: 'drop',        codes: ['q'],         keys: 'Q',   label: 'DROP A PAIR' },
    { id: 'link',        codes: ['l'],         keys: 'L',   label: 'LINK TWO HUBS' },
    { id: 'deconstruct', codes: ['backspace'], keys: 'BACKSPACE', label: 'DECONSTRUCT' }
  ] },
  { when: 'POCKETS', rows: [
    { id: 'panel',    codes: ['e'], keys: 'E', label: 'OPEN THE PANEL' },
    { id: 'armSlot',  codes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      keys: '1 - 0', label: 'ARM QUICKBAR SLOT' },
    { id: 'cancel',   codes: ['z'], keys: 'Z', label: 'CANCEL SELECTION' },
    { id: 'closeTop', codes: ['escape'], keys: 'ESC', label: 'CLOSE, CANCEL' }
  ] },
  { when: 'LOOKING', rows: [
    { id: 'map',   codes: ['o'], keys: 'O', label: 'MAP OVERVIEW' },
    { id: 'grid',  codes: ['g'], keys: 'G', label: 'GRID OVERLAY' },
    { id: 'mute',  codes: ['m'], keys: 'M', label: 'MUTE' },
    { id: 'debug', codes: ['h'], keys: 'H', label: 'DEBUG MODE' }
  ] },
  { when: 'WHILE THE MAP IS OPEN', rows: [
    { id: 'mapPan',    codes: ['a', 'd', 'w', 's', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
      keys: 'WASD/ARROWS', label: 'SCROLL' },
    { id: 'mapZoom',   codes: ['-', '=', '[', ']'], keys: '- / =', label: 'ZOOM OUT, IN' },
    { id: 'mapFollow', codes: ['f'], keys: 'F', label: 'FOLLOW THE PLAYER' },
    { id: 'mapLayer',  codes: ['1', '2', '3', '4', '5', '6', '7'], keys: '1 - 7', label: 'TOGGLE A LAYER' },
    { id: 'mapClose',  codes: ['escape'], keys: 'ESC', label: 'CLOSE THE MAP' }
  ] },
  { when: 'WHILE A DRAFT STANDS', rows: [
    { id: 'takeCard', codes: ['1', '2', '3'], keys: '1 2 3', label: 'TAKE THAT CARD' },
    { id: 'reroll',   codes: ['r'], keys: 'R', label: 'REROLL THE OFFER' }
  ] },
  /* Behind `flags.showDebug`, which `h` above toggles. A no-op with it off,
     which is why the DEBUG page says out loud that the gate exists. */
  { when: 'DEBUG MODE ONLY', debug: true, rows: [
    { id: 'draftTrinket', codes: ['t'], keys: 'T', label: 'DRAFT A TRINKET' },
    { id: 'draftBoon',    codes: ['b'], keys: 'B', label: 'DRAFT A BOON' },
    { id: 'draftGrant',   codes: ['k'], keys: 'K', label: 'DRAFT A GRANT' },
    { id: 'draftMiracle', codes: ['y'], keys: 'Y', label: 'DRAFT A MIRACLE' },
    { id: 'chunks',       codes: ['p'], keys: 'P', label: 'CHUNK OVERLAY' }
  ] }
]);

export const ui = {
  stack: [],                    // panel ids; last = topmost = frontmost open
  tab: Object.create(null),     // panel id -> active tab id
  focus: null,                  // { panel, index } | null — the focused slot
  drag: null,                   // { sub, form, n, from } | null — held payload
  search: '',
  searchFocus: false,           // is the CRAFTING tab's search field capturing keys
  scroll: Object.create(null),  // `${panel}:${grid}` -> row offset (integer)

  /* ---- both UI STATE and both deliberately NOT model ----

     `craftQueue`: an ARRAY of recipe ids, FIFO, head = in progress. THE QUEUE
     IS NOT A MECHANIC CHANGE. `rules/crafting.js` is a SCALAR on `run`
     (`craftProgress`/`craftRecipe`) because a player has one pair of hands,
     and it forgets the bar the instant the craft intent goes false. Actually
     running more than one craft in flight would be a change to THAT. So the
     queue re-asserts the SAME one intent every frame it is non-empty
     (`shell/main.js#step`), and drains one entry per completed hand-craft
     (`shell/main.js#tickCraftQueue`, which reads `model/journal.js#peek()`'s
     'produce' rows rather than touching `rules/crafting.js` at all).
     Cancelling costs nothing to refund: `rules/crafting.js` never spends a
     single input until the recipe's `secs` is reached, so removing a queued
     entry before then has nothing to give back.

     The quickbar is NOT session state any more (docs/PLAN-phase12.md §3
     D-H): its cells are the tail of `run.inv` itself
     (`run.inv[run.mainSlots ..]`), the same physical storage the Character
     tab's grid draws. There is no `ui.quickbar` left to own here. */
  craftQueue: [],
  /* One toggleable line of key hints (the QUICKBAR section),
     collapsed by default so the permanent bottom bar stays as dense as the
     rest of this layer. */
  hintsOpen: false,

  /* AUTO COLLECT (docs/PLAN-phase12.md §3 D-E/D-F): whether the old
     always-on pickup magnet is restored. Default FALSE -- items no longer
     auto-collect; holding 'c' (`cmd.collect`, a HOLD) collects manually
     instead.

     IT LIVES IN `shell` FOR A LAYERING REASON, not because it is cosmetic:
     `rules/items.js` may only import `core`/`data`/`model`
     (`tools/layers.mjs`), so it could never read a `shell` field by import
     even if it wanted to, and `shell/main.js#step()` already folds a "which
     device/preference asked" question into the narrowed command object it
     hands every `rules` step (`digging = cmd.dig || cmd.mouse`) -- this is
     the identical shape, not a new mechanism. Putting it on `run` would need
     a `RUN_SCHEMA` field for a fact no world-state fingerprint should carry.

     BUT IT IS SIMULATION-AFFECTING INPUT STATE, NOT A PRESENTATION
     PREFERENCE LIKE MUTE OR THE GRID OVERLAY, and it is therefore RESET ON
     EVERY RUN -- `shell/boot.js#newRun`'s teardown calls
     `setAutoCollect(false)` beside every model `clear()` (D13-A,
     docs/PLAN-phase13.md §4.3). It ORs into `cmd.collect`, which gates
     `model/run.js#write.collect`, which changes `run.inv`, which changes
     burden, which changes climb speed and carrier load. Left sticky, a
     restart on the same seed would replay differently depending on what the
     player had clicked before dying -- precisely the determinism bug
     invariant 8 names, and the cost of losing one click in a panel the
     player opens anyway is worth paying to avoid it. There is no
     `localStorage` (CLAUDE.md forbids it), so nothing survives a page
     reload either way. */
  autoCollect: false,

  /* AUTO FEED (Phase 16b, docs/PLAN-phase16-interaction-model-v2.md §5
     D16-C): whether the old always-on PROXIMITY DRAIN is restored. Default
     FALSE -- standing beside a machine no longer empties your pockets into
     it; the feed verb (click a slot to arm the pair, aim at a
     reachable machine, LMB) hands over ONE unit per press instead.

     THE EXACT SHAPE OF `autoCollect` ABOVE, DELIBERATELY, and for the same
     two reasons. It lives in `shell` because `rules/machines.js` may only
     import `core`/`data`/`model` (`tools/layers.mjs`), so it could never read
     a `shell` field by import even if it wanted to -- `shell/main.js#step()`
     folds it into the narrowed command object every `rules` step already
     receives, which is the same "which device/preference asked is a shell
     question" merge `digging` and `collect` are. And it is not on `run`
     because that would need a `RUN_SCHEMA` field for a fact no world-state
     fingerprint should carry.

     AND IT IS SIMULATION-AFFECTING INPUT STATE, NOT A PRESENTATION
     PREFERENCE LIKE MUTE OR THE GRID OVERLAY, so it is RESET ON EVERY RUN
     the same way -- `shell/boot.js#newRun`'s teardown calls
     `setAutoFeed(false)` immediately beside `setAutoCollect(false)`. This is
     D13-A's answer applied unchanged rather than a second policy invented
     beside it (D16-C says so in as many words): it gates
     `rules/machines.js#handFeed`, which spends `run.inv` and fills a
     machine buffer, which moves burden, climb speed, what a recipe can run
     and -- through `rules/cycles.js#drainReceivers` -- whether a trial gets
     paid. Left sticky, a restart on the same seed would replay differently
     depending on what the player had clicked before dying, which is exactly
     invariant 8's determinism bug. */
  autoFeed: false,

  /* CLICK-TO-ARM PLACEMENT: `{ sub, form } | null` -- the specific held pair
     a click on its Character-tab or quickbar slot has selected as "place
     THIS one next", replacing the placeholder rule (`rules/placement.js
     #placeableFromPockets`'s own header: "the first placeable pair in the
     pockets, in HUD order... a real build menu would let the player
     choose") with a real choice. Still just a fact about the SESSION, same
     as everything else in this file: arming a pair does not touch `run` at
     all, only which pair `shell/main.js#applyIntents`'s `cmd.place` branch
     reaches for first. Cleared by `shell/main.js` the instant it stops
     being true -- placed successfully, no longer held (spent by a craft,
     dropped, picked clean), or Escape (`shell/input.js`). */
  armedPlace: null,

  /* THE ARMED LINK ENDPOINT (Phase 8d, docs/PLAN-gears-and-winches.md section
     4.5): the machine RECORD a first `l` press has selected as "one end of the
     next cable", or null. Which endpoint is armed is a fact about the SESSION,
     exactly like `armedPlace` above -- arming one touches no `model` state at
     all, only which pair `shell/main.js#applyIntents`'s `cmd.link` branch
     passes to `rules/placement.js#linkSegment` on the SECOND press. Handed to
     `view` through `frameCtx` for the cable ghost; `view` may not
     import `shell`.

     A RECORD, not a `{tx, ty}` pair: `linkCheck` needs the machine itself,
     machines never move, and holding the record is what makes the stale test
     in `shell/main.js` a one-line identity check against `machines` rather
     than a coordinate search. The `__mf` projection serialises it to
     `{tx, ty, def}` at the boundary instead -- a projection of real state,
     never a copy of it (CLAUDE.md D2).

     Cleared by `shell/main.js` the instant it stops being true: linked
     successfully, cut, aimed at the same machine again, the machine
     deconstructed out from under it, or Escape (`shell/input.js`). */
  linkFrom: null,

  /* ---- THE OVERVIEW'S SCROLL, ZOOM AND LAYER TOGGLES ----
     Where the map is looking, how far in, whether it is following the player
     and which metadata layers are on. All of it is a fact about the SESSION,
     exactly like every other field in this file: opening the map, scrolling
     it and turning the ORE layer off touch no `model` state at all. Handed to
     `view` through `shell/main.js#frameCtx`; `view` may not import `shell`
     (CLAUDE.md D2).

     `x`/`y` are WORLD PIXELS of the map viewport's top-left corner, not tiles
     and not screen px -- a tile offset is meaningless between two bands whose
     `tile` sizes differ (`data/world.js`'s own reasoning for `origin` being in
     pixels), and a screen offset would change meaning on every zoom step.
     They are stored UNCLAMPED and `view/overview.js#transform` clamps them to
     the band union every frame, reading that union exactly the way
     `shell/main.js#clampCam` does -- so there is one clamp, it cannot be
     bypassed, and a stale offset from before a `newRun()` reallocated the
     world simply lands back inside it.

     `zoom` is 0 for "the default this viewport width implies" and otherwise
     one of `view/overview.js#MAP_ZOOM`'s integer levels. Stored rather than
     derived so a chosen zoom survives a window resize; 0 rather than a
     concrete number so the default can be a function of the viewport, which
     `shell` has no business computing.

     `follow` defaults TRUE and ANY manual scroll turns it off -- opening the
     map should show you where you are, and then get out of the way.

     `drag` is `{ sx, sy, x, y } | null`: the screen point a press started at
     plus the world offset at that moment, which is what makes a drag absolute
     (no accumulated rounding) rather than incremental. */
  map: {
    zoom: 0,
    x: 0, y: 0,
    follow: true,
    drag: null,
    /* Every layer is individually toggleable (docs/BUILD_PLAN.md Phase 9
       section 4). LIGHT is the one that starts OFF: it is a shading overlay
       over the whole map rather than a marker on top of it, so it changes how
       everything else reads and is better asked for than imposed. */
    layers: {
      chain: true, machines: true, piles: true, ore: true,
      light: false, bands: true, hover: true
    }
  },

  /* ---- THE MAIN MENU (6l) ----
     Which page is showing, which row the cursor is on, what the player has
     typed into the SEED field, whether a save exists and why the last load
     refused. All of it is a fact about the SESSION, exactly like the panel
     stack above; `view/ui/menu.js` reads it through
     `shell/main.js#frameCtx` and never writes it (CLAUDE.md D2).

     `hasSave` and `stale` are MIRRORS of `shell/save.js#slotState()`, and
     `notice` a mirror of `loadError.reason`, because storage is a device:
     `view` may not reach `localStorage` and must not have to. `inRun` mirrors
     `model` for the same reason -- `view` reads the world only through the
     frame context. `shell` answers all three once a frame and parks the
     answers here.

     `stale` and `inRun` are mirrors for the same reason: a header written by
     another build is storage, and whether the run behind the menu has been
     played is `model`. Both are answered once by `shell` and parked here.

     `confirm` is the id of the ONE row that has been taken once and is waiting
     to be taken again, or null. Only a row that would discard the run in
     progress ever sets it (docs/SPEC.md section 30.6) -- the row itself is the
     confirmation, so there is no second modal and no second keyboard owner.

     `index` counts rows of the page CURRENTLY DRAWN, so it is only meaningful
     against `view/ui/state.js#drawn.menu.rows`, and `scroll` is a PAGE index
     into the CONTROLS list rather than a line offset -- the menu reports how
     many pages it laid out, so a caller clamps against what was drawn rather
     than recomputing the layout. Both are clamped for DRAWING by the menu and
     for MOVEMENT by `menuMove`/`menuScrollTo` below; neither side guesses. */
  menu: {
    open: false,
    page: 'root',        // 'root' | 'controls' | 'settings' | 'debug'
    index: 0,
    scroll: 0,
    seed: '',            // digits typed into the SEED field; '' means random
    seedFocus: false,
    hasSave: false,
    stale: false,
    inRun: false,
    confirm: null,
    notice: null
  },

  /* The binding set, so `view` can draw it without importing `shell`. See
     `KEYMAP`'s own header above. */
  keymap: KEYMAP
};

/* THE PANELS THE GAME RAISES, which freeze the run while they stand (D17-A),
   as against the ones the player OPENS, which deliberately freeze nothing.
   Stated ONCE, here, and consulted by both `shell/main.js#step` and
   `#applyIntents` -- the same fact ("this frame does not simulate") the
   `flags.showMap` and `run.won` guards beside it already state once each,
   rather than a `'draft'` string hardcoded in two functions. A draft is a
   ceremony: choosing a permanent gift while a crank stalls under you is
   choosing under a pressure the design never asked for. */
const PAUSING = ['draft'];
export function pausesRun() { return ui.stack.some(id => PAUSING.includes(id)); }

export function isOpen(id) { return ui.stack.includes(id); }
export function top() { return ui.stack.length ? ui.stack[ui.stack.length - 1] : null; }

export function open(id) {
  const i = ui.stack.indexOf(id);
  if (i >= 0) ui.stack.splice(i, 1);
  ui.stack.push(id);
}

export function close(id) {
  const i = ui.stack.indexOf(id);
  if (i >= 0) ui.stack.splice(i, 1);
}

/* Escape's verb: pop exactly the top panel, not "the" panel — a modal above
   the window closes first. A no-op on an empty stack. */
export function closeTop() {
  if (ui.stack.length) ui.stack.pop();
}

export function toggle(id) {
  if (isOpen(id)) close(id); else open(id);
}

/* ---------- tabs ----------
   `tabs` is the SAME `[{id,label}]` list `view/ui/tabs.js#drawTabs` is given
   — passed in here too rather than cached, so a tab list that changes
   (crafting's category row, filtered by what is granted) never goes stale
   against what was actually drawn. */
export function setTab(panel, tabId) { ui.tab[panel] = tabId; }

export function activeTab(panel, tabs) {
  const cur = ui.tab[panel];
  if (cur != null && tabs.some(t => t.id === cur)) return cur;
  return tabs.length ? tabs[0].id : null;
}

export function cycleTab(panel, tabs, dir) {
  if (!tabs.length) return;
  const cur = activeTab(panel, tabs);
  const i = tabs.findIndex(t => t.id === cur);
  const next = tabs[((i < 0 ? 0 : i) + dir + tabs.length) % tabs.length];
  ui.tab[panel] = next.id;
}

/* ---------- focus, drag, search ---------- */
export function setFocus(panel, index) { ui.focus = { panel, index }; }
export function clearFocus() { ui.focus = null; }

export function setDrag(payload) { ui.drag = payload; }
export function clearDrag() { ui.drag = null; }

export function setSearch(s) { ui.search = s; }

/* ---------- per-grid scroll ----------
   Keyed by `panel:grid` rather than nesting an object per panel, so a grid
   id is guaranteed unique across the whole session state with one string
   compare instead of a two-level lookup — the same flattening
   `model/mods.js`'s scoped keys (`rate.furnace`) already uses. See
   docs/DEVELOPER_GUIDE.md#the-tunable-pipeline */
const scrollKey = (panel, grid) => panel + ':' + grid;

export function scrollOf(panel, grid) { return ui.scroll[scrollKey(panel, grid)] || 0; }

export function scrollBy(panel, grid, delta, maxRow = Infinity) {
  const k = scrollKey(panel, grid);
  const next = Math.max(0, Math.min(maxRow, (ui.scroll[k] || 0) + delta));
  ui.scroll[k] = next;
  return next;
}

export function scrollSet(panel, grid, row, maxRow = Infinity) {
  ui.scroll[scrollKey(panel, grid)] = Math.max(0, Math.min(maxRow, row));
}

/* ---------- search field ---------- */
export function setSearchFocus(v) { ui.searchFocus = v; }

/* ---------- the craft queue ----------
   See the header on `ui.craftQueue` above for why this is UI state and not a
   `rules/crafting.js` change. A hard ceiling (99) keeps ctrl-click's "max
   affordable" from ever building a queue long enough to be its own kind of
   footgun. */
const CRAFT_QUEUE_MAX = 99;

export function queueCraft(recipeId, n = 1) {
  for (let i = 0; i < n && ui.craftQueue.length < CRAFT_QUEUE_MAX; i++)
    ui.craftQueue.push(recipeId);
}

/* Remove one entry at `index` -- a click on the queue strip cancels exactly
   the slot clicked, not the whole queue. Nothing is refunded because nothing
   was ever spent (see the header comment); this simply stops re-asserting
   the craft intent for that slot. */
export function cancelQueued(index) {
  if (index >= 0 && index < ui.craftQueue.length) ui.craftQueue.splice(index, 1);
}

/* The head is what is (or is about to be) in progress -- `cancelQueued(0)`
   IS "dequeue", used both by a click cancelling the in-progress slot and by
   `shell/main.js#tickCraftQueue` on a detected completion. No separate
   function: one splice, two callers, nothing to keep in sync. */

export function clearCraftQueue() { ui.craftQueue.length = 0; }

export function toggleHints() { ui.hintsOpen = !ui.hintsOpen; }

/* ---------- auto collect (docs/PLAN-phase12.md §3 D-F) ----------
   TWO functions on purpose. `toggleAutoCollect` is what the Character-tab row
   calls -- a click on a checkbox knows nothing but "flip it". `setAutoCollect`
   states the state it wants, which is what `shell/boot.js#newRun` needs (a
   teardown that TOGGLED would leave the next run in whichever state the last
   one ended in, i.e. exactly the bug D13-A fixes) and what a test needs (a
   blind toggle asserts the caller already knows the current value; a setter
   does not). Not a new UI affordance -- docs/PLAN-phase13.md §7 keeps the
   Character-tab row as the one control. */
export function toggleAutoCollect() { ui.autoCollect = !ui.autoCollect; }
export function setAutoCollect(v) { ui.autoCollect = !!v; }

/* ---------- auto feed (Phase 16b, D16-C) ----------
   TWO functions, for the two callers the pair above already has and for the
   identical reasons: the Character-tab row flips it blind, and
   `shell/boot.js#newRun` (plus every probe in `tools/check.mjs` and
   `tests/visual.spec.js` that wants the old magnet back for a scene whose
   subject is something else) has to STATE the state it wants. A teardown
   that toggled would leave the next run in whichever state the last one
   ended in -- which is the determinism bug D13-A named, not a smaller
   version of it. */
export function toggleAutoFeed() { ui.autoFeed = !ui.autoFeed; }
export function setAutoFeed(v) { ui.autoFeed = !!v; }

/* ---------- click-to-arm placement ----------
   `armPlace` takes ORDINALS (a substance x form pair), the same shape
   `ui.drag` already stores one -- see `ui.armedPlace`'s own header above for
   what clears it and why. */
export function armPlace(sub, form) { ui.armedPlace = { sub, form }; }
export function clearArmedPlace() { ui.armedPlace = null; }

/* ---------- the armed link endpoint ----------
   `armLink` takes the machine RECORD, not ordinals, for the reason
   `ui.linkFrom`'s own header above gives. Deliberately NOT filtered for a
   `hub` block here: whether two machines may be joined is
   `model/segments.js#linkCheck`'s single decision, and pre-screening it in
   `shell` would be a second copy of half of it -- the one thing the
   one-decision-two-readers rule exists to prevent. Arming a press and then
   pressing `l` on a furnace refuses with 'NOT A HUB', from the same function
   the cable ghost reads. */
export function armLink(m) { ui.linkFrom = m; }
export function clearLink() { ui.linkFrom = null; }

/* ---------- the overview: scroll, zoom, layers ----------
   Plain mutators over `ui.map`, in the shape every other function in this file
   already has. NOTHING HERE CLAMPS: the clamp is `view/overview.js`'s, once,
   against the band union it is already deriving to draw with -- a second copy
   in `shell` would be a second answer to "where does the world end", which is
   exactly the drift `clampCam`'s own bug history warns about. */

/* A manual scroll is the ONE thing that turns FOLLOW off, and it is turned off
   HERE rather than by each caller, so no input path can forget to. */
export function mapScroll(dx, dy) {
  ui.map.follow = false;
  ui.map.x += dx;
  ui.map.y += dy;
}

/* Jump so a world point sits at the map viewport's top-left. Used by a click
   on a band ruler segment; `view` reports the rect, `shell` decides what a
   click on it means. */
export function mapMoveTo(x, y) {
  ui.map.follow = false;
  ui.map.x = x;
  ui.map.y = y;
}

export function setMapZoom(k) { ui.map.zoom = k; }

/* Set the offset WITHOUT touching FOLLOW, which is the one thing `mapScroll`
   and `mapMoveTo` above both deliberately do. A zoom step is not a scroll: it
   re-anchors the stored offset so the view keeps its CENTRE rather than its
   top-left corner, and doing that through `mapScroll` would silently cancel
   FOLLOW on a keypress the player never meant as one. Only the zoom path calls
   this, and only while FOLLOW is already off -- with FOLLOW on there is nothing
   to re-anchor, because the transform recentres on the player anyway. */
export function mapPark(x, y) { ui.map.x = x; ui.map.y = y; }
export function toggleMapFollow() { ui.map.follow = !ui.map.follow; }
export function setMapFollow(v) { ui.map.follow = !!v; }

export function toggleMapLayer(id) {
  if (Object.prototype.hasOwnProperty.call(ui.map.layers, id))
    ui.map.layers[id] = !ui.map.layers[id];
}

/* A DRAG IS ABSOLUTE, NOT INCREMENTAL: `mapDragStart` remembers both the
   screen point pressed and the world offset at that moment, and `mapDragTo`
   sets the offset from the total distance travelled since. Accumulating
   per-frame deltas instead would drift, because the offset is clamped every
   frame by `view` and a clamped frame would silently eat part of the motion. */
export function mapDragStart(sx, sy, x, y) { ui.map.drag = { sx, sy, x, y }; }
export function mapDragEnd() { ui.map.drag = null; }

export function mapDragTo(sx, sy, scale) {
  const d = ui.map.drag;
  if (!d || !(scale > 0)) return;
  ui.map.follow = false;
  ui.map.x = d.x - (sx - d.sx) / scale;
  ui.map.y = d.y - (sy - d.sy) / scale;
}

/* ---------- the main menu (6l) ----------
   Plain mutators in the shape every other function in this file has. NOTHING
   HERE DRAWS AND NOTHING HERE READS STORAGE: `shell` calls `setMenuSave` and
   `setMenuStale` with `shell/save.js#slotState()`'s answer and
   `setMenuNotice` with `loadError.reason`, and the menu paints whatever it
   finds.

   `menuMove` and `menuScrollTo` take the COUNT they clamp against, because
   only the drawn record knows it (`view/ui/state.js#drawn.menu.rows.length`
   and `.pages`) and a second copy of the layout in `shell` is the one thing
   the record-what-you-drew idiom exists to prevent. */
export function openMenu(page = 'root') {
  ui.menu.open = true;
  menuPage(page);
}

export function closeMenu() {
  ui.menu.open = false;
  ui.menu.seedFocus = false;
  ui.menu.confirm = null;
}

/* Changing page resets the cursor and the paging, because a row index is only
   meaningful against the page that was drawn with it -- and drops a pending
   confirmation with them, because the row it named is no longer on screen. */
export function menuPage(page) {
  ui.menu.page = page;
  ui.menu.index = 0;
  ui.menu.scroll = 0;
  ui.menu.seedFocus = false;
  ui.menu.confirm = null;
}

export function menuFocus(i, count = Infinity) {
  ui.menu.index = Math.max(0, Math.min(count - 1, i | 0));
}

/* Wraps, so the cursor cannot be parked past the end of a shorter page. */
export function menuMove(delta, count) {
  if (!(count > 0)) return;
  ui.menu.index = ((ui.menu.index + delta) % count + count) % count;
}

export function menuScrollTo(page, pages = Infinity) {
  ui.menu.scroll = Math.max(0, Math.min(pages - 1, page | 0));
}

export function setMenuSeed(s) { ui.menu.seed = String(s ?? ''); }
export function setMenuSeedFocus(v) { ui.menu.seedFocus = !!v; }
export function setMenuSave(v) { ui.menu.hasSave = !!v; }
export function setMenuStale(v) { ui.menu.stale = !!v; }
export function setMenuInRun(v) { ui.menu.inRun = !!v; }
export function setMenuConfirm(id) { ui.menu.confirm = id ?? null; }
export function setMenuNotice(s) { ui.menu.notice = s ?? null; }
