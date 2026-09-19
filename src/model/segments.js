/* model layer — segments: the cables between hubs, and the check for whether
   a cable may exist.

   A segment has no footprint, buffer or recipe: it is created by an action
   between two hub machines rather than placed. One segment joins exactly two
   hubs, and nothing here describes a route longer than one segment -- a route
   is `chains()`, derived and never stored.

   A rope is a LOOP. `u` is its phase in [0,1), and a bucket rides at
   `u + off` wrapped: phase 0 is the low anchor, 0.5 the high anchor, and the
   rest of the turn is the descending strand back to the low anchor. So
   buckets circulate rather than stopping at the top, and a descending one
   hangs against an ascending one -- which is why `rules/drive.js` weighs the
   NET load and not the total.

   `a` and `b` are the machine records, never ids or indices, so
   `write.unlinkAll(m)` is an identity test rather than a search.

   Motion is `rules/drive.js`'s; everything here is storage and queries. */

import { lerp, rect } from '../core/math.js';
import { bump } from './epoch.js';
import { defOf } from './machines.js';
import { eff } from './mods.js';
import { player, playerBox } from './player.js';
import { solidAt } from './tiles.js';
import { bandAt } from './world.js';

export const segments = [];

/* Vertical slack, in px, within which something counts as on the carrier
   rather than merely near it. */
const CARRIER_GRAB = 3;

/* Carrier size in px. Not a tunable: this is the size of a drawn object, the
   same class of number as `model/player.js`'s PW/PH. 8 wide so two decks side
   by side span exactly the 2-tile shaft the scenarios carve, and still take
   the 6 px player. */
export const CARRIER_W = 8;
export const CARRIER_H = 4;

/* How far apart the loop's two strands sit, across the rope. Equal to
   `CARRIER_W`, so an ascending bucket and a descending one at the same height
   touch without overlapping. */
export const STRAND_GAP = 8;

export const write = {
  /* The caller is trusted to have called `linkCheck` first;
     `rules/placement.js#linkSegment` is the one caller that turns a refusal
     into a journal row. */
  link(a, b) {
    const seg = geometryOf(a, b);
    segments.push(seg);
    bump();
    return seg;
  },

  unlink(seg) {
    const i = segments.indexOf(seg);
    if (i >= 0) segments.splice(i, 1);
    bump();
  },

  /* Every segment anchored to this machine, gone, so a deconstructed hub
     cannot leave a segment pointing at a record nothing else holds. Returns
     how many were cut. */
  unlinkAll(m) {
    let n = 0;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].a !== m && segments[i].b !== m) continue;
      segments.splice(i, 1);
      n++;
    }
    if (n) bump();
    return n;
  },

  /* Advance the loop by `du` turns, positive being the ascending strand
     going up. `spin` is the sign of that, for `view`. */
  spin(seg, du, spin) {
    seg.u = wrap(seg.u + du);
    seg.spin = spin;
    bump();
  },

  /* A bucket on this rope, at the phase the loop currently presents at
     `phase`. Returns the record so a caller can position cargo against it. */
  attach(seg, phase = 0) {
    const c = { off: wrap(phase - seg.u), load: 0 };
    seg.carriers.push(c);
    bump();
    return c;
  },

  detach(seg, c) {
    const i = seg.carriers.indexOf(c);
    if (i >= 0) seg.carriers.splice(i, 1);
    bump();
  },

  load(seg, talents) { seg.load = talents; bump(); },

  /* What one bucket is carrying, in talents. `rules/drive.js` writes it every
     substep; `view` draws the fill from it, so an empty bucket coming down
     past a full one going up is visible. */
  carrierLoad(c, talents) { c.load = talents; bump(); },
  band(seg, band)    { seg.band = band; bump(); },

  clear() { segments.length = 0; bump(); }
};

/* An anchor is the hub footprint's own centre, inside a footprint
   `placementCheck` already proved clear, so the sweep below starts and ends on
   a legal sample. `hi` is which end is up, and a tie resolves to 'a' by
   argument order, making the answer a function of the link order alone. */
const anchorOf = m => ({ x: m.box.x + m.box.w / 2, y: m.box.y + m.box.h / 2 });

function geometryOf(a, b) {
  const pa = anchorOf(a), pb = anchorOf(b);
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  const len = Math.hypot(dx, dy);
  const hi = pa.y <= pb.y ? 'a' : 'b';
  const seg = {
    a, b,
    ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y,
    len,
    /* 0 for a horizontal span, 1 for a vertical one. Both how much gravity
       gives back and how much weight costs, so `rules/drive.js`'s motion
       expression needs no horizontal special case. */
    slope: len > 0 ? Math.abs(dy) / len : 0,
    hi,
    u: 0, spin: 0, load: 0,
    carriers: [],
    band: null
  };
  seg.band = bandAt(...railPos(seg, 0));
  return seg;
}

/* Loop phase, wrapped into [0,1). */
export const wrap = u => ((u % 1) + 1) % 1;

/* Where along the rope a loop phase sits: 0 at the low anchor, 1 at the high
   one, and back down again over the second half of the turn. */
export const railT = phase => (phase < 0.5 ? phase * 2 : 2 - phase * 2);

/* Is this phase on the strand that rises when the loop runs forward? */
export const ascending = phase => phase < 0.5;

export const phaseOf = (seg, c) => wrap(seg.u + c.off);

/* World px at a rope parameter, as a two-element tuple shared with the
   `bandAt` call above. `t = 0` is the low end. */
function railPos(seg, t) {
  const lo = seg.hi === 'a' ? { x: seg.bx, y: seg.by } : { x: seg.ax, y: seg.ay };
  const hiP = seg.hi === 'a' ? { x: seg.ax, y: seg.ay } : { x: seg.bx, y: seg.by };
  return [lerp(lo.x, hiP.x, t), lerp(lo.y, hiP.y, t)];
}

/* Unit normal to the rope, lo -> hi turned a quarter. The loop's two strands
   sit `STRAND_GAP` apart along it, so an ascending bucket and a descending one
   at the same height are in different places rather than on top of each
   other. */
function normalOf(seg) {
  const lo = seg.hi === 'a' ? { x: seg.bx, y: seg.by } : { x: seg.ax, y: seg.ay };
  const hiP = seg.hi === 'a' ? { x: seg.ax, y: seg.ay } : { x: seg.bx, y: seg.by };
  const dx = hiP.x - lo.x, dy = hiP.y - lo.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/* Which side of the rope a phase rides on, in px across it. */
export function strandOffset(seg, phase) {
  const n = normalOf(seg);
  const k = (ascending(phase) ? -1 : 1) * STRAND_GAP / 2;
  return { x: n.x * k, y: n.y * k };
}

export function carrierPos(seg, c) {
  const phase = phaseOf(seg, c);
  const [x, y] = railPos(seg, railT(phase));
  const o = strandOffset(seg, phase);
  return { x: x + o.x, y: y + o.y };
}

/* The catch/stand box: centred on the carrier point, with `CARRIER_GRAB` of
   vertical slack each side so material resting a pixel high still counts as
   aboard. */
export function carrierBox(seg, c) {
  const { x, y } = carrierPos(seg, c);
  return rect(x - CARRIER_W / 2, y - CARRIER_H / 2 - CARRIER_GRAB,
              CARRIER_W, CARRIER_H + CARRIER_GRAB * 2);
}

/* The rope parameter nearest a world point, and its distance in px. `t` is
   clamped to the span, so a point past an anchor answers that anchor. */
export function nearestRailT(seg, x, y) {
  const lo = seg.hi === 'a' ? { x: seg.bx, y: seg.by } : { x: seg.ax, y: seg.ay };
  const hiP = seg.hi === 'a' ? { x: seg.ax, y: seg.ay } : { x: seg.bx, y: seg.by };
  const dx = hiP.x - lo.x, dy = hiP.y - lo.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0
    ? Math.max(0, Math.min(1, ((x - lo.x) * dx + (y - lo.y) * dy) / l2))
    : 0;
  return { t, d: Math.hypot(lo.x + dx * t - x, lo.y + dy * t - y) };
}

/* Every segment anchored to this machine. */
export const segmentsAt = m => segments.filter(s => s.a === m || s.b === m);

/* The segment joining this exact pair, in either direction, or null. */
export const linkedTo = (a, b) => segments.find(s =>
  (s.a === a && s.b === b) || (s.a === b && s.b === a)) || null;

/* Does this row carry a `hub` block at all? */
export const isHub = m => !!(m && defOf(m).hub);

/* The longest cable this hub may anchor, in px: `hub.reach` from
   `data/machines.js` bent by the `segReach` tunable, scoped to the machine
   id. */
export function reachOf(m) {
  const def = defOf(m);
  return def.hub ? def.hub.reach * eff('segReach', def.id) : 0;
}

/* Whether a cable may exist between two hubs, read by both the link action
   and the cable ghost. Refusals run structural before affordable, and every
   angle is legal. `at` is the first blocked sample in world px, or null, so
   the ghost can draw where the span is blocked. */
export function linkCheck(a, b) {
  const no = (why, at = null) => ({ ok: false, why, at });

  if (!isHub(a) || !isHub(b)) return no('NOT A HUB');
  if (linkedTo(a, b)) return no('ALREADY LINKED');

  const pa = anchorOf(a), pb = anchorOf(b);
  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);

  /* The smaller of the two hubs governs, so a long-reach tier cannot lend its
     reach to a short one. */
  if (len > Math.min(reachOf(a), reachOf(b))) return no('TOO FAR APART');

  const sweep = sweepSpan(pa, pb, len, [headframe(a), headframe(b)]);
  /* Both flags are collected over the whole sweep and reported in a fixed
     order, so a span that is both blocked and partly off-world reports the
     blockage. */
  if (sweep.blocked) return no('THE PATH IS BLOCKED', sweep.blocked);
  if (sweep.offWorld) return no('OUTSIDE THE WORLD', sweep.offWorld);

  return { ok: true, why: null, at: null };
}

/* A hub anchor is `box.x + w/2`, exactly on a tile boundary for an even
   footprint, where `Math.floor` would consistently pick one of the two tiles
   sharing the line and never sample the other, so both are checked. `EPS` is
   world px, below anything a real placement lands on. */
const EPS = 1e-6;
function solidNear(band, wx, wy, exempt) {
  const fx = (wx - band.origin.x) / band.tile, fy = (wy - band.origin.y) / band.tile;
  const xs = Math.abs(fx - Math.round(fx)) < EPS ? [Math.round(fx) - 1, Math.round(fx)] : [Math.floor(fx)];
  const ys = Math.abs(fy - Math.round(fy)) < EPS ? [Math.round(fy) - 1, Math.round(fy)] : [Math.floor(fy)];
  for (const tx of xs) for (const ty of ys) {
    if (inHeadframe(exempt, band, tx, ty)) continue;
    if (solidAt(band, tx, ty)) return true;
  }
  return false;
}

/* A hub's own footing tiles, exempt from blocking a cable leaving that hub:
   the anchor is the footprint's centre and `footing:1` requires a solid tile
   directly under it, so a straight vertical link between two legally placed
   hubs would otherwise be impossible. Stated as tiles, not a sample window. */
export function headframe(m) {
  const def = defOf(m);
  return {
    band: m.band,
    tx0: m.tx, tx1: m.tx + def.tw - 1,
    ty0: m.ty + Math.floor(def.th / 2), ty1: m.ty + def.th
  };
}

export const inHeadframe = (exempt, band, tx, ty) => exempt.some(e =>
  e.band === band && tx >= e.tx0 && tx <= e.tx1 && ty >= e.ty0 && ty <= e.ty1);

/* Samples the span every half tile, which cannot step over a one-tile
   obstruction at any angle; the step is sized by the smaller of the two
   endpoint bands' tiles. `bandAt` per sample is what makes a cross-band span
   work, and `exempt` comes from the caller, which knows the two machines. */
function sweepSpan(pa, pb, len, exempt = []) {
  const ba = bandAt(pa.x, pa.y), bb = bandAt(pb.x, pb.y);
  const tile = Math.min(ba?.tile ?? Infinity, bb?.tile ?? Infinity);
  const step = Number.isFinite(tile) ? tile * 0.5 : 4;
  const n = Math.max(1, Math.ceil(len / step));

  let blocked = null, offWorld = null;
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const x = lerp(pa.x, pb.x, f), y = lerp(pa.y, pb.y, f);
    const band = bandAt(x, y);
    if (!band) { offWorld = offWorld || { x, y }; continue; }
    if (solidNear(band, x, y, exempt))
      blocked = blocked || { x, y };
  }
  return { blocked, offWorld };
}

/* A maximal connected run of segments: a connected component of the graph
   whose nodes are hub machines and whose edges are segments. Derived, never
   stored. Returned in `segments` order within a component and first-appearance
   order between them, so the answer follows from the link order alone. */
export function chains() {
  const seen = new Set();
  const out = [];
  for (const start of segments) {
    if (seen.has(start)) continue;
    const group = [];
    const hubs = new Set();
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const seg = queue.shift();
      group.push(seg);
      hubs.add(seg.a);
      hubs.add(seg.b);
      for (const other of segments) {
        if (seen.has(other)) continue;
        if (!hubs.has(other.a) && !hubs.has(other.b)) continue;
        seen.add(other);
        queue.push(other);
      }
    }
    /* Restore `segments` order inside the component: the flood visits in
       adjacency order, which is not stable against an unrelated insertion. */
    group.sort((x, y) => segments.indexOf(x) - segments.indexOf(y));
    out.push(group);
  }
  return out;
}

/* Where a chain stops: every hub anchoring exactly one segment. A lone
   segment reports both its hubs. */
export function breaks() {
  const count = new Map();
  for (const seg of segments) {
    count.set(seg.a, (count.get(seg.a) || 0) + 1);
    count.set(seg.b, (count.get(seg.b) || 0) + 1);
  }
  const out = [];
  for (const [m, n] of count) if (n === 1) out.push(m);
  return out;
}

/* Whether both anchors' `hub.carries` lists include `what`. Both ends must
   agree: a cable is one object and the weaker end governs. */
export function carries(seg, what) {
  const a = defOf(seg.a).hub, b = defOf(seg.b).hub;
  return !!a && !!b && a.carries.includes(what) && b.carries.includes(what);
}

/* The deck line in world px: the top edge of the drawn carrier, so what looks
   standable and what `rules/player.js` stands a rider on are the same
   pixels. */
export const carrierTop = (seg, c) => carrierPos(seg, c).y - CARRIER_H / 2;

/* The segment whose carrier is under this box, or null: horizontal overlap
   plus the box's feet inside the carrier's grab band, which is three times a
   body's per-substep travel at `terminal`, so a fall cannot tunnel through. */
export function carrierUnder(band, box) {
  const feet = box.y + box.h;
  for (const seg of segments) {
    if (seg.band !== band) continue;
    for (const c of seg.carriers) {
      const cb = carrierBox(seg, c);
      if (box.x >= cb.x + cb.w || box.x + box.w <= cb.x) continue;
      if (feet < cb.y || feet > cb.y + cb.h) continue;
      return { seg, c };
    }
  }
  return null;
}

/* The segment the player is riding, or null, shared by `rules/player.js`,
   which treats a carrier top as ground, and `rules/drive.js`, which translates
   the rider and counts their mass. `vy < 0` makes it a one-way platform:
   rising is not riding, falling or at rest means the deck catches you. */
export function riddenCarrier() {
  if (!player.band || player.vy < 0) return null;
  const hit = carrierUnder(player.band, playerBox());
  return hit && carries(hit.seg, 'player') ? hit : null;
}
