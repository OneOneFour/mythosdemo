/* rules layer — the drivetrain and the buckets. Winches make power, gears and
   ropes carry it, transformers trade one half of it for the other, and the
   player may ride. Motion is per rope; a chain is a derived query nothing here
   reads.

   Power is torque times speed, and a transformer conserves it less its loss.
   A shaft has one angular speed and torque is the divisible budget, so a
   transformer multiplies torque and divides speed along the path past it.

   A rope is a loop, so what resists it is the NET load: each bucket costs
   `segBase` to lift and `segLoad * mass * slope` for what it holds, and a
   bucket on the descending strand gives both back.

   The motion law, per rope:
     w(c)    = segBase + segLoad * mass(c) * slope
     net     = sum of w over ascending buckets, minus the same descending
     tau     = torque reaching this rope's anchor, through the ratios on the
               path from every turning winch
     omega   = shaft speed there, the slowest any path delivers
     drive   = demand > 0 ? min(1, supply / demand) : 0
     push    = tau - net
     push >  segFric -> run forward  at segUp x min(1, (push - segFric)/segBase)
     push < -segFric -> run backward at segDown x min(1, (-push - segFric)/segBase) x slope
     otherwise       -> hold still

   Forward is the ascending strand rising. It is scaled by `drive * omega`
   only while a winch is turning: a loop running on its own counterweight is
   not being paced by a drivetrain.

   With one bucket and nothing opposite, `net` is exactly the old `need` and
   the whole expression reduces to what it was before the loop existed, less
   the `segFric` dead band that stops a balanced loop creeping.

   `supply` is the raw torque of every turning winch in the component and
   `demand` what its ropes actually ask of it, so `drive` asks whether the
   whole drivetrain is oversubscribed while `push` asks whether this rope in
   particular moves.

   Power reaches a node three ways: orthogonal footprint adjacency inside one
   band, a rope between two rows carrying `wheel`, and a belt to whatever its
   tile touches. The rope is why a component can span bands.

   Consumes no `rand()`: iteration is link order and placement order, and
   `m.turn` accumulates from `dt` alone. */

import { overlaps } from '../core/math.js';
import { push } from '../model/journal.js';
import { itemsIn, massOf, write as iw } from '../model/items.js';
import { defOf, machines, write as mw } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { PH, PW, player, playerBox, write as pw } from '../model/player.js';
import { burdenOf, run } from '../model/run.js';
import { ascending, carrierBox, carrierPos, carries, headframe, inHeadframe, linkedTo, phaseOf, riddenCarrier, segments, segmentsAt, write as segw } from '../model/segments.js';
import { solidAt } from '../model/tiles.js';
import { bandAt, tileX, tileY } from '../model/world.js';

/* Radians per second a fully-driven wheel turns at shaft speed 1, before
   `eff('spinRate')`. `m.turn` is read solely by `view/treatments.js` to pick a
   rotation phase. ~0.8 revolutions per second, a tooth every sixth of a second
   at `teeth:8`, which reads as turning without aliasing into a blur. */
const TURN_RATE = 5.0;
const TAU = Math.PI * 2;

export function step(dt, cmd) {
  const comps = partition();
  const turning = !!(cmd && cmd.action) && !run.dead && !!player.band;
  const box = turning ? playerBox() : null;

  /* Torque and speed at every node, from every winch the player is standing
     at. Complete before any rope is asked what it has. */
  for (const c of comps) solve(c, box);

  /* Per rope: what rides it, what that nets out to, and which component
     drives it. One pass, so `demand` is complete before any `drive` is
     computed — a rope must not move on a demand still being summed. */
  const ridden = riddenCarrier();
  const base = eff('segBase'), load = eff('segLoad'), cap = eff('bucketCap');
  const state = [];
  for (const seg of segments) {
    const cars = [];
    let net = 0;
    for (const c of seg.carriers) {
      const up = ascending(phaseOf(seg, c));
      const cargo = carries(seg, 'material') ? upTo(itemsIn(carrierBox(seg, c)), cap) : [];
      let mass = 0;
      for (const it of cargo) mass += massOf(it);
      const rider = !!ridden && ridden.seg === seg && ridden.c === c;
      if (rider) mass += eff('riderMass') + burdenOf();
      net += (up ? 1 : -1) * (base + load * mass * seg.slope);
      cars.push({ c, up, cargo, rider, mass });
    }

    /* Only a rope the drivetrain has to fight asks anything of it. A loop its
       own counterweight is already turning asks for nothing. */
    const asks = Math.max(0, net) + (seg.carriers.length ? eff('segFric') : 0);
    const ca = compOf.get(seg.a) || null;
    const cb = compOf.get(seg.b) || null;
    if (ca) ca.demand += asks;
    if (cb && cb !== ca) cb.demand += asks;
    state.push({ seg, net, cars, ca, cb });
  }

  /* Every belt tile costs its drivetrain the same torque whether anything
     rests on it, so a long run competes with a bucket for one winch. */
  const drag = eff('beltDrag');
  for (const c of comps)
    for (const m of c.nodes) if (defOf(m).belt) c.demand += drag;

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
      const w = c.omega.get(m) || 0;
      /* `rules/belts.js` runs before this one and reads the previous substep's
         answer, 1/120 s stale, so a belt keeps dragging into a catch box on
         the substep the item lands. */
      if (m.speed !== w) mw.speed(m, w);
      const rate = TURN_RATE * eff('spinRate', defOf(m).id) * w;
      if (c.spin > 0 && rate > 0) mw.turn(m, (m.turn + c.spin * rate * dt) % TAU);
    }
}

/* Torque and speed at each node, summed over every winch the player is
   turning. A BFS per source carries the cumulative ratio outward, multiplying
   torque and dividing speed. Speed takes the slowest path. */
function solve(c, box) {
  c.supply = 0; c.demand = 0; c.drive = 0; c.spin = 0; c.turning = false;
  c.tau = new Map(); c.omega = new Map();

  if (!box) return;

  for (const src of c.sources) {
    const def = defOf(src);
    /* `overlaps` with `drive.reach` is the same call `rules/machines.js`
       makes for hand feeding, so turning reach and feeding reach cannot
       disagree. */
    if (!overlaps(box, src.box, def.drive.reach)) continue;
    c.turning = true;

    const torque = def.drive.torque * eff('driveTorque', def.id);
    const speed  = def.drive.speed  * eff('driveSpeed',  def.id);
    c.supply += torque;

    const seen = new Map([[src, { r: 1, keep: 1 }]]);
    const queue = [src];
    while (queue.length) {
      const m = queue.shift();
      const st = seen.get(m);
      c.tau.set(m, (c.tau.get(m) || 0) + torque * st.r * st.keep);
      const w = speed / st.r;
      const had = c.omega.get(m);
      c.omega.set(m, had === undefined ? w : Math.min(had, w));

      for (const other of c.nodes) {
        if (seen.has(other) || !conducts(m, other)) continue;
        const d = defOf(other);
        let r = st.r, keep = st.keep;
        if (d.ratio) {
          const mul = Math.max(1e-6, d.ratio.mul * eff('gearRatio', d.id));
          r *= d.ratio.facing >= 0 ? mul : 1 / mul;
          keep *= Math.max(0, 1 - d.ratio.loss * eff('gearLoss', d.id));
        }
        seen.set(other, { r, keep });
        queue.push(other);
      }
    }
  }
}

/* Cargo up to a bucket's capacity, in the order the item index returns it.
   What does not fit is simply not carried, and stays where it was. */
function upTo(cargo, cap) {
  const out = [];
  let held = 0;
  for (const it of cargo) {
    const m = massOf(it);
    if (held + m > cap) continue;
    held += m;
    out.push(it);
  }
  return out;
}

/* One rope, one substep. */
function drive(s, dt) {
  const seg = s.seg;
  if (!seg.carriers.length || seg.len <= 0) return;

  /* A rope spanning two components is driven by whichever anchor has more
     torque, `seg.a`'s on a tie — its two ends can sit in different bands. The
     greater rather than the sum: two half-fed drivetrains do not add up to a
     free ride. */
  const ta = s.ca ? (s.ca.tau.get(seg.a) || 0) : 0;
  const tb = s.cb ? (s.cb.tau.get(seg.b) || 0) : 0;
  const useA = !s.cb || ta >= tb;
  const c = useA ? s.ca : s.cb;
  const tau = useA ? ta : tb;
  const omega = c ? (c.omega.get(useA ? seg.a : seg.b) || 0) : 0;
  const throttle = c ? c.drive : 0;

  const base = eff('segBase');
  const fric = eff('segFric');
  const force = tau - s.net;

  let v = 0;                            // px/s of rope, + is the up strand rising
  if (force > fric) {
    /* Paced by the drivetrain only while a winch is turning it. A loop its own
       counterweight is running is not waiting on a shaft. */
    const gate = tau > 0 ? throttle * omega : 1;
    v = eff('segUp') * Math.min(1, (force - fric) / base) * gate;
  } else if (force < -fric) {
    v = -eff('segDown') * Math.min(1, (-force - fric) / base) * seg.slope;
  }

  /* Said only when a winch is being turned and the loop is going the wrong
     way anyway. Keyed by the rope record, since more than one can be losing. */
  if (c && c.turning && v < 0 && refusalDue(seg))
    sayAtLowest(seg, 'TOO HEAVY TO LIFT');

  /* The loop is two strands, so one turn is twice the span. */
  const before = s.cars.map(car => carrierPos(seg, car.c));
  const wasUp = s.cars.map(car => car.up);
  segw.spin(seg, (v * dt) / (2 * seg.len), Math.sign(v));

  let load = 0;
  for (let i = 0; i < s.cars.length; i++) {
    const car = s.cars[i];
    const after = carrierPos(seg, car.c);
    const dx = after.x - before[i].x, dy = after.y - before[i].y;

    const aboard = haul(seg, car.cargo, dx, dy);
    if (car.rider) ride(seg, dx, dy);
    if (car.c.load !== car.mass) segw.carrierLoad(car.c, car.mass);
    load += car.mass;

    /* Over the top: the strand it is on has flipped, so it is now coming back
       down and whatever it held is left at the high anchor. */
    if (!aboard.length || wasUp[i] === ascending(phaseOf(seg, car.c))) continue;
    if (!wasUp[i]) continue;                  // rounded the bottom, not the top
    for (const it of aboard) it.rest = 0;
    push('winch', { x: after.x, y: after.y },
         { to: (bandAt(after.x, after.y) || player.band)?.id, units: aboard.length });

    /* A haul arriving at a hub that is neither a receiver (`tribute` or
       `ports`) nor anchors another segment is stranded rather than delivered,
       which the 'winch' row above cannot distinguish. */
    const topHub = seg.hi === 'a' ? seg.a : seg.b;
    const topDef = defOf(topHub);
    if (!topDef.tribute && !topDef.ports && segmentsAt(topHub).every(other => other === seg))
      push('refused', { x: after.x, y: after.y },
           { why: 'THE CHAIN ENDS HERE -- NOTHING WAITS TO CARRY IT ON' });
  }

  const mid = carrierPos(seg, seg.carriers[0]);
  const band = bandAt(mid.x, mid.y);
  if (band && band !== seg.band) segw.band(seg, band);
  segw.load(seg, load);
}

/* A refusal positioned at whichever bucket hangs lowest, so the message
   appears where the player is standing rather than at an arbitrary one. */
function sayAtLowest(seg, why) {
  let low = seg.carriers[0];
  for (const c of seg.carriers)
    if (carrierPos(seg, c).y > carrierPos(seg, low).y) low = c;
  push('refused', carrierPos(seg, low), { why });
}

/* Items are world-positioned, so a haul at any angle is two additions each. A
   band handoff is a respawn at the same world pixel, done the moment the
   carrier's band changes rather than on arrival, because `it.band` is which
   band's tiles the item collides against. */
function haul(seg, cargo, dx, dy) {
  const dest = seg.band;
  const out = [];
  let rehomed = false;

  for (const it of cargo) {
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
function ride(seg, dx, dy) {
  if (!dx && !dy) return;
  const b = player.band;
  const nx = player.x + dx, ny = player.y + dy;
  /* A translation is not a move, so it asks the tile grid directly: pushing an
     unresolved position across a tile boundary is the one way this file could
     put the player inside rock. Refused rather than resolved. */
  /* This segment's own two headframes are exempt, so the rider passes exactly
     the tiles the cable does; `footing:1` otherwise puts a solid tile inside
     the box of anyone approaching the top, stopping a rider 34 px short. */
  const exempt = [headframe(seg.a), headframe(seg.b)];
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

/* Drivetrain nodes are placed machines whose row carries `drive`, `hub`,
   `ratio` or `belt`. Power conducts three ways: orthogonal footprint adjacency
   inside one band, a rope between two anchors, and a belt to whatever it
   touches including at a corner. */
export const conducts = (a, b) =>
  adjacent(a, b) || beltAdjacent(a, b) || !!linkedTo(a, b);

/* A belt steps up a row at a time, so a stepped run touches only at its
   corners. Chebyshev adjacency over the two footprints, and only where a belt
   is one of them. */
function beltAdjacent(a, b) {
  if (a.band !== b.band) return false;
  const A = defOf(a), B = defOf(b);
  if (!A.belt && !B.belt) return false;
  const gapX = Math.max(0, a.tx - (b.tx + B.tw - 1), b.tx - (a.tx + A.tw - 1));
  const gapY = Math.max(0, a.ty - (b.ty + B.th - 1), b.ty - (a.ty + A.th - 1));
  return gapX <= 1 && gapY <= 1;
}

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

/* Which component each node belongs to, rebuilt with the partition and read
   by `step` while summing demand. */
const compOf = new Map();

/* One partition for the world, not one per band: a rope conducts power across
   a seam. Keyed on node identity, because a rig rebuilt at the same tiles
   after `newRun()` hashes the same and holds different records. Topology
   only; every number is still read through `eff()` per frame. */
let cached = { nodes: [], links: 0, sig: null, comps: [] };

function partition() {
  const nodes = [];
  for (const m of machines) {
    const def = defOf(m);
    if (def.drive || def.hub || def.ratio || def.belt) nodes.push(m);
  }
  const sig = linkSignature(nodes);
  if (!sameNodes(cached.nodes, nodes) || cached.sig !== sig)
    cached = { nodes, sig, comps: componentsOf(nodes) };

  compOf.clear();
  for (const c of cached.comps) for (const m of c.nodes) compOf.set(m, c);
  return cached.comps;
}

const sameNodes = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]);

/* Rolling hash of the ropes between the nodes, so linking or cutting one
   repartitions even though the node set is untouched. */
function linkSignature(nodes) {
  let sig = segments.length;
  for (const seg of segments)
    sig = (sig * 131 + nodes.indexOf(seg.a) * 17 + nodes.indexOf(seg.b) * 5) | 0;
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
        if (seen.has(other) || !conducts(m, other)) continue;
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
      sources: group.filter(m => defOf(m).drive),
      supply: 0, demand: 0, drive: 0, spin: 0, turning: false,
      tau: new Map(), omega: new Map()
    });
  }
  return comps;
}
