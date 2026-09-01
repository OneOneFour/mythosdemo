/* LAYER data — SOURCES: where a machine input may be drawn from.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   ============================================================================
   THIS IS THE ONE FILE IN `data/` WHERE A ROW CARRIES CODE.
   Read the price note at the bottom before adding a row.
   How `from:` and `units:` work: docs/DEVELOPER_GUIDE.md#non-item-inputs
   ============================================================================

   `count` and `spend` are pure functions over an injected narrow api. The api
   is defined in exactly one place, `rules/machines.js`, and is the whole
   surface these functions may touch, so `data` still imports nothing:

     api.buffered(m, sel)        units matching `sel` in this machine's buffer
     api.takeBuffered(m, sel, n) -> the {sub, form} pair actually taken, or null
     api.pocketed(sel)           units matching `sel` in the player's pockets
     api.takePocketed(sel, n)    -> the pair actually taken, or null

   `units` tells the interpreter how to read the input KEYS of a clause:

     'pair'   keys are selectors over substance x form. The normal case.
     'named'  keys are the bare strings in `offers` and are NOT substances.

   PRICE, stated plainly: this file is not serialisable or diffable as content.
   Every other table in `data/` could be JSON, shipped to a modder, or diffed
   between two runs to explain a balance change. This one cannot, and a dangling
   reference inside one of these closures is invisible to `tools/resolve.mjs`,
   which reads names and not bodies. TWO rows is worth it (it was three until
   Phase 8f deleted `vital` -- see the note where it used to be). Thirty would
   mean the architecture chose wrong. */

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

  /* ---- `vital` (the player's own hearts) WAS THE THIRD ROW, AND IT IS GONE.
     It existed for exactly one consumer: the staged winch's second, hidden
     recipe, which bought a lift charge for a heart once the timber ran out --
     the "blood winch" trap. Phase 8f retired the staged winch, and
     docs/PLAN-gears-and-winches.md A5 asked whether the trap should move to
     the new hand crank. THE USER REJECTED IT OUTRIGHT, in their own words:
     "no ignore the blood winch stuff for now, that's a different idea. just
     have you turn the crank to turn it. the payment is that YOU THE PLAYER
     have to be standing there turning the crank so you can't be doing other
     stuff." So the crank is manual only (CLAUDE.md D10), there is no passive
     or heart-powered fallback of any kind, and this row had no consumer left.

     DELETED RATHER THAN PARKED, because that is what this file's own price
     note demands: a source is a closure `tools/resolve.mjs` cannot see inside,
     and keeping one alive for a mechanism that no longer exists is the exact
     cost the note says three rows was worth paying for. The MECHANISM is
     untouched and is what a future non-item input would use again --
     `units:'named'`, `offers`, and the `NAMED_UNITS` export below are all
     still here, and `tools/check.mjs`'s assertion over them is generic over
     any row with `from:`, so it will guard the next one on the day it lands.
     `model/run.js#write.spendHearts` is likewise still there, with its own
     note about having no caller.
     ---- */
});

/* Every bare unit name any source offers, for the resolver: an input key that
   is neither a valid selector nor one of these is a content error. EMPTY since
   Phase 8f deleted `vital` -- see the note above. That is not a broken export:
   it means "no recipe may name a bare unit", which is exactly true right now,
   and `tools/check.mjs`'s check reads it generically rather than knowing any
   name. */
export const NAMED_UNITS = Object.freeze(
  [...new Set(Object.values(SOURCES).flatMap(s => s.offers || []))]);
