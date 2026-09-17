/* shell layer — the sound device, the only caller into the synth. Every export
   is a no-op without an AudioContext, which Node has none of. */

import { MIN_GAP, SOUNDS } from '../data/sfx.js';
import { zzfx } from '../../vendor/zzfx.micro.js';

export const audio = { ready: false, muted: false, supported: false, played: 0 };

/* Last play time per sound name, for the voice limiter. */
const last = new Map();

export function initAudio() {
  audio.supported = typeof AudioContext !== 'undefined'
                 || typeof globalThis.webkitAudioContext !== 'undefined';
}

/* Call from the first input gesture, which browsers require before audio.
   Safe to call repeatedly. */
export function unlockAudio() {
  if (audio.ready || !audio.supported) return;
  audio.ready = true;
}

/* `t` is the run clock, so the voice gap is measured in simulated seconds. */
export function play(name, t = 0) {
  if (!audio.ready || audio.muted || !audio.supported) return false;
  const row = SOUNDS[name];
  if (!row) { console.warn(`audio: no sound row "${name}"`); return false; }

  /* The minimum gap per sound is content, in `data/sfx.js`; the enforcement
     is here. */
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
