/* LAYER data — RECIPES: shared, named transformations. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   A machine row may name a recipe from this table or inline a literal one; both
   forms are the same shape and `recipesOf()` at the bottom returns the resolved
   list either way. Named rows are for transformations more than one machine
   performs; inline rows are for a machine's own private behaviour.

   ============================================================================
   THE ONE SMELT ROW. `smelt` covers every ore that will ever exist, because
   its input is a selector over any ore-tagged form and its output takes the
   SUBSTANCE from whatever satisfied that input. Adding `tin` to
   `substances.js` needs no row here, and a tin ingot differs from a copper
   ingot automatically rather than needing a hand-written row someone forgets.

   This is the defect the reference prototype had: two ores both declared
   `smeltsTo:'ingot'` against a single `ingot` row, so a tin ingot was
   byte-identical to a copper one.
   ============================================================================

   Row shape:

     in       { selector: units }. Selector grammar is in `data/forms.js`.
     from     which `data/sources.js` row the inputs come from. Default 'buffer'.
              With `units:'named'` the input KEYS are bare unit names, not
              selectors -- that is how the lift burns hearts.
     needs    { field: { min, max } } gate on a scalar field value at the
              machine. Delete the line and the recipe runs cold. A temperature
              BAND is a `max` beside the `min`.
     secs     seconds per run at rate 1.0, before `servo` and the `rate` tunable.
     out      output clauses. `[]` means the machine consumes and produces
              nothing liftable -- it banks a charge, which is what a lift stage
              and a spoil sink both do.

              { sub, form, n }         literal output.
              { subFrom, form, n }     DERIVED: the substance that satisfied the
                                       named input clause, in the named form.
              Exactly one of `sub` / `subFrom` per clause.

     hand     true if a PLAYER may also run this exact row, by hand, not only a
              machine that names it. See `rules/crafting.js` and `HAND_RECIPES`
              below. Deliberately not a second row: hand-crafting is the SAME
              transformation at the SAME `secs`, spending and producing exactly
              what the machine would -- the point (`docs/DESIGN.md`) is that a
              person can do a furnace's job, just not five furnaces' worth of
              it at once, and a duplicated row with different numbers would
              quietly break that promise the first time someone tuned one and
              forgot the other. */

export const RECIPES = Object.freeze({

  /* ============================================================================
     MACHINE-BUILD RECIPES (design reversal, superseding Phase 3's cost-at-
     placement deviation -- see `data/forms.js#rig` and the machine-substance
     block in `data/substances.js` for the full argument). Each spends the
     EXACT bill `data/machines.js` used to charge at placement -- copied
     verbatim, not retuned, since preserving Phase 3's numbers is the whole
     point of this move being a relocation and not a rebalance -- and
     produces exactly one `<machine>/rig`. `hand:true` on every one: nothing
     else ever names these, so a machine is built the same way a stair or an
     auger is, by hand, never by another machine.

     DECLARED BEFORE `smelt`/`press`/`peg_rungs`/`kindle`/`daedalan`/`auger`
     below, and this order is LOAD-BEARING, the exact class of mistake
     CLAUDE.md's own "recipe-ordering collision" entries (`peg_rungs`/
     `kindle`, `daedalan`/`auger`) warn against, now at machine scale:
     `rules/crafting.js#choose` fires the FIRST HAND_RECIPES row whose
     inputs are fully held, so wherever a bigger bill's condition holds, a
     smaller bill sharing the same materials is trivially also satisfied
     (12 copper/ore + 6 timber/log, `furnace`'s own bill, is a strict
     superset of `smelt`'s 4 ore + 1 fuel). Declaring the machine first means
     a well-stocked player builds the machine, not a stray ingot; a player
     who wants to keep smelting by hand keeps their ore/log stock under a
     machine's own threshold, the identical "manage your float" trade
     `daedalan`/`auger` already documents. Checked pairwise against every
     other hand:true row below for exactly this containment before this
     order was picked:
       furnace, brazier  -- both a strict superset of smelt (ore+fuel) /
                             peg_rungs / kindle (log alone) -- declared first.
       lift              -- a strict superset of daedalan / auger (plate +
                             log) -- declared before both.
       cyclops_maw       -- a strict superset of talos_head AND
                             press_machine (plate + ingot) -- declared before
                             both.
       talos_head        -- a strict superset of press_machine -- declared
                             before it.
       hearth            -- the INVERSE case: its own 2 copper/plate is a
                             strict SUBSET of every other plate-consuming
                             recipe here (lift, cyclops_maw, talos_head,
                             press_machine, belt_r, and the EXISTING
                             daedalan/auger), so `hearth` is declared LAST OF
                             ALL, or it would starve every one of them the
                             moment enough plate for both existed. ============================================================================ */

  furnace: Object.freeze({
    id:'furnace', name:'CRUDE FURNACE',
    in:{ 'copper/ore':12, 'timber/log':6 },
    out:[ { sub:'furnace', form:'rig', n:1 } ],
    /* 8.0s: the same order-of-magnitude commitment Phase 3's own text framed
       this bill as (`docs/BUILD_PLAN.md` Phase 3's furnace paragraph), now
       spent as craft time instead of a placement-time toll. */
    secs:8.0,
    hand:true
  }),

  /* No `kiln_divine` row -- see `data/substances.js`'s own comment on why
     one is not shippable without inventing a number Phase 3 never set. */

  brazier: Object.freeze({
    id:'brazier', name:'BRAZIER',
    in:{ 'timber/log':4, 'stone/gravel':2 },
    out:[ { sub:'brazier', form:'rig', n:1 } ],
    secs:5.0,
    hand:true
  }),

  lift: Object.freeze({
    id:'lift', name:'WINCH STAGE',
    in:{ 'copper/plate':6, 'timber/log':4, 'copper/ingot':2 },
    out:[ { sub:'lift', form:'rig', n:1 } ],
    /* 20.0s: `lift` is the game's own bottleneck (invariant 4), priced like
       the investment it is -- the same "the investment" framing
       `data/machines.js`'s former cost comment already used for this exact
       bill, now spent as time instead of a placement toll. */
    secs:20.0,
    hand:true
  }),

  cyclops_maw: Object.freeze({
    id:'cyclops_maw', name:'CYCLOPS MAW',
    in:{ 'copper/plate':16, 'copper/ingot':6, 'granite/gravel':6 },
    out:[ { sub:'cyclops_maw', form:'rig', n:1 } ],
    secs:24.0,
    hand:true
  }),

  talos_head: Object.freeze({
    id:'talos_head', name:'TALOS HEAD',
    in:{ 'copper/plate':8, 'copper/ingot':2 },
    out:[ { sub:'talos_head', form:'rig', n:1 } ],
    secs:16.0,
    hand:true
  }),

  /* Named `press_machine`, not `press` -- `press` below already names the
     ingot-to-plate compression recipe; the two are unrelated transforms that
     happen to share an English word. */
  press_machine: Object.freeze({
    id:'press_machine', name:'PRESS',
    in:{ 'copper/plate':4, 'copper/ingot':2 },
    out:[ { sub:'press', form:'rig', n:1 } ],
    secs:12.0,
    hand:true
  }),

  belt_r: Object.freeze({
    id:'belt_r', name:'CONVEYOR',
    in:{ 'copper/plate':2, 'stone/gravel':4 },
    out:[ { sub:'belt_r', form:'rig', n:1 } ],
    secs:10.0,
    hand:true
  }),

  /* ---- the commented row ----
     `docs/DESIGN.md`'s locked compression table fixes ingot at 4:1 (four ore
     become one ingot), so `in` reads 4 here and not the round-number 2 an
     earlier draft shipped with -- `docs/SPEC.md` names this explicitly so the
     two files cannot drift again. */
  smelt: Object.freeze({
    id:'smelt', name:'SMELT',
    in:{ '*/#ore':4, '*/#fuel':1 },
    out:[ { subFrom:'*/#ore', form:'ingot', n:1 } ],
    secs:4.0,
    hand:true
  }),

  /* ---- press: the SECOND compression tier. `docs/DESIGN.md` locks plate at
     12:1 against raw ore; since one ingot already costs 4 ore, three ingots
     is the same 12:1 expressed in ingot terms, so `in` reads 3 rather than a
     fresh ore-relative number. The input selector is star-slash-hash-ingot,
     not star-slash-hash-refined, on purpose (written in words, not symbols,
     for the same reason `forms.js`'s grammar comment does -- a star followed
     by a slash closes a block comment): `refined` also tags `plate` itself
     (see `forms.js`), and selecting on it here would let a press eat its own
     output, one refinement tier "compressing" into itself for free.
     `subFrom` on the matching selector carries the substance across exactly
     the way `smelt` carries it from ore, so a tin plate differs from a
     copper plate with no row written anywhere for tin. */
  press: Object.freeze({
    id:'press', name:'PRESS',
    in:{ '*/#ingot':3, '*/#fuel':1 },
    out:[ { subFrom:'*/#ingot', form:'plate', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* ---- peg_rungs: timber/log -> timber/rung, the cheap dedicated ladder
     (Phase 2a). NOT the plan's literal "1 timber/log -> 4 timber/rung", and
     the reason is `rules/crafting.js#choose`'s own documented limitation:
     "first match wins, a real menu would let you choose" (the menu is
     Phase 5). `kindle`, directly below, ALSO fires off nothing but
     `'timber/log':1` -- two hand-recipes with an IDENTICAL trigger set is a
     tie `choose()` cannot see, and whichever is declared first always wins,
     every time, forever. Shipping `peg_rungs` at the plan's literal 1-log
     cost, in EITHER declaration order, makes one of the two permanently
     unreachable by hand: kindle first starves peg_rungs outright; peg_rungs
     first starves kindle, which Phase 2b needs hand-reachable to restock the
     one carried light source. Requiring 2 logs and declaring peg_rungs
     BEFORE kindle breaks the tie without touching either recipe's own
     table-order neighbour's numbers: holding exactly 1 log fails peg_rungs's
     stronger requirement and falls through to kindle; holding 2 or more
     satisfies peg_rungs first and it wins. Both stay reachable; a player
     with a surplus of logs simply gets rungs until they spend down to one.
     Not caught by `tools/content.mjs` (a content-graph check, not a
     hand-craft-priority one) -- caught by this phase's own manual
     verification, which is exactly what CLAUDE.md's own "a test that
     measures the wrong thing" warning is for. See `forms.js#rung` for the
     mass-conservation half of this same correction. */
  peg_rungs: Object.freeze({
    id:'peg_rungs', name:'PEG RUNGS',
    in:{ 'timber/log':2 },
    out:[ { sub:'timber', form:'rung', n:4 } ],
    secs:1.5,
    hand:true
  }),

  /* ---- kindle: timber/log -> timber/brand. THE FIRST RECIPE WHOSE OUTPUT
     FORM IS NOT A COMPRESSION TIER -- smelt and press both compress toward
     density; kindling does the opposite, one log splitting into three
     lighter, burnable brands. hand:true because no machine performs it;
     Phase 2b plants the player's first brand near spawn regardless, and this
     recipe is how they restock once it burns out. Declared AFTER
     `peg_rungs` now -- see that row's comment for why the order is
     load-bearing, not cosmetic. */
  kindle: Object.freeze({
    id:'kindle', name:'KINDLE',
    in:{ 'timber/log':1 },
    out:[ { sub:'timber', form:'brand', n:3 } ],
    secs:1.5,
    hand:true
  }),

  /* ---- daedalan: 2 copper/plate + 4 timber/log -> 2 copper/stair, the
     tier-2 ladder (Phase 2a). Vertical throughput as an upgradeable axis:
     see `forms.js#stair`'s `climbK`. hand:true for the same reason
     `peg_rungs` is -- no machine builds a ladder, ever. */
  daedalan: Object.freeze({
    id:'daedalan', name:'DAEDALAN STAIR',
    in:{ 'copper/plate':2, 'timber/log':4 },
    out:[ { sub:'copper', form:'stair', n:2 } ],
    secs:6.0,
    hand:true
  }),

  /* ---- auger: the T2 hand tool (Phase 2c). hand:true with no machine ever
     naming it -- same shape as `peg_rungs`/`daedalan` above, nothing builds a
     tool but a pair of hands.

     DECLARED LAST, AFTER `daedalan`, AND THE ORDER IS LOAD-BEARING -- the
     identical collision `peg_rungs`/`kindle` already had. `daedalan` and this
     row share the EXACT SAME input keys (`copper/plate`, `timber/log`) at the
     same plate count (2) and different log counts (4 vs 1), so
     `rules/crafting.js#choose`'s "first HAND_RECIPES row whose inputs are
     fully satisfied wins" cannot see both as available and pick the one you
     meant -- holding 4+ logs satisfies both. Declaring the STRONGER recipe
     (`daedalan`, needing more logs) first, the same fix `peg_rungs` used
     against `kindle`: holding 4 or more logs (and 2+ plate) always yields a
     stair; holding 1-3 satisfies only this row and falls through to it. A
     player who wants the auger keeps their log stock under 4 when crafting
     it. See `docs/FINDINGS.md`. */
  auger: Object.freeze({
    id:'auger', name:'ADAMANT AUGER',
    in:{ 'copper/plate':2, 'timber/log':1 },
    out:[ { sub:'auger', form:'relic', n:1 } ],
    secs:8.0,
    hand:true
  }),

  /* ---- hearth: 2 copper/plate -> hearth/rig, DECLARED ABSOLUTE LAST, after
     even `auger` -- see the machine-recipe block's own header comment above
     for why: this bill (2 plate, nothing else) is a strict SUBSET of every
     other plate-consuming recipe in this table (`lift`, `cyclops_maw`,
     `talos_head`, `press_machine`, `belt_r`, and the pre-existing
     `daedalan`/`auger`), so declaring it any earlier would starve whichever
     of those came after it the moment a player held 2+ plate, the same
     "stronger requirement first" rule every other ordering choice on this
     page already follows, applied to its logical extreme: the weakest bill
     in the file must be the LAST one tried. */
  hearth: Object.freeze({
    id:'hearth', name:'HEARTH',
    in:{ 'copper/plate':2 },
    out:[ { sub:'hearth', form:'rig', n:1 } ],
    secs:4.0,
    hand:true
  })
});

/* Every recipe a player may run directly, in table order. `rules/crafting.js`
   tries them in this order for the same "first one you have materials for
   wins" reason a machine tries ITS `recipes` list in the order it was
   written. Derived once, here, rather than filtered by every reader --
   `view/hud.js`'s CRAFT list and `rules/crafting.js`'s own chooser would
   otherwise be two implementations of "which rows have `hand:true`" that
   could silently disagree, the same failure `MACH`/`M` exist to prevent for
   machines. */
export const HAND_RECIPES = Object.freeze(
  Object.values(RECIPES).filter(r => r.hand));

/* Resolve a machine row's `recipes` into concrete rows. Named strings are
   looked up; objects pass through. Throws on an unknown name, because a
   silently missing recipe is a machine that never runs and never says why. */
export function recipesOf(def) {
  return (def.recipes || []).map(r => {
    if (typeof r !== 'string') return r;
    const row = RECIPES[r];
    if (!row) throw new Error(`recipes: machine "${def.id}" names unknown recipe "${r}"`);
    return row;
  });
}
