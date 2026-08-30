/* LAYER rules — the field step. Walks only the active set.

   DIFFUSION IS DELIBERATELY NOT IMPLEMENTED — the brief says show the seam and
   do not build the solver. What is here is the shape the solver goes in: decay,
   deactivate below epsilon, and the comment marking where an upward bias makes
   heat buoyant (DESIGN item 5) and where a downward one makes water flood from
   the bottom (item 6).

   It does not touch `b.ver`. Field writes must not invalidate chunk paint:
   those canvases cache static rock, and a flood front would re-cache them every
   frame. Fields draw as an overlay in `view/overlays.js`. */

import { FIELDS } from '../data/world.js';
import { bands } from '../model/world.js';
import { activeOf, hasField, write as fw } from '../model/fields.js';

const DECAY = { heat: 0.35, water: 0.0 };      // per second
const EPS = 0.01;

export function step(dt) {
  for (const b of bands)
    for (const name of FIELDS) {
      if (!hasField(b, name)) continue;
      const f = b.fields[name];
      const decay = (DECAY[name] ?? 0) * dt;
      for (const i of activeOf(b, name)) {
        const v = f.v[i] - decay;
        fw.set(b, name, i, v > 0 ? v : 0);

        /* THE SOLVER GOES HERE.
           heat:  move a share of v to i - b.tw (upward bias), the rest sideways
           water: move a share to i + b.tw (downward), the rest sideways
           then `fw.activate` the four neighbours that changed by more than EPS.
           Not implemented; the active set, the storage and the overlay are. */

        if (f.v[i] < EPS) fw.deactivate(b, name, i);
      }
    }
}
