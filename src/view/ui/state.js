/* view layer — scratch space holding the widget layer's own last-drawn output,
   read only by the next primitive's hit-testing and by the test hook
   (`shell/main.js`'s `__mf.ui`). Rebuilt every draw by `resetDrawn()`, which
   `view/hud.js#drawHUD` and `view/overview.js` each call once a frame; never
   relied on across frames. */

export const drawn = { panels: [], tabs: [], grids: [], bars: [], tooltip: null,
  /* The main menu's rows, or null when it is not standing, carrying the `page`
     they describe. `pages` is how many pages the controls list laid out here,
     `keys` every shortcut line that page actually painted. */
  menu: null,
  /* `gridId -> [recipeId, ...]`, one entry per crafting grid drawn this frame:
     a slot's `{sub,form,n,mass}` cannot name a recipe with a `subFrom` output. */
  recipeIndex: {} };

export function resetDrawn() {
  drawn.panels.length = 0;
  drawn.tabs.length = 0;
  drawn.grids.length = 0;
  drawn.bars.length = 0;
  drawn.tooltip = null;
  drawn.menu = null;
  for (const k in drawn.recipeIndex) delete drawn.recipeIndex[k];
}
