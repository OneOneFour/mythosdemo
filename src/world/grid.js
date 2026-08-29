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

/* mat: material id per tile. dmg: mining progress 0..255 per tile. */
export const grid = {
  mat: new Uint8Array(WORLD_TW * WORLD_TH),
  dmg: new Uint8Array(WORLD_TW * WORLD_TH),
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
  grid.dmg[i] = 0;
  markDirty(tx_, ty_);
  return true;
}

/* Apply mining progress. Returns the drop id once the tile breaks,
   null while it is still standing. Hardness is in seconds-to-break at
   pick power 1. */
export function damage(tx_, ty_, seconds, power = 1) {
  if (!inBounds(tx_, ty_)) return null;
  const i = idx(tx_, ty_);
  const m = grid.mat[i];
  if (m === AIR) return null;
  const hard = hardOf(m);
  if (hard <= 0) return null;
  const add = (seconds * power / hard) * 255;
  const now = grid.dmg[i] + add;
  if (now >= 255) {
    const drop = MAT[m].drop;
    grid.mat[i] = AIR; grid.dmg[i] = 0;
    markDirty(tx_, ty_);
    return drop;
  }
  grid.dmg[i] = now;
  markDirty(tx_, ty_);
  return null;
}

export const dmgAt = (tx_, ty_) =>
  inBounds(tx_, ty_) ? grid.dmg[idx(tx_, ty_)] / 255 : 0;

export function clearGrid() {
  grid.mat.fill(AIR); grid.dmg.fill(0); grid.dirty.fill(1);
}
