/* data layer — what the gods ask for, in order. Frozen.

   `rules/cycles.js` arms row `run.cycle - 1` and never looks at another.

   id            stable string, and the key `run.tribute.id` stores.
   god           a `data/gods.js` id.
   at            the `data/machines.js` id of the receiver that satisfies this
                 cycle; the row it names must carry `tribute:{}`.
   demand        [{ sub, form, n }], concrete pairs and never selectors, so a
                 panel can name the row exactly and `massOfPair` can price it.
   batch         optional `{ sub, form, n, secs }`: deliver `n` of that pair
                 inside any window of `secs` simulated seconds. A second
                 clause on `tributeMet()`, never a replacement for `demand`.
                 A credit stamps on arrival.
   deadlineSecs  seconds, or `null` for no clock. `null` is a real branch
                 rather than a large number: a panel draws no timer.
   reward        { favour, grants?, charts?, draft? }. `favour` is always
                 present. `charts` takes the `????????` off a band's name.
                 `draft` names a tier to offer 1-of-3 from, written into `run`
                 for `shell` to perform.
   punishment    { hearts?, favour? }, absent on a cycle that cannot be
                 missed. */

export const CYCLES = [

  /* Grants the winch, which is the only source of mechanical power, and the
     dock the next row's `at` needs. */
  { id:'first-trial', god:'hephaestus', at:'altar',
    demand:[ { sub:'copper', form:'ore', n:10 } ],
    deadlineSecs:null,
    reward:{ favour:1, grants:['winch', 'cloud_dock'], charts:['astral'] } },

  /* 40 ingots is 40 ore through one 1:1 smelt, and 38.0 T -- one trip inside
     the 40 T cap, so the first delivery needs no second haul. */
  { id:'first-delivery', god:'hephaestus', at:'cloud_dock',
    demand:[ { sub:'copper', form:'ingot', n:40 } ],
    deadlineSecs:480,
    reward:{ favour:2, charts:['topsoil'], draft:'boon' },
    punishment:{ hearts:1, favour:-1 } },

  /* `iron` has no body above topsoil row 10 (`data/world.js`) beyond a thin
     showing in the lowest surface rows, so this row pushes the player below
     the seam. 61.75 T is two trips. */
  { id:'grey-eyed-tithe', god:'athena', at:'cloud_dock',
    demand:[ { sub:'copper', form:'ingot', n:40 },
             { sub:'iron',   form:'ingot', n:25 } ],
    deadlineSecs:420,
    reward:{ favour:2, draft:'boon' },
    punishment:{ hearts:2, favour:-1 } },

  /* `granite` is the bulk gravel source and takes 2.40 s a unit, so 40 gravel
     is 96 seconds of standing at a face. 57.0 T of ingots is two climbs, and
     the batch clause is what makes them two rather than one. */
  { id:'salt-tribute', god:'poseidon', at:'cloud_dock',
    demand:[ { sub:'copper',  form:'ingot',  n:60 },
             { sub:'granite', form:'gravel', n:40 } ],
    batch:{ sub:'copper', form:'ingot', n:30, secs:120 },
    deadlineSecs:360,
    reward:{ favour:3, draft:'trinket' },
    punishment:{ hearts:2, favour:-1 } }
];

export const CYCLE = Object.freeze(Object.fromEntries(
  CYCLES.map(c => [c.id, Object.freeze(c)])));

/* Every god with a cycle row, derived rather than listed. */
export const ASKERS = Object.freeze([...new Set(CYCLES.map(c => c.god))]);
