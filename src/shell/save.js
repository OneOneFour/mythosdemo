/* LAYER shell — THE SAVE SLOT. One `localStorage` slot, four functions, no
   listeners and no input. Imports every layer, as a `shell` device may.

   THE PAYLOAD IS THE SEED PLUS WHAT THE PLAYER CHANGED (wave 6 U2). A run is
   bit-reproducible from its seed (invariant 7), so the terrain is not stored.
   `load()` regenerates the world from the seed through `newRun()` and then
   replays the edits on top. Serialising the per-band `mat` arrays instead is
   ~1.3 MB raw and was rejected.

   A SAVE IS ALWAYS APPLIED ON TOP OF A CLEAN RUN. `load()` takes `newRun` and
   calls it itself, so there is no way to apply a payload to a dirty world and
   invariant 8 still holds with persistence in the game. `newRun` is an
   argument rather than an import so this module imports no other `shell`
   module, which keeps `shell/boot.js` and `shell/main.js` free to import this
   one without a cycle.

   FOUR THINGS ARE VERSIONED, AND THE LAST TWO COVER THE GENERATOR:

     v         the payload shape. A literal below.
     world     FNV-1a of `data/world.js#BANDS`, so a band dimension or a
               strata change invalidates every stored tile coordinate.
     content   FNV-1a of the substance, form and machine id lists, so the
               ordinals in the payload cannot come to mean another row.
     gen       FNV-1a of each band's freshly generated `mat`, recorded at save
               time and re-checked after `newRun()` at load time. This is what
               catches a rewritten `rules/generate.js` without asking that
               phase to remember to bump anything.

   `hasSave()` checks the first three, which are in a small header key and cost
   one short `JSON.parse`. `gen` can only be checked once a world exists, so
   `load()` checks it after `newRun()` and discards the save on a mismatch,
   leaving a clean run of the same seed rather than replayed edits over ground
   that moved.

   docs/SPEC.md section 27 holds the schema and the round-trip contract. */

import { rng, seedRng } from '../core/rng.js';
import { BOON } from '../data/boons.js';
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

const V = 1;
const BODY = 'mythos-factory/save';
const HEAD = 'mythos-factory/save-head';

/* ---- storage, which is allowed to fail ----
   `localStorage` throws in private-mode and sandboxed contexts rather than
   returning null, so every call goes through one of these three and a failure
   reads as "no save". CLAUDE.md's Conventions section records the decision to
   accept that breakage. */

const read = key => {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
};

const writeKey = (key, value) => {
  try { globalThis.localStorage.setItem(key, value); return true; } catch { return false; }
};

const dropKey = key => {
  try { globalThis.localStorage?.removeItem(key); } catch { /* nothing to undo */ }
};

/* ---- signatures ---- */

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

/* Both are computed once at import. The tables are frozen, so neither can
   change at runtime, and `hasSave()` is cheap enough for a menu to ask every
   frame only because of that. */
const WORLD_SIG = fnv(JSON.stringify(BANDS));

/* The three ORDINAL tables. A substance or form ordinal is an index, so a row
   inserted anywhere but the end silently re-points every stored pair, and
   `MACH`'s ids back the machine rows the payload names. Every other id in the
   payload is a string and is validated where a stale one would throw. */
const CONTENT_SIG = fnv(
  SUB.map(s => s.id).join(',') + '|' +
  FORM.map(f => f.id).join(',') + '|' +
  MACH.map(m => m.id).join(','));

/* ---- base64 over a bitset ----
   Fog of war is one bit per tile, which is 6.5 KB packed for the three shipped
   bands against 52 KB as the raw `Uint8Array`. Chunked, because
   `String.fromCharCode` takes its arguments on the stack. */

const CHUNK = 4096;

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK)
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return globalThis.btoa(s);
}

function fromB64(str) {
  const s = globalThis.atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/* ---- the baseline world, regenerated to be diffed against ----

   Nothing records which tiles the player changed, so the edit set is a diff
   against a fresh generate of the same seed. Measured at the three shipped
   bands (53,248 tiles), the regenerate costs 25 ms and reproduces the live
   `mat` exactly. Recording edits as they happen would need a hook in
   `model/tiles.js#write.setByte` and permanent bookkeeping; a diff cannot
   drift from the world it describes.

   TWO THINGS MUST NOT LEAK OUT OF THIS FUNCTION.

   The RNG cursor. `seedRng` replaces the stream, so the live cursor is held
   and put back in a `finally` — `rng.next` is a mulberry closure over its own
   counter, so restoring the reference restores the position. Without this a
   save would rewind the run's randomness to boot.

   The band ledgers. `generate` writes through `model/tiles.js#write.setByte`,
   which clears `model/mining.js` and plants into `model/growth.js` by a key
   that starts with the band ordinal. So a scratch band carries `ord + ORD_GAP`
   and cannot collide with a live band's entries. Everything else on the record
   is shared with the live band by spread, which is safe because `generate`
   writes `mat` and `ver` and nothing else.

   The modifier store is cleared for the same reason. `shell/boot.js#newRun`
   clears it before it generates, and `rules/generate.js` reads
   `eff('hollowOre')`, whose own `data/tuning.js` row already anticipates a god
   bending it. A baseline taken under live mods would differ from the one
   `newRun()` produces and the save would be refused at load for no good
   reason. `eff()` sums adds and multiplies muls, so re-adding the rows by
   source restores the same numbers. */

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

/* ---- capture ---- */

/* One traversal per band collects all three per-tile facts. `workAt` is asked
   per tile rather than walked as a Map because `model/mining.js` keys its
   ledger by a packed ordinal-plus-index and exports no inverse — a second
   implementation of that packing here would be wrong the first time a band's
   `tw` changed. Costs one `Map.get` per tile, which is 3 ms at the shipped
   band sizes. */
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

/* Machine records, in `machines` order, which is placement order. A segment
   names its two hubs by index into this array, so the order is part of the
   payload rather than incidental to it. */
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
    t: s.t, dir: s.dir, load: s.load
  }));
}

/* `rest` and `age` are deliberately absent. Both are re-established by the
   first `rules/items.js` step — support is a tile query re-asked every frame,
   and `age` only gates the pickup magnet delay. `mod` is null on every item
   in the game today. */
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

/* Write the run to one slot. Returns false when storage refuses, which leaves
   whatever was already stored intact — the body is written before the header,
   so a failed write never leaves a header pointing at a half-written body. */
export function save() {
  if (!bands.length) return false;
  const seed = run.seed;
  const base = baseline(seed);
  const head = { v: V, world: WORLD_SIG, content: CONTENT_SIG, seed };
  const body = {
    ...head,
    run: { ...run },
    player: playerRow(),
    bands: bands.map((b, i) => bandRow(b, base[i])),
    growth: [...planted().values()].map(e => ({
      band: bands[e.ord]?.id ?? null, tx: e.tx, ty: e.ty, secs: e.secs
    })),
    items: itemRows(),
    machines: machineRows(),
    segments: segmentRows(),
    boons: boons.active.map(a => ({ id: a.id, left: a.left }))
  };
  if (!writeKey(BODY, JSON.stringify(body))) return false;
  if (!writeKey(HEAD, JSON.stringify(head))) { dropKey(BODY); return false; }
  return true;
}

/* ---- validation ---- */

function parse(raw) {
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/* The header's own three claims. Anything unrecognised is not a save. */
function headerOk(h) {
  return !!h && h.v === V && h.world === WORLD_SIG && h.content === CONTENT_SIG
      && Number.isFinite(h.seed);
}

/* What the body must carry before `newRun()` is allowed to run. Every named id
   is resolved here, so a payload naming content that no longer exists is
   refused rather than applied and then thrown on. */
function bodyOk(p) {
  if (!headerOk(p)) return false;
  if (!p.run || !Array.isArray(p.run.inv) || !Array.isArray(p.run.granted)) return false;
  if (!Array.isArray(p.bands) || p.bands.length !== BANDS.length) return false;
  for (let i = 0; i < p.bands.length; i++) {
    const row = p.bands[i];
    if (!row || row.id !== BANDS[i].id) return false;
    if (!Array.isArray(row.edits) || !Array.isArray(row.work)) return false;
    if (typeof row.seen !== 'string' || !Number.isFinite(row.gen)) return false;
  }
  const mach = p.machines || [];
  for (const m of mach)
    if (M[m.id] === undefined || !BANDS.some(b => b.id === m.band)) return false;
  for (const s of p.segments || []) if (!mach[s.a] || !mach[s.b]) return false;
  for (const a of p.boons || []) if (!BOON[a.id]) return false;
  return true;
}

/* Cheap enough for a menu to ask every frame — it reads and parses the header
   key only, which is about 80 bytes, and never touches the body. */
export function hasSave() {
  return headerOk(parse(read(HEAD)));
}

export function clearSave() {
  dropKey(HEAD);
  dropKey(BODY);
}

/* ---- restore ----

   ORDER IS LOAD-BEARING WITHIN A BAND. `tilew.setByte` clears the dig ledger
   and plants the growth ledger for the coordinate it writes, so both ledgers
   are restored after every tile edit rather than before. */

function applyBand(b, row) {
  for (let k = 0; k < row.edits.length; k += 3)
    tilew.setByte(b, row.edits[k], row.edits[k + 1], row.edits[k + 2]);
  for (let k = 0; k < row.work.length; k += 3)
    digw.add(b, row.work[k], row.work[k + 1], row.work[k + 2]);
  const bits = fromB64(row.seen);
  for (let ty = 0; ty < b.th; ty++) for (let tx = 0; tx < b.tw; tx++) {
    const i = idx(b, tx, ty);
    if (bits[i >> 3] & (1 << (i & 7))) worldw.reveal(b, tx, ty);
  }
}

/* `run` has no whole-record setter, so each field goes back through the writer
   that owns it. Three fields are reproduced rather than stored, because no
   writer can set them and `write.reset` already produces the same value —
   `mainSlots` is rounded from `eff('invSlots')`, `maxHearts` has no writer at
   all, and `known` is seeded from every `HAND_RECIPES` id with nothing in
   `src/` adding to it. See docs/SPEC.md section 27. */
function applyRun(r) {
  /* Before `tick`, so `arrival.t` lands at 0 and a director placement from
     earlier in the run reads as long finished rather than replaying its rise
     and its shaft of light. */
  if (r.arrival) runw.arrival(r.arrival.x, r.arrival.y);
  runw.tick(r.t);

  for (let i = 0; i < r.inv.length && i < run.inv.length; i++) {
    const s = r.inv[i];
    if (!s) continue;
    /* `write.collect` picks the slot by its own fill order, so the stack is
       collected and then swapped into the slot it was saved in. Working
       upward, slots below `i` already hold their final pair, so `collect`
       cannot have taken one of them and the swap can only displace an empty
       slot or one still to be filled. */
    if (!runw.collect(s.sub, s.form, s.n)) continue;
    const at = run.inv.findIndex(x => x && x.sub === s.sub && x.form === s.form);
    if (at !== i) runw.moveSlot(at, i);
  }

  for (const id of r.granted) runw.grant(id);
  for (const id of r.charted || []) runw.chart(id);
  for (const god in r.favour || {}) runw.favour(god, r.favour[god]);
  for (let i = 0; i < (r.equipped || []).length; i++)
    if (r.equipped[i] !== null && r.equipped[i] !== undefined) runw.equip(i, r.equipped[i]);

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

  /* `write.hurt` is the only writer of `hearts`, and it is what sets `dead`
     and `deathCause` too. A saved 0 therefore restores the death with it. */
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
    const b = bandOf(row.band);
    if (!b) { out.push(null); continue; }
    const m = machw.place(b, M[row.id], row.tx, row.ty);
    for (const k in row.buf) {
      const { sub, form } = parseKey(k);
      machw.take(m, sub, form, row.buf[k]);
    }
    machw.prog(m, row.prog);
    /* `charge` raises `charges` and `made` together and `spendCharge` only
       lowers `charges`, so the pair is restored by adding the lifetime total
       and then spending the difference back down. */
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

/* Start a fresh run from the stored seed and replay the stored edits on top.
   Returns false and leaves a clean run of that seed when the payload is
   unusable; returns false and touches nothing at all when there is no payload.

   `newRun(seed)` is called HERE rather than by the caller, so a payload can
   never be applied to a world it did not generate. Pass
   `shell/boot.js#newRun`.

   The camera is not restored. `shell/main.js` owns the follow and the clamp,
   and a caller that boots straight into a loaded run should re-clamp after
   this returns. */
export function load(newRun) {
  /* The header first, so `hasSave()` and `load()` can never disagree about
     whether a slot is loadable. Both keys carry the same three claims and a
     disagreement between them means something outside this module wrote one
     of them. */
  if (!hasSave()) return false;
  const p = parse(read(BODY));
  if (!bodyOk(p)) return false;

  newRun(p.seed);

  /* The generator check, which can only happen now that a world exists. A
     mismatch means the ground moved under the stored coordinates, so the save
     goes rather than being replayed onto terrain it does not describe. The
     player keeps a clean run of the same seed. */
  for (let i = 0; i < bands.length; i++) {
    if (fnvBytes(bands[i].mat) === p.bands[i].gen) continue;
    clearSave();
    return false;
  }

  for (let i = 0; i < bands.length; i++) applyBand(bands[i], p.bands[i]);

  /* After every tile edit, since a rooting tile plants a zero-second entry as
     it is written. `plant` then `add` restores the saved total exactly. */
  for (const g of p.growth || []) {
    const b = bandOf(g.band);
    if (!b) continue;
    groww.plant(b, g.tx, g.ty);
    groww.add(b, g.tx, g.ty, g.secs);
  }

  /* `newRun` plants the starting pick on the ground, and the stored list
     already says whether it is still lying there. Clearing first makes the
     restore an assignment rather than a merge that would duplicate it.
     `newRun` leaves the machine, segment and boon lists empty, so those need
     no equivalent. */
  itemw.clear();
  for (const it of p.items || []) {
    const b = bandOf(it.band);
    if (b) itemw.spawn(b, it.x, it.y, it.sub, it.form, it.vx, it.vy);
  }
  itemw.reindex();

  const placed = applyMachines(p.machines || []);
  for (const s of p.segments || []) {
    const a = placed[s.a], b = placed[s.b];
    if (!a || !b) continue;
    const seg = segw.link(a, b);
    segw.carrier(seg, s.t, s.dir);
    segw.load(seg, s.load);
  }

  /* `model/mods.js` is NOT restored. `rules/trinkets.js` and `rules/boons.js`
     both rebuild their rows from scratch every step off `run.equipped` and
     `boons.active`, so restoring the rows here would double them for one
     frame and then be corrected anyway. */
  for (const a of p.boons || []) boonw.grant(a.id, a.left);

  applyRun(p.run);
  applyPlayer(p.player);
  return true;
}
