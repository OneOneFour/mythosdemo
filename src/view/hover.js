/* view layer — what the pointer is over, resolved fresh every frame and
   returned rather than stored, so nothing here writes `model`. The pointer
   arrives as world px on the frame context, the way `cam` does.

   Priority: a HUD hitbox wins because the HUD draws on top; within the world,
   a falling item beats a machine beats bare rock. */

import { AIR, FORM, labelOf, packTile } from '../data/forms.js';
import { recipesOf } from '../data/recipes.js';
import { itemsNear, massOfPair } from '../model/items.js';
import { progressAt } from '../model/mining.js';
import { count, defOf, firstMatching, machineAt, statusOf } from '../model/machines.js';
import { run } from '../model/run.js';
import { baseHardOf, formRowOf, rowOf, tileAt } from '../model/tiles.js';
import { bandAt, seenAt, tileX, tileY } from '../model/world.js';
import { effChargeAt, effHardAt } from './paint.js';

/* Plain words for `model/machines.js#statusOf`'s three states. */
const STATUS_WORDS = { running: 'RUNNING', 'no-fuel': 'NO FUEL', idle: 'IDLE' };

/* The recipe this machine would run right now, display-only: only a
   buffer-sourced recipe (no `from`, or `from:'buffer'`) counts, and the buffer
   is re-read through `count` because `view` may not import `rules`. */
function currentRecipe(m, def) {
  for (const r of recipesOf(def)) {
    if (r.from && r.from !== 'buffer') continue;
    const ins = r.in || {};
    if (Object.keys(ins).every(sel => count(m, sel) >= ins[sel])) return r;
  }
  return null;
}

/* A legible name for what a recipe makes. A machine's inline recipe carries no
   `name`, so this falls back to naming the buffered pair that satisfies each
   input clause. */
function recipeLabel(m, r) {
  const ins = r.in || {};
  if (r.name) return r.name;
  const parts = Object.keys(ins).map(sel => {
    const pair = firstMatching(m, sel, ins[sel]);
    return pair ? labelOf(pair.sub, pair.form) : sel.toUpperCase();
  });
  return parts.length ? parts.join(' + ') : 'SOMETHING';
}

/* One "HARD n.nnS" line, or none: `baseHardOf` returns `Infinity` both for a
   substance with no `tile` block and for literal bedrock. */
const hardLine = hard => Number.isFinite(hard) ? ['HARD ' + hard.toFixed(2) + 'S'] : [];

/* A held or dropped pair. `packTile` plus `baseHardOf` is the same "seconds at
   pick power 1" arithmetic a placed tile goes through. */
function describePair(sub, form) {
  const lines = [labelOf(sub, form), 'MASS ' + massOfPair(sub, form).toFixed(1)];
  lines.push(...hardLine(baseHardOf(packTile(sub, form))));
  if (FORM[form].tile) lines.push('TILE-CAPABLE');
  return lines;
}

/* A tile byte, native or placed. A native tile's form is the `NATIVE` sentinel
   rather than a real `FORM` index, so the label branches on whether
   `formRowOf` finds a row at all. */
function describeTile(byte) {
  const row = rowOf(byte), formRow = formRowOf(byte);
  const lines = [formRow ? `${row.name} ${formRow.label}`.trim() : row.name];
  const mass = row.item ? row.item.mass * (formRow?.massK ?? 1) : undefined;
  if (mass !== undefined) lines.push('MASS ' + mass.toFixed(1));
  lines.push(...hardLine(baseHardOf(byte)));
  if (formRow?.tile) lines.push('TILE-CAPABLE');
  return lines;
}

/* Units still in a deposit, or no line at all: a `charge:1` tile prints
   nothing. Counted exactly as `drawLiveTiles` counts its notches -- floored
   with no epsilon, capped one short of `charge`, on effective values. */
function unitsLine(b, tx, ty) {
  const charge = effChargeAt(b, tx, ty);
  if (charge <= 1) return [];
  const d = progressAt(b, tx, ty, effHardAt(b, tx, ty), charge);
  const out = Math.min(charge - 1, Math.floor(d * charge));
  return ['UNITS ' + (charge - out) + ' / ' + charge];
}

/* The nearest falling item within half a tile of the pointer, or null. The
   slack keeps a small moving sprite hoverable. */
function nearestItem(band, wx, wy) {
  let best = null, bestD = Infinity;
  for (const it of itemsNear(wx, wy, band.tile * 0.6)) {
    if (it.band !== band) continue;
    const d = Math.hypot(it.x - wx, it.y - wy);
    if (d < bestD) { bestD = d; best = it; }
  }
  return best;
}

/* `hudHits` is what `view/hud.js` drew this frame, never a second copy of its
   x/y math. Returns `{ x, y, lines }` with `x`/`y` the anchor in screen px, or
   `null`. */
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
  if (m) {
    const def = defOf(m);
    const lines = [def.name, STATUS_WORDS[statusOf(m)]];
    const r = currentRecipe(m, def);
    if (r) lines.push('MAKING ' + recipeLabel(m, r));
    return { x: sx, y: sy, lines };
  }

  /* An unseen tile shows no tooltip at all: a placeholder line would still say
     "there is exactly one kind of thing here". Checked only here -- an item, a
     machine and an inventory slot are none of them terrain. */
  const byte = tileAt(band, tx, ty);
  if (byte === AIR) return null;
  if (!seenAt(band, tx, ty)) return null;
  return { x: sx, y: sy, lines: [...describeTile(byte), ...unitsLine(band, tx, ty)] };
}
