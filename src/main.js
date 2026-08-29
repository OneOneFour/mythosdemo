import { VIEW, resize } from './core/canvas.js';
import { TILE, WORLD_H, WORLD_W } from './world/grid.js';
import { SITE, generate } from './world/generate.js';
import { resetChunks } from './world/paint.js';
import { cam, chips, clock, items, run, view } from './sim/state.js';
import { PH, PW, player, spawnPlayer, updatePlayer } from './sim/player.js';
import { updateItems } from './sim/items.js';
import { aim, setAim, setAimKeys, updateMining } from './sim/mining.js';
import { placeFurnace, resetStructures, structures, updateStructures } from './sim/structures.js';
import { resetTutorial, updateTutorial } from './sim/tutorial.js';
import { cmd, clearEdges, installInput, wants } from './input.js';
import { render } from './render/scene.js';


/* ============================================================
   BOOT ORDER IS LOAD-BEARING

     resize()   -> VIEW.w/h, needed by the camera clamp
     generate() -> fills the grid and SITE, needed by everything
     resetChunks() -> drops stale chunk canvases from a prior run
     spawnPlayer() / resetTutorial() -> need SITE

   Getting this wrong throws during boot and renders nothing at all,
   which is the exact mistake recorded in the mockup's notes.
   ============================================================ */
export function newRun(seed) {
  run.seed = seed === undefined ? ((Math.random() * 1e9) | 0) : seed;
  run.t = 0; run.dead = false; run.deathCause = '';
  run.hearts = run.maxHearts; run.invuln = 0;
  run.hasPick = false;
  run.inv = { soil: 0, stone: 0, copper: 0, timber: 0, ingot: 0 };
  run.ladderStock = 0;
  run.trial = null; run.gift = null;
  run.deepest = 0;
  run.toast = ''; run.toastT = 0;

  generate(run.seed);
  resetChunks();
  resetStructures();
  items.length = 0; chips.length = 0;
  spawnPlayer(SITE.spawn.tx, SITE.spawn.ty);
  resetTutorial();
  cam.x = player.x - VIEW.w / 2;
  cam.y = player.y - VIEW.h / 2;
  clampCam();
  view.titleFade = 1;
}

function clampCam() {
  cam.x = Math.max(0, Math.min(WORLD_W - VIEW.w, cam.x));
  cam.y = Math.max(0, Math.min(WORLD_H - VIEW.h, cam.y));
}

/* Camera leads the player slightly in the direction of travel, and
   looks further down than up because down is where the game is. */
function updateCamera(dt) {
  const tx = player.x + PW / 2 - VIEW.w / 2 + player.face * VIEW.w * 0.08;
  const ty = player.y + PH / 2 - VIEW.h / 2 + Math.min(40, player.vy * 0.12);
  const k = Math.min(1, dt * 6);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  clampCam();
}

function updateChips(dt) {
  for (let i = chips.length - 1; i >= 0; i--) {
    const c = chips[i];
    c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += c.g * dt;
    if (c.life <= 0) chips.splice(i, 1);
  }
  if (chips.length > 600) chips.splice(0, chips.length - 600);
}

export function step(dt) {
  clock.dt = dt; clock.t += dt; clock.frame++;
  if (!run.dead) run.t += dt;
  if (run.toastT > 0) run.toastT -= dt;
  view.titleFade = Math.max(0, 1 - Math.max(0, clock.t - 2.6) / 1.4);

  const digging = cmd.dig || cmd.mouse;
  const c = { left: cmd.left, right: cmd.right, up: cmd.up, down: cmd.down,
              hop: cmd.hop, dig: digging, place: cmd.place };

  if (cmd.hasMouse) setAim(cmd.mx, cmd.my); else setAimKeys(c);

  if (wants.furnace && run.gift === 'furnace') {
    // drop it on the aimed tile, footprint hanging down-right of the cursor
    if (placeFurnace(aim.tx, aim.ty - 1)) run.gift = null;
  }

  updatePlayer(dt, c);
  updateMining(dt, c);
  updateItems(dt);
  updateStructures(dt);
  updateTutorial(dt);
  updateChips(dt);
  updateCamera(dt);
  player.digAnim = digging && ((clock.t * 9) | 0) % 2 === 0;
}


/* ---------- the loop ---------- */
let last = 0;

function frame(now) {
  const t = now / 1000;
  const dt = Math.min(0.05, last ? t - last : 1 / 60);
  last = t;

  if (wants.restart) newRun();
  step(dt);
  clearEdges();
  render();
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined' && document.getElementById('stage')) {
  resize();
  installInput();
  newRun(1337);
  addEventListener('resize', () => { resize(); clampCam(); });
  requestAnimationFrame(frame);
}
