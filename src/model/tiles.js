/* LAYER model — tile storage and tile queries. STORAGE ONLY.
   Imports `core`, `data`, `model`. May be imported by `model`, `rules`, `view`.

   Mining progress is NOT here. It is in `model/mining.js`, and the rule that
   decides a tile has broken is in `rules/mining.js`. That split is the point:
   while progress lived in the tile store it was under constant pressure to be a
   byte in the same array as the material, and that pressure is what made hard
   material permanently unmineable above a threshold framerate. Storage holding
   one number per tile forever, and progress holding a number for the two or
   three tiles currently being hit, are different data structures with different
   lifetimes.

   A tile byte is a packed substance x form pair; the packing and the two
   sentinel bytes live in `data/forms.js`. Out of bounds is BEDROCK and above a
   band is AIR, so every caller can ask a substance row about a tile it does not
   have and there are no boundary special-cases below this line. */

import { EDGE_SUB, SUB, VOID_SUB } from '../data/substances.js';
import { AIR, BEDROCK, F, FORM, NATIVE, formOfTile, packTile, subOfTile } from '../data/forms.js';
import { bump } from './epoch.js';
/* A legal model -> model edge (ARCHITECTURE section 1), and not a cycle:
   `model/mining.js` imports only `model/epoch.js` and `model/world.js`, both
   of which this file already imports, and it imports nothing from here.
   `write.setByte` needs it for exactly one line -- see D14-E there. */
import { write as digw } from './mining.js';
import { idx, inBounds } from './world.js';

/* ---- raw byte ---- */
export function tileAt(b, tx, ty) {
  if (ty < 0) return AIR;
  if (!inBounds(b, tx, ty)) return BEDROCK;
  return b.mat[idx(b, tx, ty)];
}

/* ---- the pair a byte denotes. `form === NATIVE` is the element as it comes
        out of the ground; anything else is a placed unit. ---- */
export const subOf  = byte => byte === AIR || byte === BEDROCK ? -1 : subOfTile(byte);
export const formOf = byte => byte === AIR || byte === BEDROCK ? NATIVE : formOfTile(byte);

export const subAt  = (b, tx, ty) => subOf(tileAt(b, tx, ty));
export const formAt = (b, tx, ty) => formOf(tileAt(b, tx, ty));

/* The substance row for any byte, sentinels included. Nothing downstream
   branches on air or the world edge. */
export const rowOf = byte =>
  byte === AIR ? VOID_SUB : byte === BEDROCK ? EDGE_SUB : SUB[subOfTile(byte)];

export const rowAt = (b, tx, ty) => rowOf(tileAt(b, tx, ty));

/* The form row for a placed tile, or null for a native one. */
export const formRowOf = byte => {
  const f = formOf(byte);
  return f === NATIVE ? null : FORM[f];
};

/* ---- physical properties. The FORM's `tile` block wins where it exists, which
        is what makes a placed log a climbable ladder while a native trunk is
        still just the element in the ground. ---- */

const tileBlockOf = byte => formRowOf(byte)?.tile ?? rowOf(byte).tile;

export const solidOf = byte => byte !== AIR && tileBlockOf(byte)?.solid === true;
export const climbOf = byte => byte !== AIR && tileBlockOf(byte)?.climb === true;

export const solidAt = (b, tx, ty) => solidOf(tileAt(b, tx, ty));
export const climbAt = (b, tx, ty) => climbOf(tileAt(b, tx, ty));

/* A clear vertical path to the top of THIS BAND'S OWN GRID -- true sky, not
   merely "the tile directly above happens to be air", which a tunnel ceiling
   also satisfies. `view/paint.js` is the only reader, for grass and canopy
   caps: a cosmetic that should read as "this ground has seen the sun", not
   "something happened to dig this tile out". Rows above `fromTy` in a band's
   strata are never filled by worldgen, so row 0 is always open air and this
   terminates without a separate "top of the world" constant. Only called from
   the chunk-paint pass (cached per version), never per frame. */
export const skyExposedAt = (b, tx, ty) => {
  for (let y = ty - 1; y >= 0; y--) if (solidAt(b, tx, y)) return false;
  return true;
};

/* BASE hardness in seconds at pick power 1. Deliberately the base and not the
   effective value: the `hard` tunable is applied in `rules/mining.js` through
   `eff`, so exactly one place reads the modifier. */
export const baseHardOf = byte => {
  const sub = rowOf(byte).tile?.hard;
  if (sub === undefined) return Infinity;
  const k = formRowOf(byte)?.tile?.hardK ?? 1;
  return sub * k;
};

export const baseHardAt = (b, tx, ty) => baseHardOf(tileAt(b, tx, ty));

/* BASE units this tile yields before it is gone: a `deposit` substance's
   `tile.charge`, or 1. Deliberately the base and not the effective value, for
   the identical reason `baseHardOf` above is -- the `richness` tunable is
   applied in `rules/mining.js` and `rules/machines.js#mine`, in the same one
   place per file that `hard` and `toolTier` are, so a boon that enriches a
   vein cannot be read around.

   ONLY A NATIVE TILE HAS A CHARGE. A placed unit yields back exactly the one
   unit it cost (`dropOf` below returns the pair itself), and it must: `stair`
   crosses with `metal`, so `copper/stair` is a real placeable pair, and
   charging it by its substance would turn one stair into four on the way back
   out. Charge describes a body in the ground, not a thing someone built. */
export const baseChargeOf = byte => {
  if (formOf(byte) !== NATIVE) return 1;
  const sub = subOf(byte);
  if (sub < 0) return 1;
  const c = SUB[sub].tile?.charge;
  return c === undefined ? 1 : c;
};

export const baseChargeAt = (b, tx, ty) => baseChargeOf(tileAt(b, tx, ty));

/* What mining this tile yields, as a pair, or null. A native tile yields the
   form named by its substance's `tile.drops`; a placed tile yields itself back,
   which is what makes a ladder recoverable. */
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
  /* `sub` is a substance ordinal and `form` a form ordinal or NATIVE.
     Returns false when nothing changed, so callers need not diff. */
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
    /* D14-E: THE TILE IS NOT THE TILE IT WAS, so its accumulated pick time is
       not about anything any more. Cleared here -- once, in the one place
       every terrain edit funnels through -- rather than at each caller, because
       there are already four (mining, placement, worldgen, the `chasm`
       miracle) and the fifth is whoever adds the next terrain verb. Without
       it, a `soil/block` placed where a part-depleted copper deposit stood
       inherits multiple hard-seconds of work and breaks the instant it is
       touched. Storage still owns no progress: it owns the fact that this
       coordinate changed, and tells the module that does. */
    digw.clear(b, tx, ty);
    write.touch(b, tx, ty);
    bump();
    return true;
  },

  /* Bump the chunk version, and the neighbour's too when the tile sits on a
     seam: a tile on a chunk edge bleeds its edge shading into the next chunk.
     A dig repaints its chunk, not the world. */
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
