import { COMPONENTS } from '../comp/index.js';

/* ============================================================
   ASSEMBLE — engine code. ~70 lines, written once, and never edited to add
   a machine. Read this second, after data/machines.js.

   It turns a table row into a live object:
     1. make() every named component, collecting `provides` into host.slots
     2. check every `needs` is satisfied  (trailing '?' = optional)
     3. sort parts so providers tick before consumers
     4. link() every part, resolving slot names to DIRECT REFERENCES, once
     5. validate placement if the row has a footprint

   Step 4 is the load-bearing one. After link(), a component holds
   `this.buf` -- a real reference, not a name -- so there is no per-tick
   lookup, no string keys in the hot path, and no event dispatch. The cost is
   that the wiring is invisible in the tick: see sim/explain.js.

   FAILURE LOCALITY. Every throw below names the machine type and the
   component identifier the author typed, so a table typo fails at boot with
   the word you got wrong in the message.
   ============================================================ */

export function assemble(table, typeId, at, world) {
  const T = table[typeId];
  if (!T) throw new Error('assemble: unknown type ' + typeId);

  const host = {
    tag: T.size ? 'machine' : 'actor',
    type: typeId, id: world.nextId++,
    tx: at.tx | 0, ty: at.ty | 0,
    look: {},        // declarative appearance state; components write, render reads
    art: T.look || typeId,   // which render/looks.js entry draws it
    slots: {},       // name -> component instance
    parts: []        // [[definition, instance], ...] in tick order
  };

  for (const [name, params] of T.parts) {
    const C = COMPONENTS[name];
    if (!C) throw new Error(typeId + ': unknown component ' + name);
    if (!C.persist && !C.save)
      throw new Error(C.id + ': no `persist` list and no save()/load() pair. ' +
        'Every component must declare what survives a save -- see sim/save.js.');
    const c = C.make(params || {}, T);
    c.$def = C;
    for (const s of C.provides || []) {
      if (host.slots[s])
        throw new Error(typeId + ': two components provide slot ' + s +
                        ' (' + host.slots[s].$def.id + ' and ' + C.id + ')');
      host.slots[s] = c;
    }
    host.parts.push([C, c]);
  }

  for (const [C] of host.parts)
    for (const need of C.needs || []) {
      if (need.endsWith('?')) continue;
      if (!host.slots[need])
        throw new Error(typeId + '.' + C.id + ' needs slot ' + need);
    }

  order(host, typeId);
  for (const [, c] of host.parts) if (c.link) c.link(host, world);

  if (host.slots.footprint) {
    const bad = host.slots.footprint.valid(host, world);
    if (bad) return { host: null, err: bad };
  }

  (host.tag === 'machine' ? world.machines : world.actors).push(host);
  world.index.add(host);
  return { host, err: null };
}

/* Deterministic tick order: a component that PROVIDES a slot ticks before
   every component that NEEDS it. Stable within a tier by declaration order,
   so two identical rows always tick identically -- required for seed
   reproducibility, and the reason this is a sort and not a bus.

   A cycle is a table error, not a runtime condition, so it throws. */
function order(host, typeId) {
  const rank = new Map(host.parts.map(([, c]) => [c, 0]));
  for (let pass = 0; pass <= host.parts.length; pass++) {
    let moved = false;
    for (const [C, c] of host.parts)
      for (const need of C.needs || []) {
        const p = host.slots[need.replace(/\?$/, '')];
        if (!p || p === c) continue;
        if (rank.get(p) >= rank.get(c)) { rank.set(c, rank.get(p) + 1); moved = true; }
      }
    if (!moved) break;
    if (pass === host.parts.length)
      throw new Error(typeId + ': slot dependency cycle among ' +
        host.parts.map(([C2]) => C2.id).join(', '));
  }
  const at = new Map(host.parts.map(([, c], i) => [c, i]));
  host.parts.sort((a, b) => (rank.get(a[1]) - rank.get(b[1])) ||
                            (at.get(a[1]) - at.get(b[1])));
}

/* Tick a host. This is the entire dispatch. `dt`, `host` and `world` are the
   three arguments every component takes, and `world` is a parameter rather
   than an import because world/world.js returns instances (data/bands.js). */
export function tickHost(host, dt, world) {
  for (const [, c] of host.parts) if (c.tick) c.tick(dt, host, world);
}
