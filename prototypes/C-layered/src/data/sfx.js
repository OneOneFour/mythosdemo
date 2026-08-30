/* LAYER data — sound names.

   Only the names live here. The device lives in `shell/audio.js`, because
   `rules` may not import a device and `data` may not import anything at all.
   A `look.sfx` key anywhere in `data/` must name a row here; the resolver
   checks it.

   STUBBED LEAF: the ZzFX parameter arrays are replaced by `null`. Row identity
   is the part being evaluated; the waveform is not. */

export const SFX = Object.freeze({
  pick:       null,
  breakSoft:  null,
  breakHard:  null,
  ore:        null,
  pickup:     null,
  ignite:     null,
  ingot:      null,
  crunch:     null,
  bake:       null,
  winch:      null,
  hurt:       null
});
