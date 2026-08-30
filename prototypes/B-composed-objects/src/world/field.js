/* ============================================================
   FIELD — a per-tile scalar with an ACTIVE-CELL notion. The heat seam.

   Three arrays, one for values and two to answer "which cells are worth
   visiting":
     val   Float32Array   the scalar
     act   Int32Array     a ring of active cell indices
     in    Uint8Array     membership, so a cell is not queued twice

   `tick` visits only active cells. A cell whose change falls under epsilon
   leaves the set, so an idle region costs zero -- that is the whole reason
   the active set exists, and it is why a heat field over 49,000 cells is
   affordable next to the tile array.

   NO DIFFUSION HERE, per the brief. The seam is:
     - a machine emits with add()          -> comp/heatvent.js
     - a recipe gates on at()              -> comp/recipe.js `band`
     - a boon scales decay                 -> sim/tunables.js field.heat.decay
   DESIGN item 5's buoyancy is one kernel inside tick(): read the cell above,
   push a fraction upward, wake both. Item 6's water is a SECOND instance of
   this same object with a different kernel -- deliberately NOT built, because
   nothing consumes water yet and a component with no consumer is a defect.

   Fields draw as a per-frame overlay (render/ has an overlays stage), not by
   dirtying chunks, because a flowing field changes every frame and a chunk
   repaint is thousands of draw calls.
   ============================================================ */
export function createField(cfg, name) {
  const { tw, th } = cfg, n = tw * th;
  const val = new Float32Array(n);
  const inSet = new Uint8Array(n);
  let act = new Int32Array(1024), len = 0;

  const wake = i => {
    if (inSet[i]) return;
    if (len === act.length) { const b = new Int32Array(len * 2); b.set(act); act = b; }
    inSet[i] = 1; act[len++] = i;
  };

  return {
    name, tw, th, val,
    get active() { return len; },

    at(tx, ty) {
      return (tx < 0 || ty < 0 || tx >= tw || ty >= th) ? 0 : val[ty * tw + tx];
    },

    add(tx, ty, v) {
      if (tx < 0 || ty < 0 || tx >= tw || ty >= th) return;
      const i = ty * tw + tx;
      val[i] += v;
      wake(i);
    },

    /* Decay-and-deactivate only. Kernel arg is where diffusion would go. */
    tick(dt, decay) {
      let w = 0;
      for (let k = 0; k < len; k++) {
        const i = act[k];
        val[i] -= val[i] * decay * dt;
        if (val[i] < 0.01) { val[i] = 0; inSet[i] = 0; continue; }
        act[w++] = i;
      }
      len = w;
    },

    /* Serialised by sim/save.js. Only the active cells are written: a field
       is nearly all zeroes, so this is a few hundred numbers, not 49,000. */
    snapshot() {
      const out = [];
      for (let k = 0; k < len; k++) out.push(act[k], val[act[k]]);
      return out;
    },
    restore(pairs) {
      val.fill(0); inSet.fill(0); len = 0;
      for (let k = 0; k < pairs.length; k += 2) {
        val[pairs[k]] = pairs[k + 1];
        wake(pairs[k]);
      }
    }
  };
}
