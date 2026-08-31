/* LAYER data — BOONS: the TIMED tier of docs/DESIGN.md's four god-gift tiers
   (CLAUDE.md "Resolved decisions" D1). Frozen. Imports nothing.
   May be imported by `data`, `model`, `rules`, `view`.

   A boon is a modifier that happens TO the player for N seconds. Nothing here
   is a resource the player spends; it is weather. It reaches numbers through
   `mods`, the same row shape `data/trinkets.js` uses. See
   docs/DEVELOPER_GUIDE.md#the-four-gift-tiers

     secs           how long the boon lasts once granted. Re-granting the
                    SAME boon REFRESHES this and does not stack magnitude --
                    the god does not give the gift twice as hard, just again.
     conflictsWith  [{ id, mode }], mode 'suppress' or 'invert'; the older of
                    the two active boons is the one acted on. Semantics in the
                    guide section above.
     trap           OPTIONAL, for a future HUD treatment. Not read by any code
                    yet; the field exists so content can already say so. */

export const BOONS = [

  { id:'hephaestus-forge', name:'FORGE OF HEPHAESTUS', short:'FORGE', god:'hephaestus', secs:60,
    text:'THE FORGE BURNS HOT',
    mods:[ { key:'rate.furnace', mul:1.5 } ] },

  /* The canonical SUPPRESS example -- see
     docs/DEVELOPER_GUIDE.md#the-four-gift-tiers */
  { id:'poseidon-flood', name:"POSEIDON'S FLOOD", short:'FLOOD', god:'poseidon', secs:60,
    text:'THE DEEP RISES; THE FORGE GUTTERS',
    mods:[ { key:'hard', mul:0.85 } ],
    conflictsWith:[ { id:'hephaestus-forge', mode:'suppress' } ] },

  { id:'athena-focus', name:"ATHENA'S FOCUS", short:'FOCUS', god:'athena', secs:50,
    text:'A STEADIER HAND',
    mods:[ { key:'pickPower', mul:1.25 } ] },

  /* The canonical INVERT example, and a trap in the same row -- see
     docs/DEVELOPER_GUIDE.md#the-four-gift-tiers */
  { id:'ares-frenzy', name:"ARES' FRENZY", short:'FRENZY', god:'ares', secs:40, trap:true,
    text:'STRIKE WITHOUT THINKING',
    mods:[ { key:'pickPower', add:0.2 } ],
    conflictsWith:[ { id:'athena-focus', mode:'invert' } ] },

  /* The side-effect boon `data/miracles.js#chasm` grants -- opening a rift
     eases the climb back out of it. No `conflictsWith`: a miracle's own
     side-effect is not a god's draft, so there is no rival offer to be
     hostile against. */
  { id:'hades-passage', name:'THE WAY IS EASED', short:'PASSAGE', god:'hades', secs:20,
    text:'THE WAY IS EASED',
    mods:[ { key:'climb', mul:1.3 } ] }
];

export const BOON = Object.freeze(Object.fromEntries(
  BOONS.map(b => [b.id, Object.freeze(b)])));
