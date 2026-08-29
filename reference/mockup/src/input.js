/* NOTE: in the shipped mockup this module was imported by NOTHING, and the
   line below was `export let d = 0;` inside a function body, so the file did
   not even parse. Both were bundler-output corruption. The `export` is
   removed here so the reference at least parses; it is still not wired up,
   because the mockup is deliberately non-interactive apart from its camera.
   The playable build has a working src/input.js. */
import { rebuild } from './bootstrap.js';
import { SCALE, cv, resize } from './core/canvas.js';
import { cam, clock, view } from './sim/state.js';


/* ============================================================
   INPUT
   ============================================================ */
export function touched() { view.lastInput = clock.t; }

cv.addEventListener('wheel', e => {
  e.preventDefault(); touched();
  cam.target += e.deltaY * (e.deltaMode === 1 ? 16 : 0.6);
}, { passive: false });

export let dragging = false, dragY = 0, dragStart = 0;

cv.addEventListener('pointerdown', e => {
  dragging = true; dragY = e.clientY; dragStart = cam.target;
  cv.classList.add('dragging'); cv.setPointerCapture(e.pointerId); touched();
});

cv.addEventListener('pointermove', e => {
  if (!dragging) return;
  cam.target = dragStart + (dragY - e.clientY) / SCALE; touched();
});

cv.addEventListener('pointerup', e => {
  dragging = false; cv.classList.remove('dragging');
});

export const keys = {};

addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 't' || e.key === 'T') { view.tour = !view.tour; view.lastInput = -99; }
  if (e.key === 'g' || e.key === 'G') view.showGrid = !view.showGrid;
  if ([' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
});

addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

setInterval(() => {
  let d = 0;
  if (keys['arrowdown'] || keys['s']) d += 5;
  if (keys['arrowup']   || keys['w']) d -= 5;
  if (keys['pagedown']) d += 22;
  if (keys['pageup'])   d -= 22;
  if (d) { cam.target += d; touched(); }
}, 16);

export let resizeTimer = 0;

addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(rebuild, 120);   // rebuilding the strip is expensive
});
