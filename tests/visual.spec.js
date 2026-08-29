import { expect, test } from '@playwright/test';

/* ============================================================
   VISUAL REGRESSION

   tools/check.mjs verifies behaviour and explicitly cannot verify
   appearance. This file covers that gap.

   Every scene drives the real game through the ?test=1 hook at a
   fixed dt, so the frame is bit-reproducible: the RNG is seeded from
   the run seed, rendering consumes no randomness, all coordinates are
   integers, and text is a bitmap font drawn with fillRect. The diff
   threshold is therefore 0 — a single changed pixel fails.

   A human still approves the first baseline. After that the machine
   guards it. Run `npx playwright test --update-snapshots` to re-accept
   a deliberate visual change, and say in the commit why it changed.
   ============================================================ */

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => globalThis.__mf && globalThis.__mf.ready);
  return errors;
}

const shot = (page, name) =>
  expect(page.locator('#stage')).toHaveScreenshot(name);


test('boots with no console or page errors', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => __mf.frames(120));
  expect(errors).toEqual([]);
});

test('surface at spawn, title card up', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { __mf.newRun(1337); __mf.frames(1); });
  await shot(page, 'surface-spawn.png');
});

test('surface after the title fades', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    __mf.newRun(1337);
    __mf.state.clock.t = 10;        // past the title fade
    __mf.frames(2);
  });
  await shot(page, 'surface-settled.png');
});

test('walking right reaches the olive tree', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    __mf.newRun(1337);
    __mf.state.clock.t = 10;
    __mf.hold({ right: 1 }, 90);
  });
  await shot(page, 'surface-tree.png');
});

test('a dug shaft with ore resting at the bottom', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const g = await import('/src/world/grid.js');
    const t = await import('/src/world/tiles.js');
    const gen = await import('/src/world/generate.js');
    const pl = await import('/src/sim/player.js');
    const it = await import('/src/sim/items.js');
    __mf.newRun(1337);
    __mf.state.clock.t = 10;
    __mf.state.run.hasPick = true;
    const col = gen.SPAWN_TX, s0 = gen.surface[col];
    for (let y = s0; y < s0 + 12; y++) {
      g.setTile(col, y, t.AIR);
      g.setTile(col + 1, y, t.AIR);
    }
    pl.spawnPlayer(col, s0 + 9);
    for (let k = 0; k < 5; k++)
      it.spawnItem(col * 8 + 6, (s0 + 2) * 8, 'copper', 0, 0);
    __mf.frames(150);
  });
  await shot(page, 'shaft-with-ore.png');
});

test('ladders in a shaft read as climbable', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const g = await import('/src/world/grid.js');
    const t = await import('/src/world/tiles.js');
    const gen = await import('/src/world/generate.js');
    const pl = await import('/src/sim/player.js');
    __mf.newRun(1337);
    __mf.state.clock.t = 10;
    const col = gen.SPAWN_TX, s0 = gen.surface[col];
    for (let y = s0; y < s0 + 12; y++) {
      g.setTile(col, y, t.AIR);
      g.setTile(col + 1, y, t.AIR);
    }
    for (let y = s0; y < s0 + 12; y++) g.setTile(col, y, t.T.ladder);
    pl.spawnPlayer(col, s0 + 5);
    __mf.frames(30);
  });
  await shot(page, 'shaft-ladders.png');
});

test('the furnace lit at the bottom of a shaft', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const g = await import('/src/world/grid.js');
    const t = await import('/src/world/tiles.js');
    const gen = await import('/src/world/generate.js');
    const pl = await import('/src/sim/player.js');
    const st = await import('/src/sim/structures.js');
    const it = await import('/src/sim/items.js');
    __mf.newRun(1337);
    __mf.state.clock.t = 10;
    const col = gen.SPAWN_TX, s0 = gen.surface[col];
    for (let y = s0; y < s0 + 12; y++)
      for (let i = -1; i <= 2; i++) g.setTile(col + i, y, t.AIR);
    for (let i = -1; i <= 2; i++) g.setTile(col + i, s0 + 12, t.T.lime);
    st.placeFurnace(col - 1, s0 + 10);
    pl.spawnPlayer(col + 2, s0 + 10);
    for (let k = 0; k < 4; k++) it.spawnItem(col * 8 + 4, (s0 + 2) * 8, 'copper', 0, 0);
    for (let k = 0; k < 2; k++) it.spawnItem(col * 8 + 4, (s0 + 2) * 8, 'timber', 0, 0);
    __mf.frames(240);
  });
  await shot(page, 'furnace-lit.png');
});

test('the altar risen with the trial posted', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const tut = await import('/src/sim/tutorial.js');
    __mf.newRun(1337);
    __mf.state.clock.t = 10;
    tut.altar.risen = true;
    __mf.state.run.trial = { need: 10, have: 4, done: false,
                             what: 'RAW COPPER', from: 'ZEUS' };
    __mf.state.run.inv.copper = 4;
    __mf.frames(120);
  });
  await shot(page, 'altar-trial.png');
});

test('deep strata and the granite band', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    __mf.newRun(1337);
    __mf.state.clock.t = 10;
    __mf.frames(1);
    // park the camera deep; the sim is not driven, only the view
    __mf.state.cam.y = 130 * 8;
    __mf.state.cam.x = 40 * 8;
    __mf.state.run.hasPick = false;
    __mf.state.run.trial = null;
    __mf.frames(1);
  });
  await shot(page, 'deep-granite.png');
});

test('death screen', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    __mf.newRun(1337);
    __mf.state.clock.t = 10;
    __mf.state.run.dead = true;
    __mf.state.run.hearts = 0;
    __mf.state.run.deathCause = 'A 26-TILE FALL';
    __mf.state.run.deepest = 300 * 8;
    __mf.frames(2);
  });
  await shot(page, 'death-screen.png');
});

test('chunk-seam check: grid and chunk overlays on', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    __mf.newRun(1337);
    __mf.state.clock.t = 10;
    __mf.state.view.showGrid = true;
    __mf.state.view.showChunks = true;
    __mf.frames(2);
  });
  await shot(page, 'overlays-seams.png');
});

test('the same seed renders identically twice', async ({ page }) => {
  await boot(page);
  const hashOf = () => page.evaluate(() => {
    __mf.newRun(4242);
    __mf.state.clock.t = 10;
    __mf.frames(200);
    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) {
      h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  });
  const a = await hashOf();
  const b = await hashOf();
  expect(b).toBe(a);
});
