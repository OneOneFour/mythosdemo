import { R, offscreen } from '../core/canvas.js';
import { P, mix } from '../core/palette.js';
import { hash2 } from '../core/rng.js';
import { CHUNK, CHUNKS_X, CHUNKS_Y, CHUNK_PX, TILE, dmgAt, grid, tileAt } from './grid.js';
import { AIR, MAT, isSolid } from './tiles.js';
import { surface } from './generate.js';


/* ============================================================
   CHUNK PAINTING

   The mockup baked one 1024x2520 strip with painterly helpers. The
   same helpers run here, but per 128x128 chunk, so a dig repaints
   ~1/1500th of what a full bake cost. Each chunk keeps its own
   offscreen canvas; the renderer only blits.
   ============================================================ */
const chunks = Array.from({ length: CHUNKS_X * CHUNKS_Y }, () => null);

export const stats = { painted: 0, repaints: 0 };

/* Cave interior darkness by depth — the mockup's rockOf().dark, which
   is what made carved space read as cut rather than painted. */
export function darkAt(ty) {
  const y = ty * TILE;
  if (y <  360) return '#2b1e12';
  if (y <  960) return '#453f36';
  if (y < 1600) return '#33210f';
  return '#1a1520';
}

export function resetChunks() {
  chunks.fill(null);
  stats.painted = 0; stats.repaints = 0;
}

export function chunkAt(cx, cy) {
  const k = cy * CHUNKS_X + cx;
  if (!chunks[k]) {
    chunks[k] = offscreen(CHUNK_PX, CHUNK_PX);
    grid.dirty[k] = 1;
  }
  if (grid.dirty[k]) { paintChunk(cx, cy, chunks[k]); grid.dirty[k] = 0; }
  return chunks[k].canvas;
}

export function paintChunk(cx, cy, ch) {
  const g = ch.g;
  const t0x = cx * CHUNK, t0y = cy * CHUNK;
  g.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
  stats.painted++;
  if (chunks[cy * CHUNKS_X + cx]) stats.repaints++;

  for (let j = 0; j < CHUNK; j++) {
    const ty = t0y + j, py = j * TILE;
    for (let i = 0; i < CHUNK; i++) {
      const tx = t0x + i, px = i * TILE;
      const m = tileAt(tx, ty);
      if (m === -1) { R(g, px, py, TILE, TILE, '#000000'); continue; }

      if (m === AIR) {
        // open sky stays transparent so the scene's sky shows through;
        // anything at or below the turf line is excavated rock
        const s = surface[tx] !== undefined ? surface[tx] : 0;
        if (ty >= s) paintCavity(g, px, py, tx, ty);
        continue;
      }
      paintTile(g, px, py, tx, ty, m);
    }
  }
}

/* --- excavated space: dark, with a floor lip and roof fringe so the
       void reads as cut out of the rock rather than simply absent --- */
function paintCavity(g, px, py, tx, ty) {
  const dark = darkAt(ty);
  R(g, px, py, TILE, TILE, dark);
  // faint grain, otherwise large caves read as flat holes
  for (let k = 0; k < 3; k++) {
    const h = hash2(tx * 31 + k, ty * 17);
    if (h < 0.45)
      R(g, px + ((h * 8) | 0), py + ((hash2(k, ty + tx) * 8) | 0), 1, 1,
        mix(dark, '#ffffff', 0.07));
  }
  const below = tileAt(tx, ty + 1), above = tileAt(tx, ty - 1);
  // floor lip: the top edge of the rock under an open space
  if (below !== AIR && below !== -1 && isSolid(below)) {
    const lip = MAT[below].a;
    for (let x = 0; x < TILE; x++) {
      const j = ((hash2(tx * TILE + x, ty) * 3) | 0) - 1;
      R(g, px + x, py + TILE - 1 + j, 1, 1, lip);
      if (hash2(tx * TILE + x, 91) < 0.28)
        R(g, px + x, py + TILE - 2 + j, 1, 1, MAT[below].c);
    }
  }
  // stalactite fringe hanging from a rock ceiling
  if (above !== AIR && above !== -1 && isSolid(above))
    for (let x = 0; x < TILE; x += 3) {
      const d = (hash2(tx * TILE + x, 77) * 4) | 0;
      if (d > 1) R(g, px + x, py, 2, d, MAT[above].c);
    }
}

/* --- solid rock: base tone, hash grain, lit top edge where exposed,
       and crack marks as the pick does its work --- */
function paintTile(g, px, py, tx, ty, m) {
  const M = MAT[m];
  R(g, px, py, TILE, TILE, M.b);

  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const h = hash2(tx * TILE + x, ty * TILE + y);
      if (h < 0.16)      R(g, px + x, py + y, 1, 1, M.c);
      else if (h > 0.90) R(g, px + x, py + y, 1, 1, M.a);
    }

  // exposed faces catch light; buried faces do not
  if (!solidNb(tx, ty - 1))
    for (let x = 0; x < TILE; x++) {
      const j = ((hash2(tx * TILE + x, ty * 7) * 3) | 0) - 1;
      R(g, px + x, py + Math.max(0, j), 1, 2, M.a);
    }
  if (!solidNb(tx - 1, ty)) R(g, px, py, 1, TILE, mix(M.b, M.a, 0.45));
  if (!solidNb(tx + 1, ty)) R(g, px + TILE - 1, py, 1, TILE, mix(M.b, M.c, 0.5));
  if (!solidNb(tx, ty + 1)) R(g, px, py + TILE - 1, TILE, 1, M.c);

  // ore glints, so a vein is spottable from a distance
  if (M.id === 'copper')
    for (let k = 0; k < 2; k++) {
      const hx = (hash2(tx + k * 13, ty * 5) * TILE) | 0;
      const hy = (hash2(ty + k * 7, tx * 3) * TILE) | 0;
      R(g, px + hx, py + hy, 1, 1, P.veinA);
    }

  const d = dmgAt(tx, ty);
  if (d > 0.05) paintCracks(g, px, py, tx, ty, d);
}

const solidNb = (tx, ty) => {
  const t = tileAt(tx, ty);
  return t === -1 || (t !== AIR && isSolid(t));
};

/* Cracks are drawn from the tile's own hash, so they grow in place
   rather than flickering between frames. */
function paintCracks(g, px, py, tx, ty, d) {
  const n = 1 + ((d * 5) | 0);
  for (let k = 0; k < n; k++) {
    let x = 1 + ((hash2(tx * 3 + k, ty * 11) * (TILE - 2)) | 0);
    let y = 1 + ((hash2(ty * 3 + k, tx * 11) * (TILE - 2)) | 0);
    const len = 1 + ((d * 4) | 0);
    for (let s = 0; s < len; s++) {
      R(g, px + x, py + y, 1, 1, '#160f0a');
      x += hash2(x + k, y + s) < 0.5 ? 1 : -1;
      y += hash2(y + s, x + k) < 0.62 ? 1 : 0;
      if (x < 0 || x >= TILE || y < 0 || y >= TILE) break;
    }
  }
}
