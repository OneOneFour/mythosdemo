/* LAYER shell — MUTABLE UI STATE for the canvas-drawn widget layer. Imports
   nothing.

   SHELL AND NOT VIEW: which panel is open, the active tab, the focused slot,
   the drag payload, the search string and each grid's scroll offset are facts
   about the SESSION, not the WORLD. `view` may not import `shell`, so this
   object is handed over through `shell/main.js#frameCtx`.

   `ui.stack` is a STACK rather than a single id, so a modal can sit over the
   tabbed window without the window losing its open/tab state. Escape pops
   exactly the top entry, never the whole stack.

   Every export is a plain function mutating properties on the one `ui`
   object. */

/* THE KEYMAP, DECLARED ONCE, READ BY TWO LAYERS. The CONTROLS page is
   generated from this array. It is here rather than in `view` because a
   binding is a DEVICE fact, and `view` reaches it through `f.ui.keymap`.
   `shell/input.js` imports `KEYMAP` directly; same layer, legal.

     id      the VERB, unique across the table, what `input.js` dispatches on.
     codes   the `e.key` values, LOWERCASED as `input.js` compares them.
             `null` for a binding with no key.
     keys    the DISPLAY string, given rather than derived, because the
             derived movement row is 'W A S D ARROWUP ARROWDOWN ...'.
     label   what the verb does, present tense. Measured by the menu's layout
             pass, so a long one widens the page rather than overrunning it.
     hold    the key must stay down for the verb to keep happening.

   A group's `when` is the context its rows only exist in, and it is drawn as
   the heading, so a map-only row says so rather than reading as a global
   binding that does nothing. */
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

  /* `craftQueue` is an ARRAY of recipe ids, FIFO, head in progress, and it is
     NOT a mechanic change: `rules/crafting.js` is still a scalar on `run`,
     because a player has one pair of hands. The queue re-asserts the SAME one
     intent every frame it is non-empty and drains one entry per completed
     craft. Cancelling refunds nothing because nothing was spent -- no input
     goes until the recipe's `secs` is reached.

     The quickbar is NOT session state: its cells are the tail of `run.inv`
     itself, the same storage the Character tab's grid draws. */
  craftQueue: [],
  /* One toggleable line of key hints (the QUICKBAR section),
     collapsed by default so the permanent bottom bar stays as dense as the
     rest of this layer. */
  hintsOpen: false,

  /* AUTO COLLECT: whether the always-on pickup magnet is restored. Default
     FALSE, so holding 'c' collects manually instead.

     In `shell` for a LAYERING reason -- `rules/items.js` may import only
     `core`/`data`/`model`, and on `run` it would need a `RUN_SCHEMA` field
     for a fact no world-state fingerprint should carry. SIMULATION-AFFECTING
     input state rather than a presentation preference, so RESET ON EVERY RUN:
     it ORs into `cmd.collect`, which gates `write.collect`, which changes
     `run.inv`, burden, climb speed and carrier load. */
  autoCollect: false,

  /* AUTO FEED: whether the always-on PROXIMITY DRAIN is restored. Default
     FALSE, so standing beside a machine no longer empties your pockets into
     it and the feed verb hands over ONE unit per press.

     The exact shape of `autoCollect` above, for the same two reasons, and
     reset on every run the same way. It gates
     `rules/machines.js#handFeed`, which spends `run.inv` and fills a machine
     buffer, which moves burden, climb speed, what a recipe can run and
     whether a trial gets paid. */
  autoFeed: false,

  /* CLICK-TO-ARM PLACEMENT: `{ sub, form } | null`, the held pair a slot click
     selected as "place THIS one next". A fact about the SESSION -- arming
     touches no `run` state, only which pair `applyIntents`'s `cmd.place`
     branch reaches for first. Cleared the instant it stops being true:
     placed, no longer held, or Escape. */
  armedPlace: null,

  /* THE ARMED LINK ENDPOINT: the machine RECORD a first `l` press selected as
     one end of the next cable, or null. A session fact like `armedPlace`.

     A RECORD, not a `{tx, ty}` pair, because `linkCheck` needs the machine
     itself and machines never move -- which is what makes the stale test in
     `shell/main.js` one identity check against `machines` rather than a
     coordinate search. The test handle serialises it at the boundary.

     Cleared the instant it stops being true: linked, cut, aimed at the same
     machine again, deconstructed from under it, or Escape. */
  linkFrom: null,

  /* THE OVERVIEW'S SCROLL, ZOOM AND LAYER TOGGLES, all session facts.
     `x`/`y`   WORLD PIXELS of the map viewport's top-left, not tiles and not
               screen px: a tile offset is meaningless between bands whose
               `tile` sizes differ, and a screen offset changes meaning on
               every zoom step. Stored UNCLAMPED, clamped by
               `view/overview.js#transform` every frame, so there is one
               clamp and a stale offset from before a `newRun()` lands back
               inside the world.
     `zoom`    0 for "the default this viewport width implies", otherwise one
               of `MAP_ZOOM`'s integer levels. Stored so a chosen zoom
               survives a resize; 0 so the default can be a function of the
               viewport, which `shell` has no business computing.
     `follow`  defaults TRUE, and any manual scroll turns it off.
     `drag`    `{ sx, sy, x, y } | null`, the screen point a press started at
               plus the world offset then, which is what makes a drag
               absolute rather than incremental. */
  map: {
    zoom: 0,
    x: 0, y: 0,
    follow: true,
    drag: null,
    /* Every layer is individually toggleable. LIGHT is the one that starts
       OFF: it shades the whole map rather than marking on top of it, so it
       changes how everything else reads. */
    layers: {
      chain: true, machines: true, piles: true, ore: true,
      light: false, bands: true, hover: true
    }
  },

  /* THE MAIN MENU, all session facts, read by `view` and never written by it.
     `hasSave`/`stale`  mirrors of `shell/save.js#slotState()`, because
                        storage is a device and `view` may not reach it.
     `notice`           a mirror of `loadError.reason`.
     `inRun`            a mirror of `model`, for the same reason.
     `confirm`          the id of the ONE row taken once and waiting to be
                        taken again, or null. Only a row that would discard
                        the run sets it, so the row IS the confirmation and
                        there is no second modal or keyboard owner.
     `index`            counts rows of the page CURRENTLY DRAWN, so it is
                        meaningful only against `drawn.menu.rows`.
     `scroll`           a PAGE index into CONTROLS, not a line offset. The
                        menu reports how many pages it laid out, so a caller
                        clamps against what was drawn rather than recomputing
                        the layout. */
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

/* THE PANELS THE GAME RAISES, which freeze the run while they stand,
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

/* tabs
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

/* focus, drag, search */
export function setFocus(panel, index) { ui.focus = { panel, index }; }
export function clearFocus() { ui.focus = null; }

export function setDrag(payload) { ui.drag = payload; }
export function clearDrag() { ui.drag = null; }

export function setSearch(s) { ui.search = s; }

/* Keyed by `panel:grid` rather than an object per panel, so a grid id is
   unique across the whole session state with one string compare instead of a
   two-level lookup -- the same flattening `model/mods.js`'s scoped keys
   use. */
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

/* search field */
export function setSearchFocus(v) { ui.searchFocus = v; }

/* the craft queue
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

/* TWO functions on purpose. `toggleAutoCollect` is what the Character-tab row
   calls, since a click on a checkbox knows only "flip it". `setAutoCollect`
   STATES the state it wants, which is what `shell/boot.js#newRun` needs -- a
   teardown that toggled would leave the next run in whichever state the last
   one ended in -- and what a test needs. */
export function toggleAutoCollect() { ui.autoCollect = !ui.autoCollect; }
export function setAutoCollect(v) { ui.autoCollect = !!v; }

/* TWO functions, for the two callers the pair above has and for the same
   reasons: the Character-tab row flips it blind, and a teardown or a test
   probe has to STATE the state it wants. */
export function toggleAutoFeed() { ui.autoFeed = !ui.autoFeed; }
export function setAutoFeed(v) { ui.autoFeed = !!v; }

/* click-to-arm placement
   `armPlace` takes ORDINALS (a substance x form pair), the same shape
   `ui.drag` already stores one -- see `ui.armedPlace`'s own header above for
   what clears it and why. */
export function armPlace(sub, form) { ui.armedPlace = { sub, form }; }
export function clearArmedPlace() { ui.armedPlace = null; }

/* the armed link endpoint
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

/* the overview: scroll, zoom, layers
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

/* Plain mutators. NOTHING HERE DRAWS AND NOTHING HERE READS STORAGE: `shell`
   calls these with `slotState()`'s answer and `loadError.reason`, and the menu
   paints what it finds.

   `menuMove` and `menuScrollTo` take the COUNT they clamp against, because
   only the drawn record knows it and a second copy of the layout in `shell`
   is what the record-what-you-drew idiom exists to prevent. */
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
