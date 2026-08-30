import { MACHINES } from '../data/machines.js';
import { ACTORS } from '../data/actors.js';
import { RECIPES } from '../data/recipes.js';
import { SUB } from '../data/substances.js';
import { FORMS } from '../data/forms.js';
import { COMPONENTS } from '../comp/index.js';
import { BASE } from './tunables.js';
import { TRINKETS, MACHINE_BOONS } from '../data/boons.js';

/* ============================================================
   TABLES — boot-time validation of the data tables. ~40 lines, called once
   from main.js before anything is assembled.

   RFC 02 promises "a table typo throws at assembly rather than silently
   doing nothing". assemble() delivers that for the machine you place; this
   file makes it EAGER, so a typo in a machine nobody has placed yet still
   fails at boot with the name you typed. That matters for the cold-open
   test: an unreachable machine row is exactly the row a newcomer edits.

   Every message names the table, the row and the token.
   ============================================================ */
export function checkTables() {
  const errs = [];
  const E = (...a) => errs.push(a.join(' '));

  for (const [table, name] of [[MACHINES, 'MACHINES'], [ACTORS, 'ACTORS']])
    for (const id in table) {
      const row = table[id];
      if (!Array.isArray(row.parts)) { E(name + '.' + id + ': no parts list'); continue; }
      const provided = new Set();
      for (const [pname] of row.parts) {
        const C = COMPONENTS[pname];
        if (!C) { E(name + '.' + id + ': unknown component ' + pname); continue; }
        for (const s of C.provides || []) provided.add(s);
      }
      for (const [pname] of row.parts) {
        const C = COMPONENTS[pname];
        if (!C) continue;
        for (const need of C.needs || []) {
          const s = need.replace(/\?$/, '');
          if (!need.endsWith('?') && !provided.has(s))
            E(name + '.' + id + '.' + C.id + ' needs slot ' + s +
              ' -- no part in the row provides it');
        }
      }
      /* A Recipe part naming a tag no RECIPES row carries is the single most
         likely kiln typo, so it is checked by name. */
      for (const [pname, p] of row.parts) {
        if (pname !== 'Recipe') continue;
        const pool = RECIPES.filter(r => r.tag === p.tag);
        if (!pool.length) {
          E(name + '.' + id + ": Recipe tag '" + p.tag + "' matches no RECIPES row");
          continue;
        }
        /* THE HOLE THIS CLOSES, and it is worth reading.

           Recipe declares `heat?` -- OPTIONAL -- because the crusher has no
           burner and must still assemble. So a kiln whose row forgot its
           Burner satisfies every `needs` and places happily, then never
           bakes: a silent failure, far from the edit, and exactly the class
           of bug the slot checker was supposed to make impossible.

           assemble() cannot catch it, because whether `heat` is required is
           a property of the RECIPE POOL, not of the component. So it is
           caught here instead, by joining the two tables at boot. */
        const needsHeat = pool.some(r => r.hot);
        if (needsHeat && !provided.has('heat'))
          E(name + '.' + id + ": recipe '" + pool.find(r => r.hot).id +
            "' is `hot: true` but no part provides `heat` -- add a Burner " +
            '(or a BloodBurner) to this row.');
      }
      if (COMPONENTS.Footprint && row.parts.some(([n]) => n === 'Footprint') && !row.size)
        E(name + '.' + id + ': has a Footprint but no size');
    }

  /* Every (sub, form) a recipe can produce must be declared on the substance
     row. This is what catches "I added a bake recipe but forgot to give
     copper a brick form" -- the mistake the review said nothing would catch. */
  for (const r of RECIPES)
    for (const q of [...r.in, ...r.out]) {
      if (q.form && !FORMS[q.form]) E("RECIPES." + r.id + ': no such form ' + q.form);
      if (q.sub && q.sub !== '$s') {
        if (!SUB[q.sub]) E('RECIPES.' + r.id + ': no such substance ' + q.sub);
        else if (q.form && !SUB[q.sub].forms.includes(q.form))
          E('RECIPES.' + r.id + ': ' + q.sub + ' has no ' + q.form + ' form');
      }
      if (q.sub === '$s' && q.form) {
        const any = Object.keys(SUB).some(s => SUB[s].forms.includes(q.form));
        if (!any) E('RECIPES.' + r.id + ': no substance declares a ' + q.form +
                    " form, so $s can never bind. Add it to the substance's" +
                    ' `forms` list in data/substances.js.');
      }
    }

  for (const id in TRINKETS)
    for (const m of TRINKETS[id].mods) {
      const key = m.key.endsWith('.*') ? m.key.slice(0, -2) : m.key;
      const known = BASE[m.key] !== undefined ||
                    Object.keys(BASE).some(k => k.startsWith(key)) ||
                    key === 'hard';
      if (!known) E('TRINKETS.' + id + ': modifies unknown tunable ' + m.key);
    }

  for (const id in MACHINE_BOONS)
    if (!MACHINES[MACHINE_BOONS[id].grants])
      E('MACHINE_BOONS.' + id + ': grants unknown machine ' +
        MACHINE_BOONS[id].grants);

  if (errs.length) throw new Error('data tables:\n  ' + errs.join('\n  '));
}
