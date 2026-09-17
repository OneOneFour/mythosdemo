/* data layer — one row per god id the content tables use. Frozen.

     name  display string. `core/font.js` has no lowercase glyphs, so a
           mixed-case name is silently mangled rather than refused.

   Rows are unordered; nothing derives a sequence from this table. */

export const GODS = [
  { id:'hephaestus', name:'HEPHAESTUS' },
  { id:'athena',     name:'ATHENA' },
  { id:'poseidon',   name:'POSEIDON' },
  { id:'ares',       name:'ARES' },
  { id:'hades',      name:'HADES' }
];

export const GOD = Object.freeze(Object.fromEntries(
  GODS.map(g => [g.id, Object.freeze(g)])));

/* Display name for an id, falling back to the id uppercased. */
export const godName = id => GOD[id]?.name ?? String(id).toUpperCase();
