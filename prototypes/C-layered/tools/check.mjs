/* `node tools/check.mjs` — the whole gate, in four sections.

     0  dependency direction   tools/layers.mjs   (static, runs first)
     1  name resolution        tools/resolve.mjs  (loads data/, no DOM)
     2  the mutation epoch     render() may not touch the model
     3  content probes         the three claims this prototype makes about
                               content, asserted rather than described

   Sections 0 and 1 are the enforcement RFC 04 proposed and they are complete.
   Sections 2 and 3 need the modules to import cleanly, which they do, but they
   are exercising a skeleton: the drawing calls are stubs and the player physics
   is a stub, so a green section 3 proves the DATA PATH and nothing about how
   the game feels. Stated because the brief asks for honest verification: this
   file can tell you that tin becomes an ingot. It cannot tell you anything
   looks good. */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const section = (f, env = {}) =>
  execFileSync(process.execPath, [join(here, f)], {
    cwd: root, stdio: 'inherit', env: { ...process.env, ...env }
  });

console.log('\n0  dependency direction');
section('layers.mjs');

console.log('\n1  name resolution');
section('resolve.mjs');

console.log('\n2  the mutation epoch');
const { meta } = await import('../src/model/epoch.js');
const { newRun } = await import('../src/shell/boot.js');
const { render } = await import('../src/view/scene.js');
const { stepAll } = await import('../src/shell/schedule.js');
const { drainJournal } = await import('../src/shell/notify.js');

/* A canvas that records nothing. `core/pixels.js` is the only thing that
   touches it, which is what makes this substitution legal. */
const g = { fillStyle: '', globalAlpha: 1, fillRect() {} };

newRun(1337);
const before = meta.epoch;
render(g, { x: 0, y: 0 }, 320, 180);
if (meta.epoch !== before) {
  console.error(`  FAIL render() moved the mutation epoch ${before} -> ${meta.epoch}`);
  process.exit(1);
}
console.log(`  ok   render() left the model alone (epoch ${before})`);

console.log('\n3  content probes');
const { S, SUB } = await import('../src/data/substances.js');
const { M, MACH } = await import('../src/data/machines.js');
const { place } = await import('../src/rules/place.js');
const { bandOf } = await import('../src/model/world.js');
const { machines, write: mw, count } = await import('../src/model/machines.js');
const { items } = await import('../src/model/items.js');
const { journal } = await import('../src/model/journal.js');
const { write: tilew } = await import('../src/model/tiles.js');
const { write: fieldw } = await import('../src/model/fields.js');
const { run } = await import('../src/model/run.js');
const { eff } = await import('../src/model/mods.js');
const { equip, unequip } = await import('../src/rules/trinkets.js');
const machineRule = await import('../src/rules/machines.js');

const fails = [];
const ok = (name, cond, extra = '') =>
  cond ? console.log(`  ok   ${name} ${extra}`) : fails.push(`${name} ${extra}`);

/* --- 3a. a trinket bends a frozen base value at run time --- */
newRun(1337);
unequip('winged-sandals');
const baseWalk = eff('walk');
equip('winged-sandals');
ok('trinket modifies walk speed', Math.abs(eff('walk') - baseWalk * 1.15) < 1e-9,
   `${baseWalk} -> ${eff('walk').toFixed(2)} px/s`);
unequip('winged-sandals');
ok('losing it restores the base', eff('walk') === baseWalk, `${eff('walk')} px/s`);

equip('tin-eater');
ok('a scoped trinket bends one substance only',
   eff('hard', 'tin') === 0.5 && eff('hard', 'granite') === 1,
   `hard.tin x${eff('hard', 'tin')}, hard.granite x${eff('hard', 'granite')}`);
unequip('tin-eater');

/* --- 3b. THE BENCHMARK THE REVIEW FOUND BROKEN. Feed the furnace tin and
           nothing but tin, and see whether an ingot comes out. --- */
newRun(1337);
const band = bandOf('surface');
/* clear a footprint and give it a floor, then place */
for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) tilew.set(band, 40 + i, 30 + j, S.air);
for (let i = 0; i < 5; i++) tilew.set(band, 40 + i, 34, S.granite);
const furnace = place(band, M.furnace, 40, 32);
ok('placement reads tw/th/footing off the row', !!furnace);

items.length = 0;
mw.take(furnace, 'tin', 2);
mw.take(furnace, 'timber', 1);
for (let i = 0; i < 600; i++) machineRule.step(1 / 120);   // 5 simulated seconds
const madeIngot = items.some(it => SUB[it.sub].id === 'ingot');
ok('tin smelts with no edit to any machine row', madeIngot,
   `buffer now ${JSON.stringify(furnace.buf)}, items ${items.map(i => SUB[i.sub].id).join(',')}`);

/* --- 3c. the blood winch pays in hearts and never kills you --- */
newRun(1337);
const b2 = bandOf('surface');
for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) tilew.set(b2, 60 + i, 30 + j, S.air);
for (let i = 0; i < 4; i++) tilew.set(b2, 60 + i, 35, S.granite);
const winch = place(b2, M.bloodWinch, 60, 32);
ok('the winch places', !!winch);

const heartsBefore = run.hearts;
for (let i = 0; i < 900; i++) machineRule.step(1 / 120);   // 7.5 s, no timber
ok('with no fuel the winch takes hearts', run.hearts < heartsBefore,
   `${heartsBefore} -> ${run.hearts} hearts, ${winch.charges} charge(s)`);
ok('health never becomes an inventory item', run.inv.blood === undefined
   && !SUB.some(s => s.id === 'blood'));

for (let i = 0; i < 20000; i++) machineRule.step(1 / 120);  // 166 s of desperation
ok('a machine may not spend your last heart', run.hearts >= 1, `${run.hearts} left`);

/* --- 3d. with timber present the honest recipe is preferred --- */
newRun(1337);
const b3 = bandOf('surface');
for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) tilew.set(b3, 60 + i, 30 + j, S.air);
for (let i = 0; i < 4; i++) tilew.set(b3, 60 + i, 35, S.granite);
const winch2 = place(b3, M.bloodWinch, 60, 32);
mw.take(winch2, 'timber', 2);
const h0 = run.hearts;
for (let i = 0; i < 1600; i++) machineRule.step(1 / 120);  // 13.3 s: both logs
ok('recipe order makes timber the default', run.hearts === h0 && count(winch2, '#fuel') === 0,
   `${run.hearts} hearts, ${winch2.charges} charge(s), buffer ${JSON.stringify(winch2.buf)}`);

/* --- 3d-bis. the kiln, added last by copying the crusher. This probe is the
       only line outside `data/machines.js` that the kiln needed, and it is a
       test rather than engine code: I wanted the claim verified, not asserted. */
newRun(1337);
const b4 = bandOf('surface');
for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) tilew.set(b4, 70 + i, 30 + j, S.air);
for (let i = 0; i < 3; i++) tilew.set(b4, 70 + i, 34, S.granite);
const kiln = place(b4, M.kiln, 70, 32);
items.length = 0;
mw.take(kiln, 'gravel', 2);
for (let i = 0; i < 600; i++) machineRule.step(1 / 120);
ok('a cold kiln does not bake', !items.some(it => SUB[it.sub].id === 'brick'),
   'heat gate holds');
fieldw.add(b4, 'heat', kiln.tx, kiln.ty, 60);
for (let i = 0; i < 600; i++) machineRule.step(1 / 120);
ok('a hot kiln bakes 2 gravel into 1 brick',
   items.filter(it => SUB[it.sub].id === 'brick').length === 1,
   `items ${items.map(i => SUB[i.sub].id).join(',') || 'none'}`);

/* --- 3e. the schedule runs, the journal drains, nothing accumulates --- */
newRun(1337);
for (let i = 0; i < 240; i++) stepAll(1 / 120, { left: false, right: false, up: false,
  down: false, jump: false, dig: false, place: false });
drainJournal();
ok('two simulated seconds of the full schedule',
   machines.length === 2 && journal.length === 0,
   `${machines.length} machines placed, journal drained to ${journal.length}`);

if (fails.length) {
  console.error(`\nfailed: ${fails.length}`);
  for (const f of fails) console.error('  FAIL ' + f);
  process.exit(1);
}
console.log('\nall sections green\n');
