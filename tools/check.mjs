// Headless verification for the layered architecture.
//
// Four sections, in order of what they can prove:
//   0  dependency direction    — the architecture is intact
//   1  name resolution         — every string key in data/ resolves
//   2  purity                  — render() performs no model writes
//   3  behaviour               — the game actually does what SPEC.md says
//
// It CANNOT tell you whether anything looks good. Screenshot tests cover
// appearance changing; a human covers appearance being right.
// See docs/DEVELOPER_GUIDE.md#checkers-what-each-one-proves

import { fileURLToPath } from 'node:url';
import { checkLayers } from './layers.mjs';
import { checkContent } from './content.mjs';

/* ---------- DOM and canvas2d stub ----------
   Not a pure stub: fillRect/drawImage also assert finiteness, which is where a
   good share of this harness's value comes from. */
const calls = { fillRect: 0, drawImage: 0, clearRect: 0 };

function makeCtx() {
  const grad = () => ({ addColorStop() {} });
  return {
    fillStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false, lineWidth: 1,
    fillRect(x, y, w, h) {
      calls.fillRect++;
      for (const v of [x, y, w, h])
        if (!Number.isFinite(v)) throw new Error(`fillRect non-finite: ${x},${y},${w},${h}`);
    },
    clearRect(x, y, w, h) {
      calls.clearRect++;
      for (const v of [x, y, w, h]) if (!Number.isFinite(v)) throw new Error('clearRect non-finite');
    },
    drawImage(img, ...a) {
      calls.drawImage++;
      if (!img || !img.width || !img.height) throw new Error('drawImage bad source');
      for (const v of a) if (!Number.isFinite(v)) throw new Error('drawImage non-finite');
    },
    createRadialGradient(...a) {
      for (const v of a) if (!Number.isFinite(v)) throw new Error('radial non-finite');
      if (a[2] < 0 || a[5] < 0) throw new Error('radial negative radius');
      return grad();
    },
    createLinearGradient(...a) {
      for (const v of a) if (!Number.isFinite(v)) throw new Error('linear non-finite');
      return grad();
    },
    save() {}, restore() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, stroke() {}, fill() {}
  };
}

function makeCanvas(w = 0, h = 0) {
  const c = {
    width: w, height: h, style: {}, classList: { add() {}, remove() {} },
    addEventListener() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    getContext() { return (c._c = c._c || makeCtx()); }
  };
  return c;
}

const stageEl = makeCanvas();
globalThis.window = globalThis;
globalThis.innerWidth = 1600;
globalThis.innerHeight = 900;
globalThis.document = {
  getElementById: id => (id === 'stage' ? stageEl : null),
  createElement: t => (t === 'canvas' ? makeCanvas(256, 256) : { style: {} })
};
globalThis.performance = { now: () => 0 };
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;

let failures = 0;
const fail = m => { console.error('  FAIL: ' + m); failures++; process.exitCode = 1; };
const ok   = m => console.log('  ok   ' + m);


/* ============================================================
   0. DEPENDENCY DIRECTION
   ============================================================ */
console.log('\n0. dependency direction');
{
  const r = await checkLayers({ quiet: true });
  if (r.violations.length) {
    for (const v of r.violations) fail(`${v.rel} imports ${v.spec} — ${v.why}`);
  } else {
    ok(`${r.files} files, ${r.edges} edges, 0 violations`);
  }
}


/* ---- import every module, so an orphan or a parse error cannot hide ---- */
const canvas = await import('../src/core/canvas.js');
const rng    = await import('../src/core/rng.js');
const D_sub  = await import('../src/data/substances.js');
const D_form = await import('../src/data/forms.js');
const D_mach = await import('../src/data/machines.js');
const D_tune = await import('../src/data/tuning.js');
const D_trk  = await import('../src/data/trinkets.js');
const D_grant = await import('../src/data/grants.js');
const D_boon = await import('../src/data/boons.js');
const D_miracle = await import('../src/data/miracles.js');
const D_drop = await import('../src/data/drops.js');
const D_src  = await import('../src/data/sources.js');
const D_world = await import('../src/data/world.js');
const D_recipes = await import('../src/data/recipes.js');
const world  = await import('../src/model/world.js');
const tiles  = await import('../src/model/tiles.js');
const mining = await import('../src/model/mining.js');
const items  = await import('../src/model/items.js');
const machs  = await import('../src/model/machines.js');
const segs   = await import('../src/model/segments.js');
const player = await import('../src/model/player.js');
const run    = await import('../src/model/run.js');
const mods   = await import('../src/model/mods.js');
const epoch  = await import('../src/model/epoch.js');
const journal = await import('../src/model/journal.js');
const modelBoons = await import('../src/model/boons.js');
const aimModel = await import('../src/model/aim.js');
/* THE ONE `rules` MODULE IMPORTED DIRECTLY, and the reason is written down so
   it does not become a habit. Every other behavioural probe in this file drives
   the game through `shell/main.js#step` and the real `cmd` object, which is the
   whole point of `stepReal`. But the LINK verb cannot be reached that way from
   a headless harness: `shell/main.js:246`'s branch is gated on
   `cmd.link && aim.valid && aim.band`, and `model/aim.js` is only valid while a
   real pointer is over the stage -- so a scripted link would have to fake a
   mouse position, which is exactly the hardcoded-coordinate mistake CLAUDE.md
   records ("a click at (400,300) fails at a different base buffer"). Calling
   `linkSegment` directly is the same module instance `shell/main.js` calls, one
   layer in from the pointer, and it keeps the journal row and the refusal
   string in the assertion. */
const R_place = await import('../src/rules/placement.js');
const boot   = await import('../src/shell/boot.js');
const main   = await import('../src/shell/main.js');
const sched  = await import('../src/shell/schedule.js');
const input  = await import('../src/shell/input.js');
const shellUi = await import('../src/shell/ui.js');

console.log('\n   imported every layer without error');

/* ============================================================
   THE REAL STEP(), NOT A REIMPLEMENTED LOOP
   ------------------------------------------------------------
   CLAUDE.md records the known defect this section fixes: earlier drafts of
   this file re-implemented the frame loop by calling `sched.stepAll` at a
   fixed dt directly, bypassing `shell/main.js#step` entirely -- which is the
   ONLY place `clock.t`/`clock.frame` advance, the map-freeze guard lives, the
   craft-queue re-assertion happens, and `cmd.dig`/`cmd.mouse` merge into one
   `dig` intent. `sched.stepAll` IS the core of `step()` (the STEPS array),
   so this was not a different SIMULATION, only a smaller one -- but "smaller"
   is exactly the gap a framerate- or clock-dependent bug hides in.

   `stepReal(dt)` below is what every behavioural probe uses from here on: it
   drives the SAME `cmd` object `shell/input.js` exports (the one every real
   keystroke and every Playwright test ultimately writes to), calls the real
   `main.step(dt)`, then clears edge-triggered flags exactly the way
   `shell/main.js#frame`'s real RAF loop and `__mf.frames`/`hold` both do. */
function stepReal(dt, want = {}) {
  /* `turn` is on this list for the same reason `craft` is: it is a HOLD, so
     `clearEdges()` will not put it back down, and `cmd` is a module singleton
     shared by every probe in this file -- a section that leaves a crank held
     would silently power the next section's drivetrain. */
  for (const k of ['left', 'right', 'up', 'down', 'hop', 'dig', 'place', 'craft', 'drop', 'turn', 'hasMouse'])
    input.cmd[k] = want[k] ?? false;
  main.step(dt);
  input.clearEdges();
}
function runReal(n, dt, want = {}) {
  for (let i = 0; i < n; i++) stepReal(dt, want);
}

/* ============================================================
   SHARED HELPERS for the determinism / reset probes below.
   ============================================================ */

/* Cheap rolling checksum over a typed array -- `b.mat`/`b.seen`/`b.light` are
   each tens of thousands of bytes, and a full JSON dump of three of them per
   band, twice per determinism check, is unnecessary weight for a fingerprint
   that only needs to answer "did anything change". Order-sensitive (it is a
   rolling hash, not a sum), so a transposition would be caught too. */
function sumBytes(arr) {
  let h = 2166136261;
  for (let i = 0; i < arr.length; i++) { h ^= arr[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* Every exported model object's own live state, flattened into one plain,
   JSON-comparable snapshot -- used both by the newRun() reset probe and by
   the determinism probe. `epoch` is deliberately excluded: it only ever
   increases and is not itself gameplay state (see model/epoch.js's own
   header), so including it would make two otherwise-identical snapshots
   compare unequal by construction. */
function snapshotModel() {
  return {
    bands: world.bands.map(b => ({
      id: b.id, mat: sumBytes(b.mat), seen: sumBytes(b.seen), light: sumBytes(b.light), lightVer: b.lightVer
    })),
    player: {
      band: player.player.band?.id ?? null,
      x: +player.player.x.toFixed(4), y: +player.player.y.toFixed(4),
      vx: +player.player.vx.toFixed(4), vy: +player.player.vy.toFixed(4),
      onGround: player.player.onGround, onLadder: player.player.onLadder,
      coyote: +player.player.coyote.toFixed(4), fallFrom: +player.player.fallFrom.toFixed(4),
      face: player.player.face, walkPhase: +player.player.walkPhase.toFixed(4),
      landFlash: +player.player.landFlash.toFixed(4), hurtFlash: +player.player.hurtFlash.toFixed(4),
      digging: player.player.digging
    },
    run: JSON.parse(JSON.stringify(run.run)),
    items: items.items.map(it => ({
      band: it.band?.id, x: +it.x.toFixed(3), y: +it.y.toFixed(3),
      vx: +it.vx.toFixed(3), vy: +it.vy.toFixed(3), sub: it.sub, form: it.form, rest: it.rest
    })),
    mining: mining.activeCount(),
    /* `torque` and `turn` are in here for invariant 8's sake as much as for
       determinism's: they are the two fields `rules/drive.js` writes on a
       machine record every frame, and a `turn` phase that survived a restart
       would be a gear that remembers how far it had been cranked in the
       previous run. */
    machines: machs.machines.map(m => ({
      def: m.def, tx: m.tx, ty: m.ty, buf: { ...m.buf }, prog: +m.prog.toFixed(4),
      made: m.made, charges: m.charges, running: m.running,
      torque: +m.torque.toFixed(6), turn: +m.turn.toFixed(6)
    })),
    /* SEGMENTS ARE STATE AND THEREFORE FINGERPRINTED, and the two hub RECORDS
       are recorded as their index in `machs.machines` -- an identity, flattened
       to something JSON can compare, without pulling the whole machine in
       twice. A segment surviving `newRun()` is precisely the determinism bug
       invariant 8 exists to name, and until this line existed neither the
       determinism probe nor the reset probe could see one. */
    segments: segs.segments.map(s => ({
      a: machs.machines.indexOf(s.a), b: machs.machines.indexOf(s.b),
      ax: s.ax, ay: s.ay, bx: s.bx, by: s.by,
      len: +s.len.toFixed(4), slope: +s.slope.toFixed(6), hi: s.hi,
      t: +s.t.toFixed(6), dir: s.dir, load: +s.load.toFixed(4), band: s.band?.id ?? null
    })),
    mods: mods.mods.rows.map(r => ({ src: r.src, key: r.key, mul: r.mul, add: r.add })),
    boons: modelBoons.boons.active.map(a => ({ id: a.id, left: +a.left.toFixed(4) })),
    aim: { band: aimModel.aim.band?.id ?? null, tx: aimModel.aim.tx, ty: aimModel.aim.ty,
           valid: aimModel.aim.valid, mode: aimModel.aim.mode },
    journal: journal.peek().length
  };
}

/* A deterministic scripted play session: fresh `newRun(seed)`, then `steps`
   substeps of a CONTROL-INPUT stream driven by its OWN seeded generator
   (`rng.mulberry`, entirely separate from the game's own seeded `rand()`
   stream -- the same separation the existing 7,200-frame fuzz above already
   relies on). Returns a single string fingerprint. A run that dies mid-script
   restarts on the SAME seed rather than stopping, so the script always runs
   its full length and two calls with the same (seed, steps) are directly
   comparable. */
/* THE SCRIPT NOW BUILDS A DRIVETRAIN AND CRANKS IT, because a fingerprint over
   `segments` and `m.torque` proves nothing about a mechanic the script never
   touches. `scriptRig` plants two hubs and a crank beside the player's own
   spawn tile, carves the span clear, and links it; the intent stream gains a
   `turn` hold at 40%, so the player wanders in and out of the crank's 12 px
   reach and the carrier rises, stalls and sinks all through the run.

   WHY THE LINK INTENT IS A DIRECT `rules` CALL and not `cmd.link`: see the
   `R_place` import's own comment. `shell/main.js`'s link branch needs
   `aim.valid`, which needs a pointer.

   `scriptStats` is how the section below proves this is not vacuous. A script
   that quietly failed to build its rig would still produce two identical
   fingerprints and tell nobody. */
const scriptStats = { turned: 0, moved: 0, links: 0, cuts: 0 };

function scriptRig() {
  const band = player.player.band;
  if (!band) return null;
  const ptx = world.tileX(band, player.player.x), pty = world.tileY(band, player.player.y);
  for (let ty = pty - 12; ty <= pty + 1; ty++)
    for (let tx = ptx + 1; tx <= ptx + 4; tx++) tiles.write.clear(band, tx, ty);
  const lo = machs.write.place(band, D_mach.M.hub, ptx + 2, pty - 1);
  const hi = machs.write.place(band, D_mach.M.hub, ptx + 2, pty - 10);
  machs.write.place(band, D_mach.M.crank, ptx + 1, pty - 1);
  scriptLink(lo, hi);
  return { lo, hi };
}

/* LINK, THEN PARK THE CARRIER MID-CABLE rather than at the low end a fresh
   link puts it at. A carrier already at the bottom only moves while the crank
   is in reach, which over a wandering script is a couple of pixels; parked at
   0.6 it descends 43 px under its own weight from the first substep, so the
   fingerprint covers real motion whether or not the player happens to be
   standing at the handle. Every relink re-arms it the same way, so the script
   accumulates hundreds of pixels of travel rather than one cable's worth. */
function scriptLink(lo, hi) {
  const seg = R_place.linkSegment(lo, hi);
  if (seg) segs.write.carrier(seg, 0.6, 0);
  return seg;
}

function scriptedPlay(seed, steps) {
  boot.newRun(seed);
  let rig = scriptRig();
  scriptStats.turned = scriptStats.moved = scriptStats.links = scriptStats.cuts = 0;
  let prevT = segs.segments[0]?.t ?? null;
  const ctl = rng.mulberry(0xD00D5EED);
  for (let i = 0; i < steps; i++) {
    stepReal(1 / 120, {
      left: ctl() < 0.2, right: ctl() < 0.3, up: ctl() < 0.15, down: ctl() < 0.25,
      hop: ctl() < 0.05, dig: ctl() < 0.55, craft: ctl() < 0.2, place: ctl() < 0.02,
      turn: ctl() < 0.4, hasMouse: false
    });
    if (machs.machines.some(m => m.torque > 0)) scriptStats.turned++;
    /* TOTAL travel, not the furthest point reached: a carrier that rose and
       sank back is a carrier that moved, and a cut/relink resets `t` to 0. */
    const s = segs.segments[0] ?? null;
    if (s && prevT !== null) scriptStats.moved += Math.abs(s.t - prevT) * s.len;
    prevT = s ? s.t : null;
    /* A SCRIPTED CUT AND RELINK, rarely: the cable is not a fixture, and
       `write.unlink`/`write.link` reorder `segments`, which is the one thing
       that could make an otherwise-deterministic drivetrain iterate in a
       different order between two runs. */
    if (rig && ctl() < 0.002) {
      const existing = segs.linkedTo(rig.lo, rig.hi);
      if (existing) { R_place.unlinkSegment(existing); scriptStats.cuts++; }
      else if (scriptLink(rig.lo, rig.hi)) scriptStats.links++;
      prevT = segs.segments[0]?.t ?? null;
    }
    if (run.run.dead) { boot.newRun(seed); rig = scriptRig(); prevT = segs.segments[0]?.t ?? null; }
  }
  return JSON.stringify(snapshotModel());
}

/* ---- the fresh-PROCESS half of the determinism check ----
   `--determinism-probe` runs ONLY this and prints the fingerprint as its last
   line of stdout, so the section below can compare a truly separate Node
   process (a fresh module graph, fresh V8 heap) against two in-process runs.
   Checked here, immediately after every module needed to run a scripted
   session exists, and before section 0's own logging starts -- the parent
   only reads the LAST stdout line, so anything printed here or by an earlier
   `console.log` in this fresh process does not need to be suppressed. */
if (process.argv.includes('--determinism-probe')) {
  console.log(scriptedPlay(2024, 10000));
  process.exit(0);
}


/* ============================================================
   1. NAME RESOLUTION — a typo in data/ must fail here, not at 3am
   ============================================================ */
console.log('\n1. content resolves');
{
  const formIds = new Set(Object.keys(D_form.FORMS));
  const sourceIds = new Set(Object.keys(D_src.SOURCES || {}));
  let bad = 0;

  /* `forms.expand(sel)` is the purpose-built validator: it returns every legal
     substance x form pair a selector covers, and an EMPTY result is exactly the
     failure that would let a substance accumulate in a buffer no recipe
     consumes. Use it rather than string-matching ids.
     See docs/DEVELOPER_GUIDE.md#checkers-what-each-one-proves */
  for (const m of D_mach.MACHINES) {
    for (const r of m.recipes || []) {
      /* A recipe with `from:` draws from a NON-ITEM source, so its inputs are
         that source's named units rather than substance x form selectors.
         NO ROW IN THE GAME DOES THIS TODAY, and the check is deliberately kept
         anyway. The one that did was the retired winch stage's second recipe
         -- `{ in:{heart:1}, from:'vital' }`, the "blood winch", which bought a
         lift charge with the player's health once the timber ran out. Phase 8f
         deleted the winch, and docs/PLAN-gears-and-winches.md A5 records the
         user rejecting the trap outright rather than moving it to the hand
         crank: the crank is manual only and there is no passive power source
         of any kind. `data/sources.js#vital` went with it, so `NAMED_UNITS`
         is currently empty -- which makes this branch assert "no recipe may
         name a bare unit", exactly true right now, and makes it the guard for
         whatever non-item source lands next. It is generic over the source
         table and knows no name, so it needed no edit when `vital` went. */
      if (r.from) {
        if (!sourceIds.has(r.from))
          { fail(`machine ${m.id}: recipe from:"${r.from}" is not a source`); bad++; }
        for (const unit of Object.keys(r.in || {}))
          if (!(D_src.NAMED_UNITS || []).includes(unit))
            { fail(`machine ${m.id}: "${unit}" is not a named unit of any source`); bad++; }
      } else {
        for (const sel of Object.keys(r.in || {}))
          if (D_form.expand(sel).length === 0)
            { fail(`machine ${m.id}: recipe input "${sel}" expands to no legal pair`); bad++; }
      }
      for (const sel of Object.keys(r.out || {}))
        if (!r.from && !sourceIds.has(sel) && D_form.expand(sel).length === 0)
          { fail(`machine ${m.id}: recipe output "${sel}" expands to no legal pair`); bad++; }
    }
    for (const sel of Object.keys((m.buffer && m.buffer.cap) || {}))
      if (!sourceIds.has(sel) && D_form.expand(sel).length === 0)
        { fail(`machine ${m.id}: buffer cap "${sel}" expands to no legal pair`); bad++; }
  }

  /* A trinket/boon key is dotted: `rate.furnace` is the tunable `rate`
     scoped to `furnace`. Splitting on the FIRST dot is the rule mods.js
     applies. `tools/content.mjs`'s assertion 8 does the deep version of this
     (scope resolution too); this is the same quick sanity check that table
     already ran for trinkets, now covering the timed-boon tier too. */
  for (const row of [...(D_trk.TRINKETS || []), ...(D_boon.BOONS || [])]) {
    for (const mod of row.mods || []) {
      const raw = mod.tunable || mod.key || '';
      const base = raw.split('.')[0];
      if (base && !(base in D_tune.TUNE))
        { fail(`${row.id}: tunable "${base}" is not in data/tuning.js`); bad++; }
    }
  }
  const machIds = new Set(D_mach.MACHINES.map(m => m.id));
  for (const [id, g] of Object.entries(D_grant.GRANT || {}))
    if (g.grants && !machIds.has(g.grants))
      { fail(`grant ${id}: grants unknown machine "${g.grants}"`); bad++; }

  /* Every boon a `conflictsWith` entry names must itself be a real boon --
     `tools/content.mjs`'s assertion 10 is the same check; kept here too so a
     typo fails at this quicker layer first. */
  for (const b of D_boon.BOONS || []) {
    for (const c of b.conflictsWith || []) {
      if (!D_boon.BOON[c.id])
        { fail(`boon ${b.id}: conflictsWith names unknown boon "${c.id}"`); bad++; }
      if (c.mode !== 'suppress' && c.mode !== 'invert')
        { fail(`boon ${b.id}: conflictsWith "${c.id}" has unknown mode "${c.mode}"`); bad++; }
    }
  }

  /* Every miracle's `id` must name a real substance, and its optional
     side-effect boon must resolve. */
  for (const m of D_miracle.MIRACLES || []) {
    if (D_sub.S[m.id] === undefined)
      { fail(`miracle ${m.id}: no substance row of this id`); bad++; }
    if (m.effect?.boon && !D_boon.BOON[m.effect.boon])
      { fail(`miracle ${m.id}: effect.boon names unknown boon "${m.effect.boon}"`); bad++; }
  }

  /* Every drop row's `give` must name a real trinket. */
  const trinketIds = new Set((D_trk.TRINKETS || []).map(t => t.id));
  for (const d of D_drop.DROPS || [])
    if (!trinketIds.has(d.give))
      { fail(`drop ${d.id}: give "${d.give}" is not a real trinket`); bad++; }

  if (!bad) ok(`${D_sub.SUBSTANCES.length} substances, ${formIds.size} forms, ` +
               `${D_mach.MACHINES.length} machines, all names resolve`);

  const bands = D_world.BANDS || D_world.WORLD || [];
  if (bands.length !== 3) fail(`expected 3 bands, found ${bands.length}`);
  else ok(`3 bands: ${bands.map(b => b.id).join(' / ')}`);
}


/* ============================================================
   1b. CONTENT LINT — recipe reachability, mass, and tunable resolution
   ============================================================ */
console.log('\n1b. content lint');
{
  const r = checkContent({ quiet: true });
  if (r.violations.length) {
    for (const v of r.violations) fail(v);
  } else {
    ok(`${r.checks} checks, 0 violations`);
  }
}


/* ---- boot once, for everything below ---- */
canvas.attach(stageEl);
canvas.resize(1600, 900);
boot.boot(1337);
if (!boot.booted()) fail('boot() did not place the player in a band');
else ok(`booted: player in band "${player.player.band.id}"`);


/* ============================================================
   2. PURITY — view may read the model, never write it
   ============================================================ */
console.log('\n2. rendering is pure');
{
  main.step(1 / 120);                       // let one frame settle
  const before = epoch.epoch.n;
  main.draw();
  main.draw();
  const after = epoch.epoch.n;
  if (after !== before) fail(`render() performed ${after - before} model write(s)`);
  else ok(`two renders, 0 model writes (epoch ${before})`);

  /* If render consumed randomness, the generator would advance across a draw.
     Snapshot the stream, draw a lot, and check the next value is the one the
     un-drawn stream would have produced. */
  rng.seedRng(99);
  const expected = [rng.rand(), rng.rand(), rng.rand()];
  rng.seedRng(99);
  const got = [];
  for (let i = 0; i < 3; i++) { main.draw(); main.draw(); got.push(rng.rand()); }
  if (got.join() !== expected.join())
    fail('render() consumed randomness — the seeded stream diverged across draws');
  else ok('render() consumes no randomness (invariant 7)');
}


/* ============================================================
   3. BEHAVIOUR
   ============================================================ */
console.log('\n3. behaviour');

/* --- hardness is seconds-to-break, at any framerate --- */
{
  const RATES = [20, 30, 60, 90, 107, 120, 144, 240];
  let worst = 0, worstAt = '';
  for (const s of D_sub.SUBSTANCES) {
    const hard = s.tile && s.tile.hard;
    if (!(hard > 0) || !Number.isFinite(hard)) continue;
    for (const fps of RATES) {
      const dt = 1 / fps;
      boot.newRun(1337);
      const b = player.player.band;
      tiles.write.set(b, 4, 4, D_sub.S[s.id]);
      mining.write.clearAll();
      let t = 0, broke = false;
      for (let f = 0; f < fps * 30; f++) {
        const total = mining.write.add(b, 4, 4, dt);
        t += dt;
        if (total >= hard * mods.eff('hard', s.id)) { broke = true; break; }
      }
      if (!broke) { fail(`${s.id} never breaks at ${fps} fps`); continue; }
      const err = Math.abs(t - hard);
      if (err > dt + 1e-6) fail(`${s.id} at ${fps} fps took ${t.toFixed(3)}s, spec ${hard}s`);
      if (err > worst) { worst = err; worstAt = `${s.id}@${fps}fps`; }
    }
  }
  if (!failures) ok(`hardness honours spec at 8 framerates (worst ${worst.toFixed(4)}s, ${worstAt})`);
}

/* --- the fall-damage table from docs/SPEC.md --- */
{
  const TABLE = [[4, 0], [5, 0], [8, 1], [11, 2], [14, 3], [17, 4], [20, 5]];
  /* TUNE maps id -> ROW, not id -> number. Every value is read through eff(),
     which is the only legal reader and the reason a trinket can change it. */
  const GRAV = mods.eff('grav');
  let bad = 0;
  for (const [tilesDown, want] of TABLE) {
    const b = player.player.band;
    const v = Math.sqrt(2 * GRAV * tilesDown * b.tile);
    const got = player.fallHearts(v);
    if (got !== want) { fail(`${tilesDown}-tile fall -> ${got} hearts, spec ${want}`); bad++; }
  }
  if (!bad) ok('fall-damage table matches docs/SPEC.md at all 7 rows');
}

/* --- the player moves, and stays out of solid rock --- */
{
  boot.newRun(1337);
  const p = player.player;
  const x0 = p.x;
  runReal(240, 1 / 120, { right: true, hasMouse: false });
  if (!(p.x > x0 + 8)) fail(`walking right moved the player ${(p.x - x0).toFixed(1)} px`);
  else ok(`walks: ${(p.x - x0).toFixed(0)} px in 2 simulated seconds`);

  let stuck = 0, nonFinite = 0, burdenOver = 0;
  const seed = rng.mulberry(0xC0FFEE);
  for (let f = 0; f < 60 * 120; f++) {
    const c = {
      left: seed() < 0.3, right: seed() < 0.3,
      up: seed() < 0.2, down: seed() < 0.25,
      hop: seed() < 0.06, dig: seed() < 0.5,
      place: seed() < 0.02, hasMouse: false
    };
    stepReal(1 / 120, c);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vy)) nonFinite++;
    if (run.burdenOf() > mods.eff('burden') + 1e-6) burdenOver++;
    if (p.band && tiles.solidAt(p.band, world.tileX(p.band, p.x + player.PW / 2),
                                        world.tileY(p.band, p.y + player.PH / 2))) stuck++;
    if (run.run.dead) boot.newRun(1337);
  }
  if (nonFinite) fail(`${nonFinite} frames with non-finite player state`);
  if (stuck) fail(`player centre inside solid rock on ${stuck} frames`);
  if (!nonFinite && !stuck) ok('7,200-frame fuzz: no non-finite state, never inside rock');
  if (burdenOver) fail(`burden exceeded the hard cap on ${burdenOver} frames of the fuzz -- a pickup let mass through it should have refused`);
  else ok('BURDEN: 7,200-frame fuzz never carried more than eff(\'burden\')');
}

/* --- a trinket is an item: drafting it drops a relic, picking it up and
   EQUIPPING it changes an effective value, and spending it out of the
   inventory restores the base -- all through `run.inv`/`run.equipped`, none of
   it through a dedicated list, so holding alone is not enough.
   See docs/DEVELOPER_GUIDE.md#the-four-gift-tiers --- */
{
  boot.newRun(1337);
  const t = (D_trk.TRINKETS || [])[0];
  if (!t) fail('no trinket to test');
  else {
    const raw = t.mods[0].tunable || t.mods[0].key;
    const dot = raw.indexOf('.');
    const key = dot < 0 ? raw : raw.slice(0, dot);
    const scope = dot < 0 ? t.mods[0].scope : raw.slice(dot + 1);
    const base = mods.eff(key, scope);
    sched.trinkets.grant(t.id);
    /* The draft spawns a falling item; let it land in the pickup radius. */
    for (let i = 0; i < 180 && run.invCount(D_sub.S[t.id], D_form.F.relic) === 0; i++)
      stepReal(1 / 120, { hasMouse: false });
    if (mods.eff(key, scope) !== base)
      fail(`trinket ${t.id}: eff("${key}") changed BEFORE equipping -- holding alone must not be enough`);

    /* Equip it -- the model-driven path Phase 5b's real drag-to-equip UI
       will replace -- then `trinkets.step()` syncs `model/mods.js` from the
       intersection `run.equipped ∩ run.inv`. */
    if (!sched.trinkets.equipFirst()) fail(`trinket ${t.id}: equipFirst() found no empty slot`);
    sched.trinkets.step();
    const withT = mods.eff(key, scope);
    if (withT === base) fail(`trinket ${t.id} did not change eff("${key}") after equipping`);
    else ok(`trinket ${t.id}: ${key} ${base} -> ${withT} once equipped`);

    run.write.spend(D_sub.S[t.id], D_form.F.relic, 1);
    sched.trinkets.step();
    if (mods.eff(key, scope) !== base) fail('spending the relic did not restore the base');
    else if (run.run.equipped.includes(D_sub.S[t.id]))
      fail('spending the relic left it in run.equipped -- the slot must clear itself');
    else ok('spending the relic restores the base value and clears the slot');
  }
}

/* --- the variant machine is faster PURELY by tuning --- */
{
  const kiln = D_mach.MACHINES.find(m => /divine|kiln/.test(m.id) && m.id !== 'furnace');
  if (!kiln) console.log('  --   no variant machine present, skipped');
  else {
    const r = mods.eff('rate', kiln.id);
    if (!(r > 1)) fail(`${kiln.id}: eff('rate') is ${r}, expected > 1 from data/tuning.js`);
    else ok(`${kiln.id} runs at ${r}x by tuning alone, no variant code`);
  }
}

/* --- one seed renders identically twice --- */
{
  const shot = () => {
    boot.newRun(4242);
    runReal(600, 1 / 120, { right: true, dig: true, hasMouse: false });
    return `${player.player.x.toFixed(4)}|${player.player.y.toFixed(4)}|` +
           `${items.items.length}|${mining.activeCount()}|${run.run.hearts}`;
  };
  const a = shot(), b = shot();
  if (a !== b) fail(`same seed diverged:\n     ${a}\n     ${b}`);
  else ok('one seed, two runs, identical state after 5 simulated seconds');
}

/* --- render every band without throwing --- */
{
  boot.newRun(1337);
  for (const band of world.bands) {
    main.cam.x = band.origin.x;
    main.cam.y = band.origin.y;
    try { main.draw(); ok(`renders band "${band.id}"`); }
    catch (e) { fail(`render in band "${band.id}": ${e.message}`); }
  }
}

/* ============================================================
   4. PHASE 6 — new behavioural probes, over the REAL step()
   ============================================================ */
console.log('\n4. Phase 6 probes');

/* --- DETERMINISM: same seed + same scripted intents -> identical state hash
   after 10,000 substeps. Twice in this process, once in a genuinely fresh
   one. `snapshotModel()` covers player position, inventory, item count,
   machine buffers, mods rows, b.seen/b.light and more -- not just the five
   fields the old "one seed twice" probe above used (that probe stays; this
   is broader and longer). --- */
{
  const seed = 2024, steps = 10000;
  const h1 = scriptedPlay(seed, steps);
  const h2 = scriptedPlay(seed, steps);
  if (h1 !== h2) fail('DETERMINISM: the SAME process produced two different hashes for the same seed and script');
  else ok('DETERMINISM: same seed, same script, twice in one process -> identical state hash (10,000 substeps)');

  try {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--determinism-probe'], { encoding: 'utf8' });
    const h3 = out.trim().split('\n').pop();
    if (h3 !== h1)
      fail(`DETERMINISM: a FRESH process diverged from this one\n     in-process: ${h1.slice(0, 120)}...\n     fresh:      ${(h3 || '').slice(0, 120)}...`);
    else ok('DETERMINISM: a fresh process (separate module graph, separate heap) reproduces the identical hash');
  } catch (e) {
    fail(`DETERMINISM: the fresh-process probe failed to run: ${e.message}`);
  }

  /* AND THE SCRIPT ACTUALLY DROVE A DRIVETRAIN (Phase 8g). Two identical
     fingerprints over a script that never turned a crank would be a green
     result about nothing, which is CLAUDE.md's "a test can silently test
     nothing" with the drivetrain in the blank. So: the crank delivered torque
     on some substep, the carrier travelled a real distance along its cable
     (200 px is two and a half cables' worth -- far more than float noise
     and far less than the 316 px twelve relinks actually produce, so the
     bound is not fitted to the number it happens to produce), and the scripted cut ran at least once. */
  console.log(`  ..  determinism script: crank delivered torque on ${scriptStats.turned} of ${steps} ` +
              `substeps, carrier travelled ${scriptStats.moved.toFixed(1)} px along its cable, ` +
              `${scriptStats.cuts} scripted cut(s), ${scriptStats.links} relink(s)`);
  if (!(scriptStats.turned > 0 && scriptStats.moved > 200 && scriptStats.cuts > 0))
    fail(`DETERMINISM: the scripted crank/link intents were VACUOUS -- torque on ` +
         `${scriptStats.turned} substeps, ${scriptStats.moved.toFixed(2)} px of carrier travel, ` +
         `${scriptStats.cuts} cuts. The fingerprint covers segments and m.torque/m.turn, but the ` +
         `script has to move them`);
  else ok(`DETERMINISM: the scripted crank/link intents are not vacuous -- torque on ` +
          `${scriptStats.turned} substeps, ${scriptStats.moved.toFixed(0)} px of carrier travel, and ` +
          `${scriptStats.cuts} cable cut(s) reordering \`segments\``);
}

/* --- THE FINGERPRINT CAN SEE A SEGMENT AT ALL. `snapshotModel()` is the
   instrument both probes above and the reset probe below depend on, and an
   instrument blind to the field it is asked about reports success forever.
   Three writes, each the smallest one that exists, each of which MUST move the
   fingerprint: the carrier's parameter, a hub's delivered drive, and a gear's
   accumulated phase. This is the "seen to fail" for the reset assertion,
   wired in permanently rather than performed once by hand. --- */
{
  boot.newRun(7777);
  const band = player.player.band;
  for (let ty = 4; ty <= 14; ty++) for (let tx = 4; tx <= 8; tx++) tiles.write.clear(band, tx, ty);
  const lo = machs.write.place(band, D_mach.M.hub, 5, 12);
  const hi = machs.write.place(band, D_mach.M.hub, 5, 6);
  const seg = segs.write.link(lo, hi);

  const probes = [
    ['a carrier that has moved', () => segs.write.carrier(seg, 0.5, -1)],
    ['a hub delivering torque', () => machs.write.torque(lo, 0.5)],
    ['a gear with accumulated turn', () => machs.write.turn(lo, 1.25)]
  ];
  let blind = 0;
  for (const [what, poke] of probes) {
    const before = JSON.stringify(snapshotModel());
    poke();
    if (JSON.stringify(snapshotModel()) === before) {
      fail(`FINGERPRINT: snapshotModel() cannot see ${what} -- every determinism and reset assertion ` +
           `about the drivetrain is therefore vacuous`);
      blind++;
    }
  }
  if (!blind)
    ok('FINGERPRINT: snapshotModel() sees a moved carrier, a delivered torque and an accumulated turn -- ' +
       'the determinism and reset probes are not blind to the drivetrain');
}

/* --- newRun() RESETS EVERYTHING (invariant 8): fingerprint every exported
   model object, play enough to dirty every one of them (mining, walking,
   hand-crafting progress, a placed machine's buffer, an equipped trinket, a
   granted machine, a granted timed boon, a spent heart, aim, the journal),
   newRun() on the SAME seed, and fingerprint again -- deterministic worldgen
   from a fixed seed means the two snapshots should be BYTE IDENTICAL if
   nothing survived. Also the cheapest live confirmation that
   model/boons.js#write.clear() is actually wired into shell/boot.js (it is,
   read there directly -- this is the regression guard, not the discovery). --- */
{
  const seed = 9090;
  boot.newRun(seed);
  const fresh = snapshotModel();

  runReal(300, 1 / 120, { right: true, dig: true, craft: true, hasMouse: false });
  run.write.collect(D_sub.S.copper, D_form.F.ore, 20);
  run.write.hurt(1, 'TEST');
  run.write.equip(0, D_sub.S.pick);
  run.write.craft(2.5, 'smelt');
  run.write.brand(42);
  run.write.tribute({ n: 1 });
  mods.write.add('phase6-test', [{ key: 'walk', mul: 1.1 }]);
  machs.write.place(player.player.band, 0, 5, 5);
  sched.grants.grant(D_grant.GRANTS[0].id);
  sched.boons.grant(D_boon.BOONS[0].id);
  aimModel.write.set(player.player.band, 3, 3, true);
  journal.push('phase6-test');

  /* AND THE DRIVETRAIN, dirtied the same way the rest of this list is: through
     the real write API, one call per field that could possibly survive. A
     linked segment with a carrier halfway up it, a hub holding delivered
     drive, and a gear phase mid-rotation. `write.clear()` in `shell/boot.js`
     is what has to forget the first; the machine list going with it is what
     forgets the other two. */
  {
    const band = player.player.band;
    const lo = machs.write.place(band, D_mach.M.hub, 6, 12);
    const hi = machs.write.place(band, D_mach.M.hub, 6, 6);
    const seg = segs.write.link(lo, hi);
    segs.write.carrier(seg, 0.5, -1);
    segs.write.load(seg, 12.5);
    machs.write.torque(lo, 0.75);
    machs.write.turn(hi, 3.25);
  }

  boot.newRun(seed);
  const after = snapshotModel();

  const beforeJson = JSON.stringify(fresh), afterJson = JSON.stringify(after);
  if (beforeJson !== afterJson) {
    const key = Object.keys(fresh).find(k => JSON.stringify(fresh[k]) !== JSON.stringify(after[k]));
    fail(`newRun() RESET: "${key}" differs between two fresh newRun(${seed}) calls around a dirtied run\n` +
         `     before: ${JSON.stringify(fresh[key]).slice(0, 200)}\n` +
         `     after:  ${JSON.stringify(after[key]).slice(0, 200)}`);
  } else ok('newRun() RESET: every exported model object fingerprints identically across two fresh calls on the same seed');

  /* THE SAME FACT, SAID IN ITS OWN WORDS. The byte-comparison above catches
     this, but it reports "segments differs" -- and a future reader of a red
     `npm run check` deserves the sentence invariant 8 is actually about. Both
     halves are named because they fail for different reasons: `segments`
     survives when `shell/boot.js` forgets `segw.clear()`, and a nonzero
     `torque`/`turn` survives when a machine record does. */
  if (segs.segments.length !== 0) {
    fail(`newRun() RESET: ${segs.segments.length} segment(s) survived newRun() -- a cable outliving its ` +
         `run is invariant 8's determinism bug, and shell/boot.js must call segments' write.clear()`);
  } else {
    const stale = machs.machines.filter(m => m.torque !== 0 || m.turn !== 0);
    if (stale.length)
      fail(`newRun() RESET: ${stale.length} machine(s) still hold torque/turn after newRun() -- a gear ` +
           `that remembers how far the last run cranked it`);
    else ok('newRun() RESET: `segments` is empty and every m.torque/m.turn is 0 after a run that ' +
            'linked a cable, moved its carrier and turned a gear');
  }
}

/* --- CONSERVATION: over a 10,000-substep random-intent fuzz, mass ADDED to
   any of the three held buckets (inventory, ground items, machine buffers)
   through their own accountable write functions must equal mass REMOVED
   from them the same way, at every substep -- i.e. `run.inv`/`items`/
   `m.buf` may only ever change through `model/items.js#write.spawn/remove`,
   `model/run.js#write.collect/spend` and `model/machines.js#write.take/
   consume`. This is a STRUCTURAL/bookkeeping check, not a re-run of
   tools/content.mjs's static mass-fairness assertion (which already proves
   no recipe nets mass from nothing, and is the right, and only necessary,
   place for that -- a live ledger has no independent "correct" answer to
   compare a recipe's own output against, only its own bookkeeping). What
   THIS catches is a bug no static table check can: a future code path that
   bypasses the write API to poke `run.inv`/`items`/`m.buf` directly. Prints
   the substep where the two figures first disagree.
   See docs/DEVELOPER_GUIDE.md#checkers-what-each-one-proves --- */
{
  const seed = 5150;
  boot.newRun(seed);
  const band = player.player.band;

  /* One placed furnace, fed for free (bypassing cost) so catchFalling AND
     handFeed both get exercised by whatever the fuzz digs near it -- both
     are additional accountable writers (`take`) this probe must prove
     balance the same as the six top-level ones. */
  machs.write.place(band, D_mach.M.furnace,
    world.tileX(band, player.player.x) - 1, world.tileY(band, player.player.y) + 2);

  const actualHeldMass = () => {
    let m = 0;
    for (const k in run.run.inv) { const p = items.parseKey(k); m += items.massOfPair(p.sub, p.form) * run.run.inv[k]; }
    for (const it of items.items) m += items.massOf(it);
    for (const mm of machs.machines) for (const k in mm.buf) { const p = items.parseKey(k); m += items.massOfPair(p.sub, p.form) * mm.buf[k]; }
    return m;
  };

  let reconstructed = actualHeldMass();
  const origSpawn = items.write.spawn, origRemove = items.write.remove;
  const origCollect = run.write.collect, origSpend = run.write.spend;
  const origTake = machs.write.take, origConsume = machs.write.consume;

  items.write.spawn = (...a) => { const it = origSpawn(...a); if (it) reconstructed += items.massOf(it); return it; };
  items.write.remove = (it) => { reconstructed -= items.massOf(it); return origRemove(it); };
  run.write.collect = (sub, form, n) => { reconstructed += items.massOfPair(sub, form) * n; return origCollect(sub, form, n); };
  run.write.spend = (sub, form, n) => {
    const ok2 = origSpend(sub, form, n);
    if (ok2) reconstructed -= items.massOfPair(sub, form) * n;
    return ok2;
  };
  machs.write.take = (m, sub, form, n) => { reconstructed += items.massOfPair(sub, form) * n; return origTake(m, sub, form, n); };
  machs.write.consume = (m, sub, form, n) => {
    const had = m.buf[items.keyOf(sub, form)] || 0;
    const removedN = Math.min(had, n);
    const r = origConsume(m, sub, form, n);
    reconstructed -= items.massOfPair(sub, form) * removedN;
    return r;
  };

  const ctl = rng.mulberry(0xC0A5E12);
  const EPS = 1e-6;
  let driftAt = -1;
  for (let i = 0; i < 10000 && driftAt < 0; i++) {
    stepReal(1 / 120, {
      left: ctl() < 0.2, right: ctl() < 0.3, up: ctl() < 0.15, down: ctl() < 0.25,
      hop: ctl() < 0.05, dig: ctl() < 0.6, craft: ctl() < 0.3, hasMouse: false
    });
    if (Math.abs(actualHeldMass() - reconstructed) > EPS) driftAt = i;
  }

  items.write.spawn = origSpawn; items.write.remove = origRemove;
  run.write.collect = origCollect; run.write.spend = origSpend;
  machs.write.take = origTake; machs.write.consume = origConsume;

  if (driftAt >= 0)
    fail(`CONSERVATION: reconstructed held mass drifted from the actual (inv+ground+buffers) total at substep ${driftAt} ` +
         `(actual ${actualHeldMass().toFixed(4)} T, reconstructed ${reconstructed.toFixed(4)} T)`);
  else ok(`CONSERVATION: 10,000-substep fuzz -- reconstructed mass matches actual held mass throughout (${actualHeldMass().toFixed(2)} T)`);
}

/* --- HAND EQUALS MACHINE: every hand:true recipe is the SAME OBJECT a
   machine names. tools/content.mjs's assertion 7 already proves this
   statically over the content tables; re-asserted here, live, over
   `data/machines.js#MACH`/`data/recipes.js#recipesOf`, because it costs
   nothing to check twice from two angles.
   See docs/DEVELOPER_GUIDE.md#adding-a-recipe --- */
{
  let bad = 0;
  for (const m of D_mach.MACH) {
    const resolved = D_recipes.recipesOf(m);
    (m.recipes || []).forEach((raw, i) => {
      if (typeof raw !== 'string') return;
      const row = D_recipes.RECIPES[raw];
      if (!row || !row.hand) return;
      if (resolved[i] !== row) {
        fail(`HAND EQUALS MACHINE: machine "${m.id}" recipe "${raw}" resolved to a DIFFERENT object than RECIPES.${raw}`);
        bad++;
      }
    });
  }
  if (!bad) ok('HAND EQUALS MACHINE: every hand-craftable recipe a machine names is the SAME frozen object (identity, not just equal fields)');
}

/* --- T2 = T3, PROVEN STRUCTURALLY, NOT BY MATCHING NUMBERS: a hand swing
   with the T2 auger and an autonomous, placed T3 Talos Head both accumulate
   mining work through the identical `model/mining.js#write.add` call, the
   identical `eff('pickPower')`, and the identical tool `power` (auger is the
   single highest `item.tool.power` in the game, which is what
   `rules/machines.js#bestHandToolPower` scans for and what `run.bestTool()`
   returns once the auger is held) -- against the SAME substance, for the
   SAME wall-clock duration, at two DIFFERENT tiles (never the same one,
   or the two accumulators would just be the same Map entry adding to
   itself). The Talos Head runs through the REAL `stepReal`/`main.step`
   pipeline, fully autonomously; the hand side calls the identical model
   primitive directly rather than routing a controlled player through the
   full aim/collision pipeline, which would need exact sub-pixel placement
   to keep the aim locked on one tile for the whole probe and would prove
   the INPUT PLUMBING, not the RATE -- rules/mining.js#step is exactly that
   plumbing wrapped around this one call, and is not what "T2 = T3" is
   actually a claim about. --- */
{
  const seed = 7070;
  boot.newRun(seed);
  const band = world.bandOf('topsoil');
  const txA = 10, tyA = 50, txB = 20, tyB = 50;

  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    tiles.write.clear(band, txA + dx, tyA + dy);
    tiles.write.clear(band, txB + dx, tyB + dy);
  }
  tiles.write.set(band, txA, tyA, D_sub.S.granite);
  tiles.write.set(band, txB, tyB, D_sub.S.granite);
  mining.write.clearAll();

  run.write.collect(D_sub.S.auger, D_form.F.relic, 1);
  const tool = run.bestTool();

  const machine = machs.write.place(band, D_mach.M.talos_head, txB - 1, tyB);
  machs.write.take(machine, D_sub.S.timber, D_form.F.log, 4);

  if (!tool || tool.tier < 2) fail('T2=T3 setup: collecting the auger did not make it run.bestTool()');
  else {
    const dt = 1 / 120, N = 60;
    let handWork = 0;
    for (let i = 0; i < N; i++) {
      handWork = mining.write.add(band, txA, tyA, dt * mods.eff('pickPower') * tool.power);
      stepReal(dt, { hasMouse: false });
    }
    const machWork = mining.workAt(band, txB, tyB);
    if (Math.abs(handWork - machWork) > 1e-9)
      fail(`T2=T3: hand-equivalent work ${handWork} vs. placed Talos Head work ${machWork} over ${(N * dt).toFixed(2)}s -- ` +
           `docs/DESIGN.md's "T3 mines at exactly the T2 hand rate" does not hold`);
    else ok(`T2=T3: hand and machine accumulate IDENTICAL mining work (${handWork.toFixed(4)}) over ${(N * dt).toFixed(2)}s -- ` +
            `same model/mining.js#write.add call, same eff('pickPower'), same tool power, structurally not coincidentally`);
  }
}

/* --- BREAK-EVEN DEPTH, REPRICED IN PLAYER SECONDS (Phase 8f).
   docs/DESIGN.md's "lift cost per item-slot = k x depth" equation, computed
   against the LIVE numbers rather than restated as prose -- but `k` is no
   longer denominated in TALENTS OF FUEL, because there is no fuel at the way
   up any more. The staged winch burned timber (or a heart) per haul; segment
   transport burns nothing at all and is powered by a crank the player has to
   stand at and hold. So the currency of ascent is now SECONDS OF PLAYER
   CRANKING, which docs/PLAN-gears-and-winches.md section 4.2 argues is a
   STRONGER statement of the same thesis: the one resource automation cannot
   give you more of is your own standing there.

   `k` = seconds of cranking per item-slot per tile, for ONE unit of a tier
   riding alone on a vertical segment driven by ONE hand crank -- the honest
   minimum build, and the one where the cargo's own mass still matters. It is
   the real motion expression, read through the real `eff()`:

     need    = segBase + segLoad * mass                 (slope 1: vertical)
     surplus = crank.torque * eff('crankTorque') - need
     drive   = min(1, supply / need)                    (one segment, so
                                                         demand == need)
     v       = segUp * min(1, surplus / segBase) * drive     px/s
     k       = tile / v                                      s/tile/item-slot

   THE DATUM ON THE OTHER SIDE OF THE EQUATION is what an item-slot is WORTH,
   and it has to be in seconds too or there is no depth to solve for. Taken as
   THE SECONDS IT COST TO MINE ITS CONTENTS: `tile.hard` for copper, through
   the same `eff('hard', ...)` / `eff('pickPower')` / stock-pick-power formula
   `rules/mining.js` uses, times docs/SPEC.md section 8's compression ratio.
   That is the closest analogue to what the old section did -- it priced an
   item-slot at its own mass in timber, equally a stated datum -- and it is
   derived from live content rather than invented here.

   Break-even depth is then `worth / k` TILES: how deep you can be before
   cranking one item-slot up costs more of your life than mining its contents
   did. A MORE COMPRESSED TIER MUST SURVIVE TO A GREATER DEPTH, and that
   ordering -- not the exact figure -- is the game's central pressure and the
   thing actually asserted. The raw-ore figure is printed for a human, as it
   always was.

   Read the printed ore figure as the headline it is: raw ore does not pay to
   crank up even ONE tile. That is the compression thesis holding, not a bug.
   See docs/DEVELOPER_GUIDE.md#checkers-what-each-one-proves --- */

/* The two DATA sides of the equation, hoisted out of the block below so that
   section 5's measured counterpart divides the same worth by the same
   compression ratios rather than by a second copy of them. Seconds to mine one
   copper ore by hand with the stock pick, from the same three numbers
   `rules/mining.js` multiplies; and docs/SPEC.md section 8's ratios. */
const oreSecs = D_sub.SUB[D_sub.S.copper].tile.hard * mods.eff('hard', 'copper')
              / (mods.eff('pickPower') * D_sub.SUB[D_sub.S.pick].item.tool.power);
const RATIOS = { ore: 1, ingot: 4, plate: 12 };             // docs/SPEC.md section 8
const FORMS  = { ore: D_form.F.ore, ingot: D_form.F.ingot, plate: D_form.F.plate };

{
  const topsoil = world.bandOf('topsoil');
  const crank = D_mach.MACH[D_mach.M.crank].crank;
  const base = mods.eff('segBase'), load = mods.eff('segLoad'), up = mods.eff('segUp');
  const supply = crank.torque * mods.eff('crankTorque', 'crank');

  /* seconds of cranking per item-slot per tile, for one unit of `form` alone */
  const kOf = form => {
    const mass = items.massOfPair(D_sub.S.copper, form);
    const need = base + load * mass;                       // vertical: slope 1
    const surplus = supply - need;
    const drive = Math.min(1, supply / need);
    const v = surplus > 0 ? up * Math.min(1, surplus / base) * drive : 0;
    return v > 0 ? topsoil.tile / v : Infinity;
  };

  const kTier = tier => kOf(FORMS[tier]);
  const breakEven = tier => (RATIOS[tier] * oreSecs) / kTier(tier);
  const beOre = breakEven('ore'), beIngot = breakEven('ingot'), bePlate = breakEven('plate');

  console.log(`  ..  break-even depth: ore ${beOre.toFixed(2)}, ingot ${beIngot.toFixed(2)}, ` +
              `plate ${bePlate.toFixed(2)} tiles (k = ${kTier('ore').toFixed(3)}/` +
              `${kTier('ingot').toFixed(3)}/${kTier('plate').toFixed(3)} s of cranking per ` +
              `item-slot per tile, one crank, one vertical segment; an ore costs ` +
              `${oreSecs.toFixed(2)} s to mine)`);

  if (!(Number.isFinite(beOre) && beOre > 0))
    fail(`BREAK-EVEN DEPTH: raw ore break-even (${beOre}) is not a finite positive depth -- ` +
         `a single crank cannot raise a single ore at all, which means crank.torque no longer ` +
         `exceeds segBase by enough to move anything`);
  else if (!(beIngot > beOre && bePlate > beIngot))
    fail(`BREAK-EVEN DEPTH: compression should push the break-even DEEPER per tier -- got ore ${beOre.toFixed(2)}, ` +
         `ingot ${beIngot.toFixed(2)}, plate ${bePlate.toFixed(2)}`);
  else if (!(beOre > 0.05 && beOre < 400))
    fail(`BREAK-EVEN DEPTH: raw ore break-even ${beOre.toFixed(2)} tiles is outside a plausible band -- ` +
         `check segUp/segBase/segLoad, crank.torque, or the compression ratios`);
  else ok(`BREAK-EVEN DEPTH: ore ${beOre.toFixed(2)} < ingot ${beIngot.toFixed(2)} < plate ${bePlate.toFixed(2)} tiles ` +
          `of cranking -- a deeper haul is only worth it once refined`);
}

/* --- BURDEN: walking and falling are IDENTICAL at 0% and 150% of the hard
   cap -- only ASCENT is taxed (CLAUDE.md D4). Set via a direct model write
   (`run.write.collect` has no cap of its own; only the PICKUP path in
   rules/items.js refuses one) rather than by fighting the real pickup
   refusal to get there, which is the point: this test's job is to prove the
   MOVEMENT rule reads burden nowhere except the ladder/hop branches, not to
   re-prove the pickup refusal (the 7,200-frame fuzz above already does). --- */
{
  const walkAt = frac => {
    boot.newRun(1234);
    if (frac > 0) {
      const need = mods.eff('burden') * frac;
      const n = Math.ceil(need / items.massOfPair(D_sub.S.copper, D_form.F.ore));
      run.write.collect(D_sub.S.copper, D_form.F.ore, n);
    }
    const x0 = player.player.x;
    runReal(120, 1 / 120, { right: true, hasMouse: false });
    return player.player.x - x0;
  };
  const fallAt = frac => {
    boot.newRun(1234);
    /* Standing on the surface's own ground is `onGround` from frame one --
       nothing to fall FROM. Relocate into an open shaft with plenty of clear
       air below, so this measures real free-fall distance, not "stood still
       and stayed still" at both fractions alike. */
    const band = world.bandOf('topsoil');
    const tx = 5, ty = 5;
    for (let dy = 0; dy <= 20; dy++) tiles.write.clear(band, tx, ty + dy);
    player.write.band(band);
    player.write.move(world.worldX(band, tx), world.worldY(band, ty));
    player.write.vel(0, 0);
    if (frac > 0) {
      const need = mods.eff('burden') * frac;
      const n = Math.ceil(need / items.massOfPair(D_sub.S.copper, D_form.F.ore));
      run.write.collect(D_sub.S.copper, D_form.F.ore, n);
    }
    const y0 = player.player.y;
    runReal(20, 1 / 120, { hasMouse: false });    // enough to be genuinely falling, not enough to land
    return player.player.y - y0;
  };

  const walk0 = walkAt(0), walk150 = walkAt(1.5);
  if (Math.abs(walk0 - walk150) > 1e-6)
    fail(`BURDEN: walking moved ${walk0.toFixed(3)} px at 0% burden but ${walk150.toFixed(3)} px at 150% -- walking must never be taxed`);
  else ok(`BURDEN: walking covers the identical ${walk0.toFixed(1)} px at 0% and 150% of the hard cap`);

  const fall0 = fallAt(0), fall150 = fallAt(1.5);
  if (Math.abs(fall0 - fall150) > 1e-6)
    fail(`BURDEN: falling moved ${fall0.toFixed(3)} px at 0% burden but ${fall150.toFixed(3)} px at 150% -- falling must never be taxed`);
  else ok(`BURDEN: falling covers the identical ${fall0.toFixed(1)} px at 0% and 150% of the hard cap`);

  /* A climb intent AT OR OVER the hard cap produces no upward movement. */
  {
    boot.newRun(1234);
    const band = player.player.band;
    const tx = world.tileX(band, player.player.x), ty = world.tileY(band, player.player.y);
    for (let dy = -1; dy <= 4; dy++) tiles.write.clear(band, tx, ty + dy);
    tiles.write.set(band, tx, ty + 4, D_sub.S.timber, D_form.F.log);   // a ladder tile to climb
    player.write.move(world.worldX(band, tx), world.worldY(band, ty + 3));
    player.write.vel(0, 0);
    const need = mods.eff('burden') * 1.5;
    const n = Math.ceil(need / items.massOfPair(D_sub.S.copper, D_form.F.ore));
    run.write.collect(D_sub.S.copper, D_form.F.ore, n);
    const y0 = player.player.y;
    runReal(30, 1 / 120, { up: true, hasMouse: false });
    if (player.player.y < y0)
      fail(`BURDEN: a climb intent at 150% burden still moved the player up (${(y0 - player.player.y).toFixed(2)} px)`);
    else ok('BURDEN: a climb intent at or over the hard cap produces no upward movement');
  }
}

/* --- LIGHT --- */
{
  /* Deterministic across two runs of one seed -- the same claim
     DETERMINISM above already makes over the whole state hash (which
     includes a light checksum per band), restated narrowly here so a light
     regression reads as a LIGHT failure rather than a generic state-hash
     diff. */
  const seed = 3131;
  const lightFingerprint = () => {
    boot.newRun(seed);
    runReal(300, 1 / 120, { right: true, dig: true, hasMouse: false });
    return world.bands.map(b => sumBytes(b.light)).join(',');
  };
  const l1 = lightFingerprint(), l2 = lightFingerprint();
  if (l1 !== l2) fail('LIGHT: propagation diverged across two runs of the same seed');
  else ok('LIGHT: propagation is deterministic -- identical light checksum across two runs of one seed');
}
{
  /* A fully enclosed, unlit chamber reads light 0 at every interior tile.
     The player stays wherever `newRun` put them (SURFACE band, per
     `data/world.js#SPAWN_BAND`) -- a different band's `light` array
     entirely, so their own carried brand cannot leak into a TOPSOIL room no
     matter how the two happen to line up in world space. */
  boot.newRun(1);
  const band = world.bandOf('topsoil');
  const tx0 = 40, ty0 = 200, w = 10, h = 6;
  for (let ty = ty0; ty < ty0 + h; ty++) for (let tx = tx0; tx < tx0 + w; tx++) tiles.write.clear(band, tx, ty);
  for (let tx = tx0 - 1; tx <= tx0 + w; tx++) {
    tiles.write.set(band, tx, ty0 - 1, D_sub.S.stone);
    tiles.write.set(band, tx, ty0 + h, D_sub.S.stone);
  }
  for (let ty = ty0 - 1; ty <= ty0 + h; ty++) {
    tiles.write.set(band, tx0 - 1, ty, D_sub.S.stone);
    tiles.write.set(band, tx0 + w, ty, D_sub.S.stone);
  }
  runReal(5, 1 / 120, { hasMouse: false });
  let litInside = 0;
  for (let ty = ty0 + 1; ty < ty0 + h - 1; ty++)
    for (let tx = tx0 + 1; tx < tx0 + w - 1; tx++)
      if (world.lightAt(band, tx, ty) !== 0) litInside++;
  if (litInside) fail(`LIGHT: ${litInside} interior tile(s) of a fully sealed, unlit chamber read a nonzero light level`);
  else ok('LIGHT: a fully enclosed, unlit chamber reads light 0 at every interior tile');
}
{
  /* A lit tile behind ENOUGH rock is dark -- "enough" computed from the
     live tunables rather than the plan's illustrative "two tiles", which
     does not by itself fully attenuate THIS project's actual brazier
     level/falloff combination (12 over 3-per-tile needs four, not two).
     Bounds the falloff meaningfully: dark at the computed distance, still
     lit one tile short of it, so this cannot be satisfied by "everything
     underground reads 0". */
  boot.newRun(1);
  const band = world.bandOf('topsoil');
  const ex = 60, ey = 210;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tiles.write.clear(band, ex + dx, ey + dy);
  const brazier = machs.write.place(band, D_mach.M.brazier, ex, ey);
  machs.write.take(brazier, D_sub.S.timber, D_form.F.log, 20);

  const level = D_mach.MACH[D_mach.M.brazier].light.level;
  const rockFalloff = mods.eff('lightFalloffRock');
  const K = Math.ceil(level / rockFalloff);
  for (let i = 1; i <= K + 2; i++) tiles.write.set(band, ex + i, ey, D_sub.S.stone);

  runReal(20, 1 / 120, { hasMouse: false });
  const stillLit = world.lightAt(band, ex + (K - 1), ey);
  const dark = world.lightAt(band, ex + K, ey);
  if (!(stillLit > 0))
    fail(`LIGHT: ${K - 1} rock tile(s) from a level-${level} emitter should still be lit (falloffRock=${rockFalloff}), read ${stillLit}`);
  else if (dark !== 0)
    fail(`LIGHT: ${K} rock tile(s) from a level-${level} emitter should be fully dark (falloffRock=${rockFalloff}), read ${dark}`);
  else ok(`LIGHT: a level-${level} emitter is dark after ${K} tile(s) of solid rock, still lit at ${K - 1} (falloffRock=${rockFalloff})`);
}
{
  /* Light recomputation is not per frame. The player stands still, nothing
     digs, nothing is placed -- `isDirty()` should find nothing changed after
     the very first settle and stop recomputing entirely. */
  boot.newRun(4242);
  runReal(5, 1 / 120, { hasMouse: false });
  let recomputes = 0;
  const origClearLight = world.write.clearLight;
  world.write.clearLight = (...a) => { recomputes++; return origClearLight(...a); };
  runReal(600, 1 / 120, { hasMouse: false });
  world.write.clearLight = origClearLight;
  const bound = world.bands.length * 2;
  if (recomputes > bound)
    fail(`LIGHT: ${recomputes} recompute(s) over 600 idle substeps (bound ${bound}) -- recomputing far more often than "only when something changed"`);
  else ok(`LIGHT: only ${recomputes} recompute(s) over 600 idle substeps (bound ${bound}) -- not per frame`);
}

/* --- RENDER PURITY, extended over the view/ui/ tree (Phase 5a/5b): opening
   the main panel, giving it real content to draw (an inventory, a crafting
   grid, an equipped trinket) and hovering a slot must not move the epoch
   counter or consume randomness any more than the plain-HUD case already
   proven in section 2 above. --- */
{
  boot.newRun(2222);
  run.write.collect(D_sub.S.copper, D_form.F.ore, 5);
  run.write.collect(D_sub.S.timber, D_form.F.log, 3);
  shellUi.open('main');
  shellUi.setTab('main', 'craft');
  input.cmd.mx = player.player.x; input.cmd.my = player.player.y; input.cmd.hasMouse = true;
  main.draw();                                   // let the panel populate view/ui/state.js#drawn once

  const before = epoch.epoch.n;
  main.draw();
  main.draw();
  const after = epoch.epoch.n;
  if (after !== before) fail(`render() with the main panel open performed ${after - before} model write(s)`);
  else ok(`render() with the main panel open: two renders, 0 model writes (epoch ${before})`);

  rng.seedRng(77);
  const expected = [rng.rand(), rng.rand(), rng.rand()];
  rng.seedRng(77);
  const got = [];
  for (let i = 0; i < 3; i++) { main.draw(); main.draw(); got.push(rng.rand()); }
  if (got.join() !== expected.join())
    fail('render() with the main panel open consumed randomness -- the seeded stream diverged across draws');
  else ok('render() with the main panel open consumes no randomness (invariant 7)');

  shellUi.close('main');
}

/* ============================================================
   5. PHASE 8G — SEGMENT TRANSPORT: THE DRIVETRAIN, THE CARRIER, THE RIDE
   ------------------------------------------------------------
   Everything Phase 8f landed (`rules/drive.js`, `model/segments.js`, the ride
   branch in `rules/player.js`), asserted as PROPERTIES rather than as one
   worked example. docs/SPEC.md section 17 is the contract; where the shipped
   formula deviates from docs/PLAN-gears-and-winches.md section 4.3 -- the
   `* drive` factor on the ascent case -- these tests are written against
   17.8, which records the deviation and the argument for it, and against
   `rules/drive.js`'s own header, which states the same argument at the code.

   EVERY PROBE HERE DRIVES THE REAL `main.step()` through `stepReal`, and
   nothing re-implements the motion expression except `predictV` below, which
   is a DELIBERATE second implementation transcribed from docs/SPEC.md 17.8
   and exists precisely so that a change to `rules/drive.js` disagrees with
   the spec instead of silently redefining it.
   ============================================================ */
console.log('\n5. segment transport (Phase 8g)');

/* ---------- ONE RIG, DECLARED AS DATA ----------
   A shaft carved in `topsoil`, hubs placed, segments linked THROUGH THE REAL
   `linkCheck` (a rig that silently failed to link would photograph as two
   hubs and no cable -- CLAUDE.md's "a test can silently test nothing"), the
   carriers parked, the player either standing at a crank or aboard a carrier,
   and cargo already at rest on the deck.

   `topsoil` and not `surface`: 320 rows of solid rock with nothing in it but
   what this rig puts there, so no relief, no tree and no vein can wander into
   a span and refuse a link. The floor row is laid last so the player has
   something to stand on after the carve. */
const RIG = { band: 'topsoil', tx0: 18, w: 12 };

function driveRig(spec) {
  boot.newRun(spec.seed ?? 8080);
  const band = world.bandOf(spec.band ?? RIG.band);
  const { tx0, ty0, w, h } = { tx0: RIG.tx0, w: RIG.w, ...spec.room };
  for (let ty = ty0; ty < ty0 + h; ty++)
    for (let tx = tx0; tx < tx0 + w; tx++) tiles.write.clear(band, tx, ty);
  for (let tx = tx0; tx < tx0 + w; tx++) tiles.write.set(band, tx, ty0 + h - 1, D_sub.S.stone);
  for (const [tx, ty, n] of spec.rock ?? [])
    for (let i = 0; i < (n ?? 1); i++) tiles.write.set(band, tx + i, ty, D_sub.S.stone);

  /* Both of these are REAL MODIFIER ROWS through the real `eff()` pipeline --
     the same shape a boon's row has -- and not a poke at a frozen table. A
     40-tile span is a legal build for a hub whose reach a god has widened;
     it is not reachable by the base `hub.reach` of 96 px, and the point of
     going through `model/mods.js` is that the harness never needs to know
     that. */
  if (spec.reachMul) mods.write.add('rig-reach', [{ key: 'segReach', mul: spec.reachMul }]);
  if (spec.torqueMul) mods.write.add('rig-torque', [{ key: 'crankTorque', mul: spec.torqueMul }]);

  const placed = (spec.machines ?? []).map(([id, tx, ty]) => machs.write.place(band, D_mach.M[id], tx, ty));
  const built = [];
  for (const [i, j] of spec.links ?? []) {
    const c = segs.linkCheck(placed[i], placed[j]);
    if (!c.ok) { fail(`RIG: link ${i}-${j} refused (${c.why}) -- the rig itself is not buildable`); continue; }
    built.push(segs.write.link(placed[i], placed[j]));
  }
  for (const [i, t] of spec.carriers ?? []) segs.write.carrier(built[i], t, 0);

  player.write.band(band);
  if (spec.ride !== undefined) {
    const seg = built[spec.ride];
    player.write.move(segs.carrierPos(seg).x - player.PW / 2, segs.carrierTop(seg) - player.PH);
  } else {
    player.write.move(world.worldX(band, spec.player[0]), world.worldY(band, spec.player[1]));
  }
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  player.write.set('fallFrom', player.player.y);

  /* CARGO IS SPAWNED ALREADY AT REST. `rules/drive.js#haul` pins it every
     substep from the first one, but a freshly spawned item is awake and
     `rules/items.js` would give it one substep of gravity before the haul
     ever saw it -- which at 1/120 s is a fifth of a pixel and at 1/30 s is
     three, and three is enough to leave a 10 px grab band over a long run.
     `rest = 1` is the same field `haul` itself writes. */
  for (const [i, sub, form, n] of spec.cargo ?? []) {
    const p = segs.carrierPos(built[i]);
    for (let k = 0; k < n; k++) {
      const it = items.write.spawn(band, p.x, p.y, D_sub.S[sub], D_form.F[form], 0, 0);
      if (it) it.rest = 1;
    }
  }
  if (spec.burden) run.write.collect(D_sub.S.copper, D_form.F.ore, spec.burden);

  return { band, placed, segs: built, seg: built[0] };
}

/* A VERTICAL 10-TILE SEGMENT WITH ONE CRANK AT ITS FOOT, and the player
   standing on the floor beside the crank -- 21 px from the carrier, which is
   more than `eff('pickupR')` (10 px), so cargo on the deck is never quietly
   pocketed out of the mass term the whole section is about. */
const ONE_CRANK = {
  room: { ty0: 100, h: 18 },
  machines: [['hub', 20, 115], ['hub', 20, 105], ['crank', 19, 115]],
  links: [[0, 1]],
  player: [18, 115]
};

/* Along-the-cable velocity in px/s, + is UP, measured from the carrier
   parameter the simulation actually wrote. */
function measureV(seg, secs, dt, want = { turn: true }) {
  const t0 = seg.t;
  const n = Math.round(secs / dt);
  runReal(n, dt, { hasMouse: false, ...want });
  return ((seg.t - t0) * seg.len) / (n * dt);
}

/* THE TORQUE ONE CRANK SUPPLIES, READ AT CALL TIME AND NEVER CACHED. It is
   `crank.torque` through `eff('crankTorque', 'crank')`, and the ascent sweep
   below deliberately bends that modifier -- so a `const` hoisted to the top of
   a block would capture whatever the PREVIOUS block left in `model/mods.js`.
   It did, on the first draft of the torque-conservation section (2.4 instead
   of 1.5), and CLAUDE.md's "a harness can be wrong about correct code" is
   exactly that failure. Call it after the rig is built: `driveRig` runs
   `newRun`, which clears every modifier row. */
const crankTorque = () =>
  D_mach.MACH[D_mach.M.crank].crank.torque * mods.eff('crankTorque', 'crank');

/* DOCS/SPEC.MD 17.8, TRANSCRIBED. A second implementation on purpose: the
   assertions below compare the simulation against THIS, so a change to
   `rules/drive.js` has to disagree with the spec to pass unnoticed. */
function predictV(supply, mass, slope, demand = null) {
  const base = mods.eff('segBase');
  const need = base + mods.eff('segLoad') * mass * slope;
  const drive = (demand ?? need) > 0 ? Math.min(1, supply / (demand ?? need)) : 0;
  const surplus = supply - need;
  if (surplus > 0) return mods.eff('segUp') * Math.min(1, surplus / base) * drive;
  if (surplus < 0) return -mods.eff('segDown') * Math.min(1, -surplus / base) * slope;
  return 0;
}

/* --- FRAMERATE INDEPENDENCE (invariant 10) applied to this mechanic: ten
   simulated seconds of carrier travel, and ten of a RIDING player's own
   displacement, must come out the same at 30, 60, 90 and 144 fps. This is the
   same class of bug as the truncated-byte mining progress CLAUDE.md opens
   with, and `rules/drive.js` is the newest place in the game where a `dt`
   could get squared or dropped.

   TWO CASES, because they exercise different code: the carrier case is a
   POWERED ASCENT with cargo (the `surplus > 0` branch, and the whole
   supply/demand/drive solve behind it), driven by a player standing at the
   crank; the rider case is an UNPOWERED DESCENT (the `surplus < 0` branch)
   with the player aboard, which is the only state in which a rider can be
   measured over ten whole seconds -- a crank has a 12 px reach and a
   descending rider leaves it in the first pixel, which is a fact about the
   design, not a gap in the test (see WEIGHT REVERSES IT below).

   The 40-tile cable the rider case needs is built through a real
   `segReach` modifier row, not by bypassing `linkCheck`. --- */
{
  const RATES = [30, 60, 90, 144];
  const rows = [];
  for (const fps of RATES) {
    const dt = 1 / fps;

    const a = driveRig({ ...ONE_CRANK, seed: 8080, cargo: [[0, 'copper', 'ore', 4]] });
    const carrier = measureV(a.seg, 10, dt, { turn: true }) * 10;

    const b = driveRig({
      seed: 8081, reachMul: 5,
      room: { ty0: 60, h: 58 },
      machines: [['hub', 20, 115], ['hub', 20, 75]],
      links: [[0, 1]], carriers: [[0, 1]], ride: 0
    });
    const y0 = player.player.y;
    runReal(Math.round(10 * fps), dt, { hasMouse: false });
    rows.push({ fps, carrier, rider: player.player.y - y0, t: b.seg.t });
  }

  console.log('  ..  ride framerate table, 10 simulated seconds:');
  console.log('        fps   carrier px (up, 4 T aboard, 1 crank)   rider px (down, unpowered)');
  for (const r of rows)
    console.log(`        ${String(r.fps).padStart(3)}   ${r.carrier.toFixed(4).padStart(37)}   ` +
                `${r.rider.toFixed(4).padStart(25)}`);

  /* One tenth of a pixel over ten seconds -- a hundredth of the 5.5 px/s the
     carrier is climbing at, and far below anything the 8 px tile could show.
     Not zero, because a 1/30 s step and a 1/120 s step accumulate a different
     number of float additions to reach the same total. */
  const TOL = 0.1;
  const spread = k => Math.max(...rows.map(r => r[k])) - Math.min(...rows.map(r => r[k]));
  if (spread('carrier') > TOL)
    fail(`FRAMERATE: carrier travel over 10 s spread ${spread('carrier').toFixed(4)} px across ` +
         `${RATES.join('/')} fps (tolerance ${TOL}) -- a carrier's speed depends on the framerate`);
  else ok(`FRAMERATE: carrier travel over 10 s is ${rows[0].carrier.toFixed(2)} px at all of ` +
          `${RATES.join('/')} fps (spread ${spread('carrier').toFixed(4)} px)`);

  if (spread('rider') > TOL)
    fail(`FRAMERATE: a RIDING player's displacement over 10 s spread ${spread('rider').toFixed(4)} px ` +
         `across ${RATES.join('/')} fps (tolerance ${TOL}) -- the ride depends on the framerate`);
  else ok(`FRAMERATE: a riding player falls the identical ${rows[0].rider.toFixed(2)} px in 10 s at all of ` +
          `${RATES.join('/')} fps (spread ${spread('rider').toFixed(4)} px)`);

  /* The ride is not merely CONSISTENT, it is the carrier's own travel: an
     unpowered vertical segment descends at the full `segDown`, so ten seconds
     is 260 px, and a rider who had silently detached would read 0 or a
     free-fall figure instead. */
  const wantRider = mods.eff('segDown') * 10;
  if (Math.abs(rows[0].rider - wantRider) > 1)
    fail(`FRAMERATE: a riding player fell ${rows[0].rider.toFixed(2)} px in 10 s, but an unpowered ` +
         `vertical carrier descends at the full segDown (${mods.eff('segDown')} px/s) = ${wantRider} px ` +
         `-- the rider is not tracking the carrier`);
  else ok(`RIDE TRACKS THE CARRIER: 10 s of unpowered descent moves the rider ${rows[0].rider.toFixed(2)} px, ` +
          `the full segDown x 10 s (${wantRider} px)`);
}

/* --- THE MOTION EXPRESSION, AS A TABLE. docs/SPEC.md 17.8 states three cases
   and then measures five rows of one of them; this is that table plus the two
   geometries it does not cover (a 45-degree span and a horizontal one) and the
   unpowered column, every cell measured off the real `main.step()` and
   compared against `predictV`'s independent transcription of the spec.

   THE EXACT BOUNDARY IS A ROW OF ITS OWN. At 20 T aboard a vertical segment,
   `need` is 1.5 and one crank supplies exactly 1.5, so `surplus` is exactly
   zero and the carrier must HOLD STILL -- not creep, not jitter. That is the
   only row in the table whose expected value is an exact 0, and it is the one
   a sign error in the surplus test would move first.

   A HORIZONTAL SEGMENT IS NOT A SPECIAL CASE AND IT IS NOT INERT EITHER: at
   `slope = 0` the load term vanishes, so `need` is `segBase` whatever is
   aboard and one crank has a surplus -- the carrier travels ALONG the cable,
   which is horizontally, at the full unloaded rate. It gains no height, so
   invariant 4 is untouched (ASCENT IS NEVER CHEAP below asserts that
   separately, in world-y terms rather than along-cable ones), and the
   unpowered horizontal row is the one the spec does call out: `segDown x 0`,
   dead still. --- */
{
  /* Three geometries. The 45-degree span is 113 px long and the base
     `hub.reach` is 96, so it needs a real `segReach` row -- same as the
     40-tile cable above, and for the same reason. */
  const GEOM = {
    vertical: { slope: 1, spec: {
      room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['crank', 19, 115], ['crank', 19, 113]],
      links: [[0, 1]], player: [18, 115] } },
    diagonal: { slope: Math.abs(-80) / Math.hypot(80, 80), spec: {
      reachMul: 2,
      room: { ty0: 100, h: 18, w: 16 },
      machines: [['hub', 20, 115], ['hub', 30, 105], ['crank', 19, 115], ['crank', 19, 113]],
      links: [[0, 1]], player: [18, 115] } },
    horizontal: { slope: 0, spec: {
      room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 28, 115], ['crank', 19, 115], ['crank', 19, 113]],
      links: [[0, 1]], player: [18, 115] } }
  };

  /* `cranks` is how many of the two placed cranks are within reach and
     therefore contributing; both are, so this only ever selects how many the
     rig PLACES. */
  const TABLE = [
    ['vertical',   0, 1, 'SPEC 17.8: nothing aboard, climbs at 5.5'],
    ['vertical',   4, 1, 'SPEC 17.8: 4 T of ore, climbs at 4.4'],
    ['vertical',  20, 1, 'SPEC 17.8: the exact surplus == 0 boundary -- HOLDS STILL'],
    ['vertical',  38, 1, 'SPEC 17.8: 38 T, runs backwards at 11.7'],
    ['vertical',  40, 1, 'SPEC 17.8: the burden cap aboard, backwards at 13'],
    ['vertical',   0, 0, 'unpowered: the full segDown'],
    ['vertical',  40, 0, 'unpowered and loaded: still the full segDown'],
    ['vertical',   0, 2, 'two cranks: capped at segUp, never past it'],
    ['diagonal',   0, 1, '45 degrees, empty'],
    ['diagonal',  40, 1, '45 degrees at the cap: slope scales the load term, so it reverses gently (-3.8, not -13)'],
    ['diagonal',  40, 0, '45 degrees, unpowered: segDown x slope'],
    ['horizontal', 0, 1, 'horizontal: no height, so no load term'],
    ['horizontal', 40, 1, 'horizontal and loaded: the load term is slope-scaled to nothing'],
    ['horizontal', 40, 0, 'horizontal, unpowered: segDown x 0 -- dead still']
  ];

  let bad = 0;
  console.log('  ..  the motion expression (docs/SPEC.md 17.8), 1 s per row, measured px/s along the cable:');
  for (const [geomId, mass, cranks, why] of TABLE) {
    const g = GEOM[geomId];
    const spec = { ...g.spec, seed: 8100 + bad, carriers: [[0, 0.5]] };
    /* Only the cranks this row wants: the rig places both and the unused one
       is dropped, rather than moved out of reach, so "in reach" stays a
       property of the geometry and not of a fudge factor. */
    spec.machines = spec.machines.filter((m, i) => i < 2 || i - 2 < cranks);
    if (mass) spec.cargo = [[0, 'copper', 'ore', mass]];
    const r = driveRig(spec);
    const supply = cranks * crankTorque();
    const want = predictV(supply, mass, g.slope);
    const got = measureV(r.seg, 1, 1 / 120, { turn: cranks > 0 });
    const flag = Math.abs(got - want) > 1e-6 ? ' <-- MISMATCH' : '';
    console.log(`        ${geomId.padEnd(10)} slope ${g.slope.toFixed(3)}  ${String(mass).padStart(2)} T  ` +
                `${cranks} crank(s)  supply ${supply.toFixed(2)}  want ${want.toFixed(4).padStart(9)}  ` +
                `got ${got.toFixed(4).padStart(9)}${flag}   ${why}`);
    if (flag) {
      fail(`MOTION: ${geomId} segment, ${mass} T aboard, ${cranks} crank(s) -- docs/SPEC.md 17.8 gives ` +
           `${want.toFixed(4)} px/s along the cable, the simulation produced ${got.toFixed(4)} (${why})`);
      bad++;
    }
    /* The SIGN is asserted separately from the magnitude, because it is the
       half a reader of this table cares about: does weight reverse it. */
    if (Math.sign(got) !== Math.sign(want)) bad++;
  }
  if (!bad) ok(`MOTION: all ${TABLE.length} rows of the motion expression match docs/SPEC.md 17.8 ` +
               `exactly (three geometries x load x supply, including the surplus == 0 boundary)`);
}

/* --- WEIGHT REVERSES IT. The load-bearing correction in
   docs/PLAN-gears-and-winches.md, and CLAUDE.md D4 as amended: BOARDING IS
   NEVER REFUSED AT ANY WEIGHT, because an over-cap rider is real mass in
   `rules/drive.js#step`'s own arithmetic and the carrier therefore slows,
   stalls and then runs backwards under them. A refusal would be a permission;
   this is physics, and it gets its own named assertion.

   Three rows on ONE crank, straddling the 20 T break-even docs/SPEC.md 17.4
   locks -- and the rider's own body is 8 T of it, so the pockets straddle 12:

     empty pockets   mass  8 T   climbs
     12 T of ore     mass 20 T   HOLDS STILL, the exact boundary
     30 T of ore     mass 38 T   RUNS BACKWARDS, over 5 s, net negative

   THE CRANK IS PROVABLY TURNING WHEN IT REVERSES, which is the whole claim:
   `m.torque` is the component's delivered `drive` and is nonzero only while a
   crank is in reach, so asserting it on the substep the reversal is measured
   rules out the trivial reading (that the carrier sank because nobody was
   cranking). A crank's reach is 12 px and a rider descending at 11.7 px/s
   leaves it inside two seconds, so the 5 s figure is measured with the crank
   held THROUGHOUT and in reach for the first stretch only -- which makes the
   net figure more negative, never less, and the fraction is printed rather
   than hidden. --- */
{
  const at = (crankTy, carrierT) => ({
    room: { ty0: 100, h: 18 },
    machines: [['hub', 20, 115], ['hub', 20, 105], ['crank', 19, crankTy]],
    links: [[0, 1]], player: [18, 115], carriers: [[0, carrierT]], ride: 0
  });
  const ROWS = [
    ['climbs',        at(115, 0), 0,  +1],
    ['holds still',   at(115, 0), 12,  0],
    ['runs backwards', at(105, 1), 30, -1]
  ];

  let bad = 0;
  for (const [name, spec, burden, wantSign] of ROWS) {
    const r = driveRig({ ...spec, seed: 8200 + burden, burden });
    const mass = mods.eff('riderMass') + run.burdenOf();
    const crank = r.placed[2];

    const before = r.seg.t, y0 = player.player.y;
    stepReal(1 / 120, { turn: true, hasMouse: false });
    const v1 = (r.seg.t - before) * r.seg.len * 120;
    const drove = crank.torque > 0;

    let lit = 1;
    for (let i = 1; i < 600; i++) {
      stepReal(1 / 120, { turn: true, hasMouse: false });
      if (crank.torque > 0) lit++;
    }
    const net = (r.seg.t - before) * r.seg.len;
    const riderNet = player.player.y - y0;
    const want = predictV(D_mach.MACH[D_mach.M.crank].crank.torque * mods.eff('crankTorque', 'crank'), mass, 1);

    if (!drove) {
      fail(`WEIGHT: the "${name}" row measured its first substep with NO torque delivered ` +
           `(m.torque 0) -- the crank was not in reach, so the row proves nothing about weight`);
      bad++;
    }
    if (Math.abs(v1 - want) > 1e-6) {
      fail(`WEIGHT: rider mass ${mass} T on one crank -- docs/SPEC.md 17.8 gives ${want.toFixed(4)} px/s, ` +
           `the first powered substep produced ${v1.toFixed(4)}`);
      bad++;
    }
    if (Math.sign(net) !== wantSign) {
      fail(`WEIGHT: rider mass ${mass} T, one crank HELD for 5 s -- net carrier displacement ` +
           `${net.toFixed(3)} px (sign ${Math.sign(net)}), expected sign ${wantSign}`);
      bad++;
    }
    if (Math.sign(riderNet) !== -wantSign) {
      fail(`WEIGHT: rider mass ${mass} T -- the carrier moved ${net.toFixed(3)} px along the cable but ` +
           `the RIDER moved ${riderNet.toFixed(3)} px in world y; they must move together`);
      bad++;
    }
    console.log(`  ..  weight: pockets ${String(burden).padStart(2)} T -> mass ${String(mass).padStart(2)} T  ` +
                `first substep ${v1.toFixed(4).padStart(9)} px/s  net over 5 s ${net.toFixed(2).padStart(8)} px  ` +
                `rider ${riderNet.toFixed(2).padStart(8)} px  crank in reach ${lit}/600 substeps  (${name})`);
  }

  /* The one thing said out loud, and ONLY in the one state that is otherwise
     baffling (D4 as amended): a crank is being turned and the thing is going
     down anyway. Re-run the reversing row alone and read the journal, which
     `stepReal` never drains. */
  {
    const r = driveRig({ ...at(105, 1), seed: 8299, burden: 30 });
    runReal(600, 1 / 120, { turn: true, hasMouse: false });
    const rows = journal.peek().filter(j => j.kind === 'refused' && j.data?.why === 'TOO HEAVY TO LIFT');
    if (!rows.length) {
      fail(`WEIGHT: a crank held on a reversing carrier pushed no 'TOO HEAVY TO LIFT' journal row -- ` +
           `the one state D4 says must be said out loud is silent`);
      bad++;
    } else if (rows.length > 6) {
      fail(`WEIGHT: 'TOO HEAVY TO LIFT' fired ${rows.length} times in 5 s -- the REFUSAL_GAP rate limit ` +
           `in rules/drive.js is not holding (expected at most one per second)`);
      bad++;
    } else {
      /* And it must be SILENT when the crank is not being turned: an
         unpowered carrier sinking is not news, it is the premise. */
      driveRig({ ...at(105, 1), seed: 8298, burden: 30 });
      runReal(600, 1 / 120, { hasMouse: false });
      const quiet = journal.peek().filter(j => j.kind === 'refused' && j.data?.why === 'TOO HEAVY TO LIFT');
      if (quiet.length) {
        fail(`WEIGHT: 'TOO HEAVY TO LIFT' fired ${quiet.length} time(s) with NO crank turned -- ` +
             `an unpowered carrier sinking is the premise, not a refusal`);
        bad++;
      }
    }
  }

  if (!bad) ok(`WEIGHT REVERSES IT: 8 T climbs, 20 T holds at the exact break-even, 38 T runs backwards ` +
               `with the crank provably turning -- and says 'TOO HEAVY TO LIFT' once a second, only then`);
}

/* --- NOTHING MAKES ASCENT CHEAP (CLAUDE.md invariant 4, and the premise the
   whole project is one sentence of). A seeded property test over 2,000 random
   (slope x mass x supply) triples, measured off the real `main.step()` one
   substep at a time, asserting two things no combination may ever break:

     1. no triple ascends faster than `eff('segUp')` ALONG THE CABLE, and none
        gains height faster than that in world y either. `segUp` is 11 px/s,
        which is under half the 26 px/s a carrier falls at for free, and the
        `min(1, surplus / segBase)` clamp and the `drive` fraction are what
        hold the line -- neither of which is obvious from the expression, and
        both of which a "helpful" simplification would remove.
     2. NO UNPOWERED SEGMENT EVER ASCENDS. Not slowly, not at slope 0, not
        under any load: with no crank turned, `surplus` is `-need`, which is at
        least `segBase`, so the sign is negative or the motion is zero.

   Supply is swept through a REAL `crankTorque` modifier row (0x to 6x, i.e.
   0 to 9 units of torque against a `segBase` of 1) rather than by editing the
   frozen `data/machines.js` row, so the sweep is exactly the range a stack of
   boons could actually produce. Mass is swept with real items resting on the
   deck, respawned per triple. Slope is the one parameter that is geometry, so
   it is four rigs rather than a number: vertical, 45 degrees, shallow, and
   flat. --- */
{
  const GEOMS = [
    ['vertical', 1, { room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['crank', 19, 115]] }],
    ['45deg', 0, { reachMul: 2, room: { ty0: 100, h: 18, w: 16 },
      machines: [['hub', 20, 115], ['hub', 30, 105], ['crank', 19, 115]] }],
    ['shallow', 0, { room: { ty0: 100, h: 18, w: 16 },
      machines: [['hub', 20, 115], ['hub', 30, 112], ['crank', 19, 115]] }],
    ['flat', 0, { room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 28, 115], ['crank', 19, 115]] }]
  ];

  const ctl = rng.mulberry(0xA5CE47);
  const PER = 500;
  let tried = 0, worstV = -Infinity, worstRise = -Infinity, unpoweredUp = 0, mismatch = 0;
  let overCable = 0, overRise = 0, worstAt = '';

  for (const [name, , spec] of GEOMS) {
    const r = driveRig({ ...spec, seed: 8300, links: [[0, 1]], player: [18, 115] });
    const seg = r.seg;
    const slope = seg.slope;
    const cargo = [];

    for (let i = 0; i < PER; i++) {
      /* Half the triples are unpowered, which is assertion 2's whole
         population; `mul` of 0 with the key held down is a third case (a god
         who has taken all your torque away) and must behave identically. */
      const powered = ctl() < 0.5;
      const mul = Math.round(ctl() * 60) / 10;                 // 0.0 .. 6.0
      const units = Math.round(ctl() * 60);                    // 0 .. 60 T of ore
      const half = ctl() < 0.5;

      mods.write.removeBySource('rig-torque');
      mods.write.add('rig-torque', [{ key: 'crankTorque', mul }]);

      for (const it of cargo) items.write.remove(it);
      cargo.length = 0;
      const p0 = segs.carrierPos(seg);
      for (let k = 0; k < units; k++) {
        const it = items.write.spawn(r.band, p0.x, p0.y, D_sub.S.copper, D_form.F.ore, 0, 0);
        if (it) { it.rest = 1; cargo.push(it); }
      }
      if (half) {
        const it = items.write.spawn(r.band, p0.x, p0.y, D_sub.S.copper, D_form.F.gravel, 0, 0);
        if (it) { it.rest = 1; cargo.push(it); }
      }
      const mass = units + (half ? 0.5 : 0);

      segs.write.carrier(seg, 0.5, 0);
      const before = segs.carrierPos(seg), t0 = seg.t;
      stepReal(1 / 120, { turn: powered, hasMouse: false });
      const after = segs.carrierPos(seg);
      const v = (seg.t - t0) * seg.len * 120;                  // px/s along the cable
      const rise = (before.y - after.y) * 120;                 // px/s of world height GAINED
      tried++;

      if (v > worstV) { worstV = v; worstAt = `${name}, ${mass} T, supply ${(mul * 1.5).toFixed(2)}`; }
      if (rise > worstRise) worstRise = rise;
      if (v > mods.eff('segUp') + 1e-6) overCable++;
      if (rise > mods.eff('segUp') + 1e-6) overRise++;
      if (!powered && v > 1e-9) unpoweredUp++;
      if (mul === 0 && v > 1e-9) unpoweredUp++;

      const supply = powered
        ? D_mach.MACH[D_mach.M.crank].crank.torque * mods.eff('crankTorque', 'crank') : 0;
      if (Math.abs(v - predictV(supply, mass, slope)) > 1e-6) mismatch++;
    }
  }

  console.log(`  ..  ascent sweep: ${tried} seeded (slope x mass x supply) triples, fastest ascent ` +
              `${worstV.toFixed(4)} px/s along the cable (${worstAt}), fastest height gain ` +
              `${worstRise.toFixed(4)} px/s, segUp = ${mods.eff('segUp')}`);

  if (overCable) fail(`ASCENT: ${overCable}/${tried} triples ascended FASTER than eff('segUp') along the cable ` +
                      `(worst ${worstV.toFixed(4)} px/s at ${worstAt}) -- something makes ascent cheap`);
  else if (overRise) fail(`ASCENT: ${overRise}/${tried} triples GAINED HEIGHT faster than eff('segUp') ` +
                          `(worst ${worstRise.toFixed(4)} px/s) -- something makes ascent cheap`);
  else ok(`ASCENT IS NEVER CHEAP: ${tried} seeded triples, none faster than eff('segUp') ` +
          `(${mods.eff('segUp')} px/s) along the cable OR in world height`);

  if (unpoweredUp) fail(`ASCENT: ${unpoweredUp} unpowered (or zero-torque) triples ASCENDED -- ` +
                        `a segment with nothing turning it must never rise`);
  else ok(`ASCENT: no unpowered segment ever ascends, over ${tried} triples (half of them unpowered, ` +
          `plus every zero-torque one)`);

  if (mismatch) fail(`ASCENT: ${mismatch}/${tried} triples disagreed with docs/SPEC.md 17.8's expression ` +
                     `-- the sweep found a combination the motion table above does not cover`);
  else ok(`ASCENT: all ${tried} triples also match docs/SPEC.md 17.8 exactly, not merely the bound`);
}

/* --- TORQUE CONSERVATION: one crank driving N segments delivers, in total, no
   more than its own torque. docs/SPEC.md 17.9's `drive = min(1, supply /
   demand)` is the whole mechanism, and `drive x demand <= supply` is the
   statement of it that does not depend on the formula's shape -- if a future
   change apportioned supply differently, THIS is the line that must still
   hold, because a drivetrain that delivers more than it is given is a
   perpetual-motion machine and CLAUDE.md's premise is that up costs.

   N ROWS OF HUBS, ONE COMPONENT. Bottom hubs are footprint-adjacent along the
   floor, so they flood into one component with the crank; the top hubs form a
   second, unpowered one; each segment joins one of each. `pick()` takes the
   GREATER of the two supplies, never the sum, which is the other half of the
   same conservation claim (docs/SPEC.md 17.9's "two half-fed drivetrains at
   opposite ends of one cable do not add up to a free ride").

   `drive` is read off `m.torque`, which `rules/drive.js` writes for every node
   -- so this measures what the drivetrain actually delivered, not a
   recomputation of it. --- */
{
  let bad = 0;
  for (const N of [1, 2, 5]) {
    const machines = [];
    for (let i = 0; i < N; i++) machines.push(['hub', 20 + i * 2, 115]);
    for (let i = 0; i < N; i++) machines.push(['hub', 20 + i * 2, 105]);
    machines.push(['crank', 19, 115]);
    const links = [];
    for (let i = 0; i < N; i++) links.push([i, N + i]);

    const r = driveRig({
      seed: 8400 + N, room: { ty0: 100, h: 18, w: 14 },
      machines, links, player: [18, 115],
      carriers: links.map((_, i) => [i, 0.5])
    });
    const crank = r.placed[2 * N];
    const CRANK_T = crankTorque();

    const t0 = r.segs.map(s => s.t);
    stepReal(1 / 120, { turn: true, hasMouse: false });
    const vs = r.segs.map((s, i) => (s.t - t0[i]) * s.len * 120);

    const demand = N * mods.eff('segBase');            // nothing aboard: need == segBase
    const drive = crank.torque;
    const delivered = drive * demand;
    const wantDrive = Math.min(1, CRANK_T / demand);
    const wantV = predictV(CRANK_T, 0, 1, demand);

    if (delivered > CRANK_T + 1e-9) {
      fail(`TORQUE CONSERVATION: one crank (torque ${CRANK_T}) driving ${N} segment(s) delivered ` +
           `drive ${drive.toFixed(4)} x demand ${demand.toFixed(2)} = ${delivered.toFixed(4)} -- ` +
           `more than it has`);
      bad++;
    }
    if (Math.abs(drive - wantDrive) > 1e-9) {
      fail(`TORQUE CONSERVATION: ${N} segment(s) on one crank -- m.torque is ${drive.toFixed(6)}, ` +
           `docs/SPEC.md 17.9's min(1, supply/demand) is ${wantDrive.toFixed(6)}`);
      bad++;
    }
    if (vs.some(v => Math.abs(v - wantV) > 1e-6)) {
      fail(`TORQUE CONSERVATION: ${N} segment(s) sharing one crank climb at ` +
           `[${vs.map(v => v.toFixed(4)).join(', ')}] px/s; the shared expression gives ${wantV.toFixed(4)} ` +
           `-- sharing must SLOW every segment equally, not stop some and speed others`);
      bad++;
    }
    /* The top hubs are in the unpowered component and must read a delivered
       drive of exactly 0 -- a segment is driven by the greater end, never by
       both. */
    const topDrive = r.placed.slice(N, 2 * N).map(m => m.torque);
    if (topDrive.some(d => d !== 0)) {
      fail(`TORQUE CONSERVATION: the unpowered top hubs read m.torque ` +
           `[${topDrive.join(', ')}] -- an undriven drivetrain delivers nothing`);
      bad++;
    }
    console.log(`  ..  torque: 1 crank (${CRANK_T} T-units) x ${N} segment(s): drive ${drive.toFixed(4)}, ` +
                `demand ${demand.toFixed(2)}, delivered ${delivered.toFixed(4)} <= ${CRANK_T}, ` +
                `each segment ${vs[0].toFixed(4)} px/s`);
  }
  if (!bad) ok('TORQUE CONSERVATION: one crank driving 1, 2 and 5 segments never delivers more drive ' +
               'than its own torque, and every shared segment slows by the same fraction');
}

/* --- GEAR LOSS IS MONOTONIC, AND A DIAGONAL DELIVERS ZERO
   (docs/PLAN-gears-and-winches.md A3, confirmed; docs/SPEC.md 17.9).

   A train of K gears laid along the floor between a crank and a hub: supply is
   `1.5 x 0.94^K`, so the carrier's climb rate must fall STRICTLY with every
   hop added, and past enough hops the crank can no longer lift an empty
   carrier at all. Monotonic is the assertion; the exact figures are printed.

   THE DIAGONAL IS THE OTHER HALF AND IT IS A ZERO, not a small number: a crank
   whose footprint only touches a hub's CORNER is in a component with no hub in
   it, contributes nothing, and the carrier sinks at the full `segDown`. Put a
   gear in the corner and the same crank drives it. Phase 8e's art is what
   teaches this to a player; this is what stops it drifting. --- */
{
  const LOSS = D_mach.MACH[D_mach.M.gear].gear.loss;
  const HOPS = [0, 1, 2, 3, 4, 6];
  const rows = [];
  let bad = 0;

  for (const K of HOPS) {
    /* crank at 12, K gears rightward along the floor, hub at 13+K. */
    const machines = [['crank', 12, 115]];
    for (let i = 0; i < K; i++) machines.push(['gear', 13 + i, 116]);
    machines.push(['hub', 13 + K, 115], ['hub', 13 + K, 105]);
    const r = driveRig({
      seed: 8500 + K, room: { tx0: 10, ty0: 100, h: 18, w: 14 },
      machines, links: [[K + 1, K + 2]], carriers: [[0, 0.5]], player: [11, 115]
    });
    const v = measureV(r.seg, 1, 1 / 120, { turn: true });
    const supply = crankTorque() * Math.pow(1 - LOSS * mods.eff('torqueLoss', 'gear'), K);
    const want = predictV(supply, 0, 1);
    rows.push({ K, v, supply, want, drive: r.placed[K + 1].torque });
    if (Math.abs(v - want) > 1e-6) {
      fail(`GEAR LOSS: ${K} hop(s) of gear between crank and hub -- supply should be ` +
           `${supply.toFixed(4)} and the climb ${want.toFixed(4)} px/s, measured ${v.toFixed(4)}`);
      bad++;
    }
  }

  console.log('  ..  gear loss: ' + rows.map(r => `${r.K} hop(s) ${r.v.toFixed(3)} px/s`).join(', ') +
              ` (loss ${LOSS} per gear, crank ${crankTorque()})`);

  for (let i = 1; i < rows.length; i++)
    if (!(rows[i].v < rows[i - 1].v - 1e-9)) {
      fail(`GEAR LOSS IS MONOTONIC: ${rows[i].K} hops climbs at ${rows[i].v.toFixed(4)} px/s, ` +
           `not slower than ${rows[i - 1].K} hops at ${rows[i - 1].v.toFixed(4)} -- torque must fall ` +
           `with every hop`);
      bad++;
    }
  if (!bad) ok(`GEAR LOSS IS MONOTONIC: the climb falls strictly with every gear hop ` +
               `(${rows[0].v.toFixed(2)} -> ${rows[rows.length - 1].v.toFixed(2)} px/s over ` +
               `${HOPS[HOPS.length - 1]} hops), matching 17.9's loss product exactly`);

  /* THE DIAGONAL. Crank footprint (19, 113..114) touches hub footprint
     (20..21, 115..116) at ONE CORNER and nowhere else. */
  {
    const r = driveRig({
      seed: 8590, room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['crank', 19, 113]],
      links: [[0, 1]], carriers: [[0, 0.5]], player: [18, 115]
    });
    const v = measureV(r.seg, 1, 1 / 120, { turn: true });
    const want = predictV(0, 0, 1);
    if (Math.abs(v - want) > 1e-6 || r.placed[2].torque !== 0)
      fail(`DIAGONAL DELIVERS ZERO: a crank touching a hub at the corner only drove the carrier at ` +
           `${v.toFixed(4)} px/s (m.torque ${r.placed[2].torque}); a diagonal does not conduct, so the ` +
           `carrier must sink at the full segDown (${want.toFixed(4)} px/s)`);
    else {
      /* And the contrast, or the assertion above would pass for a crank that
         had simply stopped working: put a GEAR in the corner and the same
         crank drives the same segment. */
      const g = driveRig({
        seed: 8591, room: { ty0: 100, h: 18 },
        machines: [['hub', 20, 115], ['hub', 20, 105], ['crank', 19, 113], ['gear', 19, 115]],
        links: [[0, 1]], carriers: [[0, 0.5]], player: [18, 115]
      });
      const gv = measureV(g.seg, 1, 1 / 120, { turn: true });
      const gWant = predictV(crankTorque() * (1 - LOSS * mods.eff('torqueLoss', 'gear')), 0, 1);
      if (Math.abs(gv - gWant) > 1e-6)
        fail(`DIAGONAL DELIVERS ZERO: with a GEAR in the corner the same crank should drive the same ` +
             `segment at ${gWant.toFixed(4)} px/s, measured ${gv.toFixed(4)} -- the zero above may be ` +
             `a broken crank rather than a broken diagonal`);
      else ok(`DIAGONAL DELIVERS ZERO: a corner-touching crank drives nothing (carrier sinks at ` +
              `${v.toFixed(1)} px/s); a gear in that corner drives it at ${gv.toFixed(2)} px/s`);
    }
  }
}

/* ---------- SHARED SPAN GEOMETRY, for the two link sections below ----------

   `chordThrough` IS AN INDEPENDENT SECOND IMPLEMENTATION, on purpose and in a
   different family of algorithm from the thing it judges. `model/segments.js`
   answers "is this span clear" by SAMPLING (the half-tile sweep); this answers
   it ANALYTICALLY, by clipping the span against a tile's closed box
   (Liang-Barsky) and returning how much of the span lies inside it. Two
   samplers with different step sizes would agree about the same blind spots; a
   sampler and a clipper do not.

   CLOSED boxes, deliberately. A span running exactly along a tile boundary
   lies inside the closed box of BOTH tiles that share it, so both count -- the
   identical rule `model/segments.js#solidNear` applies, and the reason
   commit b48203d had to be written at all. `p === 0 && q < 0` is "parallel and
   outside"; `q === 0` is "parallel and exactly on the edge", which is inside. */
const mixTo = (a, b, f) => a + (b - a) * f;

function chordThrough(pa, pb, x0, y0, x1, y1) {
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, pa.x - x0], [dx, x1 - pa.x], [-dy, pa.y - y0], [dy, y1 - pa.y]]) {
    if (p === 0) { if (q < 0) return 0; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return 0; if (r > t0) t0 = r; }
    else { if (r < t0) return 0; if (r < t1) t1 = r; }
  }
  return (t1 - t0) * Math.hypot(dx, dy);
}

/* The longest chord this span cuts through ANY solid tile of ANY band, and
   where. Scanned over every band the span's bounding box touches, so a
   cross-band span is one call and not a special case. */
function worstChord(pa, pb) {
  let worst = 0, at = null;
  const bx0 = Math.min(pa.x, pb.x), bx1 = Math.max(pa.x, pb.x);
  const by0 = Math.min(pa.y, pb.y), by1 = Math.max(pa.y, pb.y);
  for (const b of world.bands) {
    const lo = (v, o, t) => Math.floor((v - o) / t) - 1, hi = (v, o, t) => Math.floor((v - o) / t) + 1;
    const tx0 = Math.max(0, lo(bx0, b.origin.x, b.tile)), tx1 = Math.min(b.tw - 1, hi(bx1, b.origin.x, b.tile));
    const ty0 = Math.max(0, lo(by0, b.origin.y, b.tile)), ty1 = Math.min(b.th - 1, hi(by1, b.origin.y, b.tile));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (!tiles.solidAt(b, tx, ty)) continue;
      const x = world.worldX(b, tx), y = world.worldY(b, ty);
      const c = chordThrough(pa, pb, x, y, x + b.tile, y + b.tile);
      if (c > worst) { worst = c; at = `${b.id} (${tx},${ty})`; }
    }
  }
  return { worst, at };
}

/* The first point of the span that resolves to no band, or null. A dense
   sampler and not a clipper, because "outside every band" is a union of three
   rectangles rather than one box -- and unlike blockage, an off-world stretch
   of a span is never a thin corner clip: the bands' own edges are tile-aligned
   and hundreds of pixels long. */
function offWorldOn(pa, pb) {
  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const n = Math.max(1, Math.ceil(len / 1));
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const x = mixTo(pa.x, pb.x, f), y = mixTo(pa.y, pb.y, f);
    if (!world.bandAt(x, y)) return { x, y };
  }
  return null;
}

/* THE CLEAR WINDOW IS SIZED FROM THE SPAN, NEVER FROM A HUB'S PLACEMENT TILE,
   and this is the whole of a bug a previous attempt at this section shipped and
   then had to diagnose. A hub's anchor is its footprint CENTRE, which for a
   2x2 row is one tile ABOVE its placement row -- so a window carved as
   "ty-1 .. ty+2 around each hub's own tile" leaves the middle of the span
   untouched, and near a band seam it leaves the LOWER band's row 0 untouched
   too, which in real generated terrain is solid rock. The cross-band case then
   fails for a reason that has nothing to do with the code under test.

   So: walk the actual anchor-to-anchor line, and clear a (2*pad+1)^2 tile
   neighbourhood around every sample, in EVERY band -- `tiles.write.clear`
   bounds-checks itself (`model/tiles.js:107`), so a band the sample is nowhere
   near is a cheap no-op and the seam needs no arithmetic of its own. */
function clearAlong(pa, pb, pad = 1) {
  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const n = Math.max(1, Math.ceil(len / 2));
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const x = mixTo(pa.x, pb.x, f), y = mixTo(pa.y, pb.y, f);
    for (const b of world.bands) {
      const tx = Math.floor((x - b.origin.x) / b.tile), ty = Math.floor((y - b.origin.y) / b.tile);
      for (let dy = -pad; dy <= pad; dy++)
        for (let dx = -pad; dx <= pad; dx++) tiles.write.clear(b, tx + dx, ty + dy);
    }
  }
}

const anchorOfM = m => ({ x: m.box.x + m.box.w / 2, y: m.box.y + m.box.h / 2 });

/* --- LINK LEGALITY, OVER 240 SEEDED SPANS AT EVERY ANGLE, IN ONE BAND AND
   ACROSS BOTH SEAMS (docs/PLAN-gears-and-winches.md section 4.5,
   docs/SPEC.md 17.6).

   FOUR CLAIMS, and each is one-sided on purpose:

     1. A LINK IS ACCEPTED IF AND ONLY IF `linkCheck` SAYS SO. Every trial goes
        through the real `rules/placement.js#linkSegment`, so "accepted" means a
        record appeared in `model/segments.js#segments` and a `'link'` journal
        row was pushed -- and a refusal means no record and a `'refused'` row
        carrying the same `why` string the check returned. Two readers of one
        decision is the pattern (docs/DEVELOPER_GUIDE.md#one-decision-two-readers);
        this is the assertion that they have not drifted.

     2. AN ACCEPTED SPAN CUTS NO SOLID TILE BY AS MUCH AS HALF A TILE. Half a
        tile and not zero, and the bound is derived rather than tolerated: the
        sweep samples at `tile * 0.5` or finer (`model/segments.js:257-262`), and
        any interval of length >= the sample spacing must contain a sample. So a
        chord of half a tile or more is a blockage the sweep is GUARANTEED to
        see, and asserting it is asserting the sweep's own contract. A shorter
        chord -- a span clipping the corner of a tile for three pixels -- may
        legally pass, is cosmetic, and is printed rather than asserted so a
        future reader can see how often it actually happens.

     3. AN ACCEPTED SPAN LEAVES NO SAMPLE OFF-WORLD, at one-pixel resolution,
        which is eight times finer than the sweep looks.

     4. THE REFUSAL ORDER IS THE ORDER 17.6 LOCKS. `'TOO FAR APART'` outranks
        `'THE PATH IS BLOCKED'`, so a span that is both must say the structural
        one -- otherwise a player learns to clear rock out of a span that was
        never going to reach.

   THREE FAMILIES, EIGHTY TRIALS EACH: one wholly inside `topsoil`, one across
   the surface/topsoil seam, one across the astral/surface seam. The cross-band
   families are the ones that matter most (`bandAt` per sample is the only
   reason a cross-band cable works at all) and they are also the ones a badly
   sized clear window silently turns into "always blocked" -- hence the
   per-family accepted counts in the summary, and the assertion that each
   family accepted at least one span. A family that accepted nothing has tested
   nothing. --- */
{
  const TRIALS = 80;
  const STONE = D_sub.S.stone;
  const REACH = D_mach.MACH[D_mach.M.hub].hub.reach;

  /* Each family returns two [bandId, tx, ty] placements. The astral/surface
     pair shares a WORLD column, which is 16 tiles of offset because astral's
     own origin is x:128 (`data/world.js:44`) -- the 32-column dead zone
     docs/PLAN section 4.5 warns about, kept away from on purpose here so that
     this section measures blockage and not band geometry. */
  const FAMILIES = [
    { id: 'topsoil only', pick: r => [
      ['topsoil', 16 + (r() * 24 | 0), 100 + (r() * 12 | 0)],
      ['topsoil', 16 + (r() * 24 | 0), 100 + (r() * 12 | 0)]] },
    { id: 'surface/topsoil seam', pick: r => [
      ['surface', 30 + (r() * 14 | 0), 48 + (r() * 7 | 0)],
      ['topsoil', 30 + (r() * 14 | 0), (r() * 6 | 0)]] },
    { id: 'astral/surface seam', pick: r => {
      const col = 40 + (r() * 14 | 0);
      return [['astral', col - 16 + (r() * 3 | 0) - 1, 33 + (r() * 6 | 0)],
              ['surface', col + (r() * 3 | 0) - 1, (r() * 6 | 0)]];
    } }
  ];

  const BUCKETS = 6;                            // 30 degrees each, over 0..180
  const angles = Array.from({ length: BUCKETS }, () => 0);
  const tally = {};
  const perFamily = {};
  let bad = 0, clips = 0, worstClip = 0, tried = 0;

  for (const fam of FAMILIES) {
    perFamily[fam.id] = 0;
    for (let i = 0; i < TRIALS; i++) {
      const seed = 8700 + i;
      boot.newRun(seed);
      const r = rng.mulberry(0xC0FFEE ^ (seed * 2654435761 >>> 0));

      const [pa_, pb_] = fam.pick(r);
      const A = machs.write.place(world.bandOf(pa_[0]), D_mach.M.hub, pa_[1], pa_[2]);
      const B = machs.write.place(world.bandOf(pb_[0]), D_mach.M.hub, pb_[1], pb_[2]);
      const ea = anchorOfM(A), eb = anchorOfM(B);
      const len = Math.hypot(eb.x - ea.x, eb.y - ea.y);
      if (len === 0) continue;                   // two hubs stacked exactly: no span to test
      tried++;

      /* A genuinely clear span first, THEN rock put back on purpose -- so a
         refusal is always attributable to a tile this trial chose, never to
         whatever worldgen happened to leave in the way. */
      clearAlong(ea, eb, 1);
      const stones = r() * 4 | 0;
      for (let k = 0; k < stones; k++) {
        const f = 0.15 + r() * 0.7;
        const ox = (r() * 5 | 0) - 2, oy = (r() * 5 | 0) - 2;
        const x = mixTo(ea.x, eb.x, f) + ox * 8, y = mixTo(ea.y, eb.y, f) + oy * 8;
        const b = world.bandAt(x, y);
        if (b) tiles.write.set(b, world.tileX(b, x), world.tileY(b, y), STONE);
      }

      const tile = Math.min(world.bandAt(ea.x, ea.y)?.tile ?? 8, world.bandAt(eb.x, eb.y)?.tile ?? 8);
      const { worst, at } = worstChord(ea, eb);
      const off = offWorldOn(ea, eb);
      const verdict = segs.linkCheck(A, B);

      journal.write.drain();
      const before = segs.segments.length;
      const made = R_place.linkSegment(A, B);
      const rows = journal.write.drain();
      const grew = segs.segments.length - before;
      tally[verdict.why ?? 'ok'] = (tally[verdict.why ?? 'ok'] || 0) + 1;

      /* CLAIM 1 */
      if (verdict.ok !== !!made || grew !== (verdict.ok ? 1 : 0)) {
        fail(`LINK LEGALITY: ${fam.id} trial ${i} -- linkCheck said ${verdict.ok ? 'ok' : verdict.why} ` +
             `but linkSegment ${made ? 'created' : 'refused'} (segments ${grew > 0 ? '+' + grew : grew})`);
        bad++;
      }
      const kinds = rows.map(w => w.kind);
      const wantKind = verdict.ok ? 'link' : 'refused';
      if (!kinds.includes(wantKind)) {
        fail(`LINK LEGALITY: ${fam.id} trial ${i} -- ${verdict.ok ? 'an accepted' : 'a refused'} link ` +
             `pushed [${kinds.join(', ')}] and not a '${wantKind}' journal row`);
        bad++;
      }
      if (!verdict.ok) {
        const why = rows.find(w => w.kind === 'refused')?.data?.why;
        if (why !== verdict.why) {
          fail(`LINK LEGALITY: ${fam.id} trial ${i} -- linkCheck refused with '${verdict.why}' but the ` +
               `journal row says '${why}' -- one decision, two readers, and they have drifted`);
          bad++;
        }
      }

      /* CLAIM 4 first, because it decides what CLAIMS 2 and 3 may expect. */
      const tooFar = len > REACH * mods.eff('segReach', 'hub') + 1e-9;
      if (tooFar && verdict.why !== 'TOO FAR APART') {
        fail(`LINK LEGALITY: ${fam.id} trial ${i} -- a ${len.toFixed(1)} px span against a ${REACH} px ` +
             `reach was answered '${verdict.why ?? 'ok'}', not 'TOO FAR APART' (docs/SPEC.md 17.6 puts ` +
             `the structural refusal first)`);
        bad++;
      }

      if (verdict.ok) {
        /* CLAIM 2 */
        if (worst >= tile * 0.5 - 1e-9) {
          fail(`LINK LEGALITY: ${fam.id} trial ${i} -- an ACCEPTED ${len.toFixed(1)} px span cuts ` +
               `${worst.toFixed(2)} px through solid ${at}, which is half a tile or more; the half-tile ` +
               `sweep is guaranteed to have sampled inside it`);
          bad++;
        } else if (worst > 0) { clips++; worstClip = Math.max(worstClip, worst); }
        /* CLAIM 3 */
        if (off) {
          fail(`LINK LEGALITY: ${fam.id} trial ${i} -- an ACCEPTED span passes through (${off.x.toFixed(1)}, ` +
               `${off.y.toFixed(1)}), which resolves to no band at all`);
          bad++;
        }
        perFamily[fam.id]++;
        const a180 = ((Math.atan2(-(eb.y - ea.y), eb.x - ea.x) * 180 / Math.PI) + 360) % 180;
        angles[Math.min(BUCKETS - 1, a180 / (180 / BUCKETS) | 0)]++;
      } else if (!tooFar && worst >= tile * 0.5 - 1e-9 && verdict.why !== 'THE PATH IS BLOCKED') {
        fail(`LINK LEGALITY: ${fam.id} trial ${i} -- a span cutting ${worst.toFixed(2)} px through solid ` +
             `${at} was refused '${verdict.why}' rather than 'THE PATH IS BLOCKED'`);
        bad++;
      }
    }
  }

  console.log(`  ..  link legality: ${tried} seeded spans, verdicts ` +
              Object.entries(tally).map(([k, n]) => `${k} x${n}`).join(', '));
  console.log(`  ..  link legality: accepted per family ` +
              Object.entries(perFamily).map(([k, n]) => `${k} ${n}`).join(', ') +
              `; accepted-span 30-degree buckets [${angles.join(', ')}]` +
              `; ${clips} accepted span(s) clipped a solid corner, worst ${worstClip.toFixed(2)} px ` +
              `(bound ${(8 * 0.5).toFixed(1)})`);

  for (const [id, n] of Object.entries(perFamily))
    if (n === 0) {
      fail(`LINK LEGALITY: the "${id}" family accepted NOTHING over ${TRIALS} trials, so every ` +
           `assertion above was vacuous for it -- the generator or the clear window is wrong, ` +
           `not the game`);
      bad++;
    }
  const emptyBucket = angles.findIndex(n => n === 0);
  if (emptyBucket >= 0) {
    fail(`LINK LEGALITY: no span was accepted in the ${emptyBucket * 30}-${emptyBucket * 30 + 30} degree ` +
         `bucket, so "every angle" is not tested`);
    bad++;
  }
  if (!bad)
    ok(`LINK LEGALITY: ${tried} seeded spans in one band and across both seams -- accepted exactly when ` +
       `linkCheck says so, never over a solid tile by half a tile or more, never off-world, and ` +
       `'TOO FAR APART' always outranks 'THE PATH IS BLOCKED'`);
}

/* --- LINK LEGALITY, CROSS-BAND, HAND-CARVED. The seeded sweep above proves a
   property over a cloud of spans; these are the four NAMED cases, at fixed
   coordinates, with the answer written down beside each one -- so a failure
   here says which geometry broke rather than which seed.

   Case 2 is commit b48203d's own repro, verbatim (astral hub anchored at
   496,304 -> surface hub at 496,344, solid tile at surface tile 61,1). It is
   here because that bug -- a boundary-exact axis-aligned span sampling only
   the tile column `Math.floor` happened to favour -- was found by this
   section's earlier draft and is exactly the kind of thing that comes back.
   BOTH columns are tested each time, the favoured one and the other one,
   because "it blocks when the rock is in column 61" is half a test.

   A CROSS-BAND CABLE IS THE ORDINARY CASE, not the exotic one: astral's floor
   is 40 rows above the surface's ceiling, and every delivery the design is
   about crosses a seam. So the first assertion in each case is that a
   genuinely clear seam-crossing span is ACCEPTED -- and it is stated first
   because a clear window carved too small makes every later assertion pass for
   the wrong reason. --- */
{
  const STONE = D_sub.S.stone;
  let bad = 0;

  /* Place two hubs at named band-local tiles, carve the span genuinely clear
     (window sized from the anchors -- see `clearAlong`), and hand back the
     anchors so a case can put rock back at an exact world pixel. */
  function handSpan(seed, a, b) {
    boot.newRun(seed);
    const A = machs.write.place(world.bandOf(a[0]), D_mach.M.hub, a[1], a[2]);
    const B = machs.write.place(world.bandOf(b[0]), D_mach.M.hub, b[1], b[2]);
    const ea = anchorOfM(A), eb = anchorOfM(B);
    clearAlong(ea, eb, 1);
    return { A, B, ea, eb };
  }

  const expect = (label, A, B, want, at = null) => {
    const c = segs.linkCheck(A, B);
    const got = c.ok ? 'ok' : c.why;
    if (got !== want) {
      fail(`LINK LEGALITY (cross-band): ${label} -- expected '${want}', got '${got}'` +
           (c.at ? ` at (${c.at.x}, ${c.at.y})` : ''));
      bad++;
      return null;
    }
    if (at && c.at && (Math.abs(c.at.x - at.x) > 8 || Math.abs(c.at.y - at.y) > 8)) {
      fail(`LINK LEGALITY (cross-band): ${label} -- refused correctly but reported the spot as ` +
           `(${c.at.x}, ${c.at.y}), not near (${at.x}, ${at.y}); the cable ghost draws that point`);
      bad++;
    }
    return c;
  };

  /* CASE 1 -- the surface/topsoil seam, straight down. The two anchors are
     both at x 488, which is EXACTLY the boundary between topsoil columns 60
     and 61, so this span runs astride a grid line for its whole length: the
     boundary case, by construction and not by luck. */
  {
    const surfaceHub = ['surface', 60, 52], topsoilHub = ['topsoil', 60, 2];
    const h = handSpan(8800, surfaceHub, topsoilHub);
    expect('a clear span across the surface/topsoil seam', h.A, h.B, 'ok');

    /* And it really does cross: the low end resolves to topsoil, the high end
       to surface, so `rules/drive.js`'s band handoff has something to do. */
    const seg = segs.write.link(h.A, h.B);
    const lo = world.bandAt(...Object.values(segs.carrierPos(seg)));
    segs.write.carrier(seg, 1, 0);
    const hiBand = world.bandAt(...Object.values(segs.carrierPos(seg)));
    if (lo?.id !== 'topsoil' || hiBand?.id !== 'surface') {
      fail(`LINK LEGALITY (cross-band): the seam span's carrier reads band "${lo?.id}" at t=0 and ` +
           `"${hiBand?.id}" at t=1 -- it is not actually crossing the seam, so nothing below tests one`);
      bad++;
    }

    /* THE LOWER BAND'S ROW 0, both columns. This is the row a hub-relative
       clear window misses and the row generated terrain fills with rock. */
    for (const tx of [60, 61]) {
      const h2 = handSpan(8800, surfaceHub, topsoilHub);
      tiles.write.set(world.bandOf('topsoil'), tx, 0, STONE);
      expect(`one stone in topsoil row 0, column ${tx}, on a boundary-exact seam span`,
             h2.A, h2.B, 'THE PATH IS BLOCKED', { x: 488, y: 772 });
    }
  }

  /* CASE 2 -- commit b48203d's repro, the astral/surface seam. */
  {
    const astralHub = ['astral', 45, 37], surfaceHub = ['surface', 61, 2];
    const h = handSpan(8801, astralHub, surfaceHub);
    if (h.ea.x !== 496 || h.ea.y !== 304 || h.eb.x !== 496 || h.eb.y !== 344) {
      fail(`LINK LEGALITY (cross-band): b48203d's repro no longer anchors at (496,304)->(496,344) but ` +
           `(${h.ea.x},${h.ea.y})->(${h.eb.x},${h.eb.y}) -- the hub footprint or a band origin moved, ` +
           `and this case is now testing something else`);
      bad++;
    }
    expect('a clear span across the astral/surface seam', h.A, h.B, 'ok');

    /* x 496 is the boundary between surface columns 61 and 62 (496/8 = 62
       exactly, so `Math.floor` favours 62 and 61 is the one that used to be
       invisible). b48203d's own repro is the 61 half. */
    for (const tx of [61, 62]) {
      const h2 = handSpan(8801, astralHub, surfaceHub);
      tiles.write.set(world.bandOf('surface'), tx, 1, STONE);
      expect(`b48203d's repro with the stone in surface column ${tx}`,
             h2.A, h2.B, 'THE PATH IS BLOCKED', { x: 496, y: 328 });
    }
  }

  /* CASE 3 -- OUTSIDE THE WORLD, in astral's own 32-column dead zone
     (docs/PLAN-gears-and-winches.md section 4.5: astral is tw:96 at
     origin.x:128, so world x < 128 above y 320 is no band at all). A surface
     hub at column 11 linking up to astral's leftmost column has a span that
     leaves the world for a few pixels before it arrives. Nothing can carve
     that clear, which is the point: it is the one refusal that is about the
     WORLD's shape rather than its contents, and Phase 10 Step 1 is what
     closes it. */
  {
    const h = handSpan(8802, ['surface', 11, 1], ['astral', 0, 38]);
    expect('a span through the strip where astral does not exist', h.A, h.B, 'OUTSIDE THE WORLD');

    /* CASE 4 -- and when a span is BOTH blocked and off-world, 17.6's order
       says it reports the blockage: the rock is the thing the player can do
       something about. */
    const h2 = handSpan(8802, ['surface', 11, 1], ['astral', 0, 38]);
    tiles.write.set(world.bandOf('surface'), 13, 1, STONE);
    expect('a span that is both blocked and off-world', h2.A, h2.B, 'THE PATH IS BLOCKED');
  }

  if (!bad)
    ok('LINK LEGALITY (cross-band): a clear span crosses either seam; b48203d\'s boundary-exact repro ' +
       'blocks on BOTH shared columns at both seams; astral\'s dead zone reads OUTSIDE THE WORLD; and a ' +
       'span that is both reports the rock');
}

/* --- BREAK-EVEN, REPRICED AND NOW MEASURED. Section 3's BREAK-EVEN DEPTH is
   ARITHMETIC: it prices ascent in seconds of cranking straight from the tuning
   rows, and asserts `ore < ingot < plate`. What it cannot tell you is whether
   the game charges that price. So this puts one unit of each tier on a real
   carrier, cranks it with a real crank for a real second, and derives `k` --
   seconds of cranking per item-slot per tile -- from the pixels the simulation
   actually moved.

   THREE CLAIMS, in the order they matter:

     1. THE MEASURED CLIMB IS docs/SPEC.md 17.8's, per tier. If this drifts,
        section 3 is pricing a game that no longer exists and its ordering is a
        statement about a formula rather than about the game.
     2. `k` RISES WITH MASS. A heavier item-slot costs more seconds per tile;
        that is the only reason compression is worth anything.
     3. THE BREAK-EVEN DEPTH ORDERING SURVIVES IN MEASURED SECONDS:
        `ore < ingot < plate`, dividing docs/SPEC.md section 8's own ratios
        (hoisted, so this section and section 3 cannot disagree about them) by
        the measured `k` rather than the computed one.

   The worth datum is section 3's: what an item-slot's contents cost to MINE.
   Nothing about the currency changes here -- what changes is that it is read
   off the simulation. --- */
{
  const rows = [];
  let bad = 0;
  for (const tier of ['ore', 'ingot', 'plate']) {
    const r = driveRig({ ...ONE_CRANK, seed: 8900, cargo: [[0, 'copper', tier, 1]] });
    const mass = items.massOfPair(D_sub.S.copper, FORMS[tier]);
    const v = measureV(r.seg, 1, 1 / 120, { turn: true });
    const want = predictV(crankTorque(), mass, 1);
    const k = v > 0 ? r.band.tile / v : Infinity;
    rows.push({ tier, mass, v, want, k, be: (RATIOS[tier] * oreSecs) / k });
    /* CLAIM 1 */
    if (Math.abs(v - want) > 1e-6) {
      fail(`BREAK-EVEN MEASURED: one copper ${tier} (${mass} T) aboard a vertical segment on one crank ` +
           `climbs at ${v.toFixed(4)} px/s; docs/SPEC.md 17.8 gives ${want.toFixed(4)} -- section 3 is ` +
           `pricing a formula the game no longer runs`);
      bad++;
    }
  }

  console.log('  ..  break-even, measured on a real carrier (1 s of cranking each):');
  for (const r of rows)
    console.log(`        ${r.tier.padEnd(6)} ${r.mass.toFixed(2).padStart(6)} T   ` +
                `${r.v.toFixed(4).padStart(8)} px/s   k = ${r.k.toFixed(3)} s/tile/item-slot   ` +
                `break-even ${r.be.toFixed(2)} tiles`);

  for (let i = 1; i < rows.length; i++) {
    /* CLAIM 2 */
    /* STRICTLY greater, with no epsilon of slack in the permissive direction:
       "equal" is what a drivetrain that had stopped reading mass at all would
       produce, and that must be a failure here rather than a pass. */
    if (!(rows[i].k > rows[i - 1].k * (1 + 1e-9))) {
      fail(`BREAK-EVEN MEASURED: a ${rows[i].tier} (${rows[i].mass} T) cranks up at ${rows[i].k.toFixed(3)} ` +
           `s/tile, cheaper than a ${rows[i - 1].tier} (${rows[i - 1].mass} T) at ` +
           `${rows[i - 1].k.toFixed(3)} -- mass must cost seconds`);
      bad++;
    }
    /* CLAIM 3 */
    if (!(rows[i].be > rows[i - 1].be)) {
      fail(`BREAK-EVEN MEASURED: ${rows[i].tier} breaks even at ${rows[i].be.toFixed(2)} tiles, not deeper ` +
           `than ${rows[i - 1].tier} at ${rows[i - 1].be.toFixed(2)} -- compression must buy depth, in ` +
           `measured seconds and not only in arithmetic`);
      bad++;
    }
  }
  if (!bad)
    ok(`BREAK-EVEN MEASURED: on a real carrier, k rises with mass ` +
       `(${rows.map(r => r.k.toFixed(2)).join(' < ')} s/tile/item-slot) and the break-even depth still ` +
       `orders ore ${rows[0].be.toFixed(2)} < ingot ${rows[1].be.toFixed(2)} < plate ` +
       `${rows[2].be.toFixed(2)} tiles -- section 3's price is the one the game charges`);
}

console.log(`\ntotals: fillRect ${calls.fillRect.toLocaleString()}, ` +
            `drawImage ${calls.drawImage.toLocaleString()}, ` +
            `journal ${journal.peek ? journal.peek().length : 0} undrained`);

if (failures) console.error(`\n${failures} CHECK(S) FAILED\n`);
else {
  console.log('\nAll checks passed.');
  console.log('This says nothing about whether it LOOKS right — open it and judge.\n');
}
