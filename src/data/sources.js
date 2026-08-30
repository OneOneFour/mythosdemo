/* LAYER data — SOURCES: where a machine input may be drawn from.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   ============================================================================
   THIS IS THE ONE FILE IN `data/` WHERE A ROW CARRIES CODE.
   Read the price note at the bottom before adding a row.
   ============================================================================

   A recipe input clause names its source with `from:`, defaulting to 'buffer':

     { in:{ 'timber/log':1 } }                    <- from the machine's buffer
     { in:{ heart:1 }, from:'vital' }             <- from the player's body

   That one word is what makes a non-item fuel content instead of engine code,
   and it is what the lift needs. `rules/machines.js` never learns where an
   input came from: it calls `SOURCES[from].count(...)` and
   `SOURCES[from].spend(...)`, and each row here answers for itself.

   `count` and `spend` are pure functions over an injected narrow api. The api
   is defined in exactly one place, `rules/machines.js`, and is the whole
   surface these functions may touch, so `data` still imports nothing:

     api.buffered(m, sel)        units matching `sel` in this machine's buffer
     api.takeBuffered(m, sel, n) -> the {sub, form} pair actually taken, or null
     api.pocketed(sel)           units matching `sel` in the player's pockets
     api.takePocketed(sel, n)    -> the pair actually taken, or null
     api.hearts()                the player's current hearts
     api.takeHearts(n)           spend hearts; refuses to reach zero

   `units` tells the interpreter how to read the input KEYS of a clause:

     'pair'   keys are selectors over substance x form. The normal case.
     'named'  keys are the bare strings in `offers` and are NOT substances, so
              health is never mirrored into the inventory, the HUD keeps drawing
              five hearts, and `model/run.js` does not change shape.

   PRICE, stated plainly: this file is not serialisable or diffable as content.
   Every other table in `data/` could be JSON, shipped to a modder, or diffed
   between two runs to explain a balance change. This one cannot, and a dangling
   reference inside one of these closures is invisible to `tools/resolve.mjs`,
   which reads names and not bodies. Three rows is worth it. Thirty would mean
   the architecture chose wrong. */

export const SOURCES = Object.freeze({

  /* The machine's own buffer, filled by `catchBox`, `handFeed` and ports. */
  buffer: Object.freeze({
    id:'buffer',
    units:'pair',
    count: (api, m, sel)    => api.buffered(m, sel),
    spend: (api, m, sel, n) => api.takeBuffered(m, sel, n)
  }),

  /* The player's pockets, spent directly: a machine that must be fed by hand
     every time rather than stockpiling. No buffer, no catch box. */
  pocket: Object.freeze({
    id:'pocket',
    units:'pair',
    count: (api, m, sel)    => api.pocketed(sel),
    spend: (api, m, sel, n) => api.takePocketed(sel, n)
  }),

  /* The player's own body. The non-item fuel source, and the reason the lift
     can keep running after the timber has run out.

     The refusal to spend the last heart lives HERE rather than on the lift row,
     because it is a property of hearts and not of the machine: any future
     blood-fuelled thing inherits it for free. */
  vital: Object.freeze({
    id:'vital',
    units:'named',
    offers:['heart'],
    count: (api)            => api.hearts(),
    spend: (api, m, sel, n) => api.takeHearts(n)
  })
});

/* Every bare unit name any source offers, for the resolver: an input key that
   is neither a valid selector nor one of these is a content error. */
export const NAMED_UNITS = Object.freeze(
  [...new Set(Object.values(SOURCES).flatMap(s => s.offers || []))]);
