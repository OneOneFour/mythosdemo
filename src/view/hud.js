/* view layer — the HUD, drawn in the same pixel space as the world using the
   5x7 bitmap font. No `fillText` anywhere. Below roughly 240 px of base width
   the panels overlap and the depth gauge collides with anything centred, which
   is what the clamps are for. `hoverInfo` is `view`'s own record of what it
   drew last frame, read back only by the test hook; nothing here writes
   `model`. */

import { drawText, textWidth, wrap } from '../core/font.js';
import { R, lineTo } from '../core/pixels.js';
import { mix } from '../core/palette.js';
import { AIR, byHudOrder, F, FORM, labelOf, shortLabelOf } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { godName } from '../data/gods.js';
import { colour } from '../data/palette.js';
import { SPAWN_BAND } from '../data/world.js';
import { TRINKET } from '../data/trinkets.js';
import { BOON } from '../data/boons.js';
import { ASKERS, CYCLES } from '../data/cycles.js';
import { S } from '../data/substances.js';
import { aim } from '../model/aim.js';
import { boons } from '../model/boons.js';
import { committedWithin, markedAt, queued, withinReach } from '../model/digqueue.js';
import { eff, mods } from '../model/mods.js';
import { items } from '../model/items.js';
import { PH, player, playerCentre } from '../model/player.js';
import { defOf, feedCheck, feedTarget, machineAt } from '../model/machines.js';
import {
  batchHave, burdenFrac, burdenOf, cycleRow, hasPick, machineIdFor,
  placementCheck, run, tributeHave
} from '../model/run.js';
import { linkCheck, reachOf } from '../model/segments.js';
import { beat } from '../model/tutorial.js';
import { tileAt } from '../model/tiles.js';
import { bandOf, worldX, worldY } from '../model/world.js';
import { CALLOUTS } from '../data/callouts.js';
import { banner, frontToast, toasts } from './fx.js';
import { resolveHover } from './hover.js';
import { stats as paintStats } from './paint.js';
import { drawBar } from './ui/bar.js';
import { drawDraft, draftOpen } from './ui/draft.js';
import { drawMainPanel } from './ui/mainPanel.js';
import { drawPanel } from './ui/panel.js';
import { drawQuickbar } from './ui/quickbar.js';
import { drawRuler, masked, roman, rulerWidth } from './ui/ruler.js';
import { drawn as uiDrawn, resetDrawn as resetUiDrawn } from './ui/state.js';

/* `ink` is primary, `ink2` the secondary body tone, and `dim` encodes a state
   rather than a volume. `shade` is the text-shadow tone, and only for text drawn
   straight onto rendered world: a panel is its own backing. */
const UI = {
  ink:    colour('ui'),
  ink2:   colour('uiInk2'),
  dim:    colour('uiDim'),
  shade:  colour('uiShade'),
  back:   colour('uiBack'),
  heart:  '#d8433a',
  hollow: '#2c2028',
  hi:     '#ff8a7a',
  good:   '#9ad86a',
  /* BURDEN's warning colour, past the soft cap. */
  amber:  '#e0a030',
  debug:  colour('watB'),
  /* A relic's frame and the armed miracle's ghost, in the same divine-gold a
     trinket's own `look.item` uses. */
  relic:  colour('ichor')
};

/* What a tooltip is showing right now, or `active:false`. Read back only by the
   test hook. */
export const hoverInfo = { active: false, x: 0, y: 0, lines: null };

export function drawHUD(g, f) {
  const { W, H } = f;

  /* The widget layer's own scratch space, rebuilt once per HUD frame. */
  resetUiDrawn();

  hearts(g, 6, 6);
  /* BURDEN's bottom edge is TRIBUTE's anchor, the same way `boonStack` hands its
     own bottom to `hudRuler` and `debug`. */
  const burdenBottom = burden(g, 6, 14, W);
  tribute(g, f, 6, burdenBottom, W);
  depth(g, W, 6);
  /* `favourBottom`, not `boonBottom`, is what reaches `hudRuler` and `debug`, or
     FAVOUR draws through whichever runs next. */
  const boonBottom = boonStack(g, f, W, 19);
  const favourBottom = favour(g, W, boonBottom + 3);
  /* Before the reticle and the ghosts: a queued mark, the reticle and a build
     ghost can land on one tile in one frame, and the reticle is what the next
     press acts on, so this stays under them. */
  digMarks(g, f);
  reticle(g, f);
  buildGhost(g, f);
  collectPrompt(g, f);
  drawQuickbar(g, f);
  /* One widget, two mounts; `view/overview.js` mounts it full height. After the
     quickbar, whose real rect it measures out of `drawn` to know where to stop,
     and before the main panel, which must cover it. */
  hudRuler(g, f, W, H, favourBottom);
  /* The callout goes under the window and the toast over it: a refusal raised by
     a click inside the panel would otherwise be hidden by it. */
  calloutLine(g, f, W, H);
  /* The main panel draws over every permanent HUD element above and pauses
     nothing; `view/ui/mainPanel.js` no-ops when `main` is off the panel stack. */
  drawMainPanel(g, f);
  toastLine(g, f, W, H);
  if (f.flags.showDebug) debug(g, f, W, favourBottom);
  /* Death outranks the win: a miss's heart loss and a completion are both
     `rules/cycles.js#step` decisions and can land inside one frame. */
  if (run.dead) deathScreen(g, W, H);
  else if (run.won) winScreen(g, W, H);
  /* Below the two end screens, because a finished run never reaches
     `applyDraftIntents` and a modal over the win screen would be an untakeable
     card covering the restart button. Above the banner and the tooltip. */
  else if (draftOpen(f)) drawDraft(g, f);
  else if (banner.fade > 0) title(g, W, H);
  else tooltip(g, f);
}

/* Five discrete hearts, no partials and no regeneration: the player must be able
   to count what a fall will cost. */
function hearts(g, x, y) {
  for (let i = 0; i < run.maxHearts; i++) {
    const full = i < run.hearts;
    const hx = x + i * 9;
    const col = full ? UI.heart : UI.hollow;
    R(g, hx,     y + 1, 2, 2, col);
    R(g, hx + 3, y + 1, 2, 2, col);
    R(g, hx,     y + 2, 5, 2, col);
    R(g, hx + 1, y + 4, 3, 1, col);
    R(g, hx + 2, y + 5, 1, 1, col);
    if (full) R(g, hx + 1, y + 1, 1, 1, UI.hi);
  }
}

/* A compact bar below the hearts: good under the soft cap, amber past it, red at
   or over the hard cap. Bar plus value text stays under 130 px, clear of the
   depth gauge at the 200 px floor. Returns the y just past what it drew. */
function burden(g, x, y, W) {
  const cap = eff('burden'), soft = eff('burdenSoft'), frac = burdenFrac();
  const locked = frac >= 1;
  const col = locked ? UI.heart : frac >= soft ? UI.amber : UI.good;

  const bar = drawBar(g, {
    id: 'hud-burden', x, y, w: 50, h: 3, frac, fillColour: col, vw: W,
    valueText: `${burdenOf().toFixed(1)} / ${cap.toFixed(0)} T`,
    /* No panel behind it, unlike the Character tab's own copy of this bar. */
    shadow: UI.shade
  });

  let by = bar.y + bar.h;
  if (locked) {
    drawText(g, 'TOO HEAVY TO CLIMB', x, by + 2, UI.heart, 1, 1, UI.shade);
    by += 9;
  }
  return by + 2;
}

/* m:ss. Every countdown this file prints uses it -- the tribute deadline, the
   batch window's own length and a boon's remaining time. */
function mmss(secs) {
  const s = Math.max(0, Math.ceil(secs));
  return ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0');
}

/* Is a countdown flashing this instant? One rule for the boon stack and the
   tribute deadline both, derived from `f.t` and the seconds left, never `rand()`
   and never a frame counter. 3 Hz reads without strobing. */
function urgentFlash(left, t) {
  return left > 0 && left <= eff('urgentSecs') && ((t * 6) | 0) % 2 === 0;
}

/* Left column, anchored at `burden()`'s returned bottom. Prints the same
   `have`/`need` numbers `tributeMet` decides completion from, and no timer line
   when `left === null`. `drawBar` alone, so `drawn.panels` gains no target. */
const TRIBUTE_BAR_W = 50;
/* 4, not 2: the aggregate bar has no label, so `drawBar` centres its value text
   2 px above the bar, and a 2 px gap lands its "N%" against the row above. */
const TRIBUTE_ROW_GAP = 4;

function tribute(g, f, x, y, W) {
  let ry = y;
  const cyc = run.tribute ? cycleRow() : null;

  if (cyc) {
    drawText(g, 'TRIBUTE ' + roman(run.cycle - 1), x, ry, UI.ink, 1, 1, UI.shade);
    ry += 8;

    const rows = cyc.demand
      .map(d => ({ ...d, so: S[d.sub], fo: F[d.form] }))
      .sort((a, b) => byHudOrder({ sub: a.so, form: a.fo }, { sub: b.so, form: b.fo }));

    /* Clamped per row, though the ledger itself accepts over-delivery: a fraction
       over 1 would read as "more than done", which is not a state a trial has. */
    let have = 0, need = 0;
    for (const d of rows) {
      const h = tributeHave(d.sub, d.form);
      have += Math.min(h, d.n);
      need += d.n;
      const bar = drawBar(g, {
        id: 'tribute-' + d.sub + '-' + d.form, x, y: ry, w: TRIBUTE_BAR_W, h: 3,
        frac: d.n > 0 ? h / d.n : 1, vw: W,
        label: labelOf(d.so, d.fo), valueText: `${h} / ${d.n}`, shadow: UI.shade
      });
      ry = bar.y + bar.h + TRIBUTE_ROW_GAP;
    }

    /* The batch clause is a demand row and counts towards the aggregate, or an
       aggregate over the rows alone reads 100% on an unpaid cycle. Clamped at
       `batch.n`, since `batchHave()` saturates near it. */
    const batch = cyc.batch;
    if (batch) {
      const h = Math.min(batchHave(), batch.n);
      have += h;
      need += batch.n;
      const bar = drawBar(g, {
        id: 'tribute-batch', x, y: ry, w: TRIBUTE_BAR_W, h: 3,
        frac: batch.n > 0 ? h / batch.n : 1, vw: W,
        label: batchLabel(batch, `${h} / ${batch.n}`, x, W),
        valueText: `${h} / ${batch.n}`, shadow: UI.shade
      });
      ry = bar.y + bar.h + TRIBUTE_ROW_GAP;
    }

    /* 99% is the ceiling short of done: `Math.round` alone reaches 100 from a
       fraction under 1 as soon as a trial asks for more than 200 units. */
    const aggFrac = need > 0 ? have / need : 0;
    const pct = aggFrac >= 1 ? 100 : Math.min(99, Math.round(aggFrac * 100));
    const agg = drawBar(g, {
      id: 'tribute-progress', x, y: ry, w: TRIBUTE_BAR_W, h: 3, frac: aggFrac, vw: W,
      valueText: pct + '%', shadow: UI.shade
    });
    ry = agg.y + agg.h + TRIBUTE_ROW_GAP;

    if (run.tribute.left !== null) {
      const flash = urgentFlash(run.tribute.left, f.t);
      drawText(g, mmss(run.tribute.left), x, ry, flash ? UI.heart : UI.ink2, 1, 1, UI.shade);
      ry += 9;
    }
  }

  ry = missTally(g, x, ry, W);
  return ry === y ? y : ry + 2;
}

/* The widest row TRIBUTE draws, since it names a pair and a window. FAVOUR's x
   cannot be read here, because it draws after this, so the budget is the left
   half of the viewport; over budget it falls back to `shortLabelOf`. */
function batchLabel(batch, valueText, x, W) {
  const span = ' IN ' + mmss(batch.secs);
  const full = labelOf(S[batch.sub], F[batch.form]) + span;
  const rowW = Math.max(TRIBUTE_BAR_W, textWidth(full)) + 3 + textWidth(valueText);
  return rowW <= (W >> 1) - x ? full : shortLabelOf(S[batch.sub], F[batch.form]) + span;
}

/* How close the run is to ending on the calendar rather than on hearts. Drawn
   only once a deadline has expired, and it stays up between trials. One line or
   two, against the same left-half budget the batch row uses. */
function missTally(g, x, y, W) {
  if (!run.misses) return y;
  const count = 'MISSED ' + run.misses;
  const warn = run.misses === 1 ? 'ONE MORE ENDS THIS' : null;
  const joined = warn ? count + ' -- ' + warn : count;
  const rows = !warn || textWidth(joined) <= (W >> 1) - x ? [joined] : [count, warn];

  let ry = y;
  for (const r of rows) {
    drawText(g, r, Math.max(2, Math.min(x, W - textWidth(r) - 2)), ry, UI.heart, 1, 1, UI.shade);
    ry += 9;
  }
  return ry;
}

/* The tooltip itself. `resolveHover` hit-tests and looks up the content; this
   lays out what it returns and remembers it in `hoverInfo` for the test hook. */
function tooltip(g, f) {
  /* `drawn.tooltip` is a single slot, so a panel that already drew one this frame
     wins. */
  if (uiDrawn.tooltip) return;
  /* No HUD hitboxes of its own, so this falls straight through to
     `resolveHover`'s world path: falling item, then machine, then bare tile. */
  const info = resolveHover(f, []);
  hoverInfo.active = !!info;
  hoverInfo.x = info ? info.x : 0;
  hoverInfo.y = info ? info.y : 0;
  hoverInfo.lines = info ? info.lines : null;
  if (!info) return;

  const { x, y, lines } = info;
  let w = 0;
  for (const l of lines) w = Math.max(w, textWidth(l));
  w += 8;
  const h = lines.length * 8 + 4;

  /* Offset from the cursor, then clamped to stay on screen. */
  const bx = Math.min(x + 8, f.W - w - 2);
  const by = Math.min(y + 8, f.H - h - 2);

  panel(g, bx, by, w, h, 0.92);
  lines.forEach((l, i) => drawText(g, l, bx + 4, by + 3 + i * 8, i === 0 ? UI.ink : UI.ink2, 1, 1));
}

/* One tile reads one metre from the spawn band's own ground line, measured at
   the feet (`player.y + PH`, since `player.y` is the top of the 16 px body). The
   datum is the same `worldY(ref, floorTy)` expression `minDepth` gates on. */
function depth(g, W, y) {
  const ref = bandOf(SPAWN_BAND);
  if (!ref) return;
  const datum = worldY(ref, ref.cfg.floorTy ?? 0);
  const d = Math.round((player.y + PH - datum) / ref.tile);
  const s = (d >= 0 ? d : '+' + -d) + 'M';
  const w = textWidth(s) + 8;
  panel(g, W - w - 6, y - 2, w, 11);
  /* `dim` encodes a state here: the reading is at or above the spawn datum. */
  drawText(g, s, W - w - 2, y, d > 0 ? UI.ink : UI.dim, 1, 1);
}

/* Both ends are measured, never chosen: the top is `boonStack`'s return, the
   bottom the quickbar's real rect out of `drawn`. Skipped when the gap is too
   short to read, since a 20 px bar over 416 rows is a smear. */
const HUD_RULER_MIN_H = 40;

function hudRuler(g, f, W, H, boonBottom) {
  const y = boonBottom + 6;
  const qb = uiDrawn.grids.find(gr => gr.id === 'quickbar');
  const bottom = (qb ? qb.y : H - 12) - 4;
  if (bottom - y < HUD_RULER_MIN_H) return;
  drawRuler(g, { id: 'hud-ruler', x: W - rulerWidth() - 2, y, h: bottom - y, vw: W, vh: H });
}

/* Top-right, newest at top: `boons.active` is append-order and never reordered
   on refresh, so walking it backwards puts the newest on top. Capped at 5 rows
   with a '+N' overflow line. The fill and the flash derive only from `f.t`. */
const BOON_ROWS_MAX = 5;
const BOON_ROW_H = 9;

function boonStack(g, f, W, startY) {
  const rows = boons.active;
  if (!rows.length) return startY;

  const shown = rows.slice(-BOON_ROWS_MAX).reverse();
  const overflow = rows.length - shown.length;
  let y = startY;

  for (const a of shown) {
    const b = BOON[a.id];
    if (!b) continue;
    const frac = Math.max(0, Math.min(1, a.left / b.secs));
    const flash = urgentFlash(a.left, f.t);

    /* The short name: this row is fixed-width and right-anchored, and falls back
       to the full name for a boon with no `short`. */
    const label = b.short || b.name;
    const timeStr = mmss(a.left);
    const barW = 24;
    const w = 6 + textWidth(label) + 4 + barW + 4 + textWidth(timeStr) + 4;
    const x = Math.max(2, W - w - 6);

    R(g, x, y, 4, 4, UI.relic);
    drawText(g, label, x + 6, y - 1, flash ? UI.heart : UI.ink, 1, 1, UI.shade);
    const barX = x + 6 + textWidth(label) + 4;
    R(g, barX, y, barW, 3, UI.hollow);
    R(g, barX, y, Math.round(barW * frac), 3, flash ? UI.heart : UI.good);
    drawText(g, timeStr, barX + barW + 4, y - 1, UI.ink2, 1, 1, UI.shade);

    y += BOON_ROW_H;
  }

  if (overflow > 0) {
    const s = '+' + overflow;
    drawText(g, s, Math.max(2, W - textWidth(s) - 6), y - 1, UI.ink2, 1, 1, UI.shade);
    y += BOON_ROW_H;
  }

  return y;
}

/* Right column, in the boon stack's anchor chain; its return reaches `hudRuler`
   and `debug`. A god is known once `run.favour[god] !== undefined`, which the
   first cycle resolution sets. Negative favour empties the bar, not the number. */
const FAVOUR_MAX = CYCLES.reduce((s, c) => s + (c.reward.favour || 0), 0);
const FAVOUR_ROW_GAP = 2;

function favour(g, W, startY) {
  if (!ASKERS.length) return startY;

  const rows = ASKERS.map(god => {
    const known = run.favour[god] !== undefined;
    const n = run.favour[god] ?? 0;
    return {
      god, known,
      label: masked(godName(god), known),
      valueText: known ? String(n) : '',
      frac: Math.max(0, Math.min(1, n / FAVOUR_MAX))
    };
  });

  /* The bar is as wide as the widest name, or the mask: `drawBar` puts the value
     text beside the bar at a y inside the label's line, so a narrower bar pushes
     the number against the label's tail. The panel's x clears it too. */
  let labelW = 0, valueW = 0;
  for (const r of rows) {
    labelW = Math.max(labelW, textWidth(r.label));
    valueW = Math.max(valueW, textWidth(r.valueText));
  }
  const barW = labelW;
  const rowW = Math.max(labelW, barW + 3 + valueW);
  const x = Math.max(2, W - rowW - 6);

  let y = startY;
  for (const r of rows) {
    const bar = drawBar(g, {
      id: 'favour-' + r.god, x, y, w: barW, h: 3, vw: W,
      frac: r.frac, label: r.label, valueText: r.valueText, shadow: UI.shade
    });
    y = bar.y + bar.h + FAVOUR_ROW_GAP;
  }
  return y;
}

/* Three states: WORKED is the committed tile, an X in a 1 px frame and at most
   one per frame; IN REACH is the whole X; DEFERRED is two px of each of the X's
   four ends. `committedWithin`/`withinReach` take the rules step's own `reach`. */

/* The X, inset a pixel so it reads as a mark on the tile rather than a border of
   it, over a shadow of itself one row lower. Shadows go down first, in their own
   pass, so one never lands on a mark pixel, and the lowest falls on row `t - 1`. */
function markGlyph(g, x, y, t, col, tips) {
  const n = t - 2;
  if (n < 2) { R(g, x, y, t, t, col); return; }
  const keep = tips ? 2 : n;
  for (const [c, dy] of [[UI.shade, 1], [col, 0]])
    for (let i = 0; i < n; i++) {
      if (i >= keep && i < n - keep) continue;
      R(g, x + 1 + i,     y + 1 + i + dy, 1, 1, c);
      R(g, x + t - 2 - i, y + 1 + i + dy, 1, 1, c);
    }
}

function digMarks(g, f) {
  const set = queued();
  if (!set.size || run.dead) return;

  const c = playerCentre();
  const reach = eff('reach');
  const target = committedWithin(c.x, c.y, reach);

  for (const m of set.values()) {
    /* A stale mark is collected by `rules/mining.js` on its next substep, not
       here, because reads never mutate. */
    if (!markedAt(m.band, m.tx, m.ty)) continue;

    const t = m.band.tile;
    const x = (worldX(m.band, m.tx) - f.cam.x) | 0;
    const y = (worldY(m.band, m.ty) - f.cam.y) | 0;
    if (x <= -t || y <= -t || x >= f.W || y >= f.H) continue;

    const worked = !!target && target.b === m.band && target.tx === m.tx && target.ty === m.ty;
    const near = worked || withinReach(m, c.x, c.y, reach);

    markGlyph(g, x, y, t, near ? UI.ink : UI.dim, !near);
    if (worked) {
      R(g, x, y, t, 1, UI.ink);         R(g, x, y + t - 1, t, 1, UI.ink);
      R(g, x, y + 1, 1, t - 2, UI.ink); R(g, x + t - 1, y + 1, 1, t - 2, UI.ink);
    }
  }
}

/* The aim reticle, in world space but drawn with the HUD because it is a
   statement about the pick and not about the rock. */
function reticle(g, f) {
  if (!aim.valid || !aim.band || !hasPick() || run.dead) return;
  const b = aim.band, t = b.tile;
  const x = (b.origin.x + aim.tx * t - f.cam.x) | 0;
  const y = (b.origin.y + aim.ty * t - f.cam.y) | 0;
  if (x < -t || y < -t || x > f.W || y > f.H) return;
  const col = aim.mode === 'place' ? UI.good : '#ffe9a8';
  g.globalAlpha = 0.75;
  R(g, x, y, 2, 1, col);             R(g, x, y, 1, 2, col);
  R(g, x + t - 2, y, 2, 1, col);     R(g, x + t - 1, y, 1, 2, col);
  R(g, x, y + t - 1, 2, 1, col);     R(g, x, y + t - 2, 1, 2, col);
  R(g, x + t - 2, y + t - 1, 2, 1, col);
  R(g, x + t - 1, y + t - 2, 1, 2, col);
  g.globalAlpha = 1;
}

/* Previews the armed pair's footprint at the reticle, tinted by
   `model/run.js#placementCheck`, the query `rules/placement.js#placeMachine`
   calls. Anchored bottom row at the aimed tile, as a real placement is. */
function drawFootprintGhost(g, f, band, tx, ty, tw, th, ok, why) {
  const t = band.tile;
  const col = ok ? UI.good : UI.heart;

  g.globalAlpha = 0.35;
  for (let j = 0; j < th; j++)
    for (let i = 0; i < tw; i++) {
      const x = (band.origin.x + (tx + i) * t - f.cam.x) | 0;
      const y = (band.origin.y + (ty + j) * t - f.cam.y) | 0;
      R(g, x, y, t, t, col);
    }
  g.globalAlpha = 1;

  if (!ok && why) {
    const x = (band.origin.x + tx * t - f.cam.x) | 0;
    const y = (band.origin.y + ty * t - f.cam.y) | 0;
    ghostLabel(g, f, x, y, why, UI.heart);
  }
}

/* The reason, in the ghost's own colour, one line above the top-left of its
   subject, shadowed and clamped to the viewport. `below` puts the line one row
   under `y`, because the two labels can fire in the same frame. */
function ghostLabel(g, f, x, y, text, col, below = false) {
  const w = textWidth(text);
  const ly = below ? y + 2 : y - 8;
  drawText(g, text, Math.max(2, Math.min(x, f.W - w - 2)),
           Math.max(2, Math.min(ly, f.H - 10)), col, 1, 1, UI.shade);
}

/* With something armed and a machine under the reticle, LMB feeds rather than
   places; `model/machines.js#feedCheck` is the query `handOne` enforces. Reach
   is not checked here, and `have`/`cap` are the matched clause's own. */
function feedGhost(g, f, m, armed) {
  const check = feedCheck(m, armed.sub, armed.form);
  const col = check.ok ? UI.good : UI.heart;
  const x = (m.box.x - f.cam.x) | 0, y = (m.box.y - f.cam.y) | 0;
  const w = m.box.w | 0, h = m.box.h | 0;

  g.globalAlpha = 0.85;
  R(g, x, y, w, 1, col);
  R(g, x, y, 1, h, col);
  R(g, x, y + h - 1, w, 1, col);
  R(g, x + w - 1, y, 1, h, col);
  g.globalAlpha = 1;

  ghostLabel(g, f, x, y, check.ok ? check.have + '/' + check.cap : check.why, col);
}

/* At the player rather than the machine: this answers "is a press live this
   instant", which needs `feedTarget`'s reach check. Below the feet, because
   `feedGhost`'s label occupies the row above the machine. */
function feedPrompt(g, f) {
  const x = (player.x - f.cam.x) | 0, y = (player.y + PH - f.cam.y) | 0;
  ghostLabel(g, f, x, y, 'LMB FEED', UI.good, true);
}

/* The pickup analogue of `feedPrompt`, and silent while auto collect is on.
   `items`/`eff('pickupR')` mirror `rules/items.js#step`'s `near()` gate from the
   player's centre. Above the head, so neither row lies if both are true. */
function collectPrompt(g, f) {
  if (f.ui.autoCollect) return;
  const c = playerCentre(), r = eff('pickupR');
  const near = items.some(it => {
    const dx = it.x - c.x, dy = it.y - c.y;
    return dx * dx + dy * dy < r * r;
  });
  if (!near) return;
  const x = (player.x - f.cam.x) | 0, y = (player.y - f.cam.y) | 0;
  ghostLabel(g, f, x, y, 'C COLLECT', UI.good);
}

/* An armed `phial` is the top LMB rule, so it converts LMB from "dig" to "spend
   a one-shot". Divine gold rather than good/red, which mean a placement is legal
   or is not. Static geometry from `aim` alone: no pulse and no `rand()`. */
const MIRACLE_SPOKE = 3;
function miracleGhost(g, f) {
  const b = aim.band, t = b.tile;
  const x = (b.origin.x + aim.tx * t - f.cam.x) | 0;
  const y = (b.origin.y + aim.ty * t - f.cam.y) | 0;
  const cx = x + (t >> 1), cy = y + (t >> 1);

  g.globalAlpha = 0.35;
  R(g, x, y, t, t, UI.relic);
  g.globalAlpha = 1;

  R(g, cx, y - MIRACLE_SPOKE, 1, MIRACLE_SPOKE, UI.relic);
  R(g, cx, y + t, 1, MIRACLE_SPOKE, UI.relic);
  R(g, x - MIRACLE_SPOKE, cy, MIRACLE_SPOKE, 1, UI.relic);
  R(g, x + t, cy, MIRACLE_SPOKE, 1, UI.relic);
}

/* Draws the cable the second `l` press would create, tinted by
   `model/segments.js#linkCheck`, the query `linkSegment` calls first. Aiming at
   nothing is a third state: the cable is dim, no `why`, reach clip still shown. */
function cableGhost(g, f) {
  const from = f.ui.linkFrom;
  /* Must stay the same point `model/segments.js#anchorOf` picks, or the ghost
     previews a cable offset from the one the link creates. */
  const ax = from.box.x + from.box.w / 2, ay = from.box.y + from.box.h / 2;

  const to = machineAt(aim.band, aim.tx, aim.ty);
  const t = aim.band.tile;
  const bx = to ? to.box.x + to.box.w / 2 : aim.band.origin.x + aim.tx * t + t / 2;
  const by = to ? to.box.y + to.box.h / 2 : aim.band.origin.y + aim.ty * t + t / 2;

  const check = to && to !== from ? linkCheck(from, to) : null;
  const col = !check ? UI.dim : check.ok ? UI.good : UI.heart;

  /* Clipped at the SMALLER of the two reaches, exactly as `linkCheck` refuses
     on it -- so the clip point and the refusal are one number. */
  const reach = Math.min(reachOf(from), to ? reachOf(to) : Infinity);
  const len = Math.hypot(bx - ax, by - ay);
  const clipped = reach > 0 && len > reach;
  const k = clipped ? reach / len : 1;

  const x0 = (ax - f.cam.x) | 0, y0 = (ay - f.cam.y) | 0;
  const x1 = (ax + (bx - ax) * k - f.cam.x) | 0;
  const y1 = (ay + (by - ay) * k - f.cam.y) | 0;

  g.globalAlpha = 0.85;
  lineTo(g, x0, y0, x1, y1, col);
  g.globalAlpha = 1;

  /* The armed end: four corner brackets rather than a fill, so the hub's own
     art stays visible under the marker. */
  const lx = x0 - from.box.w / 2, rx = x0 + from.box.w / 2 - 1;
  const ty = y0 - from.box.h / 2, byy = y0 + from.box.h / 2 - 1;
  for (const [cx, sx] of [[lx, 1], [rx, -1]])
    for (const [cy, sy] of [[ty, 1], [byy, -1]]) {
      R(g, sx > 0 ? cx : cx - 2, cy, 3, 1, UI.good);
      R(g, cx, sy > 0 ? cy : cy - 2, 1, 3, UI.good);
    }

  if (clipped) {                                    // where the reach runs out
    R(g, x1 - 2, y1 - 2, 5, 1, UI.heart);
    R(g, x1 - 2, y1 + 2, 5, 1, UI.heart);
    R(g, x1 - 2, y1 - 1, 1, 3, UI.heart);
    R(g, x1 + 2, y1 - 1, 1, 3, UI.heart);
  }

  if (check?.at) {
    const sx = (check.at.x - f.cam.x) | 0, sy = (check.at.y - f.cam.y) | 0;
    g.globalAlpha = 0.55;
    R(g, sx - 3, sy - 3, 7, 7, UI.heart);
    g.globalAlpha = 1;
    R(g, sx - 1, sy - 1, 3, 3, UI.hi);
  }

  /* Clamped to the viewport, because a refusal drawn off the right edge at a
     narrow buffer is a refusal nobody reads. */
  if (check && !check.ok) {
    const w = textWidth(check.why);
    drawText(g, check.why, Math.max(2, Math.min(x1 + 5, f.W - w - 2)),
             Math.max(2, Math.min(y1 - 4, f.H - 10)), UI.heart, 1, 1, UI.shade);
  }
}

function buildGhost(g, f) {
  if (!aim.valid || !aim.band) return;

  /* A link in progress outranks an armed placement: both gestures use the same
     reticle, and `l` armed a hub, so the next press links. */
  if (f.ui.linkFrom) { cableGhost(g, f); return; }

  /* The same footprint tint, generalised to a single tile. `view` may not import
     `rules`, so `placeTile`'s "needs something to hang from" is not re-proven;
     what this checks is whether the tile is clear. */
  const armed = f.ui.armedPlace;
  if (!armed) return;

  /* This branch order is `shell/input.js`'s LMB dispatch order: an armed miracle,
     then a machine under the reticle in reach, then open ground with something
     armed, then mining. Mirrored, because `view` may not import `shell`. */
  if (armed.form === F.phial) { miracleGhost(g, f); return; }

  /* `def.handFeed` is part of the test, the first half of `feedTarget`'s two
     questions: a gear, an axle or a hub has no hand-feed clause, so rule 2 cannot
     fire on it and the press falls to rule 3. */
  const target = machineAt(aim.band, aim.tx, aim.ty);
  if (target && defOf(target).handFeed) {
    feedGhost(g, f, target, armed);
    if (feedTarget(armed)) feedPrompt(g, f);
    return;
  }

  if (armed.form === F.rig) {
    const id = machineIdFor(armed.sub);
    const def = id && MACH[M[id]];
    if (!def) return;
    const tx = aim.tx, ty = aim.ty - def.th + 1;
    const check = placementCheck(aim.band, id, tx, ty);
    drawFootprintGhost(g, f, aim.band, tx, ty, def.tw, def.th, check.ok, check.why);
  } else if (FORM[armed.form]?.tile) {
    const ok = tileAt(aim.band, aim.tx, aim.ty) === AIR;
    drawFootprintGhost(g, f, aim.band, aim.tx, aim.ty, 1, 1, ok, ok ? null : 'SOMETHING IS ALREADY THERE');
  }
}

/* A transient toast always wins over standing guidance, and the front of the
   queue rather than the back, so two facts arriving in one frame show in the
   order they happened. With none showing, the callout falls back to a beat. */
const CALLOUT_FADE_SECS = 0.4;
const calloutFade = { beat: -1, since: 0 };

function toastLine(g, f, W, H) {
  const front = frontToast();
  if (front) bottomLine(g, f, W, H, front.text, 1);
}

function calloutLine(g, f, W, H) {
  if (toasts.length) return;
  const b = beat(run);
  const text = CALLOUTS[b];
  if (!text) return;
  /* Queued, not overlapping: only one line is drawn, so a beat change cannot
     show two instructions at once. The fade derives from `f.t` plus the beat
     it last changed at, never a frame counter and never `rand()`. */
  if (b !== calloutFade.beat) { calloutFade.beat = b; calloutFade.since = f.t; }
  bottomLine(g, f, W, H, text,
             Math.min(1, Math.max(0, (f.t - calloutFade.since) / CALLOUT_FADE_SECS)));
}

/* Wrapped because the panel clamps and `drawText` does not clip: the width is
   capped at `W - 4`, but text drawn at `x + 6` runs as far as it likes, and at
   the 200 px buffer 8 of the 9 callout rows spilled off the right edge. */
const LINE_PITCH = 8;
const CALLOUT_PAD = 12;

/* Exported so the harness can assert every callout row fits at
   `core/canvas.js#BASE_W_MIN` against the budget the renderer uses, rather
   than a second copy of these two numbers. */
export const calloutLines = (text, W) => wrap(text, W - 4 - CALLOUT_PAD);

function bottomLine(g, f, W, H, text, fadeAlpha) {
  const lines = calloutLines(text, W);
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, textWidth(l));
  const w = Math.min(widest + CALLOUT_PAD, W - 4);
  const h = lines.length * LINE_PITCH + 4;
  const x = Math.max(2, (W - w) >> 1);
  const y = Math.max(2, calloutBottom(H, x, w) - h);
  panel(g, x, y, w, h, 0.78, fadeAlpha);
  g.globalAlpha = fadeAlpha;
  lines.forEach((l, i) => drawText(g, l, x + 6, y + 3 + i * LINE_PITCH, UI.ink, 1, 1));
  g.globalAlpha = 1;
}

/* How far down the callout may reach. Both neighbours' rects are read out of
   `drawn`, and it lifts only where it overlaps one in x. The reserve above the
   quickbar is its 10 px `HAND_GAP` plus 2 px, where the IN HAND line lives. */
const QUICKBAR_RESERVE = 12;

function calloutBottom(H, x, w) {
  let bottom = H - 4;
  const qb = uiDrawn.grids.find(gr => gr.id === 'quickbar');
  if (qb && x < qb.x + qb.w && x + w > qb.x)
    bottom = Math.min(bottom, qb.y - QUICKBAR_RESERVE);
  const keys = uiDrawn.panels.find(p => p.id === 'hints-toggle');
  if (keys && x < keys.x + keys.w && x + w > keys.x)
    bottom = Math.min(bottom, keys.y - 2);
  return bottom;
}

function debug(g, f, W, top = 22) {
  const panelY = Math.max(22, top);
  const rows = [
    'FPS ' + (f.dt > 0 ? Math.round(1 / f.dt) : 0),
    'BAND ' + (player.band ? player.band.id.toUpperCase() : '-'),
    'POS ' + Math.round(player.x) + ',' + Math.round(player.y),
    'VY ' + Math.round(player.vy),
    'GND ' + (player.onGround ? 'Y' : 'N') + ' LAD ' + (player.onLadder ? 'Y' : 'N'),
    'PAINT ' + paintStats.painted + ' RE ' + paintStats.repainted +
      ' CACHE ' + paintStats.cached,
    'MODS ' + mods.rows.length + ' ' +
      [...new Set(mods.rows.map(m => m.src))].map(id => TRINKET[id]?.god || id).join(' ')
  ];
  let w = 0;
  for (const r of rows) w = Math.max(w, textWidth(r));
  panel(g, W - w - 12, panelY, w + 10, rows.length * 9 + 6, 0.8);
  rows.forEach((r, i) => drawText(g, r, W - w - 7, panelY + 4 + i * 9, UI.debug, 1, 1));
}

/* Sized from its own measured label, never a hardcoded origin, and registered
   into `drawn.panels` under `'death-restart'`, which
   `shell/input.js#onDeathRestart` hit-tests. */
const RESTART_LABEL = 'BEGIN THE NEXT TORMENT';

/* Two end-of-run screens, one implementation: they differ only in wash, lines and
   the id their button records, and `id` is what makes the two hit-testable
   apart. */
function endScreen(g, W, H, { wash, lines, id }) {
  g.globalAlpha = 0.78; R(g, 0, 0, W, H, wash); g.globalAlpha = 1;
  let y = (H >> 1) - 26;
  for (const [s, col, want] of lines) {
    /* A double-size headline drops to single rather than overflowing: `THE EAGLE
       COMES` is 164 px at scale 2 and fits the 200 px floor, `THE GODS ARE
       ANSWERED` is 252 px and clipped mid-word. */
    const sc = want > 1 && textWidth(s, want) > W - 8 ? want - 1 : want;
    drawText(g, s, Math.max(4, (W - textWidth(s, sc)) >> 1), y, col, sc, 1);
    y += sc === 2 ? 22 : 13;
  }

  const bw = textWidth(RESTART_LABEL) + 8, bh = 11;
  const btn = drawPanel(g, { id, x: (W - bw) >> 1, y, w: bw, h: bh, vw: W, vh: H, alpha: 0.9 });
  drawText(g, RESTART_LABEL, btn.x + 4, btn.y + 2, UI.good, 1, 1);
}

/* Depth reached, in the same datum `depth()` draws off and `placementCheck`
   gates on. `run.deepest` is the deepest `player.y`, the top of the body, so
   it takes the same `+ PH`. Shared by both end screens. */
function depthReached() {
  const ref = bandOf(SPAWN_BAND);
  const datum = ref ? worldY(ref, ref.cfg.floorTy ?? 0) : 0;
  const tile = ref ? ref.tile : 8;
  return Math.max(0, Math.round((run.deepest + PH - datum) / tile));
}

/* The two lines both endings print. `run.cycle - 1` is trials paid, and a win
   leaves `run.cycle` one past the last shipped row, so the same expression reads
   `CYCLES.length` there. No shadow on either: the wash is the backing. */
function tallyLines() {
  const favourTotal = Object.values(run.favour ?? {}).reduce((a, b) => a + b, 0);
  return [
    [Math.max(0, run.cycle - 1) + ' TRIALS PAID -- ' + favourTotal + ' FAVOUR', UI.ink, 1],
    ['MISSES ' + run.misses + ' -- DEPTH REACHED ' + depthReached() + 'M', UI.ink2, 1]
  ];
}

function deathScreen(g, W, H) {
  endScreen(g, W, H, {
    wash: '#0a0206',
    id: 'death-restart',
    lines: [
      ['THE EAGLE COMES', UI.heart, 2],
      [run.deathCause || 'UNKNOWN', UI.ink, 1],
      ...tallyLines()
    ]
  });
}

/* `run.won` is set once, the frame `run.cycle` passes the last shipped row, so
   this draws for the rest of the process's life while `shell/main.js#step` stops
   stepping. `endScreen` with the id `'win-restart'`. */
function winScreen(g, W, H) {
  endScreen(g, W, H, {
    /* A pale gold wash rather than the death screen's near-black red: the two
       endings must not be mistakable for each other at a glance. */
    wash: '#1b1608',
    id: 'win-restart',
    lines: [
      ['THE GODS ARE ANSWERED', UI.good, 2],
      ...tallyLines()
    ]
  });
}

function title(g, W, H) {
  g.globalAlpha = Math.min(1, banner.fade);
  /* Straight onto the rendered world with nothing behind it, so both lines
     take the shadow. The sub-line moves off `dim` (it encoded nothing; it was
     just the smaller of two). */
  drawText(g, banner.text, Math.max(2, (W - textWidth(banner.text, 2)) >> 1),
           (H >> 1) - 30, UI.ink, 2, 2, UI.shade);
  drawText(g, banner.sub, Math.max(2, (W - textWidth(banner.sub)) >> 1),
           (H >> 1) - 8, UI.ink2, 1, 2, UI.shade);
  g.globalAlpha = 1;
}

/* `fade` scales both the body and the top bevel: without it the bevel was drawn
   after `globalAlpha` went back to 1, so a panel fading in showed a fully opaque
   1 px line over nothing. Every static caller leaves `fade` at 1. */
function panel(g, x, y, w, h, a = 0.72, fade = 1) {
  g.globalAlpha = a * fade; R(g, x, y, w, h, UI.back);
  g.globalAlpha = fade; R(g, x, y, w, 1, mix(UI.back, UI.dim, 0.6));
  g.globalAlpha = 1;
}

/* Exported so a future tribute panel and the pocket strip cannot drift apart on
   how a pair is named. `labelOf` builds "COPPER INGOT" from two rows; nothing
   hand-writes it. */
export const pairLabel = (sub, form) => labelOf(sub, form);
