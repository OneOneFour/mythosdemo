/* LAYER view — HOVER: what the pointer is over, resolved fresh every frame.
   Imports `core`, `data` and READ-ONLY `model` queries. No `rules` import (view
   and rules are mutually forbidden) and no `shell` import (the pointer reaches
   this file as WORLD px on the frame context, exactly the way `cam` does).

   ============================================================================
   NO STATE. `model/aim.js` exists because `rules/mining.js` WRITES the aim and
   `view/hud.js` READS it -- a datum with a writer in one forbidden-to-import
   layer and a reader in another has to live somewhere both can reach. Hover
   has exactly one writer AND one reader, both this file's caller, so it is not
   a field on anything: it is a return value, recomputed from the pointer
   position and the current model on every call, the same way `paintTile`
   recomputes a tile's cracks from `progressAt` instead of caching them on the
   tile. Caching a hover result on a model record would be a `view` write to
   `model`, which is exactly what the epoch assertion in `tools/check.mjs`
   exists to catch -- see ARCHITECTURE invariant 9.
   ============================================================================

   PRIORITY. The HUD is drawn on top of the world, so a HUD hitbox always wins.
   Within the world: a falling item beats a machine beats bare rock, because an
   item and a machine are the rarer, more specific thing the cursor could be
   over; a tile is the default everything else stands on. */

import { AIR, FORM, labelOf, packTile } from '../data/forms.js';
import { itemsNear, massOfPair } from '../model/items.js';
import { defOf, machineAt } from '../model/machines.js';
import { run } from '../model/run.js';
import { baseHardOf, formRowOf, rowOf, tileAt } from '../model/tiles.js';
import { bandAt, tileX, tileY } from '../model/world.js';

/* One "HARD n.nnS" line, or none. `baseHardOf` returns `Infinity` for both
   "this substance has no `tile` block at all" (a relic) and literal bedrock --
   the same case `rules/mining.js` guards with `Number.isFinite` before it will
   spend a swing on a tile, reused here for the same reason. */
const hardLine = hard => Number.isFinite(hard) ? ['HARD ' + hard.toFixed(2) + 'S'] : [];

/* A held or dropped pair -- the pocket strip, the inventory panel and a
   falling item all describe themselves this way, so hovering the same ore in
   your pockets and mid-fall reads identically. `packTile` plus `baseHardOf` is
   the same base-hardness arithmetic `baseHardAt` does for a placed tile; reused
   rather than re-derived so there is exactly one formula for "seconds at pick
   power 1" in the whole codebase. */
function describePair(sub, form) {
  const lines = [labelOf(sub, form), 'MASS ' + massOfPair(sub, form).toFixed(1)];
  lines.push(...hardLine(baseHardOf(packTile(sub, form))));
  if (FORM[form].tile) lines.push('TILE-CAPABLE');
  return lines;
}

/* A tile byte, native or placed. Not `describePair` plus a form lookup: a
   native tile's form is the `NATIVE` sentinel, which is not a real `FORM`
   index, so the label has to branch on whether a form row exists at all --
   exactly the branch `model/tiles.js#formRowOf` exists to answer. */
function describeTile(byte) {
  const row = rowOf(byte), formRow = formRowOf(byte);
  const lines = [formRow ? `${row.name} ${formRow.label}`.trim() : row.name];
  const mass = row.item ? row.item.mass * (formRow?.massK ?? 1) : undefined;
  if (mass !== undefined) lines.push('MASS ' + mass.toFixed(1));
  lines.push(...hardLine(baseHardOf(byte)));
  if (formRow?.tile) lines.push('TILE-CAPABLE');
  return lines;
}

/* The nearest falling item within reach of the pointer, or null. A generous
   half-tile slack: a falling item is a small sprite and a pixel-perfect cursor
   requirement would make it un-hoverable while it is moving. */
function nearestItem(band, wx, wy) {
  let best = null, bestD = Infinity;
  for (const it of itemsNear(wx, wy, band.tile * 0.6)) {
    if (it.band !== band) continue;
    const d = Math.hypot(it.x - wx, it.y - wy);
    if (d < bestD) { bestD = d; best = it; }
  }
  return best;
}

/* `hudHits` is exactly what `view/hud.js` drew THIS frame -- the pocket strip's
   rectangles, and the inventory panel's when it is open -- never a second copy
   of that x/y math. Returns `{ x, y, lines }` in SCREEN px (`x`/`y` are where
   the box should anchor) or `null`. */
export function resolveHover(f, hudHits) {
  if (!f.mouse?.has || run.dead) return null;
  const sx = f.mouse.x - f.cam.x, sy = f.mouse.y - f.cam.y;

  for (const r of hudHits)
    if (sx >= r.x && sx < r.x + r.w && sy >= r.y && sy < r.y + r.h)
      return { x: sx, y: sy, lines: describePair(r.sub, r.form) };

  const wx = f.mouse.x, wy = f.mouse.y;
  const band = bandAt(wx, wy);
  if (!band) return null;

  const it = nearestItem(band, wx, wy);
  if (it) return { x: sx, y: sy, lines: describePair(it.sub, it.form) };

  const tx = tileX(band, wx), ty = tileY(band, wy);
  const m = machineAt(band, tx, ty);
  if (m) return { x: sx, y: sy, lines: [defOf(m).name] };

  const byte = tileAt(band, tx, ty);
  if (byte === AIR) return null;
  return { x: sx, y: sy, lines: describeTile(byte) };
}
