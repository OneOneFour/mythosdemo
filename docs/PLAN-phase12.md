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

### 2.7 Recon — the inventory model, top to bottom, and the full blast radius of changing its shape

**Why this recon exists.** The user's follow-up message changes the premise
§4.6/D-G/D-H were written against: *"say I have 30 inventory slots, including
the 10 in the quickbar well now i have 40 inventory slots. I can click and
drag things to rearrange in inventory."* Confirmed directly: inventory becomes
a real fixed-capacity grid, not a display-order preference over the current
unlimited dict; a full inventory refuses a new pickup outright, material stays
on the ground. Everything below was read directly out of the repo (commit at
time of writing has Phase 12a landed and Phase 12b in progress); every
`file:line` is real.

**2.7.1 — The quickbar as it exists today (the design being replaced).**
`view/ui/quickbar.js` (85 lines) draws two rows of five, **always** (not
gated on the main panel being open), reading `ui.quickbar[i]`
(`shell/ui.js:50`, a fixed 10-slot array of `{sub,form}|null`, **assignment
only** — its own comment, `ui.js:45-48`). The only way a slot is populated is
a **drag** from the Character tab's inventory grid onto a quickbar cell
(`shell/main.js:490-494,504-505`, `assignQuickbar`). The digit-key path
(`input.js:366-372`) arms whatever `ui.quickbar[qslot]` currently is.
`quickbar.js:49`'s `LEGEND` string is presentation text describing bindings
`shell/input.js` owns. All of this — `ui.quickbar`, `assignQuickbar`,
`clearQuickbar`, the drag-to-assign branch — is deleted outright by this
revision; §2.7.2 onward is the recon for what replaces it.

**2.7.2 — `run.inv`'s real shape today, confirmed line by line.**
`RUN_SCHEMA.inv: null` (`model/run.js:32`, comment: "sparse; keyed by the
`sub/form` string"), built fresh every run as `inv: {}` in `write.reset()`
(`:163`). This is genuinely a plain `{ [sub/form key]: count }` dictionary —
no slot count, no positions, no cap of any kind. `write.collect(sub,form,n)`
(`:201-205`) does `run.inv[k] = (run.inv[k]||0) + n`. `write.spend(sub,form,n)`
(`:207-214`) decrements and `delete`s the key at zero, returning `false` if
insufficient (the one existing boolean-return convention this phase's new
`write.collect` return value now matches). `invCount(sub,form)` (`:291`) is
`run.inv[keyOf(sub,form)] || 0`, a direct keyed lookup. `burdenOf()`
(`:416-423`) sums `massOfPair(sub,form) * run.inv[k]` over `for (const k in
run.inv)`, decoding each key with `parseKey`. `pocketsHave(sel,n)` (`:430-437`)
and `bestTool()` (`:523-533`) do the identical `for...in` + `parseKey` scan.
`pocketRows()` (`:547-562`) does the same scan, plus a second pass over `SUB`
adding a synthetic **zero-count row** for any substance flagged
`item.hud.always` that is not currently held (existing teaching-slot
mechanism, e.g. the tutorial's copper prompt) — both halves sorted once by
`byHudOrder`. Its **only** two callers today: `mainPanel.js:165`,
`pocketRows().filter(r => r.n > 0)` (the Character tab's inventory grid), and
`shell/main.js:198`, `placeableFromPockets(pocketRows())[0]` (the
"nothing armed, click default-places whatever's placeable" convenience).
Confirms exactly what the brief suspected: today's Character tab shows *one
row per distinct held pair, packed with no gaps* — not a slot grid at all.

**2.7.3 — The full blast radius, grepped exhaustively.** Every direct
consumer of `run.inv`'s dict shape, or of the five queries above, across
`src/`, `tools/`, `tests/`:

- `model/run.js` itself: `burdenOf`, `pocketsHave`, `bestTool`, `pocketRows`
  (four independent `for (const k in run.inv)` loops).
- `rules/machines.js:40-88`: `api.pocketed = sel => best(run.inv, sel)` and
  `api.takePocketed`'s `bestPair(run.inv, sel, n)` — both reuse a **generic**
  private `best`/`bestPair` pair that ALSO serves `m.buf` (a machine buffer,
  which stays a dict forever, out of scope). This is the one place a
  shape-generic helper is shared between the two, and it cannot stay shared
  once `run.inv` stops being a dict.
- `rules/crafting.js#bestPocketed` (`:28-40`), its own comment explicitly
  says it is "the same shape as `rules/machines.js`'s private `bestPair`,
  re-derived... rules siblings may not import one another" — a second,
  independent copy of the identical dict scan, over `run.inv` specifically.
- `rules/items.js#dropHeaviest` (`:77-98`), a third independent copy, scanning
  `run.inv` for the single heaviest held pair to drop on `q`.
- `view/ui/mainPanel.js#representativePair` (`:343-360`) and `#countTowards`
  (`:474-488`) — a fourth and fifth independent copy, `view`'s own version
  (cannot import `rules`), used by the CRAFTING tab's icon/tooltip.
- `rules/items.js#step`'s pickup branch (`:100-132`, detailed in §2.7.4) —
  the ONE place a fallen item becomes an `inv` credit via `rw.collect`.
- `shell/main.js#give` (`:854`, `runw.collect(sub,form,n)`) — the ONLY other
  caller of `write.collect` anywhere, test-only, gated behind `?test=1`.
- `tools/check.mjs`: **~15** direct `run.write.collect(...)` calls seeding
  test scenarios, plus one structural check that assumes the dict shape
  outright — `actualHeldMass` (`:874-878`), the mass-conservation fuzz's own
  reconstruction of "how much mass is currently held," `for (const k in
  run.run.inv) { const p = items.parseKey(k); m += ...*run.run.inv[k]; }`,
  run over a 7,200-substep fuzz. This is load-bearing (it is what catches "a
  future code path that bypasses the write API to poke `run.inv` directly")
  and MUST be rewritten in the same phase that changes the shape it inspects.
  Also three burden tests (`:1108-1169`) reading `run.invCount(...)` directly
  — signature-stable, unaffected.
- `tests/visual.spec.js`: **~30** `write.collect`/`rw.collect` calls (all
  signature-stable) and **~25** `invCount` assertions (all signature-stable,
  confirmed by their call shape — `invCount(sub,form)` in, a number out,
  identical before and after). The one test that is NOT shape-stable: the
  "REAL DRAG" test (`:376-424`) that drags an item from the inventory grid
  onto a quickbar slot and asserts `__mf.ui.quickbar[0]` deep-equals a bare
  `{sub,form}` (`:408,416`) — this test's own subject (assignment) is being
  deleted outright and must be rewritten around the new move/swap mechanism.

**2.7.4 — The pickup/refusal mechanism, and the one existing precedent for
"refused."** `rules/items.js#step` (`:100-132`). `MAGNET_DELAY = 0.35` (`:41`),
`near()` (`:205-208`) a plain circle test around `playerCentre()`, gated (per
Phase 12b, in progress) behind `cmd.collect`. The pickup branch's existing
body (`:112-123`):

```js
if (it.age > MAGNET_DELAY && !run.dead && near(it, c, pickupR)) {
  if (burdenOf() + massOfPair(it.sub, it.form) > eff('burden') + MASS_EPS) {
    if (refusalDue(it))
      push('refused', { x: it.x, y: it.y }, { sub: it.sub, form: it.form, why: 'TOO HEAVY TO CARRY' });
  } else {
    rw.collect(it.sub, it.form, 1);
    push('pickup', { x: it.x, y: it.y }, { sub: it.sub, form: it.form });
    iw.remove(it);
  }
}
```

This **is** an existing "pickup refused" path — for a burden-cap reason, per
CLAUDE.md D4's own "a pickup that would cross the hard cap is refused, with a
journal row." `refusalDue`/`REFUSAL_GAP` (`:58-65`) rate-limits the journal
push (not the refusal itself) per item-identity, via a `WeakMap`, so a refused
item does not spam the toast queue every frame it sits in range.
`shell/notify.js:46`, `refused: row => row.data?.why || ''`, proves `why` is
displayed **verbatim** — confirms no new journal *kind* is needed, only a new
`why` string (`'INVENTORY FULL'`), reusing this exact shape a second time,
alongside the existing burden one, inside the same `if`/`else if` chain. See
D-G/§4.6 for the exact composed branch.

**2.7.5 — The grid/slot/drag primitives, and what "drag to rearrange" needs.**
`view/ui/grid.js#drawGrid` (`:53-92`) already accepts a sparse `items` array
and indexes `items[idx]` directly, drawing `null` as an empty cell via
`slot.js#drawSlot`'s own `if (!item) return {sub:null,...}` branch (`:39`).
`view/ui/quickbar.js` **already exercises this today** — its own
`ui.quickbar.map(slot => slot ? {...} : {sub:null,...,glyph:digitOf(i)})`
(`:58-64`) is the existing "one cell per slot, empty slots visible" contract.
**The grid primitive needs zero changes** for the new Character-tab grid or
the new quickbar grid; only the `items` array each caller builds changes.
`shell/main.js`'s drag-resolve dispatch (`:458-541`): `downEdge` captures
`{sub,form,n,from:hit.gridId,index:hit.slot.index}` (`:466-479`, UNCHANGED,
already gridId-agnostic); the click-vs-drag threshold (`dragStart`,
`dragExceeded`, `DRAG_THRESHOLD=3`, `:342-344,483-485`, UNCHANGED); the
click-to-arm branch (`:498-503`, UNCHANGED, already checks `hit.slot.sub !=
null` which an empty slot already satisfies as false). The **one existing
precedent for a positional drag** (not an assignment) is the equip-slot swap
already live at `:521-527`:

```js
} else if (ui.drag.from === 'equip' && ui.drag.index !== hit.slot.index) {
  const other = run.equipped[hit.slot.index];
  runw.equip(hit.slot.index, ui.drag.sub);
  runw.equip(ui.drag.index, other ?? null);
}
```

This is the exact shape "drag within one grid to reorder" needs; §4.6/D-H
reuse it directly rather than inventing a second mechanism. The quickbar's
own drag TARGET today (`:504-505`, `assignQuickbar`) is an **assignment**, not
a reposition, and is deleted outright, replaced by the same `moveSlot`
mechanism the Character tab's own grid now also uses.

**2.7.6 — CLAUDE.md's invariants, re-read against this specific change.**
Invariant 5 ("mined material becomes a falling item, never a direct inventory
credit... machines are catch boxes") is not at risk: §2.7.3 confirms
`write.collect` has exactly two callers in the whole codebase, and neither is
new — the pickup branch (from an already-fallen item) and the debug-only
`give()`. This phase adds a **second reason** an already-fallen pickup can be
refused; it invents no new path that skips falling. The general "one source
of truth" ethos, stated explicitly for this exact case elsewhere in
CLAUDE.md — "a slot array and any derived count query must agree by
construction, not by convention" — is the deciding argument for D-G's single-
array design over a two-array alternative (see D-G). CLAUDE.md's "tunables are
split by name" rule, and `data/tuning.js`'s existing `trinketSlots` row
(`:137`) plus `run.equipped`'s reset-time build off `eff('trinketSlots')`
(`run.js:180`, "a FRESH array every run... rounded because a slot count must
be an integer") is the direct, already-shipped precedent this phase's own
`invSlots`/`quickbarSlots` tunables follow verbatim.

**2.7.7 — Interaction with Phase 12a (landed) and Phase 12b (in progress).**
12a's own diff (§4.4) reads only `ui.armedPlace`/`invCount(sub,form)` at
`pointerdown` time — `invCount`'s signature is unchanged by this revision
(same two args in, same number out), so **12a is confirmed unaffected**,
independent of storage shape. 12b is, as this recon is written, actively
editing `rules/items.js#step`'s exact pickup branch quoted in §2.7.4 —
wrapping it in `if (cmd.collect && ...)` — plus `shell/ui.js` (`ui.autoCollect`),
`shell/schedule.js` (threading `cmd` into `items.step`), `shell/input.js`/
`shell/main.js` (retiring `p`/`equipFirst`), `view/ui/mainPanel.js` (the AUTO
COLLECT row), `tools/check.mjs`/`tests/visual.spec.js` (updating
auto-collect-dependent assertions). This revision's own change to the SAME
branch — adding the slot-capacity refusal alongside the existing burden one,
§4.6 — is a **second, later edit to a spot 12b is editing now**. The two are
not in conflict (12b decides WHEN the branch runs at all; this phase decides
what happens once it does), but they are not concurrency-safe against each
other either. **This phase must land strictly after 12b**, and its own prompt
(§6.3) requires re-reading the branch's actual post-12b shape rather than
trusting this recon's pre-12b line citations. Nothing else in 12a or 12b's
already-designed scope reads or assumes anything about `run.inv`'s shape.

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

### 6.3 Phase 12c -- The inventory becomes a real slot grid (model and rules only)

**Why this is two phases now, not one.** The original 12c was "add one derived
function, wire three readers to it" -- small. The revised scope touches
`model/run.js` wholesale (every query it exports), three `rules/` files, and a
new tunable pair, before a single pixel of UI changes. Landing the storage
change and its FULL model/rules migration first, verified green on `npm run
check` alone (including the rewritten mass-conservation fuzz, §9), means a
broken migration is caught by the epoch/determinism/mass-conservation checks
before any view or drag code is layered on top of it -- the same
"verify at each step, do not stack unverified changes" discipline this plan's
own 12a->12b->12d sequencing already follows. **12c2 (next) is the view/drag
half, and depends on 12c having already landed and passed `npm run check`.**

Paste-ready prompt:

> You are implementing Phase 12c of `docs/PLAN-phase12.md` in the
> mythos-factory repo. Phase 12a is landed; Phase 12b must already be landed
> too -- **this phase edits the exact same `rules/items.js#step` pickup branch
> 12b just finished editing.** Read `CLAUDE.md`, `docs/PLAN-phase12.md` §2.7,
> §3 D-G, D-H, and §4.6 in full before touching anything, then re-read the
> CURRENT (post-12b) body of `rules/items.js#step`'s pickup branch directly
> from the file -- do not trust this document's own pre-12b line citations.
> **This phase touches no `src/view/` file and no `src/shell/` file.**
>
> 1. `data/tuning.js`: add the `invSlots` (base 30) and `quickbarSlots` (base
>    10) rows exactly as §4.6 gives them.
> 2. `model/run.js`: add `mainSlots: 0` to `RUN_SCHEMA`; rewrite `inv`'s own
>    comment (D-G); rewrite `write.reset()` to build `run.inv` as a fixed-
>    length array and set `run.mainSlots`, exactly as §4.6 gives it. Rewrite
>    `write.collect` (now returns bool), `write.spend`, and add `write.
>    moveSlot` exactly as D-G/D-H give them. Rewrite `invCount`, `burdenOf`,
>    `pocketsHave`, `bestTool`, `pocketRows` to scan the array (D-G's exact
>    bodies). Add the two new exports `pocketedBest`/`pocketedPair`. Drop the
>    now-dead `parseKey` import.
> 3. `rules/machines.js`: reroute `api.pocketed`/`api.takePocketed` onto the
>    two new model exports, exactly as §4.6 gives it. Leave `best`/`bestPair`
>    themselves untouched -- they still serve `m.buf`.
> 4. `rules/crafting.js`: delete `bestPocketed`; `choose()` calls
>    `pocketedPair` directly. Drop the now-dead `parseKey`/`matches` imports
>    (confirm by grep that neither is used anywhere else in this file before
>    removing).
> 5. `rules/items.js`: rewrite `dropHeaviest`'s scan (§4.6). In the pickup
>    branch you re-read in step 0, add the slot-capacity refusal alongside
>    whatever burden-refusal/`cmd.collect` gating 12b already landed, exactly
>    as §4.6's composed branch shows -- reusing the `'refused'` journal kind
>    with a new `why: 'INVENTORY FULL'`. Drop the now-dead `parseKey` import.
> 6. `tools/check.mjs`: rewrite `actualHeldMass`'s `run.inv` half (currently
>    `for (const k in run.run.inv) { ... run.run.inv[k] ... }`, around line
>    876) to a single `for (const slot of run.run.inv) if (slot) m +=
>    items.massOfPair(slot.sub, slot.form) * slot.n;` loop. Grep the whole
>    file for every remaining `run.inv[` / `for (const k in run.inv)` /
>    `for (const k in run.run.inv)` outside `model/run.js` itself and confirm
>    zero remain -- a missed conversion does not throw (an array's `for...in`
>    yields valid string indices; comparing a slot OBJECT against a number
>    silently coerces to `NaN` and evaluates false), so this must be checked
>    by grep, not by trusting a green run.
> 7. Verify by hand, via the test hook (`give`, `invCount`, `__mf.frames`):
>    mine/give `eff('invSlots')` distinct pairs, one per main slot, confirm
>    all fill; give one more distinct pair, confirm `write.collect` returns
>    `false` and a `'refused'`/`'INVENTORY FULL'` journal row fires and the
>    pair is NOT credited; confirm giving MORE of an already-held pair still
>    succeeds even with every slot full (merge-first). Confirm mining,
>    hand-crafting, the burden bar, and the trinket-equip gate (`invCount`-
>    driven) all still behave exactly as before on an ordinary, non-full run.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says. **No visual baseline should move** -- this phase changes no
> `view/` file, so any screenshot diff is a bug (most likely: a test that
> pokes `run.inv` directly and now gets an array where it expected a dict),
> not an intended change.

Acceptance: `npm run check` is green, including the rewritten mass-
conservation fuzz. A scripted scenario (test-hook driven) proves refusal-on-
full exactly as step 7 describes. Every existing `invCount`/`burdenOf`/
`pocketsHave`/`canCraft`/`bestTool`/`pocketRows`-dependent mechanic (mining
tool gate, hand-crafting, trinket equip, machine placement, burden lockout,
brand lighting) is unchanged in behaviour on a scripted, non-full playthrough.

### 6.3a Phase 12c2 -- The quickbar and Character tab become real slot grids, with drag-to-rearrange

Depends on 12c having landed and passed `npm run check`. This is the view/
drag half: nothing here changes what a number means, only how it is drawn and
how a player repositions it.

Paste-ready prompt:

> You are implementing Phase 12c2 of `docs/PLAN-phase12.md`. Phase 12c must
> already be landed and its `npm run check` pass confirmed. Read
> `docs/PLAN-phase12.md` §2.7.5, §3 D-H, and §4.6 in full. **This is the only
> phase in this wave that touches `src/view/` -- nothing else may run
> concurrently.**
>
> 1. `view/ui/mainPanel.js#drawCharacterTab`: replace the `pocketRows().
>    filter(r => r.n > 0)` inventory grid with the slot-sliced version in
>    §4.6 -- one cell per `run.inv.slice(0, run.mainSlots)` entry, empty slots
>    drawn empty. Rewrite `representativePair`/`countTowards` to call
>    `pocketedPair`/`pocketedBest` (add both to the existing `model/run.js`
>    import list). Drop the now-dead `parseKey` import (confirm by grep no
>    other use remains in this file).
> 2. `view/ui/quickbar.js`: rewrite per §4.6 -- source from `run.inv.slice
>    (run.mainSlots)`, drop the `invCount` import (add `run` instead), drop
>    any scroll wiring (D-H dissolves the need). Rewrite `LEGEND` to the
>    final keymap (§4.1) -- even though the key removals land in 12d, write it
>    for the END STATE now and say so explicitly in your commit message, the
>    same out-of-order-docs note old 12c's own prompt required.
> 3. `shell/input.js`'s digit-arm block: read `run.inv[run.mainSlots +
>    qslot]` directly per §4.6 (add `run` to the existing `invCount` import).
>    Confirm `mapDigit`'s pre-emption (§2.10) still runs first while the map
>    is open -- no code change, verification only.
> 4. `shell/main.js`: delete the `assignQuickbar` drag-target branch (`:505`
>    pre-12c2); add the `moveSlot` branch and the `absIndex` helper exactly
>    as D-H gives them. Update the `__mf.ui` test-hook's `quickbar` projection
>    to the new `{sub,form,n}|null` shape per §4.6. `shell/ui.js`: delete
>    `ui.quickbar`, `assignQuickbar`, `clearQuickbar`.
> 5. `tests/visual.spec.js`: rewrite the "REAL DRAG" quickbar test
>    (currently asserting a drag "assigns" a bare `{sub,form}` into
>    `__mf.ui.quickbar[0]`) around the new move/swap semantics and the new
>    `{sub,form,n}` shape. Grep the file for any other `ui.quickbar` reference
>    and update it the same way.
> 6. New baselines at both viewports (desktop + the 200 px phone floor): the
>    Character tab open on a fresh run, showing `eff('invSlots')` mostly-
>    empty cells rather than a packed, gapless list; a drag-to-rearrange
>    result (two occupied cells swapped, or one moved into an empty one); the
>    quickbar showing exactly `eff('quickbarSlots')` cells with no scrollbar
>    or truncation indicator of any kind.
>
> Run `npm run check`, `npm run lint`, `npm run test:visual`. Report exactly
> what each says, and for every baseline that moved, say why -- the Character
> tab's grid now drawing empty cells is a large, deliberate, expected diff;
> anything else moving is a regression.

Acceptance: a human looks at the Character tab on a fresh run and sees
exactly `eff('invSlots')` cells, almost all empty. Dragging an item onto an
empty cell (main grid or quickbar) moves it there and it stays; dragging onto
an occupied cell swaps the two. The quickbar never has more or fewer than
`eff('quickbarSlots')` cells and never scrolls or truncates. Digit keys arm
whatever currently occupies that quickbar slot, with no assignment step
anywhere in the game.

### 6.4 Phase 12d -- Keymap close-out: retire, rename, relocate, document

Paste-ready prompt:

> You are implementing Phase 12d of `docs/PLAN-phase12.md`, the close-out
> phase. Phases 12a-12c2 must already be landed and their acceptance criteria
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
| **A test asserting automatic pickup silently starts failing once `cmd.collect`/`ui.autoCollect` gates it.** | `MAGNET_DELAY`/`pickupR` are exercised by name in `.claude/brain/notes.md:181` and almost certainly by existing Playwright/`check.mjs` scenes that drop material and expect it to vanish into the pockets on its own. | 12b's prompt requires grepping for exactly these terms and reporting which tests needed `cmd.collect`/`ui.autoCollect = true` added, rather than discovering test failures after the fact. |
| **`rules/items.js#step`'s new second parameter (`cmd`) is not threaded correctly through every call site.** | It has exactly one caller today (`schedule.js`'s `STEPS` array) but any test harness calling `items.step(dt)` directly (bypassing `stepAll`) would silently get `cmd === undefined` and crash on `cmd.collect`. | 12b's prompt requires a full `npm run check` pass (which imports and exercises every module, per CLAUDE.md's own "mistakes already made" section on exactly this class of bug) before reporting success. |
| **12b and 12c both edit `rules/items.js#step`'s exact pickup branch.** | Two independent phases changing the same handful of lines, landing close together in time, is exactly the shape of edit that silently reverts or double-applies a change. | Strict serial ordering (12b lands first); 12c's own prompt requires re-reading the branch's actual post-12b shape from the file, not trusting this document's pre-12b line citations. |
| **Converting `run.inv` from a dict to an array leaves a stray `for (const k in run.inv)` or `run.inv[k]` somewhere the recon in §2.7.3 missed.** | A missed conversion does not throw -- an array's `for...in` yields valid string indices, and comparing a slot OBJECT against a number silently coerces to `NaN` and evaluates false, so the bug is a silently-wrong answer (an under-counted burden, a recipe reading as unaffordable, a tool going undetected), not a crash `npm run check` would surface on its own. | 12c's prompt requires an explicit post-rewrite grep for every remaining `run.inv[`/`for (const k in run.inv)` occurrence outside `model/run.js` itself, as a named verification step distinct from "the checker was green." |
| **A player fills every one of `eff('invSlots')` main slots with distinct pairs, and the next new material mined is refused, silently, forever, if they never notice.** | This is a genuinely new failure mode the current unlimited dict cannot produce at all. | Reuses the exact `'refused'` journal-kind/toast precedent the burden-cap refusal already established (`why: 'TOO HEAVY TO CARRY'` -> `why: 'INVENTORY FULL'`), so the player gets the identical class of feedback they already get for the existing refusal; no new UI affordance invented, none needed. Named explicitly in D-G/§4.6 rather than left as an emergent surprise. |
| **A drafted trinket or miracle physically falls (invariant 5) and lands while the pockets are full, and now sits refused on the ground like ordinary ore.** | `write.collect`'s refusal is uniform across every pickup, including the two non-mining paths that reach it (`rules/trinkets.js#grant`, machine-grant/tribute drops) -- there is no special-case exemption for a "special" item. | Accepted deliberately, not patched around: it is the direct, correct consequence of D-G's single choke-point design (§2.7.6 confirms `write.collect` has exactly two callers in the whole codebase), and inventing a bypass for "important" pickups would be a second, silently-different collection rule. Named here so it is a documented trade, not a discovered one. |
| **Baseline churn from the Character tab's grid now always drawing `eff('invSlots')` cells (most empty) instead of only occupied ones, on top of the pre-existing double-frame-border and armed-highlight changes.** | Three independent, legitimate pixel changes can land across 12c2 and the already-shipped D-I work. | 12c2's prompt requires every moved baseline to be reviewed as an image and its cause stated, the same discipline `docs/PLAN-phase10.md`'s 10c phase and old-12c's own prompt already used. |
