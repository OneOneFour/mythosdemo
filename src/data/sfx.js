/* LAYER data — SOUND: the journal-kind to sound mapping, and the waveform rows.
   Imports nothing. May be imported by `data`, `model`, `rules`, `view`.

   This file is the contract between the journal and the audio device -- see
   docs/DEVELOPER_GUIDE.md#notification-and-the-journal. A journal kind that is
   not a key in `KIND_SFX` is silent, deliberately: not every fact is audible.

   There are no audio assets and no loader. That is the point -- the single-file
   bundle stays a single file. Rows are ZzFX parameter lists; author new ones
   with the GUI at https://killedbyapixel.github.io/ZzFX/ and paste the array in. */

/* ---- THE MAPPING. Journal kind -> sound row name. -------------------------
   These kind strings are the vocabulary `rules` pushes and `shell` drains.
   Keep this list and the kinds in `model/journal.js` in step; the resolver
   checks that every value below names a row in `SOUNDS`. ---- */
export const KIND_SFX = Object.freeze({
  pick:      'pick',        // a strike that did not break anything
  breakSoft: 'breakSoft',   // a soft tile broke
  breakHard: 'breakHard',   // a hard tile broke
  drop:      'ore',         // material became a falling item
  pickup:    'pickup',      // an item entered the pockets
  accept:    'ignite',      // a machine swallowed an input
  produce:   'ingot',       // a machine finished a run
  divine:    'divine',      // a divine machine finished a run
  winch:     'winch',       // a carrier delivered a haul at the top of a segment
  place:     'ladder',      // a tile or machine was placed
  land:      'land',        // the player landed without damage
  hurt:      'hurt',        // hearts lost
  death:     'death',       // the run ended
  grant:     'trial',       // a machine tier was granted or drafted

  /* ---- Phase 13d: the cycle loop was entirely silent until here. The three
     kinds `rules/cycles.js` has pushed since Phase 10b (`tribute`, `cycle`,
     `debt`) had no entry in this table and no `shell/notify.js` row either,
     so the most important moment in the game -- a god accepting your work --
     made no sound at all. `win` is the fourth, new with the end state. ---- */
  tribute:   'tithe',       // a receiver's buffer was credited to the live demand
  cycle:     'trial',       // a trial was paid in full
  debt:      'debt',        // a deadline expired
  win:       'triumph'      // every shipped trial is paid
});

/* ---- the waveform table ----------------------------------------------------
   [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
    slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation,
    bitCrush, delay, sustainVolume, decay, tremolo] ---- */
export const SOUNDS = Object.freeze({
  pick:      [ .5, .05, 160, .01, 0,   .06, 4, 1.6,  -8,  0,   0,   0,   0, .4,  0, 0, 0,   .5, .01],
  breakSoft: [ .4, .05, 110, .01, 0,   .12, 3, 1.2, -20,  0,   0,   0,   0, .8,  0, 0, 0,   .4, .02],
  breakHard: [ .6, .05,  80, .01, 0,   .18, 4, 1.8, -14,  0,   0,   0,   0, 1.1, 0, 0, 0,   .5, .03],
  ore:       [ .5, .05, 520, .01, .02, .10, 1, 1.4,   6,  0, 120, .02,   0, 0,   0, 0, 0,   .6, .02],
  pickup:    [ .4, .05, 740, .01, .01, .07, 0, 1.2,  12,  0, 220, .01,   0, 0,   0, 0, 0,   .5, .01],
  ladder:    [ .35,.05, 300, .01, .01, .09, 2, 1.0,  -6,  0,   0,   0,   0, .3,  0, 0, 0,   .4, .02],
  land:      [ .45,.05,  90, .01, 0,   .10, 4, 1.5, -12,  0,   0,   0,   0, .9,  0, 0, 0,   .4, .02],
  hurt:      [ .7, .06, 210, .02, .04, .22, 1, 2.2, -40,  0,   0,   0,   0, .5,  0, 0, .05, .4, .05],
  death:     [ .9, .08, 120, .05, .18, .70, 1, 2.6, -18, -4,   0,   0,   0, .4,  0, 0, .12, .5, .10],
  ignite:    [ .5, .10, 240, .06, .10, .34, 4, 1.4,   4,  0,   0,   0,   0, 1.6, 0, 0, .04, .5, .06],
  ingot:     [ .55,.05, 660, .02, .06, .22, 0, 1.1,  10,  0, 340, .04,   0, 0,   0, 0, 0,   .7, .03],
  winch:     [ .5, .06, 170, .04, .12, .30, 2, 1.3,  -5,  0,  40, .06,   0, .2,  0, 0, .03, .5, .05],
  divine:    [ .6, .05, 440, .12, .30, .60, 0, 1.0,   8,  0, 180, .10,   0, 0,   0, 0, .06, .8, .12],
  trial:     [ .6, .05, 330, .10, .24, .50, 0, 1.2,   5,  0, 120, .08,   0, 0,   0, 0, .05, .8, .10],
  /* ---- Phase 13d. Three rows, each derived from a neighbour above rather
     than authored blind, so the family is audibly one family:
       tithe   `pickup` shifted DOWN a register and lengthened -- a coin into
               a stone bowl rather than into a pocket. Gapped in `MIN_GAP`
               below, because hand-feeding credits one unit per substep.
       debt    `hurt` with the pitch slide steepened and the shape squared --
               the same fall, heavier, and deliberately not `death`.
       triumph `divine` held longer and pitched up, the one sound in the game
               that plays at most once per run. ---- */
  tithe:     [ .45,.05, 420, .02, .05, .16, 0, 1.3,   8,  0, 180, .03,   0, 0,   0, 0, 0,   .6, .03],
  debt:      [ .7, .06, 150, .03, .08, .38, 3, 2.4, -30, -2,   0,   0,   0, .6,  0, 0, .06, .4, .07],
  triumph:   [ .7, .04, 520, .14, .40, .90, 0, 1.0,  10,  0, 260, .14,   0, 0,   0, 0, .08, .9, .14]
});

/* Voice limiting, as data. A pickaxe at 60 Hz stacks into mush, and ZzFX builds
   a fresh buffer per call, so this is a cost problem and not only a loudness
   one. `shell` enforces it; the numbers are content. */
export const MIN_GAP = Object.freeze({
  pick: 0.085, breakSoft: 0.04, breakHard: 0.04, ore: 0.05,
  pickup: 0.035, ladder: 0.06, land: 0.09,
  /* `tithe` IS GAPPED FOR THE SAME REASON `pick` IS, and it is the widest
     gap in this table. `rules/machines.js#handFeed` moves ONE unit per
     selector per substep and `rules/cycles.js#drainReceivers` credits it the
     same substep, so a player standing at the altar with ten ore emits ten
     `tribute` rows in ten consecutive 1/120 s steps -- 120 Hz of bell, which
     is mush and ten fresh ZzFX buffers a frame. 0.12 s lets a ten-unit haul
     read as a run of about eight distinct chimes at 120 Hz instead of
     eighty. `cycle`, `debt` and `win` need no entry: each fires at most once
     per trial. */
  tithe: 0.12
});

/* Fail at import on a mapping that names a sound that does not exist. */
for (const [kind, name] of Object.entries(KIND_SFX))
  if (!SOUNDS[name]) throw new Error(`sfx: kind "${kind}" maps to unknown sound "${name}"`);
