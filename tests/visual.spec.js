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
    /* `shell/boot.js` plants the stock pickaxe a few tiles off spawn now --
       walk over it first, or `hasPick()` is false and digging is a no-op.
       `right` is a held key, not edge-triggered, so it must be released
       explicitly or the player keeps drifting through the whole dig and no
       single tile ever accumulates enough work to break. */
    __mf.hold({ right: 1 }, 90);
    __mf.cmd.right = false;
    __mf.hold({ dig: 1, down: 1 }, 900);
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
   down, then place the dropped gravel back into the exact hole` above does. */
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
  /* The held `furnace/rig` is given directly, and assigned to quickbar slot 0
     through `shell/ui.js#assignQuickbar` rather than by a real drag, because
     this test's own point is the furnace's LOOK -- not the crafting grind or
     the drag-assignment, both of which other tests cover. Then '1'
     (`view/ui/quickbar.js#slotForDigit`: '1' is slot 0) arms it and 'e'
     places it. */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { assignQuickbar } = await import('/src/shell/ui.js');
    write.collect(S.furnace, F.rig, 1);
    assignQuickbar(0, { sub: S.furnace, form: F.rig });
  });
  await page.keyboard.press('1');
  await page.keyboard.press('e');
  await page.evaluate(() => __mf.frames(240));
  /* Phase 10b's altar is placed at boot (`rules/cycles.js#ensureAltarPlaced`)
     -- exclude it so this still asserts "exactly the one machine THIS test
     placed, nothing stray", not a total that silently includes boot content. */
  expect(await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.filter(m => m.def !== M.altar).length;
  })).toBe(1);
  await shot(page, 'furnace.png');
});

/* Retires `the build menu places the machine at the pressed number...`'s own
   test that used to sit here (`docs/FINDINGS.md`: the old digit-driven BUILD
   menu -- `model/run.js#buildableMachines()`, gone -- is superseded outright
   by click-to-arm placement, mouse or keyboard, against the quickbar). Its
   point survives in the new mechanism's own terms: a digit key must arm
   EXACTLY the quickbar slot it names (`view/ui/quickbar.js#slotForDigit`),
   not merely "whatever placeable happens to be held" -- proved here by
   putting two DIFFERENT machines in two different slots and checking the
   digit for ONE of them arms exactly that one's pair (not the other's), then
   places exactly that one machine -- the failure mode a looser assertion
   (`machines.length === 1`) would hide, per CLAUDE.md's own warning about a
   test that measures the wrong thing. Also covers the "empty slot" and
   "pressed digit but the panel was never opened" cases along the way, since
   this mechanism (unlike the old menu) works with no panel gate at all. */
/* Every other quickbar test assigns through `shell/ui.js#assignQuickbar`
   directly, "because the drag-to-assign gesture itself is exercised
   elsewhere" -- there was no "elsewhere". This is that test: a REAL
   drag (`realDrag`, actual `page.mouse` events) from the Character tab's
   inventory grid onto a quickbar slot, then closing the panel for real
   (`Escape`) and using the result exactly the way a player does -- digit key
   arms, `E` places. */
test('REAL DRAG: dragging a held item from the inventory grid onto a quickbar slot assigns it, and the assignment survives closing the panel', async ({ page }) => {
  await boot(page);
  await settle(page);
  await page.evaluate(async () => {
    const { bandOf } = await import('/src/model/world.js');
    __mf.revealAll(bandOf('surface'));
  });
  const { S, F } = await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    write.collect(S.furnace, F.rig, 1);
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

  await realDrag(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2, qSlot.x + qSlot.w / 2, qSlot.y + qSlot.h / 2);
  expect(await page.evaluate(() => __mf.ui.quickbar[0])).toEqual({ sub: S.furnace, form: F.rig });

  /* Close the panel for real -- Escape, not `closeTop()` called from the
     test -- so this also proves the assignment is UI state that outlives
     the window, not something the panel itself was quietly holding. */
  await page.keyboard.press('Escape');
  await page.evaluate(() => __mf.frames(1));
  expect(await page.evaluate(() => __mf.ui.open)).toEqual([]);
  expect(await page.evaluate(() => __mf.ui.quickbar[0])).toEqual({ sub: S.furnace, form: F.rig });

  await page.keyboard.press('1');
  await page.evaluate(() => __mf.frames(1));
  expect(await page.evaluate(() => __mf.ui.armedPlace)).toEqual({ sub: S.furnace, form: F.rig });

  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });
  await page.keyboard.press('e');
  await page.evaluate(() => __mf.frames(240));
  /* Exclude the boot-placed altar (`rules/cycles.js#ensureAltarPlaced`) so
     this still asserts exactly the one machine this drag-and-place put down. */
  expect(await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.filter(m => m.def !== M.altar).length;
  })).toBe(1);
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
     places, not the crafting grind to earn either. Assigned through
     `shell/ui.js#assignQuickbar` directly rather than a real drag -- the
     drag-to-assign gesture itself is exercised elsewhere; this test's point
     is the digit key. */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { assignQuickbar } = await import('/src/shell/ui.js');
    write.collect(S.furnace, F.rig, 1);
    write.collect(S.press, F.rig, 1);
    assignQuickbar(0, { sub: S.furnace, form: F.rig });
    assignQuickbar(2, { sub: S.press, form: F.rig });
  });

  await page.keyboard.press('3');
  const armed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    return { armedPlace: __mf.ui.armedPlace, press: S.press, furnace: S.furnace, rig: F.rig };
  });
  expect(armed.armedPlace).toEqual({ sub: armed.press, form: armed.rig });
  expect(armed.armedPlace.sub).not.toBe(armed.furnace);

  await page.keyboard.press('e');
  await page.evaluate(() => __mf.frames(240));
  const info = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    /* Exclude the boot-placed altar (`rules/cycles.js#ensureAltarPlaced`) --
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

    __mf.hold({ craft: 1 }, 500);
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
       one's. */
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

    /* PARKED, NOT FOLLOWING. The overview follows the player by default
       (Phase 9), and the player has just been moved to the top-left corner --
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
       renderer's scale, zoom, scroll offset or reserved-edge arithmetic the
       way a hand-copied formula did. (It did: this block used to re-implement
       `drawMap`'s `min(1/minTile, W/worldW, H/worldH)` by hand.) */
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
  const info = await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { banner } = await import('/src/view/fx.js');
    const { open, setTab } = await import('/src/shell/ui.js');

    write.collect(S.copper, F.ore, 5);
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
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { write: rw } = await import('/src/model/run.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    const { grant, equipFirst, step: trinketStep } = await import('/src/rules/trinkets.js');
    const { banner } = await import('/src/view/fx.js');

    rw.collect(S.copper, F.ore, 5);
    rw.collect(S.timber, F.log, 3);
    grant('bellows');
    __mf.frames(200);          // let the drafted relic fall and land in the pockets
    equipFirst();
    trinketStep();             // sync model/mods.js so the resolved deltas actually show

    open('main');
    setTab('main', 'char');
    __mf.cmd.hasMouse = false;
    banner.fade = 0;
    __mf.frames(2);
  });
  await shot(page, 'ui-character.png');
});

/* No recipe is genuinely lockable in this build -- `model/run.js
   #RUN_SCHEMA.known` is seeded with EVERY `HAND_RECIPES` id in
   `write.reset()`. The silhouette-rendering CODE PATH is real and wired
   (`view/ui/mainPanel.js`'s `!known` branch), but there is nothing to feed it
   a locked id with, so this screenshots the tab AS IT ACTUALLY RENDERS today
   rather than fabricating a locked recipe that cannot currently occur. */
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
    __mf.revealAll(bandOf('surface'));
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
     digit) against the quickbar is the one placement path now. Assigned
     directly through `shell/ui.js#assignQuickbar` -- the drag-to-assign
     gesture itself is exercised elsewhere; this flow's point is the smelt
     chain, not a second proof of drag-and-drop. */
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { assignQuickbar } = await import('/src/shell/ui.js');
    assignQuickbar(0, { sub: S.furnace, form: F.rig });
  });
  await page.keyboard.press('1');        // arms slot 0's furnace (`view/ui/quickbar.js#slotForDigit`)
  await page.keyboard.press('e');        // places it
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
    /* Exclude the boot-placed altar (`rules/cycles.js#ensureAltarPlaced`) --
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

    /* Peg rungs BY HAND -- the real hand-craft key, not a grant. */
    __mf.give(S.timber, F.log, 2);
    __mf.hold({ craft: 1 }, 300);
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
       buffer (`handFeed` pulls it from the pockets within reach). */
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
    tw.set(band, tx, ty + 4, S.timber, F.log);        // a ladder tile
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
    const { open, setTab } = await import('/src/shell/ui.js');

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

  const before = await page.evaluate(async () => {
    const { eff } = await import('/src/model/mods.js');
    const { BOONS } = await import('/src/data/boons.js');
    const b = BOONS[0];
    const raw = b.mods[0].key;
    const dot = raw.indexOf('.');
    return { key: dot < 0 ? raw : raw.slice(0, dot), scope: dot < 0 ? undefined : raw.slice(dot + 1),
             secs: b.secs, value: eff(dot < 0 ? raw : raw.slice(0, dot), dot < 0 ? undefined : raw.slice(dot + 1)) };
  });

  await page.keyboard.press('b');         // the debug timed-boon draft (flags.showDebug required)
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
  await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { open, setTab } = await import('/src/shell/ui.js');
    __mf.give(S.bellows, F.relic, 1);
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

  await page.keyboard.press('e');
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
  /* Exclude the boot-placed altar (`rules/cycles.js#ensureAltarPlaced`) --
     this test's point is that nothing armed means 'E' places nothing, not
     that the world is devoid of machines at boot. */
  const countExAltar = () => page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return __mf.machines.filter(m => m.def !== M.altar).length;
  });
  const before = await countExAltar();
  expect(before).toBe(0);
  await page.keyboard.press('e');
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
    const { invCount } = await import('/src/model/run.js');
    __mf.give(S.copper, F.ore, 12);
    __mf.give(S.timber, F.log, 6);
    __mf.hold({ craft: 1 }, 1000);      // > 8.0s, `data/recipes.js#furnace`'s own secs
    __mf.cmd.craft = false;             // release the key -- `hold` only auto-releases hop/place
    __mf.frames(150);                   // let the crafted item fall and clear the pickup-magnet delay
    return { rig: invCount(S.furnace, F.rig) };
  });
  expect(crafted.rig).toBe(1);

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

  await page.keyboard.press('e');
  await page.evaluate(() => __mf.frames(5));

  const result = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { invCount } = await import('/src/model/run.js');
    /* Exclude the boot-placed altar (`rules/cycles.js#ensureAltarPlaced`) --
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

test('click-to-arm: dig down, then place the dropped gravel back into the exact hole', async ({ page }) => {
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

    rw.collect(S.pick, F.relic, 1);           // the stock pickaxe, granted directly

    pw.band(band);
    pw.move(worldX(band, tx), worldY(band, ty) - 4);   // centred on row `ty`, resting on the floor
  }, { tx, ty, holeTx });

  await page.evaluate(() => { __mf.cmd.hasMouse = false; });
  await page.evaluate(() => { __mf.hold({ right: 1 }, 6); __mf.cmd.right = false; });   // face right, toward the hole
  await page.evaluate(() => __mf.hold({ dig: 1 }, 400));   // soil hard=0.50s, comfortably past it
  await page.evaluate(() => { __mf.cmd.dig = false; });    // `dig` is held, not edge-triggered -- release it
  await page.evaluate(() => __mf.frames(150));             // let the dropped gravel fall and clear the pickup-magnet delay

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

  /* Click-to-arm the gravel, then place it back with 'E', aimed exactly the
     same way (no direction held, facing right) at the exact tile just
     mined. */
  await page.evaluate(async () => {
    const { open, setTab } = await import('/src/shell/ui.js');
    open('main');
    setTab('main', 'char');
    __mf.frames(1);
  });

  const invSlot = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const grid = __mf.ui.grids.find(g => g.id === 'inv');
    return grid.slots.find(s => s.sub === S.soil && s.form === F.gravel);
  });
  expect(invSlot).toBeTruthy();
  await realClick(page, invSlot.x + invSlot.w / 2, invSlot.y + invSlot.h / 2);

  const armedPair = await page.evaluate(() => __mf.ui.armedPlace);
  expect(armedPair).toBeTruthy();

  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });

  const gravelBefore = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    return invCount(S.soil, F.gravel);
  });

  await page.keyboard.press('e');
  await page.evaluate(() => __mf.frames(5));

  const result = await page.evaluate(async ({ holeTx, ty }) => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { invCount } = await import('/src/model/run.js');
    const { tileAt } = await import('/src/model/tiles.js');
    const { bandOf } = await import('/src/model/world.js');
    return {
      tile: tileAt(bandOf('topsoil'), holeTx, ty),
      gravel: invCount(S.soil, F.gravel),
      armedAfter: __mf.ui.armedPlace
    };
  }, { holeTx, ty });

  expect(result.tile).not.toBe(0);                    // solid again, not AIR
  expect(result.gravel).toBe(gravelBefore - 1);        // exactly one unit spent
  expect(result.armedAfter).toBeNull();                // cleared on a successful placement
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
  await page.evaluate(() => {
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
  await page.keyboard.press('i');
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
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { setTab } = await import('/src/shell/ui.js');
    __mf.give(S.furnace, F.rig, 1);
    setTab('main', 'char');
    __mf.frames(1);
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
    return { armedPlace: __mf.ui.armedPlace, sub: S.furnace, form: F.rig };
  });
  expect(armed.armedPlace).toEqual({ sub: armed.sub, form: armed.form });

  /* Keyboard aim, no direction held -- the same "aims to the side, at the
     player's own row" recipe `a placed furnace` proves lands on open air
     with a floor beneath it. Closed with 'i' (NOT Escape, which also clears
     the arm) so the ghost is not drawn underneath the panel. */
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.frames(1); });
  await page.keyboard.press('i');
  await page.evaluate(() => __mf.frames(1));

  ui = await page.evaluate(() => __mf.ui);
  expect(ui.open).not.toContain('main');
  const armedStillSet = await page.evaluate(() => __mf.ui.armedPlace);
  expect(armedStillSet).toBeTruthy();

  await shot(page, 'furnace-lifecycle-2-ghost.png');

  /* ---- stage 3: confirm the placement -- placed, no fuel ---- */
  await page.keyboard.press('e');
  await page.evaluate(() => __mf.frames(5));

  const placed = await page.evaluate(async () => {
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { M } = await import('/src/data/machines.js');
    const { invCount } = await import('/src/model/run.js');
    /* Exclude the boot-placed altar (`rules/cycles.js#ensureAltarPlaced`) --
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
     the boot-placed altar (`rules/cycles.js#ensureAltarPlaced`) exists in
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

    /* Exclude the boot-placed altar (`rules/cycles.js#ensureAltarPlaced`) --
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

   NOTHING MOVES YET. Phase 8f writes `m.turn` and the carrier's `t`; this
   phase reads them. `winch-turned.png` sets a nonzero phase through the model
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

    /* CARRIER POSITION, LOAD AND ROTATION PHASE ARE SET *AFTER* THE SUBSTEPS,
       AND THAT MOVED IN PHASE 8F. It used to be safe to set them first,
       because nothing wrote them: this whole matrix was baselined against a
       world where a carrier parked at `t = 0` for ever. `rules/drive.js` now
       owns all three -- it slides an unpowered carrier down the cable every
       substep, recomputes `load` from what is actually aboard, and advances
       `turn` for every drivetrain node -- so a value written before
       `frames()` is a value the simulation immediately overwrites. Set here,
       the shot photographs the state the spec DECLARES, which is what an
       appearance baseline is for, and the assertions each test makes about
       its own `t`/`load` stay true. The MOVING states are Phase 8g's own
       matrix (docs/PLAN-gears-and-winches.md section 6.5); this one is still
       deliberately static. */
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
   trusted: `slope` is the number `rules/drive.js` will divide gravity by in
   Phase 8f, so a shot named "45 degrees" whose slope had drifted would be a
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
   Phase 8f will actually solve, drawn so it reads as one continuous run of
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
   a broken one reads as broken -- which is the whole of what Phase 9's
   overview will draw from the same query. */
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
   Nothing in the game writes it until Phase 8f; this is the baseline that
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

/* RENDER PURITY OVER EVERY NEW DRAW PATH (invariant 9 and the acceptance
   criterion in docs/PLAN-gears-and-winches.md section 6.3): a cable, a bucket
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

   Phase 8e's matrix above is STATIC by construction: it writes `t`, `load` and
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
   six drivetrain pictures. Phase 8e's existing shots are NOT touched -- they
   are already baselined with the callout, and re-taking them would be churning
   another phase's reviewed output.

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
  return page.evaluate(async (spec) => {
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
    const { clearLink } = await import('/src/shell/ui.js');
    const { banner } = await import('/src/view/fx.js');
    const { VIEW } = await import('/src/core/canvas.js');

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

    /* THE MOTION. Nothing is written after this. */
    __mf.cmd.turn = !!spec.turn;
    __mf.frames(spec.frames);
    __mf.cmd.turn = false;

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
  }, spec);
}

const MOTION_SHAFT = { tx0: 40, ty0: 24, w: 12, h: 23, sky: true };

/* ---------- 1. mid-ascent, with a rider aboard ---------- */
test('drive: a carrier mid-ascent with a rider aboard', async ({ page }) => {
  await boot(page);
  await settle(page);
  const r = await driveScene(page, {
    rooms: [MOTION_SHAFT],
    machines: [['hub', 44, 43], ['hub', 44, 33], ...CRANKS(43, 33, 43)],
    links: [[0, 1]], start: [[0, 0.05]], ride: 0, turn: true, frames: 400,
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
