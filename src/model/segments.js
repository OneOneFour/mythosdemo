/* LAYER model — SEGMENTS: the cables between hubs, and the one decision about
   whether a cable may exist. Imports `core`, `data`, `model`.

   A SEGMENT IS NOT A MACHINE, AND MUST NOT BECOME ONE. No footprint, no
   buffer, no recipe, and it is created by an ACTION BETWEEN two hub machines
   rather than placed -- which is why it lives here rather than in
   `model/machines.js`, a frozen table of rows a player places.

   ONE SEGMENT JOINS EXACTLY TWO HUBS AND CARRIES EXACTLY ONE CARRIER. Nothing
   here describes a route longer than one segment; a route is `chains()`, a
   DERIVED query, never a record. Reaching further means another hub and
   another segment, so no object here could grow into a world-spanning
   elevator.

   `a` and `b` are the machine RECORDS, never ids or indices. Machines never
   move, so a record is stable while it exists, and holding it makes
   `write.unlinkAll(m)` a one-line identity test rather than a search.

   MOTION IS `rules/drive.js`'S, NOT THIS FILE'S. Everything here is storage
   and questions. A carrier PARKS at `t = 0` because that is where a fresh
   link puts it, not because anything here holds it there. */

import { lerp, rect } from '../core/math.js';
import { bump } from './epoch.js';
import { defOf } from './machines.js';
import { eff } from './mods.js';
import { player, playerBox } from './player.js';
import { solidAt } from './tiles.js';
import { bandAt } from './world.js';

export const segments = [];

/* Vertical slack, in px, within which something counts as ON the carrier
   rather than merely near it. The same number and the same idea as
   the retired staged winch's own `DECK_GRAB`, kept HERE because the BOX is a
   model query (`view` draws it and `rules/drive.js` reads it) while the deck's
   was private to a rules module. */
const CARRIER_GRAB = 3;

/* How wide a carrier is, in px. Not a tunable: this is the size of a drawn
   object, the same class of number as `model/player.js`'s own PW/PH, and no
   god's trinket should widen a bucket. */
export const CARRIER_W = 10;
export const CARRIER_H = 4;

export const write = {
  /* Create the segment. THE CALLER IS TRUSTED TO HAVE ALREADY CALLED
     `linkCheck` -- same contract `model/run.js#write.equip` states for
     itself. `rules/placement.js#linkSegment` is the one caller that turns a
     refusal into a journal row; this is the mutation half only. */
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

  /* Every segment anchored to this machine, gone. Called after a hub is
     deconstructed, so a removed hub can never leave a dangling segment
     pointing at a record nothing else holds. Returns how many were cut, so
     the caller can decide whether to say anything about it. */
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

  carrier(seg, t, dir) {
    seg.t = t < 0 ? 0 : t > 1 ? 1 : t;
    seg.dir = dir;
    bump();
  },

  load(seg, talents) { seg.load = talents; bump(); },
  band(seg, band)    { seg.band = band; bump(); },

  clear() { segments.length = 0; bump(); }
};

/* geometry
   An anchor is the hub footprint's own CENTRE. Symmetric by construction, so
   the record does not depend on which end the player armed first, and inside
   a footprint `placementCheck` already proved was clear of tiles -- which is
   what lets the half-tile sweep below start and end on a legal sample rather
   than needing an end-cap special case.

   `hi` is which end is UP. Ties resolve to 'a', DETERMINISTICALLY: a horizontal segment has no upper end and something still has to be
   called one, and picking by argument order rather than by, say, x makes the
   answer a function of the link order alone. */
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
    /* 0 for a horizontal span, 1 for a vertical one. The shallower a segment
       runs the less gravity gives back AND the less weight costs -- one
       number, both halves, which is why `rules/drive.js`'s motion expression
       needs no horizontal special case. */
    slope: len > 0 ? Math.abs(dy) / len : 0,
    hi,
    t: 0, dir: 0, load: 0,
    band: null
  };
  seg.band = bandAt(...posOf(seg));
  return seg;
}

/* World px of the carrier, as a two-element tuple so `carrierPos` and the
   `bandAt` call above can share one implementation. `t = 0` is the LOW end. */
function posOf(seg) {
  const lo = seg.hi === 'a' ? { x: seg.bx, y: seg.by } : { x: seg.ax, y: seg.ay };
  const hiP = seg.hi === 'a' ? { x: seg.ax, y: seg.ay } : { x: seg.bx, y: seg.by };
  return [lerp(lo.x, hiP.x, seg.t), lerp(lo.y, hiP.y, seg.t)];
}

/* queries. Numbers and questions; no decisions. */

export function carrierPos(seg) {
  const [x, y] = posOf(seg);
  return { x, y };
}

/* The catch/stand box, the retired winch's own `deckBox` idiom sized by the
   carrier's own width instead of a footprint's. Centred on the carrier point,
   with `CARRIER_GRAB` of vertical slack on each side so material resting a
   pixel high still counts as aboard. */
export function carrierBox(seg) {
  const { x, y } = carrierPos(seg);
  return rect(x - CARRIER_W / 2, y - CARRIER_H / 2 - CARRIER_GRAB,
              CARRIER_W, CARRIER_H + CARRIER_GRAB * 2);
}

/* Every segment anchored to this machine. */
export const segmentsAt = m => segments.filter(s => s.a === m || s.b === m);

/* The segment joining this exact pair, in either direction, or null. */
export const linkedTo = (a, b) => segments.find(s =>
  (s.a === a && s.b === b) || (s.a === b && s.b === a)) || null;

/* Does this row carry a `hub` block at all? */
export const isHub = m => !!(m && defOf(m).hub);

/* The longest cable this hub may anchor, in px. `hub.reach` is content and
   `segReach` is the tunable that bends it, scoped to the machine id -- so a
   longer-reach hub tier is a `variantOf` row and a range boon is one row in
   `data/tuning.js`, neither of which touches this line. */
export function reachOf(m) {
  const def = defOf(m);
  return def.hub ? def.hub.reach * eff('segReach', def.id) : 0;
}

/* ONE DECISION, TWO READERS: `linkSegment` turns a `false` into a journal row
   plus the mutation, and the cable ghost turns the same `false` into a tinted
   cable with `why` beside it. `view` may not import `rules`, so the decision
   lives here.

   Refusals run STRUCTURAL BEFORE AFFORDABLE. There is deliberately no 'TOO
   STEEP TO STAND': every angle is legal. `at` is the first blocked sample in
   world px, or null, because the ghost draws WHERE the span is blocked and
   only the sweep knows. */
export function linkCheck(a, b) {
  const no = (why, at = null) => ({ ok: false, why, at });

  if (!isHub(a) || !isHub(b)) return no('NOT A HUB');
  if (linkedTo(a, b)) return no('ALREADY LINKED');

  const pa = anchorOf(a), pb = anchorOf(b);
  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);

  /* THE SMALLER OF THE TWO HUBS GOVERNS, so a long-reach tier can never lend
     its reach to a short one -- reaching further is another hub, not a better
     one at one end. */
  if (len > Math.min(reachOf(a), reachOf(b))) return no('TOO FAR APART');

  const sweep = sweepSpan(pa, pb, len, [headframe(a), headframe(b)]);
  /* Both flags are collected over the WHOLE sweep and then reported in the
     locked order, so a span that is both blocked and partly off-world reports
     the blockage. The order is the ANSWER, not the iteration -- a sample can
     only be tested for solidity once its band is known, so the loop has to
     resolve the band first whatever the reporting order is. */
  if (sweep.blocked) return no('THE PATH IS BLOCKED', sweep.blocked);
  if (sweep.offWorld) return no('OUTSIDE THE WORLD', sweep.offWorld);

  return { ok: true, why: null, at: null };
}

/* A hub's anchor is `box.x + w/2`, exactly on a tile-column boundary for any
   EVEN footing -- which every hub today is. So a straight link between two
   same-footing hubs samples its whole length astride a grid line, and
   `Math.floor()` picks one of the two tiles sharing it CONSISTENTLY, which
   means the other is never sampled at all. Confirmed live: a solid tile in
   the unpicked column was invisible to every sample.

   Both tiles sharing an exact boundary are equally "on" the drawn line, so
   both are checked. `EPS` is world px, far below anything a real placement
   could land on, so this only fires for a boundary-exact sample. */
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

/* THE HEADFRAME EXEMPTION: A HUB'S OWN FOOTING TILE DOES NOT BLOCK A CABLE
   LEAVING THAT HUB. Without it a straight vertical link between two LEGALLY
   PLACED hubs is impossible, since the anchor is the footprint's centre and
   `footing:1` requires a solid tile directly under that footprint.

   SOUND BECAUSE OF THREE FACTS: the footprint is required CLEAR, the footing
   tile is required PRESENT, and the drawn cable LEAVES the headframe. Stated
   as TILES rather than a sample window, so "exactly two per endpoint" is the
   code rather than a consequence of it. */
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

/* THE HALF-TILE SWEEP, not a Bresenham: no substep longer than half a tile in
   either axis, the same rule `rules/items.js` states, because a sample every
   half tile cannot step over a one-tile obstruction at any angle.

   `bandAt` PER SAMPLE is what makes a cross-band span work at all. The step is
   sized by the SMALLER of the two endpoint bands' tiles, so a future finer
   grid cannot be sampled too coarsely. `exempt` is handed in by the caller,
   because only it knows which two machines the span joins. */
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

/* A chain is DERIVED, NEVER STORED: a maximal connected run of segments, i.e.
   a connected component of the graph whose NODES are hub machines and whose
   EDGES are segments. Returned in `segments` order within each component and
   first-appearance order between them, so the answer is reproducible from the
   link order alone.

   Union-find is the textbook answer and is not worth it: there are tens of
   segments, so a flood per component is O(n^2) on a double-digit number. */
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

/* WHERE A CHAIN STOPS: every hub that anchors exactly ONE segment. A gap in a
   chain is the space between two of these, which is what the
   overview draws -- and WHICH
   pair of open ends constitutes a gap worth highlighting is the overview's
   own DECISION, not this file's number. `model` owns the question; this is the
   question. A lone segment reports both its hubs. */
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

/* WHAT A CARRIER MAY BEAR, off `hub.carries` on BOTH anchors' rows. DATA, not
   code: a material-only hub tier is a `variantOf` row with a shorter list and
   needs no engine edit. BOTH ends must agree -- a cable is one object and the
   weaker end governs, the same rule 'TOO FAR APART' applies to reach. */
export function carries(seg, what) {
  const a = defOf(seg.a).hub, b = defOf(seg.b).hub;
  return !!a && !!b && a.carries.includes(what) && b.carries.includes(what);
}

/* The DECK LINE in world px: the top edge of the drawn carrier, which is what
   `view/paint.js#paintCarriers` draws its bright plank on. The one number
   `rules/player.js` needs to stand a rider flush, so what LOOKS standable and
   what IS standable are the same pixels rather than two guesses. */
export const carrierTop = seg => carrierPos(seg).y - CARRIER_H / 2;

/* The segment whose carrier is under this box in this band, or null -- the
   one query `rules/player.js` needs for the ride branch. A CARRIER IS NOT
   TERRAIN, so this is how it holds the player up: a model query, not a second
   collision model.

   "UNDER" IS THE OPERATIVE WORD. A bare `overlaps` would also be true of a
   player on rock with a parked bucket at head height. So: horizontal overlap
   AND the box's FEET inside the carrier's vertical grab band, which is three
   times the furthest a body at `terminal` travels in one substep, so a fall
   cannot tunnel through it. */
export function carrierUnder(band, box) {
  const feet = box.y + box.h;
  for (const seg of segments) {
    if (seg.band !== band) continue;
    const cb = carrierBox(seg);
    if (box.x >= cb.x + cb.w || box.x + box.w <= cb.x) continue;
    if (feet < cb.y || feet > cb.y + cb.h) continue;
    return seg;
  }
  return null;
}

/* IS THE PLAYER RIDING, AND WHAT. ONE PREDICATE, TWO RULES MODULES:
   `rules/player.js` treats a carrier top as ground and `rules/drive.js`
   translates the rider and counts their mass. Siblings may not import each
   other, so a shared predicate has to live in `model` -- and it must be
   shared, or two copies would disagree about a frame and either float the
   player or drop them.

   `vy < 0` IS A ONE-WAY PLATFORM: rising means not riding, falling or at rest
   means the deck catches you. */
export function riddenSegment() {
  if (!player.band || player.vy < 0) return null;
  const seg = carrierUnder(player.band, playerBox());
  return seg && carries(seg, 'player') ? seg : null;
}
