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
  /* One toggleable line of key hints (the QUICKBAR section of Phase 5b),
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
     invariant 8 names. An earlier draft of this comment argued the opposite
     ("would silently forget the player's choice on every restart"); that
     read the invariant as being about tidiness rather than about replay, and
     the cost of losing one click in a panel the player opens anyway is the
     smaller of the two. There is no `localStorage` (CLAUDE.md forbids it),
     so nothing survives a page reload either way. */
  autoCollect: false,

  /* AUTO FEED (Phase 16b, docs/PLAN-phase16-interaction-model-v2.md §5
     D16-C): whether the old always-on PROXIMITY DRAIN is restored. Default
     FALSE -- standing beside a machine no longer empties your pockets into
     it; the feed verb (Phase 16a: click a slot to arm the pair, aim at a
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
     `view` through `frameCtx` for the cable ghost (Phase 8e); `view` may not
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

  /* ---- THE OVERVIEW'S SCROLL, ZOOM AND LAYER TOGGLES (Phase 9) ----
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
  }
};

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

/* ---------- the craft queue (Phase 5b) ----------
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

/* ---------- the quickbar ----------
   Deleted (Phase 12c2, docs/PLAN-phase12.md §3 D-H): `assignQuickbar`/
   `clearQuickbar` wrote a session-only assignment table that no longer
   exists. Repositioning a quickbar slot now means `model/run.js#write.
   moveSlot`, called directly from `shell/main.js`'s drag-resolve dispatch --
   real storage, not a `shell/ui.js` mutator. */

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

/* ---------- the armed link endpoint (Phase 8d) ----------
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

/* ---------- the overview: scroll, zoom, layers (Phase 9) ----------
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
