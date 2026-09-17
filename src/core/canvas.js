/* core layer — the drawing surface and the viewport. Depends on nothing.
   The canvas is not looked up at import: `stage` is mutated by `attach()`, and
   a headless caller leaves `stage.cv` and `stage.ctx` null. */

/* `w`/`h` are the visible world extent in world px; `scale` is the
   nearest-neighbour upscale CSS applies. */
export const VIEW = { w: 320, h: 180, scale: 3 };

export const stage = { cv: null, ctx: null };

/* `#stage` is the canvas id in `index.html`; stays null with no document. */
export function attach(cv) {
  if (!cv && typeof document !== 'undefined') cv = document.getElementById('stage');
  stage.cv = cv || null;
  stage.ctx = cv ? cv.getContext('2d', { alpha: false }) : null;
  if (stage.ctx) stage.ctx.imageSmoothingEnabled = false;
  return stage.ctx;
}

/* Floor for `VIEW.w`: the narrowest base buffer a HUD layout must stay
   legible at, since every panel clamps to `VIEW.w`. */
export const BASE_W_MIN = 200;

export function resize(iw, ih) {
  iw = iw || (typeof window !== 'undefined' ? window.innerWidth  : 0) || 1600;
  ih = ih || (typeof window !== 'undefined' ? window.innerHeight : 0) || 900;
  VIEW.scale = Math.max(2, Math.min(6, Math.round(ih / 400)));
  VIEW.w = Math.max(BASE_W_MIN, Math.ceil(iw / VIEW.scale));
  VIEW.h = Math.max(180, Math.ceil(ih / VIEW.scale));
  const { cv, ctx } = stage;
  if (!cv || !ctx) return VIEW;
  cv.width = VIEW.w; cv.height = VIEW.h;
  cv.style.width  = (VIEW.w * VIEW.scale) + 'px';
  cv.style.height = (VIEW.h * VIEW.scale) + 'px';
  ctx.imageSmoothingEnabled = false;
  return VIEW;
}

/* One surface per painted chunk, plus sprite sheets. Returns nulls with no
   document rather than throwing. */
export function offscreen(w, h) {
  if (typeof document === 'undefined') return { canvas: null, g: null };
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { canvas: c, g };
}
