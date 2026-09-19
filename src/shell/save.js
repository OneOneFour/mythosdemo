/* shell layer — one `localStorage` save slot. The payload is the seed plus the
   player's edits, so `load()` regenerates the terrain through the `newRun` it
   is handed — an argument, so this module imports no other `shell` module. */

import { cursor, rng, seedRng } from '../core/rng.js';
import { BOON } from '../data/boons.js';
import { CYCLE } from '../data/cycles.js';
import { FORM } from '../data/forms.js';
import { M, MACH } from '../data/machines.js';
import { SUB } from '../data/substances.js';
import { BANDS } from '../data/world.js';
import { boons, write as boonw } from '../model/boons.js';
import { planted, write as groww } from '../model/growth.js';
import { items, write as itemw, parseKey } from '../model/items.js';
import { defOf, machines, write as machw } from '../model/machines.js';
import { workAt, write as digw } from '../model/mining.js';
import { mods, write as modw } from '../model/mods.js';
import { player, write as playerw } from '../model/player.js';
import { run, write as runw } from '../model/run.js';
import { segments, write as segw } from '../model/segments.js';
import { write as tilew } from '../model/tiles.js';
import { bandOf, bands, idx, seenAt, write as worldw } from '../model/world.js';
import { generate } from '../rules/generate.js';

/* Four claims gate a load: `v` the payload shape, `world` the band table,
   `content` the ordinal tables, `gen` each band's generated `mat`. The first
   three sit in the header key; `gen` needs a world, so `load()` checks it. */
const V = 2;
const BODY = 'mythos-factory/save';
const HEAD = 'mythos-factory/save-head';

/* `localStorage` throws in private-mode and sandboxed contexts rather than
   returning null, so every call goes through one of these three and a failure
   reads as "no save". */

const read = key => {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
};

const writeKey = (key, value) => {
  try { globalThis.localStorage.setItem(key, value); return true; } catch { return false; }
};

const dropKey = key => {
  try { globalThis.localStorage?.removeItem(key); } catch { /* nothing to undo */ }
};

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function fnvBytes(a) {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/* Both signatures are computed once at import; the tables are frozen. */
const WORLD_SIG = fnv(JSON.stringify(BANDS));

/* The three ordinal tables: a substance or form ordinal is an index, so a row
   inserted anywhere but the end re-points every stored pair. Every other id in
   the payload is a string. */
const CONTENT_SIG = fnv(
  SUB.map(s => s.id).join(',') + '|' +
  FORM.map(f => f.id).join(',') + '|' +
  MACH.map(m => m.id).join(','));

/* Fog of war is one bit per tile: 6.5 KB packed over the three shipped bands
   against 52 KB raw. Chunked, because `String.fromCharCode` takes its
   arguments on the stack. */

const CHUNK = 4096;

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK)
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return globalThis.btoa(s);
}

/* Null rather than a throw on anything `atob` will not take, so the one step
   that can fail on a hand-edited slot fails during validation. */
function fromB64(str) {
  let s;
  try { s = globalThis.atob(str); } catch { return null; }
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/* The baseline world, regenerated to be diffed against, since nothing records
   which tiles the player changed. The RNG cursor and the mod store are restored
   in the `finally`, and a scratch band keys growth by `ord + ORD_GAP`. */

/* Must exceed the number of resident bands, which `data/world.js` puts at 3. */
const ORD_GAP = 64;

function baseline(seed) {
  const prev = rng.next;
  const rows = mods.rows.map(r => ({ ...r }));
  try {
    modw.clear();
    seedRng(seed);
    const out = bands.map(b => ({
      ...b,
      ord: b.ord + ORD_GAP,
      mat: new Uint8Array(b.mat.length),
      ver: new Uint32Array(b.ver.length)
    }));
    for (const b of out) generate(b);
    return out.map(b => b.mat);
  } finally {
    rng.next = prev;
    modw.clear();
    for (const src of new Set(rows.map(r => r.src)))
      modw.add(src, rows.filter(r => r.src === src));
  }
}

/* One traversal per band collects all three per-tile facts. `workAt` is asked
   per tile rather than walked as a Map, because `model/mining.js` keys its
   ledger by a packed ordinal-plus-index and exports no inverse. */
function bandRow(b, base) {
  const edits = [], work = [];
  const bits = new Uint8Array(Math.ceil(b.mat.length / 8));
  for (let ty = 0; ty < b.th; ty++) for (let tx = 0; tx < b.tw; tx++) {
    const i = idx(b, tx, ty);
    if (b.mat[i] !== base[i]) edits.push(tx, ty, b.mat[i]);
    const w = workAt(b, tx, ty);
    if (w > 0) work.push(tx, ty, w);
    if (seenAt(b, tx, ty)) bits[i >> 3] |= 1 << (i & 7);
  }
  return { id: b.id, gen: fnvBytes(base), edits, work, seen: toB64(bits) };
}

/* Machine records in `machines` order, which is placement order. A segment
   names its two hubs by index into this array. */
function machineRows() {
  return machines.map(m => ({
    band: m.band.id, id: defOf(m).id, tx: m.tx, ty: m.ty,
    buf: { ...m.buf },
    prog: m.prog, made: m.made, charges: m.charges,
    fire: m.fire, running: m.running, torque: m.torque, turn: m.turn
  }));
}

function segmentRows() {
  return segments.map(s => ({
    a: machines.indexOf(s.a), b: machines.indexOf(s.b),
    u: s.u, spin: s.spin, load: s.load,
    /* Phases rather than offsets: a phase is what the player sees, and it
       restores against the saved `u` without depending on the write order. */
    cars: s.carriers.map(c => (c.off + s.u) % 1)
  }));
}

/* `rest` and `age` are absent: both are re-established by the first
   `rules/items.js` step. */
function itemRows() {
  return items.map(it => ({
    band: it.band.id, x: it.x, y: it.y, vx: it.vx, vy: it.vy,
    sub: it.sub, form: it.form
  }));
}

function playerRow() {
  return {
    band: player.band?.id ?? null,
    x: player.x, y: player.y, vx: player.vx, vy: player.vy,
    onGround: player.onGround, onLadder: player.onLadder, coyote: player.coyote,
    fallFrom: player.fallFrom, face: player.face, walkPhase: player.walkPhase,
    landFlash: player.landFlash, hurtFlash: player.hurtFlash, digging: player.digging
  };
}

/* Write the run to one slot. The header is removed first and written last, and
   any failure clears both keys, so a header can never outlive its body.
   Returns false when storage refuses, and then there is no save at all. */
export function save() {
  if (!bands.length) return false;
  const seed = run.seed;
  /* Before `baseline()`, which re-seeds the stream and puts it back. */
  const at = cursor();
  const base = baseline(seed);
  const head = { v: V, world: WORLD_SIG, content: CONTENT_SIG, seed };
  const body = {
    ...head,
    cursor: at,
    run: { ...run },
    player: playerRow(),
    bands: bands.map((b, i) => bandRow(b, base[i])),
    /* A planted entry whose band is gone is dropped, so every band id in the
       payload resolves. */
    growth: [...planted().values()].filter(e => bands[e.ord]).map(e => ({
      band: bands[e.ord].id, tx: e.tx, ty: e.ty, secs: e.secs
    })),
    items: itemRows(),
    machines: machineRows(),
    segments: segmentRows(),
    boons: boons.active.map(a => ({ id: a.id, left: a.left }))
  };
  dropKey(HEAD);
  if (!writeKey(BODY, JSON.stringify(body))) { clearSave(); return false; }
  if (!writeKey(HEAD, JSON.stringify(head))) { clearSave(); return false; }
  return true;
}

function parse(raw) {
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/* The header's own three claims. Anything unrecognised is not a save. */
function headerOk(h) {
  return !!h && h.v === V && h.world === WORLD_SIG && h.content === CONTENT_SIG
      && Number.isFinite(h.seed);
}

/* What the body must carry before the apply runs: the apply writes through a
   dozen model writers, none checks its argument, and there is no rollback.
   Every dereferenced id is resolved and the fog bitset decoded here. */

/* `misses` and `tutorialBeat` restore by repeated one-way increments, since
   their writers take no argument, so an edited 1e9 would hang the boot.
   Nothing legitimate comes near 10,000. */
const REPLAY_MAX = 1e4;
const INT32 = 2147483648;

const num = v => Number.isFinite(v);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const given = v => v !== null && v !== undefined;
const cfgOf = id => BANDS.find(b => b.id === id);
const arrOf = (a, ok) => Array.isArray(a) && a.every(ok);
const pair = r => !!r && int(r.sub, 0, SUB.length - 1) && int(r.form, 0, FORM.length - 1);
const bufKey = k => { const { sub, form } = parseKey(k); return sub >= 0 && form >= 0; };

function bandFault(row, cfg) {
  if (!row || row.id !== cfg.id) return 'id';
  if (!num(row.gen)) return 'gen';
  for (const k of ['edits', 'work'])
    if (!Array.isArray(row[k]) || row[k].length % 3 !== 0) return k;
  for (let k = 0; k < row.edits.length; k += 3)
    if (!int(row.edits[k], 0, cfg.tw - 1) || !int(row.edits[k + 1], 0, cfg.th - 1)
        || !int(row.edits[k + 2], 0, 255)) return `edits[${k}]`;
  for (let k = 0; k < row.work.length; k += 3)
    if (!int(row.work[k], 0, cfg.tw - 1) || !int(row.work[k + 1], 0, cfg.th - 1)
        || !num(row.work[k + 2])) return `work[${k}]`;
  if (typeof row.seen !== 'string') return 'seen';
  const bits = fromB64(row.seen);
  if (!bits || bits.length !== Math.ceil(cfg.tw * cfg.th / 8)) return 'seen';
  /* Handed to `applyBand` on the row rather than decoded a second time. */
  row.bits = bits;
  return null;
}

function tributeFault(t) {
  if (!given(t)) return null;
  if (typeof t !== 'object' || !CYCLE[t.id]) return 'run.tribute.id';
  if (given(t.left) && !num(t.left)) return 'run.tribute.left';
  if (!t.have || typeof t.have !== 'object') return 'run.tribute.have';
  for (const k in t.have) if (!bufKey(k) || !num(t.have[k])) return `run.tribute.have.${k}`;
  if (given(t.credits) && !arrOf(t.credits, c => !!c && num(c.t) && num(c.n)))
    return 'run.tribute.credits';
  return null;
}

function runFault(r) {
  if (!r || typeof r !== 'object') return 'run';
  if (!num(r.t) || r.t < 0) return 'run.t';
  if (!Array.isArray(r.inv)) return 'run.inv';
  for (let i = 0; i < r.inv.length; i++) {
    if (!given(r.inv[i])) continue;
    if (!pair(r.inv[i]) || !int(r.inv[i].n, 1, INT32)) return `run.inv[${i}]`;
  }
  if (!arrOf(r.granted, id => M[id] !== undefined)) return 'run.granted';
  if (given(r.awarded) && !arrOf(r.awarded, id => M[id] !== undefined)) return 'run.awarded';
  if (!arrOf(r.charted, id => !!cfgOf(id))) return 'run.charted';
  if (!arrOf(r.equipped, v => !given(v) || int(v, 0, SUB.length - 1))) return 'run.equipped';
  if (!r.favour || typeof r.favour !== 'object') return 'run.favour';
  for (const god in r.favour) if (!num(r.favour[god])) return `run.favour.${god}`;
  if (!int(r.cycle, 1, INT32)) return 'run.cycle';
  const tf = tributeFault(r.tribute);
  if (tf) return tf;
  if (!int(r.misses, 0, REPLAY_MAX)) return 'run.misses';
  if (!int(r.tutorialBeat, 0, REPLAY_MAX)) return 'run.tutorialBeat';
  if (!int(r.hearts, 0, INT32) || typeof r.deathCause !== 'string') return 'run.hearts';
  if (!num(r.craftProgress)) return 'run.craftProgress';
  if (given(r.craftRecipe) && typeof r.craftRecipe !== 'string') return 'run.craftRecipe';
  if (!num(r.brandLeft) || !num(r.deepest)) return 'run.deepest';
  if (given(r.offer) && (typeof r.offer.tier !== 'string' || !num(r.offer.pool)
      || (given(r.offer.god) && typeof r.offer.god !== 'string')
      || (given(r.offer.ids) && !arrOf(r.offer.ids, id => typeof id === 'string'))))
    return 'run.offer';
  if (given(r.arrival) && (!num(r.arrival.x) || !num(r.arrival.y))) return 'run.arrival';
  return null;
}

function playerFault(q) {
  if (!q || typeof q !== 'object') return 'player';
  if (given(q.band) && !cfgOf(q.band)) return 'player.band';
  for (const k of ['x', 'y', 'vx', 'vy', 'coyote', 'fallFrom', 'face',
                   'walkPhase', 'landFlash', 'hurtFlash'])
    if (!num(q[k])) return `player.${k}`;
  for (const k of ['onGround', 'onLadder', 'digging'])
    if (typeof q[k] !== 'boolean') return `player.${k}`;
  return null;
}

function rowsFault(p) {
  if (!Array.isArray(p.growth)) return 'growth';
  for (let i = 0; i < p.growth.length; i++) {
    const g = p.growth[i], cfg = cfgOf(g && g.band);
    if (!cfg || !int(g.tx, 0, cfg.tw - 1) || !int(g.ty, 0, cfg.th - 1) || !num(g.secs))
      return `growth[${i}]`;
  }
  if (!Array.isArray(p.items)) return 'items';
  for (let i = 0; i < p.items.length; i++) {
    const it = p.items[i];
    if (!pair(it) || !cfgOf(it.band)) return `items[${i}]`;
    if (!num(it.x) || !num(it.y) || !num(it.vx) || !num(it.vy)) return `items[${i}]`;
  }
  if (!Array.isArray(p.machines)) return 'machines';
  for (let i = 0; i < p.machines.length; i++) {
    const m = p.machines[i], cfg = cfgOf(m && m.band);
    if (!cfg || M[m.id] === undefined) return `machines[${i}]`;
    if (!int(m.tx, 0, cfg.tw - 1) || !int(m.ty, 0, cfg.th - 1)) return `machines[${i}].tx`;
    if (!m.buf || typeof m.buf !== 'object') return `machines[${i}].buf`;
    for (const k in m.buf) if (!bufKey(k) || !num(m.buf[k])) return `machines[${i}].buf.${k}`;
    if (!num(m.prog) || !num(m.fire) || !num(m.torque) || !num(m.turn))
      return `machines[${i}].prog`;
    /* `made` is the lifetime total and `charges` the unspent part of it. */
    if (!int(m.made, 0, INT32) || !int(m.charges, 0, m.made)) return `machines[${i}].charges`;
  }
  if (!Array.isArray(p.segments)) return 'segments';
  for (let i = 0; i < p.segments.length; i++) {
    const g = p.segments[i];
    if (!g || !int(g.a, 0, p.machines.length - 1) || !int(g.b, 0, p.machines.length - 1))
      return `segments[${i}]`;
    if (!num(g.u) || !num(g.spin) || !num(g.load)) return `segments[${i}]`;
    if (!arrOf(g.cars, num)) return `segments[${i}].cars`;
  }
  if (!Array.isArray(p.boons)) return 'boons';
  for (let i = 0; i < p.boons.length; i++)
    if (!p.boons[i] || !BOON[p.boons[i].id] || !num(p.boons[i].left)) return `boons[${i}]`;
  return null;
}

function bodyFault(p) {
  if (!headerOk(p)) return 'header';
  if (!(p.cursor === null || int(p.cursor, -INT32, INT32 - 1))) return 'cursor';
  if (!Array.isArray(p.bands) || p.bands.length !== BANDS.length) return 'bands';
  for (let i = 0; i < BANDS.length; i++) {
    const f = bandFault(p.bands[i], BANDS[i]);
    if (f) return `bands[${i}].${f}`;
  }
  return runFault(p.run) || playerFault(p.player) || rowsFault(p);
}

/* The slot's header, classified: 'ok' means this build wrote it, 'stale' that
   another build did, 'none' that there is nothing there or that storage is
   unreadable. Reads and parses the ~58-byte header key only. */
export function slotState() {
  const h = parse(read(HEAD));
  return h === null ? 'none' : headerOk(h) ? 'ok' : 'stale';
}

/* "A complete body was written under this build" — a claim only `load()` can
   test, and a `load()` that finds it false takes the header away. */
export function hasSave() {
  return slotState() === 'ok';
}

export function clearSave() {
  dropKey(HEAD);
  dropKey(BODY);
}

/* Order matters within a band: `tilew.setByte` clears the dig ledger and plants
   the growth ledger for the coordinate it writes, so both ledgers are restored
   after every tile edit rather than before. */

function applyBand(b, row) {
  for (let k = 0; k < row.edits.length; k += 3)
    tilew.setByte(b, row.edits[k], row.edits[k + 1], row.edits[k + 2]);
  for (let k = 0; k < row.work.length; k += 3)
    digw.add(b, row.work[k], row.work[k + 1], row.work[k + 2]);
  for (let ty = 0; ty < b.th; ty++) for (let tx = 0; tx < b.tw; tx++) {
    const i = idx(b, tx, ty);
    if (row.bits[i >> 3] & (1 << (i & 7))) worldw.reveal(b, tx, ty);
  }
}

/* `run` has no whole-record setter, so each field goes back through the writer
   that owns it. `mainSlots`, `maxHearts` and `known` are reproduced by
   `write.reset` rather than stored, since no writer can set them. */
function applyRun(r) {
  /* Before `tick`, so `arrival.t` lands at 0 and a placement from earlier in
     the run reads as finished rather than replaying its rise. */
  if (r.arrival) runw.arrival(r.arrival.x, r.arrival.y);
  runw.tick(r.t);

  for (let i = 0; i < r.inv.length && i < run.inv.length; i++) {
    const s = r.inv[i];
    if (!s) continue;
    /* `write.collect` picks the slot by its own fill order, so the stack is
       collected and then swapped into the slot it was saved in. Working
       upward, `collect` cannot have taken a slot below `i`. */
    if (!runw.collect(s.sub, s.form, s.n)) continue;
    const at = run.inv.findIndex(x => x && x.sub === s.sub && x.form === s.form);
    if (at !== i) runw.moveSlot(at, i);
  }

  for (const id of r.granted) runw.grant(id);
  for (const id of r.charted) runw.chart(id);
  for (const god in r.favour) runw.favour(god, r.favour[god]);
  for (let i = 0; i < r.equipped.length; i++)
    if (given(r.equipped[i])) runw.equip(i, r.equipped[i]);

  runw.cycle(r.cycle);
  runw.tribute(r.tribute);
  for (let i = 0; i < r.misses; i++) runw.miss();
  for (let i = 0; i < r.tutorialBeat; i++) runw.advanceBeat();
  runw.craft(r.craftProgress, r.craftRecipe);
  runw.brand(r.brandLeft);
  runw.deepest(r.deepest);
  if (r.won) runw.win();
  if (r.awarded) runw.award(r.awarded);
  if (r.offer) runw.offer(r.offer.tier, r.offer.god, r.offer.ids, r.offer.pool);

  /* `write.hurt` is the only writer of `hearts`, and sets `dead` and
     `deathCause` too, so a saved 0 restores the death with it. */
  if (r.hearts < run.hearts) runw.hurt(run.hearts - r.hearts, r.deathCause);
}

function applyPlayer(p) {
  const b = bandOf(p.band);
  if (b) playerw.band(b);
  playerw.move(p.x, p.y);
  playerw.vel(p.vx, p.vy);
  for (const k of ['onGround', 'onLadder', 'coyote', 'fallFrom', 'face',
                   'walkPhase', 'landFlash', 'hurtFlash', 'digging'])
    playerw.set(k, p[k]);
}

function applyMachines(rows) {
  const out = [];
  for (const row of rows) {
    const m = machw.place(bandOf(row.band), M[row.id], row.tx, row.ty);
    for (const k in row.buf) {
      const { sub, form } = parseKey(k);
      machw.take(m, sub, form, row.buf[k]);
    }
    machw.prog(m, row.prog);
    /* `charge` raises `charges` and `made` together and `spendCharge` only
       lowers `charges`, so the pair is restored by adding the lifetime total
       and spending the difference back down. */
    machw.charge(m, row.made);
    machw.spendCharge(m, row.made - row.charges);
    machw.fire(m, row.fire);
    machw.running(m, row.running);
    machw.torque(m, row.torque);
    machw.turn(m, row.turn);
    out.push(m);
  }
  return out;
}

/* Why the last `load()` refused, or null when it succeeded. An object rather
   than an exported scalar, because module bindings are read-only for
   importers. */
export const loadError = { reason: null };

const refuse = why => { loadError.reason = why; return false; };

/* Start a fresh run from the stored seed and replay the stored edits on top. A
   refusal names its reason on `loadError` and either touches nothing or leaves
   a clean run of the stored seed; `newRun(seed)` is called here, not outside. */
export function load(newRun) {
  const head = parse(read(HEAD));
  if (!head) return refuse('NO SAVE');
  if (!headerOk(head)) return refuse('STALE SAVE');

  /* The header promises a complete body, so a missing, unparseable or
     malformed one is a torn slot and the header goes with it. The body's bytes
     stay for a post-mortem until the next `save()`. */
  const p = parse(read(BODY));
  const f = p === null ? 'no body'
    : p.seed !== head.seed ? 'seed disagrees with the header'
    : bodyFault(p);
  if (f) { dropKey(HEAD); return refuse(`CORRUPT SAVE: ${f}`); }

  newRun(p.seed);

  /* The caller's half of the contract, checked rather than assumed: a `newRun`
     that built another world would fail the `gen` check below for an unrelated
     reason. A wrong seed is a programming error, so the save is kept. */
  if (run.seed !== p.seed || bands.length !== p.bands.length) {
    console.warn(`save: load(newRun) must generate the seed it is handed (${p.seed}); the slot was kept`);
    return refuse('WRONG SEED');
  }

  /* The generator check, which needs the world that now exists. A mismatch
     means the ground moved under the stored coordinates, so the save goes and
     the player keeps a clean run of the same seed. */
  for (let i = 0; i < bands.length; i++) {
    if (fnvBytes(bands[i].mat) === p.bands[i].gen) continue;
    clearSave();
    return refuse('WORLD MOVED');
  }

  for (let i = 0; i < bands.length; i++) applyBand(bands[i], p.bands[i]);

  /* After every tile edit, since a rooting tile plants a zero-second entry as
     it is written. `plant` then `add` restores the saved total exactly. */
  for (const g of p.growth) {
    const b = bandOf(g.band);
    groww.plant(b, g.tx, g.ty);
    groww.add(b, g.tx, g.ty, g.secs);
  }

  /* `newRun` plants the starting pick and the stored list already says whether
     it is still lying there, so clearing first makes this an assignment rather
     than a merge. The machine, segment and boon lists start empty. */
  itemw.clear();
  for (const it of p.items)
    itemw.spawn(bandOf(it.band), it.x, it.y, it.sub, it.form, it.vx, it.vy);
  itemw.reindex();

  const placed = applyMachines(p.machines);
  for (const s of p.segments) {
    const seg = segw.link(placed[s.a], placed[s.b]);
    segw.spin(seg, s.u, s.spin);
    for (const phase of s.cars) segw.attach(seg, phase);
    segw.load(seg, s.load);
  }

  /* `model/mods.js` is not restored: `rules/trinkets.js` and `rules/boons.js`
     rebuild their rows every step off `run.equipped` and `boons.active`. */
  for (const a of p.boons) boonw.grant(a.id, a.left);

  applyRun(p.run);
  applyPlayer(p.player);

  /* Last, so nothing above can leave the RNG stream anywhere but where the
     save found it. */
  if (p.cursor !== null) seedRng(p.cursor);
  loadError.reason = null;
  return true;
}
