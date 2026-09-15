/* LAYER view — SCRATCH SPACE for the widget layer's own last-drawn output.
   Imports nothing. May be imported by every other file under `view/ui/`.

   The SAME idiom `view/hud.js#hoverInfo` already establishes:
   nothing here is read by another module's LOGIC, only by the next
   primitive's own hit-testing and by the test hook
   (`shell/main.js#installTestHook`'s `__mf.ui`, composed from this plus
   `shell/ui.js`'s session state — see that file's header for why the two
   halves live apart). Rebuilt every draw, never relied on across frames.

   `resetDrawn()` is called once per frame by whatever assembles a frame of
   panels -- `view/hud.js#drawHUD` and `view/overview.js`.
   See docs/DEVELOPER_GUIDE.md#record-what-you-drew */

export const drawn = { panels: [], tabs: [], grids: [], bars: [], tooltip: null,
  /* THE MAIN MENU's own rows, or null when the menu is not standing. ONE
     record rather than a flat row list, and it carries the `page` it
     describes, so a dispatcher cannot act on a CONTROLS row while the DEBUG
     page is showing -- the rows and the page they came from can never
     disagree. `pages` is how many pages the CONTROLS list laid out at this
     viewport, which is what a caller clamps `shell/ui.js#ui.menu.scroll`
     against, and `keys` is every SHORTCUT LINE the CONTROLS page actually
     painted -- the one record that can prove a binding was reached rather
     than paged off the bottom. See `view/ui/menu.js`. */
  menu: null,
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
  drawn.menu = null;
  for (const k in drawn.recipeIndex) delete drawn.recipeIndex[k];
}
