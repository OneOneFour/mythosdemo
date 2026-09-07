# Plan — the interaction model, audited and unified

**Status: BUILT. Phases 12a, 12b, 12c, 12c2 and 12d are all committed**,
ending with a 12d gap-fix retiring the last stray craft key. Kept below as
the design record; the "PROPOSAL" framing that follows describes the plan
before it was executed.
This is the plan-mode step `docs/BUILD_PLAN.md`'s own convention requires
before a phase this size touches code — the same convention `docs/PLAN-
phase10.md` followed. It answers the user's own two-message brief: an audit
of every key under the KEYS menu, and a redesign of the quickbar so it is
"an extension of inventory that's just always there on screen."

Read `CLAUDE.md` in full, `docs/PLAN-phase10.md` as the structural template,
`docs/DEVELOPER_GUIDE.md`'s "Input intents" section (`:1133-1179`), and
`.claude/brain/notes.md`'s "Key binding inventory" table (`:142-167`) before
this. Everything below was read directly out of the repo at commit `dee2836`
(Phase 11 harness, the tip at time of writing); every `file:line` is real.

**The honest scale assessment the user asked for.** This touches every
physical control in the game and the one always-on HUD element every other
phase leaves alone. It is not bigger than Phase 10 in file count, but it is
bigger in *risk* — Phase 10 added a system nothing depended on yet; this
phase removes and repurposes controls the current build (and its own test
suite) already exercises today. That is why it is four *serial* phases, not
parallel ones, and why the phase that actually deletes a key runs last, after
every replacement path has been proven redundant first.

---

## 1. The brief, verbatim, as given

Verbatim user messages salvaged to `.claude/brain/interaction-model-brief.md`.
In short: audit every key, collapse mining/placing/miracle-use/craft-queue
onto LMB, `e` opens the panel, `r` is the generic hold-to-act verb, `z`
cancels, `c` is manual collect behind an AUTO COLLECT toggle, and `x`/`u`/
`p`/`v` are retired as dedicated keys. The quickbar becomes a live,
unassigned mirror of whatever the player currently holds.

---

## 2. Recon — every key and pointer control that exists today

### 2.1 The full audit table, file:line cited

| key | current action | file:line |
|---|---|---|
| `w a s d`, arrows | movement | `shell/input.js:85-89` (`KEYS` table) |
| space | hop, **edge** | `input.js:97` |
| `x`, `j` | dig, **hold** | `input.js:98` |
| `e` | place, **edge** | `input.js:99` |
| `u` | craft, **hold** | `input.js:100` |
| `f` | turn a crank, **hold** | `input.js:112` |
| `q` | drop heaviest held pair, **edge** | `input.js:117` |
| `Backspace` | deconstruct, **edge** | `input.js:122` |
| `v` | use the first held miracle, **edge** | `input.js:128` |
| `p` | equip the first unequipped trinket, **edge** | `input.js:132` |
| `l` | arm/link two hubs into a segment, **edge** | `input.js:142` |
| `g` | toggle `flags.showGrid` | `input.js:314` |
| `c` | toggle `flags.showChunks` | `input.js:315` |
| `h` | toggle `flags.showDebug` (the master gate `t/b/k/y` already sit behind) | `input.js:316` |
| `i` | toggle the main panel (`toggle('main')`) | `input.js:317` |
| Escape | blur search / pop top panel / cancel armed place / cancel armed link | `input.js:287-329` |
| `o` | toggle the full-screen map overview | `input.js:333` |
| `m` | mute | `input.js:334` |
| `r` | restart (`wants.restart = true`), live at **any** time, not gated on death | `input.js:335` |
| `t b k y` | debug drafts (trinket/boon/grant/miracle), gated on `flags.showDebug` | `input.js:341-344` |
| digits `1234567890` | arm the *assigned* quickbar slot for placement | `input.js:366-372`, mapping owned by `view/ui/quickbar.js:36-43` |
| LMB, world, no panel open | `cmd.mouse = true` (a **hold**) — already ORed into `cmd.dig` in `shell/main.js:96` | `input.js:496` |
| RMB, world, no panel open | deconstruct the aimed machine, else `cmd.place = true` (**edge**) | `input.js:494-496` |
| LMB, panel open | UI dispatch: tab/slot/search click, drag start/resolve | `input.js:481-484`, dispatch in `main.js:373-530` |
| mouse wheel | scroll the focused grid, only while a panel is open | `input.js:521-536` |
| free letters today | `z`, `n` (`f`, `l` are **not** free — both are live, see §2.6) | confirmed by grepping every `KEYS`/`if (k ===` clause in `input.js`; contradicts `.claude/brain/notes.md:166-167`, which is stale — see §7.3 |

`input.js:109-111`'s own comment states the live binding set explicitly
("wasd/arrows, space, x/j, e, u, q, backspace, v, p, l, g, c, h, i, escape, o,
m, r, the digits, and t/b/k/y behind `flags.showDebug`") — this is the
canonical inventory the brief asked to be audited, and it matches the table
above exactly.

### 2.2 `hasPick`/mining gate, and why LMB already half-does what the brief wants

`rules/mining.js#step` (`:137-207`) gates on `!hasPick() || !cmd.dig ||
!aim.valid`. `shell/main.js:96`, `const digging = cmd.dig || cmd.mouse;`,
already makes LMB a second, fully redundant way to dig — **the brief's "no
dedicated dig key" ask is already three-quarters true today**: `x`/`j` are
one path, the mouse is the other, and removing `x`/`j` costs mining nothing
at all. The only thing that has to move onto LMB that is not already there
is **placement** and **miracle-use**.

### 2.3 The hand-craft hold vs. the existing click-to-queue path

`rules/crafting.js#step` (`:63-118`) reads `cmd.craft` as a **hold** —
release it or lose the ingredients and the bar resets to zero (`:64-66`).
This is the mechanic `u` drives directly. But `shell/ui.js#ui.craftQueue`
(`:32-49` comment, mechanism at `main.js:81-88` and `main.js:540-547`)
already turns a **single click on a recipe tile** into a fully-automatic
completion: `shell/main.js:412-434`'s `applyUiIntents` queues the recipe on
click (`queueCraft`, respecting afford-check `canCraft`), and `step()`
re-asserts `cmd.craft = true` every substep the queue is non-empty
(`main.js:88`) — the player does not have to hold anything down. **This is
already exactly "craft = LMB, select then act"**, and it already ships. The
`u` key is a strictly worse, fully redundant alternate path to the same
mechanic, exactly the shape the `p`/drag-to-equip redundancy already has
(§2.4). See D-B.

### 2.4 The equip key vs. drag-to-equip

`rules/trinkets.js#equipFirst` (`:45-56`) is `p`'s whole mechanic: fill the
first empty slot with the first held-but-unequipped trinket, no choice of
which. `shell/main.js:495-517`'s UI dispatcher already implements a real
**per-slot** drag-to-equip/unequip/swap through `model/run.js#write.equip`
directly — richer than `p` ever was (`p` cannot target a *specific* slot or
unequip anything). `p` has been a fully redundant, strictly worse alternate
path since that drag code landed (confirmed independently by a DESIGN.md
staleness finding from Phase 10's own recon: *"`p` key... is now a
redundant alternative, not the only path"*). Removing it costs
nothing. See D-title "removed keys" in §4.

### 2.5 The magnet: automatic pickup, exactly, and where it lives

`rules/items.js#step` (`:100-132`). The unconditional pickup test:

```
if (it.age > MAGNET_DELAY && !run.dead && near(it, c, pickupR)) { ... }
```

`MAGNET_DELAY` = 0.35 s (`:41`, "so you see it fall"), `pickupR` = 10 px
(`data/tuning.js:34`, `eff('pickupR')`), `near()` (`:205-208`) is a plain
circle test around `playerCentre()`. There is **no** existing "aim at a
specific fallen item" query anywhere in the codebase — aim (`model/aim.js`)
only ever resolves a *tile* coordinate; items are continuous-position
entities. The only existing "stand near a thing and it works" idiom for
anything item-shaped is `rules/machines.js#handFeed` (`:138-148`,
`overlaps(playerBox(), m.box, reach)`), which is a **box** overlap, not the
circle `near()` already is. Reusing `near()`/`pickupR` verbatim, gated by a
new held flag, is strictly cheaper than inventing an aim-at-an-item query and
needs zero new geometry. See D-E.

### 2.6 `f` already *is* the "action/crank" verb the brief asks `r` to be

`rules/drive.js:160-180` (`cmd.turn`, a **hold**, "the crank turns only while
the player holds it," CLAUDE.md D10's own "manual only, for now" clause) is
driven exclusively by `f` (`input.js:112`, with a 30-line comment recording
that `f` was deliberately freed from an earlier retired debug spawn and
re-used here). **This is not a new mechanic to build — it is a rename.**
`f` is not free (contradicting `.claude/brain/notes.md:166`, which predates
this binding and is stale — see §7.3); `r` is not free either (it is
restart, live at any time, `input.js:335`) — so this is a genuine two-key
swap, not a one-line edit. See D-C, D-J.

**§2.7's recon (the pre-slot-grid `run.inv` dict shape, its full blast
radius across five independent scan copies, and the pickup/drag primitives
it would reuse) is gone with the code it described.** `run.inv` is a real
fixed-capacity slot array today (`model/run.js#RUN_SCHEMA.inv`); D-G/D-H and
§4.6 below are the design it justified, unaffected by the recon's removal.

### 2.8 The armed-selection highlight, today

`view/ui/slot.js#frameSlot` (`:70-75`) draws a **single 1-px border**,
called from `view/ui/mainPanel.js#frameArmedSlot` (`:110-115`, colour
`GOOD`) for the Character tab's inventory grid, and again from
`quickbar.js:73-75` for the quickbar's own grid — same colour, same function,
correctly not duplicated. Confirmed thin and easy to miss at this project's
resolution (upscaled nearest-neighbour from a ~1/2-1/6 window buffer,
CLAUDE.md's own Conventions section).

### 2.9 `aim.mode` — a hook already built, never wired

`model/aim.js:13,23` declares `aim.mode: 'dig' | 'place'` and a
`write.mode()` setter, with the comment "what it MEANS is a `rules`
decision... the reticle is drawn differently for each." `view/hud.js#reticle`
already reads it (`col = aim.mode === 'place' ? UI.good : '#ffe9a8'`). **No
caller anywhere in `src/` ever calls `write.mode('place')`** — grepped
directly, the only write is the reset default (`aim.js:26`). This is dead
scaffolding, built for exactly the disambiguation this phase needs, sitting
unused. See §4.2.

### 2.10 The map's digit pre-emption already isolates it from anything this phase touches

`shell/input.js#mapKey`/`mapDigit` (`:224-254`) claims the digit row
**before** `set()` runs at all, whenever `flags.showMap` is true
(`input.js:308-311`, "pre-empted BEFORE `set()`... for the reason a key that
latched `cmd.up` on the way into the map would still be latched on the way
out"). The quickbar's own digit-arm block (`:366-372`) runs unconditionally
**after** that guard. Redesigning what `ui.quickbar[qslot]` *means* (§4.4)
changes nothing about this ordering — `mapDigit` still returns before the
quickbar block is ever reached while the map is open. Confirmed unaffected;
no change needed here.

### 2.11 `.claude/brain/notes.md` is already stale on exactly this subject

`.claude/brain/notes.md:142-167`, "Key binding inventory (as of 2026-08)":
lists `f`, `l` as free letters, and describes `i` as toggling `flags.showInv`
**and** the panel stack. Neither is true today — `flags` (`input.js:82`) has
no `showInv` field at all, `f` drives the crank (§2.6), `l` drives link
(`input.js:142`). This file's own header says facts in it "may be stale" and
scratch notes are not policy — noted here because §7 owes a correction
regardless of whether Phase 12 lands, and because it is the exact "free
letters" ledger a phase touching this many keys must not trust blindly.

### 2.12 `docs/SPEC.md` / `docs/DESIGN.md` document no control scheme

Grepped both files for "controls", "keybind", "key map" and every literal key
mentioned in this plan. **Neither file documents the current keymap
anywhere** beyond incidental content references (e.g. `SPEC.md:313`,
"identical input KEYS" meaning recipe *selector* keys, not physical ones).
So this phase owes **no SPEC/DESIGN correction** — the only stale prose that
exists is `quickbar.js`'s own `LEGEND` string, `input.js`'s own inline
comment, `docs/DEVELOPER_GUIDE.md`'s "Input intents" section, and
`.claude/brain/notes.md`. All four are named in §7.

### 2.13 Adjacent, out-of-scope housekeeping the user's session also surfaced

Two items were named alongside this brief but are **not** interaction-model
changes:

- **The `rung` form's label** (`data/forms.js:148`, `label:'RUNG'`) reads
  "TIMBER RUNG" in the HUD. A one-line content edit with zero coupling to
  anything in this plan — **out of scope**, land separately.
- **The armed-slot border** (§2.8) *is* in scope, because §4.4's quickbar
  redesign makes selection the primary interaction surface of the whole game
  — exactly the trigger condition that pulls it in. See D-I.

---

## 3. Open decisions — each with a recommendation and rejected alternatives

### D-A — what LMB means in every context. **THE BIG ONE.**

Four things could all be simultaneously true of one aimed tile: it could be
solid and mineable, it could be open and awaiting a placed pair, something
could be armed, and that armed thing could be a miracle (whose whole point
is acting on *solid* terrain, not open ground). A single rule cannot treat
"is the tile solid" as the only signal, because that signal means opposite
things for a placeable pair and for a miracle.

**Recommended rule, evaluated in order, at the moment LMB goes down** (not
re-evaluated every frame of a held press — see below):

1. **If a miracle (`F.phial`) is armed, LMB always fires it** at the aimed
   tile, regardless of whether that tile is solid — `rules/miracles.js#use`
   already takes `(band, tx, ty)` with no occupancy precondition of its own.
2. **Else, if a placeable pair (tile-form or `F.rig`) is armed AND the
   aimed tile is not solid** (`tileAt(band,tx,ty) !== AIR`), LMB places it —
   exactly today's `cmd.place` consumer, unchanged.
3. **Else, LMB mines** — exactly today's `cmd.mouse`, unchanged.

**Where the decision is made, and why it needs no new "guard" state.**
`shell/input.js`'s existing `pointerdown` handler (`:494-496`) already reads
`aim` and decides RMB's place-vs-deconstruct branch at the instant of the
press, not every frame. Extending the **same** branch's final `else` (today
`cmd.mouse = true`) to run rule 1-3 above, **once, at pointerdown**, and set
either `cmd.place = true` (edge) or `cmd.mouse = true` (hold) accordingly,
means a single continuous press can never flip meaning mid-hold: if the
press decided "place," `cmd.mouse` is never set true for the rest of that
press, so mining cannot spuriously start on the tile you just placed one
frame later even if the button stays down. If the press decided "mine,"
mining behaves exactly as it does today for the whole hold, including
tracking the aim across tiles while walking. **No new `cmd` field, no new
latch.** The one accepted behavioural change: a player who is holding LMB
down (decided "place" at press-time) and then walks into a wall while still
holding will not start mining that wall without releasing and re-pressing.
Documented as an accepted trade in §4.2 and the risk register, not hidden.

**Rejected alternatives:**

- **A global mode-toggle key** flipping LMB's meaning between mine/place.
  Rejected: reinstates exactly the "am I in dig mode or place mode" friction
  the user is trying to escape by having one button that "just does the
  right thing."
- **Always attempt placement first, fall back to mining the same frame on
  refusal.** Rejected: `placementCheck`'s refusal reasons (footing, occupied
  footprint, out of bounds) would have to be threaded back into a same-frame
  mining decision, coupling two independent decision systems for a case the
  simpler tile-occupancy test already resolves correctly.
- **Aim-based item pickup wired into the same LMB press.** Not needed —
  pickup is a separate, opt-in verb per the brief (`c`), not part of LMB at
  all. See D-E.

**Accepted, stated cost:** arming a miracle blocks ordinary LMB-mining
entirely for as long as it stays armed (rule 1 always wins). This is a real
consequence of overloading one physical control for both verbs; the
mitigation is that clearing an arm is a single `z`/Escape press (§4.3). Named
in the risk register.

**One naming note, not a separate decision:** `ui.armedPlace` keeps its
current name. It now also drives mining-vs-place disambiguation and
miracle-use, but renaming it ripples into `mainPanel.js`, `quickbar.js`,
`main.js`, `input.js`, **and** the `__mf.ui.armedPlace` key the test hook
already exposes publicly (`main.js:706`) — a rename with no functional
benefit large enough to justify touching a public test-hook surface. Update
its header comment in `shell/ui.js:56-67` to describe the three-way
consequence; do not rename the field.

### D-B — how craft becomes LMB

**Recommended: it already is.** §2.3 shows the existing recipe-grid click
(`main.js:412-434`, `queueCraft`) already turns one LMB click into a fully
automatic, self-completing craft — no hold required, richer than `u` ever
was (ctrl-click for x99, shift-click for x5, `main.js:430`). **Nothing new
is built for craft.** Remove `u` and its `cmd.craft` hold-key binding; the
craft queue's own re-assertion of `cmd.craft` every substep it is non-empty
(`main.js:88`) is untouched, since it never depended on any key, only on the
queue's own contents.

**Rejected alternatives:**

- **"Select a raw ingredient, then LMB crafts its first matching recipe."**
  Rejected: ambiguous the moment two recipes share an input selector,
  silently declaration-order-dependent (`rules/crafting.js#choose`'s own
  documented "first match wins" rule), and duplicates a decision `choose()`
  already makes more legibly through the panel's own affordability tinting.
- **Keep `u` as a redundant alternate,** matching how `p`/drag-to-equip
  coexisted for a while. Rejected only because the user explicitly asked for
  its removal by name ("as is 'u' for craft (unneeded) remove these") —
  otherwise this would be the safest option and is named here so the human
  reviewer can restore it cheaply if desired.

### D-C — where restart goes

`r` is spoken for (action/crank, D-J). Restart (`wants.restart`,
`input.js:335`) has never been gated on death — it is live at any time, with
zero UI affordance beyond the key itself; the death screen's own printed
text, `'PRESS R TO BEGIN THE NEXT TORMENT'` (`view/hud.js:744`), is the only
place the game ever tells the player the key exists.

**Recommended: a real clickable button, drawn on the death screen,** hit-
tested the same way every other panel-shaped rect in this project already is
(`view/ui/state.js#drawn`, `shell/main.js`'s dispatcher pattern). This is a
strict improvement over today (a discoverable button vs. a printed
instruction naming a key that is about to mean something else), and it costs
one new `drawn.panels` entry plus one dispatch branch, the same shape
`onAlwaysOnUi`/`hints-toggle` already is (`input.js:424-428`).

**Rejected alternatives:**

- **Move restart to any other free letter** (`z`, `n`). Rejected: `z` is
  spoken for (D of §4.3), and parking a genuinely destructive, whole-run-
  ending action on a bare, undiscoverable letter is worse UX than the button
  this recommendation ships instead, not merely a lateral move.
- **Drop the anytime-mid-run restart entirely, keep it death-screen-only.**
  Considered and folded in implicitly — a button only needs to be **drawn**
  on the death screen for the death-screen use case; nothing in this plan
  proposes a *general* "give up" button elsewhere, since nothing in the
  brief asked for one and no existing UI surface has a natural home for it.
  If a mid-run "abandon this Torment" affordance is wanted later, it is a
  small addition to the main panel, explicitly **not designed here** (§8).

### D-D — where `c` (chunk-overlay debug toggle) goes

**Recommended:** fold it behind the single `flags.showDebug` gate `h`
already provides, on the letter **`p`** — which this same phase frees by
retiring the equip key (D of §4, "removed keys"). Concretely: `p` becomes a
no-op unless `flags.showDebug` is already true, at which point it toggles
`flags.showChunks`, matching exactly the existing precedent for `t`/`b`/`k`/
`y` (`input.js:340-345`) and directly answering the brief's own suggestion
("whether debug toggles should move behind a single gate... rather than bare
letters").

**Rejected alternatives:**

- **Leave `showChunks` on `c`, pick a different letter for collect.**
  Rejected outright: the user explicitly asked for `c` = collect by name.
- **Retire the chunk overlay entirely.** Rejected: it is load-bearing for
  chunk-seam debugging (CLAUDE.md's own "mistakes already made" section
  names chunk-seam bugs explicitly), and removing a working debug tool as a
  side effect of an unrelated keymap cleanup is a scope violation this plan
  should not smuggle in.

### D-E — the manual-collect mechanic

**Recommended: reach-based, a HOLD, reusing `pickupR`/`near()` verbatim.**
`rules/items.js#step`'s existing per-item circle test (`:112`,
`near(it, c, pickupR)`) already answers "is this item close enough" every
frame for every item; the only change is gating the *pickup branch* itself
on a new held flag instead of being unconditional (§4.5). A HOLD, not an
edge, so standing in a small pile sweeps it up over a couple of frames the
same way the crank/mining/craft hold idiom already reads ("the player must
stand there holding it").

**Rejected alternatives:**

- **Aim-based, single-item.** Rejected: there is no existing "aim at a
  specific fallen item" query anywhere in this codebase (§2.5) — items are
  continuous-position entities, aim only ever resolves a grid tile. Building
  one is new geometry work the reach-based design gets for free by reusing
  what already runs every frame.
- **A larger, dedicated "collect reach" tunable distinct from `pickupR`.**
  Rejected: `pickupR` already answers exactly this question ("how close must
  an item be"); inventing a second number for the same concept is the kind
  of duplicate-tunable drift `CLAUDE.md`'s "tunables are split by name"
  section exists to prevent.

### D-F — where the auto-collect toggle's state lives

**Recommended: `shell/ui.js`, a new `ui.autoCollect` boolean, default
`false`.** Not `run.autoCollect`. The decisive fact is layering, not taste:
`rules/items.js` may only import `core`, `data`, `model`
(`tools/layers.mjs:22`, `rules: ['core','data','model']` — NOT `shell`). If
the toggle lived in `shell/ui.js`, `rules/items.js` could not read it by
import under any circumstance. It does not need to, because this project
already has the exact mechanism for exactly this class of fact: `shell/
main.js#step()` already resolves a "which device/preference asked" question
into a narrowed per-frame object handed to `rules` (`digging = cmd.dig ||
cmd.mouse`, `main.js:96`, its own comment: *"which DEVICE asked is a shell
question"*). Auto-collect is the identical shape — `step()` folds
`ui.autoCollect || cmd.collect` into the same narrowed command object already
passed to every rule, and `rules/items.js#step` gains `cmd` as a second
parameter (mirroring `mining.step(dt,cmd)`, `crafting.step(dt,cmd)`,
`drive.step(dt,cmd)` — three of six sibling `rules` steps already take it;
`schedule.js:193`'s items row is the one exception being brought in line).

**Rejected alternative — `run.autoCollect`:** would need a `RUN_SCHEMA`
field, a `write.reset()` entry, and (per invariant 8) would silently forget
the player's chosen preference on every restart — for a fact with **zero**
effect on world-state reproducibility (toggling it consumes no `rand()`, and
inputs already affect run outcomes by design, so this is not an invariant-7
concern). Putting a UI preference on `run` buys nothing the shell-side
narrowed-command channel doesn't already give for free, and creates the
exact "does this reset on restart" ambiguity CLAUDE.md's `model`/`rules`
split exists to answer definitively rather than case-by-case.

### D-G — the inventory becomes a real, fixed-capacity slot grid, and what a slot is

**Superseding note.** This replaces the shipped D-G (`heldPairs()`, a live
derived mirror with no capacity) outright, per the user's own explicit
clarification (§2's brief, message re-quoted at the top of §2.7): *"30
inventory slots, including the 10 in the quickbar... now i have 40 inventory
slots. I can click and drag things to rearrange."* Confirmed on direct
follow-up: this is a real fixed-capacity grid with **positions**, not a
display-order preference over an unlimited list, and a full inventory
**refuses** a new pickup — the item stays on the ground. `heldPairs()` and
everything built on it (old D-G, old D-H, old §4.6, old §6.3) is deleted.

**Recommended shape.** `run.inv` changes from a sparse dict to a **fixed-length
array**, `Array(mainSlots + quickbarSlots)` of `{sub, form, n} | null`. Two new
`data/tuning.js` rows, `invSlots` (base **30**) and `quickbarSlots` (base
**10**) — the user's own 30-main-plus-10-quickbar example, locked as the
default via a tunable rather than a hardcoded literal, following the exact
precedent `trinketSlots`/`eff('trinketSlots')` already set (§2.7.6): a slot
*count* is content, the same way a machine's recipe list or a substance's mass
is, and a future boon widening it costs nothing structurally, exactly as
`trinketSlots`'s own row comment already anticipates for equip slots.
`RUN_SCHEMA` gains one new field, `mainSlots: 0` (a placeholder, same
convention `inv`/`equipped` already use), fixed at `write.reset()` time from
`Math.round(eff('invSlots'))` and **never recomputed mid-run** — the same
"fixed at reset, not re-read every frame" decision `run.equipped.length`
already makes for `trinketSlots`, for the identical reason (a mid-run boon
must not silently resize an array something else is still iterating the old
length of).

**Why ONE array, not two ("inv" array + "quickbar" array).** CLAUDE.md's own
general ethos, restated for this specific case: *"a slot array and any derived
count query must agree by construction, not by convention."* A single array
means `burdenOf`, `pocketsHave`, `bestTool`, `pocketRows`, `invCount` — every
aggregate question about what the player carries — need exactly **one** pass
over `run.inv` to be correct, automatically, forever. Two separate arrays
(`run.inv` for the main grid, a second `run.quickbar`) would require every one
of those five functions to remember to scan *both* — and a forgotten second
scan does not throw, it silently returns a smaller-than-true answer (burden
under-counted, a craftable recipe reading as unaffordable, a tool in the
quickbar not detected) — precisely the "second decision that can silently
drift" class of bug CLAUDE.md's `model`/`rules` split exists to forbid. The
"genuinely separate capacity" property the user asked for (§4.6/D-H) is
achieved instead by an **index-range restriction**, not a second container:
`write.collect`'s search for a free slot to place a brand-new pair is bounded
to `[0, run.mainSlots)` and never reaches into the quickbar's own index range
— so the quickbar can never be silently auto-filled by mining, only by a
deliberate drag. Same user-visible behaviour, one array, zero risk of a
forgotten second scan.

**One slot per distinct pair, no stack cap (point 3, resolved).** A slot holds
exactly what today's dict entry held — one pair, one count, no upper limit —
now at a position instead of a key. No new cap is introduced: mass (CLAUDE.md
D3, `docs/DEVELOPER_GUIDE.md#buffers-and-pockets`'s own "slots are stack-based,
but the BINDING constraint is mass") is already the real limit and remains it
unchanged. Enforced by construction: `write.collect` always searches the
**whole** array for an existing slot already holding the exact pair first
(merges there, `n += amount`) before ever allocating a new one; `write.
moveSlot` (D-H) only ever relocates or swaps *whole* slot contents, never
splits or duplicates a stack. So two slots holding the identical pair
simultaneously cannot occur, and `invCount` stays a single lookup, never a
sum across positions — every existing caller's assumption preserved for free.

**Every existing query, preserved, file by file:**

```js
// model/run.js -- straight array scans replace `for (const k in run.inv)`

export const invCount = (sub, form) => {
  const s = run.inv.find(s => s && s.sub === sub && s.form === form);
  return s ? s.n : 0;
};

export function burdenOf() {
  let mass = 0;
  for (const slot of run.inv) if (slot) mass += massOfPair(slot.sub, slot.form) * slot.n;
  return mass;
}

export function pocketsHave(sel, n) {
  for (const slot of run.inv) if (slot && slot.n >= n && matches(sel, slot.sub, slot.form)) return true;
  return false;
}

export function bestTool() {
  let best = null;
  for (const slot of run.inv) {
    if (!slot || slot.form !== F.relic) continue;
    const tool = SUB[slot.sub]?.item?.tool;
    if (tool && (!best || tool.tier > best.tier)) best = tool;
  }
  return best;
}

export function pocketRows() {
  const out = [];
  for (const slot of run.inv) if (slot) out.push({ sub: slot.sub, form: slot.form, n: slot.n });
  SUB.forEach((s, i) => {
    if (!s.item?.hud?.always) return;
    const f = F[s.tile?.drops];
    if (f === undefined) return;
    if (!out.some(r => r.sub === i && r.form === f)) out.push({ sub: i, form: f, n: 0 });
  });
  return out.sort(byHudOrder);
}
```

`pocketRows()`'s SHAPE (and therefore `placeableFromPockets(pocketRows())[0]`,
`shell/main.js:198`, unchanged) and its "always" teaching-zero-row behaviour
are byte-for-byte preserved — only the internal derivation moved from a dict
scan to an array scan. `parseKey`'s import in `model/run.js` becomes fully
dead (every one of its four uses was inside a function rewritten above) and
must be dropped.

**Two NEW model exports, retiring three duplicated cross-layer scans.**
`pocketedBest(sel)` (largest single matching pair's count) and
`pocketedPair(sel, need)` (first matching pair with at least `need`), placed
immediately after `pocketsHave`:

```js
export function pocketedBest(sel) {
  let n = 0;
  for (const slot of run.inv) if (slot && matches(sel, slot.sub, slot.form) && slot.n > n) n = slot.n;
  return n;
}

export function pocketedPair(sel, need) {
  for (const slot of run.inv) if (slot && slot.n >= need && matches(sel, slot.sub, slot.form)) return { sub: slot.sub, form: slot.form };
  return null;
}
```

These retire `rules/machines.js#api.pocketed`/`#api.takePocketed`'s
pockets-specific use of its own **generic** `best`/`bestPair` (which stays,
unchanged, for `m.buf` — a dict forever, out of scope), `rules/crafting.js#
bestPocketed` (deleted outright), and `view/ui/mainPanel.js#countTowards`/
`#representativePair`'s hand-rolled loops (§2.7.3's five duplicate scans,
four of them retired). Named explicitly as a free simplification this
phase's own unavoidable touch to every one of those call sites buys, not a
speculative addition — "one decision, two [now four] readers," this
project's own idiom, satisfied where the layer boundary allows it.

**`write.collect`/`write.spend`, exactly** (see §4.6 for the composed pickup
branch and the exact `write.moveSlot` this feeds into for D-H):

```js
collect(sub, form, n) {
  const i = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
  if (i !== -1) { run.inv[i].n += n; bump(); return true; }
  const free = run.inv.findIndex((s, idx) => s === null && idx < run.mainSlots);
  if (free === -1) return false;               // no existing stack, no free MAIN slot
  run.inv[free] = { sub, form, n };
  bump();
  return true;
},

spend(sub, form, n) {
  const i = run.inv.findIndex(s => s && s.sub === sub && s.form === form);
  if (i === -1 || run.inv[i].n < n) return false;
  run.inv[i].n -= n;
  if (run.inv[i].n <= 0) run.inv[i] = null;
  bump();
  return true;
},
```

`collect` now RETURNS a boolean (previously void) — additive, matching
`spend`'s own existing true/false-on-capacity convention exactly. Its two
existing callers (`rules/items.js`'s pickup branch, `shell/main.js#give`) are
free to use or ignore it; the pickup branch must now use it (§4.6).

**The Character tab's grid** changes from "`pocketRows().filter(n>0)`, one row
per held pair, packed with no gaps" to "one cell per SLOT,
`run.inv.slice(0, run.mainSlots)`, empty slots included and drawn empty" —
the Minecraft-style choice, made deliberately: capacity is now a real,
positioned fact, and hiding empty slots would hide the exact information —
"how much room do I have left" — this whole revision exists to make legible.
`view/ui/grid.js#drawGrid` needs **zero** changes to support it (§2.7.5).

**Rejected alternatives:**

- **Two separate arrays** (`run.inv` + `run.quickbar`). Argued against above
  — every aggregate query would have to remember to scan both, and a missed
  one fails silently, not loudly.
- **A stack cap per slot.** Not asked for; mass already gates total carry, and
  CLAUDE.md's own D3/D4 give no argument that a *second*, per-slot number
  should exist alongside it.
- **Hide empty slots, show only occupied ones** (i.e. keep today's Character
  tab's own filter). This is precisely the "cosmetic display-order preference
  over an unlimited list" shape the user explicitly said this revision is
  **not**.
- **A hybrid "pin some slots, mirror the rest."** Old D-G's own rejected
  alternative, now doubly moot — there is no "the rest" left to mirror; the
  whole grid is real, positioned storage.

### D-H — the quickbar is 10 of those slots, genuinely separate capacity, and drag reorders in place

**Recommended: the quickbar's 10 cells ARE `run.inv[run.mainSlots ..
run.inv.length)`** — not a mirror, not a derived list (`heldPairs()`, fully
superseded), not an assignment array (`ui.quickbar`, fully deleted). The exact
same storage the Character tab's grid draws, sliced differently. Old D-H's own
question — "does the quickbar scroll, or truncate at 10" — and the
wheel-routing-when-no-panel-open widening it required are **both fully
dissolved**, not merely deferred: a quickbar with a real, fixed
`eff('quickbarSlots')`-length capacity can never hold more distinct pairs than
it has cells for, because nothing ever forces more than that many pairs into
it — it is not derived from "however many distinct pairs the player holds"
any more. There is nothing to overflow and therefore nothing to scroll. This
is a genuine scope REDUCTION the storage-shape decision buys for free, named
explicitly rather than left implicit.

**Population stays deliberate.** D-G's `write.collect` never allocates a
brand-new pair's slot inside the quickbar's own index range — a pair only
ever reaches the quickbar because a player dragged it there. Once something
occupies a quickbar slot, further pickups of the SAME pair top up that slot
wherever it currently lives (`write.collect`'s whole-array merge-first search,
D-G, already gives this for free, no special-casing needed).

**Drag-to-rearrange, and exactly what it reuses.** The mechanism is the
existing equip-slot swap already live in `shell/main.js:521-527` (§2.7.5),
generalised. What is reused, verbatim, unchanged: `ui.drag{sub,form,n,from,
index}` captured at press (`downEdge`, `:466-479`); the click-vs-drag
threshold (`dragStart`/`dragExceeded`/`DRAG_THRESHOLD`); the click-to-arm
branch (`:498-503`, already correct against an empty slot's `sub:null`). What
is NEW: one model writer, an **unconditional swap** — no branching needed,
because swapping a slot with an empty one already IS a move, and swapping
two occupied slots already IS the reorder the user asked for:

```js
// model/run.js
moveSlot(from, to) {
  if (from < 0 || from >= run.inv.length || to < 0 || to >= run.inv.length || from === to) return;
  const tmp = run.inv[to];
  run.inv[to] = run.inv[from];
  run.inv[from] = tmp;
  bump();
},
```

and one index-translation helper plus one new branch in `shell/main.js`'s
drag-resolve dispatch, replacing the deleted `assignQuickbar` call (`:505`):

```js
const absIndex = (gridId, i) => gridId === 'quickbar' ? run.mainSlots + i : i;
// ...inside the existing upEdge/ui.drag branch chain, before the 'equip' branches:
} else if (hit && (hit.gridId === 'inv' || hit.gridId === 'quickbar') &&
           (ui.drag.from === 'inv' || ui.drag.from === 'quickbar')) {
  runw.moveSlot(absIndex(ui.drag.from, ui.drag.index), absIndex(hit.gridId, hit.slot.index));
} else if (hit && hit.gridId === 'equip') {
  /* unchanged */
```

The `equip` grid's OWN swap code (`:521-527`) is **untouched** — a different
array (`run.equipped`, a SELECTION of substance ordinals, not physical
storage), with different validation (must be a currently-held, currently-
unequipped relic) that has nothing to do with slot repositioning. `run` is
already imported into `shell/main.js` (`:24`) — no new import needed for
`run.mainSlots` or `runw.moveSlot`.

**Dropping on empty canvas.** If the drag started from `'inv'`/`'quickbar'`
and is released over no slot at all, nothing happens — the source slot's
contents are untouched. No destructive "drop the item into the world" gesture
is invented; a physical drop remains, only and exactly, the `q` key's
`dropHeaviest()`. This mirrors the plan's own established caution against
smuggling in an unrelated mechanic.

**The digit mapping (`slotForDigit`/`DIGITS`/`digitOf`, `quickbar.js:36-43`)
is UNCHANGED** — still says "slot 0 is key '1'." Only what a LOCAL quickbar
index resolves to changes: a direct `run.inv[run.mainSlots + i]` read, no
live-list or assignment-table indirection. "Press 3" and "the slot showing 3"
are now *structurally* incapable of disagreeing — there is no second
decision left to desync against; occupied slot 3 stays slot 3 until a
player's own drag moves it.

**The armed-selection highlight (old D-I) is UNCHANGED and unaffected** —
`frameArmedSlot`/`frameUniqueSlots`/`quickbar.js`'s own armed block already
match by `{sub,form}` against `gridResult.slots`, which still carries
`sub:null` for an empty cell either way; nothing here touches `slot.js`.

**Rejected alternatives:**

- **Cap at 10, Character tab as overflow** (old D-H's own rejected
  alternative). Now doubly moot: there is no overflow to cap against — the
  quickbar always has exactly `eff('quickbarSlots')` cells, full stop.
- **A separate `write.assignQuickbar`-shaped writer for cross-grid moves,
  alongside a same-grid-only swap.** Rejected: two writers for what is
  structurally one operation (repositioning two indices in one array)
  reintroduces exactly the duplicate-decision risk D-G's single-array design
  exists to avoid, for zero behavioural benefit — the unconditional swap
  above already handles same-grid reorder, cross-grid move, and swap-with-
  occupied identically, in five lines.

### D-I — the armed-selection highlight

**Recommended: a 2-px double frame** — `view/ui/slot.js#frameSlot` draws a
second, inset-by-one-pixel border in the same colour immediately after the
first, using the exact same `R()` calls it already makes (no new primitive,
no antialiasing, invariant 11 untouched). Both existing callers
(`mainPanel.js#frameArmedSlot`, `quickbar.js`'s own armed-highlight block)
get the change for free since they call the one shared function. Justified
because selection just became the primary interaction surface for placing,
mining-vs-placing disambiguation, and miracle-use all at once (D-A) — exactly
the condition the task named for pulling this fix into scope.

**Rejected alternatives:** a colour-only change (`GOOD`-green already exists;
one more shade barely reads as "stronger" at this resolution); a background
tint under the swatch (risks illegibility against the wide range of swatch
colours `SUB[sub].look.item` already fills the slot's centre with).

### D-J — rename `cmd.turn` to `cmd.action`?

The literal ask ("`r` to be action... crank wrench or whatever") reads as
wanting a *generic* hold-to-operate verb, not a crank-specific one that
happens to move to `r`. **Recommended: rename the field**, `cmd.turn` ->
`cmd.action`, threaded through `shell/input.js`, `shell/main.js`'s narrowed
per-frame object, and the ~6 reads in `rules/drive.js` (`:160-204`). Costs a
mechanical rename across a small, well-contained set of files and future-
proofs the name for the next "stand there and hold a key to operate this
machine" mechanic, whatever it turns out to be, without a second name
appearing beside `turn` for the same physical gesture.

**Rejected/optional alternative, named for the reviewer's convenience:**
keep the field `cmd.turn`, rebind only the *key* to `r`. Zero behaviour
change, touches only `shell/input.js`, and is trivially available if the
reviewer would rather not touch `rules/drive.js` in this phase. Either choice
is compatible with everything else in this plan; §6.4's prompt names both and
lets the implementer pick, defaulting to the rename.

### D-K — does `i` survive as a synonym once `e` opens the panel

**Recommended: retire `i` outright.** One binding per verb, matching this
project's own stated ethos when the BUILD-menu digit path was retired
(`docs/FINDINGS.md:1147-1229`, "the one real mechanism now" framing).

**Rejected-but-cheap alternative, named for the reviewer:** keep `i` as an
additional alias for `toggle('main')` alongside `e`. Costs one `if` line,
creates no ambiguity (a panel is either open or not; two keys opening the
*same* thing is not the ambiguity class `u`/`p`'s removal exists to fix), and
is a defensible call purely for muscle-memory continuity if a human reviewer
prefers it. Named explicitly in §6.4's prompt as the implementer's choice.

### D-L — the remaining keys, confirmed untouched, and why

- **`l` (link) and `Backspace` (deconstruct) do not move onto LMB.** Link is
  structurally a *two-target* gesture (arm hub A, then choose hub B on a
  second press, `main.js:224-257`'s own header) — the "select then LMB"
  one-target model this phase builds for mining/place/miracle cannot express
  "pick a second thing" in the same press without inventing a third kind of
  ambiguity nothing asked to resolve. Deconstruct already has two paths
  (`Backspace`, and right-click on a machine, `input.js:494`) — folding a
  third onto LMB would collide with D-A's placement branch the moment a
  player aims at their own machine with something armed. Both stay exactly
  as they are.
- **`g` (grid overlay) and `h` (`flags.showDebug`, the master gate) are
  unchanged.** Neither collides with anything the brief asks for; `h` is
  precisely the gate D-D reuses for the relocated `c`->`p` chunk toggle.
- **The map's digit pre-emption (§2.10) needs no change** — confirmed by
  re-reading `mapKey`'s guard order against the new digit semantics; it
  returns before the quickbar block is ever reached, unconditionally on
  `flags.showMap`, regardless of what the slot-array-driven arming (D-G/D-H)
  resolves a digit to.

### D-M — the `rung` label and armed-slot-border housekeeping named in the brief

Per §2.13: the `rung` label rename is **out of scope** for Phase 12 (zero
interaction-model coupling, a one-line content edit) — flagged for the
orchestrator to land separately, outside this plan. The armed-slot border
strengthening **is** in scope, folded into D-I above and landed in 12c
(§6.3), because 12c is the phase that makes the quickbar the primary
selection surface — the exact trigger condition the task named for pulling
it in.

---

## 4. The design

### 4.1 The final keymap

| key | before | after |
|---|---|---|
| `w a s d`, arrows | move | unchanged |
| space | hop (edge) | unchanged |
| ~~`x`, `j`~~ | dig (hold) | **removed** — folded into LMB (D-A) |
| **`e`** | place (edge) | **repurposed:** open/close the main panel (was `i`) |
| ~~`u`~~ | craft (hold) | **removed** — already redundant with recipe-click (D-B) |
| **`r`** | restart | **repurposed:** hold-to-act on a placed machine, e.g. turn a crank (was `f`) |
| ~~`f`~~ | crank hold | **removed** — superseded by `r` (D-J) |
| `q` | drop heaviest (edge) | unchanged |
| `Backspace` | deconstruct (edge) | unchanged |
| ~~`v`~~ | use miracle (edge) | **removed** — folded into LMB via arming (D-A) |
| ~~`p`~~ | equip (edge) | **removed** — redundant with drag-to-equip; **repurposed** as a debug-gated chunk-overlay toggle (D-D), live only when `flags.showDebug` is on |
| ~~`i`~~ | open panel | **removed** — moved to `e` (D-K; optionally kept as an alias, implementer's call) |
| `g` | grid overlay | unchanged |
| ~~`c`~~ | chunk overlay | **repurposed:** manual collect (hold) |
| `h` | `flags.showDebug` master gate | unchanged |
| `o` | map overview | unchanged |
| `m` | mute | unchanged |
| ~~`r`~~ | restart | **removed as a key** — moved to a clickable death-screen button (D-C) |
| `l` | link/unlink | unchanged |
| Escape | blur / close / cancel armed place/link | unchanged |
| **`z`** | *(free today)* | **new:** cancel the armed pair / armed link endpoint — a narrower synonym for Escape's own cancel half, additive, does not close panels |
| digits `1234567890` | arm the *assigned* quickbar slot | arm whatever real slot `run.inv[mainSlots+N]` currently holds (D-G/D-H) — a positioned read, not an assignment or a derived list |
| `t b k y` | debug drafts, gated on `showDebug` | unchanged |

### 4.2 The final mouse map

- **LMB, world, no panel open:** resolved once at `pointerdown`, per D-A's
  three-rule order (miracle armed -> use it; else placeable armed and aimed
  tile not solid -> place it; else -> mine, exactly as today). `aim.mode` is
  written by whichever branch is chosen (`'place'` for rules 1-2, `'dig'` for
  rule 3) via the already-existing, previously-unused `model/aim.js#write.
  mode()` setter (§2.9) — this makes the reticle colour (`view/hud.js#reticle`,
  already wired to read `aim.mode`) finally correct for the first time,
  entirely as a side effect of resolving D-A, at zero extra `view` cost.
- **RMB, world, no panel open:** unchanged — deconstruct-if-aiming-a-machine,
  else place. Its "place" half becomes a second, harmless redundant path to
  the same D-A rule-2 outcome LMB now also reaches — the same class of
  intentional redundancy this project already accepts (`cmd.dig`/`cmd.mouse`
  have been redundant with each other since before this phase).
- **LMB, panel open:** unchanged — tab/slot/search click, drag start/resolve,
  except the quickbar grid's drag-target branch (`assignQuickbar`) is deleted
  per D-G.
- **Mouse wheel:** unchanged while a panel is open (UI scroll); with none
  open it does whatever the browser would do anyway. **Not routed to a
  quickbar scroll offset** — D-H shipped the quickbar as a fixed
  `eff('quickbarSlots')`-length grid with no scrolling to route to.

### 4.3 Selection ("arming"), precisely

Unchanged mechanism (`ui.armedPlace`, `armPlace`/`clearArmedPlace`,
`shell/ui.js:260-261`), with two widened gates:

- `shell/main.js:490-492`'s click-to-arm guard (`FORM[hit.slot.form]?.tile
  || hit.slot.form === F.rig`) gains `|| hit.slot.form === F.phial`.
- `shell/input.js`'s digit-arm guard (`:369-371`, same shape) gains the
  identical clause.

`z` calls the exact cancel pair Escape's second clause already calls
(`clearArmedPlace(); clearLink();`, `input.js:329`) — additive, does not
touch the panel stack, so a player mid-build can cancel a selection with `z`
without also closing whatever panel they have open, which Escape currently
would.

### 4.4 The unified LMB dispatch, exactly

**Superseded by a fourth rule** (Phase 16a inserted a feed-verb rule between
place and mine; `docs/SPEC.md` §23.2 is the live four-rule table) — kept
here, cited by name from `src/shell/main.js`/`input.js`, as the three-rule
shape those comments say Phase 16a widened.

In `shell/input.js`'s `pointerdown` handler, the final `else` branch
(currently `cmd.mouse = true`, `:496`) becomes:

```
} else {
  const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
    ? ui.armedPlace : null;
  if (armed && armed.form === F.phial && aim.valid && aim.band) {
    cmd.place = true;                 // rule 1 -- miracle always wins
  } else if (armed && aim.valid && aim.band &&
             tileAt(aim.band, aim.tx, aim.ty) === AIR) {
    cmd.place = true;                 // rule 2 -- open ground, something armed
  } else {
    cmd.mouse = true;                 // rule 3 -- mine, exactly as today
  }
}
```

New imports needed in `shell/input.js`: `AIR` (from `data/forms.js`, already
imports `F, FORM` from the same file at `:23`) and `tileAt` (from
`model/tiles.js`, a new import -- legal, `shell` may import `model`). No new
`cmd` field.

In `shell/main.js#applyIntents()`'s existing `cmd.place` block (`:176-205`),
one branch is added **before** the existing `p || placeableFromPockets(...)
[0]` resolution:

```
const armed = ui.armedPlace && invCount(ui.armedPlace.sub, ui.armedPlace.form) > 0
  ? ui.armedPlace : null;
if (armed && armed.form === F.phial) {
  miracles.use(aim.band, aim.tx, aim.ty);
  clearArmedPlace();
  cmd.place = false;
} else {
  /* existing body, unchanged */
}
```

`miracles` is already imported into `main.js` (`:34`, from
`./schedule.js`'s re-export) for the debug-draft dispatch -- no new import.

### 4.5 Manual collection and the auto-collect toggle, exactly

`shell/input.js` gains a new HOLD, `cmd.collect`, bound to `c`, in the exact
shape `cmd.dig`/`cmd.craft` already are (`set()`, `input.js:94-143`; no
`*Held` latch needed -- this is a hold, not an edge).

`shell/ui.js` gains `ui.autoCollect = false` beside `ui.hintsOpen`
(`:54`), with a `toggleAutoCollect()` mutator in the same one-line style as
`toggleHints()` (`:254`).

`shell/main.js#step()`'s narrowed per-frame object (`:97-107`) gains one
field: `collect: (ui.autoCollect || cmd.collect)`.

`shell/schedule.js:193`'s items row changes from `step: (dt) => items.step
(dt)` to `step: (dt, cmd) => items.step(dt, cmd)` -- the one sibling `rules`
step not already taking `cmd`, brought in line with `mining`/`crafting`/
`drive`.

`rules/items.js#step(dt, cmd)`'s pickup branch (`:112`) gains one clause:

```
if (cmd.collect && it.age > MAGNET_DELAY && !run.dead && near(it, c, pickupR)) {
```

`view/ui/mainPanel.js#drawCharacterTab` gains one clickable row -- a small
checkbox/label ("AUTO COLLECT", drawn through the existing `drawPanel`/hit-
rect idiom every other clickable control in this file already uses,
dispatched from `shell/main.js#applyUiIntents` on a click against its own
registered id, calling `toggleAutoCollect()`. Exact placement (near the
burden bar vs. near the inventory grid) is an implementer's call within the
existing layout pass -- no anchor conflict exists since this row has no
sibling to collide with.

### 4.6 The inventory becomes a real slot grid, and the quickbar is 10 of its slots, exactly

**`data/tuning.js`** gains two rows, placed beside `trinketSlots`:

```js
{ id:'invSlots',      kind:'value', base:30, unit:'slots', note:'length of the main inventory grid; run.mainSlots at reset' },
{ id:'quickbarSlots', kind:'value', base:10, unit:'slots', note:'length of the quickbar; the tail of run.inv past run.mainSlots' },
```

**`model/run.js#RUN_SCHEMA`** gains `mainSlots: 0` (placeholder, same
convention `inv`/`equipped` use) beside `inv: null`; `inv`'s own comment is
rewritten to describe the new shape (D-G). **`write.reset()`**:

```js
reset(seed) {
  const mainSlots = Math.max(0, Math.round(eff('invSlots')));
  const quickbarSlots = Math.max(0, Math.round(eff('quickbarSlots')));
  Object.assign(run, RUN_SCHEMA, {
    seed,
    inv: Array.from({ length: mainSlots + quickbarSlots }, () => null),
    mainSlots,
    granted: [...STARTING_MACHINES],
    /* ...unchanged... */
  });
  bump();
},
```

`write.collect`, `write.spend`, `write.moveSlot`, `invCount`, `burdenOf`,
`pocketsHave`, `bestTool`, `pocketRows`, `pocketedBest`, `pocketedPair` —
exact bodies given in D-G and D-H. `parseKey`'s import in `model/run.js`
is dropped (fully dead after the rewrite).

**`rules/machines.js`**'s `api` block (`:40-58`) reroutes the two pockets-
specific entries onto the new model exports, importing them alongside the
existing `run, write as rw`:

```js
import { pocketedBest, pocketedPair, run, write as rw } from '../model/run.js';
// ...
const api = {
  buffered: (m, sel) => best(m.buf, sel),          // unchanged -- m.buf stays a dict
  pocketed: (sel) => pocketedBest(sel),
  takeBuffered: /* unchanged */,
  takePocketed: (sel, n) => {
    const pair = pocketedPair(sel, n);
    if (!pair || !rw.spend(pair.sub, pair.form, n)) return null;
    return pair;
  },
};
```

`best`/`bestPair` (`:72-88`) are UNCHANGED — still generic, still serve
`m.buf` only now.

**`rules/crafting.js`** deletes `bestPocketed` (`:28-40`) outright; `choose()`
calls `pocketedPair` directly:

```js
import { pocketedPair, run, write as rw } from '../model/run.js';
// ...
function choose() {
  for (const r of HAND_RECIPES) {
    const took = {};
    let ok = true;
    for (const sel in r.in) {
      const pair = pocketedPair(sel, r.in[sel]);
      if (!pair) { ok = false; break; }
      took[sel] = pair;
    }
    if (ok) return { r, took };
  }
  return null;
}
```

Its now-dead `parseKey`/`matches` imports are dropped (both were used only
inside the deleted function — confirmed by grep, no other use in this file).

**`rules/items.js#dropHeaviest`** (`:77-98`) rewrites its scan:

```js
export function dropHeaviest() {
  if (run.dead || !player.band) return;
  let best = null, bestMass = -1;
  for (const slot of run.inv) {
    if (!slot) continue;
    const m = massOfPair(slot.sub, slot.form);
    if (m > bestMass) { bestMass = m; best = { sub: slot.sub, form: slot.form }; }
  }
  if (!best) return;
  /* ...unchanged from here... */
}
```

Its now-dead `parseKey` import is dropped.

**`rules/items.js#step`'s pickup branch** — composed with whatever Phase 12b
has already landed there (§2.7.7: re-read the file's actual current state
before editing; the shape below assumes 12b's `cmd.collect` gate is already
in place around the outer `if`):

```js
if (cmd.collect && it.age > MAGNET_DELAY && !run.dead && near(it, c, pickupR)) {
  if (burdenOf() + massOfPair(it.sub, it.form) > eff('burden') + MASS_EPS) {
    if (refusalDue(it))
      push('refused', { x: it.x, y: it.y }, { sub: it.sub, form: it.form, why: 'TOO HEAVY TO CARRY' });
  } else if (!rw.collect(it.sub, it.form, 1)) {
    if (refusalDue(it))
      push('refused', { x: it.x, y: it.y }, { sub: it.sub, form: it.form, why: 'INVENTORY FULL' });
  } else {
    push('pickup', { x: it.x, y: it.y }, { sub: it.sub, form: it.form });
    iw.remove(it);
  }
}
```

Reuses the existing `'refused'` journal kind (§2.7.4) with a second `why`
string; `shell/notify.js` needs no change (`row.data?.why` is already
displayed verbatim).

**`view/ui/mainPanel.js#drawCharacterTab`**'s inventory grid (`:160-182`)
switches from `pocketRows().filter(r => r.n > 0)` to one cell per slot:

```js
const invSlots = run.inv.slice(0, run.mainSlots);
const items = invSlots.map(slot => !slot ? null : {
  sub: slot.sub, form: slot.form, n: slot.n, mass: massOfPair(slot.sub, slot.form) * slot.n,
  colour: swatchOf(slot.sub),
  glyph: FORM[slot.form].tile ? '#' : glyphOf(slot.sub)
});
const grid = drawGrid(g, {
  id: 'inv', x, y: ry, h: invRows * (SLOT_SIZE + 1) - 1, vw, vh,
  cols: Math.max(1, Math.floor((w + 1) / (SLOT_SIZE + 1))),
  items, scroll: f.ui.scroll['main:inv'] || 0
});
```

`invRows`/the scroll clamp/`frameUniqueSlots`/`frameArmedSlot` calls
immediately after are UNCHANGED — `drawGrid`'s own row/scroll math already
works off `items.length`, now fixed at `run.mainSlots` instead of variable.
`representativePair`/`countTowards` (`:343-360,474-488`) call the new model
exports directly, deleting their own hand-rolled scans:

```js
function representativePair(r) {
  const out = r.out?.[0];
  if (!out) return null;
  if (out.sub !== undefined) return { sub: S[out.sub], form: F[out.form] };
  const need = r.in[out.subFrom] || 1;
  const pair = pocketedPair(out.subFrom, need);
  if (pair) return { sub: pair.sub, form: F[out.form] };
  const options = expand(out.subFrom);
  return options.length ? { sub: options[0].sub, form: F[out.form] } : null;
}
const countTowards = sel => pocketedBest(sel);
```

Import list at `:36` gains `pocketedBest, pocketedPair`; the now-dead
`parseKey` import (`:31`, confirmed used only at the two deleted loops) is
dropped.

**`view/ui/quickbar.js#drawQuickbar`** (`:51-85`) sources from the tail slice
instead of `ui.quickbar`:

```js
import { run } from '../../model/run.js';     // replaces the `invCount` import
// ...
export function drawQuickbar(g, f) {
  const { W, H, ui } = f;
  const qSlots = run.inv.slice(run.mainSlots);
  const w = COLS * (SIZE + 1) - 1;
  const x = Math.max(2, W - w - 6);
  const rows = Math.ceil(qSlots.length / COLS);
  const y = H - rows * (SIZE + 1) - 1 - 11;

  const items = qSlots.map((slot, i) => !slot
    ? { sub: null, form: null, n: 0, mass: 0, colour: mix(BACK, DIM, 0.15), glyph: digitOf(i) }
    : { sub: slot.sub, form: slot.form, n: slot.n, mass: massOfPair(slot.sub, slot.form) * slot.n,
        colour: SUB[slot.sub].look?.item ? colour(SUB[slot.sub].look.item[0]) : DIM, glyph: digitOf(i) });

  const grid = drawGrid(g, { id: 'quickbar', x, y, h: rows * (SIZE + 1) - 1, vw: W, vh: H, cols: COLS, items, cell: SIZE });
  /* ...armed-highlight block, hints-toggle block: UNCHANGED... */
}
```

No scroll parameter — D-H dissolves the need entirely. `invCount` no longer
called here at all: each occupied slot already carries its own `n`. `LEGEND`
(`:49`) is rewritten to the final keymap, landed here (ahead of the actual key
removals, which stay in 12d) for the identical out-of-order-docs reason old
12c's own prompt already named.

**`shell/input.js`'s digit-arm block** (`:366-372`) reads the slot array
directly:

```js
import { invCount, run } from '../model/run.js';   // `run` added
// ...
const slot = run.inv[run.mainSlots + qslot];
if (slot && (FORM[slot.form]?.tile || slot.form === F.rig || slot.form === F.phial)) armPlace(slot.sub, slot.form);
```

The `invCount(pair.sub, pair.form) > 0` staleness guard the old assignment
model needed is gone — not merely simplified away, structurally impossible
now: an occupied slot always has `n >= 1` by construction (`write.spend`
clears to `null` at `n <= 0`), so there is nothing left that could disagree.

**`shell/main.js`**'s drag dispatch gains the `moveSlot` branch (D-H, exact
diff given there), replacing the deleted `assignQuickbar` branch (`:505`).
The `__mf.ui` test-hook projection (`:731`) changes:

```js
quickbar: run.inv.slice(run.mainSlots).map(s => s ? { ...s } : null),
```

— a deliberate, named breaking change to the test hook's own public shape,
from `{sub,form}|null` to `{sub,form,n}|null`. `shell/ui.js` deletes
`ui.quickbar`, `assignQuickbar`, `clearQuickbar` (`:50,247-252`) — unchanged
from the old design's own instruction, just for a different reason (storage
moved into `model`, not into a live derived view).

### 4.7 What is explicitly unchanged in this design

- `rules/crafting.js`, `rules/miracles.js`, `rules/trinkets.js` (besides
  removing `equipFirst`'s now-dead caller, §5), `rules/placement.js`,
  `rules/machines.js`, `rules/mining.js` (besides the new `cmd.collect`
  plumbing landing in a sibling file, not this one) -- **zero changes**.
  Every mechanic this phase touches was already fully built; this phase only
  changes which physical control reaches it and how selection is resolved.
- `data/tuning.js` -- **no new tunable is introduced anywhere in this phase.**
  `pickupR` is reused verbatim (D-E); no new numeric constant is invented for
  the mouse-dispatch rule, the scroll widening, or the double-frame border.

---

## 5. File ownership

| file | change | required by |
|---|---|---|
| `src/shell/input.js` | `KEYS`/`set()` rewritten per §4.1; new `cmd.collect` hold; `pointerdown`'s LMB branch per §4.4; digit-arm block reads `run.inv[run.mainSlots+qslot]` directly (no scroll widening needed, D-H); own inline "live binding set" comment rewritten | D-A, D-E, D-H, §4.4, §4.6 |
| `src/shell/main.js` | `step()`'s narrowed command object gains `collect`/renamed `action` field; `applyIntents()`'s `cmd.place` branch gains the miracle special-case (§4.4); the quickbar-assign drag branch deleted and replaced by a single `runw.moveSlot(...)` call resolving 'inv'/'quickbar' drag-and-drop uniformly (D-H); `__mf.ui.quickbar` projection switched to the new `{sub,form,n}|null` slot shape; a new death-screen restart button dispatch | D-A, D-C, D-F, D-H, §4.4-4.6 |
| `src/shell/ui.js` | delete `ui.quickbar`/`assignQuickbar`/`clearQuickbar`; add `ui.autoCollect`/`toggleAutoCollect`; `ui.armedPlace`'s header comment updated (not renamed, D-A) | D-F, D-G |
| `src/shell/schedule.js` | `items` row's `step` signature gains `cmd` | §4.5 |
| `src/data/tuning.js` | two new rows, `invSlots` (base 30) and `quickbarSlots` (base 10) | D-G |
| `src/model/run.js` | `RUN_SCHEMA` gains `mainSlots`; `inv`'s comment rewritten (dict -> fixed-length slot array); `write.reset()` builds `run.inv` at the new length and sets `run.mainSlots`; `write.collect` rewritten (now returns bool), `write.spend` rewritten, new `write.moveSlot`; `invCount`/`burdenOf`/`pocketsHave`/`bestTool`/`pocketRows` rewritten to scan the array; two new exports `pocketedBest`/`pocketedPair`; now-dead `parseKey` import dropped | D-G, D-H |
| `src/rules/items.js` | `step(dt, cmd)` signature; pickup branch gated on `cmd.collect`, AND gains the slot-capacity refusal (`'refused'`/`'INVENTORY FULL'`) alongside the existing burden refusal; `dropHeaviest` rewritten for the array; now-dead `parseKey` import dropped | D-E, D-F, D-G |
| `src/rules/machines.js` | `api.pocketed`/`api.takePocketed` reroute onto the new `pocketedBest`/`pocketedPair` model exports; `best`/`bestPair` themselves untouched (still serve `m.buf`) | D-G |
| `src/rules/crafting.js` | `bestPocketed` deleted; `choose()` calls `pocketedPair` directly; now-dead `parseKey`/`matches` imports dropped | D-G |
| `src/rules/trinkets.js` | remove `equipFirst` (dead once `p`'s caller is deleted) | §2.4, D-K's removed-keys list |
| `src/rules/drive.js` | (optional, D-J) `cmd.turn` -> `cmd.action` rename, ~6 sites | D-J |
| `src/view/ui/mainPanel.js` | Character tab's inventory grid built from `run.inv.slice(0, run.mainSlots)` -- one cell per slot, empties included, Minecraft-style; `representativePair`/`countTowards` call `pocketedPair`/`pocketedBest` instead of hand-rolled scans; now-dead `parseKey` import dropped; new AUTO COLLECT clickable row in the Character tab | §4.5, D-G |
| `src/view/ui/quickbar.js` | source switches from `ui.quickbar` to `run.inv.slice(run.mainSlots)`; no scroll wiring (D-H dissolves the need); `LEGEND` string rewritten | D-H, §7.1 |
| `src/view/ui/slot.js` | `frameSlot` draws a second, inset border | D-I |
| `src/view/hud.js` | new death-screen restart button; its printed instruction text updated to match | D-C |
| `tools/check.mjs` | `actualHeldMass`'s mass-conservation-fuzz helper rewritten for the array shape (one loop over `run.run.inv` replaces the dict-keyed loop) | D-G |
| `tests/visual.spec.js` | the "REAL DRAG" quickbar-assign test rewritten around move/swap semantics; `__mf.ui.quickbar[0]` assertions gain `n` | D-H |
| `docs/DEVELOPER_GUIDE.md` | "Input intents" section (`:1133-1179`) updated for the new keymap and the digit-arm mechanism; "Buffers and pockets" section's own "`run.inv` is `{'sub/form':units}`" line corrected -- still true of `m.buf`, no longer true of the pockets half | §7.1, D-G |
| `.claude/brain/notes.md` | "Key binding inventory" table (`:142-167`) rewritten; its stale "free letters" line corrected regardless of this phase (§2.11) | §7.3 |

**Explicitly not touched:** `docs/SPEC.md`, `docs/DESIGN.md` (§2.12 -- neither
documents a control scheme or an inventory capacity number); `data/forms.js`
(the `rung` label rename is out of scope, §2.13); `rules/mining.js`,
`rules/miracles.js`, `rules/placement.js` (§4.7 -- none of these read `run.inv`
in a shape-dependent way, only through `invCount`, whose signature is
preserved); `view/ui/grid.js` (§2.7.5 -- the primitive already supports a
sparse, `null`-inclusive `items` array; nothing about it needs to change for
either the Character tab's or the quickbar's new source).

---

## 6. The phases

**Five, serial.** The dependency graph is still a straight line: 12a proves
LMB fully covers mine/place/use-miracle *before anything is deleted*, so it
lands first. 12b (manual collect) and the newly-split 12c/12c2 (the
inventory/quickbar storage redesign, replacing the original single 12c
outright -- see §2.7/§3 D-G/D-H for why the scope grew past a single phase)
both touch files the others also touch -- 12b and 12c both edit
`rules/items.js#step`'s pickup branch, and 12c2 and 12d both edit
`shell/input.js`'s key table and `view/ui/quickbar.js` -- so all four run
serially, in the order 12a -> 12b -> 12c -> 12c2 -> 12d, to avoid two agents
editing the same file's same region concurrently. 12c is model/rules only,
landing and passing `npm run check` on its own before any view code is
layered on top of it; 12c2 is the view/drag half that depends on it. 12d is
still the only phase that deletes a key -- it still runs last, after every
replacement path (12a's LMB, 12b's collect, 12c2's real slot grids) has been
proven to actually cover what it is retiring.

**All five shipped** (12a's LMB unification, 12b's manual collect, 12c's
slot-grid model, 12c2's drag-to-rearrange view, 12d's keymap close-out) --
their prompt-and-acceptance text is gone with the work; §4 above and
`docs/DEVELOPER_GUIDE.md`'s "Input intents" section are the normative
reference now.

---

## 7. Docs owed

All done: `docs/DEVELOPER_GUIDE.md`'s "Input intents" section,
`.claude/brain/notes.md`'s key-binding inventory (its stale "free single
letters" ledger corrected), `view/ui/quickbar.js#LEGEND`, and
`shell/input.js`'s own binding-set comment all describe the keymap that
actually shipped. `docs/SPEC.md`/`docs/DESIGN.md` needed nothing -- this
phase invented no locked number.

---

## 8. Explicitly not designed here

- **A general "abandon this run" button outside the death screen.** D-C only
  designs the death-screen restart control, which is the one place restart
  was ever discoverable. A mid-run "give up" affordance is a new UI surface
  with its own placement question (the main panel? a HUD corner?) that
  nothing in the brief asked for.
- **A hybrid pinned/live quickbar.** D-G's rejected alternative -- richer,
  genuinely useful, and explicitly deferred rather than designed, because it
  reopens the exact "two sources of truth for slot N" ambiguity this phase
  exists to close.
- **The `rung` form's label.** §2.13 -- a one-line content change with zero
  coupling to anything here; the orchestrator should land it separately.
- **Any new tunable.** §4.7 -- nothing in this phase needed one, and none is
  proposed speculatively for future flexibility.
- **Retuning `pickupR`, `MAGNET_DELAY`, or any existing crank/mining
  tunable.** D-E reuses every number verbatim; if manual collect at the
  existing radius feels wrong once played, the lever is `eff('pickupR')`,
  already scoped and tunable, and needs no engine change.
- **A second physical control scheme (gamepad, touch) for any of this.** Out
  of scope; nothing in the brief or the current codebase implies one exists
  or is planned.

---

## 9. Risk register

| risk | why it is likely | mitigation in this plan |
|---|---|---|
| **Arming a miracle silently blocks LMB-mining for as long as it stays armed.** D-A's rule 1 always wins. | This is a real, stated consequence of overloading one physical control for two verbs that used to be independent keys. | Clearing an arm is one `z`/Escape press. Named explicitly in D-A rather than discovered in play; 12a's acceptance walkthrough exercises exactly this case. |
| **Holding LMB through a successful placement, without releasing, cannot then mine the tile just placed.** §4.2/§4.4's accepted trade. | The pointerdown-time, decide-once design (chosen specifically to *avoid* a worse regression, §3 D-A) has this one acknowledged edge case. | Documented in the design section and the phase 12a prompt's own verification step, not discovered by a playtester first. |
| **A player fills every one of `eff('invSlots')` main slots with distinct pairs, and the next new material mined is refused, silently, forever, if they never notice.** | This is a genuinely new failure mode the current unlimited dict cannot produce at all. | Reuses the exact `'refused'` journal-kind/toast precedent the burden-cap refusal already established (`why: 'TOO HEAVY TO CARRY'` -> `why: 'INVENTORY FULL'`), so the player gets the identical class of feedback they already get for the existing refusal; no new UI affordance invented, none needed. Named explicitly in D-G/§4.6 rather than left as an emergent surprise. |
| **A drafted trinket or miracle physically falls (invariant 5) and lands while the pockets are full, and now sits refused on the ground like ordinary ore.** | `write.collect`'s refusal is uniform across every pickup, including the two non-mining paths that reach it (`rules/trinkets.js#grant`, machine-grant/tribute drops) -- there is no special-case exemption for a "special" item. | Accepted deliberately, not patched around: it is the direct, correct consequence of D-G's single choke-point design (`write.collect` has exactly two live callers: the pickup branch and the debug-only `give()`), and inventing a bypass for "important" pickups would be a second, silently-different collection rule. Named here so it is a documented trade, not a discovered one. |
