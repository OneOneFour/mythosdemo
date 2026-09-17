/* data layer — where a machine input may be drawn from.

   `count` and `spend` are pure functions over an api injected by
   `rules/machines.js`, which is the whole surface they may touch, so `data`
   still imports nothing:
     api.buffered(m, sel)        units matching `sel` in this machine's buffer
     api.takeBuffered(m, sel, n) -> the {sub, form} pair taken, or null
     api.pocketed(sel)           units matching `sel` in the pockets
     api.takePocketed(sel, n)    -> the pair taken, or null

   `units` tells the interpreter how to read a clause's input keys:
     'pair'   keys are selectors over substance x form.
     'named'  keys are the bare strings in `offers`, not substances.

   A row here carries closures, so this table is not serialisable and a
   dangling reference inside one is invisible to the content lint, which
   reads names and not bodies. */

export const SOURCES = Object.freeze({

  /* The machine's own buffer, filled by `catchBox`, `handFeed` and ports. */
  buffer: Object.freeze({
    id:'buffer',
    units:'pair',
    count: (api, m, sel)    => api.buffered(m, sel),
    spend: (api, m, sel, n) => api.takeBuffered(m, sel, n)
  }),

  /* The player's pockets, spent directly: no buffer, no catch box. */
  pocket: Object.freeze({
    id:'pocket',
    units:'pair',
    count: (api, m, sel)    => api.pocketed(sel),
    spend: (api, m, sel, n) => api.takePocketed(sel, n)
  }),
});

/* Every bare unit name any source offers, for the resolver: an input key that
   is neither a valid selector nor one of these is a content error. Empty
   while no source declares `offers`, so no recipe may name a bare unit. */
export const NAMED_UNITS = Object.freeze(
  [...new Set(Object.values(SOURCES).flatMap(s => s.offers || []))]);
