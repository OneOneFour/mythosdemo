/* Headless verification for the layered architecture, in four sections
   ordered by what they can prove:

     0  dependency direction    the layering is intact
     1  name resolution         every string key in `data/` resolves
     2  purity                  a render performs no model writes
     3  behaviour               the game does what it says it does

      It cannot tell you whether anything looks good. Screenshots cover
      appearance changing; a human covers appearance being right. */

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkLayers } from './layers.mjs';
import { checkContent } from './content.mjs';

/* DOM and canvas2d stub. Not a pure stub: `fillRect`/`drawImage` also assert
   finiteness, which is where a good share of this harness's value comes from. */
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

/* `src/shell/save.js` is the only reader, and it guards against storage being
   absent or throwing. The save-slot section installs hostile stand-ins of its
   own and restores this one afterwards. */
const defaultStore = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }
  };
};
globalThis.localStorage = defaultStore();

let failures = 0;
const fail = m => { console.error('  FAIL: ' + m); failures++; process.exitCode = 1; };
const ok   = m => console.log('  ok   ' + m);


console.log('\n0. dependency direction');
{
  const r = await checkLayers({ quiet: true });
  if (r.violations.length) {
    for (const v of r.violations) fail(`${v.rel} imports ${v.spec} — ${v.why}`);
  } else {
    ok(`${r.files} files, ${r.edges} edges, 0 violations`);
  }
}


/* Import every module, so an orphan or a parse error cannot hide. */
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
const growth = await import('../src/model/growth.js');
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
const digqueue = await import('../src/model/digqueue.js');
/* The one `rules` module imported directly. Every other behavioural probe in
   this file drives the game through `shell/main.js#step` and the real `cmd`
   object, which is what `stepReal` is for. */
const R_place = await import('../src/rules/placement.js');
/* The one `view` module imported directly: the chunk-seam probe needs
   `chunkCanvas`'s own return value, one chunk at a time, which `main.draw`
   never exposes -- it composites many chunks and discards each cached canvas. */
const viewPaint = await import('../src/view/paint.js');
/* Same exception for the render-purity probe below: proving the ruler and the
   quickbar are on screen this frame, rather than that drawing whatever is
   there is pure, needs `view/ui/state.js#drawn`, as `view/hud.js` does. */
const uiState = await import('../src/view/ui/state.js');
/* A rope is a loop carrying many buckets. These name its FIRST bucket, so the
   probes below read as they did when a rope carried exactly one. */
const car0   = seg => seg.carriers[0] ?? null;
const carPos = seg => segs.carrierPos(seg, car0(seg));
const carTop = seg => segs.carrierTop(seg, car0(seg));
const carBox = seg => segs.carrierBox(seg, car0(seg));
/* Rail parameter of that bucket: 0 at the low anchor, 1 at the high one. */
const carT   = seg => (car0(seg) ? segs.railT(segs.phaseOf(seg, car0(seg))) : 0);
/* The rope's own midpoint, which needs no bucket to exist. */
const carPos0 = seg => ({ x: (seg.ax + seg.bx) / 2, y: (seg.ay + seg.by) / 2 });
/* Has the rope's bucket gone over the top, where it sheds its haul? On a loop
   it never stops at the high anchor, so "reached t = 1" is not a state a probe
   can wait for -- being on the descending strand is. */
const overTop = seg => !!car0(seg) && segs.phaseOf(seg, car0(seg)) >= 0.5;

/* Put exactly one bucket on the rope, at rail parameter `t` going up. */
function setCar(seg, t) {
  segs.write.spin(seg, -seg.u, 0);
  while (seg.carriers.length) segs.write.detach(seg, seg.carriers[0]);
  segs.write.attach(seg, t / 2);
}

const boot   = await import('../src/shell/boot.js');
const main   = await import('../src/shell/main.js');
const sched  = await import('../src/shell/schedule.js');
const input  = await import('../src/shell/input.js');
const shellUi = await import('../src/shell/ui.js');
const save   = await import('../src/shell/save.js');

/* And every other module, derived from the filesystem, so a new file under
   `src/` is covered the moment it exists. The named bindings above exist
   because probes use them; a hand-written list goes stale silently. */
const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));
const srcFiles = (function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(`${dir}${e.name}/`)
      : (e.name.endsWith('.js') ? [dir + e.name] : []));
})(SRC_DIR);
{
  let bad = 0;
  for (const f of srcFiles) {
    try { await import(pathToFileURL(f).href); }
    catch (e) { fail(`import ${f.slice(SRC_DIR.length)}: ${e.message}`); bad++; }
  }
  if (!srcFiles.length) fail('the src/ sweep found no modules at all, so nothing below is under test');
  else if (!bad) console.log(`\n   imported all ${srcFiles.length} modules under src/ without error`);
}

/* The real step, not a reimplemented loop: `shell/main.js#step` is the only
   place `clock.t` advances, the map-freeze guard lives and `cmd.dig`/`cmd.mouse`
   merge into one intent. `stepReal` clears edges as the real RAF loop does. */
/* `action` is listed because it is a hold that `clearEdges` will not put back
   down, and `cmd` is a module singleton every probe shares -- a section that
   left a crank held would power the next section's drivetrain. */
const CMD_FIELDS = ['left', 'right', 'up', 'down', 'hop', 'dig', 'place', 'feed',
                    'craft', 'drop', 'action', 'collect', 'hasMouse'];
const setCmd = want => { for (const k of CMD_FIELDS) input.cmd[k] = want[k] ?? false; };

function stepReal(dt, want = {}) {
  setCmd(want);
  main.step(dt);
  input.clearEdges();
}

/* The other half of a real frame, for the one-shot intents: placement,
   deconstruction, linking, the drop verb and the feed verb are events
   `shell/main.js#frame` dispatches through `applyIntents`, outside `step`. */
function frameReal(dt, want = {}) {
  setCmd(want);
  main.step(dt);
  main.applyIntents();
  input.clearEdges();
}
function runReal(n, dt, want = {}) {
  for (let i = 0; i < n; i++) stepReal(dt, want);
}

/* Hand `n` units over for real, in the order `shell` drives it: arm the pair,
   point at the machine's own box, and fire one edge-triggered `cmd.feed` per
   unit through `frameReal`. Returns how many units left the pockets. */
function feedByHand(m, sub, form, n, dt = 1 / 120) {
  const before = run.invCount(sub, form);
  shellUi.armPlace(sub, form);
  for (let i = 0; i < n; i++) {
    input.cmd.mx = m.box.x + m.box.w / 2;
    input.cmd.my = m.box.y + m.box.h / 2;
    frameReal(dt, { hasMouse: true, feed: true });
  }
  shellUi.clearArmedPlace();
  return before - run.invCount(sub, form);
}

/* Cheap rolling checksum over a typed array: `b.mat`/`b.seen`/`b.light` are
   tens of thousands of bytes each, and this only has to answer "did anything
   change". Order-sensitive, so a transposition is caught too. */
function sumBytes(arr) {
  let h = 2166136261;
  for (let i = 0; i < arr.length; i++) { h ^= arr[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* Every exported model object's own live state, flattened into one plain
   JSON-comparable snapshot. `epoch` is deliberately excluded: it only ever
   increases, so including it would make two identical snapshots differ. */
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
        /* Growth is the whole entry and not a count, unlike `mining` above: a growing
           seed carries a second number the tile grid cannot express, so a count would
           match a fresh seed and one 179 s in. Sorted by key, not insertion order. */
    growth: [...growth.planted().entries()]
      .map(([k, e]) => ({ k, ord: e.ord, tx: e.tx, ty: e.ty, secs: +e.secs.toFixed(6) }))
      .sort((a, b2) => a.k - b2.k),
        /* `torque` and `turn` are the two fields `rules/drive.js` writes on a
           machine record every frame, and a `turn` phase that survived a restart
           would be a gear that remembers how far the previous run cranked it. */
    machines: machs.machines.map(m => ({
      def: m.def, tx: m.tx, ty: m.ty, buf: { ...m.buf }, prog: +m.prog.toFixed(4),
      made: m.made, charges: m.charges, running: m.running,
      torque: +m.torque.toFixed(6), turn: +m.turn.toFixed(6)
    })),
        /* Segments are state and are therefore fingerprinted, with the two hub
           records recorded as their index in `machs.machines` -- an identity JSON
           can compare, without pulling the whole machine in twice. */
    segments: segs.segments.map(s => ({
      a: machs.machines.indexOf(s.a), b: machs.machines.indexOf(s.b),
      ax: s.ax, ay: s.ay, bx: s.bx, by: s.by,
      len: +s.len.toFixed(4), slope: +s.slope.toFixed(6), hi: s.hi,
      u: +s.u.toFixed(6), spin: s.spin, load: +s.load.toFixed(4), band: s.band?.id ?? null,
      cars: s.carriers.map(c => +c.off.toFixed(6))
    })),
    mods: mods.mods.rows.map(r => ({ src: r.src, key: r.key, mul: r.mul, add: r.add })),
    boons: modelBoons.boons.active.map(a => ({ id: a.id, left: +a.left.toFixed(4) })),
    aim: { band: aimModel.aim.band?.id ?? null, tx: aimModel.aim.tx, ty: aimModel.aim.ty,
           valid: aimModel.aim.valid, mode: aimModel.aim.mode },
    journal: journal.peek().length
  };
}

/* A deterministic scripted play session: fresh `newRun(seed)`, then `steps`
   substeps of a control-input stream on its own seeded generator, separate
   from the game's own `rand`. A run that dies restarts on the same seed. */
/* The script builds a drivetrain and turns it, since a fingerprint over
   `segments` and `m.torque` proves nothing about a mechanic it never touches:
   two hubs and a crank by the spawn tile, and a `turn` hold at 40%. */
const scriptStats = { turned: 0, moved: 0, links: 0, cuts: 0 };

function scriptRig() {
  const band = player.player.band;
  if (!band) return null;
  const ptx = world.tileX(band, player.player.x), pty = world.tileY(band, player.player.y);
  for (let ty = pty - 12; ty <= pty + 1; ty++)
    for (let tx = ptx + 1; tx <= ptx + 4; tx++) tiles.write.clear(band, tx, ty);
    /* `footUnder`: every hub in this file stands on a real footing tile, and this
       rig links through `linkCheck`, so without one it is a scene
       `rules/placement.js` could not have built. */
  const lo = footUnder(machs.write.place(band, D_mach.M.hub, ptx + 2, pty - 1));
  const hi = footUnder(machs.write.place(band, D_mach.M.hub, ptx + 2, pty - 10));
  footUnder(machs.write.place(band, D_mach.M.winch, ptx + 1, pty - 1));
  scriptLink(lo, hi);
  return { lo, hi };
}

/* Link, then park the carrier mid-cable rather than at the low end a fresh link
   leaves it at: one parked at 0.6 descends 43 px under its own weight from the
   first substep, whether or not the player is standing at the handle. */
function scriptLink(lo, hi) {
  const seg = R_place.linkSegment(lo, hi);
  if (seg) setCar(seg, 0.6);
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
      action: ctl() < 0.4, hasMouse: false
    });
    if (machs.machines.some(m => m.torque > 0)) scriptStats.turned++;
    /* Total travel, not the furthest point reached: a carrier that rose and
       sank back is a carrier that moved, and a cut/relink resets `t` to 0. */
    const s = segs.segments[0] ?? null;
    if (s && prevT !== null) scriptStats.moved += Math.abs(carT(s) - prevT) * s.len;
    prevT = s ? carT(s) : null;
        /* A scripted cut and relink, rarely: `write.unlink`/`write.link` reorder
           `segments`, which is the one thing that could make an otherwise
           deterministic drivetrain iterate in a different order between runs. */
    if (rig && ctl() < 0.002) {
      const existing = segs.linkedTo(rig.lo, rig.hi);
      if (existing) { R_place.unlinkSegment(existing); scriptStats.cuts++; }
      else if (scriptLink(rig.lo, rig.hi)) scriptStats.links++;
      prevT = segs.segments[0] ? carT(segs.segments[0]) : null;
    }
    if (run.run.dead) { boot.newRun(seed); rig = scriptRig(); prevT = segs.segments[0]?.t ?? null; }
  }
  return JSON.stringify(snapshotModel());
}

/* The fresh-process half of the determinism check: `--determinism-probe` runs
   only this and prints the fingerprint as its last line of stdout. Checked
   here, before any other logging, since only that last line is read. */
if (process.argv.includes('--determinism-probe')) {
  console.log(scriptedPlay(2024, 10000));
  process.exit(0);
}


console.log('\n1. content resolves');
{
  const formIds = new Set(Object.keys(D_form.FORMS));
  const sourceIds = new Set(Object.keys(D_src.SOURCES || {}));
  let bad = 0;

    /* `forms.expand(sel)` returns every legal substance x form pair a selector
       covers, and an empty result is exactly the failure that would let a
       substance accumulate in a buffer no recipe consumes. */
  for (const m of D_mach.MACHINES) {
    for (const r of m.recipes || []) {
            /* A recipe with `from:` draws from a non-item source, so its inputs are
               that source's named units rather than substance x form selectors. No
               row in the game does this today, and the check is kept anyway. */
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

    /* A trinket or boon key is dotted: `rate.furnace` is the tunable `rate` scoped
       to `furnace`, and splitting on the first dot is the rule `mods.js` applies.
       `tools/content.mjs` does the deep version, scope resolution included. */
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

    /* Every boon a `conflictsWith` entry names must itself be a real boon.
       `tools/content.mjs` makes the same check; kept here too so a typo fails at
       this quicker layer first. */
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


console.log('\n1b. content lint');
{
  const r = checkContent({ quiet: true });
  if (r.violations.length) {
    for (const v of r.violations) fail(v);
  } else {
    ok(`${r.checks} checks, 0 violations`);
  }
}


/* Boot once, for everything below. */
canvas.attach(stageEl);
canvas.resize(1600, 900);
boot.boot(1337);
if (!boot.booted()) fail('boot() did not place the player in a band');
else ok(`booted: player in band "${player.player.band.id}"`);


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
  else ok('render() consumes no randomness');
}


console.log('\n3. behaviour');

/* Hardness is seconds-to-break, at any framerate. */
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

/* The fall-damage table: drop in tiles -> hearts spent. */
{
  const TABLE = [[4, 0], [5, 0], [8, 1], [11, 2], [14, 3], [17, 4], [20, 5]];
  /* `TUNE` maps id -> row, not id -> number. Every value is read through `eff`,
     the only legal reader and the reason a trinket can change it. */
  const GRAV = mods.eff('grav');
  let bad = 0;
  for (const [tilesDown, want] of TABLE) {
    const b = player.player.band;
    const v = Math.sqrt(2 * GRAV * tilesDown * b.tile);
    const got = player.fallHearts(v);
    if (got !== want) { fail(`${tilesDown}-tile fall -> ${got} hearts, spec ${want}`); bad++; }
  }
  if (!bad) ok('fall-damage table matches the spec at all 7 rows');
}

/* The player moves, and stays out of solid rock. */
{
  boot.newRun(1337);
  const p = player.player;
  const x0 = p.x;
  runReal(240, 1 / 120, { right: true, hasMouse: false });
  if (!(p.x > x0 + 8)) fail(`walking right moved the player ${(p.x - x0).toFixed(1)} px`);
  else ok(`walks: ${(p.x - x0).toFixed(0)} px in 2 simulated seconds`);

  /* The fuzz collects, and is held against the cap while it does: with nothing
     entering `run.inv`, `burdenOf` is identically 0 for all 7,200 frames and the
     refusal branch the comparison below is about never runs. */
  const CAP = mods.eff('burden');
  const ORE_T = items.massOfPair(D_sub.S.copper, D_form.F.ore);
  const TOP_UP_EVERY = 30;                       // substeps; a quarter second
  /* Fill to the largest whole number of ore that still fits under the cap, so
     one more ore cannot: burden lands in (CAP - ORE_T, CAP]. */
  const topUp = () => {
    if (!run.hasPick()) run.write.collect(D_sub.S.pick, D_form.F.relic, 1);
    const n = Math.floor((CAP - run.burdenOf()) / ORE_T);
    if (n > 0) run.write.collect(D_sub.S.copper, D_form.F.ore, n);
  };

  let stuck = 0, nonFinite = 0, burdenOver = 0, heavyRefusals = 0;
  let jSeen = journal.journal.length;
  const seed = rng.mulberry(0xC0FFEE);
  for (let f = 0; f < 60 * 120; f++) {
    if (f % TOP_UP_EVERY === 0) {
      topUp();
      if (p.band)
        items.write.spawn(p.band, p.x + player.PW / 2, p.y + player.PH / 2,
                          D_sub.S.copper, D_form.F.ore, 0, 0);
    }
    const c = {
      left: seed() < 0.3, right: seed() < 0.3,
      up: seed() < 0.2, down: seed() < 0.25,
      hop: seed() < 0.06, dig: seed() < 0.5,
      place: seed() < 0.02, collect: seed() < 0.5, hasMouse: false
    };
    stepReal(1 / 120, c);
    /* `stepReal` never drains the journal, so the rows pile up and can be read
       with an index rather than a copy per frame. `newRun` clears them, hence the
       pointer reset on death. */
    for (let k = jSeen; k < journal.journal.length; k++) {
      const row = journal.journal[k];
      if (row.kind === 'refused' && row.data && row.data.why === 'TOO HEAVY TO CARRY') heavyRefusals++;
    }
    jSeen = journal.journal.length;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vy)) nonFinite++;
    if (run.burdenOf() > mods.eff('burden') + 1e-6) burdenOver++;
    if (p.band && tiles.solidAt(p.band, world.tileX(p.band, p.x + player.PW / 2),
                                        world.tileY(p.band, p.y + player.PH / 2))) stuck++;
    if (run.run.dead) { boot.newRun(1337); topUp(); jSeen = journal.journal.length; }
  }
  if (nonFinite) fail(`${nonFinite} frames with non-finite player state`);
  if (stuck) fail(`player centre inside solid rock on ${stuck} frames`);
  if (!nonFinite && !stuck) ok('7,200-frame fuzz: no non-finite state, never inside rock');
  if (burdenOver) fail(`burden exceeded the hard cap on ${burdenOver} frames of the fuzz -- a pickup let mass through it should have refused`);
  else if (!heavyRefusals)
    fail(`BURDEN: the fuzz never triggered a single TOO HEAVY refusal, so it never pressed against ` +
         `eff('burden') = ${CAP} T and the assertion proved nothing -- the probe has gone hollow ` +
         `Check that the fuzz still holds \`collect\`, still credits a ` +
         `pickaxe, and still tops the pockets up to within one ore of the cap.`);
  else ok(`BURDEN: 7,200-frame fuzz with collect held never carried more than eff('burden') = ${CAP} T, ` +
          `and refused ${heavyRefusals} over-cap pickup(s) at the boundary`);
}

/* A trinket is a relic, so picking one up wears it: a relic never enters the
   pockets, it goes straight into an equipment slot, and the modifier follows
   the slot. Dropping it out of the slot restores the base. */
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
    const sub = D_sub.S[t.id];

    sched.trinkets.grant(t.id);
    /* The draft spawns a falling item; let it land in the pickup radius. Pickup
       is opt-in rather than automatic, so `collect` is held for the wait. */
    for (let i = 0; i < 180 && !run.run.equipped.includes(sub); i++)
      stepReal(1 / 120, { hasMouse: false, collect: true });

    if (!run.run.equipped.includes(sub))
      fail(`trinket ${t.id}: picking the relic up did not put it in an equipment slot`);
    else if (run.run.inv.some(sl => sl && sl.sub === sub))
      fail(`trinket ${t.id}: the relic reached the pockets -- a relic is worn, never pocketed`);
    else {
      const withT = mods.eff(key, scope);
      if (withT === base) fail(`trinket ${t.id} did not change eff("${key}") once worn`);
      else ok(`trinket ${t.id}: ${key} ${base} -> ${withT} once picked up and worn`);
    }

    /* Its mass counts against the cap wherever it is kept. */
    const worn = run.burdenOf();
    if (!(worn >= items.massOfPair(sub, D_form.F.relic) - 1e-9))
      fail(`trinket ${t.id}: a worn relic weighs ${items.massOfPair(sub, D_form.F.relic)} T but ` +
           `burdenOf() reports ${worn} T -- moving it off the pocket grid must not widen the cap`);
    else ok(`a worn relic still weighs: burdenOf() is ${worn.toFixed(2)} T with one in a slot`);

    run.write.spend(sub, D_form.F.relic, 1);
    sched.trinkets.step();
    if (mods.eff(key, scope) !== base) fail('emptying the slot did not restore the base');
    else if (run.run.equipped.includes(sub))
      fail('spending the relic left it in run.equipped -- the slot must clear itself');
    else ok('emptying the slot restores the base value');
  }
}

/* Every equipment slot full refuses the next relic rather than dropping one,
   and rather than stacking it somewhere it could never be worn. */
{
  boot.newRun(1337);
  const slots = run.run.equipped.length;
  const relics = D_sub.SUBSTANCES
    .map((row, i) => [row, i])
    .filter(([row]) => row.tags?.includes('relic'))
    .map(([, i]) => i);

  if (relics.length <= slots)
    console.log(`  --   ${relics.length} relic(s) against ${slots} slot(s): the refusal is unreachable, skipped`);
  else {
    const took = relics.filter(sub => run.write.collect(sub, D_form.F.relic, 1)).length;
    const refused = run.write.collect(relics[slots], D_form.F.relic, 1);
    const dupe = run.write.collect(relics[0], D_form.F.relic, 1);
    if (took !== slots)
      fail(`EQUIP SLOTS: ${relics.length} relics filled ${took} of ${slots} slots`);
    else if (refused !== false)
      fail(`EQUIP SLOTS: a ${slots + 1}th relic was accepted into ${slots} slots`);
    else if (dupe !== false)
      fail('EQUIP SLOTS: a second copy of a worn relic was accepted; a duplicate has no slot to go in');
    else
      ok(`EQUIP SLOTS: ${slots} slots take ${took} relics, and both the ${slots + 1}th and a ` +
         `duplicate are refused so the pickup leaves them on the ground`);
  }
}

/* A machine the tuning table singles out is faster purely by tuning, with no
   variant code. Found through `scoped` rather than by id, so retiring the row
   skips the probe instead of asserting against a machine that no longer
   exists. */
{
  const scoped = Object.keys(D_tune?.TUNE?.rate?.scoped || {});
  const id = scoped.find(k => D_mach.M[k] !== undefined);
  if (!id) console.log('  --   no machine carries a scoped `rate` override, skipped');
  else {
    const r = mods.eff('rate', id);
    if (!(r > 1)) fail(`${id}: eff('rate') is ${r}, expected > 1 from data/tuning.js`);
    else ok(`${id} runs at ${r}x by tuning alone, no variant code`);
  }
}

/* One seed renders identically twice. */
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

/* Render every band without throwing. */
{
  boot.newRun(1337);
  for (const band of world.bands) {
    main.cam.x = band.origin.x;
    main.cam.y = band.origin.y;
    try { main.draw(); ok(`renders band "${band.id}"`); }
    catch (e) { fail(`render in band "${band.id}": ${e.message}`); }
  }
}

console.log('\n4. determinism, reset and purity probes');

/* Determinism: the same seed and the same scripted intents give an identical
   state hash after 10,000 substeps -- twice in this process, once in a
   genuinely fresh one. Far broader than the one-seed probe above. */
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

  /* And the script actually drove a drivetrain: two identical fingerprints over a
     script that never turned a crank would be green about nothing. 200 px of
     travel is past float noise and short of the 316 px it really produces. */
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

/* The fingerprint can see a segment at all -- an instrument blind to the field
   it is asked about reports success for ever. Three writes, each the smallest
   that exists: the carrier's parameter, a hub's drive, a gear's phase. */
{
  boot.newRun(7777);
  const band = player.player.band;
  for (let ty = 4; ty <= 14; ty++) for (let tx = 4; tx <= 8; tx++) tiles.write.clear(band, tx, ty);
  const lo = footUnder(machs.write.place(band, D_mach.M.hub, 5, 12));
  const hi = footUnder(machs.write.place(band, D_mach.M.hub, 5, 6));
  const seg = segs.write.link(lo, hi);

  const probes = [
    ['a carrier that has moved', () => setCar(seg, 0.5)],
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

/* `newRun` resets everything: fingerprint every exported model object, play
   enough to dirty every one of them, `newRun` on the same seed and fingerprint
   again. Deterministic worldgen means the two match if nothing survived. */
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
  /* The tribute ledger, all six fields, one write each -- the real record
     `rules/cycles.js` writes, `{ id, have, left }`, so a reset that forgot the
     ledger fails here on its own contents rather than on a stand-in. */
  run.write.tribute({ id: D_cycles.CYCLES[0].id, have: { 'copper/ore': 4 }, left: 123.5 });
  run.write.favour('hephaestus', 2);
  run.write.chart('astral');
  run.write.miss();
  run.write.cycle(3);
  run.write.offer('grant');
  /* Two `run` fields, dirtied the same way: `won` is the win state, `awarded` the
     reward-grant bridge `rules/grants.js#step` drains, so a surviving queue would
     grant the next run a machine it never earned. Neither is a container. */
  run.write.win();
  run.write.award(['winch']);
  mods.write.add('phase6-test', [{ key: 'walk', mul: 1.1 }]);
  machs.write.place(player.player.band, 0, 5, 5);
  if (D_grant.GRANTS.length) sched.grants.grant(D_grant.GRANTS[0].id);
  sched.boons.grant(D_boon.BOONS[0].id);
  aimModel.write.set(player.player.band, 3, 3, true);
  journal.push('phase6-test');

  /* And the drivetrain, through the real write API, one call per field that could
     survive: a linked segment with a carrier halfway up it, a hub holding
     delivered drive, and a gear phase mid-rotation. */
  {
    const band = player.player.band;
    const lo = footUnder(machs.write.place(band, D_mach.M.hub, 6, 12));
    const hi = footUnder(machs.write.place(band, D_mach.M.hub, 6, 6));
    const seg = segs.write.link(lo, hi);
    setCar(seg, 0.5);
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

  /* The same fact in its own words, since the byte comparison above says only
     "segments differs". The halves fail differently: `segments` when
     `shell/boot.js` forgets `segw.clear`, `torque` when a machine record does. */
  if (segs.segments.length !== 0) {
    fail(`newRun() RESET: ${segs.segments.length} segment(s) survived newRun() -- a cable outliving its ` +
         `run is a determinism bug, and shell/boot.js must call segments' write.clear()`);
  } else {
    const stale = machs.machines.filter(m => m.torque !== 0 || m.turn !== 0);
    if (stale.length)
      fail(`newRun() RESET: ${stale.length} machine(s) still hold torque/turn after newRun() -- a gear ` +
           `that remembers how far the last run cranked it`);
    else ok('newRun() RESET: `segments` is empty and every m.torque/m.turn is 0 after a run that ' +
            'linked a cable, moved its carrier and turned a gear');
  }
}

/* Auto collect resets too, and `snapshotModel` cannot see it: it covers
   exported model objects, and `ui.autoCollect` lives in `shell/ui.js`. It is
   simulation-affecting input -- `step` folds it into `cmd.collect`. */
{
  shellUi.setAutoCollect(true);
  if (shellUi.ui.autoCollect !== true)
    fail('setAutoCollect(true) did not set ui.autoCollect -- the setter itself is broken');
  boot.newRun(4242);
  if (shellUi.ui.autoCollect !== false)
    fail('newRun() RESET: ui.autoCollect survived a restart. AUTO COLLECT gates what enters run.inv, ' +
         'so a sticky toggle makes two runs from the same seed diverge. ' +
         'shell/boot.js#newRun must call setAutoCollect(false) in its teardown block.');
  else ok('newRun() RESET: ui.autoCollect is false after a restart that began with it ON');
}

/* And so does auto feed, one layer over: `ui.autoFeed` is equally invisible to
   `snapshotModel`, and `step` folds it into `cmd.autoFeed`, which gates
   `handFeed`, which spends `run.inv` and decides whether a trial gets paid. */
{
  shellUi.setAutoFeed(true);
  if (shellUi.ui.autoFeed !== true)
    fail('setAutoFeed(true) did not set ui.autoFeed -- the setter itself is broken');
  boot.newRun(4243);
  if (shellUi.ui.autoFeed !== false)
    fail('newRun() RESET: ui.autoFeed survived a restart. AUTO FEED gates whether standing beside a ' +
         'machine spends run.inv into it, so a sticky toggle makes two runs from the same seed diverge ' +
         '-- a determinism bug. shell/boot.js#newRun must call setAutoFeed(false) in its teardown block.');
  else ok('newRun() RESET: ui.autoFeed is false after a restart that began with it ON');
}

/* Conservation: over a 10,000-substep random-intent fuzz, mass added to any of
   the three held buckets -- inventory, ground items, machine buffers -- through
   their accountable writers must equal mass removed, at every substep. */
{
  const seed = 5150;
  boot.newRun(seed);
  const band = player.player.band;

  /* One placed furnace, fed for free (bypassing cost) so `catchFalling` and
     `handFeed` are both exercised by whatever the fuzz digs near it: both are
     accountable writers (`take`) this probe must prove balance. */
  shellUi.setAutoFeed(true);
  machs.write.place(band, D_mach.M.kiln,
    world.tileX(band, player.player.x) - 1, world.tileY(band, player.player.y) + 2);

  /* A pickaxe, credited before the baseline is taken: `rules/mining.js` gates on
     `hasPick` and the stock pickaxe is planted on the ground rather than handed
     over, so a fuzz that never collects also never mines. */
  run.write.collect(D_sub.S.pick, D_form.F.relic, 1);

  const actualHeldMass = () => {
    let m = 0;
    for (const slot of run.run.inv) if (slot) m += items.massOfPair(slot.sub, slot.form) * slot.n;
    /* A relic is worn rather than pocketed, and it weighs the same either way. */
    for (const sub of run.run.equipped) if (sub !== null) m += items.massOfPair(sub, D_form.F.relic);
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
  /* `collectCalls` is the anti-hollow guard, asserted at the end: a fuzz that
     never invokes this wrapper is not watching the ground-to-pockets transfer at
     all, which is the coverage a probe loses silently when pickup is opt-in. */
  let collectCalls = 0;
  run.write.collect = (sub, form, n) => {
    collectCalls++;
    const took = origCollect(sub, form, n);
    /* Only on success: a refused pickup leaves the item on the ground, where
       it is already counted. A full equipment slot refuses a relic. */
    if (took) reconstructed += items.massOfPair(sub, form) * n;
    return took;
  };
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
    /* `collect` is held on half the substeps, and there is something to collect.
       Without it `run.write.collect` is never invoked through the real path and
       this fuzz shrinks to `items.spawn`/`remove` plus `take`/`consume`. */
    if (i % 60 === 0 && player.player.band)
      items.write.spawn(player.player.band,
                        player.player.x + player.PW / 2, player.player.y + player.PH / 2,
                        D_sub.S.copper, D_form.F.ore, 0, 0);
    if (i % 600 === 0) {
      const held = run.invCount(D_sub.S.copper, D_form.F.ore);
      if (held > 0) run.write.spend(D_sub.S.copper, D_form.F.ore, held);
    }
    stepReal(1 / 120, {
      left: ctl() < 0.2, right: ctl() < 0.3, up: ctl() < 0.15, down: ctl() < 0.25,
      hop: ctl() < 0.05, dig: ctl() < 0.6, craft: ctl() < 0.3,
      collect: ctl() < 0.5, hasMouse: false
    });
    if (Math.abs(actualHeldMass() - reconstructed) > EPS) driftAt = i;
  }

  items.write.spawn = origSpawn; items.write.remove = origRemove;
  run.write.collect = origCollect; run.write.spend = origSpend;
  machs.write.take = origTake; machs.write.consume = origConsume;
  shellUi.setAutoFeed(false);        // borrowed for this probe only

  if (driftAt >= 0)
    fail(`CONSERVATION: reconstructed held mass drifted from the actual (inv+ground+buffers) total at substep ${driftAt} ` +
         `(actual ${actualHeldMass().toFixed(4)} T, reconstructed ${reconstructed.toFixed(4)} T)`);
  else if (!collectCalls)
    fail('CONSERVATION: the fuzz never invoked run.write.collect through the real pickup path, so the ' +
         'ground-to-pockets transfer went unwatched and the probe proved less than it claims ' +
         'Check that the fuzz still holds `collect` and still credits a pickaxe.');
  else ok(`CONSERVATION: 10,000-substep fuzz -- reconstructed mass matches actual held mass throughout ` +
          `(${actualHeldMass().toFixed(2)} T, ${collectCalls} real pickups)`);
}

/* Hand equals machine: every `hand:true` recipe is the same object a machine
   names. `tools/content.mjs` proves it statically over the tables; re-asserted
   here live over `MACH`/`recipesOf`, from another angle. */
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


/* Rope transport burns no material at all: the cost of ascent is a winch the
   player has to stand at and hold. */

/* The two data sides of the equation, hoisted so the measured counterpart below
   divides the same worth by the same compression ratios: seconds to mine one
   copper ore by hand, from the three numbers `rules/mining.js` multiplies. */
const oreSecs = D_sub.SUB[D_sub.S.copper].tile.hard * mods.eff('hard', 'copper')
              / (mods.eff('pickPower') * D_sub.SUB[D_sub.S.pick].item.tool.power);
const RATIOS = { ore: 1, ingot: 1 };                       // units of ore per unit
const FORMS  = { ore: D_form.F.ore, ingot: D_form.F.ingot };

{
  const topsoil = world.bandOf('topsoil');
  const winch = D_mach.MACH[D_mach.M.winch].drive;
  const base = mods.eff('segBase'), load = mods.eff('segLoad'), up = mods.eff('segUp');
  const supply = winch.torque * mods.eff('driveTorque', 'winch');

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
  const beOre = breakEven('ore'), beIngot = breakEven('ingot');

  console.log(`  ..  break-even depth: ore ${beOre.toFixed(2)}, ingot ${beIngot.toFixed(2)} tiles ` +
              `(k = ${kTier('ore').toFixed(3)}/${kTier('ingot').toFixed(3)} s of winching per ` +
              `item-slot per tile, one winch, one vertical rope; an ore costs ` +
              `${oreSecs.toFixed(2)} s to mine)`);

  if (!(Number.isFinite(beOre) && beOre > 0))
    fail(`BREAK-EVEN DEPTH: raw ore break-even (${beOre}) is not a finite positive depth -- ` +
         `a single winch cannot raise a single ore at all, which means drive.torque no longer ` +
         `exceeds segBase by enough to move anything`);
  else if (!(beIngot > beOre))
    fail(`BREAK-EVEN DEPTH: smelting should push the break-even DEEPER, because an ingot weighs ` +
         `less than the ore it came from -- got ore ${beOre.toFixed(2)}, ingot ${beIngot.toFixed(2)}`);
  else if (!(beOre > 0.05 && beOre < 400))
    fail(`BREAK-EVEN DEPTH: raw ore break-even ${beOre.toFixed(2)} tiles is outside a plausible band -- ` +
         `check segUp/segBase/segLoad or drive.torque`);
  else ok(`BREAK-EVEN DEPTH: ore ${beOre.toFixed(2)} < ingot ${beIngot.toFixed(2)} tiles ` +
          `of winching -- a deeper haul is only worth it once smelted`);
}

/* Burden: walking and falling are identical at 0% and 150% of the hard cap --
   only ascent is taxed. Set by a direct model write, since only the pickup path
   in `rules/items.js` refuses; the subject here is the movement rule. */
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
    /* Standing on the surface's own ground is `onGround` from frame one, with
       nothing to fall from. Relocated into an open shaft with plenty of clear air
       below, so this measures real free-fall distance at both fractions. */
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

  /* A climb intent at or over the hard cap produces no upward movement. */
  {
    boot.newRun(1234);
    const band = player.player.band;
    /* The `+15` offset: `rules/cycles.js` stands the surface altar a few tiles left
       of `spawnTx` once its gate opens, and that altar's `handFeed` (reach 10 px)
       drains ore whenever `cmd.autoFeed` is set. The distance removes it. */
    const tx = world.tileX(band, player.player.x) + 15, ty = world.tileY(band, player.player.y);
    for (let dy = -1; dy <= 4; dy++) tiles.write.clear(band, tx, ty + dy);
    /* `F.rung`, not `F.log`: `log` carries no `tile` block, so a placed log is not
       a climbable tile at all. `timber/rung` is what `peg_rungs` makes and what a
       ladder is built from. */
    tiles.write.set(band, tx, ty + 4, D_sub.S.timber, D_form.F.rung);   // a ladder tile to climb
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

{
  /* Deterministic across two runs of one seed -- the same claim the whole-state
     hash below makes, restated narrowly here so a light regression reads as a
     light failure rather than as a generic state-hash diff. */
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
  /* A fully enclosed, unlit chamber reads light 0 at every interior tile. The
     player stays where `newRun` put them, in the spawn band -- a different band's
     `light` array, so their carried brand cannot leak into a topsoil room. */
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
  /* A lit tile behind enough rock is dark, with "enough" computed from the live
     tunables (level 12 over 3-per-tile needs four tiles). Bounded both ways:
     still lit one tile short, so "all underground reads 0" would not pass. */
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
  /* Light recomputation is not per frame. The player stands still, nothing digs
     and nothing is placed, so `isDirty` should find nothing changed after the
     first settle and stop recomputing entirely. */
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

/* Render purity over the `view/ui/` tree: opening the main panel, giving it
   real content to draw and hovering a slot must not move the epoch counter or
   consume randomness, any more than the plain HUD already proven pure does. */
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
  else ok('render() with the main panel open consumes no randomness');

  shellUi.close('main');
}

/* Segment transport: `rules/drive.js`, `model/segments.js` and the ride branch
   in `rules/player.js`, as properties rather than one worked example. Every
   probe drives the real `main.step`; only `predictV` below re-implements. */
console.log('\n5. segment transport');

/* `topsoil` and not `surface`: 320 rows of solid rock with nothing in it but
   what this rig puts there, so no relief, no tree and no vein can wander into a
   span and refuse a link. The floor row is laid last, to stand on. */
const RIG = { band: 'topsoil', tx0: 18, w: 12 };

/* Every hub in this section stands on a real footing tile. `machs.write.place`
   asks nothing about footing, and a hub floating over air is a machine
   `rules/placement.js` could never have built. */
function footUnder(m) {
  const def = D_mach.MACH[m.def];
  for (let i = 0; i < def.footing; i++)
    tiles.write.set(m.band, m.tx + i, m.ty + def.th, D_sub.S.stone);
  return m;
}

/* The tile range the headframe exemption covers, derived here rather than
   imported so this and `model/segments.js#headframe` can disagree: footprint
   columns, from the anchor's row to the footprint's bottom plus one. */
function headframeOf(m) {
  const def = D_mach.MACH[m.def];
  return { band: m.band, tx0: m.tx, tx1: m.tx + def.tw - 1,
           ty0: m.ty + Math.floor(def.th / 2), ty1: m.ty + def.th };
}

/* A rider may start at the very top of a span (`t = 1`): the exemption covers
   `rules/drive.js#ride` as well as the cable, since a 6 px box centred on the
   anchor straddles the column boundary whichever column holds the tile. */

function driveRig(spec) {
  boot.newRun(spec.seed ?? 8080);
  const band = world.bandOf(spec.band ?? RIG.band);
  const { tx0, ty0, w, h } = { tx0: RIG.tx0, w: RIG.w, ...spec.room };
  for (let ty = ty0; ty < ty0 + h; ty++)
    for (let tx = tx0; tx < tx0 + w; tx++) tiles.write.clear(band, tx, ty);
  for (let tx = tx0; tx < tx0 + w; tx++) tiles.write.set(band, tx, ty0 + h - 1, D_sub.S.stone);
  for (const [tx, ty, n] of spec.rock ?? [])
    for (let i = 0; i < (n ?? 1); i++) tiles.write.set(band, tx + i, ty, D_sub.S.stone);

  /* Real modifier rows through the real `eff` pipeline, the same shape a boon's
     row has, and not a poke at a frozen table: a 40-tile span is a legal build
     for a hub whose reach a god has widened, and not at the base 96 px. */
  /* These rigs measure the motion law, so the bucket's own capacity is lifted
     out of the way unless a probe is asking about it: `eff('bucketCap')` is
     20 T and several rows below load far more than that on purpose. */
  if (spec.capMul !== 1) mods.write.add('rig-cap', [{ key: 'bucketCap', mul: spec.capMul ?? 1e4 }]);
  if (spec.reachMul) mods.write.add('rig-reach', [{ key: 'segReach', mul: spec.reachMul }]);
  if (spec.torqueMul) mods.write.add('rig-torque', [{ key: 'driveTorque', mul: spec.torqueMul }]);

  const placed = (spec.machines ?? []).map(([id, tx, ty]) =>
    footUnder(machs.write.place(band, D_mach.M[id], tx, ty)));
  const built = [];
  for (const [i, j] of spec.links ?? []) {
    const c = segs.linkCheck(placed[i], placed[j]);
    if (!c.ok) { fail(`RIG: link ${i}-${j} refused (${c.why}) -- the rig itself is not buildable`); continue; }
    built.push(segs.write.link(placed[i], placed[j]));
  }
  /* Every rope gets one bucket at the foot unless the row names its own: a
     rope with none carries nothing and every probe below would read zero. */
  for (const seg of built) segs.write.attach(seg, 0);
  for (const [i, t] of spec.carriers ?? []) setCar(built[i], t);

  player.write.band(band);
  if (spec.ride !== undefined) {
    const seg = built[spec.ride];
    player.write.move(carPos(seg).x - player.PW / 2, carTop(seg) - player.PH);
  } else {
    player.write.move(world.worldX(band, spec.player[0]), world.worldY(band, spec.player[1]));
  }
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  player.write.set('fallFrom', player.player.y);

  /* Cargo is spawned already at rest: a freshly spawned item is awake, so one
     substep of gravity before `rules/drive.js#haul` first pins it is three pixels
     at 1/30 s. `rest = 1` is the same field `haul` itself writes. */
  for (const [i, sub, form, n] of spec.cargo ?? []) {
    const p = carPos(built[i]);
    for (let k = 0; k < n; k++) {
      const it = items.write.spawn(band, p.x, p.y, D_sub.S[sub], D_form.F[form], 0, 0);
      if (it) it.rest = 1;
    }
  }
  if (spec.burden) run.write.collect(D_sub.S.copper, D_form.F.ore, spec.burden);

  return { band, placed, segs: built, seg: built[0] };
}

/* A vertical 10-tile segment with one crank at its foot, the player standing on
   the floor beside the crank -- 21 px from the carrier, more than
   `eff('pickupR')` (10 px), so deck cargo is never quietly pocketed. */
const ONE_CRANK = {
  room: { ty0: 100, h: 18 },
  machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115]],
  links: [[0, 1]],
  player: [18, 115]
};

/* Rope travelled in px over `secs`, signed, accumulated per substep so a loop
   that laps still totals correctly. */
function travel(seg, secs, dt, want = { action: true }) {
  const n = Math.round(secs / dt);
  const loop = 2 * seg.len;
  let total = 0, prev = seg.u;
  for (let i = 0; i < n; i++) {
    runReal(1, dt, { hasMouse: false, ...want });
    let d = seg.u - prev;
    if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
    total += d * loop;
    prev = seg.u;
  }
  return total;
}

/* Along-the-cable velocity in px/s, + is up, measured from the carrier
   parameter the simulation actually wrote. */
function measureV(seg, secs, dt, want = { action: true }) {
  const t0 = carT(seg);
  const n = Math.round(secs / dt);
  runReal(n, dt, { hasMouse: false, ...want });
  return ((carT(seg) - t0) * seg.len) / (n * dt);
}

/* The torque one crank supplies, read at call time and never cached:
   `eff('driveTorque', 'winch')` follows whatever rows a block has left in
   `model/mods.js`, and the ascent sweep below bends exactly that. */
const winchTorque = () =>
  D_mach.MACH[D_mach.M.winch].drive.torque * mods.eff('driveTorque', 'winch');

/* Talents aboard at which one crank's supply exactly meets `need` on a vertical
   segment: the `surplus == 0` boundary, inverted out of
   `supply = segBase + segLoad * mass`. Called after a rig is built. */
const stallMass = () => (winchTorque() - mods.eff('segBase')) / mods.eff('segLoad');


/* The motion expression, transcribed as a second implementation on purpose, so
   a change to `rules/drive.js` has to disagree with something to pass
   unnoticed. `tau` decides direction and `supply` the throttle; they differ
   only past a transformer. Descent is never scaled by `omega`. */
function predictV(tau, mass, slope, demand = null, omega = 1, supply = tau) {
  const base = mods.eff('segBase'), fric = mods.eff('segFric');
  /* One bucket with nothing opposite it, which is what every rig here builds. */
  const net = base + mods.eff('segLoad') * mass * slope;
  const asks = Math.max(0, net) + fric;
  const drive = (demand ?? asks) > 0 ? Math.min(1, supply / (demand ?? asks)) : 0;
  const push = tau - net;
  if (push > fric)
    return mods.eff('segUp') * Math.min(1, (push - fric) / base) * (tau > 0 ? drive * omega : 1);
  if (push < -fric)
    return -mods.eff('segDown') * Math.min(1, (-push - fric) / base) * slope;
  return 0;
}

/* Framerate independence for this mechanic: ten simulated seconds of carrier
   travel, and ten of a riding player's own displacement, must come out the
   same at 30, 60, 90 and 144 fps. */
{
  const RATES = [30, 60, 90, 144];
  const rows = [];
  for (const fps of RATES) {
    const dt = 1 / fps;

    const a = driveRig({ ...ONE_CRANK, seed: 8080, cargo: [[0, 'copper', 'ore', 4]] });
    /* Accumulated rather than differenced: ten seconds is more than one lap of
       an 88 px loop, and a lapped phase differences to nonsense. */
    const carrier = travel(a.seg, 10, dt, { action: true });

    const b = driveRig({
      seed: 8081, reachMul: 5,
      room: { ty0: 60, h: 58 },
      machines: [['hub', 20, 115], ['hub', 20, 75]],
      links: [[0, 1]], carriers: [[0, 1]], ride: 0
    });
    const y0 = player.player.y;
    runReal(Math.round(10 * fps), dt, { hasMouse: false });
    rows.push({ fps, carrier, rider: player.player.y - y0, t: carT(b.seg) });
  }

  console.log('  ..  ride framerate table, 10 simulated seconds:');
  console.log('        fps   carrier px (up, 4 T aboard, 1 crank)   rider px (down, unpowered)');
  for (const r of rows)
    console.log(`        ${String(r.fps).padStart(3)}   ${r.carrier.toFixed(4).padStart(37)}   ` +
                `${r.rider.toFixed(4).padStart(25)}`);

  /* Two parts in a thousand of the distance travelled, not an absolute pixel
     count: a 1/30 s step and a 1/120 s step accumulate a different number of
     float additions to reach the same total, and that error grows with the
     total rather than staying fixed. */
  const TOL = Math.max(0.1, Math.abs(rows[0].carrier) * 0.002);
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

  /* The ride is not merely consistent, it is the carrier's own travel: an
     unpowered vertical segment descends at the full `segDown`, so ten seconds is
     260 px, and a rider who had detached would read 0 or a free-fall figure. */
  const wantRider = mods.eff('segDown') * 10;
  if (Math.abs(rows[0].rider - wantRider) > 1)
    fail(`FRAMERATE: a riding player fell ${rows[0].rider.toFixed(2)} px in 10 s, but an unpowered ` +
         `vertical carrier descends at the full segDown (${mods.eff('segDown')} px/s) = ${wantRider} px ` +
         `-- the rider is not tracking the carrier`);
  else ok(`RIDE TRACKS THE CARRIER: 10 s of unpowered descent moves the rider ${rows[0].rider.toFixed(2)} px, ` +
          `the full segDown x 10 s (${wantRider} px)`);
}

/* The exact boundary is a row of its own: where `need` and one crank's supply
   are equal the carrier must hold still, not creep and not jitter. The only row
   whose expected value is an exact 0, and the first a sign error would move. */
{
  /* Three geometries. The 45-degree span is 113 px long against a base
     `hub.reach` of 96, so it needs a real `segReach` row, the same as the
     40-tile cable above. */
  const GEOM = {
    vertical: { slope: 1, spec: {
      room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115], ['winch', 19, 113]],
      links: [[0, 1]], player: [18, 115] } },
    diagonal: { slope: Math.abs(-80) / Math.hypot(80, 80), spec: {
      reachMul: 2,
      room: { ty0: 100, h: 18, w: 16 },
      machines: [['hub', 20, 115], ['hub', 30, 105], ['winch', 19, 115], ['winch', 19, 113]],
      links: [[0, 1]], player: [18, 115] } },
    horizontal: { slope: 0, spec: {
      room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 28, 115], ['winch', 19, 115], ['winch', 19, 113]],
      links: [[0, 1]], player: [18, 115] } }
  };

  /* `winches` is how many of the two placed winches are within reach and
     therefore contributing; both are, so this only ever selects how many the
     rig places. */
  /* The boundary rows are derived and the labels claim a shape rather than a
     figure: every row prints its own `want` and `got`, so a px/s in a string here
     would be a second copy of a tunable. `newRun` first, to clear `mods`. */
  boot.newRun(8099);
  const STALL = stallMass(), CAP = mods.eff('burden');
  const TABLE = [
    ['vertical',   0,         1, 'nothing aboard: the whole surplus'],
    ['vertical',   4,         1, 'a light load, 4 T of ore'],
    ['vertical',   STALL - 2, 1, 'two talents under the boundary: still climbing'],
    ['vertical',   STALL,     1, 'the exact surplus == 0 boundary -- HOLDS STILL'],
    ['vertical',   STALL + 8, 1, 'past the boundary: runs backwards'],
    ['vertical',   0,         0, 'unpowered: the full segDown'],
    ['vertical',   CAP,       0, 'unpowered and loaded: still the full segDown'],
    ['vertical',   0,         2, 'two winches: capped at segUp, never past it'],
    ['diagonal',   0,         1, '45 degrees, empty'],
    ['diagonal',   CAP,       1, '45 degrees at the burden cap: slope scales the load term, so the same mass costs less'],
    ['diagonal',   CAP,       0, '45 degrees, unpowered: segDown x slope'],
    ['horizontal', 0,         1, 'horizontal: no height, so no load term'],
    ['horizontal', CAP,       1, 'horizontal and loaded: the load term is slope-scaled to nothing'],
    ['horizontal', CAP,       0, 'horizontal, unpowered: segDown x 0 -- dead still']
  ];

  let bad = 0;
  /* Load is expressed as whole copper ores resting on the deck, so a derived
     mass that is not a whole number of them is a row the rig cannot build. */
  const ORE_T = items.massOfPair(D_sub.S.copper, D_form.F.ore);
  for (const [, mass, , why] of TABLE)
    if (!Number.isInteger(mass / ORE_T)) {
      fail(`MOTION: the "${why}" row needs ${mass.toFixed(3)} T aboard, which is not a whole number of ` +
           `${ORE_T} T copper ores -- the tunables it is derived from cannot be expressed as cargo`);
      bad++;
    }
  console.log('  ..  the motion expression, 1 s per row, measured px/s along the cable:');
  for (const [geomId, mass, winches, why] of TABLE) {
    const g = GEOM[geomId];
    const spec = { ...g.spec, seed: 8100 + bad, carriers: [[0, 0.5]] };
    /* Only the winches this row wants: the rig places both and the unused one is
       dropped rather than moved out of reach, so "in reach" stays a property of
       the geometry and not of a fudge factor. */
    spec.machines = spec.machines.filter((m, i) => i < 2 || i - 2 < winches);
    if (mass) spec.cargo = [[0, 'copper', 'ore', mass]];
    const r = driveRig(spec);
    const supply = winches * winchTorque();
    const want = predictV(supply, mass, g.slope);
    const got = measureV(r.seg, 1, 1 / 120, { action: winches > 0 });
    const flag = Math.abs(got - want) > 1e-6 ? ' <-- MISMATCH' : '';
    console.log(`        ${geomId.padEnd(10)} slope ${g.slope.toFixed(3)}  ${String(mass).padStart(2)} T  ` +
                `${winches} winch(es)  supply ${supply.toFixed(2)}  want ${want.toFixed(4).padStart(9)}  ` +
                `got ${got.toFixed(4).padStart(9)}${flag}   ${why}`);
    if (flag) {
      fail(`MOTION: ${geomId} rope, ${mass} T aboard, ${winches} winch(es) -- the motion expression gives ` +
           `${want.toFixed(4)} px/s along the cable, the simulation produced ${got.toFixed(4)} (${why})`);
      bad++;
    }
    /* The sign is asserted separately from the magnitude, because it is the
       half a reader of this table cares about: does weight reverse it. */
    if (Math.sign(got) !== Math.sign(want)) bad++;
  }
  if (!bad) ok(`MOTION: all ${TABLE.length} rows of the motion table match the expression ` +
               `exactly (three geometries x load x supply, including the surplus == 0 boundary)`);
}

/* Weight reverses it, and boarding is never refused at any weight: an over-cap
   rider is real mass in `rules/drive.js#step`'s own arithmetic, so the carrier
   slows, stalls and runs backwards. The three pocket loads are derived. */
{
  const at = (crankTy, carrierT) => ({
    room: { ty0: 100, h: 18 },
    machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, crankTy]],
    links: [[0, 1]], player: [18, 115], carriers: [[0, carrierT]], ride: 0
  });
  boot.newRun(8290);                    // clears the modifier rows eff() reads
  const RIDER = mods.eff('riderMass'), STALL = stallMass(), CAP = mods.eff('burden');
  const ORE_T = items.massOfPair(D_sub.S.copper, D_form.F.ore);
  const ROWS = [
    ['climbs',         at(115, 0), 0,             +1],
    ['holds still',    at(115, 0), STALL - RIDER,  0],
    /* 0.95 and not 1: the top of the loop is where a bucket rounds onto the
       descending strand, so a rider parked exactly there is on the way down
       whatever the winch does. */
    ['runs backwards', at(105, 0.95), CAP,        -1]
  ];

  let bad = 0;
  if (!(CAP + RIDER > STALL)) {
    fail(`WEIGHT: one crank stalls at ${STALL} T aboard, but a player at the ${CAP} T burden cap only ` +
         `weighs ${CAP + RIDER} T aboard -- the heaviest load the game lets anyone hold no longer ` +
         `reverses a single crank, so load has stopped mattering and D4's gate is gone`);
    bad++;
  }
  for (const [name, , pockets] of ROWS)
    if (!Number.isInteger(pockets / ORE_T)) {
      fail(`WEIGHT: the "${name}" row needs ${pockets.toFixed(3)} T in the pockets, which is not a whole ` +
           `number of ${ORE_T} T copper ores -- the boundary it is derived from cannot be expressed`);
      bad++;
    }
  for (const [name, spec, pockets, wantSign] of ROWS) {
    const burden = pockets / ORE_T;
    const r = driveRig({ ...spec, seed: 8200 + Math.round(pockets), burden });
    const mass = mods.eff('riderMass') + run.burdenOf();
    const crank = r.placed[2];

    const before = carT(r.seg), y0 = player.player.y;
    stepReal(1 / 120, { action: true, hasMouse: false });
    const v1 = (carT(r.seg) - before) * r.seg.len * 120;
    const drove = crank.torque > 0;

    let lit = 1;
    for (let i = 1; i < 600; i++) {
      stepReal(1 / 120, { action: true, hasMouse: false });
      if (crank.torque > 0) lit++;
    }
    const net = (carT(r.seg) - before) * r.seg.len;
    const riderNet = player.player.y - y0;
    const want = predictV(D_mach.MACH[D_mach.M.winch].drive.torque * mods.eff('driveTorque', 'winch'), mass, 1);

    if (!drove) {
      fail(`WEIGHT: the "${name}" row measured its first substep with NO torque delivered ` +
           `(m.torque 0) -- the crank was not in reach, so the row proves nothing about weight`);
      bad++;
    }
    if (Math.abs(v1 - want) > 1e-6) {
      fail(`WEIGHT: rider mass ${mass} T on one crank -- the motion expression gives ${want.toFixed(4)} px/s, ` +
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

  /* Said out loud only in the state that is otherwise baffling: a crank is being
     turned and the thing is going down anyway. The journal is read directly,
     since `stepReal` never drains it. */
  {
    driveRig({ ...at(105, 0.95), seed: 8299, burden: CAP / ORE_T });
    runReal(600, 1 / 120, { action: true, hasMouse: false });
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
      /* And it must be silent when the crank is not being turned: an unpowered
         carrier sinking is not news, it is the ordinary case. */
      driveRig({ ...at(105, 0.95), seed: 8298, burden: CAP / ORE_T });
      runReal(600, 1 / 120, { hasMouse: false });
      const quiet = journal.peek().filter(j => j.kind === 'refused' && j.data?.why === 'TOO HEAVY TO LIFT');
      if (quiet.length) {
        fail(`WEIGHT: 'TOO HEAVY TO LIFT' fired ${quiet.length} time(s) with NO crank turned -- ` +
             `an unpowered carrier sinking is the premise, not a refusal`);
        bad++;
      }
    }
  }

  if (!bad) ok(`WEIGHT REVERSES IT: ${RIDER} T climbs, ${STALL} T holds at the exact surplus == 0 ` +
               `boundary and ${CAP + RIDER} T -- the burden cap aboard -- runs backwards with the crank ` +
               `provably turning, and says 'TOO HEAVY TO LIFT' once a second, only then`);
}

/* Nothing makes ascent cheap: a seeded property test over 2,000 random
   (slope x mass x supply) triples off the real `main.step`. No triple ascends
   faster than `eff('segUp')` along the cable, or gains height faster in y. */
{
  const GEOMS = [
    ['vertical', 1, { room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115]] }],
    ['45deg', 0, { reachMul: 2, room: { ty0: 100, h: 18, w: 16 },
      machines: [['hub', 20, 115], ['hub', 30, 105], ['winch', 19, 115]] }],
    ['shallow', 0, { room: { ty0: 100, h: 18, w: 16 },
      machines: [['hub', 20, 115], ['hub', 30, 112], ['winch', 19, 115]] }],
    ['flat', 0, { room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 28, 115], ['winch', 19, 115]] }]
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
      /* Half the triples are unpowered, which is the second claim's whole
         population; a `mul` of 0 with the key held down is a third case -- a god who
         has taken all your torque away -- and must behave identically. */
      const powered = ctl() < 0.5;
      const mul = Math.round(ctl() * 60) / 10;                 // 0.0 .. 6.0
      const units = Math.round(ctl() * 60);                    // 0 .. 60 T of ore
      const half = ctl() < 0.5;

      mods.write.removeBySource('rig-torque');
      mods.write.add('rig-torque', [{ key: 'driveTorque', mul }]);

      for (const it of cargo) items.write.remove(it);
      cargo.length = 0;
      /* Parked before the cargo is spawned, or the first pass loads the bucket
         at wherever the previous one left it and the sim weighs nothing. */
      setCar(seg, 0.5);
      const p0 = carPos(seg);
      for (let k = 0; k < units; k++) {
        const it = items.write.spawn(r.band, p0.x, p0.y, D_sub.S.copper, D_form.F.ore, 0, 0);
        if (it) { it.rest = 1; cargo.push(it); }
      }
      if (half) {
        const it = items.write.spawn(r.band, p0.x, p0.y, D_sub.S.copper, D_form.F.gravel, 0, 0);
        if (it) { it.rest = 1; cargo.push(it); }
      }
      const mass = units + (half ? 0.5 : 0);

      const before = carPos(seg), t0 = carT(seg);
      stepReal(1 / 120, { action: powered, hasMouse: false });
      const after = carPos(seg);
      const v = (carT(seg) - t0) * seg.len * 120;                  // px/s along the cable
      const rise = (before.y - after.y) * 120;                 // px/s of world height gained
      tried++;

      if (v > worstV) { worstV = v; worstAt = `${name}, ${mass} T, supply ${(mul * 1.5).toFixed(2)}`; }
      if (rise > worstRise) worstRise = rise;
      if (v > mods.eff('segUp') + 1e-6) overCable++;
      if (rise > mods.eff('segUp') + 1e-6) overRise++;
      if (!powered && v > 1e-9) unpoweredUp++;
      if (mul === 0 && v > 1e-9) unpoweredUp++;

      const supply = powered
        ? D_mach.MACH[D_mach.M.winch].drive.torque * mods.eff('driveTorque', 'winch') : 0;
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

  if (mismatch) fail(`ASCENT: ${mismatch}/${tried} triples disagreed with the motion expression ` +
                     `-- the sweep found a combination the motion table above does not cover`);
  else ok(`ASCENT: all ${tried} triples also match the motion expression exactly, not merely the bound`);
}

/* N rows of hubs, one component: the bottom hubs are footprint-adjacent along
   the floor and flood into the crank's component, the top hubs form a second
   unpowered one, and `pick` takes the greater supply, never the sum. */
{
  let bad = 0;
  for (const N of [1, 2, 5]) {
    const machines = [];
    for (let i = 0; i < N; i++) machines.push(['hub', 20 + i * 2, 115]);
    for (let i = 0; i < N; i++) machines.push(['hub', 20 + i * 2, 105]);
    machines.push(['winch', 19, 115]);
    const links = [];
    for (let i = 0; i < N; i++) links.push([i, N + i]);

    const r = driveRig({
      seed: 8400 + N, room: { ty0: 100, h: 18, w: 14 },
      machines, links, player: [18, 115],
      carriers: links.map((_, i) => [i, 0.5])
    });
    const winch = r.placed[2 * N];
    const WINCH_T = winchTorque();

    const t0 = r.segs.map(s => s.t);
    stepReal(1 / 120, { action: true, hasMouse: false });
    const vs = r.segs.map((s, i) => (s.t - t0[i]) * s.len * 120);

    // nothing aboard: one empty bucket asks for segBase plus the rope's friction
    const demand = N * (mods.eff('segBase') + mods.eff('segFric'));
    const drive = winch.torque;
    const delivered = drive * demand;
    const wantDrive = Math.min(1, WINCH_T / demand);
    const wantV = predictV(WINCH_T, 0, 1, demand);

    if (delivered > WINCH_T + 1e-9) {
      fail(`TORQUE CONSERVATION: one winch (torque ${WINCH_T}) driving ${N} rope(s) delivered ` +
           `drive ${drive.toFixed(4)} x demand ${demand.toFixed(2)} = ${delivered.toFixed(4)} -- ` +
           `more than it has`);
      bad++;
    }
    if (Math.abs(drive - wantDrive) > 1e-9) {
      fail(`TORQUE CONSERVATION: ${N} rope(s) on one winch -- m.torque is ${drive.toFixed(6)}, ` +
           `the drive expression's min(1, supply/demand) is ${wantDrive.toFixed(6)}`);
      bad++;
    }
    if (vs.some(v => Math.abs(v - wantV) > 1e-6)) {
      fail(`TORQUE CONSERVATION: ${N} rope(s) sharing one winch climb at ` +
           `[${vs.map(v => v.toFixed(4)).join(', ')}] px/s; the shared expression gives ${wantV.toFixed(4)} ` +
           `-- sharing must SLOW every rope equally, not stop some and speed others`);
      bad++;
    }
    /* A rope conducts power, so the top hubs are in the SAME component as the
       winch and read the same delivered drive. What must not happen is a
       segment counting both ends: `demand` above is N x segBase, so an end
       counted twice would show up as half the drive. */
    const topDrive = r.placed.slice(N, 2 * N).map(m => m.torque);
    if (topDrive.some(d => Math.abs(d - drive) > 1e-9)) {
      fail(`TORQUE CONSERVATION: the top hubs read m.torque [${topDrive.join(', ')}] and the winch ` +
           `reads ${drive.toFixed(6)} -- a rope carries power, so both ends of one component ` +
           `deliver the same drive`);
      bad++;
    }
    console.log(`  ..  torque: 1 winch (${WINCH_T} T-units) x ${N} rope(s): drive ${drive.toFixed(4)}, ` +
                `demand ${demand.toFixed(2)}, delivered ${delivered.toFixed(4)} <= ${WINCH_T}, ` +
                `each segment ${vs[0].toFixed(4)} px/s`);
  }
  if (!bad) ok('TORQUE CONSERVATION: one winch driving 1, 2 and 5 ropes never delivers more drive ' +
               'than its own torque, and every shared rope slows by the same fraction');
}

/* A transformer trades torque for speed and conserves their product less its
   loss. Placed torque-side it multiplies the torque reaching the hub by
   `mul x (1 - loss)` and divides the shaft speed by `mul`; placed speed-side
   it does the reverse. Power out is strictly under power in either way. */
{
  const XF = D_mach.MACH[D_mach.M.transformer].ratio;
  const MUL = XF.mul * mods.eff('gearRatio', 'transformer');
  const KEEP = 1 - XF.loss * mods.eff('gearLoss', 'transformer');
  let bad = 0;

  /* winch at 12, the transformer in the corner at 13, hub at 14. Three rigs:
     no transformer, torque-side, speed-side. */
  const build = (seed, mid) => {
    const machines = [['winch', 12, 115]];
    if (mid) machines.push([mid, 13, 115]);
    /* The hub butts against whatever precedes it: a gap conducts nothing. */
    const hx = mid ? 14 : 13;
    machines.push(['hub', hx, 115], ['hub', hx, 105]);
    const i = mid ? 1 : 0;
    return driveRig({
      seed, room: { tx0: 10, ty0: 100, h: 18, w: 14 },
      machines, links: [[i + 1, i + 2]], carriers: [[0, 0.5]], player: [11, 115]
    });
  };

  /* Measured one at a time: `driveRig` calls `newRun()`, so a second rig
     built before the first is measured leaves the first's records orphaned
     and its rope out of `segments` entirely. */
  const run1 = seed => measureV(build(seed, null).seg, 1, 1 / 120, { action: true });
  const runX = (seed, id) => measureV(build(seed, id).seg, 1, 1 / 120, { action: true });
  const vPlain  = run1(8500);
  const vTorque = runX(8501, 'transformer');
  const vSpeed  = runX(8502, 'transformer_l');

  /* An empty bucket needs exactly `segBase`, so the plain rig is the
     reference the two ratios are read against. */
  const wantPlain  = predictV(winchTorque(), 0, 1);
  const wantTorque = predictV(winchTorque() * MUL * KEEP, 0, 1, null, 1 / MUL, winchTorque());
  const wantSpeed  = predictV(winchTorque() / MUL * KEEP, 0, 1, null, MUL, winchTorque());

  for (const [label, got, want] of [
    ['no transformer', vPlain, wantPlain],
    ['torque side', vTorque, wantTorque],
    ['speed side',  vSpeed,  wantSpeed]
  ]) {
    if (Math.abs(got - want) > 1e-6) {
      fail(`TRANSFORMER: ${label} -- the climb should be ${want.toFixed(4)} px/s, measured ${got.toFixed(4)}`);
      bad++;
    }
  }

  console.log(`  ..  transformer: none ${vPlain.toFixed(3)}, torque side ${vTorque.toFixed(3)}, ` +
              `speed side ${vSpeed.toFixed(3)} px/s (ratio ${MUL}, keep ${KEEP.toFixed(2)})`);

  /* Power is torque times speed, and the transformer may only lose some. */
  const pIn  = winchTorque() * 1;
  const pOut = (winchTorque() * MUL * KEEP) * (1 / MUL);
  if (!(pOut < pIn + 1e-9 && pOut > 0)) {
    fail(`TRANSFORMER: power out ${pOut.toFixed(4)} is not under power in ${pIn.toFixed(4)} -- a ` +
         `transformer trades torque for speed and never makes any`);
    bad++;
  }
  if (!bad)
    ok(`TRANSFORMER: torque x speed is conserved less ${(XF.loss * 100).toFixed(0)}% ` +
       `(power in ${pIn.toFixed(3)}, out ${pOut.toFixed(3)}), and the two facings climb at ` +
       `${vTorque.toFixed(2)} and ${vSpeed.toFixed(2)} px/s against ${vPlain.toFixed(2)} unratioed`);

  /* The diagonal. Winch footprint (19, 113..114) touches hub footprint
     (20..21, 115..116) at one corner and nowhere else. */
  {
    const r = driveRig({
      seed: 8590, room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 113]],
      links: [[0, 1]], carriers: [[0, 0.5]], player: [18, 115]
    });
    const v = measureV(r.seg, 1, 1 / 120, { action: true });
    const want = predictV(0, 0, 1);
    if (Math.abs(v - want) > 1e-6 || r.placed[2].torque !== 0)
      fail(`DIAGONAL DELIVERS ZERO: a winch touching a hub at the corner only drove the bucket at ` +
           `${v.toFixed(4)} px/s (m.torque ${r.placed[2].torque}); a diagonal does not conduct, so the ` +
           `bucket must sink at the full segDown (${want.toFixed(4)} px/s)`);
    else {
      /* And the contrast, or the assertion above would pass for a winch that
         had simply stopped working: square the same winch up against the hub
         and it drives the same rope. */
      const g = driveRig({
        seed: 8591, room: { ty0: 100, h: 18 },
        machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115]],
        links: [[0, 1]], carriers: [[0, 0.5]], player: [18, 115]
      });
      const gv = measureV(g.seg, 1, 1 / 120, { action: true });
      const gWant = predictV(winchTorque(), 0, 1);
      if (Math.abs(gv - gWant) > 1e-6)
        fail(`DIAGONAL DELIVERS ZERO: squared up against the hub the same winch should drive the same ` +
             `rope at ${gWant.toFixed(4)} px/s, measured ${gv.toFixed(4)} -- the zero above may be ` +
             `a broken winch rather than a broken diagonal`);
      else ok(`DIAGONAL DELIVERS ZERO: a corner-touching winch drives nothing (bucket sinks at ` +
              `${v.toFixed(1)} px/s); squared up it drives it at ${gv.toFixed(2)} px/s`);
    }
  }
}

/* Shared span geometry for the two link sections below. `chordThrough` is a
   second implementation in another family of algorithm: `model/segments.js`
   samples a half-tile sweep, and this clips against a tile's closed box. */
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

/* The longest chord this span cuts through any solid tile of any band, over
   every band its bounding box touches. `exempt` is the endpoints' headframe
   ranges: a legal hub has a footing tile and the cable may pass through it. */
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
   sampler and not a clipper: "outside every band" is a union of three
   rectangles, and an off-world stretch is never a thin corner clip. */
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

/* The clear window is sized from the span and never from a hub's placement
   tile: a hub's anchor is its footprint centre, one tile above its placement
   row for a 2x2, so a hub-relative window leaves the span's middle uncarved. */
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

/* Link legality over 240 seeded spans at every angle, in one band and across
   both seams. Claim 1: accepted if and only if `linkCheck` says so -- a record
   in `segments` plus a `'link'` row, or neither, through the real verb. */
{
  const TRIALS = 80;
  const STONE = D_sub.S.stone;
  const REACH = D_mach.MACH[D_mach.M.hub].hub.reach;

  /* Each family returns two [bandId, tx, ty] placements. The astral/surface pair
     shares a world column with no offset: astral is `tw:128` at `origin.x:0` like
     every other band, so band column N is world column N in all three. */
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

      /* A genuinely clear span first, then rock put back on purpose, so a refusal is
         always attributable to a tile this trial chose and never to whatever worldgen
         left in the way. */
      clearAlong(ea, eb, 1);
      const stones = r() * 4 | 0;
      for (let k = 0; k < stones; k++) {
        const f = 0.15 + r() * 0.7;
        const ox = (r() * 5 | 0) - 2, oy = (r() * 5 | 0) - 2;
        const x = mixTo(ea.x, eb.x, f) + ox * 8, y = mixTo(ea.y, eb.y, f) + oy * 8;
        const b = world.bandAt(x, y);
        if (b) tiles.write.set(b, world.tileX(b, x), world.tileY(b, y), STONE);
      }

      /* Last, so neither the carve nor the scattered rock can decide whether these
         two hubs are legally placed: they are. */
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

      /* Claim 4 first, because it decides what claims 2 and 3 may expect. */
      const tooFar = len > REACH * mods.eff('segReach', 'hub') + 1e-9;
      if (tooFar && verdict.why !== 'TOO FAR APART') {
        fail(`LINK LEGALITY: ${fam.id} trial ${i} -- a ${len.toFixed(1)} px span against a ${REACH} px ` +
             `reach was answered '${verdict.why ?? 'ok'}', not 'TOO FAR APART' (the reach rule puts ` +
             `the structural refusal first)`);
        bad++;
      }

      if (verdict.ok) {
        if (worst >= tile * 0.5 - 1e-9) {
          fail(`LINK LEGALITY: ${fam.id} trial ${i} -- an ACCEPTED ${len.toFixed(1)} px span cuts ` +
               `${worst.toFixed(2)} px through solid ${at}, which is half a tile or more; the half-tile ` +
               `sweep is guaranteed to have sampled inside it`);
          bad++;
        } else if (worst > 0) { clips++; worstClip = Math.max(worstClip, worst); }
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

/* Link legality, cross-band and hand-carved. The seeded sweep above proves a
   property over a cloud of spans; these are the four named cases at fixed
   coordinates, so a failure says which geometry broke, not which seed. */
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

  /* Case 1 -- the surface/topsoil seam, straight down. Both anchors are at x 488,
     exactly the boundary between topsoil columns 60 and 61, so this span runs
     astride a grid line for its whole length. */
  {
    const surfaceHub = ['surface', 60, 52], topsoilHub = ['topsoil', 60, 2];
    const h = handSpan(8800, surfaceHub, topsoilHub);
    expect('a clear span across the surface/topsoil seam', h.A, h.B, 'ok');

    /* And it really does cross: the low end resolves to topsoil, the high end
       to surface, so `rules/drive.js`'s band handoff has something to do. */
    const seg = segs.write.link(h.A, h.B);
    setCar(seg, 0);                     // a fresh rope carries no bucket
    const lo = world.bandAt(...Object.values(carPos(seg)));
    setCar(seg, 1);
    const hiBand = world.bandAt(...Object.values(carPos(seg)));
    if (lo?.id !== 'topsoil' || hiBand?.id !== 'surface') {
      fail(`LINK LEGALITY (cross-band): the seam span's carrier reads band "${lo?.id}" at t=0 and ` +
           `"${hiBand?.id}" at t=1 -- it is not actually crossing the seam, so nothing below tests one`);
      bad++;
    }

    /* The lower band's row 0, both columns: the row a hub-relative clear window
       misses and the row generated terrain fills with rock. */
    for (const tx of [60, 61]) {
      const h2 = handSpan(8800, surfaceHub, topsoilHub);
      tiles.write.set(world.bandOf('topsoil'), tx, 0, STONE);
      expect(`one stone in topsoil row 0, column ${tx}, on a boundary-exact seam span`,
             h2.A, h2.B, 'THE PATH IS BLOCKED', { x: 488, y: 772 });
    }
  }

  /* Case 2 -- the astral/surface seam. */
  {
    /* astral column 61: the band-local column sitting over surface column 61 is
       61, since every band shares `origin.x:0`. The world anchors this case is
       about, (496, 304) and (496, 344), are what the guard below pins. */
    const astralHub = ['astral', 61, 37], surfaceHub = ['surface', 61, 2];
    const h = handSpan(8801, astralHub, surfaceHub);
    if (h.ea.x !== 496 || h.ea.y !== 304 || h.eb.x !== 496 || h.eb.y !== 344) {
      fail(`LINK LEGALITY (cross-band): b48203d's repro no longer anchors at (496,304)->(496,344) but ` +
           `(${h.ea.x},${h.ea.y})->(${h.eb.x},${h.eb.y}) -- the hub footprint or a band origin moved, ` +
           `and this case is now testing something else`);
      bad++;
    }
    expect('a clear span across the astral/surface seam', h.A, h.B, 'ok');

    /* x 496 is the boundary between surface columns 61 and 62: 496/8 is 62 exactly,
       so `Math.floor` favours 62 and 61 is the one that can go unlooked at. */
    for (const tx of [61, 62]) {
      const h2 = handSpan(8801, astralHub, surfaceHub);
      tiles.write.set(world.bandOf('surface'), tx, 1, STONE);
      expect(`b48203d's repro with the stone in surface column ${tx}`,
             h2.A, h2.B, 'THE PATH IS BLOCKED', { x: 496, y: 328 });
    }
  }

  /* Case 3 -- a span that leaves the world. A band narrower than its neighbour,
     or offset from it, leaves world columns above the seam resolving to no band
     at all, and a span into them leaves the world for a few pixels. */
  {
    /* 3a */
    const cols = [];
    for (const b of world.bands) {
      const midY = b.origin.y + (b.cfg.th * b.tile) / 2;
      for (let tx = 0; tx < b.tw; tx++)
        if (!world.bandAt(tx * 8 + 4, midY)) cols.push(`${b.id} x${tx}`);
    }
    if (cols.length) {
      fail(`LINK LEGALITY (cross-band): ${cols.length} world column(s) resolve to no band at some ` +
           `band's own mid-height (${cols.slice(0, 6).join(', ')}) -- the bands no longer tile one ` +
           `rectangle, so a span between two in-bounds hubs can leave the world again`);
      bad++;
    }

    /* 3b. `topsoil`'s last column with a `tw:2` footprint: the second column is out
       of bounds, so the anchor lands one pixel past the world's right edge. Derived
       from `b.tw`, or a literal silently starts testing an interior column. */
    const top = world.bandOf('topsoil');
    const edge = top.tw - 1, near = edge - 7, past = world.widthPx(top);
    const h = handSpan(8802, ['topsoil', near, 100], ['topsoil', edge, 100]);
    if (h.eb.x !== past) {
      fail(`LINK LEGALITY (cross-band): the off-world hub anchors at x ${h.eb.x}, not ${past} -- a ` +
           `hub on the last column no longer reaches past the world's edge and this case is ` +
           `testing something else`);
      bad++;
    }
    expect('a span whose far anchor is past the world\'s right edge', h.A, h.B, 'OUTSIDE THE WORLD');

    /* Case 4 -- when a span is both blocked and off-world, the blockage is the one
       reported: the rock is the thing the player can do something about. */
    const h2 = handSpan(8802, ['topsoil', near, 100], ['topsoil', edge, 100]);
    tiles.write.set(world.bandOf('topsoil'), edge - 4, 100, STONE);
    expect('a span that is both blocked and off-world', h2.A, h2.B, 'THE PATH IS BLOCKED');
  }

  if (!bad)
    ok('LINK LEGALITY (cross-band): a clear span crosses either seam; b48203d\'s boundary-exact repro ' +
       'blocks on BOTH shared columns at both seams; the three bands now tile one rectangle so astral\'s ' +
       'dead zone is closed; an anchor past the world\'s edge still reads OUTSIDE THE WORLD; and a span ' +
       'that is both reports the rock');
}

/* The headframe exemption: a legally placed vertical pair links. These hubs are
   built through `rules/placement.js#placeMachine` and not through
   `model/machines.js#write.place`, which asks nothing about footing. */
{
  const STONE = D_sub.S.stone;
  let bad = 0;

  /* A flat room in `topsoil` rows 100..119, floor at 119. The lower hub stands on
     the floor (footprint 117-118, footing 119); the upper hub 12 tiles up stands
     on a hand-placed tile. Two `hub/rig` held, since `placeMachine` spends one. */
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

  /* Claims 1 and 2, both columns and both together, because "it links when the
     footing is in the column `Math.floor` favours" is half a test. */
  span('12 tiles straight up, footing under the LEFT column', 'ok', [0]);
  span('12 tiles straight up, footing under the RIGHT column', 'ok', [1]);
  span('12 tiles straight up, footing under BOTH columns', 'ok', [0, 1]);

  span('a stone mid-span in the left column', 'THE PATH IS BLOCKED', [0], [[20, 111]]);
  span('a stone mid-span in the right column', 'THE PATH IS BLOCKED', [0], [[21, 111]]);

  span('a stone ONE ROW below the exemption, left column', 'THE PATH IS BLOCKED', [0], [[20, 108]]);
  span('a stone ONE ROW below the exemption, right column', 'THE PATH IS BLOCKED', [0], [[21, 108]]);

  console.log('  ..  headframe exemption, 12-tile vertical pair built through placeMachine:');
  for (const v of verdicts) console.log(`        ${v}`);

  if (!bad)
    ok('HEADFRAME EXEMPTION: two hubs built through rules/placement.js 12 tiles apart link straight up ' +
       'with the footing tile under either column or both, a stone mid-span still refuses, and the ' +
       'exemption is exactly two rows deep -- one row lower still blocks');
}

/* The rider's half of the same exemption: exempting the cable alone leaves the
   rider refused, stopping dead below the deck. The exemption is exactly the
   cable's two rows, so one stone a row below it still stops them. */
{
  const STONE = D_sub.S.stone;
  let bad = 0;

  /* The same upright pair the cable block uses, minus `placeMachine`: `driveRig`
     assembles a rider aboard with the carrier at the top, and `footUnder` lays
     the real footing tiles. Unpowered, so it descends at the full `segDown`. */
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

  /* Claims 1 and 2. Three seconds at `segDown` is 78 px, comfortably past the
     footing row 34 px down and comfortably short of the floor. */
  {
    const r = rideDown();
    const y0 = player.player.y;
    const deck = () => carTop(r.seg) - player.PH;
    let worst = 0;
    for (let i = 0; i < 360; i++) {
      stepReal(1 / 120, { hasMouse: false });
      worst = Math.max(worst, Math.abs(player.player.y - deck()));
    }
    const fell = player.player.y - y0;
    const footingTop = world.worldY(r.band, 107);

    if (worst > 1) {
      fail(`RIDER EXEMPTION: a rider descending from t = 1 drifted ${worst.toFixed(2)} px off the deck ` +
           `-- they used to stop 10 px down and the carrier left without them`);
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

  /* Claim 3. Rows 106-107 are the exempt range for a hub at ty 105 (`th:2`), so
     108 is one row lower. Stated as "the box never overlaps the stone" and not as
     a resting pixel: once refused, `rules/player.js` decides where they land. */
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

/* Break-even, measured. The arithmetic above prices ascent in seconds of
   cranking from the tuning rows; this puts one unit of each tier on a real
   bucket, turns the winch a real second, and derives `k` from the pixels moved. */
{
  const rows = [];
  let bad = 0;
  for (const tier of ['ore', 'ingot']) {
    const r = driveRig({ ...ONE_CRANK, seed: 8900, cargo: [[0, 'copper', tier, 1]] });
    const mass = items.massOfPair(D_sub.S.copper, FORMS[tier]);
    const v = measureV(r.seg, 1, 1 / 120, { action: true });
    const want = predictV(winchTorque(), mass, 1);
    const k = v > 0 ? r.band.tile / v : Infinity;
    rows.push({ tier, mass, v, want, k, be: (RATIOS[tier] * oreSecs) / k });
    if (Math.abs(v - want) > 1e-6) {
      fail(`BREAK-EVEN MEASURED: one copper ${tier} (${mass} T) aboard a vertical rope on one winch ` +
           `climbs at ${v.toFixed(4)} px/s; the motion expression gives ${want.toFixed(4)} -- the ` +
           `arithmetic above is pricing a formula the game no longer runs`);
      bad++;
    }
  }

  /* Ordered by mass, not by tier: smelting is 1:1 and an ingot weighs LESS
     than the ore it came from, so the tier order and the mass order are no
     longer the same one. */
  rows.sort((a, b) => a.mass - b.mass);

  console.log('  ..  break-even, measured on a real bucket (1 s of winching each):');
  for (const r of rows)
    console.log(`        ${r.tier.padEnd(6)} ${r.mass.toFixed(2).padStart(6)} T   ` +
                `${r.v.toFixed(4).padStart(8)} px/s   k = ${r.k.toFixed(3)} s/tile/item-slot   ` +
                `break-even ${r.be.toFixed(2)} tiles`);

  for (let i = 1; i < rows.length; i++) {
    /* Strictly greater, with no epsilon of slack in the permissive direction:
       "equal" is what a drivetrain that had stopped reading mass at all would
       produce, and that has to fail here rather than pass. */
    if (!(rows[i].k > rows[i - 1].k * (1 + 1e-9))) {
      fail(`BREAK-EVEN MEASURED: a ${rows[i].tier} (${rows[i].mass} T) winches up at ${rows[i].k.toFixed(3)} ` +
           `s/tile, cheaper than a ${rows[i - 1].tier} (${rows[i - 1].mass} T) at ` +
           `${rows[i - 1].k.toFixed(3)} -- mass must cost seconds`);
      bad++;
    }
    if (!(rows[i].be < rows[i - 1].be)) {
      fail(`BREAK-EVEN MEASURED: ${rows[i].tier} breaks even at ${rows[i].be.toFixed(2)} tiles, not ` +
           `shallower than ${rows[i - 1].tier} at ${rows[i - 1].be.toFixed(2)} -- a heavier unit must ` +
           `pay off deeper, in measured seconds and not only in arithmetic`);
      bad++;
    }
  }
  if (!bad)
    ok(`BREAK-EVEN MEASURED: on a real bucket, k rises with mass ` +
       `(${rows.map(r => `${r.tier} ${r.k.toFixed(4)}`).join(' < ')} s/tile/item-slot) -- the ` +
       `arithmetic's price is the one the game charges`);
}

/* Render purity over the drivetrain's own draw paths, which no probe above
   covers. Five states, each drawn twice with the epoch counter compared, and
   each checked by `fillRect` count against the same frame without the thing. */
{
  const CAM = seg => {
    const p = carPos(seg);
    main.cam.x = p.x - 100;
    main.cam.y = p.y - 60;
  };
  const drawTwice = label => {
    const before = epoch.epoch.n;
    main.draw();
    main.draw();
    if (epoch.epoch.n !== before) {
      fail(`RENDER PURITY (drivetrain): drawing ${label} performed ${epoch.epoch.n - before} model ` +
           `write(s) -- view may never mutate model`);
      return false;
    }
    return true;
  };
  const rects = () => { const n = calls.fillRect; main.draw(); return calls.fillRect - n; };

  let bad = 0;
  const r = driveRig({
    /* The room starts two columns left of the standard rig's, to fit a gear and a
       crank between the player and the hub. `driveRig`'s `player` tile must be
       inside the carved room, or the player is extracted upward out of the rock. */
    seed: 8950, room: { tx0: 16, ty0: 100, h: 18, w: 14 },
    machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115], ['drive_wheel', 18, 115]],
    links: [[0, 1]], player: [17, 115], cargo: [[0, 'copper', 'ore', 3]]
  });

  /* A real turning gear, not a poked field: one second of the real crank held
     through the real step, so `m.turn` and `m.torque` are whatever
     `rules/drive.js` decided they are. */
  runReal(120, 1 / 120, { action: true, hasMouse: false });
  const gear = r.placed[3];
  if (!(gear.turn > 0 && gear.torque > 0)) {
    fail(`RENDER PURITY (drivetrain): the gear beside the crank reads turn ${gear.turn}, torque ` +
         `${gear.torque} after a second of cranking -- the turning-gear draw path is not being ` +
         `exercised, so proving it pure proves nothing`);
    bad++;
  }
  CAM(r.seg);

  for (const t of [0, 0.5, 1]) {
    setCar(r.seg, t);
    if (!drawTwice(`a carrier at t=${t}`)) bad++;
  }

  /* The cable and carrier are actually on screen. Same camera, same machines,
     one difference: the segment. */
  setCar(r.seg, 0.5);
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

  /* The cable ghost, all four states. `aim` is written directly rather than
     through a fake pointer, because a hardcoded screen coordinate resolves
     against a different tile at another buffer size. */
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

  /* And no randomness anywhere in any of it: the gear phase, the bucket spacing
     and the cable's dashes must all come from `m.turn`, `carT(seg)` and a position
     hash, never from `rand`. */
  shellUi.armLink(r.placed[0]);
  setCar(r.seg, 0.4);
  rng.seedRng(8951);
  const expected = [rng.rand(), rng.rand(), rng.rand()];
  rng.seedRng(8951);
  const got = [];
  for (let i = 0; i < 3; i++) { main.draw(); main.draw(); got.push(rng.rand()); }
  shellUi.clearLink();
  if (got.join() !== expected.join()) {
    fail('RENDER PURITY (drivetrain): drawing a moving carrier, a bucket chain, a turning gear and the ' +
         'cable ghost CONSUMED RANDOMNESS -- a screenshot now depends on how many times you have drawn');
    bad++;
  }

  if (!bad)
    ok(`RENDER PURITY (drivetrain): a carrier at t=0/0.5/1, a gear turning at phase ` +
       `${gear.turn.toFixed(2)} on torque ${gear.torque.toFixed(2)}, and the cable ghost in three ` +
       `states -- 0 model writes across ten draws, no randomness consumed, and every one of them ` +
       `provably on screen (${withCable} rects with the cable vs ${without} without, ${ghostRects} ` +
       `with the ghost vs ${noGhost} without)`);
}

/* A carrier holds the player and its cargo up through
   `model/segments.js#carrierUnder`, a model query, exactly the way
   `model/tiles.js#climbAt` answers the ladder branch -- never by terrain. */
{
  let bad = 0;
  const matSum = () => world.bands.map(b => sumBytes(b.mat)).join('/');

  /* The claim at its smallest first: the model writes that create transport
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
    setCar(seg, 0.5);
    segs.write.load(seg, 30);
    if (matSum() !== before) {
      fail('NO SECOND COLLISION MODEL: linking a cable, moving its carrier and loading it CHANGED a ' +
           'band\'s mat array -- transport must never write terrain');
      bad++;
    }
  }

  const r = driveRig({
    seed: 8961, reachMul: 2, room: { ty0: 96, h: 22 },
    machines: [['hub', 20, 115], ['hub', 20, 100], ['winch', 19, 115]],
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
    if (!segs.riddenCarrier()) { notRiding++; continue; }
    if (!player.player.onGround) floating++;
    const pb = player.playerBox();
    /* The row of tiles the feet are in and the row just below it: a rider held
       up by rock would have one of those solid. */
    const feetTy = world.tileY(band, pb.y + pb.h + 1);
    for (let tx = world.tileX(band, pb.x); tx <= world.tileX(band, pb.x + pb.w); tx++)
      if (tiles.solidAt(band, tx, feetTy)) solidUnderRider++;
    for (const [tx, ty] of tilesOf(carBox(r.seg)))
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
         `carrier is holding the player up by WRITING TERRAIN, which no carrier may ever do`);
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
       `onGround with no solid tile under their feet, the carrier's own ${tilesOf(carBox(r.seg)).length} ` +
       `tiles are all air, ${aboard.length} item(s) ride on air, and not one byte of any band's mat changed`);
}

/* A segment emits no light unless a row says so. `rules/light.js` builds its
   emitter list from machine rows carrying a `light:{}` block, and a cable, a
   carrier and a bucket chain are drawn objects. */
{
  let bad = 0;

  for (const id of ['hub', 'winch', 'transformer', 'drive_wheel']) {
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
  footUnder(machs.write.place(band, D_mach.M.winch, tx0 + 3, ty0 + 9));
  const seg = segs.write.link(lo, hi);
  setCar(seg, 0.5);
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

  /* The control. Same chamber, one row that does say so. */
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

/* No fall damage while riding, and full fall damage the moment you step off.
   One test, because it is one mechanism: the ride branch does not disable fall
   damage, it pins `fallFrom` to the player's own y every substep. */
{
  /* A 46-row span ridden from the very top. Forty is the number claim A is about
     and 46 rows leaves room for it. Starting at `t = 1` is only possible because
     of the footing exemption. */
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
    if (segs.riddenCarrier()) ridden++;
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
    /* Walk right until the carrier is no longer under the feet, then stop pressing
       so the fall itself is vertical. `onGround` is not the test for having left --
       it is true the whole time they stand on the deck -- `riddenCarrier` is. */
    stepReal(1 / 120, { right: !off, hasMouse: false });
    if (!segs.riddenCarrier()) off = true;
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
         `heart(s); model/player.js#fallHearts says ` +
         `${want} -- stepping off a carrier must cost exactly what stepping off a ledge costs`);
    bad++;
  } else if (want < 5 || !run.run.dead) {
    fail(`STEP OFF THE CARRIER: a 40-tile drop should be lethal (the fall table: 20 tiles is five ` +
         `hearts) -- got ${want} heart(s) and dead=${run.run.dead}`);
    bad++;
  }

  if (!bad)
    ok(`RIDING vs STEPPING OFF: 40 tiles down on a carrier costs 0 hearts with fallFrom pinned to within ` +
       `${worstPin.toFixed(2)} px; one step off the top of the same shaft costs ${hurt} -- exactly ` +
       `fallHearts(${vLand.toFixed(1)} px/s), and fatal`);
}

/* The tribute loop: the two receivers first, then the director -- a director
   draining a receiver that never fills looks finished and is not. */
console.log('\n6. the tribute loop');

/* Where a released haul actually comes to rest, and whether the dock's mouth
   reaches it. */
{
  const DOCK = D_mach.MACH[D_mach.M.cloud_dock];
  const dockPorts = DOCK.ports.filter(p => p.mode === 'in');
  let bad = 0;

  /* A dock on a real footing on flat ground in `topsoil` -- the band every other
     rig here uses, for the same reason: nothing in it but what this puts there.
     Astral would depend on where worldgen left its ragged lip. */
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

  /* Claim 1 */
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
                                   ['copper', 'ingot'], ['stone', 'gravel']]) {
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

  /* Claim 2 -- the same number, off a real item rather than off the formula. */
  {
    const { band, m } = dockRig(9101);
    const anchor = anchorOfM(m);
    const it = items.write.spawn(band, anchor.x, anchor.y, D_sub.S.copper, D_form.F.ore, 0, 0);
    /* The dock would eat it on the first frame, which is claim 3's business: what
       is under test here is where `rules/items.js` puts a released haul, so the
       machine is removed and only the physics is left. */
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

  /* Claim 3 -- end to end, through the real crank, carrier and release. The dock
     sits 12 tiles above a plain hub; the player stands at a crank on the floor
     and holds it, which is the only way anything ascends. */
  {
    boot.newRun(9102);
    /* Cycle 2 is made live before the delivery: `drainReceivers` pays only the
       live cycle's own receiver, and cycle 1's receiver is the altar, so an ore
       cranked to the dock under cycle 1 correctly credits nothing. */
    run.write.cycle(2);
    run.write.tribute(null);
    const band = world.bandOf('topsoil');
    for (let ty = 100; ty <= 119; ty++)
      for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);
    const lo = footUnder(machs.write.place(band, D_mach.M.hub, 20, 117));
    const dock = footUnder(machs.write.place(band, D_mach.M.cloud_dock, 20, 106));
    footUnder(machs.write.place(band, D_mach.M.winch, 19, 117));
    const c = segs.linkCheck(lo, dock);
    if (!c.ok) {
      fail(`DOCK DELIVERY: a hub cannot be linked to a dock 12 tiles above it (${c.why}) -- the dock ` +
           `is not a usable segment endpoint and nothing below this means anything`);
      bad++;
    } else {
      const seg = segs.write.link(lo, dock);
      setCar(seg, 0);
      player.write.band(band);
      player.write.move(world.worldX(band, 18), world.worldY(band, 117));
      player.write.vel(0, 0);
      player.write.set('onGround', true);
      const p = carPos(seg);
      const it = items.write.spawn(band, p.x, p.y, D_sub.S.copper, D_form.F.ore, 0, 0);
      if (it) it.rest = 1;
      /* Long enough for 96 px at the measured ~5 px/s of a loaded single-crank
         ascent, plus the frames the release and the catch take. */
      for (let i = 0; i < 120 * 40 && !overTop(seg); i++) stepReal(1 / 120, { action: true, hasMouse: false });
      runReal(30, 1 / 120, { action: true, hasMouse: false });
      /* The dock's own buffer is transient while a cycle that names it is live:
         `drainReceivers` empties it into `run.tribute.have` the same frame it is fed.
         An ore is no part of cycle 2's demand, so the trial stays armed. */
      const held = machs.count(dock, '*/#ore');
      const credited = run.run.tribute?.have?.['copper/ore'] ?? 0;
      if (!overTop(seg)) {
        fail(`DOCK DELIVERY: the carrier only reached t = ${carT(seg).toFixed(3)} in 40 s of cranking, so no ` +
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

  /* Claim 4 */
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

/* The altar: hand-fed, and unobtainable. A row with no substance can never be
   placed by a player, so "the altar is the gods' and not yours" is an absence
   in `data/substances.js` rather than a check anywhere. */
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

  /* Claim 2 -- hand-fed, through the real verb. */
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
    const moved = feedByHand(m, D_sub.S.copper, D_form.F.ore, 10);
    if (moved !== 10) {
      fail(`ALTAR HAND FEED: ten real cmd.feed presses ${Math.round(m.box.x - player.player.x)} px from ` +
           `the altar moved ${moved} unit(s), not 10 -- the SETUP failed, so nothing below is proven`);
      bad++;
    }
    runReal(2, 1 / 120, { hasMouse: false });    // let the director see the last unit
    /* Ten copper/ore is cycle 1's entire demand, so feeding it all in does not just
       fill a buffer: `rules/cycles.js` drains the altar into the ledger the same
       frame (buffer back to 0) and then completes the trial. */
    const held = machs.count(m, '*/#ore');
    const left = run.invCount(D_sub.S.copper, D_form.F.ore);
    const paid = run.run.cycle > 1 && run.run.granted.includes('winch') &&
                 run.run.granted.includes('cloud_dock');
    if (held !== 0 || left !== 0 || !paid) {
      fail(`ALTAR HAND FEED: standing ${Math.round(m.box.x - player.player.x)} px from a 2x2 altar and ` +
           `feeding 10 copper/ore by hand left ${held} in its buffer (want 0, drained), ${left} still held ` +
           `(want 0), and cycle 1 paid = ${paid} (want true) -- either the reticle never found a machine ` +
           `${ALTAR.handFeed.reach} px away or the director never saw the delivery`);
      bad++;
    } else {
      console.log(`  ..  altar: 10 copper/ore fed by hand, one press each, from ` +
                  `${Math.round(m.box.x - player.player.x)} px away -- pockets empty, cycle 1 paid ` +
                  `(furnace and dock granted)`);
    }
  }

  if (!bad)
    ok('THE ALTAR: no substance, no recipe, and placementCheck refuses it with \'NOTHING BUILT YET\' even ' +
       'when granted -- and a player standing beside one pays cycle 1 with ten real feed presses');
}

console.log('\n7. tutorial beats 5 and 6');
{
  /* Beats 1-4 are covered elsewhere and are jumped past with `advanceBeat`, the
     way `tests/visual.spec.js#driveScene` does: what is new here is only
     whether 5 and 6 fire off the director's own state. */
  boot.newRun(9130);
  while (run.run.tutorialBeat < 4) run.write.advanceBeat();

  /* Beat 5: the altar exists from the director's very first step, so one real
     frame past beat 4 is enough -- `rules/cycles.js` runs before
     `rules/tutorial.js` in `shell/schedule.js` this same frame. */
  stepReal(1 / 120, { hasMouse: false });
  if (run.run.tutorialBeat !== 5) {
    fail(`TUTORIAL BEAT 5: one real frame after beat 4 with a fresh run, tutorialBeat is ` +
         `${run.run.tutorialBeat}, not 5 -- the altar should already exist by the time ` +
         `'rules/tutorial.js' asks`);
  } else {
    console.log('  ..  beat 5 fired one frame after beat 4, off the altar\'s own existence');

    /* Beat 6: hand-feed the whole of cycle 1's demand to the altar the director
       already placed, and watch the same completion that pays the trial advance
       the beat. Ten real presses, because beat 6's predicate is `run.cycle`. */
    const band = world.bandOf('surface'); // SPAWN_BAND -- see data/world.js
    const altar = machs.machines.find(mm => mm.def === D_mach.M.altar);
    if (!altar)
      fail('TUTORIAL BEAT 6: no altar exists even after beat 5 fired -- nothing to hand-feed');
    /* One tile left of the altar's own footprint, same row as its top -- real,
       untouched surface terrain, the ground every run spawns standing on, so no
       tile-clearing is needed here. */
    player.write.band(band);
    player.write.move(world.worldX(band, band.cfg.spawnTx - 3), world.worldY(band, band.cfg.floorTy - 2));
    player.write.vel(0, 0);
    player.write.set('onGround', true);
    run.write.collect(D_sub.S.copper, D_form.F.ore, 10);
    const movedB6 = altar ? feedByHand(altar, D_sub.S.copper, D_form.F.ore, 10) : 0;
    runReal(2, 1 / 120, { hasMouse: false });
    if (movedB6 !== 10)
      fail(`TUTORIAL BEAT 6: ten real feed presses at the director's own altar moved ${movedB6} ` +
           `unit(s), not 10 -- the SETUP failed and the beat assertion below proves nothing`);
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

/* The altar arrives: `rules/cycles.js#ensureAltarPlaced` waits for tutorial
   beat 4 or for `run.t` to pass `eff('altarGraceSecs')`, whichever comes first.
   Cycle 1 has one receiver, so no altar is a run that cannot be played. */
console.log('\n7a. the altar arrives: the beat, and the grace');
{
  let bad = 0;
  const GRACE = mods.eff('altarGraceSecs');
  const anyAltar = () => machs.machines.some(m => m.def === D_mach.M.altar);

  /* Claim 1 -- not on frame 0, and not a second later. The cycle is armed from
     the first step either way; only the altar waits. */
  {
    boot.newRun(9150);
    runReal(120, 1 / 120, { hasMouse: false });
    if (anyAltar() || !run.run.tribute || run.run.tribute.id !== 'first-trial') {
      fail(`ALTAR GATE: after 1 s of real frames with no input, an altar exists = ${anyAltar()} ` +
           `(want false) and the live cycle is ${JSON.stringify(run.run.tribute?.id)} (want ` +
           `'first-trial') -- cycle 1 must arm immediately and the altar must not`);
      bad++;
    } else {
      console.log(`  ..  1 s in at beat ${run.run.tutorialBeat}: cycle 1 armed, no altar standing`);
    }
  }

  /* Claim 2 -- the beat opens it, and the clock is nowhere near. Beats 1-3 are
     driven off the state their own predicates read. Beat 4 is a round trip, so
     the descent is a real fall and only the climb back is placed by hand. */
  {
    boot.newRun(9151);
    const band = world.bandOf('surface');   // SPAWN_BAND -- see data/world.js
    runReal(10, 1 / 120, { right: true, hasMouse: false });
    run.write.collect(D_sub.S.pick, D_form.F.relic, 1);
    run.write.collect(D_sub.S.copper, D_form.F.ore, 6);
    runReal(3, 1 / 120, { hasMouse: false });

    const shaftTx = band.cfg.spawnTx + 6;
    for (let dy = -2; dy <= 6; dy++)
      for (let dx = -1; dx <= 1; dx++) tiles.write.clear(band, shaftTx + dx, band.cfg.floorTy + dy);
    player.write.band(band);
    player.write.move(world.worldX(band, shaftTx), world.worldY(band, band.cfg.floorTy + 1));
    player.write.vel(0, 0);
    runReal(60, 1 / 120, { hasMouse: false });

    const beatAtBottom = run.run.tutorialBeat, altarAtBottom = anyAltar();
    const fellTiles = (run.run.deepest - world.worldY(band, band.cfg.floorTy)) / band.tile;

    /* Back on untouched surface terrain, one tile clear of the shaft's own column.
       Beat 4 fires on the first frame here and `cycles` has already run by then,
       so the altar lands on the second. */
    player.write.move(world.worldX(band, band.cfg.spawnTx - 3), world.worldY(band, band.cfg.floorTy - 2));
    player.write.vel(0, 0);
    player.write.set('onGround', true);
    stepReal(1 / 120, { hasMouse: false });
    const beatBack = run.run.tutorialBeat, altarSameFrame = anyAltar();
    stepReal(1 / 120, { hasMouse: false });

    if (beatAtBottom !== 3 || altarAtBottom || fellTiles < 2) {
      fail(`ALTAR GATE (beat): the SETUP failed -- at the bottom of the shaft the beat is ` +
           `${beatAtBottom} (want 3), an altar exists = ${altarAtBottom} (want false) and the ` +
           `player reached ${fellTiles.toFixed(1)} tiles below the floor line (want >= 2)`);
      bad++;
    } else if (beatBack !== 4 || !anyAltar() || run.run.t >= GRACE) {
      fail(`ALTAR GATE (beat): back at the surface the beat is ${beatBack} (want 4), an altar ` +
           `exists = ${anyAltar()} (want true) and run.t is ${run.run.t.toFixed(2)} s against a ` +
           `${GRACE} s grace -- the BEAT must be what opened the gate, not the clock`);
      bad++;
    } else {
      console.log(`  ..  beat 4 fired ${run.run.t.toFixed(2)} s in, ${(GRACE - run.run.t).toFixed(0)} s ` +
                  `short of the grace; the altar stood ${altarSameFrame ? 'that' : 'the next'} frame`);
    }
  }

  /* Claim 3 -- no soft-lock. A run that does nothing at all still gets an altar
     and still pays cycle 1 through the real feed verb. Driven one 1/120 s substep
     at a time for the whole grace, so `run.t` is the simulation's own clock. */
  {
    boot.newRun(9152);
    const band = world.bandOf('surface');
    const substeps = Math.ceil((GRACE + 0.5) * 120);
    runReal(substeps, 1 / 120, { hasMouse: false });

    const altar = machs.machines.find(m => m.def === D_mach.M.altar);
    if (!altar || run.run.tutorialBeat !== 0) {
      fail(`ALTAR GRACE: ${(substeps / 120).toFixed(1)} s of real frames with no input at all left ` +
           `an altar = ${!!altar} (want true) at beat ${run.run.tutorialBeat} (want 0) -- a run that ` +
           `never digs must still be handed cycle 1's only receiver`);
      bad++;
    } else {
      player.write.band(band);
      player.write.move(world.worldX(band, band.cfg.spawnTx - 3), world.worldY(band, band.cfg.floorTy - 2));
      player.write.vel(0, 0);
      player.write.set('onGround', true);
      run.write.collect(D_sub.S.copper, D_form.F.ore, 10);
      const moved = feedByHand(altar, D_sub.S.copper, D_form.F.ore, 10);
      runReal(2, 1 / 120, { hasMouse: false });
      if (moved !== 10) {
        fail(`ALTAR GRACE: ten real feed presses at the grace-placed altar moved ${moved} unit(s), ` +
             `not 10 -- the SETUP failed and the payment below proves nothing`);
        bad++;
      } else if (run.run.cycle <= 1 || !run.run.granted.includes('winch')) {
        fail(`ALTAR GRACE: fed the grace-placed altar the whole of cycle 1's demand and run.cycle is ` +
             `${run.run.cycle} (want > 1) with granted ${JSON.stringify(run.run.granted)} (want the ` +
             `furnace) -- the altar arrived but the trial it exists for cannot be paid`);
        bad++;
      }
    }
  }

  if (!bad)
    ok(`THE ALTAR ARRIVES: withheld at beat 0 and 1 s in, placed the frame after beat 4 fires with the ` +
       `${GRACE} s grace barely started, and placed at that grace anyway in a run that never moved -- ` +
       `where it is then fed cycle 1's ten ore by hand and pays the trial`);
}

console.log('\n8. harness gaps found by audit');

/* Chunk seam: a decoration wider than one tile paints into a neighbour chunk,
   and `view/paint.js#DECO_MARGIN` states the bound -- a chunk's pixels depend
   on tiles up to that margin outside it, and no further. */
{
  /* Every canvas this stub hands out is fresh, so wrapping
     `document.createElement` around exactly one `chunkCanvas` call catches that
     call's own canvas and patches its `fillRect` before `paintChunk` draws. */
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

  /* One scenario per decoration kind, each the same shape: a chunk (`SRC`) holds
     one decoration-eligible tile flush against its own far edge, and the
     neighbour chunk `DST`, the one it bleeds into, is baked and traced. */
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
    const traceB = bakeWith(true, true);            // same, but different beyond the margin
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

/* Glow is not light: the starting `pick`'s `look.treatments` halo is a
   view-only glow `view/paint.js#paintItem` draws and must never reach
   `b.light`, held or dropped. `hub`/`rig` is the negative case, with no halo. */
{
  let bad = 0;
  boot.newRun(9510);
  const band = world.bandOf('topsoil');
  const tx0 = 40, ty0 = 240, w = 10, h = 10;

  /* The sealed-chamber idiom: clear the interior and wall every side, so the
     only light that could reach it is something inside the walls -- no sky and
     no other emitter. */
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

  /* Held: both in the pockets, player standing inside the chamber. */
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

  /* Dropped: spent out of the pockets onto the chamber floor, with the player
     moved well clear of `eff('pickupR')` so it stays dropped rather than being
     walked straight back in. */
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
         `pickaxe is exactly the brand-economy leak the harness plan names`);
    bad++;
  }

  /* The control: a `hearth` in the same chamber must read lit, or "the chamber
     reads 0" was a fact about the probe rather than about the relic. */
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

/* `view/hud.js#depth` is private to that file -- only `hoverInfo`, `drawHUD`
   and `pairLabel` leave it -- so this cannot call it. */
{
  let bad = 0;
  boot.newRun(9520);
  const ref = world.bandOf(D_world.SPAWN_BAND);
  const datum = world.worldY(ref, ref.cfg.floorTy ?? 0);

  /* view/hud.js#depth: `Math.round((player.y - datum) / ref.tile)`, transcribed
     for the diff below rather than called. */
  const hudDepthAt = worldY => Math.round((worldY - datum) / ref.tile);
  /* model/run.js#placementCheck's own minDepth branch, unrounded. */
  const placementDepthAt = (band, ty) => (world.worldY(band, ty) - datum) / ref.tile;

  /* Whichever machine gates on depth, or none: the formula half below runs
     either way, and only the real-placement half needs a gated row. */
  const GATED = D_mach.MACH.find(m => m.minDepth);
  if (GATED) run.write.grant(GATED.id);

  /* One clear, footed footprint, reused at each point by rebuilding it there
     rather than declaring it three times. */
  function tryAt(band, tx, ty) {
    for (let j = -1; j <= GATED.th; j++) for (let i = -1; i <= GATED.tw; i++) tiles.write.clear(band, tx + i, ty + j);
    for (let i = 0; i < GATED.tw; i++) tiles.write.set(band, tx + i, ty + GATED.th, D_sub.S.stone);
    return run.placementCheck(band, GATED.id, tx, ty);
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
    /* At a tile-aligned world y the two formulas agree by construction, both
       sharing `datum` and `ref.tile` -- asserted anyway, so a `floor`/`round` or a
       `ref.tile`/`band.tile` slip in either transcription shows up here. */
    const hudPredicted = hudDepthAt(world.worldY(p.band, p.ty));
    if (Math.abs(hudPredicted - predicted) > 0.5) {
      fail(`DATUM: the two transcribed formulas disagree at ${p.label} -- hud ${hudPredicted}, placement ` +
           `${predicted.toFixed(3)} -- one of the two transcriptions above no longer matches its source`);
      bad++;
      continue;
    }
    if (!GATED) continue;

    const chk = tryAt(p.band, 30, p.ty);
    const predictedTooShallow = predicted < GATED.minDepth;
    const actualTooShallow = !chk.ok && chk.why === 'TOO SHALLOW';
    /* `tryAt` clears and foots the exact footprint, so besides depth itself the
       only refusal a legal footprint can produce is 'NOTHING BUILT YET'. Any of
       the others means the helper is not building what it claims. */
    if (!chk.ok && chk.why !== 'TOO SHALLOW' && chk.why !== 'NOTHING BUILT YET') {
      fail(`DATUM: placing at ${p.label} refused for an unexpected reason (${chk.why}) -- the footprint ` +
           `helper is not building a legal footprint, so the depth comparison below proves nothing`);
      bad++;
    } else if (predictedTooShallow !== actualTooShallow) {
      fail(`DATUM: at ${p.label} (world y ${world.worldY(p.band, p.ty)}), the shared datum predicts depth ` +
           `${predicted.toFixed(2)} tiles against minDepth ${GATED.minDepth} (want ` +
           `${predictedTooShallow ? "'TOO SHALLOW'" : 'deep enough'}), but placementCheck says ` +
           `${JSON.stringify(chk)} -- the HUD gauge's datum and placementCheck's own have drifted apart`);
      bad++;
    } else {
      console.log(`  ..  datum: ${p.label} is ${predicted.toFixed(2)} tiles deep, placementCheck agrees ` +
                  `(${chk.why ?? 'deep enough'})`);
    }
  }

  /* The independent cross-check: topsoil row 220 is ~256 tiles below the
     spawn datum, which is what anchors every depth reading in the game. */
  if (row220 === null || Math.abs(row220 - 256) > 4) {
    fail(`DATUM: topsoil row 220 computes to depth ${row220} tiles against the shared datum, not the ~256 ` +
         `the band layout in data/world.js implies -- one of the two is stale`);
    bad++;
  } else {
    console.log(`  ..  datum: topsoil row 220 is depth ${row220.toFixed(1)} tiles, matching the band layout`);
  }

  if (!bad)
    ok(`DATUM: the HUD gauge's transcribed formula and ${GATED ? "placementCheck's own REAL decision " : ''}` +
       `agree at the surface band, the astral band, and topsoil row 220 (${row220.toFixed(1)} tiles)`);
}

/* Render purity, extended to the map overview, the band ruler, and an active
   tutorial callout. */
{
  const drawTwice = label => {
    const before = epoch.epoch.n;
    main.draw();
    main.draw();
    if (epoch.epoch.n !== before) {
      fail(`RENDER PURITY (${label}): drawing it twice performed ${epoch.epoch.n - before} model write(s) ` +
           `-- view may never mutate model`);
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
           `many times you have drawn`);
      return false;
    }
    return true;
  };

  let bad = 0;

  /* The map overview: `flags.showMap` gates a genuinely different render path
     (`view/scene.js#drawMap`, reading the tile grid directly rather than the
     per-chunk canvas cache normal play uses) that neither probe above runs. */
  boot.newRun(9540);
  input.flags.showMap = true;
  if (!drawTwice('the map overview')) bad++;
  if (!noRand('the map overview')) bad++;
  input.flags.showMap = false;

  /* The band ruler: `view/hud.js#hudRuler` draws whenever there is room, which
     this 1600x900 headless viewport always has. Proven on screen by requiring
     one of its own per-band rects in `drawn.panels` this frame. */
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

  /* An active tutorial callout: a fresh run's beat 0 gives
     `data/callouts.js#CALLOUTS[0]`, asserted rather than assumed, since a `null`
     callout would leave the probe below pointed at nothing. */
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

/* The reveal flood's light gate, isolated from the radius cap: past the
   always-revealed first ring, `rules/reveal.js#step`'s Pass B stops at an
   unlit tile even when nothing solid is in the way. */
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

  /* Radius distance is measured from the flood's own seed, the player's tile,
     and never from the brazier -- the two sit two tiles apart on purpose, since
     `eff('sightRadius')` bounds graph distance from the player. */
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

/* Delivery with a broken lift chain fails and says why. A 'winch' journal row
   on arrival at every segment's own top hub, relay leg or not, makes a haul
   stranded at a dead-end hub read exactly like a real delivery. */
console.log('\n8b. broken-chain delivery (rules/drive.js fix, checked here)');
{
  let bad = 0;

  /* A -- the dead end: one segment, cranked to arrival, nothing beyond it. */
  {
    const r = driveRig({
      seed: 9570, room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115]],
      links: [[0, 1]], player: [18, 115], cargo: [[0, 'copper', 'ore', 1]]
    });
    journal.write.drain();
    for (let i = 0; i < 120 * 30 && !overTop(r.seg); i++) stepReal(1 / 120, { action: true, hasMouse: false });
    runReal(5, 1 / 120, { action: true, hasMouse: false });
    const rows = journal.write.drain().filter(j => j.kind === 'refused' && /CHAIN ENDS HERE/.test(j.data?.why ?? ''));
    if (!overTop(r.seg)) {
      fail(`BROKEN CHAIN: the rig only reached t = ${carT(r.seg).toFixed(3)} in 30 s of cranking -- the ` +
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

  /* B -- a real receiver: the same shape, `cloud_dock` in place of the second
     hub. Must not fire -- a dock is somewhere, not nowhere. */
  {
    const r = driveRig({
      seed: 9571, room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['cloud_dock', 20, 105], ['winch', 19, 115]],
      links: [[0, 1]], player: [18, 115], cargo: [[0, 'copper', 'ore', 1]]
    });
    journal.write.drain();
    for (let i = 0; i < 120 * 30 && !overTop(r.seg); i++) stepReal(1 / 120, { action: true, hasMouse: false });
    runReal(5, 1 / 120, { action: true, hasMouse: false });
    const rows = journal.write.drain().filter(j => j.kind === 'refused' && /CHAIN ENDS HERE/.test(j.data?.why ?? ''));
    if (!overTop(r.seg)) {
      fail(`BROKEN CHAIN: the dock rig only reached t = ${carT(r.seg).toFixed(3)} in 30 s of cranking -- the ` +
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

  /* C -- a mid-chain hub: A-B-C, two segments, cranked to arrival at B. B
     anchors a second segment onward, so this is a relay leg rather than a dead
     end, and must not fire either. */
  {
    const r = driveRig({
      seed: 9572, room: { ty0: 90, h: 28 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['hub', 20, 95], ['winch', 19, 115]],
      links: [[0, 1], [1, 2]], player: [18, 115], cargo: [[0, 'copper', 'ore', 1]]
    });
    journal.write.drain();
    for (let i = 0; i < 120 * 30 && r.segs[0].t < 1; i++) stepReal(1 / 120, { action: true, hasMouse: false });
    runReal(5, 1 / 120, { action: true, hasMouse: false });
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

/* Cycle completion unlocks exactly one band, through
   `rules/cycles.js#complete`'s `reward.charts` loop, driven by the real feed
   verb for cycle 1 and cycle 2. Idempotency is asserted on `write.chart`. */
console.log('\n8c. HEAVENS LEDGER: cycle completion unlocks exactly one band');
{
  let bad = 0;
  boot.newRun(9580);
  const topsoil = world.bandOf('topsoil');
  for (let ty = 110; ty <= 119; ty++)
    for (let tx = 16; tx <= 29; tx++) tiles.write.clear(topsoil, tx, ty);
  for (let tx = 16; tx <= 29; tx++) tiles.write.set(topsoil, tx, 119, D_sub.S.stone);

  /* Cycle 1's altar, placed by hand rather than waited for: the subject is the
     chart a completion writes. Placing it before the first real step also means
     `ensureAltarPlaced`'s `machines.some(...)` guard never adds a second. */
  const chartAltar = footUnder(machs.write.place(topsoil, D_mach.M.altar, 22, 117));
  player.write.band(topsoil);
  player.write.move(world.worldX(topsoil, 21), world.worldY(topsoil, 117));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  run.write.collect(D_sub.S.copper, D_form.F.ore, 10);
  feedByHand(chartAltar, D_sub.S.copper, D_form.F.ore, 10);
  runReal(2, 1 / 120, { hasMouse: false });

  if (run.run.cycle <= 1 || run.run.charted.length !== 1 || run.run.charted[0] !== 'astral') {
    fail(`CYCLE CHARTS: after cycle 1 completes, run.charted is ${JSON.stringify(run.run.charted)} (want ` +
         `exactly ['astral']) and run.cycle is ${run.run.cycle} (want > 1)`);
    bad++;
  } else {
    console.log('  ..  cycle charts: cycle 1 completion charted exactly [\'astral\']');

    /* Cycle 2: `cloud_dock`, its whole demand in ingots, fed the same way, five tiles clear of
       the altar -- `handFeed`'s proximity drain is one auto-feed click from live,
       so the geometry stays clear however the verb names one machine. */
    const chartDock = footUnder(machs.write.place(topsoil, D_mach.M.cloud_dock, 27, 115));
    player.write.move(world.worldX(topsoil, 26), world.worldY(topsoil, 115));
    /* Read off the cycle table, so retuning the demand retunes the fixture. */
    const want2 = D_cycles.CYCLES[1].demand[0].n;
    run.write.collect(D_sub.S.copper, D_form.F.ingot, want2);
    feedByHand(chartDock, D_sub.S.copper, D_form.F.ingot, want2);
    runReal(2, 1 / 120, { hasMouse: false });

    if (run.run.cycle <= 2 || run.run.charted.length !== 2 ||
        run.run.charted[0] !== 'astral' || run.run.charted[1] !== 'topsoil') {
      fail(`CYCLE CHARTS: after cycle 2 completes, run.charted is ${JSON.stringify(run.run.charted)} (want ` +
           `exactly ['astral','topsoil']) and run.cycle is ${run.run.cycle} (want > 2)`);
      bad++;
    } else {
      console.log('  ..  cycle charts: cycle 2 completion charted exactly one MORE band, [\'topsoil\'], not ' +
                  'duplicating the first');

      /* Idempotency on the primitive itself, since the shipped table never exercises
         it: `write.chart`'s own `if (!run.charted.includes(bandId))` guard is what
         "not duplicated on a second completion" rests on. */
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

/* Two misses ends the run: a punishment applies on every miss and a second one
   tops hearts off to zero whichever cycle it was. One cycle is driven past its
   own deadline twice through the real schedule, with a clock counting down. */
console.log('\n8d. HEAVENS LEDGER: two misses ends the run');
{
  let bad = 0;
  boot.newRun(9590);
  const topsoil = world.bandOf('topsoil');
  for (let ty = 110; ty <= 119; ty++)
    for (let tx = 16; tx <= 29; tx++) tiles.write.clear(topsoil, tx, ty);
  for (let tx = 16; tx <= 29; tx++) tiles.write.set(topsoil, tx, 119, D_sub.S.stone);
  const missAltar = footUnder(machs.write.place(topsoil, D_mach.M.altar, 22, 117));
  player.write.band(topsoil);
  player.write.move(world.worldX(topsoil, 21), world.worldY(topsoil, 117));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  run.write.collect(D_sub.S.copper, D_form.F.ore, 10);
  feedByHand(missAltar, D_sub.S.copper, D_form.F.ore, 10);
  runReal(2, 1 / 120, { hasMouse: false });

  if (run.run.cycle <= 1 || !run.run.tribute || run.run.tribute.left === null) {
    fail(`TWO MISSES: cycle 1 never completed into a clocked cycle 2 -- run.cycle ${run.run.cycle}, ` +
         `tribute ${JSON.stringify(run.run.tribute)}`);
    bad++;
  } else {
    const deadline = run.run.tribute.left;
    const framesToMiss = Math.ceil(deadline * 120) + 240;   // margin past the exact zero-crossing

    /* The first miss. Nothing is fed -- cycle 2's demand (3 copper/plate) is
       never satisfied -- so the clock alone decides this. */
    runReal(framesToMiss, 1 / 120, { hasMouse: false });
    const heartsAfterFirst = run.run.hearts;
    if (run.run.misses !== 1 || run.run.dead || run.run.cycle !== 2) {
      fail(`TWO MISSES: after the FIRST expiry, run.misses is ${run.run.misses} (want 1), dead is ` +
           `${run.run.dead} (want false), cycle is ${run.run.cycle} (want still 2, re-armed as a retry)`);
      bad++;
    } else {
      console.log(`  ..  two misses: the first expiry cost ${5 - heartsAfterFirst} heart(s) (${heartsAfterFirst} ` +
                  'left), the run survives, and the SAME cycle re-armed as its own retry');

      /* The second miss, on the re-armed cycle's own fresh clock. */
      const deadline2 = run.run.tribute?.left ?? deadline;
      const framesToMiss2 = Math.ceil(deadline2 * 120) + 240;
      runReal(framesToMiss2, 1 / 120, { hasMouse: false });
      if (run.run.misses !== 2 || !run.run.dead) {
        fail(`TWO MISSES: after the SECOND expiry, run.misses is ${run.run.misses} (want 2) and dead is ` +
             `${run.run.dead} (want true) -- ${run.run.hearts} heart(s) left, cause '${run.run.deathCause}'`);
        bad++;
      } else {
        console.log(`  ..  two misses: the second expiry left run.hearts at ${run.run.hearts} and killed ` +
                    `the run, cause '${run.run.deathCause}'`);
      }
    }
  }

  if (!bad)
    ok('TWO MISSES: a real cycle, missed twice on its own real clock (never run.write.miss() called ' +
       'directly), survives the first and ends the run on the second, exactly as rules/cycles.js#miss ' +
       'documents');
}

/* Depletion: a deposit tile yields `tile.charge` units before it is gone, each
   costing a full `hard` of accumulated work. Driven through the real
   `rules/mining.js` and `rules/machines.js#mine`, never re-implemented. */
console.log('\n8e. DEPLETION');

/* One native tile, mined by hand until it is gone, at an arbitrary framerate. */
function handMineTile(subId, fps, { seed = 1461, tool = null, modRows = null } = {}) {
  const dt = 1 / fps;
  boot.newRun(seed);
  /* Applied after `newRun`, which clears `mods.rows` -- an override added before
     this call would be silently wiped. Removed by source at the end, so two
     calls in one process cannot leak an override into each other. */
  if (modRows) mods.write.add('handMineTile-hook', modRows);
  const band = world.bandOf('topsoil');
  const tx = 10, ty = 60;
  for (let dy = -4; dy <= 10; dy++)
    for (let dx = -1; dx <= 1; dx++) tiles.write.clear(band, tx + dx, ty + dy);
  tiles.write.set(band, tx, ty, D_sub.S[subId]);
  mining.write.clearAll();
  /* The stock pick is not starting inventory: `rules/generate.js` drops one near
     spawn and `hasPick` is `bestTool !== null`, so a player teleported into a
     test shaft holds nothing and `rules/mining.js` returns on its first line. */
  run.write.collect(D_sub.S.pick, D_form.F.relic, 1);
  if (tool) run.write.collect(D_sub.S[tool], D_form.F.relic, 1);

  player.write.band(band);
  player.write.move(world.worldX(band, tx), world.worldY(band, ty - 2));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  player.write.set('fallFrom', player.player.y);

  const want = tiles.dropAt(band, tx, ty);
  let drops = 0;
  const orig = items.write.spawn;
  items.write.spawn = (b, x, y, sub, form, vx, vy) => {
    if (want && sub === want.sub && form === want.form) drops++;
    return orig(b, x, y, sub, form, vx, vy);
  };

  /* `lastWork` is read out of the real ledger at the top of each substep and
     never reconstructed as frames x dt x power: `model/mining.js` keeps a running
     float sum, so the two disagree by rounding and the ledger is what decides. */
  let frames = 0, lastWork = 0;
  const cap = Math.ceil(fps * 60);
  while (tiles.tileAt(band, tx, ty) !== D_form.AIR && frames < cap) {
    lastWork = mining.workAt(band, tx, ty);
    stepReal(dt, { down: true, dig: true, hasMouse: false });
    frames++;
  }
  items.write.spawn = orig;
  if (modRows) mods.write.removeBySource('handMineTile-hook');

  const power = mods.eff('pickPower') * (run.bestTool()?.power ?? 1);
  return {
    band, tx, ty, drops, frames, dt, power, lastWork,
    t: frames * dt,
    gone: tiles.tileAt(band, tx, ty) === D_form.AIR,
    pair: want
  };
}

/* Three substances varying every term independently: `copper` and `iron` at
   tier 1 and different hardnesses, `adamant` at tier 2 behind the auger. A
   shipped deposit is minutes of mining per tile, so each is bent to
   PROBE_CHARGE through a real `richness` row -- the pipeline the game reads. */
{
  const RATES = [20, 30, 60, 90, 107, 120, 144, 240];
  const PROBE_CHARGE = 4;
  const CASES = [
    { sub: 'copper',  tool: null },
    { sub: 'iron',    tool: null },
    { sub: 'adamant', tool: 'auger' }
  ];
  let bad = 0, worst = 0, worstAt = '';
  for (const c of CASES) {
    const row = D_sub.SUB[D_sub.S[c.sub]];
    const mul = PROBE_CHARGE / (row.tile.charge ?? 1);
    const modRows = [{ key: `richness.${c.sub}`, mul }];
    /* Read back through `eff` and rounded exactly as the two break sites
       round it, so the probe asserts against what the game will actually
       yield rather than against PROBE_CHARGE. */
    const charge = PROBE_CHARGE;
    for (const fps of RATES) {
      const r = handMineTile(c.sub, fps, { tool: c.tool, modRows });
      if (!r.gone) { fail(`DEPLETION: ${c.sub} never broke at ${fps} fps (${r.frames} frames)`); bad++; continue; }
      if (r.drops !== charge) {
        fail(`DEPLETION: hand-mining one ${c.sub} tile at ${fps} fps yielded ${r.drops} ` +
             `${D_form.FORM[r.pair.form].id} unit(s), not its tile.charge of ${charge}`);
        bad++; continue;
      }
      /* The tile survives until exactly `hard x charge`, as two bounds on the ledger
         at the top of the substep that killed it: still short of the total then, and
         one more substep's credit reached it. `hard` through `eff`, as mining does. */
      const total = row.tile.hard * mods.eff('hard', c.sub) * charge;
      const step = r.dt * r.power;
      if (r.lastWork >= total + 1e-9) {
        fail(`DEPLETION: ${c.sub} at ${fps} fps was still standing with ${r.lastWork.toFixed(6)}s of work ` +
             `credited against a total of ${total.toFixed(6)}s -- it should already have broken`);
        bad++; continue;
      }
      if (r.lastWork + step < total - 1e-9) {
        fail(`DEPLETION: ${c.sub} at ${fps} fps broke with only ${(r.lastWork + step).toFixed(6)}s of work ` +
             `credited, short of hard x charge = ${total.toFixed(6)}s`);
        bad++; continue;
      }
      const err = Math.abs(r.lastWork + step - total);
      if (err > worst) { worst = err; worstAt = `${c.sub}@${fps}fps`; }
    }
  }
  if (!bad) {
    for (const c of CASES) {
      const row = D_sub.SUB[D_sub.S[c.sub]];
      console.log(`  ..  depletion: one ${c.sub} tile yields ${row.tile.charge ?? 1} unit(s) of ` +
                  `${row.tile.drops} over ${(row.tile.hard * (row.tile.charge ?? 1)).toFixed(2)}s of ` +
                  `tool-time at every one of the 8 framerates`);
    }
    ok(`DEPLETION: units yielded per tile equals tile.charge, and the tile survives until exactly ` +
       `hard x charge, at 8 framerates for copper/tin/granite (worst overshoot ${worst.toFixed(4)}s, ${worstAt})`);
  }
}

/* Read off the tunable rather than re-declared, so this fails the moment
   `data/tuning.js` moves. Deterministic and not statistical: `dropChance`
   forced to 1 (every unit lands) and to 0 (none, and the tile still breaks). */
{
  const REAL = {
    copper: mods.eff('dropChance', 'copper'), iron: mods.eff('dropChance', 'iron'),
    granite: mods.eff('dropChance', 'granite'),
    soil: mods.eff('dropChance', 'soil'), stone: mods.eff('dropChance', 'stone')
  };
  let bad = 0;
  if (REAL.copper !== 1 || REAL.iron !== 1 || REAL.granite !== 1)
    { fail(`YIELD QUALITY: ore/deposit dropChance drifted -- copper ${REAL.copper}, iron ${REAL.iron}, ` +
           `granite ${REAL.granite}, want 1 for all three`); bad++; }
  if (REAL.soil !== 0.05)
    { fail(`YIELD QUALITY: soil dropChance is ${REAL.soil}, want 0.05`); bad++; }
  if (REAL.stone !== 0.10)
    { fail(`YIELD QUALITY: stone dropChance is ${REAL.stone}, want 0.10`); bad++; }

  const stoneCharge = D_sub.SUB[D_sub.S.stone].tile.charge ?? 1;
  const onRow = [{ key: 'dropChance.stone', mul: 10 }];                        // 0.10 x 10 = 1.0
  const forcedOn = handMineTile('stone', 60, { modRows: onRow });
  if (forcedOn.drops !== stoneCharge) {
    fail(`YIELD QUALITY: stone with dropChance forced to 1.0 yielded ${forcedOn.drops}, ` +
         `not its tile.charge of ${stoneCharge} -- the roll broke the underlying charge count`);
    bad++;
  }

  const offRow = [{ key: 'dropChance.stone', mul: 0 }];                        // 0.10 x 0 = 0
  const forcedOff = handMineTile('stone', 60, { modRows: offRow });
  if (forcedOff.drops !== 0) {
    fail(`YIELD QUALITY: stone with dropChance forced to 0 still yielded ${forcedOff.drops} unit(s)`);
    bad++;
  }
  if (!forcedOff.gone) {
    fail(`YIELD QUALITY: stone with dropChance forced to 0 never broke -- dropChance must not touch hardness`);
    bad++;
  }

  if (!bad)
    ok(`YIELD QUALITY: dropChance is 1 for copper/tin/granite, 0.05 for soil and 0.10 for stone; forced ` +
       `to 1 a stone tile still yields its full charge (${forcedOn.drops}), and forced to 0 it yields ` +
       `none but still breaks on schedule`);
}


/* `model/tiles.js#write.setByte` clears `model/mining.js`'s entry in the one
   place every edit funnels through; a synthetic call would not prove real
   callers inherit it, so the `chasm` miracle and `placeTile` drive it. */
{
  boot.newRun(1463);
  const band = world.bandOf('topsoil');
  const tx = 12, ty = 64;
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -3; dx <= 3; dx++) tiles.write.clear(band, tx + dx, ty + dy);
  tiles.write.set(band, tx, ty, D_sub.S.copper);
  tiles.write.set(band, tx + 3, ty, D_sub.S.copper);
  mining.write.clearAll();

  const hard = tiles.baseHardAt(band, tx, ty);
  mining.write.add(band, tx, ty, hard * 2);                // two of copper's four units spent
  mining.write.add(band, tx + 3, ty, hard * 2);
  const staleA = mining.workAt(band, tx, ty);

  let bad = 0;
  if (!(staleA > 0)) { fail(' setup: no work accumulated to clear'); bad++; }

  /* The chasm: a real held phial, spent by the real `use`, applied at the aimed
     tile the same way a dig is -- radius 1 (`data/miracles.js`), so it takes the
     neighbours with it. */
  run.write.collect(D_sub.S.chasm, D_form.F.phial, 1);
  const used = sched.miracles.use(band, tx, ty);
  if (!used) { fail('rules/miracles.js#use refused a held chasm phial -- nothing was tested'); bad++; }
  else if (tiles.tileAt(band, tx, ty) !== D_form.AIR) {
    fail('the chasm did not clear its centre tile'); bad++;
  } else if (mining.workAt(band, tx, ty) !== 0) {
    fail(`the chasm cleared the tile at (${tx},${ty}) but left ${mining.workAt(band, tx, ty).toFixed(4)}s ` +
         `of accumulated work behind -- anything placed there next inherits it and breaks early ` +
         `(model/tiles.js#write.setByte)`);
    bad++;
  }

  /* The placement, at the coordinate the chasm just emptied. `placeTile` runs
     its own refusals, so a false return means the probe's scene is wrong rather
     than that the clear failed. */
  run.write.collect(D_sub.S.soil, D_form.F.block, 1);
  mining.write.add(band, tx, ty, hard * 2);                // stale work at an empty coordinate
  /* The backing goes in after the collapse, not before: the chasm is a radius-1
     square and took the neighbour with it, which is exactly what a real player
     would have to rebuild against. */
  tiles.write.set(band, tx - 1, ty, D_sub.S.stone);
  const placed = R_place.placeTile(band, tx, ty, D_sub.S.soil, D_form.F.block);
  if (!placed) { fail('placeTile refused a backed soil/block on cleared ground -- scene is wrong'); bad++; }
  else {
    const left = mining.workAt(band, tx, ty);
    const blockHard = tiles.baseHardAt(band, tx, ty);
    if (left !== 0) {
      fail(`a soil/block placed where a part-depleted copper tile stood inherited ${left.toFixed(4)}s ` +
           `of work against its own ${blockHard.toFixed(2)}s hardness -- it would break ` +
           `${left >= blockHard ? 'INSTANTLY' : 'early'}`);
      bad++;
    } else if (!(blockHard > 0) || !Number.isFinite(blockHard)) {
      fail(`the placed soil/block reads hardness ${blockHard}`); bad++;
    }
  }

  /* And the control: an untouched neighbour twenty columns clear of the collapse
     keeps its progress. A `setByte` that cleared the whole Map would pass every
     assertion above. */
  if (mining.workAt(band, tx + 3, ty) !== hard * 2) {
    fail(`the control tile at (${tx + 3},${ty}) lost its accumulated work ` +
         `(${mining.workAt(band, tx + 3, ty).toFixed(4)}s of ${(hard * 2).toFixed(4)}s) without its byte ` +
         `changing -- progress is being dropped too eagerly, and a vein you walked away from is a ` +
         `vein you have to start over`);
    bad++;
  }

  if (!bad)
    ok('the real chasm miracle and the real placeTile each clear the tile\'s accumulated work ' +
       '(so a block placed on a part-depleted deposit takes its own full hardness), and an untouched ' +
       'neighbour keeps its own');
}

/* `newRun` against a partially depleted world. A count is not the ledger, so
   this fingerprints both the keys and the seconds: a partial clear that kept
   the keys and zeroed the values cannot pass on the half it satisfies. */
{
  const seed = 1464;
  const workPrint = () => {
    let n = 0, sum = 0;
    for (const v of mining.dig.work.values()) { n++; sum += v; }
    return { n, sum: +sum.toFixed(6) };
  };

  boot.newRun(seed);
  const fresh = snapshotModel(), freshWork = workPrint();

  /* Deplete for real, two ways: a scripted dig through the whole pipeline, which
     exercises the break sites' own clear, and a spread of part-worked tiles that
     nothing breaks -- the only entries that could outlive a reset. */
  const deep = world.bandOf('topsoil');
  const sky  = world.bandOf(D_world.SPAWN_BAND);
  runReal(600, 1 / 120, { right: true, dig: true, hasMouse: false });
  const WANT = 15;
  let solidN = 0, airN = 0;
  for (let ty = 60; ty < 220 && solidN < WANT; ty++)
    for (let tx = 10; tx < 80 && solidN < WANT; tx++) {
      if (mining.workAt(deep, tx, ty) !== 0) continue;
      if (tiles.tileAt(deep, tx, ty) === D_form.AIR) continue;
      mining.write.add(deep, tx, ty, 0.31 + solidN * 0.017);
      solidN++;
    }
  for (let ty = 0; ty < sky.th && airN < WANT; ty++)
    for (let tx = 0; tx < sky.tw && airN < WANT; tx++) {
      if (mining.workAt(sky, tx, ty) !== 0) continue;
      if (tiles.tileAt(sky, tx, ty) !== D_form.AIR) continue;
      mining.write.add(sky, tx, ty, 0.55 + airN * 0.013);
      airN++;
    }
  const dirty = workPrint();

  boot.newRun(seed);
  const after = snapshotModel(), afterWork = workPrint();

  if (!(solidN === WANT && airN === WANT && dirty.sum > 0))
    fail(`DEPLETION RESET: the probe failed to dirty the work map as intended (${solidN} solid and ` +
         `${airN} air coordinates of ${WANT} each, ${dirty.n} entries, ${dirty.sum.toFixed(3)}s) -- ` +
         `without the AIR half the assertion below passes vacuously, for the reason written above it`);
  else if (afterWork.n !== 0 || afterWork.sum !== 0)
    fail(`DEPLETION RESET: ${afterWork.n} tile(s) still carry ${afterWork.sum.toFixed(4)}s of mining work ` +
         `after newRun(${seed}) -- depletion surviving a restart is a determinism bug, and ` +
         `shell/boot.js must call model/mining.js#write.clearAll()`);
  else if (JSON.stringify(fresh) !== JSON.stringify(after)) {
    const key = Object.keys(fresh).find(k => JSON.stringify(fresh[k]) !== JSON.stringify(after[k]));
    fail(`DEPLETION RESET: "${key}" differs between two fresh newRun(${seed}) calls around a partially ` +
         `depleted world\n     before: ${JSON.stringify(fresh[key]).slice(0, 200)}\n` +
         `     after:  ${JSON.stringify(after[key]).slice(0, 200)}`);
  } else
    ok(`DEPLETION RESET: a world with ${dirty.n} part-worked coordinates (${solidN} solid, ${airN} air) ` +
       `carrying ${dirty.sum.toFixed(2)}s of work fingerprints identically to a fresh newRun(${seed}) -- ` +
       `count and seconds both back to ${freshWork.n}/${freshWork.sum}`);
}

/* Mass conservation over `stone_block`, live. It is a `hand:true` row whose
   input is a tag-scoped selector (`#bulk`), so `choose` has to resolve it
   through `pocketedPair` and carry the element into a `subFrom` output. */
{
  boot.newRun(1465);
  const heldMass = () => {
    let m = 0;
    for (const slot of run.run.inv) if (slot) m += items.massOfPair(slot.sub, slot.form) * slot.n;
    /* A relic is worn rather than pocketed, and it weighs the same either way. */
    for (const sub of run.run.equipped) if (sub !== null) m += items.massOfPair(sub, D_form.F.relic);
    for (const it of items.items) m += items.massOf(it);
    return m;
  };
  const PACK = D_recipes.RECIPES.stone_block;
  const need = PACK.in['#bulk/gravel'];
  run.write.collect(D_sub.S.soil, D_form.F.gravel, need);
  const before = heldMass();

  runReal(Math.ceil(PACK.secs * 120) + 4, 1 / 120, { craft: true, hasMouse: false });

  const gravelLeft = run.invCount(D_sub.S.soil, D_form.F.gravel);
  const blocks = run.invCount(D_sub.S.soil, D_form.F.block)
               + items.items.filter(it => it.sub === D_sub.S.soil && it.form === D_form.F.block).length;
  const stoneBlocks = run.invCount(D_sub.S.stone, D_form.F.block)
               + items.items.filter(it => it.sub === D_sub.S.stone && it.form === D_form.F.block).length;
  const after = heldMass();
  const wantIn  = need * items.massOfPair(D_sub.S.soil, D_form.F.gravel);
  const wantOut = items.massOfPair(D_sub.S.soil, D_form.F.block);

  if (gravelLeft !== 0 || blocks !== 1 || stoneBlocks !== 0)
    fail(`PACK: hand-crafting with exactly ${need} soil/gravel left ${gravelLeft} rubble, ${blocks} ` +
         `soil/block and ${stoneBlocks} stone/block -- want 0 / 1 / 0. The subFrom output must carry the ` +
         `ELEMENT across (data/recipes.js#pack, same mechanism as smelt)`);
  else if (Math.abs((before - after) - (wantIn - wantOut)) > 1e-9)
    fail(`PACK: held mass went ${before.toFixed(4)} -> ${after.toFixed(4)} T (delta ` +
         `${(after - before).toFixed(4)}), but the recipe consumes ${wantIn.toFixed(4)} and produces ` +
         `${wantOut.toFixed(4)} (delta ${(wantOut - wantIn).toFixed(4)})`);
  else if (after > before + 1e-9)
    fail(`PACK: 5 rubble -> 1 block NET MASS from nothing (${before.toFixed(4)} -> ${after.toFixed(4)} T)`);
  else
    ok(`PACK: the real hand-craft turns ${need} soil/gravel (${wantIn.toFixed(2)} T) into exactly one ` +
       `SOIL block (${wantOut.toFixed(2)} T) -- the element carried across, ` +
       `${(wantIn - wantOut).toFixed(2)} T lost as waste, nothing created`);
}

/* The closed loop: only the live cycle's own receiver credits it and material
   fed to the wrong one stays there; `cloud_dock` is band-gated; a paid final
   trial sets `run.won`; and a reward grant reaches `run.granted`. */
console.log('\n8f. THE CLOSED LOOP');

/* Claim 1: cycle 2 cannot be paid at cycle 1's altar. Driven through the real
   feed verb with the altar and the dock both in reach at once, which is the
   only arrangement that proves the gate rather than proving a distance. */
{
  let bad = 0;
  boot.newRun(9600);
  const band = world.bandOf('topsoil');
  for (let ty = 110; ty <= 119; ty++)
    for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
  for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);

  const altar = footUnder(machs.write.place(band, D_mach.M.altar, 22, 117));
  const dock  = footUnder(machs.write.place(band, D_mach.M.cloud_dock, 20, 115));
  /* Cycle 2 armed directly (its own writer, the same one the director uses),
     so the live receiver is the dock and the altar is the wrong one. */
  run.write.cycle(2);
  run.write.tribute(null);
  player.write.band(band);
  player.write.move(world.worldX(band, 21), world.worldY(band, 117));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  run.write.collect(D_sub.S.copper, D_form.F.ingot, 3);
  /* Two to the altar (cycle 1's receiver, and the wrong one now) and one to the
     dock (the live one). */
  const fedAltar = feedByHand(altar, D_sub.S.copper, D_form.F.ingot, 2);
  const fedDock  = feedByHand(dock,  D_sub.S.copper, D_form.F.ingot, 1);
  runReal(2, 1 / 120, { hasMouse: false });
  if (fedAltar !== 2 || fedDock !== 1) {
    fail(`TRIBUTE GATE: the SETUP failed -- ${fedAltar} ingot(s) reached the altar (want 2) and ` +
         `${fedDock} the dock (want 1), so the split this claim is about never happened`);
    bad++;
  }

  const inAltar = machs.count(altar, '*/#refined');
  const inDock  = machs.count(dock, '*/#refined');
  const credited = run.run.tribute?.have?.['copper/ingot'] ?? 0;
  const held = run.invCount(D_sub.S.copper, D_form.F.ingot);

  /* Both machines were in reach and both were really fed. Only the dock's share
     may credit, and the altar's share must still be sitting in the altar rather
     than having vanished. */
  if (inAltar < 1) {
    fail(`TRIBUTE GATE: after feeding 3 ingots by hand within reach of BOTH receivers, the altar holds ` +
         `${inAltar} (want >= 1, uncredited but not destroyed) -- either the feed never reached it or ` +
         `the wrong-receiver material is being eaten`);
    bad++;
  }
  /* The dock's own buffer reads 0 because the director drained it, so the
     conserved sum is ledger + altar + pockets, and the ledger must be strictly
     short of the 3-plate demand. */
  if (inDock !== 0 || credited < 1 || credited >= 3 || credited + inAltar + held !== 3) {
    fail(`TRIBUTE GATE: 3 ingots fed; the ledger credits ${credited}, the dock holds ${inDock} (want 0, ` +
         `drained), the altar holds ${inAltar}, the pockets hold ${held} -- the ledger must hold exactly ` +
         `what the LIVE receiver drained (1 or 2, never all 3), and ledger + altar + pockets must still ` +
         `be 3: nothing may go missing`);
    bad++;
  }
  if (run.run.cycle !== 2) {
    fail(`TRIBUTE GATE: run.cycle is ${run.run.cycle} (want 2, still armed) -- cycle 2 completed off ` +
         `plates that were partly fed to cycle 1's altar, which is the exploit this gate closes`);
    bad++;
  }
  if (!bad)
    ok(`TRIBUTE GATE: with the altar and the dock both inside feed reach, cycle 2 credited only the ` +
       `dock's ${credited} plate(s); the ${inAltar} fed to the altar sit uncredited in its buffer and ` +
       `the trial stays armed`);
}

/* Claim 2: the band gate. `placementCheck` is the one decision both
   `rules/placement.js` and the build ghost read, so asserting it here covers
   both. */
{
  let bad = 0;
  boot.newRun(9601);
  const DOCK = D_mach.MACH[D_mach.M.cloud_dock];
  if (DOCK.band !== 'astral') {
    fail(`DOCK BAND GATE: data/machines.js#cloud_dock declares band ${JSON.stringify(DOCK.band)}, not ` +
         `'astral' -- the reward row locks the key and its value`);
    bad++;
  }
  /* Everything else a placement needs, so the only thing the check can refuse
     for is the band: granted, held, and a cleared footprint with a floor. */
  run.write.grant('cloud_dock');
  run.write.collect(D_sub.S.cloud_dock, D_form.F.rig, 1);
  const rig = (bandId, ty) => {
    const b = world.bandOf(bandId);
    for (let j = ty - 2; j <= ty + 1; j++)
      for (let i = 40; i <= 45; i++) tiles.write.clear(b, i, j);
    for (let i = 40; i <= 45; i++) tiles.write.set(b, i, ty + 1, D_sub.S.stone);
    return b;
  };
  const inAstral  = run.placementCheck(rig('astral', 29), 'cloud_dock', 41, 29);
  const inSurface = run.placementCheck(rig('surface', 18), 'cloud_dock', 41, 18);
  const inTopsoil = run.placementCheck(rig('topsoil', 60), 'cloud_dock', 41, 60);
  const wantWhy = 'ONLY IN ' + D_world.BAND.astral.name;

  if (!inAstral.ok) {
    fail(`DOCK BAND GATE: placementCheck refuses the dock on astral's own cleared floor ` +
         `(${inAstral.why}) -- the gate must allow the one band it names`);
    bad++;
  }
  for (const [where, chk] of [['surface', inSurface], ['topsoil', inTopsoil]]) {
    if (chk.ok || chk.why !== wantWhy) {
      fail(`DOCK BAND GATE: placementCheck in ${where} says ${JSON.stringify(chk)} -- want refused with ` +
           `${JSON.stringify(wantWhy)}. Placeable at the surface is the whole "ascend to the Heavens is ` +
           `optional" bug`);
      bad++;
    }
  }
  if (!bad)
    ok(`DOCK BAND GATE: cloud_dock places in astral and is refused in surface and topsoil with ` +
       `'${wantWhy}' -- everything else about the placement (granted, held, clear, floored) held equal`);
}

/* Claim 3: the win state, driven by paying every shipped cycle through the
   real director rather than by writing `run.cycle` past the end. What is under
   test is `ensureLiveCycle`'s boundary, and `CYCLES.length` is read. */
{
  let bad = 0;
  boot.newRun(9602);
  /* One completion per cycle, each through `tributeMet`, with the demand rows
     credited straight into the live ledger: what this claim is about is the
     boundary, not the delivery. */
  for (let i = 0; i < D_cycles.CYCLES.length; i++) {
    stepReal(1 / 120, { hasMouse: false });               // arm the row
    const row = D_cycles.CYCLES[run.run.cycle - 1];
    const have = {};
    for (const d of row.demand) have[`${d.sub}/${d.form}`] = d.n;
    /* A row carrying a batch clause needs its window filled as well, or
       `tributeMet` is short by its second clause and the boundary never arrives.
       Stamped at `run.t` the way `rules/cycles.js#creditTribute` stamps one. */
    const credits = row.batch ? [{ t: run.run.t, n: row.batch.n }] : [];
    run.write.tribute({ ...run.run.tribute, have, credits });
    stepReal(1 / 120, { hasMouse: false });               // resolve it
    /* And resolve the reward, which `stepReal` alone cannot: a draft reward raises
       an offer, the offer freezes the run, and a run is not won while one stands.
       `applyIntents` lays the cards out; taking one is what ends the pause. */
    main.applyIntents();
    if (run.run.offer) { input.wants.takeCard = 0; main.applyIntents(); }
  }
  stepReal(1 / 120, { hasMouse: false });                  // the frame past the last row
  const rows = journal.peek();
  const won = run.run.won;
  const winRows = rows.filter(r => r.kind === 'win').length;

  if (run.run.cycle !== D_cycles.CYCLES.length + 1 || !won) {
    fail(`WIN STATE: after paying all ${D_cycles.CYCLES.length} shipped cycles, run.cycle is ` +
         `${run.run.cycle} (want ${D_cycles.CYCLES.length + 1}) and run.won is ${won} (want true)`);
    bad++;
  } else if (winRows !== 1) {
    fail(`WIN STATE: run.won is set but the journal holds ${winRows} 'win' row(s) (want exactly 1) -- ` +
         `an end state with no row is an end state with no sound and no toast`);
    bad++;
  } else {
    /* And it must not fire twice: `ensureLiveCycle` runs every frame for the rest
       of the run and is guarded on `run.won`. `main.step` returns early on a won
       run, so the director is driven directly here. */
    const before = journal.peek().length;
    const director = sched.STEPS.find(s => s.id === 'cycles');
    director.step(1 / 120);
    director.step(1 / 120);
    if (journal.peek().length !== before) {
      fail('WIN STATE: two more director steps on a won run pushed further rows -- the win must fire ' +
           'exactly once');
      bad++;
    }
  }

  /* The screen, and the button the pointer has to find. Same `drawn.panels`
     lookup `shell/input.js#onEndRestart` performs. */
  if (!bad) {
    main.draw();
    const btn = uiState.drawn.panels.find(p => p.id === 'win-restart');
    if (!btn || btn.w <= 0 || btn.h <= 0) {
      fail(`WIN SCREEN: after a won run, drawn.panels holds ${JSON.stringify(btn)} for 'win-restart' -- ` +
           `shell/input.js#onEndRestart hit-tests exactly this rect, so no rect is no restart`);
      bad++;
    } else if (uiState.drawn.panels.some(p => p.id === 'death-restart')) {
      fail('WIN SCREEN: the death screen\'s own button is registered too -- the two end screens must be ' +
           'mutually exclusive');
      bad++;
    } else {
      console.log(`  ..  win screen: 'win-restart' registered at ${btn.w}x${btn.h} px, and no ` +
                  `'death-restart' beside it`);
    }
  }

  if (!bad)
    ok(`WIN STATE: paying all ${D_cycles.CYCLES.length} shipped cycles sets run.won exactly once, pushes ` +
       `one 'win' journal row, and draws a hit-testable restart button -- the game ENDS rather than ` +
       `running out`);
}

/* Claim 4: the reward-grant bridge. `rules/cycles.js` may not import
   `rules/grants.js`, so the ids go onto `run.awarded` and the scheduled
   `rules/grants.js#step` performs them -- and pushes a `'grant'` row. */
{
  let bad = 0;
  boot.newRun(9603);
  journal.write.clear();
  stepReal(1 / 120, { hasMouse: false });                  // arm cycle 1
  const row = D_cycles.CYCLES[0];
  const have = {};
  for (const d of row.demand) have[`${d.sub}/${d.form}`] = d.n;
  run.write.tribute({ ...run.run.tribute, have });
  stepReal(1 / 120, { hasMouse: false });                  // complete it

  const granted = (row.reward.grants ?? []).every(id => run.run.granted.includes(id));
  const grantRows = journal.peek().filter(r => r.kind === 'grant');
  const awarded = grantRows.map(r => r.data?.machine).sort();
  const wantIds = [...(row.reward.grants ?? [])].sort();

  if (!granted) {
    fail(`GRANT BRIDGE: cycle 1 completed but run.granted is ${JSON.stringify(run.run.granted)} -- it ` +
         `must contain ${JSON.stringify(row.reward.grants)}`);
    bad++;
  }
  if (awarded.join() !== wantIds.join()) {
    fail(`GRANT BRIDGE: cycle 1's reward pushed 'grant' rows for ${JSON.stringify(awarded)}, want ` +
         `${JSON.stringify(wantIds)} -- rules/cycles.js used to call the raw model writer, so the most ` +
         `important gift in the game arrived with no toast at all`);
    bad++;
  }
  if (run.run.awarded !== null) {
    fail(`GRANT BRIDGE: run.awarded is ${JSON.stringify(run.run.awarded)} after the drain (want null) -- ` +
         `a queue that is not cleared is a grant that fires every frame`);
    bad++;
  }
  if (!bad)
    ok(`GRANT BRIDGE: cycle 1's reward reaches run.granted AND pushes one 'grant' row per machine ` +
       `(${wantIds.join(', ')}) through rules/grants.js#step, with run.awarded cleared -- one grant path, ` +
       `no rules-sibling import`);
}

/* Claim 5: the beat sheet reaches the end of cycle 2, and cycle 2's four
   first-time asks each carry copy. The `BEATS`/`CALLOUTS` length agreement is
   guarded at import in `rules/tutorial.js`, which runs from this file. */
{
  let bad = 0;
  const C = D_callouts.CALLOUTS;
  /* 6..9 are the instructions for beats 7..10: plate, the dock, the chain,
     the clock. 10 is the end of the sheet and is `null` on purpose. */
  for (const i of [6, 7, 8, 9]) {
    if (typeof C[i] !== 'string' || !C[i].length) {
      fail(`CALLOUTS: index ${i} is ${JSON.stringify(C[i])} -- beats 7-10 are cycle 2's four ` +
           `first-time asks and each needs a line`);
      bad++;
    }
  }
  if (C.length !== 11 || C[10] !== null) {
    fail(`CALLOUTS: ${C.length} rows with index 10 = ${JSON.stringify(C[10])} -- want 11 rows ending in ` +
         `null (cycle 2 paid, the sheet is over)`);
    bad++;
  }
  if (!bad)
    ok(`BEAT SHEET: 10 beats with 11 callout slots, ${C.filter(c => c).length} carrying a line -- ` +
       `cycle 2's plate, dock, chain and clock each have one`);
}

/* Growth: a felled tree drops a seed, and a planted seed becomes a tree after
   `eff('treeGrowSecs')` of accumulated simulation time. Four properties, the
   first of them a timed transition and so framerate-dependent by nature. */
console.log('\n8g. GROWTH');

/* A flat shelf with soil under it, cleared by hand and not found, since a seed
   needs a solid tile below and air on the other three sides. `surface` and not
   `topsoil`: a tree grows upward and `resolve` writes only what fits. */
function growScene(seed, { tx = 20, ty = 24 } = {}) {
  boot.newRun(seed);
  const band = world.bandOf('surface');
  /* Ten rows of headroom above the planting row: `data/world.js`'s `trees`
     row tops out at height 5, so nothing can clip. */
  for (let dy = -10; dy <= 1; dy++)
    for (let dx = -2; dx <= 2; dx++) tiles.write.clear(band, tx + dx, ty + dy);
  tiles.write.set(band, tx, ty + 1, D_sub.S.soil);          // the floor it roots into
  return { band, tx, ty };
}

/* Planted through the real `rules/placement.js#placeTile` and not through
   `model/tiles.js#write.set`, so the clause that makes a seed legal on a bare
   floor runs. The unit is collected first because `placeTile` spends one. */
function plantSeed(band, tx, ty) {
  run.write.collect(D_sub.S.timber, D_form.F.seed, 1);
  return R_place.placeTile(band, tx, ty, D_sub.S.timber, D_form.F.seed);
}

/* The height of the native trunk standing on (tx, ty), counted upward. Reads
   the same two facts `rules/mining.js#trunkAt` does, for the same reason: a
   placed timber tile is not a trunk. */
function trunkHeight(band, tx, ty) {
  let h = 0;
  while (tiles.subAt(band, tx, ty - h) === D_sub.S.timber &&
         tiles.formAt(band, tx, ty - h) === D_form.NATIVE) h++;
  return h;
}

/* Claim 1: a planted seed becomes a tree after exactly `eff('treeGrowSecs')`
   of accumulated simulation time, at all 8 framerates. */
{
  const RATES = [20, 30, 60, 90, 107, 120, 144, 240];
  let bad = 0, worst = 0, worstAt = '';
  const total = mods.eff('treeGrowSecs');

  for (const fps of RATES) {
    const dt = 1 / fps;
    const { band, tx, ty } = growScene(9600 + fps);
    if (!plantSeed(band, tx, ty)) {
      fail(`GROWTH: placeTile refused a timber/seed on a bare soil floor at ${fps} fps -- the ` +
           `tile.roots clause is what makes planting on flat ground legal`);
      bad++; continue;
    }

    let frames = 0, lastSecs = 0;
    const cap = Math.ceil(fps * (total + 5));
    while (growth.growingAt(band, tx, ty) && frames < cap) {
      lastSecs = growth.grownAt(band, tx, ty);
      stepReal(dt);
      frames++;
    }

    if (growth.growingAt(band, tx, ty)) {
      fail(`GROWTH: the seed never resolved at ${fps} fps -- ${frames} substeps, ` +
           `${growth.grownAt(band, tx, ty).toFixed(4)}s of ${total}s accumulated`);
      bad++; continue;
    }
    const h = trunkHeight(band, tx, ty);
    if (h < 1) {
      fail(`GROWTH: the seed resolved at ${fps} fps but left no native trunk at (${tx}, ${ty}) -- ` +
           `tileAt reads ${tiles.tileAt(band, tx, ty)}`);
      bad++; continue;
    }
    if (lastSecs >= total + 1e-9) {
      fail(`GROWTH: at ${fps} fps the seed was still a seed with ${lastSecs.toFixed(6)}s of ${total}s ` +
           `accumulated -- it should already have become a tree`);
      bad++; continue;
    }
    if (lastSecs + dt < total - 1e-9) {
      fail(`GROWTH: at ${fps} fps the seed became a tree with only ${(lastSecs + dt).toFixed(6)}s of ` +
           `${total}s accumulated -- ${(total - lastSecs - dt).toFixed(6)}s early`);
      bad++; continue;
    }
    const err = Math.abs(lastSecs + dt - total);
    if (err > worst) { worst = err; worstAt = `${fps}fps`; }
  }
  if (!bad)
    ok(`GROWTH: a planted timber/seed becomes a native trunk after exactly ` +
       `eff('treeGrowSecs') = ${total}s of accumulated SIMULATION time, driven through the real ` +
       `main.step() at 8 framerates (worst overshoot ${worst.toFixed(5)}s, ${worstAt}) -- and it ` +
       `advances with no input held, so nothing here is wall-clock driven`);
}

/* Claim 2: the resolved height is a function of the tile and nothing else --
   what `hash2` buys and a `rand` draw would not. Plant the same tile in the
   same seed at two different points in the run and require one height. */
{
  let bad = 0;
  const SEED = 9620, tx = 20, ty = 24;
  const total = mods.eff('treeGrowSecs');
  const dt = 1 / 120;

  const growTo = (band, x, y) => {
    let n = 0;
    while (growth.growingAt(band, x, y) && n < (total + 5) * 120) { stepReal(dt); n++; }
    return trunkHeight(band, x, y);
  };

  /* Run A: plant immediately. */
  const a = growScene(SEED, { tx, ty });
  plantSeed(a.band, tx, ty);
  const hA = growTo(a.band, tx, ty);

  /* Run B: the same seed, but a real shaft dug first so the stream has moved.
     Driven through `stepReal` with `dig`/`down` held, i.e. the real break
     branch, so the drop tosses and the `data/drops.js` rolls consume `rand`. */
  const b = growScene(SEED, { tx, ty });
  run.write.collect(D_sub.S.pick, D_form.F.relic, 1);
  player.write.band(b.band);
  player.write.move(world.worldX(b.band, tx + 6), world.worldY(b.band, ty - 1));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  player.write.set('fallFrom', player.player.y);
  const before = rng.rand();
  runReal(2400, dt, { down: true, dig: true, hasMouse: false });
  const after = rng.rand();
  /* Re-cleared, because the shaft above may have dropped rubble into the
     planting column and `placeTile` refuses a tile that is not AIR. The floor is
     re-laid for the same reason. */
  for (let dy = -10; dy <= 1; dy++)
    for (let dx = -2; dx <= 2; dx++) tiles.write.clear(b.band, tx + dx, ty + dy);
  tiles.write.set(b.band, tx, ty + 1, D_sub.S.soil);
  plantSeed(b.band, tx, ty);
  const hB = growTo(b.band, tx, ty);

  if (before === after) {
    fail(`GROWTH HEIGHT: the 2,400-substep dig consumed nothing from rand() (${before} both sides), ` +
         `so this probe cannot distinguish hash2 from a stream draw -- the scene is not actually ` +
         `mining anything`);
    bad++;
  }
  if (hA !== hB) {
    fail(`GROWTH HEIGHT: the same tile (${tx}, ${ty}) in seed ${SEED} grew ${hA} tiles tall when ` +
         `planted immediately and ${hB} tiles tall when planted after a dig that moved the rand() ` +
         `stream. Height must come from hash2(tx, ty) -- a positional hash consumes nothing and is ` +
         `independent of WHEN the seed resolves`);
    bad++;
  }
  const [lo, hi] = [3, 5];
  if (hA < lo || hA > hi) {
    fail(`GROWTH HEIGHT: ${hA} tiles is outside data/world.js's declared trees height [${lo}, ${hi}] ` +
         `-- rules/growth.js reads that range off the strata row rather than re-literalling it, so a ` +
         `planted tree is the same size as a wild one`);
    bad++;
  }

  /* A constant would pass everything above. This is the assertion that says the
     hash is actually being consulted. */
  const seen = new Set();
  const c = growScene(9621);
  for (let x = 10; x < 34; x++) {
    for (let dy = -10; dy <= 1; dy++) tiles.write.clear(c.band, x, c.ty + dy);
    tiles.write.set(c.band, x, c.ty + 1, D_sub.S.soil);
    plantSeed(c.band, x, c.ty);
  }
  {
    let n = 0;
    while (growth.activeCount() > 0 && n < (total + 5) * 120) { stepReal(dt); n++; }
  }
  for (let x = 10; x < 34; x++) seen.add(trunkHeight(c.band, x, c.ty));
  if (seen.size < 2) {
    fail(`GROWTH HEIGHT: 24 seeds planted across 24 columns all grew to ${[...seen].join('/')} -- ` +
         `heightAt is returning a constant, so hash2(tx, ty) is not being consulted and the ` +
         `[3, 5] range is decorative`);
    bad++;
  }
  if (!bad)
    ok(`GROWTH HEIGHT: the same tile grew ${hA} tiles tall whether planted immediately or after a ` +
       `2,400-substep dig that really did move the rand() cursor -- and 24 columns produced ` +
       `${seen.size} distinct heights in [3, 5], so the positional hash is doing the work`);
}

/* Claim 3: mining a growing seed returns the seed and leaves no orphaned
   progress. `model/tiles.js#dropOf` returns the pair itself for any non-NATIVE
   form, so the item half needs no seed-specific line anywhere. */
{
  let bad = 0;
  const { band, tx, ty } = growScene(9630);
  plantSeed(band, tx, ty);

  /* Half of `treeGrowSecs`, put on the ledger through the same
     `model/growth.js#write.add` the real step calls: driving 10,800 substeps to
     get there would measure claim 1's subject instead of this one's. */
  const total = mods.eff('treeGrowSecs');
  growth.write.add(band, tx, ty, total / 2);
  const midway = growth.grownAt(band, tx, ty);

  /* The seedling has to be mineable by hand: `hardK:0.05` on a 0.35 s substance
     is 0.0175 s, three substeps at 120 fps. The player stands two tiles above it
     so `resolveStraightDown` targets that one column. */
  run.write.collect(D_sub.S.pick, D_form.F.relic, 1);
  player.write.band(band);
  player.write.move(world.worldX(band, tx), world.worldY(band, ty - 2));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  player.write.set('fallFrom', player.player.y);

  let got = 0;
  const orig = items.write.spawn;
  items.write.spawn = (bb, x, y, sub, form, vx, vy) => {
    if (sub === D_sub.S.timber && form === D_form.F.seed) got++;
    return orig(bb, x, y, sub, form, vx, vy);
  };
  let n = 0;
  while (tiles.tileAt(band, tx, ty) !== D_form.AIR && n < 600) {
    stepReal(1 / 120, { down: true, dig: true, hasMouse: false });
    n++;
  }
  items.write.spawn = orig;

  if (!(midway > 0)) {
    fail(`GROWTH RECOVERY: the probe never put any time on the ledger (${midway}s) -- ` +
         `model/growth.js#write.add refused, so there is no growing seed under test`);
    bad++;
  }
  if (tiles.tileAt(band, tx, ty) !== D_form.AIR) {
    fail(`GROWTH RECOVERY: the seedling did not break in ${n} substeps -- at hardK 0.05 on timber's ` +
         `0.35s it should take three`);
    bad++;
  }
  if (got !== 1) {
    fail(`GROWTH RECOVERY: mining a growing seedling spawned ${got} timber/seed item(s), want 1 -- ` +
         `model/tiles.js#dropOf returns the pair itself for a placed form, so a misplaced seed must ` +
         `come back`);
    bad++;
  }
  if (growth.growingAt(band, tx, ty)) {
    fail(`GROWTH RECOVERY: the growth entry survived the tile with ` +
         `${growth.grownAt(band, tx, ty).toFixed(4)}s on it -- an orphaned entry accumulates dt ` +
         `forever against a tile that is now air, and nothing in the game would report it ` +
         `(model/tiles.js#write.setByte is what must drop it)`);
    bad++;
  }
  /* And it must not resolve into a tree afterwards -- the strongest single
     statement that the entry is really gone: run past the full grow time and
     require the column to still be empty. */
  if (!bad) {
    let m = 0;
    while (m < (total + 5) * 120) { stepReal(1 / 120); m++; }
    if (trunkHeight(band, tx, ty) > 0) {
      fail(`GROWTH RECOVERY: ${trunkHeight(band, tx, ty)} native trunk tile(s) appeared at ` +
           `(${tx}, ${ty}) after the seedling was mined out -- a cleared entry cannot resolve`);
      bad++;
    }
  }
  if (!bad)
    ok(`GROWTH RECOVERY: a seedling ${midway.toFixed(1)}s into its ${total}s grows back one ` +
       `timber/seed when mined, its ledger entry goes with the tile, and no tree ever appears ` +
       `there -- no orphaned progress`);
}

/* The condition is a column fact -- "the last remaining trunk tile" -- which
   `data/drops.js` structurally cannot express, so it is real code in
   `rules/mining.js` and needs a real probe. */
{
  let bad = 0;
  const { band, tx, ty } = growScene(9640);

  /* A 3-tile native trunk standing on soil, hand-built the way
     `rules/generate.js#trees` builds one: NATIVE bytes, growing upward. */
  tiles.write.set(band, tx, ty, D_sub.S.soil);
  for (let k = 1; k <= 3; k++) tiles.write.set(band, tx, ty - k, D_sub.S.timber);

  run.write.collect(D_sub.S.pick, D_form.F.relic, 1);
  player.write.band(band);
  player.write.move(world.worldX(band, tx), world.worldY(band, ty - 5));
  player.write.vel(0, 0);
  player.write.set('fallFrom', player.player.y);

  let seeds = 0;
  const orig = items.write.spawn;
  items.write.spawn = (bb, x, y, sub, form, vx, vy) => {
    if (sub === D_sub.S.timber && form === D_form.F.seed) seeds++;
    return orig(bb, x, y, sub, form, vx, vy);
  };

  /* The seed count snapshotted the moment each trunk tile disappears, which is
     what turns "one seed" into "one seed, and only on the last tile". */
  const remaining = () => {
    let n = 0;
    for (let k = 1; k <= 3; k++)
      if (tiles.subAt(band, tx, ty - k) === D_sub.S.timber &&
          tiles.formAt(band, tx, ty - k) === D_form.NATIVE) n++;
    return n;
  };
  const seedsAfter = [];
  let was = remaining(), n = 0;
  while (was > 0 && n < 3000) {
    stepReal(1 / 120, { down: true, dig: true, hasMouse: false });
    n++;
    const now = remaining();
    if (now < was) { seedsAfter.push(seeds); was = now; }
  }
  items.write.spawn = orig;

  if (seedsAfter.length !== 3) {
    fail(`FELLING: ${seedsAfter.length} of 3 trunk tiles came down in ${n} substeps -- the probe ` +
         `never actually felled the tree, so nothing below it means anything`);
    bad++;
  }
  const wantSeeds = Math.max(0, Math.round(mods.eff('seedYield')));
  if (seeds !== wantSeeds) {
    fail(`FELLING: a 3-tile trunk felled completely dropped ${seeds} seed(s), want exactly ` +
         `${wantSeeds} -- that is eff('seedYield'), and the condition is "no NATIVE timber above ` +
         `or below the tile just cleared"`);
    bad++;
  }
  if (seedsAfter[0] !== 0 || seedsAfter[1] !== 0) {
    fail(`FELLING: seeds after each of the three tiles went were ${JSON.stringify(seedsAfter)} -- ` +
         `nothing may drop until the LAST trunk tile, or a player who fells one tile of a 5-tall tree ` +
         `is handed the regrowth for free`);
    bad++;
  }

  /* A `timber/rung` on its own, mined out: the substance reads `timber` through
     `subOf` as a trunk does, the form is not NATIVE, and no seed may appear.
     Struck sideways -- a rung is `solid:false`, so a player above falls through. */
  {
    const rx = tx + 8;
    for (let dy = -4; dy <= 1; dy++)
      for (let dx = 0; dx <= 1; dx++) tiles.write.clear(band, rx + dx, ty + dy);
    tiles.write.set(band, rx + 1, ty + 1, D_sub.S.stone);       // the stance
    tiles.write.set(band, rx, ty, D_sub.S.timber, D_form.F.rung);

    let rungSeeds = 0;
    const o2 = items.write.spawn;
    items.write.spawn = (bb, x, y, sub, form, vx, vy) => {
      if (sub === D_sub.S.timber && form === D_form.F.seed) rungSeeds++;
      return o2(bb, x, y, sub, form, vx, vy);
    };
    player.write.move(world.worldX(band, rx + 1), world.worldY(band, ty - 1));
    player.write.vel(0, 0);
    player.write.set('onGround', true);
    player.write.set('fallFrom', player.player.y);
    player.write.set('face', -1);

    let m = 0;
    while (tiles.tileAt(band, rx, ty) !== D_form.AIR && m < 600) {
      stepReal(1 / 120, { dig: true, hasMouse: false });
      m++;
    }
    items.write.spawn = o2;

    if (tiles.tileAt(band, rx, ty) !== D_form.AIR) {
      fail(`FELLING: the placed timber/rung did not break in ${m} substeps ` +
           `(aim resolved to ${aimModel.aim.tx}, ${aimModel.aim.ty}; want ${rx}, ${ty}), so the ` +
           `NATIVE half of the seed condition was never actually exercised`);
      bad++;
    }
    if (rungSeeds !== 0) {
      fail(`FELLING: mining out a PLACED timber/rung dropped ${rungSeeds} seed(s) -- the ` +
           `formOf(byte) === NATIVE half of this test is what stops a player pegging rungs into a ` +
           `wall and farming them for seeds, since a rung's byte reads timber through subOf too`);
      bad++;
    }
  }

  if (!bad)
    ok(`FELLING: a 3-tile native trunk felled top-down drops exactly eff('seedYield') = ` +
       `${wantSeeds} timber/seed, and only on the last tile (${JSON.stringify(seedsAfter)}); ` +
       `a placed timber/rung mined out drops none`);
}

/* Exhaustive rather than a spot check: every neighbourhood the predicate can
   see -- above and below each of {air, solid, climbable}, left and right each
   of {air, solid}, 36 in all -- crossed with every tile-capable form. */
{
  let bad = 0, cases = 0;
  const OUTSIDE = ['air', 'solid'];
  const VERT = ['air', 'solid', 'climb'];
  /* Each form with a substance it legally crosses with, and whether its own row
     carries `roots`. Read off the table rather than hardcoded, so a fifth
     tile-capable form added later fails here instead of going unchecked. */
  const FORMS = D_form.FORM
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.tile)
    .map(({ f, i }) => ({
      id: f.id, form: i, roots: f.tile.roots === true,
      sub: f.subTags.includes('organic') ? D_sub.S.timber
         : f.subTags.includes('metal')   ? D_sub.S.copper
         : D_sub.S.soil
    }));

  if (FORMS.length !== 3)
    fail(`ROOTS: ${FORMS.length} tile-capable forms (${FORMS.map(r => r.id).join(', ')}), want 3 ` +
         `(rung/block/seed) -- a new one needs a column in this table`);

  boot.newRun(9660);
  const band = world.bandOf('surface');
  const put = (x, y, kind) => {
    if (kind === 'air') tiles.write.clear(band, x, y);
    else if (kind === 'solid') tiles.write.set(band, x, y, D_sub.S.stone);
    else tiles.write.set(band, x, y, D_sub.S.timber, D_form.F.rung);   // climbable, not solid
  };

  const tx = 30, ty = 24;
  for (const row of FORMS) {
    for (const above of VERT) for (const below of VERT)
      for (const left of OUTSIDE) for (const right of OUTSIDE) {
        /* Rebuilt from scratch every case, and the target cleared last, so a
           `write.set` on a neighbour can never leave the target non-AIR. */
        put(tx - 1, ty, left);
        put(tx + 1, ty, right);
        put(tx, ty - 1, above);
        put(tx, ty + 1, below);
        tiles.write.clear(band, tx, ty);

        /* The support predicate re-derived here rather than imported, so this and
           `rules/placement.js` can disagree instead of agreeing by sharing one
           expression. */
        const solid = k => k === 'solid';
        const climb = k => k === 'climb';
        const wasBacked = solid(left) || solid(right) || solid(above)
                       || climb(above) || climb(below);
        const want = wasBacked || (row.roots && solid(below));

        run.write.collect(row.sub, row.form, 1);
        const got = R_place.placeTile(band, tx, ty, row.sub, row.form);
        cases++;
        if (got !== want) {
          fail(`ROOTS: placing ${D_form.FORM[row.form].id} with left=${left} right=${right} ` +
               `above=${above} below=${below} was ${got ? 'ACCEPTED' : 'REFUSED'}, want ` +
               `${want ? 'ACCEPTED' : 'REFUSED'}. ` +
               (row.roots
                 ? `A \`roots\` form is backed by a solid tile directly below IN ADDITION to the ` +
                   `four existing satisfiers`
                 : `${D_form.FORM[row.form].id} carries no \`roots\` key, so its placement must be ` +
                   `BIT-IDENTICAL to the pre-Phase-15 rule -- solid-below must not have leaked into ` +
                   `the shared predicate`));
          bad++;
        }
        /* Whatever was placed has to go before the next case, or the target is
           not AIR. */
        tiles.write.clear(band, tx, ty);
      }
  }

  /* The headline case, stated on its own so the failure names it: a rung whose
     only support is the floor under it still refuses. */
  put(tx - 1, ty, 'air'); put(tx + 1, ty, 'air');
  put(tx, ty - 1, 'air'); put(tx, ty + 1, 'solid');
  tiles.write.clear(band, tx, ty);
  run.write.collect(D_sub.S.timber, D_form.F.rung, 1);
  if (R_place.placeTile(band, tx, ty, D_sub.S.timber, D_form.F.rung)) {
    fail(`ROOTS: a timber/rung with nothing but a floor beneath it was ACCEPTED -- that is a real ` +
         `change to how a ladder is built and the whole reason solid-below is gated on the form's ` +
         `own key instead of adding it to the predicate`);
    bad++;
  }
  tiles.write.clear(band, tx, ty);

  /* And `log` really is out of this function entirely. */
  run.write.collect(D_sub.S.timber, D_form.F.log, 1);
  put(tx - 1, ty, 'solid');
  tiles.write.clear(band, tx, ty);
  if (R_place.placeTile(band, tx, ty, D_sub.S.timber, D_form.F.log)) {
    fail(`ROOTS: timber/log placed as a tile -- its \`tile\` block is gone, so ` +
         `placeTile's form gate must refuse it before the backing predicate is reached`);
    bad++;
  }

  if (!bad)
    ok(`ROOTS: ${cases} placement verdicts over all 36 neighbourhoods x ${FORMS.length} tile-capable forms match ` +
       `the predicate computed independently -- rung/stair/block are BIT-IDENTICAL to the ` +
       `pre-Phase-15 rule (a rung on a bare floor still refuses), seed differs in exactly the ` +
       `solid-below case, and log does not reach the predicate at all`);
}

/* Claim 5: `newRun` fingerprints identically with a growing seed planted in
   between. `snapshotModel` holds `growth` as the full entry, so this catches a
   seed surviving at all and one surviving with its seconds intact. */
{
  const seed = 9650;
  boot.newRun(seed);
  const fresh = JSON.stringify(snapshotModel());

  const band = world.bandOf('surface');
  const tx = 20, ty = 6;                    // worldgen never writes row 6
  for (let dy = -2; dy <= 1; dy++)
    for (let dx = -2; dx <= 2; dx++) tiles.write.clear(band, tx + dx, ty + dy);
  tiles.write.set(band, tx, ty + 1, D_sub.S.soil);   // something to root into, 14 rows up
  plantSeed(band, tx, ty);
  runReal(600, 1 / 120);                    // five seconds of real growth
  const dirtySecs = growth.grownAt(band, tx, ty);
  const dirtyCount = growth.activeCount();

  boot.newRun(seed);
  const again = JSON.stringify(snapshotModel());

  if (!(dirtyCount === 1 && dirtySecs > 0))
    fail(`GROWTH RESET: the probe failed to dirty the run -- ${dirtyCount} seed(s) with ` +
         `${dirtySecs}s on them. Without a live growing seed this assertion tests nothing, which is ` +
         `the failure CLAUDE.md records twice`);
  else if (growth.activeCount() !== 0)
    fail(`GROWTH RESET: ${growth.activeCount()} growth entr(ies) survived newRun(${seed}) -- a seed ` +
         `outliving a restart is a determinism bug, and shell/boot.js#newRun must call ` +
         `growthw.clearAll() in its teardown block`);
  else if (fresh !== again) {
    const a = JSON.parse(fresh), b2 = JSON.parse(again);
    const key = Object.keys(a).find(k => JSON.stringify(a[k]) !== JSON.stringify(b2[k]));
    fail(`GROWTH RESET: "${key}" differs between two fresh newRun(${seed}) calls around a run with a ` +
         `growing seed in it\n    before: ${JSON.stringify(a[key]).slice(0, 300)}\n` +
         `    after:  ${JSON.stringify(b2[key]).slice(0, 300)}`);
  } else
    ok(`GROWTH RESET: a seed ${dirtySecs.toFixed(4)}s into growing is gone after newRun(${seed}), and ` +
       `every exported model object -- growth's own entries included -- fingerprints identically to a ` +
       `fresh run on the same seed`);
}

/* Band seams: a crossing is monotone and happens once. Two seams --
   astral/surface at world y 320, surface/topsoil at 768 -- and a 16 px hitbox
   against an 8 px tile spends 15 px of every crossing in two bands at once. */
console.log('\n8h. BAND SEAMS (the reported layer II -> III teleport)');

/* Carve columns `tx`..`tx+w-1` clear over rows `fromTy`..`toTy` and hand back
   whether every one of them is air afterwards: a scene that failed to carve
   itself makes every claim below vacuous. */
function seamCarve(b, tx, fromTy, toTy, w = 2) {
  let clear = true;
  for (let ty = fromTy; ty <= toTy; ty++)
    for (let dx = 0; dx < w; dx++) {
      tiles.write.clear(b, tx + dx, ty);
      if (tiles.solidAt(b, tx + dx, ty)) clear = false;
    }
  return clear;
}

/* A ladder the player can actually climb, in one column: `write.spawn` centres
   a 6 px hitbox in an 8 px tile, so the box never spans two columns and a
   single rung column is the whole ladder. */
function seamLadder(b, tx, fromTy, toTy) {
  for (let ty = fromTy; ty <= toTy; ty++)
    tiles.write.set(b, tx, ty, D_sub.S.timber, D_form.F.rung);
}

/* Drive the real loop and report the crossing. `dir` is +1 for a descent, -1
   for a climb; `worstBack` is the largest single-substep move against it.
   `spawn` and not `move`, because only `spawn` resets `fallFrom`. */
function seamRun(steps, dir, want = {}) {
  const p = player.player;
  let flips = 0, worstBack = 0, prevY = p.y, prevBand = p.band;
  for (let i = 0; i < steps; i++) {
    stepReal(1 / 120, want);
    if (p.band !== prevBand) { flips++; prevBand = p.band; }
    const back = (prevY - p.y) * dir;
    if (back > worstBack) worstBack = back;
    prevY = p.y;
    if (run.run.dead) break;
  }
  return { flips, worstBack, y: p.y, band: p.band.id, ground: p.onGround, dead: run.run.dead };
}

/* Substeps enough to climb `dist` px at the live `eff('climb')`, plus one tile
   of overshoot so the claim is about arriving rather than about landing on the
   boundary. One tile only: the rock above would bill a bonk as a slip. */
const climbSteps = dist => Math.ceil(((dist + 8) / mods.eff('climb')) * 120);

/* Claim 1: a free fall down a cleared shaft crosses the surface/topsoil seam
   without once moving up. The budget ends the probe mid-fall, short of the
   floor, so `worstBack` holds at an exact 0: a landing snap moves a faller up. */
{
  const SEED = 4242, TX = 20;
  boot.newRun(SEED);
  const sur = world.bandOf('surface'), top = world.bandOf('topsoil');
  const seam = sur.origin.y + world.heightPx(sur);
  const carved = seamCarve(sur, TX, 44, sur.th - 1) && seamCarve(top, TX, 0, 15);

  player.write.spawn(sur, TX, 53);                 // box top at y 744, one tile up
  const r = seamRun(90, +1);

  if (!carved) fail('BAND SEAM (fall): the probe failed to carve its own shaft, so the claim is vacuous');
  else if (r.dead) fail(`BAND SEAM (fall): the player died mid-crossing (${run.run.deathCause})`);
  else if (r.band !== 'topsoil' || !(r.y > seam + 32))
    fail(`BAND SEAM (fall): after 90 substeps of free fall down a cleared shaft the player is in ` +
         `"${r.band}" at y ${r.y.toFixed(2)} — expected topsoil, at least 4 tiles past the seam at ` +
         `${seam}. A shaft that ends AT the seam is the reported bug: reband's two leading-edge tests ` +
         `are both true across the straddle, so the band flips every frame and the band the player is ` +
         `not in answers BEDROCK for half the hitbox`);
  else if (r.flips !== 1)
    fail(`BAND SEAM (fall): ${r.flips} band changes crossing one seam — a crossing is one handoff, and ` +
         `${r.flips > 1 ? 'anything more is reband arguing with itself frame by frame' : 'zero means it never happened'}`);
  else if (r.worstBack !== 0)
    fail(`BAND SEAM (fall): the player moved UP ${r.worstBack.toFixed(3)} px during a free fall across ` +
         `the seam. Nothing was landed on; that is the phantom-bedrock snap`);
  else
    ok(`BAND SEAM (fall): free fall crosses surface -> topsoil in 1 handoff, ${(r.y - seam).toFixed(0)} px ` +
       `past the seam, 0 px of upward motion`);
}

/* Claim 2: the seam is still a floor when there is rock under it -- probing the
   band below must not turn an undug boundary into a hole. The rock is written
   and not found: a ragged carve may leave topsoil's row 0 open on some seed. */
{
  const SEED = 4242, TX = 20;
  boot.newRun(SEED);
  const sur = world.bandOf('surface'), top = world.bandOf('topsoil');
  const seam = sur.origin.y + world.heightPx(sur);
  const carved = seamCarve(sur, TX, 44, sur.th - 1);
  tiles.write.set(top, TX, 0, D_sub.S.stone);
  tiles.write.set(top, TX + 1, 0, D_sub.S.stone);

  player.write.spawn(sur, TX, 53);
  const r = seamRun(60, +1);

  /* Within a pixel of flush, and the slack is not about seams: a body at rest
     re-integrates gravity every substep and `moveY` blocks only once the box
     overlaps the floor, so any stance creeps 0.8 px down and snaps back. */
  const flush = seam - player.PH;
  if (!carved) fail('BAND SEAM (floor): the probe failed to carve its own shaft, so the claim is vacuous');
  else if (!r.ground || !(r.y >= flush && r.y < flush + 1))
    fail(`BAND SEAM (floor): with solid stone in topsoil row 0 the player came to rest at y ` +
         `${r.y.toFixed(3)} (onGround ${r.ground}), expected within a pixel of flush at ${flush}. The ` +
         `band below is real rock and must stop a fall exactly as any other tile does`);
  else if (r.band !== 'surface')
    fail(`BAND SEAM (floor): standing flush ON the seam put the player in "${r.band}" — the hitbox ` +
         `centre is 8 px above the boundary, so the band is surface until they are half through it`);
  else
    ok(`BAND SEAM (floor): undug rock below a seam still stops a fall flush at ${r.y.toFixed(2)}, in ` +
       `surface, and mining it is still what opens the way down`);
}

/* Claim 3: a ladder climbs back out of topsoil through the same seam. A
   constant-velocity climb has no snaps in it at all, so `worstBack` is exact
   here too and a stalled handoff shows up as a 0.25 px slip. */
{
  const SEED = 4242, TX = 20;
  boot.newRun(SEED);
  const sur = world.bandOf('surface'), top = world.bandOf('topsoil');
  const seam = sur.origin.y + world.heightPx(sur);
  const carved = seamCarve(sur, TX, 40, sur.th - 1) && seamCarve(top, TX, 0, 15);
  seamLadder(sur, TX, 44, sur.th - 1);
  seamLadder(top, TX, 0, 12);

  player.write.spawn(top, TX, 5);                  // box top at y 808, 7 tiles down
  const goal = seam - player.PH - 8;               // a whole tile clear of the seam, in surface
  const steps = climbSteps(player.player.y - goal);
  const r = seamRun(steps, -1, { up: true });

  if (!carved) fail('BAND SEAM (climb): the probe failed to carve its own shaft, so the claim is vacuous');
  else if (r.band !== 'surface' || !(r.y < goal))
    fail(`BAND SEAM (climb): after ${steps} substeps of climbing the player is in "${r.band}" at y ` +
         `${r.y.toFixed(2)} — expected surface, above ${goal}. A ladder that cannot ` +
         `leave the band it starts in is the same seam bug from underneath`);
  else if (r.flips !== 1)
    fail(`BAND SEAM (climb): ${r.flips} band changes climbing across one seam, expected 1`);
  else if (r.worstBack !== 0)
    fail(`BAND SEAM (climb): the climber slipped DOWN ${r.worstBack.toFixed(3)} px while holding up on a ` +
         `continuous ladder — the upper band's phantom bedrock ceiling`);
  else
    ok(`BAND SEAM (climb): a ladder crosses topsoil -> surface in 1 handoff, no slip, ending ` +
       `${(seam - r.y).toFixed(0)} px above the seam`);
}

/* Claim 4: a diagonal staircase crosses it too, by another code path -- the
   player is walking, so `onGround` is true every other frame and `moveX`'s
   auto-step is live. No `worstBack` bound: every tread lands. */
{
  const SEED = 4242;
  boot.newRun(SEED);
  const sur = world.bandOf('surface');
  const seam = sur.origin.y + world.heightPx(sur);

  /* Rows in absolute world pixels through `model/world.js#bandAt`, because a
     staircase across a seam cannot be written in one band's rows: the tread whose
     floor is topsoil row 0 has its headroom in surface rows 54 and 55. */
  const clearAt = (tx, wy) => {
    const b = world.bandAt(world.worldX(sur, tx), wy);
    if (!b) return false;
    const ty = world.tileY(b, wy);
    tiles.write.clear(b, tx, ty);
    return !tiles.solidAt(b, tx, ty);
  };

  /* 16 treads descending one row per column, each with two rows of headroom over
     whatever rock is under it. The seam falls on tread 9, so the last six are
     entirely inside topsoil: the claim is that the descent continues past it. */
  const TREADS = 16, TX0 = 24, TOP = world.worldY(sur, 47);
  let carved = true;
  for (let i = 0; i < TREADS; i++)
    for (let dx = 0; dx <= 1; dx++)
      for (let up = 1; up <= 2; up++)
        carved = clearAt(TX0 + i + dx, TOP + i * sur.tile - up * sur.tile) && carved;

  player.write.spawn(sur, TX0, 45);
  const r = seamRun(1100, +1, { right: true });

  if (!carved) fail('BAND SEAM (diagonal): the probe failed to carve its own staircase, so the claim is vacuous');
  else if (r.dead) fail(`BAND SEAM (diagonal): the player died mid-crossing (${run.run.deathCause})`);
  else if (r.band !== 'topsoil' || !(r.y >= seam + 24))
    fail(`BAND SEAM (diagonal): walking down a diagonal staircase left the player in "${r.band}" at y ` +
         `${r.y.toFixed(2)} — expected topsoil, at least 3 tiles past the seam at ${seam}. This is the shape in the bug ` +
         `report: the descent stalls at the seam and the auto-step then walks them back UP the diagonal`);
  else if (r.flips !== 1)
    fail(`BAND SEAM (diagonal): ${r.flips} band changes walking across one seam, expected 1`);
  else
    ok(`BAND SEAM (diagonal): a diagonal staircase crosses surface -> topsoil in 1 handoff, ` +
       `${(r.y - seam).toFixed(0)} px past the seam`);
}

/* Claim 5: the other seam, both ways -- astral/surface at y 320. Not a
   duplicate of the claims above: each of those leaves out one direction, and a
   seam fix is either general or about one seam. */
{
  const SEED = 4242, TX = 20;
  boot.newRun(SEED);
  const ast = world.bandOf('astral'), sur = world.bandOf('surface');
  const seam = ast.origin.y + world.heightPx(ast);
  /* Through the astral floor slab (rows 30..39) and down into surface's sky. */
  const carved = seamCarve(ast, TX, 30, ast.th - 1) && seamCarve(sur, TX, 0, 24);
  seamLadder(ast, TX, 30, ast.th - 1);
  seamLadder(sur, TX, 0, 12);

  player.write.spawn(sur, TX, 4);                  // box top at y 352, 4 tiles below
  /* The handoff is on the hitbox centre (claim 2), so that is the height the
     climb has to buy before the band can flip. */
  const upSteps = climbSteps(player.player.y - (seam - player.PH / 2));
  const up = seamRun(upSteps, -1, { up: true });

  boot.newRun(SEED);
  const ast2 = world.bandOf('astral'), sur2 = world.bandOf('surface');
  seamCarve(ast2, TX, 30, ast2.th - 1);
  seamCarve(sur2, TX, 0, 24);
  player.write.spawn(ast2, TX, 35);                // box top at y 280, 3 tiles above
  const down = seamRun(90, +1);

  if (!carved) fail('BAND SEAM (astral): the probe failed to carve its own shaft, so the claim is vacuous');
  else if (up.band !== 'astral' || up.flips !== 1 || up.worstBack !== 0)
    fail(`BAND SEAM (astral, up): ${upSteps} substeps of climbing surface -> astral ended in ` +
         `"${up.band}" at y ` +
         `${up.y.toFixed(2)} with ${up.flips} band change(s) and ${up.worstBack.toFixed(3)} px of slip ` +
         `— expected astral, 1 change, 0 slip. CLAUDE.md D5 puts the Cloud Dock at the top of this ` +
         `shaft; a seam that cannot be climbed is a destination that cannot be reached`);
  else if (down.band !== 'surface' || down.flips !== 1 || down.worstBack !== 0 || !(down.y > seam + 32))
    fail(`BAND SEAM (astral, down): falling astral -> surface ended in "${down.band}" at y ` +
         `${down.y.toFixed(2)} with ${down.flips} band change(s) and ${down.worstBack.toFixed(3)} px of ` +
         `upward motion — expected surface, at least 4 tiles past the seam at ${seam}, 1 change, 0 up. ` +
         `The fall off the dock IS the fence in D5, and a phantom floor at the seam is a safety net`);
  else
    ok(`BAND SEAM (astral): the surface/astral seam crosses cleanly in both directions — up to y ` +
       `${up.y.toFixed(0)}, down to y ${down.y.toFixed(0)}, 1 handoff each, 0 px against travel`);
}

console.log('\n8i. THE FEED VERB');
{
  /* One press, one unit, and the measurement is a difference between two
     identical scenes, so an automatic proximity drain would cancel out of it. */
  const SEED = 9160;
  let bad = 0;

  const feedScene = (defIdx) => {
    boot.newRun(SEED);
    const band = world.bandOf('topsoil');
    for (let ty = 110; ty <= 119; ty++)
      for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);
    const m = footUnder(machs.write.place(band, defIdx, 22, 117));
    player.write.band(band);
    /* 6 px of clear air between the player's right edge and the machine's left
       edge: PW is 6, so the box left sits one tile-width minus 12 px shy of the
       footprint. Inside `handFeed.reach` (10 px) either way. */
    player.write.move(world.worldX(band, 22) - 12, world.worldY(band, 117));
    player.write.vel(0, 0);
    player.write.set('onGround', true);
    input.cmd.mx = m.box.x + m.box.w / 2;
    input.cmd.my = m.box.y + m.box.h / 2;
    return { band, m };
  };

  const gap = m => Math.round(m.box.x - (player.player.x + player.PW));

  /* Baseline: the same frame, the same seed, no intent. */
  const base = feedScene(D_mach.M.altar);
  run.write.collect(D_sub.S.copper, D_form.F.ore, 3);
  frameReal(1 / 120, { hasMouse: true });
  const drained = 3 - run.invCount(D_sub.S.copper, D_form.F.ore);

  /* The verb: identical, plus an armed pair and one edge-triggered press. */
  const fed = feedScene(D_mach.M.altar);
  run.write.collect(D_sub.S.copper, D_form.F.ore, 3);
  shellUi.armPlace(D_sub.S.copper, D_form.F.ore);
  frameReal(1 / 120, { hasMouse: true, feed: true });
  const total = 3 - run.invCount(D_sub.S.copper, D_form.F.ore);
  const armedAfter = shellUi.ui.armedPlace;

  if (total - drained !== 1) {
    fail(`FEED VERB: one cmd.feed press ${gap(fed.m)} px from a 2x2 altar with 3 copper/ore held and ` +
         `the pair armed moved ${total} unit(s) out of the pockets, against ${drained} in the ` +
         `identical frame with no press -- the verb's own contribution is ${total - drained}, want ` +
         `exactly 1`);
    bad++;
  } else {
    console.log(`  ..  one press ${gap(fed.m)} px from the altar moved exactly 1 unit ` +
                `(${total} total against a ${drained}-unit proximity baseline)`);
  }
  if (!armedAfter || armedAfter.sub !== D_sub.S.copper || armedAfter.form !== D_form.F.ore) {
    fail(`FEED VERB: the armed pair after a SUCCESSFUL feed is ${JSON.stringify(armedAfter)} -- it must ` +
         `survive, so ten ore into an altar is one continuous action; the ` +
         `staleness sweep in shell/main.js#applyIntents is what clears it when the last unit is gone`);
    bad++;
  } else {
    console.log('  ..  the arm survived a successful feed, as one-unit-per-press requires');
  }

  /* Refusal 1 -- wrong material, through the same `cmd.feed` the shell sets but
     from a state `shell/input.js` would never dispatch from, since it tests
     `feedCheck` first. The string and its precedence belong to `rules`/`model`. */
  const wrong = feedScene(D_mach.M.altar);
  run.write.collect(D_sub.S.timber, D_form.F.rung, 2);
  shellUi.armPlace(D_sub.S.timber, D_form.F.rung);
  journal.write.drain();
  frameReal(1 / 120, { hasMouse: true, feed: true });
  const wrongWhy = journal.write.drain()
    .filter(r => r.kind === 'refused').map(r => r.data?.why);
  const rungsLeft = run.invCount(D_sub.S.timber, D_form.F.rung);
  if (!wrongWhy.includes('IT DOES NOT WANT THAT') || rungsLeft !== 2) {
    fail(`FEED VERB (wrong material): feeding a timber/rung to an altar (which takes ore, refined and ` +
         `gravel) pushed refusals ${JSON.stringify(wrongWhy)} and left ${rungsLeft} rung(s) held -- want ` +
         `'IT DOES NOT WANT THAT' and 2`);
    bad++;
  } else {
    console.log(`  ..  a rung at the ${D_mach.MACH[wrong.m.def].id}: 'IT DOES NOT WANT THAT', nothing spent`);
  }

  /* Refusal 2 -- right material, no room. A furnace and not the altar, because
     `drainReceivers` empties a tribute receiver's buffer the same frame it fills.
     A kiln with no fuel runs no recipe, so a full ore buffer stays full. */
  const cap = machs.capOf(D_mach.MACH[D_mach.M.kiln], '*/#ore');
  const fullM = feedScene(D_mach.M.kiln);
  machs.write.take(fullM.m, D_sub.S.copper, D_form.F.ore, cap);
  run.write.collect(D_sub.S.copper, D_form.F.ore, 3);
  shellUi.armPlace(D_sub.S.copper, D_form.F.ore);
  journal.write.drain();
  frameReal(1 / 120, { hasMouse: true, feed: true });
  const fullWhy = journal.write.drain()
    .filter(r => r.kind === 'refused').map(r => r.data?.why);
  const oreLeft = run.invCount(D_sub.S.copper, D_form.F.ore);
  if (!fullWhy.includes('IT IS FULL') || oreLeft !== 3) {
    fail(`FEED VERB (full): feeding copper/ore to a kiln already holding ${cap}/${cap} ore pushed ` +
         `refusals ${JSON.stringify(fullWhy)} and left ${oreLeft} ore held -- want 'IT IS FULL' and 3 `);
    bad++;
  } else {
    console.log(`  ..  ore at a ${cap}/${cap} kiln: 'IT IS FULL', nothing spent`);
  }

  /* Precedence: the same full furnace, the wrong material. Both refusals are
     true at once, and the material is the one said -- a player holding a rung
     does not care that a buffer they could never fill is full. */
  const bothM = feedScene(D_mach.M.kiln);
  machs.write.take(bothM.m, D_sub.S.copper, D_form.F.ore, 8);
  run.write.collect(D_sub.S.timber, D_form.F.rung, 2);
  shellUi.armPlace(D_sub.S.timber, D_form.F.rung);
  journal.write.drain();
  frameReal(1 / 120, { hasMouse: true, feed: true });
  const bothWhy = journal.write.drain()
    .filter(r => r.kind === 'refused').map(r => r.data?.why);
  if (!bothWhy.includes('IT DOES NOT WANT THAT') || bothWhy.includes('IT IS FULL')) {
    fail(`FEED VERB (precedence): a rung at a full furnace pushed ${JSON.stringify(bothWhy)} -- want ` +
         `'IT DOES NOT WANT THAT' and NOT 'IT IS FULL', in that order`);
    bad++;
  } else {
    console.log('  ..  a rung at a full furnace says the material, not the room -- the locked order');
  }

  /* The proximity drain is off, asserted rather than assumed: standing near an
     altar with no press must drain 0 units. The difference assertion above holds
     either way, since one press is worth one unit more than doing nothing. */
  if (drained !== 0) {
    fail(`FEED VERB (baseline): a player standing ${gap(base.m)} px from an altar with 3 copper/ore and ` +
         `NO press lost ${drained} unit(s) in one substep, not 0 -- rules/machines.js#handFeed must run ` +
         `ONLY when cmd.autoFeed is set, and shell/ui.js#ui.autoFeed defaults to false`);
    bad++;
  }

  if (!bad)
    ok('FEED VERB: one cmd.feed press hands over exactly ONE unit (measured as a difference against a ' +
       'now-zero proximity baseline), the arm survives it, and the two refusal strings fire in ' +
       'the locked refusal order');
}

/* Standing still costs nothing: two seconds, a player 4 px from an altar that
   accepts exactly what they carry, ten copper ore in the pockets and no input
   at all. 4 px is well inside the 10 px `handFeed.reach` under test. */
console.log('\n8j. STANDING STILL COSTS NOTHING');
{
  let bad = 0;
  const N = 240;                                  // substeps; two seconds at 1/120

  /* One scene builder, run twice with the flag in each state, so nothing but
     the flag can differ between the two readings. */
  const standScene = () => {
    boot.newRun(9170);
    const band = world.bandOf('topsoil');
    for (let ty = 110; ty <= 119; ty++)
      for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);
    const m = footUnder(machs.write.place(band, D_mach.M.altar, 22, 117));
    player.write.band(band);
    /* 4 px of clear air between the player's right edge and the footprint:
       PW is 6, so the box left is the footprint minus 10. */
    player.write.move(m.box.x - 4 - player.PW, world.worldY(band, 117));
    player.write.vel(0, 0);
    player.write.set('onGround', true);
    run.write.collect(D_sub.S.copper, D_form.F.ore, 10);
    return { band, m };
  };

  /* The claim: auto feed off. */
  const off = standScene();
  const offGap = Math.round(off.m.box.x - (player.player.x + player.PW));
  runReal(N, 1 / 120, { hasMouse: false });
  const offHeld = run.invCount(D_sub.S.copper, D_form.F.ore);
  const offBuf = machs.count(off.m, '*/#ore');

  /* The teeth: the identical scene, the flag on, nothing else touched. */
  standScene();
  shellUi.setAutoFeed(true);
  runReal(N, 1 / 120, { hasMouse: false });
  const onHeld = run.invCount(D_sub.S.copper, D_form.F.ore);
  shellUi.setAutoFeed(false);

  if (offHeld !== 10 || offBuf !== 0) {
    fail(`STANDING STILL: ${N} substeps ${offGap} px from an altar that accepts copper/ore, with ` +
         `AUTO FEED off and no input at all, left ${offHeld} ore in the pockets (want 10, untouched) ` +
         `and ${offBuf} in the altar's buffer (want 0) -- rules/machines.js#handFeed ran without ` +
         `cmd.autoFeed, or something else is reaching into run.inv`);
    bad++;
  }
  if (onHeld !== 0) {
    fail(`STANDING STILL (anti-hollow): the IDENTICAL scene with setAutoFeed(true) left ${onHeld} ore ` +
         `in the pockets (want 0, magnet took the lot) -- so the pass above proves nothing: this scene ` +
         `cannot feed the altar even when the magnet is ON, and the assertion is hollow`);
    bad++;
  }
  if (!bad)
    ok(`STANDING STILL COSTS NOTHING: ${N} substeps ${offGap} px from a feed-capable altar with 10 ore ` +
       `held and no input leaves all 10 held and its buffer empty -- and the same scene with AUTO FEED ` +
       `ON loses every one of them, so the claim has teeth`);
}

/* `model/run.js#write.collect` allocates a brand-new pair into the quickbar's
   tail before the main grid, so the order the strip fills in is a behavioural
   contract and not a display detail. */
console.log('\n8k. THE QUICKBAR FILLS FIRST');
{
  let bad = 0;
  const QUICK = run.run.inv.length - run.run.mainSlots;

  /* A flat floor, the player standing on it, nothing else in the room -- a
     machine would catch the very items this probe wants pocketed. */
  const room = seed => {
    boot.newRun(seed);
    const band = world.bandOf('topsoil');
    for (let ty = 110; ty <= 118; ty++)
      for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);
    player.write.band(band);
    player.write.move(world.worldX(band, 22), world.worldY(band, 117));
    player.write.vel(0, 0);
    player.write.set('onGround', true);
    runReal(30, 1 / 120, { hasMouse: false });          // settle onto the floor
    return band;
  };

  /* Spawn one item at the player's own centre and hold collect until it is gone.
     90 substeps is 0.75 s, past `rules/items.js`'s 0.35 s magnet delay. Returns
     the slot index it landed in, or -1. */
  const pocket = (band, sub, form) => {
    const c = player.playerCentre();
    items.write.spawn(band, c.x, c.y, sub, form, 0, 0);
    runReal(90, 1 / 120, { collect: true, hasMouse: false });
    return run.run.inv.findIndex(s => s && s.sub === sub && s.form === form);
  };

  /* Every pocketable pair except `brand`, which burns down while held and
     would free a slot mid-probe. That exclusion is what makes it the pair the
     bag overflows with below: a refused pickup is never held. A `relic` is
     worn rather than pocketed, so it never reaches `run.inv` at all. */
  const ALL = [];
  for (const sub of Object.keys(D_sub.SUB))
    for (const form of Object.keys(D_form.FORM))
      if (D_form.crossable(+sub, +form) && +form !== D_form.F.brand && +form !== D_form.F.relic)
        ALL.push([+sub, +form]);

  /* Fill order: the strip first, left to right, then slot 0 of the bag. */
  {
    const band = room(7717);
    const want = QUICK + 1;
    const landed = [];
    let mainStillEmpty = true;
    for (let i = 0; i < want; i++) {
      const [sub, form] = ALL[i];
      landed.push(pocket(band, sub, form));
      if (i === QUICK - 1)
        mainStillEmpty = run.run.inv.slice(0, run.run.mainSlots).every(s => s === null);
    }
    const wantSlots = landed.map((_, i) => i < QUICK ? run.run.mainSlots + i : 0);
    if (landed.some(i => i === -1)) {
      fail(`QUICKBAR FILL: ${landed.filter(i => i === -1).length} of ${want} items were never pocketed ` +
           `at all -- the scene is wrong, not the fill order`);
      bad++;
    } else if (landed.join() !== wantSlots.join()) {
      fail(`QUICKBAR FILL: ${want} distinct pairs picked up one at a time landed in slots ` +
           `[${landed}], want [${wantSlots}] -- the first ${QUICK} fill the quickbar's tail left to ` +
           `right and only the next one reaches the main grid`);
      bad++;
    } else if (!mainStillEmpty) {
      fail(`QUICKBAR FILL: the main grid already held something after ${QUICK} pickups -- every one of ` +
           `them must be in the quickbar's tail before slot 0 of the bag takes anything`);
      bad++;
    } else {
      ok(`QUICKBAR FILL: ${QUICK} distinct pairs picked up through the real item path land in quickbar ` +
         `cells 0..${QUICK - 1} left to right with the main grid untouched, and the ${want}th lands in ` +
         `main slot 0`);
    }
  }

  /* Merge-first outranks the fill order. */
  {
    const band = room(7718);
    const [sub, form] = [D_sub.S.copper, D_form.F.ore];
    run.write.collect(sub, form, 1);
    run.write.moveSlot(run.run.inv.findIndex(s => s && s.sub === sub && s.form === form), 3);
    const at = pocket(band, sub, form);
    const quickEmpty = run.run.inv.slice(run.run.mainSlots).every(s => s === null);
    if (at !== 3 || run.run.inv[3].n !== 2 || !quickEmpty) {
      fail(`MERGE FIRST: a second copper/ore collected while one already sat in MAIN slot 3 landed in ` +
           `slot ${at} holding ${run.run.inv[3]?.n} unit(s), quickbar empty ${quickEmpty} -- want slot 3, ` +
           `2 units, quickbar untouched: the whole-array merge search runs before any allocation`);
      bad++;
    } else {
      ok('MERGE FIRST: a pair already held in a MAIN slot tops that slot up, rather than allocating a ' +
         'quickbar cell -- the merge search still precedes the fill order');
    }
  }

  /* Every slot full: refused, and the ground keeps it. */
  {
    const band = room(7719);
    mods.write.add('phase17i-capacity', [{ key: 'burden', mul: 100 }]);
    const cap = run.run.inv.length;

    /* Relics leaving the pockets took the pair count below the slot count, so
       distinct pairs can no longer fill the bag: `collect`'s refusal is a
       guard against content growing, not a condition play reaches. The bag is
       therefore filled directly, with a pair the overflow item is not. */
    for (let i = 0; i < cap; i++)
      run.run.inv[i] = { sub: D_sub.S.copper, form: D_form.F.ore, n: 1 };

    const full = run.run.inv.every(s => s !== null);
    const sub = D_sub.S.timber, form = D_form.F.brand;
    const before = journal.peek().length;
    const at = pocket(band, sub, form);
    const rows = journal.peek().slice(before)
      .filter(j => j.kind === 'refused' && j.data?.why === 'INVENTORY FULL');
    const onGround = items.items.some(it => it.sub === sub && it.form === form);
    mods.write.removeBySource('phase17i-capacity');

    if (!full) {
      fail(`INVENTORY FULL: the bag holds ${run.run.inv.filter(s => s !== null).length} of ${cap} ` +
           `slots -- it cannot prove a refusal it never reached`);
      bad++;
    } else if (at !== -1 || !onGround || !rows.length) {
      fail(`INVENTORY FULL: with all ${cap} slots taken, a ${D_form.labelOf(sub, form)} under the player landed in slot ` +
           `${at} (want -1), left on the ground ${onGround} (want true), 'INVENTORY FULL' rows ${rows.length} ` +
           `(want at least 1) -- a refused pickup must survive as an item`);
      bad++;
    } else {
      ok(`INVENTORY FULL: all ${cap} slots taken, the next pickup is refused through rules/items.js#step ` +
         `with one 'INVENTORY FULL' journal row, and the item is still lying on the ground ` +
         `(${ALL.length} pocketable pairs against ${cap} slots, so play does not reach this)`);
    }
  }

  if (bad) fail(`QUICKBAR: ${bad} of 3 fill-order probes failed`);
}

/* The draft: the offer, the pause and the price, all of it through `main.step`
   and `main.applyIntents`. */
console.log('\n8l. THE DRAFT: the offer, the pause and the price');
{
  let bad = 0;
  const SIZE = Math.max(0, Math.round(mods.eff('offerSize')));
  const PRICE = Math.max(0, Math.round(mods.eff('rerollCost')));
  const BOON_IDS = D_boon.BOONS.map(b => b.id);

  /* `newRun` clears the model and leaves `shell/ui.js#ui.stack` alone, while the
     modal's staleness sweep lives in `applyIntents`, so one intent pass after a
     reset drops a modal the previous probe left standing. */
  const freshRun = seed => { boot.newRun(seed); main.applyIntents(); };

  const raiseBoon = () => { input.wants.draft = 'boon'; frameReal(1 / 120, { hasMouse: false }); };
  const idsNow = () => (run.run.offer?.ids ?? []).join(',');
  const refusals = from => journal.peek().slice(from).filter(r => r.kind === 'refused');

  /* Claim 1: an offer is `eff('offerSize')` distinct rows of the tier, and it is
     the seed's. The third fact is what stops the other two passing over a
     constant: `pool.slice(0, 3)` satisfies both, and only a seed sweep sees it. */
  {
    const offers = new Set();
    let why = '';
    for (let s = 0; s < 40 && !why; s++) {
      const seed = 9760 + s;
      freshRun(seed);
      raiseBoon();
      const o = run.run.offer;
      const ids = o?.ids ?? [];
      if (!o || o.tier !== 'boon' || !o.ids)
        why = `seed ${seed} raised ${JSON.stringify(o)} -- want a laid-out 'boon' offer`;
      else if (ids.length !== SIZE)
        why = `seed ${seed} laid out ${ids.length} card(s) [${ids}], want eff('offerSize') = ${SIZE}`;
      else if (new Set(ids).size !== ids.length)
        why = `seed ${seed} laid out [${ids}], which repeats a row`;
      else if (ids.some(id => !BOON_IDS.includes(id)))
        why = `seed ${seed} laid out [${ids}], and data/boons.js holds [${BOON_IDS}]`;
      else if (o.pool !== BOON_IDS.length)
        why = `seed ${seed} recorded pool ${o.pool}, want the ${BOON_IDS.length} candidates ` +
              `rules/boons.js#draftable offered -- 'THIS IS ALL THERE IS' is decided on this number`;
      offers.add(ids.join(','));
    }

    freshRun(9760); raiseBoon(); const first = idsNow();
    freshRun(9760); raiseBoon(); const again = idsNow();

    if (why) {
      fail(`DRAFT OFFER: ${why}`);
      bad++;
    } else if (first !== again) {
      fail(`DRAFT OFFER: seed 9760 laid out [${first}] and then [${again}] -- an offer is drawn from ` +
           `the run's own stream and two runs of one seed must agree`);
      bad++;
    } else if (offers.size < 2) {
      fail(`DRAFT OFFER: all 40 seeds laid out the same [${first}] -- the selection is not reading ` +
           `rand() at all, and the same-seed check above would pass over a constant`);
      bad++;
    } else {
      ok(`DRAFT OFFER: ${SIZE} distinct data/boons.js rows per offer over 40 seeds, ${offers.size} ` +
         `different offers among them, and seed 9760 lays out [${first}] both times`);
    }
  }

  /* Claim 2: the modal freezes the run and the run resumes where it stopped.
     Measured on a falling item, since a substep that does not run is invisible
     unless something was mid-flight; the control is the same seed unfrozen. */
  {
    const SEED = 9800, HELD = 60;
    const airborne = () => {
      const c = player.playerCentre();
      return items.write.spawn(player.player.band, c.x, c.y - 40,
                               D_sub.S.copper, D_form.F.ore, 0, 0);
    };

    freshRun(SEED);
    runReal(30, 1 / 120, { hasMouse: false });
    const ctl = airborne();
    stepReal(1 / 120, { hasMouse: false });            // the step `raiseBoon` also runs
    const ctlFrom = ctl.y;
    runReal(HELD, 1 / 120, { hasMouse: false });
    const ctlFell = ctl.y - ctlFrom;

    freshRun(SEED);
    runReal(30, 1 / 120, { hasMouse: false });
    const it = airborne();
    raiseBoon();
    const at = { y: it.y, vy: it.vy, t: main.clock.t, runT: run.run.t, frame: main.clock.frame };
    const paused = shellUi.pausesRun() && shellUi.isOpen('draft');
    for (let i = 0; i < HELD; i++) frameReal(1 / 120, { hasMouse: false });
    const held = { y: it.y, vy: it.vy, t: main.clock.t, runT: run.run.t, frame: main.clock.frame };

    input.wants.takeCard = 0;
    main.applyIntents();
    const closed = !run.run.offer && !shellUi.isOpen('draft');
    runReal(HELD, 1 / 120, { hasMouse: false });
    const resumedFell = it.y - at.y;

    if (!paused || ctlFell <= 4) {
      fail(`DRAFT PAUSE: the SETUP failed -- the modal stands = ${paused} (want true) and the ore ` +
           `fell ${ctlFell.toFixed(3)} px in ${HELD} unfrozen substeps (want > 4). A scene where ` +
           `nothing was moving cannot show a freeze`);
      bad++;
    } else if (held.y !== at.y || held.vy !== at.vy || held.runT !== at.runT ||
               held.t !== at.t || held.frame !== at.frame) {
      fail(`DRAFT PAUSE: ${HELD} real frames with the modal up moved the ore ` +
           `${(held.y - at.y).toFixed(3)} px, its vy by ${(held.vy - at.vy).toFixed(3)}, run.t by ` +
           `${(held.runT - at.runT).toFixed(4)} s and clock.frame by ${held.frame - at.frame} -- a ` +
           `draft freezes the run outright`);
      bad++;
    } else if (!closed) {
      fail(`DRAFT PAUSE: taking card 0 left run.offer = ${JSON.stringify(run.run.offer)} and the ` +
           `modal open = ${shellUi.isOpen('draft')} -- the one verb that ends the pause did not`);
      bad++;
    } else if (resumedFell !== ctlFell) {
      fail(`DRAFT PAUSE: after the card was taken the ore fell ${resumedFell.toFixed(4)} px in ` +
           `${HELD} substeps against ${ctlFell.toFixed(4)} px in the unfrozen control -- the freeze ` +
           `must suspend the simulation, not slow it or skip it forward`);
      bad++;
    } else {
      ok(`DRAFT PAUSE: ${HELD} real frames behind the modal move the falling ore 0 px and advance ` +
         `neither clock.t nor run.t, and it then falls the control's ${ctlFell.toFixed(3)} px in the ` +
         `same ${HELD} substeps once a card is taken`);
    }
  }

  /* Claim 3: the price and the two refusals, through the real director with
     three shipped trials paid in turn -- so the god who asks is the god whose
     favour a reroll spends, and neither the price nor the purse is written here. */
  {
    freshRun(9840);
    const payLive = () => {
      const row = D_cycles.CYCLE[run.run.tribute.id];
      const have = {};
      for (const d of row.demand) have[`${d.sub}/${d.form}`] = d.n;
      const credits = row.batch ? [{ t: run.run.t, n: row.batch.n }] : [];
      run.write.tribute({ ...run.run.tribute, have, credits });
      frameReal(1 / 120, { hasMouse: false });
    };
    const oneFrame = () => frameReal(1 / 120, { hasMouse: false });
    const takeCard = () => { input.wants.takeCard = 0; main.applyIntents(); };
    const reroll = () => { input.wants.reroll = true; main.applyIntents(); };

    oneFrame();                                   // cycle 1 arms
    payLive();                                    // ... and pays. No draft in its reward.
    oneFrame();                                   // cycle 2 arms
    /* No shipped tier is smaller than an offer, so the offer is widened past
       the tier instead -- through a real `offerSize` row, which is the same
       path a boon would bend it by. Removed before 3b, which needs a tier
       with cards to spare. */
    mods.write.add('draft-exhaust', [{ key: 'offerSize', mul: 3 }]);
    payLive();                                    // ... pays, and hephaestus lays one out

    /* 3a -- a tier with nothing spare refuses for that reason and not for the
       purse. Every candidate is on the table, so the pool cannot be larger
       than the cards. */
    const gOffer = run.run.offer;
    const gFav = run.run.favour.hephaestus ?? 0;
    const gIds = idsNow();
    const gFrom = journal.peek().length;
    reroll();
    const gRows = refusals(gFrom);

    const want2 = D_cycles.CYCLES[1].reward.draft;
    if (gOffer?.tier !== want2 || gOffer.god !== 'hephaestus' || !gOffer.ids?.length) {
      fail(`DRAFT REROLL (exhausted): paying cycle 2 raised ${JSON.stringify(gOffer)} -- want a ` +
           `laid-out '${want2}' offer asked by hephaestus, per data/cycles.js`);
      bad++;
    } else if (gOffer.ids.length < gOffer.pool) {
      fail(`DRAFT REROLL (exhausted): the offer shows ${gOffer.ids.length} of ${gOffer.pool} ` +
           `candidates, so the tier is NOT exhausted and a refusal here would prove nothing`);
      bad++;
    } else if (gFav < PRICE) {
      fail(`DRAFT REROLL (exhausted): hephaestus is owed ${gFav} favour against a ${PRICE} price, ` +
           `so a refusal here would be the purse and would prove nothing about the pool`);
      bad++;
    } else if ((run.run.favour.hephaestus ?? 0) !== gFav || idsNow() !== gIds) {
      fail(`DRAFT REROLL (exhausted): the refused reroll moved hephaestus' favour ${gFav} -> ` +
           `${run.run.favour.hephaestus} and the offer [${gIds}] -> [${idsNow()}] -- a refusal ` +
           `spends nothing and changes nothing`);
      bad++;
    } else if (gRows.length !== 1 || gRows[0].data?.why !== 'THIS IS ALL THERE IS') {
      fail(`DRAFT REROLL (exhausted): a reroll of a ${gOffer.pool}-candidate tier showing ` +
           `${gOffer.ids.length} cards pushed ${JSON.stringify(gRows.map(r => r.data?.why))} -- want ` +
           `exactly one 'THIS IS ALL THERE IS'`);
      bad++;
    } else {
      console.log(`  ..  the ${gOffer.tier} tier offers ${gOffer.ids.length} of ${gOffer.pool} and ` +
                  `refuses a reroll with 'THIS IS ALL THERE IS', hephaestus' ${gFav} favour untouched`);
    }

    mods.write.removeBySource('draft-exhaust');
    takeCard();
    oneFrame();                                   // cycle 3 arms
    payLive();                                    // ... pays, and athena lays out a boon offer

    /* 3b -- the price is exactly `eff('rerollCost')`, spent with the asker. */
    const bOffer = run.run.offer;
    const fav0 = run.run.favour.athena ?? 0;
    const ids0 = idsNow();
    reroll();
    const fav1 = run.run.favour.athena ?? 0;
    const spent = fav0 - fav1;
    const still = run.run.offer;

    if (bOffer?.tier !== 'boon' || bOffer.god !== 'athena' || fav0 < PRICE) {
      fail(`DRAFT REROLL (price): paying cycle 3 raised ${JSON.stringify(bOffer)} with athena owed ` +
           `${fav0} favour -- want a 'boon' offer asked by athena and at least the ${PRICE} price`);
      bad++;
    } else if (spent !== PRICE) {
      fail(`DRAFT REROLL (price): one reroll moved athena's favour ${fav0} -> ${fav1}, spending ` +
           `${spent} -- want exactly eff('rerollCost') = ${PRICE}`);
      bad++;
    } else if (still?.tier !== 'boon' || still.god !== 'athena' || still.pool !== bOffer.pool ||
               still.ids.length !== SIZE || new Set(still.ids).size !== SIZE) {
      fail(`DRAFT REROLL (price): the paid reroll turned [${ids0}] into ` +
           `${JSON.stringify(still)} -- a re-pick keeps the tier, the asker and the pool, and lays ` +
           `out ${SIZE} distinct cards again`);
      bad++;
    } else {
      /* 3c -- and it is a re-pick. The price alone would be paid by a reroll that
         redrew the identical three every time, so ten more must produce more than
         one set. */
      const before = run.run.favour.athena ?? 0;
      run.write.favour('athena', PRICE * 10);
      const sets = new Set([idsNow()]);
      for (let i = 0; i < 10; i++) { reroll(); sets.add(idsNow()); }
      const leftOver = (run.run.favour.athena ?? 0) - before;
      if (sets.size < 2) {
        fail(`DRAFT REROLL (re-pick): eleven offers of ${BOON_IDS.length} candidates were all ` +
             `[${idsNow()}] -- a reroll that charges for the same cards is not a reroll`);
        bad++;
      } else if (leftOver !== 0) {
        fail(`DRAFT REROLL (re-pick): ten rerolls off ${PRICE * 10} favour left ${leftOver} over -- ` +
             `every one must cost exactly ${PRICE}`);
        bad++;
      } else {
        /* 3d -- and a purse that cannot pay is told so. Athena is now at 0. */
        const pFav = run.run.favour.athena ?? 0;
        const pIds = idsNow();
        const pFrom = journal.peek().length;
        reroll();
        const pRows = refusals(pFrom);
        if (pFav >= PRICE) {
          fail(`DRAFT REROLL (short): athena still holds ${pFav} favour against a ${PRICE} price -- ` +
               `the scene never reached the refusal it means to test`);
          bad++;
        } else if ((run.run.favour.athena ?? 0) !== pFav || idsNow() !== pIds) {
          fail(`DRAFT REROLL (short): the refused reroll moved athena's favour ${pFav} -> ` +
               `${run.run.favour.athena} and the offer [${pIds}] -> [${idsNow()}]`);
          bad++;
        } else if (pRows.length !== 1 || pRows[0].data?.why !== 'NOT ENOUGH FAVOUR') {
          fail(`DRAFT REROLL (short): a reroll on ${pFav} favour pushed ` +
               `${JSON.stringify(pRows.map(r => r.data?.why))} -- want exactly one ` +
               `'NOT ENOUGH FAVOUR'`);
          bad++;
        } else {
          ok(`DRAFT REROLL: cycle 3's boon offer re-picks for exactly eff('rerollCost') = ${PRICE} ` +
             `favour of athena's, ${sets.size} distinct sets over eleven looks, and is then refused ` +
             `at ${pFav} favour with 'NOT ENOUGH FAVOUR' -- while cycle 2's 2-of-2 grant offer is ` +
             `refused with 'THIS IS ALL THERE IS' on a full purse`);
        }
      }
    }
    takeCard();
  }

  if (bad) fail(`DRAFT: ${bad} of 3 draft probes failed`);
}

/* The batch clause: a rolling window on simulated time. */
console.log('\n8m. THE BATCH CLAUSE: a rolling window on simulated time');
{
  const RATES = [20, 30, 60, 90, 107, 120, 144, 240];
  const ROW = D_cycles.CYCLES.find(c => c.batch);
  const N = D_cycles.CYCLES.indexOf(ROW) + 1;
  let bad = 0;
  const rows = [];

  if (!ROW) {
    fail('BATCH WINDOW: no shipped cycle carries a batch clause -- data/cycles.js and ' +
         'the batch rule disagree, and this section is testing nothing');
    bad++;
  }

  const SECS = ROW?.batch.secs ?? 0, WANT = ROW?.batch.n ?? 0;
  const PLATE = ROW ? [D_sub.S[ROW.batch.sub], D_form.F[ROW.batch.form]] : [0, 0];

  /* A dock on a real footing in `topsoil`, the player 6 px off its left edge, so
     the feed verb's reach gate counts this as standing beside it. The cycle is
     armed by moving `run.cycle` rather than by paying the trials in front of it. */
  const rig = (seed, dt) => {
    boot.newRun(seed);
    main.applyIntents();
    const band = world.bandOf('topsoil');
    for (let ty = 110; ty <= 119; ty++)
      for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
    for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);
    const m = footUnder(machs.write.place(band, D_mach.M.cloud_dock, 22, 118));
    player.write.band(band);
    player.write.move(world.worldX(band, 22) - 12, world.worldY(band, 117));
    player.write.vel(0, 0);
    player.write.set('onGround', true);
    run.write.cycle(N);
    stepReal(dt, { hasMouse: false });
    const have = {};
    for (const d of ROW.demand) have[`${d.sub}/${d.form}`] = d.n;
    run.write.tribute({ ...run.run.tribute, have, credits: [] });
    run.write.collect(PLATE[0], PLATE[1], WANT + 2);
    return m;
  };

  /* Step until `pred` holds and answer with the `run.t` it first did, never a
     reconstruction from frames x dt; NaN if it never held. Bounded by frames and
     not by `run.t`, since a won run or a modal returns without a clock tick. */
  const until = (pred, capSecs, dt) => {
    const cap = Math.ceil(capSecs / dt) + 2;
    for (let i = 0; i < cap; i++) {
      stepReal(dt, { hasMouse: false });
      if (pred()) return run.run.t;
    }
    return NaN;
  };

  for (const fps of RATES) {
    if (bad) break;
    const dt = 1 / fps;
    const m = rig(9880 + fps, dt);

    /* One plate, then wait for it to age out of the window. */
    if (feedByHand(m, PLATE[0], PLATE[1], 1, dt) !== 1) {
      fail(`BATCH WINDOW: at ${fps} fps the first feed press moved no ${D_form.labelOf(...PLATE)} ` +
           `into the dock -- the rig is wrong, not the clause`);
      bad++; break;
    }
    const landed = until(() => run.batchHave() >= 1, 2, dt);
    const aged = until(() => run.batchHave() === 0, SECS + 5, dt);
    if (!Number.isFinite(landed) || !Number.isFinite(aged)) {
      fail(`BATCH WINDOW: at ${fps} fps one plate credited at ${landed} and aged out at ${aged} ` +
           `(batchHave ${run.batchHave()}) -- a credit must both count and then stop counting`);
      bad++; break;
    }

    /* Three more, now that the first is surplus. Four plates have reached the dock
       and the flat demand was satisfied before any of them, so the trial is unpaid
       on the spacing alone. */
    const fed = feedByHand(m, PLATE[0], PLATE[1], WANT - 1, dt);
    until(() => run.batchHave() >= WANT - 1, 2, dt);
    const short = run.batchHave();
    const met = run.tributeMet();
    const demandMet = ROW.demand.every(d => run.tributeHave(d.sub, d.form) >= d.n);
    const stillArmed = run.run.cycle === N && run.run.tribute?.id === ROW.id;

    /* The bite is tested before the setup is, because a clause that pays too early
       clears `run.tribute` and every reading below it then reports an empty
       ledger, which reads like a broken rig and is not one. */
    if (met || !stillArmed) {
      fail(`BATCH WINDOW: at ${fps} fps, ${WANT} plates delivered with the first ` +
           `${(run.run.t - landed).toFixed(2)} s back -- more than the ${SECS} s window -- left ` +
           `run.cycle ${run.run.cycle} (want ${N}), tributeMet ${met} (want false) and batchHave ` +
           `${short}. The whole flat demand was credited before any of them, so a trial paid here ` +
           `is a window that does not bite`);
      bad++; break;
    }
    if (fed !== WANT - 1 || !demandMet || short !== WANT - 1) {
      fail(`BATCH WINDOW: at ${fps} fps the rig fed ${fed} of ${WANT - 1} plates, the flat demand ` +
           `is satisfied = ${demandMet} and batchHave reads ${short} of a wanted ${WANT - 1} -- the ` +
           `scene cannot isolate the clause`);
      bad++; break;
    }

    /* And the same four, bunched: one more press inside the window pays it. */
    const before = journal.peek().length;
    feedByHand(m, PLATE[0], PLATE[1], 1, dt);
    until(() => run.run.cycle > N, 2, dt);
    const paid = journal.peek().slice(before)
      .filter(r => r.kind === 'cycle' && r.data?.cycleId === ROW.id);
    if (run.run.cycle !== N + 1 || paid.length !== 1) {
      fail(`BATCH WINDOW: at ${fps} fps a ${WANT}th plate inside the window left run.cycle ` +
           `${run.run.cycle} (want ${N + 1}) and ${paid.length} '${ROW.id}' journal row(s) (want 1), ` +
           `batchHave ${run.batchHave()} of ${WANT}`);
      bad++; break;
    }
    rows.push({ fps, window: aged - landed, err: aged - landed - SECS });
  }

  if (!bad) {
    const worst = rows.reduce((a, r) => Math.abs(r.err) > Math.abs(a.err) ? r : a, rows[0]);
    const spread = Math.max(...rows.map(r => r.window)) - Math.min(...rows.map(r => r.window));
    console.log('  ..  measured window, one credit from landing to ageing out:');
    for (const r of rows)
      console.log(`      ${String(r.fps).padStart(3)} fps  ${r.window.toFixed(4)} s  ` +
                  `(${r.err >= 0 ? '+' : ''}${r.err.toFixed(4)} s)`);
    /* Bounded by the polling resolution and nothing else: `run.t` advances one
       `dt` per substep and this reads it after each, so a credit is first seen
       gone up to one frame late and never early. One frame at 20 fps is 0.05 s. */
    const early = rows.filter(r => r.err < -1e-9);
    const late = rows.filter(r => r.err > 1 / r.fps + 1e-6);
    if (early.length || late.length || spread > 1 / Math.min(...RATES) + 1e-6) {
      fail(`BATCH WINDOW: the measured window is ${worst.window.toFixed(4)} s at ${worst.fps} fps ` +
           `against batch.secs = ${SECS}, spreading ${spread.toFixed(4)} s across ` +
           `${RATES.join('/')} fps -- ${early.length} rate(s) closed the window early and ` +
           `${late.length} held it open more than their own frame past ${SECS} s. A window that ` +
           `moves with the framerate is not measured on run.t`);
      bad++;
    } else {
      ok(`BATCH WINDOW: '${ROW.id}' stays unpaid on ${WANT} plates spread wider than its ` +
         `${SECS} s window with the whole flat demand already credited, and pays on one more inside ` +
         `it -- at ${RATES.join('/')} fps, every delivery through the real feed verb, the window ` +
         `holding to ${SECS} s of run.t within ${Math.abs(worst.err).toFixed(4)} s (spread ` +
         `${spread.toFixed(4)} s)`);
    }
  }

  if (bad) fail('BATCH CLAUSE: the rolling window does not hold');
}

/* Every callout fits the narrowest buffer. `view/hud.js#bottomLine` clamps its
   panel to the viewport and then draws text inside it with no clip, so a row
   wider than the panel spills off the right edge at `BASE_W_MIN`. */
console.log('\n8n. EVERY CALLOUT FITS THE NARROWEST BUFFER (view/hud.js#bottomLine)');
{
  const { CALLOUTS } = await import('../src/data/callouts.js');
  const { calloutLines } = await import('../src/view/hud.js');
  const { BASE_W_MIN } = await import('../src/core/canvas.js');
  const { textWidth } = await import('../src/core/font.js');

  const inner = BASE_W_MIN - 4 - 12;
  const rows = CALLOUTS.map((t, i) => ({ i, t })).filter(r => r.t);
  const over = [];
  const wouldOverflow = [];
  let widest = 0;

  for (const r of rows) {
    if (textWidth(r.t) > inner) wouldOverflow.push(r.i);
    for (const line of calloutLines(r.t, BASE_W_MIN)) {
      const w = textWidth(line);
      if (w > widest) widest = w;
      if (w > inner) over.push(`${r.i} '${line}' ${w}px`);
    }
  }

  console.log(`  ..  ${rows.length} rows, widest wrapped line ${widest}px against a ` +
              `${inner}px budget at ${BASE_W_MIN}px; ${wouldOverflow.length} would overflow unwrapped`);

  if (over.length)
    fail(`CALLOUT FIT: ${over.length} line(s) exceed the ${inner}px budget at ` +
         `${BASE_W_MIN}px and would be drawn off the right edge -- ${over.join(', ')}`);
  else if (!wouldOverflow.length)
    fail(`CALLOUT FIT: every row already fits unwrapped at ${BASE_W_MIN}px, so this ` +
         `assertion proves nothing about the wrap. Either the content shrank or ` +
         `view/hud.js#calloutLines is no longer the budget the renderer uses`);
  else
    ok(`CALLOUT FIT: all ${rows.length} data/callouts.js rows wrap inside ${inner}px at the ` +
       `${BASE_W_MIN}px floor (widest line ${widest}px), and ${wouldOverflow.length} of them ` +
       `overflow it unwrapped -- so the wrap is load-bearing`);
}

console.log('\n8o. DAYLIGHT STOPS AT A SEAM');

/* Every seam in the world, as the two tile rows that touch across it, derived
   from `model/world.js#bandAbove` rather than from band ids. Columns are
   mapped through world x, so a differing `tile` or `origin.x` still lines up. */
function seamRows() {
  const out = [];
  for (const b of world.bands) {
    const a = world.bandAbove(b);
    if (a) out.push({ a, b });
  }
  return out;
}
const seamCols = (a, b, tx) => {
  const wx = world.worldX(b, tx) + b.tile / 2;
  return { atx: world.tileX(a, wx), aty: a.th - 1 };
};

/* Claim 1: light does not cross a seam for free. The level either side may
   differ by at most one tile of falloff, because a buried row 0 is seeded from
   the band above through the same `relax` cost as any other tile. */
{
  boot.newRun(1337);
  runReal(4, 1 / 120);
  const bound = mods.eff('lightFalloffRock');
  let checked = 0, bad = 0, worst = -1, worstAt = '';

  for (const { a, b } of seamRows()) {
    if (world.hasOwnSky(b)) continue;
    for (let tx = 0; tx < b.tw; tx++) {
      const { atx, aty } = seamCols(a, b, tx);
      if (!world.inBounds(a, atx, aty)) continue;
      const d = Math.abs(world.lightAt(a, atx, aty) - world.lightAt(b, tx, 0));
      checked++;
      if (d > worst) { worst = d; worstAt = `${a.id} ${atx},${aty} -> ${b.id} ${tx},0`; }
      if (d > bound) bad++;
    }
  }

  if (!checked)
    fail('SEAM LIGHT (no free crossing): no seam has a band with a buried row 0 below it, so this ' +
         'claim checked nothing -- either the band table changed or hasOwnSky no longer means what ' +
         'rules/light.js seeds by');
  else if (bad)
    fail(`SEAM LIGHT (no free crossing): ${bad} of ${checked} column(s) step by more than ` +
         `eff('lightFalloffRock') (${bound}) across a seam, worst ${worst} at ${worstAt}. Sky is ` +
         `being seeded into a band's own row 0 regardless of what the world above it holds`);
  else
    ok(`SEAM LIGHT (no free crossing): all ${checked} buried column(s) across the world's seams ` +
       `step by at most eff('lightFalloffRock') (${bound}), worst ${worst} at ${worstAt}`);
}

/* Claim 2: no band's row 0 is daylight unless `model/tiles.js#worldSkyAt`
   holds there. An implication over every band and column, so it binds at a dug
   shaft as well as at boot; the antecedent fires hundreds of times a run. */
{
  let bad = 0, daylight = 0, first = '';
  for (const seed of [1337, 4242, 9550]) {
    boot.newRun(seed);
    runReal(4, 1 / 120);
    const max = mods.eff('lightMax');
    for (const b of world.bands)
      for (let tx = 0; tx < b.tw; tx++) {
        if (world.lightAt(b, tx, 0) < max) continue;
        daylight++;
        if (tiles.worldSkyAt(b, tx, 0)) continue;
        bad++;
        if (!first) first = `seed ${seed}, ${b.id} column ${tx}`;
      }
  }

  if (!daylight)
    fail('SEAM LIGHT (row 0 daylight): no band reads eff(\'lightMax\') at row 0 in any of the three ' +
         'seeds, so the implication is vacuous -- the spawn band has lost its own sky');
  else if (bad)
    fail(`SEAM LIGHT (row 0 daylight): ${bad} of ${daylight} row-0 column(s) at eff('lightMax') have ` +
         `no path out of the world above them, first at ${first}. That is a band lit by nothing`);
  else
    ok(`SEAM LIGHT (row 0 daylight): all ${daylight} row-0 column(s) reading eff('lightMax') over ` +
       `three seeds have a clear path out of the world (model/tiles.js#worldSkyAt)`);
}

/* Claim 3: a crossing reveals a bounded neighbourhood. The shaft is carved
   from surface row 44 down and not from the sky, so `worldSkyAt` is false the
   whole way: Pass A never fires and every revealed tile is Pass B's. */
{
  const SEED = 4242, TX = 20, W = 2;
  boot.newRun(SEED);
  const sur = world.bandOf('surface'), top = world.bandOf('topsoil');
  const carved = seamCarve(sur, TX, 44, sur.th - 1, W) && seamCarve(top, TX, 0, 15, W);

  player.write.spawn(sur, TX, 45);
  const before = world.bands.map(b => b.seen.slice());

  let loY = Infinity, hiY = -Infinity;
  for (let i = 0; i < 150; i++) {
    stepReal(1 / 120, {});
    const box = player.playerBox();
    loY = Math.min(loY, box.y); hiY = Math.max(hiY, box.y + box.h - 1);
    if (run.run.dead) break;
  }

  const radius = mods.eff('sightRadius');
  let newly = 0, outside = 0, worstCol = 0, firstBad = '';
  world.bands.forEach((b, bi) => {
    const rowLo = world.tileY(b, loY) - radius, rowHi = world.tileY(b, hiY) + radius;
    for (let ty = 0; ty < b.th; ty++)
      for (let tx = 0; tx < b.tw; tx++) {
        const i = world.idx(b, tx, ty);
        if (b.seen[i] === before[bi][i]) continue;
        newly++;
        const col = Math.max(0, Math.abs(tx - TX) - (W - 1));
        if (col > worstCol) worstCol = col;
        const beyond = col > radius || ty < rowLo || ty > rowHi;
        if (beyond) { outside++; if (!firstBad) firstBad = `${b.id} ${tx},${ty}`; }
      }
  });

  const row0 = (() => { let n = 0; for (let tx = 0; tx < top.tw; tx++) if (world.seenAt(top, tx, 0)) n++; return n; })();
  const row0Bound = W + 2 * radius;

  if (!carved)
    fail('SEAM REVEAL (bounded): the probe failed to carve its own shaft, so the claim is vacuous');
  else if (player.player.band !== top || newly === 0)
    fail(`SEAM REVEAL (bounded): the player ended in "${player.player.band.id}" having newly revealed ` +
         `${newly} tile(s) -- the scene never crossed the seam, so nothing here is under test`);
  else if (outside)
    fail(`SEAM REVEAL (bounded): ${outside} of ${newly} newly revealed tile(s) sit outside ` +
         `eff('sightRadius') (${radius}) of the box's swept path, first at ${firstBad}, worst column ` +
         `offset ${worstCol}. Pass A is firing on a shaft that has no path to the sky`);
  else if (row0 > row0Bound)
    fail(`SEAM REVEAL (bounded): ${row0} of ${top.tw} topsoil row-0 columns are revealed, over the ` +
         `${row0Bound} a ${W}-wide shaft plus eff('sightRadius') either side can reach`);
  else
    ok(`SEAM REVEAL (bounded): crossing into topsoil down a sunless shaft reveals ${newly} tile(s), ` +
       `every one within eff('sightRadius') (${radius}) of the box's own path (worst column offset ` +
       `${worstCol}), and ${row0} of ${top.tw} row-0 columns against a bound of ${row0Bound}`);
}

/* Claim 4: the player's own tiles are revealed in every band the hitbox
   overlaps, at both seams and in both directions. `reband` reads the box
   centre, so a bottom past the seam with the centre above gives `ty1 >= b.th`. */
{
  const TX = 20;
  const scenes = [
    { seam: 'astral/surface', y: 308, band: 'astral', preSeen: 'boot revealRows covers surface rows 0..27',
      carve: [['astral', 34, 39], ['surface', 0, 4]] },
    { seam: 'astral/surface', y: 314, band: 'surface',
      carve: [['astral', 34, 39], ['surface', 0, 4]] },
    { seam: 'surface/topsoil', y: 756, band: 'surface',
      carve: [['surface', 50, 55], ['topsoil', 0, 4]] },
    { seam: 'surface/topsoil', y: 762, band: 'topsoil',
      carve: [['surface', 50, 55], ['topsoil', 0, 4]] }
  ];

  let bad = 0;
  const notes = [];
  for (const sc of scenes) {
    boot.newRun(4242);
    for (const [id, from, to] of sc.carve) seamCarve(world.bandOf(id), TX, from, to, 2);
    const home = world.bandOf(sc.band);
    player.write.spawn(home, TX, world.tileY(home, sc.y));
    player.write.move(world.worldX(home, TX) + 1, sc.y);
    player.write.vel(0, 0);

    /* Counted in the bands the hitbox reaches other than `player.band`, the only
       side the claim is about: Pass B has always revealed the player's own band,
       so pre-fogged tiles there would pass on the half never broken. */
    const box0 = player.playerBox();
    let preUnseen = 0;
    for (const s of world.bandSpans(box0.x, box0.y, box0.w, box0.h))
      if (s.b !== home)
        for (let ty = s.ty0; ty <= s.ty1; ty++)
          for (let tx = s.tx0; tx <= s.tx1; tx++)
            if (!world.seenAt(s.b, tx, ty)) preUnseen++;

    stepReal(1 / 120, {});

    const box = player.playerBox();
    const spans = world.bandSpans(box.x, box.y, box.w, box.h);
    let unseen = 0, firstBad = '';
    for (const s of spans)
      for (let ty = s.ty0; ty <= s.ty1; ty++)
        for (let tx = s.tx0; tx <= s.tx1; tx++)
          if (!world.seenAt(s.b, tx, ty)) { unseen++; if (!firstBad) firstBad = `${s.b.id} ${tx},${ty}`; }

    const label = `${sc.seam} at y ${sc.y}, player.band ${sc.band}`;
    if (spans.length < 2) {
      fail(`SEAM REVEAL (own tiles): ${label} -- the box spans ${spans.length} band(s), so the ` +
           `scene is not straddling the seam at all and proves nothing`);
      bad++;
    } else if (player.player.band !== home) {
      fail(`SEAM REVEAL (own tiles): ${label} -- reband put the player in ` +
           `"${player.player.band.id}" instead, so this scene no longer tests the direction it names`);
      bad++;
    } else if (!preUnseen && !sc.preSeen) {
      fail(`SEAM REVEAL (own tiles): ${label} -- every tile the hitbox overlaps was already revealed ` +
           `before the step, so this scene would pass with rules/reveal.js doing nothing`);
      bad++;
    } else if (unseen) {
      fail(`SEAM REVEAL (own tiles): ${label} -- ${unseen} of the player's own occupied tile(s) are ` +
           `still fogged, first at ${firstBad}. rules/reveal.js is seeding player.band alone`);
      bad++;
    } else {
      notes.push(`${sc.seam} y${sc.y}/${sc.band}: ${preUnseen} fogged across the seam before` +
                 (sc.preSeen ? ` (${sc.preSeen})` : ''));
    }
  }

  if (!bad) {
    console.log('  ..  ' + notes.join('; '));
    ok(`SEAM REVEAL (own tiles): at both seams, with the box straddling each in both directions ` +
       `(ty1 >= b.th and ty0 < 0), every tile the hitbox overlaps is revealed in both bands`);
  }
}

console.log('\n8p. A CATCH BOX CATCHES WHAT FALLS THROUGH ITS MOUTH');

/* Every machine row that declares a catch box, with the pair its own ports
   accept -- read through `expand` and `acceptedBy`, so a row whose selectors
   change is probed with whatever it now takes rather than with a guess. */
const CATCHERS = D_mach.MACH.map((def, i) => ({ def, i }))
  .filter(r => r.def.catchBox)
  .map(r => {
    for (const p of r.def.ports ?? [])
      for (const sel of p.accepts ?? [])
        for (const q of D_form.expand(sel)) {
          if (!items.holdable(q.sub, q.form)) continue;
          if (machs.acceptedBy(r.def, q.sub, q.form) === null) continue;
          return { ...r, pair: q };
        }
    return { ...r, pair: null };
  });

/* The rect `rules/machines.js#catchFalling` builds, from the machine's own
   mouth and the `catchBox.slack` its data row declares. Closed on all four
   edges, which is `model/items.js#inRect`'s contract. */
const catchRect = (m, def) => {
  const mouth = m.mouth[def.catchBox.mouth];
  const s = def.catchBox.slack;
  return { x: mouth.x - s, y: mouth.y - s, w: mouth.w + s * 2, h: mouth.h + s * 2 };
};
const inCatch = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/* An air pocket far from spawn, so no other machine, tile or item is in frame.
   Returns the band. */
function catchScene(tx, ty, up, down) {
  boot.newRun(4242);
  const b = world.bandOf('surface');
  for (let y = ty - up; y <= ty + down; y++)
    for (let x = tx - 14; x <= tx + 14; x++)
      if (world.inBounds(b, x, y)) tiles.write.clear(b, x, y);
  return b;
}

/* Claim 1: the caught region is `mouth +/- slack` and nothing wider. */
{
  const PAD = 3;
  let bad = 0;
  const notes = [];
  if (!CATCHERS.length)
    fail('CATCH REGION: no machine row declares a catchBox, so this section is vacuous');
  for (const { def, i, pair } of CATCHERS) {
    if (!pair) {
      fail(`CATCH REGION: ${def.id} declares a catchBox but no port of its own accepts any ` +
           `holdable pair, so nothing can ever fall into it`);
      bad++;
      continue;
    }
    const b = catchScene(60, 30, 14, 16);
    const probe = machs.write.place(b, i, 60, 30);
    const box = catchRect(probe, def);
    machs.write.remove(probe);

    const x0 = box.x - PAD, x1 = box.x + box.w + PAD;
    const y0 = box.y - PAD, y1 = box.y + box.h + PAD;

    /* Control pass: where does each spawn position sit when `machines` runs? */
    const at = new Map();
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        items.write.clear();
        items.write.spawn(b, x, y, pair.sub, pair.form, 0, 0);
        items.write.reindex();
        stepReal(main.STEP, {});
        const it = items.items[0];
        at.set(`${x},${y}`, it ? { x: it.x, y: it.y } : null);
      }
    items.write.clear();

    const m = machs.write.place(b, i, 60, 30);
    let caught = 0, want = 0, wrong = 0, scanned = 0, first = '';
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        m.buf = {};
        items.write.clear();
        items.write.spawn(b, x, y, pair.sub, pair.form, 0, 0);
        items.write.reindex();
        journal.write.clear();
        stepReal(main.STEP, {});
        const got = journal.peek().some(r => r.kind === 'accept');
        const p = at.get(`${x},${y}`);
        const expect = !!p && inCatch(box, p.x, p.y);
        scanned++;
        if (got) caught++;
        if (expect) want++;
        if (got !== expect && !first) first = `${x},${y}: caught ${got}, rect says ${expect}`;
        if (got !== expect) wrong++;
      }
    machs.write.remove(m);
    items.write.clear();

    if (!want || caught === scanned) {
      fail(`CATCH REGION: ${def.id} caught ${caught} of ${scanned} probed positions against a ` +
           `declared ${box.w}x${box.h} rect -- the scan window does not straddle the boundary, ` +
           `so the claim would pass on a machine that catches everything`);
      bad++;
    } else if (wrong) {
      fail(`CATCH REGION: ${def.id} disagrees with its own mouth ± slack at ${wrong} of ` +
           `${scanned} position(s), first ${first}. The rect is ` +
           `${box.w}x${box.h} at ${box.x},${box.y} from mouth '${def.catchBox.mouth}' and ` +
           `slack ${def.catchBox.slack}`);
      bad++;
    } else {
      notes.push(`${def.id} ${caught}/${scanned}`);
    }
  }
  if (!bad) {
    console.log('  ..  ' + notes.join(', '));
    ok(`CATCH REGION: all ${CATCHERS.length} machine row(s) with a catchBox accept an item at ` +
       `exactly the positions inside mouth ± slack, on all four edges`);
  }
}

/* Claim 2: nothing falls through a mouth it should have entered. At the fixed
   1/120 s substep with `rules/items.js#integrate` clamped to `eff('terminal')`,
   the furthest an item moves between two looks is under the box's own height. */
{
  const term = mods.eff('terminal');
  const perStep = term * main.STEP;
  let bad = 0;
  const notes = [];
  for (const { def, i, pair } of CATCHERS) {
    if (!pair) continue;
    const b = catchScene(60, 54, 54, 2);
    const m = machs.write.place(b, i, 60, 54);
    const box = catchRect(m, def);
    if (perStep > box.h) {
      fail(`TUNNELLING: ${def.id}'s catch box is ${box.h} px tall and an item at ` +
           `eff('terminal') (${term} px/s) covers ${perStep.toFixed(2)} px per 1/${1 / main.STEP} s ` +
           `substep, ` +
           `so a fall can step over the mouth entirely`);
      bad++;
    }
    /* Two sub-pixel phases: a catch box is sampled once per substep, so an aligned
       drop lands on the same grid of sample positions every time. Offsetting the
       start by half a substep's travel moves that grid. */
    let miss = 0, hit = 0, outside = 0;
    for (const phaseOff of [0, perStep / 2])
      for (let x = box.x - 1; x <= box.x + box.w + 1; x++) {
        const withinRect = x >= box.x && x <= box.x + box.w;
        m.buf = {};
        items.write.clear();
        journal.write.clear();
        items.write.spawn(b, x, box.y - b.tile * 4 - phaseOff, pair.sub, pair.form, 0, term);
        items.write.reindex();
        let got = false;
        for (let f = 0; f < 600 && items.items.length; f++) {
          stepReal(main.STEP, {});
          if (journal.peek().some(r => r.kind === 'accept')) { got = true; break; }
        }
        if (withinRect && got) hit++;
        else if (withinRect) miss++;
        else if (got) outside++;
      }
    machs.write.remove(m);
    items.write.clear();

    if (miss) {
      fail(`TUNNELLING: ${def.id} let ${miss} of ${hit + miss} column(s) of its own mouth fall ` +
           `straight through at eff('terminal')`);
      bad++;
    } else if (outside) {
      fail(`TUNNELLING: ${def.id} caught ${outside} column(s) outside mouth ± slack, so the ` +
           `sweep is measuring a wider box than the rect declares`);
      bad++;
    } else {
      notes.push(`${def.id} ${hit}`);
    }
  }
  if (!bad) {
    console.log('  ..  ' + notes.join(', '));
    ok(`TUNNELLING: an item already at eff('terminal') (${term} px/s, ${perStep.toFixed(2)} px ` +
       `per substep) dropped down every column of every catch box is swallowed, and no column ` +
       `outside mouth ± slack is`);
  }
}

console.log('\n8q. THE DIG QUEUE DIGS WITH NO BUTTON HELD');

/* Written against behaviour and not against the selection policy: which mark
   the pick works next is `rules/mining.js`'s to change. The marks go in the
   row below the floor, or the player drops into their own trench. */
const QUEUE_TX = 12, QUEUE_TY = 60, QUEUE_RUN = 14;
function queueScene(seed = 1461) {
  boot.newRun(seed);
  const b = world.bandOf('topsoil');
  for (let dx = -3; dx <= QUEUE_RUN; dx++) {
    for (let dy = -3; dy <= -1; dy++) tiles.write.clear(b, QUEUE_TX + dx, QUEUE_TY + dy);
    tiles.write.set(b, QUEUE_TX + dx, QUEUE_TY, D_sub.S.stone, D_form.NATIVE);
  }
  mining.write.clearAll();
  digqueue.write.clearAll();
  run.write.collect(D_sub.S.pick, D_form.F.relic, 1);
  player.write.band(b);
  player.write.move(world.worldX(b, QUEUE_TX), world.worldY(b, QUEUE_TY - 2));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  player.write.set('fallFrom', player.player.y);
  return { b, tx: QUEUE_TX, ty: QUEUE_TY };
}

/* Distance from the player's centre to a tile's own middle in world px, the
   measure `model/digqueue.js#d2` uses. */
const tileReach = (b, tx, ty) => {
  const c = player.playerCentre();
  return Math.hypot(world.worldX(b, tx) + b.tile / 2 - c.x,
                    world.worldY(b, ty) + b.tile / 2 - c.y);
};

/* Substeps the pick needs for `n` tiles of `subId`, from the rows that set the
   price: `tile.hard x tile.charge / (pickPower x tool power)`, times three,
   because the queue walks its own commitment. */
function digBudget(subId, n) {
  const row = D_sub.SUB[D_sub.S[subId]].tile;
  const power = mods.eff('pickPower') * (run.bestTool()?.power ?? 1);
  return Math.ceil(n * row.hard * (row.charge ?? 1) / power * 3 / main.STEP);
}

/* Claim 1: a mark breaks with nothing held and the material falls. `cmd` is
   empty on every substep, so only the queue can break these tiles. Copper and
   not soil, whose `dropChance` of 0.05 makes three tiles a coin flip. */
{
  const { b, tx, ty } = queueScene();
  const cells = [[tx - 1, ty + 1], [tx, ty + 1], [tx + 1, ty + 1]];
  for (const [x, y] of cells) tiles.write.set(b, x, y, D_sub.S.copper, D_form.NATIVE);

  const reach = mods.eff('reach');
  const far = cells.filter(([x, y]) => tileReach(b, x, y) > reach);
  const marked = cells.map(([x, y]) => digqueue.write.mark(b, x, y));
  const inv0 = run.run.inv.filter(Boolean).length;
  const items0 = items.items.length;

  const budget = digBudget('copper', cells.length);
  let f = 0;
  while (f < budget && digqueue.activeCount() > 0) { stepReal(main.STEP, {}); f++; }

  const solid = cells.filter(([x, y]) => tiles.tileAt(b, x, y) !== D_form.AIR).length;
  const gained = items.items.length - items0;
  const invGrew = run.run.inv.filter(Boolean).length - inv0;

  if (far.length)
    fail(`DIG QUEUE (hands-free): ${far.length} of the ${cells.length} marked tile(s) start outside ` +
         `eff('reach') (${reach}), so the scene tests deferral and not digging`);
  else if (marked.some(r => r !== 'ok'))
    fail(`DIG QUEUE (hands-free): write.mark refused a tile of the block (${marked.join(', ')}), so ` +
         `nothing below is under test`);
  else if (solid)
    fail(`DIG QUEUE (hands-free): ${solid} of ${cells.length} marked copper tile(s) are still there ` +
         `after ${(f * main.STEP).toFixed(2)} simulated seconds with no button held, against a ` +
         `derived budget of ${(budget * main.STEP).toFixed(2)} s`);
  else if (digqueue.activeCount())
    fail(`DIG QUEUE (hands-free): ${digqueue.activeCount()} mark(s) outlived the tiles they named`);
  else if (!gained)
    fail('DIG QUEUE (hands-free): every tile broke and nothing fell, so the queue is destroying ' +
         'material rather than dropping it');
  else if (invGrew)
    fail(`DIG QUEUE (hands-free): ${invGrew} inventory slot(s) filled without a pickup -- a queued ` +
         `swing is crediting the pockets directly`);
  else
    ok(`DIG QUEUE (hands-free): ${cells.length} marked copper tiles broke in ` +
       `${(f * main.STEP).toFixed(2)} s with cmd empty on every substep, yielding ${gained} falling ` +
       `item(s) and 0 direct inventory credits`);
}

/* Claim 2: a mark past `reach` waits and walking into range resumes it. The
   probe asserts the player did not move during the standing phase, since a
   queue that walked itself is the failure. Columns in reach are measured. */
{
  const { b, tx, ty } = queueScene();
  const row = ty + 1, cols = [];
  for (let i = 0; i < 10; i++) {
    tiles.write.set(b, tx + i, row, D_sub.S.soil, D_form.NATIVE);
    cols.push(tx + i);
  }
  for (const x of cols) digqueue.write.mark(b, x, row);

  const reach = mods.eff('reach');
  const near = cols.filter(x => tileReach(b, x, row) <= reach).length;
  const x0 = player.player.x;
  for (let f = 0, n = digBudget('soil', near + 1); f < n; f++) stepReal(main.STEP, {});
  const brokeStill = cols.filter(x => tiles.tileAt(b, x, row) === D_form.AIR).length;
  const leftStill = digqueue.activeCount();
  const drift = Math.abs(player.player.x - x0);

  /* Walk, then stand, ten times over. Standing is not padding: the queue works
     the nearest in-reach mark, and nothing finishes while the player crosses
     at full walk speed against soil's own hardness. */
  const dwell = digBudget('soil', 2);
  for (let i = 0; i < 10; i++) {
    for (let f = 0; f < 40; f++) stepReal(main.STEP, { right: true });
    for (let f = 0; f < dwell; f++) stepReal(main.STEP, {});
  }
  const brokeWalked = cols.filter(x => tiles.tileAt(b, x, row) === D_form.AIR).length;

  if (!near || near === cols.length)
    fail(`DIG QUEUE (deferral): ${near} of ${cols.length} marks start inside eff('reach') ` +
         `(${reach}), so the run does not straddle the boundary and deferral is not under test`);
  else if (brokeStill !== near)
    fail(`DIG QUEUE (deferral): standing still broke ${brokeStill} of the ${near} marks that start ` +
         `inside eff('reach') (${reach}), out of ${cols.length}`);
  else if (leftStill !== cols.length - brokeStill)
    fail(`DIG QUEUE (deferral): ${brokeStill} mark(s) broke but ${leftStill} remain of ` +
         `${cols.length} -- an out-of-reach mark was dropped rather than deferred`);
  else if (drift > 1)
    fail(`DIG QUEUE (deferral): the player moved ${drift.toFixed(2)} px with no movement key held. ` +
         `The queue is walking itself, which U5 forbids`);
  else if (brokeWalked !== cols.length || digqueue.activeCount())
    fail(`DIG QUEUE (deferral): walking right through cmd took the count from ${brokeStill} to ` +
         `${brokeWalked} of ${cols.length} with ${digqueue.activeCount()} mark(s) left, so a ` +
         `deferred mark is not resumed when the player reaches it`);
  else
    ok(`DIG QUEUE (deferral): ${brokeStill} of ${cols.length} marks break from a standing start -- ` +
       `exactly the ${near} inside eff('reach') (${reach}) -- ${leftStill} wait with the player not ` +
       `moving 1 px, and walking right clears all ${brokeWalked}`);
}

/* Claim 3: no mark survives `newRun`, on the same seed and on tiles this probe
   never edited. `model/digqueue.js` records the byte a tile was marked on and
   the same seed writes the same bytes back, so a byte check alone would pass. */
{
  const SEED = 1337;
  const { b, tx, ty } = queueScene(SEED);
  /* Generated rock, never written by this probe, so regeneration reproduces it
     byte for byte. */
  const cells = [];
  for (let i = 0; tx + i < b.tw && cells.length < 5; i++)
    if (tiles.tileAt(b, tx + i, ty + 2) !== D_form.AIR) cells.push([tx + i, ty + 2]);
  const bytes = cells.map(([x, y]) => tiles.tileAt(b, x, y));
  const marked = cells.map(([x, y]) => digqueue.write.mark(b, x, y));
  const before = digqueue.activeCount();

  boot.newRun(SEED);
  const fresh = world.bandOf('topsoil');
  const same = cells.filter(([x, y], i) => tiles.tileAt(fresh, x, y) === bytes[i]).length;
  const visible = cells.filter(([x, y]) => digqueue.markedAt(fresh, x, y)).length;
  const c = player.playerCentre();
  const nearest = digqueue.nearestWithin(c.x, c.y, 1e6);
  stepReal(main.STEP, {});
  const after = digqueue.activeCount();

  if (cells.length < 5 || marked.some(r => r !== 'ok') || before !== cells.length)
    fail(`DIG QUEUE (restart): the scene marked ${before} of ${cells.length} generated tiles ` +
         `(${marked.join(', ')}), so nothing below is under test`);
  else if (same !== cells.length)
    fail(`DIG QUEUE (restart): regenerating seed ${SEED} put different bytes at ${cells.length - same} ` +
         `of the ${cells.length} marked coordinates, so a byte comparison alone would have caught ` +
         `this and the claim is weaker than it reads`);
  else if (visible)
    fail(`DIG QUEUE (restart): ${visible} of ${cells.length} marks are still readable through ` +
         `markedAt() after newRun(${SEED}), and the terrain under them is byte-identical. A mark ` +
         `of the previous run is being worked in this one`);
  else if (nearest)
    fail(`DIG QUEUE (restart): nearestWithin() still answers ${nearest.tx},${nearest.ty} after ` +
         `newRun(${SEED}), so the queue would hand rules/mining.js a dead mark`);
  else if (after)
    fail(`DIG QUEUE (restart): ${after} mark(s) survived the first substep of the new run`);
  else
    ok(`DIG QUEUE (restart): ${cells.length} marks over terrain that regenerates byte-identically ` +
       `from seed ${SEED} are all unreadable after newRun(), and none survives the first substep`);
}

/* Claim 4: a queued tile costs its stated seconds at any framerate --
   `hard x charge` over the pick's power. The tolerance is one frame of the rate
   under test plus one fixed substep, because the loop banks leftover dt. */
{
  const RATES = [20, 30, 60, 90, 107, 120, 144, 240];
  const row = D_sub.SUB[D_sub.S.stone].tile;
  let bad = 0;
  const notes = [];
  for (const fps of RATES) {
    const dt = 1 / fps;
    const { b, tx, ty } = queueScene();
    tiles.write.set(b, tx, ty + 1, D_sub.S.stone, D_form.NATIVE);
    digqueue.write.mark(b, tx, ty + 1);
    const want = row.hard * (row.charge ?? 1) /
                 (mods.eff('pickPower') * (run.bestTool()?.power ?? 1));
    const cap = Math.ceil((want * 4) / dt);
    let n = 0;
    while (tiles.tileAt(b, tx, ty + 1) !== D_form.AIR && n < cap) { stepReal(dt, {}); n++; }
    const took = n * dt;
    const tol = dt + main.STEP;
    if (Math.abs(took - want) > tol + 1e-9) {
      fail(`DIG QUEUE (framerate): a queued stone tile took ${took.toFixed(4)} s at ${fps} fps ` +
           `against a derived ${want.toFixed(4)} s (tile.hard ${row.hard} x charge ` +
           `${row.charge ?? 1} / power), outside one frame plus one substep (${tol.toFixed(4)} s)`);
      bad++;
    } else {
      notes.push(`${fps}:${took.toFixed(3)}`);
    }
  }
  if (!bad)
    ok(`DIG QUEUE (framerate): a queued stone tile breaks in its derived ` +
       `${(row.hard * (row.charge ?? 1) / (mods.eff('pickPower') * (run.bestTool()?.power ?? 1))).toFixed(3)} s ` +
       `at all ${RATES.length} rates (${notes.join(' ')})`);
}

/* Claim 5: the marked set is bounded by `eff('digQueueMax')`, asserted on
   `write.mark`'s `'full'` return and not on a journal row: no `model` module
   imports `model/journal.js`, so the refusal is the caller's to push. */
{
  const { b } = queueScene();
  const cap = Math.max(1, Math.round(mods.eff('digQueueMax')));
  let accepted = 0, full = 0, nothing = 0;
  for (let ty = 30; ty < b.th && full < 5; ty++)
    for (let tx = 0; tx < b.tw && full < 5; tx++) {
      if (tiles.tileAt(b, tx, ty) === D_form.AIR) { nothing++; continue; }
      const r = digqueue.write.mark(b, tx, ty);
      if (r === 'ok') accepted++;
      else if (r === 'full') full++;
    }

  if (accepted !== cap || digqueue.activeCount() !== cap)
    fail(`DIG QUEUE (cap): ${accepted} mark(s) were accepted and ${digqueue.activeCount()} are live ` +
         `against eff('digQueueMax') rounded to ${cap}`);
  else if (!full || !digqueue.isFull())
    fail(`DIG QUEUE (cap): the set filled to ${cap} and the next mark returned no 'full' ` +
         `(${full} seen, isFull ${digqueue.isFull()}), so a drag has nothing to report`);
  else
    ok(`DIG QUEUE (cap): the marked set stops at eff('digQueueMax') (${cap}) and every further ` +
       `mark returns 'full' for the caller to turn into a journal row`);
  digqueue.write.clearAll();
}

console.log('\n8r. THE SAVE SLOT');

/* `src/shell/save.js` touches storage through `getItem`/`setItem`/`removeItem`
   and nothing else, so a Map behind those three is faithful to this whole
   section. It cannot see a real quota, a disabled store, or a page reload. */
const SAVE_HEAD = 'mythos-factory/save-head';
const SAVE_BODY = 'mythos-factory/save';

let saveStore = null;
function installStore(entries = []) {
  const m = new Map(entries);
  saveStore = m;
  globalThis.localStorage = {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }
  };
  return m;
}

/* Rolling checksum, `sumBytes`'s job, reused here so a band's 30 k tile bytes
   are one number in the fingerprint. */
const saveSnap = () => JSON.stringify({
  bands: world.bands.map(b => ({ id: b.id, mat: sumBytes(b.mat), seen: sumBytes(b.seen) })),
  run: run.run,
  player: Object.fromEntries(Object.entries(player.player)
    .map(([k, v]) => [k, k === 'band' ? v?.id : (typeof v === 'number' ? +v.toFixed(4) : v)])),
  items: items.items.map(it => ({ band: it.band?.id, x: +it.x.toFixed(4), y: +it.y.toFixed(4),
    vx: +it.vx.toFixed(4), vy: +it.vy.toFixed(4), sub: it.sub, form: it.form })),
  machines: machs.machines.map(m => ({ def: m.def, tx: m.tx, ty: m.ty, buf: { ...m.buf },
    prog: +m.prog.toFixed(4), made: m.made, charges: m.charges, fire: +m.fire.toFixed(4),
    running: m.running, torque: +m.torque.toFixed(4), turn: +m.turn.toFixed(4) })),
  segments: segs.segments.map(s => ({ a: machs.machines.indexOf(s.a), b: machs.machines.indexOf(s.b),
    u: +s.u.toFixed(6), spin: s.spin, load: +s.load.toFixed(4),
    cars: s.carriers.map(c => +c.off.toFixed(6)) })),
  digs: mining.activeCount(),
  growth: [...growth.planted().entries()].map(([k, e]) => [k, +e.secs.toFixed(4)]).sort(),
  boons: modelBoons.boons.active.map(a => ({ id: a.id, left: +a.left.toFixed(4) })),
  cursor: rng.cursor()
}, null, 1);

/* A run with something in every part of the payload: tile edits, a partial dig,
   a part-grown seed, an item mid-flight, two hubs with a buffer and a spent
   charge, a linked segment, a heart gone, a boon, 57 `rand` draws spent. */
const SAVE_BOON = Object.keys(D_boon.BOON)[0];
function richRun(seed) {
  boot.newRun(seed);
  const b = world.bandOf('surface');
  const tx = b.cfg.spawnTx, fy = b.cfg.floorTy;
  for (let i = -4; i <= 10; i++) tiles.write.clear(b, tx + 3, fy + i);
  mining.write.add(b, tx + 4, fy + 2, 0.7);
  tiles.write.set(b, tx - 3, fy - 1, D_sub.S.timber, D_form.F.seed);
  growth.write.add(b, tx - 3, fy - 1, 42.5);
  items.write.spawn(b, world.worldX(b, tx) + 4, world.worldY(b, fy - 6),
                    D_sub.S.copper, D_form.F.ore, 1, -2);
  items.write.reindex();
  const h1 = machs.write.place(b, D_mach.M.hub, tx + 3, fy - 2);
  const h2 = machs.write.place(b, D_mach.M.hub, tx + 3, fy + 8);
  machs.write.take(h1, D_sub.S.copper, D_form.F.ore, 2);
  machs.write.charge(h1, 5);
  machs.write.spendCharge(h1, 2);
  machs.write.prog(h1, 0.4);
  machs.write.fire(h1, 3.25);
  machs.write.running(h1, true);
  const sg = segs.write.link(h1, h2);
  if (sg) { setCar(sg, 0.37); segs.write.load(sg, 2.5); }
  run.write.collect(D_sub.S.copper, D_form.F.ingot, 3);
  run.write.tick(88.5);
  run.write.hurt(2, 'FALL');
  modelBoons.write.grant(SAVE_BOON, 12.5);
  for (let i = 0; i < 57; i++) rng.rand();
  return { b, seg: !!sg };
}

/* Claim 1: the round trip is exact, including the `rand` cursor. */
{
  installStore();
  const { seg } = richRun(4242);
  const before = saveSnap();
  const wrote = save.save();
  const afterSave = [rng.rand(), rng.rand(), rng.rand()];

  boot.newRun(999999);
  /* A throw out of the middle of `load` is reported as a failure rather than
     crashing the checker before the refusal matrix below ever runs. */
  let loaded = false, threw = null;
  try { loaded = save.load(boot.newRun); }
  catch (e) { threw = `${e.constructor.name}: ${e.message}`; }
  const after = saveSnap();
  const afterLoad = [rng.rand(), rng.rand(), rng.rand()];

  const diff = (() => {
    const a = before.split('\n'), c = after.split('\n');
    for (let i = 0; i < Math.max(a.length, c.length); i++)
      if (a[i] !== c[i]) return `line ${i}: saved ${a[i]} / loaded ${c[i]}`;
    return '';
  })();

  if (!seg)
    fail('SAVE ROUND TRIP: the scene failed to link a segment, so segment state is not covered');
  else if (!wrote)
    fail('SAVE ROUND TRIP: save() refused a working store');
  else if (threw)
    fail(`SAVE ROUND TRIP: load() threw part way through its own payload -- ${threw}. A refusal ` +
         `either touches nothing or leaves a clean run, never a half-applied one`);
  else if (!loaded)
    fail(`SAVE ROUND TRIP: load() refused its own payload -- ${save.loadError.reason}`);
  else if (diff)
    fail(`SAVE ROUND TRIP: the loaded run differs from the saved one. ${diff}`);
  else if (afterSave.join() !== afterLoad.join())
    fail('SAVE ROUND TRIP: every field came back and the rand() cursor did not, so the loaded ' +
         'run draws a different future from the same world');
  else
    ok(`SAVE ROUND TRIP: tile edits, the dig ledger, a part-grown seed, a loose item, two hubs, ` +
       `a segment and its carrier, the pockets, hearts, a live boon and the rand() cursor all ` +
       `survive save/load exactly (${saveStore.get(SAVE_BODY).length} byte body)`);
}

/* Claim 2: a malformed payload is refused by field path and changes nothing.
   A `seen` string of `'!!!!'` reaches `atob` and throws out of the middle of
   the restore, with band 0's tile edits already written and no way back. */
{
  installStore();
  richRun(77);
  const wrote = save.save();
  const GOOD_BODY = saveStore.get(SAVE_BODY);
  const GOOD_HEAD = saveStore.get(SAVE_HEAD);

  const CASES = [
    ['run deleted',           p => { delete p.run; }],
    ['player deleted',        p => { delete p.player; }],
    ['player null',           p => { p.player = null; }],
    ['player.x not a number', p => { p.player.x = 'x'; }],
    ['player.band unknown',   p => { p.player.band = 'nowhere'; }],
    ['player.onGround a number', p => { p.player.onGround = 1; }],
    ['run.t a string',        p => { p.run.t = 'later'; }],
    ['run.t negative',        p => { p.run.t = -1; }],
    ['run.inv sub 999',       p => { p.run.inv[0] = { sub: 999, form: 0, n: 1 }; }],
    ['run.inv form 999',      p => { p.run.inv[0] = { sub: 0, form: 999, n: 1 }; }],
    ['run.inv n null',        p => { p.run.inv[0] = { sub: 0, form: 0, n: null }; }],
    ['run.inv not an array',  p => { p.run.inv = 3; }],
    ['run.hearts -5',         p => { p.run.hearts = -5; }],
    ['run.misses 1e9',        p => { p.run.misses = 1e9; }],
    ['run.tutorialBeat 1e9',  p => { p.run.tutorialBeat = 1e9; }],
    ['run.cycle 0',           p => { p.run.cycle = 0; }],
    ['run.tribute a string',  p => { p.run.tribute = 'nope'; }],
    ['run.tribute.id unknown', p => { p.run.tribute = { id: 'no-such-cycle', have: {} }; }],
    ['run.offer bogus',       p => { p.run.offer = { tier: 'x', god: 'nobody', ids: 3, pool: null }; }],
    ['run.equipped 999',      p => { p.run.equipped = [999]; }],
    ['run.granted unknown',   p => { p.run.granted = ['no-such-grant']; }],
    ['run.charted unknown',   p => { p.run.charted = ['no-such-band']; }],
    ['run.craftProgress str', p => { p.run.craftProgress = 'x'; }],
    ['items[0].sub 999',      p => { p.items[0].sub = 999; }],
    ['items[0].x a string',   p => { p.items[0].x = 'x'; }],
    ['items not an array',    p => { p.items = 7; }],
    ['machines[0].buf key',   p => { p.machines[0].buf = { 'not/a/key': 2 }; }],
    ['machines[0].tx 1e9',    p => { p.machines[0].tx = 1e9; }],
    ['machines[0].prog str',  p => { p.machines[0].prog = 'x'; }],
    ['machines[0].id unknown', p => { p.machines[0].id = 'no-such-machine'; }],
    ['machines[0].charges > made', p => { p.machines[0].charges = p.machines[0].made + 9; }],
    ['segments not an array', p => { p.segments = 'x'; }],
    ['segments[0].a oob',     p => { p.segments[0].a = 99; }],
    ['growth off the band',   p => { p.growth = [{ band: 'surface', tx: 1e9, ty: 1e9, secs: 'x' }]; }],
    ['boons left a string',   p => { p.boons = [{ id: SAVE_BOON, left: 'x' }]; }],
    ['boons id unknown',      p => { p.boons = [{ id: 'no-such-boon', left: 1 }]; }],
    ['bands seen not base64', p => { p.bands[0].seen = '!!!!'; }],
    ['bands seen too short',  p => { p.bands[0].seen = 'AAAA'; }],
    ['bands edits odd length', p => { p.bands[0].edits = [1, 2]; }],
    ['bands edits off the band', p => { p.bands[0].edits = [99999, 99999, 3]; }],
    ['bands edits byte 999',  p => { p.bands[0].edits = [10, 10, 999]; }],
    ['bands work secs a string', p => { p.bands[0].work = [4, 4, 'x']; }],
    ['bands one short',       p => { p.bands.pop(); }],
    ['cursor a string',       p => { p.cursor = 'x'; }],
    ['seed disagrees with the header', p => { p.seed = 99; }],
    ['body is not json',      'not json'],
    ['body missing',          null]
  ];

  boot.newRun(555);
  let bad = 0, named = 0;
  const firstBad = [];
  for (const [name, mut] of CASES) {
    installStore([[SAVE_HEAD, GOOD_HEAD], [SAVE_BODY, GOOD_BODY]]);
    if (mut === null) saveStore.delete(SAVE_BODY);
    else if (typeof mut === 'string') saveStore.set(SAVE_BODY, mut);
    else { const p = JSON.parse(GOOD_BODY); mut(p); saveStore.set(SAVE_BODY, JSON.stringify(p)); }

    const control = saveSnap();
    let threw = null, r;
    try { r = save.load(boot.newRun); } catch (e) { threw = `${e.constructor.name}: ${e.message}`; }
    const reason = save.loadError.reason;
    const path = typeof reason === 'string' && reason.startsWith('CORRUPT SAVE: ')
                 && reason.length > 'CORRUPT SAVE: '.length;
    if (path) named++;
    const faults = [];
    if (threw) faults.push(`threw ${threw}`);
    if (r !== false) faults.push(`returned ${r}`);
    if (!path) faults.push(`reason "${reason}" names no field`);
    if (saveStore.has(SAVE_HEAD)) faults.push('kept the header, so a menu offers CONTINUE forever');
    if (saveSnap() !== control) faults.push('applied part of the payload before refusing');
    if (faults.length) { bad++; if (firstBad.length < 3) firstBad.push(`${name} -- ${faults.join('; ')}`); }
  }

  if (!wrote)
    fail('SAVE REFUSALS: the good payload never got written, so the matrix mutated nothing');
  else if (bad)
    fail(`SAVE REFUSALS: ${bad} of ${CASES.length} malformed payload(s) were not refused cleanly. ` +
         firstBad.join(' | '));
  else
    ok(`SAVE REFUSALS: all ${CASES.length} malformed payloads are refused with a field path ` +
       `(${named} of them), the header goes with the body, nothing throws, and the run is ` +
       `byte-identical afterwards`);
}

/* Claim 3: an unknown god or recipe id is tolerated deliberately. An id only
   `rules` dereferences, and dereferences optionally, is checked as a string
   and no further: refusing a whole run over a renamed recipe is worse. */
{
  installStore();
  richRun(77);
  save.save();
  const GOOD_BODY = saveStore.get(SAVE_BODY), GOOD_HEAD = saveStore.get(SAVE_HEAD);
  const TOLERATED = [
    ['run.favour names no god', p => { p.run.favour = { nobody: 3 }; }],
    ['run.craftRecipe unknown', p => { p.run.craftRecipe = 'no-such-recipe'; }]
  ];
  let bad = 0;
  const notes = [];
  for (const [name, mut] of TOLERATED) {
    installStore([[SAVE_HEAD, GOOD_HEAD], [SAVE_BODY, GOOD_BODY]]);
    const p = JSON.parse(GOOD_BODY);
    mut(p);
    saveStore.set(SAVE_BODY, JSON.stringify(p));
    boot.newRun(999999);
    let threw = null, r;
    try { r = save.load(boot.newRun); } catch (e) { threw = `${e.constructor.name}: ${e.message}`; }
    let ran = true;
    try { runReal(60, main.STEP); } catch (e) { ran = false; threw = threw ?? String(e.message); }
    if (r !== true || threw || !ran) {
      bad++;
      fail(`SAVE TOLERATES: "${name}" was refused (${save.loadError.reason}) or broke the run ` +
           `(${threw ?? 'stepped fine'}). shell/save.js documents this id as checked as a string ` +
           `and no further; tightening it is a decision to record, not to make here`);
    } else {
      notes.push(name);
    }
  }
  if (!bad) ok(`SAVE TOLERATES: ${notes.join(' and ')} load and then step for half a second`);
}

/* Claim 4: the four version hashes each refuse, and only `gen` discards. `v`,
   `world` and `content` sit in the header so `hasSave` answers without parsing
   a body; `gen` is per band, so `load` tests it after `newRun` and discards. */
{
  const seeded = () => {
    installStore();
    boot.newRun(77);
    const b = world.bandOf('surface');
    for (let i = 0; i < 6; i++) tiles.write.clear(b, b.cfg.spawnTx + 3, b.cfg.floorTy + i);
    run.write.tick(60);
    return save.save();
  };

  let bad = 0;
  const notes = [];
  for (const field of ['v', 'world', 'content']) {
    if (!seeded()) { fail(`SAVE VERSIONS: save() refused before the ${field} case`); bad++; continue; }
    const h = JSON.parse(saveStore.get(SAVE_HEAD));
    h[field] = field === 'v' ? h.v + 1 : (h[field] ^ 1) >>> 0;
    saveStore.set(SAVE_HEAD, JSON.stringify(h));
    const offered = save.hasSave();
    const r = save.load(boot.newRun);
    if (offered || r !== false || save.loadError.reason !== 'STALE SAVE') {
      fail(`SAVE VERSIONS: moving header.${field} left hasSave() ${offered} and load() ${r} ` +
           `(${save.loadError.reason}); a slot from another build must read as STALE SAVE and ` +
           `must not be offered`);
      bad++;
    } else {
      notes.push(`${field} -> STALE SAVE`);
    }
  }
  {
    if (!seeded()) { fail('SAVE VERSIONS: save() refused before the gen case'); bad++; }
    else {
      const p = JSON.parse(saveStore.get(SAVE_BODY));
      p.bands[0].gen = (p.bands[0].gen ^ 1) >>> 0;
      saveStore.set(SAVE_BODY, JSON.stringify(p));
      const offered = save.hasSave();
      const r = save.load(boot.newRun);
      const keys = [...saveStore.keys()].length;
      if (!offered || r !== false || save.loadError.reason !== 'WORLD MOVED' || keys !== 0) {
        fail(`SAVE VERSIONS: a moved band gen left hasSave() ${offered}, load() ${r} ` +
             `(${save.loadError.reason}) and ${keys} key(s) in storage. The header cannot see gen, ` +
             `so it must be offered, refused as WORLD MOVED, and discarded`);
        bad++;
      } else if (run.run.seed !== 77 || run.run.t !== 0) {
        fail(`SAVE VERSIONS: after WORLD MOVED the player is left on seed ${run.run.seed} at ` +
             `t ${run.run.t}, not a clean run of the stored seed`);
        bad++;
      } else {
        notes.push('gen -> WORLD MOVED, slot discarded, clean run of the same seed');
      }
    }
  }
  if (!bad) ok(`SAVE VERSIONS: ${notes.join('; ')}`);
}

/* Claim 5: a caller's wrong seed does not eat the slot. `load` reaching the
   `gen` check with a world the caller generated from another seed must not
   `clearSave` the player's only save over a programming error. */
{
  installStore();
  boot.newRun(77);
  const b = world.bandOf('surface');
  for (let i = 0; i < 6; i++) tiles.write.clear(b, b.cfg.spawnTx + 3, b.cfg.floorTy + i);
  run.write.tick(60);
  save.save();

  /* Both loads are guarded for claim 1's reason: a throw here is a failure to
     report, not a reason to abandon the sections below. */
  const tried = fn => { try { return fn(); } catch (e) { return `threw ${e.message}`; } };
  const r = tried(() => save.load(() => boot.newRun(123456)));
  /* Read before the second load, which clears it on success. */
  const why = save.loadError.reason;
  const kept = save.hasSave();
  const again = tried(() => save.load(boot.newRun));

  if (r !== false || why !== 'WRONG SEED')
    fail(`SAVE WRONG SEED: load() returned ${r} (${why}) for a newRun that built ` +
         `another world; it must refuse as WRONG SEED`);
  else if (!kept)
    fail('SAVE WRONG SEED: the slot was destroyed by the caller\'s own mistake, which is 6h-2 ' +
         'defect 1 back');
  else if (again !== true || run.run.t !== 60)
    fail(`SAVE WRONG SEED: the kept slot no longer loads (${save.loadError.reason}, run.t ` +
         `${run.run.t}), so keeping it bought nothing`);
  else
    ok('SAVE WRONG SEED: a load() whose newRun builds another world refuses as WRONG SEED, keeps ' +
       'the slot, and the same slot then loads correctly for a correct caller');
}

/* Claim 6: a save that fails half way leaves no slot at all. The header is the
   claim that a complete body exists, so `save` removes it first and writes it
   last; a refused header write would leave one over an overwritten body. */
{
  const m = installStore();
  boot.newRun(77);
  const b = world.bandOf('surface');
  for (let i = 0; i < 6; i++) tiles.write.clear(b, b.cfg.spawnTx + 3, b.cfg.floorTy + i);
  run.write.tick(60);
  const first = save.save();

  let refuseHead = false;
  globalThis.localStorage = {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (refuseHead && k === SAVE_HEAD) {
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      }
      m.set(k, String(v));
    },
    removeItem: k => { m.delete(k); }
  };
  refuseHead = true;
  run.write.tick(60);
  const second = save.save();
  refuseHead = false;

  if (!first) fail('SAVE TORN: the first save() refused, so the case never arose');
  else if (second !== false)
    fail(`SAVE TORN: save() returned ${second} while the store refused the header write`);
  else if (m.size)
    fail(`SAVE TORN: ${[...m.keys()].join(' and ')} survived a failed save, so hasSave() and ` +
         `load() can disagree forever`);
  else if (save.hasSave())
    fail('SAVE TORN: hasSave() still promises a save after a failed write');
  else
    ok('SAVE TORN: a save whose header write is refused clears both keys, and hasSave() then ' +
       'reads false');
}

/* Claim 7: hostile or absent storage is "no save" and never an exception.
   Every guard is asserted with the loop actually stepping afterwards, so a
   sandboxed embed loses the save and not the game. */
{
  const HOSTILE = {
    absent: () => { delete globalThis.localStorage; },
    throwing: () => {
      globalThis.localStorage = {
        getItem() { throw new Error('denied'); },
        setItem() { throw new Error('denied'); },
        removeItem() { throw new Error('denied'); }
      };
    },
    quota: () => {
      const m = new Map();
      globalThis.localStorage = {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem() { throw new Error('quota'); },
        removeItem: k => { m.delete(k); }
      };
    },
    garbage: () => installStore([[SAVE_HEAD, '{{{'], [SAVE_BODY, 'not json']]),
    headerOnly: () => installStore([[SAVE_HEAD, '{"v":2}']])
  };

  let bad = 0;
  const notes = [];
  for (const [name, go] of Object.entries(HOSTILE)) {
    go();
    boot.newRun(77);
    let threw = null, had, loaded;
    try {
      had = save.hasSave();
      loaded = save.load(boot.newRun);
      save.save();
      runReal(40, main.STEP);
    } catch (e) { threw = `${e.constructor.name}: ${e.message}`; }
    if (threw || had !== false || loaded !== false || run.run.t <= 0) {
      fail(`SAVE GUARDS: ${name} storage gave hasSave ${had}, load ${loaded}, threw ${threw}, ` +
           `run.t ${run.run.t}. Every one of these must read as "no save" and the loop must keep ` +
           `stepping`);
      bad++;
    } else {
      notes.push(`${name} -> ${save.loadError.reason}`);
    }
  }
  if (!bad) ok(`SAVE GUARDS: ${notes.join(', ')}, and the loop steps in all five`);
}

/* Claim 8: `run.inv` is position-significant, and no version hash covers the
   tunable that sets its shape: `applyRun` restores the pockets by index while
   `run.mainSlots` is `Math.round(eff('invSlots'))` at reset. */
{
  installStore();
  boot.newRun(77);
  const derived = Math.round(mods.eff('invSlots'));
  run.write.collect(D_sub.S.copper, D_form.F.ore, 3);
  const at = run.run.inv.findIndex(s => s && s.sub === D_sub.S.copper && s.form === D_form.F.ore);
  const total = run.run.inv.length;
  save.save();
  const head = JSON.parse(saveStore.get(SAVE_HEAD));

  boot.newRun(999999);
  const loaded = save.load(boot.newRun);
  const back = run.run.inv.findIndex(s => s && s.sub === D_sub.S.copper && s.form === D_form.F.ore);
  const fields = Object.keys(head).sort().join(',');

  if (run.run.mainSlots !== derived)
    fail(`SAVE SLOT SHAPE: run.mainSlots is ${run.run.mainSlots} where eff('invSlots') rounds to ` +
         `${derived}, so this claim is no longer about the tunable it names`);
  else if (at < derived)
    fail(`SAVE SLOT SHAPE: the collected stack landed in main slot ${at}, not the quickbar. ` +
         `the fill order puts a new pair in the quickbar first, so the index this claim is about is ` +
         `not being exercised`);
  else if (!loaded || back !== at)
    fail(`SAVE SLOT SHAPE: a stack saved in inventory index ${at} of ${total} came back at ` +
         `${back} (load ${loaded})`);
  else
    ok(`SAVE SLOT SHAPE: a stack in quickbar index ${at} of ${total} round-trips by index, and the ` +
       `header versions {${fields}}` + (head.slots === undefined
         ? ` -- no slot count, so raising eff('invSlots') (${derived}) still mis-restores an old ` +
           `save silently`
         : ` -- including a slot count, so that gap is closed and the payload ` +
           `should list the fifth version`));
}

globalThis.localStorage = defaultStore();

console.log('\n8s. THE BAND EDGE');

/* Every expected value below comes off the live band record -- `b.origin.x`,
   `widthPx(b)`, `b.tw`, `b.tile` -- and off `VIEW.w`, never a literal column
   number. */

/* A row deep inside a band, in world px. Every band is at least 40 rows tall,
   so the middle row is always interior. */
const bandMidY = b => b.origin.y + Math.floor(world.heightPx(b) / 2);

/* A flat corridor along one edge, so a probe measures a clamp and never a
   fall. `side` is +1 for the right edge and -1 for the left. `boot.newRun`
   re-allocates every band, so the record is re-read from `bandOf` after it. */
const EDGE_RUN = 6;
function edgeScene(bandId, side) {
  boot.newRun(4242);
  const b = world.bandOf(bandId);
  const fy = b.th - 4;
  const lo = side > 0 ? b.tw - 1 - EDGE_RUN : 0;
  const hi = side > 0 ? b.tw - 1 : EDGE_RUN;
  for (let tx = lo; tx <= hi; tx++) {
    for (let dy = -3; dy <= -1; dy++) tiles.write.clear(b, tx, fy + dy);
    tiles.write.set(b, tx, fy, D_sub.S.stone, D_form.NATIVE);
  }
  const scene = { b, fy, startTx: side > 0 ? lo : hi, startX: 0 };
  edgeStand(scene);
  return scene;
}

/* Back to the inner end of the corridor with no fall in progress, so the
   framerate sweep re-runs the walk without another whole-world `newRun`. */
function edgeStand(scene) {
  const { b, fy, startTx } = scene;
  player.write.band(b);
  player.write.move(world.worldX(b, startTx), world.worldY(b, fy - 2));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  player.write.set('fallFrom', player.player.y);
  main.cam.x = world.worldX(b, startTx);
  main.cam.y = world.worldY(b, fy - 2);
  scene.startX = player.player.x;
  return scene;
}

/* Substeps to cover the run-up plus a band's worth of overshoot, so the walk
   cannot end early for want of frames. */
const edgeFrames = (b, dt) => Math.ceil((EDGE_RUN + 4) * b.tile / mods.eff('walk') / dt) * 3;

/* Claim 1: `bandAt` answers for every column of a band and for no pixel
   outside it. It tests x as well as y, and is the function
   `model/segments.js#sweepSpan` turns into 'OUTSIDE THE WORLD'. */
{
  boot.newRun(1337);
  let bad = 0;
  const notes = [];
  for (const b of world.bands) {
    const midY = bandMidY(b);
    let dead = 0, firstDead = '';
    for (let tx = 0; tx < b.tw; tx++) {
      /* Both edges of the column, so a half-open bound off by one is caught. */
      for (const px of [world.worldX(b, tx), world.worldX(b, tx) + b.tile - 1])
        if (world.bandAt(px, midY) !== b) {
          dead++;
          if (!firstDead) firstDead = `tx ${tx} at x ${px}`;
        }
    }
    const left = world.bandAt(b.origin.x - 1, midY);
    const right = world.bandAt(b.origin.x + world.widthPx(b), midY);
    if (dead) {
      fail(`BAND EDGE (bandAt): ${dead} of ${b.tw * 2} probed pixels across "${b.id}" resolve to ` +
           `another band or to nothing, first ${firstDead}. The band spans x ` +
           `${b.origin.x}..${b.origin.x + world.widthPx(b) - 1} by its own tw ${b.tw} x tile ` +
           `${b.tile}`);
      bad++;
    } else if (left || right) {
      fail(`BAND EDGE (bandAt): x ${b.origin.x - 1} resolves to "${left?.id ?? 'null'}" and x ` +
           `${b.origin.x + world.widthPx(b)} to "${right?.id ?? 'null'}" at "${b.id}"'s own row. ` +
           `One pixel past either edge is outside the world, which is what ` +
           `model/segments.js#sweepSpan refuses on`);
      bad++;
    } else {
      notes.push(`${b.id} ${b.origin.x}..${b.origin.x + world.widthPx(b) - 1}`);
    }
  }
  if (!bad)
    ok(`BAND EDGE (bandAt): every column of all ${world.bands.length} bands resolves to its own ` +
       `band and one pixel past either edge resolves to none (${notes.join(', ')})`);
}

/* Claim 2: the player stops dead at either edge of every band, at four
   framerates. `rules/player.js` clamps `player.x` to
   `origin.x .. origin.x + widthPx(b) - PW` on every substep. */
{
  const RATES = [30, 60, 120, 144];
  let bad = 0;
  const notes = [];
  for (const b0 of world.bands) {
    for (const side of [+1, -1]) {
      const scene = edgeScene(b0.id, side);
      for (const fps of RATES) {
        const dt = 1 / fps;
        const { b, startX } = edgeStand(scene);
        const bound = side > 0 ? b.origin.x + world.widthPx(b) - player.PW : b.origin.x;
        const n = edgeFrames(b, dt);
        let over = 0;
        for (let f = 0; f < n; f++) {
          stepReal(dt, side > 0 ? { right: true } : { left: true });
          if (side > 0 ? player.player.x > bound : player.player.x < bound) over++;
        }
        const at = player.player.x;
        const label = `${b.id} ${side > 0 ? 'right' : 'left'} @${fps}`;
        if (startX === bound) {
          fail(`BAND EDGE (player): the ${label} scene starts the player already on the bound ` +
               `(${bound}), so the walk into it is not under test`);
          bad++;
        } else if (over) {
          fail(`BAND EDGE (player): the player was outside ${bound} on ${over} of ${n} substeps ` +
               `walking ${label}, ending at ${at}. The bound is origin.x ${b.origin.x} + widthPx ` +
               `${world.widthPx(b)} - PW ${player.PW}`);
          bad++;
        } else if (at !== bound) {
          fail(`BAND EDGE (player): ${label} came to rest at ${at} against a derived ${bound} ` +
               `after ${(n * dt).toFixed(2)} s of held walk from ${startX}`);
          bad++;
        } else if (player.player.band !== b) {
          fail(`BAND EDGE (player): ${label} left the band it started in for ` +
               `"${player.player.band?.id ?? 'nothing'}", so the resting x is another band's bound`);
          bad++;
        }
      }
      notes.push(`${b0.id} ${side > 0 ? 'right' : 'left'}`);
    }
  }
  if (!bad)
    ok(`BAND EDGE (player): a held walk stops exactly on origin.x and on ` +
       `origin.x + widthPx - PW (${player.PW}) in all ${world.bands.length} bands at ` +
       `${RATES.join('/')} fps, and never crosses either (${notes.join(', ')})`);
}

/* Claim 3: the camera window never leaves the band and ends flush with its
   edge at rest. Asserted as the property rather than as a second copy of
   `shell/main.js#clampCam`'s own x expression. */
{
  let bad = 0, tested = 0, skipped = 0;
  const notes = [];
  for (const b0 of world.bands) {
    for (const side of [+1, -1]) {
      const { b } = edgeScene(b0.id, side);
      const w = world.widthPx(b);
      if (w <= canvas.VIEW.w) { skipped++; continue; }
      tested++;
      const n = edgeFrames(b, main.STEP);
      let out = 0, firstOut = '';
      for (let f = 0; f < n; f++) {
        stepReal(main.STEP, side > 0 ? { right: true } : { left: true });
        if (main.cam.x < b.origin.x || main.cam.x + canvas.VIEW.w > b.origin.x + w) {
          out++;
          if (!firstOut) firstOut = `substep ${f} at cam.x ${main.cam.x}`;
        }
      }
      const flush = side > 0 ? main.cam.x + canvas.VIEW.w === b.origin.x + w
                             : main.cam.x === b.origin.x;
      const label = `${b.id} ${side > 0 ? 'right' : 'left'}`;
      if (out) {
        fail(`BAND EDGE (camera): the ${canvas.VIEW.w} px window showed ground outside "${b.id}" ` +
             `(x ${b.origin.x}..${b.origin.x + w}) on ${out} of ${n} substeps walking ${label}, ` +
             `first ${firstOut}`);
        bad++;
      } else if (!flush) {
        fail(`BAND EDGE (camera): walking ${label} left cam.x ${main.cam.x} with the window ` +
             `${side > 0 ? b.origin.x + w - (main.cam.x + canvas.VIEW.w) : main.cam.x - b.origin.x} px ` +
             `short of the edge, so the camera stops before the world does`);
        bad++;
      } else {
        notes.push(`${label} ${main.cam.x}`);
      }
    }
  }
  if (!tested)
    fail(`BAND EDGE (camera): every band is narrower than the ${canvas.VIEW.w} px viewport, so ` +
         `clampCam centres in all of them and this claim asserts nothing`);
  else if (!bad)
    ok(`BAND EDGE (camera): the ${canvas.VIEW.w} px window stays inside the band on every substep ` +
       `and comes to rest flush with both edges of ${tested / 2} band(s)` +
       (skipped ? `, ${skipped / 2} centred and skipped` : '') + ` (${notes.join(', ')})`);
}

/* Claim 4: a resize at the edge moves the camera and nothing else -- `VIEW.w`
   is a term in the camera's bound and in nothing else. `player.y` is left out:
   the body settles onto its floor by a fraction of a pixel per substep. */
{
  const SIZES = [[400, 800], [2560, 1440], [1600, 900]];
  const { b } = edgeScene('topsoil', +1);
  for (let f = 0; f < edgeFrames(b, main.STEP); f++) stepReal(main.STEP, { right: true });
  const bound = b.origin.x + world.widthPx(b) - player.PW;
  const right = b.origin.x + world.widthPx(b);
  let bad = 0;
  const notes = [];
  for (const [iw, ih] of SIZES) {
    canvas.resize(iw, ih);
    const moved = player.player.x;
    for (let f = 0; f < 600; f++) stepReal(main.STEP, {});
    const flush = main.cam.x + canvas.VIEW.w === right;
    if (moved !== bound) {
      fail(`BAND EDGE (resize): resizing to ${iw}x${ih} moved the player from ${bound} to ` +
           `${moved} before a single substep ran`);
      bad++;
    } else if (player.player.x !== bound) {
      fail(`BAND EDGE (resize): at ${canvas.VIEW.w} px of viewport the player rests at ` +
           `${player.player.x}, not on the band's own bound ${bound}`);
      bad++;
    } else if (!flush) {
      fail(`BAND EDGE (resize): at ${canvas.VIEW.w} px of viewport cam.x is ${main.cam.x}, so the ` +
           `window ends ${right - (main.cam.x + canvas.VIEW.w)} px short of the band's edge ` +
           `${right}`);
      bad++;
    } else {
      notes.push(`${canvas.VIEW.w}->${main.cam.x}`);
    }
  }
  if (!bad)
    ok(`BAND EDGE (resize): three viewports down to core/canvas.js#BASE_W_MIN leave the player on ` +
       `${bound} and the window flush with ${right} (${notes.join(', ')})`);
}


/* Claim 5: a viewport wider than the band centres it. That is `clampCam`'s
   other x branch, reached by the 16,400 px window here and by a 96-tile
   platform in play. */
{
  const { b } = edgeScene('topsoil', +1);
  for (let f = 0; f < edgeFrames(b, main.STEP); f++) stepReal(main.STEP, { right: true });
  const held = player.player.x;
  const w = world.widthPx(b);

  /* Wide enough that `ceil(iw / scale)` clears the band by a few pixels. */
  canvas.resize((w + 8) * 2, 900);
  for (let f = 0; f < 600; f++) stepReal(main.STEP, {});
  const left = b.origin.x - main.cam.x;
  const right = (main.cam.x + canvas.VIEW.w) - (b.origin.x + w);
  canvas.resize(1600, 900);

  if (canvas.VIEW.w >= w)
    fail(`BAND EDGE (centred): the harness viewport did not come back under the band's ${w} px, ` +
         `so every claim after this one runs on a centred camera`);
  else if (left <= 0 || right <= 0)
    fail(`BAND EDGE (centred): a viewport wider than the ${w} px band left ${left} px of margin on ` +
         `the left and ${right} on the right, so part of the band is off screen`);
  else if (left !== right)
    fail(`BAND EDGE (centred): a viewport wider than the ${w} px band put ${left} px of margin on ` +
         `the left and ${right} on the right; clampCam centres rather than clamping to a corner`);
  else if (player.player.x !== held)
    fail(`BAND EDGE (centred): widening the viewport moved the player from ${held} to ` +
         `${player.player.x}`);
  else
    ok(`BAND EDGE (centred): a viewport wider than the ${w} px band shows all of it with ${left} px ` +
       `of margin on each side, and the player does not move`);
}

console.log('\n8t. THE KEYBOARD AIM REACHES WHAT THE BODY OCCUPIES');

/* `rules/mining.js#aimAtKeys` resolves the tiles a held direction points at,
   for a body two tiles tall. Resolving one tile at the centre row makes
   holding right + dig move the player exactly as far as right alone. */

/* A corridor in `topsoil` away from spawn, four rows of headroom over a stone
   floor. The stock pick is collected deliberately: `rules/generate.js` drops
   one on the ground rather than granting it, so without it nothing breaks. */
const AIM_TX = 40, AIM_TY = 120;
function aimScene(seed = 1461) {
  boot.newRun(seed);
  const b = world.bandOf('topsoil');
  for (let dx = -4; dx <= 10; dx++) {
    for (let dy = -4; dy <= -1; dy++) tiles.write.clear(b, AIM_TX + dx, AIM_TY + dy);
    tiles.write.set(b, AIM_TX + dx, AIM_TY, D_sub.S.stone, D_form.NATIVE);
  }
  mining.write.clearAll();
  digqueue.write.clearAll();
  run.write.collect(D_sub.S.pick, D_form.F.relic, 1);
  player.write.band(b);
  player.write.move(world.worldX(b, AIM_TX), world.worldY(b, AIM_TY - 2));
  player.write.vel(0, 0);
  player.write.set('onGround', true);
  player.write.set('fallFrom', player.player.y);
  return { b, tx: AIM_TX, ty: AIM_TY };
}

/* Seconds one tile of `subId` costs the held pick, from the rows that set the
   price. The same expression the framerate claim below uses. */
function digSecs(subId, n = 1) {
  const row = D_sub.SUB[D_sub.S[subId]].tile;
  return n * row.hard * (row.charge ?? 1) /
         (mods.eff('pickPower') * (run.bestTool()?.power ?? 1));
}

/* Claim 1: a held `right` + `dig` brings down a two-tile wall and the player
   walks through it. A single-row aim breaks the belly tile, finds the air it
   just made, and stalls forever with the head tile still in place. */
{
  const { b, tx, ty } = aimScene();
  const wall = tx + 2;
  const rows = [ty - 1, ty - 2];
  for (const r of rows) tiles.write.set(b, wall, r, D_sub.S.stone, D_form.NATIVE);
  const flush = world.worldX(b, wall) - player.PW;
  const want = digSecs('stone', rows.length);

  let walk = 0;
  const walkCap = Math.ceil(4 * b.tile / mods.eff('walk') / main.STEP) * 3;
  while (walk < walkCap && player.player.x < flush) { stepReal(main.STEP, { right: true }); walk++; }
  const pressed = player.player.x;

  const reach = mods.eff('reach');
  const c = player.playerCentre();
  const far = rows.filter(r => Math.hypot(world.worldX(b, wall) + b.tile / 2 - c.x,
                                          world.worldY(b, r) + b.tile / 2 - c.y) > reach);

  const standing = () => rows.filter(r => tiles.tileAt(b, wall, r) !== D_form.AIR);
  let n = 0;
  const cap = Math.ceil(want * 4 / main.STEP);
  while (n < cap && standing().length) { stepReal(main.STEP, { right: true, dig: true }); n++; }
  const took = n * main.STEP;

  let past = 0;
  const pastCap = Math.ceil(3 * b.tile / mods.eff('walk') / main.STEP) * 3;
  while (past < pastCap && player.player.x < world.worldX(b, wall + 1)) {
    stepReal(main.STEP, { right: true });
    past++;
  }

  const tol = main.STEP * 4;
  if (pressed !== flush)
    fail(`KEY AIM (sideways): the player stopped at ${pressed} walking into the wall at ` +
         `column ${wall}, not flush against it at ${flush}, so nothing below aims at two rows`);
  else if (far.length)
    fail(`KEY AIM (sideways): ${far.length} of the ${rows.length} wall rows start outside ` +
         `eff('reach') (${reach}), so the probe measures reach and not the aim`);
  else if (standing().length)
    fail(`KEY AIM (sideways): ${standing().length} of ${rows.length} rows of a two-tile wall are ` +
         `still standing after ${took.toFixed(2)} s of held right + dig, against a derived ` +
         `${want.toFixed(2)} s. The aim resolves one row and never retargets the other `);
  else if (Math.abs(took - want) > tol)
    fail(`KEY AIM (sideways): a two-tile stone wall took ${took.toFixed(4)} s against a derived ` +
         `${want.toFixed(4)} s (tile.hard x charge / power, twice), outside ${tol.toFixed(4)} s. ` +
         `Two rows must cost two rows`);
  else if (player.player.x < world.worldX(b, wall + 1))
    fail(`KEY AIM (sideways): the wall came down and the player is still at ${player.player.x}, ` +
         `short of column ${wall + 1} at ${world.worldX(b, wall + 1)} after a further ` +
         `${(past * main.STEP).toFixed(2)} s of held right`);
  else
    ok(`KEY AIM (sideways): a two-tile stone wall two columns ahead comes down in ` +
       `${took.toFixed(3)} s of held right + dig against a derived ${want.toFixed(3)} s, and the ` +
       `player then walks through to x ${player.player.x}`);
}

/* Claim 2: a held `up` + `dig` breaks the ceiling and a held `down` + `dig`
   breaks the floor. The down half is what proves the up half non-vacuous:
   scene, pick, loop and arithmetic are shared, so only the aim can differ. */
{
  const want = digSecs('stone');
  const tol = main.STEP * 4;
  let bad = 0;
  const notes = [];
  for (const dir of ['up', 'down']) {
    const { b, tx, ty } = aimScene();
    const roof = ty - 3;
    const cols = [tx - 1, tx, tx + 1];
    for (const c of cols) tiles.write.set(b, c, roof, D_sub.S.stone, D_form.NATIVE);
    const target = dir === 'up' ? roof : ty;

    const broke = () => cols.some(c => tiles.tileAt(b, c, target) === D_form.AIR);
    if (broke()) {
      fail(`KEY AIM (${dir}): the ${dir === 'up' ? 'ceiling' : 'floor'} row is already open before ` +
           `a swing, so the scene proves nothing`);
      bad++;
      continue;
    }
    let n = 0;
    const cap = Math.ceil(want * 8 / main.STEP);
    while (n < cap && !broke()) { stepReal(main.STEP, { [dir]: true, dig: true }); n++; }
    const took = n * main.STEP;

    if (!broke()) {
      fail(`KEY AIM (${dir}): ${cols.length} columns of solid stone ` +
           `${dir === 'up' ? 'above the head' : 'under the feet'} survived ${took.toFixed(2)} s of ` +
           `held ${dir} + dig, against a derived ${want.toFixed(2)} s for one tile. The aim never ` +
           `reaches the row past the body`);
      bad++;
    } else if (Math.abs(took - want) > tol) {
      fail(`KEY AIM (${dir}): the row broke in ${took.toFixed(4)} s against a derived ` +
           `${want.toFixed(4)} s, outside ${tol.toFixed(4)} s`);
      bad++;
    } else {
      notes.push(`${dir} ${took.toFixed(3)}s`);
    }
  }
  if (!bad)
    ok(`KEY AIM (vertical): held up + dig and held down + dig each break their own row in the ` +
       `derived ${want.toFixed(3)} s (${notes.join(', ')})`);
}

console.log('\n8u. BELTS ARE DRIVEN, AND STEEP ONES DO NOT GRIP');

/* A belt is one tile and a run of touching tiles turns as one, off whatever
   drive reaches any of them. Nothing here burns fuel: the whole of a belt's
   cost is the torque it takes off its drivetrain. */
{
  const beltRun = (seed, cells, extra = {}) => driveRig({
    seed, room: { tx0: 5, ty0: 100, h: 18, w: 20 },
    machines: [['winch', 12, 115], ...cells.map(([tx, ty]) => ['belt_r', tx, ty])],
    player: [11, 115], ...extra
  });

  /* Resting on the floor line under a belt tile, which is where a landed item
     settles: the belt's footprint bottom is the top of its own footing. */
  const drop = (band, m, sub = 'copper', form = 'ore') => {
    const half = items.sizeOf({ sub: D_sub.S[sub], form: D_form.F[form], mod: null }) / 2;
    const it = items.write.spawn(band, m.box.x + m.box.w / 2, m.box.y + m.box.h - half,
                                 D_sub.S[sub], D_form.F[form], 0, 0);
    it.rest = 1;
    return it;
  };

  const FLAT = [[13, 115], [14, 115], [15, 115], [16, 115]];
  const DT = 1 / 120, N = 48;

  /* `rules/belts.js` reads the drive `rules/drive.js` wrote on the previous
     substep, so the first substep of a hold moves nothing. */
  const want = mods.eff('beltSpeed') * (N - 1) * DT;

  let bad = 0;

  const held = beltRun(8600, FLAT);
  const a = drop(held.band, held.placed[1]);
  const ax0 = a.x;
  runReal(N, DT, { hasMouse: false, action: true });
  const moved = a.x - ax0;

  const idle = beltRun(8601, FLAT);
  const b = drop(idle.band, idle.placed[1]);
  const bx0 = b.x;
  runReal(N, DT, { hasMouse: false });
  const still = b.x - bx0;

  if (Math.abs(moved - want) > 1e-6) {
    fail(`BELT (driven): a held winch should carry the ore ${want.toFixed(4)} px in ` +
         `${(N * DT).toFixed(2)} s at eff('beltSpeed') ${mods.eff('beltSpeed')} px/s; it moved ` +
         `${moved.toFixed(4)} px`);
    bad++;
  }
  if (still !== 0) {
    fail(`BELT (idle): with nobody turning the winch the run has no drive, so the ore must not ` +
         `move at all; it moved ${still.toFixed(4)} px`);
    bad++;
  }
  if (!bad)
    ok(`BELT (driven): a 4-tile run carries ore ${moved.toFixed(2)} px while the winch is held ` +
       `and ${still.toFixed(2)} px when it is not`);
}

/* The 30-degree limit, measured over the whole run rather than step to step:
   a run climbing one row every two tiles is 18 degrees and grips, and one
   climbing every tile is 45 and does not. */
{
  const rig = (seed, cells) => driveRig({
    seed, room: { tx0: 5, ty0: 100, h: 18, w: 20 },
    machines: [['winch', 12, 115], ...cells.map(([tx, ty]) => ['belt_r', tx, ty])],
    player: [11, 115]
  });
  const drop = (band, m) => {
    const half = items.sizeOf({ sub: D_sub.S.copper, form: D_form.F.ore, mod: null }) / 2;
    const it = items.write.spawn(band, m.box.x + m.box.w / 2, m.box.y + m.box.h - half,
                                 D_sub.S.copper, D_form.F.ore, 0, 0);
    it.rest = 1;
    return it;
  };

  /* sin of the run, as `rules/belts.js` computes it: rise over the diagonal
     between the extreme columns. */
  const sine = cells => {
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const dx = Math.max(...xs) - Math.min(...xs);
    const dy = ys[xs.indexOf(Math.max(...xs))] - ys[xs.indexOf(Math.min(...xs))];
    return Math.abs(dy) / Math.hypot(dx, dy);
  };

  const STEEP  = [[13, 115], [14, 114], [15, 113], [16, 112]];
  const SHALLOW = [[13, 115], [14, 115], [15, 114], [16, 114]];
  const LIMIT = mods.eff('beltMaxSlope');
  let bad = 0;

  const s = rig(8610, STEEP);
  const si = drop(s.band, s.placed[4]);            // the topmost tile of the climb
  const sx0 = si.x;
  runReal(60, 1 / 120, { hasMouse: false, action: true });
  const sdx = si.x - sx0;

  const h = rig(8611, SHALLOW);
  const hi = drop(h.band, h.placed[1]);            // the lowest tile of the climb
  const hx0 = hi.x, hy0 = hi.y;
  runReal(60, 1 / 120, { hasMouse: false, action: true });
  const hdx = hi.x - hx0, hdy = hi.y - hy0;

  if (!s.placed.slice(1).every(m => m.slip)) {
    fail(`BELT (steep): a run at sin ${sine(STEEP).toFixed(3)} is over eff('beltMaxSlope') ` +
         `(${LIMIT}) and every tile of it must read slip, for the warning the player sees`);
    bad++;
  }
  if (!(sdx < 0)) {
    fail(`BELT (steep): the ore on a run too steep to grip must run back downhill even while the ` +
         `winch is held; it moved ${sdx.toFixed(3)} px, and downhill is negative x here`);
    bad++;
  }
  if (h.placed.slice(1).some(m => m.slip)) {
    fail(`BELT (shallow): a run at sin ${sine(SHALLOW).toFixed(3)} is under eff('beltMaxSlope') ` +
         `(${LIMIT}) and must not read slip on any tile`);
    bad++;
  }
  if (!(hdx > 0 && hdy < 0)) {
    fail(`BELT (shallow): a gripping run must carry the ore forward and up the step; it moved ` +
         `${hdx.toFixed(3)} px in x and ${hdy.toFixed(3)} px in y, where up is negative y`);
    bad++;
  }
  if (!bad)
    ok(`BELT (slope): sin ${sine(STEEP).toFixed(3)} slips and runs the ore ${sdx.toFixed(1)} px back ` +
       `downhill; sin ${sine(SHALLOW).toFixed(3)} grips and carries it ${hdx.toFixed(1)} px along and ` +
       `${(-hdy).toFixed(1)} px up, against a limit of ${LIMIT}`);
}

/* Belts and buckets spend one budget. A run long enough to oversubscribe a
   winch slows the bucket it shares that winch with, which is the whole reason
   a belt costs anything at all. */
{
  const DRAG = mods.eff('beltDrag');
  const LINE = [];
  for (let tx = 7; tx <= 18; tx++) LINE.push(['belt_r', tx, 115]);

  const build = (seed, belts) => driveRig({
    seed, room: { tx0: 5, ty0: 100, h: 18, w: 20 },
    machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115], ...(belts ? LINE : [])],
    links: [[0, 1]], player: [18, 115]
  });

  const vAlone = measureV(build(8620, false).seg, 1, 1 / 120, { action: true });
  const vShared = measureV(build(8621, true).seg, 1, 1 / 120, { action: true });

  const demand = mods.eff('segBase') + mods.eff('segFric') + LINE.length * DRAG;
  const wantAlone = predictV(winchTorque(), 0, 1);
  const wantShared = predictV(winchTorque(), 0, 1, demand, 1, winchTorque());

  let bad = 0;
  for (const [label, got, wanted] of [
    ['on its own', vAlone, wantAlone],
    ['sharing with 12 belt tiles', vShared, wantShared]
  ])
    if (Math.abs(got - wanted) > 1e-6) {
      fail(`BELT (budget): the bucket ${label} should climb at ${wanted.toFixed(4)} px/s, ` +
           `measured ${got.toFixed(4)}`);
      bad++;
    }
  if (!bad && !(vShared < vAlone)) {
    fail(`BELT (budget): ${LINE.length} belt tiles at ${DRAG} each raise demand to ` +
         `${demand.toFixed(2)} against a supply of ${winchTorque().toFixed(2)}, so the bucket must ` +
         `climb slower than the ${vAlone.toFixed(3)} px/s it manages alone`);
    bad++;
  }
  if (!bad)
    ok(`BELT (budget): ${LINE.length} tiles at ${DRAG} torque each take the shared bucket from ` +
       `${vAlone.toFixed(2)} to ${vShared.toFixed(2)} px/s (demand ${demand.toFixed(2)}, supply ` +
       `${winchTorque().toFixed(2)})`);
}

console.log('\n8v. THE CONTRAPTION RUNS STANDARD CRAFTS, AND ONLY SOME OF THEM');

/* The device half of "a standard craft runs in the hands or in a contraption".
   It knows the repetitive intermediates and nothing that builds a machine, so
   a fed pile cannot be spent on whichever machine is declared first. */
{
  boot.newRun(8700);
  const band = world.bandOf('topsoil');
  for (let ty = 110; ty <= 118; ty++)
    for (let tx = 16; tx <= 29; tx++) tiles.write.clear(band, tx, ty);
  for (let tx = 16; tx <= 29; tx++) tiles.write.set(band, tx, 119, D_sub.S.stone);
  player.write.band(band);
  player.write.move(world.worldX(band, 22), world.worldY(band, 117));
  player.write.vel(0, 0);

  const m = machs.write.place(band, D_mach.M.contraption, 25, 117);
  for (let i = 0; i < D_mach.MACH[m.def].footing; i++)
    tiles.write.set(band, m.tx + i, m.ty + D_mach.MACH[m.def].th, D_sub.S.stone);

  const BLOCK = D_recipes.RECIPES.stone_block;
  const before = items.items.length;
  /* 15, not 10: enough for one block and not two, so the leftover proves the
     chooser stopped rather than draining the buffer. */
  machs.write.take(m, D_sub.S.stone, D_form.F.gravel, 15);
  runReal(Math.ceil(BLOCK.secs * 120) + 240, 1 / 120, { hasMouse: false });

  const made = items.items.filter(it => it.sub === D_sub.S.stone && it.form === D_form.F.block);
  const left = m.buf[items.keyOf(D_sub.S.stone, D_form.F.gravel)] || 0;

  let bad = 0;
  if (!made.length) {
    fail(`CONTRAPTION: 15 stone/gravel fed in produced no stone/block in ` +
         `${(BLOCK.secs + 2).toFixed(1)} s -- the device runs no standard craft at all ` +
         `(buffer left ${left}, items ${items.items.length - before})`);
    bad++;
  } else if (left !== 5) {
    fail(`CONTRAPTION: 15 gravel should buy exactly one 10-gravel block and leave 5; ` +
         `${left} left over`);
    bad++;
  }

  /* Its recipe list is the gate, not affordability: 15 gravel is also a whole
     kiln, and a device that knew that row would have built one. */
  const knows = D_mach.MACH[D_mach.M.contraption].recipes;
  if (knows.some(r => typeof r === 'string' && D_recipes.RECIPES[r]?.out
                      ?.some(c => D_sub.SUB[D_sub.S[c.sub]]?.tags?.includes('machine')))) {
    fail(`CONTRAPTION: its recipe list names a machine-build row (${knows.join(', ')}) -- ` +
         `a machine is built deliberately, by hand, and never by a chooser taking the first ` +
         `affordable row out of a fed pile`);
    bad++;
  }

  if (!bad)
    ok(`CONTRAPTION: 15 stone/gravel in makes ${made.length} stone/block and leaves ${left} ` +
       `in the buffer, and its ${knows.length} recipes (${knows.join(', ')}) build no machine`);
}

console.log('\n8w. A ROPE IS A LOOP, AND A DESCENDING BUCKET PAYS FOR AN ASCENDING ONE');

/* The whole of why a rope carries several buckets. Each costs `segBase` to
   lift and `segLoad x mass x slope` for its load, and one on the way down
   gives both back -- so an empty bucket opposite a loaded one cancels its own
   tare, and a loaded one opposite a loaded one cancels almost everything. */
{
  const ORE = items.massOfPair(D_sub.S.copper, D_form.F.ore);

  /* `phases` hangs one bucket per entry, and `load` says how many ore ride on
     each. Cargo is spawned at the bucket it belongs to, already at rest. */
  function loopRig(seed, phases, load) {
    const r = driveRig({
      seed, room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115]],
      links: [[0, 1]], player: [18, 115]
    });
    const seg = r.seg;
    while (seg.carriers.length) segs.write.detach(seg, seg.carriers[0]);
    segs.write.spin(seg, -seg.u, 0);
    phases.forEach((ph, i) => {
      const c = segs.write.attach(seg, ph);
      const p = segs.carrierPos(seg, c);
      for (let k = 0; k < (load[i] ?? 0); k++) {
        const it = items.write.spawn(r.band, p.x, p.y, D_sub.S.copper, D_form.F.ore, 0, 0);
        if (it) it.rest = 1;
      }
    });
    return r;
  }

  /* Heavy enough that the three arrangements come out distinct: at a light
     load all of them saturate at `segUp` and the comparison proves nothing. */
  const UNITS = 40;
  const MASS = UNITS * ORE;
  const base = mods.eff('segBase'), load = mods.eff('segLoad'), fric = mods.eff('segFric');
  const speedOf = r => travel(r.seg, 0.25, 1 / 120, { action: true }) / 0.25;

  /* The three arrangements, and what the law says each nets out to. */
  const alone    = speedOf(loopRig(8800, [0], [UNITS]));
  const opposed  = speedOf(loopRig(8801, [0, 0.5], [UNITS, 0]));
  const balanced = speedOf(loopRig(8802, [0, 0.5], [UNITS, UNITS]));

  const vFor = net => {
    const tau = winchTorque();
    const asks = Math.max(0, net) + fric;
    const force = tau - net;
    if (force > fric)
      return mods.eff('segUp') * Math.min(1, (force - fric) / base) * Math.min(1, tau / asks);
    if (force < -fric) return -mods.eff('segDown') * Math.min(1, (-force - fric) / base);
    return 0;
  };
  const wantAlone    = vFor(base + load * MASS);
  const wantOpposed  = vFor(load * MASS);
  const wantBalanced = vFor(0);

  let bad = 0;
  for (const [label, got, want] of [
    ['one bucket', alone, wantAlone],
    ['an empty bucket opposite', opposed, wantOpposed],
    ['an equally loaded bucket opposite', balanced, wantBalanced]
  ])
    if (Math.abs(got - want) > 1e-4) {
      fail(`COUNTERWEIGHT: with ${label} the rope should run at ${want.toFixed(4)} px/s, ` +
           `measured ${got.toFixed(4)}`);
      bad++;
    }

  if (!bad && !(opposed > alone)) {
    fail(`COUNTERWEIGHT: an empty bucket on the descending strand must cancel its own tare, so the ` +
         `rope should run faster than the ${alone.toFixed(3)} px/s one bucket manages; it ran ` +
         `${opposed.toFixed(3)}`);
    bad++;
  }
  if (!bad && !(balanced > opposed)) {
    fail(`COUNTERWEIGHT: a loaded bucket coming down must pay for the one going up, so a balanced ` +
         `loop should beat ${opposed.toFixed(3)} px/s; it ran ${balanced.toFixed(3)}`);
    bad++;
  }

  /* And it is not perpetual motion: with nothing turning it, a balanced loop
     sits still rather than running on its own. */
  const idle = travel(loopRig(8803, [0, 0.5], [UNITS, UNITS]).seg, 0.5, 1 / 120, {});
  if (!bad && idle !== 0) {
    fail(`COUNTERWEIGHT: a balanced loop with nobody turning it moved ${idle.toFixed(4)} px -- ` +
         `eff('segFric') (${fric}) is what must hold it, or a chain is a free ride`);
    bad++;
  }

  if (!bad)
    ok(`COUNTERWEIGHT: ${MASS} T up runs at ${alone.toFixed(2)} px/s alone, ${opposed.toFixed(2)} with ` +
       `an empty bucket opposite, and ${balanced.toFixed(2)} with an equal load opposite -- and a ` +
       `balanced loop nobody is turning does not move at all`);
}

/* The verb the player actually uses: a held bucket aimed near a rope hangs on
   it, aimed anywhere else is refused, and the rope fills up. */
{
  const r = driveRig({
    seed: 8820, capMul: 1, room: { ty0: 100, h: 18 },
    machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115]],
    links: [[0, 1]], player: [18, 115]
  });
  const seg = r.seg;
  while (seg.carriers.length) segs.write.detach(seg, seg.carriers[0]);

  const MAX = Math.round(mods.eff('ropeBuckets'));
  const mid = carPos0(seg);
  const held = () => run.invCount(D_sub.S.bucket, D_form.F.rig);

  run.write.collect(D_sub.S.bucket, D_form.F.rig, MAX + 2);
  const onRope = R_place.attachCarrier(mid.x, mid.y, D_sub.S.bucket);
  const afterOne = held();

  /* Far from any rope: `eff('attachR')` is 12 px, so 200 is nowhere near. */
  const miss = R_place.attachCarrier(mid.x + 200, mid.y, D_sub.S.bucket);

  while (seg.carriers.length < MAX && R_place.attachCarrier(mid.x, mid.y, D_sub.S.bucket));
  const full = R_place.attachCarrier(mid.x, mid.y, D_sub.S.bucket);

  let bad = 0;
  if (!onRope || seg.carriers.length < 1) {
    fail('ATTACH: a bucket aimed at a rope did not hang on it');
    bad++;
  } else if (afterOne !== MAX + 1) {
    fail(`ATTACH: hanging one bucket left ${afterOne} in the pockets of ${MAX + 2} -- exactly one ` +
         `unit is spent`);
    bad++;
  }
  if (miss !== null) {
    fail(`ATTACH: a bucket aimed 200 px from the nearest rope was accepted; eff('attachR') is ` +
         `${mods.eff('attachR')} px`);
    bad++;
  }
  if (seg.carriers.length !== MAX || full !== null) {
    fail(`ATTACH: the rope took ${seg.carriers.length} bucket(s) against eff('ropeBuckets') ${MAX}, ` +
         `and the next was ${full ? 'accepted' : 'refused'} -- it must refuse past the limit`);
    bad++;
  }
  if (!bad)
    ok(`ATTACH: a bucket aimed at a rope hangs on it for one unit, one aimed 200 px away is refused, ` +
       `and the rope stops at eff('ropeBuckets') (${MAX})`);
}

/* One bucket hauls `bucketCap` and no more, so a chain is throughput rather
   than one enormous lift. */
{
  /* Read with no rig modifier standing: the probes above leave `bucketCap`
     lifted, and this is the one that is actually about it. */
  boot.newRun(8809);
  const ORE = items.massOfPair(D_sub.S.copper, D_form.F.ore);
  const CAP = mods.eff('bucketCap');
  const over = Math.round((CAP * 2) / ORE);

  const rig = n => {
    const r = driveRig({
      seed: 8810 + n, capMul: 1, room: { ty0: 100, h: 18 },
      machines: [['hub', 20, 115], ['hub', 20, 105], ['winch', 19, 115]],
      links: [[0, 1]], player: [18, 115]
    });
    const p = carPos(r.seg);
    for (let k = 0; k < n; k++) {
      const it = items.write.spawn(r.band, p.x, p.y, D_sub.S.copper, D_form.F.ore, 0, 0);
      if (it) it.rest = 1;
    }
    runReal(30, 1 / 120, { hasMouse: false, action: true });
    return r.seg.load;
  };

  const atCap = rig(Math.floor(CAP / ORE));
  const beyond = rig(over);

  if (Math.abs(beyond - atCap) > 1e-6)
    fail(`BUCKET CAP: ${over} ore (${(over * ORE).toFixed(1)} T) loaded one bucket to ${beyond} T, ` +
         `against ${atCap} T for a bucketful -- eff('bucketCap') is ${CAP} T and a bucket must not ` +
         `haul past it`);
  else if (!(atCap > 0 && atCap <= CAP + 1e-6))
    fail(`BUCKET CAP: a bucketful weighed ${atCap} T against a cap of ${CAP} -- the probe is not ` +
         `loading the bucket at all`);
  else
    ok(`BUCKET CAP: ${over} ore under one bucket still rides as ${beyond} T, the same as the ` +
       `${Math.floor(CAP / ORE)} that fit -- eff('bucketCap') is ${CAP} T and the rest stays behind`);
}

console.log(`\ntotals: fillRect ${calls.fillRect.toLocaleString()}, ` +
            `drawImage ${calls.drawImage.toLocaleString()}, ` +
            `journal ${journal.peek ? journal.peek().length : 0} undrained`);

if (failures) console.error(`\n${failures} CHECK(S) FAILED\n`);
else {
  console.log('\nAll checks passed.');
  console.log('This says nothing about whether it LOOKS right — open it and judge.\n');
}
