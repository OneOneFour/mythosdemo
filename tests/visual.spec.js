import { expect, test } from '@playwright/test';

/* ============================================================
   VISUAL REGRESSION

   `tools/check.mjs` verifies behaviour and explicitly cannot verify
   appearance. This covers that gap — and only that gap. A passing
   screenshot means the pixels have not CHANGED. It does not mean they
   are right; that still needs a human.

   These baselines were taken immediately after the architecture
   refactor and are UNREVIEWED. Treat the first human look at the game
   as the real acceptance test, and re-baseline deliberately after it.

   Diffs are bit-exact (maxDiffPixels: 0) because the renderer is
   deterministic by construction: seeded RNG, rendering consumes no
   randomness, integer-only pixels, and a bitmap font drawn with
   fillRect rather than fillText.
   ============================================================ */

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => globalThis.__mf && globalThis.__mf.ready);
  return errors;
}

const shot = (page, name) => expect(page.locator('#stage')).toHaveScreenshot(name);

/* Past the title fade, so a scene shot is not dominated by it. */
const settle = async (page, seed = 1337) =>
  page.evaluate(s => { __mf.newRun(s); __mf.clock.t = 10; __mf.frames(2); }, seed);


test('boots with no console or page errors', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => __mf.frames(240));
  expect(errors).toEqual([]);
});

test('surface band at spawn', async ({ page }) => {
  await boot(page);
  await settle(page);
  await shot(page, 'surface.png');
});

test('walking right', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(() => __mf.hold({ right: 1 }, 240));
  await shot(page, 'surface-walk.png');
});

test('digging down into topsoil', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(() => {
    __mf.hold({ dig: 1, down: 1 }, 900);
    __mf.frames(120);
  });
  await shot(page, 'digging.png');
});

test('the astral band', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const w = await import('/src/model/world.js');
    const astral = w.bands.find(b => b.id === 'astral');
    __mf.cam.x = astral.origin.x;
    __mf.cam.y = astral.origin.y;
    __mf.draw();
  });
  await shot(page, 'astral.png');
});

test('the topsoil band', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const w = await import('/src/model/world.js');
    const top = w.bands.find(b => b.id === 'topsoil');
    __mf.cam.x = top.origin.x;
    __mf.cam.y = top.origin.y + 200;
    __mf.draw();
  });
  await shot(page, 'topsoil.png');
});

test('a placed furnace', async ({ page }) => {
  await boot(page);
  await settle(page);
  /* Keyboard aim, not mouse: a hardcoded click position is off-canvas at phone
     size, where the base buffer is 200x422. Aim below the player, then press the
     build key — placement is a shell INTENT, not a step. */
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.hold({ down: 1 }, 4); });
  await page.keyboard.press('f');
  await page.evaluate(() => __mf.frames(240));
  await shot(page, 'furnace.png');
});

test('debug overlays on, for seam inspection', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(() => {
    __mf.flags.showGrid = true;
    __mf.flags.showChunks = true;
    __mf.flags.showDebug = true;
    __mf.frames(2);
  });
  await shot(page, 'overlays.png');
});

test('the same seed renders identically twice', async ({ page }) => {
  await boot(page);
  const hashOf = () => page.evaluate(() => {
    __mf.newRun(4242);
    __mf.clock.t = 10;
    __mf.hold({ right: 1, dig: 1 }, 600);
    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) {
      h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  });
  expect(await hashOf()).toBe(await hashOf());
});

/* Dev serves src/ untransformed; dist is bundled and minified by esbuild.
   That is a real divergence risk, so it is asserted rather than assumed.
   Requires `npm run build` first — `npm run parity` does both. */
test('parity: the built artifact renders identically to dev', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  const SCENE = () => {
    __mf.newRun(9001);
    __mf.clock.t = 10;
    __mf.hold({ right: 1 }, 120);
    __mf.hold({ dig: 1, down: 1 }, 600);
    __mf.frames(120);
    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) {
      h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
      h = Math.imul(h, 16777619);
    }
    return { hash: h >>> 0, w: c.width, h2: c.height };
  };

  await page.goto('/?test=1');
  await page.waitForFunction(() => globalThis.__mf?.ready);
  const dev = await page.evaluate(SCENE);

  await page.goto('/dist/mythos-factory.html?test=1');
  await page.waitForFunction(() => globalThis.__mf?.ready);
  const built = await page.evaluate(SCENE);

  expect(errors).toEqual([]);
  expect(built.w).toBe(dev.w);
  expect(built.h2).toBe(dev.h2);
  expect(built.hash).toBe(dev.hash);
});
