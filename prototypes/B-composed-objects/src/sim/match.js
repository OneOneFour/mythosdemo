import { SUB } from '../data/substances.js';
import { FORMS } from '../data/forms.js';

/* ============================================================
   MATCH — the whole pattern language. One binding, `$s`, over the
   substance. No conditions, no arithmetic, no nesting.

   A QUERY is { sub?, form?, tag?, n? }. `sub: '$s'` is a hole.
   A STACK is { sub, form, n } and is what a Buffer holds.

   This exists so that one `smelt` row covers copper, tin and every ore
   added later. Anything richer than one hole is a rules engine, and the
   moment a recipe needs two holes or a condition, argue for it here rather
   than adding a special case at a call site.
   ============================================================ */

export const hasTag = (stack, tag) =>
  (SUB[stack.sub]?.tags || []).includes(tag) ||
  (FORMS[stack.form]?.tags || []).includes(tag);

export function match(q, stack) {
  if (!q || q === '*') return true;
  if (q.sub && q.sub !== '$s' && q.sub !== stack.sub) return false;
  if (q.form && q.form !== stack.form) return false;
  if (q.tag && !hasTag(stack, q.tag)) return false;
  return true;
}

/* Bind a whole input list against a buffer, or return null. Returns the
   binding, so the caller can resolve the OUTPUT with the same substance the
   input was paid in -- that is how `$s` in an `out` clause works.

   HONEST LIMIT: binding is greedy and first-match. With one hole and inputs
   of at most two clauses that is exact; with copper AND tin in the buffer
   and a recipe whose second clause needs the other element, it can fail a
   craft that was actually satisfiable. Not fixed, because fixing it is a
   backtracking search and the recipe table has no row that needs one.
   If you add such a row, this comment is the place it breaks. */
export function bindAll(ins, buf) {
  const bind = {};
  for (const q of ins) {
    const hit = buf.slots.find(s =>
      s.n >= (q.n || 1) && match(q, s) &&
      (q.sub !== '$s' || bind.$s === undefined || bind.$s === s.sub));
    if (!hit) return null;
    if (q.sub === '$s') bind.$s = hit.sub;
  }
  return bind;
}

export const resolve = (q, bind) => ({
  sub:  q.sub === '$s' ? bind.$s : q.sub,
  form: q.form, tag: q.tag, n: q.n || 1
});

/* Turn a query with a hole into the CONCRETE things a machine would accept.
   Drives HandFeed and the HUD's "wants" readout without either of them
   naming a substance.

   HONEST LIMIT (RFC 02 weakness 7): this is a small inference engine, and it
   is the easiest thing here to make quadratic. It is bounded on purpose --
   substances x one hole, evaluated only for the machine the player is
   standing next to, never for every machine every tick. */
export function expand(q) {
  const out = [];
  const subs = q.sub === '$s' ? Object.keys(SUB) : [q.sub];
  for (const sub of subs) {
    if (!SUB[sub]) continue;
    const forms = q.form ? [q.form] : SUB[sub].forms;
    for (const form of forms) {
      if (!SUB[sub].forms.includes(form)) continue;
      if (q.tag && !hasTag({ sub, form }, q.tag)) continue;
      out.push({ sub, form, n: q.n || 1 });
    }
  }
  return out;
}

export const massOf = it => SUB[it.sub].item.mass * FORMS[it.form].massK;
