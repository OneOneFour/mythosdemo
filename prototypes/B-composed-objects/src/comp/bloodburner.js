/* ============================================================
   BloodBurner — DESIGN item 12, the trap boon. A burner whose fuel is the
   player's own health.

   PROVIDES: heat          <-- the same slot comp/burner.js provides
   NEEDS:    -             <-- notably NOT buffer: it has no fuel store
   PERSISTS: lit
   TUNABLES: -

   THIS FILE IS THE WHOLE FEATURE. Compare it against comp/burner.js: same
   slot, same `hot()`, same `lit` countdown, different source. Then compare
   `bloodWinch` against `winch` in data/machines.js: three parts removed, one
   added.

   Nothing else in the codebase changed to support it:
     - comp/deck.js         calls slots.heat.hot(). Untouched.
     - comp/recipe.js       gates on slots.heat.hot(). Untouched.
     - sim/assemble.js      resolves by slot name. Untouched.
     - data/substances.js   health is NOT a substance. Untouched.
     - render/hud.js        hearts are still hearts, not an inventory row.

   The reason is that capability is keyed to a SLOT, not to a type or a
   recipe shape. `heat` names what a thing DOES, so a second way of doing it
   is a peer, not a subclass and not a special case.

   The honest seam: this component reaches across hosts to
   `world.player.slots.hearts`, which is the only cross-host reach in the
   set. It is legal (world is a tick argument) but it means a blood winch
   placed with no player -- a headless test, a replay -- must handle a
   missing player rather than assume one. It does, below, by staying cold.
   ============================================================ */
export const BloodBurner = {
  id: 'BloodBurner', provides: ['heat'], persist: ['lit'],

  make(p) {
    return {
      cost: p.hearts ?? 1, span: p.secs ?? 12, lit: 0,

      tick: function bloodBurnerTick(dt, host, world) {
        this.lit = Math.max(0, this.lit - dt);
        const hearts = world.player?.slots.hearts;
        if (this.lit <= 0 && hearts && hearts.spend(this.cost)) {
          this.lit = this.span;
          host.look.blood = 1;          // the renderer's cue; no draw call here
        }
        host.look.fire = this.lit > 0 ? Math.min(1, this.lit / this.span) : 0;
      },

      hot() { return this.lit > 0; }
    };
  }
};
