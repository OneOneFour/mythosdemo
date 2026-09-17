import { expect, test } from '@playwright/test';

/* The save slot in a real browser: plays a scripted run, saves, reloads the
   page, loads, and compares a fingerprint of the model across the two
   processes. The reload is what a Map-backed `localStorage` stub cannot do --
   it throws the module graph away and rebuilds it under a real origin. No
   screenshots, so a palette change cannot fail a save test.
   `import('/src/shell/save.js')` inside `page.evaluate` reaches the live
   module because the dev server serves untransformed ES modules. */

const SAVE_KEYS = ['mythos-factory/save-head', 'mythos-factory/save'];

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => globalThis.__mf && globalThis.__mf.ready);
  return errors;
}

/* Fingerprint of everything the payload claims to carry, computed in the page.
   Typed arrays roll into one order-sensitive number each, so a transposition
   inside a band still shows; floats round because `run.t` accumulates.
   `b.light` is absent because a loaded run relaxes to it rather than loads it. */
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

/* Scripted play through `__mf.hold`, which writes the same `cmd` object a
   keystroke writes to, never a click coordinate resolved against a mid-ease
   camera. `hold` leaves keys it is not given exactly as it found them, so
   every phase names every key or the input becomes hidden saved state. */
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
  /* Both keys hold bytes, written through a real store under a real origin. */
  expect(saved.bytes.every(n => n > 0)).toBe(true);

  const before = await fingerprint(page);

  /* Re-evaluates every module and reallocates every typed array; the slot is
     the only thing that crosses. */
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

  /* The saved run plays on for another 5 simulated seconds; that state is the
     prediction the reloaded run must reproduce from the same seed, cursor and
     input. */
  await phase(page, { dig: true, collect: true }, 600);
  const future = await fingerprint(page);

  await page.reload();
  await page.waitForFunction(() => globalThis.__mf && globalThis.__mf.ready);
  const okLoad = await page.evaluate(async () => (await import('/src/shell/save.js')).load(__mf.newRun));
  expect(okLoad).toBe(true);

  /* The payload does not carry `clock.t`, but `shell/main.js` gates the
     pickaxe-swing blink `player.digging` on it, so the two runs have to start
     it at the same value to agree about that one flag. */
  await page.evaluate(t => { __mf.clock.t = t; }, clockAtSave);

  await phase(page, { dig: true, collect: true }, 600);
  expect(await fingerprint(page)).toBe(future);

  expect(errors).toEqual([]);
});
