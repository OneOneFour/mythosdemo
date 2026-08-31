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
const player = await import('../src/model/player.js');
const run    = await import('../src/model/run.js');
const mods   = await import('../src/model/mods.js');
const epoch  = await import('../src/model/epoch.js');
const journal = await import('../src/model/journal.js');
const modelBoons = await import('../src/model/boons.js');
const aimModel = await import('../src/model/aim.js');
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
  for (const k of ['left', 'right', 'up', 'down', 'hop', 'dig', 'place', 'craft', 'drop', 'hasMouse'])
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
    machines: machs.machines.map(m => ({
      def: m.def, tx: m.tx, ty: m.ty, buf: { ...m.buf }, prog: +m.prog.toFixed(4),
      made: m.made, charges: m.charges, running: m.running
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
function scriptedPlay(seed, steps) {
  boot.newRun(seed);
  const ctl = rng.mulberry(0xD00D5EED);
  for (let i = 0; i < steps; i++) {
    stepReal(1 / 120, {
      left: ctl() < 0.2, right: ctl() < 0.3, up: ctl() < 0.15, down: ctl() < 0.25,
      hop: ctl() < 0.05, dig: ctl() < 0.55, craft: ctl() < 0.2, place: ctl() < 0.02,
      hasMouse: false
    });
    if (run.run.dead) boot.newRun(seed);
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
     consumes. Use it rather than string-matching ids. */
  for (const m of D_mach.MACHINES) {
    for (const r of m.recipes || []) {
      /* A recipe with `from:` draws from a NON-ITEM source, so its inputs are
         that source's named units rather than substance x form selectors. This
         is the blood-winch mechanism: `{ in:{heart:1}, from:'vital' }` spends
         the player's health, and "heart" is a unit, not a substance. */
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

/* --- a trinket is an item now: drafting it drops a relic, picking it up
   and EQUIPPING it changes an effective value, and spending it out of the
   inventory restores the base -- all through `run.inv`/`run.equipped`, none
   of it through a dedicated list (Phase 4, docs/BUILD_PLAN.md: an equip slot
   is a SELECTION over `run.inv`, not a second inventory, so holding alone is
   no longer enough -- it must also be equipped). --- */
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

  boot.newRun(seed);
  const after = snapshotModel();

  const beforeJson = JSON.stringify(fresh), afterJson = JSON.stringify(after);
  if (beforeJson !== afterJson) {
    const key = Object.keys(fresh).find(k => JSON.stringify(fresh[k]) !== JSON.stringify(after[k]));
    fail(`newRun() RESET: "${key}" differs between two fresh newRun(${seed}) calls around a dirtied run\n` +
         `     before: ${JSON.stringify(fresh[key]).slice(0, 200)}\n` +
         `     after:  ${JSON.stringify(after[key]).slice(0, 200)}`);
  } else ok('newRun() RESET: every exported model object fingerprints identically across two fresh calls on the same seed');
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
   the substep where the two figures first disagree. --- */
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
   `data/machines.js#MACH`/`data/recipes.js#recipesOf`, because
   docs/BUILD_PLAN.md names it explicitly at this tier too and it costs
   nothing to check twice from two angles. --- */
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

/* --- BREAK-EVEN DEPTH: docs/DESIGN.md's "lift cost per item-slot = k x
   depth" equation, computed against the LIVE numbers rather than restated as
   prose. `k` is the lift's own honest-fuel mass (`timber/log`, the row every
   staged machine shares) amortised over its span in tiles, per one
   "item-slot" of cargo -- taken as one unit of raw ore, the design doc's own
   reference unit. Each tier's break-even depth is `ratio / k`
   (docs/SPEC.md section 8's locked ratios), so a MORE compressed tier
   survives to a GREATER depth before the fuel bill exceeds what a single
   item-slot is worth -- that ordering, not the exact depth figure, is the
   game's central pressure, and is what actually gets asserted. The computed
   raw-ore figure is printed for a human to compare against
   docs/DESIGN.md's own "around depth 30" estimate (written before the lift
   was implemented, so an exact match is not required), and is only asserted
   to be finite, positive and within a broad, clearly-labelled sanity band --
   loose enough not to fail on an honest retune, tight enough to catch a
   broken one (a zero or negative k, an inverted ratio table). --- */
{
  const liftDef = D_mach.MACH[D_mach.M.lift];
  const topsoil = world.bandOf('topsoil');
  const fuelMass = items.massOfPair(D_sub.S.timber, D_form.F.log);
  const spanTiles = liftDef.lift.span / topsoil.tile;
  const refItemMass = items.massOfPair(D_sub.S.copper, D_form.F.ore);
  const k = fuelMass / spanTiles / refItemMass;
  const RATIOS = { ore: 1, ingot: 4, plate: 12 };        // docs/SPEC.md section 8
  const breakEven = tier => RATIOS[tier] / k;
  const beOre = breakEven('ore'), beIngot = breakEven('ingot'), bePlate = breakEven('plate');

  console.log(`  ..  break-even depth: ore ${beOre.toFixed(1)}, ingot ${beIngot.toFixed(1)}, ` +
              `plate ${bePlate.toFixed(1)} tiles (k=${k.toFixed(4)} T/tile/item-slot; ` +
              `docs/DESIGN.md's own pre-implementation estimate for raw ore was "around depth 30")`);

  if (!(Number.isFinite(beOre) && beOre > 0))
    fail(`BREAK-EVEN DEPTH: raw ore break-even (${beOre}) is not a finite positive depth`);
  else if (!(beIngot > beOre && bePlate > beIngot))
    fail(`BREAK-EVEN DEPTH: compression should push the break-even DEEPER per tier -- got ore ${beOre.toFixed(1)}, ` +
         `ingot ${beIngot.toFixed(1)}, plate ${bePlate.toFixed(1)}`);
  else if (!(beOre > 2 && beOre < 400))
    fail(`BREAK-EVEN DEPTH: raw ore break-even ${beOre.toFixed(1)} tiles is outside a plausible band -- ` +
         `check the lift span/fuel or the compression ratios`);
  else ok(`BREAK-EVEN DEPTH: ore ${beOre.toFixed(1)} < ingot ${beIngot.toFixed(1)} < plate ${bePlate.toFixed(1)} tiles -- ` +
          `a deeper haul is only worth it once refined`);
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

console.log(`\ntotals: fillRect ${calls.fillRect.toLocaleString()}, ` +
            `drawImage ${calls.drawImage.toLocaleString()}, ` +
            `journal ${journal.peek ? journal.peek().length : 0} undrained`);

if (failures) console.error(`\n${failures} CHECK(S) FAILED\n`);
else {
  console.log('\nAll checks passed.');
  console.log('This says nothing about whether it LOOKS right — open it and judge.\n');
}
