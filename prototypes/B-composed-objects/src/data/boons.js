/* ============================================================
   BOONS — the three tiers DESIGN drafts 1-of-3 after each tribute cycle.
   All three are data. sim/boons.js is ~40 lines and applies them.

   TRINKETS are the one the six RFCs all missed, this one included: it needs
   somewhere mutable to write, and `export const WALK = 60` is not it. The
   store is sim/tunables.js; a trinket is a list of modifiers against named
   keys in it. Nothing here reassigns a binding.
   ============================================================ */

export const TRINKETS = {
  sandals: {
    name: "HERMES' SANDALS", god: 'hermes',
    text: 'WALK AND CLIMB QUICKER',
    mods: [{ key: 'walk', mul: 1.15 },          // <- the brief's x1.15
            { key: 'climb', mul: 1.15 }]
  },
  adamantTip: {
    name: 'ADAMANT PICK TIP', god: 'hephaestus',
    text: 'STRIKE HARDER; STONE YIELDS SOONER',
    mods: [{ key: 'pick.power', mul: 1.40 },
            { key: 'hard.*', mul: 0.90 }]       // material hardness, wildcard
  },
  bellows: {
    name: "AEOLUS' BELLOWS", god: 'aeolus',
    text: 'EVERY MACHINE RUNS FASTER',
    mods: [{ key: 'machine.rate', mul: 1.25 }]  // machine rates
  },
  ironAnkles: {
    name: 'IRON ANKLES', god: 'hades',
    text: 'FALL FURTHER BEFORE IT COSTS',
    mods: [{ key: 'fall.safe', add: 40 }]       // fall thresholds
  },
  /* A hostile pair, DESIGN item 11: Poseidon's tap is a trinket AND a field
     write, so two trinkets can fight over the same tile. */
  aquiferTap: {
    name: "POSEIDON'S TAP", god: 'poseidon',
    text: 'THE STRATA WEEP',
    mods: [{ key: 'field.heat.decay', mul: 1.60 }]
  }
};

/* MACHINES tier -- DESIGN item 9, granted mid-run. This is a run-state set,
   not a registry edit: MACHINES is a plain object read at placement time and
   there is no boot compile step, so nothing has to support "late" content. */
export const MACHINE_BOONS = {
  giftKiln:       { name: 'THE KILN',        god: 'hephaestus', grants: 'kiln' },
  giftBloodWinch: { name: 'THE BLOOD WINCH', god: 'hades', grants: 'bloodWinch',
                    trap: true, text: 'IT NEEDS NO TIMBER' }
};

/* MIRACLES tier -- DESIGN item 10, one-shot region-scoped tile edits.
   `op` names a function in sim/boons.js; the region is data. */
export const MIRACLES = {
  calcify:  { name: 'CALCIFY',  god: 'hephaestus', op: 'fill',  r: 6, sub: 'lime' },
  collapse: { name: 'COLLAPSE', god: 'poseidon',   op: 'clear', r: 5 }
};
