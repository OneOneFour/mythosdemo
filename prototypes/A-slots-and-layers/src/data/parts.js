/* ============================================================
   THE PARTS VOCABULARY — read this second.

   One row per capability a machine can have. A row is the WIRING only:
   which slots the part fills, which slots it reads, and the default
   parameters. The behaviour is a free function in rules/parts/<id>.js and
   the per-instance state is a plain record built by model/machines.js.

   That is the three-way split:
     data/parts.js       what it connects to      (frozen, this file)
     model/machines.js   what it remembers        (plain records, no methods)
     rules/parts/*.js    what it does             (free functions, no state)

   `provides` — slot names, from data/slots.js. Two parts may provide the
                same slot; that is the feature, not a collision.
   `needs`    — slot names it reads. `x?` is optional.
   `defaults` — merged under the machine row's params at assembly.
   `state`    — part-private mutable fields, beyond the slot contract. Declared
                here so the whole record shape of a machine is known from
                `data/` alone, which is what lets a machine snapshot as JSON.
   `tunables` — parameter names whose VALUE is a tunable name rather than a
                number, so tools/layers.mjs can resolve them.

   To add a capability: one row here, one file in rules/parts/, one line in
   the PARTS table at the top of rules/machines.js. The tool fails the build
   if you forget either of the other two.
   ============================================================ */

export const PARTS = {

  Footprint: {
    provides: ['footprint'], needs: [],
    defaults: {},
    doc: 'Occupies tiles, validates placement, registers in the space index.'
  },

  Buffer: {
    provides: ['buffer'], needs: [],
    defaults: { cap: {} },
    doc: 'cap is keyed by substance id or #tag: { "#ore":4, timber:2 }.'
  },

  CatchBox: {
    provides: [], needs: ['footprint', 'buffer'],
    defaults: { mouth: 'top', slack: 2, accepts: ['*'] },
    doc: 'Material falling through the mouth is swallowed for free. This is '
       + 'the whole thesis of the game in one part: gravity is your conveyor.'
  },

  HandFeed: {
    provides: [], needs: ['footprint', 'buffer', 'recipe'],
    defaults: { reach: 10 },
    doc: 'Stand adjacent and it draws from your pockets. Asks the recipe slot '
       + 'what it wants, so it names no substance.'
  },

  Recipe: {
    provides: ['recipe'], needs: ['buffer', 'emit', 'heat?', 'servo?'],
    defaults: { tag: '' },
    doc: 'The only recipe engine. heat? is optional: a recipe row that '
       + 'declares `heat` will simply never fire on a machine with no heat slot.'
  },

  Emitter: {
    provides: ['emit'], needs: ['footprint'],
    defaults: { at: 'top', vx: 0, vy: -70 },
    doc: 'Spawns finished output as a falling item at a named mouth.'
  },

  Burner: {
    provides: ['heat'], needs: ['buffer'],
    defaults: { fuel: '#fuel', secs: 6 },
    state: { lit: 0 },
    doc: 'Heat from a consumable substance in the buffer. Consumers: the kiln '
       + 'recipe and the winch deck.'
  },

  BloodBurner: {
    provides: ['heat'], needs: [],
    defaults: { secs: 6, hearts: 1 },
    state: { lit: 0, paid: 0 },
    doc: 'THE TRAP BOON. Same `heat` slot, same {hot, level} record, drawn '
       + 'from the player\'s hearts instead of a substance. Needs no buffer, '
       + 'because health is not an item and does not become one. Nothing '
       + 'downstream of the heat slot changes. See data/machines.js.'
  },

  HotServo: {
    provides: ['servo'], needs: ['buffer'],
    defaults: { over: 0.55, boost: 1.38 },
    doc: 'CLAUDE.md\'s throughput servo, as a part rather than as an inline '
       + 'function in a data row (RFC 04\'s own weakness 1: a function in a '
       + 'data file is invisible to the checker and not diffable as content).'
  },

  HeatEmit: {
    provides: [], needs: ['footprint', 'heat'],
    defaults: { field: 'heat', rate: 30 },
    state: {},
    doc: 'Bleeds the heat slot into the heat FIELD (model/fields.js). The '
       + 'field seam: any heat provider warms the world without knowing there '
       + 'is a field, and any recipe can gate on the field without knowing '
       + 'what warmed it.'
  },

  Deck: {
    provides: [], needs: ['footprint', 'heat'],
    defaults: { span: 96, up: 'lift.up', down: 'lift.down' },
    state: { y: 0, dir: 1, carry: 0 },
    tunables: ['up', 'down'],          // these params NAME tunables; the tool resolves them
    doc: 'One lift stage: drum, deck, counterweight. Only ascends while the '
       + 'heat slot is lit (CLAUDE.md invariant 5). `up`/`down` are tunable '
       + 'names, not numbers, so a trinket can change them.'
  }
};

export const PART_NAMES = Object.freeze(Object.keys(PARTS));
