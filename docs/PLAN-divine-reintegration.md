# Divine reintegration after the industrial overhaul

How the four modifier tiers and the god/favour/tribute framing come back after
`docs/PLAN-resource-overhaul.md` lands. Divine content is out of scope for the
overhaul itself; this records what must not be painted into a corner while it
happens.

---

## 0. The one structural fact everything follows from

The divine system is four data tables and four tier-generic rules modules. The
rules modules know nothing about the economy:

- `rules/boons.js` ticks durations and rebuilds `'boon:'+id` rows in
  `model/mods.js`. It never names a tunable.
- `rules/trinkets.js` syncs `run.equipped ∩ run.inv` into mods. Never names a
  tunable.
- `rules/grants.js` appends machine ids to `run.granted`. Never names a
  tunable.
- `rules/miracles.js` edits the tile grid and grants a boon. Names `S[e.sub]`
  only.
- `rules/draft.js` and `rules/cycles.js` are entirely id-driven.

Economy knowledge lives **only** in `data/boons.js`, `data/trinkets.js`,
`data/miracles.js`, `data/grants.js` and `data/cycles.js` — about 140 lines.
So re-entry is: rewrite ~110 lines of content, add ~8 rows to
`data/tuning.js`, touch zero rules files — **provided the overhaul puts every
new quantity in `data/tuning.js`.** If it does not, re-entry becomes one edit
per rules module that reads a raw literal, and that is the whole risk.

`model/mods.js#eff(id, scope)` throws on an unknown tunable, and
`tools/layers.mjs` forbids anyone but `model/mods.js` importing
`data/tuning.js`. **A quantity that is not a `data/tuning.js` row is a
quantity no god can ever touch.**

---

## 1. Which tiers earn their keep

**Miracles — strongest keeper.** The new world is spatial: gravel at 10% from
plain stone, rich hard deposits that double as structural blockers, haul
distance as a cost. A one-shot terrain edit is the only divine tier that
changes the *inputs* to those costs rather than the rate at which you pay
them. `chasm`'s collapse becomes the answer to a blocker you cannot yet
tool-tier through. `lodestone`'s transmute closes a real loop: `stone_block`
makes gravel into a solid tile, and transmute only ever converts already-solid
tiles — so spoil becomes iron, bounded by phials held.

**Boons — keeper, and the best fit.** Torque, fuel energy and haul are
standing budgets. A timed change to a budget creates a decision a permanent
change cannot: spend the window. `rules/boons.js` recomputes the active list
from scratch every substep, so `conflictsWith` suppress/invert costs nothing
and gets more interesting when the budgets are mechanical and auditable.

**Trinkets — keep the mechanism, delete the content.** A fixed-length
selection over held items, capped by `eff('trinketSlots')`, self-healing when
the item leaves the pockets. `view/ui/mainPanel.js` already draws the slots
and an `explain`-derived delta list on the Character screen the overhaul is
building. But two of three shipped rows are flat multipliers — `bellows`
`rate.furnace ×1.25`, `owl` `sightRadius ×1.5` — exactly what the brief bans.
Only `girdle` earns its keep, because it is a stated trade priced to break
even (`burden ×1.25`, `climb ×0.8`). That is the template.

**Machine grants — merge and delete the tier.** Two rows offering 2-of-2, with
`canReroll` refusing a second look; a one-card tier wearing a three-card UI.
And the overhaul *is* a tech tree — a god handing you an auto-miner competes
head-on with "you earned it with 2 iron gear and a copper ingot," and the
industrial version is the better game. Keep the mechanism: `run.granted` +
`isKnown` → `canPlace` is exactly the recipe-unlock switch the winch tier
needs. Delete `GRANTS`, `grant(grantId)`, `draftable()` and `'grant'` as a
value of `cycle.reward.draft`.

Boons and trinkets differ only in lifetime. Keep both only under the rule:
**a boon is a window on a budget; a trinket is a permanent trade that costs
something.**

---

## 2. Reaching the new quantities

Every modifier passes `{key, mul, add}` → `mods.rows` → `eff(id, scope)` →
`TUNE[id]`, applied as `(base + Σadd) × Πmul`. Scope resolves only to a
substance or a machine id.

Three live examples of wrapping a `data/machines.js` literal in a
`kind:'scale'` row: `hub.reach × eff('segReach')`,
`crank.torque × eff('crankTorque')`, `gear.loss × eff('torqueLoss')`.

| quantity | exists? | id | kind | scope |
|---|---|---|---|---|
| deposit richness | yes | `richness` | scale | substance |
| gravel drop rate | yes | `dropChance` | scale | substance |
| hard deposit tool gate | yes | `toolTier` | scale | substance |
| belt drag speed | yes | `beltSpeed` | value | — |
| carrier ascent/descent | yes | `segUp`/`segDown` | value | — |
| drive per talent aboard | yes | `segLoad` | value | — |
| winch torque | rename | `driveTorque` | scale | machine |
| rotational speed | **no** | `spinRate` | scale | machine |
| fuel energy per unit | **no** | `fuelEnergy` | scale | substance |
| device burn efficiency | **no** | `burnEff` | scale | machine |
| belt slope limit | **no** | `beltMaxSlope` | **value** | — |
| bucket capacity | **no** | `bucketCap` | scale | machine |

`beltMaxSlope` must be a value, not a scale: because `eff` is
`(base + Σadd) × Πmul`, an `add` on a scale row whose base is 1.0 means
"+25% of a literal elsewhere", which is unreadable for an angle. As a value in
the unit the code already uses — `seg.slope` is `|dy| / len`, the sine —
`base: 0.5` makes `add: 0.24` mean "belts now run to ~46°", legible on a card.

Example rows, all of which validate against content assertion 8 the day the
tunables land:

```js
{ key:'fuelEnergy.coal',   mul:1.4  }
{ key:'burnEff.kiln',      mul:1.6  }
{ key:'spinRate.transformer', mul:1.5 }
{ key:'beltMaxSlope',      add:0.24 }
{ key:'driveTorque.winch', mul:2.0  }
{ key:'bucketCap.bucket',  mul:2.0  }
{ key:'richness.iron',     mul:1.5  }
{ key:'dropChance.stone',  mul:2.0  }
```

---

## 3. The pitch: ten items

Three budgets: **torque** (a shared, divisible component scalar), **fuel
energy** (a stock you haul down), and **your own standing presence at the
winch** — which `docs/DESIGN.md` prices as the one thing that cannot be
stockpiled or bought. The rule: a god changes the *shape* of a budget and pays
for it out of another. Never the size of one.

1. **BOON — THE LAME GOD'S SHIFT** (hephaestus, 45 s).
   `[{ key:'driveTorque', mul:2.0 }, { key:'segUp', mul:0.5 }]`
   Torque doubles, carriers halve. Break-even empty, a strict gain past ~20 T.
   The girdle's trick applied to the drivetrain.

2. **BOON — THE NORTH WIND** (trap, 30 s).
   `[{ key:'burnEff', mul:2.2 }, { key:'fuelEnergy.coal', mul:0.4 }]`
   Secretly a *timber* boon. If your fuel line has converted to coal you are
   net worse off. The trap is auditable, which is the only kind an industrial
   economy should ship.

3. **TRINKET — HARNESS OF ATLAS.**
   `[{ key:'bucketCap', mul:2.0 }, { key:'segLoad', mul:1.6 }]`
   Converts a logistics problem into a drivetrain problem. Needs zero engine
   work — `segLoad` is already read every substep.

4. **TRINKET — PLUMB OF ATHENA.**
   `[{ key:'beltMaxSlope', add:0.24 }, { key:'beltSpeed', mul:0.6 }]`
   Belts to ~46° at 60% speed. A steeper belt deletes a whole winch stage; you
   pay in latency.

5. **TRINKET — THE COUNTERWEIGHT** (hades).
   `[{ key:'segDown', mul:1.8 }, { key:'segUp', mul:0.85 }]`
   Pure gain on a spoil chute, pure loss on an ore chain, and you have three
   slots. Breaks `segUp == segDown` in the safe direction — stating the
   premise harder rather than eroding it.

6. **MIRACLE — THE SHAKER** (hades). Keep `collapse` r1, retargeted at the
   rich hard deposits that block tunnels. One phial: open a shaft now, or save
   it for the blocker between the iron seam and the kiln?

7. **MIRACLE — THE SEAM** (hephaestus). `transmute` r1 to `iron`. The largest
   single windfall in the game with the swings still to pay, and it prices
   your spoil stream against your phial count.

8. **MIRACLE — THE UNATTENDED HAND** (hades, trap). A boon carrying
   `{ key:'ghostTorque', add:1.5 }`, read in `rules/drive.js` as an
   unconditional component supply term. For 40 seconds a drivetrain turns with
   nobody at the winch — the one thing `docs/DESIGN.md` says cannot be bought,
   so the most valuable gift in the game. The terms: it keeps turning whether
   you are ready or not, and an unattended overloaded carrier stalls, reverses
   and puts your cargo back at the bottom.

9. **BOON — THE TIDE** (poseidon, 60 s).
   `[{ key:'hard', mul:0.85 }, { key:'burnEff', mul:0.5 }]`
   A mining window bought with your smelting window. It has a measurable cost
   now that fuel has energy.

10. **GRANT REPLACEMENT — A DIVINE VARIANT, not a tier.** A god gives a
    `variantOf` of a machine you already know with one number scoped —
    `kiln_divine` with `scoped: { kiln_divine: 2.0 }` is the existing worked
    example. A strictly better kiln whose 15-gravel bill you still pay.

---

## 4. Delete rather than preserve

- **`GRANTS` as a draft tier.** Keep `rules/grants.js#award` and
  `run.granted`. `STARTING_MACHINES` lives in `data/grants.js` and must move
  if the file goes — and its comment claiming `rules/placement.js` is its only
  reader is wrong; the importers are `model/run.js` and `tools/content.mjs`.

- **`ares-frenzy` as shipped.** The trap is arithmetic on `pickPower`, which
  the player cannot audit, and the overhaul demotes pick-swinging to a
  feedstock source. Replace with a trap denominated in fuel or torque.

- **`athena-focus` and `bellows`.** Flat percentage buffs, precisely what the
  brief bans. `bellows`'s slot must be *refilled*, not just emptied:
  `data/drops.js#tribute-bellows` is `chance:1` and is how the beat sheet
  teaches the trinket tier exists. Put a trade in the same slot.

- **`hades-passage`** (`climb ×1.3`). CLAUDE.md: anything that makes ascent
  cheap is a bug unless the change is explicitly about that trade. A costless
  climb buff handed out free as a miracle side-effect is exactly that.

- **`kiln_divine`'s lint exemption, not the row.** The overhaul makes a basic
  kiln real, so either give the divine kiln a substance row and a recipe and
  make it item 10, or delete it. An unbuildable machine plus a standing lint
  exemption protecting it is the worst of the three.

- **`ares` as a god.** A god should own a budget: Hephaestus fuel and heat,
  Poseidon water and rock, Athena geometry and routing, Hades mass and
  descent. Ares owns nothing mechanical. Delete, or repurpose as the god of
  **overload** — torque past the rated limit, with breakage as the cost.

- **Keep `conflictsWith`.** Cheapest interesting thing in the whole system,
  and suppress/invert on a fuel-energy key is a calculation the player can
  actually perform.

---

## 5. Re-entry, and the corners the overhaul must not paint into

### Re-entry, in order

1. Retarget mod keys in `data/boons.js`, `data/trinkets.js`,
   `data/miracles.js`. Zero rules changes if the tunables exist.
2. Repoint `data/cycles.js` demands at the new pairs and drop
   `draft:'grant'`. `rules/cycles.js` needs no change — everything is an id
   lookup, and a stale pair fails loudly in the content lint.
3. Check the receivers' selectors. `altar` and `cloud_dock` accept
   `['*/#ore','*/#refined','*/gravel']`. If `#refined` stops tagging anything
   the overhaul keeps, tribute silently stops being payable.
4. Update `STAT_ROWS` in `view/ui/mainPanel.js` — it hardcodes `walk`,
   `climb`, `pickPower`, `rate.furnace`, three of which are the wrong budgets
   afterwards.

### Corners — file by file

- **`data/tuning.js`: every new quantity gets a row, even at base 1.0.** This
  is the whole ballgame.

- **`rules/drive.js`'s `const TURN_RATE = 5.0`.** Presentation-only today. The
  transformer makes rotational speed real, at which point this is a hardcoded
  number where a tunable belongs. Convert to `eff('spinRate', def.id)` before
  the transformer ships.

- **`rules/crafting.js` uses raw `clause.n`; `rules/machines.js` applies
  `eff('yield', def.id)`.** The overhaul makes standard craft hand-or-
  contraption — the same row, two runners — so they will disagree the first
  time a god bends yield.

- **`model/mods.js` and the content lint accept `'substance' | 'machine'`
  scopes only.** The new economy wants a **`recipe`** scope (a yield boon on
  `iron_gear` alone). Adding a third kind is ~6 lines plus one lint branch.
  Deciding now costs nothing; deciding later means retrofitting every row.

- **`data/recipes.js` denominates fuel as a COUNT.** If the overhaul makes
  coal denser than timber without moving fuel clauses to energy, one coal and
  one log stay interchangeable, "denser" is pure flavour, and `fuelEnergy` has
  nothing to bend. The single most important non-divine decision for the
  divine tier to have anything to say about fuel.

- **`rules/grants.js` records no source on `rw.grant(machineId)`.** If the
  winch tree unlocks through the same `run.granted` list, nothing can tell a
  bought unlock from a gifted one — which blocks "the gods take it back", any
  meta-progression, and any save that distinguishes them. Record the source
  now or accept they are permanently indistinguishable.

- **`tools/content.mjs`'s modifier assertion** claims to iterate any table
  with a `mods` array and is in fact a hardcoded three-table list. Convert to
  a registry iteration.

- **`rules/boons.js` clears over the whole `BOONS` table every substep**, i.e.
  O(BOONS × mods.rows) × 120/s. Fine at five boons; flag it past ~20.
  Unmeasured — not profiled.
