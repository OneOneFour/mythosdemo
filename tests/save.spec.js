import { expect, test } from '@playwright/test';

/* ============================================================
   THE SAVE SLOT IN A REAL BROWSER

   `tools/check.mjs` section 8r covers the payload's shape, the four version
   hashes, the 47-case refusal matrix and the round trip, all against a
   Map-backed `localStorage` stub. That stub is faithful to the three methods
   `src/shell/save.js` calls and blind to the one thing that matters here:
   a real origin, a real quota, and a real page RELOAD, which throws the whole
   module graph away and builds it again from nothing.

   So this file asserts exactly what the stub cannot. It plays a scripted run,
   saves, reloads the page, loads, and compares a fingerprint of the model
   across the two processes.

   NO SCREENSHOTS AND NO BASELINES. Nothing here is about appearance, and a
   spec that photographed a loaded run would couple a save regression to a
   palette change.

   `import('/src/shell/save.js')` inside `page.evaluate` reaches the live
   module: `tools/serve.mjs` serves untransformed ES modules, so the URL
   resolves to the same registry entry `shell/main.js` holds. `tests/visual.spec.js`
   reaches `model/run.js` the same way. Nothing in `src/` calls `save()` yet,
   which is why the module needs driving from a test at all.
   ============================================================ */

const SAVE_KEYS = ['mythos-factory/save-head', 'mythos-factory/save'];

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => globalThis.__mf && globalThis.__mf.ready);
  return errors;
}

/* A fingerprint of everything the payload claims to carry, computed in the
   page and returned as a string. Typed arrays are rolled into one number each
   -- three bands of `mat` and `seen` is 200 kB of JSON otherwise -- and the
   hash is order-sensitive, so a transposition inside a band would still show.

   `b.light` IS DELIBERATELY ABSENT. The payload does not carry it and should
   not: `rules/light.js` relaxes the field over frames from the tile grid and
   the sky, so a freshly loaded run converges to the same values rather than
   starting at them. Fingerprinting it would assert a claim `src/shell/save.js`
   never makes.

   Floats are fixed to four places. A round trip through JSON is exact for a
   double, but `run.t` accumulates and printing it is what a regression would
   be read off. */
const fingerprint = page => page.evaluate(async () => {
  const [w, items, machs, segs, mining, growth, runm, playerm, boons, rng] =
    await Promise.all(['model/world.js', 'model/items.js', 'model/machines.js',
      'model/segments.js', 'model/mining.js', 'model/growth.js', 'model/run.js',
      'model/player.js', 'model/boons.js', 'core/rng.js'].map(p => import('/src/' + p)));

  const sum = a => {
    let h = 2166136261;
    for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const r4 = v => (typeof v === 'number' ? +v.toFixed(4) : v);

  return JSON.stringify({
    bands: w.bands.map(b => ({ id: b.id, mat: sum(b.mat), seen: sum(b.seen) })),
    run: runm.run,
    player: Object.fromEntries(Object.entries(playerm.player)
      .map(([k, v]) => [k, k === 'band' ? v?.id : r4(v)])),
    items: items.items.map(it => ({ band: it.band?.id, x: r4(it.x), y: r4(it.y),
      vx: r4(it.vx), vy: r4(it.vy), sub: it.sub, form: it.form })),
    machines: machs.machines.map(m => ({ def: m.def, tx: m.tx, ty: m.ty, buf: { ...m.buf },
      prog: r4(m.prog), made: m.made, charges: m.charges, running: m.running })),
    segments: segs.segments.map(s => ({ a: machs.machines.indexOf(s.a), b: machs.machines.indexOf(s.b),
      t: +s.t.toFixed(6), dir: s.dir, load: r4(s.load) })),
    digs: mining.activeCount(),
    growth: [...growth.planted().entries()].map(([k, e]) => [k, r4(e.secs)]).sort(),
    boons: boons.boons.active.map(a => ({ id: a.id, left: r4(a.left) })),
    cursor: rng.cursor()
  }, null, 1);
});

/* Scripted play, driven through `__mf.hold`, which writes the same `cmd`
   object a keystroke writes to -- never a click coordinate, which would
   resolve against a camera this test deliberately leaves mid-ease.

   EVERY KEY IS NAMED IN EVERY PHASE, and that is not tidiness. `__mf.hold`
   sets the keys it is given and leaves the rest of `cmd` exactly as it found
   it, so a phase that says `{ dig: 1 }` after a phase that said `{ left: 1 }`
   walks left while it digs -- and the continuation after a reload, which
   starts from a fresh `cmd`, then does something else. A partial key set here
   makes the input itself a hidden part of the saved state. */
const KEYS = ['left', 'right', 'up', 'down', 'hop', 'dig', 'place', 'feed',
              'craft', 'drop', 'action', 'collect', 'hasMouse'];

const phase = (page, want, n) => page.evaluate(({ keys, want, n }) => {
  __mf.hold(Object.fromEntries(keys.map(k => [k, want[k] ? 1 : 0])), n);
}, { keys: KEYS, want, n });

async function play(page) {
  await phase(page, { right: true, collect: true }, 200);
  await phase(page, { dig: true, down: true, collect: true }, 700);
  await phase(page, { left: true }, 100);
  await phase(page, { dig: true, collect: true }, 200);
  await phase(page, {}, 240);
}

const SEED = 20260915;

test('a save survives a real page reload, exactly', async ({ page }) => {
  const errors = await boot(page);

  /* A fresh slot, so a previous run of this file cannot be what is loaded. */
  await page.evaluate(async keys => {
    const sv = await import('/src/shell/save.js');
    sv.clearSave();
    for (const k of keys) localStorage.removeItem(k);
  }, SAVE_KEYS);

  await page.evaluate(s => { __mf.newRun(s); __mf.clock.t = 10; }, SEED);
  await play(page);

  const saved = await page.evaluate(async keys => {
    const sv = await import('/src/shell/save.js');
    const wrote = sv.save();
    return { wrote, has: sv.hasSave(), bytes: keys.map(k => (localStorage.getItem(k) ?? '').length) };
  }, SAVE_KEYS);
  expect(saved.wrote).toBe(true);
  expect(saved.has).toBe(true);
  /* Both keys hold something, which is the half a stub cannot claim: these
     bytes went through a real store under a real origin. */
  expect(saved.bytes.every(n => n > 0)).toBe(true);

  const before = await fingerprint(page);

  /* THE RELOAD. Every module is re-evaluated, every typed array is
     reallocated, and the only thing that crosses is the slot. */
  await page.reload();
  await page.waitForFunction(() => globalThis.__mf && globalThis.__mf.ready);

  const loaded = await page.evaluate(async () => {
    const sv = await import('/src/shell/save.js');
    const had = sv.hasSave();
    const okLoad = sv.load(__mf.newRun);
    return { had, okLoad, reason: sv.loadError.reason };
  });
  expect(loaded.had).toBe(true);
  expect(loaded.okLoad, `load() refused: ${loaded.reason}`).toBe(true);

  const after = await fingerprint(page);
  expect(after).toBe(before);

  expect(errors).toEqual([]);
});

test('a reloaded run draws the same future as the one that was saved', async ({ page }) => {
  const errors = await boot(page);

  await page.evaluate(async () => {
    const sv = await import('/src/shell/save.js');
    sv.clearSave();
  });
  await page.evaluate(s => { __mf.newRun(s); __mf.clock.t = 10; }, SEED);
  await play(page);
  const wrote = await page.evaluate(async () => (await import('/src/shell/save.js')).save());
  expect(wrote).toBe(true);
  const clockAtSave = await page.evaluate(() => __mf.clock.t);

  /* The saved run plays on for another 5 simulated seconds. Its state here is
     the prediction the reloaded run has to reproduce, which is invariant 7
     with persistence in the game: same seed, same cursor, same input, same
     future. */
  await phase(page, { dig: true, collect: true }, 600);
  const future = await fingerprint(page);

  await page.reload();
  await page.waitForFunction(() => globalThis.__mf && globalThis.__mf.ready);
  const okLoad = await page.evaluate(async () => (await import('/src/shell/save.js')).load(__mf.newRun));
  expect(okLoad).toBe(true);

  /* THE CLOCK IS PUT BACK BY THIS TEST, because the payload does not carry it
     and should not -- `clock.t` is `shell`-owned and no `rules` module reads
     it. One thing does read it into model state: `shell/main.js:163` gates
     `player.digging`, the pickaxe-swing blink, on `((clock.t * 9) | 0) % 2`.
     Leave the clock at 0 and the two runs disagree about that one flag while
     agreeing about the world, which says nothing about the save. */
  await page.evaluate(t => { __mf.clock.t = t; }, clockAtSave);

  await phase(page, { dig: true, collect: true }, 600);
  expect(await fingerprint(page)).toBe(future);

  expect(errors).toEqual([]);
});
