/* LAYER shell — THE SOUND DEVICE. The only file in the project that calls into
   the synth. Imports `core`, `data` and `vendor/`.

   WHY THIS IS IN `shell` AND NOTHING ABOVE IT MAY CALL IT: audio is a device,
   devices live in the outermost layer, and a call from `rules` to here would be
   an upward edge — precisely the edge `tools/layers.mjs` refuses. See
   docs/DEVELOPER_GUIDE.md#notification-and-the-journal

   Every call is guarded three ways, because a missing AudioContext must never
   break a frame: Node has none at all, browsers refuse to start one before a
   user gesture, and a synth that throws once is disabled rather than retried
   sixty times a second. */

import { MIN_GAP, SOUNDS } from '../data/sfx.js';
import { zzfx } from '../../vendor/zzfx.micro.js';

export const audio = { ready: false, muted: false, supported: false, played: 0 };

/* Last play time per sound name, for the voice limiter. */
const last = new Map();

export function initAudio() {
  audio.supported = typeof AudioContext !== 'undefined'
                 || typeof globalThis.webkitAudioContext !== 'undefined';
}

/* Call from the first real input event. Safe to call repeatedly — browsers need
   a gesture before audio, and the gesture is not ours to fake. */
export function unlockAudio() {
  if (audio.ready || !audio.supported) return;
  audio.ready = true;
}

/* `t` is the run clock, so the gap is measured in simulated seconds and a
   paused tab cannot bank up a hundred pickaxe strikes. */
export function play(name, t = 0) {
  if (!audio.ready || audio.muted || !audio.supported) return false;
  const row = SOUNDS[name];
  if (!row) { console.warn(`audio: no sound row "${name}"`); return false; }

  /* Voice limiting from `data/sfx.js`. A pickaxe at 120 Hz stacks into mush,
     and ZzFX builds a fresh buffer per call, so this is a cost problem as much
     as a loudness one. The numbers are content; the enforcement is here. */
  const gap = MIN_GAP[name];
  if (gap !== undefined) {
    if (t - (last.get(name) ?? -99) < gap) return false;
    last.set(name, t);
  }

  try { zzfx(...row); audio.played++; }
  catch { audio.supported = false; }        // disable, never throw into a frame
  return true;
}

export function resetAudio() { last.clear(); audio.played = 0; }
