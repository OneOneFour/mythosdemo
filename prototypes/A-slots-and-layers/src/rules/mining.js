/* ============================================================
   MINING — the verb, and why it lives here.

   Mining is something an ACTOR does to a tile. It is not a property of tile
   storage: the tile declares only how long it takes and what it yields
   (data/substances.js), the actor declares how hard it swings
   (data/tunables.js, `mine.power`), and the accumulated seconds live in
   model/mining.js keyed by tile index.

   Three consequences of that placement:
     - progress is in the same unit as `hard` (seconds), with no scale factor
       and no integer store, so a material takes exactly its stated time at
       any framerate
     - pick power is a tunable, so a trinket can change it (DESIGN item 8)
     - hardness is a tunable scoped by substance id, so Gaia's Patience can
       soften granite alone without touching data/substances.js
   ============================================================ */

import { AIR, S } from '../data/substances.js';
import { cur, idx } from '../model/world.js';
import { hardOf, subAt, write as tw } from '../model/tiles.js';
import { write as mw } from '../model/mining.js';
import { write as iw } from '../model/items.js';
import { stat } from '../model/mods.js';
import { player } from '../model/player.js';
import { write as jw } from '../model/journal.js';

/* Which tile the player is pointing at. STUB (leaf): aim is one line of
   trigonometry against the cursor and is not what this prototype is for. */
const aim = () => ({ tx: (player.x / cur.band.tile) | 0,
                     ty: (player.y / cur.band.tile) | 0 });

export function step(dt) {
  const b = cur.band;
  if (!player.cmd.dig) return;

  const { tx, ty } = aim();
  const sub = subAt(b, tx, ty);
  if (!sub.tile || sub.tile.drop === undefined) return;      // not mineable

  const hard = hardOf(b, tx, ty) * stat('mine.hardness', sub.id);
  if (!isFinite(hard)) return;                                // bedrock

  const i = idx(b, tx, ty);
  const work = mw.add(i, dt * stat('mine.power'));
  if (work < hard) return;

  mw.clear(i);
  tw.set(b, tx, ty, AIR);
  iw.spawn(tx * b.tile + b.tile / 2, ty * b.tile + b.tile / 2, S[sub.tile.drop]);
  jw.push('break', sub.id, i);
}

/* The crack overlay does NOT read this module. `view` may not import `rules`
   (they are siblings), so the overlay reads model/mining.js's `progressAt`
   directly. That sibling rule is the load-bearing half of the layering: it is
   what stopped view/paint.js from importing the gameplay table, which is how
   `if (M.id === 'copper')` got into src/world/paint.js:127 in the first place.
   The cost is that anything two layers want must be state in `model`, not a
   helper in `rules` — see README, "What fought me". */
