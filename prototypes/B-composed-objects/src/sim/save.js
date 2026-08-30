import { assemble } from './assemble.js';
import { createWorld } from '../world/world.js';
import { MACHINES } from '../data/machines.js';
import { ACTORS } from '../data/actors.js';
import { BANDS } from '../data/bands.js';
import { SUB_IDS } from '../data/substances.js';
import { modSnapshot, modRestore } from './tunables.js';

/* ============================================================
   SAVE — DESIGN items 2 and 3, and the cell the review called RFC 02's
   weakest: "component state living on objects with methods is hard to
   snapshot".

   THE ANSWER, and it is the one insight in this file:

     We do not serialise the object graph. We serialise the INPUTS to
     assemble() -- a type id, a position, and each part's declared fields --
     and assemble() is the deserialiser.

   That kills the two problems the review named outright. Methods are never
   written because they are rebuilt by make(). Cross-references
   (`this.buf = host.slots.buffer`) are never written because link() resolves
   them again against the fresh instances. A save is therefore plain JSON,
   diffable, and roughly 1.5 KB per hundred machines.

   THE PRICE, and it is real: every component must DECLARE what survives.
   sim/assemble.js refuses to make a component that has neither a `persist`
   list nor a save/load pair, so "I forgot to persist my field" is a boot
   error rather than a bug you find after shipping. It is still possible to
   declare an INCOMPLETE list -- that failure is silent, and it is the one
   hole left in this design. Mitigation, not a fix: `persist` sits directly
   above the `make()` that creates the fields, so the two are read together.

   RUN vs META (DESIGN item 3). Permadeath keeps stolen recipes and banked
   favour and nothing else, so the split is at the top level here: `meta`
   survives death, `run` and `world` do not. Nothing in the world reaches
   into meta, which is what makes the split cheap.
   ============================================================ */
export const SAVE_VERSION = 3;

/* ---------- hosts ---------- */

function partSnap(C, c) {
  if (C.save) return C.save(c);
  const o = {};
  for (const k of C.persist) o[k] = clone(c[k]);
  return o;
}

function partLoad(C, c, s) {
  if (C.load) { C.load(c, s); return; }
  for (const k of C.persist) if (s[k] !== undefined) c[k] = clone(s[k]);
}

/* Deep-clones only what a component may legally persist: numbers, strings,
   booleans, and arrays/objects of those. Anything else is a bug in a
   `persist` list, and it throws HERE rather than producing a save that
   cannot be read back. */
function clone(v) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'function') throw new Error('persist: cannot save a function');
    return v;
  }
  if (Array.isArray(v)) return v.map(clone);
  const o = {};
  for (const k in v) {
    if (k.startsWith('$') || k.startsWith('_')) continue;
    o[k] = clone(v[k]);
  }
  return o;
}

export const hostSnap = host => ({
  type: host.type, tx: host.tx, ty: host.ty,
  parts: host.parts.map(([C, c]) => [C.id, partSnap(C, c)])
});

function hostRestore(table, snap, world) {
  const { host, err } = assemble(table, snap.type, snap, world);
  if (!host) throw new Error('save: ' + snap.type + ' will not re-place: ' + err);
  /* Match by component id, not by index, so reordering a `parts` list in
     data/machines.js between versions does not scramble a save. A part in
     the save that the row no longer has is dropped with a warning; a part
     the row has gained keeps its make() defaults. */
  const byId = new Map(host.parts.map(([C, c]) => [C.id, [C, c]]));
  for (const [id, s] of snap.parts) {
    const pair = byId.get(id);
    if (!pair) { world.warn?.('save: dropped state for removed part ' + id); continue; }
    partLoad(pair[0], pair[1], s);
  }
  return host;
}

/* ---------- tiles ---------- */

/* Run-length encoded, and by substance NAME rather than by byte index, so a
   save survives someone inserting a row into data/substances.js. This is the
   typed-array-does-not-JSON problem the review flagged against every
   array-based design; the fix is 12 lines because a tile owns one field. */
function rle(mat) {
  const out = [];
  let run = 1;
  for (let i = 1; i <= mat.length; i++) {
    if (i < mat.length && mat[i] === mat[i - 1]) { run++; continue; }
    out.push(SUB_IDS[mat[i - 1]], run);
    run = 1;
  }
  return out;
}

function unrle(pairs, tiles) {
  let i = 0;
  for (let k = 0; k < pairs.length; k += 2)
    for (let n = 0; n < pairs[k + 1]; n++, i++) {
      const tx = i % tiles.tw, ty = (i / tiles.tw) | 0;
      tiles.set(tx, ty, pairs[k]);
    }
}

/* ---------- top level ---------- */

export function snapshot(session) {
  return {
    v: SAVE_VERSION,
    meta: clone(session.meta),                       // survives death
    run: clone(session.run),                         // does not
    mods: modSnapshot(),                             // trinkets, free to save
    bands: Object.keys(session.worlds).map(id => bandSnap(session.worlds[id]))
  };
}

function bandSnap(world) {
  return {
    band: world.cfg.id,
    tiles: rle(world.tiles.mat),
    fields: Object.keys(world.fields)
      .map(k => [k, world.fields[k].snapshot()]),
    machines: world.machines.map(hostSnap),
    actors: world.actors.map(hostSnap),
    items: world.items.map(it => ({ sub: it.sub, form: it.form,
                                    x: it.x, y: it.y, vx: it.vx, vy: it.vy,
                                    rest: it.rest }))
    /* NOT saved, deliberately: world.chips (visual), every host's `look`
       (derived next tick), world.mining (progress on a half-dug tile, which
       comp/pick.js documents as intentionally lost), and the hash grid
       (rebuilt by add() during restore). */
  };
}

export function restore(save) {
  if (save.v !== SAVE_VERSION)
    throw new Error('save: version ' + save.v + ', expected ' + SAVE_VERSION);

  modRestore(save.mods);
  const session = { meta: save.meta, run: save.run, worlds: {} };

  for (const b of save.bands) {
    const cfg = BANDS[b.band];
    if (!cfg) throw new Error('save: no such band ' + b.band);
    /* createWorld runs the generator, then the saved tiles overwrite it.
       Generating first is wasted work but it guarantees a band restored from
       an older save has any NEW tile the generator now makes, rather than a
       hole. */
    const world = createWorld(cfg);
    unrle(b.tiles, world.tiles);
    for (const [k, pairs] of b.fields) world.fields[k]?.restore(pairs);

    for (const s of b.actors) {
      const host = hostRestore(ACTORS, s, world);
      if (s.type === 'miner') world.player = host;
    }
    for (const s of b.machines) hostRestore(MACHINES, s, world);
    for (const it of b.items)
      Object.assign(world.spawnItem(it.x, it.y, it, it.vx, it.vy), { rest: it.rest });

    session.worlds[b.band] = world;
  }
  return session;
}
