
/* ---------- deterministic noise ---------- */
export function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const hash2 = (x, y) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
};


/* ---------- the simulation's random source ----------
   Everything in sim/ and render/ draws from here rather than from
   Math.random(), so a run is bit-reproducible from its seed. That buys
   three things at once: roguelike seed sharing, deterministic replay,
   and screenshot tests that can diff at threshold zero.

   ES module bindings are read-only for importers, so the generator lives
   on an object and is swapped by property, per the project convention. */
export const rng = { next: Math.random };

export function seedRng(seed) { rng.next = mulberry(seed | 0); }

export const rand = () => rng.next();
