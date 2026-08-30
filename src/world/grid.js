import { AIR, MAT, hardOf, isClimb, isSolid } from './tiles.js';


/* ============================================================
   THE TILE GRID — single source of truth

   Solidity, appearance, and mining state all come from here. There
   is no second physics model to fall out of sync with, which is the
   main lesson taken from the mockup's VOIDS-plus-bitmap split.

   Storage is chunked so that digging one tile repaints 128x128 px
   instead of the whole world.
   ============================================================ */
export const TILE   = 8;                 // px per tile
export const CHUNK  = 16;                // tiles per chunk edge
export const CHUNK_PX = TILE * CHUNK;    // 128 px

export const WORLD_TW = 128;             // tiles wide  -> 1024 px
export const WORLD_TH = 384;             // tiles deep  ->  3072 px

export const WORLD_W = WORLD_TW * TILE;
export const WORLD_H = WORLD_TH * TILE;

export const CHUNKS_X = Math.ceil(WORLD_TW / CHUNK);
export const CHUNKS_Y = Math.ceil(WORLD_TH / CHUNK);

/* mat: material id per tile.
   prog: SECONDS of accumulated pick time per tile, as a float.

   This was a Uint8Array holding a 0..255 fraction, which quietly made hard
   material unmineable: the per-frame increment `(dt / hard) * 255` truncated
   to an integer, so any material was permanently unbreakable above
   `255 / hard` fps. Granite (hard 2.40) died above 106 fps — i.e. on any
   120 Hz display — and a future material at hard 4.0 would have died above
   64 fps. Storing seconds directly removes the scaling, the truncation and
   the framerate threshold in one go, and makes `prog` directly comparable to
   a material's `hard` value. Costs 3 bytes/tile: 147 KB for the whole world. */
export const grid = {
  mat: new Uint8Array(WORLD_TW * WORLD_TH),
  prog: new Float32Array(WORLD_TW * WORLD_TH),
  dirty: new Uint8Array(CHUNKS_X * CHUNKS_Y)     // 1 = needs repaint
};

export const idx = (tx, ty) => ty * WORLD_TW + tx;

export const inBounds = (tx, ty) =>
  tx >= 0 && tx < WORLD_TW && ty >= 0 && ty < WORLD_TH;

/* Out of bounds reads: the sides and floor are unbreakable rock so the
   player cannot walk off the world; above the top is open sky. */
export function tileAt(tx, ty) {
  if (ty < 0) return AIR;
  if (!inBounds(tx, ty)) return -1;              // -1 = world boundary, solid
  return grid.mat[idx(tx, ty)];
}

export const solidAt = (tx, ty) => {
  const t = tileAt(tx, ty);
  return t === -1 || isSolid(t);
};

export const climbAt = (tx, ty) => {
  const t = tileAt(tx, ty);
  return t !== -1 && isClimb(t);
};

/* world px -> tile */
export const tx = px => Math.floor(px / TILE);
export const ty = py => Math.floor(py / TILE);

export function markDirty(tx_, ty_) {
  const cx = (tx_ / CHUNK) | 0, cy = (ty_ / CHUNK) | 0;
  if (cx < 0 || cx >= CHUNKS_X || cy < 0 || cy >= CHUNKS_Y) return;
  grid.dirty[cy * CHUNKS_X + cx] = 1;
  // a tile on a chunk seam bleeds its edge shading into the neighbour
  if (tx_ % CHUNK === 0          && cx > 0)            grid.dirty[cy * CHUNKS_X + cx - 1] = 1;
  if (tx_ % CHUNK === CHUNK - 1  && cx < CHUNKS_X - 1) grid.dirty[cy * CHUNKS_X + cx + 1] = 1;
  if (ty_ % CHUNK === 0          && cy > 0)            grid.dirty[(cy - 1) * CHUNKS_X + cx] = 1;
  if (ty_ % CHUNK === CHUNK - 1  && cy < CHUNKS_Y - 1) grid.dirty[(cy + 1) * CHUNKS_X + cx] = 1;
}

export function setTile(tx_, ty_, mat) {
  if (!inBounds(tx_, ty_)) return false;
  const i = idx(tx_, ty_);
  if (grid.mat[i] === mat) return false;
  grid.mat[i] = mat;
  grid.prog[i] = 0;
  markDirty(tx_, ty_);
  return true;
}

/* Apply mining progress. Returns the drop id once the tile breaks, null while
   it is still standing. `hard` is seconds-to-break at pick power 1, and `prog`
   accumulates in the same unit, so a material takes exactly its stated time
   at any framerate. */
export function damage(tx_, ty_, seconds, power = 1) {
  if (!inBounds(tx_, ty_)) return null;
  const i = idx(tx_, ty_);
  const m = grid.mat[i];
  if (m === AIR) return null;
  const hard = hardOf(m);
  if (!(hard > 0) || !Number.isFinite(hard)) return null;   // bedrock, air
  const now = grid.prog[i] + seconds * power;
  if (now >= hard) {
    const drop = MAT[m].drop;
    grid.mat[i] = AIR; grid.prog[i] = 0;
    markDirty(tx_, ty_);
    return drop;
  }
  grid.prog[i] = now;
  markDirty(tx_, ty_);
  return null;
}

/* 0..1 fraction of the way through breaking, for crack rendering. */
export function dmgAt(tx_, ty_) {
  if (!inBounds(tx_, ty_)) return 0;
  const i = idx(tx_, ty_);
  const hard = hardOf(grid.mat[i]);
  if (!(hard > 0) || !Number.isFinite(hard)) return 0;
  return Math.min(1, grid.prog[i] / hard);
}

export function clearGrid() {
  grid.mat.fill(AIR); grid.prog.fill(0); grid.dirty.fill(1);
}
