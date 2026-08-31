/* LAYER data — TUNABLES: the frozen DESIGN. Base values only. Never written.

   ============================================================================
   IMPORT RULE, ENFORCED: only `model/mods.js` may import this file.
   `tools/layers.mjs` fails the build on any other importer.
   ============================================================================

   That rule is the whole trick. ES module bindings are read-only for importers,
   so a boon cannot reassign `export const WALK = 60`, and this table being
   frozen means it cannot be patched either. Both facts are fine, because
   nothing reads this file directly: consumers call `eff('walk')` from
   `model/mods.js`, which returns base x this run's modifiers. If the checker
   did not forbid the direct import, one lazy call site would silently opt out
   of every trinket in the game and nobody would notice for a month.

   Two kinds of row, and the difference is only what `base` means:

     kind:'value'  the number itself. `eff('walk')` is 60, or 69 with sandals.
     kind:'scale'  a multiplier on a literal that lives on a data row, because
                   there are as many of those as there are rows. Hardness lives
                   on the substance and recipe time lives on the machine; this
                   table holds the 1.0 a trinket bends. `scope` names what may
                   follow a dot: `hard.stone`, `rate.furnace`.

     scoped        PER-SCOPE BASE OVERRIDES for a scale row. This is how a
                   variant machine is faster purely by tuning:
                   `rate.kiln_divine` has base 2.0 while every other machine has
                   base 1.0, and a trinket still stacks multiplicatively on top
                   without either knowing the other exists.

   A trinket mod key that is not a row here -- or whose scope does not resolve to
   a real substance or machine id -- fails `tools/resolve.mjs`. */

export const TUNABLES = [

  /* ---- the player. Ported unchanged from the previous `sim/player.js`. ---- */
  { id:'walk',      kind:'value', base:60,   unit:'px/s',   note:'ground speed; 7.5 tiles/s' },
  { id:'hop',       kind:'value', base:92,   unit:'px/s',   note:'launch; ~1 tile + margin, deliberately not enough to escape a 5-tile hole' },
  { id:'climb',     kind:'value', base:30,   unit:'px/s',   note:'half walk, on purpose. Up is expensive.' },
  { id:'coyote',    kind:'value', base:0.09, unit:'s',      note:'grace after leaving the ground' },
  { id:'reach',     kind:'value', base:25.6, unit:'px',     note:'3.2 tiles from the player centre' },
  { id:'pickPower', kind:'value', base:1.0,  unit:'x',      note:'seconds of dig credited per second held' },
  { id:'pickupR',   kind:'value', base:10,   unit:'px',     note:'radius at which a resting item is pocketed' },

  /* ---- falling. The table is locked in docs/SPEC.md section 3:
            safe   =  5 tiles  ( 40 px) -> 160 px/s -> 0 hearts
            lethal = 20 tiles  (160 px) -> 320 px/s -> 5 hearts
          so one heart per 32 px/s above 160. ---- */
  { id:'grav',      kind:'value', base:320,  unit:'px/s^2' },
  { id:'terminal',  kind:'value', base:400,  unit:'px/s' },
  { id:'fallSafe',  kind:'value', base:160,  unit:'px/s',   note:'5 tiles; no damage at or below' },
  { id:'fallHeart', kind:'value', base:32,   unit:'px/s',   note:'one heart per this much over fallSafe' },
  { id:'fallMax',   kind:'value', base:5,    unit:'hearts', note:'clamp; equals a full heart bar, so 20 tiles kills' },

  /* ---- the staged lift. Down is free, up is expensive. ---- */
  { id:'liftUp',    kind:'value', base:11,   unit:'px/s',   note:'ascend. Only with a lit burner.' },
  { id:'liftDown',  kind:'value', base:26,   unit:'px/s',   note:'descend. 2.4x faster, and free.' },

  /* ---- belts. Horizontal, not vertical, so neither "down is free" nor "up is
     expensive" applies directly -- the cost is paid up front, in `cost` on
     `data/machines.js`'s belt rows, and continuously, in the fuel that keeps
     `rules/belts.js` dragging at all. This number is deliberately closer to
     `walk` than to either lift speed: a belt earns its keep by running
     unattended, not by outrunning the player. */
  { id:'beltSpeed', kind:'value', base:50,   unit:'px/s',   note:'drag speed while charged. See rules/belts.js.' },

  /* ---- fields. Seam only: `rules/fields.js` decays and does not diffuse. ---- */
  { id:'heatDecay', kind:'value', base:0.35, unit:'/s',     note:'fraction lost per second' },

  /* ---- fog of war. `rules/reveal.js` runs two passes; only the second needs a
     number. Pass A (standing in open sky) is deliberately UNBOUNDED and reads
     nothing here -- there is nothing to obstruct a view across open air, so it
     has no radius to tune. Pass B (a flood through open tiles, blocked by
     solid rock) is what makes an underground cavern read as "somewhat, not
     all the way" visible, and this is its cap. 12 is a graph distance, not a
     straight line -- a corridor that switches back on itself burns distance
     fast -- and was picked as obviously more than the old radius-1 behaviour
     (a single tile's worth of neighbours) and obviously short of "reveal the
     whole cavern" for any room bigger than a small one. */
  { id:'sightRadius', kind:'value', base:12, unit:'tiles',
    note:'graph-distance cap on the Pass B flood in rules/reveal.js. Pass A has no cap.' },

  /* ---- scales, one row per family of data rows ---- */
  { id:'hard', kind:'scale', base:1.0, scope:'substance',
    note:'multiplies `tile.hard`. Lower is faster to mine. `hard.stone` scopes it.' },

  /* The variant proof. `kiln_divine` is a copy of the furnace row with a
     different id; it is twice as fast because of this one line and nothing
     else. No engine code learned the word "kiln". */
  { id:'rate', kind:'scale', base:1.0, scope:'machine',
    scoped:{ kiln_divine:2.0 },
    note:'multiplies machine progress. Higher is faster. `rate.furnace` scopes it.' },

  { id:'yield', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies output counts, rounded down. Where a "doubling" boon goes.' }
];

export const TUNE = Object.freeze(Object.fromEntries(
  TUNABLES.map(t => [t.id, Object.freeze(t)])));
