/* core layer — seeded randomness and a positional hash. Depends on nothing.
     rand()   the run's stream. Stateful, so consuming it out of order changes
              the world; a render may not draw from it at all.
     hash2()  stateless, same input to same value, and so the only randomness
              `view` may use. */

/* mulberry32. */
export function mulberry(seed) {
  const draw = function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  /* The whole generator state is this one seed word, so `mulberry(state())`
     resumes the stream rather than restarting it. */
  draw.state = () => seed;
  return draw;
}

/* Stateless 2D hash in [0,1). */
export const hash2 = (x, y) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
};

/* The generator lives on an object: an ES module binding is read-only for
   importers, so `seedRng` could not swap a bare `let`. */
export const rng = { next: Math.random };

export function seedRng(seed) { rng.next = mulberry(seed | 0); }

export const rand = () => rng.next();

/* Where the run's stream stands, as an int32 `seedRng()` resumes from, or
   null while `rng.next` is still `Math.random`. */
export const cursor = () => (rng.next.state ? rng.next.state() : null);

/* Both draw from `rand()`; `randInt` bounds are inclusive at each end. */
export const randRange = (lo, hi) => lo + rand() * (hi - lo);
export const randInt   = (lo, hi) => lo + ((rand() * (hi - lo + 1)) | 0);
