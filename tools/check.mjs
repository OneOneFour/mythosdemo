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

import { checkLayers } from './layers.mjs';

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
const D_boon = await import('../src/data/boons.js');
const D_src  = await import('../src/data/sources.js');
const D_world = await import('../src/data/world.js');
const world  = await import('../src/model/world.js');
const tiles  = await import('../src/model/tiles.js');
const mining = await import('../src/model/mining.js');
const items  = await import('../src/model/items.js');
const _machs = await import('../src/model/machines.js');   // imported to prove it loads
const player = await import('../src/model/player.js');
const run    = await import('../src/model/run.js');
const mods   = await import('../src/model/mods.js');
const epoch  = await import('../src/model/epoch.js');
const journal = await import('../src/model/journal.js');
const boot   = await import('../src/shell/boot.js');
const main   = await import('../src/shell/main.js');
const sched  = await import('../src/shell/schedule.js');

console.log('\n   imported every layer without error');


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

  /* A trinket key is dotted: `rate.furnace` is the tunable `rate` scoped to
     `furnace`. Splitting on the FIRST dot is the rule mods.js applies. */
  for (const t of D_trk.TRINKETS || []) {
    for (const mod of t.mods || []) {
      const raw = mod.tunable || mod.key || '';
      const base = raw.split('.')[0];
      if (base && !(base in D_tune.TUNE))
        { fail(`trinket ${t.id}: tunable "${base}" is not in data/tuning.js`); bad++; }
    }
  }
  const machIds = new Set(D_mach.MACHINES.map(m => m.id));
  for (const [id, b] of Object.entries(D_boon.MACHINE_BOONS || D_boon.BOONS || {}))
    if (b.grants && !machIds.has(b.grants))
      { fail(`boon ${id}: grants unknown machine "${b.grants}"`); bad++; }

  if (!bad) ok(`${D_sub.SUBSTANCES.length} substances, ${formIds.size} forms, ` +
               `${D_mach.MACHINES.length} machines, all names resolve`);

  const bands = D_world.BANDS || D_world.WORLD || [];
  if (bands.length !== 3) fail(`expected 3 bands, found ${bands.length}`);
  else ok(`3 bands: ${bands.map(b => b.id).join(' / ')}`);
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
  for (let i = 0; i < 240; i++) sched.stepAll(1 / 120, { right: 1, hasMouse: false });
  if (!(p.x > x0 + 8)) fail(`walking right moved the player ${(p.x - x0).toFixed(1)} px`);
  else ok(`walks: ${(p.x - x0).toFixed(0)} px in 2 simulated seconds`);

  let stuck = 0, nonFinite = 0;
  const seed = rng.mulberry(0xC0FFEE);
  for (let f = 0; f < 60 * 120; f++) {
    const c = {
      left: seed() < 0.3 ? 1 : 0, right: seed() < 0.3 ? 1 : 0,
      up: seed() < 0.2 ? 1 : 0, down: seed() < 0.25 ? 1 : 0,
      hop: seed() < 0.06 ? 1 : 0, dig: seed() < 0.5 ? 1 : 0,
      place: seed() < 0.02 ? 1 : 0, hasMouse: false
    };
    sched.stepAll(1 / 120, c);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vy)) nonFinite++;
    if (p.band && tiles.solidAt(p.band, world.tileX(p.band, p.x + player.PW / 2),
                                        world.tileY(p.band, p.y + player.PH / 2))) stuck++;
    if (run.run.dead) boot.newRun(1337);
  }
  if (nonFinite) fail(`${nonFinite} frames with non-finite player state`);
  if (stuck) fail(`player centre inside solid rock on ${stuck} frames`);
  if (!nonFinite && !stuck) ok('7,200-frame fuzz: no non-finite state, never inside rock');
}

/* --- a trinket is an item now: drafting it drops a relic, picking it up
   changes an effective value, and spending it out of the inventory restores
   the base -- all through `run.inv`, none of it through a dedicated list. --- */
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
    /* The draft spawns a falling item; let it land in the pickup radius and
       `trinkets.step()` sync `model/mods.js` from `run.inv`. */
    for (let i = 0; i < 180 && run.invCount(D_sub.S[t.id], D_form.F.relic) === 0; i++)
      sched.stepAll(1 / 120, { hasMouse: false });
    const withT = mods.eff(key, scope);
    if (withT === base) fail(`trinket ${t.id} did not change eff("${key}") after pickup`);
    else ok(`trinket ${t.id}: ${key} ${base} -> ${withT}`);

    run.write.spend(D_sub.S[t.id], D_form.F.relic, 1);
    sched.trinkets.step();
    if (mods.eff(key, scope) !== base) fail('spending the relic did not restore the base');
    else ok('spending the relic restores the base value');
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
    for (let i = 0; i < 600; i++) sched.stepAll(1 / 120, { right: 1, dig: 1, hasMouse: false });
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

console.log(`\ntotals: fillRect ${calls.fillRect.toLocaleString()}, ` +
            `drawImage ${calls.drawImage.toLocaleString()}, ` +
            `journal ${journal.peek ? journal.peek().length : 0} undrained`);

if (failures) console.error(`\n${failures} CHECK(S) FAILED\n`);
else {
  console.log('\nAll checks passed.');
  console.log('This says nothing about whether it LOOKS right — open it and judge.\n');
}
