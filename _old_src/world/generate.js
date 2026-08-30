import { mulberry, hash2 } from '../core/rng.js';
import { WORLD_TH, WORLD_TW, clearGrid, grid, idx, setTile } from './grid.js';
import { T } from './tiles.js';


/* ============================================================
   GENERATION — tutorial band

   Only the first band exists in the prototype. It is generated
   rather than authored, but with hard guarantees around the spawn
   point so the first two minutes always play the same way.
   ============================================================ */

export const SPAWN_TX   = 42;            // player spawn column
export const SURFACE_TY = 26;            // nominal turf row

/* Filled in by generate(): the turf row for every column. */
export const surface = new Int16Array(WORLD_TW);

export const SITE = {};                  // landmark tile coords for other systems

const FLAT_LO = SPAWN_TX - 9, FLAT_HI = SPAWN_TX + 9;   // guaranteed level ground

export function generate(seed = 1337) {
  const rng = mulberry(seed);
  clearGrid();

  /* --- surface profile: gentle rolling, with a cliff wall on the left
         and a flat shelf around spawn so the tutorial is deterministic --- */
  for (let x = 0; x < WORLD_TW; x++) {
    let h = SURFACE_TY
      + Math.round(Math.sin(x * 0.055) * 2.2)
      + Math.round(Math.sin(x * 0.17 + 1.3) * 1.1);
    if (x < 14) h -= 7 - Math.round(x * 0.4);            // the cliff you wake at
    if (x >= FLAT_LO && x <= FLAT_HI) h = SURFACE_TY;    // the shelf
    surface[x] = h;
  }

  /* --- strata fill --- */
  for (let x = 0; x < WORLD_TW; x++) {
    const s = surface[x];
    for (let y = s; y < WORLD_TH; y++) {
      let m;
      if (y === s)              m = T.grass;
      else if (y < s + 7)       m = T.soil;
      else if (y < 120)         m = T.lime;
      else                      m = T.granite;
      // ragged strata boundary rather than a ruled line
      if (y >= s + 5 && y < s + 9 && hash2(x, y) < 0.35) m = T.lime;
      if (y >= 116 && y < 124 && hash2(x, y * 3) < 0.4)  m = T.granite;
      grid.mat[idx(x, y)] = m;
    }
  }

  /* --- the soft seam: a visibly lighter column right under spawn.
         hard 0.15 vs soil's 0.30, so the very first dig is quick --- */
  const s0 = surface[SPAWN_TX];
  for (let y = s0 + 1; y <= s0 + 5; y++)
    for (let x = SPAWN_TX - 1; x <= SPAWN_TX + 1; x++)
      if (hash2(x, y + 40) < 0.86) grid.mat[idx(x, y)] = T.seam;
  SITE.seam = { tx: SPAWN_TX, ty: s0 + 1 };

  /* --- guaranteed first copper vein, 6 tiles under the seam --- */
  blob(SPAWN_TX, s0 + 8, 3.1, T.copper, 991);
  SITE.firstVein = { tx: SPAWN_TX, ty: s0 + 8 };

  /* --- scattered copper elsewhere, richer with depth --- */
  for (let i = 0; i < 90; i++) {
    const bx = 4 + ((rng() * (WORLD_TW - 8)) | 0);
    const by = SURFACE_TY + 12 + ((rng() * (WORLD_TH - SURFACE_TY - 20)) | 0);
    if (Math.abs(bx - SPAWN_TX) < 6 && by < s0 + 14) continue;   // keep the tutorial clean
    if (rng() > 0.25 + by / WORLD_TH * 0.6) continue;            // deeper = more likely
    blob(bx, by, 1.6 + rng() * 2.2, T.copper, 3000 + i);
  }

  /* --- caves, so the world is not a solid block --- */
  for (let i = 0; i < 26; i++) {
    let cx = 6 + rng() * (WORLD_TW - 12);
    let cy = SURFACE_TY + 20 + rng() * (WORLD_TH - SURFACE_TY - 30);
    const steps = 30 + ((rng() * 70) | 0);
    for (let k = 0; k < steps; k++) {
      blob(cx | 0, cy | 0, 1.4 + rng() * 1.6, T.air, 7000 + i * 97 + k);
      cx += (rng() - 0.5) * 4.2;
      cy += (rng() - 0.35) * 3.0;
      if (cx < 3 || cx > WORLD_TW - 3 || cy > WORLD_TH - 4) break;
    }
  }

  /* --- the dead olive tree: the only timber on the surface, and so the
         only ladder material until you find more --- */
  const otx = SPAWN_TX + 7, oty = surface[otx];
  for (let y = oty - 1; y >= oty - 6; y--) setTile(otx, y, T.timber);
  blob(otx, oty - 7, 2.6, T.leaves, 555);
  setTile(otx, oty - 7, T.timber);
  SITE.tree = { tx: otx, ty: oty - 6 };

  /* --- landmarks other systems need --- */
  SITE.pick  = { tx: SPAWN_TX - 5, ty: surface[SPAWN_TX - 5] - 1 };
  SITE.altar = { tx: SPAWN_TX - 14, ty: surface[SPAWN_TX - 14] - 1 };
  SITE.spawn = { tx: SPAWN_TX, ty: s0 - 2 };

  grid.dirty.fill(1);
  return SITE;
}

/* round-ish cluster, used for veins, cave nodes and foliage */
function blob(cx, cy, r, mat, seed) {
  const rr = r * r;
  const ri = Math.ceil(r);
  for (let y = cy - ri; y <= cy + ri; y++)
    for (let x = cx - ri; x <= cx + ri; x++) {
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d > rr) continue;
      if (d > rr * 0.45 && hash2(x * 7 + seed, y * 13) < 0.42) continue;  // ragged rim
      setTile(x, y, mat);
    }
}
