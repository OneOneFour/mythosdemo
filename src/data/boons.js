/* data layer — the timed god-gift tier. Frozen.

     god            a `data/gods.js` id.
     secs           duration in seconds. Re-granting the same boon refreshes
                    it and does not stack magnitude.
     conflictsWith  [{ id, mode }], mode 'suppress' or 'invert'. The older of
                    two active boons is the one acted on.
     trap           read by no code yet.
     mods           `{ key, mul, add }` rows, as `model/mods.js` reads them. */

export const BOONS = [

  { id:'hephaestus-forge', name:'FORGE OF HEPHAESTUS', short:'FORGE', god:'hephaestus', secs:60,
    text:'THE FORGE BURNS HOT',
    mods:[ { key:'rate.furnace', mul:1.5 } ] },

  { id:'poseidon-flood', name:"POSEIDON'S FLOOD", short:'FLOOD', god:'poseidon', secs:60,
    text:'THE DEEP RISES; THE FORGE GUTTERS',
    mods:[ { key:'hard', mul:0.85 } ],
    conflictsWith:[ { id:'hephaestus-forge', mode:'suppress' } ] },

  { id:'athena-focus', name:"ATHENA'S FOCUS", short:'FOCUS', god:'athena', secs:50,
    text:'A STEADIER HAND',
    mods:[ { key:'pickPower', mul:1.25 } ] },

  { id:'ares-frenzy', name:"ARES' FRENZY", short:'FRENZY', god:'ares', secs:40, trap:true,
    text:'STRIKE WITHOUT THINKING',
    mods:[ { key:'pickPower', add:0.2 } ],
    conflictsWith:[ { id:'athena-focus', mode:'invert' } ] },

  /* Granted as a side effect by `data/miracles.js#chasm`. */
  { id:'hades-passage', name:'THE WAY IS EASED', short:'PASSAGE', god:'hades', secs:20,
    text:'THE WAY IS EASED',
    mods:[ { key:'climb', mul:1.3 } ] }
];

export const BOON = Object.freeze(Object.fromEntries(
  BOONS.map(b => [b.id, Object.freeze(b)])));
