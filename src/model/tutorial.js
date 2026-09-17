/* model layer — which beat of the opening the player is on.

   The number lives on `run`, so it resets with everything else, and `run` is a
   parameter rather than an import. 0 means nothing yet; N means beats 1..N
   have fired. */

export const beat = run => run.tutorialBeat;
