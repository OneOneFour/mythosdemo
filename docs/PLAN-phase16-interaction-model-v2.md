# Plan — phase 16: the interaction model, part 2. What a click on a slot means, and the missing feed verb

**Status: PROPOSAL. Nothing here is committed.** This is the plan-mode step
`docs/BUILD_PLAN.md`'s own convention requires before a phase this size
touches code — the same convention `docs/PLAN-phase10.md`,
`docs/PLAN-phase12.md` and `docs/PLAN-phase13.md` followed.

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

## 1. Sizing, honestly, before anything else

This is **one missing verb and three workarounds for its absence**, not a
redesign. The audit in §3 found that:

- `rules/machines.js#handFeed` (`:130-140`) is **proximity-only,
  unconditional, and runs every one of the 120 substeps a second** for every
  machine with a `handFeed` block. There is no key, no click, and no gate.
- **Three separate places in the repo work around that**, and all three say
  so in their own comments: `src/rules/cycles.js:84-93` (`SPAWN_GAP = 4`,
  "found the hard way… both fed the player ore near spawn and had it
  silently vanish into the altar"), `tools/check.mjs:1154-1159` ("the altar
  quietly ate ore out of the very pockets this test just loaded… Dug well
  clear of it"), and `tools/check.mjs:3552-3556`.
- **Three separate places claim a feed key exists.** It does not:
  `src/data/machines.js:655` ("you walk up and hold the feed key"),
  `src/data/machines.js:745` ("the player walks up carrying ore and holds
  the feed key"), and `docs/SPEC.md` §18.3's own table row ("the player
  walks up and holds the feed key"). The codebase's own authors expected the
  verb this plan adds.

So the user's instinct is right, and the honest framing is not "the click
model is wrong" but "**one of the two halves of the click model was never
built, and the half that exists is invisible.**"

| phase | agent | rough size | risk |
|---|---|---|---|
| 16a | 1 × `systems` | 2 `shell/` files, ~20 new lines in `rules/machines.js`, additive only | **low** — nothing existing is removed |
| 16b | 1 × `systems` + `harness` in one commit | 1 line of gate, 1 signature, 1 UI row, **~4 test probes and every proximity-feed scene** | **medium** — the whole risk of this document lives here |
| 16c | 1 × `ui` | 4 `view/` files, 2–3 new baselines | low, but owns `src/view/` |

16b is the only phase that changes what the game does when you do nothing.
It runs alone and it runs after 16a has proven the replacement path works.

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

Not one of these is a comment I wrote; all three are in the repo today.

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

Every claim below names the post and URL it came from. Where I could not
verify a specific dev statement I say so rather than dressing a wiki page up
as a design blog.

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
other direction — pick the entity under the cursor into your hand.
(Caveat: the pipette's *design rationale* is documented on the wiki and in
forum threads, not in a Friday Facts post I could find. I looked; I am not
going to invent a citation for it.)

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

**Revision, post-Phase-14: both counterexamples above are gone, and the
choice is no longer about correctness.** `docs/PLAN-phase14-mining-and-drops.md`'s
D14-A/B/H land a general content rule — **`CLAUDE.md` D12: a form is either
feedstock or buildable, never both** — and apply it to exactly the two rows
this paragraph named: `gravel` loses its `tile` block (D14-A) and `log`
loses its `tile` block (D14-H). Once both land, **there is no pair left in
the game for which "what am I holding" and "what am I pointing at" disagree
about whether the action is feed or place** — every tile-capable form
(`rung`, `stair`, `block`) is placement-only and accepted by no recipe,
`handFeed` selector, or tribute demand; every feedstock form is the reverse.
D16-A's rule-2-above-rule-3 ordering and a pure type branch (`FORM[form]?.tile
? place : feed`) now produce **identical behaviour for every legal armed
pair** — there is no longer a real disagreement to arbitrate, only a
question of which implementation is more robust and which is easier to
teach.

**The recommendation stands, revised for the right reason.** Keep D16-A's
target-priority ordering, not because model 1 is wrong today, but because it
is the more defensive of two now-equivalent choices: it degrades safely if a
future content row is ever added carelessly (`tools/content.mjs` assertion
20/21 from Phase 14 catch a *deposit* placement mistake, not a *feedstock/
buildable* one — nothing lints D12 itself), whereas a pure type branch would
need its own tie-break the day that happens, silently, mid-playtest. It also
costs nothing extra to build; 16a/16b/16c below are unchanged by this
revision. **What does change is 16c's legibility framing (D16-E)**: since
the two models are now behaviourally identical, describe the mechanic to the
player the *simpler* way regardless of which way it is implemented — "what
you're holding decides what LMB does" is the honest, teachable version of a
rule that technically checks the target, because after D12 the target
constrains only *whether* the action is legal, never *which* action it is.
That is the frame the user's own brief asked for, and D12 is what makes it
true rather than merely convenient to say.

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
or 13b — the same rule that kept Phases 8, 8b, 8e and 9 serial.

### 6.1 FILE OWNERSHIP — Phase 16a (the feed verb, additive)

```
src/shell/input.js        pointerdown's LMB dispatch gains rule 2 (D16-A);
                          new `cmd.feed` EDGE declared and cleared in
                          clearEdges(); the click-to-arm/digit-arm gate at
                          :411-412 widened to any occupied slot
src/shell/main.js         applyIntents() gains the cmd.feed branch, calling
                          into rules/machines.js; the click-to-arm gate at
                          :514-517 widened identically; the "live binding
                          set" narrowing left alone (no new narrowed field
                          in this phase -- feed is a one-shot intent, not a
                          step gate)
src/model/machines.js     NEW query: `feedCheck(m, sub, form)` -> {ok, why,
                          have, cap} -- the one decision rules/machines.js
                          enforces and view/hud.js previews (D16-E #3).
                          Reads only `data/machines.js` + this file's own
                          `count`.
src/rules/machines.js     NEW export `handOne(m, sub, form)`: calls
                          feedCheck, and on ok does the exact five lines
                          handFeed already does (spend, take, fire, push
                          'accept'), pushing a 'refused' row with
                          feedCheck's own `why` otherwise. `handFeed`
                          itself is UNCHANGED in this phase.
src/shell/ui.js           ui.armedPlace's header comment: it is now four
                          consequences, not three. Do NOT rename the field
                          (D-A's own reasoning: __mf.ui.armedPlace is a
                          public test-hook key).
tools/check.mjs           one new probe: arm ore, aim at an altar 6 px away,
                          fire cmd.feed once, assert exactly ONE unit moved
docs/SPEC.md              a new subsection locking the feed verb, its
                          refusal strings and their ORDER -- SPEC first,
                          then code (CLAUDE.md's Conventions)
```

**Explicitly not touched in 16a:** `rules/machines.js#step`'s signature,
`shell/schedule.js`, `view/` (any file), `data/machines.js`,
`data/tuning.js` (no new tunable — `handFeed.reach` is already the number).

### 6.2 Paste-ready prompt — Phase 16a

> You are implementing Phase 16a of `docs/PLAN-phase16-interaction-model-v2.md`
> in the mythos-factory repo. Read `CLAUDE.md` in full (especially D2 and
> invariants 5 and 9), then `docs/PLAN-phase12.md` §3 D-A and §4.4, then
> `docs/PLAN-phase16-interaction-model-v2.md` §3, §5 D16-A and D16-B in full.
>
> **This phase adds a verb and removes nothing.** The automatic proximity
> feed (`rules/machines.js#handFeed`) must still work exactly as it does
> today when you are done — it is retired in 16b, not here. This phase must
> be provably impossible to regress.
>
> 1. `src/model/machines.js`: add `feedCheck(m, sub, form)` returning
>    `{ ok, why, have, cap }`. `ok` requires: the machine has a `handFeed`
>    block; `acceptedBy`-equivalent logic finds a selector in
>    `def.handFeed.from` matching the pair; and `count(m, sel) < capOf(def,
>    sel)`. Refusal strings, in this order: `'IT DOES NOT WANT THAT'`, then
>    `'IT IS FULL'`. **Reach is NOT checked here** — reach is a fact about
>    where the player is standing, which is `rules`/`shell`'s question, and
>    `view`'s ghost must be able to preview a machine you have not walked to
>    yet. Say in your report where you put the reach test and why.
>    `capOf`/`acceptedBy` currently live in `rules/machines.js`; if moving
>    the pair down into `model` is the cleanest way to avoid a second copy,
>    do that and say so — but do NOT leave two implementations of "does this
>    machine accept this pair".
> 2. `src/rules/machines.js`: add `export function handOne(m, sub, form)`.
>    Call `feedCheck`; on failure push a `'refused'` journal row carrying
>    `why` (the kind and the verbatim-`why` display are already wired —
>    `shell/notify.js:46`, `refused: row => row.data?.why || ''`); on
>    success do exactly what `handFeed`'s body already does for one unit
>    (`rw.spend`, `mw.take`, `mw.fire`, `push('accept', ...)`), and return a
>    boolean. **Do not touch `handFeed` or `step`.**
> 3. `src/shell/input.js`: add `cmd.feed` as a new EDGE, declared and
>    cleared in `clearEdges()` in the exact shape `cmd.place` already is.
>    In `pointerdown`'s LMB `else` branch (`:562-583`), insert rule 2 from
>    §5 D16-A **between** the existing rule 1 (phial) and rule 2 (place):
>    if something is armed, `aim.valid && aim.band`, a `machineAt(aim.band,
>    aim.tx, aim.ty)` exists, it is within its own `handFeed.reach` of
>    `playerBox()`, and `feedCheck(...).ok`, then `aw.mode('place')` and
>    `cmd.feed = true`. Renumber the comments so the four rules read in
>    order. **Decide it once at pointerdown** — that is D-A's whole design
>    and a held press must not flip meaning.
> 4. `src/shell/main.js`: add the `cmd.feed` branch to `applyIntents()`,
>    beside the existing `cmd.place`/`cmd.deconstruct`/`cmd.link` branches
>    and following their exact shape (gate on `aim.valid && aim.band`,
>    self-clear the flag). It resolves the armed pair the same way the
>    `cmd.place` branch does at `:197-198` (re-check `invCount > 0`; a
>    stale arm must never feed the wrong thing) and calls `handOne`. **The
>    arm is NOT cleared on a successful feed** — you feed ten ore in a row;
>    the existing staleness sweep at `:162` clears it when the last unit is
>    gone.
> 5. Widen both arm gates to any occupied slot: `shell/main.js:514-517` and
>    `shell/input.js:411-412`. Drop the `FORM[...]?.tile || F.rig ||
>    F.phial` clause from each; keep `sub != null`. Both must stay
>    identical to each other — that is the "press 3 and the slot showing 3
>    cannot disagree" property `view/ui/quickbar.js:30-45` states.
> 6. `docs/SPEC.md`: add a subsection locking the four-rule LMB order, the
>    feed refusal strings and their order, and the one-unit-per-press rule.
>    Write it BEFORE you read it back in code, per `CLAUDE.md`'s "tuning
>    numbers belong in `docs/SPEC.md` first".
> 7. `tools/check.mjs`: one new probe. Place an altar, stand the player 6 px
>    from it, `run.write.collect` 3 copper ore, fire `cmd.feed` for exactly
>    ONE frame with the pair armed, and assert **exactly one** unit left the
>    pockets. Then **prove the probe has teeth**: make `handOne` a no-op,
>    confirm the probe FAILS, and report that seen-to-fail run. A probe you
>    did not see fail is a probe you have not written.
> 8. Verify by hand, and report exactly what you observed for each: click a
>    copper-ore slot and confirm the slot border lights up (it did nothing
>    before); aim at a furnace within reach and LMB — one ore goes in, and
>    the count in its buffer rises by one, not eight; aim at the same
>    furnace with a ladder rung armed and confirm you get `'IT DOES NOT
>    WANT THAT'` rather than a ladder placed inside the machine; aim at a
>    full furnace and confirm `'IT IS FULL'`; walk out of reach and confirm
>    LMB mines instead; press `z` and confirm the hand clears.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says. **No baseline should move** — this phase touches no
> `view/` file, so any screenshot diff is a bug, not an intended change.

**Acceptance (a physical action):** start a run, take the pickaxe, dig some
copper, hold `c` to collect it, open the Character tab, **click the copper
ore** — the slot lights up, which it has never done. Close the panel, walk
to the altar, point at it, and click ten times, counting. Cycle 1 pays. Then
point at the rock behind the altar with the ore still in hand and confirm you
feed the altar, not the rock — and that `z` releases it so you can mine.

### 6.3 FILE OWNERSHIP — Phase 16b (the drain becomes opt-in)

```
src/shell/ui.js           `autoFeed: false` beside `autoCollect` (:68) with a
                          header in the same shape; `toggleAutoFeed()` and
                          `setAutoFeed(bool)` beside :265. If 13c has landed
                          its setter, match its naming exactly.
src/shell/main.js         step()'s narrowed object `c` gains `autoFeed:
                          ui.autoFeed`; `__mf.ui` projection exposes it
                          (13c §4.5's own complaint, applied here so the new
                          flag is observable from a test on day one)
src/shell/schedule.js     the `machines` row's step gains `cmd` -- the second
                          sibling brought in line, exactly as 12b did for
                          `items`
src/rules/machines.js     `step(dt, cmd)`; `if (def.handFeed && cmd.autoFeed)
                          handFeed(m, def)`. handFeed's BODY is unchanged.
                          Its header gains the "this is the opt-in magnet;
                          the real verb is handOne" note.
src/shell/boot.js         reset ui.autoFeed in newRun's teardown, matching
                          whatever 13c decided for autoCollect (D16-C)
src/view/ui/mainPanel.js  an AUTO FEED row beside AUTO COLLECT (:162-174),
                          same drawPanel id idiom, same colours
src/data/machines.js      the two stale "feed key" comments (:655, :745)
src/rules/cycles.js       SPAWN_GAP's header: the bug it guards against is
                          now off by default. KEEP THE GAP -- an altar flush
                          against spawn is still bad framing; only the
                          reasoning changes.
tools/check.mjs           the ALTAR HAND FEED probe (:3537-3573, whose own
                          success line says "with no key held") and the
                          burden probe's +15 offset (:1154-1160); grep for
                          every other proximity-feed assumption
tests/visual.spec.js      every scene that feeds a machine by walking to it
docs/SPEC.md              §18.3's table row and the surrounding prose
docs/DEVELOPER_GUIDE.md   the buffers-and-pockets / input-intents sections
```

### 6.4 Paste-ready prompt — Phase 16b

> You are implementing Phase 16b of `docs/PLAN-phase16-interaction-model-v2.md`.
> **Phase 16a must already be landed and its acceptance walkthrough
> confirmed** — this phase turns off the path 16a replaced, and it is only
> safe because 16a proved the replacement works. Read `CLAUDE.md`
> (invariants 5 and 8), `docs/PLAN-phase12.md` §3 D-F (the `ui.autoCollect`
> precedent this phase copies line for line), `docs/PLAN-phase13.md` §4
> (13c — **check whether it has landed and match its decision on resetting
> the preference at `newRun()`; do not invent a second policy**), and
> `docs/PLAN-phase16-interaction-model-v2.md` §3.4, §3.5 and §5 D16-C.
>
> **Before changing anything, re-verify §3.4 and report what you found:**
> that `rules/machines.js#step` still takes no `cmd`, that `handFeed` is
> called unconditionally at `:98`, and that seven `data/machines.js` rows
> carry a `handFeed` block. If any of that is false, STOP and report — the
> phase rests on it.
>
> 1. Add `ui.autoFeed` (default `false`), `toggleAutoFeed()` and
>    `setAutoFeed(bool)`, mirroring `autoCollect` exactly. Expose it on
>    `__mf.ui`.
> 2. Thread it: `shell/main.js#step`'s narrowed `c` gains `autoFeed`;
>    `shell/schedule.js`'s `machines` row gains `cmd`;
>    `rules/machines.js#step(dt, cmd)` gates the `handFeed` call. **Do not
>    change `handFeed`'s body.**
> 3. `shell/boot.js`: reset it in `newRun`'s teardown, matching 13c.
> 4. `view/ui/mainPanel.js`: an AUTO FEED row beside AUTO COLLECT, its own
>    `drawPanel` id, dispatched from `shell/main.js#applyUiIntents` beside
>    the `onAutoCollect` branch (`:430-435`).
> 5. **The test blast radius is the whole phase.** Grep `tools/check.mjs`
>    and `tests/visual.spec.js` for every scene that gets material into a
>    machine by standing next to it — start from `handFeed`, `altar`,
>    `furnace`, `tribute`, `M.altar`, `M.furnace` — and for each one either
>    set `autoFeed` true or drive the real 16a feed intent. **State in your
>    report which you chose for each and why.** Prefer the real intent for
>    anything asserting the loop; prefer the flag for anything whose subject
>    is something else entirely (the burden fuzz, a lighting scene).
> 6. Two probes exist ONLY because of the bug you are fixing. **Do not
>    delete them; retarget them.** `tools/check.mjs:1154-1160` (the burden
>    probe's `+15` offset) and `rules/cycles.js:84-93`'s `SPAWN_GAP` may now
>    have their reasoning corrected — **keep the gap and keep the offset**,
>    and rewrite both comments to say the hazard is now opt-in rather than
>    unconditional. Removing the geometry would be a second, unrelated change.
> 7. Add a probe asserting that with `autoFeed` false, a player standing 4 px
>    from a fed-capable altar for 240 substeps with 10 ore in the pockets
>    loses **nothing**. Prove it has teeth by flipping the gate and confirming
>    it FAILS. Report the seen-to-fail run.
> 8. Fix the stale prose: `data/machines.js:655` and `:745`, `docs/SPEC.md`
>    §18.3's `hub` table row, and `docs/DEVELOPER_GUIDE.md`. All three
>    currently assert a feed key that 16a made real — make them describe the
>    verb that now exists.
> 9. Verify by hand: fresh run, walk right up to the altar with ore in your
>    pockets and stand there — **nothing happens.** Point and click, and it
>    goes in one at a time. Turn AUTO FEED on in the Character tab and
>    confirm today's magnet behaviour returns exactly. Restart and confirm
>    the toggle is back off (matching 13c).
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says, and for every baseline that moved, say why. The AUTO FEED
> row is a real, expected diff in the Character tab; anything else moving is
> a regression.

**Acceptance (a physical action):** start a run, fill your pockets with ore,
and **walk a full lap around the altar without losing a single unit.** Then
click it ten times and pay cycle 1. Then turn AUTO FEED on and walk past it
and watch it eat everything — deliberately, because you asked.

### 6.5 FILE OWNERSHIP — Phase 16c (legibility)

```
src/view/ui/slot.js       frameSlot draws a second, inset border (D-I, never
                          landed -- git-proven, §3.6 #1). Both callers get it
                          free; do not add a parameter.
src/view/ui/quickbar.js   the IN HAND readout above the quickbar, drawn only
                          when ui.armedPlace is set. ANCHORED over measured
                          text (D8), never a hardcoded origin. LEGEND gains
                          the feed verb.
src/view/hud.js           buildGhost gains TWO branches: the feed indicator
                          (reading model/machines.js#feedCheck, written in
                          16a) and the missing F.phial ghost (§3.6 #2)
src/data/callouts.js      beat 5 gains a verb
tests/visual.spec.js      2-3 new baselines: an armed slot's double frame;
                          the IN HAND line; the feed indicator over a furnace
docs/DEVELOPER_GUIDE.md   the widget-primitives section, if it describes
                          frameSlot's single border
```

**Explicitly not in 16c:** the Crafting tab (§4.5 — it already implements
Factorio's own conclusions and needs nothing); any layout change beyond the
one new anchored line (`docs/FINDINGS.md` #13 stays parked, per
`docs/PLAN-phase13.md` §2.5); a mouse-following cursor icon (§5 D16-A's
rejected alternative); any tooltip change.

### 6.6 Paste-ready prompt — Phase 16c

> You are implementing Phase 16c of `docs/PLAN-phase16-interaction-model-v2.md`.
> 16a and 16b must both be landed. Read `CLAUDE.md` (invariants 9 and 11 —
> integer pixels, no `fillText`, `view` never mutates `model`; and D2 and
> D8), `docs/PLAN-phase12.md` §3 D-I, and
> `docs/PLAN-phase16-interaction-model-v2.md` §3.6, §4.4 and §5 D16-E.
>
> **This is the only phase in this wave that touches `src/view/`. Nothing
> else may run concurrently** — check `docs/PLAN-phase13.md`'s 13a and 13b
> are not in flight.
>
> 1. First, confirm and report: `git log -- src/view/ui/slot.js` shows no
>    Phase 12 commit, and `frameSlot` (`:70-75`) still draws a single 1-px
>    border. `docs/PLAN-phase12.md` D-I claims otherwise. Then land it: a
>    second border inset by one pixel in the same colour, four more `R()`
>    calls, no new parameter and no new primitive.
> 2. `view/ui/quickbar.js`: an `IN HAND <label>` line immediately above the
>    quickbar, drawn ONLY when `f.ui.armedPlace` is set. Compose the label
>    the way `view/ui/mainPanel.js#pairTooltip` (`:295`) already does
>    (`SUB[sub].name + ' ' + FORM[form].label`) — do not invent a second
>    label composer. **Position it by measuring the text and anchoring off
>    the quickbar's own geometry** (D8); a hardcoded origin will be rejected.
> 3. `view/hud.js#buildGhost`: two new branches, after the existing
>    `linkFrom` early-return. (a) If a machine is under the reticle and
>    `model/machines.js#feedCheck(m, armed.sub, armed.form)` is ok, outline
>    its footprint in `UI.good` and print `have/cap` beside it; if not ok,
>    outline in `UI.heart` and print `check.why`, reusing
>    `drawFootprintGhost`'s own refusal-text idiom (`:547-551`) rather than
>    a second one. (b) An `armed.form === F.phial` branch — today a miracle
>    is the ONE arming state with no world feedback at all, and it is the
>    branch that overrides mining entirely. **You may not import `rules`.**
>    `feedCheck` is a `model` query written in 16a precisely so this is legal
>    — if it is not there, STOP and report.
> 4. `data/callouts.js:25`: beat 5 gains the verb. Content, not a literal in
>    `view/`.
> 5. Add 2-3 baselines at the desktop viewport: an armed slot showing the
>    double frame; the IN HAND line with something armed; the feed indicator
>    over a furnace, both accepting and refusing. **Drive every one through
>    the keyboard or the model, never through hardcoded click coordinates** —
>    `CLAUDE.md`'s own "mistakes already made" names that exact failure.
>    **And prove each test is not vacuous**: confirm the pixels differ with
>    the feature off, per the "a test can silently test nothing" entry.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says. Baselines WILL move (the double frame touches every scene
> with an armed slot). Re-accept with `npm run test:visual:update`, and in
> the commit message say why the pixels moved and name any baseline that
> moved for a reason you did not expect. `maxDiffPixels` stays 0.

**Acceptance (a physical action):** arm a ladder rung with the panel closed
and read what is in your hand off the screen without opening anything. Point
at a furnace with ore armed and see, before you click, that it will take it
and how full it is. Point at it with a rung armed and see, before you click,
that it will not. Arm a miracle and see a ghost where there has never been
one.

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

### 7.1 The user's two loop asks map onto plans that already exist

| the ask | where it lives | status |
|---|---|---|
| "offering stuff to the gods on a timer" actually working | `docs/PLAN-phase13.md` §5.3, **Phase 13d** items 1, 2, 3, 8, 10 | proposal, needs a greenlight |
| "randomly procedurally generated bonus or divine recipes" | `docs/PLAN-phase13.md` §5.2 items **4** (draft is 1-of-1) and **5** (three of four tiers have exactly one content row) | audited, deliberately out of 13d's scope, **no plan yet** |

**I am not re-planning either.** 13d is written, sized and ready for a
greenlight. Items 4 and 5 are not, and §7.3 says where they should go.

### 7.2 Sequencing call: **this document lands after 13d, not before**

Three reasons, in order of weight:

1. **16's own acceptance criteria want a loop that says something.** 16a's
   walkthrough is "click the altar ten times and cycle 1 pays" and 16b's is
   "pay cycle 1 deliberately" — and 13d item #8 is the phase that makes
   completion audible and visible at all. Testing a new delivery verb against
   a loop that completes in silence is testing half of it.
2. **13d's acceptance criterion is worded against the automatic feed.**
   `docs/PLAN-phase13.md` §5.3's own line: *"try to pay cycle 2 by
   hand-feeding three plates to the same altar — and fail."* If 16b lands
   first, that sentence needs rewriting before 13d's agent can follow it. If
   13d lands first, it is true as written and 16b simply inherits the fixed
   `cyc.at` gate. **Cheaper in that order.**
3. **`src/view/` contention.** 13a (contrast) and 13b (ladder sprite) both
   own `src/view/` broadly, and 16c owns `view/hud.js` + two `view/ui/`
   files. Wave 4's own rule (`docs/BUILD_PLAN.md`, and
   `docs/PLAN-phase13.md` §6) is that those do not run concurrently. Putting
   16 after the whole of 13 is the only ordering that needs no new
   coordination.
4. **D16-A's revision (§5) adds a fourth, harder dependency: 16 must also
   land after `docs/PLAN-phase14-mining-and-drops.md`'s 14a.** D16-A's
   original argument for "target decides over type decides" rested on
   `log` and `gravel` both being double-duty; 14a's D14-A/H removes both
   counterexamples. Landing 16 before 14a means building D16-A's
   type-vs-target distinction while it is still a real correctness question
   with two live counterexamples, and having a phase agent re-verify it
   once 14a lands anyway. Landing it after means citing 14a's own commit as
   proof the two models already agree, which is strictly less work. **Net
   ordering: 14a, then 13 (a→b→c→d), then 15, then 16** — 15 sits between
   13 and 16 only because of its own budget dependency on 14a (§2.4 of that
   document), not because of any dependency on 13 or 16.

**No file conflicts either way**, which is worth saying so the ordering reads
as a judgement rather than a constraint: 13d owns `rules/cycles.js`,
`data/machines.js`'s `cloud_dock` row, `shell/notify.js`, `data/sfx.js`,
`data/callouts.js`, `rules/tutorial.js`, `view/hud.js`'s win screen. 16 owns
`rules/machines.js`, `model/machines.js`, `shell/input.js`,
`shell/main.js`, `shell/ui.js`, `shell/schedule.js`, `view/ui/slot.js`,
`view/ui/quickbar.js`. **Two overlaps, both small and both in 16's later
phases:** `data/callouts.js` (13d extends past index 6; 16c edits index 5)
and `view/hud.js` (13d adds a win screen; 16c adds two `buildGhost`
branches). Serial ordering makes both non-events.

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

| risk | why it is likely | mitigation in this plan |
|---|---|---|
| **A machine under the reticle now steals a mining click whenever something is armed.** D16-A rule 2 outranks placement and mining. | This is the direct, stated cost of overloading one button for a fourth verb. A player who mines beside their own furnace will hit it. | `z` clears the hand in one press (shipped, Phase 12d). Rule 2 additionally requires the machine to *accept* the armed pair, so an armed ladder rung never blocks mining beside a furnace. Named in D16-A rather than discovered, and 16a's step 8 exercises it by hand. |
| **16b turns off a mechanic that ~4 harness probes and an unknown number of Playwright scenes depend on, and a proximity-feed test does not fail loudly — it just stops moving material and asserts zero.** | `tools/check.mjs:3537-3573`'s ALTAR HAND FEED probe asserts `held === 0 && left === 0` — and with the drain off, `held` is still 0. **The probe passes while proving nothing**, exactly the hollowing-out `docs/PLAN-phase13.md` §4.4 documents for the burden fuzz. | 16b's prompt step 5 requires a grep-then-classify pass over both files with a per-scene justification, and step 7 requires a new probe **seen to fail**. This is the single biggest risk in the document and the reason 16b runs alone. |
| **Widening the arm gate to any occupied slot arms things that cannot do anything**, e.g. a relic or a plate with no machine in sight. | Six of eleven form kinds become armable with no consequence attached. | This is intentional and it is Factorio's own model (§4.1): the hand does not classify. 16c's IN HAND readout is what makes it legible, and rule 4 (mine) is a perfectly sensible fallthrough. Named so a reviewer does not read it as an oversight. |
| **`feedCheck` becomes a second implementation of "does this machine accept this pair"** beside `rules/machines.js#acceptedBy`/`capOf`. | Two functions answering one question is exactly the drift `CLAUDE.md`'s one-decision-two-readers rule exists to forbid, and the pressure to copy rather than move is real when the layer boundary is in the way. | 16a's prompt step 1 names this explicitly and requires the agent to either move the pair down into `model` or state why not — and forbids leaving two. `placementCheck` and `linkCheck` are the two shipped precedents for a decision living in `model` so both `rules` and `view` can read it. |
| **The IN HAND line collides with the quickbar or the hints toggle at a narrow viewport.** | `view/ui/quickbar.js:64-66` positions the quickbar off `W`/`H` and the hints toggle sits at `H - 11`; a new line between them is exactly the overflow D8 was written about. | D8 is quoted in 16c's own prompt as a rejection condition: anchored over measured text or the phase is not done. `view/ui/bar.js:45-54`'s measured-value clamp is the shipped precedent. |
| **D16-D's sticky-slot map becomes a second source of truth for what the player carries.** | Any auxiliary structure beside `run.inv` is one forgotten reset away from disagreeing with it. | It is advisory only: an occupied or out-of-range remembered index falls straight through to today's behaviour, so `run.inv` remains the sole authority and every aggregate query is untouched. Reset by `write.reset()` with everything else (invariant 8). And it is a **separately declinable** decision — drop D16-D and nothing else in this plan changes. |
| **16c's double frame moves every baseline that has an armed slot in it, on top of whatever 13a's recolour already moved.** | Two legitimate view changes landing in the same wave. | Strict serial ordering (§7.2: all of 13, then 16), and 16c's prompt requires every moved baseline to be reviewed as an image with its cause stated — the same discipline `docs/PLAN-phase10.md` §10c and 12c2 both used. |
| **`docs/SPEC.md` §18.3 and `data/machines.js`'s two comments become *newly* true in 16a and are then edited again in 16b.** | Prose that describes a verb that half-exists is worse than prose that describes one that does not. | 16a locks the verb in a new SPEC subsection; 16b corrects §18.3's table row and the two code comments in the same commit that makes the automatic path opt-in. Named in both ownership blocks so neither agent thinks the other did it. |
