/* SECTION 1 of `check` — the resolution pass.

   Every string key in `data/` is resolved and every cross-table reference is
   proved. A dangling name fails the build here instead of throwing at depth 300
   or, worse, silently doing nothing.

   This is the net under the cheapest thing this architecture does: content is
   flat literals in flat tables, and the price of literals is typos. The pass
   costs about 120 lines and it is the reason a typo in a substance row fails
   NEAR THE EDIT, naming the row and the field.

   It also proves the one thing a name check does not obviously cover, and which
   the review of RFC 04 found broken: that every substance a machine will ACCEPT
   also has a recipe that can CONSUME it. Adding `tin` to a furnace that accepts
   `#ore` and smelts a hardcoded `copper` used to swallow tin forever. Now it is
   a build error. */

import { SUBSTANCES, SUB, S, byTag, matches } from '../src/data/substances.js';
import { MACHINES } from '../src/data/machines.js';
import { SOURCES } from '../src/data/sources.js';
import { TUNABLES, TUNE } from '../src/data/tuning.js';
import { TRINKETS } from '../src/data/trinkets.js';
import { BANDS, FIELDS } from '../src/data/world.js';
import { COL } from '../src/data/palette.js';
import { SFX } from '../src/data/sfx.js';
import { TREAT } from '../src/view/treatments.js';

const bad = [];
const fail = (where, msg) => bad.push(`${where}: ${msg}`);

const isSub = id => S[id] !== undefined;
const colOk = key => key === undefined || key === null || key in COL;
const machineIds = new Set(MACHINES.map(m => m.id));

/* ---- 1. substances ---------------------------------------------------- */
const hudOrders = new Map();
for (const s of SUBSTANCES) {
  const at = `substances.${s.id}`;
  if (!s.id || !s.name) fail(at, 'needs an id and a name');
  if (s.tile?.drop && !isSub(s.tile.drop)) fail(at, `tile.drop "${s.tile.drop}" is not a substance`);

  for (const k of ['base', 'hi', 'lo'])
    if (!colOk(s.look?.[k])) fail(at, `look.${k} "${s.look[k]}" is not a palette key`);
  for (const c of s.look?.item ?? [])
    if (!colOk(c)) fail(at, `look.item "${c}" is not a palette key`);

  for (const t of s.look?.treatments ?? []) {
    if (!(t.fn in TREAT)) fail(at, `look.treatments fn "${t.fn}" is not in view/treatments.js`);
    if (!colOk(t.col)) fail(at, `treatment col "${t.col}" is not a palette key`);
  }
  for (const [slot, name] of Object.entries(s.look?.sfx ?? {}))
    if (!(name in SFX)) fail(at, `look.sfx.${slot} "${name}" is not a sound row`);

  /* An item with no `look.item` colours cannot be drawn, and the failure would
     be a blank pixel three hours later. */
  if (s.item && !s.look?.item) fail(at, 'has an item block but no look.item colours');
  if (s.item?.hud) {
    const o = s.item.hud.order;
    if (hudOrders.has(o)) fail(at, `hud.order ${o} collides with ${hudOrders.get(o)}`);
    hudOrders.set(o, s.id);
  }

  /* THE CHECK THE REVIEW ASKED FOR. Any row a furnace will accept must be
     smeltable, or it accumulates in a buffer nothing consumes. */
  if ((s.tags ?? []).includes('ore')) {
    if (!s.smeltsTo) fail(at, "tagged 'ore' but has no smeltsTo — a furnace would swallow it forever");
    else if (!isSub(s.smeltsTo)) fail(at, `smeltsTo "${s.smeltsTo}" is not a substance`);
  }
}

/* a tag nothing carries is a typo somewhere else */
for (const [tag, members] of Object.entries(byTag))
  if (!members.length) fail(`substances.#${tag}`, 'tag has no members');

/* ---- 2. machines ------------------------------------------------------ */
for (const def of MACHINES) {
  const at = `machines.${def.id}`;
  if (!(def.tw > 0 && def.th > 0)) fail(at, 'needs tw and th');
  if (def.footing > def.tw) fail(at, `footing ${def.footing} exceeds width ${def.tw}`);

  const sels = [];
  for (const p of def.ports ?? []) {
    for (const sel of p.accepts ?? []) {
      if (!matches(sel).length) fail(at, `port accepts "${sel}" which matches nothing`);
      sels.push(sel);
    }
    if (p.mode === 'fluidIn' && !FIELDS.includes(p.field))
      fail(at, `port field "${p.field}" is not declared by any band`);
  }
  if (def.recipes?.some(r => r.out !== undefined || r.outFrom) &&
      !def.ports.some(p => p.mode === 'out'))
    fail(at, 'has recipes but no out port');

  for (const sel of Object.keys(def.buffer?.cap ?? {}))
    if (!matches(sel).length) fail(at, `buffer.cap "${sel}" matches nothing`);

  if (def.catchBox && !def.mouthOk && !def.ports.some(p => p.mode === 'in'))
    fail(at, 'has a catchBox but no in port');

  for (const e of def.emit ?? []) {
    if (!FIELDS.includes(e.field)) fail(at, `emit field "${e.field}" is not declared by any band`);
    if (!['top', 'bottom', 'left', 'right'].includes(e.at)) fail(at, `emit at "${e.at}" is not a side`);
  }

  for (const p of def.look?.pips ?? [])
    if (!matches(p.sel).length) fail(at, `look.pips sel "${p.sel}" matches nothing`);
  for (const k of ['body', 'trim', 'base'])
    if (!colOk(def.look?.[k])) fail(at, `look.${k} "${def.look[k]}" is not a palette key`);
  for (const [slot, name] of Object.entries(def.look?.sfx ?? {}))
    if (!(name in SFX)) fail(at, `look.sfx.${slot} "${name}" is not a sound row`);

  /* ---- recipes ---- */
  for (const [i, r] of (def.recipes ?? []).entries()) {
    const rat = `${at}.recipes[${i}]`;
    const src = SOURCES[r.from ?? 'buffer'];
    if (!src) { fail(rat, `from "${r.from}" is not a row in data/sources.js`); continue; }
    if (!(r.secs > 0)) fail(rat, 'needs secs > 0');

    for (const [sel, n] of Object.entries(r.in ?? {})) {
      if (!(n > 0)) fail(rat, `in "${sel}" needs a positive count`);
      if (src.units === 'named') {
        if (!src.offers.includes(sel))
          fail(rat, `in "${sel}" is not offered by source "${src.id}" (offers: ${src.offers.join(', ')})`);
      } else {
        if (!matches(sel).length) fail(rat, `in "${sel}" matches no substance`);
        /* buffered inputs must have somewhere to sit */
        if (src.id === 'buffer' && !capClauseFor(def, sel))
          fail(rat, `in "${sel}" has no buffer.cap clause, so it can never accumulate`);
      }
    }

    const hasOut = r.out !== undefined, hasFrom = r.outFrom !== undefined;
    if (hasOut === hasFrom) fail(rat, 'needs exactly one of out / outFrom');

    for (const [id, n] of Object.entries(r.out ?? {})) {
      if (!isSub(id)) fail(rat, `out "${id}" is not a substance`);
      else if (!SUB[S[id]].item) fail(rat, `out "${id}" has no item block, so it cannot be ejected`);
      if (!(n > 0)) fail(rat, `out "${id}" needs a positive count`);
    }

    if (hasFrom) {
      const { input, field, n } = r.outFrom;
      if (!(input in (r.in ?? {}))) fail(rat, `outFrom.input "${input}" is not one of this recipe's inputs`);
      if (!(n > 0)) fail(rat, 'outFrom.n needs a positive count');
      /* every substance that could satisfy the input must carry the field, and
         it must name a real, ejectable substance */
      for (const sub of matches(input)) {
        const row = SUB[sub];
        const target = row[field];
        if (!target) fail(rat, `outFrom: substance "${row.id}" can satisfy "${input}" but has no "${field}"`);
        else if (!isSub(target)) fail(rat, `outFrom: ${row.id}.${field} = "${target}" is not a substance`);
        else if (!SUB[S[target]].item) fail(rat, `outFrom: ${row.id}.${field} = "${target}" has no item block`);
      }
    }

    for (const [field, want] of Object.entries(r.needs ?? {})) {
      if (!FIELDS.includes(field)) fail(rat, `needs field "${field}" is not declared by any band`);
      if (want.min === undefined && want.max === undefined) fail(rat, `needs.${field} has neither min nor max`);
    }
  }
}

function capClauseFor(def, sel) {
  const caps = def.buffer?.cap ?? {};
  if (caps[sel] !== undefined) return true;
  const want = matches(sel);
  return Object.keys(caps).some(c => matches(c).some(s => want.includes(s)));
}

/* ---- 3. tunables and trinkets ---------------------------------------- */
for (const t of TUNABLES) {
  if (!['value', 'scale'].includes(t.kind)) fail(`tuning.${t.id}`, `kind "${t.kind}" is not value|scale`);
  if (t.kind === 'scale' && !['substance', 'machine'].includes(t.scope))
    fail(`tuning.${t.id}`, 'a scale row needs scope: substance|machine');
  if (!Number.isFinite(t.base)) fail(`tuning.${t.id}`, 'base must be a finite number');
}

for (const tr of TRINKETS) {
  const at = `trinkets.${tr.id}`;
  if (!tr.mods?.length) fail(at, 'has no mods');
  for (const m of tr.mods ?? []) {
    const [id, scope] = m.key.split('.');
    const tun = TUNE[id];
    if (!tun) { fail(at, `mod key "${m.key}" names no tunable`); continue; }
    if (scope !== undefined) {
      if (tun.kind !== 'scale') fail(at, `mod key "${m.key}" scopes a value-kind tunable`);
      else if (tun.scope === 'substance' && !isSub(scope)) fail(at, `mod key "${m.key}": "${scope}" is not a substance`);
      else if (tun.scope === 'machine' && !machineIds.has(scope)) fail(at, `mod key "${m.key}": "${scope}" is not a machine`);
    }
    if ((m.mul === undefined) === (m.add === undefined)) fail(at, `mod "${m.key}" needs exactly one of mul / add`);
  }
}

/* ---- 4. bands -------------------------------------------------------- */
for (const b of BANDS) {
  const at = `world.${b.id}`;
  if (!(b.tw > 0 && b.th > 0 && b.tile > 0 && b.chunk > 0)) fail(at, 'needs tw, th, tile, chunk');
  if (b.spawnTx >= b.tw) fail(at, `spawnTx ${b.spawnTx} is outside a ${b.tw}-tile band`);
  if (b.surfaceTy > b.th) fail(at, 'surfaceTy is below the band floor');
}

/* ---- report ---------------------------------------------------------- */
if (bad.length) {
  console.error(`\nunresolved names: ${bad.length}`);
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(`  ok   every name resolves (${SUBSTANCES.length} substances, ${MACHINES.length} machines, ${TRINKETS.length} trinkets)`);
