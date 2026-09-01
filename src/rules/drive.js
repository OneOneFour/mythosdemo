/* LAYER rules — THE DRIVETRAIN AND THE CARRIERS. Cranks make torque, gears
   carry it, segments move, and the player may ride one.
   Imports `core`, `data`, `model`. Imports no other `rules` module.

   REPLACES THE STAGED WINCH, which was deleted -- module, machine row,
   substance, recipe, grant, tunables and placement branch -- in the same commit
   this file started moving anything. Read CLAUDE.md invariant 4 (as reworded),
   D4 (as amended), D10, and docs/SPEC.md section 17 before changing anything
   here.

   INVARIANT 4: A CARRIER RISES ONLY WHILE SOMETHING IS ACTIVELY TURNING IT AND
   SLIDES BACK DOWN UNDER ITS OWN WEIGHT FOR NOTHING. There is no object in this
   file that could grow into a world-spanning elevator: motion is per SEGMENT,
   a segment joins exactly two hubs, and a chain is a derived query
   (`model/segments.js#chains`) that nothing here reads.

   MANUAL ONLY (D10, and docs/PLAN-gears-and-winches.md A5, explicitly
   REJECTED by the user). The only power source in the game is a crank the
   player is standing at and holding down. There is no heart-powered fallback,
   no banked charge and no passive source of any kind: the cost of raising
   anything is the player's own attention, and `active()` below is the whole of
   it. A generator, when it exists, is one more predicate in that function and
   changes nothing else in this file (docs/PLAN section 8).

   LOAD IS PHYSICAL, NOT A PERMISSION (D4 as amended). Boarding is never
   refused at any weight. An over-cap rider is real mass in `massOf` below, so
   the carrier slows, stalls and then runs backwards under them -- the premise
   enforced by arithmetic instead of by a refusal. The only thing said out loud
   is `'TOO HEAVY TO LIFT'`, and only in the one state that is otherwise
   baffling: a crank is being turned and the thing is going DOWN anyway.

   ============================================================================
   THE MOTION LAW, AND THE ONE PLACE IT DEVIATES FROM docs/PLAN SECTION 4.3.

     need    = segBase + segLoad * mass * slope        (4.3, verbatim)
     supply  = the component's torque, from active cranks, gear loss per hop
     demand  = the component's total `need`, summed over its segments
     drive   = demand > 0 ? min(1, supply / demand) : 0   (4.4, verbatim)
     surplus = supply - need                           (4.3, verbatim)

     surplus > 0  ->  ascend  at segUp * min(1, surplus / segBase) * drive
     surplus == 0 ->  hold still
     surplus < 0  ->  descend at segDown * min(1, -surplus / segBase) * slope

   The deviation is the `* drive` factor on the ASCENT case, and it is there
   because section 4.3 and section 4.4 of the plan cannot both be implemented
   literally. 4.3 apportions `supply` across a component's segments in
   proportion to their own `need`, which makes `surplus` identically
   `need * (supply/demand - 1)`: its SIGN is then uniform across the component
   and two identical segments sharing one crank do not slow down, they STOP.
   That contradicts 4.4's own worked example ("one crank feeding three segments
   through gears turns all three at a third speed") and the phase's own
   acceptance walkthrough. Conversely 4.4's `drive` alone cannot make a loaded
   carrier run BACKWARDS, which is the load-bearing correction in the brief.

   So: `surplus` (over the WHOLE component supply, unapportioned) decides the
   DIRECTION and the descent magnitude; `drive` decides how much of the
   drivetrain's capacity an ascending segment gets. Sharing a crank between two
   segments halves `drive` and therefore halves the climb, and no combination
   of the two can ever exceed `eff('segUp')`. Recorded in docs/SPEC.md section
   17.8 and docs/FINDINGS.md.

   THERE IS NO `descend()` FUNCTION AND NO CHARGE GATE. Weighted descent is
   what the expression above already produces at zero supply -- `surplus` is
   then `-need`, which is at least `segBase`, so an unpowered vertical segment
   descends at the full `segDown`. A second code path for it would be two
   rules for one fact. A horizontal segment gets that same descent multiplied
   by `slope = 0` and therefore sits still, with no horizontal special case
   anywhere.
   ============================================================================

   DETERMINISM (invariant 7): no `rand()`. Iteration is `segments` order (link
   order) and `machines` order (placement order), and `m.turn` accumulates from
   `dt` alone, so a gear's rotation phase is reproducible from the seed and the
   frame count. */

import { clamp, overlaps } from '../core/math.js';
import { push } from '../model/journal.js';
import { itemsIn, massOf, write as iw } from '../model/items.js';
import { defOf, machines, write as mw } from '../model/machines.js';
import { eff } from '../model/mods.js';
import { PH, PW, player, playerBox, write as pw } from '../model/player.js';
import { burdenOf, run } from '../model/run.js';
import { carrierBox, carrierPos, carries, riddenSegment, segments, write as segw } from '../model/segments.js';
import { solidAt } from '../model/tiles.js';
import { bandAt, bands, tileX, tileY } from '../model/world.js';

/* Radians per second a fully-driven wheel turns. PRESENTATION, not design:
   `m.turn` is only ever read by `view/treatments.js#gearWheel`/`crankArm` to
   pick a rotation phase, so this is the same class of number as
   `model/player.js`'s own PW/PH and no god's trinket should bend it. ~0.8
   revolutions per second, which at `teeth:8` is a tooth every sixth of a
   second -- fast enough to read as turning at this viewport, slow enough that
   a tooth does not alias into a blur. */
const TURN_RATE = 5.0;
const TAU = Math.PI * 2;

export function step(dt, cmd) {
  /* THE COMPONENT PARTITION, per band, from the cache below. Reset the
     per-frame scratch on the way past: the component records are REUSED
     across frames (that is the whole point of caching them), so supply,
     demand and drive have to be zeroed rather than assumed fresh. */
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
     is driving it. Collected in one pass so `demand` is complete before any
     `drive` is computed -- a segment must not move on a demand figure that is
     still being summed. */
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
    /* A DRIVETRAIN WITH NOTHING TO LIFT FREE-SPINS. `drive` is the drive
       actually DELIVERED, which is zero when there is no demand to deliver it
       to -- but a crank being turned with no segment on the far end is
       obviously turning, and drawing it stopped would be a lie. So the two
       facts are two numbers: `torque` is what is delivered (and is what the
       tooltip and any future readout wants), `spin` is only how fast the
       wheels go round. */
    c.spin = c.demand > 0 ? c.drive : (c.supply > 0 ? 1 : 0);
  }

  for (const s of state) drive(s, dt);

  /* Written LAST, so `view` draws this frame's answer. Only drivetrain nodes
     are ever written, so every other machine's `torque`/`turn` stays 0 with
     no key test here or in `view`. Guarded on a change because `mw.torque`
     bumps the epoch and a parked drivetrain should not dirty the model sixty
     times a second. */
  for (const c of comps)
    for (const m of c.nodes) {
      if (m.torque !== c.drive) mw.torque(m, c.drive);
      if (c.spin > 0) mw.turn(m, (m.turn + c.spin * TURN_RATE * dt) % TAU);
    }
}

/* ---------- the crank: a HOLD, and nothing is spent but presence ----------
   `cmd.turn` is a hold in the exact shape `cmd.craft` already has
   (`shell/input.js`, bound to `f`), not an edge: `rules/crafting.js`
   accumulates while it is true and forgets on release, and a crank is that
   with a proximity test instead of a recipe.

   `overlaps(playerBox(), m.box, def.crank.reach)` is the SAME `core/math.js`
   call `rules/machines.js#handFeed` makes, so "close enough to turn" and
   "close enough to feed" cannot disagree about touching. Every crank within
   reach turns -- holding one key at a junction of two cranks turns both,
   which is a legitimate build and not a loophole: each still contributes only
   its own `torque`.

   THE CRANK'S OWN ACTIVITY IS DELIBERATELY NOT CACHED, unlike the partition
   below. It changes on the frame a key goes down and on the frame the player
   walks one pixel out of reach, i.e. potentially every frame, and it is two
   floats and an AABB test per crank over a list that is tens long. A cache
   keyed on anything that changes every frame is a slower way to compute the
   same number. */
function supplyOf(comps, cmd) {
  const turning = !!(cmd && cmd.turn) && !run.dead && !!player.band;
  if (!turning) return;
  const box = playerBox();

  for (const c of comps)
    for (const cr of c.cranks) {
      const def = defOf(cr.m);
      if (cr.path === null) continue;          // no hub in this component to feed
      if (!overlaps(box, cr.m.box, def.crank.reach)) continue;
      c.turning = true;
      /* GEAR LOSS PER HOP, along the cached path from this crank to its
         nearest hub. `torqueLoss` is read HERE and not baked into the cached
         path, so a boon that tightens a drivetrain applies the frame it is
         granted; only the graph is cached, never a number `eff()` owns. A
         node with no `gear` block (another crank in the middle of a train)
         conducts without loss -- it is a shaft with a handle on it, not a
         gearbox. */
      let retain = 1;
      for (const nd of cr.path) {
        const g = defOf(nd).gear;
        if (g) retain *= Math.max(0, 1 - g.loss * eff('torqueLoss', defOf(nd).id));
      }
      c.supply += def.crank.torque * eff('crankTorque', def.id) * retain;
    }
}

/* ---------- one segment, one frame ---------- */
function drive(s, dt) {
  const seg = s.seg;

  /* WHICH COMPONENT DRIVES A CROSS-COMPONENT SEGMENT: the one supplying more
     torque, `seg.a`'s on a tie. A segment's two hubs can sit in different
     bands and therefore in different components (a surface-to-astral span is
     the ordinary case), and both ends are pulling on the same cable. Taking
     the GREATER rather than the SUM is the conservative reading and the one
     invariant 4 wants: two half-fed drivetrains at opposite ends of a cable do
     not add up to a free ride. */
  const c = pick(s.ca, s.cb);
  const supply = c ? c.supply : 0;
  const throttle = c ? c.drive : 0;

  const base = eff('segBase');
  const surplus = supply - s.need;
  let v = 0;                                    // px/s along the cable, + is UP
  if (surplus > 0) v = eff('segUp') * Math.min(1, surplus / base) * throttle;
  else if (surplus < 0) v = -eff('segDown') * Math.min(1, -surplus / base) * seg.slope;

  /* THE ONE THING SAID OUT LOUD (D4 as amended): a crank is being turned and
     the carrier is going down anyway. Rate-limited with the `WeakMap` gap
     idiom `rules/machines.js`'s tier refusal uses, keyed by the segment
     record, because more than one segment can be losing at once. */
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

  /* ARRIVED AT THE TOP. The haul is released -- `it.rest = 0`, the
     `rules/items.js` wake idiom -- so it falls the last pixel onto whatever
     the upper hub is standing on, which is what "delivered" means. Reuses the
     EXISTING `'winch'` journal kind, so `shell/notify.js`'s
     `"<n> DELIVERED TO <BAND>"` line and `data/sfx.js`'s sound both work
     unedited. Only the HIGH end is an arrival: the low end is where a carrier
     lives, and announcing a bucket coming to rest at the bottom of its own
     shaft would be news about nothing. */
  if (!arrived || !aboard.length) return;
  for (const it of aboard) it.rest = 0;
  push('winch', { x: after.x, y: after.y },
       { to: (seg.band || player.band)?.id, units: aboard.length });
}

const pick = (a, b) => (!a ? b : !b ? a : (b.supply > a.supply ? b : a));

/* ---------- the haul ----------
   the retired winch's own `carry()` generalised to two axes: a segment runs at any
   angle, so `it.y += dy` becomes both. Items are world-positioned, so this is
   two additions per item -- no parenting and no transform stack.

   A BAND HANDOFF IS A RESPAWN AT THE SAME WORLD PIXEL, which is the only
   sanctioned way to change an item's band (the retired `deposit()`, verbatim
   in shape). Done the moment the carrier's own band changes rather than only
   on arrival, because `it.band` is which band's tiles an item collides
   against and a resting item on the wrong side of a seam is a wake-up waiting
   to happen. */
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

  /* Re-index only when the item SET changed, the same guard
     `rules/belts.js#drag` uses for the same reason: a respawn appends a record
     the spatial index `rules/items.js` rebuilt earlier this frame has never
     seen, and nothing downstream should have to know that. A pure translation
     needs no re-index -- `rules/items.js` rebuilds the whole grid at the top
     of the next frame regardless. */
  if (rehomed) iw.reindex();
  return out;
}

/* ---------- the rider ----------
   Translated AFTER `rules/player.js` has already resolved collision this
   frame -- the identical freshness relationship `items before belts` has, and
   the reason `shell/schedule.js` states `player before drive`. The ride
   DECISION (is the player standing on a carrier at all) is
   `model/segments.js#riddenSegment`, one query both this module and
   `rules/player.js` call, because `rules` siblings may not import each other
   and two copies of that predicate would eventually disagree.

   The carrier is NOT terrain and does not become terrain (invariant 1): this
   is a translation of a position the tile grid has already had its say about,
   and nothing here writes to any band's `mat`. */
function ride(s, dx, dy) {
  if (!s.rider || (!dx && !dy)) return;
  const b = player.band;
  const nx = player.x + dx, ny = player.y + dy;
  /* A TRANSLATION IS NOT A MOVE, so it has to ask the tile grid itself. A
     carrier's cable can run within a pixel of solid rock (a 1-tile shaft is
     the ordinary case), and pushing an unresolved position across a tile
     boundary is the ONE way this file could put the player inside rock --
     which the 7,200-frame fuzz in `tools/check.mjs` asserts never happens and
     which invariant 1 forbids on principle. Refused rather than resolved: the
     carrier keeps going, the rider does not, and by the next frame they are
     not over it any more and gravity has them. That is the same answer
     docs/PLAN section 4.6 gives for being carried into a ceiling.

     `boxSolid` is DUPLICATED from `rules/player.js` rather than shared,
     because `rules` siblings may not import each other -- the identical trade
     `rules/machines.js`'s own `HARD_BREAK` mirror already accepted, and for
     the identical reason. Both read `model/tiles.js#solidAt` and the hitbox
     from `model/player.js`, so the two can only disagree if someone edits one
     of them alone. */
  if (b && boxSolid(b, nx, ny)) return;
  pw.move(nx, ny);
}

function boxSolid(b, x, y) {
  const t0 = tileX(b, x), t1 = tileX(b, x + PW - 1);
  const r0 = tileY(b, y), r1 = tileY(b, y + PH - 1);
  for (let ty = r0; ty <= r1; ty++)
    for (let tx = t0; tx <= t1; tx++)
      if (solidAt(b, tx, ty)) return true;
  return false;
}

/* ---------- the refusal gap ----------
   `rules/machines.js:304`'s idiom: a `WeakMap` rather than one scalar, because
   more than one segment can be stalled under a load at once, and keyed by the
   record so a cut segment needs no explicit cleanup. */
const REFUSAL_GAP = 1.0;
const refusedAt = new WeakMap();
function refusalDue(seg) {
  const last = refusedAt.get(seg);
  if (last !== undefined && run.t - last < REFUSAL_GAP) return false;
  refusedAt.set(seg, run.t);
  return true;
}

/* ---------- the drivetrain graph ----------
   NODES are every placed machine whose row carries `crank`, `gear` or `hub`.
   EDGES are ORTHOGONAL FOOTPRINT ADJACENCY in the same band: two footprints
   sharing an edge. DIAGONALS DO NOT CONDUCT (docs/PLAN A3, confirmed) -- a
   corner needs a gear in it, and Phase 8e's art is what teaches that (two
   diagonal gears visibly do not mesh). No machine name appears anywhere in
   here: `crank`/`gear`/`hub` are interpreter keys, read exactly like
   `belt`/`mine`/`light` already are. */
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

/* THE CACHE, exactly `rules/light.js:114-135`'s shape: a module-local
   `WeakMap` keyed by the BAND OBJECT and invalidated by a SIGNATURE recomputed
   every frame. Keyed by the object and not by `b.ord` deliberately -- `newRun()`
   always hands out fresh band records, so a stale entry can never be read back
   into a live run and there is no reset call to wire up or forget.

   WHAT IS CACHED IS THE TOPOLOGY ONLY: the component partition and, per crank,
   the path of nodes between it and its nearest hub. Every NUMBER on that path
   is still read through `eff()` per frame (see `supplyOf`), so a modifier is
   never one frame stale. The partition changes only when a machine is placed
   or removed; the crank's own activity changes every frame and is deliberately
   not cached at all.

   Node counts are in the TENS, so the flood is O(n^2) and the path search is a
   plain BFS. `model/segments.js#chains` makes the same call about union-find,
   for the same reason, and says so. */
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

/* A rolling hash of the node set: count, position and definition all fold in,
   so placing, removing or (nothing does today, and nothing should have to know
   that) moving one is caught. */
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

/* The nodes strictly BETWEEN this crank and the nearest hub, or null when the
   component holds no hub at all (a drivetrain that drives nothing). Plain BFS,
   neighbours visited in `nodes` order, so "nearest" is fewest nodes and the
   answer is deterministic. A crank sitting directly against a hub returns an
   empty path and therefore loses nothing. */
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
