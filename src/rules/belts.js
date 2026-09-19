/* rules layer — belts. Touching belt tiles form one run that turns together at
   whatever drive its drivetrain delivers, dragging resting items along the run
   axis. A run steeper than `beltMaxSlope` cannot grip and its items run back
   downhill instead. Position only — no substance or form change.

   Drive is read from `m.torque` and `m.speed`, which `rules/drive.js` wrote on
   the previous substep: siblings may not import each other, and running before
   `machines` is what lets an item dragged into a mouth be caught the same
   substep it arrives. */

import { itemsIn, sizeOf, write as iw } from '../model/items.js';
import { defOf, machines, write as mw } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { solidAt } from '../model/tiles.js';
import { tileX, tileY, worldY } from '../model/world.js';

/* Vertical slack in px around the floor line a resting item settles at, sized
   to straddle every item's half-size (up to 2 px) plus settling slop. */
const GRAB = 4;

const groundBox = m => ({
  x: m.box.x, y: m.box.y + m.box.h - GRAB, w: m.box.w, h: GRAB * 2
});

export function step(dt) {
  let moved = false;
  for (const run of runs()) {
    for (const m of run.tiles) if (m.slip !== run.slips) mw.slip(m, run.slips);
    if (drag(run, dt)) moved = true;
  }

  /* `rules/items.js#step` already rebuilt the item grid this substep, before
     anything moved here, and a machine catch box queries that grid. Re-index
     so an item dragged into a mouth is found on this same substep. */
  if (moved) iw.reindex();
}

/* Belt tiles grouped into runs, each with the geometry the drag needs. A run
   is a flood over Chebyshev-adjacent belts in one band, the same touching rule
   `rules/drive.js` conducts power along, so what turns together is what is
   powered together. */
function runs() {
  const belts = machines.filter(m => defOf(m).belt);
  const seen = new Set();
  const out = [];

  for (const start of belts) {
    if (seen.has(start)) continue;
    const tiles = [start];
    seen.add(start);
    for (let i = 0; i < tiles.length; i++)
      for (const other of belts) {
        if (seen.has(other) || !touching(tiles[i], other)) continue;
        seen.add(other);
        tiles.push(other);
      }
    out.push(geometry(tiles));
  }
  return out;
}

const touching = (a, b) =>
  a.band === b.band
  && Math.abs(a.tx - b.tx) <= 1 && Math.abs(a.ty - b.ty) <= 1;

/* Slope is measured over the whole run rather than step to step, so a run that
   climbs one row every two tiles reads 26 degrees and not the 45 of its risers.
   `lo`/`hi` are the extreme columns; `fall` is the world-x direction downhill,
   which is where items go when the run is too steep to grip. */
function geometry(tiles) {
  let lo = tiles[0], hi = tiles[0];
  for (const m of tiles) {
    if (m.tx < lo.tx) lo = m;
    if (m.tx > hi.tx) hi = m;
  }
  const spanX = hi.tx - lo.tx, spanY = hi.ty - lo.ty;
  const len = Math.hypot(spanX, spanY);
  const slope = len > 0 ? Math.abs(spanY) / len : 0;
  return {
    tiles,
    slips: slope > eff('beltMaxSlope'),
    /* Tile y grows downward, so the taller column is the one with the smaller
       `ty`. A level run has no downhill and never slips anyway. */
    fall: spanY > 0 ? 1 : spanY < 0 ? -1 : 0,
    left: Math.min(...tiles.map(m => m.box.x)),
    right: Math.max(...tiles.map(m => m.box.x + m.box.w))
  };
}

/* Drag every resting item on the run. An item mid-fall (`it.rest === 0`) stays
   `rules/items.js`'s. Returns whether anything moved. */
function drag(run, dt) {
  const dir = runDir(run);
  const dx = dir * speed(run) * dt;
  if (!dx) return false;

  const edge = dir > 0 ? run.right : run.left;

  /* Gathered across the whole run before anything moves: an item sitting on a
     tile seam is inside both tiles' grab boxes, and moving it once per box
     would carry it at twice the belt's speed. */
  const riding = new Set();
  for (const m of run.tiles)
    for (const it of itemsIn(groundBox(m))) if (it.rest > 0) riding.add(it);
  if (!riding.size) return false;

  for (const it of riding) {
    it.x += dx;

    const reached = dir > 0 ? it.x >= edge : it.x <= edge;
    if (reached) {
      it.x = edge;
      it.vx = 0;
      it.rest = 0;                        // delivered off the end: falls again
      continue;
    }
    /* A stepped run rises under the item as it advances, so it is re-seated on
       whatever holds it up at its new column. Beyond one tile of search it is
       over a drop and falls of its own accord. */
    reseat(it);
  }
  return true;
}

/* Which way the run carries: its own declared axis while it grips, downhill
   once it does not. A run mixing both facings is driven by its first tile,
   since a belt cannot pull two ways at once. */
function runDir(run) {
  if (run.slips) return run.fall;
  return defOf(run.tiles[0]).belt.dir;
}

/* Full `beltSpeed` needs both full drive and shaft speed 1. A drivetrain
   carrying more than it can turn runs its belts slowly rather than stopping
   them, and a speed transformer upstream runs them fast. Sliding is gravity
   doing the work, so it is not scaled by either. */
function speed(run) {
  if (run.slips) return eff('beltSlip');
  const m = run.tiles[0];
  return eff('beltSpeed') * m.torque * m.speed;
}

function reseat(it) {
  const b = it.band, half = sizeOf(it) / 2;
  const tx = tileX(b, it.x);
  const ty = tileY(b, it.y + half + 1);
  for (let k = -1; k <= 1; k++)
    if (solidAt(b, tx, ty + k)) { it.y = worldY(b, ty + k) - half; return; }
}
