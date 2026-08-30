import { R, mix } from '../core/px.js';
import { hash2 } from '../core/rng.js';
import { TILE } from '../world/tiles.js';

/* ============================================================
   TREATMENTS — a registry of paint effects, named by substance rows.

   This replaces `if (M.id === 'copper')` at src/world/paint.js:127. That
   line is the `['glint', { col, n }]` entry in copper's `paint` list, and the
   painter below has no material name in it at all.

   A NEW APPEARANCE IS A NEW ENTRY HERE PLUS A ROW IN THE SUBSTANCE'S `paint`
   LIST. "This material glows" is the `glow` entry, four lines, and adding it
   to a material edits no function -- see the demonstration at the bottom.

   Signature is fixed: (g, px, py, tx, ty, col, params, world).
   Treatments read hash2(tx, ty) and NEVER rand(), so a repaint consumes no
   run randomness and a chunk redrawn twice looks identical.

   The draw calls themselves are stubs (core/px.js) per the brief.
   ============================================================ */
export const TREAT = {
  grain(g, px, py, tx, ty, col) {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const h = hash2(tx * TILE + x, ty * TILE + y);
        if (h < 0.16) R(g, px + x, py + y, 1, 1, col.c);
        else if (h > 0.90) R(g, px + x, py + y, 1, 1, col.a);
      }
  },

  edges(g, px, py, tx, ty, col, _p, world) {
    const t = world.tiles;
    if (!t.isSolid(tx, ty - 1))
      for (let x = 0; x < TILE; x++) {
        const j = ((hash2(tx * TILE + x, ty * 7) * 3) | 0) - 1;
        R(g, px + x, py + Math.max(0, j), 1, 2, col.a);
      }
    if (!t.isSolid(tx - 1, ty)) R(g, px, py, 1, TILE, mix(col.b, col.a, 0.45));
    if (!t.isSolid(tx + 1, ty)) R(g, px + TILE - 1, py, 1, TILE, mix(col.b, col.c, 0.5));
    if (!t.isSolid(tx, ty + 1)) R(g, px, py + TILE - 1, TILE, 1, col.c);
  },

  glint(g, px, py, tx, ty, _col, p) {
    for (let k = 0; k < (p.n || 2); k++) {
      const hx = (hash2(tx + k * 13, ty * 5) * TILE) | 0;
      const hy = (hash2(ty + k * 7, tx * 3) * TILE) | 0;
      R(g, px + hx, py + hy, 1, 1, p.col);
    }
  },

  /* ---- "THIS MATERIAL GLOWS", added without editing a paint function.
     Four lines here; then the material's row gains
        paint: [..., ['glow', { col: P.hot, r: 10 }]]
     and it emits light. Nothing in the painter below changed. ---- */
  glow(g, px, py, tx, ty, _col, p, world) {
    R(g, px + 2, py + 2, TILE - 4, TILE - 4, p.col);
    world.lights.push({ x: tx * TILE + 4, y: ty * TILE + 4, r: p.r, col: p.col });
  }
};
