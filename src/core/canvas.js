/* LAYER core — the drawing surface and the viewport.
   Depends on nothing. May be imported by every layer, but in practice only
   `view` and `shell` have any use for it.

   The world has its own fixed coordinate space and the canvas is only a window
   onto it. Resizing changes VIEW, never the world (ARCHITECTURE invariant 2).

   The canvas is not looked up at module load. `stage` is an object mutated by
   `attach()`, which also lets a headless tool run the whole stack with
   `stage.ctx === null` instead of stubbing `document` globally.
   See docs/DEVELOPER_GUIDE.md#cross-module-mutable-state for the convention. */

/* Base resolution in world pixels. `w`/`h` are how much world is visible;
   `scale` is the nearest-neighbour upscale factor applied by CSS. */
export const VIEW = { w: 320, h: 180, scale: 3 };

export const stage = { cv: null, ctx: null };

/* Call once from `shell/boot.js`. With no argument it finds `#stage` if there
   is a document, and stays null if there is not. */
export function attach(cv) {
  if (!cv && typeof document !== 'undefined') cv = document.getElementById('stage');
  stage.cv = cv || null;
  stage.ctx = cv ? cv.getContext('2d', { alpha: false }) : null;
  if (stage.ctx) stage.ctx.imageSmoothingEnabled = false;
  return stage.ctx;
}

export function resize(iw, ih) {
  iw = iw || (typeof window !== 'undefined' ? window.innerWidth  : 0) || 1600;
  ih = ih || (typeof window !== 'undefined' ? window.innerHeight : 0) || 900;
  VIEW.scale = Math.max(2, Math.min(6, Math.round(ih / 400)));
  VIEW.w = Math.max(200, Math.ceil(iw / VIEW.scale));
  VIEW.h = Math.max(180, Math.ceil(ih / VIEW.scale));
  const { cv, ctx } = stage;
  if (!cv || !ctx) return VIEW;
  cv.width = VIEW.w; cv.height = VIEW.h;
  cv.style.width  = (VIEW.w * VIEW.scale) + 'px';
  cv.style.height = (VIEW.h * VIEW.scale) + 'px';
  ctx.imageSmoothingEnabled = false;
  return VIEW;
}

/* Offscreen surfaces: one per painted chunk, plus sprite sheets. Returns
   `{ canvas: null, g: null }` headless rather than throwing, so the model and
   rules layers can be exercised with no DOM at all. */
export function offscreen(w, h) {
  if (typeof document === 'undefined') return { canvas: null, g: null };
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { canvas: c, g };
}
