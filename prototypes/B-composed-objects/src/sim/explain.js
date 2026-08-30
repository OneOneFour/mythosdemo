import { RECIPES } from '../data/recipes.js';

/* ============================================================
   EXPLAIN — the mitigation for this design's worst property, and an
   admission that the mitigation is needed.

   RFC 02's weakness 1: "why did the furnace stop?" used to be 92 contiguous
   lines of sim/structures.js. Here it is a table row, four component files
   and the slot graph, and `grep` cannot trace it. That is a real cost and it
   does not go away.

   Four things reduce it, in order of how much they actually help:

   1. Every component's tick is a NAMED function expression -- `recipeTick`,
      `burnerTick`, `catchBoxTick` -- rather than an anonymous method. A stack
      trace therefore reads `recipeTick` and not `Object.tick`, and a profile
      names components instead of showing one hot `tick`. Costs nothing.
   2. Every component file opens with a PROVIDES / NEEDS / PERSISTS header, so
      `grep -B1 -A3 "PROVIDES: heat" comp/*.js` answers "what can provide
      heat" -- the question the slot graph makes important and grep otherwise
      cannot answer.
   3. comp/index.js carries the whole slot graph as a comment. It is
      hand-maintained, which means it can go stale; explainHost() below is
      generated from the live object, so when they disagree, believe this one.
   4. This function: a text dump of a host's parts, tick order, slot wiring
      and the exact reason its recipe is not running.

   WHAT REMAINS, honestly: 1-3 make the STATIC structure greppable. Nothing
   here makes the DYNAMIC path greppable -- you still cannot find, by reading,
   that `Recipe` pushing to `Emitter` is what makes an ingot appear in the
   world. You have to know the slot names. That is the residue, and it is the
   price of the whole approach.
   ============================================================ */

export function explainHost(host) {
  const L = [];
  L.push(host.type + ' #' + host.id + ' at ' + host.tx + ',' + host.ty);
  L.push('  tick order: ' + host.parts.map(([C]) => C.id).join(' -> '));
  L.push('  slots:');
  for (const name in host.slots)
    L.push('    ' + name.padEnd(10) + ' <- ' + host.slots[name].$def.id);
  for (const [C, c] of host.parts) {
    const needs = (C.needs || []).map(n =>
      n + (host.slots[n.replace(/\?$/, '')] ? '' : ' (UNMET, optional)'));
    L.push('  ' + C.id + (needs.length ? ' needs ' + needs.join(', ') : ''));
  }
  const r = host.slots.recipe;
  if (r) L.push('  recipe: ' + whyRecipe(r));
  const h = host.slots.heat;
  if (h) L.push('  heat: ' + (h.hot() ? 'LIT' : 'COLD') + ' from ' + h.$def.id);
  return L.join('\n');
}

/* The answer to "why did the furnace stop?", in one string. `stall` is set by
   comp/recipe.js at each early return, which is cheap and means the reason is
   always current rather than reconstructed. */
export function whyRecipe(r) {
  if (r.stall) return r.stall + ' (pool: ' + r.pool.map(x => x.id).join(',') + ')';
  if (!r.cur) return 'IDLE';
  return r.cur.id + ' ' + r.prog.toFixed(2) + '/' + r.secsOf(r.cur).toFixed(2) + 's';
}

/* Which machines could ever make a thing. The reverse query a designer
   actually asks, and it is not greppable either: the answer lives in the
   join between a machine's Recipe tag and the RECIPES table. */
export function makersOf(form, MACHINES) {
  const tags = RECIPES.filter(r => r.out.some(q => q.form === form)).map(r => r.tag);
  return Object.keys(MACHINES).filter(id =>
    MACHINES[id].parts.some(([n, p]) => n === 'Recipe' && tags.includes(p.tag)));
}
