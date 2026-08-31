/* LAYER view — SCRATCH SPACE for the widget layer's own last-drawn output.
   Imports nothing. May be imported by every other file under `view/ui/`.

   The SAME idiom `view/hud.js#pocketHits` / `#hoverInfo` already establishes:
   nothing here is read by another module's LOGIC, only by the next
   primitive's own hit-testing and by the test hook
   (`shell/main.js#installTestHook`'s `__mf.ui`, composed from this plus
   `shell/ui.js`'s session state — see that file's header for why the two
   halves live apart). Rebuilt every draw, never relied on across frames.

   `resetDrawn()` is called once per frame by whatever assembles a frame of
   panels — Phase 5b's job, the same place `view/hud.js#drawHUD` zeroes
   `pocketHits.length` today. Phase 5a ships no caller, so in a normal run
   these arrays simply stay empty; the throwaway harness that verifies this
   phase calls it directly. */

export const drawn = { panels: [], tabs: [], grids: [], bars: [], tooltip: null,
  /* Phase 5b addition: `gridId -> [recipeId, ...]`, one entry per crafting
     grid drawn this frame -- `view/ui/mainPanel.js`'s own header explains why
     a grid slot's `{sub,form,n,mass}` shape (Phase 5a's contract, unchanged)
     is not enough on its own to name a recipe with a `subFrom` output. Reset
     alongside everything else below, never relied on across frames. */
  recipeIndex: {},
  /* Bug-fix addition (Bug 1 audit): a generic `{id,x,y,w,h}` rectangle for a
     plain clickable TEXT row that is not a grid slot, a tab or a panel --
     the LOGISTICS tab's ported BUILD list is the first (and, so far, only)
     user. Not a general-purpose widget: it carries no visual of its own
     (`view/ui/mainPanel.js` draws the row with plain `drawText`, unchanged),
     only the hit rectangle a real click needs to exist at all. */
  buttons: [] };

export function resetDrawn() {
  drawn.panels.length = 0;
  drawn.tabs.length = 0;
  drawn.grids.length = 0;
  drawn.bars.length = 0;
  drawn.tooltip = null;
  drawn.buttons.length = 0;
  for (const k in drawn.recipeIndex) delete drawn.recipeIndex[k];
}
