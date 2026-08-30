import { SUB } from './substances.js';
/* ============================================================
   FORMS — the shapes a substance can be held in.

   THE RULE THAT DECIDES WHERE A NEW THING GOES, stated once because the
   review of RFC 02 found this exact ambiguity and nothing caught it:

     A SUBSTANCE IS AN ELEMENT. Anything you can hold is substance x form.
     If a new thing has no element of its own, it is a FORM of the element
     it came from -- not a new substance. A brick is fired copper gravel,
     and stays copper.

   So `gravel`, `ingot` and `brick` are forms, not substances. That is why
   one `smelt` row covers every ore in the game, and why adding `tin` -- an
   element -- added no row here at all.

   `tags` here are matched by comp/catchbox.js and sim/match.js exactly as
   substance tags are, so "any ore" is expressible without listing ores.
   ============================================================ */
export const FORMS = {
  ore:    { label: '',       size: 4, massK: 1.0, hudOrder: 1, tags: ['crushable'] },
  gravel: { label: 'GRAVEL', size: 3, massK: 0.5, hudOrder: 2, tags: ['bakeable'] },
  ingot:  { label: 'INGOT',  size: 4, massK: 1.6, hudOrder: 3, shiny: true },
  brick:  { label: 'BRICK',  size: 4, massK: 2.2, hudOrder: 4 },
  log:    { label: 'TIMBER', size: 4, massK: 1.0, hudOrder: 5, tags: ['fuel'] }
};

/* The one ordering rule for anything that lists held things: substance
   first, then form. Exported so render/hud.js and a future tribute panel
   cannot drift apart. Imported by render/hud.js. */
export const byHudOrder = (a, b) =>
  (SUB[a.sub].hudOrder - SUB[b.sub].hudOrder) ||
  (FORMS[a.form].hudOrder - FORMS[b.form].hudOrder);
