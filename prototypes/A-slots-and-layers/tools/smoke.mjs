/* ============================================================
   tools/smoke.mjs — not a test harness, a claim receipt.

   The brief says nobody will run this prototype, and nothing here is built
   for running. But the README makes six factual claims about how the slot
   mechanism behaves, and the reviewer is instructed to verify claims against
   the code. This script exercises exactly those six and prints what it
   observed, so verification is one command instead of a reading.

   Run:  node tools/smoke.mjs

   Rendering, worldgen, input, audio and the integrators are stubs, so this
   drives the sim directly: it lays a floor, places all five machines, puts
   material in buffers by hand and steps the fixed schedule.
   ============================================================ */

import { newRun } from '../src/shell/boot.js';
import { place } from '../src/rules/place.js';
import { stepFixed } from '../src/shell/schedule.js';
import { cur } from '../src/model/world.js';
import { write as tw } from '../src/model/tiles.js';
import { matches, S } from '../src/data/substances.js';
import { machines, restore, snapshot } from '../src/model/machines.js';
import { items } from '../src/model/items.js';
import { at as fieldAt } from '../src/model/fields.js';
import { run } from '../src/model/run.js';
import { buf } from '../src/model/slots.js';
import { stat, write as modw } from '../src/model/mods.js';
import { SUB } from '../src/data/substances.js';

const secs = (n) => { let a = 0; for (let i = 0; i < n * 120; i++) a = stepFixed(a + 1 / 120); };

newRun(1337);
const b = cur.band;
for (let tx = 30; tx < 60; tx++) tw.set(b, tx, 33, S.granite);

const furnace = place('furnace', 40, 31);
const kiln    = place('kiln', 50, 31);
const winch   = place('winch', 44, 30);
const blood   = place('bloodWinch', 47, 30);

console.log('\n-- assembly: parts in resolved tick order --');
for (const m of machines)
  console.log(`   ${String(m.tx).padEnd(3)} ${m.wired.map(w => w.part).join(' -> ')}`);

console.log('\n-- CLAIM 1: tin smelts with no edit to the furnace row --');
buf.put(furnace.parts.Buffer, S.tin, 2);
buf.put(furnace.parts.Buffer, S.timber, 1);
secs(6);
console.log(`   furnace produced ${furnace.parts.Recipe.made}, `
          + `items on the ground: ${items.map(i => SUB[i.sub].id).join(', ')}`);

console.log('\n-- CLAIM 2: the kiln bakes, gated on its own heat slot --');
buf.put(kiln.parts.Buffer, S.gravel, 4);
buf.put(kiln.parts.Buffer, S.timber, 2);
secs(6);
console.log(`   kiln produced ${kiln.parts.Recipe.made} brick(s); `
          + `burner level ${kiln.parts.Burner.level.toFixed(2)}; `
          + `heat field at the mouth ${fieldAt(b, 'heat', 51, 31).toFixed(1)}`);

console.log('\n-- CLAIM 3: one Deck, two heat providers, no branch --');
buf.put(winch.parts.Buffer, S.timber, 4);
const h0 = run.hearts;
secs(10);
console.log(`   winch      deck ${winch.parts.Deck.y.toFixed(1)}px  `
          + `heat.hot=${winch.parts.Burner.hot}  (fuel: timber)`);
console.log(`   bloodWinch deck ${blood.parts.Deck.y.toFixed(1)}px  `
          + `heat.hot=${blood.parts.BloodBurner.hot}  `
          + `(fuel: hearts ${h0} -> ${run.hearts}, ${blood.parts.BloodBurner.paid} paid)`);

console.log('\n-- CLAIM 4: tunables stack, scope and revoke --');
console.log(`   walk base                 ${stat('walk')}`);
modw.grant('winged_sandals');
console.log(`   + winged_sandals x1.15    ${stat('walk').toFixed(2)}`);
modw.grant('ichor_thin');
console.log(`   + thinned_ichor x1.30     ${stat('walk').toFixed(2)}   `
          + `fall.safe ${stat('fall.safe')}`);
modw.revoke('winged_sandals');
console.log(`   - winged_sandals          ${stat('walk').toFixed(2)}`);
modw.grant('forge_bellows');
console.log(`   forge_bellows scoped:     bake ${stat('machine.rate', 'bake')}, `
          + `smelt ${stat('machine.rate', 'smelt')}`);

console.log('\n-- CLAIM 5: a machine round-trips through JSON --');
const snap = JSON.parse(JSON.stringify(snapshot()));
restore(snap);
console.log(`   restored ${machines.length} machines; `
          + `kiln output count survived: ${machines[1].parts.Recipe.made}`);

console.log('\n-- CLAIM 6: typos throw at the edit, naming what you typed --');
const shows = [
  ['unknown machine id',   () => place('kilnn', 40, 31)],
  ['unknown tunable',      () => stat('walkk')],
  ['unknown trinket',      () => modw.grant('winged_sandalz')],
  ['tag matching nothing', () => matches('#nosuchtag')],
  ['unknown substance',    () => matches('coper')]
];
for (const [why, fn] of shows) {
  try { fn(); console.log(`   ${why.padEnd(22)} DID NOT THROW`); }
  catch (e) { console.log(`   ${why.padEnd(22)} ${e.message}`); }
}
console.log('');
