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
const D_cycles = await import('../src/data/cycles.js');
const D_src  = await import('../src/data/sources.js');
const D_world = await import('../src/data/world.js');
const D_recipes = await import('../src/data/recipes.js');
const D_callouts = await import('../src/data/callouts.js');
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
/* THE ONE `view` MODULE IMPORTED DIRECTLY, for the identical reason as
   `R_place` immediately above: the CHUNK SEAM probe (Phase 11 TIER 2) needs
   `chunkCanvas`'s own return value, one chunk at a time, which `main.draw()`
   never exposes -- it composites many chunks into the visible viewport and
   throws each cached canvas away behind that. */
const viewPaint = await import('../src/view/paint.js');
/* Same exception, for the RENDER PURITY (overview/ruler/callout) probe below:
   proving the ruler and the quickbar are actually ON SCREEN this frame (not
   merely that drawing whatever IS there is pure) needs `view/ui/state.js#drawn`,
   the same "what did the last render do" scratch space `view/hud.js` itself
   reads from for the identical reason (`hudRuler`'s own `qb = uiDrawn.grids...`). */
const uiState = await import('../src/view/ui/state.js');
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
  /* `footUnder` (section 5's own helper, hoisted): every hub in this file
     stands on a real footing tile, and this rig links THROUGH `linkCheck`, so
     without one it is a scene `rules/placement.js` could not have built. */
  const lo = footUnder(machs.write.place(band, D_mach.M.hub, ptx + 2, pty - 1));
  const hi = footUnder(machs.write.place(band, D_mach.M.hub, ptx + 2, pty - 10));
  footUnder(machs.write.place(band, D_mach.M.crank, ptx + 1, pty - 1));
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
  const lo = footUnder(machs.write.place(band, D_mach.M.hub, 5, 12));
  const hi = footUnder(machs.write.place(band, D_mach.M.hub, 5, 6));
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
  /* THE TRIBUTE LEDGER, all six fields, one write each (Phase 10b). This line
     was `run.write.tribute({ n: 1 })` -- a placeholder shape from Phase 3, when
     the field had zero callers -- and it is now the real record
     `rules/cycles.js` writes, `{ id, have, left }`, so a reset that forgot the
     ledger fails here on its own contents rather than on a stand-in.
     `favour`/`charted` are the two that would survive if `write.reset()` had
     kept them on the frozen template instead of building them fresh, which is
     the failure their own comment in `model/run.js` describes. `offer` is the
     draft bridge `shell/main.js` reads -- a run that just completed a cycle
     mid-frame and reset a moment later must not hand the NEXT run a stale
     draft. */
  run.write.tribute({ id: D_cycles.CYCLES[0].id, have: { 'copper/ore': 4 }, left: 123.5 });
  run.write.favour('hephaestus', 2);
  run.write.chart('astral');
  run.write.miss();
  run.write.cycle(3);
  run.write.offer('grant');
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
    const lo = footUnder(machs.write.place(band, D_mach.M.hub, 6, 12));
    const hi = footUnder(machs.write.place(band, D_mach.M.hub, 6, 6));
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
    /* Phase 10b: `rules/cycles.js` places the surface altar two tiles left
       of `spawnTx` from the run's first frame, and its `handFeed` (reach 10 px)
       is real and unconditional -- a shaft dug AT `spawnTx` itself (this
       test's own column, before this phase) sits close enough that the altar
       quietly ate ore out of the very pockets this test just loaded, which is
       not what the assertion below means to measure. Dug well clear of it. */
    const tx = world.tileX(band, player.player.x) + 15, ty = world.tileY(band, player.player.y);
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
    else if (run.invCount(D_sub.S.copper, D_form.F.ore) !== n)
      fail(`BURDEN: pockets hold ${run.invCount(D_sub.S.copper, D_form.F.ore)} copper/ore, not the ${n} ` +
           `collected -- something drained them mid-test, so the climb refusal above is not proven at 150%`);
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

/* ---------- EVERY HUB IN THIS SECTION STANDS ON A REAL FOOTING TILE ----------
   `machs.write.place` asks nothing about footing -- `data/machines.js:465-467`
   records that exact blind spot -- so until Phase 10a every hub in every scene
   below floated over air, which is a machine `rules/placement.js` could never
   have built (`model/run.js#placementCheck` demands `def.footing` solid tiles
   directly under the footprint). That is how the headframe defect survived
   Phase 8g: no vertical span in the harness ever met the footing tile every
   real span must pass through. So: lay the tiles, in the hub's own band, and
   lay them AFTER any clearing the scene does.

   `def.footing` tiles under the LEFTMOST columns, which is the straddle
   docs/SPEC.md 17.2 argues for: one column on rock, one over the void. Returns
   the machine, so it can wrap a `write.place` call in place. */
function footUnder(m) {
  const def = D_mach.MACH[m.def];
  for (let i = 0; i < def.footing; i++)
    tiles.write.set(m.band, m.tx + i, m.ty + def.th, D_sub.S.stone);
  return m;
}

/* The tile range docs/SPEC.md 17.6's headframe exemption covers, DERIVED HERE
   rather than imported -- the same "independent second implementation"
   `chordThrough` below is written for, so the harness and
   `model/segments.js#headframe` can disagree instead of agreeing by sharing.
   Footprint columns, from the anchor's own row down to the footprint's bottom
   plus one row. */
function headframeOf(m) {
  const def = D_mach.MACH[m.def];
  return { band: m.band, tx0: m.tx, tx1: m.tx + def.tw - 1,
           ty0: m.ty + Math.floor(def.th / 2), ty1: m.ty + def.th };
}

/* A RIDER MAY NOW START AT THE VERY TOP OF A SPAN (`t = 1`), and until Phase
   10b they could not. Phase 10a's exemption let the CABLE cross the upper hub's
   own footing tile; `rules/drive.js#ride` still refused to translate a player
   across it, because a 6 px box centred on the anchor straddles the anchor's
   column boundary and the footing tile is inside that box whichever of the two
   columns holds it. Measured then: the rider descended 10 px from `t = 1` and
   stopped while the carrier left without them, so every ride probe in this file
   had to park its carrier 40 px down (`belowHeadframe`, now deleted) to keep
   measuring what it claimed to measure. docs/FINDINGS.md #17 recorded it and
   Phase 10b fixed it in `rules/drive.js#boxSolid`, which now reads
   `model/segments.js#headframe` -- the same two rows per endpoint, not one
   more. So `carriers: [[0, 1]]` below is load-bearing in both directions: it is
   the honest scene, and it fails if the rider exemption regresses. */

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

  const placed = (spec.machines ?? []).map(([id, tx, ty]) =>
    footUnder(machs.write.place(band, D_mach.M[id], tx, ty)));
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
    driveRig({ ...at(105, 1), seed: 8299, burden: 30 });
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
   cross-band span is one call and not a special case.

   `exempt` is the endpoints' headframe ranges (`headframeOf`), and this
   function has to know about them for the same reason `linkCheck` does: a
   legally placed hub HAS a footing tile, the cable is allowed through it
   (docs/SPEC.md 17.6, docs/PLAN-phase10.md 3.1 A1), and an accepted span
   therefore cuts a full tile of it. Counted rather than ignored, so the
   summary line says how much the exemption is actually covering -- if that
   number ever exceeds two tiles per endpoint the exemption has grown. */
function worstChord(pa, pb, exempt = []) {
  let worst = 0, at = null, exemptHits = 0;
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
      if (c <= 0) continue;
      if (exempt.some(e => e.band === b && tx >= e.tx0 && tx <= e.tx1 && ty >= e.ty0 && ty <= e.ty1)) {
        exemptHits++;
        continue;
      }
      if (c > worst) { worst = c; at = `${b.id} (${tx},${ty})`; }
    }
  }
  return { worst, at, exemptHits };
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
     pair shares a WORLD column with NO offset since Phase 10b: astral is now
     `tw:128` at `origin.x:0` like every other band (`data/world.js`), so band
     column N is world column N in all three. It used to need `- 16`, and the
     16 was astral's old 128 px inset -- see the OUTSIDE THE WORLD case below
     for what that inset cost. */
  const FAMILIES = [
    { id: 'topsoil only', pick: r => [
      ['topsoil', 16 + (r() * 24 | 0), 100 + (r() * 12 | 0)],
      ['topsoil', 16 + (r() * 24 | 0), 100 + (r() * 12 | 0)]] },
    { id: 'surface/topsoil seam', pick: r => [
      ['surface', 30 + (r() * 14 | 0), 48 + (r() * 7 | 0)],
      ['topsoil', 30 + (r() * 14 | 0), (r() * 6 | 0)]] },
    { id: 'astral/surface seam', pick: r => {
      const col = 40 + (r() * 14 | 0);
      return [['astral', col + (r() * 3 | 0) - 1, 33 + (r() * 6 | 0)],
              ['surface', col + (r() * 3 | 0) - 1, (r() * 6 | 0)]];
    } }
  ];

  const BUCKETS = 6;                            // 30 degrees each, over 0..180
  const angles = Array.from({ length: BUCKETS }, () => 0);
  const tally = {};
  const perFamily = {};
  let bad = 0, clips = 0, worstClip = 0, tried = 0, headframeClips = 0;

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

      /* LAST, so neither the carve nor the scattered rock can decide whether
         these two hubs are legally placed: they are. */
      footUnder(A); footUnder(B);
      const exempt = [headframeOf(A), headframeOf(B)];

      const tile = Math.min(world.bandAt(ea.x, ea.y)?.tile ?? 8, world.bandAt(eb.x, eb.y)?.tile ?? 8);
      const { worst, at, exemptHits } = worstChord(ea, eb, exempt);
      headframeClips += exemptHits;
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
              `(bound ${(8 * 0.5).toFixed(1)}); ${headframeClips} solid tile(s) crossed under a ` +
              `headframe and exempted`);

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
    footUnder(A); footUnder(B);         // after the carve: see `footUnder`
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
    /* astral column 61, not 45: Phase 10b moved astral's origin from x:128 to
       x:0, so the band-local column that sits over surface column 61 is 61
       and no longer 45. The WORLD anchors this case is about (496, 304) and
       (496, 344) are unchanged, which is what the guard below is for. */
    const astralHub = ['astral', 61, 37], surfaceHub = ['surface', 61, 2];
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

  /* CASE 3 -- OUTSIDE THE WORLD, AND THE DEAD ZONE THAT USED TO PRODUCE IT.
     Until Phase 10b astral was `tw:96` at `origin.x:128`, so world x < 128 and
     x >= 896 above y 320 were no band at all, and a surface hub at column 11
     linking up to astral's leftmost column left the world for a few pixels on
     the way. That case is GONE, deliberately: the widening closed two
     16-column strips in which the game's own destination was unreachable.

     ASSERTED IN BOTH DIRECTIONS, because "the dead zone is closed" and "the
     refusal still works" are two different claims and the first one is what
     silently retires the second:

       3a. THE THREE BANDS NOW TILE ONE RECTANGLE. Every world column, at a
           height in every band, resolves to a band -- so no span between two
           in-bounds anchors can leave the world, and the old case cannot be
           written any more. This is the assertion that would fail if a future
           band were added narrower than the rest, which is exactly when
           someone needs to be told.
       3b. THE BRANCH IS STILL LIVE. Off-world therefore has to be reached
           through a hub whose ANCHOR is off-world, which needs a footprint
           straddling the band's own edge -- `model/machines.js#write.place`
           allows it and `placementCheck` refuses it ('NOT THERE'), so this is
           a deliberate bypass of the legality this file otherwise insists on.
           Stated, because `data/machines.js:465-467` records what happens when
           a harness places what the game cannot. */
  {
    /* 3a */
    const cols = [];
    for (const b of world.bands) {
      const midY = b.origin.y + (b.cfg.th * b.tile) / 2;
      for (let tx = 0; tx < 128; tx++)
        if (!world.bandAt(tx * 8 + 4, midY)) cols.push(`${b.id} x${tx}`);
    }
    if (cols.length) {
      fail(`LINK LEGALITY (cross-band): ${cols.length} world column(s) resolve to no band at some ` +
           `band's own mid-height (${cols.slice(0, 6).join(', ')}) -- the bands no longer tile one ` +
           `rectangle, so a span between two in-bounds hubs can leave the world again`);
      bad++;
    }

    /* 3b. `topsoil` column 127 with a `tw:2` footprint: the second column is
       out of bounds, so the anchor lands on world x 1024, one pixel past the
       world's right edge. */
    const h = handSpan(8802, ['topsoil', 120, 100], ['topsoil', 127, 100]);
    if (h.eb.x !== 1024) {
      fail(`LINK LEGALITY (cross-band): the off-world hub anchors at x ${h.eb.x}, not 1024 -- the ` +
           `world is not 1024 px wide any more and this case is testing something else`);
      bad++;
    }
    expect('a span whose far anchor is past the world\'s right edge', h.A, h.B, 'OUTSIDE THE WORLD');

    /* CASE 4 -- and when a span is BOTH blocked and off-world, 17.6's order
       says it reports the blockage: the rock is the thing the player can do
       something about. */
    const h2 = handSpan(8802, ['topsoil', 120, 100], ['topsoil', 127, 100]);
    tiles.write.set(world.bandOf('topsoil'), 123, 100, STONE);
    expect('a span that is both blocked and off-world', h2.A, h2.B, 'THE PATH IS BLOCKED');
  }

  if (!bad)
    ok('LINK LEGALITY (cross-band): a clear span crosses either seam; b48203d\'s boundary-exact repro ' +
       'blocks on BOTH shared columns at both seams; the three bands now tile one rectangle so astral\'s ' +
       'dead zone is closed; an anchor past the world\'s edge still reads OUTSIDE THE WORLD; and a span ' +
       'that is both reports the rock');
}

/* --- THE HEADFRAME EXEMPTION: A LEGALLY PLACED VERTICAL PAIR LINKS
   (docs/PLAN-phase10.md 2.6 and 3.1 option A1, docs/SPEC.md 17.6).

   THE HUBS HERE ARE BUILT THROUGH `rules/placement.js#placeMachine`, and that
   is the whole point of this block. Every other scene in this file places
   through `model/machines.js#write.place`, which asks nothing about footing
   (`data/machines.js:465-467` records the blind spot) -- so "a hub with the
   solid tile under it that `placementCheck` demands", which is the only kind
   the game will ever build, went untested until Phase 10a and took a defect
   with it.

   THE DEFECT, measured before the fix, topsoil, two hubs 12 tiles apart on
   flat ground: `{ok:true}` with no footing tile at all -- i.e. only where the
   upper hub could not legally exist -- and `THE PATH IS BLOCKED` at
   (168, 1632), the footing row's own lower boundary, with the footing under
   the left column, the right column, or both. The anchor is the footprint's
   CENTRE, so a span rising from below terminates one row above the footprint's
   bottom and must cross the footing row, and `solidNear` sees the tile in
   either column of a boundary-exact span (correctly, per b48203d). This is
   docs/SPEC.md 17.2's `footing:2` bug recurring at `footing:1`.

   FOUR CLAIMS, and the last two are what stop the fix from being "ignore
   anything under a hub":

     1. BOTH HUBS ARE LEGALLY PLACED. `placeMachine` returning a record means
        `placementCheck` passed, which means the footing tile is really there
        and the footprint is really clear. Asserted, not assumed.
     2. THE 96 PX VERTICAL SPAN IS ACCEPTED, through the real
        `rules/placement.js#linkSegment`, with the footing under either column
        or both -- 96 px is exactly `hub.reach`, so this is also the longest
        vertical stage the design gets (docs/PLAN-phase10.md 4.5 prices the
        climb on it).
     3. A REAL OBSTRUCTION MID-SPAN STILL REFUSES, in both columns of the
        boundary-exact span.
     4. THE EXEMPTION IS EXACTLY TWO ROWS DEEP. One stone ONE ROW BELOW it --
        still directly under the hub, in the footprint's own columns -- refuses.
        Without this row, "exempt the footing tile" and "exempt everything
        beneath a hub" pass identically. --- */
{
  const STONE = D_sub.S.stone;
  let bad = 0;

  /* Flat room in `topsoil` rows 100..119, floor at 119 -- 320 rows of solid
     rock with nothing in it but what this puts there, the same reason
     `driveRig` chose the band. The lower hub stands on the floor (footprint
     117-118, footing 119); the upper hub 12 tiles up stands on a hand-placed
     tile at row 107, which is what a player digging a shaft has to leave
     behind. Two `hub/rig` units in the pockets, because `placeMachine` spends
     one per placement and refusing for want of an item would look exactly like
     refusing for want of a floor. */
  function upright(footingCols, rock = []) {
    boot.newRun(1337);
    const band = world.bandOf('topsoil');
    for (let ty = 100; ty <= 119; ty++)
      for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, STONE);
    for (const c of footingCols) tiles.write.set(band, 20 + c, 107, STONE);
    for (const [tx, ty] of rock) tiles.write.set(band, tx, ty, STONE);
    run.write.collect(run.machineHeldSub('hub'), D_form.F.rig, 2);
    journal.write.drain();
    const lo = R_place.placeMachine(band, 'hub', 20, 117);
    const hi = R_place.placeMachine(band, 'hub', 20, 105);
    const why = journal.write.drain().find(w => w.kind === 'refused')?.data?.why ?? null;
    return { band, lo, hi, why };
  }

  const verdicts = [];
  function span(label, want, footingCols, rock = []) {
    const s = upright(footingCols, rock);
    if (!s.lo || !s.hi) {
      fail(`HEADFRAME EXEMPTION: ${label} -- rules/placement.js#placeMachine refused to build the pair ` +
           `('${s.why}'), so this is not a legally placed pair and nothing below it means anything`);
      bad++;
      return;
    }
    const dx = anchorOfM(s.hi).x - anchorOfM(s.lo).x, dy = anchorOfM(s.lo).y - anchorOfM(s.hi).y;
    if (dx !== 0 || dy !== 96) {
      fail(`HEADFRAME EXEMPTION: ${label} -- the pair is ${dx} px across and ${dy} px apart, not a ` +
           `straight 96 px vertical span; the footprint or a band origin moved and this case is now ` +
           `testing something else`);
      bad++;
    }
    const c = segs.linkCheck(s.lo, s.hi);
    const before = segs.segments.length;
    const made = R_place.linkSegment(s.lo, s.hi);
    const grew = segs.segments.length - before;
    const got = c.ok ? 'ok' : c.why;
    verdicts.push(`${label}: ${got}${c.at ? ` at (${c.at.x},${c.at.y})` : ''}`);
    if (got !== want) {
      fail(`HEADFRAME EXEMPTION: ${label} -- expected '${want}', got '${got}'` +
           (c.at ? ` at (${c.at.x}, ${c.at.y})` : ''));
      bad++;
    }
    if (c.ok !== !!made || grew !== (c.ok ? 1 : 0)) {
      fail(`HEADFRAME EXEMPTION: ${label} -- linkCheck said ${got} but linkSegment ` +
           `${made ? 'created' : 'refused'} (segments ${grew > 0 ? '+' + grew : grew})`);
      bad++;
    }
  }

  /* CLAIMS 1 and 2. Both columns and both, because "it links when the footing
     is in the column `Math.floor` favours" is half a test -- b48203d's own
     lesson, applied to the tile the hub itself requires. */
  span('12 tiles straight up, footing under the LEFT column', 'ok', [0]);
  span('12 tiles straight up, footing under the RIGHT column', 'ok', [1]);
  span('12 tiles straight up, footing under BOTH columns', 'ok', [0, 1]);

  /* CLAIM 3 */
  span('a stone mid-span in the left column', 'THE PATH IS BLOCKED', [0], [[20, 111]]);
  span('a stone mid-span in the right column', 'THE PATH IS BLOCKED', [0], [[21, 111]]);

  /* CLAIM 4 */
  span('a stone ONE ROW below the exemption, left column', 'THE PATH IS BLOCKED', [0], [[20, 108]]);
  span('a stone ONE ROW below the exemption, right column', 'THE PATH IS BLOCKED', [0], [[21, 108]]);

  console.log('  ..  headframe exemption, 12-tile vertical pair built through placeMachine:');
  for (const v of verdicts) console.log(`        ${v}`);

  if (!bad)
    ok('HEADFRAME EXEMPTION: two hubs built through rules/placement.js 12 tiles apart link straight up ' +
       'with the footing tile under either column or both, a stone mid-span still refuses, and the ' +
       'exemption is exactly two rows deep -- one row lower still blocks');
}

/* --- THE RIDER'S HALF OF THE SAME EXEMPTION (docs/FINDINGS.md #17,
   docs/SPEC.md 17.6). Phase 10a exempted the CABLE and left the RIDER refused,
   which is the one thing standing between that fix and
   docs/PLAN-phase10.md 4.4's "the player rides to the dock and steps off onto
   astral's floor".

   THE DEFECT, measured before the fix on a 12-tile pair on real footing tiles
   with the player aboard: riding UP under a held crank the rider stopped dead
   at world y 1632 -- 34 px, 4.25 tile rows, below the deck -- and then
   detached and fell back down the shaft; riding DOWN from `t = 1` they
   descended 10 px and stopped while the carrier left. Same three facts as the
   cable's, one swapped: the anchor is on a tile COLUMN boundary, the player's
   6 px box straddles it, and `footing:1` puts a solid tile directly under the
   upper hub.

   THREE CLAIMS, and the third is what keeps this from being "riders ignore
   rock":

     1. A RIDER TRACKS THE CARRIER THROUGH THE UPPER HEADFRAME. Measured as
        displacement equal to the carrier's own, flush to the deck, for the
        whole descent -- not merely "moved further than 10 px".
     2. THEY REACH BELOW THE FOOTING ROW. Stated as a tile row rather than a
        pixel count, because the pixel count is what the old defect passed
        with.
     3. THE RIDER'S EXEMPTION IS EXACTLY THE CABLE'S TWO ROWS. One stone ONE
        ROW BELOW the exempt range, in the footprint's own columns, still stops
        the rider. Without this row, "exempt the footing tile" and "exempt
        everything under a hub" pass identically -- the same claim 4 the cable
        block above makes, in the rider's own units.

   Claim 3's segment is linked through `model/segments.js#write.link` rather
   than `linkCheck`, and that bypass is the point: a stone one row below the
   exemption BLOCKS THE CABLE too (claim 4 above proves it), so there is no way
   to build this scene legally, and what is under test here is the ride
   translation and not the link. --- */
{
  const STONE = D_sub.S.stone;
  let bad = 0;

  /* The same upright pair the cable block uses, minus `placeMachine`: this
     needs a rider aboard and a carrier parked at the top, which `driveRig`
     already assembles, and `footUnder` lays the real footing tiles that are
     the whole subject. Unpowered, so the carrier descends under its own weight
     at the full `segDown` -- no crank, no supply, and therefore no question of
     whether the rider is still in reach of one. */
  function rideDown(rock = []) {
    const r = driveRig({
      seed: 8181,
      room: { ty0: 100, h: 20 },
      machines: [['hub', 20, 117], ['hub', 20, 105]],
      links: [[0, 1]], carriers: [[0, 1]], ride: 0
    });
    for (const [tx, ty] of rock) tiles.write.set(r.band, tx, ty, STONE);
    return r;
  }

  /* CLAIMS 1 and 2. Three seconds at `segDown` is 78 px, comfortably past the
     footing row 34 px down and comfortably short of the floor. */
  {
    const r = rideDown();
    const y0 = player.player.y;
    const deck = () => segs.carrierTop(r.seg) - player.PH;
    let worst = 0;
    for (let i = 0; i < 360; i++) {
      stepReal(1 / 120, { hasMouse: false });
      worst = Math.max(worst, Math.abs(player.player.y - deck()));
    }
    const fell = player.player.y - y0;
    const footingTop = world.worldY(r.band, 107);

    if (worst > 1) {
      fail(`RIDER EXEMPTION: a rider descending from t = 1 drifted ${worst.toFixed(2)} px off the deck ` +
           `-- before Phase 10b they stopped 10 px down and the carrier left without them`);
      bad++;
    }
    if (!(player.player.y > footingTop)) {
      fail(`RIDER EXEMPTION: after 3 s of descent the rider's box top is at y ${player.player.y.toFixed(2)}, ` +
           `still at or above the upper hub's footing row (y ${footingTop}) -- they have not passed their ` +
           `own headframe`);
      bad++;
    }
    console.log(`  ..  rider exemption: 3 s of unpowered descent from t = 1 moved the rider ` +
                `${fell.toFixed(2)} px (segDown x 3 = ${(mods.eff('segDown') * 3).toFixed(2)}), ` +
                `worst deck drift ${worst.toFixed(3)} px`);
  }

  /* CLAIM 3. Rows 106-107 are the exempt range for a hub at ty 105 (`th:2`),
     so 108 is one row lower. Stated as "the rider's box never overlaps the
     stone", not as an exact resting pixel: once the translation is refused the
     carrier leaves and `rules/player.js` -- which has no exemption of any kind
     and is not touched by this fix -- takes over, so where they finally come to
     rest is that module's answer and not this one's. What this asserts is the
     only thing the exemption could have broken: that they did not go THROUGH
     it. */
  {
    const r = rideDown([[20, 108], [21, 108]]);
    const y0 = player.player.y;
    const stoneTop = world.worldY(r.band, 108);
    let deepest = player.player.y;
    for (let i = 0; i < 360; i++) {
      stepReal(1 / 120, { hasMouse: false });
      deepest = Math.max(deepest, player.player.y);
    }
    if (deepest + player.PH - 1 >= stoneTop) {
      fail(`RIDER EXEMPTION: a stone ONE ROW below the exemption (row 108, both footprint columns) did ` +
           `not stop the rider -- their box reached y ${deepest.toFixed(2)}..` +
           `${(deepest + player.PH - 1).toFixed(2)}, which overlaps the stone at y ${stoneTop} -- the ` +
           `rider's exemption is deeper than the cable's two rows`);
      bad++;
    } else {
      console.log(`  ..  rider exemption: one row lower still stops them -- 3 s of descent moved the ` +
                  `rider ${(player.player.y - y0).toFixed(2)} px and their box never passed y ` +
                  `${stoneTop} (deepest box bottom ${(deepest + player.PH - 1).toFixed(2)})`);
    }
  }

  if (!bad)
    ok('RIDER EXEMPTION: a rider descending from the very top of a span tracks the deck through their ' +
       'own upper headframe within a pixel and passes below its footing row, and a stone one row lower ' +
       'still stops them -- the rider passes exactly the two rows the cable does');
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

/* ============================================================
   TIER 2 — THE INVARIANTS, APPLIED TO SEGMENT TRANSPORT
   ============================================================ */

/* --- RENDER PURITY OVER THE DRIVETRAIN'S OWN DRAW PATHS (invariants 9 and 7).
   Section 2 proves the plain HUD and the terrain are pure and section 4 proves
   the `view/ui/` tree is; neither draws a cable, a carrier, a bucket chain, a
   turning gear or the cable ghost, all of which Phase 8e added and Phase 8f
   made move.

   FIVE STATES, and every one is DRAWN TWICE with the epoch counter compared
   across the pair -- the same instrument section 2 uses, because `model` bumps
   on every write and `view` may not write.

   AND PROVEN NON-VACUOUS, which for a render test means proving the pixels
   would have differed: CLAUDE.md records a test that set `flags.grid` instead
   of `flags.showGrid` and baselined a scene with the overlay off. So each state
   is compared by `fillRect` count against the same frame with the thing
   removed -- no cable, or no armed hub -- and a state whose draw touched
   nothing is a failure rather than a pass. --- */
{
  const CAM = seg => {
    const p = segs.carrierPos(seg);
    main.cam.x = p.x - 100;
    main.cam.y = p.y - 60;
  };
  const drawTwice = label => {
    const before = epoch.epoch.n;
    main.draw();
    main.draw();
    if (epoch.epoch.n !== before) {
      fail(`RENDER PURITY (drivetrain): drawing ${label} performed ${epoch.epoch.n - before} model ` +
           `write(s) -- view may never mutate model (invariant 9)`);
      return false;
    }
    return true;
  };
  const rects = () => { const n = calls.fillRect; main.draw(); return calls.fillRect - n; };

  let bad = 0;
  const r = driveRig({
    /* The room starts two columns LEFT of the standard rig's, because this
       one needs a gear and a crank between the player and the hub -- and
       `driveRig`'s `player` tile must be inside the carved room or the player
       spawns inside rock and is extracted upward a tile per substep, which
       walks them out of the crank's reach in three frames. Found exactly that
       way. */
    seed: 8950, room: { tx0: 16, ty0: 100, h: 18, w: 14 },
    machines: [['hub', 20, 115], ['hub', 20, 105], ['crank', 19, 115], ['gear', 18, 115]],
    links: [[0, 1]], player: [17, 115], cargo: [[0, 'copper', 'ore', 3]]
  });

  /* A REAL TURNING GEAR, not a poked field: one second of the real crank held
     through the real step, so `m.turn` and `m.torque` are whatever
     `rules/drive.js` decided they are. */
  runReal(120, 1 / 120, { turn: true, hasMouse: false });
  const gear = r.placed[3];
  if (!(gear.turn > 0 && gear.torque > 0)) {
    fail(`RENDER PURITY (drivetrain): the gear beside the crank reads turn ${gear.turn}, torque ` +
         `${gear.torque} after a second of cranking -- the turning-gear draw path is not being ` +
         `exercised, so proving it pure proves nothing`);
    bad++;
  }
  CAM(r.seg);

  for (const t of [0, 0.5, 1]) {
    segs.write.carrier(r.seg, t, t === 1 ? 0 : -1);
    if (!drawTwice(`a carrier at t=${t}`)) bad++;
  }

  /* THE CABLE AND CARRIER ARE ACTUALLY ON SCREEN. Same camera, same machines,
     one difference: the segment. */
  segs.write.carrier(r.seg, 0.5, -1);
  const withCable = rects();
  const keep = [...segs.segments];
  segs.write.clear();
  const without = rects();
  for (const s of keep) segs.segments.push(s);
  if (withCable <= without) {
    fail(`RENDER PURITY (drivetrain): a frame with a cable and carrier drew ${withCable} rects and one ` +
         `without drew ${without} -- the cable/carrier draw path emitted nothing, so the purity ` +
         `assertions above are about nothing`);
    bad++;
  }

  /* THE CABLE GHOST, all four states its own header names. `aim` is written
     directly rather than through a fake pointer, for the reason CLAUDE.md gives
     about hardcoded click coordinates. */
  const ghost = [
    ['ok', r.placed[1].tx, r.placed[1].ty],
    ['nothing under the reticle', 24, 110],
    ['blocked', r.placed[1].tx, r.placed[1].ty, () => tiles.write.set(r.band, 20, 110, D_sub.S.stone)]
  ];
  let ghostRects = 0;
  for (const [label, tx, ty, prep] of ghost) {
    if (prep) prep();
    shellUi.armLink(r.placed[0]);
    aimModel.write.set(r.band, tx, ty, true);
    if (!drawTwice(`the cable ghost (${label})`)) bad++;
    ghostRects = Math.max(ghostRects, rects());
  }
  shellUi.clearLink();
  const noGhost = rects();
  if (ghostRects <= noGhost) {
    fail(`RENDER PURITY (drivetrain): the cable ghost drew ${ghostRects} rects and no ghost at all drew ` +
         `${noGhost} -- an unset ui.linkFrom must change the pixels, or the ghost states above were ` +
         `never drawn (CLAUDE.md: "a test can silently test nothing")`);
    bad++;
  }

  /* AND NO RANDOMNESS ANYWHERE IN ANY OF IT (invariant 7): the gear phase, the
     bucket spacing and the cable's own dashes must all come from `m.turn`,
     `seg.t` and a position hash, never from `rand()`. This is section 2's probe
     pointed at a frame that has a drivetrain in it. */
  shellUi.armLink(r.placed[0]);
  segs.write.carrier(r.seg, 0.4, -1);
  rng.seedRng(8951);
  const expected = [rng.rand(), rng.rand(), rng.rand()];
  rng.seedRng(8951);
  const got = [];
  for (let i = 0; i < 3; i++) { main.draw(); main.draw(); got.push(rng.rand()); }
  shellUi.clearLink();
  if (got.join() !== expected.join()) {
    fail('RENDER PURITY (drivetrain): drawing a moving carrier, a bucket chain, a turning gear and the ' +
         'cable ghost CONSUMED RANDOMNESS -- a screenshot now depends on how many times you have drawn ' +
         '(invariant 7)');
    bad++;
  }

  if (!bad)
    ok(`RENDER PURITY (drivetrain): a carrier at t=0/0.5/1, a gear turning at phase ` +
       `${gear.turn.toFixed(2)} on torque ${gear.torque.toFixed(2)}, and the cable ghost in three ` +
       `states -- 0 model writes across ten draws, no randomness consumed, and every one of them ` +
       `provably on screen (${withCable} rects with the cable vs ${without} without, ${ghostRects} ` +
       `with the ghost vs ${noGhost} without)`);
}

/* --- NO SECOND COLLISION MODEL (invariant 1: the tile grid is the only source
   of truth for terrain). A carrier holds the player and its cargo up, and it
   does it through `model/segments.js#carrierUnder` -- a MODEL QUERY, exactly
   the way `model/tiles.js#climbAt` answers the ladder branch. The failure this
   guards against is the obvious shortcut: writing a solid tile under the deck
   so the existing collision code holds the player up for free. That works
   immediately and is wrong permanently -- it would leave rock behind wherever a
   carrier had been, and `rules/belts.js` already leans on machines not being
   solid.

   FOUR ASSERTIONS, and the third is the one that would catch the shortcut:

     1. a rider is HELD UP WITH NOTHING SOLID UNDER THEM: `onGround` true while
        every tile under their feet reads `solidAt` false. Both halves, because
        either alone is satisfiable by a bug (falling through, or standing on
        rock).
     2. the carrier's own tiles are all non-solid, at every position it visits.
     3. NOT ONE BYTE OF ANY BAND'S `mat` CHANGES across linking a cable, moving
        a carrier, loading it, and 120 substeps of a rider descending on it.
        Checksummed over all three bands with the same rolling hash the
        determinism probe uses.
     4. cargo aboard is resting on air too -- a carrier is not a floor for
        items either. --- */
{
  let bad = 0;
  const matSum = () => world.bands.map(b => sumBytes(b.mat)).join('/');

  /* The claim at its smallest first: the model writes that CREATE transport
     touch no terrain at all. */
  {
    boot.newRun(8960);
    const band = world.bandOf('topsoil');
    for (let ty = 100; ty <= 118; ty++)
      for (let tx = 18; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    const lo = footUnder(machs.write.place(band, D_mach.M.hub, 20, 115));
    const hi = footUnder(machs.write.place(band, D_mach.M.hub, 20, 105));
    const before = matSum();
    const seg = segs.write.link(lo, hi);
    segs.write.carrier(seg, 0.5, -1);
    segs.write.load(seg, 30);
    if (matSum() !== before) {
      fail('NO SECOND COLLISION MODEL: linking a cable, moving its carrier and loading it CHANGED a ' +
           'band\'s mat array -- transport must never write terrain (invariant 1)');
      bad++;
    }
  }

  const r = driveRig({
    seed: 8961, reachMul: 2, room: { ty0: 96, h: 22 },
    machines: [['hub', 20, 115], ['hub', 20, 100], ['crank', 19, 115]],
    links: [[0, 1]], carriers: [[0, 0.6]], ride: 0, cargo: [[0, 'copper', 'ore', 2]]
  });
  const band = r.band;
  const before = matSum();

  /* Every tile the box touches, at every carrier position visited. */
  const tilesOf = box => {
    const out = [];
    for (let ty = world.tileY(band, box.y); ty <= world.tileY(band, box.y + box.h); ty++)
      for (let tx = world.tileX(band, box.x); tx <= world.tileX(band, box.x + box.w); tx++)
        out.push([tx, ty]);
    return out;
  };

  let solidUnderRider = 0, solidInCarrier = 0, notRiding = 0, floating = 0, sampled = 0;
  for (let i = 0; i < 120; i++) {
    stepReal(1 / 120, { hasMouse: false });
    if (i % 10) continue;
    sampled++;
    if (!segs.riddenSegment()) { notRiding++; continue; }
    if (!player.player.onGround) floating++;
    const pb = player.playerBox();
    /* The row of tiles the feet are IN and the row just below it: a rider held
       up by rock would have one of those solid. */
    const feetTy = world.tileY(band, pb.y + pb.h + 1);
    for (let tx = world.tileX(band, pb.x); tx <= world.tileX(band, pb.x + pb.w); tx++)
      if (tiles.solidAt(band, tx, feetTy)) solidUnderRider++;
    for (const [tx, ty] of tilesOf(segs.carrierBox(r.seg)))
      if (tiles.solidAt(band, tx, ty)) solidInCarrier++;
  }

  if (notRiding) {
    fail(`NO SECOND COLLISION MODEL: the player was not riding on ${notRiding} of ${sampled} sampled ` +
         `substeps -- the rig is not testing a ride`);
    bad++;
  }
  if (floating) {
    fail(`NO SECOND COLLISION MODEL: a rider read onGround false on ${floating} of ${sampled} sampled ` +
         `substeps -- a carrier must hold the player up like ground does`);
    bad++;
  }
  if (solidUnderRider) {
    fail(`NO SECOND COLLISION MODEL: ${solidUnderRider} solid tile(s) found under a rider's feet -- a ` +
         `carrier is holding the player up by WRITING TERRAIN, which is invariant 1 exactly`);
    bad++;
  }
  if (solidInCarrier) {
    fail(`NO SECOND COLLISION MODEL: ${solidInCarrier} tile(s) inside the carrier's own box read solid`);
    bad++;
  }
  const aboard = items.items.filter(it => it.band === band);
  const restingOnRock = aboard.filter(it =>
    tiles.solidAt(band, world.tileX(band, it.x), world.tileY(band, it.y + 2))).length;
  if (aboard.length === 0) {
    fail('NO SECOND COLLISION MODEL: no cargo survived aboard the carrier, so assertion 4 tested nothing');
    bad++;
  } else if (restingOnRock) {
    fail(`NO SECOND COLLISION MODEL: ${restingOnRock} of ${aboard.length} item(s) aboard the carrier are ` +
         `resting on a solid tile -- a carrier is not a floor for items either`);
    bad++;
  }
  if (matSum() !== before) {
    fail('NO SECOND COLLISION MODEL: a band\'s mat array changed over 120 substeps of a rider descending ' +
         'on a carrier -- transport is writing terrain');
    bad++;
  }
  if (!bad)
    ok(`NO SECOND COLLISION MODEL: over ${sampled} sampled substeps of a descending ride, the rider is ` +
       `onGround with no solid tile under their feet, the carrier's own ${tilesOf(segs.carrierBox(r.seg)).length} ` +
       `tiles are all air, ${aboard.length} item(s) ride on air, and not one byte of any band's mat changed`);
}

/* --- A SEGMENT EMITS NO LIGHT UNLESS A ROW SAYS SO. Phase 8b owns the
   glow/light separation and this does not duplicate it; what it adds is the
   transport-specific half: a cable, a carrier and a bucket chain are drawn
   objects, and `rules/light.js` builds its emitter list from machine rows
   carrying a `light:{}` block. A segment is not a machine at all (D10), so it
   has no row and can have no block -- but "cannot" is a claim about today's
   data, so it is asserted twice: structurally over the four transport rows,
   and live in a sealed chamber.

   WITH A POSITIVE CONTROL, because "everything underground reads 0" would pass
   the live half by itself: the same sealed chamber, with a `hearth` (whose row
   DOES say so -- `light:{ level:'max' }`) placed in it, must read lit. --- */
{
  let bad = 0;

  for (const id of ['hub', 'crank', 'gear', 'axle']) {
    const def = D_mach.MACH[D_mach.M[id]];
    if (def.light) {
      fail(`SEGMENT LIGHT: the ${id} row carries a light:{} block (${JSON.stringify(def.light)}). That is ` +
           `legal -- it is what "unless a row says so" means -- but the live assertion below assumes no ` +
           `transport row emits, so update it deliberately rather than deleting it`);
      bad++;
    }
  }

  boot.newRun(8970);
  const band = world.bandOf('topsoil');
  const tx0 = 40, ty0 = 220, w = 12, h = 12;
  for (let ty = ty0; ty < ty0 + h; ty++) for (let tx = tx0; tx < tx0 + w; tx++) tiles.write.clear(band, tx, ty);
  for (let tx = tx0 - 1; tx <= tx0 + w; tx++) {
    tiles.write.set(band, tx, ty0 - 1, D_sub.S.stone);
    tiles.write.set(band, tx, ty0 + h, D_sub.S.stone);
  }
  for (let ty = ty0 - 1; ty <= ty0 + h; ty++) {
    tiles.write.set(band, tx0 - 1, ty, D_sub.S.stone);
    tiles.write.set(band, tx0 + w, ty, D_sub.S.stone);
  }
  const lo = footUnder(machs.write.place(band, D_mach.M.hub, tx0 + 4, ty0 + 9));
  const hi = footUnder(machs.write.place(band, D_mach.M.hub, tx0 + 4, ty0 + 1));
  footUnder(machs.write.place(band, D_mach.M.crank, tx0 + 3, ty0 + 9));
  const seg = segs.write.link(lo, hi);
  segs.write.carrier(seg, 0.5, 0);
  runReal(20, 1 / 120, { hasMouse: false });

  const litOnCable = [];
  for (let k = 0; k <= 16; k++) {
    const f = k / 16;
    const x = mixTo(seg.ax, seg.bx, f), y = mixTo(seg.ay, seg.by, f);
    const tx = world.tileX(band, x), ty = world.tileY(band, y);
    if (world.lightAt(band, tx, ty) !== 0) litOnCable.push(`(${tx},${ty})=${world.lightAt(band, tx, ty)}`);
  }
  if (litOnCable.length) {
    fail(`SEGMENT LIGHT: a cable, its carrier and two hubs lit ${litOnCable.length} tile(s) of a sealed ` +
         `unlit chamber [${litOnCable.slice(0, 4).join(' ')}] -- no transport row declares a light:{} ` +
         `block, so none of it may emit`);
    bad++;
  }

  /* The control. Same chamber, one row that DOES say so. */
  const hearth = machs.write.place(band, D_mach.M.hearth, tx0 + 8, ty0 + 9);
  runReal(20, 1 / 120, { hasMouse: false });
  const control = world.lightAt(band, hearth.tx, hearth.ty);
  if (!(control > 0)) {
    fail(`SEGMENT LIGHT: the control failed -- a hearth (light:{level:'max'}) in the same sealed chamber ` +
         `reads ${control}, so "the cable is dark" was a fact about the probe, not about the cable`);
    bad++;
  }
  if (!bad)
    ok(`SEGMENT LIGHT: no transport row carries a light:{} block, and a cable with a carrier on it lights ` +
       `nothing in a sealed chamber where a hearth reads ${control}`);
}

/* --- NO FALL DAMAGE WHILE RIDING, AND FULL FALL DAMAGE THE MOMENT YOU STEP
   OFF. docs/PLAN-gears-and-winches.md section 6.5 asks for both in one test,
   and the reason is the mechanism: the ride branch does not DISABLE fall
   damage, it PINS `fallFrom` to the player's own y every substep
   (`rules/player.js`'s existing line, reused unchanged). A test that only
   proved "riding hurts nobody" would pass just as well against a ride branch
   that switched damage off -- and that build would then let a player ride one
   tile down and step off a cliff for free.

   SO THREE THINGS, on the same 40-tile shaft:

     A. RIDING 40 TILES COSTS NOTHING. Forty tiles is lethal twice over as a
        fall (docs/SPEC.md section 3: 20 tiles is five hearts), and it is
        travelled unpowered, under gravity, with the player aboard.
     B. `fallFrom` TRACKS THE RIDER while they ride, within a pixel. That is
        the mechanism, asserted directly rather than inferred from A.
     C. STEPPING OFF AT THE TOP COSTS THE TABLE'S ANSWER. Not "some damage":
        exactly `model/player.js#fallHearts(v)` for the landing speed the
        simulation actually reached -- the same query section 3 already pins to
        docs/SPEC.md's seven rows, so this inherits that pinning instead of
        restating the table. --- */
{
  /* A 46-ROW SPAN RIDDEN FROM THE VERY TOP. Forty is the number claim A is
     about (docs/SPEC.md section 3 makes 20 tiles a lethal fall) and 46 rows
     leaves room for it; the span grew rather than the claim shrinking. The
     start at `t = 1` is only possible since Phase 10b -- see the rider
     exemption note above `driveRig`. */
  const TALL = {
    seed: 8980, reachMul: 5,
    room: { ty0: 60, h: 58 },
    machines: [['hub', 20, 115], ['hub', 20, 69]],
    links: [[0, 1]], carriers: [[0, 1]], ride: 0
  };
  let bad = 0;

  /* A -- and B alongside it, since both are read off the same descent. */
  const a = driveRig(TALL);
  const hearts0 = run.run.hearts;
  const y0 = player.player.y;
  let worstPin = 0, ridden = 0, samples = 0;
  for (let i = 0; i < 1500; i++) {
    stepReal(1 / 120, { hasMouse: false });
    samples++;
    if (segs.riddenSegment()) ridden++;
    worstPin = Math.max(worstPin, Math.abs(player.player.fallFrom - player.player.y));
  }
  const dropped = (player.player.y - y0) / a.band.tile;
  const lost = hearts0 - run.run.hearts;

  console.log(`  ..  ride: descended ${dropped.toFixed(1)} tiles aboard a carrier, ${lost} heart(s) lost, ` +
              `fallFrom tracked the rider within ${worstPin.toFixed(2)} px, riding on ${ridden}/${samples} substeps`);

  if (dropped < 39) {
    fail(`NO FALL DAMAGE WHILE RIDING: the rider only descended ${dropped.toFixed(1)} tiles, so "40 tiles ` +
         `cost nothing" is not what was measured`);
    bad++;
  }
  if (lost !== 0) {
    fail(`NO FALL DAMAGE WHILE RIDING: descending ${dropped.toFixed(1)} tiles on a carrier cost ${lost} ` +
         `heart(s) -- a ride is not a fall`);
    bad++;
  }
  if (worstPin > 2) {
    fail(`NO FALL DAMAGE WHILE RIDING: fallFrom drifted ${worstPin.toFixed(2)} px from the rider's own y ` +
         `during the ride -- the ride branch is not pinning it, so damage is being suppressed some other ` +
         `way and stepping off will be free`);
    bad++;
  }

  /* C -- the same shaft, the carrier back at the top, and one step sideways. */
  const b = driveRig(TALL);
  const hearts1 = run.run.hearts;
  const top = player.player.y;
  let vLand = 0, landedAt = -1, off = false;
  for (let i = 0; i < 1200 && landedAt < 0; i++) {
    /* Walk right until the carrier is no longer under the feet, then stop
       pressing so the fall itself is vertical. `onGround` is NOT the test for
       having left -- it is true the whole time they are standing on the deck,
       which is the point of the ride branch; `riddenSegment()` going null is. */
    stepReal(1 / 120, { right: !off, hasMouse: false });
    if (!segs.riddenSegment()) off = true;
    if (player.player.vy > vLand) vLand = player.player.vy;
    if (off && player.player.onGround) landedAt = i;
  }
  const fell = (player.player.y - top) / b.band.tile;
  const hurt = hearts1 - run.run.hearts;
  const want = player.fallHearts(vLand);

  console.log(`  ..  step off: fell ${fell.toFixed(1)} tiles at ${vLand.toFixed(1)} px/s, ` +
              `${hurt} heart(s) lost, fallHearts(${vLand.toFixed(1)}) = ${want}, dead=${run.run.dead}`);

  if (landedAt < 0) {
    fail('STEP OFF THE CARRIER: the player never landed within 10 simulated seconds of walking off a ' +
         '40-tile drop, so nothing about damage was measured');
    bad++;
  } else if (fell < 30) {
    fail(`STEP OFF THE CARRIER: the player only fell ${fell.toFixed(1)} tiles after walking off the top ` +
         `of a 40-tile shaft -- they are being caught by something`);
    bad++;
  } else if (hurt !== want) {
    fail(`STEP OFF THE CARRIER: a ${fell.toFixed(1)}-tile fall at ${vLand.toFixed(1)} px/s cost ${hurt} ` +
         `heart(s); model/player.js#fallHearts (pinned to docs/SPEC.md section 3 in section 3 above) says ` +
         `${want} -- stepping off a carrier must cost exactly what stepping off a ledge costs`);
    bad++;
  } else if (want < 5 || !run.run.dead) {
    fail(`STEP OFF THE CARRIER: a 40-tile drop should be lethal (docs/SPEC.md section 3: 20 tiles is five ` +
         `hearts) -- got ${want} heart(s) and dead=${run.run.dead}`);
    bad++;
  }

  if (!bad)
    ok(`RIDING vs STEPPING OFF: 40 tiles down on a carrier costs 0 hearts with fallFrom pinned to within ` +
       `${worstPin.toFixed(2)} px; one step off the top of the same shaft costs ${hurt} -- exactly ` +
       `fallHearts(${vLand.toFixed(1)} px/s), and fatal`);
}

/* ============================================================
   6. PHASE 10B — THE TRIBUTE LOOP: THE TWO RECEIVERS AND THE DIRECTOR
   ------------------------------------------------------------
   docs/SPEC.md section 18 is the contract. The receivers first, because a
   director draining a receiver that never fills is a phase that looks finished
   and is not (docs/PLAN-phase10.md's own risk register says so).
   ============================================================ */
console.log('\n6. the tribute loop (Phase 10b)');

/* --- WHERE A RELEASED HAUL ACTUALLY COMES TO REST, AND WHETHER THE DOCK'S
   MOUTH REACHES IT. This is the assertion docs/PLAN-phase10.md 3.3 demands not
   be eyeballed, and the reason is that the dock is the ONLY catch box in the
   game that does not catch its item in flight: `rules/drive.js` releases an
   arriving haul INSIDE the footprint at the anchor -- which for `th:1` is two
   pixels BELOW the top mouth's lower edge -- and the item then falls AWAY from
   the mouth onto the footing tile. Every other row's `slack:2` would therefore
   be wrong here and would be wrong SILENTLY: a dock that never credits looks
   exactly like a dock nobody has delivered to yet.

   FOUR CLAIMS:

     1. THE ARITHMETIC. The dock's anchor and the resting position
        `rules/items.js#hop` computes are both inside the inflated mouth, for
        every form the dock accepts -- derived from `sizeOf`, not from the
        `slack` the row happens to carry, so the two can disagree.
     2. THE MEASURED REST POSITION agrees with claim 1's arithmetic. Read off a
        real item dropped in the footprint and stepped until it rests.
     3. THE END TO END: a real haul on a real carrier, cranked to `t = 1`,
        released, ends up in `m.buf`. Nothing about the mouth is asserted here
        -- only that a unit of copper went in at the bottom and is in the
        dock's ledger at the top. THIS CLAIM ALONE IS NOT ENOUGH, and that was
        checked: with the slack set to the furnace's 2 it still PASSES, because
        the release frame leaves the item at the anchor with `vy = 0` and the
        catch box gets one look at it before gravity has moved it a fifth of a
        pixel. Claims 1 and 2 are what fail, which is why they exist -- a dock
        that only works while the item has not started falling yet is a dock
        that stops working the first time a frame is dropped.
     4. THE DOCK DOES NOT SWALLOW A RELIC. A `pick` in `relic` form dropped in
        the same place is still lying there afterwards. CLAUDE.md D1 gives
        `relic` and `phial` their own `subTags` precisely so a receiver cannot
        eat a trinket by accident, and a star-slash-star `accepts` would pass
        claims 1-3 identically. --- */
{
  const DOCK = D_mach.MACH[D_mach.M.cloud_dock];
  const dockPorts = DOCK.ports.filter(p => p.mode === 'in');
  let bad = 0;

  /* A dock on a real footing, on flat ground in `topsoil` -- the band every
     other rig in this file uses, for the same reason: nothing but what this
     puts there. Astral would be the in-fiction home and is deliberately NOT
     used, because a scene that depends on where worldgen left astral's ragged
     lip is a scene that tests worldgen. */
  function dockRig(seed = 9100) {
    boot.newRun(seed);
    const band = world.bandOf('topsoil');
    for (let ty = 100; ty <= 119; ty++)
      for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);
    const m = footUnder(machs.write.place(band, D_mach.M.cloud_dock, 20, 118));
    player.write.band(band);
    return { band, m };
  }

  /* CLAIM 1 */
  {
    const { m } = dockRig();
    const mouth = m.mouth[DOCK.catchBox.mouth];
    const s = DOCK.catchBox.slack;
    const box = { y0: mouth.y - s, y1: mouth.y + mouth.h + s };
    const anchor = anchorOfM(m);
    const rows = [];
    if (anchor.y < box.y0 || anchor.y > box.y1) {
      fail(`DOCK MOUTH: the dock's anchor (y ${anchor.y}) is outside its own inflated top mouth ` +
           `(y ${box.y0}..${box.y1}) -- a haul released at the anchor is never seen`);
      bad++;
    }
    /* The footing row's own top, which is what `hop` snaps a resting item to,
       minus half the item's size. One row per form the dock accepts. */
    const footingTop = world.worldY(m.band, m.ty + DOCK.th);
    for (const [subId, formId] of [['copper', 'ore'], ['copper', 'ingot'],
                                   ['copper', 'plate'], ['stone', 'gravel']]) {
      const sub = D_sub.S[subId], form = D_form.F[formId];
      if (!items.holdable(sub, form)) continue;
      const accepted = dockPorts.some(p => p.accepts.some(sel => D_form.matches(sel, sub, form)));
      const restY = footingTop - D_form.FORM[form].size / 2;
      const inside = restY >= box.y0 && restY <= box.y1;
      rows.push({ pair: `${subId}/${formId}`, accepted, restY, inside });
      if (accepted && !inside) {
        fail(`DOCK MOUTH: a ${subId}/${formId} released at the dock's anchor comes to rest at y ` +
             `${restY} (footing top ${footingTop} minus half its size ${D_form.FORM[form].size}), ` +
             `outside the inflated top mouth y ${box.y0}..${box.y1} -- slack ${s} is too small and ` +
             `the dock silently swallows nothing`);
        bad++;
      }
    }
    console.log(`  ..  dock mouth: footprint top y ${m.box.y}, anchor y ${anchor.y}, top mouth ` +
                `y ${mouth.y}..${mouth.y + mouth.h} inflated by slack ${s} to y ${box.y0}..${box.y1}`);
    for (const r of rows)
      console.log(`        ${r.pair.padEnd(14)} accepted ${r.accepted ? 'yes' : 'no '}   ` +
                  `rests at y ${r.restY}   ${r.inside ? 'inside' : 'OUTSIDE'} the mouth`);
  }

  /* CLAIM 2 -- the same number, off a real item rather than off the formula. */
  {
    const { band, m } = dockRig(9101);
    const anchor = anchorOfM(m);
    const it = items.write.spawn(band, anchor.x, anchor.y, D_sub.S.copper, D_form.F.ore, 0, 0);
    /* The dock would eat it on the first frame, which is claim 3's business,
       not this one: what is under test here is where `rules/items.js` PUTS a
       released haul, so the machine is removed and only the physics is left. */
    machs.write.remove(m);
    runReal(60, 1 / 120, { hasMouse: false });
    const footingTop = world.worldY(band, m.ty + DOCK.th);
    const want = footingTop - D_form.FORM[D_form.F.ore].size / 2;
    if (Math.abs(it.y - want) > 0.01) {
      fail(`DOCK MOUTH: a copper/ore released at the dock's anchor came to rest at y ${it.y}, but the ` +
           `arithmetic claim 1 asserts says ${want} -- one of the two is wrong and claim 1 is the one ` +
           `the slack was chosen from`);
      bad++;
    } else {
      console.log(`  ..  dock mouth: measured -- a copper/ore released at the anchor rests at y ` +
                  `${it.y}, exactly the y claim 1 computes`);
    }
  }

  /* CLAIM 3 -- end to end, through the real crank, carrier and release. The
     dock sits 12 tiles above a plain hub; the player stands at a crank on the
     floor and holds it, which is the only way anything ascends (a rider cannot
     power their own segment -- docs/SPEC.md 17.6). */
  {
    boot.newRun(9102);
    const band = world.bandOf('topsoil');
    for (let ty = 100; ty <= 119; ty++)
      for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);
    const lo = footUnder(machs.write.place(band, D_mach.M.hub, 20, 117));
    const dock = footUnder(machs.write.place(band, D_mach.M.cloud_dock, 20, 106));
    footUnder(machs.write.place(band, D_mach.M.crank, 19, 117));
    const c = segs.linkCheck(lo, dock);
    if (!c.ok) {
      fail(`DOCK DELIVERY: a hub cannot be linked to a dock 12 tiles above it (${c.why}) -- the dock ` +
           `is not a usable segment endpoint and nothing below this means anything`);
      bad++;
    } else {
      const seg = segs.write.link(lo, dock);
      segs.write.carrier(seg, 0, 0);
      player.write.band(band);
      player.write.move(world.worldX(band, 18), world.worldY(band, 117));
      player.write.vel(0, 0);
      player.write.set('onGround', true);
      const p = segs.carrierPos(seg);
      const it = items.write.spawn(band, p.x, p.y, D_sub.S.copper, D_form.F.ore, 0, 0);
      if (it) it.rest = 1;
      /* Long enough for 96 px at the measured ~5 px/s of a loaded single-crank
         ascent, plus the frames the release and the catch take. */
      for (let i = 0; i < 120 * 40 && seg.t < 1; i++) stepReal(1 / 120, { turn: true, hasMouse: false });
      runReal(30, 1 / 120, { turn: true, hasMouse: false });
      /* The dock's own buffer is TRANSIENT once `rules/cycles.js` exists: any
         `tribute:{}` receiver is drained into `run.tribute.have` the same
         frame it is fed (`data/machines.js`'s "one drain path serves both"),
         regardless of which cycle is actually live -- cycle 1 here is still
         the ALTAR's, so this ore counts toward it even though it never
         touched the altar. The buffer reading 0 IS the pass. */
      const held = machs.count(dock, '*/#ore');
      const credited = run.run.tribute?.have?.['copper/ore'] ?? 0;
      if (seg.t < 1) {
        fail(`DOCK DELIVERY: the carrier only reached t = ${seg.t.toFixed(3)} in 40 s of cranking, so no ` +
             `arrival ever happened and the delivery was not tested`);
        bad++;
      } else if (held !== 0 || credited !== 1) {
        fail(`DOCK DELIVERY: the carrier arrived at the dock and released its haul, but the dock's own ` +
             `buffer holds ${held} ore (want 0, drained) and the tribute ledger holds ${credited} (want 1) ` +
             `-- either the catch box never saw the release or the director never drained it ` +
             `(${items.items.length} item(s) still loose in the world)`);
        bad++;
      } else {
        console.log(`  ..  dock delivery: one copper/ore cranked 12 tiles up a real segment, released at ` +
                    `the anchor, caught, and drained into the tribute ledger (${items.items.length} loose)`);
      }
    }
  }

  /* CLAIM 4 */
  {
    const { band, m } = dockRig(9103);
    const anchor = anchorOfM(m);
    items.write.spawn(band, anchor.x, anchor.y, D_sub.S.pick, D_form.F.relic, 0, 0);
    /* Out of `eff('pickupR')` of the dock, so the player does not pocket it
       and make this pass for the wrong reason. */
    player.write.move(world.worldX(band, 16), world.worldY(band, 118));
    runReal(120, 1 / 120, { hasMouse: false });
    const swallowed = items.items.length === 0;
    const inBuf = Object.keys(m.buf).length;
    if (swallowed || inBuf) {
      fail(`DOCK ACCEPTS: the dock swallowed a pick in relic form (loose items ${items.items.length}, ` +
           `buffer keys ${inBuf}) -- its accepts selectors are too wide, and CLAUDE.md D1 gives relic its ` +
           `own subTags exactly so a receiver cannot eat a trinket`);
      bad++;
    }
  }

  if (!bad)
    ok('DOCK MOUTH AND DELIVERY: the dock\'s inflated top mouth reaches the anchor a haul is released at ' +
       'AND the y every accepted form comes to rest at (measured, not assumed); one ore cranked up a real ' +
       '12-tile segment is caught and drained into the tribute ledger; and a relic dropped in the same ' +
       'place is left alone');
}

/* --- THE ALTAR: HAND-FED, AND UNOBTAINABLE. Two claims, and the second is the
   one `kiln_divine` set the precedent for: a row with no substance can never
   be placed by a player, so "the altar is the gods' and not yours" is an
   absence in `data/substances.js` rather than a check anywhere. --- */
{
  let bad = 0;
  const ALTAR = D_mach.MACH[D_mach.M.altar];

  /* CLAIM 1 -- unobtainable. Asserted through the same three queries the game
     itself uses, not by grepping the table. */
  {
    boot.newRun(9110);
    if (run.machineHeldSub('altar') !== undefined) {
      fail(`ALTAR: model/run.js#machineHeldSub('altar') resolves to substance ` +
           `${run.machineHeldSub('altar')} -- the altar has a held item and can therefore be built`);
      bad++;
    }
    if (D_recipes.HAND_RECIPES.some(r => r.out?.[0]?.sub === 'altar')) {
      fail('ALTAR: a hand recipe produces altar/rig -- the altar must have no recipe at all');
      bad++;
    }
    const band = world.bandOf('surface');
    run.write.grant('altar');                 // the strongest case: granted anyway
    const chk = run.placementCheck(band, 'altar', 40, 18);
    if (chk.ok || chk.why !== 'NOTHING BUILT YET') {
      fail(`ALTAR: placementCheck for a GRANTED altar says ${JSON.stringify(chk)} -- it should refuse ` +
           `with 'NOTHING BUILT YET', which is the no-substance route and the only thing stopping a ` +
           `player from placing one`);
      bad++;
    }
  }

  /* CLAIM 2 -- hand-fed. `handFeed` needs no key: standing inside `reach` of
     the footprint is the whole verb (`rules/machines.js#handFeed`), which is
     what makes cycle 1's "walk up carrying ore" work with no new code. */
  {
    boot.newRun(9111);
    const band = world.bandOf('topsoil');
    for (let ty = 110; ty <= 119; ty++)
      for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);
    const m = footUnder(machs.write.place(band, D_mach.M.altar, 22, 117));
    player.write.band(band);
    player.write.move(world.worldX(band, 21), world.worldY(band, 117));
    player.write.vel(0, 0);
    player.write.set('onGround', true);
    run.write.collect(D_sub.S.copper, D_form.F.ore, 10);
    runReal(240, 1 / 120, { hasMouse: false });
    /* 10 copper/ore is the WHOLE of cycle 1's demand (docs/SPEC.md 18.4), so
       feeding it all in does not just fill a buffer -- `rules/cycles.js`
       drains the altar into the ledger the same frame (buffer back to 0) and
       then completes the trial: cycle advances, the furnace and the dock are
       granted. Checking the buffer for 10 would now be checking a value the
       director is specifically built to never leave sitting there. */
    const held = machs.count(m, '*/#ore');
    const left = run.invCount(D_sub.S.copper, D_form.F.ore);
    const paid = run.run.cycle > 1 && run.run.granted.includes('furnace') &&
                 run.run.granted.includes('cloud_dock');
    if (held !== 0 || left !== 0 || !paid) {
      fail(`ALTAR HAND FEED: standing ${Math.round(m.box.x - player.player.x)} px from a 2x2 altar with ` +
           `10 copper/ore in the pockets left ${held} in its buffer (want 0, drained), ${left} still held ` +
           `(want 0), and cycle 1 paid = ${paid} (want true) -- handFeed's reach ${ALTAR.handFeed.reach} ` +
           `does not cover walking up to it, or the director never saw the delivery`);
      bad++;
    } else {
      console.log(`  ..  altar: 10 copper/ore hand-fed from ${Math.round(m.box.x - player.player.x)} px ` +
                  `away in ${240 / 120} s, pockets empty, cycle 1 paid (furnace and dock granted)`);
    }
  }

  if (!bad)
    ok('THE ALTAR: no substance, no recipe, and placementCheck refuses it with \'NOTHING BUILT YET\' even ' +
       'when granted -- and a player standing beside one hand-feeds 10 ore into it with no key held');
}

console.log('\n7. tutorial beats 5 and 6 (Phase 10b, D-E/E1)');
{
  /* Beats 1-4 are somebody else's test; jumped past the same way
     `tests/visual.spec.js`'s `driveScene` already does
     (`while (run.tutorialBeat < 4) rw.advanceBeat()`), because what is new
     here is only whether 5 and 6 fire off the director's own state. */
  boot.newRun(9130);
  while (run.run.tutorialBeat < 4) run.write.advanceBeat();

  /* Beat 5: the altar exists from the director's very first step, so ONE
     real frame past beat 4 is enough -- `rules/cycles.js` runs before
     `rules/tutorial.js` in `shell/schedule.js` this same frame. */
  stepReal(1 / 120, { hasMouse: false });
  if (run.run.tutorialBeat !== 5) {
    fail(`TUTORIAL BEAT 5: one real frame after beat 4 with a fresh run, tutorialBeat is ` +
         `${run.run.tutorialBeat}, not 5 -- the altar should already exist by the time ` +
         `'rules/tutorial.js' asks`);
  } else {
    console.log('  ..  beat 5 fired one frame after beat 4, off the altar\'s own existence');

    /* Beat 6: hand-feed the whole of cycle 1's demand to the altar the
       director already placed, and watch the SAME completion that pays the
       trial also advance the beat -- one state, two readers. */
    const band = world.bandOf('surface'); // SPAWN_BAND -- see data/world.js
    if (!machs.machines.some(mm => mm.def === D_mach.M.altar))
      fail('TUTORIAL BEAT 6: no altar exists even after beat 5 fired -- nothing to hand-feed');
    /* One tile left of the altar's own footprint, same row as its top --
       real, untouched surface terrain, the same ground every run spawns
       standing on, so no tile-clearing is needed here. */
    player.write.band(band);
    player.write.move(world.worldX(band, band.cfg.spawnTx - 3), world.worldY(band, band.cfg.floorTy - 2));
    player.write.vel(0, 0);
    player.write.set('onGround', true);
    run.write.collect(D_sub.S.copper, D_form.F.ore, 10);
    runReal(240, 1 / 120, { hasMouse: false });
    if (run.run.tutorialBeat !== 6 || run.run.cycle <= 1) {
      fail(`TUTORIAL BEAT 6: fed the altar cycle 1's whole demand -- tutorialBeat is ` +
           `${run.run.tutorialBeat} (want 6) and run.cycle is ${run.run.cycle} (want > 1) -- ` +
           `beat 6 must fire in the exact frame the trial completes, off 'run.cycle', not a copy`);
    } else {
      ok('TUTORIAL BEATS 5 AND 6: beat 5 fires the frame the altar exists and beat 4 has already ' +
         'fired; beat 6 fires the same frame cycle 1 completes, off run.cycle directly');
    }
  }
}

/* ============================================================
   8. PHASE 11 TIER 2 — HARNESS GAPS FOUND BY A READ-ONLY AUDIT
   ------------------------------------------------------------
   Five invariant tests docs/BUILD_PLAN.md's Phase 11 TIER 2 block names but
   `tools/check.mjs` never wrote, plus three HEAVENS LEDGER sub-bullets the
   same block names alongside "cargo delivered to the dock credits the ledger
   exactly once" (already proven in section 6 above, so not repeated here).
   ============================================================ */
console.log('\n8. Phase 11 TIER 2 harness gaps');

/* --- CHUNK SEAM (docs/SPEC.md section 1's open question). A decoration
   wider than one tile paints into a NEIGHBOUR chunk -- `view/paint.js`'s own
   `DECO_MARGIN` comment (lines 62-98) states the claim: a chunk's pixels
   depend on tiles up to `DECO_MARGIN` outside it, and NO FURTHER.
   `tests/visual.spec.js:736` turns the debug overlay on and looks at the
   result, which can show a seam looking wrong; it cannot show a chunk's
   paint is UNAFFECTED by a tile beyond the margin, which is the actual claim
   `stackVer`'s own header makes and the one worth breaking.

   THIS LIVES HERE, NOT IN `tests/visual.spec.js`, because the property is a
   canvas-buffer identity and `check.mjs` already trades in exactly that: the
   render-purity probes above diff `fillRect` COUNTS across two draws of the
   same frame; this diffs the full ORDERED `fillRect` trace of one BAKE
   (`view/paint.js#chunkCanvas`) against the same bake with something changed
   only beyond the margin. A Playwright screenshot could only show the seam
   looking continuous, which is a claim about art, not about the dependency
   bound -- and it cannot isolate "beyond the margin changed nothing" from
   "nothing anywhere changed" the way a controlled second bake can.

   THE HEADLESS CANVAS HAS NO REAL BACKING BITMAP (see `makeCtx` above), so
   there is no `getImageData` to diff. What stands in for it: every pixel a
   chunk bake ever plots goes through `core/pixels.js#R`/`lineTo`/`noiseFill`
   or `core/font.js#drawText`, and all four bottom out in `g.fillRect` right
   after setting `g.fillStyle` (confirmed by reading each) -- and a chunk
   bake calls no `drawImage` at all (that verb belongs to `view/scene.js`
   blitting the CACHED canvas afterwards, not to painting one). So the
   ORDERED sequence of `(x, y, w, h, fillStyle)` a bake performs determines
   its pixels completely, and two bakes with an identical sequence produced
   identical pixels -- which is the pixel-identity proof this stub can
   actually make. */
{
  /* Every canvas this stub hands out is fresh (`makeCanvas`'s own
     `getContext` caches one `_c` per canvas, and `offscreen()` always calls
     `document.createElement('canvas')` first) -- so wrapping
     `document.createElement` for the span of exactly one `chunkCanvas` call
     catches the one canvas that call creates and patches ITS `fillRect`
     before `paintChunk` ever draws into it. Restored immediately after,
     the same monkey-patch-and-restore idiom `world.write.clearLight` above
     is temporarily wrapped with. */
  function traceChunkBake(band, cx, cy) {
    const trace = [];
    const origCreate = document.createElement;
    document.createElement = t => {
      const el = origCreate(t);
      if (t !== 'canvas') return el;
      const origGetContext = el.getContext;
      el.getContext = kind => {
        const g = origGetContext(kind);
        if (!g._chunkSeamTraced) {
          g._chunkSeamTraced = true;
          const origFillRect = g.fillRect.bind(g);
          g.fillRect = (x, y, w, h) => { trace.push([x, y, w, h, g.fillStyle]); origFillRect(x, y, w, h); };
        }
        return g;
      };
      return el;
    };
    viewPaint.resetChunks();
    viewPaint.chunkCanvas(band, cx, cy);
    document.createElement = origCreate;
    return JSON.stringify(trace);
  }

  /* ONE SCENARIO PER DECORATION KIND, each the SAME shape: a chunk (`SRC`)
     holds one hand-placed decoration-eligible tile flush against its own
     far edge; the NEIGHBOUR chunk (`DST`) is what gets baked and traced,
     because it is the one whose pixels the decoration bleeds INTO, per
     `stackVer`'s own header. `view/treatments.js#EXTENT` is the two
     decoration kinds `decorate()` actually margin-scans for -- there is no
     third, "cloud", kind in that table (checked before writing this: a
     cloud is not something any substance's `look` block declares, so it
     never goes through `decorate()`'s cross-chunk scan at all and has no
     seam to test the same way). */
  let bad = 0;
  for (const [i, seam] of [
    { name: 'a canopy', place: (band, tx, ty) => tiles.write.set(band, tx, ty, D_sub.S.timber, D_form.NATIVE) },
    { name: 'a grass cap', place: (band, tx, ty) => tiles.write.set(band, tx, ty, D_sub.S.soil, D_form.NATIVE) }
  ].entries()) {
    boot.newRun(9500 + i);
    const band = world.bandOf('surface');
    const k = band.chunk;                       // 16 tiles/chunk, this band
    const srcCx = 3, dstCx = srcCx + 1;          // SRC tiles 48-63, DST 64-79
    const cy = 0;                                // rows 0-15
    const srcTx = srcCx * k + (k - 1);           // flush against the SRC/DST seam
    const decoTy = 10;                           // above the surface band's own floorTy (20)
    const farTx = dstCx * k + k + 10;            // well outside DST's own scan margin
    const farTy = decoTy;

    /* Full sky exposure over the whole span this scenario touches, so the
       decoration's own `skyExposedAt` gate is never what is under test. */
    for (let ty = 0; ty <= decoTy; ty++)
      for (let tx = srcCx * k; tx < (dstCx + 2) * k; tx++) tiles.write.clear(band, tx, ty);

    const bakeWith = (present, far) => {
      if (present) seam.place(band, srcTx, decoTy);
      else tiles.write.clear(band, srcTx, decoTy);
      if (far) tiles.write.set(band, farTx, farTy, D_sub.S.copper, D_form.NATIVE);
      else tiles.write.clear(band, farTx, farTy);
      return traceChunkBake(band, dstCx, cy);
    };

    const traceA = bakeWith(true, false);          // real neighbourhood
    const traceB = bakeWith(true, true);            // same, but different BEYOND the margin
    const traceC = bakeWith(false, false);          // the decoration itself removed

    if (traceA !== traceB) {
      fail(`CHUNK SEAM: baking chunk (${dstCx},${cy}) beside ${seam.name} at chunk (${srcCx},${cy})'s ` +
           `own far edge changed when a tile at (${farTx},${farTy}) -- outside every declared decoration ` +
           `margin -- changed. The chunk's paint depends on more than DECO_MARGIN admits.`);
      bad++;
    } else if (traceA === traceC) {
      fail(`CHUNK SEAM: baking chunk (${dstCx},${cy}) produced IDENTICAL pixels whether or not ${seam.name} ` +
           `existed at (${srcTx},${decoTy}) -- the scenario never reached the neighbour chunk at all, so ` +
           `the equality above proves nothing`);
      bad++;
    } else {
      console.log(`  ..  chunk seam: ${seam.name} at (${srcTx},${decoTy}) changes chunk (${dstCx},${cy})'s ` +
                  `bake (proving the bleed is real), and a far tile at (${farTx},${farTy}) does not ` +
                  `(proving the dependency stops at the declared margin)`);
    }
  }
  if (!bad)
    ok('CHUNK SEAM: a canopy and a grass cap each change the neighbour chunk they bleed into, and neither ' +
       'changes it again when a tile outside every declared decoration margin is changed');
}

/* --- GLOW IS NOT LIGHT, for a held or dropped glowing relic. `tools/content.mjs`
   assertion 17 already proves the CONTENT shape (every relic/miracle-tagged
   substance carries a `halo` treatment, no machine-tagged substance does) and
   the SEGMENT LIGHT probe above already proves this exact RUNTIME shape for a
   cable and its carrier. This is the identical live proof for the checklist's
   own named example -- `pick` (`data/substances.js`), the relic every run
   starts with, carries `look.treatments:[{fn:'halo',...}]`, a VIEW-ONLY glow
   `view/paint.js#paintItem` draws -- and it must never reach `b.light`, held
   or dropped. `hub`/`rig` rides along as the negative case the checklist
   names by name: a machine substance carries no halo at all. */
{
  let bad = 0;
  boot.newRun(9510);
  const band = world.bandOf('topsoil');
  const tx0 = 40, ty0 = 240, w = 10, h = 10;

  /* The same sealed-chamber idiom the SEGMENT LIGHT probe above uses: clear
     the interior, wall every side, so the only light that could ever reach
     it is something INSIDE the walls -- no sky, no other emitter. */
  for (let ty = ty0; ty < ty0 + h; ty++) for (let tx = tx0; tx < tx0 + w; tx++) tiles.write.clear(band, tx, ty);
  for (let tx = tx0 - 1; tx <= tx0 + w; tx++) {
    tiles.write.set(band, tx, ty0 - 1, D_sub.S.stone);
    tiles.write.set(band, tx, ty0 + h, D_sub.S.stone);
  }
  for (let ty = ty0 - 1; ty <= ty0 + h; ty++) {
    tiles.write.set(band, tx0 - 1, ty, D_sub.S.stone);
    tiles.write.set(band, tx0 + w, ty, D_sub.S.stone);
  }

  const litIn = () => {
    const out = [];
    for (let ty = ty0; ty < ty0 + h; ty++)
      for (let tx = tx0; tx < tx0 + w; tx++)
        if (world.lightAt(band, tx, ty) !== 0) out.push(`(${tx},${ty})=${world.lightAt(band, tx, ty)}`);
    return out;
  };

  /* HELD: both in the pockets, player standing inside the chamber. */
  player.write.band(band);
  player.write.move(world.worldX(band, tx0 + 2), world.worldY(band, ty0 + 2));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  run.write.collect(D_sub.S.pick, D_form.F.relic, 1);
  run.write.collect(D_sub.S.hub, D_form.F.rig, 1);
  runReal(20, 1 / 120, { hasMouse: false });

  const litHeld = litIn();
  if (litHeld.length) {
    fail(`GLOW IS NOT LIGHT: holding a pick/relic (and a hub/rig) lit ${litHeld.length} tile(s) of a sealed ` +
         `unlit chamber [${litHeld.slice(0, 4).join(' ')}] -- a relic's halo is a view treatment and must ` +
         `never reach the model's light field`);
    bad++;
  }

  /* DROPPED: spent out of the pockets, dropped on the chamber floor, and the
     player moved well clear of `eff('pickupR')` so they stay dropped rather
     than being walked straight back into the pockets this same frame. */
  run.write.spend(D_sub.S.pick, D_form.F.relic, 1);
  run.write.spend(D_sub.S.hub, D_form.F.rig, 1);
  player.write.move(world.worldX(band, tx0 + 8), world.worldY(band, ty0 + 1));
  const px = world.worldX(band, tx0 + 3), py = world.worldY(band, ty0 + 5);
  items.write.spawn(band, px, py, D_sub.S.pick, D_form.F.relic, 0, 0);
  items.write.spawn(band, px + 8, py, D_sub.S.hub, D_form.F.rig, 0, 0);
  runReal(20, 1 / 120, { hasMouse: false });

  const litDropped = litIn();
  if (litDropped.length) {
    fail(`GLOW IS NOT LIGHT: a dropped pick/relic (and a dropped hub/rig) lit ${litDropped.length} tile(s) ` +
         `of a sealed unlit chamber [${litDropped.slice(0, 4).join(' ')}] -- a free torch off a dropped ` +
         `pickaxe is exactly the brand-economy leak docs/BUILD_PLAN.md's Phase 11 names`);
    bad++;
  }

  /* THE CONTROL, same idiom SEGMENT LIGHT uses: a `hearth` in the SAME
     chamber must read lit, or "the chamber reads 0" was a fact about the
     probe, not about the relic. */
  const hearth = machs.write.place(band, D_mach.M.hearth, tx0 + 6, ty0 + 7);
  runReal(20, 1 / 120, { hasMouse: false });
  const control = world.lightAt(band, hearth.tx, hearth.ty);
  if (!(control > 0)) {
    fail(`GLOW IS NOT LIGHT: the control failed -- a hearth in the same sealed chamber reads ${control}, so ` +
         `the darkness above proves nothing about the relic`);
    bad++;
  }

  if (!bad)
    ok(`GLOW IS NOT LIGHT: a held or dropped pick/relic (halo) and a held or dropped hub/rig (no halo, the ` +
       `named negative case) light nothing in a sealed chamber where a hearth reads ${control}`);
}

/* --- DATUM: `model/run.js#placementCheck`'s `minDepth` branch and
   `view/hud.js#depth` (lines ~316-325) are two SEPARATE pieces of source
   using the textually near-identical formula
   `datum = worldY(bandOf(SPAWN_BAND), floorTy); depth = (worldY - datum) / tile`
   -- docs/SPEC.md section 12 and CLAUDE.md D9 both say the two may never
   disagree. `view/hud.js#depth` is a PRIVATE, unexported function (only
   `hoverInfo`, `drawHUD` and `pairLabel` leave that file), and widening its
   exports is outside this pass's file ownership -- so this cannot CALL it.
   What it can do, and does: transcribe both formulas verbatim (cited by
   file and line) from PUBLIC primitives (`world.bandOf`, `world.worldY`)
   the two source files already read the identical way, then exercise
   `model/run.js#placementCheck`'s REAL, live decision -- not a copy of its
   arithmetic -- against that shared datum at the three points the checklist
   names. `cyclops_maw` (`data/machines.js`) is the one shipped row with a
   numeric `minDepth` (200), so it is the one gate this arithmetic actually
   flips; its own comment there claims topsoil row 220 is "depth ~256"
   against this datum, which this test cross-checks as an independent
   second source for the same number. */
{
  let bad = 0;
  boot.newRun(9520);
  const ref = world.bandOf(D_world.SPAWN_BAND);
  const datum = world.worldY(ref, ref.cfg.floorTy ?? 0);

  /* view/hud.js#depth: `Math.round((player.y - datum) / ref.tile)`. Not
     called here (see above) -- transcribed for the diff below. */
  const hudDepthAt = worldY => Math.round((worldY - datum) / ref.tile);
  /* model/run.js#placementCheck's own minDepth branch, unrounded. */
  const placementDepthAt = (band, ty) => (world.worldY(band, ty) - datum) / ref.tile;

  run.write.grant('cyclops_maw');                 // the strongest case, as THE ALTAR test above argues
  const CM = D_mach.MACH[D_mach.M.cyclops_maw];

  /* One clear, footed footprint, reused at each point by rebuilding it there
     rather than declaring it three times. */
  function tryAt(band, tx, ty) {
    for (let j = -1; j <= CM.th; j++) for (let i = -1; i <= CM.tw; i++) tiles.write.clear(band, tx + i, ty + j);
    for (let i = 0; i < CM.tw; i++) tiles.write.set(band, tx + i, ty + CM.th, D_sub.S.stone);
    return run.placementCheck(band, 'cyclops_maw', tx, ty);
  }

  const surface = world.bandOf('surface');
  const points = [
    { label: 'the surface band', band: surface, ty: (surface.cfg.floorTy ?? 0) + 3 },
    { label: 'the astral band', band: world.bandOf('astral'), ty: 5 },
    { label: 'topsoil row 220', band: world.bandOf('topsoil'), ty: 220 }
  ];

  let row220 = null;
  for (const p of points) {
    const predicted = placementDepthAt(p.band, p.ty);
    if (p.label === 'topsoil row 220') row220 = predicted;
    /* The HUD reads `player.y` directly rather than a band+row; at a
       tile-aligned world y the two formulas are the same number by
       construction (both share `datum` and `ref.tile`) -- asserted anyway,
       rather than assumed, so a stray `Math.floor` vs `Math.round` or a
       `ref.tile` vs `band.tile` typo in either transcription would show up
       as a mismatch right here before the real behavioural check below. */
    const hudPredicted = hudDepthAt(world.worldY(p.band, p.ty));
    if (Math.abs(hudPredicted - predicted) > 0.5) {
      fail(`DATUM: the two transcribed formulas disagree at ${p.label} -- hud ${hudPredicted}, placement ` +
           `${predicted.toFixed(3)} -- one of the two transcriptions above no longer matches its source`);
      bad++;
      continue;
    }

    const chk = tryAt(p.band, 30, p.ty);
    const predictedTooShallow = predicted < CM.minDepth;
    const actualTooShallow = !chk.ok && chk.why === 'TOO SHALLOW';
    /* `tryAt` clears and foots the exact footprint, so the only refusal a
       legal footprint at this depth can produce besides depth itself is
       'NOTHING BUILT YET' (unaffordable -- this test never grants the held
       substance) -- never 'NOT THERE', 'NEEDS CLEAR SPACE' or 'NEEDS A
       FLOOR', any of which would mean the helper above is not building what
       it claims to and the comparison below is worthless. */
    if (!chk.ok && chk.why !== 'TOO SHALLOW' && chk.why !== 'NOTHING BUILT YET') {
      fail(`DATUM: placing at ${p.label} refused for an unexpected reason (${chk.why}) -- the footprint ` +
           `helper is not building a legal footprint, so the depth comparison below proves nothing`);
      bad++;
    } else if (predictedTooShallow !== actualTooShallow) {
      fail(`DATUM: at ${p.label} (world y ${world.worldY(p.band, p.ty)}), the shared datum predicts depth ` +
           `${predicted.toFixed(2)} tiles against minDepth ${CM.minDepth} (want ` +
           `${predictedTooShallow ? "'TOO SHALLOW'" : 'deep enough'}), but placementCheck says ` +
           `${JSON.stringify(chk)} -- the HUD gauge's datum and placementCheck's own have drifted apart`);
      bad++;
    } else {
      console.log(`  ..  datum: ${p.label} is ${predicted.toFixed(2)} tiles deep, placementCheck agrees ` +
                  `(${chk.why ?? 'deep enough'})`);
    }
  }

  /* THE INDEPENDENT CROSS-CHECK: data/machines.js's own cyclops_maw comment
     claims topsoil row 220 is "depth ~256" against this exact datum. If that
     claim and this test's shared formula ever disagree, one of the two
     pieces of prose in this codebase is stale. */
  if (row220 === null || Math.abs(row220 - 256) > 4) {
    fail(`DATUM: topsoil row 220 computes to depth ${row220} tiles against the shared datum, not the ~256 ` +
         `data/machines.js's own cyclops_maw comment claims -- one of the two is stale`);
    bad++;
  } else {
    console.log(`  ..  datum: topsoil row 220 is depth ${row220.toFixed(1)} tiles, matching data/machines.js's ` +
                'own "~256" note on cyclops_maw');
  }

  if (!bad)
    ok(`DATUM: the HUD gauge's transcribed formula and placementCheck's own REAL decision agree at the ` +
       `surface band, the astral band, and topsoil row 220 (${row220.toFixed(1)} tiles, matching ` +
       `data/machines.js's own note on cyclops_maw)`);
}

/* --- RENDER PURITY, extended to the map overview, the band ruler, and an
   active tutorial callout (invariants 9 and 7). Section 2 proves this for
   the plain HUD and the terrain; section 4's own extension (the drivetrain,
   above) proves it again for the `view/ui/` panel tree and the segment
   drawing. Neither probe has ever set `flags.showMap`, and the band ruler
   and the callout hint both draw INSIDE every one of those frames without
   either ever having been the thing under test on purpose -- this points
   the SAME two instruments (the epoch counter, the seeded `rand()` stream)
   at all three, proven non-vacuous first the same way section 4's cable
   probe is: checked to have actually drawn something, not merely drawn
   without complaint. */
{
  const drawTwice = label => {
    const before = epoch.epoch.n;
    main.draw();
    main.draw();
    if (epoch.epoch.n !== before) {
      fail(`RENDER PURITY (${label}): drawing it twice performed ${epoch.epoch.n - before} model write(s) ` +
           `-- view may never mutate model (invariant 9)`);
      return false;
    }
    return true;
  };
  const noRand = label => {
    rng.seedRng(9540);
    const expected = [rng.rand(), rng.rand(), rng.rand()];
    rng.seedRng(9540);
    const got = [];
    for (let i = 0; i < 3; i++) { main.draw(); main.draw(); got.push(rng.rand()); }
    if (got.join() !== expected.join()) {
      fail(`RENDER PURITY (${label}): drawing it consumed randomness -- a screenshot now depends on how ` +
           `many times you have drawn (invariant 7)`);
      return false;
    }
    return true;
  };

  let bad = 0;

  /* THE MAP OVERVIEW: `flags.showMap` gates a genuinely different render
     path (`view/scene.js#drawMap`, reading the tile grid directly rather
     than the per-chunk canvas cache normal play uses) that neither probe
     above has ever exercised. */
  boot.newRun(9540);
  input.flags.showMap = true;
  if (!drawTwice('the map overview')) bad++;
  if (!noRand('the map overview')) bad++;
  input.flags.showMap = false;

  /* THE BAND RULER: `view/hud.js#hudRuler` draws whenever there is room
     (`HUD_RULER_MIN_H`), which this harness's 1600x900 headless viewport
     always has -- proven ON SCREEN, not assumed, by requiring one of its
     own per-band rects (`view/ui/ruler.js#drawRuler` -- `id + '-band-' + ...`)
     actually landed in `drawn.panels` this frame, the same record
     `hudRuler` itself trusts for the quickbar's rect immediately above it. */
  main.draw();
  const ruled = uiState.drawn.panels.some(p => p.id.startsWith('hud-ruler-band-'));
  if (!ruled) {
    fail('RENDER PURITY (the band ruler): no \'hud-ruler-band-*\' rect was drawn this frame -- the purity ' +
         'probe below would be proving nothing was ever on screen');
    bad++;
  } else {
    if (!drawTwice('the band ruler')) bad++;
    if (!noRand('the band ruler')) bad++;
  }

  /* AN ACTIVE TUTORIAL CALLOUT: a fresh run's `tutorialBeat` is 0 and
     `data/callouts.js#CALLOUTS[0]` is 'TAKE THE PICKAXE', so this is already
     true the instant `newRun` returns -- asserted rather than assumed, since
     a callout that happened to be `null` here would leave the probe below
     pointed at nothing. */
  boot.newRun(9541);
  if (D_callouts.CALLOUTS[run.run.tutorialBeat] == null) {
    fail(`RENDER PURITY (a tutorial callout): CALLOUTS[${run.run.tutorialBeat}] is null on a fresh run -- ` +
         'there is nothing on screen for the probe below to test');
    bad++;
  } else {
    if (!drawTwice('a tutorial callout')) bad++;
    if (!noRand('a tutorial callout')) bad++;
  }

  if (!bad)
    ok('RENDER PURITY: the map overview, the band ruler (proven on screen via its own drawn rect), and an ' +
       'active tutorial callout all draw with 0 model writes and no randomness consumed, same as the plain ' +
       'HUD and the view/ui/ tree above');
}

/* --- REVEAL LEAK's LIGHT GATE, isolated from the radius cap. `rules/reveal.js#step`
   (Pass B) has TWO independent gates: solid rock blocks the flood outright
   (trivially true, and not what is in question), and past the always-
   revealed first ring, `if (d >= 1 && lightAt(...) < 1) continue` (around
   line 192) stops it at an UNLIT tile even when nothing solid is in the
   way. The existing Playwright enclosure test
   (`tests/visual.spec.js:928-970`) cannot isolate that second gate from
   `eff('sightRadius')`: its sealed room carries no light source at all, so
   its own boundary sits at graph distance 1 (the trivial always-revealed
   ring, widened only by the player's own footprint) regardless of the
   radius -- which proves the rule exists, not that it binds independently
   of the cap.

   THE AUDIT'S OWN PREMISE, CHECKED AND FOUND FALSE BEFORE WRITING THIS:
   "topsoil carries non-zero ambient light" is not why that test can't
   isolate the gate. `data/world.js#look.ambient` is read in exactly two
   places, `view/paint.js#cavityColour` and `view/scene.js#atmosphere` --
   both pure render tint, neither ever reaching `model/world.js#b.light` or
   `rules/light.js`. No band's `ambient` touches the light FIELD at all;
   `lightAt()` reads 0 wherever nothing REAL (sky or an emitter) reaches,
   in every band alike, which is the ordinary state of anywhere underground.
   There is no zero-ambient band to go find, because ambient was never the
   gate. What actually isolates the two mechanisms is a real light GRADIENT
   that dies out before the radius does -- any emitter dimmer than
   `eff('sightRadius')` (14) produces exactly that: a fuelled `brazier`
   (`level:12`, `rules/light.js`'s own falloff of 1/tile through open air)
   reaches 0 around 12 tiles out, inside the flood's own cap rather than at
   it. A real, fuelled brazier (the same idiom the LIGHT section above uses)
   in a long straight open-air corridor -- nowhere near rock -- produces
   that gradient for real, and the flood can be shown to stop partway along
   it, PROVABLY because of light and not because of distance. */
{
  let bad = 0;
  boot.newRun(9550);
  const band = world.bandOf('topsoil');
  const ex = 20, ty0 = 260, len = 30;              // deep in topsoil, nowhere near open sky

  for (let tx = ex - 1; tx <= ex + len; tx++)
    for (let ty = ty0 - 1; ty <= ty0 + 2; ty++) tiles.write.clear(band, tx, ty);
  for (let tx = ex - 1; tx <= ex + len; tx++) tiles.write.set(band, tx, ty0 + 2, D_sub.S.stone);

  const brazier = machs.write.place(band, D_mach.M.brazier, ex, ty0 + 1);
  machs.write.take(brazier, D_sub.S.timber, D_form.F.log, 20);

  const playerTx = ex + 2;                            // the flood's own seed column, not the brazier's
  player.write.band(band);
  player.write.move(world.worldX(band, playerTx), world.worldY(band, ty0));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  runReal(30, 1 / 120, { hasMouse: false });          // ignite, settle the light field, and flood real frames

  const radius = mods.eff('sightRadius');
  let edge = -1;
  for (let tx = ex; tx < ex + len; tx++)
    if (world.lightAt(band, tx, ty0 + 1) === 0) { edge = tx; break; }

  /* RADIUS DISTANCE IS MEASURED FROM THE FLOOD'S OWN SEED (the player's
     tile), never from the brazier -- the two sit two tiles apart on
     purpose, and `eff('sightRadius')` bounds graph distance from the
     player, not from whatever lit the corridor. */
  if (edge < 0) {
    fail('REVEAL LEAK (light gate): the corridor never went dark within its own length -- lengthen it, or ' +
         'the brazier\'s falloff no longer isolates the gate at all');
    bad++;
  } else if (edge + 2 - playerTx >= radius) {
    fail(`REVEAL LEAK (light gate): the dark edge (tx ${edge}) sits ${edge - playerTx} tiles from the ` +
         `player, at or past eff('sightRadius') (${radius}) -- the radius cap would bind first, so this ` +
         'scenario no longer isolates the light gate from it');
    bad++;
  } else {
    console.log(`  ..  reveal leak: a level-${D_mach.MACH[D_mach.M.brazier].light.level} brazier's own ` +
                `light reaches 0 at tx ${edge} (${edge - ex} tiles from the brazier, ${edge - playerTx} ` +
                `from the player), inside sightRadius ${radius}`);

    const lastLit = world.seenAt(band, edge - 1, ty0 + 1);
    const pastDark = world.seenAt(band, edge + 2, ty0 + 1);
    if (!lastLit) {
      fail(`REVEAL LEAK (light gate): the last LIT tile before the dark edge (tx ${edge - 1}) was never ` +
           'revealed at all -- the flood never even reached the lit region, so the boundary below proves ' +
           'nothing');
      bad++;
    } else if (pastDark) {
      fail(`REVEAL LEAK (light gate): tx ${edge + 2} -- two tiles past where light reads 0, and only ` +
           `${edge + 2 - playerTx} of the ${radius}-tile radius from the player -- was revealed anyway. ` +
           "rules/reveal.js's own 'lightAt(...) < 1' gate did not stop the flood");
      bad++;
    } else {
      console.log(`  ..  reveal leak: tx ${edge - 1} (still lit) is seen, tx ${edge + 2} (dark, and only ` +
                  `${edge + 2 - playerTx} of the ${radius}-tile radius from the player) is not -- the light ` +
                  'gate stopped the flood well short of the radius cap');
    }
  }

  if (!bad)
    ok('REVEAL LEAK: a real, fuelled brazier dimmer than sightRadius produces a corridor that goes dark ' +
       'well inside the flood\'s own radius, and the flood stops exactly there -- the light gate, not the cap');
}

/* --- HEAVENS LEDGER, sub-bullet: delivery with a broken lift chain fails and
   says why. CHECKED FIRST, BEFORE WRITING A TEST: does anything in
   `rules/drive.js` or `rules/cycles.js` surface a "why" when a haul arrives
   at a hub with nowhere further to go? It did not -- `drive(s, dt)`'s own
   'winch' journal row (`"<n> DELIVERED TO <BAND>"`) fires on arrival at
   EVERY segment's own top hub, relay leg or not, so a haul stranded at a
   dead-end hub read exactly like a real delivery. That is a real gap in the
   GAME, not only in this test suite (CLAUDE.md's own caution against a test
   that asserts behaviour that is not there), so `rules/drive.js` gains the
   minimal fix first: the SAME 'refused' journal kind `'TOO HEAVY TO LIFT'`
   already uses, fired once, on the same edge-triggered arrival, when the
   top hub is neither a receiver (`tribute:{}`/`ports`) nor anchors any
   OTHER segment. Tested here in three shapes: the dead end itself, a real
   receiver (must NOT fire), and a mid-chain hub with a segment still beyond
   it (must NOT fire either -- a relay leg is not a dead end). */
console.log('\n8b. broken-chain delivery (rules/drive.js fix, checked here)');
{
  let bad = 0;

  /* A. THE DEAD END: one segment, cranked to arrival, nothing beyond it. */
  {
    const r = driveRig({
      seed: 9570, room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['crank', 19, 115]],
      links: [[0, 1]], player: [18, 115], cargo: [[0, 'copper', 'ore', 1]]
    });
    journal.write.drain();
    for (let i = 0; i < 120 * 30 && r.seg.t < 1; i++) stepReal(1 / 120, { turn: true, hasMouse: false });
    runReal(5, 1 / 120, { turn: true, hasMouse: false });
    const rows = journal.write.drain().filter(j => j.kind === 'refused' && /CHAIN ENDS HERE/.test(j.data?.why ?? ''));
    if (r.seg.t < 1) {
      fail(`BROKEN CHAIN: the rig only reached t = ${r.seg.t.toFixed(3)} in 30 s of cranking -- the ` +
           'arrival this test needs never happened');
      bad++;
    } else if (!rows.length) {
      fail('BROKEN CHAIN: a haul arrived at a dead-end hub (no receiver, no onward segment) and no ' +
           "'refused'/'THE CHAIN ENDS HERE' journal row was pushed -- the delivery failed silently");
      bad++;
    } else {
      console.log(`  ..  broken chain: a dead-end arrival pushed ${JSON.stringify(rows[0].data)}`);
    }
  }

  /* B. A REAL RECEIVER: the SAME shape, `cloud_dock` in place of the second
     hub. Must NOT fire -- a dock is somewhere, not nowhere. */
  {
    const r = driveRig({
      seed: 9571, room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['cloud_dock', 20, 105], ['crank', 19, 115]],
      links: [[0, 1]], player: [18, 115], cargo: [[0, 'copper', 'ore', 1]]
    });
    journal.write.drain();
    for (let i = 0; i < 120 * 30 && r.seg.t < 1; i++) stepReal(1 / 120, { turn: true, hasMouse: false });
    runReal(5, 1 / 120, { turn: true, hasMouse: false });
    const rows = journal.write.drain().filter(j => j.kind === 'refused' && /CHAIN ENDS HERE/.test(j.data?.why ?? ''));
    if (r.seg.t < 1) {
      fail(`BROKEN CHAIN: the dock rig only reached t = ${r.seg.t.toFixed(3)} in 30 s of cranking -- the ` +
           'arrival this negative case needs never happened');
      bad++;
    } else if (rows.length) {
      fail(`BROKEN CHAIN: a haul arrived at a real receiver (cloud_dock) and still got ` +
           `${JSON.stringify(rows[0].data)} -- the new refusal is firing somewhere it should not`);
      bad++;
    } else {
      console.log('  ..  broken chain: a real receiver (cloud_dock) gets no dead-end refusal');
    }
  }

  /* C. A MID-CHAIN HUB: A-B-C, two segments, cranked to arrival at B. B
     anchors a SECOND segment onward (to C), so this is a relay leg, not a
     dead end, and must NOT fire either. */
  {
    const r = driveRig({
      seed: 9572, room: { ty0: 90, h: 28 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['hub', 20, 95], ['crank', 19, 115]],
      links: [[0, 1], [1, 2]], player: [18, 115], cargo: [[0, 'copper', 'ore', 1]]
    });
    journal.write.drain();
    for (let i = 0; i < 120 * 30 && r.segs[0].t < 1; i++) stepReal(1 / 120, { turn: true, hasMouse: false });
    runReal(5, 1 / 120, { turn: true, hasMouse: false });
    const rows = journal.write.drain().filter(j => j.kind === 'refused' && /CHAIN ENDS HERE/.test(j.data?.why ?? ''));
    if (r.segs[0].t < 1) {
      fail(`BROKEN CHAIN: the A-B-C rig only reached t = ${r.segs[0].t.toFixed(3)} on its lower segment in ` +
           '30 s of cranking -- the arrival this negative case needs never happened');
      bad++;
    } else if (rows.length) {
      fail(`BROKEN CHAIN: a haul arrived at hub B, which anchors a SECOND segment onward to C, and still ` +
           `got ${JSON.stringify(rows[0].data)} -- a relay leg is being flagged as a dead end`);
      bad++;
    } else {
      console.log('  ..  broken chain: a mid-chain hub (a second segment still beyond it) gets no dead-end refusal');
    }
  }

  if (!bad)
    ok('BROKEN CHAIN: rules/drive.js now pushes a \'refused\'/\'THE CHAIN ENDS HERE\' row exactly when a ' +
       'haul arrives at a hub with no receiver and no onward segment, and never for a real receiver or a ' +
       'mid-chain relay leg');
}

/* --- HEAVENS LEDGER, sub-bullet: cycle completion unlocks exactly one band.
   `rules/cycles.js#complete`'s `for (const id of reward.charts ?? []) rw.chart(id)`
   is the mechanism -- driven here through the SAME real hand-feed idiom THE
   ALTAR test (section 6, above) already uses, twice, for cycle 1 (charts
   'astral') and cycle 2 (charts 'topsoil'). No two shipped rows in
   `data/cycles.js#CYCLES` chart the same band, so the table itself never
   exercises re-charting one -- said here rather than pretended otherwise --
   and the idempotency half is asserted directly on `model/run.js#write.chart`'s
   own guard instead. */
console.log('\n8c. HEAVENS LEDGER: cycle completion unlocks exactly one band');
{
  let bad = 0;
  boot.newRun(9580);
  const topsoil = world.bandOf('topsoil');
  for (let ty = 110; ty <= 119; ty++)
    for (let tx = 16; tx <= 29; tx++) tiles.write.clear(topsoil, tx, ty);
  for (let tx = 16; tx <= 29; tx++) tiles.write.set(topsoil, tx, 119, D_sub.S.stone);

  /* CYCLE 1: the altar, placed here BEFORE the first real step so
     `rules/cycles.js#ensureAltarPlaced`'s own `machines.some(...)` guard sees
     one already exists and never places a second -- the same order THE
     ALTAR test (section 6) already relies on. */
  footUnder(machs.write.place(topsoil, D_mach.M.altar, 22, 117));
  player.write.band(topsoil);
  player.write.move(world.worldX(topsoil, 21), world.worldY(topsoil, 117));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  run.write.collect(D_sub.S.copper, D_form.F.ore, 10);
  runReal(240, 1 / 120, { hasMouse: false });

  if (run.run.cycle <= 1 || run.run.charted.length !== 1 || run.run.charted[0] !== 'astral') {
    fail(`CYCLE CHARTS: after cycle 1 completes, run.charted is ${JSON.stringify(run.run.charted)} (want ` +
         `exactly ['astral']) and run.cycle is ${run.run.cycle} (want > 1)`);
    bad++;
  } else {
    console.log('  ..  cycle charts: cycle 1 completion charted exactly [\'astral\']');

    /* CYCLE 2: `cloud_dock`, 3 copper/plate, hand-fed the same way. */
    footUnder(machs.write.place(topsoil, D_mach.M.cloud_dock, 22, 115));
    player.write.move(world.worldX(topsoil, 21), world.worldY(topsoil, 115));
    run.write.collect(D_sub.S.copper, D_form.F.plate, 3);
    runReal(240, 1 / 120, { hasMouse: false });

    if (run.run.cycle <= 2 || run.run.charted.length !== 2 ||
        run.run.charted[0] !== 'astral' || run.run.charted[1] !== 'topsoil') {
      fail(`CYCLE CHARTS: after cycle 2 completes, run.charted is ${JSON.stringify(run.run.charted)} (want ` +
           `exactly ['astral','topsoil']) and run.cycle is ${run.run.cycle} (want > 2)`);
      bad++;
    } else {
      console.log('  ..  cycle charts: cycle 2 completion charted exactly one MORE band, [\'topsoil\'], not ' +
                  'duplicating the first');

      /* IDEMPOTENCY, on the primitive itself, since the shipped table never
         exercises it: `write.chart`'s own guard
         (`if (!run.charted.includes(bandId))`) is what "not duplicated on a
         second completion" actually rests on. */
      run.write.chart('astral');
      if (run.run.charted.length !== 2) {
        fail(`CYCLE CHARTS: charting 'astral' a second time grew run.charted to ` +
             `${run.run.charted.length} (want 2, unchanged) -- write.chart is not idempotent`);
        bad++;
      } else {
        console.log('  ..  cycle charts: charting an already-charted band a second time is a no-op ' +
                    '(idempotent)');
      }
    }
  }

  if (!bad)
    ok('CYCLE CHARTS: cycle 1 charts exactly [\'astral\'], cycle 2 charts exactly one more (\'topsoil\'), ' +
       'and re-charting an already-charted band is a no-op');
}

console.log(`\ntotals: fillRect ${calls.fillRect.toLocaleString()}, ` +
            `drawImage ${calls.drawImage.toLocaleString()}, ` +
            `journal ${journal.peek ? journal.peek().length : 0} undrained`);

if (failures) console.error(`\n${failures} CHECK(S) FAILED\n`);
else {
  console.log('\nAll checks passed.');
  console.log('This says nothing about whether it LOOKS right — open it and judge.\n');
}
