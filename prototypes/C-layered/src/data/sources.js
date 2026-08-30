/* LAYER data — SOURCES: where a machine input may be drawn from.

   ============================================================================
   THIS IS THE ONE FILE IN THE PROTOTYPE WHERE A DATA ROW CARRIES CODE.
   Read the price note at the bottom before adding a row.
   ============================================================================

   A recipe clause names its source with `from:`, defaulting to `'buffer'`:

     { in:{ '#ore':2, '#fuel':1 }, ... }                 <- from the buffer
     { in:{ heart:1 }, from:'vital', ... }               <- from the player

   That one word is what makes the blood winch content instead of engine code.
   `rules/machines.js` never learns where an input came from: it calls
   `SOURCES[from].count(...)` and `SOURCES[from].spend(...)`, and each row here
   answers for itself.

   `count` and `spend` are inline pure functions taking an injected narrow api,
   which is the RFC's escape hatch for "a definition needs logic, not a number".
   The api is defined in exactly one place, `rules/machines.js`, and is the
   whole surface these functions may touch. `data` still imports nothing.

     api.buffered(m, sel)      units of `sel` in this machine's buffer
     api.takeBuffered(m, sel, n)
     api.pocketed(sel)         units of `sel` in the player's inventory
     api.takePocketed(sel, n)
     api.hearts()              the player's current hearts
     api.takeHearts(n)         spend hearts; refuses to reach zero

   PRICE, stated plainly: this file is no longer serialisable or diffable as
   content. Every other table in `data/` could be JSON, shipped to a modder, or
   diffed between two runs to explain a balance change. This one cannot, and a
   dangling reference inside one of these closures is invisible to
   `tools/resolve.mjs`, which reads names and not bodies. Three rows was judged
   worth it. Thirty would mean this architecture chose wrong and a design where
   behaviour sits on the semantic object should win. */

export const SOURCES = Object.freeze({

  /* The machine's own buffer, filled by `catchBox`, `handFeed` and ports. */
  buffer: Object.freeze({
    id:'buffer',
    units:'substance',                       // input keys are substances or #tags
    count: (api, m, sel) => api.buffered(m, sel),
    spend: (api, m, sel, n) => api.takeBuffered(m, sel, n)
  }),

  /* The player's pockets, spent directly. Used by a machine that must be fed
     by hand every time rather than stockpiling — no buffer, no catch box. */
  pocket: Object.freeze({
    id:'pocket',
    units:'substance',
    count: (api, m, sel) => api.pocketed(sel),
    spend: (api, m, sel, n) => api.takePocketed(sel, n)
  }),

  /* The player's own body. `units:'named'` means input keys are the strings in
     `offers` and NOT substances, so health never becomes an inventory item and
     the HUD keeps drawing five hearts. This is the blood winch.

     The refusal to spend the last heart lives here rather than in the winch row
     because it is a property of hearts, not of the machine: any future
     blood-fuelled thing inherits it. */
  vital: Object.freeze({
    id:'vital',
    units:'named',
    offers:['heart'],
    count: (api) => api.hearts(),
    spend: (api, m, sel, n) => api.takeHearts(n)
  })
});
