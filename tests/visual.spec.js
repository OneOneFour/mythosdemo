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

   Diffs are bit-exact because the renderer is deterministic by
   construction: seeded RNG, rendering consumes no randomness,
   integer-only pixels, and a bitmap font drawn with fillRect rather
   than fillText. That takes BOTH `threshold: 0` and `maxDiffPixels: 0`
   in `playwright.config.js`, and the second alone is not enough --
   Playwright's default `threshold` of 0.2 hid four source-driven
   baseline moves for a week (docs/FINDINGS.md, 17g1).

   TWO RULES FOR A SCENE AT ANOTHER SIZE. Prefer `__mf.resize(w, h)`,
   which moves `VIEW` synchronously and draws. If a test needs the real
   CSS viewport instead, wait for `shell/boot.js`'s own `resize`
   listener to have run before anything draws -- `setViewportSize`
   resolves before that listener does, and under `?test=1` there is no
   RAF loop to repaint after it.
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

/* PAST THE ALTAR'S ARRIVAL. Tutorial beat 4 releases cycle 1's altar (D17-G)
   and `view/scene.js` then gives it a rise and a shaft of light for
   `altarRiseSecs`, 1.6 s, which is 192 substeps at the fixed 1/120 s step.
   241 is that plus the placing frame plus room over.

   A scene that jumps the beat to get past the tutorial callout and then
   photographs a drivetrain, a growing seed or a panel would otherwise be shot
   under that light. Waiting it out is the same move these scenes already make
   for the title card and the callout -- the subject of the picture wins. */
const ARRIVAL_SUBSTEPS = 241;
const pastArrival = page => page.evaluate(n => __mf.frames(n), ARRIVAL_SUBSTEPS);

/* TEST-ONLY QUICKBAR SETUP. The quickbar is `run.inv`'s own tail, so putting
   a pair into a SPECIFIC cell means collecting it and then moving it from
   wherever `write.collect` put it (docs/SPEC.md section 24: the quickbar's
   free cells first, then the main grid) to the cell this test wants, through
   the same `write.moveSlot` a real drag drives. The source index is read
   back rather than assumed, because the landing slot depends on what the
   scene already holds. */
async function putInQuickbar(page, slot, subKey, formKey, n = 1) {
  await page.evaluate(async ({ slot, subKey, formKey, n }) => {
    const { run, write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const sub = S[subKey], form = F[formKey];
    write.collect(sub, form, n);
    const idx = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
    write.moveSlot(idx, run.mainSlots + slot);
  }, { slot, subKey, formKey, n });
}

/* THE SAME TWO HELPERS AIMED AT THE BAG. A pickup fills the quickbar's
   cells before the main grid (docs/SPEC.md section 24), so a test whose
   subject is the Character tab's own grid -- a drag out of it, a hover over
   it, a click on one of its slots -- has to put the pair there deliberately
   rather than trust where a collect landed.

   THE FIRST FREE MAIN SLOT, never a caller's chosen index: `write.moveSlot`
   is an unconditional SWAP, so aiming at slot 0 in a scene that already
   holds something would fling that pair out into the quickbar and into the
   screenshot. On a fresh run the first free slots are 0, 1, 2 in order,
   which is all any caller here wanted. */
async function putInMain(page, subKey, formKey, n = 1) {
  await page.evaluate(async ({ subKey, formKey, n }) => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    write.collect(S[subKey], F[formKey], n);
  }, { subKey, formKey, n });
  await moveHeldToMain(page, subKey, formKey);
}

async function moveHeldToMain(page, subKey, formKey) {
  await page.evaluate(async ({ subKey, formKey }) => {
    const { run, write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const sub = S[subKey], form = F[formKey];
    const idx = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
    if (idx === -1 || idx < run.mainSlots) return;
    write.moveSlot(idx, run.inv.findIndex((s, i) => s === null && i < run.mainSlots));
  }, { subKey, formKey });
}

/* The other half of the same idiom: a pair ALREADY held (e.g. just crafted,
   not freshly given) wherever `write.collect` happened to put it, moved into
   a quickbar slot without collecting a second one on top of it. */
async function moveHeldToQuickbar(page, slot, subKey, formKey) {
  await page.evaluate(async ({ slot, subKey, formKey }) => {
    const { run, write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const sub = S[subKey], form = F[formKey];
    const idx = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
    write.moveSlot(idx, run.mainSlots + slot);
  }, { slot, subKey, formKey });
}


/* ---------- THE CANVAS OP STREAM ----------
   A pixel diff says where a difference landed. This says which draw call made
   it. `recordOps` patches the 2D context prototype in the page, tags every
   surface (the stage and each offscreen chunk canvas, in creation order), and
   logs every mutating call and style write as a plain string. Diffing two
   streams names the call; diffing two images names a rectangle.

   RECORDS THE CALL, NOT THE RESULT. A chunk canvas already painted is a
   `drawImage` and nothing more, so a cold cache and a warm one produce
   legitimately different streams — `view/paint.js` repaints at most
   `REPAINT_BUDGET` chunks per frame. Compare like with like. */
async function installOpRecorder(page) {
  await page.evaluate(() => {
    if (globalThis.__ops) return;
    globalThis.__ops = { on: false, log: [], surfaces: 0, grads: 0 };
    const P = CanvasRenderingContext2D.prototype;
    const tag = ctx => ctx.__opTag ??=
      (ctx.canvas && ctx.canvas.id === 'stage') ? 'stage' : 'off' + (globalThis.__ops.surfaces++);
    const num = v => typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(6)) : v;
    const arg = v => {
      if (v && v.__gradTag) return v.__gradTag;
      if (v && v.tagName === 'CANVAS') return 'canvas' + v.width + 'x' + v.height;
      return num(v);
    };
    const push = (ctx, name, args) => {
      if (globalThis.__ops.on) globalThis.__ops.log.push(tag(ctx) + ' ' + name + '(' + args.map(arg).join(',') + ')');
    };

    for (const name of ['fillRect', 'clearRect', 'drawImage', 'save', 'restore',
                        'translate', 'scale', 'setTransform', 'beginPath', 'fill', 'stroke']) {
      const orig = P[name];
      if (!orig) continue;
      P[name] = function (...args) { push(this, name, args); return orig.apply(this, args); };
    }

    for (const name of ['createRadialGradient', 'createLinearGradient']) {
      const orig = P[name];
      P[name] = function (...args) {
        const grd = orig.apply(this, args);
        grd.__gradTag = 'grad' + (globalThis.__ops.grads++);
        push(this, name, [grd, ...args]);
        return grd;
      };
    }
    const addStop = CanvasGradient.prototype.addColorStop;
    CanvasGradient.prototype.addColorStop = function (...args) {
      if (globalThis.__ops.on) globalThis.__ops.log.push(this.__gradTag + ' addColorStop(' + args.map(num).join(',') + ')');
      return addStop.apply(this, args);
    };

    for (const name of ['fillStyle', 'strokeStyle', 'globalAlpha',
                        'globalCompositeOperation', 'imageSmoothingEnabled', 'filter']) {
      const d = Object.getOwnPropertyDescriptor(P, name);
      if (!d || !d.set) continue;
      Object.defineProperty(P, name, {
        ...d,
        set(v) { push(this, name + '=', [v]); d.set.call(this, v); }
      });
    }
  });
}

/* Run `body` with the recorder on and return what it drew, one string per op. */
async function recordOps(page, body) {
  await installOpRecorder(page);
  /* The gradient counter restarts with the log. It names a gradient by the
     order the recording created it in, so a tag must not depend on how many
     frames the page drew before the recorder was switched on. */
  await page.evaluate(() => { __ops.log.length = 0; __ops.grads = 0; __ops.on = true; });
  await body();
  return page.evaluate(() => { __ops.on = false; return __ops.log.slice(); });
}

/* The first differing op, plus a little context each side. Empty when the two
   streams are identical. */
function firstOpDiff(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) continue;
    return { at: i, a: a.slice(Math.max(0, i - 2), i + 3), b: b.slice(Math.max(0, i - 2), i + 3) };
  }
  return null;
}


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
  /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now -- `collect`
     held alongside `right` sweeps up the boot-placed stock pickaxe the
     walk passes over, the same always-collecting scene this baseline has
     always shown. */
  await page.evaluate(() => __mf.hold({ right: 1, collect: 1 }, 240));
  await shot(page, 'surface-walk.png');
});

test('digging down into topsoil', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(() => {
    /* `shell/boot.js` plants the stock pickaxe a few tiles off spawn now --
       walk over it first, or `hasPick()` is false and digging is a no-op.
       `right` is a held key, not edge-triggered, so it must be released
       explicitly or the player keeps drifting through the whole dig and no
       single tile ever accumulates enough work to break. Phase 12b
       (docs/PLAN-phase12.md): pickup is opt-in now -- `collect` held
       alongside covers both the walk-over (so the pickaxe is actually
       pocketed and `hasPick()` reads true) and the dig itself, the same
       always-collecting scene this baseline has always shown. */
    __mf.hold({ right: 1, collect: 1 }, 90);
    __mf.cmd.right = false;
    __mf.hold({ dig: 1, down: 1, collect: 1 }, 900);
    __mf.frames(120);
  });
  await shot(page, 'digging.png');
});

/* FUNCTIONAL, not visual: a screenshot only proves the RESULT looks like a
   shaft; this walks the sim one substep at a time with the stock pickaxe
   alone (no crafted tool) and checks every tile that actually broke -- no
   horizontal drift, depth increasing by a sensible amount per tile, and the
   falling drop matching the actual strata mined, the same three things a
   real player would notice going wrong.

   Hand-carves a known shaft and places the player EXACTLY tile-aligned over
   it, for the same "don't trust natural worldgen" reason `click-to-arm: dig
   down, pack the rubble, then place the block back into the exact hole` above
   does. */
test('digging straight down: no drift, monotonic depth, correct drops', async ({ page }) => {
  await boot(page);
  await settle(page);
  const result = await page.evaluate(async () => {
    const { tileAt, subAt, dropAt, write: tw } = await import('/src/model/tiles.js');
    const { run, write: rw } = await import('/src/model/run.js');
    const { write: pw, PH } = await import('/src/model/player.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now, not automatic
       -- this test's whole point is what falls, not the collect gate, so turn
       the magnet ON for it rather than holding 'c' through a loop keyed on
       `__mf.aim`. `setAutoCollect(true)` and not `toggleAutoCollect()`
       (Phase 13c, docs/PLAN-phase13.md §4.5): a toggle asserts the caller
       already knows the current value, which is only true here by accident of
       a fresh `page.goto`, and is now false by construction anyway since
       `newRun()` resets the flag (D13-A). */
    const { setAutoCollect } = await import('/src/shell/ui.js');
    setAutoCollect(true);
    /* This test's whole point is drift/depth/drop-identity through a KNOWN
       shaft, not the D-Q yield-quality roll -- force soil's `dropChance`
       back to 1 so every break yields, the same way it did before D-Q. */
    const { write: modsw } = await import('/src/model/mods.js');
    modsw.add('test-full-yield', [{ key: 'dropChance.soil', mul: 20 }]);   // 0.05 x 20 = 1.0

    const band = bandOf('topsoil');
    const tx = 40, ty = 100, DEPTH = 8;
    for (let dy = -2; dy <= DEPTH + 1; dy++)
      for (let dx = -1; dx <= 1; dx++) tw.clear(band, tx + dx, ty + dy);
    for (let i = 0; i < DEPTH; i++) tw.set(band, tx, ty + i, S.soil);   // the known shaft
    tw.set(band, tx, ty + DEPTH, S.stone);                             // a hard floor, well past TARGET_BREAKS

    rw.collect(S.pick, F.relic, 1);      // the stock pickaxe, granted directly -- same precedent as above
    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty) - PH);   // tile-aligned x by construction; feet flush on the shaft's own top tile

    __mf.cmd.hasMouse = false;
    __mf.cmd.down = true;
    __mf.cmd.dig = true;
    __mf.frames(1);                        // let `aim` resolve to the tile directly below

    const startTx = __mf.aim.tx;
    const startDeepest = run.deepest;

    const TARGET_BREAKS = 5;
    const broken = [];
    let steps = 0;
    while (broken.length < TARGET_BREAKS && steps < 20000 && __mf.aim.valid) {
      const atx = __mf.aim.tx, aty = __mf.aim.ty;
      const beforeByte = tileAt(band, atx, aty);
      const sub = subAt(band, atx, aty);
      const drop = dropAt(band, atx, aty);
      __mf.frames(1);
      steps++;
      const afterByte = tileAt(band, atx, aty);
      if (beforeByte !== 0 && afterByte === 0) broken.push({ tx: atx, ty: aty, sub, drop, deepest: run.deepest });
    }
    __mf.cmd.down = false;
    __mf.cmd.dig = false;

    /* The falling drops need a moment to land and clear the pickup-magnet
       delay before the pockets reflect them -- the same wait every other
       drop-then-collect test in this file already gives. */
    __mf.frames(200);

    const { invCount } = await import('/src/model/run.js');
    const expectedByPair = {};
    for (const b of broken) {
      if (!b.drop) continue;
      const key = b.drop.sub + '/' + b.drop.form;
      expectedByPair[key] = (expectedByPair[key] || 0) + 1;
    }
    const actualByPair = {};
    for (const key in expectedByPair) {
      const [sub, form] = key.split('/').map(Number);
      actualByPair[key] = invCount(sub, form);
    }

    return { startTx, startDeepest, broken, expectedByPair, actualByPair, tile: band.tile, steps };
  });

  expect(result.broken.length).toBe(5);

  // straight down: every break in the same column
  for (const b of result.broken) expect(b.tx).toBe(result.startTx);

  // consecutive rows, no skip and no repeat
  for (let i = 1; i < result.broken.length; i++)
    expect(result.broken[i].ty).toBe(result.broken[i - 1].ty + 1);

  // depth (`run.deepest`, the HUD's own datum) never goes backwards between breaks
  let prevDeepest = result.startDeepest;
  for (const b of result.broken) {
    expect(b.deepest).toBeGreaterThanOrEqual(prevDeepest);
    prevDeepest = b.deepest;
  }

  // total depth gained is a sensible multiple of the tile size -- roughly one
  // tile per break, not some wildly disproportionate jump a real fall-through
  // or drift bug would produce
  const totalDepth = result.broken[result.broken.length - 1].deepest - result.startDeepest;
  expect(totalDepth).toBeGreaterThan(0);
  expect(totalDepth).toBeLessThan(result.tile * (result.broken.length + 2));

  // the drops actually collected match what mining, tile by tile, promised
  for (const key in result.expectedByPair)
    expect(result.actualByPair[key]).toBeGreaterThanOrEqual(result.expectedByPair[key]);
});

/* THE BUG ITSELF (`docs/FINDINGS.md`, "Machine status/hover/right-click-
   deconstruct pass"), now fixed in `rules/mining.js#aimAtKeys` /
   `resolveStraightDown`, and this is the test that actually exercises the
   condition that triggers it: unlike the hand-carved shaft test above, the
   player here is placed 3px off the tile grid on purpose (`PW` is 6px, a
   tile is 8px, and ordinary walk physics -- no acceleration, never
   grid-snapped -- essentially never lands on a multiple of 8 by accident).
   Both tile columns the 6px hitbox straddles are carved as a real shaft, so
   a fixed centre-x aim would clear only one of them and wedge forever on the
   other, exactly as `docs/FINDINGS.md` describes and as the OLD code did
   (verified by hand against the pre-fix build before writing the assertions
   below: `run.deepest` never moved past the depth of one broken tile). */
test('digging straight down from a non-tile-aligned x still breaks through', async ({ page }) => {
  await boot(page);
  await settle(page);
  const result = await page.evaluate(async () => {
    const { tileAt, write: tw } = await import('/src/model/tiles.js');
    const { run, write: rw } = await import('/src/model/run.js');
    const { write: pw, PH, PW } = await import('/src/model/player.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');

    const band = bandOf('topsoil');
    const tx = 60, ty = 100, DEPTH = 5;
    const OFFSET = 3;                     // deliberately NOT a multiple of band.tile (8)

    // clear a wide enough box that neither straddled column nor its neighbours
    // carry stray solid material from worldgen.
    for (let dy = -2; dy <= DEPTH + 1; dy++)
      for (let dx = -1; dx <= 2; dx++) tw.clear(band, tx + dx, ty + dy);
    // both columns the hitbox can straddle (tx and tx+1) are real shaft, the
    // whole point: neither column may be a free ride down.
    for (let i = 0; i < DEPTH; i++) {
      tw.set(band, tx,     ty + i, S.soil);
      tw.set(band, tx + 1, ty + i, S.soil);
    }
    tw.set(band, tx,     ty + DEPTH, S.stone);   // a floor past TARGET_ROWS
    tw.set(band, tx + 1, ty + DEPTH, S.stone);

    rw.collect(S.pick, F.relic, 1);
    pw.band(band);
    // feet flush on the shaft's top tile, x offset ON PURPOSE.
    pw.move(worldX(band, tx) + OFFSET, worldY(band, ty) - PH);

    __mf.cmd.hasMouse = false;
    __mf.cmd.down = true;
    __mf.cmd.dig = true;

    const startY = __mf.player.y;
    const startDeepest = run.deepest;

    // generous budget: each tile costs ~0.5s of dig at 120Hz (60 substeps),
    // and up to 2*DEPTH tiles may need breaking (both straddled columns,
    // sequentially, per row) before the player is clear to fall through.
    __mf.frames(2 * DEPTH * 60 + 600);

    __mf.cmd.down = false;
    __mf.cmd.dig = false;

    const TARGET_ROWS = DEPTH - 1;   // leave the hard stone floor unbroken
    let brokenBoth = 0;
    for (let i = 0; i < TARGET_ROWS; i++) {
      const a = tileAt(band, tx, ty + i) === 0;      // AIR
      const b2 = tileAt(band, tx + 1, ty + i) === 0;
      if (a && b2) brokenBoth++;
    }

    return {
      startY, endY: __mf.player.y, startDeepest, endDeepest: run.deepest,
      brokenBoth, TARGET_ROWS, tile: band.tile, PW
    };
  });

  // both straddled columns broke through for every row attempted -- neither
  // one was left standing as a permanent wedge.
  expect(result.brokenBoth).toBe(result.TARGET_ROWS);

  // the player actually descended -- not the sawtooth "accelerate then snap
  // back to the same value" the pre-fix bug produced.
  expect(result.endY).toBeGreaterThan(result.startY + result.tile * (result.TARGET_ROWS - 1));
  expect(result.endDeepest).toBeGreaterThan(result.startDeepest);
});

/* Fog of war (below) hides anything the player has not stood next to, and this
   test's whole point is the OPPOSITE question: does astral terrain render
   correctly at all. The player never sets foot there in this suite, so
   without the test-only `revealAll` escape hatch this would now screenshot a
   uniform hidden-colour rectangle -- technically correct fog behaviour, and
   exactly the "a test that measures the wrong thing passes and teaches
   nothing" failure CLAUDE.md warns about, because a real terrain regression
   would then pass unnoticed too. */
test('the astral band', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const w = await import('/src/model/world.js');
    const astral = w.bands.find(b => b.id === 'astral');
    __mf.revealAll(astral);
    __mf.cam.x = astral.origin.x;
    __mf.cam.y = astral.origin.y;
    __mf.draw();
  });
  await shot(page, 'astral.png');
});

/* Same reasoning as the astral band test above: the player never digs this
   deep during `settle()`, so this proves topsoil terrain renders correctly,
   not that fog of war paints black -- a different, already-covered claim. */
test('the topsoil band', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const w = await import('/src/model/world.js');
    const top = w.bands.find(b => b.id === 'topsoil');
    __mf.revealAll(top);
    __mf.cam.x = top.origin.x;
    __mf.cam.y = top.origin.y + 200;
    __mf.draw();
  });
  await shot(page, 'topsoil.png');
});

test('a placed furnace', async ({ page }) => {
  await boot(page);
  await settle(page);
  /* Keyboard aim, not mouse: a hardcoded click position is fragile against the
     resizable desktop viewport. No direction held: `aimAtKeys`
     with neither up nor down aims to the SIDE, at the player's own row — which
     on solid ground is open air with the floor directly beneath it, exactly
     where a 2-tall machine fits. Aiming DOWN (as this test used to) lands on
     the floor tile itself, which is solid on the spawn shelf by construction
     (`onShelf` in `rules/generate.js` never carves that row) — a furnace can
     never fit there, and this test had been screenshotting a "NEEDS CLEAR
     SPACE" refusal since it was written; the baseline just never said so
     because nothing asserted the placement had actually succeeded. */
  await page.evaluate(() => { __mf.cmd.hasMouse = false; });
  /* `reach` (3.2 tiles) reaches well past the 1-tile fog radius the player's
     own presence earns each frame, so a furnace built at reach's edge would
     screenshot as a rectangle of fog with a machine somewhere unrenderable
     underneath it -- this test's point is the furnace's OWN look (body, trim,
     mouth, fire, pips), not fog, so the surface band is fully revealed here. */
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    __mf.revealAll(bandOf('surface'));
  });
  /* The held `furnace/rig` is given directly, and moved into quickbar slot 0
     (docs/PLAN-phase12.md §3 D-H, `write.moveSlot`) rather than by a real
     drag, because this test's own point is the furnace's LOOK -- not the
     crafting grind or the drag-to-rearrange gesture, both of which other
     tests cover. Then '1' (`view/ui/quickbar.js#slotForDigit`: '1' is slot 0)
     arms it and 'e' places it. */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    /* The furnace is cycle 1's reward and no longer a
       starting grant -- this test's own point is the furnace's LOOK, not
       whether a trial has been paid, so grant it directly. */
    write.grant('furnace');
  });
  await putInQuickbar(page, 0, 'furnace', 'rig');
  await page.keyboard.press('1');
  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(240));
  /* The director places an altar of its own (`rules/cycles.js#ensureAltarPlaced`)
     -- exclude it so this still asserts "exactly the one machine THIS test
     placed, nothing stray", not a total that silently includes boot content. */
  expect(await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.filter(m => m.def !== M.altar).length;
  })).toBe(1);
  await shot(page, 'furnace.png');
});

/* A digit key must arm EXACTLY the quickbar slot it names
   (`view/ui/quickbar.js#slotForDigit`), not merely "whatever placeable
   happens to be held" -- proved here by putting two DIFFERENT machines in two
   different slots and checking the digit for ONE of them arms exactly that
   one's pair (not the other's), then places exactly that one machine -- the
   failure mode a looser assertion (`machines.length === 1`) would hide, per
   CLAUDE.md's own warning about a test that measures the wrong thing. Also
   covers the "empty slot" and "pressed digit but the panel was never opened"
   cases along the way, since placement works with no panel gate at all. */
/* Every other quickbar test fills a slot through `putInQuickbar` (this
   file's own `write.collect` + `write.moveSlot` helper) directly, "because
   the drag gesture itself is exercised elsewhere" -- there was no
   "elsewhere". This is that test: a REAL drag (`realDrag`, actual
   `page.mouse` events) from the Character tab's inventory grid onto an
   EMPTY quickbar slot, then closing the panel for real (`Escape`) and using
   the result exactly the way a player does -- digit key arms, `E` places.
   Rewritten for Phase 12c2 (docs/PLAN-phase12.md §3 D-H): the quickbar is
   `run.inv`'s own tail now, so a drag MOVES the pair (real storage, not an
   assignment table), and `__mf.ui.quickbar[0]` carries `n` -- a deliberate,
   named breaking change to this test hook's own shape. */
test('REAL DRAG: dragging a held item from the inventory grid onto an empty quickbar slot moves it there, and the move survives closing the panel', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    __mf.revealAll(bandOf('surface'));
  });
  await putInMain(page, 'furnace', 'rig');
  const { S, F } = await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    write.grant('furnace');   // no longer a starting grant
    open('main');
    setTab('main', 'char');
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
    return { S, F };
  });

  const { invSlot, qSlot } = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const inv = __mf.ui.grids.find(g => g.id === 'inv').slots.find(s => s.sub === S.furnace && s.form === F.rig);
    const qb = __mf.ui.grids.find(g => g.id === 'quickbar').slots[0];
    return { invSlot: inv, qSlot: qb };
  });
  expect(invSlot).toBeTruthy();
  expect(qSlot).toBeTruthy();
  expect(qSlot.sub).toBeNull();     // the quickbar starts empty -- nothing to swap with

  await realDrag(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2, qSlot.x + qSlot.w / 2, qSlot.y + qSlot.h / 2);
  expect(await page.evaluate(() => __mf.ui.quickbar[0])).toEqual({ sub: S.furnace, form: F.rig, n: 1 });

  /* Close the panel for real -- Escape, not `closeTop()` called from the
     test -- so this also proves the move is real storage (`run.inv`) that
     outlives the window, not something the panel itself was quietly holding. */
  await page.keyboard.press('Escape');
  await page.evaluate(() => __mf.frames(1));
  expect(await page.evaluate(() => __mf.ui.open)).toEqual([]);
  expect(await page.evaluate(() => __mf.ui.quickbar[0])).toEqual({ sub: S.furnace, form: F.rig, n: 1 });

  await page.keyboard.press('1');
  await page.evaluate(() => __mf.frames(1));
  expect(await page.evaluate(() => __mf.ui.armedPlace)).toEqual({ sub: S.furnace, form: F.rig });

  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });
  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(240));
  /* Exclude the director's own altar (`rules/cycles.js#ensureAltarPlaced`) so
     this still asserts exactly the one machine this drag-and-place put down. */
  expect(await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.filter(m => m.def !== M.altar).length;
  })).toBe(1);
  /* The move never duplicated storage -- placing spent the one furnace that
     was IN the quickbar slot, so it is empty again, not still showing a
     stale `n`. */
  expect(await page.evaluate(() => __mf.ui.quickbar[0])).toBeNull();
});

test('a digit key arms the matching quickbar slot, not just any held item', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    __mf.revealAll(bandOf('surface'));
    __mf.cmd.hasMouse = false;
  });

  /* Nothing assigned yet at all -- pressing a digit for an empty slot (or any
     slot) must do nothing: no arm, no journal row, no crash. */
  const beforeAnything = await page.evaluate(async () => {
    const { peek } = await import('/src/model/journal.js');
    return { armedPlace: __mf.ui.armedPlace, journalLen: peek().length };
  });
  await page.keyboard.press('5');
  const afterEmptyDigit = await page.evaluate(async () => {
    const { peek } = await import('/src/model/journal.js');
    return { armedPlace: __mf.ui.armedPlace, journalLen: peek().length };
  });
  expect(afterEmptyDigit.armedPlace).toBeNull();
  expect(afterEmptyDigit.journalLen).toBe(beforeAnything.journalLen);

  /* Two held machine items, in DIFFERENT quickbar slots -- furnace in slot 0
     (digit '1'), press in slot 2 (digit '3'), per
     `view/ui/quickbar.js#slotForDigit`'s own digit-to-slot mapping. Both are
     held `<id>/rig` items (`data/recipes.js#furnace`/`press_machine`), given
     directly here -- this test's own point is WHICH machine a digit arms and
     places, not the crafting grind to earn either. Put there through
     `putInQuickbar` (this file's own `write.collect` + `write.moveSlot`
     helper) rather than a real drag -- the drag gesture itself is exercised
     elsewhere; this test's point is the digit key. */
  await putInQuickbar(page, 0, 'furnace', 'rig');
  await putInQuickbar(page, 2, 'press', 'rig');

  await page.keyboard.press('3');
  const armed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armedPlace: __mf.ui.armedPlace, press: S.press, furnace: S.furnace, rig: F.rig };
  });
  expect(armed.armedPlace).toEqual({ sub: armed.press, form: armed.rig });
  expect(armed.armedPlace.sub).not.toBe(armed.furnace);

  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(240));
  const info = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    /* Exclude the director's own altar (`rules/cycles.js#ensureAltarPlaced`) --
       without it, `machines[0]` is no longer reliably the one this test just
       placed, and the whole point here is proving it's THAT one, not any. */
    const placed = __mf.machines.filter(m => m.def !== M.altar);
    return {
      count: placed.length, def: placed[0]?.def, press: M.press, furnace: M.furnace,
      armedAfter: __mf.ui.armedPlace, pressRig: invCount(S.press, F.rig), furnaceRig: invCount(S.furnace, F.rig)
    };
  });
  expect(info.count).toBe(1);
  expect(info.def).toBe(info.press);
  expect(info.def).not.toBe(info.furnace);
  expect(info.armedAfter).toBeNull();       // cleared on a successful placement
  expect(info.pressRig).toBe(0);            // the held item was spent...
  expect(info.furnaceRig).toBe(1);          // ...and the OTHER one was untouched
});

/* Hand-crafting has no persisted screenshot-visible state worth asserting on
   (the bar is a scalar on `run`, not drawn as a HUD element yet) -- what
   matters is whether holding the key for long enough actually spends the
   inputs and produces the output, which only a state read-back can prove.
   `smelt`'s `secs` is 4.0 (`data/recipes.js`), so 500 substeps at the fixed
   1/120s step is comfortably past completion; the output is a FALLING item
   (invariant 5, never a direct credit — see `rules/crafting.js`), so the
   extra 120 frames give it time to clear the 0.35s pickup-magnet delay in
   `rules/items.js` and land in the pockets of a player standing right where
   it was tossed. */
test('holding the hand-craft key smelts ore into an ingot, spending exactly its inputs', async ({ page }) => {
  await boot(page);
  await settle(page);
  const info = await page.evaluate(async () => {
    const { write, invCount } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');

    write.collect(S.copper, F.ore, 4);
    write.collect(S.timber, F.log, 1);
    const before = {
      ore: invCount(S.copper, F.ore),
      fuel: invCount(S.timber, F.log),
      ingot: invCount(S.copper, F.ingot)
    };

    /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now, not automatic
       -- `collect` held alongside `craft` here is `cmd.collect`, the same
       HOLD key covers, so the output still lands in the pockets over the
       following wait exactly as it always has. */
    __mf.hold({ craft: 1, collect: 1 }, 500);
    __mf.frames(120);

    const after = {
      ore: invCount(S.copper, F.ore),
      fuel: invCount(S.timber, F.log),
      ingot: invCount(S.copper, F.ingot)
    };
    return { before, after };
  });

  expect(info.before).toEqual({ ore: 4, fuel: 1, ingot: 0 });
  expect(info.after).toEqual({ ore: 0, fuel: 0, ingot: 1 });
});

/* ============================================================
   BELTS

   `rules/belts.js`'s own header explains why a belt is not a recipe-driven
   transform: it drags a RESTING item along its footprint for as long as its
   machine record holds a fuel-bought CHARGE, and does nothing the instant it
   does not. A screenshot cannot tell "moved" from "always looked like this",
   so all three tests below read item and machine state back directly.

   Every test hand-carves its own small patch of the surface band -- clearing
   a rectangle to air and forcing a solid floor under exactly the belt's own
   four-tile footprint -- rather than trusting that seed 1337's natural
   terrain happens to have a flat run near spawn. A test that only ever finds
   rock nearby would report "refused" as if it were "did not drag".
   See docs/DEVELOPER_GUIDE.md#writing-tests
   ============================================================ */

/* `tx0..tx0+3` at `ty0` becomes the belt's own footprint, cleared to air (or
   `placeMachine` refuses it as occupied); `ty0+1` under the WHOLE span is
   forced solid, exactly the floor `footing:4` demands; everything else in the
   rectangle -- above the belt and PAST its right edge alike -- stays air, so
   a delivered item has open space to fall into rather than more floor. */
async function carveBeltFloor(page, tx0, ty0) {
  await page.evaluate(async ({ tx0, ty0 }) => {
    const { write: tw } = await import('/src/model/tiles.js');
    const { S } = await import('/src/data/substances.js');
    const { bandOf } = await import('/src/model/world.js');
    const band = bandOf('surface');
    for (let x = tx0 - 2; x <= tx0 + 12; x++)
      for (let y = ty0 - 6; y <= ty0 + 10; y++) tw.clear(band, x, y);
    for (let x = tx0; x <= tx0 + 3; x++) tw.set(band, x, ty0 + 1, S.stone);
  }, { tx0, ty0 });
}

test('a fuelled belt drags a resting item across its footprint and releases it off the end', async ({ page }) => {
  await boot(page);
  await settle(page);
  await carveBeltFloor(page, 10, 15);

  const info = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: rw } = await import('/src/model/run.js');
    const { write: iw } = await import('/src/model/items.js');
    const { write: mw } = await import('/src/model/machines.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { placeMachine } = await import('/src/rules/placement.js');

    const band = bandOf('surface');
    const tx0 = 10, ty0 = 15;

    /* `belt_r` is a held `belt_r/rig` item spent by `placeMachine` at
       placement -- given directly, so this also proves the placement really
       does spend the held item and not merely declare one. */
    rw.collect(S.belt_r, F.rig, 1);
    const belt = placeMachine(band, 'belt_r', tx0, ty0);

    /* Land the item FIRST, on an unfuelled belt, and confirm it is inert
       before a single charge exists. Feeding the burner before the item has
       even landed would race the two: `beltSpeed` (50 px/s) crossing this
       belt's 4 tiles takes about the same half-second the item's own fall
       takes to settle, so a belt already charged when the item lands can
       land AND fully cross AND release within one "let it settle" window,
       and the intermediate "resting, not yet dragged" state this asserts
       would never be observed. Landing it on a cold belt removes the race. */
    const it = iw.spawn(band, worldX(band, tx0) + 4, worldY(band, ty0 - 3), S.copper, F.ore, 0, 0);
    __mf.frames(120);                    // time to fall 4 tiles and settle
    const landed = { x: it.x, y: it.y, rest: it.rest };

    /* Straight into the buffer -- the same effect standing in reach and
       hand-feeding would have, without needing the player's own position in
       this test. One fuel unit is one 6-second run of the honest-fuel recipe
       this row shares with the brazier, which banks exactly one charge. */
    mw.take(belt, S.timber, F.log, 1);
    __mf.frames(760);                    // > 6s at the fixed 1/120s step
    const charged = belt.charges;

    __mf.frames(420);                    // cross the belt, release, refall
    const settled = { x: it.x, y: it.y, rest: it.rest };

    return {
      charged, landed, settled,
      chargesAfter: belt.charges,
      boxRight: belt.box.x + belt.box.w
    };
  });

  expect(info.charged).toBe(1);
  expect(info.landed.rest).toBe(1);                    // it actually landed and rested
  /* Delivered off the end: past the belt's own right edge, and -- because the
     far side was carved to open air -- resting again lower than where it
     landed on the belt, meaning it fell further after release rather than
     stopping dead at the lip. */
  expect(info.settled.x).toBeGreaterThanOrEqual(info.boxRight);
  expect(info.settled.y).toBeGreaterThan(info.landed.y + 8);
  expect(info.settled.rest).toBe(1);                   // and came to rest again
  expect(info.chargesAfter).toBe(0);                   // exactly the one charge it had
});

test('a belt with no fuel charge does not drag a resting item', async ({ page }) => {
  await boot(page);
  await settle(page);
  await carveBeltFloor(page, 10, 15);

  const info = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: rw } = await import('/src/model/run.js');
    const { write: iw } = await import('/src/model/items.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { placeMachine } = await import('/src/rules/placement.js');

    const band = bandOf('surface');
    const tx0 = 10, ty0 = 15;

    rw.collect(S.belt_r, F.rig, 1);
    const belt = placeMachine(band, 'belt_r', tx0, ty0);
    /* No fuel goes in this time. `belt.charges` starts, and stays, 0. */

    const it = iw.spawn(band, worldX(band, tx0) + 4, worldY(band, ty0 - 3), S.copper, F.ore, 0, 0);
    __mf.frames(120);
    const landed = { x: it.x, y: it.y, rest: it.rest };

    __mf.frames(420);                    // same window the fuelled test drags across
    const after = { x: it.x, y: it.y, rest: it.rest };

    return { charges: belt.charges, landed, after };
  });

  expect(info.charges).toBe(0);
  expect(info.landed.rest).toBe(1);
  /* The gate actually gates something: same footprint, same window, no fuel
     -- the item neither moves nor leaves the surface it rested on. */
  expect(info.after.x).toBe(info.landed.x);
  expect(info.after.y).toBe(info.landed.y);
  expect(info.after.rest).toBe(1);
});

/* The 400-item cap (`rules/items.js#MAX_ITEMS`) is a hard cap on the GLOBAL
   item list, not a per-machine buffer, so a belt cannot make it leak or go
   non-finite merely by being mid-drag when the cap trims the oldest items out
   from under it. `belt.charges` is set directly here (bypassing the fuel
   economy the two tests above already cover) so the frame budget goes to
   proving the physics holds under load, not to re-proving the burner works. */
test('a belt dragging far more items than the cap allows stays finite and within it', async ({ page }) => {
  await boot(page);
  await settle(page);
  await carveBeltFloor(page, 10, 15);

  const info = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: rw } = await import('/src/model/run.js');
    const { write: iw, items } = await import('/src/model/items.js');
    const { write: mw } = await import('/src/model/machines.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { placeMachine } = await import('/src/rules/placement.js');

    const band = bandOf('surface');
    const tx0 = 10, ty0 = 15;

    rw.collect(S.belt_r, F.rig, 1);
    const belt = placeMachine(band, 'belt_r', tx0, ty0);
    mw.charge(belt, 1e6);                // never runs dry for the length of this probe

    const before = items.length;
    for (let i = 0; i < 450; i++)
      iw.spawn(band, worldX(band, tx0) + (i % 32), worldY(band, ty0 - 3), S.copper, F.ore, 0, 0);
    const spawned = items.length - before;

    __mf.frames(600);

    return {
      spawned,
      count: items.length,
      allFinite: items.every(it =>
        Number.isFinite(it.x) && Number.isFinite(it.y) &&
        Number.isFinite(it.vx) && Number.isFinite(it.vy))
    };
  });

  expect(info.spawned).toBe(450);          // more than the cap, confirmed spawned
  expect(info.count).toBeLessThanOrEqual(400);   // rules/items.js#MAX_ITEMS
  expect(info.allFinite).toBe(true);
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

/* ============================================================
   FOG OF WAR

   The confirmed rule is still permanence -- a tile, once revealed, never
   un-reveals -- but WHICH tiles get revealed each step is now real sight,
   split into two independent passes in `rules/reveal.js`:

     PASS A  standing anywhere with an unobstructed view of the sky reveals
             the band's ENTIRE sky-exposed silhouette. Unbounded.
     PASS B  a flood-fill through open tiles, blocked by solid rock, capped
             at a graph distance (`eff('sightRadius')`). Bounded, and what
             gives partial cavern visibility; also what subsumes the old
             "reveal here and the tiles right next to it" rule outright.

   Every test below that touches `rules/reveal.js` calls its `step()`
   DIRECTLY after teleporting the player via `model/player.js#write.move`/
   `write.band`, rather than walking there with `__mf.hold`/`frames` -- that
   isolates the mechanism from physics entirely, which matters because an
   800-tile-deep teleport lands the player embedded in solid rock, and
   letting a real physics substep run there would immediately start
   falling/collision resolution that has nothing to do with what these tests
   are checking. Several also call `__mf.newRun(...)` directly inside the
   page-evaluated block, rather than relying on `settle()`'s own spawn: the
   default spawn sits in open sky, so `settle()`'s two frames already trigger
   Pass A for the whole surface band before a test gets to assert anything --
   a fresh `newRun()` with no frames run yet is the only way to observe an
   actually-unrevealed band to compare against.
   See docs/DEVELOPER_GUIDE.md#writing-tests
   ============================================================ */

test('an unexplored area renders as the hidden colour, whatever terrain is actually there', async ({ page }) => {
  await boot(page);
  await settle(page);
  const info = await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    const { P } = await import('/src/core/palette.js');

    /* The astral band, unvisited exactly as in `the astral band` test above,
       and picked FOR this test over the (also unvisited) topsoil band for one
       reason: astral's `look.ambient` is 1.0, so `view/scene.js#atmosphere`'s
       depth tint never fires there (topsoil's 0.6 would darken the sampled
       pixel with a second, unrelated blend on top of the fog colour, which is
       a real compositing detail worth its own test, not noise in this one).
       No `revealAll` here: this test's whole point is the opposite of that
       one's.

       THE 200 PX FLOOR, because the tint is now the area-weighted mean of
       every band on screen and astral is 320 px tall. At the 400 px desktop
       buffer surface is always in frame under it, which puts the mean at 0.99
       and the tint at 0.011 -- the very second blend this sample is picked to
       avoid. A 200 px buffer at astral's own origin sees nothing but astral. */
    __mf.resize(400, 400);
    const astral = bandOf('astral');
    __mf.cam.x = astral.origin.x;
    __mf.cam.y = astral.origin.y;
    __mf.draw();

    const c = document.getElementById('stage');
    const [r, g, b] = c.getContext('2d')
      .getImageData((c.width / 2) | 0, (c.height / 2) | 0, 1, 1).data;
    return { r, g, b, fog: P.abyA };
  });

  const [er, eg, eb] = [info.fog.slice(1, 3), info.fog.slice(3, 5), info.fog.slice(5, 7)]
    .map(h => parseInt(h, 16));
  expect([info.r, info.g, info.b]).toEqual([er, eg, eb]);
});

test('a tile the player stood beside stays revealed after they walk far away (permanence)', async ({ page }) => {
  await boot(page);
  await settle(page);
  const info = await page.evaluate(async () => {
    const { bandOf, seenAt, worldX, worldY } = await import('/src/model/world.js');
    const { write: pw } = await import('/src/model/player.js');
    const { step: revealStep } = await import('/src/rules/reveal.js');

    const band = bandOf('topsoil');
    const tx = 40, ty = 40;

    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty));       // hitbox top-left AT this tile
    revealStep();
    const whileThere = seenAt(band, tx, ty);

    /* 60 tiles clear of the tile itself and every one of its neighbours, and
       `revealStep()` run again there -- a radius-based implementation (the
       bug this test exists to catch, per the brief: "easy to accidentally
       re-hide, or to only reveal while currently adjacent") would have
       nothing left revealing `tx,ty` at this point; a memory-based one, which
       is what was built, has no mechanism that could ever turn a bit back off. */
    pw.move(worldX(band, tx + 60), worldY(band, ty));
    revealStep();
    const afterLeaving = seenAt(band, tx, ty);

    return { whileThere, afterLeaving };
  });

  expect(info.whileThere).toBe(true);
  expect(info.afterLeaving).toBe(true);
});

test('fog resets to fully unrevealed on newRun()', async ({ page }) => {
  await boot(page);
  await settle(page);
  const info = await page.evaluate(async () => {
    const { bandOf, seenAt, worldX, worldY } = await import('/src/model/world.js');
    const { write: pw } = await import('/src/model/player.js');
    const { step: revealStep } = await import('/src/rules/reveal.js');

    const before = bandOf('topsoil');
    const tx = 10, ty = 10;
    pw.band(before);
    pw.move(worldX(before, tx), worldY(before, ty));
    revealStep();
    const seenBefore = seenAt(before, tx, ty);

    __mf.newRun(2024);
    const after = bandOf('topsoil');
    const seenAfter = seenAt(after, tx, ty);

    return { seenBefore, seenAfter, freshBand: after !== before };
  });

  expect(info.seenBefore).toBe(true);
  expect(info.freshBand).toBe(true);        // newRun() reallocates, never reuses
  expect(info.seenAfter).toBe(false);       // ARCHITECTURE invariant 8
});

test('standing anywhere with open sky reveals the whole exposed surface, not a radius (Pass A)', async ({ page }) => {
  await boot(page);
  const info = await page.evaluate(async () => {
    const { bandOf, seenAt, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { step: revealStep } = await import('/src/rules/reveal.js');
    const { S } = await import('/src/data/substances.js');

    __mf.newRun(1337);
    const band = bandOf('surface');
    const floorTy = band.cfg.floorTy;
    /* `shell/boot.js` now reveals rows 0..floorTy+8 of the surface band
       unconditionally at spawn (the "starting skyline" — see its comment),
       so a ground row has to sit BELOW that to still start out unrevealed and
       isolate what PASS A ITSELF does from what boot already did. groundTy is
       therefore floorTy+10, not floorTy: a shaft carved from the sky down to
       it is still entirely sky-exposed, just deeper than the boot freebie. */
    const groundTy = floorTy + 10;
    const standTx = 20, farTx = 100;          // 80 tiles apart: far past both the
                                               // old radius-1 rule AND Pass B's
                                               // graph-distance cap, so a reveal
                                               // reaching `farTx` can only be Pass A

    /* Carve both columns explicitly rather than trust worldgen to leave them
       open (a tree trunk or a ragged soil lip would silently fail this): clear
       straight down to the ground row, force a solid ground tile there, and
       force the tile beneath IT solid too -- buried, never sky-exposed, the
       control that proves this is "the sky-exposed silhouette", not "the
       whole band". */
    for (const tx of [standTx, farTx]) {
      for (let ty = 0; ty < groundTy; ty++) tw.clear(band, tx, ty);
      tw.set(band, tx, groundTy, S.stone);
      tw.set(band, tx, groundTy + 1, S.stone);
    }

    const beforeFar = seenAt(band, farTx, groundTy);

    pw.band(band);
    /* Standing in the open air just above the carved ground -- PH (16 px) is
       two tile rows, and both are cleared above, so the box does not clip a
       column we did not mean to touch. */
    pw.move(worldX(band, standTx), worldY(band, groundTy - 2));
    revealStep();

    return {
      beforeFar,                                        // nothing revealed yet
      farGround: seenAt(band, farTx, groundTy),         // the far column's own surface
      farBuried: seenAt(band, farTx, groundTy + 1),     // one tile beneath it
      standGround: seenAt(band, standTx, groundTy)      // sanity: the player's own ground
    };
  });

  expect(info.beforeFar).toBe(false);
  expect(info.farGround).toBe(true);      // Pass A: unbounded across the open expanse
  expect(info.farBuried).toBe(false);     // still bounded to what is actually sky-exposed
  expect(info.standGround).toBe(true);
});

test('a large enclosed air pocket is revealed only partway in from the edge (Pass B, bounded)', async ({ page }) => {
  await boot(page);
  const info = await page.evaluate(async () => {
    const { bandOf, seenAt, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { step: revealStep } = await import('/src/rules/reveal.js');
    const { eff } = await import('/src/model/mods.js');
    const { S } = await import('/src/data/substances.js');

    __mf.newRun(1337);
    const band = bandOf('topsoil');
    const radius = eff('sightRadius');        // the tunable itself, not a hardcoded
                                               // copy of it, so this stays correct if
                                               // `data/tuning.js` is ever retuned
    const ty0 = 100, ty1 = 101;                // 2 rows tall, matching the player's
                                               // own height, deep in topsoil and
                                               // nowhere near open sky
    const tx0 = 10, length = radius + 20;      // a straight room longer than the cap
                                               // in both directions from the seed
    const openEnd = tx0 + length - 1;

    /* Hand-carve a sealed room rather than trust worldgen to leave a cavity
       this shape anywhere: clear the interior, wall every side (ceiling,
       floor, both end caps), so the ONLY way in or out is where the player is
       about to be placed -- no route to open sky, which is what isolates
       Pass B from Pass A here. */
    for (let tx = tx0; tx <= openEnd; tx++) { tw.clear(band, tx, ty0); tw.clear(band, tx, ty1); }
    for (let tx = tx0 - 1; tx <= openEnd + 1; tx++) {
      tw.set(band, tx, ty0 - 1, S.stone);      // ceiling
      tw.set(band, tx, ty1 + 1, S.stone);      // floor
    }
    for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) {
      tw.set(band, tx0 - 1, ty, S.stone);      // sealed left end
      tw.set(band, openEnd + 1, ty, S.stone);  // sealed right end
    }

    pw.band(band);
    pw.move(worldX(band, tx0), worldY(band, ty0));    // standing right at the near edge
    revealStep();

    return {
      wallNearby: seenAt(band, tx0, ty0 - 1),           // the ceiling right over the
                                                         // player: revealed even though
                                                         // solid, same as the old rule
      edge: seenAt(band, tx0 + 2, ty0),                 // a couple of tiles in
      deep: seenAt(band, tx0 + radius + 8, ty0),        // 8 tiles past the cap
      farEnd: seenAt(band, openEnd, ty0)                // the true far wall of the pocket
    };
  });

  expect(info.wallNearby).toBe(true);
  expect(info.edge).toBe(true);
  expect(info.deep).toBe(false);      // proves the flood is BOUNDED, not "the whole pocket"
  expect(info.farEnd).toBe(false);
});

/* ============================================================
   MAP OVERVIEW

   `view/scene.js#drawMap` is a genuinely different render path (the whole
   world at ~1 screen px/tile, read straight off the tile grid, not the
   per-chunk canvas cache normal play uses) gated on `flags.showMap`, and
   `shell/main.js#step()`/`applyIntents()` freeze the run while it is true.
   Three separate claims, three separate tests, same reasoning as the fog
   tests above: a screenshot alone cannot distinguish "hidden" from "never
   drawn", or "paused" from "nothing happened to move it".
   ============================================================ */

/* Same caution as the fog-of-war tests: don't trust natural worldgen to place
   a known substance where this test expects one, and don't trust the player's
   own spawn-adjacent reveal to land exactly on the probed tile. A stone tile
   is written explicitly, revealed by teleporting the player onto it and
   calling `rules/reveal.js#step()` directly (isolating the mechanism from
   physics, exactly like the permanence test above), and then the player is
   moved AWAY before drawing -- otherwise the map's own player marker would
   paint over the very pixel this test samples.
   See docs/DEVELOPER_GUIDE.md#writing-tests */
test('the map overview shows explored terrain and leaves unexplored terrain undrawn', async ({ page }) => {
  await boot(page);
  await settle(page);
  const info = await page.evaluate(async () => {
    const { bandOf, seenAt, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { step: revealStep } = await import('/src/rules/reveal.js');
    const { S } = await import('/src/data/substances.js');
    const { P } = await import('/src/core/palette.js');

    const surface = bandOf('surface');
    const topsoil = bandOf('topsoil');
    const sx = 100, sy = 30;           // an arbitrary surface tile, forced to stone
    const hx = 100, hy = 300;          // a topsoil tile nobody has ever stood near

    tw.set(surface, sx, sy, S.stone);
    pw.band(surface);
    pw.move(worldX(surface, sx), worldY(surface, sy));
    revealStep();
    pw.move(worldX(surface, 0), worldY(surface, 0));   // clear of the probed tile
    revealStep();

    /* PARKED, NOT FOLLOWING. The overview follows the player by default,
       and the player has just been moved to the top-left corner --
       so without this the probed surface tile would be scrolled off screen and
       the "revealed stone paints its own colour" sample would read void, which
       is a test failing for the wrong reason. `mapMoveTo` also turns FOLLOW
       off, which is the whole point. */
    const { mapMoveTo } = await import('/src/shell/ui.js');
    mapMoveTo(0, 0);
    __mf.flags.showMap = true;
    __mf.draw();

    /* THE TRANSFORM IS READ BACK, NOT RE-DERIVED. `view/overview.js#mapView`
       is that file's own record of what the last draw actually used -- the
       `view/paint.js#stats` idiom -- so this test cannot drift from the
       renderer's scale, zoom, scroll offset or reserved-edge arithmetic that
       a hand-copied formula would. */
    const { mapView } = await import('/src/view/overview.js');
    const c = document.getElementById('stage');
    const mapPx = (wx, wy) => ({
      x: Math.min(c.width - 1, Math.max(0,
        Math.round(mapView.vx + (wx - mapView.wx) * mapView.scale))),
      y: Math.min(c.height - 1, Math.max(0,
        Math.round(mapView.vy + (wy - mapView.wy) * mapView.scale)))
    });
    const revealed = mapPx(worldX(surface, sx) + surface.tile / 2, worldY(surface, sy) + surface.tile / 2);
    const hidden = mapPx(worldX(topsoil, hx) + topsoil.tile / 2, worldY(topsoil, hy) + topsoil.tile / 2);

    const g2d = c.getContext('2d');
    const [rr, rg, rb] = g2d.getImageData(revealed.x, revealed.y, 1, 1).data;
    const [hr, hg, hb] = g2d.getImageData(hidden.x, hidden.y, 1, 1).data;

    return {
      seenSurface: seenAt(surface, sx, sy), seenTopsoil: seenAt(topsoil, hx, hy),
      revealedRGB: [rr, rg, rb], hiddenRGB: [hr, hg, hb],
      stoneBase: P.irC, voidBase: P.abyC
    };
  });

  const hex = h => [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)].map(x => parseInt(x, 16));

  expect(info.seenSurface).toBe(true);
  expect(info.seenTopsoil).toBe(false);
  expect(info.revealedRGB).toEqual(hex(info.stoneBase));  // explored stone paints its own colour
  expect(info.hiddenRGB).toEqual(hex(info.voidBase));     // unexplored tile draws nothing at all
});

/* A pixel-sampling test proves the fog rule; it says nothing about whether the
   whole-world layout actually reads as a sensible overview -- three bands
   stacked top to bottom, correctly scaled, not overlapping, not clipped off
   the desktop viewport this suite covers. That needs a
   screenshot, same as `overlays.png` exists alongside the fog pixel tests
   above rather than instead of them. Fully revealed, same reasoning
   `astral.png`/`topsoil.png` already use: the point here is the OVERVIEW
   layout, not fog, so fog is taken out of the picture rather than left to
   seed 1337's incidental exploration. */
test('the map overview, fully explored', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { bands, write } = await import('/src/model/world.js');
    for (const b of bands) write.revealAll(b);
    __mf.flags.showMap = true;
    __mf.draw();
  });
  await shot(page, 'map.png');
});

test('opening the map overview freezes the run, and closing it resumes and restores normal rendering', async ({ page }) => {
  await boot(page);
  await settle(page);

  const info = await page.evaluate(() => {
    const hashOf = () => {
      const c = document.getElementById('stage');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 4) {
        h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };

    const beforeHash = hashOf();
    const xBefore = __mf.player.x, tBefore = __mf.clock.t;

    /* Held right + dig, exactly the intents that move the player and would
       chip at a tile if the physics ran at all. `hold()` calls `step()` and
       `applyIntents()` directly, the same entry points the real RAF loop
       uses -- this is not testing a mock of the pause, it is testing the
       pause. */
    __mf.flags.showMap = true;
    __mf.hold({ right: 1, dig: 1 }, 120);
    const xDuringMap = __mf.player.x, tDuringMap = __mf.clock.t;

    __mf.flags.showMap = false;
    __mf.draw();                              // back on the normal path
    const afterCloseHash = hashOf();

    __mf.hold({ right: 1 }, 60);              // the run actually resumes
    const xAfterResume = __mf.player.x;

    return { beforeHash, afterCloseHash, xBefore, xDuringMap, tBefore, tDuringMap, xAfterResume };
  });

  expect(info.xDuringMap).toBe(info.xBefore);          // frozen: held movement did nothing
  expect(info.tDuringMap).toBe(info.tBefore);          // frozen: the run clock did not advance
  expect(info.afterCloseHash).toBe(info.beforeHash);   // closing reproduces the identical normal frame
  expect(info.xAfterResume).toBeGreaterThan(info.xBefore); // and play genuinely resumes after
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

/* Hover has no persisted model state (ARCHITECTURE invariant 9) -- it is
   resolved fresh from the pointer every frame. A screenshot cannot prove
   hover actually works: two identical pixels could come from the tooltip
   resolving nothing at all. This asserts the resolved CONTENT, the way
   `tools/check.mjs`'s trinket check proves an item was actually produced
   rather than that a recipe merely didn't throw.

   The Character tab's own pocket grid is the ONLY inventory display now (the
   older text panel this used to open via `flags.showInv` was retired -- see
   `docs/FINDINGS.md`), so this hovers a slot in THAT grid and reads its
   tooltip back through `__mf.ui().tooltip`, `view/ui/mainPanel.js
   #drawCharacterTooltip`'s own read-back, rather than the world-hover
   `__mf.hover` the retired panel used to feed. */
test('hovering an inventory pair resolves a tooltip naming it', async ({ page }) => {
  await boot(page);
  await settle(page);
  await putInMain(page, 'copper', 'ore', 5);
  const info = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { banner } = await import('/src/view/fx.js');
    const { open, setTab } = await import('/src/shell/ui.js');

    open('main');
    setTab('main', 'char');
    /* `drawHUD` shows the title card instead of a tooltip while `banner.fade`
       is still counting down from `newRun()`'s 2.6 s opening title -- real
       play never notices because nobody hovers anything in the first three
       seconds, but `settle()` only advances the clock, not `stepFx` (which is
       what actually decays it), so it would still read as active here. */
    banner.fade = 0;
    /* `draw()`, not `frames()`: a substep also runs `updateCamera`, and
       `mouseAt` converts a SCREEN position to world px by adding the CURRENT
       camera -- a step between setting the mouse and rendering would move the
       camera out from under it. The HUD itself never moves with the camera at
       all (it is screen space already), so nothing here needs the physics to
       run, only a render. */
    __mf.draw();

    /* `__mf.ui().grids` is the SAME rectangle list `view/ui/mainPanel.js`
       just drew for the open Character tab. Finding the slot this way,
       rather than a hardcoded screen coordinate, is what keeps the assertion
       honest against a resizable desktop viewport (CLAUDE.md: a hardcoded
       click position breaks if the window size changes). */
    const grid = __mf.ui.grids.find(g => g.id === 'inv');
    const slot = grid.slots.find(s => s.sub === S.copper && s.form === F.ore);
    __mf.mouseAt(slot.x + slot.w / 2, slot.y + slot.h / 2);
    __mf.draw();

    return { found: !!slot, tooltip: __mf.ui.tooltip ? { ...__mf.ui.tooltip, lines: __mf.ui.tooltip.lines.slice() } : null };
  });

  expect(info.found).toBe(true);
  expect(info.tooltip).toBeTruthy();
  expect(info.tooltip.lines[0]).toBe('COPPER ORE');
  expect(info.tooltip.lines.some(l => l.startsWith('MASS'))).toBe(true);
});

/* ============================================================
   State-asserted flows over the real GUI/debug surface.

   `__mf.intent(name, args)` locates its target rect from `__mf.ui()`'s OWN
   live projection of what was actually drawn this frame — never a hardcoded
   screen coordinate, which CLAUDE.md records breaks the moment the viewport
   changes size. `__mf.give(sub, form, n)` is TEST ONLY, gated the same way
   every other `__mf` method already is (`?test=1`), and exists so a flow's
   OWN point (a furnace smelting, a queued craft draining) does not have to
   spend its frame budget re-proving mining or pickup that other tests already
   cover end to end. See docs/DEVELOPER_GUIDE.md#the-test-hook
   ============================================================ */

/* ============================================================
   New visual framings. Fixed seed, fixed substep count, maxDiffPixels stays 0
   (playwright.config.js). Every pair below is taken as a PAIR on purpose
   (CLAUDE.md: a test that asserts a feature is visible must prove the pixels
   differ with it off) — the unlit/lit shaft are two separately-baselined
   images, so a future regression that made lighting a no-op would have to
   change at least one of them relative to its OWN accepted baseline to stay
   green, not merely look plausible next to the other.
   See docs/DEVELOPER_GUIDE.md#writing-tests
   ============================================================ */

/* Both shaft screenshots share this setup: a hand-carved shaft in topsoil
   with a copper vein wall to hide, fully REVEALED (the test-only
   `write.revealAll` escape hatch — this is about the darkness pass, not fog,
   the same reasoning `astral.png`/`topsoil.png` already use above). */
async function carveShaft(page, tx0, ty0, w, h) {
  await page.evaluate(async ({ tx0, ty0, w, h }) => {
    const { S } = await import('/src/data/substances.js');
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { banner } = await import('/src/view/fx.js');

    const band = bandOf('topsoil');
    for (let ty = ty0; ty < ty0 + h; ty++) for (let tx = tx0; tx < tx0 + w; tx++) tw.clear(band, tx, ty);
    for (let ty = ty0 + 4; ty < ty0 + 8; ty++) tw.set(band, tx0, ty, S.copper);   // a vein to hide in the dark
    tw.set(band, tx0 + 2, ty0 + h - 1, S.stone);                                 // a floor for the brazier

    pw.band(band);
    pw.move(worldX(band, tx0 + 2), worldY(band, ty0 + 2));
    ww.revealAll(band);
    banner.fade = 0;   // past the opening title, same reasoning `settle()`'s own header gives

    __mf.cam.x = worldX(band, tx0) - 16;
    __mf.cam.y = worldY(band, ty0) - 16;
  }, { tx0, ty0, w, h });
}

test('an unlit shaft', async ({ page }) => {
  await boot(page);
  await settle(page);
  await carveShaft(page, 40, 100, 6, 12);
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(2); });
  await shot(page, 'shaft-unlit.png');
});

test('the same shaft lit by a brazier', async ({ page }) => {
  await boot(page);
  await settle(page);
  await carveShaft(page, 40, 100, 6, 12);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { write: mw } = await import('/src/model/machines.js');
    const { bandOf } = await import('/src/model/world.js');

    const brazier = mw.place(bandOf('topsoil'), M.brazier, 42, 111);
    mw.take(brazier, S.timber, F.log, 4);
    __mf.cmd.hasMouse = false;
    __mf.frames(700);          // > 6s honest-fuel recipe, then settle
  });
  await shot(page, 'shaft-lit.png');
});

test('the Character tab', async ({ page }) => {
  await boot(page);
  await settle(page);
  /* INTO THE BAG, not the strip. The tab's own grid is this shot's subject,
     and a pickup fills the quickbar first (docs/SPEC.md section 24), so two
     pairs left where a collect puts them would baseline an empty grid --
     which `ui-character-fresh.png` already covers. */
  await putInMain(page, 'copper', 'ore', 5);
  await putInMain(page, 'timber', 'log', 3);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { write: rw } = await import('/src/model/run.js');
    const { open, setTab, setAutoCollect } = await import('/src/shell/ui.js');
    const { grant, step: trinketStep } = await import('/src/rules/trinkets.js');
    const { banner } = await import('/src/view/fx.js');

    grant('bellows');
    /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now, not automatic
       -- turn the magnet ON for the wait below, the same way `digging
       straight down...` above does. A SETTER, not a toggle. */
    setAutoCollect(true);
    __mf.frames(200);          // let the drafted relic fall and land in the pockets
    /* Equip into the first slot directly -- `rules/trinkets.js#equipFirst`
       is retired (the 'p' key's own primitive,
       superseded by drag-to-equip); `model/run.js#write.equip` is the same
       model write that real path already calls. */
    rw.equip(0, S.bellows);
    trinketStep();             // sync model/mods.js so the resolved deltas actually show

    open('main');
    setTab('main', 'char');
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(2);
  });
  await shot(page, 'ui-character.png');
});

/* ============================================================
   PHASE 12c2: THE SLOT-GRID INVENTORY AND QUICKBAR
   docs/PLAN-phase12.md §3 D-G/D-H, §4.6. Three new baselines: the grid on a
   totally fresh run (nothing collected at all), so `eff('invSlots')` reads
   as a real capacity fact rather than a display-order preference over a
   packed list; a real drag-driven SWAP between two occupied main-grid slots
   (the acceptance criterion's other half -- an empty-slot MOVE is already
   proven, without a screenshot, by the "REAL DRAG" test below); and the
   quickbar fully populated with `eff('quickbarSlots')` distinct pairs,
   proving there is no ordinal past the last real cell and nothing scrolls or
   truncates. At the desktop viewport only: the narrow-floor variant of each
   was a `*-phone.png` baseline and was deleted in wave 6. `narrowFloor` is
   still hoisted and still called by the four tests that ASSERT against the
   200 px buffer rather than photograph it. */

test('the Character tab on a fresh run: eff(invSlots) mostly-empty cells, not a packed list', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');
    open('main');
    setTab('main', 'char');
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(2);
  });
  await shot(page, 'ui-character-fresh.png');
});

test('dragging one occupied inventory slot onto another swaps them in place', async ({ page }) => {
  await boot(page);
  await settle(page);
  await putInMain(page, 'copper', 'ore', 5);
  await putInMain(page, 'timber', 'log', 3);
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');
    open('main');
    setTab('main', 'char');
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(1);
  });

  const { slot0, slot1 } = await page.evaluate(() => {
    const inv = __mf.ui.grids.find(g => g.id === 'inv').slots;
    return { slot0: inv[0], slot1: inv[1] };
  });
  expect(slot0.sub).not.toBeNull();
  expect(slot1.sub).not.toBeNull();
  const before = {
    a: { sub: slot0.sub, form: slot0.form }, b: { sub: slot1.sub, form: slot1.form }
  };
  expect(before.a).not.toEqual(before.b);

  await realDrag(page, slot0.x + slot0.w / 2, slot0.y + slot0.h / 2, slot1.x + slot1.w / 2, slot1.y + slot1.h / 2);

  const after = await page.evaluate(() => {
    const inv = __mf.ui.grids.find(g => g.id === 'inv').slots;
    return { a: { sub: inv[0].sub, form: inv[0].form }, b: { sub: inv[1].sub, form: inv[1].form } };
  });
  expect(after.a).toEqual(before.b);
  expect(after.b).toEqual(before.a);

  await shot(page, 'ui-character-swap.png');
});

test('the quickbar draws exactly eff(quickbarSlots) cells, fully populated, with no scrollbar or truncation', async ({ page }) => {
  await boot(page);
  await settle(page);
  const qslots = await page.evaluate(async () => {
    const { eff } = await import('/src/model/mods.js');
    return Math.round(eff('quickbarSlots'));
  });
  expect(qslots).toBe(8);
  /* Eight DISTINCT pairs -- `write.collect`'s merge-first search means giving
     the SAME pair twice tops up one slot rather than filling a second, so
     "fully populated" needs eight different substances, not one repeated. */
  const pairs = [
    ['copper', 'ore'], ['tin', 'ore'], ['timber', 'log'], ['stone', 'gravel'],
    ['soil', 'gravel'], ['granite', 'gravel'], ['adamant', 'gravel'],
    ['pick', 'relic']
  ];
  for (let i = 0; i < pairs.length; i++) await putInQuickbar(page, i, pairs[i][0], pairs[i][1]);
  await page.evaluate(async () => {
    const { banner } = await import('/src/view/fx.js');
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(1);        // draw once so __mf.ui reflects the fill
  });

  /* ONE DRAWN CELL PER SLOT, and the count is asserted on both sides:
     `__mf.ui.quickbar` is `run.inv`'s tail and `grid.slots` is what was
     painted. `view/ui/grid.js` paints every column of every row, so a
     `COLS` that did not divide the slot count would show up here as more
     drawn cells than addressable ones. */
  const grid = await page.evaluate(() => __mf.ui.grids.find(g => g.id === 'quickbar'));
  const cells = await page.evaluate(() => __mf.ui.quickbar.length);
  expect(cells).toBe(8);
  expect(grid.slots.length).toBe(8);
  expect(grid.slots.every(s => s.sub != null)).toBe(true);
  expect(grid.rows).toBe(1);            // one row of eight, never a second

  await shot(page, 'ui-quickbar-full.png');
});

/* `DIGITS` is ten glyphs long and the strip is eight cells, so '9' and '0'
   name nothing. The old mapping returned 8 and 9 for them and the arm
   branch's `if (slot && slot.sub != null)` swallowed the out-of-range read
   -- a silent no-op that no assertion could see. This drives the real
   keyboard and reads the arm back, and it fails if a digit past the last
   cell ever resolves again. */
test('digit keys past the last quickbar cell arm nothing and throw nothing', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);
  for (let i = 0; i < 8; i++) await putInQuickbar(page, i, 'copper', 'ore');
  await page.evaluate(() => __mf.frames(1));

  await page.keyboard.press('8');
  const armedAt8 = await page.evaluate(() => __mf.ui.armedPlace);
  expect(armedAt8).toBeTruthy();          // the LAST real cell does arm

  await page.evaluate(async () => (await import('/src/shell/ui.js')).clearArmedPlace());
  await page.keyboard.press('9');
  await page.keyboard.press('0');
  await page.evaluate(() => __mf.frames(1));
  expect(await page.evaluate(() => __mf.ui.armedPlace)).toBeNull();
  expect(errors).toEqual([]);

  /* AND THE MAPPING ITSELF, because the arm half alone cannot fail: an
     unbounded `slotForDigit` returns 8 for '9', `run.inv[38]` is undefined,
     and the arm branch's own null check swallows it. -1 is the only
     observable difference between the two mappings. */
  const digits = await page.evaluate(async () => {
    const { slotForDigit } = await import('/src/view/ui/quickbar.js');
    return { one: slotForDigit('1'), eight: slotForDigit('8'), nine: slotForDigit('9'), zero: slotForDigit('0') };
  });
  expect(digits).toEqual({ one: 0, eight: 7, nine: -1, zero: -1 });
});

/* No HAND recipe is genuinely lockable in this build -- `model/run.js
   #RUN_SCHEMA.known` is seeded with EVERY `HAND_RECIPES` id in
   `write.reset()`. The silhouette-rendering CODE PATH is real and wired
   (`view/ui/mainPanel.js`'s `!known` branch), but there is nothing to feed it
   a locked id with, so this screenshots the tab AS IT ACTUALLY RENDERS today
   rather than fabricating a locked recipe that cannot currently occur.

   A MACHINE'S OWN BUILD ROW IS A DIFFERENT LOCK, and D-H makes it
   a real one for the first time: `furnace` is cycle 1's reward and is no
   longer in `data/grants.js#STARTING_MACHINES`, so its PLACE-tab icon now
   genuinely renders as "not yet granted" at a fresh boot -- this baseline
   changed for that reason, not a regression. */
test('the Crafting tab', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: rw } = await import('/src/model/run.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');

    rw.collect(S.copper, F.ore, 5);
    rw.collect(S.timber, F.log, 4);
    open('main');
    setTab('main', 'craft');
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(2);
  });
  await shot(page, 'ui-crafting.png');
});

/* ============================================================
   PHASE 17j: THE ALL CATEGORY, AND THE ROW THAT NO LONGER FITS

   Both assertions are MEASUREMENTS, not screenshots. A baseline of this row
   proves the pixels have not changed; it cannot prove a sixth category is
   reachable, which is exactly what `view/ui/tabs.js`'s drop behaviour used
   to take away silently. */

/* Six labels cost 204 px (`textWidth(label) + 6` each) and the crafting body
   is 188 px wide at the 200 px floor, so DIVINE only survives because
   `drawTabs` wraps. Without the wrap this reads five ids and 9 px. */
test('the crafting category row wraps at the 200 px floor, so all six categories stay reachable', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');
    open('main');
    setTab('main', 'craft');
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(1);
  });
  await narrowFloor(page);

  const row = await page.evaluate(() => __mf.ui.tabs.find(t => t.id === 'main-craft-cat'));
  expect(row.hits.map(h => h.id)).toEqual(['all', 'raw', 'refined', 'tools', 'placeables', 'divine']);
  expect(row.h).toBe(18);                        // two lines of TAB_H, not one

  /* And every tab is inside the 200 px buffer, so wrapping did not simply
     move the overflow from the right edge to somewhere else. */
  for (const h of row.hits) {
    expect(h.x).toBeGreaterThanOrEqual(0);
    expect(h.x + h.w).toBeLessThanOrEqual(200);
    expect(h.y + h.h).toBeLessThanOrEqual(180);
  }
});

/* ALL is the absence of a filter, and the only way to prove that is to
   compare what the tab actually drew against what the five real categories
   drew between them. `drawn.recipeIndex.recipes` is the list
   `view/ui/mainPanel.js` recorded for the dispatcher, so this reads the real
   grid contents rather than re-deriving them. A category that stops covering
   a recipe fails here. */
test('the ALL category lists every hand recipe exactly once, and exactly what the five categories list between them', async ({ page }) => {
  await boot(page);
  await settle(page);
  const seen = await page.evaluate(async () => {
    const { drawn } = await import('/src/view/ui/state.js');
    const { HAND_RECIPES } = await import('/src/data/recipes.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'craft');
    __mf.cmd.hasMouse = false;

    const out = { every: HAND_RECIPES.map(r => r.id), by: {} };
    for (const cat of ['all', 'raw', 'refined', 'tools', 'placeables', 'divine']) {
      setTab('main-craft-cat', cat);
      __mf.draw();
      out.by[cat] = drawn.recipeIndex.recipes.slice();
    }
    return out;
  });

  const sorted = a => a.slice().sort();
  const { all, ...cats } = seen.by;

  expect(new Set(all).size).toBe(all.length);                  // no recipe twice
  expect(sorted(all)).toEqual(sorted(seen.every));             // none missing

  const union = Object.values(cats).flat();
  expect(new Set(union).size).toBe(union.length);              // the five do not overlap either
  expect(sorted(union)).toEqual(sorted(all));

  /* Not vacuous: `every` comes from `data/recipes.js` rather than from the
     draw, so the equality above cannot be two empty lists agreeing. The
     per-category counts are stated outright because DIVINE draws nothing
     today -- no hand recipe outputs a relic or a miracle (docs/FINDINGS.md,
     17j) -- and a test that let a category empty itself silently would hide
     the next one that does. */
  expect(all.length).toBe(19);
  const counts = Object.fromEntries(Object.entries(cats).map(([c, ids]) => [c, ids.length]));
  expect(counts).toEqual({ raw: 13, refined: 2, tools: 1, placeables: 3, divine: 0 });
});

test('the boon stack with active boons', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { grant } = await import('/src/rules/boons.js');
    const { BOONS } = await import('/src/data/boons.js');
    const { banner } = await import('/src/view/fx.js');
    /* Three MUTUALLY NON-HOSTILE boons (indices 0, 2, 4 -- `data/boons.js`'s
       own two conflicting pairs are 0/1 and 2/3), so all three stay active
       and visible at once rather than one suppressing or inverting another. */
    grant(BOONS[0].id);
    grant(BOONS[2].id);
    grant(BOONS[4].id);
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(2);
  });
  await shot(page, 'ui-boon-stack.png');
});

test('cold start -> mine 12 copper ore -> craft a furnace -> place it -> it smelts', async ({ page }) => {
  await boot(page);
  await settle(page);
  const crafted = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { bandOf } = await import('/src/model/world.js');
    const { setAutoCollect, setAutoFeed } = await import('/src/shell/ui.js');
    __mf.revealAll(bandOf('surface'));
    /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now, not automatic
       -- this flow's own point is craft -> place -> feed -> smelt, not the
       collect gate, so turn the magnet ON for the whole scene rather than
       holding 'c' through two separate waits below. A SETTER, not a toggle.
       */
    setAutoCollect(true);
    /* AND THE MACHINE-SIDE MAGNET, for the same shape of reason (Phase 16b,
       docs/SPEC.md §23.6). The `feed` link in this test's own chain is now a
       deliberate click-arm-aim-LMB verb, and driving it here would mean
       twelve real pointer presses at a machine this test teleports the
       player under -- while what the four assertions below actually check is
       that a CRAFTED rig places, is spent, and that the placed furnace
       SMELTS. THE FLAG, not the verb; the verb's own end-to-end coverage is
       the "REAL CLICK: clicking an ore slot arms it..." test. */
    setAutoFeed(true);
    /* "mine 12 copper ore" is stood in for by `give` -- the flow's own point
       is the chain (craft -> place -> feed -> smelt), not the mining grind.
       A furnace is CRAFTED (`data/recipes.js#furnace`: 12 copper/ore + 6
       timber/log, 8.0s) into a held `furnace/rig` item, THEN placed, so a bit
       more of each material is given on top of the bill or there is nothing
       left to actually smelt once the furnace itself has been built. */
    __mf.give(S.copper, F.ore, 12 + 8);
    __mf.give(S.timber, F.log, 6 + 2);
    __mf.cmd.hasMouse = false;
    __mf.hold({ craft: 1 }, 1000);      // > 8.0s, the furnace recipe's own secs
    __mf.cmd.craft = false;             // release the key -- `hold` only auto-releases hop/place
    __mf.frames(150);                   // let the crafted item fall and clear the pickup-magnet delay
    return { rig: invCount(S.furnace, F.rig), oreLeft: invCount(S.copper, F.ore), logLeft: invCount(S.timber, F.log) };
  });
  expect(crafted.rig).toBe(1);          // the recipe fired exactly once and spent its bill
  expect(crafted.oreLeft).toBe(8);
  expect(crafted.logLeft).toBe(2);

  /* Place through the quickbar's own digit keys, per `docs/FINDINGS.md`: the
     old digit-driven BUILD menu is retired, and click-to-arm (mouse or
     digit) against the quickbar is the one placement path now. Moved into
     slot 0 directly through `moveHeldToQuickbar` (this file's own helper) --
     the drag gesture itself is exercised elsewhere; this flow's point is the
     smelt chain, not a second proof of drag-and-drop. */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    /* The furnace is cycle 1's reward, not a starting
       grant -- this flow's point is the smelt chain, so grant it directly
       rather than routing through the cycle director. */
    write.grant('furnace');
  });
  await moveHeldToQuickbar(page, 0, 'furnace', 'rig');
  await page.keyboard.press('1');        // arms slot 0's furnace (`view/ui/quickbar.js#slotForDigit`)
  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  const result = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { write: pw, PW } = await import('/src/model/player.js');
    const { M } = await import('/src/data/machines.js');

    /* The finished ingot ejects from the furnace's TOP mouth and falls back
       to rest roughly under the machine's own centre -- past
       `eff('pickupR')` (10 px) from where the player was STANDING to place
       it (the aim reticle sits at the player's own row, to the side, per
       `rules/mining.js#aimAtKeys`, not at the footprint's centre). A real
       player would walk over to hand-feed or collect from a machine they
       just placed; teleported here directly under its centre rather than
       walked there, since how far a walk covers is `rules/player.js`'s own
       concern and already thoroughly covered elsewhere -- this flow's point
       is the smelt chain, not a second proof of walk speed. */
    __mf.frames(1);                      // let the keypress above actually place it
    /* Exclude the director's own altar (`rules/cycles.js#ensureAltarPlaced`) --
       `machines[0]` must be the furnace this test placed, not whichever the
       altar's own earlier placement put first in the array. */
    const placed = __mf.machines.filter(m => m.def !== M.altar);
    const m = placed[0];
    pw.move(m.box.x + m.box.w / 2 - PW / 2, __mf.player.y);

    __mf.frames(1500);                   // several 4.0s smelt cycles, plus fall + pickup
    return {
      machines: placed.length,
      ingot: invCount(S.copper, F.ingot),
      rigLeft: invCount(S.furnace, F.rig)
    };
  });

  expect(result.machines).toBe(1);
  expect(result.ingot).toBeGreaterThan(0);
  expect(result.rigLeft).toBe(0);        // the held item was spent, not merely declared
});

test('craft peg rungs by hand, place a brazier in a dark room, and the strata become visible where they were not', async ({ page }) => {
  await boot(page);
  await settle(page);
  const result = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { bandOf, seenAt, lightAt, worldX, worldY } = await import('/src/model/world.js');
    const { write: pw } = await import('/src/model/player.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { placeMachine } = await import('/src/rules/placement.js');

    /* Peg rungs BY HAND -- the real hand-craft key, not a grant. Phase 12b
       (docs/PLAN-phase12.md): pickup is opt-in now -- `collect` held
       alongside `craft` covers the wait below too. */
    __mf.give(S.timber, F.log, 2);
    __mf.hold({ craft: 1, collect: 1 }, 300);
    __mf.cmd.craft = false;             // release the key -- `hold` only auto-releases hop/place
    __mf.frames(60);
    const rungsHeld = invCount(S.timber, F.rung);

    /* A sealed, dark room deep in topsoil, far from anywhere `settle()`'s
       spawn-adjacent reveal already touched. Floor at ty0+h so a `footing:1`
       machine (the brazier) can stand on the room's own bottommost row. */
    const band = bandOf('topsoil');
    const tx0 = 50, ty0 = 150, w = 8, h = 6;
    for (let ty = ty0; ty < ty0 + h; ty++) for (let tx = tx0; tx < tx0 + w; tx++) tw.clear(band, tx, ty);
    for (let tx = tx0 - 1; tx <= tx0 + w; tx++) {
      tw.set(band, tx, ty0 - 1, S.stone);
      tw.set(band, tx, ty0 + h, S.stone);
    }
    for (let ty = ty0 - 1; ty <= ty0 + h; ty++) {
      tw.set(band, tx0 - 1, ty, S.stone);
      tw.set(band, tx0 + w, ty, S.stone);
    }

    pw.band(band);
    pw.move(worldX(band, tx0 + 1), worldY(band, ty0 + h - 2));   // feet flush on the floor
    __mf.frames(30);

    const darkTile = { tx: tx0 + w - 2, ty: ty0 };                // the far corner, several tiles off
    const litBefore = lightAt(band, darkTile.tx, darkTile.ty);
    const seenBefore = seenAt(band, darkTile.tx, darkTile.ty);

    /* `brazier` is a held `brazier/rig` item (given directly -- this test's
       own point is the light, not the crafting grind), spent by `placeMachine`
       at placement. The timber given here is pure FUEL for the machine's own
       buffer, and AUTO FEED is what pulls it out of the pockets: the
       proximity drain is opt-in and off by default as of Phase 16b
       (docs/SPEC.md §23.6). THE FLAG, NOT THE REAL FEED VERB, deliberately
       -- this test asserts LIGHT and REVEAL at a tile in the far corner of a
       sealed room, and fuel reaching the brazier is setup for that and
       nothing else. */
    const { setAutoFeed } = await import('/src/shell/ui.js');
    setAutoFeed(true);
    __mf.give(S.brazier, F.rig, 1);
    __mf.give(S.timber, F.log, 4);
    const brazier = placeMachine(band, 'brazier', tx0 + 2, ty0 + h - 1);   // adjacent, in hand-feed reach
    __mf.frames(900);                                              // > 6s honest-fuel, several times over

    const litAfter = lightAt(band, darkTile.tx, darkTile.ty);
    const seenAfter = seenAt(band, darkTile.tx, darkTile.ty);

    return { rungsHeld, brazierPlaced: !!brazier, litBefore, litAfter, seenBefore, seenAfter };
  });

  expect(result.rungsHeld).toBeGreaterThan(0);
  expect(result.brazierPlaced).toBe(true);
  expect(result.litBefore).toBe(0);
  expect(result.litAfter).toBeGreaterThan(0);
  expect(result.seenAfter).toBe(true);
});

test('overloaded past 40 T, a climb intent is refused; dropping the heaviest pair lets it succeed', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { eff } = await import('/src/model/mods.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: pw } = await import('/src/model/player.js');
    const { write: tw } = await import('/src/model/tiles.js');

    const band = bandOf('topsoil');
    const tx = 10, ty = 40;
    for (let dy = -1; dy <= 4; dy++) tw.clear(band, tx, ty + dy);
    /* `F.rung`, not `F.log`: `log`'s `tile` block is stripped
       (CLAUDE.md D12), so a placed log is no longer a climbable tile at all.
       `timber/rung` is what `peg_rungs` makes and what a ladder has been
       built from. Scene setup only -- the behaviour under
       test here is the burden climb lockout, not the tile. */
    tw.set(band, tx, ty + 4, S.timber, F.rung);       // a ladder tile
    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty + 3));  // straddling the ladder tile

    /* Over the hard cap: heavy enough that ONE drop cannot bring it back
       under, so "climb succeeds" below has to hold across more than a single
       drop -- `dropHeaviest` (the 'q' key) always sheds the single heaviest
       pair, one unit at a time, per its own header. copper/ore's massOfPair
       is exactly 1.0 T/unit, so this many units is this many talents. */
    const need = eff('burden') * 1.3;
    __mf.give(S.copper, F.ore, Math.ceil(need));
    __mf.cmd.hasMouse = false;
  });

  const y0 = await page.evaluate(() => __mf.player.y);
  await page.evaluate(() => __mf.hold({ up: 1 }, 30));
  const afterRefused = await page.evaluate(() => __mf.player.y);
  expect(afterRefused).toBeGreaterThanOrEqual(y0);      // no upward movement while over the cap

  /* Drop the heaviest pair (copper/ore, the only thing held) repeatedly
     until back under the cap -- `q` is edge-triggered, one unit per press,
     not held. Each press is exactly ONE substep (`hold(keys, 1)`) and the
     whole burst stays well under `rules/items.js#MAGNET_DELAY` (0.35s = 42
     substeps at the fixed 1/120s step): the player never moves away from
     where they are dropping, so anything given time to clear the pickup
     delay while still sitting at their feet would simply be picked back up,
     undoing the very shedding this is testing. */
  const underCap = await page.evaluate(async () => {
    const { eff } = await import('/src/model/mods.js');
    const { burdenOf } = await import('/src/model/run.js');
    /* Target well under the cap, not just barely under it: the climb check
       right after this runs long enough (60 substeps, 0.5s) to cross
       MAGNET_DELAY, and the player never moves away from the drop pile
       before starting to climb, so some of what was just shed WILL be
       picked back up mid-climb. Margin is what keeps that from tipping the
       player back over the cap before the climb assertion below gets to
       run. */
    for (let i = 0; i < 39 && burdenOf() >= eff('burden') * 0.6; i++) __mf.hold({ drop: 1 }, 1);
    return burdenOf() < eff('burden');
  });
  expect(underCap).toBe(true);

  const yBeforeClimb = await page.evaluate(() => __mf.player.y);
  await page.evaluate(() => __mf.hold({ up: 1 }, 60));
  const yAfterClimb = await page.evaluate(() => __mf.player.y);
  expect(yAfterClimb).toBeLessThan(yBeforeClimb);       // now climbs, i.e. moves UP (world y decreases)
});

test('opening the GUI, shift-clicking a recipe queues 5, and ticking drains them into the pockets', async ({ page }) => {
  await boot(page);
  await settle(page);
  const result = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { open, setTab, setAutoCollect } = await import('/src/shell/ui.js');

    /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now, not automatic
       -- this flow's own point is the craft queue draining, not the collect
       gate, so turn the magnet ON for the wait below. A SETTER, not a toggle.
       */
    setAutoCollect(true);
    __mf.give(S.timber, F.log, 20);      // 5 runs of peg_rungs (2 logs each)
    open('main');
    setTab('main', 'craft');
    __mf.frames(1);                       // draw once so __mf.ui() reflects the open panel

    __mf.intent('tab', { row: 'main-craft-cat', tab: 'placeables' });   // rung is form.tile -> 'placeables'
    const grid = __mf.ui.grids.find(g => g.id === 'recipes');
    const index = grid ? grid.slots.findIndex(s => s.sub === S.timber && s.form === F.rung) : -1;

    __mf.intent('slot', { grid: 'recipes', index, shift: true });
    const queueAfterClick = __mf.ui.craftQueue.length;

    /* `tickCraftQueue()` only drains completions it can see in the journal
       SINCE THE LAST `frames()` call -- it runs once at the end of whichever
       batch of substeps it is given, exactly once per real animation frame
       in actual play. Calling `frames(1400)` as ONE batch would hold
       `cmd.craft` continuously for the WHOLE window regardless of how many
       times the queue should have already emptied and stopped re-asserting
       it, over-crafting past what was queued. Ticking in small batches is
       what makes this a faithful stand-in for "one call per real frame". */
    for (let i = 0; i < 40 && __mf.ui.craftQueue.length; i++) __mf.frames(40);
    /* The queue empties the instant the LAST completion's 'produce' journal
       row is seen, which is before that completion's own physical output has
       necessarily finished falling and clearing the pickup delay -- a few
       more frames lets the last item land in the pockets like every other
       one already has. */
    __mf.frames(120);

    return { index, queueAfterClick, rungs: invCount(S.timber, F.rung) };
  });

  expect(result.index).toBeGreaterThanOrEqual(0);
  expect(result.queueAfterClick).toBe(5);
  expect(result.rungs).toBe(20);          // 5 completions x 4 rungs each
});

test('granting a boon in debug activates it, and it expires back to the base eff() value', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(() => { __mf.flags.showDebug = true; __mf.cmd.hasMouse = false; });

  /* THE DEBUG KEY NOW RAISES AN OFFER RATHER THAN GRANTING OUTRIGHT
     (Phase 17c1): 'b' lays out a 1-of-3 draft of the timed tier and freezes
     the run behind it, and '1' takes the first card. So the baseline is read
     from the card that WILL be taken -- which row that is comes out of the
     seeded draw, not out of `BOONS[0]`. */
  await page.keyboard.press('b');         // the debug timed-boon draft (flags.showDebug required)
  const before = await page.evaluate(async () => {
    __mf.frames(1);
    const { eff } = await import('/src/model/mods.js');
    const { BOON } = await import('/src/data/boons.js');
    const b = BOON[__mf.ui.offer.ids[0]];
    const raw = b.mods[0].key;
    const dot = raw.indexOf('.');
    return { key: dot < 0 ? raw : raw.slice(0, dot), scope: dot < 0 ? undefined : raw.slice(dot + 1),
             secs: b.secs, value: eff(dot < 0 ? raw : raw.slice(0, dot), dot < 0 ? undefined : raw.slice(dot + 1)) };
  });

  await page.keyboard.press('1');         // take the first card
  const afterGrant = await page.evaluate(async ({ key, scope }) => {
    __mf.frames(3);
    const { eff } = await import('/src/model/mods.js');
    const { boons } = await import('/src/model/boons.js');
    return { active: boons.active.length > 0, value: eff(key, scope) };
  }, before);

  expect(afterGrant.active).toBe(true);               // the HUD's own timer stack draws exactly this list
  expect(afterGrant.value).not.toBe(before.value);

  const afterExpiry = await page.evaluate(async ({ key, scope, secs }) => {
    __mf.frames(Math.ceil((secs + 1) * 120));
    const { eff } = await import('/src/model/mods.js');
    const { boons } = await import('/src/model/boons.js');
    return { active: boons.active.length > 0, value: eff(key, scope) };
  }, before);

  expect(afterExpiry.active).toBe(false);
  expect(afterExpiry.value).toBe(before.value);
});

/* NO-SPAWN GUARD: with `flags.showDebug` off, F/L/T/B must produce no entity
   and no item, exactly the debug-gated machine/draft spawns
   `src/shell/input.js` guards behind that flag. */
test('NO-SPAWN GUARD: with flags.showDebug off, F, L, T and B produce no entity and no item', async ({ page }) => {
  await boot(page);
  await settle(page);
  const before = await page.evaluate(() => {
    __mf.flags.showDebug = false;
    __mf.cmd.hasMouse = false;
    return { machines: __mf.machines.length, items: __mf.items.length };
  });

  for (const key of ['f', 'l', 't', 'b']) {
    await page.keyboard.press(key);
    await page.evaluate(() => __mf.frames(5));
  }

  const after = await page.evaluate(() => ({ machines: __mf.machines.length, items: __mf.items.length }));
  expect(after.machines).toBe(before.machines);
  expect(after.items).toBe(before.items);
});

/* ============================================================
   REAL CLICKS — GUI interaction bug fixes.

   Every test below drives the mouse for REAL (`page.mouse.move/down/up`),
   not `__mf.intent()`'s internal shortcut, because these are UI-interaction
   bug fixes and only a real click proves a real click works.

   CRITICAL TIMING TRAP (docs/DEVELOPER_GUIDE.md#writing-tests): under
   `?test=1` the RAF loop never starts (`src/shell/main.js`'s own
   `installTestHook` guard at the bottom of that file), so a bare
   `page.mouse.click()` fires mousedown+mouseup with ZERO time between them
   -- and `cmd.uiClick` is armed on mousedown and cleared on mouseup by
   `src/shell/input.js`'s own pointer handlers, so with nothing processing it
   in between it never reaches `shell/main.js#applyUiIntents()`. A real
   human's click always has at least one real animation frame between down
   and up; `__mf.frames(1)` inserted between `page.mouse.down()` and
   `page.mouse.up()` below is the faithful stand-in for that under the
   disabled loop. Every target rect comes from `__mf.ui`'s own live
   projection of what was actually drawn, never a hardcoded pixel (CLAUDE.md:
   a coordinate that works at one viewport size fails at another). */

async function toClient(page, sx, sy) {
  return page.evaluate(async ({ sx, sy }) => {
    const { VIEW } = await import('/src/core/canvas.js');
    const r = document.getElementById('stage').getBoundingClientRect();
    return { x: r.left + sx * VIEW.scale, y: r.top + sy * VIEW.scale };
  }, { sx, sy });
}

/* A real down-frame-up click at a SCREEN-space point (the same space
   `__mf.ui`'s panel/tab/grid/button rects are given in). `shift`/`ctrl`
   arm the identical modifier keys `shell/input.js#pointerdown` reads into
   `cmd.uiShift`/`cmd.uiCtrl`. */
async function realClick(page, sx, sy, { shift = false, ctrl = false } = {}) {
  const { x, y } = await toClient(page, sx, sy);
  await page.mouse.move(x, y);
  if (shift) await page.keyboard.down('Shift');
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.down();
  await page.evaluate(() => __mf.frames(1));      // the real frame a physical click always has
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  if (ctrl) await page.keyboard.up('Control');
  await page.evaluate(() => __mf.frames(1));      // let the dispatcher's own effects settle
}

/* A real drag: down at (sx0,sy0), a frame, move to (sx1,sy1), a frame, up --
   the same down/move/up shape `shell/main.js#applyUiIntents`'s rising/falling
   `cmd.uiDown` edges are written to expect. */
async function realDrag(page, sx0, sy0, sx1, sy1) {
  const a = await toClient(page, sx0, sy0);
  const b = await toClient(page, sx1, sy1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.evaluate(() => __mf.frames(1));
  await page.mouse.move(b.x, b.y);
  await page.evaluate(() => __mf.frames(1));
  await page.mouse.up();
  await page.evaluate(() => __mf.frames(1));
}

test('REAL CLICK: switching tabs and the panel close box both work (Bug 1 + Bug 2)', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { open } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');
    open('main');
    banner.fade = 0;
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
  });

  /* `ui.tab.main` is only WRITTEN by an explicit `setTab` -- the default
     ("char", the first tab) is resolved transiently at render time
     (`view/ui/mainPanel.js#activeOf`) and never persisted until a tab is
     actually picked, so it reads `undefined` here rather than 'char'. */
  let ui = await page.evaluate(() => __mf.ui);
  expect(ui.tab.main).toBeFalsy();

  const row = ui.tabs.find(t => t.id === 'main');
  const craftTab = row.hits.find(h => h.id === 'craft');
  await realClick(page, craftTab.x + craftTab.w / 2, craftTab.y + craftTab.h / 2);

  ui = await page.evaluate(() => __mf.ui);
  expect(ui.tab.main).toBe('craft');
  expect(ui.open).toContain('main');

  /* Bug 2's other half: a real, clickable close box exists regardless of
     keyboard focus state -- there is always a mouse-only way out. */
  const closeHit = ui.panels.find(p => p.id === 'main').closeHit;
  expect(closeHit).toBeTruthy();
  await realClick(page, closeHit.x + closeHit.w / 2, closeHit.y + closeHit.h / 2);

  ui = await page.evaluate(() => __mf.ui);
  expect(ui.open).not.toContain('main');
});

test('Escape while the search field has focus blurs it AND closes the panel in one press (Bug 2)', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { open, setTab, setSearchFocus } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'craft');
    setSearchFocus(true);
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
  });

  let ui = await page.evaluate(() => __mf.ui);
  expect(ui.searchFocus).toBe(true);
  expect(ui.open).toContain('main');

  /* 'i' must NOT close the panel while search has focus -- it is a legitimate
     search character (filtering for "ingot"), not a special case to carve
     out. It should be typed into the search string instead. */
  await page.keyboard.press('i');
  await page.evaluate(() => __mf.frames(1));
  ui = await page.evaluate(() => __mf.ui);
  expect(ui.search).toBe('i');
  expect(ui.searchFocus).toBe(true);
  expect(ui.open).toContain('main');

  /* One Escape does both: blur AND close, not two separate presses. */
  await page.keyboard.press('Escape');
  await page.evaluate(() => __mf.frames(1));
  ui = await page.evaluate(() => __mf.ui);
  expect(ui.searchFocus).toBe(false);
  expect(ui.open).not.toContain('main');
});

test('REAL CLICK: recipe grid click/shift-click/ctrl-click queue 1/5/max (Bug 1)', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    __mf.give(S.timber, F.log, 200);   // affordable for every click below
    open('main');
    setTab('main', 'craft');
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
    __mf.intent('tab', { row: 'main-craft-cat', tab: 'placeables' });   // rung is form.tile -> 'placeables'
  });

  const rungSlot = () => page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'recipes');
    const idx = grid.slots.findIndex(s => s.sub === S.timber && s.form === F.rung);
    return grid.slots[idx];
  });

  let slot = await rungSlot();
  expect(slot).toBeTruthy();
  await realClick(page, slot.x + slot.w / 2, slot.y + slot.h / 2);
  let q = await page.evaluate(() => __mf.ui.craftQueue.length);
  expect(q).toBe(1);

  slot = await rungSlot();
  await realClick(page, slot.x + slot.w / 2, slot.y + slot.h / 2, { shift: true });
  q = await page.evaluate(() => __mf.ui.craftQueue.length);
  expect(q).toBe(6);          // 1 + 5

  slot = await rungSlot();
  await realClick(page, slot.x + slot.w / 2, slot.y + slot.h / 2, { ctrl: true });
  q = await page.evaluate(() => __mf.ui.craftQueue.length);
  expect(q).toBe(99);         // capped at `shell/ui.js#CRAFT_QUEUE_MAX`, not 6+99
});

test('REAL CLICK: clicking a craft-queue slot cancels that entry', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    __mf.give(S.timber, F.log, 20);
    open('main');
    setTab('main', 'craft');
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
    __mf.intent('tab', { row: 'main-craft-cat', tab: 'placeables' });
  });

  const rungIndex = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return __mf.ui.grids.find(g => g.id === 'recipes').slots.findIndex(s => s.sub === S.timber && s.form === F.rung);
  });
  await page.evaluate(index => __mf.intent('slot', { grid: 'recipes', index, ctrl: true }), rungIndex);

  let q = await page.evaluate(() => __mf.ui.craftQueue.length);
  expect(q).toBeGreaterThan(1);

  const qSlot = await page.evaluate(() => __mf.ui.grids.find(g => g.id === 'craft-queue').slots[0]);
  await realClick(page, qSlot.x + qSlot.w / 2, qSlot.y + qSlot.h / 2);

  const q2 = await page.evaluate(() => __mf.ui.craftQueue.length);
  expect(q2).toBe(q - 1);
});

test('REAL CLICK: clicking an unaffordable recipe refuses instead of queuing forever (Bug 4)', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'craft');
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
    __mf.intent('tab', { row: 'main-craft-cat', tab: 'placeables' });
  });

  const before = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    return { rungs: invCount(S.timber, F.rung), logs: invCount(S.timber, F.log) };
  });
  expect(before.logs).toBe(0);      // a fresh run has nothing to pay peg_rungs with

  const slot = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'recipes');
    const idx = grid.slots.findIndex(s => s.sub === S.timber && s.form === F.rung);
    return grid.slots[idx];
  });
  expect(slot).toBeTruthy();
  await realClick(page, slot.x + slot.w / 2, slot.y + slot.h / 2);

  const after = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { toasts } = await import('/src/view/fx.js');
    return {
      rungs: invCount(S.timber, F.rung),
      queue: __mf.ui.craftQueue.length,
      toast: toasts[toasts.length - 1]?.text
    };
  });

  /* No bypass: nothing was spent and nothing was produced. And no silent
     forever-stuck queue entry either -- the click was refused outright, with
     the same journal-row refusal convention `rules/placement.js` uses. */
  expect(after.rungs).toBe(before.rungs);
  expect(after.queue).toBe(0);
  expect(after.toast).toContain('CANNOT AFFORD');
});

/* `REAL CLICK: a LOGISTICS BUILD row places the machine...` (Bug 1) used to
   live here. Removed, not rewritten: the LOGISTICS tab's BUILD row list
   (`view/ui/mainPanel.js#drawLogisticsTab`) it clicked is retired along with
   the digit-driven BUILD menu it fed (`model/run.js#buildableMachines()`,
   also gone) -- see `docs/FINDINGS.md`. Click-to-arm placement's own tests
   ("click-to-arm: placing a furnace..." above) already cover a real click
   arming and placing a machine through the ONE mechanism that remains; the
   quickbar's digit-key equivalent is covered by "a digit key arms the
   matching quickbar slot..." above. */

test('REAL DRAG: dragging a trinket onto an equip slot equips it, dragging it out unequips it (Bug 1)', async ({ page }) => {
  await boot(page);
  await settle(page);
  await putInMain(page, 'bellows', 'relic');
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'char');
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
  });

  const slots = () => page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const inv = __mf.ui.grids.find(g => g.id === 'inv');
    const eq = __mf.ui.grids.find(g => g.id === 'equip');
    return { invSlot: inv.slots.find(s => s.sub === S.bellows), eqSlot: eq.slots[0] };
  });

  let { invSlot, eqSlot } = await slots();
  expect(invSlot).toBeTruthy();
  expect(eqSlot).toBeTruthy();
  await realDrag(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2,
                        eqSlot.x + eqSlot.w / 2, eqSlot.y + eqSlot.h / 2);

  let equipped = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { run } = await import('/src/model/run.js');
    return run.equipped[0] === S.bellows;
  });
  expect(equipped).toBe(true);

  /* Drag it back OUT onto empty canvas (no grid there at all) -- the
     previously-unwired unequip path. */
  ({ invSlot, eqSlot } = await slots());
  await realDrag(page, eqSlot.x + eqSlot.w / 2, eqSlot.y + eqSlot.h / 2, 4, 4);

  equipped = await page.evaluate(async () => {
    const { run } = await import('/src/model/run.js');
    return run.equipped[0] === null;
  });
  expect(equipped).toBe(true);
});

test('fog of war: hovering an unseen tile shows nothing; the same tile shows its name once revealed (Bug 3)', async ({ page }) => {
  await boot(page);
  await settle(page);
  const result = await page.evaluate(async () => {
    const { bandOf, worldX, worldY, seenAt } = await import('/src/model/world.js');
    const { banner } = await import('/src/view/fx.js');

    const band = bandOf('topsoil');
    const tx = 60, ty = 60;         // far from spawn and from `settle()`'s own reveal
    const seenBefore = seenAt(band, tx, ty);

    banner.fade = 0;
    __mf.cmd.hasMouse = true;
    __mf.cam.x = worldX(band, tx) - 4;
    __mf.cam.y = worldY(band, ty) - 4;
    __mf.mouseAt(6, 6);             // a couple px inside the tile at (tx,ty)
    __mf.draw();
    const hoverUnseen = { ...__mf.hover };

    __mf.revealAll(band);
    __mf.draw();
    const hoverSeen = { ...__mf.hover };

    return { seenBefore, hoverUnseen, hoverSeen };
  });

  expect(result.seenBefore).toBe(false);
  expect(result.hoverUnseen.active).toBe(false);           // no tooltip at all, not a placeholder
  expect(result.hoverSeen.active).toBe(true);
  expect(result.hoverSeen.lines?.length).toBeGreaterThan(0);
});

test('opening the panel then placing closes it, and the placement still succeeds (Polish 6)', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { open } = await import('/src/shell/ui.js');

    /* A small room (5 rows tall -- PH is 16px = 2 tile rows, so this is
       generous headroom, the same margin the pre-existing "overloaded past
       40 T" test's own ladder shaft uses) carved into solid rock, plus ONE
       open cell beside it to place into -- backed on its far side by the
       untouched wall, `rules/placement.js#placeTile`'s own "needs something
       to hang from" rule. Player centred exactly mid-row `ty` (`- 4`, half
       a tile) so `rules/mining.js#aimAtKeys` (no up/down held, facing right)
       resolves to that row and not the one below it. */
    const band = bandOf('topsoil');
    const tx = 10, ty = 40;
    for (let dy = -2; dy <= 2; dy++) tw.clear(band, tx, ty + dy);
    tw.clear(band, tx + 1, ty);
    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty) - 4);

    __mf.give(S.timber, F.rung, 5);
    __mf.cmd.hasMouse = false;
    open('main');
    __mf.hold({ right: 1 }, 6);     // face right, toward the open cell at (tx+1,ty)
    __mf.frames(1);
  });

  let isOpen = await page.evaluate(() => __mf.ui.open.includes('main'));
  expect(isOpen).toBe(true);

  const before = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    return invCount(S.timber, F.rung);
  });

  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(5));

  isOpen = await page.evaluate(() => __mf.ui.open.includes('main'));
  expect(isOpen).toBe(false);            // the same press closed the panel...

  const after = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    return invCount(S.timber, F.rung);
  });
  expect(after).toBe(before - 1);        // ...and the placement itself still went through
});

/* ============================================================
   CLICK-TO-ARM PLACEMENT (Part 1) -- real clicks and real keys throughout,
   `realClick` above being the exact "a real click always has a frame
   between down and up" fix this session already root-caused.
   ============================================================ */

test('click-to-arm: placing a furnace fails with nothing armed, then succeeds once one is armed and built', async ({ page }) => {
  await boot(page);
  await settle(page);

  /* UNSUCCESSFUL: a fresh run holds nothing placeable at all -- nothing
     armed, nothing to fall back to in HUD order either -- so pressing 'E'
     places nothing. */
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    __mf.revealAll(bandOf('surface'));
    __mf.cmd.hasMouse = false;
  });
  /* Exclude the director's own altar (`rules/cycles.js#ensureAltarPlaced`) --
     this test's point is that nothing armed means 'E' places nothing, not
     that the world is devoid of machines at boot. */
  const countExAltar = () => page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.filter(m => m.def !== M.altar).length;
  });
  const before = await countExAltar();
  expect(before).toBe(0);
  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(5));
  const afterRefusal = await countExAltar();
  expect(afterRefusal).toBe(0);

  /* SUCCESSFUL: grant the furnace recipe's exact bill, hand-craft the
     `furnace/rig` item, then arm it by clicking its Character-tab slot --
     the mouse-driven half of click-to-arm; the quickbar's own digit-key
     half is `a digit key arms the matching quickbar slot...`'s own test --
     and place it with 'E'. */
  const crafted = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount, write } = await import('/src/model/run.js');
    /* The furnace is cycle 1's reward, not a starting
       grant -- crafting the rig doesn't need it, but placing it below does. */
    write.grant('furnace');
    __mf.give(S.copper, F.ore, 12);
    __mf.give(S.timber, F.log, 6);
    /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now -- `collect`
       held alongside `craft` covers the wait below too. */
    __mf.hold({ craft: 1, collect: 1 }, 1000);      // > 8.0s, `data/recipes.js#furnace`'s own secs
    __mf.cmd.craft = false;             // release the key -- `hold` only auto-releases hop/place
    __mf.frames(150);                   // let the crafted item fall and clear the pickup-magnet delay
    return { rig: invCount(S.furnace, F.rig) };
  });
  expect(crafted.rig).toBe(1);

  await moveHeldToMain(page, 'furnace', 'rig');
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'char');
    __mf.frames(1);      // draw once so __mf.ui() reflects the open panel
  });

  const invSlot = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'inv');
    return grid.slots.find(s => s.sub === S.furnace && s.form === F.rig);
  });
  expect(invSlot).toBeTruthy();
  await realClick(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2);

  const armed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armedPlace: __mf.ui.armedPlace, expectSub: S.furnace, expectForm: F.rig };
  });
  expect(armed.armedPlace).toEqual({ sub: armed.expectSub, form: armed.expectForm });

  /* Back to keyboard aim, exactly `the "a placed furnace" test`'s own move:
     no direction held aims to the SIDE, at the player's own row, which on
     the spawn shelf is open air with the floor directly beneath it. */
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });

  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(5));

  const result = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { invCount } = await import('/src/model/run.js');
    /* Exclude the director's own altar (`rules/cycles.js#ensureAltarPlaced`) --
       this test's point is that exactly the furnace just placed exists. */
    return {
      machines: __mf.machines.filter(m => m.def !== M.altar).length,
      rig: invCount(S.furnace, F.rig), armedAfter: __mf.ui.armedPlace
    };
  });
  expect(result.machines).toBe(1);
  expect(result.rig).toBe(0);              // the held item was spent, not merely declared
  expect(result.armedAfter).toBeNull();    // cleared on a successful placement
});

/* Phase 14a (CLAUDE.md D12, docs/SPEC.md §19) CHANGED WHAT THIS TEST PROVES,
   because it changed what mined rubble IS. `gravel` lost its `tile` block, so
   the 1:1 "shovel it straight back" this test used to exercise is exactly the
   behaviour that was removed -- the test would now fail at the arm step, and
   that failure would be the phase working. So the scenario is the same dig and
   the same hole, driven through the new correct path: rubble is a
   PREREQUISITE, `recipes.js#pack` turns 5 of it into one `soil/block`, and the
   BLOCK is what arms and places. The two halves the old test proved (mining
   pockets real rubble; a click-armed pair places at the aimed tile) are both
   still asserted, plus one new one: an unarmable form cannot be armed. */
test('click-to-arm: dig down, pack the rubble, then place the block back into the exact hole', async ({ page }) => {
  await boot(page);
  await settle(page);

  const tx = 10, ty = 60, holeTx = 11;   // the tile beside the player, mined and then restored

  await page.evaluate(async ({ tx, ty, holeTx }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: rw } = await import('/src/model/run.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');

    /* Hand-carved, deterministic, per CLAUDE.md's own "don't trust natural
       worldgen" warning: a floor under the player's own column so digging
       sideways for several seconds does not also start them falling, and a
       KNOWN substance (soil, not whatever seed 1337 happens to generate) at
       the one tile that will be mined and then rebuilt. */
    const band = bandOf('topsoil');
    for (let dx = 0; dx <= 1; dx++) for (let dy = -2; dy <= 0; dy++) tw.clear(band, tx + dx, ty + dy);
    tw.set(band, tx, ty + 1, S.stone);        // floor under the player's own feet
    tw.set(band, holeTx, ty, S.soil);         // the tile to mine, then restore
    /* A deterministic backing wall directly above the hole, so
       `rules/placement.js#placeTile`'s "needs something to hang from" check
       passes regardless of what natural terrain the seed happens to put
       beyond this hand-carved pocket -- the identical caution CLAUDE.md's
       fog/belt tests already state for not trusting worldgen. */
    tw.set(band, holeTx, ty - 1, S.stone);

    /* This test's whole point is the pack recipe and place-it-back-in-the-
       hole flow, not the D-Q yield-quality roll -- force soil's
       `dropChance` back to 1 so the one tile mined below is guaranteed to
       drop, the same way it did before D-Q. */
    const { write: modsw } = await import('/src/model/mods.js');
    modsw.add('test-full-yield', [{ key: 'dropChance.soil', mul: 20 }]);   // 0.05 x 20 = 1.0

    rw.collect(S.pick, F.relic, 1);           // the stock pickaxe, granted directly

    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty) - 4);   // centred on row `ty`, resting on the floor
  }, { tx, ty, holeTx });

  await page.evaluate(() => { __mf.cmd.hasMouse = false; });
  await page.evaluate(() => { __mf.hold({ right: 1 }, 6); __mf.cmd.right = false; });   // face right, toward the hole
  /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now -- `collect`
     held alongside `dig` covers the wait below too. */
  await page.evaluate(() => __mf.hold({ dig: 1, collect: 1 }, 400));   // soil hard=0.50s, comfortably past it
  await page.evaluate(() => { __mf.cmd.dig = false; });    // `dig` is held, not edge-triggered -- release it
  /* D-Q's dropChance roll draws one extra `rand()` before the toss, which
     shifts this seed's toss velocity enough that the dropped gravel can
     settle just past `pickupR` of a player standing still at `tx` -- so
     stand ON the hole for the wait, then return to `tx` before the refusal
     check below, which relies on keyboard aim (facing right, from `tx`)
     resolving back to `holeTx`. */
  await page.evaluate(async ({ tx, ty, holeTx }) => {
    const { write: pw } = await import('/src/model/player.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const band = bandOf('topsoil');
    pw.move(worldX(band, holeTx), worldY(band, ty) - 4);
    __mf.cmd.hasMouse = false;
    __mf.hold({ collect: 1 }, 150);          // let the dropped gravel fall, settle and get pocketed
    pw.move(worldX(band, tx), worldY(band, ty) - 4);
    __mf.frames(1);
  }, { tx, ty, holeTx });

  const afterDig = await page.evaluate(async ({ holeTx, ty }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { tileAt } = await import('/src/model/tiles.js');
    const { bandOf } = await import('/src/model/world.js');
    return { tile: tileAt(bandOf('topsoil'), holeTx, ty), gravel: invCount(S.soil, F.gravel) };
  }, { holeTx, ty });
  expect(afterDig.tile).toBe(0);                    // AIR: `data/forms.js#AIR`
  expect(afterDig.gravel).toBeGreaterThan(0);        // and it is actually pocketed, not merely dropped

  await moveHeldToMain(page, 'soil', 'gravel');
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'char');
    __mf.frames(1);
  });

  /* RUBBLE IS STILL NOT PLACEABLE -- but the ARM GATE is no
     longer where that is felt, and this is the one assertion in this file the
     change deliberately touched. Any occupied slot now arms (docs/SPEC.md
     section 23.1), because an arm has two possible consequences rather than
     one: gravel is a cycle-4 tribute demand and the feed verb is what hands
     it over. So clicking the gravel slot ARMS it, and the refusal moved one
     press later, to `rules/placement.js#placeTile`'s own
     'THAT DOES NOT BUILD' -- which is asserted here rather than assumed,
     because "rubble does not build" is what this test has always been for
     and the layer it lives in is the only thing that moved. */
  const gravelSlot = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'inv');
    return grid.slots.find(s => s.sub === S.soil && s.form === F.gravel);
  });
  expect(gravelSlot).toBeTruthy();                   // it IS held, and shown
  /* LET THE CAMERA CONVERGE BEFORE CLICKING. `realClick` writes `cmd.mx/my`
     against the LIVE `cam`, and `shell/main.js#applyUiIntents` recovers the
     screen point against `drawCam`, the camera as of the last draw -- so a
     camera still easing shifts the hit point by one substep of its own
     travel. This scene's teleports leave `cam.y` a few hundred pixels from
     its target, moving 7 to 14 px per substep, and the 16 px slot below was
     being hit with a 1 px margin. Any worldgen change moved it out. */
  await page.evaluate(() => __mf.frames(240));
  await realClick(page, gravelSlot.x + gravelSlot.w / 2, gravelSlot.y + gravelSlot.h / 2);
  const gravelArmed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armed: __mf.ui.armedPlace, sub: S.soil, form: F.gravel };
  });
  expect(gravelArmed.armed).toEqual({ sub: gravelArmed.sub, form: gravelArmed.form });

  /* ...and placing it is refused, with a reason, instead of silently doing
     nothing. Keyboard aim (no direction held, facing right) at the hole this
     test just mined, so the ONLY thing standing between the press and a
     placed tile is the form gate. */
  const refusal = await page.evaluate(async ({ holeTx, ty }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { tileAt } = await import('/src/model/tiles.js');
    const { bandOf } = await import('/src/model/world.js');
    const { closeTop } = await import('/src/shell/ui.js');
    const { toasts } = await import('/src/view/fx.js');
    closeTop();
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
    const held = invCount(S.soil, F.gravel);
    __mf.cmd.place = true;
    __mf.frames(2);
    /* Read the TOAST, not the journal: `__mf.frames` ends with the real
       `shell/notify.js#drainJournal`, so by the time a test could look the
       rows are already gone -- exactly as they are in a real session. The
       refusal's own text surviving into `view/fx.js#toasts` is the same
       read-back the unaffordable-recipe test above uses. */
    const why = toasts.map(t => t.text);
    return { why, held, tile: tileAt(bandOf('topsoil'), holeTx, ty), gravel: invCount(S.soil, F.gravel) };
  }, { holeTx, ty });
  expect(refusal.why).toContain('THAT DOES NOT BUILD');
  expect(refusal.tile).toBe(0);                  // the hole is still a hole
  expect(refusal.gravel).toBe(refusal.held);     // and not one unit of rubble was spent

  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'char');
    __mf.frames(1);
  });

  /* PACK IT. `data/recipes.js#pack` wants 5 of one bulk element's gravel and
     is declared last, so with nothing else affordable it is the row
     `rules/crafting.js#choose` picks. The dig above yielded one unit; the rest
     is granted directly rather than mined five times over, which would test
     the dig loop again instead of the recipe. `collect` is held alongside
     `craft` because a hand-craft's output is a FALLING ITEM (invariant 5), not
     a pocket credit. */
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    __mf.give(S.soil, F.gravel, 5 - invCount(S.soil, F.gravel));
  });
  await page.evaluate(() => __mf.hold({ craft: 1, collect: 1 }, 400));   // pack secs 2.5
  await page.evaluate(() => { __mf.cmd.craft = false; });
  await page.evaluate(() => __mf.frames(150));       // let the block fall and be picked up

  const packed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    return { gravel: invCount(S.soil, F.gravel), block: invCount(S.soil, F.block) };
  });
  expect(packed.block).toBe(1);      // 5 -> 1, and exactly one
  expect(packed.gravel).toBe(0);     // all five spent

  /* Click-to-arm the BLOCK, then place it back, aimed exactly the same way
     (no direction held, facing right) at the exact tile just mined. */
  await moveHeldToMain(page, 'soil', 'block');
  await page.evaluate(() => __mf.frames(1));
  const invSlot = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'inv');
    return grid.slots.find(s => s.sub === S.soil && s.form === F.block);
  });
  expect(invSlot).toBeTruthy();
  await realClick(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2);

  const armedPair = await page.evaluate(() => __mf.ui.armedPlace);
  expect(armedPair).toBeTruthy();

  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });

  const blockBefore = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    return invCount(S.soil, F.block);
  });

  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(5));

  const result = await page.evaluate(async ({ holeTx, ty }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { tileAt } = await import('/src/model/tiles.js');
    const { bandOf } = await import('/src/model/world.js');
    return {
      tile: tileAt(bandOf('topsoil'), holeTx, ty),
      block: invCount(S.soil, F.block),
      armedAfter: __mf.ui.armedPlace
    };
  }, { holeTx, ty });

  expect(result.tile).not.toBe(0);                    // solid again, not AIR
  expect(result.block).toBe(blockBefore - 1);          // exactly one unit spent
  expect(result.armedAfter).toBeNull();                // cleared on a successful placement
});

/* ============================================================
   THE FEED VERB (Phase 16a, docs/SPEC.md section 23), end to end in a real
   browser -- which is the only place the two halves this phase actually
   added can BOTH be exercised: `tools/check.mjs` can fire `cmd.feed` but has
   no pointer, so it cannot prove that a real `pointerdown` on a real machine
   is what sets the flag (LMB rule 2), and it cannot see the slot border light
   up at all.

   THE MEASUREMENT IS A DIFFERENCE, and section 8i of `tools/check.mjs` says
   why at length: when this was written the automatic proximity drain
   (`rules/machines.js#handFeed`) was still live and unconditional and took
   one unit per substep from a player standing in reach, so a control frame
   with no press is measured first and the press frame is asserted against
   it. PHASE 16b TURNED THE MAGNET OFF (docs/SPEC.md §23.6) and the promise
   held: the control frame's expected value went 1 -> 0 and not one assertion
   about the verb itself moved.

   A FURNACE, not the altar: `rules/cycles.js#drainReceivers` empties a
   tribute receiver's buffer the same frame it fills, so an altar's buffer can
   never be observed rising. A furnace with no fuel runs no recipe, so what
   goes in stays in and is countable.
   ============================================================ */

const FEED = { tx: 22, ty: 117, farTx: 18 };   // the furnace, and a spot well out of its reach

test('REAL CLICK: clicking an ore slot arms it and lights its border, and LMB on a furnace in reach feeds exactly one unit per press', async ({ page }) => {
  await boot(page);
  await settle(page);

  /* A carved pocket in solid rock with a floor, the same hand-built scene
     idiom every other machine test in this file uses rather than trusting
     worldgen. The player starts at `farTx` -- 26 px clear of the footprint,
     well outside `handFeed.reach` (10 px) -- so that opening the panel and
     clicking a slot costs no ore to the magnet before the real measurement
     even begins. */
  await page.evaluate(async ({ tx, ty, farTx }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { write: mw } = await import('/src/model/machines.js');

    const band = bandOf('topsoil');
    for (let y = ty - 6; y <= ty + 2; y++)
      for (let x = tx - 8; x <= tx + 6; x++) tw.clear(band, x, y);
    for (let x = tx - 8; x <= tx + 6; x++) tw.set(band, x, ty + 2, S.stone);
    __mf.revealAll(band);

    mw.place(band, M.furnace, tx, ty);
    pw.band(band);
    pw.move(worldX(band, farTx), worldY(band, ty));
    pw.vel(0, 0);
    pw.set('onGround', true);
    __mf.give(S.copper, F.ore, 8);
    __mf.cmd.hasMouse = false;
    /* LET THE CAMERA CONVERGE BEFORE ANY UI CLICK. `shell/main.js#draw`
       snapshots `drawCam` and `applyUiIntents` hit-tests a click against
       THAT, but `updateCamera` keeps easing `cam` toward the player at 5% a
       substep -- so while the camera is still travelling a screen-space slot
       rect and the pointer disagree by tens of pixels and a real click lands
       nowhere. Teleporting the player is a test-only move a real session
       never makes, so this is the test's own mess to clean up. Costs nothing
       in ore: the player is `farTx`, well outside `handFeed.reach`. */
    __mf.frames(300);
  }, FEED);

  /* ---- half one: a click on an ORE slot arms it. This used to be
     a confirmed, silent, complete no-op -- the click-to-arm gate required a
     tile-capable form, a `rig` or a `phial`, and `ore` is none of the
     three. ---- */
  await moveHeldToMain(page, 'copper', 'ore');
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'char');
    __mf.frames(1);
  });

  const oreSlot = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'inv');
    return grid.slots.find(s => s.sub === S.copper && s.form === F.ore);
  });
  expect(oreSlot).toBeTruthy();
  await realClick(page, oreSlot.x + oreSlot.w / 2, oreSlot.y + oreSlot.h / 2);

  const armed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armedPlace: __mf.ui.armedPlace, sub: S.copper, form: F.ore };
  });
  expect(armed.armedPlace).toEqual({ sub: armed.sub, form: armed.form });

  /* AND THE BORDER REALLY LIGHTS UP. CLAUDE.md's own rule: a test that
     asserts a feature is visible must prove the pixels differ with it off.
     Two draws with no step between them (so nothing else can move), the arm
     suppressed for the first -- the identical shape the growth-cue pixel
     probe further down this file uses. Slot rects are recorded in SCREEN
     space, which is the canvas's own space, so no camera term appears. */
  const border = await page.evaluate(async (slot) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { armPlace, clearArmedPlace } = await import('/src/shell/ui.js');

    const c = document.getElementById('stage');
    const ctx = c.getContext('2d');
    const grab = () => ctx.getImageData(0, 0, c.width, c.height).data;

    clearArmedPlace();
    __mf.draw();
    const before = grab();

    armPlace(S.copper, F.ore);
    __mf.draw();
    const after = grab();

    const moved = i => before[i] !== after[i] ||
                       before[i + 1] !== after[i + 1] ||
                       before[i + 2] !== after[i + 2];
    let total = 0;
    for (let i = 0; i < before.length; i += 4) if (moved(i)) total++;
    let inside = 0;
    for (let y = slot.y; y < slot.y + slot.h; y++)
      for (let x = slot.x; x < slot.x + slot.w; x++)
        if (moved((y * c.width + x) * 4)) inside++;

    /* THE SECOND REGION ARMING NOW OWNS: the IN HAND row above the
       quickbar. This probe used to assert `total === inside` -- "the arm moved
       pixels on that slot and NOWHERE else" -- which was true right up until
       arming also had to say what it armed. The claim is unchanged in spirit
       and stronger in letter: the arm moves the slot, moves the readout, and
       moves NOTHING BEYOND THOSE TWO. Read off the quickbar's own drawn rect,
       never a hardcoded row. */
    const qb = __mf.ui.grids.find(gr => gr.id === 'quickbar');
    let readout = 0;
    for (let y = qb.y - 10; y < qb.y - 1; y++)
      for (let x = 0; x < c.width; x++)
        if (y >= 0 && moved((y * c.width + x) * 4)) readout++;
    return { total, inside, readout };
  }, oreSlot);
  expect(border.inside).toBeGreaterThan(0);        // the border is actually painted...
  expect(border.readout).toBeGreaterThan(0);       // ...so is the IN HAND readout...
  expect(border.total).toBe(border.inside + border.readout);   // ...and nothing else moved

  /* ---- half two: LMB on the furnace feeds it. Close the panel first, or
     `shell/input.js` routes the click to the widget layer instead of the
     world, which is exactly what it is supposed to do. ---- */
  await page.evaluate(async ({ tx, ty }) => {
    const { closeTop } = await import('/src/shell/ui.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: pw } = await import('/src/model/player.js');
    closeTop();
    /* 6 px of clear air between the player's right edge and the footprint:
       PW is 6, so one tile-width minus 12. Inside `handFeed.reach`, which is
       the whole point -- the shell's reach gate must call this "beside it". */
    const band = bandOf('topsoil');
    pw.move(worldX(band, tx) - 12, worldY(band, ty));
    pw.vel(0, 0);
    pw.set('onGround', true);
    __mf.frames(1);
  }, FEED);

  /* THE CONTROL FRAME: in reach, nothing pressed. Whatever this costs is the
     magnet's, and the press frame below is asserted against it. */
  const control = await page.evaluate(async ({ tx }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { count } = await import('/src/model/machines.js');
    const m = __mf.machines.find(mm => mm.tx === tx);
    const p0 = invCount(S.copper, F.ore), b0 = count(m, '*/#ore');
    __mf.frames(1);
    return { pockets: p0 - invCount(S.copper, F.ore), buffer: count(m, '*/#ore') - b0 };
  }, FEED);

  /* A REAL pointer over the furnace, and a real frame after the move so
     `model/aim.js` catches up before `pointerdown` reads it -- the identical
     gap `realRightClick` below documents for the deconstruct branch. */
  const seen = await page.evaluate(async ({ tx, ty }) => {
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const band = bandOf('topsoil');
    /* The centre of the furnace's LEFT column, in SCREEN px: nearest to the
       player, so `eff('reach')`'s clamp in `rules/mining.js#aimAtWorld`
       never comes into it, and derived from the band's own geometry rather
       than typed as a pixel. */
    return { sx: worldX(band, tx) + 4 - __mf.cam.x, sy: worldY(band, ty) + 8 - __mf.cam.y };
  }, FEED);
  const at = await toClient(page, seen.sx, seen.sy);
  await page.mouse.move(at.x, at.y);
  await page.evaluate(() => __mf.frames(1));

  const aimed = await page.evaluate(async ({ tx }) => {
    const { machineAt } = await import('/src/model/machines.js');
    return {
      tx: __mf.aim.tx, valid: __mf.aim.valid, wantTx: tx,
      onMachine: !!(__mf.aim.band && machineAt(__mf.aim.band, __mf.aim.tx, __mf.aim.ty))
    };
  }, FEED);
  expect(aimed.valid).toBe(true);
  expect(aimed.onMachine).toBe(true);         // the reticle really is over the furnace

  await page.mouse.down();

  /* THE DISPATCH ITSELF, read before a single frame runs: `pointerdown`
     decided "feed" once, at the instant of the press (D-A), and recorded it
     on `aim.mode` for the reticle. This is the assertion no headless harness
     can make. */
  const dispatched = await page.evaluate(() => ({ feed: __mf.cmd.feed, mode: __mf.aim.mode }));
  expect(dispatched.feed).toBe(true);
  expect(dispatched.mode).toBe('place');

  const press = await page.evaluate(async ({ tx }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { count } = await import('/src/model/machines.js');
    const m = __mf.machines.find(mm => mm.tx === tx);
    const p0 = invCount(S.copper, F.ore), b0 = count(m, '*/#ore');
    __mf.frames(1);
    return {
      pockets: p0 - invCount(S.copper, F.ore), buffer: count(m, '*/#ore') - b0,
      armedAfter: __mf.ui.armedPlace, feedFlag: __mf.cmd.feed
    };
  }, FEED);
  await page.mouse.up();

  /* THE MAGNET IS OFF, asserted rather than assumed (Phase 16b,
     docs/SPEC.md §23.6). These two lines used to read `1`, back when
     the drain was live and unconditional and cost exactly one unit a
     substep. 16b put it behind AUTO FEED, default off, and the control frame is
     therefore free -- so the two assertions BELOW, which are the ones about
     the verb, did not have to change at all. That is what measuring a
     difference bought, and it is the same trade `tools/check.mjs` section 8i
     documents at length. */
  expect(control.pockets).toBe(0);
  expect(control.buffer).toBe(0);
  /* And the press is worth exactly ONE unit MORE than that frame was: one
     press, one unit (docs/SPEC.md section 23.3). */
  expect(press.pockets).toBe(control.pockets + 1);
  expect(press.buffer).toBe(control.buffer + 1);
  /* The edge was consumed, and the hand was NOT emptied -- ten ore in a row
     is one continuous action (section 23.3). */
  expect(press.feedFlag).toBe(false);
  expect(press.armedAfter).toEqual({ sub: armed.sub, form: armed.form });

  /* ---- half three: a WRONG pair, aimed at the same reachable furnace,
     through the SAME real pointerdown path. `shell/input.js#feedTargetAt`'s
     first draft required `feedCheck(...).ok` before rule 2 would even fire,
     which made both of `feedCheck`'s refusal strings unreachable from a real
     click: the press fell through to rule 3 (place) instead, and a rung
     armed here would land INSIDE the furnace's own footprint rather than
     refuse to feed it -- found by hand-verification and
     fixed by dropping that clause (docs/SPEC.md section 23.2 / 23.4: "a
     machine under the reticle means the machine", full stop; whether THIS
     pair is welcome is `handOne`'s question, downstream, and its answer is
     what must reach the player). The reticle has not moved since half two,
     so this is the identical real click, only what is armed differs. ---- */
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { armPlace } = await import('/src/shell/ui.js');
    const { write: rw } = await import('/src/model/run.js');
    const { toasts } = await import('/src/view/fx.js');
    rw.collect(S.timber, F.rung, 2);
    armPlace(S.timber, F.rung);
    toasts.length = 0;
  });

  await page.mouse.down();
  const wrongDispatch = await page.evaluate(() => ({ feed: __mf.cmd.feed, mode: __mf.aim.mode }));
  expect(wrongDispatch.feed).toBe(true);           // rule 2 fires even though the pair is wrong...
  expect(wrongDispatch.mode).toBe('place');

  const wrongResult = await page.evaluate(async ({ tx, ty }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { formOf, tileAt } = await import('/src/model/tiles.js');
    const { bandOf } = await import('/src/model/world.js');
    const { toasts } = await import('/src/view/fx.js');
    __mf.frames(1);
    return {
      why: toasts.map(t => t.text),
      rungsLeft: invCount(S.timber, F.rung),
      placedThere: formOf(tileAt(bandOf('topsoil'), tx, ty)) === F.rung
    };
  }, FEED);
  await page.mouse.up();

  expect(wrongResult.why).toContain('IT DOES NOT WANT THAT');   // ...and says so
  expect(wrongResult.rungsLeft).toBe(2);                        // nothing spent
  expect(wrongResult.placedThere).toBe(false);                  // and NOT placed inside the machine
});

/* ============================================================
   AUTO FEED (Phase 16b, docs/SPEC.md §23.6) -- THE SINGLE MOST
   PLAYER-VISIBLE BEHAVIOUR CHANGE IN THIS WAVE, end to end in a real
   browser, in three acts:

     1. OFF (the default): walk a full lap past a machine that accepts
        exactly what you are carrying, in and back out of its reach, and
        lose NOTHING.
     2. ON, through a REAL CLICK on the Character tab's own row -- not
        `setAutoFeed(true)` -- and the old magnet returns exactly: the same
        lap empties the pockets into the buffer.
     3. RESTART, and the toggle is back off (D16-C = D13-A, invariant 8).

   `tools/check.mjs` section 8j asserts act 1 headlessly and act 2 as its
   anti-hollow guard. What it CANNOT do is act 2's real pointer -- proving
   the row is actually hit-testable where `view/ui/mainPanel.js` drew it,
   which is the half of D2 (`view` records rects, `shell` hit-tests them)
   that only a browser can check. Nothing here is a screenshot: the row's
   own appearance is covered by the `ui-character*.png` baselines.

   THE WALK IS REAL, held keys and physics, not a teleport, because "walked
   past it" is the literal claim. A machine has no collision (it is not a
   tile -- invariant 1), so the lap passes straight through the footprint,
   which is as far inside `handFeed.reach` as it is possible to be. The
   minimum gap over the whole lap is measured and asserted, so a lap that
   silently missed cannot pass act 1 for the wrong reason.
   ============================================================ */

const LAP = { tx: 22, ty: 117, startTx: 17, endTx: 27, ore: 8 };

/* One lap: right until well past the footprint, then back left to where it
   started, sampling the closest the player's box ever came to the machine's.
   Returns the lap's cost in ore, its effect on the buffer, and that minimum
   gap in px (negative = overlapping the footprint outright). */
const feedLap = page => page.evaluate(async ({ tx, endTx, startTx }) => {
  const { S } = await import('/src/data/substances.js');
  const { F } = await import('/src/data/forms.js');
  const { invCount } = await import('/src/model/run.js');
  const { count } = await import('/src/model/machines.js');
  const { PW } = await import('/src/model/player.js');
  const { bandOf, worldX } = await import('/src/model/world.js');

  const band = bandOf('topsoil');
  const m = __mf.machines.find(mm => mm.tx === tx);
  const p0 = invCount(S.copper, F.ore), b0 = count(m, '*/#ore');

  let minGap = Infinity;
  const sample = () => {
    const gap = Math.max(m.box.x - (__mf.player.x + PW), __mf.player.x - (m.box.x + m.box.w));
    if (gap < minGap) minGap = gap;
  };

  const walkTo = (targetX, key) => {
    __mf.cmd[key] = true;
    for (let i = 0; i < 400; i++) {
      __mf.frames(4);
      sample();
      if (key === 'right' ? __mf.player.x >= targetX : __mf.player.x <= targetX) break;
    }
    __mf.cmd[key] = false;
  };

  walkTo(worldX(band, endTx), 'right');
  walkTo(worldX(band, startTx), 'left');
  __mf.frames(30);

  return {
    spent: p0 - invCount(S.copper, F.ore),
    buffered: count(m, '*/#ore') - b0,
    minGap: Math.round(minGap)
  };
}, LAP);

test('AUTO FEED off (the default): a real lap past a hungry furnace costs nothing; one real click on the Character tab row brings the magnet back', async ({ page }) => {
  await boot(page);
  await settle(page);

  await page.evaluate(async ({ tx, ty, startTx, ore }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { write: mw } = await import('/src/model/machines.js');

    /* A carved corridor with a floor and a furnace standing on it -- the same
       hand-built scene idiom every other machine test in this file uses
       rather than trusting worldgen to put a walkable flat somewhere. */
    const band = bandOf('topsoil');
    for (let y = ty - 6; y <= ty + 2; y++)
      for (let x = tx - 8; x <= tx + 8; x++) tw.clear(band, x, y);
    for (let x = tx - 8; x <= tx + 8; x++) tw.set(band, x, ty + 2, S.stone);
    __mf.revealAll(band);

    mw.place(band, M.furnace, tx, ty);
    pw.band(band);
    pw.move(worldX(band, startTx), worldY(band, ty));
    pw.vel(0, 0);
    pw.set('onGround', true);
    __mf.give(S.copper, F.ore, ore);
    __mf.cmd.hasMouse = false;
    /* LET THE CAMERA CONVERGE BEFORE ANY UI CLICK, for the reason the feed
       test above documents at length: `applyUiIntents` hit-tests against the
       camera `draw` snapshotted, and `updateCamera` is still easing toward a
       teleported player for hundreds of substeps. Costs nothing in ore --
       AUTO FEED is off, which is this test's whole first act. */
    __mf.frames(300);
  }, LAP);

  /* THE DEFAULT IS OFF, read off the real projection rather than assumed --
     `newRun` resets it, and `settle()` above called `newRun`. */
  expect(await page.evaluate(() => __mf.ui.autoFeed)).toBe(false);

  /* ---- act 1: the lap costs nothing ---- */
  const off = await feedLap(page);
  expect(off.minGap).toBeLessThan(0);      // really walked THROUGH the footprint...
  expect(off.spent).toBe(0);               // ...and the pockets are untouched
  expect(off.buffered).toBe(0);            // ...and the buffer never saw a unit

  /* ---- act 2: turn it on with a REAL CLICK on the row `view` drew ---- */
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'char');
    __mf.frames(1);
  });

  const row = await page.evaluate(() => __mf.ui.panels.find(p => p.id === 'main-auto-feed'));
  expect(row).toBeTruthy();                // `view` really registered a rect for it
  await realClick(page, row.x + row.w / 2, row.y + row.h / 2);

  const toggled = await page.evaluate(() => ({
    autoFeed: __mf.ui.autoFeed, autoCollect: __mf.ui.autoCollect
  }));
  expect(toggled.autoFeed).toBe(true);
  /* AND ONLY THAT ROW. The two toggles share a line, so a click that landed
     on the wrong rect (or on the panel behind both) is exactly the mistake
     worth catching here. */
  expect(toggled.autoCollect).toBe(false);

  /* ---- act 2b: the identical lap, and the magnet is back exactly ---- */
  await page.evaluate(async () => {
    const { closeTop } = await import('/src/shell/ui.js');
    closeTop();
    __mf.frames(1);
  });

  const on = await feedLap(page);
  expect(on.minGap).toBeLessThan(0);
  /* A furnace's ore cap is 8 (`data/machines.js#furnace`) and the pockets
     hold exactly 8, so "the magnet took the lot" is a precise number rather
     than "some". Nothing runs it -- no fuel was ever given -- so what went
     in stays in and is countable. */
  expect(on.spent).toBe(LAP.ore);
  expect(on.buffered).toBe(LAP.ore);

  /* ---- act 3: a restart puts it back off (D16-C, matching D13-A) ---- */
  await page.evaluate(() => { __mf.newRun(1337); __mf.frames(2); });
  expect(await page.evaluate(() => __mf.ui.autoFeed)).toBe(false);
});

/* ============================================================
   PHASE 16C -- THE LEGIBILITY OF AN ARMED HAND
   (docs/PLAN-phase16-interaction-model-v2.md §5 D16-E)

   Four baselines and four pixel probes. 16a built the feed verb and 16b made
   the proximity magnet opt-in; NEITHER SAID ANYTHING ON SCREEN. These cover
   the four things that now do:

     in-hand-rung          the IN HAND readout + `frameSlot`'s double frame,
                           with every panel CLOSED -- the acceptance scene
     feed-ghost-ok         a furnace that WILL take the armed pair, and how
                           full the clause that would hold it already is
     feed-ghost-refused    the same furnace, same reticle, wrong material
     miracle-ghost         an armed `phial`, which drew NOTHING before this

   EVERY ONE IS PAIRED WITH A PIXEL PROBE, because CLAUDE.md's own "a test can
   silently test nothing" entry is about exactly this class of test: two
   screenshots once baselined a scene with the overlay accidentally off and
   passed for months. A baseline proves the pixels have not CHANGED; only a
   probe proves the feature is drawing any pixels at all. Each probe draws the
   same scene twice with NO simulation step between the two draws -- so
   nothing but the state under test can possibly differ -- and asserts the
   frames are not identical, and (where it is meaningful) that the difference
   lands in the region the feature owns.

   NO HARDCODED CLICK COORDINATES ANYWHERE IN THIS BLOCK. Scene setup is
   direct model writes and `shell/ui.js#armPlace`; the reticle is placed with
   `model/aim.js#write.set`, which is also the only way to photograph a
   reticle on a machine two tiles away at all (`rules/mining.js#aimAtWorld`
   clamps a real pointer to `eff('reach')`). CLAUDE.md names the (400, 300)
   click as a real historical break.
   ============================================================ */

/* The furnace, the player beside it, and the tile the reticle sits on. `aimTx`
   is the furnace's own left column, so the ghost is over the machine and not
   over the air beside it. */
const HAND = { tx: 22, ty: 117, playerTx: 20, aimed: true, aimTx: 22, aimTy: 117 };

/* One scene, four states. `arm` names which pair goes into the hand:
   'ore' | 'rung' | 'phial' | null. `buffer` pre-loads the furnace's ore
   clause so `feedCheck`'s `have`/`cap` has something to print other than
   0/8. `aimed:false` leaves the reticle invalid, which is the state the IN
   HAND shot wants -- nothing open AND no ghost, so the readout is the only
   thing on screen that says what is in the hand. */
async function handScene(page, spec) {
  return page.evaluate(async (spec) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M, MACH } = await import('/src/data/machines.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { write: mw, capOf, count } = await import('/src/model/machines.js');
    const { write: aimw } = await import('/src/model/aim.js');
    const { run, write: runw, invCount } = await import('/src/model/run.js');
    const { armPlace, clearArmedPlace } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');
    const { tx, ty } = spec;

    const band = bandOf('topsoil');
    for (let y = ty - 6; y <= ty + 2; y++)
      for (let x = tx - 8; x <= tx + 6; x++) tw.clear(band, x, y);
    for (let x = tx - 8; x <= tx + 6; x++) tw.set(band, x, ty + 2, S.stone);
    __mf.revealAll(band);

    const m = mw.place(band, M.furnace, tx, ty);

    /* A FUELLED BRAZIER, BECAUSE A BASELINE NOBODY CAN SEE IS NOT A BASELINE.
       This room is 117 rows down in `topsoil` and sealed on every side, so
       `rules/light.js` leaves it at the floor value and the first take of
       `in-hand-rung.png` was a black rectangle with a HUD on it -- true, and
       useless for the human judgement a screenshot exists to support. Same
       brazier-plus-four-logs idiom as `shaft-lit.png` and `winch-lit.png`;
       `revealAll` above handles fog of war, which is a DIFFERENT thing from
       light and does not brighten a single pixel on its own.

       TWO of them, one either side, because ONE lit the player and left the
       furnace itself a silhouette under its own outline -- and the whole
       claim of `feed-ghost-ok.png` is that a human can see WHICH machine the
       outline is around. */
    for (const bx of [tx - 5, tx + 4]) {
      const brazier = mw.place(band, M.brazier, bx, ty);
      mw.take(brazier, S.timber, F.log, 4);
    }

    pw.band(band);
    pw.move(worldX(band, spec.playerTx), worldY(band, ty));
    pw.vel(0, 0);
    pw.set('onGround', true);
    __mf.cmd.hasMouse = false;
    banner.fade = 0;                 // past the title card, as `winchScene` does

    /* THE HAND IS STOCKED FROM THE QUICKBAR END ON PURPOSE. `frameSlot`'s
       double frame has two callers and the quickbar's 14 px cell is the
       one that is on screen with every panel shut, so an armed pair must
       actually live in a quickbar slot for `in-hand-rung.png` to show it.
       `write.collect` only ever allocates in the MAIN range, so this is the
       collect-then-`moveSlot` idiom `putInQuickbar` above already uses,
       inlined here because this scene stocks three pairs at once. */
    const PAIRS = {
      ore:   [S.copper, F.ore, 3],
      rung:  [S.timber, F.rung, 4],
      phial: [S.chasm,  F.phial, 1]
    };
    let qslot = 0;
    for (const key of ['ore', 'rung', 'phial']) {
      const [sub, form, n] = PAIRS[key];
      runw.collect(sub, form, n);
      const idx = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
      runw.moveSlot(idx, run.mainSlots + qslot++);
    }

    /* 700 SUBSTEPS: past the brazier's own 6 s honest-fuel recipe, then a
       settle, exactly as `shaft-lit.png` runs it. Nothing is held, so the
       player only stands there. */
    __mf.frames(700);

    /* THE FURNACE'S ORE CLAUSE, PRE-LOADED, AND *AFTER* THE SUBSTEPS -- the
       same "set the state the spec DECLARES last" rule `winchScene`'s own
       carrier block learned. `feedCheck` reports the matched
       SELECTOR's fill, not the machine's, so this is fed through the real
       `write.take` and read back through the real `count`/`capOf` -- the same
       two the ghost prints -- rather than asserted from a remembered number.
       NO SUBSTEPS AFTER THIS POINT: `rules/machines.js#step` owns this buffer
       and `updateCamera` owns the camera the shot parks below. */
    const def = MACH[m.def];
    if (spec.buffer) mw.take(m, S.copper, F.ore, spec.buffer);

    clearArmedPlace();
    if (spec.arm) {
      const [sub, form] = PAIRS[spec.arm];
      armPlace(sub, form);
    }
    if (spec.aimed) aimw.set(band, spec.aimTx, spec.aimTy, true);
    else aimw.set(band, 0, 0, false);

    /* CENTRED, and read off `VIEW` rather than a hardcoded 640x400 -- the
       base buffer is a function of the window (`core/canvas.js#resize`) and a
       hardcoded size here is the same defect as a hardcoded click. */
    __mf.cam.x = Math.round(worldX(band, tx) - VIEW.w / 2);
    __mf.cam.y = Math.round(worldY(band, ty) - VIEW.h / 2);
    __mf.draw();

    return {
      armed: __mf.ui.armedPlace,
      oreHeld: invCount(S.copper, F.ore),
      buffered: count(m, '*/#ore'),
      cap: capOf(def, '*/#ore'),
      quickbar: __mf.ui.grids.find(gr => gr.id === 'quickbar') || null,
      panels: __mf.ui.open.length
    };
  }, { ...HAND, ...spec });
}

/* TWO DRAWS, ZERO STEPS, ONE DIFFERENCE. `action` is one of the four names
   below and is the ONLY thing that runs between the two draws, so anything
   the returned counts show moving is attributable to it and to nothing else
   -- no substep, no camera ease, no clock advance. `box`, when given, is the
   rectangle the feature under test is supposed to own, in SCREEN space, which
   is the canvas's own space, so no camera term appears.

   A NAMED ACTION RATHER THAN A PASSED-IN CALLBACK: a `page.evaluate`
   argument crosses a serialisation boundary, so a closure cannot travel. The
   four names are spelled out inside the browser context instead of
   stringifying a function and rebuilding it there. */
async function pixelDelta(page, action, box = null) {
  return page.evaluate(async ({ action, box }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { armPlace, clearArmedPlace } = await import('/src/shell/ui.js');
    const ACTIONS = {
      clear:       () => clearArmedPlace(),
      'arm-ore':   () => armPlace(S.copper, F.ore),
      'arm-rung':  () => armPlace(S.timber, F.rung),
      'arm-phial': () => armPlace(S.chasm, F.phial)
    };

    const c = document.getElementById('stage');
    const ctx = c.getContext('2d');
    const grab = () => ctx.getImageData(0, 0, c.width, c.height).data;

    __mf.draw();
    const before = grab();
    ACTIONS[action]();
    __mf.draw();
    const after = grab();

    const moved = i => before[i] !== after[i] || before[i + 1] !== after[i + 1] ||
                       before[i + 2] !== after[i + 2];
    let total = 0;
    for (let i = 0; i < before.length; i += 4) if (moved(i)) total++;

    let inside = 0;
    if (box)
      for (let y = box.y; y < box.y + box.h; y++)
        for (let x = box.x; x < box.x + box.w; x++)
          if (x >= 0 && y >= 0 && x < c.width && y < c.height &&
              moved((y * c.width + x) * 4)) inside++;
    return { total, inside, w: c.width, h: c.height };
  }, { action, box });
}

test('16c: IN HAND names the armed pair with every panel closed, and the armed slot carries a double frame', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await handScene(page, { arm: 'rung', aimed: false });

  /* THE ACCEPTANCE CONDITION, ASSERTED AND NOT JUST PHOTOGRAPHED: nothing is
     open, and the pair the readout names is really in the hand. */
  expect(r.panels).toBe(0);
  expect(r.armed).not.toBe(null);
  expect(r.quickbar).not.toBe(null);
  await shot(page, 'in-hand-rung.png');
});

test('16c: the IN HAND line is not vacuous -- it exists only while something is armed, above the quickbar', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await handScene(page, { arm: 'rung', aimed: false });

  /* THE BAND THE READOUT OWNS: the full width of the screen, from just above
     the quickbar's top edge to that edge. Deliberately not the text's own
     measured rect -- that would be this test re-deriving `inHand`'s layout
     and then proving its own arithmetic. A row of the HUD that was blank
     before the arm and is not blank after it is the claim. */
  const band = { x: 0, y: r.quickbar.y - 10, w: 4096, h: 9 };

  const off = await pixelDelta(page, 'clear', band);
  expect(off.inside).toBeGreaterThan(0);          // the line really is painted there...
  expect(off.total).toBeGreaterThan(off.inside);  // ...and the slot frame moved too

  /* AND THE ROW IS EMPTY WITH NOTHING ARMED, which is the other half of "drawn
     ONLY when armed". Re-arming from the cleared state must move exactly the
     same pixels back -- an equality, not an inequality, because the two
     transitions are each other's inverse. */
  const on = await pixelDelta(page, 'arm-rung', band);
  expect(on.inside).toBe(off.inside);
  expect(on.total).toBe(off.total);
});

test('16c: the feed preview says a furnace WILL take the armed ore, and how full its clause is', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await handScene(page, { arm: 'ore', buffer: 3 });

  /* The numbers the ghost prints, read back through the SAME model queries it
     reads them through -- so this asserts "3 of 8", not a remembered string. */
  expect(r.buffered).toBe(3);
  expect(r.cap).toBe(8);
  expect(await page.evaluate(async ({ tx }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { feedCheck } = await import('/src/model/machines.js');
    const m = __mf.machines.find(mm => mm.tx === tx);
    return feedCheck(m, S.copper, F.ore).ok;
  }, HAND)).toBe(true);
  await shot(page, 'feed-ghost-ok.png');
});

test('16c: the same furnace at the same reticle REFUSES a rung, and says why before the click', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await handScene(page, { arm: 'rung', buffer: 3 });
  expect(r.buffered).toBe(3);
  expect(await page.evaluate(async ({ tx }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { feedCheck } = await import('/src/model/machines.js');
    const m = __mf.machines.find(mm => mm.tx === tx);
    return feedCheck(m, S.timber, F.rung).why;
  }, HAND)).toBe('IT DOES NOT WANT THAT');
  await shot(page, 'feed-ghost-refused.png');
});

test('16c: the feed preview is not vacuous -- accepting, refusing and unarmed are three different pictures', async ({ page }) => {
  await boot(page);
  await settle(page);
  await handScene(page, { arm: 'ore', buffer: 3 });

  /* THE FOOTPRINT, IN SCREEN SPACE, derived from the machine's own world box
     and the parked camera -- the region the outline and its label own,
     padded upwards by the label's one line. */
  const box = await page.evaluate(async ({ tx }) => {
    const m = __mf.machines.find(mm => mm.tx === tx);
    return {
      x: (m.box.x - __mf.cam.x) | 0, y: ((m.box.y - __mf.cam.y) | 0) - 9,
      w: m.box.w | 0, h: (m.box.h | 0) + 9
    };
  }, HAND);

  /* ore -> nothing: the whole preview disappears. */
  const gone = await pixelDelta(page, 'clear', box);
  expect(gone.inside).toBeGreaterThan(0);

  /* nothing -> a rung: it comes back in the refusal's colour with the
     refusal's words, which is a DIFFERENT picture from the accepting one --
     not merely "something is drawn". */
  const refused = await pixelDelta(page, 'arm-rung', box);
  expect(refused.inside).toBeGreaterThan(0);
  expect(refused.inside).not.toBe(gone.inside);
});

test('16c: an armed miracle finally draws a ghost where it used to draw nothing', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await handScene(page, { arm: 'phial', aimTx: 19, aimTy: 116 });
  expect(r.armed).not.toBe(null);
  await shot(page, 'miracle-ghost.png');
});

test('16c: the miracle ghost is not vacuous -- armed and unarmed differ at the reticle', async ({ page }) => {
  await boot(page);
  await settle(page);
  await handScene(page, { arm: 'phial', aimTx: 19, aimTy: 116 });

  /* The aimed tile plus the spokes' reach on every side, in screen space. */
  const box = await page.evaluate(async () => {
    const { aim } = await import('/src/model/aim.js');
    const t = aim.band.tile;
    return {
      x: ((aim.band.origin.x + aim.tx * t - __mf.cam.x) | 0) - 4,
      y: ((aim.band.origin.y + aim.ty * t - __mf.cam.y) | 0) - 4,
      w: t + 8, h: t + 8
    };
  });

  const gone = await pixelDelta(page, 'clear', box);
  expect(gone.inside).toBeGreaterThan(0);
});

/* ============================================================
   FEATURE 1 (the stalled-machine warning + hover status/producing line) and
   FEATURE 2 (right-click deconstruct), end to end: the full furnace build
   lifecycle, screenshotted at five stages -- opening the crafting UI, the
   armed ghost preview, placed-but-starved (the new no-fuel badge), fuelled
   but unresourced (idle), and finally producing (running) -- with the hover
   tooltip's status/producing line checked at the last three, and a
   right-click deconstruct at the very end. Real input throughout: real
   keys, `realClick`'s down-frame-up-frame click, and a matching
   `realRightClick` for the deconstruct.
   ============================================================ */

/* The identical down-frame-up-frame shape `realClick` above already uses,
   but for the RIGHT button. Feature 2's own dispatch (`shell/input.js`'s
   pointerdown handler) branches on `model/aim.js#aim`, which is only
   resolved fresh inside `step()` -- a frame after the move and before the
   down is what lets `aim` catch up to the new pointer position before the
   handler reads it, exactly the gap a real user's mouse motion (which spans
   several rendered frames before a click ever lands) closes for free and a
   scripted, zero-time move does not. */
async function realRightClick(page, sx, sy) {
  const { x, y } = await toClient(page, sx, sy);
  await page.mouse.move(x, y);
  await page.evaluate(() => __mf.frames(1));
  await page.mouse.down({ button: 'right' });
  await page.evaluate(() => __mf.frames(1));
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => __mf.frames(1));
}

test('the furnace build lifecycle: crafting UI, ghost, no-fuel, fuelled, running, deconstruct', async ({ page }) => {
  await boot(page);
  await settle(page);

  /* Walk over the stock pickaxe first and collect it -- not because this test
     digs anything, but because it otherwise sits on the ground near spawn as
     a loose world item, and `view/hover.js`'s own priority (a falling item
     beats a machine) would have it win every hover check below the moment it
     falls within the furnace's own generous hover radius. */
  await page.evaluate(async () => {
    /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now, not automatic
       -- turn the magnet ON for the whole scene, both for the walk-over just
       below and for the deconstruct refund at the very end of this test,
       rather than holding 'c' through two separate windows. A SETTER, not a
       toggle. */
    /* AND AUTO FEED, for stages 4 and 5 (Phase 16b, docs/SPEC.md §23.6):
       the proximity drain is opt-in and off by default now, and those two
       stages give the furnace its fuel and its ore by putting them in the
       pockets and waiting. THE FLAG, NOT THE REAL FEED VERB, deliberately:
       this test's subject is the machine's LOOK and its hover status lines
       across a lifecycle -- NO FUEL, IDLE, RUNNING, MAKING SMELT -- and how
       the material got into the buffer is not what any of its six
       screenshots or ten assertions are about. The real verb has its own
       end-to-end test ("REAL CLICK: clicking an ore slot arms it...").
       A SETTER, not a toggle. */
    const { setAutoCollect, setAutoFeed } = await import('/src/shell/ui.js');
    setAutoCollect(true);
    setAutoFeed(true);
    __mf.cmd.hasMouse = false;
    __mf.hold({ right: 1 }, 90);
    __mf.cmd.right = false;
    __mf.frames(60);
  });

  /* ---- stage 1: open the crafting UI ---- */
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    const { banner } = await import('/src/view/fx.js');
    __mf.revealAll(bandOf('surface'));
    __mf.cmd.hasMouse = false;
    /* `settle()` only advances `clock.t`, not `stepFx` (what actually decays
       the opening title) -- and `view/hud.js#drawHUD` draws the title card
       INSTEAD OF the tooltip for as long as `banner.fade > 0`, so hover
       would silently never resolve anything for the rest of this test
       without this. Same fix `hovering an inventory pair...` above already
       needs and gives the identical reason for. */
    banner.fade = 0;
  });
  await page.keyboard.press('e');       // opens the main panel -- 'i' retired
  await page.evaluate(() => __mf.frames(1));

  let ui = await page.evaluate(() => __mf.ui);
  const mainTabs = ui.tabs.find(t => t.id === 'main');
  const craftTab = mainTabs.hits.find(h => h.id === 'craft');
  await realClick(page, craftTab.x + craftTab.w / 2, craftTab.y + craftTab.h / 2);

  ui = await page.evaluate(() => __mf.ui);
  expect(ui.tab.main).toBe('craft');
  await shot(page, 'furnace-lifecycle-1-crafting-ui.png');

  /* ---- stage 2: grant a furnace/rig, arm it by clicking its Character-tab
     slot (click-to-arm), aim it, and screenshot the ghost BEFORE confirming
     the placement ---- */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { setTab } = await import('/src/shell/ui.js');
    /* The furnace is cycle 1's reward, not a starting
       grant -- this stage's own comment already said "grant a furnace/rig",
       it just didn't have to say it in code until now. */
    write.grant('furnace');
    setTab('main', 'char');
  });
  await putInMain(page, 'furnace', 'rig');
  await page.evaluate(() => __mf.frames(1));

  const invSlot = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'inv');
    return grid.slots.find(s => s.sub === S.furnace && s.form === F.rig);
  });
  expect(invSlot).toBeTruthy();
  await realClick(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2);

  const armed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armedPlace: __mf.ui.armedPlace, sub: S.furnace, form: F.rig };
  });
  expect(armed.armedPlace).toEqual({ sub: armed.sub, form: armed.form });

  /* Keyboard aim, no direction held -- the same "aims to the side, at the
     player's own row" recipe `a placed furnace` proves lands on open air
     with a floor beneath it. Closed with 'e' (NOT Escape, which also clears
     the arm) so the ghost is not drawn underneath the panel -- 'e' toggles
     the panel open/closed and touches nothing else (`shell/input.js`'s own
     handler is a bare `toggle('main')`), the same reason 'i' was originally
     chosen over Escape here, before 'i' was retired. */
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });
  await page.keyboard.press('e');
  await page.evaluate(() => __mf.frames(1));

  ui = await page.evaluate(() => __mf.ui);
  expect(ui.open).not.toContain('main');
  const armedStillSet = await page.evaluate(() => __mf.ui.armedPlace);
  expect(armedStillSet).toBeTruthy();

  await shot(page, 'furnace-lifecycle-2-ghost.png');

  /* ---- stage 3: confirm the placement -- placed, no fuel ---- */
  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(5));

  const placed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { invCount } = await import('/src/model/run.js');
    /* Exclude the director's own altar (`rules/cycles.js#ensureAltarPlaced`) --
       this test's point is that exactly the furnace just placed exists. */
    return {
      machines: __mf.machines.filter(m => m.def !== M.altar).length,
      rig: invCount(S.furnace, F.rig), armedAfter: __mf.ui.armedPlace
    };
  });
  expect(placed.machines).toBe(1);
  expect(placed.rig).toBe(0);
  expect(placed.armedAfter).toBeNull();

  await shot(page, 'furnace-lifecycle-3-no-fuel.png');

  /* Hover the placed machine's own centre -- world px converted to screen by
     subtracting the CURRENT camera, the same conversion `resolveHover`
     itself undoes. One round trip, so the camera read and the hover read
     can never disagree about which frame they describe. */
  /* `machines[0]` is no longer reliably the furnace this test placed --
     the director's own altar (`rules/cycles.js#ensureAltarPlaced`) can be in
     the array too, so this looks the furnace up by def instead. */
  const hoverMachine = () => page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const m = __mf.machines.find(mm => mm.def === M.furnace);
    __mf.mouseAt(m.box.x + m.box.w / 2 - __mf.cam.x, m.box.y + m.box.h / 2 - __mf.cam.y);
    __mf.draw();
    return { ...__mf.hover };
  });

  let hover = await hoverMachine();
  expect(hover.active).toBe(true);
  expect(hover.lines[0]).toBe('CRUDE FURNACE');
  expect(hover.lines[1]).toBe('NO FUEL');

  /* ---- stage 4: fuelled, no resources -- idle. Exactly the smelt recipe's
     own fuel bill (`data/recipes.js#smelt`: 1 fuel), pulled into the
     furnace's buffer by hand-feed the moment the player is in reach --
     placement anchored the footprint immediately beside where the player is
     already standing, so no repositioning is needed. ---- */
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    __mf.give(S.timber, F.log, 1);
    __mf.cmd.hasMouse = false;
    __mf.frames(30);                     // let hand-feed pull it into the buffer
  });
  await shot(page, 'furnace-lifecycle-4-fuelled-idle.png');

  hover = await hoverMachine();
  expect(hover.lines[1]).toBe('IDLE');
  expect(hover.lines.some(l => l.startsWith('MAKING'))).toBe(false);

  /* ---- stage 5: fuelled AND resourced -- producing. Exactly the smelt
     recipe's own ore bill (4 ore), so exactly one cycle fires and the
     buffer empties itself afterward with nothing left in the pockets to
     refill it -- the state the deconstruct at the end of this test needs. ---- */
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    __mf.give(S.copper, F.ore, 4);
    __mf.frames(60);                     // let hand-feed pull it in and the recipe start
  });

  const running = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.find(m => m.def === M.furnace).running;
  });
  expect(running).toBe(true);

  await shot(page, 'furnace-lifecycle-5-running.png');

  hover = await hoverMachine();
  expect(hover.lines[1]).toBe('RUNNING');
  expect(hover.lines[2]).toBe('MAKING SMELT');

  /* ---- right-click deconstruct: let the one smelt cycle actually finish
     and drain the buffer empty first -- `rules/placement.js#deconstruct`
     refuses ("EMPTY IT FIRST") while anything is still buffered. ---- */
  await page.evaluate(() => __mf.frames(600));   // several 4.0s smelt-cycles' worth of margin

  const drained = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const m = __mf.machines.find(mm => mm.def === M.furnace);
    return { bufKeys: Object.keys(m.buf).length, charges: m.charges };
  });
  expect(drained.bufKeys).toBe(0);
  expect(drained.charges).toBe(0);

  const target = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const m = __mf.machines.find(mm => mm.def === M.furnace);
    return { sx: m.box.x + m.box.w / 2 - __mf.cam.x, sy: m.box.y + m.box.h / 2 - __mf.cam.y };
  });
  await realRightClick(page, target.sx, target.sy);

  const after = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { items } = await import('/src/model/items.js');
    const { write: pw, PW } = await import('/src/model/player.js');
    const { M } = await import('/src/data/machines.js');

    /* The refund is a FALLING item, never a direct pocket credit (invariant
       5, `rules/placement.js#deconstruct`'s own comment) -- it needs to
       land and then sit within `eff('pickupR')` (10 px) of the player before
       the pockets reflect it. The toss is randomised sideways
       (`eff('tossSpread')`) and the player was not necessarily still
       standing exactly where they will land, so this steps in to close that
       last few pixels directly rather than guessing a walk direction --
       the same "arrange the scenario, not re-prove movement" reasoning
       `__mf.give` itself already documents. */
    __mf.frames(30);                     // let it fall and come to rest
    const dropped = items.find(it => it.sub === S.furnace && it.form === F.rig);
    if (dropped) pw.move(dropped.x - PW / 2, __mf.player.y);
    __mf.frames(200);

    /* Exclude the director's own altar (`rules/cycles.js#ensureAltarPlaced`) --
       this test deconstructed the furnace, not the altar, so the furnace's
       own count is what should read 0, not the world's total. */
    return {
      machines: __mf.machines.filter(m => m.def !== M.altar).length,
      rigBack: invCount(S.furnace, F.rig), droppedFound: !!dropped
    };
  });
  expect(after.machines).toBe(0);
  expect(after.droppedFound).toBe(true);
  expect(after.rigBack).toBe(1);
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

/* ============================================================
   PHASE 8e — THE WINCH MATRIX

   Hubs, cables, bucket chains, carriers, cranks, gears and the cable ghost.
   Twenty-one baselines, because the machinery is a family of shapes that only
   read correctly in relation to each other: a gear train that MESHES is only
   legible next to one that does not, a loaded carrier only next to an empty
   one, and a lit segment only next to the same segment in the dark.

   EVERY SCENE IS BUILT THROUGH THE MODEL AND NOT ONE CLICK COORDINATE
   APPEARS. `winchScene` takes a serialisable spec, carves the room, places
   the machines, links the segments, parks the carriers and the camera, and
   returns what it actually built so a test can ASSERT the scene it is about
   to photograph before photographing it. That matters here more than usual:
   a link that silently refused would produce a perfectly stable screenshot of
   two hubs and no cable, and CLAUDE.md's "a test can silently test nothing"
   is exactly that failure. So every segment scene asserts its own segment
   count, and the two ghost-refusal scenes assert the `why` they are named
   after.

   NOTHING MOVES YET. `rules/drive.js` writes `m.turn` and the carrier's `t`;
   this scene reads them. `winch-turned.png` sets a nonzero phase through the model
   on purpose, so the day motion lands there is a baseline that already knows
   what a turned gear looks like.
   ============================================================ */

async function winchScene(page, spec) {
  return page.evaluate(async (spec) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { write: mw } = await import('/src/model/machines.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { write: segw, linkCheck, segments } = await import('/src/model/segments.js');
    const { write: aimw } = await import('/src/model/aim.js');
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { armLink, clearLink } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');

    const band = bandOf(spec.band || 'surface');
    const { tx0, ty0, w, h } = spec.room;

    /* Carved from ROW 0 unless `sealed`, so the shaft is sky-exposed and
       `rules/light.js` floods it at `lightMax`. A sealed room is the unlit
       half of the lit/unlit pair, and is the reason that flag exists. */
    for (let ty = spec.sealed ? ty0 : 0; ty < ty0 + h; ty++)
      for (let tx = tx0; tx < tx0 + w; tx++) tw.clear(band, tx, ty);
    for (let tx = tx0; tx < tx0 + w; tx++) tw.set(band, tx, ty0 + h - 1, S.stone);
    for (const [tx, ty, n] of spec.rock || [])
      for (let i = 0; i < (n || 1); i++) tw.set(band, tx + i, ty, S.stone);

    const placed = (spec.machines || []).map(([id, tx, ty]) => mw.place(band, M[id], tx, ty));

    const refusals = [];
    for (const [i, j] of spec.links || []) {
      const c = linkCheck(placed[i], placed[j]);
      if (c.ok) segw.link(placed[i], placed[j]);
      else refusals.push(c.why);
    }
    for (const [i, sub, form, n] of spec.feed || []) mw.take(placed[i], S[sub], F[form], n);

    pw.band(band);
    pw.move(worldX(band, spec.player[0]), worldY(band, spec.player[1]));
    ww.revealAll(band);
    banner.fade = 0;
    clearLink();
    __mf.cmd.hasMouse = false;
    __mf.frames(spec.frames ?? 4);

    /* CARRIER POSITION, LOAD AND ROTATION PHASE ARE SET *AFTER* THE SUBSTEPS.
       `rules/drive.js` owns all three -- it slides an unpowered carrier down
       the cable every substep, recomputes `load` from what is actually
       aboard, and advances `turn` for every drivetrain node -- so a value
       written before `frames()` is a value the simulation immediately
       overwrites. Set here, the shot photographs the state the spec
       DECLARES, which is what an appearance baseline is for, and the
       assertions each test makes about its own `t`/`load` stay true. The
       MOVING states are a separate matrix (docs/PLAN-gears-and-winches.md
       section 6.5); this one is deliberately static. */
    for (const [i, t, load] of spec.carriers || []) {
      segw.carrier(segments[i], t, 0);
      segw.load(segments[i], load || 0);
    }
    for (const [i, phase] of spec.turns || []) mw.turn(placed[i], phase);

    /* ARMED AND AIMED LAST, and both through the model. `aim` is clamped to
       the player's own `eff('reach')` by `rules/mining.js#aimAtWorld` -- 3.2
       tiles -- so a ghost stretched to a hub twelve tiles away cannot be
       produced by moving a pointer at all, and the reach clip could never be
       photographed that way. Setting `aim` directly is the model's own
       statement of where the reticle is. */
    if (spec.arm !== undefined) {
      armLink(placed[spec.arm]);
      aimw.set(band, spec.aimAt[0], spec.aimAt[1], true);
    }

    /* THE ROOM IS CENTRED IN THE VIEWPORT, not pinned to its top-left corner.
       Pinned was the first attempt and every shot in the matrix put the
       machinery in the top-left sixth of a 640x400 frame with five sixths of
       black rock beside it -- unreviewable, which for a baseline whose whole
       purpose is a human looking at it is a defect. `VIEW` is read rather
       than assumed because the base buffer is a function of the window
       (`core/canvas.js#resize`), and a hardcoded 640x400 here is the same
       mistake as a hardcoded click coordinate.

       Parked AFTER the substeps and drawn without another one, because
       `step()` re-centres the camera on the player. */
    const { VIEW } = await import('/src/core/canvas.js');
    __mf.cam.x = Math.round(worldX(band, tx0) + w * band.tile / 2 - VIEW.w / 2)
               + (spec.offset?.[0] ?? 0);
    __mf.cam.y = Math.round(worldY(band, ty0) + h * band.tile / 2 - VIEW.h / 2)
               + (spec.offset?.[1] ?? 0);
    __mf.draw();

    return {
      machines: placed.length, segments: segments.length, refusals,
      seg: segments.map(s => ({
        t: s.t, load: s.load, len: Math.round(s.len), slope: +s.slope.toFixed(2)
      }))
    };
  }, spec);
}

/* A vertical shaft four tiles wide with rock either side, used by the chain
   shots so the mid-chain hubs read as bracketed to a wall rather than
   floating. `tx0+1 .. tx0+4` is carved; the cable runs inside it. */
const SHAFT = { tx0: 41, ty0: 24, w: 6, h: 23 };
const ROOM  = { tx0: 40, ty0: 28, w: 15, h: 18 };
const TALL  = { tx0: 40, ty0: 24, w: 16, h: 22 };

test('winch: a hub alone', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: ROOM, machines: [['hub', 44, 43]], player: [41, 43]
  });
  expect(r.machines).toBe(1);
  await shot(page, 'winch-hub.png');
});

test('winch: two hubs, not linked', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: ROOM, machines: [['hub', 44, 43], ['hub', 44, 33]], player: [41, 43]
  });
  expect(r.segments).toBe(0);
  await shot(page, 'winch-hubs-unlinked.png');
});

/* THE SAME VERTICAL SEGMENT AT THREE CARRIER POSITIONS. Three baselines and
   not one, because the bucket chain is PHASE-LOCKED to the carrier: every
   bucket on the cable moves with it, so `t` changes the whole picture and not
   just one sprite's position. If a future change broke the phase lock, the
   bottom shot would still pass and the middle one would not. */
const VERTICAL = {
  room: ROOM, machines: [['hub', 44, 43], ['hub', 44, 33]], links: [[0, 1]],
  player: [41, 43]
};

for (const [name, t] of [['bottom', 0], ['middle', 0.5], ['top', 1]]) {
  test(`winch: a vertical segment, carrier at the ${name}`, async ({ page }) => {
    await boot(page);
    await settle(page);
    const r = await winchScene(page, { ...VERTICAL, carriers: [[0, t, 0]] });
    expect(r.segments).toBe(1);
    expect(r.seg[0].slope).toBe(1);
    expect(r.seg[0].t).toBe(t);
    await shot(page, `winch-vertical-${name}.png`);
  });
}

test('winch: a loaded carrier', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, { ...VERTICAL, carriers: [[0, 0.5, 34]] });
  expect(r.seg[0].load).toBe(34);
  await shot(page, 'winch-carrier-loaded.png');
});

/* THREE ANGLES AND A HORIZONTAL, and the angle is asserted rather than
   trusted: `slope` is the number `rules/drive.js` divides gravity by,
   so a shot named "45 degrees" whose slope had drifted would be a
   baseline of the wrong mechanic. */
const ANGLES = [
  ['30', ['hub', 52, 37], 0.51],
  ['45', ['hub', 50, 35], 0.71],
  ['60', ['hub', 47, 34], 0.87],
  ['horizontal', ['hub', 53, 43], 0]
];

for (const [name, far, slope] of ANGLES) {
  test(`winch: a segment at ${name}`, async ({ page }) => {
    await boot(page);
    await settle(page);
    const r = await winchScene(page, {
      room: TALL, machines: [['hub', 42, 43], far], links: [[0, 1]],
      carriers: [[0, 0.55, 12]], player: [41, 43]
    });
    expect(r.segments).toBe(1);
    expect(r.seg[0].slope).toBe(slope);
    await shot(page, `winch-${name}.png`);
  });
}

test('winch: a crank alone', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: ROOM, machines: [['crank', 44, 43]], player: [41, 43]
  });
  expect(r.machines).toBe(1);
  await shot(page, 'winch-crank.png');
});

/* A CRANK, TWO GEARS AND A HUB, all orthogonally adjacent -- the drivetrain
   `rules/drive.js` actually solves, drawn so it reads as one continuous run of
   meshed teeth. Every footprint here shares a full edge with the next. */
test('winch: a crank, a two-gear train and a hub', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: ROOM,
    machines: [['crank', 44, 43], ['gear', 45, 44], ['gear', 46, 44], ['hub', 47, 43]],
    player: [41, 43]
  });
  expect(r.machines).toBe(4);
  await shot(page, 'winch-train.png');
});

/* THE ONE SHOT THAT HAS TO TEACH A RULE. docs/PLAN A3: diagonals do not
   conduct torque, a corner needs a gear IN it. Left, a diagonal pair with
   nothing bridging the corner; right, the same corner done properly with a
   third gear in it. A human looking at this baseline should be able to say
   which one turns without being told. */
test('winch: a diagonal gear pair does not mesh, and a cornered one does', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: ROOM,
    rock: [[44, 43], [46, 44], [50, 43], [52, 43]],
    machines: [['gear', 44, 42], ['gear', 45, 43],
               ['gear', 50, 42], ['gear', 51, 42], ['gear', 51, 43], ['gear', 52, 42]],
    player: [41, 43]
  });
  expect(r.machines).toBe(6);
  await shot(page, 'winch-gears-diagonal.png');
});

/* A THREE-SEGMENT CHAIN, AND THE SAME CHAIN WITH THE MIDDLE ONE MISSING.
   `model/segments.js#chains()` is derived and never stored, so what a human
   has to be able to see here is that a complete chain reads as continuous and
   a broken one reads as broken -- which is the whole of what the
   overview draws from the same query. */
const CHAIN = {
  room: SHAFT,
  machines: [['hub', 42, 44], ['hub', 44, 38], ['hub', 42, 32], ['hub', 44, 26]],
  player: [42, 44]
};

test('winch: a three-segment chain that connects', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    ...CHAIN, links: [[0, 1], [1, 2], [2, 3]],
    carriers: [[0, 0.35, 20], [1, 0.6, 0], [2, 0.15, 8]]
  });
  expect(r.segments).toBe(3);
  expect(r.refusals).toEqual([]);
  await shot(page, 'winch-chain.png');
});

test('winch: the same chain with the middle segment missing', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    ...CHAIN, links: [[0, 1], [2, 3]],
    carriers: [[0, 0.35, 20], [1, 0.15, 8]]
  });
  expect(r.segments).toBe(2);
  await shot(page, 'winch-chain-gap.png');
});

/* A NONZERO ROTATION PHASE, written through `model/machines.js#write.turn`.
   Nothing else in the game writes it; this is the baseline that
   says what a turning train is supposed to look like when it does, and it is
   also the proof that the phase comes from a MODEL number rather than from a
   frame counter -- the same spec drawn twice at the same phase is the same
   pixels, which is what `maxDiffPixels: 0` is asserting for every shot here. */
test('winch: a gear train at a nonzero rotation phase', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: ROOM,
    machines: [['crank', 44, 43], ['gear', 45, 44], ['axle', 46, 44], ['hub', 49, 43]],
    turns: [[0, 0.9], [1, 0.9], [2, 0.9], [3, 0.9]],
    player: [41, 43]
  });
  expect(r.machines).toBe(4);
  await shot(page, 'winch-turned.png');
});

/* ---------- the cable ghost ----------
   THE PAIR RULE APPLIES HERE MORE THAN ANYWHERE (CLAUDE.md: "a test can
   silently test nothing"). `winch-ghost-none.png` is the SAME scene as
   `winch-ghost-ok.png` with nothing armed, and the test below it reads both
   canvases back and asserts they actually differ -- so a change that made the
   ghost draw nothing at all would fail on the comparison rather than quietly
   re-baselining a picture of two hubs. */
const GHOST = {
  room: TALL, machines: [['hub', 44, 43], ['hub', 44, 35]], player: [42, 43]
};

test('winch: the cable ghost, OK', async ({ page }) => {
  await boot(page);
  await settle(page);
  await winchScene(page, { ...GHOST, arm: 0, aimAt: [44, 35] });
  expect(await page.evaluate(() => __mf.ui.linkFrom !== null)).toBe(true);
  await shot(page, 'winch-ghost-ok.png');
});

test('winch: the same scene with nothing armed draws no ghost', async ({ page }) => {
  await boot(page);
  await settle(page);
  await winchScene(page, GHOST);
  expect(await page.evaluate(() => __mf.ui.linkFrom)).toBe(null);
  await shot(page, 'winch-ghost-none.png');
});

test('winch: the cable ghost is not a no-op -- armed and unarmed differ', async ({ page }) => {
  await boot(page);
  await settle(page);
  const hashOf = () => page.evaluate(() => {
    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0, h = 2166136261;
    for (let i = 0; i < d.length; i += 4) {
      h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
      h = Math.imul(h, 16777619);
      n++;
    }
    return { hash: h >>> 0, n };
  });

  await winchScene(page, GHOST);
  const bare = await hashOf();
  await winchScene(page, { ...GHOST, arm: 0, aimAt: [44, 35] });
  const armed = await hashOf();

  expect(armed.n).toBe(bare.n);
  expect(armed.hash).not.toBe(bare.hash);
});

test('winch: the cable ghost, TOO FAR APART', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: TALL, machines: [['hub', 44, 43], ['hub', 44, 25]],
    links: [[0, 1]], arm: 0, aimAt: [44, 25], player: [42, 43]
  });
  expect(r.refusals).toEqual(['TOO FAR APART']);
  expect(r.segments).toBe(0);
  await shot(page, 'winch-ghost-far.png');
});

test('winch: the cable ghost, THE PATH IS BLOCKED', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    ...GHOST, rock: [[44, 40, 2]], links: [[0, 1]], arm: 0, aimAt: [44, 35]
  });
  expect(r.refusals).toEqual(['THE PATH IS BLOCKED']);
  expect(r.segments).toBe(0);
  await shot(page, 'winch-ghost-blocked.png');
});

/* ---------- the lit / unlit pair ----------
   A segment emits no light of its own and no row says it should, so a cable
   in a sealed shaft is as dark as the rock around it. Two baselines, for the
   reason the existing shaft pair states: a regression that made the darkness
   pass skip live-drawn machinery would have to move one of these against its
   OWN accepted baseline, not merely look plausible beside the other. */
const DARK_SHAFT = {
  room: { tx0: 40, ty0: 30, w: 10, h: 16 }, sealed: true,
  machines: [['hub', 42, 43], ['hub', 42, 33]], links: [[0, 1]],
  carriers: [[0, 0.5, 20]], player: [41, 43]
};

test('winch: a segment in an unlit shaft', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, DARK_SHAFT);
  expect(r.segments).toBe(1);
  await shot(page, 'winch-unlit.png');
});

test('winch: the same segment lit by a brazier', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    ...DARK_SHAFT,
    machines: [...DARK_SHAFT.machines, ['brazier', 44, 44]],
    feed: [[2, 'timber', 'log', 4]],
    frames: 700
  });
  expect(r.segments).toBe(1);
  await shot(page, 'winch-lit.png');
});

/* RENDER PURITY OVER EVERY NEW DRAW PATH (invariant 9): a cable, a bucket
   chain, a carrier with cargo, a turned gear train and the cable ghost, all
   on screen at once, drawn twice -- and `model/epoch.js` must not move. The
   headless harness in `tools/check.mjs` asserts the same thing over the
   default scene, which contains none of this. */
test('winch: drawing the whole family writes nothing to the model', async ({ page }) => {
  await boot(page);
  await settle(page);
  await winchScene(page, {
    room: TALL,
    machines: [['hub', 44, 43], ['hub', 44, 35], ['crank', 46, 43],
               ['gear', 47, 44], ['axle', 48, 44]],
    links: [[0, 1]], carriers: [[0, 0.4, 25]],
    turns: [[2, 0.7], [3, 0.7], [4, 0.7]],
    arm: 0, aimAt: [44, 35], player: [42, 43]
  });

  const moved = await page.evaluate(async () => {
    const { epoch } = await import('/src/model/epoch.js');
    const before = epoch.n;
    __mf.draw();
    __mf.draw();
    return epoch.n - before;
  });
  expect(moved).toBe(0);
});

/* ============================================================
   PHASE 8g — THE MOTION MATRIX

   The matrix above is STATIC by construction: it writes `t`, `load` and
   `turn` after the substeps precisely so the simulation cannot move them
   (`docs/FINDINGS.md` #9). These six are the states that only exist while
   something is moving, and every number in them is the simulation's own:
   nothing is written after `frames()`, so a carrier's position is wherever
   `rules/drive.js` put it and a gear's phase is however far it actually turned.

   THAT MAKES THEM A DIFFERENT KIND OF BASELINE, and the difference is worth
   stating: an 8e shot moving means the ART changed; one of these moving means
   the ART or the MOTION changed. So each asserts its own motion first -- the
   carrier is strictly between the ends, its `dir` has the sign the scene is
   named for, the cranks in reach are delivering torque -- and only then
   photographs it. A scene that had quietly stalled would otherwise be a
   perfectly stable screenshot of a parked bucket, which is CLAUDE.md's "a test
   can silently test nothing" with motion in the blank.

   THE TUTORIAL CALLOUT IS DELIBERATELY OFF HERE, and this is the call
   `docs/FINDINGS.md` #10 left open. `driveScene` advances `run.tutorialBeat`
   to 4 (`CALLOUTS[4]` is `null`), so these shots carry no "TAKE THE PICKAXE"
   box. The reason is specific to this matrix rather than a general ruling: six
   baselines whose whole subject is a moving drivetrain should not be coupled
   to unrelated tutorial content, and a future tutorial rewrite must not move
   six drivetrain pictures. The existing shots are NOT touched -- they
   are already baselined with the callout, and re-taking them would be churning
   reviewed output that already exists.

   A CRANK LADDER IS NOT A HACK, it is the only build that can photograph an
   ASCENDING RIDER. A crank has a 12 px reach and a rider aboard leaves it in
   the first pixel of travel (`tools/check.mjs`'s framerate section says the
   same thing about measurement). `rules/drive.js`'s own header states that
   every crank within reach turns, and a wall of handles beside the shaft is
   exactly what a player who wants to ride up would build. So `CRANKS` stacks
   them two rows apart along the shaft wall, and the rider is always within
   reach of one.
   ============================================================ */

/* Cranks every two rows up a wall, bottom-to-top, all footprint-adjacent and
   therefore all one drivetrain component. */
const CRANKS = (tx, tyTop, tyBottom) => {
  const out = [];
  for (let ty = tyBottom; ty >= tyTop; ty -= 2) out.push(['crank', tx, ty]);
  return out;
};

async function driveScene(page, spec) {
  return page.evaluate(async ({ spec, arrival }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { write: mw, machines } = await import('/src/model/machines.js');
    const { write: iw } = await import('/src/model/items.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw, PW, PH } = await import('/src/model/player.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { write: segw, linkCheck, segments, carrierPos, carrierTop } =
      await import('/src/model/segments.js');
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { eff } = await import('/src/model/mods.js');
    const { clearLink, setAutoCollect } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');
    const { VIEW } = await import('/src/core/canvas.js');

    /* Phase 12b (docs/PLAN-phase12.md): pickup is opt-in now, not automatic
       -- turn the magnet ON for every scene this helper builds, so the
       boot-placed stock pickaxe near spawn (`shell/boot.js`) is swept up as
       it always was rather than sitting as incidental clutter a teleported
       player happens to land near. None of these scenes are about pickup.
       A SETTER and not a toggle (Phase 13c, docs/PLAN-phase13.md §4.5): this
       helper builds many scenes and must state the state it wants, not flip
       whatever the last one left behind. */
    setAutoCollect(true);

    const main = bandOf(spec.band || 'surface');
    const rooms = spec.rooms || [{ band: spec.band || 'surface', ...spec.room }];

    for (const r of rooms) {
      const b = bandOf(r.band || spec.band || 'surface');
      for (let ty = r.sky ? 0 : r.ty0; ty < r.ty0 + r.h; ty++)
        for (let tx = r.tx0; tx < r.tx0 + r.w; tx++) tw.clear(b, tx, ty);
      if (r.floor !== false)
        for (let tx = r.tx0; tx < r.tx0 + r.w; tx++) tw.set(b, tx, r.ty0 + r.h - 1, S.stone);
      ww.revealAll(b);
    }

    const placed = (spec.machines || []).map(([id, tx, ty, bid]) =>
      mw.place(bandOf(bid || spec.band || 'surface'), M[id], tx, ty));

    const refusals = [];
    for (const [i, j] of spec.links || []) {
      const c = linkCheck(placed[i], placed[j]);
      if (c.ok) segw.link(placed[i], placed[j]);
      else refusals.push(c.why);
    }
    for (const [i, sub, form, n] of spec.feed || []) mw.take(placed[i], S[sub], F[form], n);

    /* PAST THE TUTORIAL CALLOUT (see this section's header). Four beats is
       exactly where `data/callouts.js` runs out of strings. */
    while (run.tutorialBeat < 4) rw.advanceBeat();

    pw.band(main);
    pw.move(worldX(main, spec.player[0]), worldY(main, spec.player[1]));
    banner.fade = 0;
    clearLink();
    __mf.cmd.hasMouse = false;

    /* The beat jump above releases the altar, so its arrival is waited out
       here -- after the player is parked in the shaft, so the 2 s of idle
       simulation cannot sweep up the stock pickaxe at spawn. See
       `ARRIVAL_SUBSTEPS`. */
    __mf.frames(arrival);

    /* Anything that has to happen BEFORE the motion is measured -- lighting a
       brazier, mostly, which takes seconds of simulation the carrier would
       spend sliding to the bottom of its cable. */
    if (spec.preFrames) __mf.frames(spec.preFrames);

    /* THE START STATE, parked after the pre-roll and before the motion. */
    for (const [i, t] of spec.start || []) segw.carrier(segments[i], t, 0);
    if (spec.burden) rw.collect(S.copper, F.ore, spec.burden);
    for (const [i, sub, form, n] of spec.cargo || []) {
      const p = carrierPos(segments[i]);
      for (let k = 0; k < n; k++) {
        const it = iw.spawn(segments[i].band, p.x, p.y, S[sub], F[form], 0, 0);
        if (it) it.rest = 1;
      }
    }
    if (spec.ride !== undefined) {
      const seg = segments[spec.ride];
      pw.move(carrierPos(seg).x - PW / 2, carrierTop(seg) - PH);
      pw.vel(0, 0);
      pw.set('onGround', true);
      pw.set('fallFrom', carrierTop(seg) - PH);
    }

    /* THE MOTION. Nothing is written after this. `cmd.action` -- renamed
       from `cmd.turn` in Phase 12d (docs/PLAN-phase12.md §3 D-J) -- is the
       crank hold; `spec.turn` (this scene builder's own DSL field name) is
       unchanged, since it describes the SCENE's intent, not the input field. */
    /* `riseTo` IS A CABLE PARAMETER AND `frames` IS A SUBSTEP COUNT, and a
       scene that knows where it wants the carrier should say that instead. A
       substep count is calibrated to `eff('segUp')`, so it goes stale the
       moment that tunable moves -- which is how one scene came to assert a
       parked carrier was ascending. Only sound on a SATURATED drivetrain,
       where the carrier really does run at the full `segUp`. */
    const frames = spec.frames ?? Math.round(
      ((spec.riseTo - segments[0].t) * segments[0].len / eff('segUp')) * 120);
    __mf.cmd.action = !!spec.turn;
    __mf.frames(frames);
    __mf.cmd.action = false;

    const centre = spec.centreOn
      ? { x: carrierPos(segments[spec.centreOn]).x, y: carrierPos(segments[spec.centreOn]).y }
      : { x: worldX(main, rooms[0].tx0) + rooms[0].w * main.tile / 2,
          y: worldY(main, rooms[0].ty0) + rooms[0].h * main.tile / 2 };
    __mf.cam.x = Math.round(centre.x - VIEW.w / 2) + (spec.offset?.[0] ?? 0);
    __mf.cam.y = Math.round(centre.y - VIEW.h / 2) + (spec.offset?.[1] ?? 0);
    __mf.draw();

    return {
      machines: placed.length, segments: segments.length, refusals,
      hearts: run.hearts, beat: run.tutorialBeat,
      seg: segments.map(s => ({
        t: +s.t.toFixed(4), dir: s.dir, load: +s.load.toFixed(2),
        len: Math.round(s.len), slope: +s.slope.toFixed(2), band: s.band?.id ?? null
      })),
      /* Every drivetrain node that actually turned, so a scene can prove its
         crank was in reach rather than assume it. */
      turning: machines.filter(m => m.turn > 0).length,
      driven: machines.filter(m => m.torque > 0).length
    };
  }, { spec, arrival: ARRIVAL_SUBSTEPS });
}

const MOTION_SHAFT = { tx0: 40, ty0: 24, w: 12, h: 23, sky: true };

/* ---------- 1. mid-ascent, with a rider aboard ----------
   `riseTo` RATHER THAN `frames`: the crank stack saturates this span's
   drivetrain, so the budget is the cable distance over `eff('segUp')` and the
   scene stays half way up its 80 px cable through any retune of that tunable.
   It was 400 substeps, calibrated to `segUp` 11, and at 26 px/s it overran the
   top and asserted a parked carrier was ascending. */
test('drive: a carrier mid-ascent with a rider aboard', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await driveScene(page, {
    rooms: [MOTION_SHAFT],
    machines: [['hub', 44, 43], ['hub', 44, 33], ...CRANKS(43, 33, 43)],
    links: [[0, 1]], start: [[0, 0.05]], ride: 0, turn: true, riseTo: 0.51,
    player: [47, 43], centreOn: 0
  });
  expect(r.segments).toBe(1);
  expect(r.seg[0].dir).toBe(-1);                       // -1 is UP
  expect(r.seg[0].t).toBeGreaterThan(0.15);
  expect(r.seg[0].t).toBeLessThan(0.95);
  expect(r.driven).toBeGreaterThan(0);                 // a crank really is in reach
  expect(r.hearts).toBe(5);                            // and riding costs nothing
  await shot(page, 'drive-ascending-rider.png');
});

/* ---------- 2. mid-descent under its own weight, loaded ---------- */
test('drive: a carrier mid-descent under weight', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await driveScene(page, {
    rooms: [MOTION_SHAFT],
    machines: [['hub', 44, 43], ['hub', 44, 33]],
    links: [[0, 1]], start: [[0, 0.95]], cargo: [[0, 'copper', 'ore', 4]],
    turn: false, frames: 200, player: [47, 43], centreOn: 0
  });
  expect(r.segments).toBe(1);
  expect(r.seg[0].dir).toBe(1);                        // +1 is DOWN
  expect(r.seg[0].t).toBeGreaterThan(0.15);
  expect(r.seg[0].t).toBeLessThan(0.85);
  expect(r.seg[0].load).toBeGreaterThan(0);            // the cargo is aboard, not lost
  expect(r.driven).toBe(0);                            // nothing is driving it
  await shot(page, 'drive-descending-loaded.png');
});

/* ---------- 3. reversing under an over-cap rider ----------
   The brief's own correction, as a picture: the crank is being turned, the
   drivetrain is delivering torque, and the carrier is going DOWN anyway,
   because the rider is carrying more than that drivetrain can lift. The
   'TOO HEAVY TO LIFT' toast in the frame is `rules/drive.js` saying so, and it
   is in the shot on purpose -- it is the one state that is otherwise baffling.

   ONE CRANK HERE, NOT THE LADDER, and the reason is a game fact rather than a
   test convenience: with a dense ladder an over-cap rider simply CLIMBS
   (measured -- three cranks in reach supply 4.5 against a 53 T rider's 2.3),
   because more drivetrain lifts more, which is the whole of invariant 4's "the
   one way to raise a heavy carrier is more drivetrain". So reversal is what a
   MODEST drivetrain does under a heavy rider: one crank, gear-bridged to the
   hub (the crank sits at rows 41-42 and the hub at 43-44, which touch only at
   a corner -- a diagonal does not conduct, so the gear at (43,43) is load
   bearing, not decoration).

   A SHORT six-tile cable, so a quarter of a second of travel is a quarter of
   the cable and the carrier photographs plainly between its ends rather than
   a few pixels off one. */
test('drive: a reversing carrier under an over-cap rider', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await driveScene(page, {
    rooms: [MOTION_SHAFT],
    machines: [['hub', 44, 43], ['hub', 44, 37], ['crank', 43, 41], ['gear', 43, 43]],
    links: [[0, 1]], start: [[0, 0.4]], ride: 0, burden: 45, turn: true,
    frames: 40, player: [47, 43], centreOn: 0
  });
  expect(r.segments).toBe(1);
  expect(r.driven).toBe(3);                            // hub, crank and the bridging gear
  expect(r.seg[0].dir).toBe(1);                        // and it IS going down
  expect(r.seg[0].t).toBeGreaterThan(0.15);
  expect(r.seg[0].t).toBeLessThan(0.4);
  /* THE RIDER'S OWN MASS IS THE LOAD, and over the 40 T cap: 8 T of body plus
     45 T of ore. D4 as amended is that this is never refused, only felt. */
  expect(r.seg[0].load).toBeGreaterThan(40);
  await shot(page, 'drive-reversing-overcap.png');
});

/* ---------- 4. a crank and a gear train, actually turning ----------
   8e's `winch-turned.png` wrote a phase into the model. This one holds the key
   and lets the drivetrain arrive at its own phase, which is the only version
   that can catch a gear that stopped meshing. */
test('drive: a crank and a gear train being turned', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await driveScene(page, {
    rooms: [{ tx0: 40, ty0: 28, w: 15, h: 18, band: 'surface', sky: true }],
    machines: [['hub', 44, 43], ['hub', 44, 35], ['crank', 46, 43],
               ['gear', 47, 44], ['axle', 48, 44]],
    links: [[0, 1]], start: [[0, 0.5]], turn: true, frames: 90, player: [47, 41]
  });
  expect(r.segments).toBe(1);
  /* FOUR nodes turn, not five: the crank, the gear, the axle and the hub they
     are adjacent to. The FAR hub eight tiles up is its own component with no
     crank in it, so it delivers nothing and does not spin -- the same fact
     tools/check.mjs's torque-conservation section asserts about its own top
     hubs, and the reason a segment is driven by the greater of its two ends
     rather than by both. */
  expect(r.turning).toBe(4);
  expect(r.driven).toBe(4);
  expect(r.seg[0].dir).toBe(-1);
  await shot(page, 'drive-crank-train-turning.png');
});

/* ---------- 5. a three-segment chain, all of it moving ---------- */
test('drive: a three-segment chain in motion', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await driveScene(page, {
    rooms: [{ tx0: 41, ty0: 24, w: 6, h: 23, band: 'surface', sky: true }],
    machines: [['hub', 42, 44], ['hub', 44, 38], ['hub', 42, 32], ['hub', 44, 26]],
    links: [[0, 1], [1, 2], [2, 3]],
    start: [[0, 0.9], [1, 0.9], [2, 0.9]],
    cargo: [[0, 'copper', 'ore', 2]],
    turn: false, frames: 150, player: [41, 44]
  });
  expect(r.segments).toBe(3);
  for (const s of r.seg) {
    expect(s.dir).toBe(1);
    expect(s.t).toBeGreaterThan(0.1);
    expect(s.t).toBeLessThan(0.9);
  }
  await shot(page, 'drive-chain-moving.png');
});

/* ---------- 6. a carrier crossing a band seam ----------
   The ordinary case, not the exotic one: every delivery this design is about
   crosses one. Both bands are carved from the anchors' own rows -- a window
   sized from a hub's PLACEMENT tile misses the lower band's row 0 entirely,
   which `tools/check.mjs`'s cross-band section records at length. A brazier
   lights it, because thirty tiles below the surface floor there is nothing
   else to see by. */
test('drive: a carrier at a band seam', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await driveScene(page, {
    band: 'surface',
    rooms: [{ band: 'surface', tx0: 56, ty0: 46, w: 10, h: 10, floor: false },
            { band: 'topsoil', tx0: 56, ty0: 0, w: 10, h: 8 }],
    machines: [['hub', 60, 52], ['hub', 60, 2, 'topsoil'], ['brazier', 63, 4, 'topsoil']],
    links: [[0, 1]], feed: [[2, 'timber', 'log', 4]],
    preFrames: 700, start: [[0, 0.9]], turn: false, frames: 100,
    player: [58, 53], centreOn: 0
  });
  expect(r.segments).toBe(1);
  expect(r.seg[0].dir).toBe(1);
  expect(r.seg[0].t).toBeGreaterThan(0.2);
  expect(r.seg[0].t).toBeLessThan(0.9);
  expect(r.seg[0].band).toBe('topsoil');               // the low end is below the seam
  await shot(page, 'drive-band-seam.png');
});

/* ============================================================
   PHASE 10c: TRIBUTE AND FAVOUR

   Three scenes at the desktop viewport. Each used to carry a narrow-floor
   twin as a `*-phone.png` baseline; wave 6 deleted all 18 of those, because
   the game is keyboard-and-mouse only and the images cost re-accepting
   without testing input. There is no second Playwright project for a narrow
   viewport and there never was (`playwright.config.js` declares exactly one,
   `desktop`) -- `__mf.resize` is exposed on the test hook
   precisely so a scene can reach any viewport directly, the same way every
   other test in this file drives state through the model rather than
   through a hardcoded click coordinate (CLAUDE.md). `__mf.resize(200, 180)`
   lands exactly on the floor: `VIEW.scale` clamps to 2 at this size, so
   `VIEW.w = max(200, ceil(200/2)) = 200` and `VIEW.h = max(180, ...) = 180`.

   THE "PAST EVERY CALLOUT" NUMBER IS NOT ONE NUMBER, and here is why:
   `CALLOUTS[4]` is `null` (beat 5 fires a frame later with no player action
   in between), so `< 4` still means "no callout" and every scene using it is
   unaffected; the end of the sheet, however, moved from 6 to 10 when beats
   7-10 landed. A scene that wants NO callout must therefore either stop at 4
   or run to 10 -- 6 is now mid-sheet and draws a line.

   Every scene sets `run.tutorialBeat` explicitly, past the point any
   `data/callouts.js` row has a string (FINDINGS #10) -- the same
   `while (run.tutorialBeat < N) rw.advanceBeat()` idiom `driveScene` already
   uses above, here inlined since these scenes are simple enough not to need
   a shared scene builder.

   ONLY SCENE 1 STEPS THE DIRECTOR. Setting the beat and drawing without a
   frame leaves cycle 1's altar unplaced (D17-G), and that is right for every
   scene here but the first. Scene 2 is armed at cycle 3 and photographs four
   panels crowding at once, scene 3 photographs the over-cap burden bar, and
   the three cycle-4 scenes below are armed at the dock and deliberately
   never step, because a stepped frame with cycle 4 already paid completes
   the trial out from under the picture. Scene 1's subject IS the first
   trial, so it is the one that needs its receiver behind it. */

/* THE NARROW LAYOUT FLOOR, and it is a DESKTOP condition, not a phone one.
   `core/canvas.js#resize` clamps the buffer to `Math.max(BASE_W_MIN, ...)` by
   `Math.max(180, ...)` at a scale of `max(2, min(6, round(ih / 400)))`, so any
   browser window around 400x360 renders at exactly this buffer. All four
   callers ASSERT against it -- tab wrap, label abbreviation, stat visibility,
   callout-versus-quickbar -- rather than photograph it. The 18 `*-phone.png`
   baselines that used to pair with them were deleted in wave 6: the game is
   keyboard-and-mouse only, there has never been a second Playwright project,
   and `playwright.config.js` declares exactly one, `desktop`. */
const narrowFloor = page => page.evaluate(() => { __mf.resize(200, 180); __mf.draw(); });

/* Exactly one altar stands, and it lies inside the buffer being
   photographed. A scene whose subject is the first trial has to have the
   altar in it, and a baseline alone cannot say so -- `tribute-cycle1-armed`
   pictured an armed trial with no altar anywhere on screen for a whole phase
   (docs/REVIEW-wave5-17f1.md D2). Screen px, camera already subtracted. */
const altarOnScreen = page => page.evaluate(async () => {
  const { M } = await import('/src/data/machines.js');
  const standing = __mf.machines.filter(m => m.def === M.altar);
  if (standing.length !== 1) return { standing: standing.length };
  const b = standing[0].box, c = document.getElementById('stage');
  const x = b.x - __mf.cam.x, y = b.y - __mf.cam.y;
  return { standing: 1, onScreen: x + b.w > 0 && y + b.h > 0 && x < c.width && y < c.height };
});

/* ---- 1. cycle 1, freshly armed, no clock ----
   `settle()` alone arms it: `rules/cycles.js#step` runs inside `newRun`'s
   own first frames, and cycle 1's `deadlineSecs` is `null` (docs/SPEC.md
   section 4), so the scene this baseline exists to prove is that TRIBUTE
   draws no timer line for it.

   THE ALTAR IS THE OTHER HALF OF THE PICTURE. Arming the trial and placing
   its receiver are two different frames as of D17-G, so this steps the
   director and then waits the rise out -- the presentation belongs to
   `altar-arrival.png`, and this scene wants the altar settled behind the
   panel. */
test('tribute: cycle 1 armed, no clock', async ({ page }) => {
  await boot(page);
  await settle(page);
  await altarArrives(page);
  await pastArrival(page);
  expect(await altarOnScreen(page)).toEqual({ standing: 1, onScreen: true });
  await shot(page, 'tribute-cycle1-armed.png');
});

/* ---- 2. mid-cycle-3, a running deadline, two of three gods known, AND a
   boon active ----
   Written directly rather than played to: reaching cycle 3 for real means
   building the astral chain the cycle director's own walkthrough covers,
   which this scene does not own. `rw.tribute`/`rw.cycle`/`rw.favour` are the SAME
   writers `rules/cycles.js` itself calls, so this is the identical state a
   real run would reach, just arrived at directly. POSEIDON is left
   untouched on purpose, so the FAVOUR panel's mask has something to mask.

   docs/BUILD_PLAN.md Phase 11 TIER 3 asks for TRIBUTE, FAVOUR, an active
   boon and the ruler all on screen AT ONCE, specifically so full panel
   crowding under D8's anchored layout can be checked by eye rather than
   assumed -- so this baseline is EXTENDED rather than duplicated (this
   file's own ownership note calls this out as the one sanctioned
   exception): `rules/boons.js#grant`, the same call `the boon stack with
   active boons` above already uses, activates `BOONS[0]` on top of the
   existing tribute/favour state. */
test('tribute and favour: mid-cycle-3, two of three gods known, a boon active', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    const { grant } = await import('/src/rules/boons.js');
    const { BOONS } = await import('/src/data/boons.js');
    /* 10, NOT 6. This scene's own rule -- stated in the block
       comment above it -- is "past the point any `data/callouts.js` row has a
       string", so that a panel-crowding shot is not dominated by a callout
       that has nothing to do with it. Beat 6 WAS that point; the sheet now
       runs to 10 (cycle 2's four first-time asks, docs/SPEC.md 20.4) and
       `CALLOUTS[6..9]` all carry copy. And 10 is the honest number for this
       scene besides: a run genuinely at cycle 3 has fired every beat. */
    while (run.tutorialBeat < 10) rw.advanceBeat();
    rw.cycle(3);
    rw.tribute({ id: 'grey-eyed-tithe', have: {}, left: 300 });
    rw.favour('hephaestus', 3);
    rw.favour('athena', 2);
    grant(BOONS[0].id);
    __mf.draw();
  });
  await shot(page, 'tribute-favour-cycle3.png');
});

/* ---- 3. the over-cap burden bar, with TRIBUTE drawn beneath it ----
   FINDINGS #13's own regression guard: `view/ui/bar.js`'s fix (step 1 of
   this phase) is proven on `drive-reversing-overcap.png` already, but that
   scene predates TRIBUTE and never exercised a LABELLED bar (every demand
   row) sitting directly under a bar whose value is wide enough to have
   caused the original defect. This scene is the one place both are true at
   once. */
test('tribute: the over-cap burden scene', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    while (run.tutorialBeat < 4) rw.advanceBeat();
    rw.collect(S.copper, F.ore, 45);
    __mf.draw();
  });
  await shot(page, 'tribute-overcap-burden.png');
});

/* ---- 4. THE WIN SCREEN (Phase 13d, docs/SPEC.md §20.2) ----
   ONE NEW BASELINE, and the only one this phase adds: a whole end-of-run
   screen shipped with no pixels under test is exactly the gap this file
   exists for, and `view/hud.js#winScreen` shares `endScreen` with the death
   screen, so a layout regression here would take both down together.

   REACHED THROUGH THE REAL DIRECTOR, not by drawing the screen directly:
   `rw.cycle(CYCLES.length + 1)` plus a cleared ledger is the state a fourth
   completion leaves behind, and the two frames after it are what
   `rules/cycles.js#ensureLiveCycle` needs to notice the boundary, set
   `run.won` and push the `win` row (which `shell/notify.js` then turns into
   the toast visible through the wash). `run.favour`/`run.misses` are written
   with their own real writers so the two totals the screen prints are not
   zeroes.

   `__mf.frames` STOPS MATTERING THE INSTANT IT WINS -- `shell/main.js#step`
   returns early on `run.won` -- so the frame count below is not a timing
   window: any count of 1 or more lands in exactly the same state. */
test('the win screen: every shipped trial paid', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    const { CYCLES } = await import('/src/data/cycles.js');
    while (run.tutorialBeat < 10) rw.advanceBeat();
    rw.favour('hephaestus', 3);
    rw.favour('athena', 2);
    rw.favour('poseidon', 3);
    rw.miss();
    rw.tribute(null);
    rw.cycle(CYCLES.length + 1);
    __mf.frames(2);
    __mf.draw();
  });
  const won = await page.evaluate(async () => {
    const { run } = await import('/src/model/run.js');
    return run.won;
  });
  expect(won).toBe(true);
  await shot(page, 'win-screen.png');
});

/* ============================================================
   PHASE 17e -- THE BATCH ROW AND THE HUD CLOSEOUT
   ============================================================ */

/* A hash of the whole canvas, or of one rectangle of it. The "not vacuous"
   probe this file already uses for the relic halo and the cable ghost,
   pulled out here because four of the tests below need it and two of them
   need it over a crop -- a flashing clock is 30 pixels on a 640x400 frame,
   and a whole-canvas hash would also answer for anything else that moves. */
async function canvasHash(page, rect = null) {
  return page.evaluate(r => {
    const c = document.getElementById('stage');
    const g = c.getContext('2d');
    const d = r ? g.getImageData(r.x, r.y, r.w, r.h).data
                : g.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) {
      h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }, rect);
}

/* Cycle 4 armed with both demand rows already full, and a batch ledger built
   to order. Written directly through `rw.tribute` for the same reason the
   cycle-3 scene above is: reaching cycle 4 for real means the whole astral
   chain. `credits` is a list of unit counts, all stamped at the current
   `run.t`, which is the shape `rules/cycles.js#creditTribute` produces and
   `model/run.js#prunedCredits` then bounds. */
async function ratedCycle(page, { credits = [], left = 200 } = {}) {
  await page.evaluate(async ({ credits, left }) => {
    const { write: rw, run } = await import('/src/model/run.js');
    const { keyOf } = await import('/src/model/items.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    while (run.tutorialBeat < 10) rw.advanceBeat();
    rw.cycle(4);
    rw.favour('hephaestus', 3);
    rw.favour('athena', 2);
    const have = {};
    have[keyOf(S.copper, F.plate)] = 8;
    have[keyOf(S.granite, F.gravel)] = 8;
    rw.tribute({ id: 'salt-tribute', have, left, credits: credits.map(n => ({ t: run.t, n })) });
    /* The opening title card is still up two substeps into a run and this
       scene's subject is the panel underneath it. Cleared directly rather
       than stepped past, because stepping 240 substeps with cycle 4 armed
       and paid would let `rules/cycles.js` complete the trial. */
    (await import('/src/view/fx.js')).banner.fade = 0;
    __mf.draw();
  }, { credits, left });
}

const tributeBars = page => page.evaluate(async () => {
  const { tributeMet } = await import('/src/model/run.js');
  const by = {};
  for (const b of __mf.ui.bars) by[b.id] = { valueText: b.valueText, frac: b.frac, label: b.label };
  return { met: tributeMet(), bars: by };
});

/* ---- 1. the batch row, and an aggregate that cannot read 100% unpaid ----
   `docs/REVIEW-wave5-17d.md` D2: the panel used to sum the demand rows
   alone, so a cycle 4 with both piles full and an empty window drew 8/8,
   8/8 and 100% while the trial refused to pay and the clock ran out. */
test('17e: a rated cycle 4 reads honestly at every stage of its batch window', async ({ page }) => {
  await boot(page);
  await settle(page);

  await ratedCycle(page, { credits: [] });
  const empty = await tributeBars(page);
  expect(empty.met).toBe(false);
  expect(Object.keys(empty.bars)).toContain('tribute-batch');
  expect(empty.bars['tribute-batch'].valueText).toBe('0 / 4');
  expect(empty.bars['tribute-batch'].label).toBe('COPPER PLATE IN 2:00');
  /* And the same row abbreviates rather than running under FAVOUR when the
     column cannot hold the full name (D8). */
  await narrowFloor(page);
  const floor = await tributeBars(page);
  expect(floor.bars['tribute-batch'].label).toBe('CU PLT IN 2:00');
  await page.evaluate(() => { __mf.resize(1280, 800); __mf.draw(); });
  expect(empty.bars['tribute-progress'].valueText).not.toBe('100%');
  expect(empty.bars['tribute-progress'].valueText).toBe('80%');
  await shot(page, 'tribute-cycle4-batch-empty.png');

  await ratedCycle(page, { credits: [1, 2] });
  const part = await tributeBars(page);
  expect(part.met).toBe(false);
  expect(part.bars['tribute-batch'].valueText).toBe('3 / 4');
  expect(part.bars['tribute-progress'].valueText).not.toBe('100%');

  await ratedCycle(page, { credits: [4] });
  const full = await tributeBars(page);
  expect(full.met).toBe(true);
  expect(full.bars['tribute-batch'].valueText).toBe('4 / 4');
  expect(full.bars['tribute-progress'].valueText).toBe('100%');
  await shot(page, 'tribute-cycle4-batch-full.png');
});

/* `model/run.js#batchHave` saturates near `batch.n` rather than counting
   deliveries, and its own doc says a raw readout would under-report. A
   single credit of six is the case that proves the bar is clamped rather
   than merely reading the query: `prunedCredits` keeps that entry whole, so
   the query answers 6 against a demand for 4. */
test('17e: the batch bar is clamped at batch.n, not a raw delivery count', async ({ page }) => {
  await boot(page);
  await settle(page);
  await ratedCycle(page, { credits: [6] });
  const over = await tributeBars(page);
  const raw = await page.evaluate(async () => {
    const { batchHave } = await import('/src/model/run.js');
    return batchHave();
  });
  expect(raw).toBe(6);
  expect(over.bars['tribute-batch'].valueText).toBe('4 / 4');
  expect(over.bars['tribute-batch'].frac).toBe(1);
  expect(over.bars['tribute-progress'].valueText).toBe('100%');
});

/* ---- 2. the miss tally (punch-list #11) ----
   `run.misses` was drawn on the win screen and nowhere else, so a player
   one miss from the end of the run had no way to know it. Nothing about a
   miss changes the world, so the canvas hash is the whole assertion: the
   two frames differ only if something drew the count. */
test('17e: the miss tally is not vacuous -- one expired deadline changes the TRIBUTE column', async ({ page }) => {
  await boot(page);
  await settle(page);
  await ratedCycle(page, { credits: [4] });
  const clean = await canvasHash(page);

  await page.evaluate(async () => {
    const { write: rw } = await import('/src/model/run.js');
    rw.miss();
    __mf.draw();
  });
  const missed = await canvasHash(page);
  expect(missed).not.toBe(clean);

  await shot(page, 'tribute-cycle4-missed-once.png');
});

/* ---- 3. the deadline's urgency treatment (punch-list #15) ----
   The boon stack has flashed under `eff('urgentSecs')` since Phase 4 and
   the deadline did not. The flash is `((t * 6) | 0) % 2`, which flips either
   side of a sixth of a second, so the two times below straddle 10.0 s by a
   tenth of a millisecond: `view/scene.js`'s clouds drift on the same
   `clock.t` and the TRIBUTE column sits over open sky, and 0.0002 s of
   drift cannot move a cloud by a whole pixel. The CROP is the column's own
   clock row, read off the aggregate bar's real rectangle.

   BOTH HALVES MATTER. A deadline that flashed at every value would pass the
   first expectation and fail the second, and a clock that never flashed
   would do the reverse. */
const clockCrop = page => page.evaluate(() => {
  const agg = __mf.ui.bars.find(b => b.id === 'tribute-progress');
  return { x: Math.max(0, agg.x - 2), y: agg.y + agg.h, w: 60, h: 10 };
});

async function clockAt(page, t) {
  await page.evaluate(v => { __mf.clock.t = v; __mf.draw(); }, t);
  return canvasHash(page, await clockCrop(page));
}

test('17e: the deadline flashes inside the urgency threshold and holds steady outside it', async ({ page }) => {
  await boot(page);
  await settle(page);

  await ratedCycle(page, { credits: [], left: 200 });
  const calmA = await clockAt(page, 9.9999);
  const calmB = await clockAt(page, 10.0001);
  expect(calmB).toBe(calmA);

  await ratedCycle(page, { credits: [], left: 3 });
  const hotA = await clockAt(page, 9.9999);
  const hotB = await clockAt(page, 10.0001);
  expect(hotB).not.toBe(hotA);

  await shot(page, 'tribute-deadline-urgent.png');
});

/* ---- 4. the death screen's tally (punch-list #16) ----
   Both end screens go through `view/hud.js#endScreen`, and the death half
   used to print only the depth. Two deaths whose runs went differently must
   not render the same tally, and the CROP is the two rows directly above the
   restart button -- the wash is translucent, so a whole-canvas hash would
   also answer for the FAVOUR bars showing through it. */
async function deathScene(page) {
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    while (run.tutorialBeat < 10) rw.advanceBeat();
    rw.tribute(null);
    rw.hurt(run.hearts, 'A FALL FROM THE LEDGE');
    __mf.draw();
  });
}

/* The run's tally, written onto the SAME dead run. A second `newRun` would
   be a second world behind the translucent wash, and `view/paint.js`
   repaints at most `REPAINT_BUDGET` chunks a frame, so the two frames would
   differ for reasons that have nothing to do with the lines under test. */
async function tallyTheDeath(page) {
  await page.evaluate(async () => {
    const { write: rw } = await import('/src/model/run.js');
    rw.cycle(3);
    rw.favour('hephaestus', 3);
    rw.favour('athena', 2);
    rw.miss();
    __mf.draw();
  });
}

test('17e: the death screen carries the same tally the win screen does', async ({ page }) => {
  await boot(page);
  await settle(page);
  /* Two 8 px rows and their leading, measured up from the button
     `endScreen` records rather than counted down from the headline. */
  const tallyCrop = page => page.evaluate(() => {
    const btn = __mf.ui.panels.find(p => p.id === 'death-restart');
    return { x: 0, y: btn.y - 26, w: document.getElementById('stage').width, h: 26 };
  });

  await deathScene(page);
  const bare = await canvasHash(page, await tallyCrop(page));

  await tallyTheDeath(page);
  const told = await canvasHash(page, await tallyCrop(page));
  /* Before the shots, so a screen that stopped reporting the tally goes red
     on the claim rather than on a stale reference image. */
  expect(told).not.toBe(bare);

  await shot(page, 'death-screen-tallied.png');
});

/* ---- 5. the Character tab's stat block scrolls (FINDINGS 16b.3) ----
   Three of four stat rows were clipped at `body.bottom` at every viewport.
   The region reuses the inventory grid's own mechanism, so this drives a
   REAL wheel over it and reads back the lines that were actually drawn --
   a rect recorded with the right `rows` but drawing the wrong slice would
   pass a count assertion and fail this one. */
const STAT_LABELS = ['WALK', 'CLIMB', 'PICK POWER', 'FURNACE RATE'];

/* Everything the HUD draws OVER the main panel, put away so a shot of the
   panel is a shot of the panel: the title card, the last toast, and the
   world tooltip the pointer leaves behind wherever the wheel parked it.
   `pointerleave` is the real event `shell/input.js` listens for. */
const quietHud = page => page.evaluate(async () => {
  const fx = await import('/src/view/fx.js');
  fx.banner.fade = 0;
  fx.toasts.length = 0;
  document.getElementById('stage').dispatchEvent(new PointerEvent('pointerleave'));
  __mf.draw();
});

async function realWheel(page, sx, sy, notches) {
  const { x, y } = await toClient(page, sx, sy);
  await page.mouse.move(x, y);
  for (let i = 0; i < Math.abs(notches); i++) {
    await page.mouse.wheel(0, Math.sign(notches) * 120);
    await page.evaluate(() => __mf.frames(1));
  }
}

const statRegion = page => page.evaluate(() => {
  const g = __mf.ui.grids.find(gr => gr.id === 'stats');
  return g ? { x: g.x, y: g.y, w: g.w, h: g.h, rows: g.rows, lines: g.lines } : null;
});

/* Down one real wheel notch at a time, collecting every line drawn on the
   way. The offset is zeroed through `shell/ui.js#scrollSet` first rather
   than wheeled back up: `scrollBy` stores the raw value and only the draw
   clamps it, so a pass at a wider viewport leaves an offset past the end,
   and Chromium coalesces a run of upward wheel events into one. The
   direction under test is down, and every notch of it is a real event. */
async function statLinesSeen(page, notches) {
  await page.evaluate(async () => {
    const { scrollSet } = await import('/src/shell/ui.js');
    scrollSet('main', 'stats', 0);
    __mf.draw();
  });
  const region = await statRegion(page);
  expect(region).not.toBeNull();
  const cx = region.x + (region.w >> 1), cy = region.y + 2;

  const seen = new Set(region.lines);
  for (let n = 1; n <= notches; n++) {
    await realWheel(page, cx, cy, 1);
    for (const l of (await statRegion(page)).lines) seen.add(l);
  }
  return { region, seen: [...seen] };
}

test('17e: all four stat rows are reachable in the Character tab, at the desktop buffer and at the 200 px floor', async ({ page }) => {
  await boot(page);
  await settle(page);
  /* Beat 4 is the one index `data/callouts.js` leaves null. The callout, a
     toast and the title card all draw OVER the main panel by design
     (`view/hud.js#drawHUD` puts a toast above the window so a refusal fired
     from inside the panel is not hidden by it), and all three would sit on
     the rows this scene exists to show. */
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    while (run.tutorialBeat < 4) rw.advanceBeat();
  });
  await pastArrival(page);
  await page.keyboard.press('e');
  await page.evaluate(() => __mf.frames(1));
  await quietHud(page);

  const desk = await statLinesSeen(page, 6);
  for (const label of STAT_LABELS)
    expect(desk.seen.some(l => l.startsWith(label + ' '))).toBe(true);
  expect(desk.seen).toContain('STATS');
  await quietHud(page);
  await shot(page, 'ui-character-stats-scrolled.png');

  await narrowFloor(page);
  await page.evaluate(() => __mf.frames(1));
  const floor = await statLinesSeen(page, 6);
  for (const label of STAT_LABELS)
    expect(floor.seen.some(l => l.startsWith(label + ' '))).toBe(true);
});

/* ---- 6. the bottom callout clears the quickbar (17i, FINDINGS) ----
   `view/hud.js#hint` centred the callout at `H - 16` without reserving the
   strip's rectangle, so at the 200 px floor 'TAKE THE PICKAXE' ran under
   cells 1-5. Beat 4 is the one index `data/callouts.js` leaves null, so the
   same scene at beat 0 and at beat 4 differs ONLY by the callout -- and if
   the callout clears the strip, the pixels inside the strip's own recorded
   rectangle are identical in both. */
test('17e: the bottom callout does not paint over the quickbar at the 200 px floor', async ({ page }) => {
  await boot(page);
  await settle(page);
  await putInQuickbar(page, 0, 'copper', 'ore', 3);
  await narrowFloor(page);

  const strip = await page.evaluate(() => {
    const g = __mf.ui.grids.find(gr => gr.id === 'quickbar');
    return { x: g.x, y: g.y, w: g.w, h: g.h };
  });
  const callout = await page.evaluate(async () => {
    const { CALLOUTS } = await import('/src/data/callouts.js');
    const { beat } = await import('/src/model/tutorial.js');
    const { run } = await import('/src/model/run.js');
    return CALLOUTS[beat(run)];
  });
  expect(callout).toBeTruthy();
  const withCallout = await canvasHash(page, strip);

  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    while (run.tutorialBeat < 4) rw.advanceBeat();
    __mf.draw();
  });
  const silent = await page.evaluate(async () => {
    const { CALLOUTS } = await import('/src/data/callouts.js');
    const { beat } = await import('/src/model/tutorial.js');
    const { run } = await import('/src/model/run.js');
    return CALLOUTS[beat(run)] ?? null;
  });
  expect(silent).toBeNull();
  const withoutCallout = await canvasHash(page, strip);

  expect(withCallout).toBe(withoutCallout);
});

/* ---- 7. `view/fx.js#reset()` rewinds the chip stream ----
   `spark` is a module-scope generator seeded from a constant, and `reset()`
   used to clear the chips without rewinding it, so a chip's scatter depended
   on how many chips the page had ever emitted. Playwright gives every test a
   fresh page, so this could not move a baseline -- it is a latent hole, and
   this is the assertion that keeps it closed. */
test('17e: view/fx.js#reset rewinds the chip stream, so two runs scatter alike', async ({ page }) => {
  await boot(page);
  const [first, second] = await page.evaluate(async () => {
    const fx = await import('/src/view/fx.js');
    const take = () => {
      fx.reset();
      fx.burst(0, 0, 6, '#ffffff');
      return fx.chips.map(c => [c.vx, c.vy, c.life]);
    };
    const a = take();
    fx.burst(0, 0, 40, '#ffffff');        // advance the stream between runs
    const b = take();
    fx.reset();
    return [a, b];
  });
  expect(second).toEqual(first);
});

/* ============================================================
   PHASE 11 TIER 3 -- THE VISUAL SNAPSHOT MATRIX, docs/BUILD_PLAN.md's own
   list. Added incrementally against the sixteen baselines already above:
   a soil/stone contact zone, an ore blob against pale rock, a tree crossing
   a chunk seam, a natural hollow (unlit, with a glowing relic, and lit), the
   surface's own hills and a cliff face, the overview at three scroll
   positions and with a broken lift chain, and the Cloud Dock.

   THE OPENING FRAME WITH THE GLOWING PICKAXE CALLOUT IS NOT HERE, on
   purpose: `surface.png` (top of this file) already IS that frame.
   `settle()` leaves `run.tutorialBeat` at 0 -- beat 1's own condition in
   `rules/tutorial.js` is a walk step actually taken (`player.walkPhase > 0`),
   which two idle substeps never produce -- so `view/hud.js#hint` is still
   drawing `data/callouts.js#CALLOUTS[0]` ('TAKE THE PICKAXE'), and
   `data/substances.js#pick` already carries `treatments:[{fn:'halo',...}]`,
   planted a few tiles from spawn by `shell/boot.js` and well inside
   `surface.png`'s own framing. A second baseline of the identical state
   would be churn, not coverage.

   EVERY SCENE BELOW SETS `run.tutorialBeat` EXPLICITLY (`docs/FINDINGS.md`
   #10): the `while (run.tutorialBeat < 4) rw.advanceBeat()` idiom
   `driveScene` already uses, so no stray callout can leak into a terrain or
   machinery shot that has nothing to do with the beat sheet. */

/* THE SOIL/STONE CONTACT ZONE, AT FULL FRAME. `data/world.js`'s surface band
   declares it at row 27, 4 tiles thick, and `rules/generate.js#contact` runs
   it across the WHOLE band width outside the spawn shelf -- no seed-hunting
   needed, only a column clear of the shelf's own blend (`SHELF` 9 +
   `BLEND` 3 either side of `spawnTx` 42). tx 80 is comfortably clear of it.
   FULL FRAME rather than a tight crop, because the fingering is a property
   of many columns at once -- a narrow crop could land on a column that
   happened to roll all-stone or all-soil and prove nothing about the seam. */
/* THE CONTACT ZONE IS SOLID ROCK, AND SOLID ROCK IS DARK UNTIL LIT
   (`view/scene.js#drawDarkness`: a `seen` tile with no light still paints at
   94% black, per `docs/DEVELOPER_GUIDE.md#pass-order-and-darkness` -- fog
   and light are two separate facts, and `revealAll` only ever bypasses the
   first). A bare `revealAll` here would screenshot a black rectangle, which
   is `topsoil.png` above's own accepted look and proves nothing about the
   seam. So a narrow shaft (3 tiles) is dug straight down from the open sky
   at tx 79-81, leaving the natural material UNTOUCHED on both sides at
   tx <= 78 and tx >= 82 -- exactly the fingering worldgen actually produced
   -- and every tile in that open shaft is itself sky-exposed
   (`model/tiles.js#skyExposedAt`), so `rules/light.js` lights the shaft at
   `lightMax` all the way down and bleeds `eff('lightFalloffRock')` (3/tile)
   into the walls either side: five tiles of real contact fingering, lit,
   exactly as a player who dug this same shaft would see it. */
test('a soil/stone contact zone at full frame', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { banner } = await import('/src/view/fx.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    const band = bandOf('surface');
    for (let ty = 0; ty <= 35; ty++)
      for (let tx = 79; tx <= 81; tx++) tw.clear(band, tx, ty);

    __mf.revealAll(band);
    banner.fade = 0;
    __mf.frames(2);          // let `rules/light.js` recompute against the new tiles
    __mf.cam.x = Math.round(worldX(band, 80) - VIEW.w / 2);
    __mf.cam.y = Math.round(worldY(band, 27) - VIEW.h / 2);
    __mf.draw();
  });
  await shot(page, 'contact-zone.png');
});

/* AN ORE BLOB AGAINST PALE STONE. `data/substances.js#stone`'s own tile look
   (`base:'irC'`, `#4a4a54`) is a mid-dark grey; `granite`'s
   (`base:'graniteB'`, `#b3b0ba`, `hi:'graniteA'` `#d8d6dc`) is the one rock
   substance that actually reads as PALE -- lavender-grey against copper's
   warm orange (`cuA`/`cuB`). `data/world.js`'s topsoil band overlaps a
   copper `blobs` row (rows 4-180) with a granite one (rows 120-320), so the
   two are found together rather than placed by hand: at seed 1337 a real
   copper cluster (tx 96-108) sits immediately beside a real granite patch
   (tx 109-111), ty 120-130 -- found by scanning the generated tile grid, not
   asserted against a specific arm, worldgen's own cruciform scatter being
   the point rather than a hand-drawn shape.

   SAME DARKNESS FACT AS THE CONTACT ZONE ABOVE: 128 tiles down, `revealAll`
   alone screenshots black -- sky light does not reach anywhere near this
   deep (`eff('lightMax')` 15 / `eff('lightFalloffAir')` 1 per tile of open
   air), so a real brazier is placed instead of a shaft, the same move
   `shaft-lit.png` above already makes. The room it lights is carved
   directly on the copper/granite BOUNDARY (tx 103-109) with the brazier
   centred in it (tx 106), so both walls -- copper to the west, granite one
   tile past the east wall -- land in `view/scene.js#drawDarkness`'s middle
   bucket (`lightAt` ~5, `DARK_ALPHA[1]` 0.55) rather than one side blazing
   and the other unreadable. Framed at the narrow floor's tighter 200x180
   (`core/canvas.js#resize`) so the boundary fills the frame instead of
   getting lost in 640x400 of mostly unlit rock. */
test('an ore blob against pale stone', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: mw } = await import('/src/model/machines.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { banner } = await import('/src/view/fx.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    const band = bandOf('topsoil');
    for (let ty = 121; ty <= 125; ty++)
      for (let tx = 103; tx <= 109; tx++) tw.clear(band, tx, ty);
    tw.set(band, 106, 125, S.stone);      // a floor for the brazier

    const brazier = mw.place(band, M.brazier, 106, 124);
    mw.take(brazier, S.timber, F.log, 4);

    __mf.revealAll(band);
    banner.fade = 0;
    __mf.frames(700);         // > 6s honest-fuel recipe, then settle

    __mf.resize(200, 180);
    __mf.cam.x = Math.round(worldX(band, 106) - VIEW.w / 2);
    __mf.cam.y = Math.round(worldY(band, 123) - VIEW.h / 2);
    __mf.draw();
  });
  await shot(page, 'ore-against-pale-stone.png');
});

/* A TREE CROSSING A CHUNK SEAM. `view/treatments.js#canopy` reaches up to
   `EXTENT.canopy` (4 tiles) either side of its trunk, and `view/paint.js`'s
   `DECO_MARGIN` is sized off that exact table so a crown straddling a chunk
   boundary bakes correctly into BOTH chunk canvases. Hand-planted at tx 64
   -- a multiple of the surface band's own `chunk:16` -- rather than hunted
   for in worldgen, the same call `carveShaft` above already makes: a tree
   landing exactly on a chunk boundary at seed 1337 is not a bet worth
   making, and the point here is the SEAM, not the tree's own placement.
   `flags.showChunks` is the SAME debug overlay `overlays.png` already
   baselines, on here so the seam itself is visible in the same shot as the
   canopy that crosses it. */
test('a tree crossing a chunk seam', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { banner } = await import('/src/view/fx.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();

    const band = bandOf('surface');
    const seamTx = 64, floorTy = 20;
    for (let ty = 0; ty < floorTy; ty++)
      for (let tx = seamTx - 8; tx <= seamTx + 8; tx++) tw.clear(band, tx, ty);
    for (let tx = seamTx - 8; tx <= seamTx + 8; tx++) tw.set(band, tx, floorTy, S.stone);
    for (let k = 1; k <= 5; k++) tw.set(band, seamTx, floorTy - k, S.timber);

    __mf.revealAll(band);
    banner.fade = 0;
    __mf.flags.showChunks = true;
    __mf.cam.x = Math.round(worldX(band, seamTx) - VIEW.w / 2);
    __mf.cam.y = Math.round(worldY(band, floorTy - 8) - VIEW.h / 2);
    __mf.draw();
  });
  await shot(page, 'tree-chunk-seam.png');
});

/* ============================================================
   THE CHUNK CACHE'S CEILING (Phase 6f, docs/PLAN-horizontal-chunks-SCOPE.md
   3.7, docs/SPEC.md section 1)

   `view/paint.js` holds one baked canvas per chunk and, until this phase,
   dropped one only on `newRun()`. At 128 tiles the whole world is 264 chunks
   -- 17 MB, under the 24 MB budget -- so THE CEILING CANNOT BE REACHED BY
   PLAYING, and a test that swept the camera and watched the cache stay small
   would be watching a cache that was never asked to grow. So the budget is
   lowered here on purpose: `cacheLimit.bytes` is exported for exactly this,
   and the control leg proves the forced leg is not measuring nothing.
   ============================================================ */

/* THE SWEEP. Camera steps of one viewport across a band and down it, drawing
   each time -- the cheapest way to make `view/scene.js#drawChunks` ask for
   every chunk in the world, which is what fills the cache. `__mf.draw()` runs
   no simulation, so the terrain is identical at every step and the model is
   untouched between the two legs. */
const sweepWorld = page => page.evaluate(async () => {
  const { bands } = await import('/src/model/world.js');
  const { VIEW } = await import('/src/core/canvas.js');
  for (const b of bands)
    for (let y = b.origin.y; y < b.origin.y + b.th * b.tile; y += VIEW.h)
      for (let x = b.origin.x; x < b.origin.x + b.tw * b.tile; x += VIEW.w) {
        __mf.cam.x = x; __mf.cam.y = y; __mf.draw();
      }
});

test('the chunk cache is bounded by its byte budget, and eviction is what bounds it', async ({ page }) => {
  await boot(page);
  await settle(page);

  const reset = (page, bytes) => page.evaluate(async bytes => {
    const { cacheLimit, resetChunks } = await import('/src/view/paint.js');
    resetChunks();
    cacheLimit.bytes = bytes;
  }, bytes);

  const read = page => page.evaluate(async () => {
    const { cacheLimit, stats } = await import('/src/view/paint.js');
    /* One more draw at the camera the sweep finished on, so the reading is
       taken AFTER an eviction pass rather than after a frame of cold bakes:
       `beginFrame` evicts and then publishes `stats.bytes`. */
    __mf.draw();
    return { cached: stats.cached, bytes: stats.bytes,
             evictedTotal: stats.evictedTotal, cap: cacheLimit.bytes };
  });

  const CHUNK_BYTES = 128 * 128 * 4;             // one 16x16-tile chunk at tile:8

  await reset(page, 24 * 1024 * 1024);           // the shipped budget
  await sweepWorld(page);
  const control = await read(page);

  await reset(page, 32 * CHUNK_BYTES);           // forced well under one world
  await sweepWorld(page);
  const forced = await read(page);

  /* THE CONTROL LEG IS THE "NOT VACUOUS" HALF: at today's width the whole
     world fits the shipped budget, so nothing is evicted and the cache holds
     every chunk the sweep asked for. That is the leak this phase bounds. */
  expect(control.evictedTotal).toBe(0);
  expect(control.cached).toBeGreaterThan(200);
  expect(control.bytes).toBe(control.cached * CHUNK_BYTES);

  /* AND THE FORCED LEG: the same sweep under a 2 MB budget evicts, and what is
     left is the budget plus what the last two frames drew -- which eviction
     may never take (`view/paint.js#evict`). 64 chunks of allowance is twice
     the 24 a 640x400 viewport covers, for the two frames of grace. */
  expect(forced.evictedTotal).toBeGreaterThanOrEqual(control.cached - 32 - 64);
  expect(forced.cached).toBeLessThanOrEqual(32 + 64);
  expect(forced.cached).toBeLessThan(control.cached / 2);
  expect(forced.bytes).toBeLessThanOrEqual(forced.cap + 64 * CHUNK_BYTES);
});

/* AND THE PROPERTY THAT MAKES EVICTION SAFE: a chunk thrown away and baked
   again is the same pixels. It has to be -- `paintChunk` is a pure function of
   the tile grid, the substance rows and `hash2` of absolute tile coordinates,
   with no `rand()` anywhere (invariant 7) -- but "has to be" is what the render
   purity probes in `tools/check.mjs` say about a frame, and nothing said it
   about a bake that had been dropped and rebuilt from scratch.

   THE CANVAS ITSELF IS HASHED, not the frame it is blitted into: `chunkCanvas`
   returns the offscreen canvas, so this reads the 128x128 backing store
   directly and compares two bakes of the same chunk with nothing but an
   eviction between them. `stats.painted` moving on the second call is what
   proves the chunk really was evicted -- without that this test would compare
   one canvas with itself and pass. */
test('a chunk evicted and re-baked is byte-identical to one never evicted', async ({ page }) => {
  await boot(page);
  await settle(page);

  const info = await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    const { bands } = await import('/src/model/world.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { cacheLimit, chunkCanvas, resetChunks, stats } = await import('/src/view/paint.js');

    const hashOf = canvas => {
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); }
      return h >>> 0;
    };

    const band = bandOf('topsoil');
    const cx = 2, cy = 3;                        // an arbitrary interior chunk

    resetChunks();
    cacheLimit.bytes = 32 * 128 * 128 * 4;
    const p0 = stats.painted;
    const first = hashOf(chunkCanvas(band, cx, cy));
    const bakedFirst = stats.painted - p0;

    /* Walk the camera away and keep drawing until the eviction pass has taken
       this chunk. Every other band is swept too, so the probed chunk is the
       least recently drawn thing in the cache long before the sweep ends. */
    for (const b of bands)
      for (let y = b.origin.y; y < b.origin.y + b.th * b.tile; y += VIEW.h)
        for (let x = b.origin.x; x < b.origin.x + b.tw * b.tile; x += VIEW.w) {
          __mf.cam.x = x; __mf.cam.y = y; __mf.draw();
        }

    const p1 = stats.painted;
    const again = hashOf(chunkCanvas(band, cx, cy));
    return { first, again, bakedFirst, bakedAgain: stats.painted - p1,
             evictedTotal: stats.evictedTotal };
  });

  expect(info.bakedFirst).toBe(1);               // the cold bake
  expect(info.evictedTotal).toBeGreaterThan(0);
  expect(info.bakedAgain).toBe(1);               // it really had been evicted
  expect(info.again).toBe(info.first);           // and it came back identical
});

/* A DIG STILL REPAINTS ITS CHUNK, NOT THE WORLD (invariant 3), WITH THE CACHE
   FULL AND EVICTING. The script fills the cache past a 2 MB budget by sweeping
   the world first, so evictions are already running when the pick starts, and
   THEN digs. Every chunk under the pick is on screen, so `view/paint.js#evict`
   may not take one -- which is the claim, and it is measurable two ways at
   once: the same dig under the forced budget and under the shipped one must
   repaint the same chunks AND leave a bit-identical frame. A policy that
   evicted by distance from a remembered camera, or that forgot to protect what
   the last frame drew, would fail the first; one that dropped the wrong chunk
   would fail the second.

   `repainted` counts only VERSION-driven re-bakes, never the cold bake of a
   chunk that had been evicted (`chunkCanvas`'s own `e.ver !== -1` guard), which
   is what makes the two legs comparable at all: the forced leg cold-bakes more
   and must still invalidate exactly the same. */
test('a dig under a full, evicting cache repaints the same chunks and draws the same pixels', async ({ page }) => {
  await boot(page);

  const dig = (page, bytes) => page.evaluate(async bytes => {
    const { bands } = await import('/src/model/world.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { cacheLimit, resetChunks, stats } = await import('/src/view/paint.js');
    const { banner } = await import('/src/view/fx.js');
    const { write: rw, run } = await import('/src/model/run.js');

    /* HELD KEYS DO NOT SURVIVE INTO THE SECOND LEG. `hold()` leaves whatever
       it held set on `cmd` and `newRun()` does not clear it, so without this
       the second leg digs its way through the two settling frames and the two
       legs stop being the same script. */
    for (const k of ['dig', 'down', 'right', 'collect']) __mf.cmd[k] = false;

    __mf.newRun(1337); __mf.clock.t = 10; __mf.frames(2);
    while (run.tutorialBeat < 4) rw.advanceBeat();
    resetChunks();
    cacheLimit.bytes = bytes;
    banner.fade = 0;

    /* THE PICKAXE FIRST, or `hasPick()` is false and the dig is a no-op --
       the same walk-and-collect `digging.png` opens with, for the same
       reason. `right` is a held key and has to be released, or the player
       drifts and no single tile ever accumulates enough work to break. */
    __mf.hold({ right: 1, collect: 1 }, 90);
    __mf.cmd.right = false;

    const camX = __mf.cam.x, camY = __mf.cam.y;
    for (const b of bands)
      for (let y = b.origin.y; y < b.origin.y + b.th * b.tile; y += VIEW.h)
        for (let x = b.origin.x; x < b.origin.x + b.tw * b.tile; x += VIEW.w) {
          __mf.cam.x = x; __mf.cam.y = y; __mf.draw();
        }
    __mf.cam.x = camX; __mf.cam.y = camY;
    __mf.draw(); __mf.draw();                    // back on the pick, settled
    const swept = stats.evictedTotal;

    const before = { repainted: stats.repainted, skipped: stats.skipped };
    /* TEN SEPARATE CALLS RATHER THAN ONE 600-SUBSTEP CALL, because `hold()`
       draws once at the end and eviction runs once per FRAME: a single call
       would give the pass one turn and prove nothing about a cache under
       sustained pressure. */
    for (let i = 0; i < 10; i++) __mf.hold({ dig: 1, down: 1, collect: 1 }, 60);

    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); }
    return { swept,
             repainted: stats.repainted - before.repainted,
             skipped: stats.skipped - before.skipped,
             evictedTotal: stats.evictedTotal, hash: h >>> 0 };
  }, bytes);

  const capped = await dig(page, 32 * 128 * 128 * 4);
  const uncapped = await dig(page, 24 * 1024 * 1024);

  expect(capped.swept).toBeGreaterThan(0);       // the forced budget really evicted
  expect(uncapped.swept).toBe(0);                // and the shipped one never does
  expect(capped.repainted).toBeGreaterThan(0);   // the dig really did invalidate
  expect(capped.repainted).toBe(uncapped.repainted);
  expect(capped.skipped).toBe(uncapped.skipped);
  expect(capped.hash).toBe(uncapped.hash);
});

/* ---------- a natural hollow (worldgen's own generator), three ways ----------
   Found by flood-filling seed 1337's topsoil tile grid for a sealed air
   pocket clear of the spawn column -- `docs/BUILD_PLAN.md` Phase 11's own
   preference for a GENERATED room over a hand-carved shaft, where one is
   reachable at a fixed seed. tx 17-21, ty 102-104 (31 open cells, walled on
   every side, never reaching row 0 -- confirmed by the same flood fill).

   THREE BASELINES, ON THE SAME PAIR-PROOF RULE `shaft-unlit.png`/
   `shaft-lit.png` above already uses: `hollow-unlit.png` is dark with
   nothing in it, and it is the pixel-diff partner for BOTH of the other
   two. Against `hollow-relic-unlit.png` the only difference legal to exist
   is the glow (proving `data/substances.js#bellows`'s halo is a `view`
   treatment and never touches `rules/light.js`'s field -- GLOW IS NOT
   LIGHT). Against `hollow-lit.png` the only difference legal to exist is
   the light itself, from a real brazier. */
async function hollowScene(page) {
  await page.evaluate(async () => {
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { write: pw } = await import('/src/model/player.js');
    const { banner } = await import('/src/view/fx.js');
    const { VIEW } = await import('/src/core/canvas.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    const band = bandOf('topsoil');
    pw.band(band);
    pw.move(worldX(band, 19), worldY(band, 103));   // inside the hollow's own open core
    ww.revealAll(band);
    banner.fade = 0;
    __mf.cmd.hasMouse = false;
    __mf.cam.x = Math.round(worldX(band, 19) + 4 - VIEW.w / 2);
    __mf.cam.y = Math.round(worldY(band, 103) + 4 - VIEW.h / 2);
  });
}

test('a natural hollow, unlit', async ({ page }) => {
  await boot(page);
  await settle(page);
  await hollowScene(page);
  await page.evaluate(() => __mf.draw());
  await shot(page, 'hollow-unlit.png');
});

test('a glowing relic lying in the unlit hollow', async ({ page }) => {
  await boot(page);
  await settle(page);
  await hollowScene(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: iw } = await import('/src/model/items.js');

    const band = bandOf('topsoil');
    const it = iw.spawn(band, worldX(band, 19) + 4, worldY(band, 103) + 4, S.bellows, F.relic, 0, 0);
    if (it) it.rest = 1;
    __mf.draw();
  });
  await shot(page, 'hollow-relic-unlit.png');
});

/* THE PAIR ABOVE IS NOT A NO-OP, proved the same way `winch: the cable
   ghost is not a no-op` proves its own pair: `DARK_ALPHA[0]` is 0.94
   (`view/scene.js#drawDarkness`), so a halo sitting on tiles at light level
   0 is crushed to a few percent of its true colour -- real, per CLAUDE.md's
   own rule that a feature-visible test must show the pixels differ, but far
   too subtle for a human glancing at the two PNGs above to be expected to
   catch by eye. A canvas hash over both scenes is the honest version of
   that same claim. */
test('the glowing relic in the unlit hollow is not a no-op', async ({ page }) => {
  await boot(page);
  await settle(page);
  const hashOf = () => page.evaluate(() => {
    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) {
      h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  });

  await hollowScene(page);
  await page.evaluate(() => __mf.draw());
  const bare = await hashOf();

  await hollowScene(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: iw } = await import('/src/model/items.js');
    const band = bandOf('topsoil');
    const it = iw.spawn(band, worldX(band, 19) + 4, worldY(band, 103) + 4, S.bellows, F.relic, 0, 0);
    if (it) it.rest = 1;
    __mf.draw();
  });
  const withRelic = await hashOf();

  expect(withRelic).not.toBe(bare);
});

test('the same natural hollow lit by a brazier', async ({ page }) => {
  await boot(page);
  await settle(page);
  await hollowScene(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { bandOf } = await import('/src/model/world.js');
    const { write: mw } = await import('/src/model/machines.js');

    const brazier = mw.place(bandOf('topsoil'), M.brazier, 19, 104);
    mw.take(brazier, S.timber, F.log, 4);
    __mf.frames(700);          // > 6s honest-fuel recipe, then settle -- same margin `shaft-lit.png` uses
  });
  await shot(page, 'hollow-lit.png');
});

/* SURFACE HILLS. `surface.png` is deliberately the flat spawn shelf
   (`rules/generate.js#SHELF`, pinned to 0 offset for `docs/SPEC.md`
   section 5's own beat sheet); this is everywhere else. Framed from the
   surface band's own left edge so the shelf itself sits in the same
   picture as the relief either side of it -- the comparison IS the point,
   not a close crop of one hill. */
test('surface hills', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { banner } = await import('/src/view/fx.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    const band = bandOf('surface');
    __mf.revealAll(band);
    banner.fade = 0;
    __mf.cam.x = band.origin.x;
    __mf.cam.y = band.origin.y;
    __mf.draw();
  });
  await shot(page, 'surface-hills.png');
});

/* THE PICTURE ABOVE IS NOT A NO-OP EITHER, and this is the half of it a
   human cannot check by eye. `view/treatments.js#grassCap`'s bank chamfers
   the outer corner of every one-tile step, which is most of what stops the
   frame above reading as terraces -- but it paints turf over turf, so
   "with it" and "without it" are two plausible hillsides rather than one
   obviously broken one. A canvas hash over the same scene twice is the
   honest version of the claim, the same way the unlit relic proves its own.

   `bevel: 0` is how a content row opts out. Poking it here reaches into a
   `data/` row, which `Object.freeze` guards only at the top level -- test
   only, and the page is torn down after. `resetChunks()` is what makes the
   second draw a real repaint, because the chunk canvases are keyed on a model
   version counter that a look change does not move. */
test('the turf bank is not a no-op', async ({ page }) => {
  await boot(page);
  const hashOf = () => page.evaluate(() => {
    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) {
      h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  });

  const frame = (page, off) => page.evaluate(async off => {
    const { bandOf } = await import('/src/model/world.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { banner } = await import('/src/view/fx.js');
    const { S, SUB } = await import('/src/data/substances.js');
    const { resetChunks } = await import('/src/view/paint.js');

    __mf.newRun(1337); __mf.clock.t = 10; __mf.frames(2);
    while (run.tutorialBeat < 4) rw.advanceBeat();
    if (off) SUB[S.soil].look.grassCap.bevel = 0;
    resetChunks();
    const band = bandOf('surface');
    __mf.revealAll(band);
    banner.fade = 0;
    __mf.cam.x = band.origin.x;
    __mf.cam.y = band.origin.y;
    __mf.draw();
  }, off);

  await frame(page, false);
  const banked = await hashOf();
  await frame(page, true);
  const flat = await hashOf();

  expect(banked).not.toBe(flat);
});

/* A CLIFF FACE. `rules/generate.js#stepPass` permits a 2-tile step
   (`STEP_BIG`) outside `SAFE_R` of spawn, no closer together than
   `STEP_GAP` columns -- the steepest face the generator will ever produce,
   and the one face `view/treatments.js#grassCap`'s bank deliberately does
   NOT chamfer, so the picture holds a real cliff and banked one-tile steps
   side by side.

   SEED 58, tx 70 -> 71, rows 10 -> 12, and the step assertion below is what
   keeps that sentence true. It was seed 1337 / tx 109 until wave 6. The
   landform pipeline left that seed with no step over one tile anywhere in
   the surface band, so the test went on photographing a region with no cliff
   in it and only the comment noticed. 21 of the first 400 seeds carry a big
   step outside the spawn shelf and its `SAFE_R`; 58 puts its own at tx 70,
   which centres in frame at every viewport this suite uses. */
const CLIFF_SEED = 58, CLIFF_TX = 70;

test('a cliff face', async ({ page }) => {
  await boot(page);
  await settle(page, CLIFF_SEED);
  /* THE CLIFF IS ASSERTED, NOT ASSUMED. A screenshot cannot tell a 2-tile
     face from a 1-tile one, so the geometry is read off the live band the
     same way `tools/worldgen-check.mjs#groundRow` reads it -- topmost solid
     row per column, skipping timber so a trunk is never mistaken for
     ground. */
  const steps = await page.evaluate(async tx0 => {
    const { bandOf } = await import('/src/model/world.js');
    const { solidAt, subAt } = await import('/src/model/tiles.js');
    const { S } = await import('/src/data/substances.js');
    const band = bandOf('surface');
    const ground = c => {
      for (let ty = 0; ty < band.th; ty++)
        if (solidAt(band, c, ty) && subAt(band, c, ty) !== S.timber) return ty;
      return band.th;
    };
    let big = 0;
    for (let c = 0; c < band.tw - 1; c++) if (Math.abs(ground(c + 1) - ground(c)) > 1) big++;
    return { at: ground(tx0 + 1) - ground(tx0), big, row: ground(tx0) };
  }, CLIFF_TX);
  expect(steps.at).toBe(2);        // descending away from spawn, so positive
  expect(steps.big).toBe(1);       // and it is the only one in the band

  await page.evaluate(async ({ tx0, row }) => {
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { banner } = await import('/src/view/fx.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    const band = bandOf('surface');
    __mf.revealAll(band);
    banner.fade = 0;
    __mf.cam.x = Math.round(worldX(band, tx0) - VIEW.w / 2);
    __mf.cam.y = Math.round(worldY(band, row + 2) - VIEW.h / 2);
    __mf.draw();
  }, { tx0: CLIFF_TX, row: steps.row });
  await shot(page, 'cliff-face.png');
});

/* THE MAP OVERVIEW AT THREE SCROLL POSITIONS. `map.png` above never
   scrolls -- `flags.showMap` with `follow` left at its default `true`,
   centred wherever `settle()` happens to leave the player. `mapMoveTo`
   (`shell/ui.js`) is the identical model-level scroll the fog test above
   already drives the overview through; three calls to it, far enough
   apart in world-Y, make the SAME map read as three different pictures:
   the Heavens at the very top, a mid-topsoil stretch thick with hollows
   and ore, and the world's own deepest rows. All three bands are fully
   revealed for the same reason `map.png` is -- the point is the overview's
   layout at different offsets, not fog. */
test('the map overview at three scroll positions', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { bands, write } = await import('/src/model/world.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { mapMoveTo } = await import('/src/shell/ui.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    for (const b of bands) write.revealAll(b);
    __mf.flags.showMap = true;
    mapMoveTo(0, 0);
    __mf.draw();
  });
  await shot(page, 'map-scroll-heavens.png');

  await page.evaluate(async () => {
    const { mapMoveTo } = await import('/src/shell/ui.js');
    mapMoveTo(0, 1400);
    __mf.draw();
  });
  await shot(page, 'map-scroll-topsoil.png');

  await page.evaluate(async () => {
    const { mapMoveTo } = await import('/src/shell/ui.js');
    mapMoveTo(0, 4000);         // past the world's own bottom edge -- `fit()`
                                 // in `view/overview.js` clamps it there
    __mf.draw();
  });
  await shot(page, 'map-scroll-deep.png');
});

/* OVERVIEW WITH A BROKEN LIFT CHAIN. Reuses the exact hub layout `winch:
   the same chain with the middle segment missing` above already baselines
   at scene scale -- CHAIN's four hubs, linked [0,1] and [2,3] with the
   middle segment deliberately absent -- and opens the map on it instead of
   the scene camera. `view/overview.js#drawChain`'s own header names this
   exact construction as the LOGISTICS layer's acceptance case: an open end
   draws as a red ring, a joined hub as a small solid box, a driven cable is
   solid and bright and an idle one dashes -- so a broken chain has to be
   visually distinguishable from a working one without reading a single
   number. */
test('overview with a broken lift chain', async ({ page }) => {
  await boot(page);
  await settle(page);
  await winchScene(page, {
    ...CHAIN, links: [[0, 1], [2, 3]],
    carriers: [[0, 0.35, 20], [1, 0.15, 8]]
  });
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    while (run.tutorialBeat < 4) rw.advanceBeat();
    __mf.flags.showMap = true;
    __mf.draw();
  });
  await shot(page, 'map-broken-chain.png');
});

/* ============================================================
   THE HORIZONTAL EXTENT RIBBON (Phase 6f, docs/SPEC.md section 31)

   The overview fits the world's DEPTH and WINDOWS its width, so at any zoom
   where the width does not fit, the body shows a slice and the ribbon says
   which slice. At 128 tiles the default zoom still fits the whole width, which
   is exactly why the ribbon is not in `map.png`: ZOOM 8 IS THE CASE THAT
   EXISTS TODAY, where the world is 8,192 px wide against a 609 px body, and it
   is the same case 1,024 tiles makes the DEFAULT.

   THREE CLAIMS, AND THE FIRST IS WHAT KEEPS THE OTHER TWO HONEST: the widget
   is ABSENT when the width fits. A ribbon drawn always, with its thumb always
   spanning its whole track, is a widget that has never once been wrong and
   would photograph identically either way.
   ============================================================ */
test('the overview extent ribbon appears only when the width does not fit, and tracks the scroll', async ({ page }) => {
  await boot(page);
  await settle(page);

  const at = (page, zoom, x) => page.evaluate(async ({ zoom, x }) => {
    const { bands, write } = await import('/src/model/world.js');
    const { mapMoveTo, setMapZoom } = await import('/src/shell/ui.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { mapView } = await import('/src/view/overview.js');
    const { mix } = await import('/src/core/palette.js');
    const { colour } = await import('/src/data/palette.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    for (const b of bands) write.revealAll(b);
    __mf.flags.showMap = true;
    setMapZoom(zoom);
    mapMoveTo(x, 900);
    __mf.draw();

    const panels = __mf.ui.panels;
    const pick = id => {
      const p = panels.find(p => p.id === id);
      return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null;
    };
    const g2d = document.getElementById('stage').getContext('2d');
    const rgb = (px, py) => [...g2d.getImageData(px, py, 1, 1).data].slice(0, 3);
    const track = pick('map-extent'), win = pick('map-extent-window');

    return {
      track, win,
      /* The world span the body can show, over the world's own width: the
         fraction the thumb is supposed to be. Read off `mapView` rather than
         re-derived, the same reason the fog test reads the transform back. */
      fraction: (mapView.vw / mapView.scale) / mapView.worldW,
      /* One pixel inside the thumb and one in the track beyond its far end. */
      inWindow: win ? rgb(win.x + 1, win.y) : null,
      inTrack: win && track && win.x + win.w + 2 < track.x + track.w
        ? rgb(win.x + win.w + 2, win.y) : null,
      ui: colour('ui'),
      trackTone: mix(colour('uiBack'), colour('uiDim'), 0.5)
    };
  }, { zoom, x });

  const hex = h => [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)].map(x => parseInt(x, 16));
  const rgbStr = s => s.match(/\d+/g).map(Number);

  /* THE DEFAULT ZOOM AT 128 TILES FITS THE WHOLE WIDTH, so there is nothing to
     say and nothing is drawn. */
  const fits = await at(page, 0, 0);
  expect(fits.track).toBe(null);
  expect(fits.win).toBe(null);
  expect(fits.fraction).toBeGreaterThanOrEqual(1);

  /* ZOOM 8 DOES NOT. The thumb is the window's share of the world's width, and
     it is painted rather than merely recorded. */
  const mid = await at(page, 8, 400);
  expect(mid.fraction).toBeLessThan(1);
  expect(mid.win.w / mid.track.w).toBeCloseTo(mid.fraction, 1);
  expect(mid.win.x).toBeGreaterThan(mid.track.x);
  expect(mid.inWindow).toEqual(hex(mid.ui));
  expect(mid.inTrack).toEqual(rgbStr(mid.trackTone));

  /* AND IT TRACKS THE SCROLL, to both ends. `fit()` clamps the offset to the
     world, so parking past an edge parks ON it. */
  const left = await at(page, 8, -9999);
  expect(left.win.x).toBe(left.track.x);
  const right = await at(page, 8, 9999);
  expect(right.win.x + right.win.w).toBe(right.track.x + right.track.w);
});

/* AND WHAT IT LOOKS LIKE. Zoom 8 over a fully revealed world, parked mid-width
   so the thumb sits mid-track: the one scroll position where the ribbon says
   something neither end would. */
test('the overview at a zoom the world does not fit', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { bands, write } = await import('/src/model/world.js');
    const { mapMoveTo, setMapZoom } = await import('/src/shell/ui.js');
    const { write: rw, run } = await import('/src/model/run.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    for (const b of bands) write.revealAll(b);
    __mf.flags.showMap = true;
    setMapZoom(8);
    mapMoveTo(400, 900);
    __mf.draw();
  });
  await shot(page, 'map-zoom8.png');
});

/* THE CLOUD DOCK, PLACED FOR REAL: `rules/placement.js#placeMachine`'s own
   click-to-arm path (keyboard, the same 'e' flow `a placed furnace` above
   uses), not a model-level `mw.place` write that would skip past the
   legality this scene exists to exercise -- astral's floor, D5's own
   receiver, `footing:2`. The bill (`data/recipes.js#cloud_dock`: 5
   copper/plate, 1 copper/ingot, 2 timber/log) is given directly rather than
   mined and pressed, the same call `a placed furnace` already makes for
   the furnace: this scene's own point is the dock's LOOK once placed, not
   the crafting grind. */
test('the Cloud Dock', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { write: pw, PH } = await import('/src/model/player.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();

    const astral = bandOf('astral');
    pw.band(astral);
    /* A FULL BODY HEIGHT clear of the floor, not just a bare pixel -- placed
       any closer, the body already overlaps the solid row before physics
       ever runs, and `moveY`'s collision resolves that embedded start by
       sinking a further tile rather than pushing back out (the same wedge
       CLAUDE.md's own "mistakes already made here" section warns about). */
    pw.move(worldX(astral, 60), worldY(astral, 29) - PH);
    __mf.revealAll(astral);
    __mf.cmd.hasMouse = false;
    __mf.frames(30);                        // let gravity settle them onto row 30

    rw.grant('cloud_dock');
    rw.collect(S.cloud_dock, F.rig, 1);
  });
  await moveHeldToQuickbar(page, 0, 'cloud_dock', 'rig');
  await page.keyboard.press('1');
  /* 'e' no longer places -- placement moved to LMB only
     (docs/PLAN-phase12.md §4.1); the LMB dispatch itself is Phase 12a's own
     tests' point, not this one's, so poke the same edge flag a real click
     ultimately sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(10));

  const placed = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const dock = __mf.machines.find(m => m.def === M.cloud_dock);
    return { ok: !!dock, band: dock?.band?.id };
  });
  expect(placed.ok).toBe(true);
  expect(placed.band).toBe('astral');

  await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { banner } = await import('/src/view/fx.js');
    const dock = __mf.machines.find(m => m.def === M.cloud_dock);
    banner.fade = 0;
    /* The dock's own footprint is 2x1 tiles (16x8 world px) -- tiny against
       the 640x400 desktop view, and its marble body reads close to white
       against astral's own bright sky, so a wide shot leaves it a pale
       sliver easy to miss. The narrow floor (`core/canvas.js#resize`'s own
       200x180 clamp) is used here for the opposite of its usual reason: not
       to prove narrow-viewport layout, but to make a small machine fill
       enough of the frame that its trim actually reads. This is why the
       clamp outlived the `*-phone.png` baselines wave 6 deleted -- it is a
       framing tool as much as a layout assertion. */
    __mf.resize(200, 180);
    __mf.cam.x = Math.round(dock.box.x + dock.box.w / 2 - VIEW.w / 2);
    __mf.cam.y = Math.round(dock.box.y + dock.box.h / 2 - VIEW.h / 2);
    __mf.draw();
  });
  await shot(page, 'cloud-dock.png');
});

/* ============================================================
   PHASE 14c: THE DEPLETION CUE
   (docs/PLAN-phase14-mining-and-drops.md D14-G)

   A `deposit` tile yields `tile.charge` units before it is
   gone, so a copper wall you have already half worked looks exactly like a
   fresh one and the only way to find out what is left in a tile is to swing
   at it. `view/scene.js#drawDepletion` is the answer, and it is a LIVE
   OVERLAY rather than a chunk bake for the reason `model/world.js`'s band
   record states twice, once for `seen` and once for `light`.

   THREE TESTS, AND THE THIRD IS THE ONE THAT MATTERS. Two are baselines --
   a fresh vein and the same vein part-spent, at the desktop viewport (their
   narrow-floor twins were `*-phone.png` and went in wave 6) -- and a
   screenshot pair only proves the two scenes are not identical to each
   OTHER. CLAUDE.md records two tests that
   baselined a scene with the overlay flag misspelled and passed anyway, so
   the third test renders one scene twice, with nothing changing between the
   two draws except accumulated pick time, and counts the pixels that moved
   and where.
   ============================================================ */

/* A hand-carved copper vein with OPEN SKY above it. The sky matters: a cue
   this phase exists to prove visible must not be baselined underneath
   `drawDarkness`, which paints 94% black over an unlit tile. `rules/light.js`
   seeds every tile from row 0 down to and INCLUDING the first solid one at
   `eff('lightMax')`, so clearing the pocket to row 0 leaves the vein row
   itself fully lit and the darkness pass with nothing to do to it.

   Hand-carved and not found, per CLAUDE.md's own "don't trust natural
   worldgen": the seed decides what lies UNDER the vein, never the vein. */
const VEIN = { tx0: 40, ty: 26, w: 6 };

async function veinScene(page) {
  await page.evaluate(async ({ tx0, ty, w }) => {
    const { S } = await import('/src/data/substances.js');
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { PH, write: pw } = await import('/src/model/player.js');
    const { banner } = await import('/src/view/fx.js');

    const band = bandOf('surface');
    for (let tx = tx0 - 3; tx < tx0 + w + 3; tx++)
      for (let y = 0; y < ty; y++) tw.clear(band, tx, y);
    for (let tx = tx0; tx < tx0 + w; tx++) tw.set(band, tx, ty, S.copper);
    tw.set(band, tx0 - 2, ty, S.stone);          // a floor left of the vein, clear of it

    pw.band(band);
    pw.move(worldX(band, tx0 - 2), worldY(band, ty) - PH);
    ww.revealAll(band);
    banner.fade = 0;   // past the opening title, same reasoning `settle()` gives
  }, VEIN);
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(2); });
}

/* Centre the vein in whatever viewport is current and render ONCE. Separate
   from `veinScene` and always called last, because a substep also runs
   `updateCamera`, which would pull the camera back onto the player. */
const frameVein = page => page.evaluate(async ({ tx0, ty, w }) => {
  const { bandOf, worldX, worldY } = await import('/src/model/world.js');
  const { VIEW } = await import('/src/core/canvas.js');
  const band = bandOf('surface');
  __mf.cam.x = Math.round(worldX(band, tx0 + w / 2) - VIEW.w / 2);
  __mf.cam.y = Math.round(worldY(band, ty) - VIEW.h / 2);
  __mf.draw();
}, VEIN);

/* Spend real units out of named tiles through `model/mining.js#write.add` --
   the same call `rules/mining.js` makes, driven through the model rather than
   through a click at a hardcoded pixel (CLAUDE.md: a hardcoded click
   coordinate breaks at another viewport, and these scenes are shot at two).
   `effHardAt` is `view/paint.js`'s own resolved hardness, so the test cannot
   disagree with the renderer about what a unit costs.

   NUDGED A TEN-THOUSANDTH OF A UNIT PAST EACH BOUNDARY rather than landing on
   it. `3 * 0.95` is 2.8499999999999996 as a double -- a hair BELOW three whole
   units -- so an exact-boundary setup would ask the renderer to read a value
   `rules/mining.js`'s own `Math.floor(work / hard)` floors to 2, and a cue
   that disagreed with the rule would be the bug. Real play never lands on a
   boundary either: work arrives in `dt * pickPower` increments. */
async function spendUnits(page, spec) {
  await page.evaluate(async ({ ty, spec }) => {
    const { bandOf } = await import('/src/model/world.js');
    const { write: digw } = await import('/src/model/mining.js');
    const { effHardAt } = await import('/src/view/paint.js');
    const band = bandOf('surface');
    for (const { tx, units } of spec)
      digw.add(band, tx, ty, effHardAt(band, tx, ty) * (units + 1e-4));
  }, { ty: VEIN.ty, spec });
}

test('a fresh copper vein', async ({ page }) => {
  await boot(page);
  await settle(page);
  await veinScene(page);
  await frameVein(page);
  await shot(page, 'vein-fresh.png');
});

test('the same copper vein, one tile 3 of 4 spent and its neighbour 1 of 4', async ({ page }) => {
  await boot(page);
  await settle(page);
  await veinScene(page);
  /* Framed once BEFORE the work is added so every chunk the shot needs is
     already baked: `write.add` bumps the epoch and never a chunk version
     (that is the whole reason this cue cannot live in the bake), so a chunk
     first painted after the work exists would bake a crack that a chunk
     painted before it would not. The nudge in `spendUnits` keeps the crack
     read at 0.0001 either way -- but a baseline should not depend on that. */
  await frameVein(page);
  await spendUnits(page, [{ tx: VEIN.tx0 + 2, units: 3 }, { tx: VEIN.tx0 + 3, units: 1 }]);
  await frameVein(page);
  await shot(page, 'vein-depleted.png');
});

/* THE PROOF THAT THE OVERLAY IS DOING SOMETHING, and the reason it is a
   pixel count rather than a third screenshot: one scene, rendered twice,
   with NOTHING different between the two draws but `dig.work`. If
   `drawDepletion` were removed, misnamed, culled wrongly or gated on a
   condition that is never true, `total` would be 0 and this test would fail
   while both baselines above still passed -- which is exactly the failure
   CLAUDE.md records ("a test can silently test nothing").

   It also pins the pass's SCOPE, which a screenshot cannot: the only pixels
   that may move are the two tiles that were worked. A cue that bled into a
   neighbouring tile, or repainted the whole viewport, fails here. */
test('the depletion cue actually changes pixels, and only on the tiles that were worked', async ({ page }) => {
  await boot(page);
  await settle(page);
  await veinScene(page);
  await frameVein(page);

  const seen = await page.evaluate(async ({ tx0, ty, w }) => {
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: digw } = await import('/src/model/mining.js');
    const { effHardAt } = await import('/src/view/paint.js');
    const band = bandOf('surface');

    const c = document.getElementById('stage');
    const ctx = c.getContext('2d');
    const grab = () => ctx.getImageData(0, 0, c.width, c.height).data;

    __mf.draw();
    const before = grab();

    digw.add(band, tx0 + 2, ty, effHardAt(band, tx0 + 2, ty) * 3.0001);
    digw.add(band, tx0 + 3, ty, effHardAt(band, tx0 + 3, ty) * 1.0001);

    __mf.draw();
    const after = grab();

    const moved = (i) => before[i] !== after[i] ||
                         before[i + 1] !== after[i + 1] ||
                         before[i + 2] !== after[i + 2];

    let total = 0;
    for (let i = 0; i < before.length; i += 4) if (moved(i)) total++;

    /* Per-tile counts across the whole vein row plus one tile either side, so
       "only the worked tiles moved" is asserted rather than assumed. */
    const t = band.tile, counts = [];
    for (let k = -1; k <= w; k++) {
      const sx = worldX(band, tx0 + k) - __mf.cam.x, sy = worldY(band, ty) - __mf.cam.y;
      let n = 0;
      for (let y = sy; y < sy + t; y++)
        for (let x = sx; x < sx + t; x++) if (moved((y * c.width + x) * 4)) n++;
      counts.push({ tx: tx0 + k, n });
    }
    return { total, counts, tile: t };
  }, VEIN);

  const at = tx => seen.counts.find(c => c.tx === tx).n;
  const worked = [VEIN.tx0 + 2, VEIN.tx0 + 3];

  // the cue is visible at all, on both worked tiles
  expect(at(worked[0])).toBeGreaterThan(0);
  expect(at(worked[1])).toBeGreaterThan(0);
  // the 3-of-4 tile is more changed than the 1-of-4 one: the wash is per unit
  expect(at(worked[0])).toBeGreaterThanOrEqual(at(worked[1]));
  // and nothing else in the row moved at all
  for (const c of seen.counts)
    if (!worked.includes(c.tx)) expect(c.n).toBe(0);
  // no pixel anywhere outside those two tiles moved either
  expect(seen.total).toBe(at(worked[0]) + at(worked[1]));
});

/* ============================================================
   PHASE 13b: THE LADDER DRAWS ITSELF
   (docs/PLAN-phase13.md section 3.3)

   Terrain painting was substance-driven and form-blind, so a placed
   `timber/rung` was pixel-identical to a native trunk minus its canopy --
   and because `rung.tile.solid` is false, an open shaft gave it a lit top
   face, a jittered cliff face on BOTH sides and a bottom shade line. It read
   as an edge-lit wooden cube floating in the void. `view/paint.js#paintTile`
   now draws a form's own `look` instead of all of that.

   ONE SCENE, TWO LIGHTINGS, TWO VIEWPORTS, on the pair rule
   `shaft-unlit.png`/`shaft-lit.png` states above: a screenshot pair proves
   the two are not identical to EACH OTHER, so each is baselined separately
   and a regression has to move a file relative to its own accepted image.

   BOTH TIERS IN ONE FRAME, deliberately: `timber/rung` on the left wall and
   `copper/stair` on the right. They share one treatment function
   (`view/treatments.js#ladder`) and differ only in three numbers and a
   palette, so a frame showing one and not the other would leave half the new
   content unbaselined -- and "the two tiers read apart at a glance" is what
   docs/SPEC.md section 10 asks the tier to buy.

   SIX TILES, AND THEY CROSS A CHUNK SEAM ON PURPOSE. The rung pitch is
   derived from the ABSOLUTE band row rather than from each tile's own top
   edge, so a column of any length is one continuous ladder; rows 110..115 at
   `chunk:16` straddle the boundary at row 112, which puts the last four tiles
   in a DIFFERENT CHUNK CANVAS from the first two. A per-tile pitch would
   stutter every 8 px and a per-chunk one would break at the seam, and this is
   the baseline either would show up in. */
const LADDER = { tx0: 40, ty0: 104, w: 7, h: 14, top: 110, n: 6 };

async function ladderShaft(page) {
  await page.evaluate(async ({ tx0, ty0, w, h, top, n }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { PH, write: pw } = await import('/src/model/player.js');
    const { banner } = await import('/src/view/fx.js');

    const band = bandOf('topsoil');
    for (let ty = ty0; ty < ty0 + h; ty++)
      for (let tx = tx0; tx < tx0 + w; tx++) tw.clear(band, tx, ty);

    /* A floor for the ladders to stand on and for the brazier to sit on --
       stone rather than the band's own soil so the shaft floor reads as a
       different material from its walls. */
    const floor = ty0 + h - 1;
    for (let tx = tx0; tx < tx0 + w; tx++) tw.set(band, tx, floor, S.stone);

    /* Placed through `model/tiles.js#write.set` with a real form ordinal --
       the same call `rules/placement.js#placeTile` makes -- never through a
       click at a hardcoded pixel, which CLAUDE.md records breaks the moment
       the viewport changes size, and these are shot at two. */
    for (let i = 0; i < n; i++) {
      tw.set(band, tx0 + 1, top + i, S.timber, F.rung);
      tw.set(band, tx0 + w - 2, top + i, S.copper, F.stair);
    }

    /* Standing at the FOOT of the timber ladder, and clear of the column the
       brazier goes in below -- the lit shot's whole point is that the light
       source is visible in frame, and the player sprite is 3 tiles of the
       shaft's 7. */
    pw.band(band);
    pw.move(worldX(band, tx0 + 2), worldY(band, floor) - PH);
    ww.revealAll(band);
    banner.fade = 0;   // past the opening title, same reasoning `settle()` gives
  }, LADDER);
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(2); });
}

/* Centre the shaft in whatever viewport is current and render ONCE. Separate
   from the setup and always called last, for the reason `frameVein` gives: a
   substep also runs `updateCamera`, which would pull the camera back onto the
   player. */
const frameLadder = page => page.evaluate(async ({ tx0, ty0, w, h }) => {
  const { bandOf, worldX, worldY } = await import('/src/model/world.js');
  const { VIEW } = await import('/src/core/canvas.js');
  const band = bandOf('topsoil');
  __mf.cam.x = Math.round(worldX(band, tx0 + w / 2) - VIEW.w / 2);
  __mf.cam.y = Math.round(worldY(band, ty0 + h / 2) - VIEW.h / 2);
  __mf.draw();
}, LADDER);

test('a placed ladder column in an unlit shaft', async ({ page }) => {
  await boot(page);
  await settle(page);
  await ladderShaft(page);
  await frameLadder(page);
  await shot(page, 'ladder-unlit.png');
});

test('the same ladder column lit by a brazier', async ({ page }) => {
  await boot(page);
  await settle(page);
  await ladderShaft(page);
  await page.evaluate(async ({ tx0, ty0, h }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { write: mw } = await import('/src/model/machines.js');
    const { bandOf } = await import('/src/model/world.js');

    const brazier = mw.place(bandOf('topsoil'), M.brazier, tx0 + 4, ty0 + h - 2);
    mw.take(brazier, S.timber, F.log, 4);
    __mf.frames(700);          // > 6s honest-fuel recipe, then settle -- `shaft-lit.png`'s own margin
  }, LADDER);
  await frameLadder(page);
  await shot(page, 'ladder-lit.png');
});

/* ============================================================
   PHASE 15: A PLANTED SEED, AND THE TREE IT BECOMES
   (docs/PLAN-phase15-trees.md D15-F, docs/SPEC.md section 22)

   Two baselines and one pixel-diff, on exactly the structure the
   depletion trio above already uses and for exactly the same reasons.

   `seedling.png` is a mid-growth seedling: a LIVE OVERLAY, drawn every frame
   from `model/growth.js#stageAt`, over a tile the chunk canvas has baked as
   ordinary terrain. `grown-tree.png` is the same tile after
   `rules/growth.js` has resolved it -- native trunk tiles with the existing
   canopy on top, which is the whole claim of D15-A: a grown tree is not
   similar to a worldgen one, it is the same bytes, and the crown, the chunk
   invalidation and the seam repaint are all free.

   THE THIRD TEST IS THE ONE THAT PROVES THE OVERLAY EXISTS. CLAUDE.md
   records two tests that baselined a scene with the overlay flag misspelled
   and passed anyway, so a screenshot pair alone is not evidence: it would
   still pass with `seedling()` deleted, because a `timber/seed` tile paints
   as brown terrain either way. So the third test renders ONE scene twice
   with nothing changing between the two draws but the presence of the growth
   entry -- which is exactly "the same partially-grown scene with the overlay
   pass suppressed" -- and counts the pixels that moved and where.

   THE SCENE IS HAND-CARVED WITH OPEN SKY ABOVE IT, per the depletion trio's
   own note: `rules/light.js` seeds every tile from row 0 down to and
   including the first solid one at `eff('lightMax')`, so clearing the pocket
   to row 0 leaves the seedling's row fully lit and `drawDarkness` (94% black
   over an unlit tile) with nothing to do to it. Open sky is also what
   `model/tiles.js#skyExposedAt` needs for the grown tree to get a canopy at
   all, so one property buys both baselines.

   THE COLUMN IS CLEAR OF THE CHUNK SEAM ON PURPOSE, and that is the
   difference between this and `tree-chunk-seam.png` above: that baseline
   exists to prove the CANOPY bakes into both neighbouring chunk canvases and
   is the file this phase must not move. This one is about growth, so it is
   framed away from any seam and cannot be confused with it. */
const SPROUT = { tx: 44, fy: 26 };          // fy is the floor; the seed sits at fy - 1

/* Everything is driven through the MODEL and the REAL placement rule, never
   through a click at a hardcoded pixel: these scenes are shot at two
   viewports and CLAUDE.md records that a click at (400, 300) fails at the
   other one. `placeTile` and not `write.set`, because D15-C's whole claim is
   that a seed is planted by the same verb as everything else and is legal on
   a bare floor -- writing the tile directly would skip the one clause this
   phase added to that function. */
async function sproutScene(page) {
  await page.evaluate(async ({ tx, fy }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { PH, write: pw } = await import('/src/model/player.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { placeTile } = await import('/src/rules/placement.js');
    const { banner } = await import('/src/view/fx.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();      // docs/FINDINGS.md #10
    const band = bandOf('surface');
    for (let x = tx - 8; x <= tx + 8; x++) {
      for (let y = 0; y < fy; y++) tw.clear(band, x, y);
      tw.set(band, x, fy, S.stone);
    }
    rw.collect(S.timber, F.seed, 1);
    if (!placeTile(band, tx, fy - 1, S.timber, F.seed))
      throw new Error('the test scene could not plant a seed on a bare stone floor');

    pw.band(band);
    pw.move(worldX(band, tx - 4), worldY(band, fy) - PH);
    ww.revealAll(band);
    banner.fade = 0;
  }, SPROUT);
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(2); });
  /* The beat jump above releases the altar and it stands in frame here.
     See `ARRIVAL_SUBSTEPS`. */
  await pastArrival(page);
}

/* Centre the sprout in whatever viewport is current and render ONCE.
   Separate from `sproutScene` and always called last, because a substep also
   runs `updateCamera`, which would pull the camera back onto the player. */
const frameSprout = page => page.evaluate(async ({ tx, fy }) => {
  const { bandOf, worldX, worldY } = await import('/src/model/world.js');
  const { VIEW } = await import('/src/core/canvas.js');
  const band = bandOf('surface');
  __mf.cam.x = Math.round(worldX(band, tx) + 4 - VIEW.w / 2);
  __mf.cam.y = Math.round(worldY(band, fy - 4) - VIEW.h / 2);
  __mf.draw();
}, SPROUT);

/* Put `frac` of `eff('treeGrowSecs')` on the ledger through the same
   `model/growth.js#write.add` the real step calls. Driving 7,200 real
   substeps to reach a third of 180 s would measure nothing these baselines
   are about, and `rules/growth.js`'s own timing is asserted at all 8
   framerates in `tools/check.mjs` section 8g. */
const growTo = (page, frac) => page.evaluate(async ({ spec, frac }) => {
  const { bandOf } = await import('/src/model/world.js');
  const { write: gw } = await import('/src/model/growth.js');
  const { eff } = await import('/src/model/mods.js');
  gw.add(bandOf('surface'), spec.tx, spec.fy - 1, eff('treeGrowSecs') * frac);
}, { spec: SPROUT, frac });

/* 0.4 and not exactly 1/3: `view/scene.js#SEED_STAGES` steps the silhouette
   at a third and at two thirds, and a baseline that sat ON a boundary would
   be one floating-point hair away from showing the previous stage -- the
   same reason `spendUnits` above nudges past each unit boundary rather than
   landing on it. 0.4 is comfortably inside the middle stage, which is what
   "roughly a third grown" means to look at. */
test('a planted seed part-way grown', async ({ page }) => {
  await boot(page);
  await settle(page);
  await sproutScene(page);
  await frameSprout(page);              // bake the chunks before the ledger moves
  await growTo(page, 0.4);
  await frameSprout(page);
  await shot(page, 'seedling.png');
});

/* THE SAME TILE, ONCE IT IS A TREE. One real substep past the full grow time
   so the REAL `rules/growth.js` is what resolves it -- not a hand-written
   stack of trunk tiles, which would baseline this phase's own opinion of
   what a tree looks like instead of what it actually produces. */
test('the same tile once the seed has become a tree', async ({ page }) => {
  await boot(page);
  await settle(page);
  await sproutScene(page);
  await frameSprout(page);
  await growTo(page, 1);
  const height = await page.evaluate(async ({ tx, fy }) => {
    const { bandOf } = await import('/src/model/world.js');
    const { subAt, formAt } = await import('/src/model/tiles.js');
    const { S } = await import('/src/data/substances.js');
    const { NATIVE } = await import('/src/data/forms.js');
    __mf.frames(1);                     // rules/growth.js resolves it here
    const band = bandOf('surface');
    let h = 0;
    while (subAt(band, tx, fy - 1 - h) === S.timber &&
           formAt(band, tx, fy - 1 - h) === NATIVE) h++;
    return h;
  }, SPROUT);
  /* Asserted, not assumed: a baseline of an unresolved seedling would look
     plausible and prove nothing about growth at all. `data/world.js`'s own
     `trees` row declares [3, 5] and `rules/growth.js` reads that range off
     it, so a planted tree is the same size as a wild one. */
  expect(height).toBeGreaterThanOrEqual(3);
  expect(height).toBeLessThanOrEqual(5);

  await frameSprout(page);
  await shot(page, 'grown-tree.png');
});

/* THE PROOF THAT THE GROWTH OVERLAY IS DOING SOMETHING, and the reason it is
   a pixel count rather than a third screenshot: one scene, rendered twice,
   with NOTHING different between the two draws but whether
   `model/growth.js` holds an entry for the tile. Clearing the entry leaves
   the `timber/seed` TILE exactly where it was -- the chunk canvas has
   already baked it as ordinary terrain and `write.clear` on the LEDGER
   touches no tile byte and no chunk version -- so this is precisely the same
   scene with the overlay pass suppressed. If `seedling()` were removed,
   misnamed, culled wrongly or gated on a condition that is never true,
   `total` would be 0 and this test would fail while both baselines above
   still passed.

   It also pins the pass's SCOPE, which a screenshot cannot: the only pixels
   that may move are the planted tile's own 8x8. `seedling()` draws strictly
   inside its tile for exactly this reason -- a sapling poking into the air
   above would read marginally better and would make this assertion either
   weaker or a second copy of that function's geometry. */
test('the growth cue actually changes pixels, and only on the tile that was planted', async ({ page }) => {
  await boot(page);
  await settle(page);
  await sproutScene(page);
  await frameSprout(page);

  const seen = await page.evaluate(async ({ tx, fy }) => {
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: gw, growingAt } = await import('/src/model/growth.js');
    const { eff } = await import('/src/model/mods.js');
    const band = bandOf('surface');
    const py = fy - 1;

    const c = document.getElementById('stage');
    const ctx = c.getContext('2d');
    const grab = () => ctx.getImageData(0, 0, c.width, c.height).data;

    /* OVERLAY SUPPRESSED: the ledger entry goes, the tile stays. */
    gw.clear(band, tx, py);
    const wasSuppressed = !growingAt(band, tx, py);
    __mf.draw();
    const before = grab();

    /* OVERLAY BACK, at the same 0.4 the `seedling.png` baseline uses. */
    gw.plant(band, tx, py);
    gw.add(band, tx, py, eff('treeGrowSecs') * 0.4);
    __mf.draw();
    const after = grab();

    const moved = (i) => before[i] !== after[i] ||
                         before[i + 1] !== after[i + 1] ||
                         before[i + 2] !== after[i + 2];

    let total = 0;
    for (let i = 0; i < before.length; i += 4) if (moved(i)) total++;

    /* Per-tile counts across the planted tile and three either side, so
       "only the planted tile moved" is asserted rather than assumed. */
    const t = band.tile, counts = [];
    for (let k = -3; k <= 3; k++) {
      const sx = worldX(band, tx + k) - __mf.cam.x, sy = worldY(band, py) - __mf.cam.y;
      let n = 0;
      for (let y = sy; y < sy + t; y++)
        for (let x = sx; x < sx + t; x++) if (moved((y * c.width + x) * 4)) n++;
      counts.push({ tx: tx + k, n });
    }
    return { total, counts, wasSuppressed, tile: t };
  }, SPROUT);

  // the suppression really happened, or the two draws are the same draw
  expect(seen.wasSuppressed).toBe(true);
  const at = dx => seen.counts.find(c => c.tx === SPROUT.tx + dx).n;
  // the cue is visible at all
  expect(at(0)).toBeGreaterThan(0);
  // nothing else in the row moved
  for (const c of seen.counts) if (c.tx !== SPROUT.tx) expect(c.n).toBe(0);
  // and no pixel anywhere outside that one tile moved either
  expect(seen.total).toBe(at(0));
});

/* ============================================================
   THE DRAFT MODAL (Phase 17c2, docs/PLAN-wave5-closeout.md §6)

   THE DELIVERY IS SET UP THROUGH THE MODEL; EVERYTHING AFTER IT IS THE
   SHIPPED PATH. The subject here is the modal, not the mining, so these
   tests fill a receiver's buffer directly and then let the real director
   run: `rules/cycles.js#drainReceivers` credits it, `#resolve` completes
   the trial and writes `run.offer`, `rules/draft.js` draws the cards out
   of the seeded stream, and `shell/main.js#raiseOffer` opens the panel.
   Nothing below writes `run.offer`, `ui.stack` or a card id by hand.
   ============================================================ */
async function payTrial(page, cycle) {
  await page.evaluate(async (cycle) => {
    const { run, write } = await import('/src/model/run.js');
    const { CYCLE } = await import('/src/data/cycles.js');
    const { M } = await import('/src/data/machines.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const mach = await import('/src/model/machines.js');
    const { bandOf } = await import('/src/model/world.js');

    /* Disarm cycle 1 (armed at boot) so `ensureLiveCycle` re-arms the row
       this test actually wants. */
    write.tribute(null);
    write.cycle(cycle);
    __mf.frames(1);

    const row = CYCLE[run.tribute.id];
    const band = bandOf('surface');
    const recv = __mf.machines.find(m => m.def === M[row.at]) ??
                 mach.write.place(band, M[row.at], 2, 2);
    for (const d of row.demand) mach.write.take(recv, S[d.sub], F[d.form], d.n);
    __mf.frames(2);
  }, cycle);
}

const offerOf = page => page.evaluate(() => __mf.ui.offer);
const draftPanels = page => page.evaluate(() =>
  __mf.ui.panels.filter(p => p.id.startsWith('draft-')).map(p => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h })));

test('17c2: cycle 2 raises a two-card grant draft over a frozen world, and its reroll is refused as spent', async ({ page }) => {
  await boot(page);
  await settle(page);
  await payTrial(page, 2);

  /* The grant tier ships TWO rows against an `offerSize` of 3, so two cards
     is the honest answer and the layout must not reserve a third. */
  const offer = await offerOf(page);
  expect(offer.tier).toBe('grant');
  expect(offer.ids.length).toBe(2);
  expect(offer.god).toBe('hephaestus');
  expect(offer.pool).toBe(2);
  expect(offer.canReroll).toBe(false);      // pool <= ids: 'THIS IS ALL THERE IS'

  const drawn = await draftPanels(page);
  expect(drawn.map(p => p.id).sort()).toEqual(['draft-card-0', 'draft-card-1', 'draft-reroll']);

  /* THE WORLD REALLY IS FROZEN BEHIND IT (D17-A): 120 substeps change no
     simulated time and move no body. `stepFx` is deliberately not part of
     this claim -- it runs outside `step()` and always has. */
  const frozen = await page.evaluate(async () => {
    const { run } = await import('/src/model/run.js');
    const { player } = await import('/src/model/player.js');
    const before = { t: run.t, ct: __mf.clock.t, px: player.x, py: player.y };
    __mf.hold({ right: 1 }, 120);
    return { before, after: { t: run.t, ct: __mf.clock.t, px: player.x, py: player.y } };
  });
  expect(frozen.after).toEqual(frozen.before);

  await shot(page, 'draft-grant-two-cards.png');
});

test('17c2: the modal is not vacuous -- the same frame with the panel closed is a different picture', async ({ page }) => {
  await boot(page);
  await settle(page);
  await payTrial(page, 2);
  const [card] = await draftPanels(page);

  /* Two draws with no step between them, the panel popped for the first, so
     nothing but the modal itself can account for a moved pixel. `view` reads
     the stack off the frame context, so popping it is the whole "feature
     off" switch -- the same shape the armed-slot and growth-cue probes use. */
  const delta = await page.evaluate(async (card) => {
    const { open, close } = await import('/src/shell/ui.js');
    const c = document.getElementById('stage');
    const ctx = c.getContext('2d');
    const grab = () => ctx.getImageData(0, 0, c.width, c.height).data;

    close('draft');
    __mf.draw();
    const before = grab();
    const closedPanels = __mf.ui.panels.filter(p => p.id.startsWith('draft-')).length;

    open('draft');
    __mf.draw();
    const after = grab();

    const moved = i => before[i] !== after[i] || before[i + 1] !== after[i + 1] ||
                       before[i + 2] !== after[i + 2];
    let total = 0;
    for (let i = 0; i < before.length; i += 4) if (moved(i)) total++;
    let inside = 0;
    for (let y = card.y; y < card.y + card.h; y++)
      for (let x = card.x; x < card.x + card.w; x++) if (moved((y * c.width + x) * 4)) inside++;
    return { total, inside, closedPanels, area: card.w * card.h };
  }, card);

  expect(delta.closedPanels).toBe(0);                 // the "off" state really is off
  expect(delta.inside).toBeGreaterThan(0);            // the card is painted where it says it is
  expect(delta.total).toBeGreaterThan(delta.inside);  // and the wash covers the rest of the screen
});

test('17c2: clicking a card takes that card and ends the freeze', async ({ page }) => {
  await boot(page);
  await settle(page);
  await payTrial(page, 2);

  const before = await offerOf(page);
  const [card] = await draftPanels(page);
  await realClick(page, card.x + (card.w >> 1), card.y + (card.h >> 1));

  const after = await page.evaluate(async () => {
    const { run } = await import('/src/model/run.js');
    const t0 = run.t;
    __mf.frames(60);
    return { offer: __mf.ui.offer, open: __mf.ui.open, granted: run.granted.slice(), moved: run.t - t0 };
  });

  /* `draft-card-0` is `run.offer.ids[0]`, and the grant tier's own `grants`
     key names the machine it unlocks -- read back through the table rather
     than remembered, so this goes red if the pointer ever reaches a
     different card than the digit key would. */
  const expected = await page.evaluate(async (id) => {
    const { GRANT } = await import('/src/data/grants.js');
    return GRANT[id].grants;
  }, before.ids[0]);

  expect(after.offer).toBe(null);
  expect(after.open).not.toContain('draft');
  expect(after.granted).toContain(expected);
  expect(after.moved).toBeGreaterThan(0);        // the run is running again
});

test('17c2: cycle 3 draws three boon cards with their modifier lines, and a live reroll row', async ({ page }) => {
  await boot(page);
  await settle(page);
  await payTrial(page, 3);

  const offer = await offerOf(page);
  expect(offer.tier).toBe('boon');
  expect(offer.ids.length).toBe(3);
  expect(offer.god).toBe('athena');
  expect(offer.rerollCost).toBe(2);
  expect(offer.canReroll).toBe(true);            // athena's own trial paid exactly the price

  /* Every offered boon carries at least one `mods` row, which is what the
     card's delta lines are built from -- if a tier ever shipped a row with
     none, this scene would be photographing an empty claim. */
  const modded = await page.evaluate(async (ids) => {
    const { BOON } = await import('/src/data/boons.js');
    return ids.every(id => (BOON[id].mods ?? []).length > 0);
  }, offer.ids);
  expect(modded).toBe(true);

  await shot(page, 'draft-boon-three-cards.png');
});

test('17c2: a reroll spends the asking god\'s favour, and the row then dims with the other reason', async ({ page }) => {
  await boot(page);
  await settle(page);
  await payTrial(page, 3);

  const reroll = (await draftPanels(page)).find(p => p.id === 'draft-reroll');
  const before = await page.evaluate(async () => {
    const { run } = await import('/src/model/run.js');
    return { favour: run.favour.athena, ids: __mf.ui.offer.ids.slice() };
  });
  expect(before.favour).toBe(2);

  await realClick(page, reroll.x + (reroll.w >> 1), reroll.y + (reroll.h >> 1));

  const after = await page.evaluate(async () => {
    const { run } = await import('/src/model/run.js');
    return { favour: run.favour.athena, offer: __mf.ui.offer };
  });

  expect(after.favour).toBe(0);                  // the price was really paid
  expect(after.offer.ids.length).toBe(3);        // and a fresh offer stands
  expect(after.offer.canReroll).toBe(false);     // purse empty, pool still deep

  await shot(page, 'draft-boon-reroll-unaffordable.png');
});

test('17c2: the modal stays legible at the 200 px base-buffer floor', async ({ page }) => {
  await boot(page);
  /* 400x360 css px at `core/canvas.js#resize`'s scale-2 floor is exactly the
     200x180 base buffer the widget contract names -- three cards no longer
     fit across, so the grid drops to two per row rather than squeezing them
     under the readable minimum.

     WAIT FOR THE PAGE'S OWN RESIZE LISTENER, not just for the browser.
     `setViewportSize` resolves when Chromium has resized the view; the
     `resize` handler `shell/boot.js` installed runs later, and it is that
     handler which moves `VIEW` and re-clamps the camera. Under `?test=1`
     there is no RAF loop to repaint afterwards, so a `newRun` that lands
     first composes the scene at 640x400 and the screenshot catches a
     different camera. The stage canvas's backing width IS `VIEW.w`
     (`core/canvas.js#resize`), so waiting on it waits on the handler. */
  await page.setViewportSize({ width: 400, height: 360 });
  await page.waitForFunction(w => document.getElementById('stage').width === w, 200);
  await settle(page);
  const V = await page.evaluate(async () => {
    const { VIEW } = await import('/src/core/canvas.js');
    return { w: VIEW.w, h: VIEW.h };
  });
  expect(V).toEqual({ w: 200, h: 180 });
  await payTrial(page, 3);

  const drawn = await draftPanels(page);
  expect(drawn.length).toBe(4);                              // three cards and the reroll row
  const cards = drawn.filter(p => p.id.startsWith('draft-card-'))
                     .sort((a, b) => a.y - b.y || a.x - b.x);
  const reroll = drawn.find(p => p.id === 'draft-reroll');
  expect(cards.length).toBe(3);

  /* THE LAYOUT CHOSE TO FIT; IT WAS NOT CLAMPED INTO FITTING. `drawPanel`
     (`view/ui/panel.js:34-37`) forces every rect inside the buffer BEFORE
     recording it, so `x + w <= vw` is a tautology and proves nothing -- three
     cards drawn on top of each other at x 2 would satisfy it. What cannot be
     faked is landing STRICTLY inside every one of those clamp boundaries:
     `w == vw - 4`, `x == 2` or `x + w == vw - 2` is exactly what a clamped
     rect looks like. */
  for (const p of drawn) {
    expect(p.w).toBeLessThan(V.w - 4);
    expect(p.h).toBeLessThan(V.h - 4);
    expect(p.x).toBeGreaterThan(2);
    expect(p.y).toBeGreaterThan(2);
    expect(p.x + p.w).toBeLessThan(V.w - 2);
    expect(p.y + p.h).toBeLessThan(V.h - 2);
  }

  /* AND NOTHING SITS ON TOP OF ANYTHING ELSE. */
  for (let i = 0; i < drawn.length; i++)
    for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i], b = drawn[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w &&
                      a.y < b.y + b.h && b.y < a.y + a.h;
      expect({ pair: [a.id, b.id], overlap }).toEqual({ pair: [a.id, b.id], overlap: false });
    }

  /* THE 2+1 GRID IS REAL: three cards at this width cannot go across, so two
     share a row and the third drops below it. A single column (the shape a
     too-wide MIN_CARD_W produces) has three distinct y values and fails here;
     a squeezed single row has one. */
  expect(cards[0].y).toBe(cards[1].y);
  expect(cards[2].y).toBeGreaterThanOrEqual(cards[0].y + cards[0].h);
  expect(new Set(cards.map(c => c.w)).size).toBe(1);         // one uniform card width

  /* EACH ROW IS CENTRED ON ITS OWN COUNT, so the odd card does not hang left.
     Off-by-one is the integer `>> 1` in the layout, not slop. */
  const centred = r => Math.abs(r.left - r.right) <= 1;
  const rowOf = rs => ({ left: Math.min(...rs.map(r => r.x)),
                         right: V.w - Math.max(...rs.map(r => r.x + r.w)) });
  expect(centred(rowOf([cards[0], cards[1]]))).toBe(true);
  expect(centred(rowOf([cards[2]]))).toBe(true);
  expect(centred(rowOf([reroll]))).toBe(true);
  expect(reroll.y).toBeGreaterThanOrEqual(cards[2].y + cards[2].h);

  await shot(page, 'draft-boon-floor.png');
});

/* ============================================================
   OP-STREAM PURITY (Phase 17g1, docs/PLAN-wave5-closeout.md §6c)

   `tools/check.mjs`'s render-purity probe watches the model epoch over the
   default scene. It cannot see a draw that varies without writing to the
   model, and it never reaches a panel, so `view/ui/draft.js` had never
   executed under any headless check at all. These record what the renderer
   actually emitted and compare call for call.
   ============================================================ */

const SCENES = {
  surface: async () => {},

  'hollow with a relic': async page => {
    await hollowScene(page);
    await page.evaluate(async () => {
      const { S } = await import('/src/data/substances.js');
      const { F } = await import('/src/data/forms.js');
      const { bandOf, worldX, worldY } = await import('/src/model/world.js');
      const { write: iw } = await import('/src/model/items.js');
      const band = bandOf('topsoil');
      const it = iw.spawn(band, worldX(band, 19) + 4, worldY(band, 103) + 4, S.bellows, F.relic, 0, 0);
      if (it) it.rest = 1;
    });
  },

  'the draft modal': async page => { await payTrial(page, 3); },

  /* The arrival is the one draw path that animates off `run.t` and a
     positional hash, so it is the one most likely to reach for `rand()`.
     Frozen mid-presentation, since `draw()` advances no clock. See
     `altarArrives`. */
  'the altar arriving': async page => {
    await altarArrives(page);
    await page.evaluate(n => __mf.frames(n), MID_ARRIVAL);
  }
};

for (const [name, setup] of Object.entries(SCENES)) {
  test(`op stream: ${name} repaints identically`, async ({ page }) => {
    await boot(page);
    await settle(page);
    await setup(page);
    /* Warm the chunk cache first. `view/paint.js` repaints at most
       REPAINT_BUDGET chunks a frame, so a cold first draw carries paint ops a
       warm second draw legitimately does not. */
    await page.evaluate(() => { for (let i = 0; i < 12; i++) __mf.draw(); });

    /* FOUR draws, not two. A draw path drawing from `rand()` lands on the
       same op string by chance often enough that one repeat is a weak
       sample -- an injected `(rand() * 10) | 0` passed a two-draw compare. */
    const runs = [];
    for (let i = 0; i < 4; i++) runs.push(await recordOps(page, () => page.evaluate(() => __mf.draw())));

    expect(runs[0].length).toBeGreaterThan(200);
    for (let i = 1; i < runs.length; i++) expect(firstOpDiff(runs[0], runs[i])).toBeNull();
  });
}

test('op stream: the recorder sees the scene, not an empty log', async ({ page }) => {
  await boot(page);
  await settle(page);
  const before = await recordOps(page, () => page.evaluate(() => __mf.draw()));

  /* One second of simulated time. Everything derived from `clock.t` -- the
     item bob, the halo pulse, the furnace flame -- has to move, so a recorder
     that logged nothing of the world would come back identical here. */
  const after = await recordOps(page, () => page.evaluate(() => { __mf.clock.t += 1; __mf.draw(); }));

  expect(firstOpDiff(before, after)).not.toBeNull();
});

test('op stream: the draft modal is drawn, and closing it removes those ops', async ({ page }) => {
  await boot(page);
  await settle(page);
  await payTrial(page, 3);
  await page.evaluate(() => { for (let i = 0; i < 12; i++) __mf.draw(); });

  const open = await recordOps(page, () => page.evaluate(() => __mf.draw()));
  expect((await page.evaluate(() => __mf.ui.open)).includes('draft')).toBe(true);

  await page.evaluate(async () => {
    const { ui, closeTop } = await import('/src/shell/ui.js');
    while (ui.stack.length) closeTop();
  });
  const closed = await recordOps(page, () => page.evaluate(() => __mf.draw()));

  /* The modal is a third of the screen, so it cannot cost a handful of ops. */
  expect(open.length - closed.length).toBeGreaterThan(100);
});


/* ============================================================
   PHASE 17f2 -- THE ALTAR'S ARRIVAL
   ============================================================ */

/* Beat 4 is `rules/cycles.js#ALTAR_BEAT`, the climbed-back-up beat that
   releases cycle 1's altar (D17-G). Jumped rather than played, because the
   dig and the climb that fire it for real are other tests' subject. The
   `frames(1)` is what gives the director a frame to place anything in --
   a scene that jumps the beat and draws without stepping gets no altar at
   all (docs/REVIEW-wave5-17f1.md D2). */
async function altarArrives(page) {
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    while (run.tutorialBeat < 4) rw.advanceBeat();
    /* The opening title card is still up two substeps into a run and it sits
       straight across the altar. Cleared the same way `ratedCycle` above
       clears it. */
    (await import('/src/view/fx.js')).banner.fade = 0;
    __mf.frames(1);
  });
}

/* The arrival's own rectangle in SCREEN px, grown by a margin that takes in
   the base flare and still leaves the idling player out -- they spawn 6
   tiles away, and a crop that reached them would answer for their blink
   rather than for the altar. */
const arrivalCrop = page => page.evaluate(() => {
  const a = __mf.run.arrival;
  const m = __mf.machines.find(mm => mm.box.x === a.x && mm.box.y === a.y);
  const pad = 12;
  return {
    x: Math.max(0, (a.x - __mf.cam.x - pad) | 0),
    y: Math.max(0, (a.y - __mf.cam.y - pad) | 0),
    w: m.box.w + pad * 2,
    h: m.box.h + pad * 2
  };
});

/* 29 substeps past placement is p = 0.151 of `altarRiseSecs`, which is 8 of
   the altar's 16 px still underground and the shaft at full strength. */
const MID_ARRIVAL = 29;

test('17f2: the altar rises out of the ground under a shaft of light', async ({ page }) => {
  await boot(page);
  await settle(page);
  await altarArrives(page);
  await page.evaluate(n => __mf.frames(n), MID_ARRIVAL);
  await shot(page, 'altar-arrival.png');
});

test('17f2: the arrival is not vacuous -- the same altar with the window closed is a different picture', async ({ page }) => {
  await boot(page);
  await settle(page);
  await altarArrives(page);

  await page.evaluate(n => __mf.frames(n), MID_ARRIVAL);
  const crop = await arrivalCrop(page);
  const mid = await canvasHash(page, crop);
  const midOps = await recordOps(page, () => page.evaluate(() => __mf.draw()));
  const pinned = await page.evaluate(() => ({ t: __mf.clock.t, x: __mf.cam.x, y: __mf.cam.y }));

  /* Two seconds of simulated time, which is past `altarRiseSecs` at 1.6 s.
     The altar has not moved and the stamp is still on `run`; only the window
     has closed.

     THE RENDER CLOCK AND THE CAMERA ARE BOTH PUT BACK before the second
     draw, and the hash assertion below is worthless without both. The
     altar's halo pulses off `clock.t`, and `updateCamera` is still easing
     onto the player over those 2 s, so a crop taken later differs whether or
     not there is a presentation -- measured, with `arrivalOf` stubbed to
     return null, once for each. Pinned, `run.t` is the only thing inside the
     crop that has moved, and `run.t` reaches the renderer through the
     arrival and nothing else. */
  await page.evaluate(() => __mf.frames(240));
  expect(await page.evaluate(() => __mf.run.arrival !== null)).toBe(true);
  await shot(page, 'altar-arrival-over.png');

  await page.evaluate(p => {
    __mf.clock.t = p.t; __mf.cam.x = p.x; __mf.cam.y = p.y; __mf.draw();
  }, pinned);
  const done = await canvasHash(page, crop);
  const doneOps = await recordOps(page, () => page.evaluate(() => __mf.draw()));

  expect(mid).not.toBe(done);
  /* The shaft is a scanline per screen row plus 36 motes, so it cannot cost
     a handful of ops. */
  expect(midOps.length - doneOps.length).toBeGreaterThan(100);
});

/* ============================================================
   PHASE 17k -- THE CALLOUT FITS, AND ITS FADE IS HONEST
   ============================================================ */

/* Two crops of the bottom of the frame: the strip `view/hud.js#bottomLine`
   draws into, and a control strip immediately above it. Both stop short of
   the quickbar on the right and the KEYS toggle on the left, so only the
   callout and plain world are inside them. Device px, so they scale with
   whatever `core/canvas.js#resize` chose. */
const calloutCrops = page => page.evaluate(async () => {
  const { VIEW } = await import('/src/core/canvas.js');
  const c = document.getElementById('stage');
  const sc = c.height / VIEW.h;
  const x = Math.round(c.width * 0.25), w = Math.round(c.width * 0.5);
  return {
    strip:   { x, y: Math.round(c.height - 30 * sc), w, h: Math.round(28 * sc) },
    control: { x, y: Math.round(c.height - 62 * sc), w, h: Math.round(26 * sc) }
  };
});

/* Advance `run.tutorialBeat` to `want` and draw once. The draw is what makes
   `calloutFade` notice the beat changed, so it leaves the fade at 0 -- the
   first instant of `CALLOUT_FADE_SECS`, with `clock.t` not yet moved. */
const beatAtFadeZero = (page, want) => page.evaluate(async b => {
  const { write: rw, run } = await import('/src/model/run.js');
  while (run.tutorialBeat < b) rw.advanceBeat();
  (await import('/src/view/fx.js')).banner.fade = 0;
  __mf.draw();
}, want);

test('17k: a callout at the start of its fade draws nothing, bevel included', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);
  const { strip, control } = await calloutCrops(page);

  /* Beats 2 and 3 are the two widest rows in `data/callouts.js` and they are
     different widths, so a panel that leaked any pixel at fade 0 would leak
     a different number of them for each. `view/hud.js:1036` is the only
     reader of `beat(run)` in all of `view/`, so nothing else in the frame
     moves between these two draws. */
  await beatAtFadeZero(page, 2);
  const two = await canvasHash(page, strip);

  await beatAtFadeZero(page, 3);
  const three = await canvasHash(page, strip);

  /* THE ASSERTION THIS TEST EXISTS FOR. `panel()` used to draw its top bevel
     after putting `globalAlpha` back to 1, so a fading callout showed a
     fully opaque 1 px line over nothing. That line was the only callout
     pixel in six baselines, and it was the whole of the diff in
     `ore-against-pale-stone`. */
  expect(two).toBe(three);

  /* NOT VACUOUS. The same beat one full fade later must differ, and the
     control strip just above must not -- so the difference is the callout
     appearing and not `clock.t` moving something else nearby. */
  const controlBefore = await canvasHash(page, control);
  await page.evaluate(() => { __mf.clock.t += 0.4; __mf.draw(); });
  const lit = await canvasHash(page, strip);
  const controlAfter = await canvasHash(page, control);

  expect(lit).not.toBe(three);
  expect(controlAfter).toBe(controlBefore);

  expect(errors).toEqual([]);
});

/* ============================================================
   THE DEPTH TINT IS WORLD-ANCHORED
   (docs/AUDIT-seam-light.md section 2 and section 6 item 3)

   `view/scene.js#depthTint` gives every world row the tint its own band claims
   and ramps adjacent bands into each other across a short span centred on their
   seam. Two defects have lived here. One frame-wide alpha read off the camera
   centre stepped the whole screen 0.055 -> 0.440 the frame the centre crossed
   world-Y 768. An area-weighted mean over the visible bands removed that step
   and left a milder wrong behind, because the mean depended on what else was in
   frame and so the same rock changed brightness as the camera moved.

   THE ASSERTION IS CAMERA-INVARIANCE, not continuity of a scalar. Each world
   row is read from three camera alignments that put it at three different
   screen rows, and the three readings must be bit-identical. That is the
   property this design chose, and no frame-wide alpha can satisfy it.

   NUMBERS, NOT A SCREENSHOT. `view/scene.js#stats.tint` records the alpha per
   SCREEN row, written by the loop that issues the rects, so the whole 3,328-row
   world is readable in 17 draws per alignment rather than one baseline per
   camera position.

   THE STEP BOUND IS A LEGIBILITY BOUND, NOT A COPY OF THE SPAN. One row of the
   ramp must not move a composited pixel by more than 5 of 255 against `abyC`,
   which is about where a single row starts to read as a drawn line. Any ramp
   from 20 rows up satisfies it; a hard edge at the seam (0.385) does not.
   ============================================================ */

/* Alpha per world row over `[0, worldBottom)`, assembled from tiled camera
   positions. `phase` shifts every camera position, so a given world row lands
   at a different screen row in each profile -- which is what makes comparing
   two profiles a test of camera-invariance rather than of repeatability. */
const tintProfile = (page, buffer, phase) => page.evaluate(async ({ buffer, phase }) => {
  const { stats } = await import('/src/view/scene.js');
  const { VIEW } = await import('/src/core/canvas.js');
  const { bands } = await import('/src/model/world.js');
  __mf.resize(buffer, buffer);
  const H = VIEW.h;
  const last = bands[bands.length - 1];
  const bottom = last.origin.y + last.th * last.tile;
  const out = Array.from({ length: bottom }, () => -1);
  let draws = 0;
  for (let cy = -phase; cy < bottom; cy += H) {
    __mf.cam.y = cy;
    __mf.draw();
    draws++;
    for (let i = 0; i < H; i++) {
      const wy = cy + i;
      if (wy >= 0 && wy < bottom) out[wy] = stats.tint[i];
    }
  }
  return { out, H, bottom, draws };
}, { buffer, phase });

test('17l: the depth tint is world-anchored, and a seam ramps rather than steps', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  /* The 200 px floor and the 400 px desktop buffer. Astral is 320 px tall, so
     it fits inside the first and never inside the second -- which is exactly
     the case the area-weighted mean got wrong, and the reason both are here. */
  for (const buffer of [400, 800]) {
    const a = await tintProfile(page, buffer, 0);
    const b = await tintProfile(page, buffer, 37);
    const c = await tintProfile(page, buffer, 113);
    expect(a.H).toBe(buffer / 2);
    expect(a.bottom).toBe(3328);

    /* CAMERA-INVARIANCE. Bit-identical, not close: the alpha is a function of
       the world row, so three different screen placements of that row compute
       the same double. */
    let worstInv = 0, atInv = -1;
    for (let wy = 0; wy < a.bottom; wy++) {
      const d = Math.max(Math.abs(b.out[wy] - a.out[wy]), Math.abs(c.out[wy] - a.out[wy]));
      if (d > worstInv) { worstInv = d; atInv = wy; }
    }
    expect(worstInv, `H=${a.H}: worst camera-dependence ${worstInv} at world row ${atInv}`).toBe(0);

    /* NO ROW WAS MISSED. -1 is the fill the profile starts at. */
    expect(a.out.indexOf(-1)).toBe(-1);

    /* NO HARD EDGE ANYWHERE IN THE WORLD. */
    let worstStep = 0, atStep = -1;
    for (let wy = 1; wy < a.bottom; wy++) {
      const d = Math.abs(a.out[wy] - a.out[wy - 1]);
      if (d > worstStep) { worstStep = d; atStep = wy; }
    }
    expect(worstStep, `H=${a.H}: worst row step ${worstStep} at world row ${atStep}`)
      .toBeLessThanOrEqual(5 / 255);

    /* EXACT INTERIORS, AT BOTH BUFFERS. No neighbour bleeds in, which is what
       the area-weighted mean did: at the 400 px buffer it put astral's interior
       at 0.011 and surface's at anything from 0.048 to 0.228. */
    expect(a.out[100]).toBe(0);
    expect(a.out[500]).toBeCloseTo(0.055, 10);
    expect(a.out[2000]).toBeCloseTo(0.44, 10);

    /* THE RAMP IS REAL. At each seam, count the rows strictly between the two
       interior values it joins. A full tile's worth at least, so the ramp
       cannot degenerate into a two-row dither and still pass the step bound. */
    for (const [seam, lo, hi] of [[320, 0, 0.055], [768, 0.055, 0.44]]) {
      let n = 0;
      for (let wy = seam - 40; wy <= seam + 40; wy++)
        if (a.out[wy] > lo + 1e-9 && a.out[wy] < hi - 1e-9) n++;
      expect(n, `H=${a.H}: ramp rows at world-Y ${seam}`).toBeGreaterThanOrEqual(8);
    }

    /* NOT VACUOUS. The three interiors must be three different numbers, or
       every assertion above is measuring one constant. */
    expect(new Set([a.out[100], a.out[500], a.out[2000]]).size).toBe(3);
  }

  expect(errors).toEqual([]);
});

/* ============================================================
   THE MAIN MENU AND THE SHORTCUTS PAGE (Phase 6l)

   6o owns every input path, so nothing in the game can open the menu yet.
   These drive `shell/ui.js`'s own accessors through a dynamic import of the
   live module -- the same idiom `putInQuickbar` above uses for
   `model/run.js#write` -- and never through a screen coordinate.
   ============================================================ */

/* Open the menu on a page, in a stated state, and draw one frame. `index` and
   `scroll` go through the real clamping accessors rather than being written
   onto the object, so a test cannot park the cursor somewhere the game could
   not put it. */
const showMenu = (page, opts = {}) => page.evaluate(async o => {
  const u = await import('/src/shell/ui.js');
  u.openMenu(o.page ?? 'root');
  u.setMenuSeed(o.seed ?? '');
  u.setMenuSave(!!o.hasSave);
  u.setMenuStale(!!o.stale);
  u.setMenuInRun(!!o.inRun);
  u.setMenuConfirm(o.confirm ?? null);
  u.setMenuNotice(o.notice ?? null);
  if (o.index) u.menuFocus(o.index, 99);
  if (o.scroll) u.menuScrollTo(o.scroll, 99);
  __mf.draw();
}, opts);

/* WHAT THE MENU ACTUALLY DREW, out of `view/ui/state.js#drawn` rather than out
   of `__mf.ui` -- that projection is `shell/main.js`'s and 6o owns the line
   that adds `menu` to it. Plain values only, so it survives the structured
   clone. */
const menuDrawn = page => page.evaluate(async () => {
  const { drawn } = await import('/src/view/ui/state.js');
  return drawn.menu && JSON.parse(JSON.stringify(drawn.menu));
});

/* `core/canvas.js#resize` takes WINDOW pixels and derives the buffer from
   them, so a test that wants to assert "inside the buffer" has to read the
   buffer back rather than assume its own argument. 1280x800 is the one
   Playwright project's viewport (buffer 640x400) and 200x180 is the floor. */
const atWindow = (page, iw, ih) => page.evaluate(([iw, ih]) => {
  __mf.resize(iw, ih);
  __mf.draw();
  const c = document.getElementById('stage');
  return { w: c.width, h: c.height };
}, [iw, ih]);

const keymapIds = page => page.evaluate(async () => {
  const { KEYMAP } = await import('/src/shell/ui.js');
  return KEYMAP.flatMap(g => g.rows.map(r => r.id));
});

test('6l: the main menu, the shortcuts page, settings and the debug page', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  /* NO SAVE: CONTINUE states why it is dead rather than vanishing. */
  await showMenu(page, { hasSave: false });
  await shot(page, 'menu-root.png');

  await showMenu(page, { hasSave: true, seed: '1337', index: 2 });
  await shot(page, 'menu-root-continue.png');

  /* A REFUSED SAVE IS NOT THE SAME EVENT AS NO SAVE (docs/SPEC.md 27.7), so
     the reason is on screen, verbatim and wrapped. */
  await showMenu(page, { hasSave: false, notice: 'CORRUPT SAVE: bands[0].edits', index: 2 });
  await shot(page, 'menu-root-refused.png');

  /* MID-RUN (docs/SPEC.md 30.6): RESUME is the first row, and NEW RUN --
     taken once and awaiting a second press -- says CONFIRM? rather than
     silently arming. */
  await showMenu(page, { hasSave: true, inRun: true, index: 1, confirm: 'new' });
  await shot(page, 'menu-root-inrun.png');

  /* A HEADER FROM ANOTHER BUILD IS NOT AN EMPTY SLOT (docs/SPEC.md 27.3). */
  await showMenu(page, { hasSave: false, stale: true, index: 2 });
  await shot(page, 'menu-root-stale.png');

  await showMenu(page, { page: 'controls' });
  await shot(page, 'menu-controls.png');

  await showMenu(page, { page: 'settings', index: 4 });
  await shot(page, 'menu-settings.png');

  await showMenu(page, { page: 'debug', index: 1 });
  await shot(page, 'menu-debug.png');

  expect(errors).toEqual([]);
});

test('6l: the menu at the 200 px buffer floor', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);
  await narrowFloor(page);

  await showMenu(page, { hasSave: true, seed: '1337' });
  await shot(page, 'menu-root-floor.png');

  /* PAGE 1 OF THE PAGED TABLE. The floor affords one column and about 18
     lines against 46, so the shortcuts page pages rather than clipping -- D8's
     whole argument, and the next test proves every page's content is reachable
     rather than trusting this picture. */
  await showMenu(page, { page: 'controls' });
  await shot(page, 'menu-controls-floor.png');

  await showMenu(page, { page: 'debug', index: 4 });
  await shot(page, 'menu-debug-floor.png');

  expect(errors).toEqual([]);
});

/* ---- MEASUREMENTS, NOT PICTURES ----
   A baseline proves the pixels have not changed. It cannot prove a row is
   reachable, and `CLAUDE.md` records two tests that photographed a scene with
   the feature accidentally off and passed. */

test('6l: every menu row lies inside the buffer, at the floor and at the desktop size', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  /* EVERY ROW, not merely a non-empty list: the draw loop stops at the panel's
     bottom edge rather than clipping, so a page that ran out of height would
     record fewer rows and still photograph tidily. The DEBUG count comes off
     the content table so a sixth scenario fails here rather than going
     unreachable. `docs/SPEC.md` §30.1 owns the other three. */
  const EXPECT_ROWS = await page.evaluate(async () => {
    const { SCENARIOS } = await import('/src/data/scenarios.js');
    return { root: 6, controls: 1, settings: 7, debug: SCENARIOS.length + 1 };
  });

  for (const [iw, ih] of [[1280, 800], [200, 180]]) {
    const { w, h } = await atWindow(page, iw, ih);
    for (const name of ['root', 'controls', 'settings', 'debug']) {
      await showMenu(page, { page: name, hasSave: true, notice: 'WORLD MOVED' });
      const rec = await menuDrawn(page);
      expect(rec, `${name} at ${w}x${h}`).not.toBe(null);
      expect(rec.page).toBe(name);
      expect(rec.rows.length, `${name} at ${w}x${h}: rows drawn`).toBe(EXPECT_ROWS[name]);
      const ids = new Set();
      for (const r of rec.rows) {
        const where = `${name} at ${w}x${h}: row ${r.id}`;
        expect(r.x, where).toBeGreaterThanOrEqual(0);
        expect(r.y, where).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, where).toBeLessThanOrEqual(w);
        expect(r.y + r.h, where).toBeLessThanOrEqual(h);
        /* At least one whole glyph cell, or the row is drawn but unreadable. */
        expect(r.h, where).toBeGreaterThanOrEqual(7);
        expect(ids.has(r.id), `${where}: duplicate id`).toBe(false);
        ids.add(r.id);
      }
      /* EXACTLY ONE FOCUSED ROW, always -- a cursor that lands nowhere cannot
         be driven by a keyboard. */
      expect(rec.rows.filter(r => r.focused).length, `${name} at ${w}x${h}`).toBe(1);
      /* BACK exists on every page but the root, and never on the root. */
      expect(ids.has('back'), `${name} at ${w}x${h}: BACK`).toBe(name !== 'root');
    }
  }

  expect(errors).toEqual([]);
});

test('6z: the mid-run root page adds RESUME first, and a destructive row confirms', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  for (const [iw, ih] of [[1280, 800], [200, 180]]) {
    const { w, h } = await atWindow(page, iw, ih);
    /* THE ROW THE CURSOR STARTS ON MUST CHANGE NOTHING (docs/SPEC.md 30.6).
       Index 0 and `resume` first is the whole protection against a reflex
       ENTER on a menu opened mid-run. */
    await showMenu(page, { hasSave: true, inRun: true });
    let rec = await menuDrawn(page);
    expect(rec.rows.map(r => r.id), `${w}x${h}`)
      .toEqual(['resume', 'new', 'seed', 'continue', 'controls', 'settings', 'debug']);
    expect(rec.rows.filter(r => r.focused).map(r => r.id), `${w}x${h}`).toEqual(['resume']);
    for (const r of rec.rows) {
      const where = `${w}x${h}: row ${r.id}`;
      expect(r.x, where).toBeGreaterThanOrEqual(0);
      expect(r.y, where).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, where).toBeLessThanOrEqual(w);
      expect(r.y + r.h, where).toBeLessThanOrEqual(h);
      expect(r.h, where).toBeGreaterThanOrEqual(7);
    }

    /* AND THE CONFIRMATION IS A LABEL, NOT A LIVENESS CHANGE: an armed row
       must still be dispatchable or the second press does nothing. */
    await showMenu(page, { hasSave: true, inRun: true, index: 1, confirm: 'new' });
    rec = await menuDrawn(page);
    expect(rec.rows.length, `${w}x${h}`).toBe(7);
    expect(rec.rows.find(r => r.id === 'new').live, `${w}x${h}`).toBe(true);

    /* WITH NO RUN BEHIND IT THE BOOT PAGE IS UNCHANGED, which is why the
       committed `menu-root` baselines did not move. */
    await showMenu(page, { hasSave: true });
    expect((await menuDrawn(page)).rows.map(r => r.id), `${w}x${h}`)
      .toEqual(['new', 'seed', 'continue', 'controls', 'settings', 'debug']);
  }

  expect(errors).toEqual([]);
});

test('6z: Escape escalates -- a panel, then a selection, then the menu', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  const state = () => page.evaluate(async () => {
    const { ui, top } = await import('/src/shell/ui.js');
    return { menu: ui.menu.open, top: top(), armed: !!ui.armedPlace };
  });

  /* A PANEL CLAIMS THE PRESS. `openMenu` is never called here: the real
     keydown handler is what decides, and it is the only thing that can prove
     the menu does not steal a close. */
  await page.evaluate(async () => {
    const { open } = await import('/src/shell/ui.js');
    open('main');
  });
  await page.keyboard.press('Escape');
  expect(await state()).toEqual({ menu: false, top: null, armed: false });

  /* AN ARMED PAIR CLAIMS THE NEXT ONE. */
  await page.evaluate(async () => {
    const { armPlace } = await import('/src/shell/ui.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    armPlace(S.timber, F.rung);
  });
  await page.keyboard.press('Escape');
  expect(await state()).toEqual({ menu: false, top: null, armed: false });

  /* AND WITH NOTHING STANDING, THE MENU OPENS -- straight out of the key
     handler, so no frame has to run first. */
  await page.keyboard.press('Escape');
  expect((await state()).menu).toBe(true);

  /* Escape inside the menu is BACK, THEN PLAY (docs/SPEC.md 30.5), so the two
     are a toggle once nothing else is open. */
  await page.evaluate(() => __mf.draw());
  await page.keyboard.press('Escape');
  expect((await state()).menu).toBe(false);

  /* THE MAP CLAIMS IT TOO, and leaving the mode is all one press does. */
  await page.evaluate(() => { __mf.flags.showMap = true; __mf.draw(); });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => __mf.flags.showMap)).toBe(false);
  expect((await state()).menu).toBe(false);

  expect(errors).toEqual([]);
});

test('6l: every keymap binding is drawn on the shortcuts page, at both sizes', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);
  const declared = await keymapIds(page);
  expect(declared.length).toBeGreaterThan(20);
  expect(new Set(declared).size, 'KEYMAP ids are unique').toBe(declared.length);

  for (const [iw, ih] of [[1280, 800], [200, 180]]) {
    const { w, h } = await atWindow(page, iw, ih);
    await showMenu(page, { page: 'controls' });
    const first = await menuDrawn(page);
    const seen = [];
    for (let p = 0; p < first.pages; p++) {
      await showMenu(page, { page: 'controls', scroll: p });
      const rec = await menuDrawn(page);
      expect(rec.scroll, `${w}x${h}: page ${p} was clamped away`).toBe(p);
      for (const k of rec.keys) {
        seen.push(k.id);
        const where = `${w}x${h} page ${p}: binding ${k.id}`;
        expect(k.x, where).toBeGreaterThanOrEqual(0);
        expect(k.y, where).toBeGreaterThanOrEqual(0);
        expect(k.x + k.w, where).toBeLessThanOrEqual(w);
        expect(k.y + k.h, where).toBeLessThanOrEqual(h);
        expect(k.label.length, where).toBeGreaterThan(0);
      }
    }
    /* EVERY BINDING, ONCE. A group dropped by the column arithmetic or paged
       off the bottom fails here and photographs as a tidy page. */
    expect(seen.slice().sort(), `${w}x${h}: ${first.pages} page(s)`).toEqual(declared.slice().sort());
  }

  /* THE FLOOR REALLY DOES PAGE, or the loop above proved nothing about
     paging. */
  await atWindow(page, 200, 180);
  await showMenu(page, { page: 'controls' });
  expect((await menuDrawn(page)).pages).toBeGreaterThan(1);
  await atWindow(page, 1280, 800);
  await showMenu(page, { page: 'controls' });
  expect((await menuDrawn(page)).pages).toBe(1);

  expect(errors).toEqual([]);
});

test('6l: the menu is not vacuous -- it replaces the HUD and the pixels differ with it closed', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  await showMenu(page, { hasSave: true });
  const open = await page.locator('#stage').screenshot();
  const withMenu = await menuDrawn(page);
  expect(withMenu).not.toBe(null);

  await page.evaluate(async () => {
    const u = await import('/src/shell/ui.js');
    u.closeMenu();
    __mf.draw();
  });
  const closed = await page.locator('#stage').screenshot();
  expect(await menuDrawn(page)).toBe(null);
  expect(Buffer.compare(open, closed), 'the menu changed no pixels').not.toBe(0);

  /* AND IT STANDS INSTEAD OF THE HUD, not over it: the quickbar strip the HUD
     records every frame is absent while the menu is up. */
  const stripWhileOpen = await page.evaluate(async () => {
    const u = await import('/src/shell/ui.js');
    u.openMenu('root');
    __mf.draw();
    return __mf.ui.grids.some(gr => gr.id === 'quickbar');
  });
  expect(stripWhileOpen).toBe(false);

  expect(errors).toEqual([]);
});

/* ============================================================
   WAVE 6 VIEW CLOSEOUT (6m, 6n, 6w, 6x)

   Four HUD readouts, and three of them are numbers or text rather than
   pictures. A baseline of a three-glyph depth gauge proves almost nothing, so
   each test below reads back what was actually drawn -- the tooltip's own
   lines, the glyph mask the gauge printed, the pixels a mark changed -- and
   the screenshots are there to catch a later change of shape.
   ============================================================ */

/* A copper tile with a known amount of work on it, hovered. `write.setByte`
   clears the work ledger whenever the byte changes (docs/SPEC.md section
   19.6), so the tile is written FIRST and the work added after; doing it the
   other way round silently measures a fresh tile. */
async function hoverDeposit(page, { subKey, work }) {
  return page.evaluate(async ({ subKey, work }) => {
    const { S } = await import('/src/data/substances.js');
    const { packTile } = await import('/src/data/forms.js');
    const { write: tw, baseHardAt, baseChargeAt } = await import('/src/model/tiles.js');
    const { write: mw, workAt } = await import('/src/model/mining.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { banner } = await import('/src/view/fx.js');

    const band = bandOf('topsoil');
    const tx = 60, ty = 40;
    tw.setByte(band, tx, ty, packTile(S[subKey]));
    __mf.revealAll(band);
    const hard = baseHardAt(band, tx, ty);
    if (work > 0) mw.add(band, tx, ty, hard * work);

    /* `drawHUD` draws the title card INSTEAD of the tooltip while the banner
       is up; `settle()` advances `clock.t` but not `stepFx`. */
    banner.fade = 0;
    __mf.cmd.hasMouse = true;
    __mf.cam.x = worldX(band, tx) - 40;
    __mf.cam.y = worldY(band, ty) - 40;
    __mf.mouseAt(44, 44);
    __mf.draw();
    return { hard, charge: baseChargeAt(band, tx, ty), work: workAt(band, tx, ty), lines: __mf.hover.lines };
  }, { subKey, work });
}

test('6m: a deposit tile says how many units are left, and a charge-1 tile says nothing', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  /* 2.2 units of work on a charge-4 tile: two units are out of the ground and
     the third is 20% cut, so two remain to come. Floored with no epsilon, the
     same way `view/scene.js` counts the notches beside this text. */
  const part = await hoverDeposit(page, { subKey: 'copper', work: 2.2 });
  expect(part.charge).toBe(4);
  expect(part.work).toBeCloseTo(part.hard * 2.2, 6);
  expect(part.lines).toEqual(['COPPER', 'MASS 1.0', 'HARD 0.95S', 'UNITS 2 / 4']);

  /* Untouched, the same tile is the full vein. */
  const fresh = await hoverDeposit(page, { subKey: 'tin', work: 0 });
  expect(fresh.charge).toBe(4);
  expect(fresh.lines).toContain('UNITS 4 / 4');

  /* ONE UNIT SHORT OF GONE, never "0 / 4": the last unit is the break itself,
     so a tile that still exists still holds one. */
  const nearly = await hoverDeposit(page, { subKey: 'copper', work: 3.9 });
  expect(nearly.lines).toContain('UNITS 1 / 4');

  /* And a charge-1 tile gains no line at all -- "1 / 1" on every rock in the
     world is noise, not information. */
  const stone = await hoverDeposit(page, { subKey: 'stone', work: 0.5 });
  expect(stone.charge).toBe(1);
  expect(stone.lines.some(l => l.startsWith('UNITS'))).toBe(false);

  await hoverDeposit(page, { subKey: 'copper', work: 2.2 });
  await shot(page, 'deposit-units-left.png');

  /* AND RESOLVING THE LINE WRITES NOTHING (invariant 9). `npm run check`'s
     epoch probe renders with no pointer, so `resolveHover` returns before it
     reaches a tile there and this read path goes unexercised. */
  const wrote = await page.evaluate(async () => {
    const { epoch } = await import('/src/model/epoch.js');
    const before = epoch.n;
    __mf.draw();
    __mf.draw();
    return epoch.n - before;
  });
  expect(wrote).toBe(0);

  expect(errors).toEqual([]);
});

/* Marks laid along the ground the player is standing on, running rightward:
   the first three inside `eff('reach')` (25.6 px, centre to centre) and the
   rest beyond it, with the nearest committed. Returns each mark's own state
   and the screen rect it drew into. */
const markScene = page => page.evaluate(async () => {
  const { write: dq, committedWithin, queued } = await import('/src/model/digqueue.js');
  const { eff } = await import('/src/model/mods.js');
  const { playerCentre, player } = await import('/src/model/player.js');
  const { tileX, tileY, worldX, worldY } = await import('/src/model/world.js');
  const { banner } = await import('/src/view/fx.js');

  const band = player.band;
  const reach = eff('reach');
  const ptx = tileX(band, player.x + 3), gy = tileY(band, player.y + 16);
  for (const x of [ptx, ptx + 1, ptx + 2, ptx + 4, ptx + 6, ptx + 8, ptx + 10]) dq.mark(band, x, gy);
  dq.commit(band, ptx, gy);

  const c = playerCentre();
  const target = committedWithin(c.x, c.y, reach);
  banner.fade = 0;
  __mf.cmd.hasMouse = false;
  __mf.draw();

  const marks = [];
  for (const m of queued().values()) {
    const half = m.band.tile / 2;
    const dx = worldX(m.band, m.tx) + half - c.x, dy = worldY(m.band, m.ty) + half - c.y;
    marks.push({
      tx: m.tx,
      state: target && target.tx === m.tx && target.ty === m.ty ? 'worked'
        : dx * dx + dy * dy <= reach * reach ? 'reach' : 'deferred',
      x: worldX(m.band, m.tx) - __mf.cam.x, y: worldY(m.band, m.ty) - __mf.cam.y, t: m.band.tile
    });
  }
  return { reach, marks };
});

/* The tile, PLUS the row under it: the shadow every mark is drawn over lands
   on the mark's own last row, and nothing but a second read can prove it does
   not spill into the neighbour (docs/SPEC.md 28.7). */
const markTiles = (page, marks) => page.evaluate(ms => {
  const g = document.getElementById('stage').getContext('2d');
  return ms.map(m => [...g.getImageData(m.x, m.y, m.t, m.t + 1).data]);
}, marks);

test('6n: the dig queue draws three distinct states, and none of them is the bare tile', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);
  await page.evaluate(() => __mf.frames(240));        // onto the spawn shelf

  const scene = await markScene(page);
  expect(scene.marks.filter(m => m.state === 'worked')).toHaveLength(1);
  expect(scene.marks.filter(m => m.state === 'reach')).toHaveLength(2);
  expect(scene.marks.filter(m => m.state === 'deferred')).toHaveLength(4);
  await shot(page, 'dig-marks.png');

  /* NOT VACUOUS, AND THE THREE STATES MEASURED RATHER THAN PHOTOGRAPHED. The
     same seven tiles are read twice, once with the queue up and once with it
     cleared, so what is counted is the mark and never the rock under it. */
  const withMarks = await markTiles(page, scene.marks);
  await page.evaluate(async () => {
    const { write: dq } = await import('/src/model/digqueue.js');
    dq.clearAll();
    __mf.draw();
  });
  const bare = await markTiles(page, scene.marks);

  const count = scene.marks.map((m, i) => {
    let n = 0, spill = 0;
    for (let p = 0; p < m.t * (m.t + 1); p++) {
      const o = p * 4;
      if (withMarks[i][o] === bare[i][o] && withMarks[i][o + 1] === bare[i][o + 1]) continue;
      if (p < m.t * m.t) n++; else spill++;
    }
    return { state: m.state, n, spill };
  });

  /* The X inside its frame, the X alone, and two pixels of each of the X's
     four ends -- each over a shadow of itself one row lower, which is what
     makes the sparse states read on lit grass at all (docs/SPEC.md 28.7). 48,
     22 and 16 opaque pixels on an 8 px tile. Exact rather than "greater
     than", because the whole feature is that the three do not look alike. */
  for (const c of count) {
    expect(c.n, `${c.state} mark`).toBe(c.state === 'worked' ? 48 : c.state === 'reach' ? 22 : 16);
    /* AND THE SHADOW STAYS INSIDE ITS OWN TILE. The lowest shadow pixel falls
       on the tile's last row, so a mark cannot dirty its neighbour below. */
    expect(c.spill, `${c.state} mark bled into the tile below`).toBe(0);
  }

  /* AND DRAWING THEM WRITES NOTHING. `npm run check`'s epoch probe renders a
     scene with an EMPTY queue, so `digMarks` returns before it touches
     anything there and invariant 9 goes unexercised for this pass. A mark is
     skipped when stale rather than pruned (docs/SPEC.md section 28.2), which
     is the line that would break it. */
  const wrote = await page.evaluate(async () => {
    const { epoch } = await import('/src/model/epoch.js');
    const { write: dq } = await import('/src/model/digqueue.js');
    const { player } = await import('/src/model/player.js');
    const { tileX, tileY } = await import('/src/model/world.js');
    const band = player.band;
    const ptx = tileX(band, player.x + 3), gy = tileY(band, player.y + 16);
    for (const x of [ptx, ptx + 1, ptx + 6]) dq.mark(band, x, gy);
    dq.commit(band, ptx, gy);
    const before = epoch.n;
    __mf.draw();
    __mf.draw();
    return epoch.n - before;
  });
  expect(wrote).toBe(0);

  expect(errors).toEqual([]);
});

/* THE GAUGE'S OWN GLYPHS, READ BACK. `depth()` draws `s` at
   `(W - textWidth(s) - 10, 6)` in `uiDim` at or above the datum, with no
   shadow (it sits inside a panel), so every glyph pixel is that colour
   exactly. Rendering the expected string with the same `drawText` and
   comparing the two masks is what makes this an assertion about the TEXT
   rather than about a rectangle of pixels. */
const gaugeReads = (page, expected) => page.evaluate(async (expected) => {
  const { drawText, textWidth } = await import('/src/core/font.js');
  const { colour } = await import('/src/data/palette.js');
  const dim = colour('uiDim');
  const [r, g0, b] = [1, 3, 5].map(i => parseInt(dim.slice(i, i + 2), 16));

  const stage = document.getElementById('stage');
  const w = textWidth(expected), x0 = stage.width - w - 10, y0 = 6;

  const ref = document.createElement('canvas');
  ref.width = w; ref.height = 7;
  drawText(ref.getContext('2d'), expected, 0, 0, dim, 1, 1);

  const mask = data => {
    const on = [];
    for (let i = 0; i < data.length; i += 4)
      if (data[i] === r && data[i + 1] === g0 && data[i + 2] === b) on.push(i / 4);
    return on.join(',');
  };
  return {
    drew: mask(stage.getContext('2d').getImageData(x0, y0, w, 7).data),
    want: mask(ref.getContext('2d').getImageData(0, 0, w, 7).data)
  };
}, expected);

test('6w: the depth gauge measures the feet, so the spawn floor reads 0M', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  const at = await page.evaluate(async () => {
    const { PH, player } = await import('/src/model/player.js');
    const { bandOf, worldY } = await import('/src/model/world.js');
    const { SPAWN_BAND } = await import('/src/data/world.js');
    const { banner } = await import('/src/view/fx.js');
    banner.fade = 0;
    __mf.frames(240);                                 // settle onto the shelf
    __mf.draw();
    const ref = bandOf(SPAWN_BAND);
    return {
      standing: player.onGround,
      feet: player.y + PH, datum: worldY(ref, ref.cfg.floorTy), tile: ref.tile
    };
  });

  /* The player's FEET are on the datum row, which is the whole claim: the
     gauge used to measure `player.y`, the top of a 16 px body, and read +2M
     standing here (docs/PLAYTEST.md B4). */
  expect(at.standing).toBe(true);
  expect(at.feet).toBeCloseTo(at.datum + 0.8, 1);

  const zero = await gaugeReads(page, '0M');
  expect(zero.drew).toBe(zero.want);

  /* AND IT IS NOT STUCK AT ZERO. Eight tiles down the same column reads 8M,
     in the primary ink rather than the state tone, so this second read is
     against `ui` and not `uiDim` -- which is itself the assertion that the
     datum sign still drives the colour. */
  const deep = await page.evaluate(async () => {
    const { PH, player, write: pw } = await import('/src/model/player.js');
    const { drawText, textWidth } = await import('/src/core/font.js');
    const { colour } = await import('/src/data/palette.js');
    pw.move(player.x, player.y + 8 * player.band.tile);
    __mf.draw();

    const ink = colour('ui');
    const [r, g0, b] = [1, 3, 5].map(i => parseInt(ink.slice(i, i + 2), 16));
    const stage = document.getElementById('stage');
    const w = textWidth('8M'), x0 = stage.width - w - 10;
    const ref = document.createElement('canvas');
    ref.width = w; ref.height = 7;
    drawText(ref.getContext('2d'), '8M', 0, 0, ink, 1, 1);
    const mask = data => {
      const on = [];
      for (let i = 0; i < data.length; i += 4)
        if (data[i] === r && data[i + 1] === g0 && data[i + 2] === b) on.push(i / 4);
      return on.join(',');
    };
    return {
      feet: player.y + PH,
      drew: mask(stage.getContext('2d').getImageData(x0, 6, w, 7).data),
      want: mask(ref.getContext('2d').getImageData(0, 0, w, 7).data)
    };
  });
  expect(deep.drew).toBe(deep.want);

  expect(errors).toEqual([]);
});

test('6x: the First Trial announces both its rewards, in the order they were granted', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  /* THE FRAME THE FIRST TRIAL ACTUALLY PRODUCES. `rules/cycles.js#complete`
     pushes the `cycle` row and queues the reward; `rules/grants.js#step` then
     awards the furnace and the cloud dock in the SAME substep, and
     `shell/notify.js` drains all three together. The award queue is driven
     through `model/run.js#write.award`, which is the real path -- not a hand
     -written pair of toasts. */
  const paid = await page.evaluate(async () => {
    const { run, write: rw } = await import('/src/model/run.js');
    const { push } = await import('/src/model/journal.js');
    const { banner, toasts } = await import('/src/view/fx.js');
    push('cycle', null, { cycleId: run.tribute?.cycleId, god: 'hephaestus', reward: {} });
    rw.award(['furnace', 'cloud_dock']);
    __mf.frames(1);
    __mf.draw();
    return { banner: { ...banner }, queue: toasts.map(t => t.text), front: toasts[0].text };
  });

  /* Both facts are held, and the furnace -- the whole reward of docs/SPEC.md
     section 4 -- is the one on screen. Before the queue it was overwritten
     inside its own frame and never appeared (docs/PLAYTEST.md B3). */
  expect(paid.queue).toEqual(['CRUDE FURNACE IS GRANTED', 'THE CLOUD DOCK IS GRANTED']);
  expect(paid.front).toBe('CRUDE FURNACE IS GRANTED');
  /* And the god's own line is the banner beside it, not a third thing
     competing for the same slot. */
  expect(paid.banner.text).toBe('HEPHAESTUS');
  expect(paid.banner.sub).toBe('IS SATISFIED');
  await shot(page, 'cycle1-reward-announced.png');

  /* THE SECOND LINE ARRIVES, and within the handoff rather than 3.2 s later:
     anything waiting cuts the row on screen to one glance. */
  const next = await page.evaluate(async () => {
    const { toasts } = await import('/src/view/fx.js');
    __mf.frames(126);                                 // 1.05 s, just past the handoff
    __mf.draw();
    return { queue: toasts.map(t => t.text) };
  });
  expect(next.queue).toEqual(['THE CLOUD DOCK IS GRANTED']);

  /* A REPEAT REFRESHES RATHER THAN STACKING. Eleven hand-feeds push eleven
     identical rows and the bottom line must not become a backlog of them. */
  const repeats = await page.evaluate(async () => {
    const { toast, toasts } = await import('/src/view/fx.js');
    toasts.length = 0;
    for (let i = 0; i < 11; i++) toast('1 COPPER ORE TITHED');
    return toasts.map(t => t.text);
  });
  expect(repeats).toEqual(['1 COPPER ORE TITHED']);

  /* AND THE QUEUE IS BOUNDED, dropping the row that has already had its
     glance rather than the newest fact. */
  const capped = await page.evaluate(async () => {
    const { toast, toasts } = await import('/src/view/fx.js');
    toasts.length = 0;
    for (const t of ['A', 'B', 'C', 'D']) toast(t);
    return toasts.map(t => t.text);
  });
  expect(capped).toEqual(['B', 'C', 'D']);

  expect(errors).toEqual([]);
});
