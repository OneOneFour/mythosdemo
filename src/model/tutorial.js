/* LAYER model — WHICH BEAT OF THE FIRST TWO MINUTES THE PLAYER IS ON.
   Imports nothing.

   ONE EXPORT, AND IT IS A QUERY. The number lives on `run`, so it resets with
   everything else; the decision that a beat's condition now holds is
   `rules/tutorial.js`'s. This file exists so a READER has something to ask
   that is not a bare property access, and so the beat sheet has exactly one
   query however many readers it grows.

   `run` is a PARAMETER rather than an import: the caller already holds the
   record, and taking it in keeps this module free of any import at all.

   0 means "nothing yet"; N means beats 1..N have fired. */

export const beat = run => run.tutorialBeat;
