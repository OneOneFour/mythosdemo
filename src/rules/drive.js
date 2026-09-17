/* rules layer — the drivetrain and the carriers. Cranks make torque, gears
   carry it, segments move, and the player may ride one. Motion is per segment;
   a chain is a derived query nothing here reads. The only power source is a
   crank the player is standing at and holding down.

   The motion law:
     need    = segBase + segLoad * mass * slope
     supply  = the component's torque, gear loss per hop
     demand  = the component's total `need`
     drive   = demand > 0 ? min(1, supply / demand) : 0
     surplus = supply - need
     surplus > 0 -> ascend at segUp * min(1, surplus/segBase) * drive
     surplus = 0 -> hold still
     surplus < 0 -> descend at segDown * min(1, -surplus/segBase) * slope

   `surplus` is over the whole component supply, unapportioned, and decides the
   direction; `drive` decides how much capacity an ascending segment gets.
   Apportioning `supply` per segment would make `surplus`'s sign uniform across
   a component, so two segments sharing one crank would stop rather than halve.

   At zero supply `surplus` is `-need`, at least `segBase`, so an unpowered
   vertical segment descends at full `segDown`; a horizontal one multiplies
   that by `slope = 0` and sits still, with no horizontal special case.

   Consumes no `rand()`: iteration is link order and placement order, and
   `m.turn` accumulates from `dt` alone. */

import { clamp, overlaps } from '../core/math.js';
import { push } from '../model/journal.js';
import { itemsIn, massOf, write as iw } from '../model/items.js';
import { defOf, machines, write as mw } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { PH, PW, player, playerBox, write as pw } from '../model/player.js';
import { burdenOf, run } from '../model/run.js';
import { carrierBox, carrierPos, carries, headframe, inHeadframe, riddenSegment, segments, segmentsAt, write as segw } from '../model/segments.js';
import { solidAt } from '../model/tiles.js';
import { bandAt, bands, tileX, tileY } from '../model/world.js';

/* Radians per second a fully-driven wheel turns. Presentation only: `m.turn`
   is read solely by `view/treatments.js` to pick a rotation phase. ~0.8
   revolutions per second, a tooth every sixth of a second at `teeth:8`, which
   reads as turning without aliasing into a blur. */
const TURN_RATE = 5.0;
const TAU = Math.PI * 2;

export function step(dt, cmd) {
  /* The component records are reused across frames, so the per-frame scratch
     is zeroed on the way past rather than assumed fresh. */
  const comps = [];
  const compOf = new Map();
  for (const b of bands)
    for (const c of partitionFor(b).comps) {
      c.supply = 0; c.demand = 0; c.drive = 0; c.spin = 0; c.turning = false;
      comps.push(c);
      for (const m of c.nodes) compOf.set(m, c);
    }

  supplyOf(comps, cmd);

  /* Per segment: what is aboard, what it therefore needs, and which component
     drives it. One pass, so `demand` is complete before any `drive` is
     computed — a segment must not move on a demand still being summed. */
  const state = [];
  for (const seg of segments) {
    const cargo = carries(seg, 'material') ? itemsIn(carrierBox(seg)) : [];
    const rider = carries(seg, 'player') && riddenSegment() === seg;
    let mass = 0;
    for (const it of cargo) mass += massOf(it);
    if (rider) mass += eff('riderMass') + burdenOf();

    const need = eff('segBase') + eff('segLoad') * mass * seg.slope;
    const ca = compOf.get(seg.a) || null;
    const cb = compOf.get(seg.b) || null;
    if (ca) ca.demand += need;
    if (cb && cb !== ca) cb.demand += need;
    state.push({ seg, need, mass, cargo, rider, ca, cb });
  }

  for (const c of comps) {
    c.drive = c.demand > 0 ? Math.min(1, c.supply / c.demand) : 0;
    /* `drive` is the drive actually delivered, zero when there is no demand to
       deliver it to; `spin` is only how fast the wheels go round, so a
       drivetrain with nothing to lift is not drawn stopped. */
    c.spin = c.demand > 0 ? c.drive : (c.supply > 0 ? 1 : 0);
  }

  for (const s of state) drive(s, dt);

  /* Written last, so `view` draws this substep's answer. Only drivetrain nodes
     are written, so every other machine's `torque`/`turn` stays 0. Guarded on
     a change because `mw.torque` bumps the epoch. */
  for (const c of comps)
    for (const m of c.nodes) {
      if (m.torque !== c.drive) mw.torque(m, c.drive);
      if (c.spin > 0) mw.turn(m, (m.turn + c.spin * TURN_RATE * dt) % TAU);
    }
}

/* `cmd.action` is a hold rather than an edge, in the shape `cmd.craft` has.
   `overlaps` with `def.crank.reach` is the same call
   `rules/machines.js#handFeed` makes, so turning reach and feeding reach
   cannot disagree. Every crank within reach turns, each on its own torque. */
function supplyOf(comps, cmd) {
  const turning = !!(cmd && cmd.action) && !run.dead && !!player.band;
  if (!turning) return;
  const box = playerBox();

  for (const c of comps)
    for (const cr of c.cranks) {
      const def = defOf(cr.m);
      if (cr.path === null) continue;          // no hub in this component to feed
      if (!overlaps(box, cr.m.box, def.crank.reach)) continue;
      c.turning = true;
      /* Gear loss per hop along the cached path to the nearest hub.
         `torqueLoss` is read here rather than baked into the path, so only the
         graph is cached. A node with no `gear` block conducts without loss. */
      let retain = 1;
      for (const nd of cr.path) {
        const g = defOf(nd).gear;
        if (g) retain *= Math.max(0, 1 - g.loss * eff('torqueLoss', defOf(nd).id));
      }
      c.supply += def.crank.torque * eff('crankTorque', def.id) * retain;
    }
}

/* One segment, one substep. */
function drive(s, dt) {
  const seg = s.seg;

  /* A cross-component segment is driven by whichever component supplies more
     torque, `seg.a`'s on a tie — its two hubs can sit in different bands and
     so in different components. The greater rather than the sum: two half-fed
     drivetrains do not add up to a free ride. */
  const c = pick(s.ca, s.cb);
  const supply = c ? c.supply : 0;
  const throttle = c ? c.drive : 0;

  const base = eff('segBase');
  const surplus = supply - s.need;
  let v = 0;                                    // px/s along the cable, + is up
  if (surplus > 0) v = eff('segUp') * Math.min(1, surplus / base) * throttle;
  else if (surplus < 0) v = -eff('segDown') * Math.min(1, -surplus / base) * seg.slope;

  /* Said only when a crank is being turned and the carrier is going down
     anyway. Keyed by the segment record, since more than one can be losing. */
  if (c && c.turning && v < 0 && refusalDue(seg))
    push('refused', carrierPos(seg), { why: 'TOO HEAVY TO LIFT' });

  const before = carrierPos(seg);
  const t0 = seg.t;
  const nt = clamp(t0 + (seg.len > 0 ? (v * dt) / seg.len : 0), 0, 1);
  /* `dir` is for `view` only, in world-y terms: -1 rising, +1 sinking. */
  const dir = nt > t0 ? -1 : nt < t0 ? 1 : 0;
  const arrived = nt >= 1 && t0 < 1;
  segw.carrier(seg, nt, dir);

  const after = carrierPos(seg);
  const dx = after.x - before.x, dy = after.y - before.y;

  const band = bandAt(after.x, after.y);
  if (band && band !== seg.band) segw.band(seg, band);

  const aboard = haul(s, dx, dy);
  ride(s, dx, dy);
  segw.load(seg, s.mass);

  /* Arrived at the top: the haul is released with `it.rest = 0` so it falls
     the last pixel onto whatever the upper hub stands on. Only the high end is
     an arrival — the low end is where a carrier lives. */
  if (!arrived || !aboard.length) return;
  for (const it of aboard) it.rest = 0;
  push('winch', { x: after.x, y: after.y },
       { to: (seg.band || player.band)?.id, units: aboard.length });

  /* A haul arriving at a hub that is neither a receiver (`tribute` or `ports`)
     nor anchors another segment is stranded rather than delivered, which the
     'winch' row above cannot distinguish. Fires once, on the same
     edge-triggered `arrived` this block is already gated on. */
  const topHub = seg.hi === 'a' ? seg.a : seg.b;
  const topDef = defOf(topHub);
  if (!topDef.tribute && !topDef.ports && segmentsAt(topHub).every(other => other === seg))
    push('refused', { x: after.x, y: after.y }, { why: 'THE CHAIN ENDS HERE -- NOTHING WAITS TO CARRY IT ON' });
}

const pick = (a, b) => (!a ? b : !b ? a : (b.supply > a.supply ? b : a));

/* Items are world-positioned, so a haul at any angle is two additions each. A
   band handoff is a respawn at the same world pixel, done the moment the
   carrier's band changes rather than on arrival, because `it.band` is which
   band's tiles the item collides against. */
function haul(s, dx, dy) {
  const dest = s.seg.band;
  const out = [];
  let rehomed = false;

  for (const it of s.cargo) {
    it.x += dx;
    it.y += dy;
    it.vy = 0;
    it.rest = 1;
    if (dest && it.band !== dest) {
      const moved = iw.spawn(dest, it.x, it.y, it.sub, it.form, 0, 0);
      iw.remove(it);
      rehomed = true;
      if (moved) { moved.rest = 1; out.push(moved); }
      continue;
    }
    out.push(it);
  }

  /* Re-index only when the item set changed: a respawn appends a record the
     index `rules/items.js` rebuilt earlier this substep has never seen. A pure
     translation needs none — the whole grid is rebuilt next substep. */
  if (rehomed) iw.reindex();
  return out;
}

/* Translated after `rules/player.js` has resolved collision this substep. The
   ride decision is `model/segments.js#riddenSegment`, one query both modules
   call, since siblings may not import each other. Nothing here writes to any
   band's `mat`. */
function ride(s, dx, dy) {
  if (!s.rider || (!dx && !dy)) return;
  const b = player.band;
  const nx = player.x + dx, ny = player.y + dy;
  /* A translation is not a move, so it asks the tile grid directly: pushing an
     unresolved position across a tile boundary is the one way this file could
     put the player inside rock. Refused rather than resolved. */
  /* This segment's own two headframes are exempt, so the rider passes exactly
     the tiles the cable does; `footing:1` otherwise puts a solid tile inside
     the box of anyone approaching the top, stopping a rider 34 px short. */
  const exempt = [headframe(s.seg.a), headframe(s.seg.b)];
  if (b && boxSolid(b, nx, ny, exempt)) return;
  pw.move(nx, ny);
}

function boxSolid(b, x, y, exempt) {
  const t0 = tileX(b, x), t1 = tileX(b, x + PW - 1);
  const r0 = tileY(b, y), r1 = tileY(b, y + PH - 1);
  for (let ty = r0; ty <= r1; ty++)
    for (let tx = t0; tx <= t1; tx++) {
      if (inHeadframe(exempt, b, tx, ty)) continue;
      if (solidAt(b, tx, ty)) return true;
    }
  return false;
}

/* A `WeakMap` rather than one scalar, because more than one segment can stall
   under load at once, and keyed by the record so a cut segment needs no
   explicit cleanup. */
const REFUSAL_GAP = 1.0;
const refusedAt = new WeakMap();
function refusalDue(seg) {
  const last = refusedAt.get(seg);
  if (last !== undefined && run.t - last < REFUSAL_GAP) return false;
  refusedAt.set(seg, run.t);
  return true;
}

/* Drivetrain nodes are placed machines whose row carries `crank`, `gear` or
   `hub`; edges are orthogonal footprint adjacency within one band, two
   footprints sharing an edge. Diagonals do not conduct — a corner needs a gear
   in it. */
function adjacent(a, b) {
  if (a.band !== b.band) return false;
  const A = defOf(a), B = defOf(b);
  const ax1 = a.tx + A.tw, ay1 = a.ty + A.th;
  const bx1 = b.tx + B.tw, by1 = b.ty + B.th;
  const overX = a.tx < bx1 && b.tx < ax1;
  const overY = a.ty < by1 && b.ty < ay1;
  return (overX && (ay1 === b.ty || by1 === a.ty))
      || (overY && (ax1 === b.tx || bx1 === a.tx));
}

/* Keyed by the band object rather than `b.ord` and invalidated by a signature
   recomputed every frame, so a stale entry cannot be read back into a live run
   and there is no reset call to forget. */
/* Topology only: every number is still read through `eff()` per frame, and a
   crank's activity is not cached at all. Node counts are in the tens, so the
   flood is O(n^2) and the path search a plain BFS. */
const bandState = new WeakMap();

function partitionFor(b) {
  const nodes = [];
  for (const m of machines) {
    if (m.band !== b) continue;
    const def = defOf(m);
    if (def.crank || def.gear || def.hub) nodes.push(m);
  }
  const sig = signatureOf(nodes);
  const prev = bandState.get(b);
  if (prev && prev.sig === sig) return prev.part;
  const part = componentsOf(nodes);
  bandState.set(b, { sig, part });
  return part;
}

/* Rolling hash of the node set: count, position and definition all fold in,
   so placing, removing or moving one is caught. */
function signatureOf(nodes) {
  let sig = nodes.length;
  for (const m of nodes) sig = (sig * 131 + m.tx * 977 + m.ty * 37 + m.def) | 0;
  return sig;
}

function componentsOf(nodes) {
  const seen = new Set();
  const comps = [];
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const group = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const m = queue.shift();
      group.push(m);
      for (const other of nodes) {
        if (seen.has(other) || !adjacent(m, other)) continue;
        seen.add(other);
        queue.push(other);
      }
    }
    /* Restore `machines` order inside the component: the flood visits in
       adjacency order, which is not stable against an unrelated placement. */
    group.sort((x, y) => machines.indexOf(x) - machines.indexOf(y));
    comps.push({
      nodes: group,
      hubs: group.filter(m => defOf(m).hub),
      cranks: group.filter(m => defOf(m).crank).map(m => ({ m, path: pathToHub(m, group) })),
      supply: 0, demand: 0, drive: 0, spin: 0, turning: false
    });
  }
  return { comps };
}

/* The nodes strictly between this crank and the nearest hub, or null when the
   component holds no hub. BFS visiting neighbours in `nodes` order, so
   "nearest" is fewest nodes and deterministic; a crank against a hub returns
   an empty path and loses nothing. */
function pathToHub(from, nodes) {
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const m = queue.shift();
    if (m !== from && defOf(m).hub) {
      const out = [];
      for (let p = prev.get(m); p && p !== from; p = prev.get(p)) out.push(p);
      return out.reverse();
    }
    for (const other of nodes) {
      if (prev.has(other) || !adjacent(m, other)) continue;
      prev.set(other, m);
      queue.push(other);
    }
  }
  return null;
}
