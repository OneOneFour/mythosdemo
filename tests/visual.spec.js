import { expect, test } from '@playwright/test';

/* Visual regression, plus the behaviour checks that need a real browser. A
   passing screenshot means the pixels have not changed, not that they are
   right; these baselines are unreviewed. */

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

/* Past the altar's arrival. Releasing cycle 1's altar gives it a rise and a
   shaft of light for `altarRiseSecs`, 1.6 s = 192 substeps at the fixed
   1/120 s step; 241 is that plus the placing frame and room over. */
const ARRIVAL_SUBSTEPS = 241;
const pastArrival = page => page.evaluate(n => __mf.frames(n), ARRIVAL_SUBSTEPS);

/* Puts a pair in a specific quickbar cell. The quickbar is `run.inv`'s tail,
   so this collects and then moves through the same `write.moveSlot` a drag
   drives; the source index is read back because the landing slot varies. */
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

/* Same, aimed at the main grid: a pickup fills the quickbar's cells first, so
   a test whose subject is the Character tab's grid has to move the pair in. */
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

/* Moves a pair already held -- just crafted, say -- into a quickbar slot,
   without collecting a second one on top of it. */
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


/* Records the canvas op stream: patches the 2D context prototype in the page,
   tags every surface (the stage and each offscreen chunk canvas, in creation
   order), and logs every mutating call and style write as a string. */
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
  /* A gradient's tag is its creation order within the recording, so the
     counter restarts with the log. */
  await page.evaluate(() => { __ops.log.length = 0; __ops.grads = 0; __ops.on = true; });
  await body();
  return page.evaluate(() => { __ops.on = false; return __ops.log.slice(); });
}

/* The first differing op with a little context each side, or null when the
   two streams are identical. */
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
  /* `collect` held alongside `right` sweeps up the boot-placed stock pickaxe
     the walk passes over. */
  await page.evaluate(() => __mf.hold({ right: 1, collect: 1 }, 240));
  await shot(page, 'surface-walk.png');
});

test('digging down into topsoil', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(() => {
    /* Walk over the boot-placed stock pickaxe first, or `hasPick` is false and
       digging is a no-op. `right` is held rather than edge-triggered, so it
       must be released or the player drifts and no tile ever breaks. */
    __mf.hold({ right: 1, collect: 1 }, 90);
    __mf.cmd.right = false;
    __mf.hold({ dig: 1, down: 1, collect: 1 }, 900);
    __mf.frames(120);
  });
  await shot(page, 'digging.png');
});

/* Steps one substep at a time so every tile that breaks is observed, with the
   stock pickaxe and no crafted tool. */
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
    /* Auto-collect set rather than toggled, so the collect gate is not part of
       what this measures -- the subject is what falls. */
    const { setAutoCollect } = await import('/src/shell/ui.js');
    setAutoCollect(true);
    /* Soil's `dropChance` forced to 1 so every break yields, keeping the
       yield-quality roll out of a drift/depth/drop-identity measurement. */
    const { write: modsw } = await import('/src/model/mods.js');
    modsw.add('test-full-yield', [{ key: 'dropChance.soil', mul: 20 }]);   // 0.05 x 20 = 1.0

    const band = bandOf('topsoil');
    const tx = 40, ty = 100, DEPTH = 8;
    for (let dy = -2; dy <= DEPTH + 1; dy++)
      for (let dx = -1; dx <= 1; dx++) tw.clear(band, tx + dx, ty + dy);
    for (let i = 0; i < DEPTH; i++) tw.set(band, tx, ty + i, S.soil);
    tw.set(band, tx, ty + DEPTH, S.stone);                             // hard floor, past TARGET_BREAKS

    rw.collect(S.pick, F.relic, 1);      // the stock pickaxe, granted directly
    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty) - PH);   // tile-aligned x; feet flush on the shaft's top tile

    __mf.cmd.hasMouse = false;
    __mf.cmd.down = true;
    __mf.cmd.dig = true;
    __mf.frames(1);                        // resolves `aim` to the tile directly below

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

    /* Lets the drops land and clear the pickup-magnet delay before the
       pockets can reflect them. */
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

  // `run.deepest`, the HUD's own datum, never goes backwards between breaks
  let prevDeepest = result.startDeepest;
  for (const b of result.broken) {
    expect(b.deepest).toBeGreaterThanOrEqual(prevDeepest);
    prevDeepest = b.deepest;
  }

  // depth gained stays near one tile per break, not a fall-through jump
  const totalDepth = result.broken[result.broken.length - 1].deepest - result.startDeepest;
  expect(totalDepth).toBeGreaterThan(0);
  expect(totalDepth).toBeLessThan(result.tile * (result.broken.length + 2));

  // the drops collected match what each broken tile promised
  for (const key in result.expectedByPair)
    expect(result.actualByPair[key]).toBeGreaterThanOrEqual(result.expectedByPair[key]);
});

/* The player stands 3 px off the tile grid deliberately: `PW` is 6 px against
   an 8 px tile and walk physics never snaps. Both straddled columns are real
   shaft, so a fixed centre-x aim clears one and wedges on the other. */
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
    const OFFSET = 3;                     // deliberately not a multiple of band.tile (8)

    // a box wide enough that no straddled column keeps stray worldgen material
    for (let dy = -2; dy <= DEPTH + 1; dy++)
      for (let dx = -1; dx <= 2; dx++) tw.clear(band, tx + dx, ty + dy);
    // both straddled columns (tx, tx+1) are real shaft: neither is a free ride down
    for (let i = 0; i < DEPTH; i++) {
      tw.set(band, tx,     ty + i, S.soil);
      tw.set(band, tx + 1, ty + i, S.soil);
    }
    tw.set(band, tx,     ty + DEPTH, S.stone);   // a floor past TARGET_ROWS
    tw.set(band, tx + 1, ty + DEPTH, S.stone);

    rw.collect(S.pick, F.relic, 1);
    pw.band(band);
    // feet flush on the shaft's top tile, x offset on purpose
    pw.move(worldX(band, tx) + OFFSET, worldY(band, ty) - PH);

    __mf.cmd.hasMouse = false;
    __mf.cmd.down = true;
    __mf.cmd.dig = true;

    const startY = __mf.player.y;
    const startDeepest = run.deepest;

    // each tile costs ~0.5 s of dig at 120 Hz (60 substeps), and up to 2*DEPTH
    // tiles may break (both straddled columns per row) before the fall clears
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

  // every attempted row broke in both columns: no column left as a wedge
  expect(result.brokenBoth).toBe(result.TARGET_ROWS);

  // the player descended
  expect(result.endY).toBeGreaterThan(result.startY + result.tile * (result.TARGET_ROWS - 1));
  expect(result.endDeepest).toBeGreaterThan(result.startDeepest);
});

/* The player never sets foot in the astral band, so without the test-only
   `revealAll` this would photograph a uniform hidden-colour rectangle instead
   of the band's terrain. */
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

/* Revealed for the same reason as the astral band: the player never digs this
   deep during `settle`, so the subject is terrain rather than fog. */
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

test('a placed kiln', async ({ page }) => {
  await boot(page);
  await settle(page);
  /* Keyboard aim, not a hardcoded click. No direction held, because `aimAtKeys`
     then aims to the side at the player's own row -- open air over the floor,
     where a 2-tall machine fits; down is the solid spawn-shelf floor. */
  await page.evaluate(() => { __mf.cmd.hasMouse = false; });
  /* `reach` is 3.2 tiles against the 1-tile fog radius the player's presence
     earns, so a kiln at reach's edge would sit under fog. */
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    __mf.revealAll(bandOf('surface'));
  });
  /* '1' arms quickbar slot 0, per `view/ui/quickbar.js#slotForDigit`. */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    /* Known from the start, granted here so the fixture states it. */
    write.grant('kiln');
  });
  await putInQuickbar(page, 0, 'kiln', 'rig');
  await page.keyboard.press('1');
  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(240));
  /* Excludes the director's own altar, so the count is only what this test
     placed. */
  expect(await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.filter(m => m.def !== M.altar).length;
  })).toBe(1);
  await shot(page, 'kiln.png');
});

test('REAL DRAG: dragging a held item from the inventory grid onto an empty quickbar slot moves it there, and the move survives closing the panel', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    __mf.revealAll(bandOf('surface'));
  });
  await putInMain(page, 'kiln', 'rig');
  const { S, F } = await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    write.grant('kiln');
    open('main');
    setTab('main', 'char');
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
    return { S, F };
  });

  const { invSlot, qSlot } = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const inv = __mf.ui.grids.find(g => g.id === 'inv').slots.find(s => s.sub === S.kiln && s.form === F.rig);
    const qb = __mf.ui.grids.find(g => g.id === 'quickbar').slots[0];
    return { invSlot: inv, qSlot: qb };
  });
  expect(invSlot).toBeTruthy();
  expect(qSlot).toBeTruthy();
  expect(qSlot.sub).toBeNull();     // the quickbar starts empty -- nothing to swap with

  await realDrag(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2, qSlot.x + qSlot.w / 2, qSlot.y + qSlot.h / 2);
  expect(await page.evaluate(() => __mf.ui.quickbar[0])).toEqual({ sub: S.kiln, form: F.rig, n: 1 });

  /* Escape rather than `closeTop`, so the move is proved to live in `run.inv`
     and outlive the window. */
  await page.keyboard.press('Escape');
  await page.evaluate(() => __mf.frames(1));
  expect(await page.evaluate(() => __mf.ui.open)).toEqual([]);
  expect(await page.evaluate(() => __mf.ui.quickbar[0])).toEqual({ sub: S.kiln, form: F.rig, n: 1 });

  await page.keyboard.press('1');
  await page.evaluate(() => __mf.frames(1));
  expect(await page.evaluate(() => __mf.ui.armedPlace)).toEqual({ sub: S.kiln, form: F.rig });

  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });
  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(240));
  /* Excludes the director's own altar, so the count is only what this
     drag-and-place put down. */
  expect(await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.filter(m => m.def !== M.altar).length;
  })).toBe(1);
  /* Placing spent the one kiln in the slot, so it reads empty rather than
     showing a stale `n`. */
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

  /* A digit for an empty slot must do nothing: no arm, no journal row. */
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

  /* A kiln in slot 0 (digit '1'), a brazier in slot 2 (digit '3'), per
     `view/ui/quickbar.js#slotForDigit`'s digit-to-slot mapping. */
  await putInQuickbar(page, 0, 'kiln', 'rig');
  await putInQuickbar(page, 2, 'brazier', 'rig');

  await page.keyboard.press('3');
  const armed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armedPlace: __mf.ui.armedPlace, brazier: S.brazier, kiln: S.kiln, rig: F.rig };
  });
  expect(armed.armedPlace).toEqual({ sub: armed.brazier, form: armed.rig });
  expect(armed.armedPlace.sub).not.toBe(armed.kiln);

  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(240));
  const info = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    /* Excludes the director's own altar, so `placed[0]` is the machine this
       test placed. */
    const placed = __mf.machines.filter(m => m.def !== M.altar);
    return {
      count: placed.length, def: placed[0]?.def, brazier: M.brazier, kiln: M.kiln,
      armedAfter: __mf.ui.armedPlace, brazierRig: invCount(S.brazier, F.rig), kilnRig: invCount(S.kiln, F.rig)
    };
  });
  expect(info.count).toBe(1);
  expect(info.def).toBe(info.brazier);
  expect(info.def).not.toBe(info.kiln);
  expect(info.armedAfter).toBeNull();       // cleared on a successful placement
  expect(info.brazierRig).toBe(0);          // the held item was spent...
  expect(info.kilnRig).toBe(1);          // ...and the other one was untouched
});

/* A state read-back, not a screenshot: the craft bar is a scalar on `run` and
   is not drawn. Smelting is `smelt:true` and carries no `hand`, so it is not
   in `HAND_RECIPES` at all and a held craft key cannot reach it -- the ore and
   the fuel are still there afterwards, and a ladder gets made instead. */
test('the hand-craft key cannot smelt: ore stays ore, and a standard craft runs instead', async ({ page }) => {
  await boot(page);
  await settle(page);
  const info = await page.evaluate(async () => {
    const { write, invCount } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { HAND_RECIPES } = await import('/src/data/recipes.js');

    write.collect(S.copper, F.ore, 4);
    write.collect(S.timber, F.log, 3);
    const before = {
      ore: invCount(S.copper, F.ore),
      log: invCount(S.timber, F.log),
      ingot: invCount(S.copper, F.ingot)
    };

    /* `collect` held alongside `craft`, so the falling output still reaches
       the pockets over the wait that follows. */
    __mf.hold({ craft: 1, collect: 1 }, 500);
    __mf.frames(120);

    const after = {
      ore: invCount(S.copper, F.ore),
      log: invCount(S.timber, F.log),
      ingot: invCount(S.copper, F.ingot)
    };
    return { before, after, smeltIsHand: HAND_RECIPES.some(r => r.id === 'smelt') };
  });

  expect(info.smeltIsHand).toBe(false);
  expect(info.before).toEqual({ ore: 4, log: 3, ingot: 0 });
  /* The ore is untouched and no ingot exists; the logs went into a ladder. */
  expect(info.after.ore).toBe(4);
  expect(info.after.ingot).toBe(0);
  expect(info.after.log).toBeLessThan(3);
});

/* A belt is one tile, and a row of them turns as one off the winch at its end
   for as long as the player holds it. A screenshot cannot tell "moved" from
   "always looked like this", so these three read item and machine state. */

/* `tx0..tx0+3` at `ty0` takes the four belts and `tx0-1` the winch, all cleared
   to air or `placeMachine` refuses them as occupied. `ty0+1` under all five is
   the floor their `footing` demands, and the player stands on it in reach of
   the winch. The rest stays air to fall into. */
async function buildBeltRun(page, tx0, ty0) {
  return page.evaluate(async ({ tx0, ty0 }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { PH, write: pw } = await import('/src/model/player.js');
    const { write: rw } = await import('/src/model/run.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { placeMachine } = await import('/src/rules/placement.js');

    const band = bandOf('surface');
    for (let x = tx0 - 4; x <= tx0 + 12; x++)
      for (let y = ty0 - 6; y <= ty0 + 10; y++) tw.clear(band, x, y);
    for (let x = tx0 - 4; x <= tx0 + 3; x++) tw.set(band, x, ty0 + 1, S.stone);

    /* The winch is granted by the first trial, not known from the start. */
    rw.grant('winch');
    rw.collect(S.winch, F.rig, 1);
    const winch = placeMachine(band, 'winch', tx0 - 1, ty0 - 1);

    rw.collect(S.belt_r, F.rig, 4);
    const belts = [];
    for (let i = 0; i < 4; i++) belts.push(placeMachine(band, 'belt_r', tx0 + i, ty0));

    pw.band(band);
    pw.move(worldX(band, tx0 - 2) + 1, worldY(band, ty0 + 1) - PH);
    pw.vel(0, 0);

    return { built: !!winch && belts.every(Boolean), right: belts[3].box.x + belts[3].box.w };
  }, { tx0, ty0 });
}

test('a driven belt run carries a resting item along it and releases it off the end', async ({ page }) => {
  await boot(page);
  await settle(page);
  const rig = await buildBeltRun(page, 10, 15);
  expect(rig.built).toBe(true);

  const info = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: iw } = await import('/src/model/items.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');

    const band = bandOf('surface');
    const tx0 = 10, ty0 = 15;

    /* It lands on an unturned run first, so the resting state is observable:
       nothing drives a belt until someone holds the winch. */
    const it = iw.spawn(band, worldX(band, tx0) + 4, worldY(band, ty0 - 3), S.copper, F.ore, 0, 0);
    __mf.frames(120);                    // time to fall and settle
    const landed = { x: it.x, y: it.y, rest: it.rest };

    __mf.hold({ action: true }, 200);    // cross the run and be released
    const settled = { x: it.x, y: it.y, rest: it.rest };

    __mf.frames(180);                    // and fall the rest of the way
    return { landed, settled, after: { x: it.x, y: it.y, rest: it.rest } };
  });

  expect(info.landed.rest).toBe(1);                   // it landed and came to rest
  /* Delivered off the end: past the last belt's right edge and, the far side
     being open air, resting lower than it landed rather than at the lip. */
  expect(info.settled.x).toBeGreaterThanOrEqual(rig.right);
  expect(info.after.y).toBeGreaterThan(info.landed.y + 8);
  expect(info.after.rest).toBe(1);                    // and came to rest again
});

test('a belt run nobody is turning does not drag a resting item', async ({ page }) => {
  await boot(page);
  await settle(page);
  const rig = await buildBeltRun(page, 10, 15);
  expect(rig.built).toBe(true);

  const info = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: iw } = await import('/src/model/items.js');
    const { machines } = await import('/src/model/machines.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');

    const band = bandOf('surface');
    const tx0 = 10, ty0 = 15;

    const it = iw.spawn(band, worldX(band, tx0) + 4, worldY(band, ty0 - 3), S.copper, F.ore, 0, 0);
    __mf.frames(120);
    const landed = { x: it.x, y: it.y, rest: it.rest };

    __mf.frames(200);                    // the same window the held test drags across
    return {
      landed,
      after: { x: it.x, y: it.y, rest: it.rest },
      torque: Math.max(...machines.map(m => m.torque))
    };
  });

  expect(info.torque).toBe(0);                        // nothing is turning
  expect(info.landed.rest).toBe(1);
  expect(info.after.x).toBe(info.landed.x);
  expect(info.after.y).toBe(info.landed.y);
  expect(info.after.rest).toBe(1);
});

/* `rules/items.js#MAX_ITEMS` caps the global item list at 400, so a belt
   mid-drag has to survive the cap trimming items out from under it. */
test('a belt dragging far more items than the cap allows stays finite and within it', async ({ page }) => {
  await boot(page);
  await settle(page);
  const rig = await buildBeltRun(page, 10, 15);
  expect(rig.built).toBe(true);

  const info = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { items, write: iw } = await import('/src/model/items.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');

    const band = bandOf('surface');
    const tx0 = 10, ty0 = 15;

    const before = items.length;
    for (let i = 0; i < 450; i++)
      iw.spawn(band, worldX(band, tx0) + (i % 32), worldY(band, ty0 - 3), S.copper, F.ore, 0, 0);
    const spawned = items.length - before;

    __mf.hold({ action: true }, 600);

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

/* Fog of war: a revealed tile never un-reveals, and `rules/reveal.js` splits
   what gets revealed into Pass A, the band's whole sky-exposed silhouette, and
   Pass B, a bounded spread through enclosed air. */

test('an unexplored area renders as the hidden colour, whatever terrain is actually there', async ({ page }) => {
  await boot(page);
  await settle(page);
  const info = await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    const { P } = await import('/src/core/palette.js');

    /* The astral band, unvisited and picked because its `look.ambient` is 1.0:
       `view/scene.js#atmosphere`'s depth tint never fires there, so nothing
       blends a second colour over the sampled fog pixel. */
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
    pw.move(worldX(band, tx), worldY(band, ty));       // hitbox top-left at this tile
    revealStep();
    const whileThere = seenAt(band, tx, ty);

    /* 60 tiles clear of the tile and every neighbour of it, so only stored
       memory can still have `tx,ty` revealed -- nothing adjacent does. */
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
  expect(info.seenAfter).toBe(false);       // the fresh band starts unrevealed
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
    /* `shell/boot.js` reveals rows 0..floorTy+8 of the surface band at spawn,
       so groundTy is floorTy+10: below that freebie, and still sky-exposed
       through a shaft carved down to it. */
    const groundTy = floorTy + 10;
    const standTx = 20, farTx = 100;          // 80 tiles apart, past Pass B's
                                               // graph-distance cap, so a reveal
                                               // reaching `farTx` is Pass A's

    /* Carved rather than trusted to worldgen, where a trunk or a ragged soil
       lip would fail this silently. The tile beneath each ground tile is solid
       and buried: the control separating the silhouette from the whole band. */
    for (const tx of [standTx, farTx]) {
      for (let ty = 0; ty < groundTy; ty++) tw.clear(band, tx, ty);
      tw.set(band, tx, groundTy, S.stone);
      tw.set(band, tx, groundTy + 1, S.stone);
    }

    const beforeFar = seenAt(band, farTx, groundTy);

    pw.band(band);
    /* PH is 16 px, two tile rows, both cleared above the carved ground. */
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
  expect(info.farBuried).toBe(false);     // still bounded to what is sky-exposed
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
    const radius = eff('sightRadius');        // the tunable itself, so a retune
                                               // cannot stale this
    const ty0 = 100, ty1 = 101;                // 2 rows tall, matching the player's
                                               // own height, deep in topsoil and
                                               // nowhere near open sky
    const tx0 = 10, length = radius + 20;      // a straight room longer than the cap
                                               // in both directions from the seed
    const openEnd = tx0 + length - 1;

    /* A hand-carved sealed room, walled on every side with no route to open
       sky, which is what isolates Pass B from Pass A. */
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
      wallNearby: seenAt(band, tx0, ty0 - 1),           // the ceiling over the player:
                                                         // revealed though solid
      edge: seenAt(band, tx0 + 2, ty0),                 // a couple of tiles in
      deep: seenAt(band, tx0 + radius + 8, ty0),        // 8 tiles past the cap
      farEnd: seenAt(band, openEnd, ty0)                // the true far wall of the pocket
    };
  });

  expect(info.wallNearby).toBe(true);
  expect(info.edge).toBe(true);
  expect(info.deep).toBe(false);      // the spread is bounded, not the whole pocket
  expect(info.farEnd).toBe(false);
});

/* `view/scene.js#drawMap` is a separate render path: the whole world at ~1
   screen px per tile, read off the tile grid rather than the per-chunk canvas
   cache, gated on `flags.showMap`, which also freezes the run. */

/* The stone tile is written and revealed explicitly rather than looked for in
   worldgen, then the player is moved away before the draw so the map's own
   marker cannot paint over the pixel this test samples. */
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
    /* A topsoil tile nobody has stood near, shallow enough to be on screen:
       the overview is depth-complete only above about row 387 at the desktop
       buffer, and the `inBody` guard below asserts the sample landed in it. */
    const hx = 100, hy = 250;

    tw.set(surface, sx, sy, S.stone);
    pw.band(surface);
    pw.move(worldX(surface, sx), worldY(surface, sy));
    revealStep();
    pw.move(worldX(surface, 0), worldY(surface, 0));   // clear of the probed tile
    revealStep();

    /* The overview follows the player by default, who is now in the top-left
       corner, so the probed tile would be off screen; `mapMoveTo` parks the
       view and turns follow off. */
    const { mapMoveTo } = await import('/src/shell/ui.js');
    mapMoveTo(0, 0);
    __mf.flags.showMap = true;
    __mf.draw();

    /* `view/overview.js#mapView` records the transform the last draw used, so
       this cannot drift from the renderer's scale, zoom, scroll offset or
       reserved-edge arithmetic. */
    const { mapView } = await import('/src/view/overview.js');
    const c = document.getElementById('stage');
    const mapPx = (wx, wy) => {
      const x = Math.round(mapView.vx + (wx - mapView.wx) * mapView.scale);
      const y = Math.round(mapView.vy + (wy - mapView.wy) * mapView.scale);
      return { x, y,
               inBody: x >= mapView.vx && x < mapView.vx + mapView.vw &&
                       y >= mapView.vy && y < mapView.vy + mapView.vh };
    };
    const revealed = mapPx(worldX(surface, sx) + surface.tile / 2, worldY(surface, sy) + surface.tile / 2);
    const hidden = mapPx(worldX(topsoil, hx) + topsoil.tile / 2, worldY(topsoil, hy) + topsoil.tile / 2);

    const g2d = c.getContext('2d');
    const [rr, rg, rb] = g2d.getImageData(revealed.x, revealed.y, 1, 1).data;
    const [hr, hg, hb] = g2d.getImageData(hidden.x, hidden.y, 1, 1).data;

    return {
      seenSurface: seenAt(surface, sx, sy), seenTopsoil: seenAt(topsoil, hx, hy),
      inBody: revealed.inBody && hidden.inBody,
      revealedRGB: [rr, rg, rb], hiddenRGB: [hr, hg, hb],
      stoneBase: P.irC, voidBase: P.abyC
    };
  });

  const hex = h => [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)].map(x => parseInt(x, 16));

  expect(info.seenSurface).toBe(true);
  expect(info.seenTopsoil).toBe(false);
  expect(info.inBody).toBe(true);                         // both probes are on the map, not its frame
  expect(info.revealedRGB).toEqual(hex(info.stoneBase));  // explored stone paints its own colour
  expect(info.hiddenRGB).toEqual(hex(info.voidBase));     // unexplored tile draws nothing at all
});

/* The layout rather than the fog rule: three bands stacked, scaled, neither
   overlapping nor clipped. Fully revealed, so seed 1337's incidental
   exploration is not part of the picture. */
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

    /* Held right + dig would move the player and chip a tile if physics ran.
       `hold` drives `step` and `applyIntents`, the entry points the RAF loop
       uses. */
    __mf.flags.showMap = true;
    __mf.hold({ right: 1, dig: 1 }, 120);
    const xDuringMap = __mf.player.x, tDuringMap = __mf.clock.t;

    __mf.flags.showMap = false;
    __mf.draw();                              // back on the normal path
    const afterCloseHash = hashOf();

    __mf.hold({ right: 1 }, 60);              // the run resumes
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

/* Asserts the resolved tooltip content: identical pixels could equally come
   from the tooltip resolving nothing at all. */
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
       counts down from the 2.6 s opening title, and `settle` advances the clock
       without running `stepFx`, which is what decays it. */
    banner.fade = 0;
    /* `draw`, not `frames`: a substep runs `updateCamera`, and `mouseAt`
       converts a screen position to world px against the current camera, so a
       step in between would move the camera out from under the mouse. */
    __mf.draw();

    /* `__mf.ui.grids` is the rectangle list the panel just drew, so the slot
       is found where it was rendered rather than at a hardcoded coordinate. */
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

/* `__mf.intent(name, args)` locates its target rect from `__mf.ui`'s live
   projection of what was drawn this frame, never a hardcoded screen
   coordinate. `__mf.give(sub, form, n)` is test-only, gated behind `?test=1`. */

/* Fixed seed, fixed substep count, `maxDiffPixels` 0. The unlit and lit shaft
   are baselined separately, so a regression making lighting a no-op has to
   move one of them against its own baseline. */

/* A hand-carved topsoil shaft with a copper vein in one wall, fully revealed
   through the test-only `write.revealAll`: the subject is darkness, not fog. */
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
    banner.fade = 0;   // past the opening title

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
    __mf.frames(700);          // past the 6 s fuel recipe, then settle
  });
  await shot(page, 'shaft-lit.png');
});

test('the Character tab', async ({ page }) => {
  await boot(page);
  await settle(page);
  /* Into the main grid, not the quickbar: a pickup fills the quickbar first,
     so a plain collect would baseline an empty grid. */
  await putInMain(page, 'copper', 'ore', 5);
  await putInMain(page, 'timber', 'log', 3);
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { write: rw } = await import('/src/model/run.js');
    const { open, setTab, setAutoCollect } = await import('/src/shell/ui.js');
    const { grant, step: trinketStep } = await import('/src/rules/trinkets.js');
    const { banner } = await import('/src/view/fx.js');

    grant('bellows');
    /* Auto-collect on for the wait below, so the drafted relic is picked up. */
    setAutoCollect(true);
    __mf.frames(200);          // let the drafted relic fall and land in the pockets
    /* `write.equip` is the same model write drag-to-equip calls. */
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
  /* Eight distinct pairs: `write.collect` merges first, so the same pair twice
     tops up one slot rather than filling a second. No relic: one is worn
     rather than pocketed, so it never reaches the strip. */
  const pairs = [
    ['copper', 'ore'], ['iron', 'ore'], ['timber', 'log'], ['stone', 'gravel'],
    ['soil', 'gravel'], ['granite', 'gravel'], ['adamant', 'gravel'],
    ['coal', 'lump']
  ];
  for (let i = 0; i < pairs.length; i++) await putInQuickbar(page, i, pairs[i][0], pairs[i][1]);
  await page.evaluate(async () => {
    const { banner } = await import('/src/view/fx.js');
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(1);        // draw once so __mf.ui reflects the fill
  });

  /* Counted on both sides: `__mf.ui.quickbar` is `run.inv`'s tail and
     `grid.slots` is what was painted, so a `COLS` that did not divide the slot
     count would draw more cells than there are addressable ones. */
  const grid = await page.evaluate(() => __mf.ui.grids.find(g => g.id === 'quickbar'));
  const cells = await page.evaluate(() => __mf.ui.quickbar.length);
  expect(cells).toBe(8);
  expect(grid.slots.length).toBe(8);
  expect(grid.slots.every(s => s.sub != null)).toBe(true);
  expect(grid.rows).toBe(1);            // one row of eight, never a second

  await shot(page, 'ui-quickbar-full.png');
});

/* `DIGITS` is ten glyphs long and the strip is eight cells, so '9' and '0'
   name nothing. Driven through the real keyboard, with the arm read back. */
test('digit keys past the last quickbar cell arm nothing and throw nothing', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);
  for (let i = 0; i < 8; i++) await putInQuickbar(page, i, 'copper', 'ore');
  await page.evaluate(() => __mf.frames(1));

  await page.keyboard.press('8');
  const armedAt8 = await page.evaluate(() => __mf.ui.armedPlace);
  expect(armedAt8).toBeTruthy();          // the last real cell does arm

  await page.evaluate(async () => (await import('/src/shell/ui.js')).clearArmedPlace());
  await page.keyboard.press('9');
  await page.keyboard.press('0');
  await page.evaluate(() => __mf.frames(1));
  expect(await page.evaluate(() => __mf.ui.armedPlace)).toBeNull();
  expect(errors).toEqual([]);

  /* The mapping itself, because the arm half alone cannot fail: an unbounded
     `slotForDigit` returns 8 for '9', `run.inv[38]` is undefined, and the arm
     branch's null check swallows it. -1 is the observable difference. */
  const digits = await page.evaluate(async () => {
    const { slotForDigit } = await import('/src/view/ui/quickbar.js');
    return { one: slotForDigit('1'), eight: slotForDigit('8'), nine: slotForDigit('9'), zero: slotForDigit('0') };
  });
  expect(digits).toEqual({ one: 0, eight: 7, nine: -1, zero: -1 });
});

/* `write.reset` seeds `known` with every `HAND_RECIPES` id, so nothing is
   locked and `view/ui/mainPanel.js`'s `!known` silhouette branch is not part
   of this shot. */
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

/* Six labels cost 204 px (`textWidth(label) + 6` each) against a 188 px
   crafting body at the 200 px buffer floor, so DIVINE stays reachable only
   because `drawTabs` wraps. */
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

  /* Every tab inside the 200 px buffer, so the wrap did not move the overflow
     somewhere else. */
  for (const h of row.hits) {
    expect(h.x).toBeGreaterThanOrEqual(0);
    expect(h.x + h.w).toBeLessThanOrEqual(200);
    expect(h.y + h.h).toBeLessThanOrEqual(180);
  }
});

/* `drawn.recipeIndex.recipes` is the list `view/ui/mainPanel.js` recorded for
   the dispatcher, so this compares what ALL drew against what the five real
   categories drew, rather than re-deriving either. */
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

  /* `every` comes from `data/recipes.js`, not from the draw, so the equality
     above cannot be two empty lists agreeing. The counts are stated because
     DIVINE draws nothing today: no hand recipe outputs a relic or a miracle. */
  expect(all.length).toBe(16);
  const counts = Object.fromEntries(Object.entries(cats).map(([c, ids]) => [c, ids.length]));
  expect(counts).toEqual({ raw: 13, refined: 0, tools: 1, placeables: 2, divine: 0 });
});

test('the boon stack with active boons', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { grant } = await import('/src/rules/boons.js');
    const { BOONS } = await import('/src/data/boons.js');
    const { banner } = await import('/src/view/fx.js');
    /* Indices 0, 2 and 4: `data/boons.js`'s conflicting pairs are 0/1 and 2/3,
       so all three stay active and visible at once. */
    grant(BOONS[0].id);
    grant(BOONS[2].id);
    grant(BOONS[4].id);
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(2);
  });
  await shot(page, 'ui-boon-stack.png');
});

test('cold start -> gather gravel -> craft a kiln -> place it -> it smelts', async ({ page }) => {
  await boot(page);
  await settle(page);
  const crafted = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { bandOf } = await import('/src/model/world.js');
    const { setAutoCollect, setAutoFeed } = await import('/src/shell/ui.js');
    __mf.revealAll(bandOf('surface'));
    /* Auto-collect on for the whole scene, so the collect gate is not part of
       the craft -> place -> feed -> smelt chain. */
    setAutoCollect(true);
    /* Auto-feed too: feeding by hand is a click-arm-aim-LMB verb and would be
       twelve pointer presses here, and what follows is about a crafted rig
       placing, being spent, and smelting. */
    setAutoFeed(true);
    /* `give` stands in for the mining. `data/recipes.js#kiln` bills 15
       stone/gravel over 8.0 s into a held `kiln/rig`; the ore and coal on top
       are what it smelts once it is built. */
    __mf.give(S.stone, F.gravel, 15);
    __mf.give(S.copper, F.ore, 8);
    __mf.give(S.coal, F.lump, 4);
    __mf.cmd.hasMouse = false;
    __mf.hold({ craft: 1, craftId: 'kiln' }, 1000);  // past the kiln recipe's own 8.0 s
    __mf.cmd.craft = false;             // release the key -- `hold` only auto-releases hop/place
    __mf.frames(150);                   // let the crafted item fall and clear the pickup-magnet delay
    return { rig: invCount(S.kiln, F.rig), gravelLeft: invCount(S.stone, F.gravel), oreLeft: invCount(S.copper, F.ore) };
  });
  expect(crafted.rig).toBe(1);          // the recipe fired exactly once and spent its bill
  expect(crafted.gravelLeft).toBe(0);
  expect(crafted.oreLeft).toBe(8);

  /* Placed through the quickbar's own digit keys, the one placement path. */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    /* Known from the start, granted here so the fixture states it. */
    write.grant('kiln');
  });
  await moveHeldToQuickbar(page, 0, 'kiln', 'rig');
  await page.keyboard.press('1');        // arms slot 0's kiln (`view/ui/quickbar.js#slotForDigit`)
  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  const result = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { write: pw, PW } = await import('/src/model/player.js');
    const { M } = await import('/src/data/machines.js');

    /* The ingot ejects from the kiln's top mouth and rests near the
       machine's centre, past `eff('pickupR')` (10 px) from where the player
       stood to place it, so the player is moved under that centre below. */
    __mf.frames(1);                      // let the keypress above place it
    /* Excludes the director's own altar, so `placed[0]` is the kiln this
       test placed. */
    const placed = __mf.machines.filter(m => m.def !== M.altar);
    const m = placed[0];
    pw.move(m.box.x + m.box.w / 2 - PW / 2, __mf.player.y);

    __mf.frames(1500);                   // several 3.0 s smelt cycles, plus fall and pickup
    return {
      machines: placed.length,
      ingot: invCount(S.copper, F.ingot),
      rigLeft: invCount(S.kiln, F.rig)
    };
  });

  expect(result.machines).toBe(1);
  expect(result.ingot).toBeGreaterThan(0);
  expect(result.rigLeft).toBe(0);        // the held item was spent
});

test('craft a ladder by hand, place a brazier in a dark room, and the strata become visible where they were not', async ({ page }) => {
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

    /* A ladder through the real hand-craft key, not a grant; `collect` held
       alongside covers the wait below. Named, because `kindle`'s single log is
       a subset of this bill and `choose` would reach it first on a short
       hold. */
    __mf.give(S.timber, F.log, 3);
    __mf.hold({ craft: 1, craftId: 'ladder', collect: 1 }, 300);
    __mf.cmd.craft = false;             // release the key -- `hold` only auto-releases hop/place
    __mf.frames(60);
    const rungsHeld = invCount(S.timber, F.rung);

    /* A sealed dark room deep in topsoil, clear of anything `settle`'s
       spawn-adjacent reveal touched. Floor at ty0+h so the brazier's
       `footing:1` has the room's bottom row to stand on. */
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

    /* The timber is fuel, and auto-feed is what pulls it out of the pockets:
       the proximity drain is opt-in and off by default. The flag rather than
       the feed verb, since the subject here is light and reveal. */
    const { setAutoFeed } = await import('/src/shell/ui.js');
    setAutoFeed(true);
    __mf.give(S.brazier, F.rig, 1);
    __mf.give(S.timber, F.log, 4);
    const brazier = placeMachine(band, 'brazier', tx0 + 2, ty0 + h - 1);   // adjacent, in hand-feed reach
    __mf.frames(900);                                              // past 6 s of fuel, several times over

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
    /* `F.rung`, not `F.log`: `log` carries no `tile` block, so `timber/rung`,
       what `peg_rungs` makes, is the only climbable timber tile. */
    tw.set(band, tx, ty + 4, S.timber, F.rung);       // a ladder tile
    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty + 3));  // straddling the ladder tile

    /* Over the hard cap by more than one drop can clear: `dropHeaviest` ('q')
       sheds the heaviest pair one unit at a time, and copper/ore's
       `massOfPair` is exactly 1.0 T per unit, so units are talents here. */
    const need = eff('burden') * 1.3;
    __mf.give(S.copper, F.ore, Math.ceil(need));
    __mf.cmd.hasMouse = false;
  });

  const y0 = await page.evaluate(() => __mf.player.y);
  await page.evaluate(() => __mf.hold({ up: 1 }, 30));
  const afterRefused = await page.evaluate(() => __mf.player.y);
  expect(afterRefused).toBeGreaterThanOrEqual(y0);      // no upward movement while over the cap

  /* `q` is edge-triggered, one unit per press. Each press is one substep so
     the burst stays under `rules/items.js#MAGNET_DELAY` (0.35 s = 42 substeps
     at 1/120 s), or the shed units would be picked straight back up. */
  const underCap = await page.evaluate(async () => {
    const { eff } = await import('/src/model/mods.js');
    const { burdenOf } = await import('/src/model/run.js');
    /* Well under the cap, not barely under: the climb below runs 60 substeps,
       past MAGNET_DELAY, without the player moving off the drop pile, so some
       of what was shed is picked back up mid-climb. */
    for (let i = 0; i < 39 && burdenOf() >= eff('burden') * 0.6; i++) __mf.hold({ drop: 1 }, 1);
    return burdenOf() < eff('burden');
  });
  expect(underCap).toBe(true);

  const yBeforeClimb = await page.evaluate(() => __mf.player.y);
  await page.evaluate(() => __mf.hold({ up: 1 }, 60));
  const yAfterClimb = await page.evaluate(() => __mf.player.y);
  expect(yAfterClimb).toBeLessThan(yBeforeClimb);       // climbs: world y decreases
});

test('opening the GUI, shift-clicking a recipe queues 5, and ticking drains them into the pockets', async ({ page }) => {
  await boot(page);
  await settle(page);
  const result = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { open, setTab, setAutoCollect } = await import('/src/shell/ui.js');

    /* Auto-collect on for the wait below, so the collect gate is not part of
       the queue draining. */
    setAutoCollect(true);
    __mf.give(S.timber, F.log, 20);      // 5 runs of `ladder` (3 logs each)
    open('main');
    setTab('main', 'craft');
    __mf.frames(1);                       // draw once so __mf.ui() reflects the open panel

    __mf.intent('tab', { row: 'main-craft-cat', tab: 'placeables' });   // rung is form.tile -> 'placeables'
    const grid = __mf.ui.grids.find(g => g.id === 'recipes');
    const index = grid ? grid.slots.findIndex(s => s.sub === S.timber && s.form === F.rung) : -1;

    __mf.intent('slot', { grid: 'recipes', index, shift: true });
    const queueAfterClick = __mf.ui.craftQueue.length;

    /* `tickCraftQueue` drains the journal completions it can see since the
       last `frames` call, once per batch as it runs once per animation frame in
       play. One big batch would hold `cmd.craft` down and over-craft. */
    for (let i = 0; i < 40 && __mf.ui.craftQueue.length; i++) __mf.frames(40);
    /* The queue empties when the last completion's 'produce' row is seen,
       before that output has finished falling and cleared the pickup delay. */
    __mf.frames(120);

    return { index, queueAfterClick, rungs: invCount(S.timber, F.rung) };
  });

  expect(result.index).toBeGreaterThanOrEqual(0);
  expect(result.queueAfterClick).toBe(5);
  expect(result.rungs).toBe(10);          // 5 completions x 2 rungs each
});

test('granting a boon in debug activates it, and it expires back to the base eff() value', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(() => { __mf.flags.showDebug = true; __mf.cmd.hasMouse = false; });

  /* 'b' lays out a 1-of-3 draft of the timed tier and freezes the run behind
     it; '1' takes the first card. The baseline is read from that card, because
     which row it is comes out of the seeded draw rather than `BOONS[0]`. */
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

/* F, L, T and B are the machine and draft spawns `src/shell/input.js` gates
   behind `flags.showDebug`. */
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

/* The tests below drive the mouse through `page.mouse.move/down/up` rather
   than `__mf.intent`'s internal shortcut. */

async function toClient(page, sx, sy) {
  return page.evaluate(async ({ sx, sy }) => {
    const { VIEW } = await import('/src/core/canvas.js');
    const r = document.getElementById('stage').getBoundingClientRect();
    return { x: r.left + sx * VIEW.scale, y: r.top + sy * VIEW.scale };
  }, { sx, sy });
}

/* A real down-frame-up click at a screen-space point, the space `__mf.ui`'s
   panel/tab/grid/button rects are given in. `shift`/`ctrl` arm the keys
   `shell/input.js#pointerdown` reads into `cmd.uiShift`/`cmd.uiCtrl`. */
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
   the shape `shell/main.js#applyUiIntents` expects of `cmd.uiDown`'s rising
   and falling edges. */
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

  /* `ui.tab.main` is only written by an explicit `setTab`: the default 'char'
     is resolved at render time by `view/ui/mainPanel.js#activeOf` and never
     persisted, so it reads undefined here. */
  let ui = await page.evaluate(() => __mf.ui);
  expect(ui.tab.main).toBeFalsy();

  const row = ui.tabs.find(t => t.id === 'main');
  const craftTab = row.hits.find(h => h.id === 'craft');
  await realClick(page, craftTab.x + craftTab.w / 2, craftTab.y + craftTab.h / 2);

  ui = await page.evaluate(() => __mf.ui);
  expect(ui.tab.main).toBe('craft');
  expect(ui.open).toContain('main');

  /* A clickable close box exists whatever the keyboard focus state is, so
     there is always a mouse-only way out. */
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

  /* 'i' is a legitimate search character while search has focus, so it types
     into the search string rather than closing the panel. */
  await page.keyboard.press('i');
  await page.evaluate(() => __mf.frames(1));
  ui = await page.evaluate(() => __mf.ui);
  expect(ui.search).toBe('i');
  expect(ui.searchFocus).toBe(true);
  expect(ui.open).toContain('main');

  /* One Escape both blurs and closes. */
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

  /* Nothing spent, nothing produced, and no queue entry left stuck: the click
     was refused outright. */
  expect(after.rungs).toBe(before.rungs);
  expect(after.queue).toBe(0);
  expect(after.toast).toContain('CANNOT AFFORD');
});

test('REAL DRAG: a relic is worn on pickup, swaps between equipment slots, and drops to the ground when dragged out (Bug 1)', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    write.collect(S.bellows, F.relic, 1);
    open('main');
    setTab('main', 'char');
    __mf.cmd.hasMouse = false;
    __mf.frames(1);
  });

  /* A relic is worn, never pocketed: `write.collect` routes it to a slot. */
  const worn = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { run } = await import('/src/model/run.js');
    return { slot0: run.equipped[0] === S.bellows,
             pocketed: run.inv.some(sl => sl && sl.sub === S.bellows) };
  });
  expect(worn.slot0).toBe(true);
  expect(worn.pocketed).toBe(false);

  const cells = () => page.evaluate(() =>
    __mf.ui.grids.find(g => g.id === 'equip').slots.map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h })));

  const mid = c => [c.x + c.w / 2, c.y + c.h / 2];
  let eq = await cells();
  await realDrag(page, ...mid(eq[0]), ...mid(eq[1]));

  const moved = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { run } = await import('/src/model/run.js');
    return run.equipped[1] === S.bellows && run.equipped[0] === null;
  });
  expect(moved).toBe(true);

  /* Dragged out onto empty canvas, where there is no grid at all. The slot was
     the only place it was, so it has to survive as an item. */
  eq = await cells();
  await realDrag(page, ...mid(eq[1]), 4, 4);

  const dropped = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { items } = await import('/src/model/items.js');
    const { run } = await import('/src/model/run.js');
    return { empty: run.equipped[1] === null,
             onGround: items.some(it => it.sub === S.bellows && it.form === F.relic) };
  });
  expect(dropped.empty).toBe(true);
  expect(dropped.onGround).toBe(true);
});

test('fog of war: hovering an unseen tile shows nothing; the same tile shows its name once revealed (Bug 3)', async ({ page }) => {
  await boot(page);
  await settle(page);
  const result = await page.evaluate(async () => {
    const { bandOf, worldX, worldY, seenAt } = await import('/src/model/world.js');
    const { banner } = await import('/src/view/fx.js');

    const { tileAt } = await import('/src/model/tiles.js');
    const { AIR } = await import('/src/data/forms.js');
    const band = bandOf('topsoil');
    /* The first solid tile on row 60 at or right of column 60: far from spawn
       and from `settle()`'s own reveal, and searched for rather than named
       because worldgen carves hollows wherever it likes. */
    let tx = 60;
    const ty = 60;
    while (tx < 200 && tileAt(band, tx, ty) === AIR) tx++;
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
  const scene = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F, AIR } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { tileAt, write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { open } = await import('/src/shell/ui.js');

    /* A 5-row room (PH is 16 px, two tile rows) carved into solid rock, plus
       two open cells beside it, backed by the untouched wall that
       `rules/placement.js#placeTile` needs something to hang from. */
    const band = bandOf('topsoil');
    const tx = 10, ty = 40;
    for (let dy = -2; dy <= 2; dy++) tw.clear(band, tx, ty + dy);
    tw.clear(band, tx + 1, ty);
    tw.clear(band, tx + 1, ty - 1);
    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty) - 4);

    __mf.give(S.timber, F.rung, 5);
    __mf.cmd.hasMouse = false;
    open('main');
    __mf.hold({ right: 1 }, 6);     // face right, toward the open cells at tx+1
    __mf.frames(1);
    return {
      belly: tileAt(band, tx + 1, ty) === AIR,
      head: tileAt(band, tx + 1, ty - 1) === AIR,
      aimed: __mf.aim.valid && __mf.aim.tx === tx + 1 && __mf.aim.ty === ty
    };
  });

  /* Both cells of the faced column are open, and the reticle names the one the
     placement fills. */
  expect(scene).toEqual({ belly: true, head: true, aimed: true });

  let isOpen = await page.evaluate(() => __mf.ui.open.includes('main'));
  expect(isOpen).toBe(true);

  const before = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    return invCount(S.timber, F.rung);
  });

  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
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

/* A real click has a frame between down and up and the dispatch resolves its
   aim inside that frame, which is what `realClick` reproduces. */

test('click-to-arm: placing a kiln fails with nothing armed, then succeeds once one is armed and built', async ({ page }) => {
  await boot(page);
  await settle(page);

  /* A fresh run holds nothing placeable and nothing armed, so the press below
     places nothing. */
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    __mf.revealAll(bandOf('surface'));
    __mf.cmd.hasMouse = false;
  });
  /* Excludes the director's own altar, so the count is only what a placement
     adds. */
  const countExAltar = () => page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.filter(m => m.def !== M.altar).length;
  });
  const before = await countExAltar();
  expect(before).toBe(0);
  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(5));
  const afterRefusal = await countExAltar();
  expect(afterRefusal).toBe(0);

  /* The recipe's exact bill, hand-crafted into a `kiln/rig`, then armed by
     clicking its Character-tab slot: the mouse-driven half of click-to-arm. */
  const crafted = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount, write } = await import('/src/model/run.js');
    /* Crafting the rig does not need the grant; placing it below does. */
    write.grant('kiln');
    __mf.give(S.stone, F.gravel, 15);
    /* `collect` held alongside `craft` covers the wait below. */
    __mf.hold({ craft: 1, craftId: 'kiln', collect: 1 }, 1000);  // past `data/recipes.js#kiln`'s own 8.0 s
    __mf.cmd.craft = false;             // release the key -- `hold` only auto-releases hop/place
    __mf.frames(150);                   // let the crafted item fall and clear the pickup-magnet delay
    return { rig: invCount(S.kiln, F.rig) };
  });
  expect(crafted.rig).toBe(1);

  await moveHeldToMain(page, 'kiln', 'rig');
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
    return grid.slots.find(s => s.sub === S.kiln && s.form === F.rig);
  });
  expect(invSlot).toBeTruthy();
  await realClick(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2);

  const armed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armedPlace: __mf.ui.armedPlace, expectSub: S.kiln, expectForm: F.rig };
  });
  expect(armed.armedPlace).toEqual({ sub: armed.expectSub, form: armed.expectForm });

  /* Keyboard aim with no direction held aims to the side, at the player's own
     row, which on the spawn shelf is open air over the floor. */
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });

  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(5));

  const result = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { invCount } = await import('/src/model/run.js');
    /* Excludes the director's own altar, so this counts the kiln just
       placed. */
    return {
      machines: __mf.machines.filter(m => m.def !== M.altar).length,
      rig: invCount(S.kiln, F.rig), armedAfter: __mf.ui.armedPlace
    };
  });
  expect(result.machines).toBe(1);
  expect(result.rig).toBe(0);              // the held item was spent
  expect(result.armedAfter).toBeNull();    // cleared on a successful placement
});

/* `gravel` carries no `tile` block, so rubble is a prerequisite:
   `recipes.js#pack` turns 5 of it into one `soil/block`, and the block is what
   arms and places. An unarmable form cannot be armed at all. */
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

    /* Hand-carved rather than found: a floor under the player's column so a
       sideways dig does not start them falling, and a known substance at the
       one tile that is mined and then rebuilt. */
    const band = bandOf('topsoil');
    for (let dx = 0; dx <= 1; dx++) for (let dy = -2; dy <= 0; dy++) tw.clear(band, tx + dx, ty + dy);
    tw.set(band, tx, ty + 1, S.stone);        // floor under the player's own feet
    tw.set(band, holeTx, ty, S.soil);         // the tile to mine, then restore
    /* A backing wall above the hole, so `rules/placement.js#placeTile`'s
       "needs something to hang from" check passes whatever the seed put
       beyond this pocket. */
    tw.set(band, holeTx, ty - 1, S.stone);

    /* Soil's `dropChance` forced to 1, so the one tile mined below is
       guaranteed to drop. */
    const { write: modsw } = await import('/src/model/mods.js');
    modsw.add('test-full-yield', [{ key: 'dropChance.soil', mul: 20 }]);   // 0.05 x 20 = 1.0

    rw.collect(S.pick, F.relic, 1);           // the stock pickaxe, granted directly

    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty) - 4);   // centred on row `ty`, resting on the floor
  }, { tx, ty, holeTx });

  await page.evaluate(() => { __mf.cmd.hasMouse = false; });
  await page.evaluate(() => { __mf.hold({ right: 1 }, 6); __mf.cmd.right = false; });   // face right, toward the hole
  /* `collect` held alongside `dig` covers the wait below. */
  await page.evaluate(() => __mf.hold({ dig: 1, collect: 1 }, 400));   // soil hardness is 0.50 s, comfortably past
  await page.evaluate(() => { __mf.cmd.dig = false; });    // `dig` is held, not edge-triggered -- release it
  /* The dropped gravel can settle just past `pickupR` of a player standing at
     `tx`, so the wait happens standing on the hole; the return to `tx` is what
     makes keyboard aim, facing right, resolve back to `holeTx`. */
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
  expect(afterDig.gravel).toBeGreaterThan(0);        // and pocketed, not merely dropped

  await moveHeldToMain(page, 'soil', 'gravel');
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'char');
    __mf.frames(1);
  });

  /* Any occupied slot arms, because an arm can end in a feed as well as a
     placement, so rubble's refusal comes one press later, from
     `rules/placement.js#placeTile`'s 'THAT DOES NOT BUILD'. */
  const gravelSlot = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'inv');
    return grid.slots.find(s => s.sub === S.soil && s.form === F.gravel);
  });
  expect(gravelSlot).toBeTruthy();                   // it is held, and shown
  /* The camera has to converge before a click: `realClick` writes `cmd.mx/my`
     against the live `cam` while `applyUiIntents` recovers the point against
     `drawCam`, and this scene's teleports leave `cam.y` hundreds of px out. */
  await page.evaluate(() => __mf.frames(240));
  await realClick(page, gravelSlot.x + gravelSlot.w / 2, gravelSlot.y + gravelSlot.h / 2);
  const gravelArmed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armed: __mf.ui.armedPlace, sub: S.soil, form: F.gravel };
  });
  expect(gravelArmed.armed).toEqual({ sub: gravelArmed.sub, form: gravelArmed.form });

  /* Keyboard aim, facing right, at the hole just mined, so the form gate is
     the only thing between the press and a placed tile. */
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
    /* The toast, not the journal: `__mf.frames` ends with
       `shell/notify.js#drainJournal`, so the rows are already gone and the
       refusal text survives only in `view/fx.js#toasts`. */
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

  /* `data/recipes.js#stone_block` wants 10 gravel of one bulk element, and
     with nothing else affordable it is the row `rules/crafting.js#choose`
     picks. Its output is a falling item. */
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    __mf.give(S.soil, F.gravel, 10 - invCount(S.soil, F.gravel));
  });
  await page.evaluate(() => __mf.hold({ craft: 1, collect: 1 }, 400));   // stone_block secs 2.5
  await page.evaluate(() => { __mf.cmd.craft = false; });
  await page.evaluate(() => __mf.frames(150));       // let the block fall and be picked up

  const packed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    return { gravel: invCount(S.soil, F.gravel), block: invCount(S.soil, F.block) };
  });
  expect(packed.block).toBe(1);      // 10 -> 1, and exactly one
  expect(packed.gravel).toBe(0);     // all five spent

  /* The block armed by a click, then placed back at the tile just mined,
     aimed the same way. */
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

  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
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

/* The feed verb end to end: a real `pointerdown` on a real machine is what
   sets the flag, and the armed slot's lit border is a pixel claim -- neither
   of which a harness with no pointer and no canvas can make. */

const FEED = { tx: 22, ty: 117, farTx: 18 };   // the kiln, and a spot well out of its reach

test('REAL CLICK: clicking an ore slot arms it and lights its border, and LMB on a kiln in reach feeds exactly one unit per press', async ({ page }) => {
  await boot(page);
  await settle(page);

  /* A carved pocket in solid rock with a floor. The player starts at `farTx`,
     26 px clear of the footprint and well outside `handFeed.reach` (10 px), so
     the panel clicks below cost no ore to the magnet. */
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

    mw.place(band, M.kiln, tx, ty);
    pw.band(band);
    pw.move(worldX(band, farTx), worldY(band, ty));
    pw.vel(0, 0);
    pw.set('onGround', true);
    __mf.give(S.copper, F.ore, 8);
    __mf.cmd.hasMouse = false;
    /* The camera has to converge before any UI click: `draw` snapshots
       `drawCam` and `applyUiIntents` hit-tests against that, while
       `updateCamera` eases `cam` toward the teleported player at 5% a substep. */
    __mf.frames(300);
  }, FEED);

  /* A click on an ore slot arms it, though `ore` is neither tile-capable, a
     `rig` nor a `phial`. */
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

  /* Two draws with no step between them and the arm suppressed for the first,
     so only the arm can move a pixel. Slot rects are in screen space, the
     canvas's own space, so no camera term appears. */
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

    /* The other region an arm paints: the IN HAND row above the quickbar,
       read off the quickbar's own drawn rect rather than a hardcoded row. */
    const qb = __mf.ui.grids.find(gr => gr.id === 'quickbar');
    let readout = 0;
    for (let y = qb.y - 10; y < qb.y - 1; y++)
      for (let x = 0; x < c.width; x++)
        if (y >= 0 && moved((y * c.width + x) * 4)) readout++;
    return { total, inside, readout };
  }, oreSlot);
  expect(border.inside).toBeGreaterThan(0);        // the border is painted...
  expect(border.readout).toBeGreaterThan(0);       // ...so is the IN HAND readout...
  expect(border.total).toBe(border.inside + border.readout);   // ...and nothing else moved

  /* LMB on the kiln feeds it. The panel closes first, or `shell/input.js`
     routes the click to the widget layer instead of the world. */
  await page.evaluate(async ({ tx, ty }) => {
    const { closeTop } = await import('/src/shell/ui.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: pw } = await import('/src/model/player.js');
    closeTop();
    /* 6 px of clear air between the player's right edge and the footprint: PW
       is 6, so one tile width minus 12, inside `handFeed.reach`. */
    const band = bandOf('topsoil');
    pw.move(worldX(band, tx) - 12, worldY(band, ty));
    pw.vel(0, 0);
    pw.set('onGround', true);
    __mf.frames(1);
  }, FEED);

  /* The control frame: in reach, nothing pressed, so whatever it costs is the
     magnet's and the press frame below is measured against it. */
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

  /* A real pointer over the kiln, with a frame after the move so
     `model/aim.js` catches up before `pointerdown` reads it. */
  const seen = await page.evaluate(async ({ tx, ty }) => {
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const band = bandOf('topsoil');
    /* The centre of the kiln's left column in screen px, nearest the
       player so `eff('reach')`'s clamp in `rules/mining.js#aimAtWorld` stays
       out of it, derived from the band's geometry rather than typed. */
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
  expect(aimed.onMachine).toBe(true);         // the reticle is over the kiln

  await page.mouse.down();

  /* Read before a frame runs: `pointerdown` decided "feed" at the instant of
     the press and recorded it on `aim.mode` for the reticle. */
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

  /* Auto-feed defaults off, so the control frame costs nothing. */
  expect(control.pockets).toBe(0);
  expect(control.buffer).toBe(0);
  /* The press is worth exactly one unit more than that frame: one press, one
     unit. */
  expect(press.pockets).toBe(control.pockets + 1);
  expect(press.buffer).toBe(control.buffer + 1);
  /* The edge was consumed and the hand is not emptied, so ten ore in a row is
     one continuous action. */
  expect(press.feedFlag).toBe(false);
  expect(press.armedAfter).toEqual({ sub: armed.sub, form: armed.form });

  /* A wrong pair at the same reachable kiln, through the same real
     `pointerdown` path: the press still resolves as a feed and refuses, rather
     than falling through to a placement inside the footprint. */
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
  expect(wrongResult.placedThere).toBe(false);                  // and not placed inside the machine
});

const LAP = { tx: 22, ty: 117, startTx: 17, endTx: 27, ore: 8 };

/* One lap: right until well past the footprint, then back left to the start,
   sampling the closest the player's box came to the machine's. Returns ore
   spent, the buffer's change, and that gap in px (negative = overlap). */
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

test('AUTO FEED off (the default): a real lap past a hungry kiln costs nothing; one real click on the Character tab row brings the magnet back', async ({ page }) => {
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

    /* A carved corridor with a floor and a kiln standing on it, rather than
       a walkable flat trusted to worldgen. */
    const band = bandOf('topsoil');
    for (let y = ty - 6; y <= ty + 2; y++)
      for (let x = tx - 8; x <= tx + 8; x++) tw.clear(band, x, y);
    for (let x = tx - 8; x <= tx + 8; x++) tw.set(band, x, ty + 2, S.stone);
    __mf.revealAll(band);

    mw.place(band, M.kiln, tx, ty);
    pw.band(band);
    pw.move(worldX(band, startTx), worldY(band, ty));
    pw.vel(0, 0);
    pw.set('onGround', true);
    __mf.give(S.copper, F.ore, ore);
    __mf.cmd.hasMouse = false;
    /* The camera converges before any UI click: `applyUiIntents` hit-tests
       against the camera `draw` snapshotted, and `updateCamera` eases toward a
       teleported player for hundreds of substeps. */
    __mf.frames(300);
  }, LAP);

  /* The default is off, read off the real projection: `newRun` resets it. */
  expect(await page.evaluate(() => __mf.ui.autoFeed)).toBe(false);

  /* act 1: the lap costs nothing. */
  const off = await feedLap(page);
  expect(off.minGap).toBeLessThan(0);      // really walked through the footprint...
  expect(off.spent).toBe(0);               // ...and the pockets are untouched
  expect(off.buffered).toBe(0);            // ...and the buffer never saw a unit

  /* act 2: turned on with a real click on the row `view` drew. */
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'char');
    __mf.frames(1);
  });

  const row = await page.evaluate(() => __mf.ui.panels.find(p => p.id === 'main-auto-feed'));
  expect(row).toBeTruthy();                // `view` registered a rect for it
  await realClick(page, row.x + row.w / 2, row.y + row.h / 2);

  const toggled = await page.evaluate(() => ({
    autoFeed: __mf.ui.autoFeed, autoCollect: __mf.ui.autoCollect
  }));
  expect(toggled.autoFeed).toBe(true);
  /* The two toggles share a line, so only the clicked one may change. */
  expect(toggled.autoCollect).toBe(false);

  /* act 2b: the identical lap, and the magnet is back exactly. */
  await page.evaluate(async () => {
    const { closeTop } = await import('/src/shell/ui.js');
    closeTop();
    __mf.frames(1);
  });

  const on = await feedLap(page);
  expect(on.minGap).toBeLessThan(0);
  /* The kiln's ore cap fills exactly, and with no
     fuel given nothing consumes what went in, so the lot is countable. */
  expect(on.spent).toBe(LAP.ore);
  expect(on.buffered).toBe(LAP.ore);

  /* act 3: a restart puts it back off. */
  await page.evaluate(() => { __mf.newRun(1337); __mf.frames(2); });
  expect(await page.evaluate(() => __mf.ui.autoFeed)).toBe(false);
});

/* The kiln, the player beside it, and the tile the reticle sits on. `aimTx`
   is the kiln's own left column, so the ghost is over the machine and not
   over the air beside it. */
const HAND = { tx: 22, ty: 117, playerTx: 20, aimed: true, aimTx: 22, aimTy: 117 };

/* One scene, four states. `arm` names the pair that goes into the hand
   ('ore' | 'rung' | 'phial' | null), `buffer` pre-loads the kiln's ore
   clause so `feedCheck` has a `have`/`cap` other than 0/8, and `aimed:false`
   leaves the reticle invalid so nothing draws a ghost. */
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

    const m = mw.place(band, M.kiln, tx, ty);

    /* Two fuelled braziers: the room is 117 rows down and sealed, so
       `rules/light.js` leaves it at the floor value and the shot would
       otherwise be a black rectangle with a HUD on it. */
    for (const bx of [tx - 5, tx + 4]) {
      const brazier = mw.place(band, M.brazier, bx, ty);
      mw.take(brazier, S.timber, F.log, 4);
    }

    pw.band(band);
    pw.move(worldX(band, spec.playerTx), worldY(band, ty));
    pw.vel(0, 0);
    pw.set('onGround', true);
    __mf.cmd.hasMouse = false;
    banner.fade = 0;                 // past the title card

    /* An armed pair has to live in a quickbar cell to be on screen with every
       panel shut, and `write.collect` only allocates in the main range, so this
       is `putInQuickbar`'s collect-then-`moveSlot`, inlined for three pairs. */
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

    /* Past the brazier's own 6 s fuel recipe, then a settle. */
    __mf.frames(700);

    /* The ore clause is loaded after the substeps, and no substep runs after
       this point: `rules/machines.js#step` owns the buffer and `updateCamera`
       owns the camera the shot parks below. */
    const def = MACH[m.def];
    if (spec.buffer) mw.take(m, S.copper, F.ore, spec.buffer);

    clearArmedPlace();
    if (spec.arm) {
      const [sub, form] = PAIRS[spec.arm];
      armPlace(sub, form);
    }
    if (spec.aimed) aimw.set(band, spec.aimTx, spec.aimTy, true);
    else aimw.set(band, 0, 0, false);

    /* Centred off `VIEW`, not a hardcoded size: the base buffer is a function
       of the window in `core/canvas.js#resize`. */
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

/* Two draws with `action` the only thing running between them -- no substep,
   no camera ease, no clock advance -- so every moved pixel is attributable to
   it. */
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

  /* Nothing is open, and the pair the readout names is really in the hand. */
  expect(r.panels).toBe(0);
  expect(r.armed).not.toBe(null);
  expect(r.quickbar).not.toBe(null);
  await shot(page, 'in-hand-rung.png');
});

test('16c: the IN HAND line is not vacuous -- it exists only while something is armed, above the quickbar', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await handScene(page, { arm: 'rung', aimed: false });

  /* The band the readout owns: full screen width, from just above the
     quickbar's top edge to that edge. Not the text's own measured rect, which
     would re-derive `inHand`'s layout and prove only this test's arithmetic. */
  const band = { x: 0, y: r.quickbar.y - 10, w: 4096, h: 9 };

  const off = await pixelDelta(page, 'clear', band);
  expect(off.inside).toBeGreaterThan(0);          // the line is painted there...
  expect(off.total).toBeGreaterThan(off.inside);  // ...and the slot frame moved too

  /* Re-arming from the cleared state moves exactly the same pixels back, an
     equality because the two transitions are each other's inverse. */
  const on = await pixelDelta(page, 'arm-rung', band);
  expect(on.inside).toBe(off.inside);
  expect(on.total).toBe(off.total);
});

test('16c: the feed preview says a kiln WILL take the armed ore, and how full its clause is', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await handScene(page, { arm: 'ore', buffer: 3 });

  /* The numbers the ghost prints, read back through the same model queries, so
     this asserts 3 of 8 rather than a remembered string. */
  expect(r.buffered).toBe(3);
  expect(r.cap).toBe(12);
  expect(await page.evaluate(async ({ tx }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { feedCheck } = await import('/src/model/machines.js');
    const m = __mf.machines.find(mm => mm.tx === tx);
    return feedCheck(m, S.copper, F.ore).ok;
  }, HAND)).toBe(true);
  await shot(page, 'feed-ghost-ok.png');
});

test('16c: the same kiln at the same reticle REFUSES a rung, and says why before the click', async ({ page }) => {
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

  /* The footprint in screen space, from the machine's world box and the parked
     camera, padded up by the label's own line. */
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

  /* nothing -> a rung: the preview comes back in the refusal's colour and
     words, a different picture from the accepting one. */
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

/* The down-frame-up shape `realClick` uses, for the right button.
   `shell/input.js`'s pointerdown handler branches on `model/aim.js#aim`, which
   resolves only inside `step`, so a frame after the move lets `aim` catch up
   to the pointer before the handler reads it. */
async function realRightClick(page, sx, sy) {
  const { x, y } = await toClient(page, sx, sy);
  await page.mouse.move(x, y);
  await page.evaluate(() => __mf.frames(1));
  await page.mouse.down({ button: 'right' });
  await page.evaluate(() => __mf.frames(1));
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => __mf.frames(1));
}

test('the kiln build lifecycle: crafting UI, ghost, no-fuel, fuelled, running, deconstruct', async ({ page }) => {
  await boot(page);
  await settle(page);

  /* The stock pickaxe is collected first because it otherwise lies near spawn
     as a loose item, and `view/hover.js` ranks a falling item above a machine,
     so it would win every hover check below. */
  await page.evaluate(async () => {
    /* Auto-collect for the walk-over below and for the deconstruct refund at
       the end; auto-feed because stages 4 and 5 give the kiln its fuel and
       ore by putting them in the pockets and waiting. */
    const { setAutoCollect, setAutoFeed } = await import('/src/shell/ui.js');
    setAutoCollect(true);
    setAutoFeed(true);
    __mf.cmd.hasMouse = false;
    __mf.hold({ right: 1 }, 90);
    __mf.cmd.right = false;
    __mf.frames(60);
  });

  /* stage 1: open the crafting UI. */
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    const { banner } = await import('/src/view/fx.js');
    __mf.revealAll(bandOf('surface'));
    __mf.cmd.hasMouse = false;
    /* `drawHUD` draws the title card instead of the tooltip while
       `banner.fade > 0`, and `settle` advances `clock.t` without running
       `stepFx`, so hover would never resolve anything below. */
    banner.fade = 0;
  });
  await page.keyboard.press('e');       // opens the main panel
  await page.evaluate(() => __mf.frames(1));

  let ui = await page.evaluate(() => __mf.ui);
  const mainTabs = ui.tabs.find(t => t.id === 'main');
  const craftTab = mainTabs.hits.find(h => h.id === 'craft');
  await realClick(page, craftTab.x + craftTab.w / 2, craftTab.y + craftTab.h / 2);

  ui = await page.evaluate(() => __mf.ui);
  expect(ui.tab.main).toBe('craft');
  await shot(page, 'kiln-lifecycle-1-crafting-ui.png');

  /* stage 2: arm a kiln/rig by clicking its Character-tab slot, aim it, and
     shoot the ghost before the placement is confirmed. */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { setTab } = await import('/src/shell/ui.js');
    /* Known from the start, granted here so the fixture states it. */
    write.grant('kiln');
    setTab('main', 'char');
  });
  await putInMain(page, 'kiln', 'rig');
  await page.evaluate(() => __mf.frames(1));

  const invSlot = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'inv');
    return grid.slots.find(s => s.sub === S.kiln && s.form === F.rig);
  });
  expect(invSlot).toBeTruthy();
  await realClick(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2);

  const armed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armedPlace: __mf.ui.armedPlace, sub: S.kiln, form: F.rig };
  });
  expect(armed.armedPlace).toEqual({ sub: armed.sub, form: armed.form });

  /* Keyboard aim with no direction held lands to the side, at the player's own
     row, on open air with a floor beneath it. Closed with 'e' rather than
     Escape, which would also clear the arm, so the ghost is not under the panel. */
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });
  await page.keyboard.press('e');
  await page.evaluate(() => __mf.frames(1));

  ui = await page.evaluate(() => __mf.ui);
  expect(ui.open).not.toContain('main');
  const armedStillSet = await page.evaluate(() => __mf.ui.armedPlace);
  expect(armedStillSet).toBeTruthy();

  await shot(page, 'kiln-lifecycle-2-ghost.png');

  /* stage 3: confirm the placement -- placed, no fuel. */
  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
  await page.evaluate(() => { __mf.cmd.place = true; });
  await page.evaluate(() => __mf.frames(5));

  const placed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { invCount } = await import('/src/model/run.js');
    /* Excludes the director's own altar, so this counts the kiln just
       placed. */
    return {
      machines: __mf.machines.filter(m => m.def !== M.altar).length,
      rig: invCount(S.kiln, F.rig), armedAfter: __mf.ui.armedPlace
    };
  });
  expect(placed.machines).toBe(1);
  expect(placed.rig).toBe(0);
  expect(placed.armedAfter).toBeNull();

  await shot(page, 'kiln-lifecycle-3-no-fuel.png');

  /* Hovers the machine's centre, world px converted to screen by subtracting
     the current camera, in one round trip so the camera read and the hover read
     describe the same frame. Looked up by def: the altar is in the array too. */
  const hoverMachine = () => page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const m = __mf.machines.find(mm => mm.def === M.kiln);
    __mf.mouseAt(m.box.x + m.box.w / 2 - __mf.cam.x, m.box.y + m.box.h / 2 - __mf.cam.y);
    __mf.draw();
    return { ...__mf.hover };
  });

  let hover = await hoverMachine();
  expect(hover.active).toBe(true);
  expect(hover.lines[0]).toBe('BASIC KILN');
  expect(hover.lines[1]).toBe('NO FUEL');

  /* stage 4: fuelled, no resources -- idle. Exactly `data/recipes.js#smelt`'s
     fuel bill of 1, pulled in as soon as the player is in reach, the footprint
     having been anchored beside where they already stand. */
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    __mf.give(S.timber, F.log, 1);
    __mf.cmd.hasMouse = false;
    __mf.frames(30);                     // let hand-feed pull it into the buffer
  });
  await shot(page, 'kiln-lifecycle-4-fuelled-idle.png');

  hover = await hoverMachine();
  expect(hover.lines[1]).toBe('IDLE');
  expect(hover.lines.some(l => l.startsWith('MAKING'))).toBe(false);

  /* stage 5: fuelled and resourced -- producing. One ore against the one log
     already banked, so a single cycle fires and the buffer empties with
     nothing left to refill it, which is the state the deconstruct below
     needs: in a kiln one log is exactly one smelt. */
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    __mf.give(S.copper, F.ore, 1);
    __mf.frames(60);                     // let hand-feed pull it in and the recipe start
  });

  const running = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.find(m => m.def === M.kiln).running;
  });
  expect(running).toBe(true);

  await shot(page, 'kiln-lifecycle-5-running.png');

  hover = await hoverMachine();
  expect(hover.lines[1]).toBe('RUNNING');
  expect(hover.lines[2]).toBe('MAKING SMELT');

  /* The smelt cycle finishes and the buffer drains first:
     `rules/placement.js#deconstruct` refuses while anything is buffered. */
  await page.evaluate(() => __mf.frames(600));   // several 3.0 s smelt cycles' worth of margin

  const drained = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const m = __mf.machines.find(mm => mm.def === M.kiln);
    return { bufKeys: Object.keys(m.buf).length, charges: m.charges };
  });
  expect(drained.bufKeys).toBe(0);
  expect(drained.charges).toBe(0);

  const target = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const m = __mf.machines.find(mm => mm.def === M.kiln);
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

    /* The refund is a falling item, never a pocket credit: it has to land
       within `eff('pickupR')` (10 px) of the player, and the toss is
       randomised sideways, so the player is moved onto where it landed. */
    __mf.frames(30);                     // let it fall and come to rest
    const dropped = items.find(it => it.sub === S.kiln && it.form === F.rig);
    if (dropped) pw.move(dropped.x - PW / 2, __mf.player.y);
    __mf.frames(200);

    /* Excludes the director's own altar: the kiln's own count is what
       reads 0. */
    return {
      machines: __mf.machines.filter(m => m.def !== M.altar).length,
      rigBack: invCount(S.kiln, F.rig), droppedFound: !!dropped
    };
  });
  expect(after.machines).toBe(0);
  expect(after.droppedFound).toBe(true);
  expect(after.rigBack).toBe(1);
});

/* Dev serves src/ untransformed; dist is bundled and minified by esbuild.
   Requires `npm run build` first -- `npm run parity` does both. */
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

async function winchScene(page, spec) {
  return page.evaluate(async (spec) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { write: mw } = await import('/src/model/machines.js');
    const { write: tw } = await import('/src/model/tiles.js');
    const { write: pw } = await import('/src/model/player.js');
    const { ascending, write: segw, linkCheck, phaseOf, railT, segments } =
      await import('/src/model/segments.js');
    const car0 = seg => seg.carriers[0];
    const { write: aimw } = await import('/src/model/aim.js');
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { armLink, clearLink } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');

    const band = bandOf(spec.band || 'surface');
    const { tx0, ty0, w, h } = spec.room;

    /* Carved from row 0 unless `sealed`, so the shaft is sky-exposed and
       `rules/light.js` floods it at `lightMax`. */
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

    /* Carrier position, load and rotation phase are set after the substeps:
       `rules/drive.js` owns all three and overwrites anything written before
       `frames`. These shots are deliberately static. */
    for (const [i, t, load] of spec.carriers || []) {
      /* One bucket per rope at rail parameter `t` going up. A rope is a loop
         and a fresh one carries nothing, so the bucket is hung here. */
      const seg = segments[i];
      segw.spin(seg, -seg.u, 0);
      while (seg.carriers.length) segw.detach(seg, seg.carriers[0]);
      const c = segw.attach(seg, t / 2);
      segw.load(seg, load || 0);
      segw.carrierLoad(c, load || 0);
    }

    /* `n` buckets spread evenly round the loop, which is what a player builds
       and the only arrangement that shows both strands at once. `load` fills
       the ascending half, so the counterweight reads in the picture. */
    for (const [i, n, load] of spec.chain || []) {
      const seg = segments[i];
      segw.spin(seg, -seg.u, 0);
      while (seg.carriers.length) segw.detach(seg, seg.carriers[0]);
      for (let k = 0; k < n; k++) {
        const c = segw.attach(seg, k / n);
        segw.carrierLoad(c, k / n < 0.5 ? (load || 0) : 0);
      }
      segw.load(seg, (load || 0) * Math.ceil(n / 2));
    }
    for (const [i, phase] of spec.turns || []) mw.turn(placed[i], phase);

    /* Armed and aimed last, through the model: `rules/mining.js#aimAtWorld`
       clamps a pointer to `eff('reach')`, 3.2 tiles, so a ghost stretched to a
       hub twelve tiles away cannot be produced by moving a pointer at all. */
    if (spec.arm !== undefined) {
      armLink(placed[spec.arm]);
      aimw.set(band, spec.aimAt[0], spec.aimAt[1], true);
    }

    /* The room is centred in the viewport rather than pinned to its
       top-left corner. */
    const { VIEW } = await import('/src/core/canvas.js');
    __mf.cam.x = Math.round(worldX(band, tx0) + w * band.tile / 2 - VIEW.w / 2)
               + (spec.offset?.[0] ?? 0);
    __mf.cam.y = Math.round(worldY(band, ty0) + h * band.tile / 2 - VIEW.h / 2)
               + (spec.offset?.[1] ?? 0);
    __mf.draw();

    return {
      machines: placed.length, segments: segments.length, refusals,
      carriers: segments.map(s => s.carriers.length),
      strands: segments.map(s => ({
        up: s.carriers.filter(c => ascending(phaseOf(s, c))).length,
        down: s.carriers.filter(c => !ascending(phaseOf(s, c))).length
      })),
      /* `t` is the first bucket's rail parameter: 0 at the low anchor, 1 at
         the high one, whichever strand of the loop it is on. */
      seg: segments.map(s => ({
        t: railT(phaseOf(s, car0(s))), load: s.load,
        len: Math.round(s.len), slope: +s.slope.toFixed(2)
      }))
    };
  }, spec);
}

/* A vertical shaft four tiles wide with rock either side, used by the chain
   shots; `tx0+1..tx0+4` is carved and the cable runs inside it. */
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

/* The same vertical segment at three carrier positions: the bucket chain is
   phase-locked to the carrier, so `t` changes the whole picture rather than one
   sprite's position. */
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

/* Four buckets spread round the loop put two on each strand, loaded going up
   and empty coming down. One bucket cannot show either strand. */
test('winch: a bucket chain, loaded up one strand and empty down the other', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, { ...VERTICAL, chain: [[0, 4, 14]] });
  expect(r.segments).toBe(1);
  expect(r.carriers).toEqual([4]);
  expect(r.strands).toEqual([{ up: 2, down: 2 }]);
  await shot(page, 'winch-bucket-chain.png');
});

test('winch: a loaded carrier', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, { ...VERTICAL, carriers: [[0, 0.5, 34]] });
  expect(r.seg[0].load).toBe(34);
  await shot(page, 'winch-carrier-loaded.png');
});

/* Three angles and a horizontal, with `slope` asserted: it is the number
   `rules/drive.js` divides gravity by, so a shot named "45" whose slope had
   drifted would baseline the wrong mechanic. */
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
    room: ROOM, machines: [['winch', 44, 43]], player: [41, 43]
  });
  expect(r.machines).toBe(1);
  await shot(page, 'winch-crank.png');
});

/* A crank, two gears and a hub, all orthogonally adjacent: every footprint
   shares a full edge with the next, which is the drivetrain
   `rules/drive.js` solves. */
test('winch: a crank, a two-gear train and a hub', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: ROOM,
    machines: [['winch', 44, 43], ['transformer', 45, 44], ['drive_wheel', 46, 44], ['hub', 47, 43]],
    player: [41, 43]
  });
  expect(r.machines).toBe(4);
  await shot(page, 'winch-train.png');
});

/* Diagonals do not conduct torque; a corner needs a gear in it. Left, a
   diagonal pair with nothing bridging the corner; right, the same corner with
   a third gear in it. */
test('winch: a diagonal gear pair does not mesh, and a cornered one does', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: ROOM,
    rock: [[44, 43], [46, 44], [50, 43], [52, 43]],
    machines: [['drive_wheel', 44, 42], ['drive_wheel', 45, 43],
               ['drive_wheel', 50, 42], ['drive_wheel', 51, 42], ['drive_wheel', 51, 43], ['drive_wheel', 52, 42]],
    player: [41, 43]
  });
  expect(r.machines).toBe(6);
  await shot(page, 'winch-gears-diagonal.png');
});

/* A three-segment chain, and the same chain with the middle one missing.
   `model/segments.js#chains` is derived and never stored, so these two are the
   difference between a chain that reads continuous and one that reads broken. */
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

/* A nonzero rotation phase, written through `model/machines.js#write.turn`, so
   the phase comes from a model number rather than a frame counter: the same
   spec drawn twice at the same phase is the same pixels. */
test('winch: a gear train at a nonzero rotation phase', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await winchScene(page, {
    room: ROOM,
    machines: [['winch', 44, 43], ['transformer', 45, 44], ['drive_wheel', 46, 44], ['hub', 49, 43]],
    turns: [[0, 0.9], [1, 0.9], [2, 0.9], [3, 0.9]],
    player: [41, 43]
  });
  expect(r.machines).toBe(4);
  await shot(page, 'winch-turned.png');
});

/* `winch-ghost-none.png` is this same scene with nothing armed, and the third
   test reads both canvases back and asserts they differ, so a ghost that drew
   nothing would fail the comparison rather than re-baseline two hubs. */
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

/* A segment emits no light of its own, so a cable in a sealed shaft is as dark
   as the rock around it. Baselined both ways, so a darkness pass that skipped
   live-drawn machinery would have to move one of them. */
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

/* A cable, a bucket chain, a carrier with cargo, a turned gear train and the
   cable ghost, all on screen at once and drawn twice: `model/epoch.js` must
   not move. */
test('winch: drawing the whole family writes nothing to the model', async ({ page }) => {
  await boot(page);
  await settle(page);
  await winchScene(page, {
    room: TALL,
    machines: [['hub', 44, 43], ['hub', 44, 35], ['winch', 46, 43],
               ['transformer', 47, 44], ['drive_wheel', 48, 44]],
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

/* The states that exist only while something is moving. Nothing is written
   after `frames`, so a carrier's position is wherever `rules/drive.js` put it
   and a gear's phase is however far it actually turned. */

/* Cranks every two rows up a wall, bottom-to-top, all footprint-adjacent and
   therefore all one drivetrain component. */
const CRANKS = (tx, tyTop, tyBottom) => {
  const out = [];
  for (let ty = tyBottom; ty >= tyTop; ty -= 2) out.push(['winch', tx, ty]);
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
    const { ascending, write: segw, linkCheck, phaseOf, railT, segments, carrierPos, carrierTop } =
      await import('/src/model/segments.js');
    const car0 = seg => seg.carriers[0];
    /* World-y direction of the first bucket: -1 rising, +1 sinking. The loop's
       own `spin` is forward/back, which is rising only on the up strand. */
    const dirOf = s => (ascending(phaseOf(s, car0(s))) ? -s.spin : s.spin);
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { eff } = await import('/src/model/mods.js');
    const { clearLink, setAutoCollect } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');
    const { VIEW } = await import('/src/core/canvas.js');

    /* Auto-collect on for every scene this helper builds, so the boot-placed
       stock pickaxe near spawn is swept up rather than left as clutter a
       teleported player lands beside. Set, never toggled. */
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

    /* Past the tutorial callout: four beats is where `data/callouts.js` runs
       out of strings. */
    while (run.tutorialBeat < 4) rw.advanceBeat();

    pw.band(main);
    pw.move(worldX(main, spec.player[0]), worldY(main, spec.player[1]));
    banner.fade = 0;
    clearLink();
    __mf.cmd.hasMouse = false;

    /* The beat jump releases the altar, so its arrival is waited out here --
       after the player is parked in the shaft, so two seconds of idle
       simulation cannot sweep up the pickaxe at spawn. */
    __mf.frames(arrival);

    /* Anything that has to happen before the motion is measured -- lighting a
       brazier, mostly, which the carrier would otherwise spend sliding down. */
    if (spec.preFrames) __mf.frames(spec.preFrames);

    /* The start state, parked after the pre-roll and before the motion. */
    /* Every rope gets a bucket: a loop with none carries nothing at all. */
    for (const seg of segments) segw.attach(seg, 0);
    for (const [i, t] of spec.start || []) {
      const seg = segments[i];
      segw.spin(seg, -seg.u, 0);
      while (seg.carriers.length) segw.detach(seg, seg.carriers[0]);
      segw.attach(seg, t / 2);
    }
    if (spec.burden) rw.collect(S.copper, F.ore, spec.burden);
    for (const [i, sub, form, n] of spec.cargo || []) {
      const p = carrierPos(segments[i], car0(segments[i]));
      for (let k = 0; k < n; k++) {
        const it = iw.spawn(segments[i].band, p.x, p.y, S[sub], F[form], 0, 0);
        if (it) it.rest = 1;
      }
    }
    if (spec.ride !== undefined) {
      const seg = segments[spec.ride];
      pw.move(carrierPos(seg, car0(seg)).x - PW / 2, carrierTop(seg, car0(seg)) - PH);
      pw.vel(0, 0);
      pw.set('onGround', true);
      pw.set('fallFrom', carrierTop(seg, car0(seg)) - PH);
    }

    /* Nothing is written after the motion. `cmd.action` is the crank hold;
       `spec.turn` is this builder's own field name for the scene's intent. */
    /* `riseTo` is a cable parameter and `frames` a substep count: a substep
       count is calibrated to `eff('segUp')` and goes stale when that tunable
       moves, and `riseTo` only holds on a drivetrain saturated enough to run
       at the full `segUp`. */
    const frames = spec.frames ?? Math.round(
      ((spec.riseTo - railT(phaseOf(segments[0], car0(segments[0]))))
        * segments[0].len / eff('segUp')) * 120);
    __mf.cmd.action = !!spec.turn;
    __mf.frames(frames);
    __mf.cmd.action = false;

    const centre = spec.centreOn
      ? { x: carrierPos(segments[spec.centreOn], car0(segments[spec.centreOn])).x,
          y: carrierPos(segments[spec.centreOn], car0(segments[spec.centreOn])).y }
      : { x: worldX(main, rooms[0].tx0) + rooms[0].w * main.tile / 2,
          y: worldY(main, rooms[0].ty0) + rooms[0].h * main.tile / 2 };
    __mf.cam.x = Math.round(centre.x - VIEW.w / 2) + (spec.offset?.[0] ?? 0);
    __mf.cam.y = Math.round(centre.y - VIEW.h / 2) + (spec.offset?.[1] ?? 0);
    __mf.draw();

    return {
      machines: placed.length, segments: segments.length, refusals,
      hearts: run.hearts, beat: run.tutorialBeat,
      seg: segments.map(s => ({
        t: +railT(phaseOf(s, car0(s))).toFixed(4), dir: dirOf(s), load: +s.load.toFixed(2),
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

/* `riseTo` rather than `frames`: the crank stack saturates this span's
   drivetrain, so the budget is the cable distance over `eff('segUp')` and the
   carrier stays half way up its 80 px cable through a retune. */
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
  expect(r.seg[0].dir).toBe(-1);                       // -1 is up
  expect(r.seg[0].t).toBeGreaterThan(0.15);
  expect(r.seg[0].t).toBeLessThan(0.95);
  expect(r.driven).toBeGreaterThan(0);                 // a crank is in reach
  expect(r.hearts).toBe(5);                            // and riding costs nothing
  await shot(page, 'drive-ascending-rider.png');
});

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
  expect(r.seg[0].dir).toBe(1);                        // +1 is down
  expect(r.seg[0].t).toBeGreaterThan(0.15);
  expect(r.seg[0].t).toBeLessThan(0.85);
  expect(r.seg[0].load).toBeGreaterThan(0);            // the cargo is aboard, not lost
  expect(r.driven).toBe(0);                            // nothing is driving it
  await shot(page, 'drive-descending-loaded.png');
});

/* The winch is turning and the drivetrain is delivering torque, and the
   bucket still goes down, because the rider carries more than it can lift.
   The 'TOO HEAVY TO LIFT' toast is in the frame on purpose. */
test('drive: a reversing carrier under an over-cap rider', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await driveScene(page, {
    rooms: [MOTION_SHAFT],
    machines: [['hub', 44, 43], ['hub', 44, 37], ['winch', 43, 41], ['drive_wheel', 43, 43]],
    links: [[0, 1]], start: [[0, 0.4]], ride: 0, burden: 45, turn: true,
    frames: 40, player: [47, 43], centreOn: 0
  });
  expect(r.segments).toBe(1);
  /* Four, not three: the rope conducts power, so the far hub is in the same
     component as the winch and reads the same delivered drive. */
  expect(r.driven).toBe(4);
  expect(r.seg[0].dir).toBe(1);                        // and it is going down
  expect(r.seg[0].t).toBeGreaterThan(0.15);
  expect(r.seg[0].t).toBeLessThan(0.4);
  /* The rider's own mass is the load, over the 40 T cap: 8 T of body plus 45 T
     of ore. Boarding is never refused at any weight, only felt. */
  expect(r.seg[0].load).toBeGreaterThan(40);
  await shot(page, 'drive-reversing-overcap.png');
});

/* The key is held and the drivetrain arrives at its own phase, rather than a
   phase written into the model, which is what can catch a wheel that has
   stopped meshing. */
test('drive: a winch and a gear train being turned', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await driveScene(page, {
    rooms: [{ tx0: 40, ty0: 28, w: 15, h: 18, band: 'surface', sky: true }],
    machines: [['hub', 44, 43], ['hub', 44, 35], ['winch', 46, 43],
               ['transformer', 47, 44], ['drive_wheel', 48, 44]],
    links: [[0, 1]], start: [[0, 0.5]], turn: true, frames: 90, player: [47, 41]
  });
  expect(r.segments).toBe(1);
  /* All five turn: the winch, the transformer, the drive wheel, the hub they
     are adjacent to, and the far hub eight tiles up -- the rope between the
     two hubs carries power as well as the bucket. */
  expect(r.turning).toBe(5);
  expect(r.driven).toBe(5);
  expect(r.seg[0].dir).toBe(-1);
  await shot(page, 'drive-winch-train-turning.png');
});

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

/* Both bands are carved from the anchors' own rows: a window sized from a
   hub's placement tile misses the lower band's row 0 entirely. A brazier lights
   it, thirty tiles below the surface floor. */
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

/* The narrow layout floor, which is a desktop condition: `core/canvas.js#resize`
   clamps the buffer to 200x180 at `scale = max(2, min(6, round(ih / 400)))`, so
   any window around 400x360 renders at exactly this buffer. Reached through
   `__mf.resize` rather than a second Playwright project. */
const narrowFloor = page => page.evaluate(() => { __mf.resize(200, 180); __mf.draw(); });

/* Exactly one altar stands and it lies inside the buffer being photographed,
   which a baseline alone cannot say. Screen px, camera already subtracted. */
const altarOnScreen = page => page.evaluate(async () => {
  const { M } = await import('/src/data/machines.js');
  const standing = __mf.machines.filter(m => m.def === M.altar);
  if (standing.length !== 1) return { standing: standing.length };
  const b = standing[0].box, c = document.getElementById('stage');
  const x = b.x - __mf.cam.x, y = b.y - __mf.cam.y;
  return { standing: 1, onScreen: x + b.w > 0 && y + b.h > 0 && x < c.width && y < c.height };
});

/* `settle` alone arms cycle 1: `rules/cycles.js#step` runs inside `newRun`'s
   first frames, and cycle 1's `deadlineSecs` is null, so TRIBUTE draws no timer
   line for it. */
test('tribute: cycle 1 armed, no clock', async ({ page }) => {
  await boot(page);
  await settle(page);
  await altarArrives(page);
  await pastArrival(page);
  expect(await altarOnScreen(page)).toEqual({ standing: 1, onScreen: true });
  await shot(page, 'tribute-cycle1-armed.png');
});

/* Written directly rather than played to: `rw.tribute`/`rw.cycle`/`rw.favour`
   are the same writers `rules/cycles.js` calls, so this is the state a real run
   reaches at cycle 3, without building the astral chain to get there. */
test('tribute and favour: mid-cycle-3, two of three gods known, a boon active', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    const { grant } = await import('/src/rules/boons.js');
    const { BOONS } = await import('/src/data/boons.js');
    /* Beat 10 is past every `data/callouts.js` row that has a string, so a
       panel-crowding shot is not dominated by an unrelated callout; a run at
       cycle 3 has fired every beat anyway. */
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

/* The one scene with a labelled demand row sitting directly under an over-cap
   burden bar whose value is wide enough to crowd it. */
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

/* `view/hud.js#winScreen` shares `endScreen` with the death screen, so a
   layout regression here would take both down together. */
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

/* A hash of the whole canvas, or of one rectangle of it. A crop matters where
   the subject is small: a flashing clock is 30 px on a 640x400 frame, and a
   whole-canvas hash would answer for anything else that moved. */
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

/* Cycle 4 armed with both demand rows full, and a batch ledger built to order.
   `credits` is a list of unit counts stamped at the current `run.t`, the shape
   `rules/cycles.js#creditTribute` produces and `prunedCredits` then bounds. */
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
    /* Both demand piles filled from the row itself, so retuning the counts
       keeps the aggregate at the 80% this test is about. */
    const { CYCLE } = await import('/src/data/cycles.js');
    const have = {};
    for (const d of CYCLE['salt-tribute'].demand) have[keyOf(S[d.sub], F[d.form])] = d.n;
    rw.tribute({ id: 'salt-tribute', have, left, credits: credits.map(n => ({ t: run.t, n })) });
    /* The opening title card is still up two substeps in, and stepping past it
       with cycle 4 armed and paid would let `rules/cycles.js` complete the
       trial, so `banner.fade` is cleared directly. */
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

/* The batch row, and an aggregate that cannot read 100% while the trial is
   unpaid: both demand piles full with an empty batch window is 77%. */
test('17e: a rated cycle 4 reads honestly at every stage of its batch window', async ({ page }) => {
  await boot(page);
  await settle(page);

  /* Read off the cycle table, so retuning the batch retunes the fixture. */
  const N = await page.evaluate(async () => {
    const { CYCLES } = await import('/src/data/cycles.js');
    return CYCLES[3].batch.n;
  });

  await ratedCycle(page, { credits: [] });
  const empty = await tributeBars(page);
  expect(empty.met).toBe(false);
  expect(Object.keys(empty.bars)).toContain('tribute-batch');
  expect(empty.bars['tribute-batch'].valueText).toBe(`0 / ${N}`);
  expect(empty.bars['tribute-batch'].label).toBe('COPPER INGOT IN 2:00');
  /* The same row abbreviates rather than running under FAVOUR when the column
     cannot hold the full name. */
  await narrowFloor(page);
  const floor = await tributeBars(page);
  expect(floor.bars['tribute-batch'].label).toBe('CU ING IN 2:00');
  await page.evaluate(() => { __mf.resize(1280, 800); __mf.draw(); });
  expect(empty.bars['tribute-progress'].valueText).not.toBe('100%');
  expect(empty.bars['tribute-progress'].valueText).toBe('77%');
  await shot(page, 'tribute-cycle4-batch-empty.png');

  await ratedCycle(page, { credits: [1, N - 2] });
  const part = await tributeBars(page);
  expect(part.met).toBe(false);
  expect(part.bars['tribute-batch'].valueText).toBe(`${N - 1} / ${N}`);
  expect(part.bars['tribute-progress'].valueText).not.toBe('100%');

  await ratedCycle(page, { credits: [N] });
  const full = await tributeBars(page);
  expect(full.met).toBe(true);
  expect(full.bars['tribute-batch'].valueText).toBe(`${N} / ${N}`);
  expect(full.bars['tribute-progress'].valueText).toBe('100%');
  await shot(page, 'tribute-cycle4-batch-full.png');
});

/* One credit two over the demand proves the bar is clamped rather than reading
   the query: `prunedCredits` keeps that entry whole, so `batchHave` answers
   the raw count. */
test('17e: the batch bar is clamped at batch.n, not a raw delivery count', async ({ page }) => {
  await boot(page);
  await settle(page);
  const N = await page.evaluate(async () => {
    const { CYCLES } = await import('/src/data/cycles.js');
    return CYCLES[3].batch.n;
  });
  await ratedCycle(page, { credits: [N + 2] });
  const over = await tributeBars(page);
  const raw = await page.evaluate(async () => {
    const { batchHave } = await import('/src/model/run.js');
    return batchHave();
  });
  expect(raw).toBe(N + 2);
  expect(over.bars['tribute-batch'].valueText).toBe(`${N} / ${N}`);
  expect(over.bars['tribute-batch'].frac).toBe(1);
  expect(over.bars['tribute-progress'].valueText).toBe('100%');
});

/* Nothing about a miss changes the world, so the canvas hash is the whole
   assertion: the two frames differ only if something drew the count. */
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

/* The flash is `((t * 6) | 0) % 2`, so the two times below straddle 10.0 s by
   a tenth of a millisecond: the clouds drift on the same `clock.t` under the
   TRIBUTE column, and 0.0002 s cannot move one by a whole pixel. */
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

/* Two deaths whose runs went differently must not render the same tally. The
   crop is the two rows above the restart button: the wash is translucent, so a
   whole-canvas hash would answer for the FAVOUR bars showing through it. */
async function deathScene(page) {
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    while (run.tutorialBeat < 10) rw.advanceBeat();
    rw.tribute(null);
    rw.hurt(run.hearts, 'A FALL FROM THE LEDGE');
    __mf.draw();
  });
}

/* The tally is written onto the same dead run: a second `newRun` would put a
   second world behind the translucent wash, and `view/paint.js` repaints at
   most `REPAINT_BUDGET` chunks a frame. */
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

/* A real wheel over the stat region, reading back the lines actually drawn: a
   rect recorded with the right `rows` but drawing the wrong slice would pass a
   count assertion and fail this one. */
const STAT_LABELS = ['WALK', 'CLIMB', 'PICK POWER', 'BURDEN CAP', 'KILN RATE'];

/* Puts away what the HUD draws over the main panel -- the title card, the last
   toast, and the world tooltip the pointer left behind. `pointerleave` is the
   real event `shell/input.js` listens for. */
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

/* Down one real wheel notch at a time, collecting every line drawn on the way.
   The offset is zeroed through `shell/ui.js#scrollSet` rather than wheeled back
   up: `scrollBy` stores the raw value and only the draw clamps it, and Chromium
   coalesces a run of upward wheel events into one. */
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

test('17e: every stat row is reachable in the Character tab, at the desktop buffer and at the 200 px floor', async ({ page }) => {
  await boot(page);
  await settle(page);
  /* Beat 4 is the one index `data/callouts.js` leaves null. A callout, a toast
     and the title card all draw over the main panel by design, and all three
     would sit on the rows this scene exists to show. */
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

/* Beat 4 is the one index `data/callouts.js` leaves null, so the same scene at
   beat 0 and at beat 4 differs only by the callout: if the callout clears the
   strip, the pixels inside the strip's own recorded rectangle match. */
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

/* `spark` is a module-scope generator seeded from a constant, so `reset` has to
   rewind it or a chip's scatter depends on how many chips the page has ever
   emitted. */
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

/* The surface band declares the contact zone at row 27, 4 tiles thick, run
   across the whole band width outside the spawn shelf (`SHELF` 9 + `BLEND` 3
   either side of `spawnTx` 42), so tx 80 is clear of it. Full frame, because
   the fingering is a property of many columns at once. */
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

/* `granite` (`graniteB` #b3b0ba) is the one rock substance that reads as pale
   against copper's warm orange, and the topsoil band overlaps a copper `blobs`
   row (rows 4-180) with a granite one (rows 120-320), so the two are found
   together rather than placed by hand. */
const BLOB_SEED = 65;

test('an ore blob against pale stone', async ({ page }) => {
  await boot(page);
  await settle(page, BLOB_SEED);
  const at = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { solidAt, subAt, write: tw } = await import('/src/model/tiles.js');
    const { write: mw } = await import('/src/model/machines.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { banner } = await import('/src/view/fx.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    const band = bandOf('topsoil');
    const is = sub => (x, y) => solidAt(band, x, y) && subAt(band, x, y) === sub;
    const isCu = is(S.copper), isGr = is(S.granite);

    let found = null;
    for (let ty = 20; ty <= 300 && !found; ty++)
      for (let c = 45; c < band.tw - 45 && !found; c++) {
        if (!(isCu(c, ty - 1) && isCu(c, ty) && isCu(c, ty + 1))) continue;
        /* Widest gap first: a 4-column room puts both walls deep in
           `drawDarkness`'s outer bucket and the boundary stops reading. */
        for (let d = 8; d >= 6 && !found; d--) {
          const g = c + d;
          if (!(isGr(g, ty) && isGr(g, ty + 1))) continue;
          let solid = true;
          for (let x = c + 1; x < g && solid; x++)
            for (let y = ty - 2; y <= ty + 2; y++) if (!solidAt(band, x, y)) solid = false;
          if (solid) found = { c, g, ty };
        }
      }
    if (!found) return null;

    const mid = (found.c + found.g) >> 1;
    for (let ty = found.ty - 2; ty <= found.ty + 2; ty++)
      for (let tx = found.c + 1; tx < found.g; tx++) tw.clear(band, tx, ty);
    tw.set(band, mid, found.ty + 2, S.stone);      // a floor for the brazier

    const brazier = mw.place(band, M.brazier, mid, found.ty + 1);
    mw.take(brazier, S.timber, F.log, 4);

    __mf.revealAll(band);
    banner.fade = 0;
    __mf.frames(700);         // past the 6 s fuel recipe, then settle

    __mf.resize(200, 180);
    __mf.cam.x = Math.round(worldX(band, mid) - VIEW.w / 2);
    __mf.cam.y = Math.round(worldY(band, found.ty) - VIEW.h / 2);
    __mf.draw();
    return found;
  });
  expect(at).not.toBeNull();       // the scene has to contain its own subject
  await shot(page, 'ore-against-pale-stone.png');
});

/* `view/treatments.js#canopy` reaches `EXTENT.canopy` (4 tiles) either side of
   its trunk and `view/paint.js`'s `DECO_MARGIN` is sized off that table, so a
   crown straddling a boundary bakes into both chunk canvases. Planted at tx 64,
   a multiple of the surface band's own `chunk:16`, rather than hunted for. */
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

/* `view/paint.js` holds one baked canvas per chunk, and the whole world is
   1,728 chunks at about 108 MB against a 24 MB budget, so a whole-world sweep
   evicts. */

/* Camera steps of one viewport across each band and down it, drawing each time,
   so `view/scene.js#drawChunks` asks for every chunk in the world. `__mf.draw`
   runs no simulation, so the model is untouched between the two legs. */
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
       taken after an eviction pass rather than after a frame of cold bakes:
       `beginFrame` evicts and then publishes `stats.bytes`. */
    __mf.draw();
    return { cached: stats.cached, bytes: stats.bytes,
             evictedTotal: stats.evictedTotal, cap: cacheLimit.bytes };
  });

  const CHUNK_BYTES = 128 * 128 * 4;             // one 16x16-tile chunk at tile:8
  const SHIPPED = 384;                           // 24 MB of budget / 64 KB a chunk
  const GRACE = 64;   // twice the 24 chunks a 640x400 viewport covers, for two frames of it

  /* Read off the bands rather than written down, and what makes the shipped
     leg below non-vacuous. */
  const worldChunks = await page.evaluate(async () => {
    const { bands } = await import('/src/model/world.js');
    return bands.reduce((n, b) => n + b.cx * b.cy, 0);
  });

  await reset(page, 24 * 1024 * 1024);           // the shipped budget
  await sweepWorld(page);
  const shipped = await read(page);

  await reset(page, 32 * CHUNK_BYTES);           // forced well under one world
  await sweepWorld(page);
  const forced = await read(page);

  /* The shipped leg evicts too: 1,728 chunks and 108 MB against a 384-chunk
     budget, so the sweep sheds everything it cannot hold. What is left is the
     budget plus what the last two frames drew, which `view/paint.js#evict` may
     never take. */
  expect(worldChunks).toBeGreaterThan(SHIPPED * 2);   // or the leg proves nothing
  expect(shipped.evictedTotal).toBeGreaterThanOrEqual(worldChunks - SHIPPED - GRACE);
  expect(shipped.cached).toBeLessThanOrEqual(SHIPPED + GRACE);
  expect(shipped.bytes).toBeLessThanOrEqual(shipped.cap + GRACE * CHUNK_BYTES);

  /* The forced leg: the same sweep under a 2 MB budget holds an order of
     magnitude less, so residency tracks the budget rather than a ceiling of its
     own. */
  expect(forced.evictedTotal).toBeGreaterThanOrEqual(worldChunks - 32 - GRACE);
  expect(forced.cached).toBeLessThanOrEqual(32 + GRACE);
  expect(forced.cached).toBeLessThan(shipped.cached / 2);
  expect(forced.bytes).toBeLessThanOrEqual(forced.cap + GRACE * CHUNK_BYTES);
});

/* A chunk thrown away and baked again is the same pixels, `paintChunk` being a
   pure function of the tile grid, the substance rows and `hash2` of absolute
   tile coordinates, with no `rand` anywhere. */
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

/* The cache is filled by a whole-world sweep before the pick starts, so
   eviction is already running during the dig. Every chunk under the pick is on
   screen, so `view/paint.js#evict` may not take one: the same dig under either
   budget repaints the same chunks and leaves the same pixels. */
test('a dig under a full, evicting cache repaints the same chunks and draws the same pixels', async ({ page }) => {
  await boot(page);

  const dig = (page, bytes) => page.evaluate(async bytes => {
    const { bands } = await import('/src/model/world.js');
    const { VIEW } = await import('/src/core/canvas.js');
    const { cacheLimit, resetChunks, stats } = await import('/src/view/paint.js');
    const { banner } = await import('/src/view/fx.js');
    const { write: rw, run } = await import('/src/model/run.js');

    /* `hold` leaves whatever it held set on `cmd` and `newRun` does not clear
       it, so without this the second leg digs through its settling frames. */
    for (const k of ['dig', 'down', 'right', 'collect']) __mf.cmd[k] = false;

    __mf.newRun(1337); __mf.clock.t = 10; __mf.frames(2);
    while (run.tutorialBeat < 4) rw.advanceBeat();
    resetChunks();
    cacheLimit.bytes = bytes;
    banner.fade = 0;

    /* The pickaxe first, or `hasPick` is false and the dig is a no-op. `right`
       is held and has to be released, or the player drifts and no tile
       accumulates enough work to break. */
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
    /* Ten calls rather than one of 600 substeps: `hold` draws once at the end
       and eviction runs once per frame, so a single call would give the pass
       one turn. */
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
  const shipped = await dig(page, 24 * 1024 * 1024);

  /* Both budgets evict -- 1,728 chunks against a 384-chunk shipped budget -- so
     the legs differ in how hard they evict, and the equalities below say the dig
     repaints the same chunks and draws the same pixels either way. */
  expect(capped.swept).toBeGreaterThan(shipped.swept);
  expect(shipped.swept).toBeGreaterThan(0);
  expect(capped.repainted).toBeGreaterThan(0);   // the dig really did invalidate
  expect(capped.repainted).toBe(shipped.repainted);
  expect(capped.skipped).toBe(shipped.skipped);
  expect(capped.hash).toBe(shipped.hash);
});

/* A generated room rather than a hand-carved shaft: the flood fill that finds
   one runs in the test. */
async function hollowScene(page) {
  const at = await page.evaluate(async () => {
    const { bandOf, worldX, worldY, write: ww } = await import('/src/model/world.js');
    const { solidAt } = await import('/src/model/tiles.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { write: pw } = await import('/src/model/player.js');
    const { banner } = await import('/src/view/fx.js');
    const { VIEW } = await import('/src/core/canvas.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    const band = bandOf('topsoil');
    const W = band.tw, H = band.th;
    const seen = new Uint8Array(W * H);
    let found = null;
    for (let ty = 0; ty < H && !found; ty++)
      for (let tx = 0; tx < W && !found; tx++) {
        const i = ty * W + tx;
        if (seen[i] || solidAt(band, tx, ty)) continue;
        /* One flat array as a stack, x and y interleaved: a pocket is tens of
           cells and a pair of arrays per push would allocate thousands. */
        const stack = [tx, ty], cells = [];
        seen[i] = 1;
        let sky = false, x0 = tx, x1 = tx, y0 = ty, y1 = ty;
        while (stack.length) {
          const cy = stack.pop(), cx = stack.pop();
          cells.push(cx, cy);
          if (cy === 0) sky = true;
          if (cx < x0) x0 = cx;
          if (cx > x1) x1 = cx;
          if (cy < y0) y0 = cy;
          if (cy > y1) y1 = cy;
          for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const j = ny * W + nx;
            if (seen[j] || solidAt(band, nx, ny)) continue;
            seen[j] = 1;
            stack.push(nx, ny);
          }
        }
        if (sky || x1 - x0 < 5 || y1 - y0 < 3 || y0 < 60) continue;
        const mid = (x0 + x1) >> 1;
        if (mid < 45 || mid > W - 45) continue;
        /* The brazier goes in the pocket's widest row, not its lowest cell: a
           hollow of overlapping discs tapers to one column, and a brazier
           walled on three sides leaves light at `eff('lightFalloffRock')`. */
        const wide = new Map();
        for (let k = 0; k < cells.length; k += 2)
          wide.set(cells[k + 1], (wide.get(cells[k + 1]) ?? 0) + 1);
        let best = -1, bestN = 0;
        for (const [row, n] of wide)
          if (n > bestN) { bestN = n; best = row; }
        if (best > y0 && !solidAt(band, mid, best) && !solidAt(band, mid, best - 1))
          found = { tx: mid, ty: best - 1, cells: cells.length / 2, wide: bestN };
      }

    pw.band(band);
    pw.move(worldX(band, found.tx), worldY(band, found.ty));
    ww.revealAll(band);
    banner.fade = 0;
    __mf.cmd.hasMouse = false;
    __mf.cam.x = Math.round(worldX(band, found.tx) + 4 - VIEW.w / 2);
    __mf.cam.y = Math.round(worldY(band, found.ty) + 4 - VIEW.h / 2);
    return found;
  });
  expect(at.cells).toBeGreaterThan(12);   // a room, and the fill really found one
  expect(at.wide).toBeGreaterThan(4);     // wide enough that the brazier is not in a notch
  return at;
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
  const at = await hollowScene(page);
  await page.evaluate(async at => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: iw } = await import('/src/model/items.js');

    const band = bandOf('topsoil');
    const it = iw.spawn(band, worldX(band, at.tx) + 4, worldY(band, at.ty) + 4, S.bellows, F.relic, 0, 0);
    if (it) it.rest = 1;
    __mf.draw();
  }, at);
  await shot(page, 'hollow-relic-unlit.png');
});

/* `view/scene.js#drawDarkness` uses 0.94 alpha at light level 0, so a halo on
   unlit tiles is crushed to a few percent of its colour -- real, but too subtle
   to catch by eye between two PNGs, hence a canvas hash. */
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

  const at = await hollowScene(page);
  await page.evaluate(async at => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { bandOf, worldX, worldY } = await import('/src/model/world.js');
    const { write: iw } = await import('/src/model/items.js');
    const band = bandOf('topsoil');
    const it = iw.spawn(band, worldX(band, at.tx) + 4, worldY(band, at.ty) + 4, S.bellows, F.relic, 0, 0);
    if (it) it.rest = 1;
    __mf.draw();
  }, at);
  const withRelic = await hashOf();

  expect(withRelic).not.toBe(bare);
});

test('the same natural hollow lit by a brazier', async ({ page }) => {
  await boot(page);
  await settle(page);
  const at = await hollowScene(page);
  await page.evaluate(async at => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { bandOf } = await import('/src/model/world.js');
    const { write: mw } = await import('/src/model/machines.js');

    const brazier = mw.place(bandOf('topsoil'), M.brazier, at.tx, at.ty + 1);
    mw.take(brazier, S.timber, F.log, 4);
    __mf.frames(700);          // past the 6 s fuel recipe, then settle
  }, at);
  await shot(page, 'hollow-lit.png');
});

/* `surface.png` is the flat spawn shelf; this is everywhere else, framed from
   the band's own left edge so the shelf and the relief either side of it are in
   one picture. */
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

/* `view/treatments.js#grassCap`'s bank chamfers the outer corner of every
   one-tile step, but it paints turf over turf, so with it and without it are
   two plausible hillsides rather than one obviously broken one. */
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

/* `rules/generate.js#stepPass` permits a 2-tile step (`STEP_BIG`) outside
   `SAFE_R` of spawn: the steepest face it produces, and the one face
   `view/treatments.js#grassCap`'s bank does not chamfer. */
const CLIFF_SEED = 58;

test('a cliff face', async ({ page }) => {
  await boot(page);
  await settle(page, CLIFF_SEED);
  /* A screenshot cannot tell a 2-tile face from a 1-tile one, so the geometry
     is read off the live band: topmost solid row per column, skipping timber so
     a trunk is not mistaken for ground. */
  const steps = await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    const { solidAt, subAt } = await import('/src/model/tiles.js');
    const { S } = await import('/src/data/substances.js');
    const band = bandOf('surface');
    const ground = c => {
      for (let ty = 0; ty < band.th; ty++)
        if (solidAt(band, c, ty) && subAt(band, c, ty) !== S.timber) return ty;
      return band.th;
    };
    const big = [];
    for (let c = 0; c < band.tw - 1; c++)
      if (Math.abs(ground(c + 1) - ground(c)) > 1) big.push(c);
    const tx0 = big.length === 1 ? big[0] : -1;
    return { tx0, big: big.length, edge: Math.min(tx0, band.tw - 1 - tx0),
             at: tx0 < 0 ? 0 : ground(tx0 + 1) - ground(tx0),
             row: tx0 < 0 ? 0 : ground(tx0) };
  });
  expect(steps.big).toBe(1);       // the band holds exactly one, so tx0 is unambiguous
  expect(steps.at).toBe(2);        // descending away from spawn, so positive
  expect(steps.edge).toBeGreaterThan(60);   // and it is interior, so the frame is not half sky

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
  }, { tx0: steps.tx0, row: steps.row });
  await shot(page, 'cliff-face.png');
});

/* Three scroll positions across the width. `map.png` never scrolls: it leaves
   `follow` at its default, centred wherever `settle` left the player, and
   `mapMoveTo` is the model-level scroll. */
test('the map overview at three scroll positions', async ({ page }) => {
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
  /* A fraction of the scrollable range, not a world x: `ui.map.x` is the
     window's left edge and `view/overview.js#fit` clamps it to
     `worldW - vw / scale`, so two far-apart world x values are one picture. */
  const park = k => page.evaluate(async k => {
    const { mapMoveTo } = await import('/src/shell/ui.js');
    const { mapView } = await import('/src/view/overview.js');
    const range = mapView.worldW - mapView.vw / mapView.scale;
    mapMoveTo(Math.round(range * k), 900);
    __mf.draw();
  }, k);

  await page.evaluate(async () => {
    const { bands, write } = await import('/src/model/world.js');
    const { write: rw, run } = await import('/src/model/run.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    for (const b of bands) write.revealAll(b);
    __mf.flags.showMap = true;
  });

  await page.evaluate(() => __mf.draw());     // so `mapView` has a range to read
  await park(0);
  const left = await hashOf();
  await shot(page, 'map-scroll-left.png');

  await park(0.5);
  const mid = await hashOf();
  await shot(page, 'map-scroll-mid.png');

  await park(2);                  // past the world's own right edge -- `fit()`
                                  // in `view/overview.js` clamps it there
  const right = await hashOf();
  await shot(page, 'map-scroll-right.png');

  expect(new Set([left, mid, right]).size).toBe(3);
});

/* CHAIN's four hubs, linked [0,1] and [2,3] with the middle segment absent,
   opened on the map instead of the scene camera: an open end draws as a red
   ring, a joined hub as a solid box, a driven cable solid and an idle one
   dashed. */
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

/* The overview fits the world's depth and windows its width, so where the
   width does not fit the ribbon says which slice the body shows. The world is
   8,192 px wide against a 609 px body, so it is there at the default zoom. */
test('the overview extent ribbon appears only when the width does not fit, and tracks the scroll', async ({ page }) => {
  await boot(page);
  await settle(page);

  const at = (page, zoom, x, iw = 1280) => page.evaluate(async ({ zoom, x, iw }) => {
    const { bands, write } = await import('/src/model/world.js');
    const { mapMoveTo, setMapZoom } = await import('/src/shell/ui.js');
    const { write: rw, run } = await import('/src/model/run.js');
    const { mapView } = await import('/src/view/overview.js');
    const { mix } = await import('/src/core/palette.js');
    const { colour } = await import('/src/data/palette.js');

    while (run.tutorialBeat < 4) rw.advanceBeat();
    for (const b of bands) write.revealAll(b);
    __mf.resize(iw, 800);
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
      /* The world span the body can show over the world's width: the fraction
         the thumb should be, read off `mapView` rather than re-derived. */
      fraction: (mapView.vw / mapView.scale) / mapView.worldW,
      /* One pixel inside the thumb and one in the track beyond its far end. */
      inWindow: win ? rgb(win.x + 1, win.y) : null,
      inTrack: win && track && win.x + win.w + 2 < track.x + track.w
        ? rgb(win.x + win.w + 2, win.y) : null,
      ui: colour('ui'),
      trackTone: mix(colour('uiBack'), colour('uiDim'), 0.5)
    };
  }, { zoom, x, iw });

  const hex = h => [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)].map(x => parseInt(x, 16));
  const rgbStr = s => s.match(/\d+/g).map(Number);

  /* One pixel per tile in a 2,400 px buffer fits the whole width, so there is
     nothing to say and nothing is drawn. */
  const fits = await at(page, 0, 0, 2400);
  expect(fits.fraction).toBeGreaterThanOrEqual(1);
  expect(fits.track).toBe(null);
  expect(fits.win).toBe(null);

  /* The same zoom in the buffer this suite photographs does not fit, which is
     why the ribbon is in every overview baseline. */
  const narrow = await at(page, 0, 0);
  expect(narrow.fraction).toBeLessThan(1);
  expect(narrow.track).not.toBe(null);

  /* Zoom 8 does not fit either. The thumb is the window's share of the world's
     width, and it is painted rather than only recorded. */
  const mid = await at(page, 8, 400);
  expect(mid.fraction).toBeLessThan(1);
  expect(mid.win.w / mid.track.w).toBeCloseTo(mid.fraction, 1);
  expect(mid.win.x).toBeGreaterThan(mid.track.x);
  expect(mid.inWindow).toEqual(hex(mid.ui));
  expect(mid.inTrack).toEqual(rgbStr(mid.trackTone));

  /* It tracks the scroll to both ends: `fit` clamps the offset to the world, so
     parking past an edge parks on it. */
  const left = await at(page, 8, -9999);
  expect(left.win.x).toBe(left.track.x);
  const right = await at(page, 8, 9999);
  expect(right.win.x + right.win.w).toBe(right.track.x + right.track.w);
});

/* Zoom 8 over a fully revealed world, parked mid-width so the thumb sits
   mid-track, which is what neither end shows. */
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

/* Placed through `rules/placement.js#placeMachine` rather than a model-level
   write, so astral's floor and `footing:2` are actually exercised. */
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
    /* A full body height clear of the floor: any closer and the body overlaps
       the solid row before physics runs, and `moveY` resolves an embedded start
       by sinking a further tile rather than pushing out. */
    pw.move(worldX(astral, 60), worldY(astral, 29) - PH);
    __mf.revealAll(astral);
    __mf.cmd.hasMouse = false;
    __mf.frames(30);                        // let gravity settle them onto row 30

    rw.grant('cloud_dock');
    rw.collect(S.cloud_dock, F.rig, 1);
  });
  await moveHeldToQuickbar(page, 0, 'cloud_dock', 'rig');
  await page.keyboard.press('1');
  /* Placement is LMB only; this pokes the same edge flag a real click sets. */
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
    /* The dock's footprint is 2x1 tiles (16x8 world px), a pale sliver against
       the 640x400 view and astral's bright sky, so the 200x180 buffer is used
       here for framing rather than as a layout assertion. */
    __mf.resize(200, 180);
    __mf.cam.x = Math.round(dock.box.x + dock.box.w / 2 - VIEW.w / 2);
    __mf.cam.y = Math.round(dock.box.y + dock.box.h / 2 - VIEW.h / 2);
    __mf.draw();
  });
  await shot(page, 'cloud-dock.png');
});

/* `view/scene.js#drawDepletion` is a live overlay rather than a chunk bake,
   for the reason the band record gives for `seen` and `light`. */

/* A hand-carved copper vein with open sky above it. `rules/light.js` seeds
   every tile from row 0 down to and including the first solid one at
   `eff('lightMax')`, so clearing to row 0 leaves the vein row fully lit and
   `drawDarkness`, 94% black over an unlit tile, with nothing to do to it. */
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
    banner.fade = 0;   // past the opening title
  }, VEIN);
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(2); });
}

/* Centres the vein in the current viewport and renders once. Called last,
   because a substep runs `updateCamera` and would pull the camera back onto
   the player. */
const frameVein = page => page.evaluate(async ({ tx0, ty, w }) => {
  const { bandOf, worldX, worldY } = await import('/src/model/world.js');
  const { VIEW } = await import('/src/core/canvas.js');
  const band = bandOf('surface');
  __mf.cam.x = Math.round(worldX(band, tx0 + w / 2) - VIEW.w / 2);
  __mf.cam.y = Math.round(worldY(band, ty) - VIEW.h / 2);
  __mf.draw();
}, VEIN);

/* Spends real units out of named tiles through `model/mining.js#write.add`, the
   call `rules/mining.js` makes. `effHardAt` is `view/paint.js`'s own resolved
   hardness, so the test cannot disagree with the renderer on a unit's cost. */
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
  /* Framed once before the work is added, so every chunk the shot needs is
     already baked: `write.add` bumps the epoch and never a chunk version, so a
     chunk first painted after the work would bake a crack. */
  await frameVein(page);
  await spendUnits(page, [{ tx: VEIN.tx0 + 2, units: 3 }, { tx: VEIN.tx0 + 3, units: 1 }]);
  await frameVein(page);
  await shot(page, 'vein-depleted.png');
});

/* A pixel count rather than a third screenshot: one scene, rendered twice, with
   nothing different between the two draws but `dig.work`. */
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

/* `view/paint.js#paintTile` draws a form's own `look`. One scene, two
   lightings, each baselined separately, so a regression has to move a file
   against its own accepted image. */
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

    /* A floor for the ladders and the brazier, stone rather than the band's own
       soil so it reads as a different material from the walls. */
    const floor = ty0 + h - 1;
    for (let tx = tx0; tx < tx0 + w; tx++) tw.set(band, tx, floor, S.stone);

    /* Placed through `model/tiles.js#write.set` with a real form ordinal, the
       call `rules/placement.js#placeTile` makes, rather than a click at a
       hardcoded pixel: these are shot at two viewports. */
    for (let i = 0; i < n; i++) {
      tw.set(band, tx0 + 1, top + i, S.timber, F.rung);
      tw.set(band, tx0 + w - 2, top + i, S.copper, F.stair);
    }

    /* At the foot of the timber ladder and clear of the brazier's column: the
       player sprite is 3 tiles of the shaft's 7, and the lit shot needs the
       light source in frame. */
    pw.band(band);
    pw.move(worldX(band, tx0 + 2), worldY(band, floor) - PH);
    ww.revealAll(band);
    banner.fade = 0;   // past the opening title
  }, LADDER);
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(2); });
}

/* Centres the shaft in the current viewport and renders once. Called last,
   because a substep runs `updateCamera` and would pull the camera back onto
   the player. */
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
    __mf.frames(700);          // past the 6 s fuel recipe, then settle
  }, LADDER);
  await frameLadder(page);
  await shot(page, 'ladder-lit.png');
});

/* `seedling.png` is a mid-growth seedling: a live overlay drawn every frame
   from `model/growth.js#stageAt`, over a tile the chunk canvas has baked as
   ordinary terrain. */
const SPROUT = { tx: 44, fy: 26 };          // fy is the floor; the seed sits at fy - 1

/* Driven through the model and the real placement rule, not a click at a
   hardcoded pixel: these scenes are shot at two viewports. `placeTile` rather
   than `write.set`, so a seed's legality on a bare floor is exercised. */
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

    while (run.tutorialBeat < 4) rw.advanceBeat();      // past the altar's gate
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
  /* The beat jump above releases the altar, and it stands in frame here. */
  await pastArrival(page);
}

/* Centres the sprout in the current viewport and renders once. Called last,
   because a substep runs `updateCamera` and would pull the camera back onto
   the player. */
const frameSprout = page => page.evaluate(async ({ tx, fy }) => {
  const { bandOf, worldX, worldY } = await import('/src/model/world.js');
  const { VIEW } = await import('/src/core/canvas.js');
  const band = bandOf('surface');
  __mf.cam.x = Math.round(worldX(band, tx) + 4 - VIEW.w / 2);
  __mf.cam.y = Math.round(worldY(band, fy - 4) - VIEW.h / 2);
  __mf.draw();
}, SPROUT);

/* Puts `frac` of `eff('treeGrowSecs')` on the ledger through the same
   `model/growth.js#write.add` the real step calls, rather than driving 7,200
   substeps to reach a third of 180 s. */
const growTo = (page, frac) => page.evaluate(async ({ spec, frac }) => {
  const { bandOf } = await import('/src/model/world.js');
  const { write: gw } = await import('/src/model/growth.js');
  const { eff } = await import('/src/model/mods.js');
  gw.add(bandOf('surface'), spec.tx, spec.fy - 1, eff('treeGrowSecs') * frac);
}, { spec: SPROUT, frac });

/* 0.4 rather than exactly 1/3: `view/scene.js#SEED_STAGES` steps the silhouette
   at a third and at two thirds, and a baseline sitting on a boundary is one
   floating-point hair from showing the previous stage. */
test('a planted seed part-way grown', async ({ page }) => {
  await boot(page);
  await settle(page);
  await sproutScene(page);
  await frameSprout(page);              // bake the chunks before the ledger moves
  await growTo(page, 0.4);
  await frameSprout(page);
  await shot(page, 'seedling.png');
});

/* One real substep past the full grow time, so `rules/growth.js` resolves the
   tile rather than a hand-written stack of trunk tiles. */
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
  /* `data/world.js`'s `trees` row declares [3, 5] and `rules/growth.js` reads
     that range off it, so a planted tree is the size of a wild one, and an
     unresolved seedling would look plausible while proving nothing. */
  expect(height).toBeGreaterThanOrEqual(3);
  expect(height).toBeLessThanOrEqual(5);

  await frameSprout(page);
  await shot(page, 'grown-tree.png');
});

/* A pixel count rather than a third screenshot: one scene, rendered twice, with
   nothing different between the draws but whether `model/growth.js` holds an
   entry. Clearing the ledger touches no tile byte and no chunk version, so the
   tile stays and only the overlay pass is suppressed. */
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

    /* Overlay suppressed: the ledger entry goes, the tile stays. */
    gw.clear(band, tx, py);
    const wasSuppressed = !growingAt(band, tx, py);
    __mf.draw();
    const before = grab();

    /* Overlay back, at the same 0.4 the `seedling.png` baseline uses. */
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

/* The delivery is set up through the model and everything after it is the
   shipped path: `rules/cycles.js#drainReceivers` credits the buffer, `#resolve`
   writes `run.offer`, `rules/draft.js` draws the cards from the seeded stream,
   and `shell/main.js#raiseOffer` opens the panel. */
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

test('17c2: cycle 2 raises its draft over a frozen world, with a card per offered id', async ({ page }) => {
  await boot(page);
  await settle(page);
  await payTrial(page, 2);

  /* One panel per offered id and exactly one reroll row: the layout follows
     the offer rather than reserving a fixed number of cards. */
  const offer = await offerOf(page);
  const want2 = await page.evaluate(async () => {
    const { CYCLES } = await import('/src/data/cycles.js');
    return CYCLES[1].reward.draft;
  });
  expect(offer.tier).toBe(want2);
  expect(offer.god).toBe('hephaestus');
  expect(offer.ids.length).toBe(Math.min(offer.pool, 3));   // eff('offerSize')
  expect(offer.canReroll).toBe(offer.pool > offer.ids.length);

  const drawn = await draftPanels(page);
  expect(drawn.map(p => p.id).sort())
    .toEqual([...offer.ids.map((_, i) => `draft-card-${i}`), 'draft-reroll'].sort());

  /* The world is frozen behind it: 120 substeps change no simulated time and
     move no body. `stepFx` is not part of the claim; it runs outside `step`. */
  const frozen = await page.evaluate(async () => {
    const { run } = await import('/src/model/run.js');
    const { player } = await import('/src/model/player.js');
    const before = { t: run.t, ct: __mf.clock.t, px: player.x, py: player.y };
    __mf.hold({ right: 1 }, 120);
    return { before, after: { t: run.t, ct: __mf.clock.t, px: player.x, py: player.y } };
  });
  expect(frozen.after).toEqual(frozen.before);

  await shot(page, 'draft-cycle2-cards.png');
});

test('17c2: the modal is not vacuous -- the same frame with the panel closed is a different picture', async ({ page }) => {
  await boot(page);
  await settle(page);
  await payTrial(page, 2);
  const [card] = await draftPanels(page);

  /* Two draws with no step between them and the panel popped for the first, so
     only the modal can account for a moved pixel. `view` reads the stack off
     the frame context, so popping it is the whole "off" switch. */
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

  expect(delta.closedPanels).toBe(0);                 // nothing draft-related is drawn
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
    const { boons } = await import('/src/model/boons.js');
    return { offer: __mf.ui.offer, open: __mf.ui.open,
             active: boons.active.map(b => b.id), moved: run.t - t0 };
  });

  expect(after.offer).toBe(null);
  expect(after.open).not.toContain('draft');
  /* `draft-card-0` is `run.offer.ids[0]`, and taking it puts that boon on the
     active stack, read back through the model rather than remembered. */
  expect(after.active).toContain(before.ids[0]);
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
     card's delta lines are built from; a row with none draws an empty card. */
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
     200x180 base buffer, where three cards no longer fit across. The wait is
     for the page's own resize listener, not just for the browser. */
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

  /* `view/ui/panel.js#drawPanel` clamps every rect inside the buffer before
     recording it, so `x + w <= vw` is a tautology. Landing strictly inside
     those boundaries is what a clamped rect cannot do. */
  for (const p of drawn) {
    expect(p.w).toBeLessThan(V.w - 4);
    expect(p.h).toBeLessThan(V.h - 4);
    expect(p.x).toBeGreaterThan(2);
    expect(p.y).toBeGreaterThan(2);
    expect(p.x + p.w).toBeLessThan(V.w - 2);
    expect(p.y + p.h).toBeLessThan(V.h - 2);
  }

  /* Nothing sits on top of anything else. */
  for (let i = 0; i < drawn.length; i++)
    for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i], b = drawn[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w &&
                      a.y < b.y + b.h && b.y < a.y + a.h;
      expect({ pair: [a.id, b.id], overlap }).toEqual({ pair: [a.id, b.id], overlap: false });
    }

  /* Two cards share a row and the third drops below it: a single column, the
     shape a too-wide MIN_CARD_W gives, has three distinct y values, and a
     squeezed single row has one. */
  expect(cards[0].y).toBe(cards[1].y);
  expect(cards[2].y).toBeGreaterThanOrEqual(cards[0].y + cards[0].h);
  expect(new Set(cards.map(c => c.w)).size).toBe(1);         // one uniform card width

  /* Each row is centred on its own count, so the odd card does not hang left.
     The one-pixel tolerance is the layout's integer `>> 1`. */
  const centred = r => Math.abs(r.left - r.right) <= 1;
  const rowOf = rs => ({ left: Math.min(...rs.map(r => r.x)),
                         right: V.w - Math.max(...rs.map(r => r.x + r.w)) });
  expect(centred(rowOf([cards[0], cards[1]]))).toBe(true);
  expect(centred(rowOf([cards[2]]))).toBe(true);
  expect(centred(rowOf([reroll]))).toBe(true);
  expect(reroll.y).toBeGreaterThanOrEqual(cards[2].y + cards[2].h);

  await shot(page, 'draft-boon-floor.png');
});

/* A draw can vary without writing to the model, which a model-epoch probe
   cannot see. These record what the renderer emitted and compare it call for
   call. */

const SCENES = {
  surface: async () => {},

  'hollow with a relic': async page => {
    const at = await hollowScene(page);
    await page.evaluate(async at => {
      const { S } = await import('/src/data/substances.js');
      const { F } = await import('/src/data/forms.js');
      const { bandOf, worldX, worldY } = await import('/src/model/world.js');
      const { write: iw } = await import('/src/model/items.js');
      const band = bandOf('topsoil');
      const it = iw.spawn(band, worldX(band, at.tx) + 4, worldY(band, at.ty) + 4, S.bellows, F.relic, 0, 0);
      if (it) it.rest = 1;
    }, at);
  },

  'the draft modal': async page => { await payTrial(page, 3); },

  /* The arrival animates off `run.t` and a positional hash, so it is the draw
     path most likely to reach for `rand`. Frozen mid-presentation, since `draw`
     advances no clock. */
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

    /* Four draws, not two: an injected `(rand * 10) | 0` passed a two-draw
       compare by landing on the same op string twice. */
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
     item bob, the halo pulse, the kiln flame -- has to move, so a recorder
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


/* Beat 4 is `rules/cycles.js#ALTAR_BEAT`, which releases cycle 1's altar. The
   `frames(1)` is what gives the director a frame to place it in: a scene that
   jumps the beat and draws without stepping gets no altar at all. */
async function altarArrives(page) {
  await page.evaluate(async () => {
    const { write: rw, run } = await import('/src/model/run.js');
    while (run.tutorialBeat < 4) rw.advanceBeat();
    /* The opening title card is still up two substeps in and sits straight
       across the altar. */
    (await import('/src/view/fx.js')).banner.fade = 0;
    __mf.frames(1);
  });
}

/* The arrival's rectangle in screen px, padded to take in the base flare and
   still leave the idling player out: they spawn 6 tiles away, and a crop that
   reached them would answer for their blink. */
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

  /* Two seconds of simulated time, past `altarRiseSecs` at 1.6 s: the altar has
     not moved and the stamp is still on `run`, only the window has closed. The
     render clock and the camera are both put back before the second draw. */
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

/* Two crops of the bottom of the frame: the strip `view/hud.js#bottomLine`
   draws into, and a control strip above it. Both stop short of the quickbar on
   the right and the KEYS toggle on the left, and both are device px. */
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

  /* Beats 2 and 3 are the two widest rows in `data/callouts.js`, and different
     widths, so a panel leaking any pixel at fade 0 leaks a different number for
     each. Nothing else in `view/` reads `beat(run)`. */
  await beatAtFadeZero(page, 2);
  const two = await canvasHash(page, strip);

  await beatAtFadeZero(page, 3);
  const three = await canvasHash(page, strip);

  /* A callout at fade 0 leaks no pixel, its top bevel included. */
  expect(two).toBe(three);

  /* The same beat one full fade later must differ while the control strip above
     it must not, so the difference is the callout and not `clock.t` moving
     something else nearby. */
  const controlBefore = await canvasHash(page, control);
  await page.evaluate(() => { __mf.clock.t += 0.4; __mf.draw(); });
  const lit = await canvasHash(page, strip);
  const controlAfter = await canvasHash(page, control);

  expect(lit).not.toBe(three);
  expect(controlAfter).toBe(controlBefore);

  expect(errors).toEqual([]);
});

/* `view/scene.js#depthTint` gives every world row the tint its own band claims,
   ramping adjacent bands into each other across a short span centred on their
   seam. */

/* Alpha per world row over `[0, worldBottom)`, assembled from tiled camera
   positions. `phase` shifts every camera position, so a world row lands at a
   different screen row per profile: camera-invariance, not repeatability. */
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

  /* The 200 px floor and the 400 px desktop buffer: astral is 320 px tall, so
     it fits inside the first viewport and never inside the second. */
  for (const buffer of [400, 800]) {
    const a = await tintProfile(page, buffer, 0);
    const b = await tintProfile(page, buffer, 37);
    const c = await tintProfile(page, buffer, 113);
    expect(a.H).toBe(buffer / 2);
    expect(a.bottom).toBe(3328);

    /* Bit-identical, not close: the alpha is a function of the world row, so
       three screen placements of that row compute the same double. */
    let worstInv = 0, atInv = -1;
    for (let wy = 0; wy < a.bottom; wy++) {
      const d = Math.max(Math.abs(b.out[wy] - a.out[wy]), Math.abs(c.out[wy] - a.out[wy]));
      if (d > worstInv) { worstInv = d; atInv = wy; }
    }
    expect(worstInv, `H=${a.H}: worst camera-dependence ${worstInv} at world row ${atInv}`).toBe(0);

    /* No row was missed: -1 is the fill the profile starts at. */
    expect(a.out.indexOf(-1)).toBe(-1);

    /* No hard edge anywhere in the world. */
    let worstStep = 0, atStep = -1;
    for (let wy = 1; wy < a.bottom; wy++) {
      const d = Math.abs(a.out[wy] - a.out[wy - 1]);
      if (d > worstStep) { worstStep = d; atStep = wy; }
    }
    expect(worstStep, `H=${a.H}: worst row step ${worstStep} at world row ${atStep}`)
      .toBeLessThanOrEqual(5 / 255);

    /* Exact interiors at both buffers, so no neighbouring band's tint bleeds
       into one of them. */
    expect(a.out[100]).toBe(0);
    expect(a.out[500]).toBeCloseTo(0.055, 10);
    expect(a.out[2000]).toBeCloseTo(0.44, 10);

    /* At each seam, the rows strictly between the two interior values it joins:
       a tile's worth at least, so the ramp cannot degenerate into a two-row
       dither and still pass the step bound. */
    for (const [seam, lo, hi] of [[320, 0, 0.055], [768, 0.055, 0.44]]) {
      let n = 0;
      for (let wy = seam - 40; wy <= seam + 40; wy++)
        if (a.out[wy] > lo + 1e-9 && a.out[wy] < hi - 1e-9) n++;
      expect(n, `H=${a.H}: ramp rows at world-Y ${seam}`).toBeGreaterThanOrEqual(8);
    }

    /* The three interiors must be three different numbers, or everything above
       is measuring one constant. */
    expect(new Set([a.out[100], a.out[500], a.out[2000]]).size).toBe(3);
  }

  expect(errors).toEqual([]);
});

/* Nothing in the game opens the menu yet, so these drive `shell/ui.js`'s own
   accessors through a dynamic import of the live module, never through a screen
   coordinate. */

/* Opens the menu on a page in a stated state and draws one frame. `index` and
   `scroll` go through the real clamping accessors, so a test cannot park the
   cursor where the game could not. */
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

/* What the menu drew, out of `view/ui/state.js#drawn` rather than `__mf.ui`.
   Plain values only, so it survives the structured clone. */
const menuDrawn = page => page.evaluate(async () => {
  const { drawn } = await import('/src/view/ui/state.js');
  return drawn.menu && JSON.parse(JSON.stringify(drawn.menu));
});

/* `core/canvas.js#resize` takes window pixels and derives the buffer from them,
   so "inside the buffer" has to read the buffer back. 1280x800 is the one
   project's viewport (buffer 640x400) and 200x180 is the floor. */
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

  /* No save: CONTINUE states why it is dead rather than vanishing. */
  await showMenu(page, { hasSave: false });
  await shot(page, 'menu-root.png');

  await showMenu(page, { hasSave: true, seed: '1337', index: 2 });
  await shot(page, 'menu-root-continue.png');

  /* A refused save is not the same event as no save, so the reason is on
     screen, verbatim and wrapped. */
  await showMenu(page, { hasSave: false, notice: 'CORRUPT SAVE: bands[0].edits', index: 2 });
  await shot(page, 'menu-root-refused.png');

  /* Mid-run: RESUME is the first row, and NEW RUN awaiting a second press says
     CONFIRM? rather than silently arming. */
  await showMenu(page, { hasSave: true, inRun: true, index: 1, confirm: 'new' });
  await shot(page, 'menu-root-inrun.png');

  /* A header from another build is not an empty slot. */
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

  /* The floor affords one column and about 18 lines against 46, so the
     shortcuts page pages rather than clipping; the next test proves every page
     is reachable. */
  await showMenu(page, { page: 'controls' });
  await shot(page, 'menu-controls-floor.png');

  await showMenu(page, { page: 'debug', index: 4 });
  await shot(page, 'menu-debug-floor.png');

  expect(errors).toEqual([]);
});

test('6l: every menu row lies inside the buffer, at the floor and at the desktop size', async ({ page }) => {
  const errors = await boot(page);
  await settle(page);

  /* Every row, not merely a non-empty list: the draw loop stops at the panel's
     bottom edge, so a page out of height records fewer rows and still
     photographs tidily. The DEBUG count comes off the content table. */
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
      /* Exactly one focused row: a cursor that lands nowhere cannot be driven
         by a keyboard. */
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
    /* The row the cursor starts on must change nothing: index 0 and `resume`
       first is the protection against a reflex ENTER mid-run. */
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

    /* The confirmation is a label, not a liveness change: an armed row must
       still be dispatchable or the second press does nothing. */
    await showMenu(page, { hasSave: true, inRun: true, index: 1, confirm: 'new' });
    rec = await menuDrawn(page);
    expect(rec.rows.length, `${w}x${h}`).toBe(7);
    expect(rec.rows.find(r => r.id === 'new').live, `${w}x${h}`).toBe(true);

    /* With no run behind it, the boot page is unchanged. */
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

  /* A panel claims the press. `openMenu` is never called here: the real keydown
     handler is what decides whether the menu steals a close. */
  await page.evaluate(async () => {
    const { open } = await import('/src/shell/ui.js');
    open('main');
  });
  await page.keyboard.press('Escape');
  expect(await state()).toEqual({ menu: false, top: null, armed: false });

  /* An armed pair claims the next one. */
  await page.evaluate(async () => {
    const { armPlace } = await import('/src/shell/ui.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    armPlace(S.timber, F.rung);
  });
  await page.keyboard.press('Escape');
  expect(await state()).toEqual({ menu: false, top: null, armed: false });

  /* With nothing standing, the menu opens straight out of the key handler, so
     no frame has to run first. */
  await page.keyboard.press('Escape');
  expect((await state()).menu).toBe(true);

  /* Escape inside the menu is BACK then PLAY, so the two are a toggle once
     nothing else is open. */
  await page.evaluate(() => __mf.draw());
  await page.keyboard.press('Escape');
  expect((await state()).menu).toBe(false);

  /* The map claims it too, and leaving the mode is all one press does. */
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
    /* Every binding, once: a group dropped by the column arithmetic or paged
       off the bottom fails here while photographing as a tidy page. */
    expect(seen.slice().sort(), `${w}x${h}: ${first.pages} page(s)`).toEqual(declared.slice().sort());
  }

  /* The floor really does page, or the loop above proved nothing about it. */
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

  /* It stands instead of the HUD, not over it: the quickbar strip the HUD
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

/* Each test below reads back what was drawn -- the tooltip's lines, the glyph
   mask the gauge printed, the pixels a mark changed -- with the screenshots
   there to catch a change of shape. */

/* A copper tile with a known amount of work on it, hovered. `write.setByte`
   clears the work ledger whenever the byte changes, so the tile is written
   first and the work added after. */
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

    /* `drawHUD` draws the title card instead of the tooltip while the banner
       is up, and `settle` advances `clock.t` but not `stepFx`. */
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

  /* 2.2 units of work: two units are out of the ground and the third is 20%
     cut, so the tile's whole charge less two remains. Floored with no epsilon,
     the same way `view/scene.js` counts the notches beside this text. */
  const CU = 240, FE = 200;
  const part = await hoverDeposit(page, { subKey: 'copper', work: 2.2 });
  expect(part.charge).toBe(CU);
  expect(part.work).toBeCloseTo(part.hard * 2.2, 6);
  expect(part.lines).toEqual(['COPPER', 'MASS 1.0', 'HARD 0.95S', `UNITS ${CU - 2} / ${CU}`]);

  /* Untouched, the tile is the full vein. */
  const fresh = await hoverDeposit(page, { subKey: 'iron', work: 0 });
  expect(fresh.charge).toBe(FE);
  expect(fresh.lines).toContain(`UNITS ${FE} / ${FE}`);

  /* One unit short of gone, never "0 / n": the last unit is the break itself,
     so a tile that still exists still holds one. */
  const nearly = await hoverDeposit(page, { subKey: 'copper', work: CU - 0.1 });
  expect(nearly.lines).toContain(`UNITS 1 / ${CU}`);

  /* And a charge-1 tile gains no line at all -- "1 / 1" on every rock in the
     world is noise, not information. `stone` is bulk, so it has no charge. */
  const stone = await hoverDeposit(page, { subKey: 'stone', work: 0.5 });
  expect(stone.charge).toBe(1);
  expect(stone.lines.some(l => l.startsWith('UNITS'))).toBe(false);

  await hoverDeposit(page, { subKey: 'copper', work: 2.2 });
  await shot(page, 'deposit-units-left.png');

  /* Resolving the line writes nothing. The headless epoch probe renders with
     no pointer, so `resolveHover` returns before it reaches a tile there. */
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

/* The tile plus the row under it: every mark's shadow lands on the mark's own
   last row, and only a second read proves it does not spill into the
   neighbour. */
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

  /* The same seven tiles are read twice, once with the queue up and once with
     it cleared, so what is counted is the mark and never the rock under it. */
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

  /* The X inside its frame, the X alone, and two pixels of each of its four
     ends, each over a shadow of itself one row lower: 48, 22 and 16 opaque
     pixels on an 8 px tile. Exact, because the three must not look alike. */
  for (const c of count) {
    expect(c.n, `${c.state} mark`).toBe(c.state === 'worked' ? 48 : c.state === 'reach' ? 22 : 16);
    /* The lowest shadow pixel falls on the tile's last row, so a mark cannot
       dirty its neighbour below. */
    expect(c.spill, `${c.state} mark bled into the tile below`).toBe(0);
  }

  /* Drawing them writes nothing. The headless epoch probe renders an empty
     queue, so `digMarks` returns before it touches anything there; a stale mark
     is skipped rather than pruned, which is the line that would break it. */
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

/* `depth` draws `s` at `(W - textWidth(s) - 10, 6)` in `uiDim` at or above the
   datum, with no shadow, so every glyph pixel is exactly that colour. Rendering
   the expected string through the same `drawText` makes this a claim about the
   text rather than about a rectangle of pixels. */
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

  /* The gauge measures the player's feet, not `player.y`, the top of a 16 px
     body. */
  expect(at.standing).toBe(true);
  expect(at.feet).toBeCloseTo(at.datum + 0.8, 1);

  const zero = await gaugeReads(page, '0M');
  expect(zero.drew).toBe(zero.want);

  /* Eight tiles down the same column reads 8M in the primary ink rather than
     the state tone, so this second read is against `ui` and not `uiDim`: the
     datum's sign drives the colour. */
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

  /* `rules/grants.js#step` awards the kiln and the cloud dock in the same
     substep and `shell/notify.js` drains all three rows together. Driven
     through `model/run.js#write.award`, not a hand-written pair of toasts. */
  const paid = await page.evaluate(async () => {
    const { run, write: rw } = await import('/src/model/run.js');
    const { push } = await import('/src/model/journal.js');
    const { banner, toasts } = await import('/src/view/fx.js');
    push('cycle', null, { cycleId: run.tribute?.cycleId, god: 'hephaestus', reward: {} });
    rw.award(['winch', 'cloud_dock']);
    __mf.frames(1);
    __mf.draw();
    return { banner: { ...banner }, queue: toasts.map(t => t.text), front: toasts[0].text };
  });

  /* Both facts are held, and the kiln, the First Trial's own reward, is the
     one on screen. */
  expect(paid.queue).toEqual(['WINCH IS GRANTED', 'THE CLOUD DOCK IS GRANTED']);
  expect(paid.front).toBe('WINCH IS GRANTED');
  /* And the god's own line is the banner beside it, not a third thing
     competing for the same slot. */
  expect(paid.banner.text).toBe('HEPHAESTUS');
  expect(paid.banner.sub).toBe('IS SATISFIED');
  await shot(page, 'cycle1-reward-announced.png');

  /* The second line arrives within the handoff rather than 3.2 s later:
     anything waiting cuts the row on screen to one glance. */
  const next = await page.evaluate(async () => {
    const { toasts } = await import('/src/view/fx.js');
    __mf.frames(126);                                 // 1.05 s, just past the handoff
    __mf.draw();
    return { queue: toasts.map(t => t.text) };
  });
  expect(next.queue).toEqual(['THE CLOUD DOCK IS GRANTED']);

  /* A repeat refreshes rather than stacking: eleven hand-feeds push eleven
     identical rows and the bottom line must not become a backlog. */
  const repeats = await page.evaluate(async () => {
    const { toast, toasts } = await import('/src/view/fx.js');
    toasts.length = 0;
    for (let i = 0; i < 11; i++) toast('1 COPPER ORE TITHED');
    return toasts.map(t => t.text);
  });
  expect(repeats).toEqual(['1 COPPER ORE TITHED']);

  /* The queue is bounded, dropping the row that has already had its glance
     rather than the newest fact. */
  const capped = await page.evaluate(async () => {
    const { toast, toasts } = await import('/src/view/fx.js');
    toasts.length = 0;
    for (const t of ['A', 'B', 'C', 'D']) toast(t);
    return toasts.map(t => t.text);
  });
  expect(capped).toEqual(['B', 'C', 'D']);

  expect(errors).toEqual([]);
});
