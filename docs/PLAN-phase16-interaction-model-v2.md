# Plan — phase 16: the interaction model, part 2. What a click on a slot means, and the missing feed verb

**Status: BUILT.** Phases 16a-16c all landed. Kept below as the design
record; the "PROPOSAL" framing that follows describes the plan before it
was executed.

Everything below was read directly out of the repo at commit `818236e`
(Phase 12d gap-fix, the tip at time of writing); every `file:line` is real
and was verified by opening the file, not recalled. Every Factorio claim
carries the post title and URL it came from and is marked where the source
was thin.

**Read first, no exceptions:** `CLAUDE.md` in full — especially **D2** (the
GUI is canvas-drawn and it is `view`; `view` records rectangles, `shell`
hit-tests and dispatches, `view` never calls `rules` and never mutates
`model`) and invariants 5, 9 and 11. Then `docs/PLAN-phase12.md` §3 D-A,
D-E, D-F, D-G, D-H and §4.4 — **this document extends Phase 12's
interaction model and contradicts none of it.** Then `docs/PLAN-phase13.md`
§5 (the loop punch list), which §7 below cross-links against.

---

## 2. The brief, verbatim, as given

> should just click on something that is buildable to build it, and if it's
> not placeable then it just gets selected to be 'dropped' into a machine

and, separately, that the loop should actually work — "offering stuff to the
gods on a timer" and "randomly procedurally generated bonus or divine
recipes". §7 answers the second half by pointing at plans that already
exist rather than restating them.

What the first sentence resolves to, precisely: **the first clause is
already true and the second clause has never been true.** Clicking a
buildable arms it and LMB places it (`docs/PLAN-phase12.md` D-A, shipped).
Clicking a non-placeable does *nothing at all* — and there is no "drop it
into a machine" gesture anywhere in the game, because feeding is not a
gesture, it is a proximity side effect.

---

## 3. Part A — the audit: exactly what a click does today

### 3.1 The three click surfaces, and who owns each

| surface | drawn by | hit-tested by | what a click reaches |
|---|---|---|---|
| Character-tab inventory grid (`id:'inv'`) | `view/ui/mainPanel.js:193-197` | `shell/main.js#uiHitSlot` (`:382-388`) | `armPlace` or `runw.moveSlot` |
| quickbar (`id:'quickbar'`) | `view/ui/quickbar.js:73` | same | same |
| Crafting-tab recipe grid (`id:'recipes'`) | `view/ui/mainPanel.js:428-431` | same | `queueCraft` |
| equip slots (`id:'equip'`) | `view/ui/mainPanel.js:211` | same | `runw.equip` |
| craft queue strip (`id:'craft-queue'`) | `view/ui/mainPanel.js:447-450` | same | `cancelQueued` |
| the world, LMB | — | `shell/input.js`'s `pointerdown` (`:516-586`) | mine / place / use-miracle |

`view` records geometry into `view/ui/state.js#drawn` and nothing else; every
row above is `shell` calling `rules` or `shell/ui.js`. That is D2, working
exactly as written, and **nothing in this plan changes it.**

### 3.2 The armed pair — `ui.armedPlace` — is already a cursor, minus the icon

`src/shell/ui.js:70-81` declares it: `{ sub, form } | null`, "the specific
held pair a click on its Character-tab or quickbar slot has selected as
'place THIS one next'". Its mutators are `armPlace(sub, form)` /
`clearArmedPlace()` (`:271-272`).

It is read in five places, which is worth listing because it is the
scaffolding this plan builds on rather than replaces:

- `shell/main.js:162` — the staleness sweep: `invCount(...) <= 0 →
  clearArmedPlace()`. Runs before anything else can act on it.
- `shell/main.js:197-223` — `applyIntents`'s `cmd.place` branch: armed
  miracle → `miracles.use`; else armed → `placeMachine`/`placeTile`; else
  `placeableFromPockets(pocketRows())[0]`.
- `shell/input.js:571-582` — the LMB three-rule dispatch, resolved **once at
  pointerdown** (D-A).
- `view/ui/mainPanel.js:110-115` + `view/ui/quickbar.js:80-82` — the armed
  slot's border, `frameSlot(g, s, GOOD)`.
- `view/hud.js:649-680` — the world ghost.

Cleared by: a successful placement (`main.js:222`), the staleness sweep,
`z`, and Escape (`shell/input.js`). **This is Factorio's "item in cursor"
with a different name**, and §4 is the comparison.

### 3.3 So: what happens today when you click a slot?

Read out of `shell/main.js:501-562` (the `upEdge && ui.drag` branch) and
`shell/input.js:408-413` (the digit path). The gate is identical in both:

```js
// shell/main.js:514-517
if (clicked && (hit.gridId === 'inv' || hit.gridId === 'quickbar') &&
    hit.slot.sub != null &&
    (FORM[hit.slot.form]?.tile || hit.slot.form === F.rig || hit.slot.form === F.phial)) {
  armPlace(hit.slot.sub, hit.slot.form);
}
```

| you click | form | what happens |
|---|---|---|
| **copper ore** | `ore`, no `tile` | **nothing.** The gate fails, control falls to the next `else if`, which fires `runw.moveSlot(i, i)` — and `model/run.js:246` returns immediately on `from === to`. **A confirmed, silent, complete no-op.** |
| copper ingot / plate | `ingot`/`plate` | same — nothing |
| timber brand | `brand` | same — nothing |
| a trinket | `relic` | nothing on click. (Equipping is a *drag* onto an equip slot, `main.js:543-545`.) |
| **a ladder rung** | `rung`, has `tile` | armed. LMB on open ground places it (`placeTile`). |
| gravel | `gravel`, has `tile` | armed, places as solid backfill |
| **a machine (`rig`)** | `rig` | armed. LMB on open ground → `placeMachine`, footprint anchored bottom-row at the aimed tile (`main.js:216-218`). |
| a miracle (`phial`) | `phial` | armed. LMB anywhere valid → `miracles.use` (D-A rule 1). |
| **a recipe tile** (Crafting tab) | — | `queueCraft(id, ctrl?99 : shift?5 : 1)`, refused with a `'refused'` journal row if unaffordable or unknown (`main.js:452-455`) |

**So: exactly seven of the eleven substance-form kinds in the game are
click-inert.** Every ore, every ingot, every plate, every brand and every
relic. Clicking them produces no arm, no journal row, no sound, no pixel
change. That is the gap the user found.

### 3.4 `handFeed` — proximity only, and nothing else

`src/rules/machines.js:130-140`, in full:

```js
function handFeed(m, def) {
  if (!overlaps(playerBox(), m.box, def.handFeed.reach)) return;
  for (const sel of def.handFeed.from) {
    if (count(m, sel) >= capOf(def, sel)) continue;
    const pair = pocketedPair(sel, 1);
    if (!pair || !rw.spend(pair.sub, pair.form, 1)) continue;
    mw.take(m, pair.sub, pair.form, 1);
    mw.fire(m, 1);
    push('accept', { x: m.box.x, y: m.box.y }, { def: m.def, sub: pair.sub, form: pair.form });
  }
}
```

Called from `rules/machines.js:98`, inside `step(dt)` — **which takes no
`cmd` at all** (`:93`). So:

- **There is no click-to-feed path. There is no key. There is no gate.**
- It runs once per machine **per substep** — 120 Hz — one unit per accepted
  selector per substep. A furnace (`*/#ore` cap 8, `*/#fuel` cap 2) fills in
  ~0.07 s. An altar (`*/#ore`, `*/#refined`, `*/gravel`, cap 64 each) will
  take **everything you are carrying** in under a second, and
  `rules/cycles.js#drainReceivers` (`:109-122`) credits it to tribute the
  same frame, so it is not even recoverable from the buffer.
- Seven machines carry a `handFeed` block: `furnace` (`:168`), `press`
  (`:217`), `belt` (`:279`), `brazier` (`:315`), `talos_head` (`:382`),
  `cyclops_maw` (`:418`), `cloud_dock` (`:721`), `altar` (`:761`). All at
  `reach:10` px. The player is 6 px wide in an 8 px tile, so 10 px is
  "standing beside it".

**Feedback exists, but no words.** `push('accept', …)` reaches
`shell/notify.js`'s `CHIPS` table (`:35`, `{ n: 4, spread: 40 }`) and
`data/sfx.js#KIND_SFX` (`:22`, `accept: 'ignite'`) — so you get four
particles and a sound. There is **no** `TEXT` row for `'accept'`, so
nothing is ever said. Four chips and a click is exactly ambiguous with a
dozen other events at this resolution.

**Nothing teaches it.** `data/callouts.js:25` says `'DELIVER 10 COPPER ORE
TO THE ALTAR'` and never names a verb, which is *accidentally* correct
today (the verb is "walk there") and would be wrong the moment a real one
exists. `rules/tutorial.js`'s beat sheet stops at index 6.

### 3.5 The three workarounds — the real evidence

1. **`src/rules/cycles.js:84-93`.** `SPAWN_GAP = 4` exists *only* because of
   this: *"`handFeed` is real and unconditional from the frame this places it
   (reach 10 px, no key)… flush-against-spawn would mean a player who has
   taken zero steps, doing nothing, is already standing in its reach with
   whatever they were handed at run start. … found the hard way:
   `tools/check.mjs`'s BURDEN test and a furnace-crafting scene both fed the
   player ore near spawn and had it silently vanish into the altar."*
2. **`tools/check.mjs:1154-1159`.** The burden-lockout probe digs its shaft
   `+15` tiles from spawn: *"the altar quietly ate ore out of the very
   pockets this test just loaded, which is not what the assertion below
   means to measure. Dug well clear of it."*
3. **`docs/SPEC.md` §18.3** and `src/data/machines.js:655,745` — three
   pieces of prose asserting a "feed key" that has never existed.

A mechanic that needs a 4-tile exclusion zone around a building, a
15-tile offset in a test, and three stale comments to describe it is not a
mechanic. It is a missing verb with a proximity fallback.

### 3.6 Three things found in passing (each cited, each small)

1. **`docs/PLAN-phase12.md` D-I never landed.** It specifies "a 2-px double
   frame" for the armed-selection highlight and says it was "landed in 12c".
   `git log -- src/view/ui/slot.js` returns three commits, the newest being
   `e80a3fc` (a comment trim) — nothing from Phase 12 at all.
   `slot.js#frameSlot` (`:70-75`) still draws a **single 1-px border**. The
   plan's own status line is wrong about this one item.
2. **An armed miracle draws no ghost.** `view/hud.js#buildGhost` (`:649-680`)
   branches on `armed.form === F.rig` and `FORM[armed.form]?.tile` and
   returns silently otherwise. So D-A rule 1 — the branch that *overrides
   mining entirely* — is the one arming state with zero world feedback.
3. **`pocketRows()` has exactly one caller left and half of it is dead
   weight.** `model/run.js:593-603`; the only caller is
   `shell/main.js:208`'s `placeableFromPockets(pocketRows())[0]`, and
   `placeableFromPockets` (`rules/placement.js:188`) filters `r.n > 0` —
   which discards precisely the synthetic `item.hud.always` zero-count rows
   the second half of `pocketRows` exists to add. Not a bug; named so a
   later cleanup does not have to re-derive it.

### 3.7 The gap, stated once

| the user's model | today |
|---|---|
| click a buildable → build it | click a buildable → **arm** it, then LMB the world. Two clicks, and that is correct and Factorio-shaped (§4.4). |
| click a non-placeable → select it for a machine | **click does nothing.** Feeding happens by standing near a machine, automatically, invisibly, at 120 Hz, whether you meant to or not. |

---

## 4. Part B — Factorio, and which of it actually transfers

Every claim below names the post and URL it came from.

### 4.1 The cursor is the whole model, and the click *target* disambiguates

**Source: the official wiki's Controls page**
(<https://wiki.factorio.com/Controls>) — this is documentation, not a design
blog post, and I am citing it as *what the game does*, not as *why*:

- inventory: LMB = "Pick up/drop item stack"; RMB = "Moves half of the
  selected inventory slot into the cursor if empty"; SHIFT+LMB = "Transfers
  the selected stack to the other inventory".
- item in cursor: LMB = place/build; **Q = "Clear cursor — returns the item
  in the cursor stack to the player's inventory"**; R = rotate.
- crafting: LMB = craft 1, RMB = craft 5, SHIFT+LMB = "Crafts as many as
  possible of a given recipe".

**Source: the wiki's keyboard-shortcuts tutorial**
(<https://wiki.factorio.com/Tutorial:Keyboard_shortcuts>) — this is the
single most relevant sentence in the entire research pass, because it is
*exactly* the user's second clause:

> **"Fast entity transfer (CTRL + Left mouse button) fills an entity's
> inventory or input slots with the item held in the cursor."**

and its inverse:

> "Fast entity transfer (CTRL + Left mouse button) while empty-handed grabs
> items from an entity without having to open it."

with a half-measure variant: "Fast entity split (CTRL + Right mouse button)
… only moves half of what is held in the cursor into the entity."

**What transfers.** Factorio's answer to "click something not placeable, then
put it into a machine" is: *there is no type dispatch at all.* One thing is
in your hand; **where you click decides what happens to it.** Click the
world → build. Click an entity → insert. Click another slot → move. The item
never had to be classified.

**Why that matters here, concretely.** Type dispatch on
`FORM[form]?.tile` — the literal reading of the brief — is **not sound in
this content table**, and the reason is two rows:

- `data/forms.js:66-71` — **`log` carries `tags:['fuel']` *and* a `tile`
  block.** So `timber/log` is both a placeable climbable tile and a match
  for the `*/#fuel` selector every one of the seven `handFeed` machines
  accepts.
- `data/forms.js:36-50` — **`gravel` carries a `tile` block** *and* is
  named explicitly in both tribute receivers' `handFeed.from`
  (`data/machines.js:721,761`). And `data/cycles.js:135` — cycle 4,
  `salt-tribute` — **demands `granite/gravel` n:8 at the `cloud_dock`.**

Under "placeable wins, else feed", the material cycle 4 asks for could never
be armed for feeding, and a log could never be deliberately fed to a
furnace. Both would work anyway — via the invisible proximity drain — which
means type dispatch would ship a rule that is *contradicted by the fallback
it is meant to replace.* That is disqualifying, and it is why the
recommendation in §5 is not model 1.

### 4.2 The quickbar: Factorio moved *away* from storage, and named the reason

**Source: Friday Facts #278, "The new quickbar"**
(<https://factorio.com/blog/post/fff-278>, verified by fetching
`direct.factorio.com/blog/post/fff-278`). Quoting the post:

> "the quickbar is changed from being a separate inventory to simply a
> shortcut bar to the player's main inventory."

and the four frustrations it lists as solved:

> "No more random items appearing in the quickbar as you craft them. No more
> items moving to different slots when they get depleted and re-crafted. No
> more using the quickbar to carry things around. Player is in full control
> of the quickbar instead of the game trying to be 'smart'."

Mechanically: "it creates a shortcut telling you how many inserters of that
type you have in your main inventory. Clicking the shortcut, will grab the
first available stack from the inventory." And: **"That shortcut will stay
there throughout the game, even if the inserters are depleted
temporarily."** They also "increased [the main inventory] by 20 stacks to
compensate for the inventory slots that now became shortcuts."

**This is the one place Factorio's thinking directly contradicts a shipped
mythos-factory decision, and it identifies a real bug.**
`docs/PLAN-phase12.md` D-H made the quickbar's ten cells **be**
`run.inv[run.mainSlots ..]` — real storage, not shortcuts. Two of FFF #278's
four frustrations are structurally impossible here (nothing auto-allocates
into the quickbar range — `model/run.js#write.collect` bounds its free-slot
search to `idx < run.mainSlots`, and a pair only reaches the quickbar by a
deliberate drag). But **the second one is live**:

> `model/run.js#write.spend` sets a slot to `null` at `n <= 0`. So: put your
> last four ladder rungs in quickbar slot 3, place all four, and slot 3 is
> now empty. Craft more rungs and `write.collect` allocates them into the
> **first free *main* slot** — never back to slot 3. Key `3` is now dead and
> you must re-drag. **This is FFF #278's "items moving to different slots
> when they get depleted and re-crafted", exactly, in this codebase, today.**

I am **not** recommending Factorio's fix (a shortcut/filter layer over the
main inventory). It reopens the "two sources of truth for slot N" ambiguity
D-G's single-array design exists to close, and D-G's argument for one array
(every aggregate query — `burdenOf`, `pocketsHave`, `bestTool`, `invCount` —
is correct by construction with one pass) is still the stronger one for a
game whose binding constraint is *mass*, not slot count. But the depletion
hole is real, it is cheap to close, and §5.4 closes it with a **sticky
slot**: `write.collect` prefers the slot the pair most recently occupied.
Named as its own decision so a reviewer can decline it independently.

### 4.3 Stack splitting does not transfer, and the numbers say why

Factorio's whole RMB/SHIFT+RMB/CTRL+RMB half-stack vocabulary exists because
a stack is 50–200 items and moving "some" is a real need.

Checked here: `data/tuning.js:132` — `burden` base **40 talents**, the hard
cap. `data/substances.js:73` — copper's `item.mass` is **1.0**;
`data/forms.js:31` — `ore`'s `massK` is **1.0**. So a copper ore unit is
1.0 T and **the entire inventory, all 40 slots, tops out at 40 units of it**.
`docs/SPEC.md` §18.4 / `data/cycles.js:94` — cycle 1 asks for **10**.
Cycle 4 asks for **8** gravel.

**So there is nothing to split.** A "half stack" of a 10-unit pile is a
gesture in search of a problem, and the correct number of new mouse
bindings this plan adds for it is **zero**. `docs/PLAN-phase12.md` §4.7's
"no new tunable is introduced anywhere in this phase" discipline applies to
input vocabulary too.

### 4.4 The ghost, and how close this repo already is

**Source: FFF #278 and FFF #191, "Gui improvements"**
(<https://factorio.com/blog/post/fff-191>). FFF #191, on selecting a
buildable you do not have:

> "When you click a shortcut for something you don't have any items of, you
> grab a ghost of that item in your cursor."

FFF #278 confirms it shipped and that it is **off by default**: "To avoid
confusion for new players, this feature is off by default and can be turned
on in the interface settings menu." The pipette (Q) is the same idea from the
other direction — pick the entity under the cursor into your hand. (The
pipette's *design rationale* is documented on the wiki and in forum threads,
not in a Friday Facts post.)

**Compared with `view/hud.js:649-680`:** mythos-factory's ghost is already
the good version of this pattern. `drawFootprintGhost` (`:534-552`) draws
the real multi-tile footprint, snapped to the aim reticle, anchored
*exactly* the way `shell/main.js:216-218` anchors the real placement, tinted
by `model/run.js#placementCheck` — **the same query
`rules/placement.js#placeMachine` calls** — with the one-word refusal
reason printed beside it. Factorio's ghost tells you *where*; this one tells
you *where and why not*. That is better, and the file says so in its own
header ("one decision, two readers").

**Two gaps against the pattern, both small:** there is no ghost for an armed
`phial` (§3.6 #2), and there is no cursor-adjacent readout of *what* is in
hand — the only cue is a 1-px border on a slot inside a panel you probably
closed (`main.js:184` auto-closes the panel the instant a placement intent
arrives). 16c closes both.

### 4.5 The tooltip principle, and the one Factorio pattern this repo already beat

**Source: FFF #318, "New Tooltips"** (<https://www.factorio.com/blog/post/fff-318>).
The problem they named:

> "The recipe tooltip was kind of a Frankenstein's monster of recipe
> information and item information mashed together."

and the principle they settled on:

> "an item tooltip will look the same regardless if it's shown while
> hovering a recipe, an item in the player inventory or a logistic request.
> No more mixing of information."

`view/ui/mainPanel.js` already does this: `pairTooltip` (`:294-318`) and
`recipeTooltip` (`:462-487`) are separate functions with separate
vocabularies, and the recipe one prints a real `have/need` line per selector
off `pocketedBest` (`:466`, `:493`). Craftability is already communicated
three ways — a `GOOD` frame when craftable (`:420`), a 55%-toward-background
tint plus the *missing ingredient's own letter* as the glyph when not
(`:422-425`), and `'UNKNOWN — NOT YET STOLEN'` for an unknown recipe
(`:485`). **This half of the UI needs nothing.** Do not touch it.

### 4.6 What transfers, and what does not — the scorecard

| Factorio pattern | verdict here |
|---|---|
| one "in cursor" item; the **click target** decides the verb | **adopt.** `ui.armedPlace` already is this; §5 widens what may go in it and adds one target. |
| ctrl+LMB on an entity inserts what is in the cursor | **adopt the idea, not the binding.** Plain LMB, because this game has no ctrl-click vocabulary and only one world verb per press (D-A). |
| a clear-cursor key (Q) | **already shipped** as `z` (Phase 12d, D-A §4.3) plus Escape. |
| translucent snapped ghost, confirmed by a click | **already shipped and better** (`placementCheck`-tinted, refusal printed). Add the missing `phial` branch. |
| ghost cursor when you hold none of the item | **reject.** This game's placement is a real spend of a real held `rig`/tile pair (`rules/placement.js:62`, `:209`); a ghost of something you do not have needs a construction-robot layer to ever resolve, and there is none. |
| stack splitting (half-stack, RMB variants) | **reject.** §4.3 — stacks are 8–40 units and mass is the real cap. |
| quickbar as *shortcuts* over one inventory | **reject the mechanism, fix the symptom.** §4.2 / §5.4. |
| crafting menu: greyed unavailable, queue, click-to-queue with multipliers | **already shipped** (§4.5). |
| separate item vs. recipe tooltips | **already shipped** (§4.5). |
| multiple quickbar pages | **reject.** Ten cells, thirty main slots, ~11 substance-form kinds. Pages solve a scale this game does not have. |

---

## 5. Part C — the decision

### D16-A — the click model. **THE BIG ONE.**

**Recommended: the click *target* decides, not the item's type.** Concretely:

1. **Clicking any occupied slot arms that pair.** Drop the
   `FORM[form]?.tile || form === F.rig || form === F.phial` gate from both
   `shell/main.js:514-517` and `shell/input.js:411-412`. One rule: a click
   on a thing you hold puts it in your hand.
2. **LMB on the world resolves against the target**, in this order,
   decided **once at pointerdown** exactly as D-A already requires
   (`shell/input.js:562-583`):

   | # | condition | action | `aim.mode` |
   |---|---|---|---|
   | 1 | armed pair is `F.phial` | use the miracle | `place` |
   | 2 | **a machine is under the reticle, within `handFeed.reach`, and it accepts the armed pair** | **feed one unit into it** | `place` |
   | 3 | armed pair is placeable and `tileAt(...) === AIR` | place it | `place` |
   | 4 | otherwise | mine | `dig` |

   Rule 2 is the new one. It sits **above** placement for the same reason
   `shell/input.js:558-559` already puts "RMB on a machine deconstructs"
   above "RMB places": **a machine under the reticle means the machine.**
   There is a live precedent for that ordering and this reuses its argument
   rather than inventing one.
3. **Nothing armed is unchanged.** Rule 4 fires; LMB mines. Exactly today.

**Why this and not model 1 (type dispatch).** §4.1: `log` is fuel *and*
tile-capable; `gravel` is a cycle-4 tribute demand *and* tile-capable. A
rule that classifies the item cannot express "feed this log to the furnace"
or "hand this gravel to the dock", and both are things the content table
asks for. A rule that classifies the *target* has no such problem, needs no
exception list, and is the one Factorio arrived at after eleven years.

**Superseded by `CLAUDE.md` D12** (a form is either feedstock or buildable,
never both, landed by `docs/PLAN-phase14-mining-and-drops.md`'s D14-A/H):
`gravel` and `log` — the two counterexamples model 1 (type dispatch) could
not handle — both lost their `tile` block, so D16-A's target-priority
ordering and a pure type branch now produce identical behaviour for every
legal armed pair. D16-A's ordering is kept anyway, as the more defensive of
two now-equivalent choices, and 16c's legibility framing (D16-E) describes
the mechanic the simpler way regardless — "what you're holding decides what
LMB does."

**Why this and not model 2 in full (a cursor-following icon, slot-to-slot
swaps via the cursor).** Two reasons, both about cost against benefit:
- A mouse-following payload icon means `view` drawing at `f.mouse` every
  frame plus a drag-vs-cursor ambiguity against the *existing*
  `DRAG_THRESHOLD` gesture (`shell/main.js:344`), which already owns
  press-move-release for `moveSlot`/equip. Two payload concepts on one
  button is a real regression risk for a cosmetic gain.
- Slot-to-slot movement is *already* solved, correctly, by that drag
  (`runw.moveSlot`, `main.js:527`). Routing it through a cursor would be a
  second mechanism for one operation — the exact duplicate-decision shape
  D-G's own rejected-alternatives list argues against.

So: adopt Factorio's *semantics* (one hand, target decides) on this
codebase's *existing* gestures (click to arm, LMB to act, drag to move).

**Why not model 3 (legibility only).** Considered seriously, and **half
adopted** — 16c is model 3 in full, and it is a real phase, not a
consolation. But it cannot be the whole answer, because §3.5's three
workarounds are not a communication problem. `SPAWN_GAP = 4` is a
*geometry* patch for a *verb* that does not exist; you cannot document your
way out of "walking past the altar spends your plates".

**Accepted, stated costs:**

- **Rule 2 blocks mining a tile behind a machine while something is armed.**
  Point at a furnace with ore in hand and you feed the furnace, not the rock
  behind it. Mitigation: `z` clears the hand in one press (already
  shipped). Same class of trade D-A's own risk register already accepted for
  rule 1.
- **A press decided "feed" cannot become "mine" without releasing.**
  Identical to the trade §4.4 of `docs/PLAN-phase12.md` already documented
  for placement. Not a new kind of cost.

### D16-B — is feeding an edge or a hold?

**Recommended: an EDGE. One unit per press.** New `cmd.feed`, cleared by
`clearEdges()`, in the exact shape `cmd.place` already is.

The argument is arithmetic. §4.3: cycle 1 wants 10 units, cycle 4 wants 8, a
furnace's ore cap is 8 (`data/machines.js:165`). Ten clicks is a fine price
for the single most consequential action in the game, and one-per-press is
the most legible rule available: you can *count* what you gave. A hold at
120 Hz is what created the silent-drain bug in the first place.

An edge also means **zero new tunables and zero new model state.** A rate
would need `eff('feedRate')` plus an accumulator, and the only honest home
for that accumulator is a `run` scalar in `rules/crafting.js#run
.craftProgress`'s shape — real cost for a convenience `ui.autoFeed`
(D16-C) already covers.

**Rejected alternative:** a HOLD at `eff('feedRate')` units/sec, matching the
mining/craft/crank idiom. Genuinely defensible — this project's whole
physical vocabulary is "stand there and hold it" — and if a playtest says
ten clicks feels like work, that is the lever, at the cost of one tuning row
and one `run` scalar. Named so the reviewer can pick it cheaply.

### D16-C — what happens to the automatic proximity drain?

**Recommended: it becomes opt-in, `ui.autoFeed`, default `false`, in the
exact shape `ui.autoCollect` already is.**

This is not a new mechanism. `shell/ui.js:55-68` already declares
`autoCollect: false` with a header explaining why a UI preference that ORs
into a narrowed command object is the right home for exactly this class of
fact (`rules/` may not import `shell`; `shell/main.js#step` already folds
"which device/preference asked" into `c`). `shell/main.js:115` is the
one-line precedent: `collect: ui.autoCollect || cmd.collect`.
`view/ui/mainPanel.js:162-174` is the clickable row, and
`shell/main.js:430-435` is its dispatch. **Copy all four, one file at a
time, for `feed`.**

Why opt-in rather than deleted outright: it gives the reviewer a one-click
revert to today's behaviour, it lets every existing proximity-feed test set
a flag instead of being rewritten around a new gesture, and it is
symmetric — the player who wants a magnet gets a magnet, for items *and* for
machines, from one panel.

Note the consequence, so it is decided rather than discovered:
`docs/PLAN-phase13.md` §4.3 recommends resetting `ui.autoCollect` on
`newRun()` (D13-A), on the grounds that it is an *input* and invariant 8
governs inputs. **`ui.autoFeed` is the same kind of fact and takes the same
answer**, whichever way 13c settles it. 16b must not introduce a second
policy.

**Rejected alternative:** delete `handFeed`'s automatic path entirely. Cleaner
in the abstract, and the end state I would expect eventually. Rejected for
this wave because it makes ~4 harness probes and an unknown number of
Playwright scenes fail *by design* in the same commit that adds a new
gesture, which is precisely the "do not stack unverified changes" shape
Phase 12's own 12a→12b→12c sequencing exists to avoid.

### D16-D — the depleted quickbar slot (§4.2's live bug)

**Recommended: a sticky slot on `model/run.js#write.collect`.** When a pair
has no existing slot and a free one must be allocated, prefer the index that
pair most recently occupied, if it is still free — otherwise fall back to
today's `findIndex(s => s === null && idx < run.mainSlots)`.

The memory is one `Map` from `keyOf(sub, form)` to a slot index, reset by
`write.reset()` like everything else on `run` (invariant 8), written by
`write.spend` at the moment it nulls a slot, and read by `write.collect`.
It is **not** authoritative for anything: if the remembered slot is occupied
or out of range, `collect` behaves exactly as it does today. So the single
source of truth for what you carry is still `run.inv`, one array, one pass —
D-G intact.

**Why it is a separate decision:** it is the only item in this document that
touches `model/run.js`, it is independently declinable, and FFF #278 is the
only reason anyone would have thought to look for it. If the reviewer would
rather ship the verb first, drop D16-D and this plan is still coherent.

**Rejected alternative:** Factorio's actual answer — a shortcut/filter layer,
so a quickbar cell holds a *reference* and never storage. §4.2 argues why
not.

### D16-E — the legibility half (model 3, kept in full)

Five items, all `view`, all cheap, all named because §3.6/§4.4 found them
rather than because a redesign wanted them:

1. **Land D-I.** `slot.js#frameSlot` draws a second border inset by one
   pixel in the same colour, using the same `R()` calls (§3.6 #1). Both
   callers get it free.
2. **An `IN HAND` readout.** One line, drawn only when `ui.armedPlace` is
   set, immediately above the quickbar (`view/ui/quickbar.js` owns that
   anchor already). Per **D8**: positioned by a layout pass over measured
   text, never a hardcoded origin. This is the cursor-adjacent feedback
   §4.4 found missing — `shell/main.js:184` auto-closes the panel on a
   placement intent, so the slot border is frequently the *only* cue and it
   is behind a closed window.
3. **A feed indicator in `buildGhost`.** A fourth branch: with something
   armed and an accepting machine under the reticle, outline the machine's
   footprint in `UI.good` and print `count(m, sel)/capOf(def, sel)` beside
   it. `view` may not import `rules` — but `count` is
   `model/machines.js` and `capOf` reads the frozen `data/machines.js` row,
   so the honest move is a **`model` query** that answers "would this
   machine take this pair, and how full is it", read by both `view` here and
   `rules/machines.js#handOne` in 16a. **One decision, two readers** — the
   same arrangement `placementCheck` and `linkCheck` already have. Write it
   in 16a, consume it in 16c.
4. **The `phial` ghost branch** (§3.6 #2).
5. **The three stale "feed key" comments become true** (`data/machines.js
   :655,:745`, `docs/SPEC.md` §18.3), and `data/callouts.js:25` gains the
   verb. Beat 5 becomes `'CLICK THE ALTAR -- DELIVER 10 COPPER ORE'` or
   similar; the exact wording is the implementer's, the presence of a verb
   is not.

---

## 6. The phases

Three, **serial**. 16a is additive and provably cannot regress anything
(nothing is removed). 16b is the only phase that changes default behaviour
and it lands only once 16a's replacement path is proven by hand. 16c owns
`src/view/` and therefore must not run beside `docs/PLAN-phase13.md`'s 13a
or 13b (`.claude/brain/phase-plan-conventions.md`, rule 1).

All three landed: 16a's `cmd.feed` edge and `rules/machines.js#handOne`
(D16-A rule 2, D16-B), 16b's opt-in AUTO FEED gate replacing the always-on
proximity drain (D16-C), and 16c's legibility pass — the armed-slot double
frame, the IN HAND line, the feed preview and the miracle ghost (D16-E). The
executed prompts are git history; the refusal strings and their order are
locked in `docs/SPEC.md` section 23.

---

## 7. Part D — how this document relates to the loop-closure work

Re-read `docs/PLAN-phase13.md` §5 against the repo. **It is still accurate**
— every `file:line` in its 20-item punch list checks out, including the two
items that overlap this document:

- **#1, the loop bypass** (`rules/cycles.js:109-122`, `drainReceivers` never
  checks `cyc.at`). Confirmed verbatim; the function's own header at
  `:102-108` still argues for the behaviour 13d removes.
- **#8, silent completion.** Confirmed: `'cycle'`, `'tribute'` and `'debt'`
  appear in neither `shell/notify.js`'s `CHIPS`/`TEXT` tables nor
  `data/sfx.js#KIND_SFX`. (`'accept'` — the feed event — *is* in `CHIPS` and
  `KIND_SFX` but not `TEXT`. §3.4.)

The user's two loop asks: "offering stuff to the gods on a timer" actually
working is `docs/PLAN-phase13.md` §5.3's Phase 13d; "randomly procedurally
generated bonus or divine recipes" is that document's §5.2 items 4 and 5,
audited and deliberately out of 13d's scope — §7.3 below is where that work
went. The eventual landing order was 14a, then 13 (a→b→c→d), then 15, then
16, for the reasons this section used to spell out: 16's acceptance criteria
want an audible/visible loop (13d item #8), 13d's own acceptance wording is
against the automatic feed 16b replaces, and D16-A's target-vs-type
argument wanted 14a's counterexamples resolved first. All now moot — every
phase in that order has landed.

### 7.3 The draft UI belongs in neither document. Call it Phase 17.

`docs/PLAN-phase13.md` §7 explicitly parks it: *"Throughput/rate demands
(#14) and a real 1-of-3 draft (#4/#5). Both are genuinely the next thing the
loop wants after 13d, and both need content and a UI surface rather than a
fix. They belong in their own plan."* **That call is correct and this
document endorses it rather than absorbing the work.** Concretely, a real
1-of-3 draft needs:

- **content**: enough rows to construct an offer in three of four tiers —
  `data/grants.js` (1 row today), `data/trinkets.js` (1), `data/miracles.js`
  (1). `data/boons.js` has 5 and is fine. That is a content-authoring job
  with a mass-conservation and selector-reachability cost, not a UI job.
- **a modal**: a new `ui.stack` entry (which `shell/ui.js:12-16`'s header
  was explicitly built for — *"so a future modal… can sit on top of the
  tabbed window"*), a new `view/ui/` file, a new dispatch branch, and a
  decision about whether the draft pauses the run (`flags.showMap`'s freeze
  at `shell/main.js:79` is the precedent, and `view/ui/mainPanel.js:6-11`
  is the counter-precedent — the main panel deliberately pauses nothing).
- **a bug fix**: item #6 — cycle 4's trinket draft is a guaranteed no-op
  because `data/drops.js:17` hands `bellows` over at cycle 1 with
  `chance:1`, so `draftable()` is empty by the time cycle 4 asks.

That is bigger than anything in this document and it is a *different kind*
of work (content + a new modal) from anything in 13d (five targeted fixes).
Folding it into either would break both documents' scope discipline. **Write
it as `docs/PLAN-phase17-drafts.md` when 13d has a greenlight**, and size it
honestly: the content half is probably larger than the UI half.

---

## 8. Explicitly not designed here

- **A mouse-following cursor icon.** §5 D16-A's rejected alternative. It
  collides with the existing `DRAG_THRESHOLD` gesture for a cosmetic gain.
- **Stack splitting, half-stacks, or any ctrl/shift mouse vocabulary for
  inventory.** §4.3 — a 10-unit pile has no halves worth naming, and mass
  is the real cap.
- **A quickbar shortcut/filter layer, or quickbar pages.** §4.2/§4.6 —
  Factorio's own answer, rejected because it reopens D-G's two-sources-of-
  truth problem for a game with ~11 substance-form kinds.
- **A ghost of an item you do not hold.** §4.6 — needs a construction-robot
  layer to resolve and there is none.
- **Any change to the Crafting tab.** §4.5 — it already implements FFF
  #318's own conclusions (separate item/recipe tooltips, per-selector
  `have/need`, three-way craftability tinting).
- **The `pocketRows()` dead half** (§3.6 #3). One caller, and half its body
  is discarded by that caller's own filter. Real, small, and unrelated to
  any decision here.
- **A rate/throughput tunable for feeding.** D16-B's rejected alternative.
  If ten clicks feels like work, the lever is one `data/tuning.js` row and
  one `run` scalar, and nothing in this plan blocks it.
- **Deleting the automatic proximity feed outright.** D16-C's rejected
  alternative, and the end state I would expect eventually. Not this wave.
- **The 1-of-3 draft, its content, and its modal.** §7.3 — Phase 17.
- **Any second physical control scheme (gamepad, touch).** Out of scope, as
  it was for Phase 12.

---

## 9. Risk register

All landed clean. The two risks worth remembering the shape of: 16b turning
off a mechanic that several harness probes depended on without any of them
failing loudly (a proximity-feed probe that asserts `held === 0` still
passes with the drain simply turned off) required a grep-then-classify pass
over every dependent scene plus a new probe seen to fail before the change,
not after; and widening the arm gate to any occupied slot deliberately makes
six of eleven form kinds armable with no consequence, which is correct
(Factorio's model, §4.1) but needed 16c's IN HAND readout to stay legible
rather than read as an oversight.
