/* LAYER data — GODS: one row per god id the content tables use. Frozen.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   A god is a NAME, and nothing else yet. Every gift tier
   (`data/boons.js`, `data/trinkets.js`, `data/miracles.js`,
   `data/grants.js`) and every cycle's `asker` already carries a `god` id;
   until now the only display name for one was a three-entry constant in
   `view/hud.js`, so `ares` and `hades` could be asked for and could never be
   named. This is the table that makes the id a person.

     name  the display string, UPPERCASE like every other HUD label. The
           5x7 font has no lowercase, so a mixed-case name here would be
           silently mangled rather than refused (`core/font.js`).

   Rows are unordered: nothing derives a sequence from this table, and the
   FAVOUR panel orders its bars by who has actually asked. */

export const GODS = [
  { id:'hephaestus', name:'HEPHAESTUS' },
  { id:'athena',     name:'ATHENA' },
  { id:'poseidon',   name:'POSEIDON' },
  { id:'ares',       name:'ARES' },
  { id:'hades',      name:'HADES' }
];

export const GOD = Object.freeze(Object.fromEntries(
  GODS.map(g => [g.id, Object.freeze(g)])));

/* The display name for an id, falling back to the id itself uppercased --
   a god with no row still reads as a word rather than as `undefined`. */
export const godName = id => GOD[id]?.name ?? String(id).toUpperCase();
