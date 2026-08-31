/* LAYER view — SCRATCH SPACE for the widget layer's own last-drawn output.
   Imports nothing. May be imported by every other file under `view/ui/`.

   The SAME idiom `view/hud.js#pocketHits` / `#hoverInfo` already establishes:
   nothing here is read by another module's LOGIC, only by the next
   primitive's own hit-testing and by the test hook
   (`shell/main.js#installTestHook`'s `__mf.ui`, composed from this plus
   `shell/ui.js`'s session state — see that file's header for why the two
   halves live apart). Rebuilt every draw, never relied on across frames.

   `resetDrawn()` is called once per frame by whatever assembles a frame of
   panels, the same place `view/hud.js#drawHUD` zeroes `pocketHits.length`.
   See docs/DEVELOPER_GUIDE.md#record-what-you-drew */

export const drawn = { panels: [], tabs: [], grids: [], bars: [], tooltip: null,
  /* `gridId -> [recipeId, ...]`, one entry per crafting grid drawn this frame
     -- `view/ui/mainPanel.js`'s own header explains why a grid slot's
     `{sub,form,n,mass}` shape is not enough on its own to name a recipe with a
     `subFrom` output. Reset alongside everything else below, never relied on
     across frames. */
  recipeIndex: {} };

export function resetDrawn() {
  drawn.panels.length = 0;
  drawn.tabs.length = 0;
  drawn.grids.length = 0;
  drawn.bars.length = 0;
  drawn.tooltip = null;
  for (const k in drawn.recipeIndex) delete drawn.recipeIndex[k];
}
