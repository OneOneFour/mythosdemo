// Headless verification. Stubs enough of the DOM and canvas2d to import every
// module, generate the world, drive a scripted playthrough of the tutorial beat
// sheet, and fuzz the player against the tile grid.
//
// It CANNOT tell you whether anything looks good. Visual changes need a human
// to eyeball them; say so rather than claiming a visual result is verified.

const calls = { fillRect: 0, drawImage: 0, clearRect: 0 };

function makeCtx() {
  const grad = () => ({ addColorStop() {} });
  return {
    fillStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
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
    save() {}, restore() {}
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

const stage = makeCanvas();
globalThis.window = globalThis;
globalThis.innerWidth = 1600;
globalThis.innerHeight = 900;
globalThis.document = {
  getElementById: id => (id === 'stage' ? stage : null),
  createElement: t => (t === 'canvas' ? makeCanvas(128, 128) : { style: {} })
};
globalThis.performance = { now: () => 0 };
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;

let failures = 0;
const fail = m => { console.error('  FAIL: ' + m); failures++; process.exitCode = 1; };
const ok   = m => console.log('  ok   ' + m);

/* ---- import everything, including input.js. The mockup shipped an input
        module that was orphaned AND unparseable; importing it here means
        that cannot happen again silently. ---- */
/* Several of these bindings are deliberately unused: importing the module IS
   the assertion. The mockup shipped an input.js that nothing imported and that
   did not parse, and nobody noticed for weeks. */
const cv    = await import('../src/core/canvas.js');
const _font  = await import('../src/core/font.js');
const _pal   = await import('../src/core/palette.js');
const rng   = await import('../src/core/rng.js');
const tiles = await import('../src/world/tiles.js');
const grid  = await import('../src/world/grid.js');
const gen   = await import('../src/world/generate.js');
const paint = await import('../src/world/paint.js');
const state = await import('../src/sim/state.js');
const plr   = await import('../src/sim/player.js');
const itm   = await import('../src/sim/items.js');
const min   = await import('../src/sim/mining.js');
const str   = await import('../src/sim/structures.js');
const tut   = await import('../src/sim/tutorial.js');
const _input = await import('../src/input.js');
const scene = await import('../src/render/scene.js');
const _hud   = await import('../src/render/hud.js');
const main  = await import('../src/main.js');

console.log('\nimported all 18 modules (input.js included)\n');

const DT = 1 / 60;
const NONE = { left:0, right:0, up:0, down:0, hop:0, dig:0, place:0 };
const c = (o = {}) => ({ ...NONE, ...o });

/* run one frame of the real sim with an explicit command set */
function tick(cmd) {
  state.clock.dt = DT; state.clock.t += DT;
  min.setAimKeys(cmd);
  plr.updatePlayer(DT, cmd);
  min.updateMining(DT, cmd);
  itm.updateItems(DT);
  str.updateStructures(DT);
  tut.updateTutorial(DT);
}

/* aim at an explicit tile, ignoring facing, then dig it until it breaks */
function digTile(tx, ty, limit = 600) {
  for (let f = 0; f < limit; f++) {
    min.aim.tx = tx; min.aim.ty = ty; min.aim.valid = grid.inBounds(tx, ty);
    if (grid.tileAt(tx, ty) === tiles.AIR) return true;
    state.clock.dt = DT; state.clock.t += DT;
    plr.updatePlayer(DT, NONE);
    min.updateMining(DT, c({ dig: 1 }));
    itm.updateItems(DT);
    str.updateStructures(DT);
    tut.updateTutorial(DT);
  }
  return grid.tileAt(tx, ty) === tiles.AIR;
}

function settle(n, cmd = NONE) { for (let f = 0; f < n; f++) tick(cmd); }

/* the columns the player's hitbox actually occupies, plus a margin, so the
   bot digs a shaft it can fall down rather than one beside itself */
function footCols() {
  const a = Math.floor(plr.player.x / grid.TILE);
  const b = Math.floor((plr.player.x + plr.PW - 1) / grid.TILE);
  return a === b ? [a, a + 1] : [a, b];
}

/* clear one row of the shaft under the player and let it drop */
function digRow(ty) {
  for (const tx of footCols()) digTile(tx, ty);
  settle(20);
}

/* walk toward a world x, giving up after a budget of frames */
function walkTo(wx, limit = 900) {
  for (let f = 0; f < limit; f++) {
    const dx = wx - (plr.player.x + plr.PW / 2);
    if (Math.abs(dx) < 1.5) return true;
    tick(c(dx > 0 ? { right: 1 } : { left: 1 }));
  }
  return false;
}


/* ============================================================
   1. GEOMETRY AND MATERIAL INVARIANTS
   ============================================================ */
console.log('1. world generation');
{
  const site = gen.generate(1337);
  for (const k of ['spawn', 'pick', 'altar', 'tree', 'seam', 'firstVein'])
    if (!site[k]) fail(`SITE.${k} missing`);

  // the spawn shelf must be walkable and clear overhead
  const s = gen.surface[gen.SPAWN_TX];
  if (!grid.solidAt(gen.SPAWN_TX, s)) fail('spawn tile is not standing on ground');
  for (let y = s - 3; y < s; y++)
    if (grid.solidAt(gen.SPAWN_TX, y)) fail(`spawn headroom blocked at ty=${y}`);
  ok('spawn shelf is walkable with headroom');

  // the guaranteed vein must actually be reachable by digging straight down
  let found = -1;
  for (let y = s + 1; y < s + 16; y++)
    if (grid.tileAt(gen.SPAWN_TX, y) === tiles.T.copper) { found = y - s; break; }
  if (found < 0) fail('no copper directly below spawn');
  else if (found > 10) fail(`copper is ${found} tiles down, too deep for the tutorial`);
  else ok(`copper reachable ${found} tiles straight down from spawn`);

  // the soft seam must be softer than the soil around it, or the first dig
  // teaches nothing
  if (tiles.hardOf(tiles.T.seam) >= tiles.hardOf(tiles.T.soil))
    fail('soft seam is not softer than soil');
  else ok('soft seam is softer than surrounding soil');

  // the tree is the only surface timber, so it must exist
  let trunk = 0;
  for (let y = site.tree.ty; y < site.tree.ty + 8; y++)
    if (grid.tileAt(site.tree.tx, y) === tiles.T.timber) trunk++;
  if (trunk < 4) fail(`olive tree trunk is only ${trunk} tiles`);
  else ok(`olive tree has ${trunk} timber tiles`);

  // sides and floor must be sealed
  if (!grid.solidAt(-1, s) || !grid.solidAt(grid.WORLD_TW, s))
    fail('world sides are not solid');
  else ok('world boundary is solid');
}


/* ============================================================
   2. FALL DAMAGE MATCHES THE SPEC TABLE
   ============================================================ */
console.log('\n2. fall damage curve (docs/SPEC.md)');
{
  const table = [[4,0],[5,0],[8,1],[11,2],[14,3],[17,4],[20,5]];
  let bad = 0;
  for (const [tilesDown, want] of table) {
    const v = Math.sqrt(2 * state.GRAV * tilesDown * grid.TILE);
    const got = plr.fallHearts(v);
    if (got !== want) { fail(`${tilesDown} tiles -> ${got} hearts, spec says ${want}`); bad++; }
  }
  if (!bad) ok('all 7 rows match: 5 tiles safe, 20 tiles lethal');

  // and a real simulated drop must actually kill
  main.newRun(1337);
  // carve a clear 24-tile shaft and drop the player down it
  const dtx = gen.SPAWN_TX;
  for (let y = gen.surface[dtx]; y < gen.surface[dtx] + 26; y++) {
    grid.setTile(dtx, y, tiles.AIR);
    grid.setTile(dtx + 1, y, tiles.AIR);
  }
  plr.spawnPlayer(dtx, gen.surface[dtx] - 2);
  for (let f = 0; f < 400 && !state.run.dead; f++) tick(NONE);
  if (!state.run.dead) fail('a 24-tile simulated drop did not kill the player');
  else ok(`a 24-tile simulated drop kills: "${state.run.deathCause}"`);
}


/* ============================================================
   3. SCRIPTED PLAYTHROUGH OF THE BEAT SHEET
   ============================================================ */
console.log('\n3. scripted playthrough of the first two minutes');
{
  main.newRun(1337);
  const p = plr.player, r = state.run;
  const reached = [];
  const note = () => { const b = tut.beatId(); if (!reached.includes(b)) reached.push(b); };
  note();

  // beat: walk
  walkTo(p.x + 60);
  if (tut.beatId() === 'walk') fail('walking did not advance the walk beat');
  note();

  // beat: pick
  walkTo(gen.SITE.pick.tx * grid.TILE + 4);
  settle(20);
  if (!r.hasPick) fail('walking into the pickaxe did not pick it up');
  else ok('pickaxe taken by walking into it');
  note();

  // beat: dig — cut the soft seam under spawn
  walkTo(gen.SPAWN_TX * grid.TILE + 4);
  settle(20);
  const s0 = gen.surface[gen.SPAWN_TX];
  // the turf row underfoot goes first — you cannot dig a hole you are standing over
  for (let y = s0; y <= s0 + 2; y++) digRow(y);
  settle(30);
  if (tut.progress.dug < 3) fail(`only ${tut.progress.dug} tiles dug`);
  else ok(`${tut.progress.dug} tiles cut through the soft seam`);
  note();

  // beat: copper — keep digging straight down; ore falls to the shaft floor
  for (let y = s0 + 3; y <= s0 + 16 && r.inv.copper < 10; y++) digRow(y);
  settle(120);
  if (r.inv.copper < 1) fail('digging to the vein yielded no copper');
  else ok(`${r.inv.copper} copper collected from the shaft floor`);
  if (tut.beatId() === 'copper') fail('collecting copper did not advance the beat');
  note();

  // record the shaft while the player is still down it — measuring this later,
  // after the player has walked to the altar, silently tests the wrong column
  const shaftCol   = Math.floor((p.x + plr.PW / 2) / grid.TILE);
  const shaftFloorTy = Math.floor((p.y + plr.PH) / grid.TILE);

  // ore must have fallen, not teleported: the player should be below surface
  const depthTiles = Math.round((p.y - s0 * grid.TILE) / grid.TILE);
  if (depthTiles < 4) fail(`player only ${depthTiles} tiles down after digging to the vein`);
  else ok(`player is ${depthTiles} tiles below the turf line`);

  // beat: ascend — place ladders out, which is the intended route
  r.inv.timber = 12;                     // stand in for felling the tree
  let placed = 0;
  for (let y = Math.floor(p.y / grid.TILE); y >= s0 - 2; y--) {
    min.aim.tx = Math.floor((p.x + plr.PW / 2) / grid.TILE);
    min.aim.ty = y; min.aim.valid = true;
    if (min.placeLadder()) placed++;
  }
  if (placed < 4) fail(`only ${placed} ladder tiles placed`);
  else ok(`${placed} ladder tiles placed up the shaft`);

  // climb: ladders must actually carry the player up at CLIMB speed
  const yBefore = p.y;
  for (let f = 0; f < 60 * 12 && p.y > (s0 - 2) * grid.TILE; f++) tick(c({ up: 1 }));
  const climbed = (yBefore - p.y) / grid.TILE;
  if (climbed < 3) fail(`ladder climb only gained ${climbed.toFixed(1)} tiles`);
  else ok(`climbed ${climbed.toFixed(1)} tiles up the ladder`);
  settle(30);
  note();

  // beat: trial — the altar rises and Zeus posts the demand
  settle(200);
  note();
  if (!r.trial) fail('the trial was never posted after returning to the surface');
  else ok(`trial posted: ${r.trial.have}/${r.trial.need} ${r.trial.what}`);

  // beat: deliver
  if (r.trial) {
    r.inv.copper = Math.max(r.inv.copper, r.trial.need);
    const arrived = walkTo(tut.altar.tx * grid.TILE + 4, 1800);
    settle(40);
    if (process.env.DBG) console.log('    [dbg] arrived=' + arrived +
      ' px=' + p.x.toFixed(1) + ' py=' + p.y.toFixed(1) +
      ' ax=' + (tut.altar.tx * grid.TILE + 4) + ' ay=' + (tut.altar.ty * grid.TILE) +
      ' dx=' + Math.abs(p.x + plr.PW/2 - (tut.altar.tx*grid.TILE+4)).toFixed(1) +
      ' dy=' + Math.abs(p.y - tut.altar.ty*grid.TILE).toFixed(1) +
      ' cu=' + r.inv.copper + ' risen=' + tut.altar.risen + ' dead=' + r.dead);
    if (!r.trial.done) fail('delivering 10 copper to the altar did not complete the trial');
    else ok('trial completed at the altar');
    if (r.gift !== 'furnace') fail('the furnace was not gifted on completion');
    else ok('crude furnace gifted');
  }
  note();

  // beat: furnace — placed at the shaft floor, it must catch falling material
  const shaftFloor = shaftFloorTy;
  if (r.gift === 'furnace') {
    if (shaftFloor - s0 < 6) fail(`shaft floor is only ${shaftFloor - s0} tiles down`);
    {
      // widen the shaft bottom so a 3-wide furnace fits with the mouth overhead
      for (let j = 2; j >= 1; j--)
        for (let i = -1; i <= 1; i++) grid.setTile(shaftCol + i, shaftFloor - j, tiles.AIR);
      for (let i = -1; i <= 1; i++) grid.setTile(shaftCol + i, shaftFloor, tiles.T.lime);
      if (!str.placeFurnace(shaftCol - 1, shaftFloor - 2))
        fail('furnace would not place at the shaft floor');
      else ok(`furnace placed at the shaft floor, ${shaftFloor - s0} tiles down`);
    }
  }
  if (str.structures.length) {
    const f = str.structures[0];
    // drop ore and timber down the shaft, as gravity would deliver them
    const dropY = Math.max((s0 + 1) * grid.TILE, f.y - 40);
    for (let k = 0; k < 6; k++) itm.spawnItem(f.x + f.w / 2, dropY, 'copper', 0, 0);
    for (let k = 0; k < 3; k++) itm.spawnItem(f.x + f.w / 2, dropY, 'timber', 0, 0);
    let caught = 0;
    for (let fr = 0; fr < 60 * 40 && f.made < 1; fr++) {
      state.clock.dt = DT; state.clock.t += DT;
      itm.updateItems(DT); str.updateStructures(DT); tut.updateTutorial(DT);
      caught = Math.max(caught, f.buf.copper + f.buf.timber);
    }
    if (!caught) fail('the furnace caught nothing that fell into it');
    if (f.made < 1) fail(`the furnace never smelted an ingot (caught ${caught} units)`);
    else ok(`furnace caught falling material and smelted ${f.made} ingot(s)`);
  }
  note();

  const all = tut.BEATS.map(b => b.id);
  const missed = all.filter(b => !reached.includes(b));
  console.log(`\n  beats reached: ${reached.join(' -> ')}`);
  if (missed.length) console.log(`  beats not reached by the bot: ${missed.join(', ')}`);
  if (reached.length < 7) fail(`bot only reached ${reached.length}/${all.length} beats`);
}


/* ============================================================
   4. FUZZ: THE PLAYER MUST NEVER END A FRAME INSIDE SOLID ROCK
   ============================================================ */
console.log('\n4. collision fuzz at four viewport sizes');
for (const [w, h] of [[390, 844], [768, 1024], [1600, 900], [3440, 1440]]) {
  globalThis.innerWidth = w; globalThis.innerHeight = h;
  cv.resize();
  main.newRun(1337);
  state.run.hasPick = true;
  state.run.maxHearts = 99; state.run.hearts = 99;    // fuzzing, not balancing

  let stuck = 0, nonFinite = 0;
  const seed = rng.mulberry(0xC0FFEE + w);
  for (let f = 0; f < 60 * 45; f++) {
    const cmd = c({
      left:  seed() < 0.30 ? 1 : 0, right: seed() < 0.30 ? 1 : 0,
      up:    seed() < 0.20 ? 1 : 0, down:  seed() < 0.25 ? 1 : 0,
      hop:   seed() < 0.06 ? 1 : 0, dig:   seed() < 0.55 ? 1 : 0,
      place: seed() < 0.02 ? 1 : 0
    });
    if (seed() < 0.02) state.run.inv.timber += 1;
    tick(cmd);
    const p = plr.player;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vy)) nonFinite++;
    if (plr.boxSolid(p.x, p.y, plr.PW, plr.PH)) stuck++;
    if (state.run.dead) {
      main.newRun(1337);
      state.run.hasPick = true;
      state.run.hearts = 99; state.run.maxHearts = 99;
    }
  }
  if (nonFinite) fail(`${w}x${h}: ${nonFinite} frames with non-finite player state`);
  if (stuck)     fail(`${w}x${h}: player inside solid rock on ${stuck} frames`);

  // items must never come to rest inside solid rock
  let buried = 0;
  for (const it of state.items)
    if (it.rest > 0 && grid.solidAt(Math.floor(it.x / grid.TILE), Math.floor(it.y / grid.TILE)))
      buried++;
  if (buried) fail(`${w}x${h}: ${buried} items at rest inside solid rock`);

  // render every depth band
  for (let y = 0; y <= grid.WORLD_H - cv.VIEW.h; y += 64) {
    state.cam.y = y; state.cam.x = (y * 3) % Math.max(1, grid.WORLD_W - cv.VIEW.w);
    try { scene.render(); } catch (e) { fail(`render at y=${y}: ${e.message}`); break; }
  }
  console.log(`  ${String(w + 'x' + h).padEnd(11)} view=${cv.VIEW.w}x${cv.VIEW.h}` +
              ` scale=${cv.VIEW.scale}  chunks/frame=${scene.stats.chunksDrawn}` +
              `  stuck=${stuck} buried=${buried}`);
}


/* ============================================================
   5. CHUNK REPAINT COST — the reason for the tile grid
   ============================================================ */
console.log('\n5. dig cost');
{
  main.newRun(1337);
  scene.render();                                   // warm the visible chunks
  const before = { fill: calls.fillRect, painted: paint.stats.painted };
  const s0 = gen.surface[gen.SPAWN_TX];
  grid.setTile(gen.SPAWN_TX, s0 + 2, tiles.AIR);    // one dig
  scene.render();
  const dFill = calls.fillRect - before.fill;
  const dPaint = paint.stats.painted - before.painted;
  console.log(`  one dig repainted ${dPaint} chunk(s), ${dFill.toLocaleString()} fillRect`);
  if (dPaint > 4) fail(`one dig dirtied ${dPaint} chunks; expected at most 4 (seams)`);
  else ok(`a dig touches at most ${dPaint} chunk(s), not the whole world`);
}

console.log(`\ntotals: fillRect ${calls.fillRect.toLocaleString()},` +
            ` drawImage ${calls.drawImage.toLocaleString()},` +
            ` chunks painted ${paint.stats.painted}`);

if (failures) {
  console.error(`\n${failures} CHECK(S) FAILED\n`);
} else {
  console.log('\nAll checks passed.');
  console.log('This says nothing about whether it LOOKS right — open it and judge.\n');
}
