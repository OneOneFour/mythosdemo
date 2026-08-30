/* LAYER data — TUNABLES: every number a trinket is allowed to move.

   ============================================================================
   IMPORT RULE, ENFORCED: only `model/mods.js` may import this file.
   `tools/layers.mjs` fails the build on any other importer.
   ============================================================================

   That rule is the whole trick. `CLAUDE.md` says ES module bindings are
   read-only for importers, so a boon cannot reassign `export const WALK = 60`,
   and this file being frozen means it cannot be patched either. Both facts are
   fine, because nothing reads this file directly: consumers call
   `eff('walk')` from `model/mods.js`, which returns base x modifiers. If the
   checker did not forbid the direct import, one lazy call site would silently
   opt out of every trinket in the game and nobody would notice for a month.

   Two kinds of row, and the difference is only what `base` means:

     kind:'value'  the number itself. `eff('walk')` -> 60, or 69 with sandals.
     kind:'scale'  a multiplier on a literal that lives on a data row, because
                   there are as many of them as there are rows. Hardness lives
                   on the substance (`tile.hard: 2.40`) and recipe time lives on
                   the machine (`secs: 4.0`); this table holds the 1.0 that a
                   trinket bends. `scope` names what may follow a dot:
                   `hard.granite`, `rate.furnace`.

   A trinket mod key that is not a row here — or whose scope does not resolve to
   a real substance or machine id — fails `tools/resolve.mjs`. */

export const TUNABLES = [
  /* player */
  { id:'walk',      kind:'value', base:60,   unit:'px/s', note:'ground speed' },
  { id:'hop',       kind:'value', base:92,   unit:'px/s', note:'launch; ~1 tile + margin' },
  { id:'climb',     kind:'value', base:30,   unit:'px/s', note:'half walk, on purpose' },
  { id:'pickPower', kind:'value', base:1.0,  unit:'x',    note:'seconds of dig per second held' },
  { id:'reach',     kind:'value', base:25.6, unit:'px',   note:'3.2 tiles from the player centre' },

  /* falling. DESIGN item 8 names fall thresholds explicitly as trinket-tunable */
  { id:'grav',      kind:'value', base:320,  unit:'px/s^2' },
  { id:'terminal',  kind:'value', base:400,  unit:'px/s' },
  { id:'fallSafe',  kind:'value', base:160,  unit:'px/s', note:'5 tiles; no damage below' },
  { id:'fallHeart', kind:'value', base:32,   unit:'px/s', note:'one heart per this much over fallSafe' },

  /* the staged lift. Down is free, up is expensive — CLAUDE.md invariant 5 */
  { id:'liftUp',    kind:'value', base:11,   unit:'px/s' },
  { id:'liftDown',  kind:'value', base:26,   unit:'px/s' },

  /* scales, one per family of data rows */
  { id:'hard', kind:'scale', base:1.0, scope:'substance',
    note:'multiplies `tile.hard`. Lower is faster to mine. `hard.tin` scopes it.' },
  { id:'rate', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies machine progress. Higher is faster. `rate.furnace` scopes it.' },
  { id:'yield', kind:'scale', base:1.0, scope:'machine',
    note:'multiplies output counts, rounded down. Where a "doubling" boon goes.' }
];

export const TUNE = Object.freeze(Object.fromEntries(
  TUNABLES.map(t => [t.id, Object.freeze(t)])));
