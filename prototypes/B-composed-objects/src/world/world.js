import { createTiles, TILE } from './tiles.js';
import { createField } from './field.js';
import { createIndex } from './hashgrid.js';
import { GENERATORS } from './generate.js';
import { massOf } from '../sim/match.js';

/* ============================================================
   WORLD — INJECTED CONFIG. This is the file that makes world size a
   parameter instead of a module constant.

   Today `WORLD_TW`/`WORLD_TH` are `export const` and the arrays are
   allocated at import, so the world's size is fixed the moment the module
   loads and there can only ever be one of it. Here every array is allocated
   inside createWorld from `cfg`, and `world` is passed as the third argument
   to every component tick -- which is the real reason that signature exists.

   Two consequences the design wanted:
     - a second, differently-sized depth band is a row in data/bands.js
     - bands COEXIST, so DESIGN item 18 (Tartarus below Hades) is another row
       rather than a rewrite of a singleton
   ============================================================ */
export function createWorld(cfg) {
  const w = {
    cfg,
    tiles:  createTiles(cfg),
    index:  createIndex(cfg),
    fields: {},
    machines: [],        // hosts with a footprint
    actors:   [],        // hosts without one
    items:    [],        // ~400, on the object side of the boundary
    mining:   new Map(), // hostId -> { tx, ty, f } for the crack overlay
    chips:    [],        // visual only, never saved
    lights:   [],        // rebuilt each frame by render/treatments.js glow
    player:   null,      // set by main.js after the miner is assembled
    nextId:   1,
    acc:      0,

    /* Items are plain records with a fixed shape, created ONLY here so the
       engine keeps one hidden class for all of them. They are hosts' cousins
       rather than hosts: an item has identity but no parts, so it does not
       pay for a slot table. */
    spawnItem(x, y, q, vx = 0, vy = 0) {
      const it = { tag: 'item', id: w.nextId++, sub: q.sub, form: q.form, n: 1,
                   x, y, vx, vy, rest: false, age: 0 };
      w.items.push(it);
      w.index.add(it);
      return it;
    },

    kill(e) {
      w.index.remove(e);
      const i = w.items.indexOf(e);
      if (i >= 0) w.items.splice(i, 1);
    },

    /* STUB (leaf): particles. Components call this instead of drawing. */
    burst(x, y, n, col) { w.chips.push({ x, y, n, col, life: 0.3 }); },

    massOf
  };

  for (const k of cfg.fields || []) w.fields[k] = createField(cfg, k);

  const gen = GENERATORS[cfg.gen];
  if (!gen) throw new Error('band ' + cfg.id + ': no such generator ' + cfg.gen);
  gen(w, cfg.seed || 1);

  return w;
}

export { TILE };
