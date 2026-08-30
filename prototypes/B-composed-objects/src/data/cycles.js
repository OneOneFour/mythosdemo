/* ============================================================
   TRIBUTE CYCLES — DESIGN's run structure, item 2. One row per cycle.

   Meet the demand by the deadline -> the next band unlocks and you draft a
   boon. Miss it -> a punishment; two misses ends the run. Escalation is in
   REFINEMENT, not volume: cycle 1 wants ore, cycle 4 wants bricks.

   sim/run.js is the ~60-line director that walks this table. The review
   marked 02 AWKWARD on run structure because it had no home for a director;
   this file and sim/run.js are that home, and they are the only files that
   know what a cycle is.
   ============================================================ */
export const TRIBUTES = [
  { cycle: 1, secs: 300, want: [{ form: 'ore',    sub: 'copper', n: 20 }],
    unlock: 'shallow', draft: 3 },
  { cycle: 2, secs: 300, want: [{ form: 'ingot',  sub: 'copper', n: 12 }],
    unlock: 'deep',    draft: 3 },
  { cycle: 3, secs: 270, want: [{ form: 'ingot',  sub: '$s',     n: 20 }],
    unlock: 'deep',    draft: 3, trapOffered: true },
  { cycle: 4, secs: 240, want: [{ form: 'brick',  sub: '$s',     n: 8 }],
    unlock: 'deep',    draft: 3 }
];

export const PUNISH = ['LOSE ONE HEART', 'A SHAFT COLLAPSES'];
