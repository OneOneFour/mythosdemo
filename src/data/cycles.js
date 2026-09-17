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

  /* Grants the two machines the next row's `at` and `demand` need. */
  { id:'first-trial', god:'hephaestus', at:'altar',
    demand:[ { sub:'copper', form:'ore', n:10 } ],
    deadlineSecs:null,
    reward:{ favour:1, grants:['furnace', 'cloud_dock'], charts:['astral'] } },

  /* Three plate is 36 ore and 12 fuel through two recipes. */
  { id:'first-delivery', god:'hephaestus', at:'cloud_dock',
    demand:[ { sub:'copper', form:'plate', n:3 } ],
    deadlineSecs:480,
    reward:{ favour:2, charts:['topsoil'], draft:'grant' },
    punishment:{ hearts:1, favour:-1 } },

  /* `tin` has no vein above topsoil row 60 (`data/world.js`), so this row is
     unpayable from the surface band. */
  { id:'grey-eyed-tithe', god:'athena', at:'cloud_dock',
    demand:[ { sub:'copper', form:'plate', n:6 },
             { sub:'tin',    form:'ingot', n:4 } ],
    deadlineSecs:420,
    reward:{ favour:2, draft:'boon' },
    punishment:{ hearts:2, favour:-1 } },

  /* `granite` is `tile.tier 2` (`data/substances.js`), which a stock pick
     cannot break, so this row is unpayable until the auger is built. Eight
     plates weigh 19.2 T, inside the 30 T soft cap, so the batch clause does
     not bite a single-climb haul. */
  { id:'salt-tribute', god:'poseidon', at:'cloud_dock',
    demand:[ { sub:'copper',  form:'plate',  n:8 },
             { sub:'granite', form:'gravel', n:8 } ],
    batch:{ sub:'copper', form:'plate', n:4, secs:120 },
    deadlineSecs:360,
    reward:{ favour:3, draft:'trinket' },
    punishment:{ hearts:2, favour:-1 } }
];

export const CYCLE = Object.freeze(Object.fromEntries(
  CYCLES.map(c => [c.id, Object.freeze(c)])));

/* Every god with a cycle row, derived rather than listed. */
export const ASKERS = Object.freeze([...new Set(CYCLES.map(c => c.god))]);
