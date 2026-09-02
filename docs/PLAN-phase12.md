# Plan — the interaction model, audited and unified

**Status: PROPOSAL. Nothing here is built. No `src/` file has been touched.**
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

**Message 1** (typos preserved; treated as written per the task instruction):

> under the KEYS menu please audit all keys. I want 'e' to be inventory open,
> 'r' to be action (i.e crank wrench or whatever), then that should be it.
> 'craft' should just be LMB after selecting an item, 'z' to cancel, 'q' can
> till be drop selected item. by defauly items shouldn't be picked up, press
> 'c' to collect, maybe in inventory there can be an 'auto collect' toggle
> THEN there should be no 'equip' button needed or 'use' button or really 'x'
> for dig is also not needed as is 'u' for craft (unneeded) remove these

**Message 2**, the quickbar clarification, same breath:

> For the quickbar, what I want working is that the quickbar is like an
> extension of inventory that's just always there on screen!

**Message 3**, the explicit ask:

> These might neded to be major changes, can you plan and add as phase 12!

What this resolves to: **`e`** = open/close the inventory panel (today's
`i`). **`r`** = a generic "hold to act on a placed machine" verb (today's
`f`, the crank turn — see §2.6). **LMB** = one contextual action that must
cover mining, placing, using a miracle *and* running the existing craft-queue
click, because `x` (dig), `v` (use), `p` (equip) and `u` (craft) are all named
for removal in the same breath and nothing else is offered to replace mining
or miracle-use. **`z`** = cancel a selection (new; `z` is currently unbound).
**`q`** = drop, unchanged. **`c`** = manual collect (new), replacing the
always-on magnet with an opt-in "auto collect" toggle. **Removed outright**:
`x`/`j` (dig), `u` (craft), `p` (equip), `v` (use miracle) as *dedicated
keys* — their mechanics do not disappear, they move onto LMB or an existing
redundant path. The quickbar becomes a live, unassigned mirror of whatever
the player currently holds.

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
path since that drag code landed (confirmed independently by
`docs/PLAN-phase10.md §7.2`'s own DESIGN.md-staleness finding: *"`p` key...
is now a redundant alternative, not the only path"*). Removing it costs
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

### 2.7 The quickbar, as it exists, and which half of the user's two complaints is a bug

`view/ui/quickbar.js` (whole file, 85 lines) draws two rows of five,
**always** (its own header, `:1-12`: "not gated on the main panel being
open"), reading `ui.quickbar[i]` (`shell/ui.js:50`, a fixed 10-slot array of
`{sub,form}|null`, **assignment only** — its own comment, `ui.js:45-48`).
The only way a slot is ever populated is a **drag** from the Character tab's
inventory grid onto a quickbar cell (`shell/main.js:490-494`,
`assignQuickbar`). Once assigned, the slot shows a **live** count
(`invCount`, `quickbar.js:61`) but never re-populates itself, never drops a
depleted item, and never picks up a newly-held item that was never dragged
in.

The digit-key path (`input.js:366-372`) arms **whatever `ui.quickbar[qslot]`
currently is** — this was audited and shipped clean (the digit mapping
reuses the exact same `DIGITS` string the drawn glyph uses,
`quickbar.js:36-43`). **There is no code-level bug here.** The two failure
modes the user confirmed — "pressing a number does nothing" and "dragging
onto a slot doesn't stick" — are the **same root cause**: nothing is
assigned to that slot (or the assignment was already spent/dropped), so the
digit handler's own documented no-op (`input.js:359-365`, "does nothing at
all... no arm, no journal row") fires silently and correctly, and a "drag"
that did not exceed `DRAG_THRESHOLD` (3 px, `main.js:334`) or that landed on
the wrong cell reads as nothing happening. **The architecture is the bug,
not the code**: manual per-slot assignment is a second decision about "what
is in slot N" that can silently drift from "what do I actually hold" —
precisely the ambiguity this project's own idioms are built to forbid
(`docs/DEVELOPER_GUIDE.md#one-decision-two-readers`). Message 2 asks for
exactly the fix: make the bar a *derived view*, never an assignment. See D-G.

`quickbar.js:49`'s `LEGEND` string (`'I MENU  X DIG  E PLACE  U CRAFT  Q DROP
V USE  P EQUIP'`) is presentation text describing bindings owned by
`shell/input.js`, per that line's own comment — it will be wrong the moment
any key in §2.1's table moves and must be rewritten in the same phase that
moves them (§5).

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
decision... the reticle is drawn differently for each." `view/hud.js:513`
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

### D-G — the quickbar's population rule, and whether `ui.quickbar` survives

**Recommended: full replacement.** `ui.quickbar`, `assignQuickbar`,
`clearQuickbar` (`shell/ui.js:50,247-252`) and the drag-to-quickbar-assign
branch (`shell/main.js:493-494`) are deleted outright. The bar is redrawn
every frame from a **derived** query, `model/run.js#heldPairs()` — new, one
line, `pocketRows().filter(r => r.n > 0)` — the *exact* filter
`view/ui/mainPanel.js#drawCharacterTab` already applies inline (`:165`).
One function, three callers (`view/ui/quickbar.js`, `mainPanel.js`'s
Character tab, `shell/input.js`'s digit handler): "one decision, two
readers," this project's own named idiom, satisfied by construction. Digit
keys now arm **whichever pair currently occupies that ordinal position** in
the live, `byHudOrder`-sorted list — "press 3" means "the third pair you are
currently holding, in the same order the Character tab already lists them,"
with no assignment step, ever.

**Rejected alternative — a hybrid "pin some slots, mirror the rest."**
Genuinely richer, and not without merit as a *future* enhancement. Rejected
for Phase 12 because it reintroduces exactly the two-source-of-truth
ambiguity ("press 3, but the slot showing 3 is something else") the digit
mapping's own precedent (§2.7) was written to forbid. Noted as a possible
follow-up in §8, not designed here.

### D-H — does the quickbar scroll, or truncate at 10

**Recommended: scroll.** `view/ui/grid.js#drawGrid` already accepts a
`scroll` row offset natively (`:43-70`) — the Character tab's inv grid
already uses it (`mainPanel.js:178`, `ui.scroll['main:inv']`). Give the
quickbar its own scroll key (`ui.scroll['quickbar:quickbar']`) and route the
mouse wheel to it **even with no panel open** — today's wheel listener only
routes while `isOpen(top())` (`input.js:533`), the same always-on-UI carve-
out already exists for the quickbar's own hints-toggle click
(`onAlwaysOnUi`, `input.js:424-428`, used at `main.js:390`); widen both to
also recognise a wheel-over-quickbar event. This is a real, scoped code
change, not free, but it is the one piece of new plumbing that actually earns
its cost: without it, a player holding more than 10 distinct pairs would see
the "extension of inventory" silently truncate, which is precisely the
complaint being fixed.

**Rejected alternative — cap at 10, Character tab as overflow.** Cheaper (no
wheel-routing widening needed) but directly contradicts "just an extension of
inventory that's always there" the moment a player holds 11 distinct
materials — plausible well before mid-game given ore/plate/ingot/fuel/tool
variety. Noted as the fallback if the wheel-routing widening is judged out of
budget for 12c (§6.3's prompt says so explicitly).

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
  `flags.showMap`, regardless of what `heldPairs()`-driven arming does.

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
| digits `1234567890` | arm the *assigned* quickbar slot | arm the Nth *currently held* pair, live (`heldPairs()`) |
| `t b k y` | debug drafts, gated on `showDebug` | unchanged |

### 4.2 The final mouse map

- **LMB, world, no panel open:** resolved once at `pointerdown`, per D-A's
  three-rule order (miracle armed -> use it; else placeable armed and aimed
  tile not solid -> place it; else -> mine, exactly as today). `aim.mode` is
  written by whichever branch is chosen (`'place'` for rules 1-2, `'dig'` for
  rule 3) via the already-existing, previously-unused `model/aim.js#write.
  mode()` setter (§2.9) — this makes the reticle colour (`view/hud.js:513`,
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
- **Mouse wheel:** unchanged while a panel is open; additionally routed to
  the quickbar's own scroll offset when no panel is open, per D-H.

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

### 4.6 The quickbar, exactly

`model/run.js` gains:

```
export function heldPairs() { return pocketRows().filter(r => r.n > 0); }
```

placed immediately after `pocketRows()` (`:547-561`).

`view/ui/quickbar.js#drawQuickbar` replaces its `ui.quickbar.map(...)` source
(`:58-64`) with `heldPairs()`, sliced/paginated by the grid's own `scroll`
mechanism (D-H) rather than a fixed 10-null array. `LEGEND` (`:49`) is
rewritten to the final keymap (§7.1 names this explicitly as a docs-owed
item, landed in the same commit).

`shell/input.js`'s digit-arm block (`:366-372`) replaces `ui.quickbar[qslot]`
with `heldPairs()[qslot]`.

`shell/ui.js` deletes `ui.quickbar` (`:50`), `assignQuickbar`/`clearQuickbar`
(`:247-252`). `shell/main.js#applyUiIntents` deletes the quickbar-assign drag
branch (`:493-494`).

The digit-to-slot **mapping** itself (`DIGITS`, `digitOf`, `slotForDigit`,
`quickbar.js:36-43`) is **unchanged** -- it still says "slot 0 is key '1'";
only what a slot's *content* resolves to changes, from an assignment lookup
to a live list index. "Press 3" and "the slot showing 3" still cannot
disagree, because both still read the same one function, `heldPairs()`,
in the same order.

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
| `src/shell/input.js` | `KEYS`/`set()` rewritten per §4.1; new `cmd.collect` hold; `pointerdown`'s LMB branch per §4.4; digit-arm block reads `heldPairs()`; wheel listener widened for the quickbar (D-H); own inline "live binding set" comment rewritten | D-A, D-E, D-G, D-H, §4.4, §4.6 |
| `src/shell/main.js` | `step()`'s narrowed command object gains `collect`/renamed `action` field; `applyIntents()`'s `cmd.place` branch gains the miracle special-case (§4.4); `applyUiIntents`'s quickbar-assign drag branch deleted; a new death-screen restart button dispatch | D-A, D-C, D-F, D-G, §4.4-4.6 |
| `src/shell/ui.js` | delete `ui.quickbar`/`assignQuickbar`/`clearQuickbar`; add `ui.autoCollect`/`toggleAutoCollect`; `ui.armedPlace`'s header comment updated (not renamed, D-A) | D-F, D-G |
| `src/shell/schedule.js` | `items` row's `step` signature gains `cmd` | §4.5 |
| `src/rules/items.js` | `step(dt, cmd)` signature; pickup branch gated on `cmd.collect` | D-E, D-F |
| `src/rules/trinkets.js` | remove `equipFirst` (dead once `p`'s caller is deleted) | §2.4, D-K's removed-keys list |
| `src/rules/drive.js` | (optional, D-J) `cmd.turn` -> `cmd.action` rename, ~6 sites | D-J |
| `src/model/run.js` | add `heldPairs()` | D-G |
| `src/view/ui/quickbar.js` | source switches from `ui.quickbar` to `heldPairs()`; scroll wiring; `LEGEND` string rewritten | D-G, D-H, §7.1 |
| `src/view/ui/slot.js` | `frameSlot` draws a second, inset border | D-I |
| `src/view/ui/mainPanel.js` | new AUTO COLLECT clickable row in the Character tab | §4.5 |
| `src/view/hud.js` | new death-screen restart button; its printed instruction text updated to match | D-C |
| `docs/DEVELOPER_GUIDE.md` | "Input intents" section (`:1133-1179`) updated for the new keymap and the `heldPairs()`-driven quickbar | §7.1 |
| `.claude/brain/notes.md` | "Key binding inventory" table (`:142-167`) rewritten; its stale "free letters" line corrected regardless of this phase (§2.11) | §7.3 |

**Explicitly not touched:** `docs/SPEC.md`, `docs/DESIGN.md` (§2.12 -- neither
documents a control scheme); `data/tuning.js` (§4.7 -- no new tunable);
`data/forms.js` (the `rung` label rename is out of scope, §2.13); `rules/
mining.js`, `rules/miracles.js`, `rules/placement.js`, `rules/machines.js`
(§4.7).

---

## 6. The phases

**Four, serial.** The dependency graph is a straight line, not a tree:
12a proves LMB fully covers mine/place/use-miracle *before anything is
deleted*, so it must land and be verified first. 12b and 12c are
mechanically independent of each other's *internals* but both touch
`shell/input.js`'s key table, so they run serially to avoid two agents
editing the same file's same region concurrently. 12d is the only phase that
deletes a key -- it must run last, after every replacement path (12a's LMB,
12b's collect, the drag-to-equip/click-to-queue paths already shipped) has
been proven to actually cover what it is retiring.

### 6.1 Phase 12a -- Unify LMB for mine/place/use-miracle (additive only)

Paste-ready prompt:

> You are implementing Phase 12a of `docs/PLAN-phase12.md` in the
> mythos-factory repo. Read `CLAUDE.md`, `docs/DEVELOPER_GUIDE.md`'s "Input
> intents" section, and `docs/PLAN-phase12.md` §2.1-2.2, §2.9, §3 D-A, and
> §4.2-4.4 in full before touching anything. **This phase adds behaviour and
> removes no key.** `e` (place) and `v` (use miracle) must keep working
> exactly as they do today, fully redundant with what you are adding -- this
> phase must be provably impossible to regress, because nothing existing is
> deleted.
>
> 1. In `shell/input.js`'s `pointerdown` handler, replace the final `else
>    cmd.mouse = true;` with the three-rule dispatch in §4.4: a miracle armed
>    always wins; else a placeable armed and the aimed tile not solid places;
>    else mine. Import `AIR` from `data/forms.js` and `tileAt` from
>    `model/tiles.js`. No new `cmd` field.
> 2. In `shell/main.js#applyIntents()`'s existing `cmd.place` branch, add the
>    miracle special-case from §4.4 *before* the existing tile/rig
>    resolution: an armed `F.phial` pair calls `miracles.use(aim.band,
>    aim.tx, aim.ty)` and clears the arm, instead of falling into
>    `placeTile`/`placeMachine`.
> 3. Widen both click-to-arm gates (`shell/main.js:490-492` and
>    `shell/input.js`'s digit-arm block) to also accept `form === F.phial`.
> 4. Wire `model/aim.js#write.mode()`, previously dead scaffolding -- call it
>    with `'place'` or `'dig'` from wherever you resolve the LMB rule, so
>    `view/hud.js:513`'s already-existing reticle-colour read finally does
>    something. Do not touch `view/hud.js` itself.
> 5. Verify by hand: arm a placeable tile pair, aim at open ground, LMB
>    places it (and `e` still also does). Arm a placeable, aim at solid rock,
>    LMB mines (and does not attempt a doomed placement). Arm a miracle, aim
>    at solid rock, LMB uses it (and `v` still also does, on whichever
>    miracle you happen to be holding first). Hold LMB down through a
>    successful placement without releasing, and confirm mining does not
>    spuriously start on the tile you just placed -- this is the specific
>    regression §4.4's design note names; report exactly what you observed.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says. No baseline should move -- this phase changes no rendering
> and removes no key, so any diff is a bug, not an intended change.

Acceptance: every existing key (`e`, `v`, `x`/`j`, mouse) still does exactly
what it did before. LMB additionally places, mines, and uses a miracle per
the three-rule order, verified by hand as above.

### 6.2 Phase 12b -- Manual collection and the auto-collect toggle

Paste-ready prompt:

> You are implementing Phase 12b of `docs/PLAN-phase12.md`. Phase 12a must
> already be landed. Read `docs/PLAN-phase12.md` §2.5, §3 D-D, D-E, D-F, and
> §4.5 in full.
>
> 1. `shell/input.js`: add `cmd.collect` as a new HOLD bound to `c`, in the
>    same shape `cmd.dig`/`cmd.craft` already are. In the SAME commit,
>    relocate `flags.showChunks`'s toggle off bare `c` onto `p` (freed by
>    retiring the equip key here -- see step 4), gated behind
>    `flags.showDebug` exactly like `t`/`b`/`k`/`y` already are.
> 2. `shell/ui.js`: add `ui.autoCollect = false` and `toggleAutoCollect()`.
> 3. `shell/schedule.js`: change the `items` row to `step: (dt, cmd) =>
>    items.step(dt, cmd)`. `shell/main.js#step()`'s narrowed per-frame object
>    gains `collect: ui.autoCollect || cmd.collect`.
> 4. `rules/items.js#step(dt, cmd)`: gate the existing pickup branch
>    (`:112`) on `cmd.collect` -- reuse `pickupR`/`near()` exactly as they
>    are, no new tunable. In the same commit, **retire `p` (equip) and
>    `rules/trinkets.js#equipFirst`** -- confirm by grep that its only caller
>    (`shell/main.js`'s `cmd.equip` branch) is the one you are deleting, then
>    delete both the branch and the now-dead export. Run `npm run lint`
>    afterward and confirm no unused-import warning survives.
> 5. `view/ui/mainPanel.js#drawCharacterTab`: add a clickable AUTO COLLECT
>    row, dispatched from `shell/main.js#applyUiIntents` on a click against
>    its own registered rect, calling `toggleAutoCollect()`.
> 6. Verify by hand: with `ui.autoCollect` false (the new default), dropped
>    material sits on the ground until you hold `c` standing near it; toggle
>    AUTO COLLECT on and confirm the old always-on magnet behaviour returns
>    exactly. Confirm `p` (while `flags.showDebug` is off) does nothing, and
>    (while it is on) toggles the chunk overlay.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Any test that
> previously relied on items auto-collecting (grep for `MAGNET_DELAY`,
> `pickupR`, `'pickup'` journal rows in `tools/check.mjs`/
> `tests/visual.spec.js`) must be updated to either hold `cmd.collect` or set
> `ui.autoCollect = true` explicitly before asserting a pickup happened --
> report which tests you found and how each was updated.

Acceptance: items do not auto-collect by default; holding `c` near a pile
collects it; the AUTO COLLECT toggle restores the old behaviour; `p`/equip
and its rules-layer primitive are gone with no dead import left behind.

### 6.3 Phase 12c -- The quickbar becomes a live extension of inventory

Paste-ready prompt:

> You are implementing Phase 12c of `docs/PLAN-phase12.md`. Phase 12b must
> already be landed -- this phase's digit-arm rewrite touches the same file
> region 12b's key-table edit did. Read `docs/PLAN-phase12.md` §2.7, §2.8,
> §3 D-G, D-H, D-I, and §4.6 in full. **This is the only phase in this wave
> that touches `src/view/` -- nothing else may run concurrently.**
>
> 1. `model/run.js`: add `heldPairs()` immediately after `pocketRows()`.
> 2. `view/ui/quickbar.js`: source from `heldPairs()` instead of
>    `ui.quickbar`. Wire the grid's `scroll` parameter to a new
>    `ui.scroll['quickbar:quickbar']` entry (D-H) -- if you judge the wheel-
>    routing widening (`shell/input.js`'s wheel listener, `shell/main.js`'s
>    `applyUiIntents` early-return, both currently gated on a panel being
>    open) too large for this phase's budget, fall back to D-H's named
>    alternative (cap at 10, no scroll) and say so explicitly in your report
>    -- do not silently drop scrolling without naming the trade.
> 3. `shell/ui.js`: delete `ui.quickbar`, `assignQuickbar`, `clearQuickbar`.
>    `shell/main.js#applyUiIntents`: delete the quickbar-assign drag branch.
> 4. `shell/input.js`'s digit-arm block: read `heldPairs()[qslot]` instead of
>    `ui.quickbar[qslot]`. Confirm `mapDigit`'s pre-emption (§2.10) still
>    runs first while the map is open -- this needs no code change, only
>    verification that you have not moved anything above it.
> 5. `view/ui/slot.js#frameSlot`: draw a second, inset-by-one-pixel border in
>    the same colour (D-I). Verify against both existing callers
>    (`mainPanel.js#frameArmedSlot`, the quickbar's own armed-highlight).
> 6. Rewrite `quickbar.js`'s `LEGEND` string to match the final keymap
>    (§4.1) -- even though the key removals themselves land in 12d, write the
>    legend for the END STATE now, since 12d has nothing left to change here
>    once this lands (name this explicitly as an out-of-order docs edit in
>    your commit message, so the discrepancy between the drawn legend and
>    the still-live old keys is not mistaken for a bug in review).
> 7. New baselines at both viewports (desktop + the 200 px phone floor,
>    CLAUDE.md's own binding constraint): a quickbar showing more than 10
>    held pairs if you implemented scrolling, or exactly 10 with the
>    Character tab open behind it if you took the fallback; an armed slot
>    showing the new double-frame border, in both the quickbar and the
>    Character tab's inventory grid, for visual comparison.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says, and for every baseline that moved, say why the pixels
> moved -- the double-frame border and the quickbar's new content source both
> legitimately move pixels; anything else moving is a regression.

Acceptance: a human looks at the quickbar with nothing manually assigned and
sees it already showing everything they hold, live, in the same order the
Character tab lists it. The armed-slot border reads clearly as "selected" at
both viewports. Digit keys arm live pairs with no assignment step anywhere in
the game.

### 6.4 Phase 12d -- Keymap close-out: retire, rename, relocate, document

Paste-ready prompt:

> You are implementing Phase 12d of `docs/PLAN-phase12.md`, the close-out
> phase. Phases 12a-12c must already be landed and their acceptance criteria
> confirmed -- this phase deletes keys that are only safe to delete because
> those phases proved their replacements work. Read `docs/PLAN-phase12.md`
> in full, especially §3 D-C, D-J, D-K, and §4.1.
>
> 1. **Retire `x`/`j` (dig) and `v` (use miracle) as dedicated keys.** Confirm
>    by hand, before deleting anything, that LMB already covers both (12a's
>    own acceptance walkthrough) -- re-run it if you were not the agent that
>    landed 12a.
> 2. **Rename the panel-toggle key from `i` to `e`.** Per D-K, default to
>    retiring `i` outright; if you judge keeping it as an additional alias
>    worth the one line, say so in your report and keep it -- either choice
>    is acceptable, name which you took and why.
> 3. **Rename the crank-hold key from `f` to `r`.** Per D-J, default to
>    renaming the field `cmd.turn` -> `cmd.action` throughout
>    `shell/input.js`, `shell/main.js`'s narrowed command object, and
>    `rules/drive.js`'s ~6 reads; if you judge the field rename out of budget,
>    rebind only the physical key and leave `cmd.turn` named as it is,
>    stating explicitly that you took the cheaper option.
> 4. **Relocate restart off `r` onto a real button** (D-C): draw and hit-test
>    a clickable control on the death screen (`view/hud.js#deathScreen`),
>    dispatched through the same `drawn`/hit-test idiom every other clickable
>    rect in this project uses. Update the death screen's printed text to
>    match (it currently reads "PRESS R TO BEGIN THE NEXT TORMENT" and must
>    no longer say that).
> 5. **Add `z`** as an additional key firing the exact cancel pair Escape's
>    second clause already fires (`clearArmedPlace(); clearLink();`,
>    `shell/input.js:329`) -- additive, does not close the panel stack.
> 6. **Docs**: rewrite `docs/DEVELOPER_GUIDE.md`'s "Input intents" section
>    for the final keymap; rewrite `.claude/brain/notes.md`'s "Key binding
>    inventory" table (and its stale "free letters"/`i` description, §2.11 --
>    fix these even though they predate this phase, since you are already
>    rewriting the table); rewrite `shell/input.js`'s own inline "the live
>    binding set is..." comment.
> 7. Walk the full final keymap by hand, one binding at a time, against
>    §4.1's table, and report any binding that does not match.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says. Grep the whole `src/` tree for `flags.showInv`, `'i'`,
> `'x'`, `'v'`, `'u'`, `'p'` (as key comparisons, not general string
> literals) and confirm nothing still references a removed binding.

Acceptance: §4.1's table is true of the running game, verified by hand, key
by key. `docs/DEVELOPER_GUIDE.md` and `.claude/brain/notes.md` both describe
the keymap that actually exists. No orphaned code references a removed key.

---

## 7. Docs owed

### 7.1 Definitely owed, and named above

- `docs/DEVELOPER_GUIDE.md`'s "Input intents" section (`:1133-1179`) -- the
  "Adding a key" checklist and the enumerated edge-triggering examples both
  name keys this phase moves or removes.
- `.claude/brain/notes.md`'s "Key binding inventory" (`:142-167`) -- already
  stale before this phase (§2.11); doubly stale after it.
- `view/ui/quickbar.js#LEGEND` -- presentation text describing bindings this
  phase changes; landed in 12c ahead of the actual removals (12c's prompt
  names this explicitly to avoid a review-time false alarm).
- `shell/input.js`'s own inline "the live binding set is..." comment
  (`:109-111`).

### 7.2 Confirmed NOT owed

`docs/SPEC.md` and `docs/DESIGN.md` document no control scheme anywhere
(§2.12) -- neither needs a locked-numbers update, because this phase invents
no locked number (§4.7).

### 7.3 A correction worth making regardless of whether this phase ships

`.claude/brain/notes.md:166-167`'s "Free single letters at time of writing:
`f`, `l`, `n`, `z`" is false **today**, independent of this phase -- `f`
drives the crank (§2.6), `l` drives link (§2.1). This is scratch, not
policy (the file's own header), but a stale "what's free" ledger is exactly
the kind of fact a future keybinding change would trust and be burned by.
Worth fixing in 12d's docs pass regardless of any other outcome of this
plan.

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
| **Retiring `equipFirst` (`rules/trinkets.js`) leaves dead code if the grep in 12b's step 4 is wrong about its only caller.** | A second, unnoticed caller would make the removal a silent regression rather than a clean one. | 12b's prompt requires the grep-then-lint verification explicitly, and `npm run lint` (unused/undefined identifiers, per CLAUDE.md's own verification table) is run immediately after. |
| **The quickbar's wheel-scroll widening (D-H) touches the same always-on-UI carve-out (`onAlwaysOnUi`) the hints-toggle already depends on.** | Two features sharing one narrow exception path is exactly the kind of edit that silently breaks the other. | 12c's prompt names the fallback (cap at 10, no scroll) as an explicit, reportable choice rather than requiring the widening unconditionally -- the risk is bounded by making it optional, not by hoping it goes smoothly. |
| **Baseline churn from the double-frame border and the quickbar's new content source.** | Two independent, legitimate pixel changes land in the same phase. | 12c's prompt requires every moved baseline to be reviewed as an image and its cause stated, the same discipline `docs/PLAN-phase10.md`'s 10c phase already used. |
| **A test asserting automatic pickup silently starts failing once `cmd.collect`/`ui.autoCollect` gates it.** | `MAGNET_DELAY`/`pickupR` are exercised by name in `.claude/brain/notes.md:181` and almost certainly by existing Playwright/`check.mjs` scenes that drop material and expect it to vanish into the pockets on its own. | 12b's prompt requires grepping for exactly these terms and reporting which tests needed `cmd.collect`/`ui.autoCollect = true` added, rather than discovering test failures after the fact. |
| **`rules/items.js#step`'s new second parameter (`cmd`) is not threaded correctly through every call site.** | It has exactly one caller today (`schedule.js`'s `STEPS` array) but any test harness calling `items.step(dt)` directly (bypassing `stepAll`) would silently get `cmd === undefined` and crash on `cmd.collect`. | 12b's prompt requires a full `npm run check` pass (which imports and exercises every module, per CLAUDE.md's own "mistakes already made" section on exactly this class of bug) before reporting success. |
