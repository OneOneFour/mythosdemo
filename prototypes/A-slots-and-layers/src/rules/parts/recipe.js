/* ============================================================
   Recipe — provides `recipe`, needs `buffer`, `emit`, `heat?`, `servo?`.

   The only recipe engine in the codebase. It contains no machine name, no
   substance name and no number. Everything it knows comes from a row in
   data/recipes.js and from four slot records it was handed at assembly.

   The optional slots are where the whole design pays off:

     need.heat  — a recipe row may declare `heat: 0.2`, meaning "the heat
                  slot must be at level 0.2 or better". This file cannot ask
                  what filled the slot and has no branch that could. Burner,
                  BloodBurner and any future provider are indistinguishable
                  from here.
     need.servo — a rate multiplier. Absent means 1.

   BINDING. A '#tag' input binds the concrete substance actually consumed, and
   '@field' on the output side reads a named field off it. That is the
   output-side selector RFC 04 lacked, and it is why adding tin does not touch
   the furnace row.
   ============================================================ */

import { byTag } from '../../data/recipes.js';
import { S, SUB } from '../../data/substances.js';
import { buf, out } from '../../model/slots.js';
import { secsFor, stat } from '../../model/mods.js';
import { at as fieldAt } from '../../model/fields.js';
import { write as jw } from '../../model/journal.js';

/* Can this row run right now? Returns the binding (a substance index, or -1
   if the row has no tag input) or null. */
function plan(row, b) {
  let bind = -1;
  for (const [sel, n] of Object.entries(row.in)) {
    const sub = buf.pick(b, sel, n);
    if (sub < 0) return null;
    if (sel[0] === '#' && bind < 0) bind = sub;
  }
  return { bind };
}

/* Gates that are not about stock. */
function gated(row, need, ctx, fp) {
  if (row.heat !== undefined && !(need.heat && need.heat.level >= row.heat))
    return 'COLD';
  if (row.field)
    for (const [name, band] of Object.entries(row.field)) {
      const v = fieldAt(ctx.band, name, fp?.tx ?? 0, fp?.ty ?? 0);
      if (band.min !== undefined && v < band.min) return 'FIELD LOW';
      if (band.max !== undefined && v > band.max) return 'FIELD HIGH';
    }
  return null;
}

function outputs(row, bind) {
  const list = [];
  for (const [sel, n] of Object.entries(row.out)) {
    let id = sel;
    if (sel[0] === '@') {
      id = SUB[bind]?.[sel.slice(1)];
      if (!id)
        /* Unreachable if tools/layers.mjs passed: it asserts that every
           substance carrying a tag consumed by an '@field' recipe declares
           that field. Kept as a throw because a silent no-op here is exactly
           the failure the reviewer flagged in RFC 04 and RFC 06. */
        throw new Error(`recipe '${row.tag}': substance '${SUB[bind]?.id}' `
                      + `declares no '${sel.slice(1)}'`);
    }
    list.push([S[id], Math.floor(n * stat('machine.yield', row.tag))]);
  }
  return list;
}

export function recipe(rec, need, host, ctx) {
  const b = need.buffer;

  if (!rec.cur) {
    for (const row of byTag(rec.tag)) {
      const p = plan(row, b);
      if (!p) continue;
      if (gated(row, need, ctx, host.parts.Footprint)) continue;
      rec.cur = row; rec.bind = p.bind; break;
    }
    if (!rec.cur) { rec.prog = 0; host.look.busy = 0; return; }
  }

  const stall = gated(rec.cur, need, ctx, host.parts.Footprint);
  if (stall) { host.look.busy = 0; host.look.stall = stall; return; }
  host.look.stall = null;

  /* Rate: the row's seconds, scaled by the machine.rate tunable (scoped to
     this recipe tag, so a boon can speed kilns alone) and by the servo. */
  const secs = secsFor(rec.cur.secs, rec.cur.tag) / (need.servo?.mult ?? 1);
  rec.prog += ctx.dt;
  host.look.busy = rec.prog / secs;
  if (rec.prog < secs) return;

  for (const [sel, n] of Object.entries(rec.cur.in))
    if (sel[0] === '#') buf.takeSub(b, buf.pick(b, sel, n), n);
    else buf.take(b, sel, n);

  for (const [sub, n] of outputs(rec.cur, rec.bind)) out.push(need.emit, sub, n);

  rec.prog = 0; rec.made++;
  jw.push('produce', host.id, rec.cur.tag);
  rec.cur = null; rec.bind = null;
}
