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
  /* Keyboard aim, not mouse: a hardcoded click position is off-canvas at phone
     size, where the base buffer is 200x422. No direction held: `aimAtKeys`
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
  /* Phase 3 (`docs/BUILD_PLAN.md`): `furnace` now costs 12 copper/ore + 6
     timber/log (`docs/SPEC.md` section 13), and `f` no longer places one
     unconditionally -- it moved behind `flags.showDebug`, off by default, the
     same gate `docs/AUDIT.md` section 3 recommended once the build menu could
     reach the identical machine. Granted directly here (this test's own point
     is the furnace's LOOK, not the mining grind to afford one) and placed
     through the build menu -- `furnace` is index 0 of
     `data/boons.js#STARTING_MACHINES`, so "1" is `furnace`, the same list and
     order `view/hud.js`'s BUILD section itself reads. */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    write.collect(S.copper, F.ore, 12);
    write.collect(S.timber, F.log, 6);
  });
  await page.evaluate(() => { __mf.flags.showInv = true; });
  await page.keyboard.press('1');
  await page.evaluate(() => __mf.frames(240));
  expect(await page.evaluate(() => __mf.machines.length)).toBe(1);
  /* `draw()` again after closing the panel: setting the flag alone does not
     repaint the canvas, and the last frame `frames(240)` drew was WITH the
     panel open -- this test's own point is the furnace's look, not the
     build menu, so the baseline expects the panel gone. */
  await page.evaluate(() => { __mf.flags.showInv = false; __mf.draw(); });
  await shot(page, 'furnace.png');
});

/* `press` (added in an earlier phase) had no key of its own at all -- `f` and
   `l` are hardcoded to `furnace`/`lift` in `shell/input.js`, and nothing
   bound a third literal key for a third machine. The fix is the build menu:
   `model/run.js#buildableMachines()` lists `run.granted` in order, and a
   number key while the panel is open arms `wants.machine` for that list
   position (`data/boons.js#STARTING_MACHINES` is `['furnace','lift','press']`,
   so "3" is `press`). This proves the SPECIFIC machine at that position gets
   placed, not merely that some machine does -- the failure mode a looser
   assertion (`machines.length === 1`) would hide, per CLAUDE.md's own warning
   about a test that measures the wrong thing. */
test('the build menu places the machine at the pressed number, not just any machine', async ({ page }) => {
  await boot(page);
  await settle(page);
  /* Phase 3 (`docs/BUILD_PLAN.md`): `press` now costs 4 copper/plate + 2
     copper/ingot (`docs/SPEC.md` section 13), granted directly here -- this
     test's own point is WHICH machine a digit places, not the refinement
     grind to afford one. */
  await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    write.collect(S.copper, F.plate, 4);
    write.collect(S.copper, F.ingot, 2);
  });
  await page.evaluate(() => { __mf.cmd.hasMouse = false; __mf.flags.showInv = true; });
  await page.keyboard.press('3');
  await page.evaluate(() => __mf.frames(240));
  const info = await page.evaluate(async () => {
    const { M } = await import('/src/data/machines.js');
    return { count: __mf.machines.length, def: __mf.machines[0]?.def, press: M.press, furnace: M.furnace };
  });
  expect(info.count).toBe(1);
  expect(info.def).toBe(info.press);
  expect(info.def).not.toBe(info.furnace);
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
   terrain happens to have a flat run near spawn. That is the same caution
   CLAUDE.md's furnace story is about: a test that only ever finds rock
   nearby would report "refused" as if it were "did not drag".
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

    /* The build bill this row carries (`data/machines.js`'s `belt_r`): 2
       copper plate, 4 stone gravel. Collected, not granted, so this also
       proves the cost is real and not merely declared. */
    rw.collect(S.copper, F.plate, 2);
    rw.collect(S.stone, F.gravel, 4);
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
       this row shares with the lift, which banks exactly one charge. */
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

    rw.collect(S.copper, F.plate, 2);
    rw.collect(S.stone, F.gravel, 4);
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

    rw.collect(S.copper, F.plate, 2);
    rw.collect(S.stone, F.gravel, 4);
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
   paint over the very pixel this test samples. */
test('the map overview shows explored terrain and leaves unexplored terrain undrawn', async ({ page }) => {
  await boot(page);
  await settle(page);
  const info = await page.evaluate(async () => {
    const { bandOf, bands, widthPx, heightPx, seenAt, worldX, worldY } =
      await import('/src/model/world.js');
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

    __mf.flags.showMap = true;
    __mf.draw();

    /* The exact scale/offset `drawMap` derives -- documented in `view/scene.js`
       as "one screen pixel per the smallest band tile, shrunk further only if
       the full world would not otherwise fit the viewport". Recomputed here
       from the same public band data the renderer reads, not asserted as a
       magic constant. */
    const c = document.getElementById('stage');
    const top = bands[0].origin.y;
    const bottomBand = bands[bands.length - 1];
    const worldH = bottomBand.origin.y + heightPx(bottomBand) - top;
    const left = Math.min(...bands.map(b => b.origin.x));
    const worldW = Math.max(...bands.map(b => b.origin.x + widthPx(b))) - left;
    const base = 1 / Math.min(...bands.map(b => b.tile));
    const scale = Math.min(base, c.width / worldW, c.height / worldH);
    const ox = (c.width - worldW * scale) / 2;
    const oy = (c.height - worldH * scale) / 2;

    const mapPx = (wx, wy) => ({
      x: Math.min(c.width - 1, Math.max(0, Math.round(ox + (wx - left) * scale))),
      y: Math.min(c.height - 1, Math.max(0, Math.round(oy + (wy - top) * scale)))
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
   the common desktop/phone viewports this suite already covers. That needs a
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
   resolved fresh from the pointer every frame by `view/hover.js`, and read
   back here through `__mf.hover`/`__mf.hits`, which `view/hud.js` exposes for
   exactly this. A screenshot cannot prove hover actually works: two identical
   pixels could come from the tooltip resolving nothing at all. This asserts
   the resolved CONTENT, the way `tools/check.mjs`'s trinket check proves an
   item was actually produced rather than that a recipe merely didn't throw. */
test('hovering an inventory pair resolves a tooltip naming it', async ({ page }) => {
  await boot(page);
  await settle(page);
  const info = await page.evaluate(async () => {
    const { write } = await import('/src/model/run.js');
    const { S } = await import('/src/data/substances.js');
    const { F } = await import('/src/data/forms.js');
    const { banner } = await import('/src/view/fx.js');

    write.collect(S.copper, F.ore, 5);
    __mf.flags.showInv = true;
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

    /* `__mf.hits` is the SAME rectangle list `view/hud.js` just drew -- the
       strip AND the open panel both list copper ore once collect() has run,
       so this is two hits; the panel's is pushed second. Finding it this way,
       rather than a hardcoded screen coordinate, is what keeps the assertion
       honest at both the desktop and phone viewports (CLAUDE.md: a hardcoded
       click position breaks at the other one). */
    const hits = __mf.hits.filter(h => h.sub === S.copper && h.form === F.ore);
    const panelHit = hits[hits.length - 1];
    __mf.mouseAt(panelHit.x + 2, panelHit.y + 2);
    __mf.draw();

    return { hitCount: hits.length, hover: { ...__mf.hover } };
  });

  expect(info.hitCount).toBe(2);              // strip entry + panel row
  expect(info.hover.active).toBe(true);
  expect(info.hover.lines[0]).toBe('COPPER ORE');
  expect(info.hover.lines.some(l => l.startsWith('MASS'))).toBe(true);
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
