import { zzfx } from '../../vendor/zzfx.micro.js';


/* ============================================================
   SOUND

   Every sound is a row in a data table, in keeping with the
   project's convention of preferring data edits over code edits.
   A row is ZzFX's parameter list; author new ones with the GUI at
   https://killedbyapixel.github.io/ZzFX/ and paste the array here.

   There are no audio assets and there is no loader. That is the
   point: the single-file bundle stays a single file.

   ZzFX covers one-shots only. Continuous ambience — lava rumble
   that swells with depth, a machine hum tracking production — needs
   persistent oscillator nodes and is not implemented yet.
   ============================================================ */

/* Browsers refuse to start audio before a user gesture, and Node has no
   AudioContext at all, so every call is guarded. */
export const audio = { ready: false, muted: false, supported: false };

export function initAudio() {
  audio.supported = typeof AudioContext !== 'undefined'
                 || typeof webkitAudioContext !== 'undefined';
}

/* Call from the first real input event. Safe to call repeatedly. */
export function unlockAudio() {
  if (audio.ready || !audio.supported) return;
  audio.ready = true;
}

/* ---------- the table ----------
   [volume, randomness, frequency, attack, sustain, release, shape,
    shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
    noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo] */
export const SFX = {
  pick:     [ .5, .05,  160, .01, 0, .06, 4, 1.6,  -8,   0, 0, 0, 0, .4,  0, 0, 0, .5, .01],
  breakSoft:[ .4, .05,  110, .01, 0, .12, 3, 1.2, -20,   0, 0, 0, 0, .8,  0, 0, 0, .4, .02],
  breakHard:[ .6, .05,   80, .01, 0, .18, 4, 1.8, -14,   0, 0, 0, 0, 1.1, 0, 0, 0, .5, .03],
  ore:      [ .5, .05,  520, .01, .02, .10, 1, 1.4,  6,   0, 120, .02, 0, 0, 0, 0, 0, .6, .02],
  pickup:   [ .4, .05,  740, .01, .01, .07, 0, 1.2, 12,   0, 220, .01, 0, 0, 0, 0, 0, .5, .01],
  ladder:   [ .35,.05,  300, .01, .01, .09, 2, 1.0, -6,   0, 0, 0, 0, .3,  0, 0, 0, .4, .02],
  land:     [ .45,.05,   90, .01, 0, .10, 4, 1.5, -12,   0, 0, 0, 0, .9,  0, 0, 0, .4, .02],
  hurt:     [ .7, .06,  210, .02, .04, .22, 1, 2.2, -40,   0, 0, 0, 0, .5,  0, 0, .05, .4, .05],
  death:    [ .9, .08,  120, .05, .18, .70, 1, 2.6, -18,  -4, 0, 0, 0, .4,  0, 0, .12, .5, .10],
  ignite:   [ .5, .10,  240, .06, .10, .34, 4, 1.4,   4,   0, 0, 0, 0, 1.6, 0, 0, .04, .5, .06],
  ingot:    [ .55,.05,  660, .02, .06, .22, 0, 1.1,  10,   0, 340, .04, 0, 0, 0, 0, 0, .7, .03],
  divine:   [ .6, .05,  440, .12, .30, .60, 0, 1.0,   8,   0, 180, .10, 0, 0, 0, 0, .06, .8, .12],
  trial:    [ .6, .05,  330, .10, .24, .50, 0, 1.2,   5,   0, 120, .08, 0, 0, 0, 0, .05, .8, .10]
};

/* Voice limiting. A pickaxe at 60 Hz would otherwise stack into mush, and
   ZzFX builds a fresh buffer per call, so this is a real cost not just a
   loudness problem. */
const MIN_GAP = {
  pick: 0.085, breakSoft: 0.04, breakHard: 0.04, ore: 0.05,
  pickup: 0.035, ladder: 0.06, land: 0.09
};
const last = {};

export function play(name, t = 0) {
  if (!audio.ready || audio.muted || !audio.supported) return false;
  const row = SFX[name];
  if (!row) return false;
  const gap = MIN_GAP[name];
  if (gap !== undefined) {
    if (t - (last[name] || -99) < gap) return false;
    last[name] = t;
  }
  try { zzfx(...row); } catch { audio.supported = false; }   // never break a frame
  return true;
}

export function resetSfx() { for (const k in last) delete last[k]; }
