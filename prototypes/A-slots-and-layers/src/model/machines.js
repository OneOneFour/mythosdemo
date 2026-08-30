/* ============================================================
   MACHINE RECORDS AND ASSEMBLY.

   A machine is:
     host.parts   { Footprint: {...}, Buffer: {...} }   plain records, the STATE
     host.slots   { footprint: ref, buffer: ref }        derived index
     host.wired   [ {part, rec, need}, ... ]             derived, in tick order

   `parts` is the only thing that is state. `slots` and `wired` are rebuilt by
   rewire() from data/, which is what makes a save `{id, def, tx, ty, parts}`
   and nothing more — no methods, no resolved cross-references, no cycles.
   (RFC 02's components hold `this.buf = host.slots.buffer`, which is why its
   DESIGN item 3 cell is AWKWARD. This is the fix.)

   assemble() is engine code, written once, never edited to add a machine.
   Every failure it can raise names the machine and the identifier the author
   typed.
   ============================================================ */

import { MACH, M } from '../data/machines.js';
import { PARTS } from '../data/parts.js';
import { SLOTS, optional, slotOf } from '../data/slots.js';
import { bump } from './epoch.js';

export const machines = [];
const seq = { next: 1 };

/* Deep-clone plain data so two machines never share a cap table or a queue. */
function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = clone(v[k]);
    return o;
  }
  return v;
}

/* --- build one part's state record ---------------------------------- */
function makeRecord(machineId, partName, params) {
  const P = PARTS[partName];
  if (!P) throw new Error(`${machineId}: unknown part '${partName}' — see data/parts.js`);
  const rec = {};
  for (const s of P.provides) Object.assign(rec, clone(SLOTS[s].fields));
  Object.assign(rec, clone(P.state || {}), clone(P.defaults), clone(params));
  return rec;
}

/* --- resolve slots into direct references, in dependency order ------- */
export function rewire(host) {
  const def = MACH[host.def];
  const slots = Object.create(null);

  for (const [partName] of def.parts)
    for (const s of PARTS[partName].provides) {
      if (slots[s])
        throw new Error(`${def.id}: two parts provide slot '${s}' `
                      + `— a slot holds exactly one record`);
      slots[s] = host.parts[partName];
    }

  const wired = [];
  for (const [partName] of def.parts) {
    const P = PARTS[partName];
    const need = Object.create(null);
    for (const sel of P.needs) {
      const s = slotOf(sel);
      if (!slots[s] && !optional(sel))
        throw new Error(`${def.id}.${partName} needs slot '${s}' and nothing provides it`);
      need[s] = slots[s] ?? null;
    }
    wired.push({ part: partName, rec: host.parts[partName], need });
  }

  /* Providers tick before consumers, so reading a slot's fields is exactly
     as fresh as calling a method would have been. Stable: the machine row's
     order breaks ties, so the tick order is a pure function of `data/`. */
  const rank = new Map();
  const rankOf = (partName, seen = new Set()) => {
    if (rank.has(partName)) return rank.get(partName);
    if (seen.has(partName))
      throw new Error(`${def.id}: circular slot dependency at ${partName}`);
    seen.add(partName);
    let r = 0;
    for (const sel of PARTS[partName].needs) {
      const s = slotOf(sel);
      for (const [other] of def.parts)
        if (PARTS[other].provides.includes(s)) r = Math.max(r, rankOf(other, seen) + 1);
    }
    rank.set(partName, r);
    return r;
  };
  wired.sort((a, b) => rankOf(a.part) - rankOf(b.part)
                    || def.parts.findIndex(p => p[0] === a.part)
                     - def.parts.findIndex(p => p[0] === b.part));

  host.slots = slots;
  host.wired = wired;
  return host;
}

export const write = {
  /* tile: px per tile, passed in rather than imported, so a machine placed in
     a differently-scaled band is not a special case. */
  assemble(machineId, tx, ty, tile) {
    const di = M[machineId];
    if (di === undefined) throw new Error(`unknown machine '${machineId}'`);
    const def = MACH[di];

    const host = { id: seq.next++, def: di, tx, ty, parts: {}, slots: null,
                   wired: null, look: {} };
    for (const [partName, params] of def.parts)
      host.parts[partName] = makeRecord(def.id, partName, params);

    const fp = host.parts.Footprint;
    if (!fp) throw new Error(`${def.id}: every machine needs a Footprint part`);
    Object.assign(fp, { tx, ty, tw: def.tw, th: def.th,
                        x: tx * tile, y: ty * tile,
                        w: def.tw * tile, h: def.th * tile });

    rewire(host);
    machines.push(host);
    bump();
    return host;
  },

  remove(host) {
    const i = machines.indexOf(host);
    if (i >= 0) machines.splice(i, 1);
    bump();
  },

  reset() { machines.length = 0; seq.next = 1; bump(); }
};

/* --- saves (DESIGN item 3) ------------------------------------------- */
export const snapshot = () =>
  machines.map(h => ({ id: h.id, def: h.def, tx: h.tx, ty: h.ty, parts: h.parts }));

export const restore = rows => {
  write.reset();
  for (const r of rows) machines.push(rewire({ ...r, slots: null, wired: null, look: {} }));
  bump();
};

/* Queries `view` may use. */
export const defOf = host => MACH[host.def];
export const slot = (host, name) => host.slots[name] ?? null;
