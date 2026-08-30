import { TILE } from '../world/grid.js';
import { SITE, surface } from '../world/generate.js';
import { clock, run, toast } from './state.js';
import { play } from '../core/sfx.js';
import { PH, PW, player } from './player.js';
import { structures } from './structures.js';


/* ============================================================
   THE FIRST TWO MINUTES

   The beat sheet from docs/SPEC.md, as a state machine. Each beat
   teaches exactly one thing and advances on evidence that the
   player did it, never on a timer — a slow player is not punished
   and a fast one is not held back.
   ============================================================ */
export const BEATS = [
  { id: 'walk',    hint: 'LEFT / RIGHT TO WALK' },
  { id: 'pick',    hint: 'TAKE THE PICKAXE' },
  { id: 'dig',     hint: 'HOLD DIG TO CUT ROCK — TRY THE PALE SEAM UNDERFOOT' },
  { id: 'copper',  hint: 'DIG DOWN. SOMETHING IS DOWN THERE' },
  { id: 'ascend',  hint: 'GET BACK UP. FELL THE OLIVE TREE FOR LADDERS' },
  { id: 'trial',   hint: 'SOMETHING IS WATCHING FROM ABOVE' },
  { id: 'deliver', hint: 'BRING 10 COPPER TO THE ALTAR' },
  { id: 'furnace', hint: 'PLACE THE FURNACE — THINK ABOUT WHERE' },
  { id: 'done',    hint: '' }
];

/* State the beats watch. Reset per run. */
export const progress = { moved: 0, dug: 0, maxDepth: 0, startX: 0, ingots: 0 };

export const altar = { tx: 0, ty: 0, risen: false, rise: 0, glow: 0 };
export const pickup = { tx: 0, ty: 0, taken: false, bob: 0 };

export function resetTutorial() {
  progress.moved = 0; progress.dug = 0; progress.maxDepth = 0; progress.ingots = 0;
  progress.startX = SITE.spawn.tx * TILE;
  altar.tx = SITE.altar.tx; altar.ty = SITE.altar.ty;
  altar.risen = false; altar.rise = 0; altar.glow = 0;
  pickup.tx = SITE.pick.tx; pickup.ty = SITE.pick.ty; pickup.taken = false;
  pickup.bob = 0;
  run.beat = 0; run.trial = null;
  run.gift = null;
  toast(BEATS[0].hint, 4);
}

export const beatId = () => BEATS[Math.min(run.beat, BEATS.length - 1)].id;

export function advance() {
  run.beat = Math.min(run.beat + 1, BEATS.length - 1);
  const b = BEATS[run.beat];
  if (b.hint) toast(b.hint, 4.5);
}

export function updateTutorial(dt) {
  if (run.dead) return;
  const surfY = surface[SITE.spawn.tx] * TILE;

  pickup.bob += dt * 2.4;
  if (altar.risen) { altar.rise = Math.min(1, altar.rise + dt * 0.8); altar.glow += dt; }

  /* --- the pickaxe: walk into it --- */
  if (!pickup.taken) {
    const px = pickup.tx * TILE + TILE / 2, py = pickup.ty * TILE + TILE / 2;
    if (Math.abs(player.x + PW / 2 - px) < 12 && Math.abs(player.y + PH / 2 - py) < 18) {
      pickup.taken = true; run.hasPick = true;
      toast('STOCK PICKAXE — HOLD DIG, OR CLICK A TILE', 4.5);
      if (beatId() === 'pick') advance();
    }
  }

  /* --- the altar: deliver copper --- */
  if (altar.risen && run.trial && !run.trial.done) {
    const ax = altar.tx * TILE + TILE / 2;
    if (Math.abs(player.x + PW / 2 - ax) < 16
        && Math.abs(player.y - altar.ty * TILE) < 24
        && run.inv.copper >= run.trial.need) {
      run.inv.copper -= run.trial.need;
      run.trial.have = run.trial.need;
      run.trial.done = true;
      run.gift = 'furnace';
      play('divine', clock.t);
      toast('TRIAL MET. A CRUDE FURNACE IS YOURS — PRESS F TO PLACE', 6);
      if (beatId() === 'deliver') advance();
    }
  }

  switch (beatId()) {
    case 'walk':
      progress.moved = Math.max(progress.moved, Math.abs(player.x - progress.startX));
      if (progress.moved > 34) advance();
      break;

    case 'pick':
      break;                                  // handled above

    case 'dig':
      if (progress.dug >= 3) advance();
      break;

    case 'copper':
      if (run.inv.copper >= 1) {
        toast('IT FELL TO THE BOTTOM OF YOUR OWN SHAFT. DOWN IS FREE.', 5.5);
        advance();
      }
      break;

    case 'ascend':
      // back at the surface, having actually been underground
      if (progress.maxDepth > 4 * TILE && player.y <= surfY - PH + 2) {
        toast('AND UP IS NOT.', 3.5);
        advance();
        altar.risen = true;
        play('divine', clock.t);
      }
      break;

    case 'trial':
      if (altar.rise > 0.55) {
        run.trial = { need: 10, have: Math.min(10, run.inv.copper), done: false,
                      what: 'RAW COPPER', from: 'ZEUS' };
        toast('ZEUS: TEN OF THE RED METAL. NO HURRY. WE HAVE FOREVER.', 6);
        play('trial', clock.t);
        advance();
      }
      break;

    case 'deliver':
      break;                                  // handled above

    case 'furnace':
      if (structures.length > 0 && structures[0].made >= 1) {
        toast('ONE INGOT. NOW BUILD DOWNWARD.', 6);
        advance();
      }
      break;
  }

  progress.maxDepth = Math.max(progress.maxDepth, player.y - surfY);
}

/* called by mining when a tile actually breaks */
export function notedDig() { progress.dug++; }
