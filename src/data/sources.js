/* LAYER data — SOURCES: where a machine input may be drawn from. Imports
   nothing.

   THIS IS THE ONE FILE IN `data/` WHERE A ROW CARRIES CODE. Read the price
   note at the bottom before adding a row.

   `count` and `spend` are pure functions over an INJECTED narrow api, defined
   in exactly one place (`rules/machines.js`) and the whole surface they may
   touch, so `data` still imports nothing:
     api.buffered(m, sel)        units matching `sel` in this machine's buffer
     api.takeBuffered(m, sel, n) -> the {sub, form} pair taken, or null
     api.pocketed(sel)           units matching `sel` in the pockets
     api.takePocketed(sel, n)    -> the pair taken, or null

   `units` tells the interpreter how to read a clause's input KEYS:
     'pair'   keys are selectors over substance x form. The normal case.
     'named'  keys are the bare strings in `offers`, not substances.

   PRICE, STATED PLAINLY: this file is not serialisable or diffable as
   content. Every other table in `data/` could be JSON, shipped to a modder,
   or diffed between two runs to explain a balance change. This one cannot,
   and a dangling reference inside one of these closures is invisible to the
   content lint, which reads names and not bodies. TWO rows is worth it.
   Thirty would mean the architecture chose wrong. */

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

  /* A THIRD ROW, the player's own hearts, is DELETED rather than parked. It
     existed for exactly one consumer -- the staged winch's hidden
     heart-for-a-charge recipe -- and the crank is manual only, so it had no
     consumer left.

     Deleted rather than kept, because that is what this file's own price note
     demands: a source is a closure the content lint cannot see inside, and
     keeping one alive for a mechanism that no longer exists is the exact cost
     the note says two rows is worth paying. The MECHANISM is untouched and is
     what a future non-item input would use again. */
});

/* Every bare unit name any source offers, for the resolver: an input key that
   is neither a valid selector nor one of these is a content error. EMPTY since
   `vital` was deleted -- see the note above. That is not a broken export:
   it means "no recipe may name a bare unit", which is exactly true right now,
   and `tools/check.mjs`'s check reads it generically rather than knowing any
   name. */
export const NAMED_UNITS = Object.freeze(
  [...new Set(Object.values(SOURCES).flatMap(s => s.offers || []))]);
