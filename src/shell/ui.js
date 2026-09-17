/* shell layer — session state for the canvas-drawn widget layer — which panel
   is open, the active tab, the focused slot, the drag payload, the search and
   each grid's scroll. Handed to `view` through `shell/main.js#frameCtx`. */

/* The keymap, which `view` reaches through `f.ui.keymap`. `id` is the verb
   `shell/input.js` dispatches on, `codes` are lowercased `e.key` values (null
   for none), `keys` is displayed, `hold` means the key must stay down. */
export const KEYMAP = Object.freeze([
  { when: 'IN THE MENU', rows: [
    { id: 'menuMove',   codes: ['w', 's', 'arrowup', 'arrowdown'], keys: 'W/S', label: 'MOVE THE CURSOR' },
    { id: 'menuPage',   codes: ['a', 'd', 'arrowleft', 'arrowright'], keys: 'A/D', label: 'PAGE THIS LIST' },
    { id: 'menuSelect', codes: ['enter', ' '], keys: 'ENTER', label: 'TAKE THE ROW' },
    { id: 'menuBack',   codes: ['escape'], keys: 'ESC', label: 'BACK, THEN PLAY' }
  ] },
  /* Escape's last step; the order is in `shell/input.js`'s Escape branch. */
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
  /* Behind `flags.showDebug`, which `h` above toggles; a no-op with it off. */
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

  /* Recipe ids, FIFO, head in progress. The queue re-asserts the same one
     craft intent every frame it is non-empty and drains one entry per
     completed craft; nothing is spent until the recipe's `secs` is reached. */
  craftQueue: [],
  /* One toggleable line of key hints under the quickbar, collapsed by
     default. */
  hintsOpen: false,

  /* Whether the always-on pickup magnet runs; false, so holding 'c' collects
     manually. It ORs into `cmd.collect`, which gates `write.collect`, so it
     affects the simulation and `shell/boot.js#newRun` resets it. */
  autoCollect: false,

  /* Whether the always-on proximity drain runs; false, so the feed verb hands
     over one unit per press. It gates `rules/machines.js#handFeed`, so it is
     reset with the run for the same reason as `autoCollect`. */
  autoFeed: false,

  /* `{ sub, form } | null`, the held pair a slot click or a digit armed as
     "place this one next". Cleared the instant it stops being true: placed,
     no longer held, or Escape. */
  armedPlace: null,

  /* The machine record a first `l` press armed as one end of the next cable,
     or null. A record rather than a `{tx, ty}` pair, because `linkCheck` needs
     the machine; `shell/main.js` sweeps it by identity against `machines`. */
  linkFrom: null,

  /* `x`/`y` are world px of the viewport's top-left, stored unclamped and
     clamped by `view/overview.js#transform` each frame. `zoom` 0 means the
     viewport default; `drag` holds the press point and the offset then. */
  map: {
    zoom: 0,
    x: 0, y: 0,
    follow: true,
    drag: null,
    /* `light` starts off: it shades the whole map rather than marking on top
       of it. */
    layers: {
      chain: true, machines: true, piles: true, ore: true,
      light: false, bands: true, hover: true
    }
  },

  /* The main menu. `hasSave`/`stale` mirror `shell/save.js#slotState()` and
     `notice` mirrors `loadError.reason`, since `view` cannot reach storage.
     `index` indexes `drawn.menu.rows`; `scroll` is a page, not a line. */
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

  keymap: KEYMAP
};

/* The panels that freeze the run while they stand, as against the ones the
   player opens, which freeze nothing. Read by `shell/main.js#step` and
   `#applyIntents`. */
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

/* Escape's verb: pop exactly the top panel, so a modal above the window closes
   first. A no-op on an empty stack. */
export function closeTop() {
  if (ui.stack.length) ui.stack.pop();
}

export function toggle(id) {
  if (isOpen(id)) close(id); else open(id);
}

/* `tabs` is the same `[{id,label}]` list `view/ui/tabs.js#drawTabs` is given,
   passed in rather than cached, so a changing tab list cannot go stale against
   what was drawn. */
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

export function setFocus(panel, index) { ui.focus = { panel, index }; }
export function clearFocus() { ui.focus = null; }

export function setDrag(payload) { ui.drag = payload; }
export function clearDrag() { ui.drag = null; }

export function setSearch(s) { ui.search = s; }

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

export function setSearchFocus(v) { ui.searchFocus = v; }

/* Bounds what ctrl-click's "max affordable" can queue in one press. */
const CRAFT_QUEUE_MAX = 99;

export function queueCraft(recipeId, n = 1) {
  for (let i = 0; i < n && ui.craftQueue.length < CRAFT_QUEUE_MAX; i++)
    ui.craftQueue.push(recipeId);
}

/* Remove one entry, so a click on the queue strip cancels exactly the slot
   clicked. Nothing is refunded, because nothing was spent. */
export function cancelQueued(index) {
  if (index >= 0 && index < ui.craftQueue.length) ui.craftQueue.splice(index, 1);
}

export function clearCraftQueue() { ui.craftQueue.length = 0; }

export function toggleHints() { ui.hintsOpen = !ui.hintsOpen; }

/* A checkbox click knows only "flip it"; a teardown or a test has to state the
   state it wants, so both verbs exist for each preference. */
export function toggleAutoCollect() { ui.autoCollect = !ui.autoCollect; }
export function setAutoCollect(v) { ui.autoCollect = !!v; }

export function toggleAutoFeed() { ui.autoFeed = !ui.autoFeed; }
export function setAutoFeed(v) { ui.autoFeed = !!v; }

/* `armPlace` takes ordinals, a substance x form pair. */
export function armPlace(sub, form) { ui.armedPlace = { sub, form }; }
export function clearArmedPlace() { ui.armedPlace = null; }

/* `armLink` takes the machine record, and does not filter for a `hub` block:
   whether two machines may be joined is `model/segments.js#linkCheck`'s one
   decision, and it refuses a non-hub with a reason. */
export function armLink(m) { ui.linkFrom = m; }
export function clearLink() { ui.linkFrom = null; }

/* Nothing in the `ui.map` mutators clamps: the clamp is `view/overview.js`'s,
   against the band union it is already deriving to draw with. */

/* A manual scroll is the one thing that turns `follow` off, and it is turned
   off here so no input path can forget to. */
export function mapScroll(dx, dy) {
  ui.map.follow = false;
  ui.map.x += dx;
  ui.map.y += dy;
}

/* Jump so a world point sits at the map viewport's top-left. */
export function mapMoveTo(x, y) {
  ui.map.follow = false;
  ui.map.x = x;
  ui.map.y = y;
}

export function setMapZoom(k) { ui.map.zoom = k; }

/* Set the offset without touching `follow`, so a zoom step can re-anchor to
   keep the view's centre without cancelling follow. Called only by the zoom
   path, and only while follow is already off. */
export function mapPark(x, y) { ui.map.x = x; ui.map.y = y; }
export function toggleMapFollow() { ui.map.follow = !ui.map.follow; }
export function setMapFollow(v) { ui.map.follow = !!v; }

export function toggleMapLayer(id) {
  if (Object.prototype.hasOwnProperty.call(ui.map.layers, id))
    ui.map.layers[id] = !ui.map.layers[id];
}

/* A drag is absolute: `mapDragStart` records the screen point pressed and the
   world offset then, and `mapDragTo` sets the offset from the total distance
   since. Per-frame deltas would drift, since `view` clamps every frame. */
export function mapDragStart(sx, sy, x, y) { ui.map.drag = { sx, sy, x, y }; }
export function mapDragEnd() { ui.map.drag = null; }

export function mapDragTo(sx, sy, scale) {
  const d = ui.map.drag;
  if (!d || !(scale > 0)) return;
  ui.map.follow = false;
  ui.map.x = d.x - (sx - d.sx) / scale;
  ui.map.y = d.y - (sy - d.sy) / scale;
}

/* `menuMove` and `menuScrollTo` take the count they clamp against, because
   only the drawn record knows it. */
export function openMenu(page = 'root') {
  ui.menu.open = true;
  menuPage(page);
}

export function closeMenu() {
  ui.menu.open = false;
  ui.menu.seedFocus = false;
  ui.menu.confirm = null;
}

/* Changing page resets the cursor, the paging and any pending confirmation,
   all of which are meaningful only against the page that was drawn. */
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
