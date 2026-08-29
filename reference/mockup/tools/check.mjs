// Headless smoke test. Stubs just enough of the DOM and canvas2d to import
// every module, build the world, and run the simulation, so a broken import
// or a geometry regression fails here instead of in the browser.
const calls = { fillRect: 0, drawImage: 0 };

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
    getImageData(x, y, w, h) {
      if (w <= 0 || h <= 0) throw new Error('getImageData bad rect');
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData() {}, save() {}, restore() {}
  };
}

function makeCanvas(w = 0, h = 0) {
  const c = {
    width: w, height: h, style: {}, classList: { add() {}, remove() {} },
    addEventListener() {}, setPointerCapture() {},
    getContext() { return (c._c = c._c || makeCtx()); }
  };
  return c;
}

const stage = makeCanvas();
let T = 0;
globalThis.window = globalThis;
globalThis.innerWidth = 1600;
globalThis.innerHeight = 900;
globalThis.document = {
  getElementById: id => (id === 'stage' ? stage : null),
  createElement: t => (t === 'canvas' ? makeCanvas() : { style: {} })
};
globalThis.performance = { now: () => T };
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};

const fail = m => { console.error('FAIL: ' + m); process.exitCode = 1; };

const boot = await import('../src/bootstrap.js');
const cfg  = await import('../src/world/config.js');
const cv   = await import('../src/core/canvas.js');
const lay  = await import('../src/world/layout.js');
const st    = await import('../src/sim/state.js');
const mines = await import('../src/sim/mines.js');
const carts = await import('../src/sim/carts.js');
const stn   = await import('../src/sim/stations.js');
const drops = await import('../src/sim/drops.js');
const lift  = await import('../src/sim/lift.js');
const part  = await import('../src/sim/particles.js');
const scene = await import('../src/render/scene.js');

console.log('imported all modules');

for (const [w, h] of [[390, 844], [768, 1024], [1600, 900], [3440, 1440]]) {
  globalThis.innerWidth = w; globalThis.innerHeight = h;
  boot.rebuild();
  const inVoid = (x, y) => lay.VOIDS.some(v =>
    x >= v.x - 1 && x <= v.x + v.w + 1 && y >= v.y - 1 && y <= v.y + v.h + 1);

  let escapes = 0;
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 60; f++) {
    T += dt * 1000; st.clock.t += dt;
    mines.updateMines(dt); carts.updateCarts(dt); stn.updateStations(dt);
    drops.updateDrops(dt); lift.updateCages(dt); part.updateParticles(dt);
    part.updateTrickle(dt, st.cam.y);
    for (const d of st.drops) if (!inVoid(d.x, d.y)) escapes++;
    for (const c of st.carts) if (!inVoid(c.x, c.y)) escapes++;
  }
  if (escapes) fail(`${w}x${h}: ${escapes} positions outside carved rock`);

  // render every depth band
  for (let y = 0; y <= cfg.WORLD_H; y += 24) {
    st.cam.y = st.cam.target = Math.min(y, cfg.WORLD_H - cv.H);
    try { scene.render(); } catch (e) { fail(`render at y=${y}: ${e.message}`); break; }
  }

  const pinned = lay.PILES.filter(p => p.n >= p.cap).map(p => p.id);
  console.log(`  ${String(w + 'x' + h).padEnd(11)} base=${cv.W}x${cv.H}` +
              `  voids=${lay.VOIDS.length} shafts=${lay.SHAFTS.length}` +
              `  piles full: ${pinned.join(',') || 'none'}`);
}

console.log(`fillRect calls: ${calls.fillRect.toLocaleString()}`);
if (!process.exitCode) console.log('\nAll checks passed.');
