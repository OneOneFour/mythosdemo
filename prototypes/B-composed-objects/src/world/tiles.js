import { SUB, SUB_IDS, subIndex, AIR } from '../data/substances.js';

/* ============================================================
   TILES — the ARRAY side of the object boundary.

   THE BOUNDARY RULE, stated once (RFC 02's central claim):

     An object exists where identity and per-instance behaviour exist.
     Above roughly 10^3 instances, or where an instance owns no state
     beyond a material id, use a typed array with a shared descriptor.

   Both sides are in this build, and this is the line:

     objects  ~20 machines, ~2 actors, ~400 items
              -- identity, per-instance behaviour, hosts with parts
     arrays   ~49,000 tiles (this file), ~49,000 heat cells (field.js)
              -- no identity, behaviour on the shared data/substances.js row

   A tile owns exactly one byte: which substance it is. It owns no mining
   progress (that is on comp/pick.js) and no damage, which is what keeps it
   on this side of the line. The moment a tile needs per-tile state, the
   answer is another Field, not an object per tile -- and RFC 02 is honest
   that this rule has to be re-argued every time someone wants a wet tile.

   WHERE BELTS GO, and this is the design's weakest spot (RFC 02 weakness 3,
   DESIGN item 21): 2,000 conveyor tiles as hosts with parts would be ~16,000
   objects, which is the wrong side of the boundary by an order of magnitude.
   Belts belong here -- a Uint8Array of lane direction plus an item-index
   array -- and that is a SECOND paradigm arriving next to the first. Not
   built, and not pretended away.

   Storage is chunked so that digging one tile marks 16x16 tiles dirty
   instead of the world.
   ============================================================ */
export const TILE = 8;                     // px per tile

export function createTiles(cfg) {
  const { tw, th } = cfg, chunk = cfg.chunk || 16;
  const cx = Math.ceil(tw / chunk), cy = Math.ceil(th / chunk);

  /* Allocated HERE, from cfg, not at module import. That single fact is what
     makes a second differently-sized band possible (data/bands.js). */
  const mat = new Uint8Array(tw * th);
  const dirty = new Uint8Array(cx * cy);

  const idx = (tx, ty) => ty * tw + tx;
  const inb = (tx, ty) => tx >= 0 && ty >= 0 && tx < tw && ty < th;
  const BEDROCK = subIndex.bedrock;

  return {
    tw, th, chunk, chunksX: cx, chunksY: cy, mat, dirty,
    idx, inBounds: inb,

    /* Out of bounds returns a REAL substance row, not -1. That deletes the
       sentinel and every `t === -1 ||` special case that came with it. */
    at(tx, ty) { return inb(tx, ty) ? mat[idx(tx, ty)] : BEDROCK; },
    subAt(tx, ty) { return SUB_IDS[this.at(tx, ty)]; },
    rowAt(tx, ty) { return SUB[SUB_IDS[this.at(tx, ty)]]; },

    isSolid(tx, ty) { return this.rowAt(tx, ty).tile.solid === true; },
    isAir(tx, ty) { return this.at(tx, ty) === AIR; },

    set(tx, ty, sub) {
      if (!inb(tx, ty)) return;
      mat[idx(tx, ty)] = typeof sub === 'number' ? sub : subIndex[sub];
      dirty[((ty / chunk) | 0) * cx + ((tx / chunk) | 0)] = 1;
      /* Waking resting items in this column (RFC 02's `sleepers`) belongs
         here. STUB: not built, because there is no sleep bucket in this
         skeleton -- the hook is this line. */
    },

    /* Region write, for DESIGN item 10's miracles. One call, budgeted
       repaint, no per-tile object churn. */
    fill(tx, ty, w, h, sub) {
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) this.set(tx + i, ty + j, sub);
    }
  };
}
