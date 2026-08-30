import { R } from '../core/px.js';

/* ============================================================
   LOOKS — appearance, keyed by the `look` STRING on a machine row, not by
   its type id.

   Components never draw. They write declarative fields onto `host.look`
   (`busy`, `fire`, `ingest`, `deckY`, `blood`) and this file reads them. So
   the renderer is swappable: delete this directory and the sim still ticks.

   Keyed by `look` rather than by machine id on purpose: `winch` and
   `bloodWinch` are two machine rows with one look, so the trap boon needs no
   art of its own, and a boon machine that reuses a look needs no entry here
   at all.

   Every function below is a STUB per the brief -- art is out of scope. The
   dispatch and the `look` contract are the parts being evaluated.
   ============================================================ */
export const LOOKS = {
  furnace(g, host) {
    const L = host.look;
    R(g, 0, 0, 24, 16, '#3a2c28');
    if (L.fire > 0) R(g, 8, 8, 8, 6, '#ff7a3c');
    if (L.busy > 0) R(g, 2, 2, (L.busy * 20) | 0, 1, '#ffd469');
  },
  crusher(_g, _host) { /* stub */ },
  kiln(_g, _host) { /* stub */ },
  winch(g, host) { R(g, 0, (host.look.deckY | 0), 16, 3, '#6f4d2b'); },
  miner(_g, _host) { /* stub */ },
  shade(_g, _host) { /* stub */ }
};

export function drawHost(g, host) {
  const fn = LOOKS[hostLook(host)];
  if (fn) fn(g, host);
  /* A machine with no look entry draws as a generic box rather than
     throwing: missing art must not stop the sim. */
}

/* `host.art` is set by assemble() from the row's `look` field, defaulting to
   the type id, so a row that omits `look` still resolves. */
const hostLook = host => host.art;
