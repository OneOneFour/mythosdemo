/* LAYER model — WHICH BEAT OF THE FIRST TWO MINUTES THE PLAYER IS ON.
   Imports nothing. May be imported by `model`, `rules`, `view`.

   ONE EXPORT, AND IT IS A QUERY. The number itself lives on `run`
   (`model/run.js#RUN_SCHEMA.tutorialBeat`) so it resets with everything else
   on `newRun()` (invariant 8); the decision that a beat's condition now holds
   is `rules/tutorial.js`'s, and nothing about that decision is visible from
   here. This file exists so a READER -- the callout widget in `view` -- has
   something to ask that is not a bare property access into `run`, and so that
   the beat sheet has exactly one query no matter how many readers it grows.

   `run` is a PARAMETER rather than an import: the caller already holds the
   record it wants asked about (`view/hud.js` and every `rules` module import
   `run` directly), and taking it in keeps this module free of any import at
   all -- there is no state here to get out of step with anything.

   The beats themselves are docs/SPEC.md section 5. 0 means "nothing yet";
   N means beats 1..N have fired. */

export const beat = run => run.tutorialBeat;
