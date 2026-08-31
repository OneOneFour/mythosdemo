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

     `quickbar`: a fixed-length array of `{ sub, form } | null`, ASSIGNMENT
     ONLY — which pocket pair sits in which numbered slot is a fact about the
     SESSION, same as everything else in this file, and changing it does not
     touch `run.inv` at all. Ten slots, two rows of five. */
  craftQueue: [],
  quickbar: Array.from({ length: 10 }, () => null),
  /* One toggleable line of key hints (the QUICKBAR section of Phase 5b),
     collapsed by default so the permanent bottom bar stays as dense as the
     rest of this layer. */
  hintsOpen: false,

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
  armedPlace: null
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

/* ---------- the quickbar (Phase 5b) ----------
   Assignment only, per the header comment: `payload` is `{ sub, form } |
   null`, never a count -- the count a slot shows is read fresh from
   `model/run.js#pocketRows()` every frame, the same "derived, not cached"
   discipline the rest of this codebase already applies to hover and to the
   widget layer's own `drawn` scratch space. */
export function assignQuickbar(slot, payload) {
  if (slot < 0 || slot >= ui.quickbar.length) return;
  ui.quickbar[slot] = payload;
}

export function clearQuickbar(slot) { assignQuickbar(slot, null); }

export function toggleHints() { ui.hintsOpen = !ui.hintsOpen; }

/* ---------- click-to-arm placement ----------
   `armPlace` takes ORDINALS (a substance x form pair), the same shape
   `ui.drag`/`ui.quickbar` already store one -- see `ui.armedPlace`'s own
   header above for what clears it and why. */
export function armPlace(sub, form) { ui.armedPlace = { sub, form }; }
export function clearArmedPlace() { ui.armedPlace = null; }
