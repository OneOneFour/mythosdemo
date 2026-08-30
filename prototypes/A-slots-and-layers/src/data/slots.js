/* ============================================================
   THE SLOT VOCABULARY — read this file first.

   A slot is a NAME plus a RECORD SHAPE plus an OP SET.

   Machines are built out of parts. A part declares which slots it
   `provides` and which it `needs` (data/parts.js). At assembly the machine
   gets a `slots` map of plain records, and every consumer is handed a direct
   reference to the record it needs. There is no event bus and no per-tick
   lookup: a consumer holds the record, full stop.

   The whole architecture turns on one consequence:

       A CONSUMER NEVER LEARNS WHICH PART FILLED THE SLOT.

   Two different parts may provide `heat` — one by burning timber out of a
   buffer, one by draining the player's hearts. Both write `{hot, level}`.
   The recipe engine and the lift deck read `{hot, level}`. Neither of them
   can tell the difference, and neither has a line of code that could.
   That is how the blood winch is one line of data (see data/machines.js).

   `fields` is the record contract: the full shape of the provider's record.
   `out` names the subset the provider's rule WRITES every tick — the live
   readings a consumer is entitled to trust. The rest is configuration, set by
   the machine row and read by anyone.

   A part's parameter may not share a name with an `out` field of a slot it
   provides, because the record is flat and the parameter would be overwritten
   on the first tick. tools/layers.mjs enforces that; see the note at the
   bottom of rules/parts/hotservo.js for the collision that taught it.

   `ops` are the mutating verbs, implemented ONCE in model/slots.js over the
   record — never per-part. If two parts provide `buffer` they get the same
   `put`/`take`, because the ops belong to the slot, not to the provider.
   ============================================================ */

export const SLOTS = {

  footprint: {
    doc: 'Where the machine physically is. Every machine has one.',
    fields: { tx: 0, ty: 0, tw: 1, th: 1, x: 0, y: 0, w: 0, h: 0, footing: 0 },
    out: [], ops: []
  },

  buffer: {
    doc: 'The machine\'s contents. The only place a machine\'s stock lives.',
    fields: { cap: {}, stock: {} },            // stock: { [substanceIndex]: count }
    out: [],                                   // stock changes through ops, not per tick
    ops: ['count', 'room', 'put', 'pick', 'take', 'takeSub', 'fill', 'full']
  },

  recipe: {
    doc: 'The production clock. Selects a recipe by tag, binds the concrete\n'
       + 'substance behind a #tag input, runs the timer, spends and emits.',
    fields: { tag: '', prog: 0, cur: null, bind: null, made: 0 },
    out: ['prog', 'cur', 'bind', 'made'], ops: []
  },

  emit: {
    doc: 'Output leaves as a falling item, never as an inventory credit.',
    fields: { at: 'top', vx: 0, vy: 0, queue: [] },
    out: [], ops: ['push']
  },

  heat: {
    doc: 'A SOURCE OF HEAT, and the point of this whole design.\n'
       + '`level` is 0..1 of the source\'s own span; `hot` is the gate.\n'
       + 'Providers today: rules/parts/burner.js (spends a #fuel substance)\n'
       + '                 rules/parts/bloodburner.js (spends player hearts)\n'
       + 'Consumers today: rules/parts/recipe.js (a recipe may require heat)\n'
       + '                 rules/parts/deck.js    (a cage only ascends lit)\n'
       + '                 rules/parts/heatemit.js (bleeds into the heat field)\n'
       + 'No consumer names a provider. Adding a third provider — a solar\n'
       + 'mirror, a geothermal tap, Hephaestus\'s gift — is one file in\n'
       + 'rules/parts/ and one row in data/parts.js.',
    fields: { hot: false, level: 0 },
    out: ['hot', 'level'],                     // the two readings every consumer trusts
    ops: []
  },

  servo: {
    doc: 'A rate multiplier on the recipe clock. CLAUDE.md\'s throughput servo\n'
       + '(a station runs 38% faster when its feed pile is over 55% full) is a\n'
       + 'named, greppable, checkable part rather than an inline function in a\n'
       + 'data row. A second servo — a god boon, a monster debuff — provides the\n'
       + 'same slot and the recipe clock does not change.',
    fields: { mult: 1 },
    out: ['mult'], ops: []
  }
};

export const SLOT_NAMES = Object.freeze(Object.keys(SLOTS));

/* `heat?` in a part's `needs` list means optional. */
export const optional = sel => sel.endsWith('?');
export const slotOf = sel => (optional(sel) ? sel.slice(0, -1) : sel);
