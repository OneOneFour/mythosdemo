/* model layer — tile storage and tile queries, storage only.

   Mining progress is in `model/mining.js` and the break decision in
   `rules/mining.js`: one number per tile forever and a number for the two or
   three tiles being hit are different structures with different lifetimes.

   A tile byte is a packed substance x form pair; the packing and the two
   sentinel bytes live in `data/forms.js`. Out of bounds reads BEDROCK and
   above a band reads AIR, so no caller below this line special-cases a
   boundary. */

import { EDGE_SUB, SUB, VOID_SUB } from '../data/substances.js';
import { AIR, BEDROCK, F, FORM, NATIVE, formOfTile, packTile, subOfTile } from '../data/forms.js';
import { bump } from './epoch.js';
/* `model/growth.js` and `model/mining.js` import only `model/epoch.js` and
   `model/world.js`, and nothing from here, so neither edge is a cycle. */
import { activeCount as growingCount, write as groww } from './growth.js';
import { write as digw } from './mining.js';
import { bandAt, hasOwnSky, idx, inBounds, tileX, tileY, worldX } from './world.js';

/* raw byte */
export function tileAt(b, tx, ty) {
  if (ty < 0) return AIR;
  if (!inBounds(b, tx, ty)) return BEDROCK;
  return b.mat[idx(b, tx, ty)];
}

/* The pair a byte denotes. `form === NATIVE` is the element as it comes out
   of the ground; anything else is a placed unit. */
export const subOf  = byte => byte === AIR || byte === BEDROCK ? -1 : subOfTile(byte);
export const formOf = byte => byte === AIR || byte === BEDROCK ? NATIVE : formOfTile(byte);

export const subAt  = (b, tx, ty) => subOf(tileAt(b, tx, ty));
export const formAt = (b, tx, ty) => formOf(tileAt(b, tx, ty));

/* The substance row for any byte, sentinels included. */
export const rowOf = byte =>
  byte === AIR ? VOID_SUB : byte === BEDROCK ? EDGE_SUB : SUB[subOfTile(byte)];

export const rowAt = (b, tx, ty) => rowOf(tileAt(b, tx, ty));

/* The form row for a placed tile, or null for a native one. */
export const formRowOf = byte => {
  const f = formOf(byte);
  return f === NATIVE ? null : FORM[f];
};

/* The form's `tile` block wins where it exists, so a placed log is a
   climbable ladder while a native trunk is the element in the ground. */

const tileBlockOf = byte => formRowOf(byte)?.tile ?? rowOf(byte).tile;

export const solidOf = byte => byte !== AIR && tileBlockOf(byte)?.solid === true;
export const climbOf = byte => byte !== AIR && tileBlockOf(byte)?.climb === true;

export const solidAt = (b, tx, ty) => solidOf(tileAt(b, tx, ty));
export const climbAt = (b, tx, ty) => climbOf(tileAt(b, tx, ty));

/* A clear vertical path to the top of this band's own grid, not merely air in
   the tile above, which a tunnel ceiling also satisfies. Band-local, so it is
   true for a band whose row 0 is itself buried; anything deciding whether
   daylight reaches a tile wants `worldSkyAt` below. */
export const skyExposedAt = (b, tx, ty) => {
  for (let y = ty - 1; y >= 0; y--) if (solidAt(b, tx, y)) return false;
  return true;
};

/* A clear vertical path out of the world, across band seams: true daylight.
   The walk ends at the top of a band carrying sky of its own and crosses into
   the band above otherwise. Close to quadratic if called per tile over a band.
   `up.ord >= band.ord` ends the walk, so two bands cannot loop. */
export function worldSkyAt(b, tx, ty) {
  const wx = worldX(b, tx) + b.tile / 2;
  let band = b, y = ty - 1;
  for (;;) {
    const cx = tileX(band, wx);
    for (; y >= 0; y--) if (solidAt(band, cx, y)) return false;
    if (hasOwnSky(band)) return true;
    const wy = band.origin.y - 1;
    const up = bandAt(wx, wy);
    if (!up || up.ord >= band.ord) return true;
    band = up;
    y = tileY(up, wy);
  }
}

/* Base hardness in seconds at pick power 1. The `hard` tunable is applied in
   `rules/mining.js` through `eff`. */
export const baseHardOf = byte => {
  const sub = rowOf(byte).tile?.hard;
  if (sub === undefined) return Infinity;
  const k = formRowOf(byte)?.tile?.hardK ?? 1;
  return sub * k;
};

export const baseHardAt = (b, tx, ty) => baseHardOf(tileAt(b, tx, ty));

/* Base units this tile yields before it is gone; the `richness` tunable is
   applied in the two rules modules. Only a native tile has a charge -- a
   placed unit yields back the one unit it cost, so a `copper/stair` does not
   come out as four. */
export const baseChargeOf = byte => {
  if (formOf(byte) !== NATIVE) return 1;
  const sub = subOf(byte);
  if (sub < 0) return 1;
  const c = SUB[sub].tile?.charge;
  return c === undefined ? 1 : c;
};

export const baseChargeAt = (b, tx, ty) => baseChargeOf(tileAt(b, tx, ty));

/* What mining this tile yields, as a pair, or null. A native tile yields the
   form named by its substance's `tile.drops`; a placed tile yields itself. */
export const dropOf = byte => {
  const sub = subOf(byte);
  if (sub < 0) return null;
  const form = formOf(byte);
  if (form !== NATIVE) return { sub, form };
  const drops = SUB[sub].tile?.drops;
  const f = drops === undefined ? undefined : F[drops];
  return f === undefined ? null : { sub, form: f };
};

export const dropAt = (b, tx, ty) => dropOf(tileAt(b, tx, ty));

export const write = {
  /* `sub` is a substance ordinal and `form` a form ordinal or NATIVE. Returns
     false when nothing changed, so callers need not diff. */
  set(b, tx, ty, sub, form = NATIVE) {
    if (!inBounds(b, tx, ty)) return false;
    return write.setByte(b, tx, ty, sub < 0 ? AIR : packTile(sub, form));
  },

  clear(b, tx, ty) { return write.setByte(b, tx, ty, AIR); },

  setByte(b, tx, ty, byte) {
    if (!inBounds(b, tx, ty)) return false;
    const i = idx(b, tx, ty);
    if (b.mat[i] === byte) return false;
    b.mat[i] = byte;
    /* The tile is not the tile it was, so its accumulated pick time is about
       nothing. Cleared in the one place every terrain edit funnels through, or
       a block placed over a part-depleted deposit inherits its work. */
    digw.clear(b, tx, ty);

    /* The same move, one ledger over: a form whose `tile` block declares
       `roots` enters the growth ledger, and any other byte here leaves it.
       The `growingCount()` guard keeps worldgen's several hundred thousand
       boot writes off a key computation and a `Map.delete` each. */
    const f = byte === AIR || byte === BEDROCK ? NATIVE : formOfTile(byte);
    if (f !== NATIVE && FORM[f]?.tile?.roots === true) groww.plant(b, tx, ty);
    else if (growingCount() > 0) groww.clear(b, tx, ty);

    write.touch(b, tx, ty);
    bump();
    return true;
  },

  /* Bump this chunk's version, and a neighbour's when the tile sits on a seam:
     a tile on a chunk edge bleeds its edge shading into the next chunk. */
  touch(b, tx, ty) {
    const cx = (tx / b.chunk) | 0, cy = (ty / b.chunk) | 0;
    if (cx < 0 || cx >= b.cx || cy < 0 || cy >= b.cy) return;
    b.ver[cy * b.cx + cx]++;
    if (tx % b.chunk === 0           && cx > 0)         b.ver[cy * b.cx + cx - 1]++;
    if (tx % b.chunk === b.chunk - 1 && cx < b.cx - 1)  b.ver[cy * b.cx + cx + 1]++;
    if (ty % b.chunk === 0           && cy > 0)         b.ver[(cy - 1) * b.cx + cx]++;
    if (ty % b.chunk === b.chunk - 1 && cy < b.cy - 1)  b.ver[(cy + 1) * b.cx + cx]++;
    bump();
  },

  /* Whole-band fill, for worldgen. Bumps every chunk version once. */
  fillByte(b, byte) {
    b.mat.fill(byte);
    for (let i = 0; i < b.ver.length; i++) b.ver[i]++;
    bump();
  }
};
