/* LAYER data — BOONS: the TIMED tier of docs/DESIGN.md's four god-gift tiers
   (CLAUDE.md "Resolved decisions" D1). Frozen. Imports nothing.
   May be imported by `data`, `model`, `rules`, `view`.

   This is the tier that used to share a name and a file with the
   MACHINE-GRANT tier -- `docs/BUILD_PLAN.md` Phase 4 Step 1 moved that one
   to `data/grants.js` / `rules/grants.js` and freed this name for what it
   always should have meant: a modifier that happens TO the player for N
   seconds and counts down in the corner of the screen. Nothing here is a
   resource the player spends; it is weather.

   Reaches numbers the ONLY way anything in this game does: `mods`, the same
   `{ key, mul, add }` row shape `data/trinkets.js` already uses, applied
   through `model/mods.js` in the SAME fixed order
   `(base + sum of add) x product of mul`. `rules/boons.js` keys every row
   `'boon:' + id` so this tier and the trinket tier can never remove each
   other's rows (`model/mods.js`'s own header states the convention this
   continues).

     secs           how long the boon lasts once granted. Re-granting the
                    SAME boon REFRESHES this and does not stack magnitude --
                    the god does not give the gift twice as hard, just again.
     conflictsWith  [{ id, mode }]. `docs/DESIGN.md`: "gifts from different
                    gods are mutually hostile." When BOTH the named boon and
                    this one would be active at once, the OLDER of the two
                    (whichever was granted first -- i.e. appears earlier in
                    `model/boons.js#boons.active`) is either:
                      'suppress'  its rows are removed entirely while the
                                  newer one is active, as if it were not
                                  granted at all for as long as the conflict
                                  holds.
                      'invert'    its own mul/add are flipped (mul -> 1/mul,
                                  add -> -add) while the newer one is active,
                                  so what helped now hurts.
                    `rules/boons.js#step` recomputes this every frame from
                    the CURRENT active list, so an expiring newer boon lets
                    the older one's true effect resume with no code needing
                    to remember it was ever overridden.
     trap           OPTIONAL, for a future HUD treatment (docs/DESIGN.md:
                    "some gifts are traps... offered on cycle 3 when you are
                    desperate"). Not read by any code this phase; the field
                    exists so content can already say so. */

export const BOONS = [

  { id:'hephaestus-forge', name:'FORGE OF HEPHAESTUS', god:'hephaestus', secs:60,
    text:'THE FORGE BURNS HOT',
    mods:[ { key:'rate.furnace', mul:1.5 } ] },

  /* docs/DESIGN.md's own worked example: "Poseidon's aquifer tap floods the
     strata Hephaestus's kilns need dry." The flood softens every rock
     (`hard`, UNSCOPED -- every substance, the same reach `model/mods.js`'s
     header names for a trinket that softens everything) but douses a forge
     already burning: SUPPRESS, the older boon's rows vanish entirely while
     both would be active. */
  { id:'poseidon-flood', name:"POSEIDON'S FLOOD", god:'poseidon', secs:60,
    text:'THE DEEP RISES; THE FORGE GUTTERS',
    mods:[ { key:'hard', mul:0.85 } ],
    conflictsWith:[ { id:'hephaestus-forge', mode:'suppress' } ] },

  { id:'athena-focus', name:"ATHENA'S FOCUS", god:'athena', secs:50,
    text:'A STEADIER HAND',
    mods:[ { key:'pickPower', mul:1.25 } ] },

  /* The OTHER resolution mode, INVERT, and a trap in the same row
     (docs/DESIGN.md: "some gifts are traps... offered on cycle 3 when you
     are desperate"). Ares' frenzy reads as a pure buff (`pickPower` +0.2,
     flat) but if Athena's focus is already running, the frenzy turns her
     precision against itself: her 1.25x becomes 0.8x while his lasts, so a
     player holding both is WORSE off than holding neither. */
  { id:'ares-frenzy', name:"ARES' FRENZY", god:'ares', secs:40, trap:true,
    text:'STRIKE WITHOUT THINKING',
    mods:[ { key:'pickPower', add:0.2 } ],
    conflictsWith:[ { id:'athena-focus', mode:'invert' } ] },

  /* The side-effect boon `data/miracles.js#chasm` grants: one of the
     tier's three stated sources (god grant, altar use, miracle
     side-effect) -- opening a rift eases the climb back out of it. No
     `conflictsWith`: a miracle's own side-effect is not a god's draft, so
     there is no rival draft offer for it to be hostile against. */
  { id:'hades-passage', name:'THE WAY IS EASED', god:'hades', secs:20,
    text:'THE WAY IS EASED',
    mods:[ { key:'climb', mul:1.3 } ] }
];

export const BOON = Object.freeze(Object.fromEntries(
  BOONS.map(b => [b.id, Object.freeze(b)])));
