# Findings

Where a phase agent parks something outside its own scope. `file:line`, one
line of reason, and which phase (if any) should pick it up. Append; do not
rewrite history here.

---

## Phase 2a (encumbrance, dropping, and ladders)

- **Pre-existing bug, fixed in this commit despite being outside FILE
  OWNERSHIP: `src/rules/crafting.js`'s output loop never translated a
  literal `clause.sub` through `S[...]`.** `const form = F[clause.form]`
  unconditionally translates the form id string into an ordinal, but the
  parallel line for `sub` only did that translation on the `subFrom` branch
  (`took[clause.subFrom]?.sub`, already an ordinal from `parseKey`) — the
  literal branch left `clause.sub` as the bare string (e.g. `'timber'`).
  `model/items.js#holdable`/`write.spawn` index `SUB[sub]` with that string,
  get `undefined`, and silently produce nothing. `kindle` (Phase 1) is "the
  first recipe whose output form is not a compression tier" and therefore
  the first recipe to use a literal `sub` at all — it has been producing
  zero brands from every hand-craft since it shipped, invisible because
  `tools/content.mjs` checks the STATIC table shape (`S[c.sub]` correctly,
  it does the translation itself) rather than the runtime path, and no test
  exercises hand-crafting kindle end to end. Found by this phase's own
  required manual verification ("hand-craft peg rungs"), which hits the
  identical code path `peg_rungs` added. Fixed with one line
  (`S[clause.sub]` on the literal branch), symmetric with the existing
  `form` line, in `rules/crafting.js` — not this phase's file, but shipping
  a SECOND broken recipe on top of an already-broken one, when the fix is
  one line and zero risk, was judged worse than leaving it and noting it.
  Verified via the test hook: `kindle` now produces 3 `timber/brand` from 1
  `timber/log`, and `peg_rungs` produces 4 `timber/rung` from 2
  `timber/log`, both by holding the craft key.

- **`peg_rungs` shipped at 2 `timber/log`, not the phase's literal 1, and
  declared BEFORE `kindle` in `RECIPES` (previously `kindle` came first).**
  `rules/crafting.js#choose` is "first `HAND_RECIPES` row whose inputs are
  satisfied wins" (its own header already documents this as a known
  limitation pending a real menu, Phase 5). A 1-log `peg_rungs` has an
  IDENTICAL trigger set to `kindle`'s (`'timber/log':1`), so whichever is
  declared first is chosen EVERY time both are satisfiable, forever — the
  other becomes permanently unreachable by hand, not merely inconvenient.
  `kindle` first (its Phase-1 position) starves `peg_rungs` outright.
  `peg_rungs` first, at the same 1-log cost, starves `kindle`, which Phase
  2b needs hand-reachable to restock the one carried light source — a worse
  outcome. Requiring 2 logs and declaring `peg_rungs` first breaks the tie
  without touching `kindle`'s own numbers: exactly 1 log fails `peg_rungs`'s
  stronger requirement and falls through to `kindle`; 2 or more satisfies
  `peg_rungs` first. Not caught by `tools/content.mjs` (a content-graph
  check; hand-craft priority is a different question) — caught by this
  phase's own manual-verification step, exactly the class of thing
  CLAUDE.md's "a test that measures the wrong thing" warning is for. A real
  fix (letting the player choose which of two satisfied recipes runs) is
  Phase 5's GUI; this is documented here so a later phase does not "clean
  up" the ordering/quantity without knowing why it is load-bearing.

- **The lift's "boarding refusal for a stage going UP" has no existing
  rider mechanic to refuse.** Audited `rules/lift.js`, `model/machines.js`
  and `rules/machines.js`: the winch carries ITEMS only
  (`itemsIn(deckBox(m))`), and nothing anywhere tests the player's own
  hitbox against a machine for collision (`rules/machines.js` only uses
  `playerBox()` for hand-feed reach). There is no code path today where a
  player physically rides a lift stage. Implemented the refusal as the
  narrowest thing consistent with "the upward-boarding refusal only": when
  a charged stage is about to ascend, if the player's hitbox overlaps the
  deck box AND they are over the hard cap, the stage holds where it is
  (charge intact) instead of ascending, with a `'refused'` journal row. This
  does not add a rider mechanic (the deck still only carries items via
  `carry()`); it only stops an over-cap player standing on the deck from
  ascending WITH it once one exists. If a future phase adds real
  player-riding, revisit this check against whatever mechanism carries the
  player.

- **The drop verb's journal row reuses the `'place'` kind, not a new
  `'dropped'` kind.** `shell/notify.js` and `data/sfx.js` — the only files
  that could name a new kind's text/sound — are outside this phase's FILE
  OWNERSHIP (`data/sfx.js` is explicitly owned by a sibling phase this
  cycle). `'place'`'s existing `TEXT` handler already renders exactly this
  row shape (`{sub, form}`, no `machine` key) as `"<PAIR> PLACED"`, which is
  the closest true statement already wired, at the cost of imprecise wording
  ("PLACED" rather than "DROPPED") for the one new verb. Whichever phase
  next owns `shell/notify.js`/`data/sfx.js` should add a dedicated
  `'dropped'` kind (silent or a soft thud, and `"<PAIR> DROPPED"` text) and
  repoint `rules/items.js#dropHeaviest`'s `push()` call at it.

- **The pickup-refusal rate limit lives in `rules/items.js` as a local
  `WeakMap`, not as a `data/sfx.js#MIN_GAP` row.** The plan's own wording
  points at that file's existing idiom (`rules/mining.js`'s `'pick'` row is
  pushed every frame and rate-limited downstream by `MIN_GAP`) as the
  pattern to follow, but `data/sfx.js` is outside this phase's FILE
  OWNERSHIP and `'refused'` already carries no sound to gap in the first
  place — only the toast text. Implemented the same *effect* (a refused
  pickup does not re-push every frame) entirely inside the owned file
  instead, keyed by item object identity so a removed item needs no
  explicit cleanup. No new tunable or content row.

## Phase 1 (registry extension implementation)

- **`brand`'s `massK` shipped at 0.3, not the ~0.5 the plan proposed.**
  `tools/content.mjs`'s own mass-conservation check (assertion 6) caught this
  during implementation: `recipes.js#kindle` turns ONE `timber/log` (massK
  1.0) into THREE `timber/brand`, so at `massK:0.5` a kindled log would net
  MORE mass than it started as (3 x 0.5 = 1.5 against the log's 1.0) —
  exactly the "accidental infinite-material loop" the check exists to catch,
  and not something `transmute:true` should paper over, since nothing is
  actually being created here, only split lighter. 0.3 keeps 3 brands (0.9)
  at or under one log (1.0). `docs/PLAN-phase1.md`'s row was written before
  this was checked and undersells the point of shipping the lint in the same
  commit as the content it lints — left as historical record there, corrected
  here and in the shipped `src/data/forms.js`.

- **Adding `granite`/`adamant` to `topsoil`'s strata (as directed, FILE
  OWNERSHIP explicitly named `src/data/world.js` strata for this) moved two
  screenshot baselines**, both re-accepted with `npm run
  test:visual:update` rather than left red or worked around:
  - `map.png` ("the map overview, fully explored") legitimately shows new
    rock at depth once every band is revealed — that test's entire purpose is
    to show everything placed in the world, so THIS diff is the content
    landing, not a regression.
  - `digging.png` ("digging down into topsoil") moved by only ~20 px despite
    the player never digging anywhere near the new strata (they are at
    `fromTy` 120/220 in a 320-tile band; the dig test breaks a handful of
    tiles near spawn, in the SURFACE band, not TOPSOIL at all). Root cause,
    confirmed by temporarily reverting only the `world.js` strata edit and
    re-running (diff vanished): `rules/generate.js` states worldgen consumes
    `rand()` in a single, fixed, cross-band stream (bands in declaration
    order, astral → surface → topsoil). Adding 60 new blob placements to
    topsoil's generation consumes 60 additional `rand()` draws BEFORE the
    player ever acts, which shifts every `rand()` call downstream of it —
    including the toss-scatter draw on the first item the dig test mines —
    to a different position in the stream. This is invariant 7 working as
    designed (the run is still bit-reproducible FROM ITS SEED; the seed now
    produces a different, equally deterministic, result because the content
    it generates changed) rather than a rendering bug: `npm run check`'s
    purity/determinism probes (section 2, and the "one seed, two runs"
    behavioural check) both still pass. Flagging because this means ANY
    future edit to a band's `strata` array — not just this one — will move
    `digging.png` by a few pixels for the same reason, and that surprise is
    worth knowing going in rather than re-discovering per phase.

- **The orphan-check as originally specified would fail on day one.**
  `src/data/forms.js#crossable` is an ANY-match on tags: `gravel`'s `subTags`
  is `['metal','rock']`, so `copper/gravel` and `tin/gravel` are already
  `holdable()` today even though no mining path or recipe has ever touched
  them. `docs/BUILD_PLAN.md` Phase 1's original assertion 5 text asserted
  reachability over the *full* holdable space, which would flag this
  pre-existing, harmless gap as an orphan immediately — and would have made
  tagging `adamant` as `metal` (for a future ore/ingot/plate path) create three
  more false positives (`adamant/ore`, `adamant/ingot`, `adamant/plate`), none
  of which any recipe produces this phase. **Fixed by editing the phase spec
  directly**: the universal set is now pairs the content table actually
  *declares* (a recipe's concrete output, or a machine cost key), not every
  pair the tag algebra happens to permit.

## Phase 2b (light and darkness)

- **Three touches outside this phase's own FILE OWNERSHIP list, all forced by
  the phase's own CONTENT section rather than discovered mid-implementation,
  and all kept to the smallest change that made the requested design work.**

  - **`src/model/run.js`: added `RUN_SCHEMA.brandLeft` and `write.brand()`.**
    The phase spec is explicit: "Burn time is a SCALAR ON run, not per-item
    state — `run.brandLeft`, ticked by `rules/light.js` — for the same reason
    `run.craftProgress` is a scalar... It resets with the run for free
    (invariant 8)." That sentence is only true if the field actually lives on
    `run`, next to `craftProgress`, reset by the same `Object.assign` in
    `write.reset()`. The alternative — a module-scoped variable inside
    `rules/light.js`, matching that file's own perf cache for
    `bandState` — was rejected because `bandState` is *allowed* to leak
    across a restart (it invalidates itself: fresh band objects are never
    found in it) while a burn-time countdown is real gameplay state that must
    reset to 0 exactly when a run does, and a `rules` module has no hook into
    `newRun()` to force that. Getting invariant 8 right cost two lines in a
    file this phase was told not to touch; leaving it out would have shipped
    a determinism bug (old run's remaining brand time bleeding into a new
    one) in the one file most explicitly protected by the phase text's own
    reasoning for why the field should exist at all.

  - **`src/data/tuning.js`: added `brandLevel` (value, 9, levels).** Phase 1
    already added `lightMax`/`lightFalloffAir`/`lightFalloffRock`/`brandSecs`
    in anticipation of this phase, but not a level for the carried brand
    itself — the phase text just states "level 9" as prose. A brand is a
    substance/form pair, not a data row this phase owns (`data/forms.js`,
    `data/substances.js` are both off-limits), so there is no row anywhere to
    hang a `9` off; `rules/light.js` is the only reader. Adding one tuning
    row is the smallest way to avoid a bare magic number in `rules/`, and
    matches ARCHITECTURE's own rule that every number introduced this way is
    a `data/tuning.js` row read through `eff()` — the omission from this
    phase's FILE OWNERSHIP list reads as an oversight (Phase 1 anticipated
    everything else this file needed) rather than a deliberate exclusion.

  - **`src/data/boons.js`: added `brazier` and `hearth` to
    `STARTING_MACHINES`.** Neither machine is placeable otherwise —
    `run.granted` seeds from this list and nothing else exists yet to grant a
    machine mid-run (no director, no boon content beyond the one
    `gift-kiln` row) — and the phase's own required manual verification is
    "place a brazier and confirm the strata become visible again... None of
    that may require a debug key." The file's own header already states the
    exact precedent being followed: `press`/`belt_r`/`belt_l` are there
    "PROVISIONALLY... free for testability now... this is the row on this
    list most likely to move to `BOONS` the moment there is one." `brazier`
    and `hearth` are the identical situation for the identical reason.

- **`src/view/paint.js` was NOT touched**, per the phase's own "prefer the
  overlay pass and say why" instruction. Baking darkness into the chunk
  canvas would require repainting a chunk every time light changes inside
  it — exactly the per-tile-static-texture cache `b.ver` exists to avoid
  thrashing (`view/paint.js`'s own header: a chunk canvas caches the STATIC
  rock texture) — whereas light is a CURRENT condition that can change
  without any tile write at all (a brazier running dry). The overlay pass in
  `view/scene.js` reads `lightAt()` live, the same way `drawFog` already
  reads `seenAt()` live, and costs nothing extra to keep in sync.

- **The reachability/orphan checks in `tools/content.mjs` needed no changes**
  for either new machine: `brazier`'s cost (`timber/log`, `stone/gravel`) and
  `hearth`'s cost (`copper/plate`) are already reachable through existing
  mining drops and the `press` recipe respectively, and neither machine's
  `light` key is inspected by any assertion there — `light` is invisible to
  the content lint entirely, which is correct: it is a rendering/mechanics
  key with no selector, mass or tunable-scope shape for that file's checks to
  apply to.

## Phase 2c (mining tiers and the automated line)

- **`data/recipes.js#auger` collides with `#daedalan` the identical way
  `peg_rungs` collided with `kindle` in Phase 2a — not caught by
  `tools/content.mjs` (a content-graph check, not a hand-craft-priority one),
  found by reasoning through `rules/crafting.js#choose`'s own documented
  "first satisfied wins" rule before it could bite as a manual-verification
  surprise. Both recipes share input KEYS `copper/plate` + `timber/log`, at
  the same plate count (2) and different log counts (4 for `daedalan`, 1 for
  `auger`), so holding 4+ logs satisfies both simultaneously. Resolved the
  same way: the STRONGER recipe (`daedalan`) stays declared first — it
  already was, since `auger` is appended after it — so holding 4+ logs always
  yields a stair, and holding 1-3 falls through to the auger. A player who
  wants the auger keeps their log stock under 4 when crafting it. No numbers
  changed to fix this, only the (already-correct, append-only) declaration
  order confirmed and documented.

- **`cyclops_maw`'s build cost and `minDepth` are this phase's own numbers,
  not named by `docs/BUILD_PLAN.md`.** The plan gives `talos_head`'s cost (8
  `copper/plate` + 2 `copper/ingot`) explicitly but says only "priced" for
  the Maw, with no figure. Priced at 16 `copper/plate` + 6 `copper/ingot` + 6
  `granite/gravel` — granite-tier, not adamant-tier, deliberately: the one
  substance the Maw alone can mine (`tile.tier:3`) cannot also be a
  prerequisite for building it, or nothing could ever build the first one.
  `minDepth:200` was chosen against `data/world.js`'s own adamant blobs
  (topsoil row 220, depth ~256 by `view/hud.js`'s datum), leaving room to
  place it on the approach rather than only once already standing in the
  vein. Both numbers are now locked in `docs/SPEC.md` section 12.

- **The Maw's rate is NOT faster than the Talos Head's, by design, though
  nothing in the plan explicitly required this for T4.** The plan states
  "T3 must not out-throughput a hand at T2" as a requirement on the Talos
  Head specifically; it is silent on whether the Cyclops Maw (T4) may be
  faster than that same rate. Chose uniform equality across every placed
  miner — `rules/machines.js#bestHandToolPower()` scans every substance's
  `item.tool.power` and applies the same maximum to any `mine`-carrying row,
  with no per-tier branch — because `docs/DESIGN.md`'s own rule ("automation
  buys parallelism and nothing else") does not carve out an exception for a
  higher machine tier, and a Maw that both reaches harder strata AND breaks
  faster would double-dip on the one axis the design explicitly reserves for
  hands. The Maw's real advantages are the `tier:3` gate (adamant, which no
  hand tool can ever reach) and `tiles:3` (a face, not a point) — both
  capability, neither rate.

- **Fuel economy (`mine.secs`) is a continuous drain with TIME spent
  chewing, not a per-tile cost**, tracked in a local `WeakMap` inside
  `rules/machines.js` (`fuelClock`) rather than a `model/machines.js` record
  field: that file is not this phase's to extend for a number only the
  `mine` branch reads, and `m.prog` already belongs to `produce()` (which
  zeroes it every frame a `mine`-only row's empty `recipes` list matches
  nothing). Same shape as the pre-existing `recipeCache` in the same file.
  This is why `cyclops_maw`'s "high fuel draw" is a smaller `secs` (3.0 vs.
  `talos_head`'s 12.0) rather than a bigger fuel cost per tile: the tier list
  names it as a running cost, not a per-bite one.

## Phase 0 (cartography)

- **`src/rules/player.js:113`** — `hurt(5, 'THE VOID')` hardcodes the
  void-death damage instead of reading `eff('fallMax')` (already a
  `data/tuning.js` row, base `5`, `unit:'hearts'`). The two only agree by
  coincidence today; a boon that ever changes `fallMax` would silently desync
  void-death lethality from ordinary fall lethality. Pick up in **Phase 2a**,
  which already owns `rules/player.js` this cycle — one-line wiring fix, not a
  new tunable.

- **Toss-velocity family** — four call sites independently hardcode a
  different upward-toss magnitude for the same invariant-5 "material becomes a
  falling item" idiom: `rules/mining.js:109` (`-30..-50`),
  `rules/trinkets.js:43` (`-60`), `rules/crafting.js:101` (`-50`),
  `rules/machines.js:186` (`-70`). Phase 2a's new drop verb was about to become
  a fifth independently-chosen number. **Resolved in Phase 1**: add
  `tossUp` (value, px/s) and `tossSpread` (value, px/s) tuning rows; Phase 2a's
  drop verb reads them through `eff()` from the start, and the four existing
  call sites may be left as-is unless a phase agent is already touching that
  line for another reason (not worth a drive-by edit across four files owned
  by three different phases).

- **`src/model/items.js:57`** — `write.spawn`'s default `vy = -40` is dead
  code; every current caller passes an explicit `vx`/`vy`. Not a bug, just
  worth knowing the default has no effect — noted so Phase 2a's drop verb
  passes an explicit, tuned value rather than relying on it.

- **Schedule ordering conflict with `docs/BUILD_PLAN.md` Phase 2b** — resolved
  by editing that phase's spec directly (see the "Fixed after Phase 0" note
  inside `docs/BUILD_PLAN.md` Phase 2b). Recorded here for the historical
  record: the live `STEPS` order is `player → reveal → mining → …`, not
  `player → mining → reveal → …` as the original phase text assumed, and the
  header comment's justification for `reveal` sitting where it does
  ("reads nothing mining touches") is exactly the invariant Phase 2b's own
  light-gated Pass B breaks. The fix moves `reveal` to sit after the new
  `light` step, which itself sits after `mining`, and updates the header
  comment's reasoning for both pairs.

## Phase 3 (buildables cost real material)

- **`tests/visual.spec.js` touched, outside this phase's own FILE OWNERSHIP
  list, because two existing tests asserted behaviour this phase deliberately
  changed.** `'a placed furnace'` pressed `f` and expected an immediate,
  free placement; `'the build menu places the machine at the pressed
  number...'` pressed `3` (press) with no materials granted. Both were true
  of the OLD, free `furnace`/`press`, and both are now false: `f` is gated
  behind `flags.showDebug` (off by default) and `furnace`/`press` cost real
  material (`docs/SPEC.md` section 13). `tests/` is not in this phase's
  FILE OWNERSHIP, but leaving either test red would fail
  `npm run test:visual` for a reason that has nothing to do with a pixel
  regression — the same class of forced, minimal, documented touch Phase 2a
  and Phase 2b's own FINDINGS entries already made for `rules/crafting.js`
  and `model/run.js`/`data/boons.js` respectively. Fixed by granting the
  exact bill each test needs via `model/run.js#write.collect` before the
  keypress, and switching the furnace test from `f` to the build menu's `1`
  (furnace is index 0 of `STARTING_MACHINES`) — the SAME surviving mechanic
  the phase spec itself designates as the sole real entry point. Neither
  test's own POINT (the furnace's look; which machine a digit places) changed.

- **Deconstruct's success event reuses the `'place'` journal kind, not a new
  `'deconstruct'` kind, the identical constraint and the identical fix shape
  Phase 2a's drop verb already hit.** `shell/notify.js`'s `TEXT.place`
  handler already renders `{machine}` as `"<NAME> PLACED"` — wrong verb for a
  removal, but the closest true-shaped statement already wired.
  `shell/notify.js`/`data/sfx.js` (the only files that could add a dedicated
  kind and its text/sound) are outside this phase's FILE OWNERSHIP. Whichever
  phase next owns those files should add a `'deconstruct'` kind (silent or a
  soft thud, `"<NAME> DECONSTRUCTED"` text) and repoint
  `rules/placement.js#deconstruct`'s `push()` call at it.

- **The ghost preview (`view/hud.js#buildGhost`) is driven by mouse hover
  over the open BUILD panel, not by a two-step "arm, then confirm" input
  redesign.** The phase text describes select -> ghost -> confirm as
  distinct steps, which would need the `1`-`9` digits to stop placing
  immediately and instead arm a pending selection for a later confirm key.
  That is a real input-model change with no small blast radius: the digits'
  immediate-placement behaviour is explicitly protected elsewhere in this
  same phase's text ("press 3 places the third row... cannot disagree") and
  is exercised by an existing screenshot/behavioural test
  (`tests/visual.spec.js`'s `'the build menu places the machine at the
  pressed number...'`). Hovering a BUILD row with the pointer previews that
  machine's footprint at the current aim reticle, tinted by the SAME
  `model/run.js#placementCheck` query `rules/placement.js#placeMachine`
  calls, with the one-word reason drawn beside it when invalid — satisfying
  "ghost preview, one model query, two readers" without touching how the
  keyboard flow places a machine. A keyboard-only player still gets the
  refusal reason as a toast after pressing a digit (`shell/notify.js`'s
  `'refused'` handler, unchanged); a mouse-and-keyboard player additionally
  sees it before committing. Picking one buildable's footprint to preview
  (machines, via the BUILD list) rather than every buildable named in the
  phase text (rungs, stairs, braziers, miners are all rows of the SAME list,
  so they preview identically; belts and other multi-tile machines too) is a
  consequence of `placementCheck`'s own signature, which is machine-shaped
  (`band, machineId, tx, ty`) — tile placement (`rules/placement.js#
  placeTile`, rungs/stairs from the pockets) has a different validity shape
  (a "backed" check, no `cost`/`footing`/`minDepth`/`granted`) that the phase
  text's own function signature does not cover, and adding a second model
  query for it was judged out of scope for this pass.

- **`press`'s cost (4 `copper/plate` + 2 `copper/ingot`) is this phase's own
  number, not named by `docs/BUILD_PLAN.md`.** The plan says only "priced"
  for `press`, unlike `furnace`/`lift`, which it gives exact bills for.
  Priced in the SAME tier the machine itself produces (plate), the same
  "pay in the tier above" shape `lift`'s own cost already uses, and cheap
  enough that a player who hand-presses (`data/recipes.js#press`,
  `hand:true`, still free of any machine) can reach it without first owning
  one. See `docs/SPEC.md` section 13.

- **`placementCheck`'s winch-shaft arithmetic duplicates
  `rules/lift.js#reaches` rather than importing it.** `model/run.js` is
  `model`, `rules/lift.js` is `rules`, and a model query may not import
  `rules` at all (nor may `rules` modules import one another) — so the one
  fact ("does this stage's span reach its destination band from here") is
  computed twice, once against an already-placed machine record
  (`rules/lift.js#reaches`) and once against a proposed footprint
  (`model/run.js#placementCheck`). Both read the identical `def.lift.span`/
  `toBand` off the same frozen row and call the same `bandAt`/`bandOf`
  queries, so the two cannot disagree about what the row means even though
  the arithmetic itself is not shared code.

## Phase 4 (the four modifier tiers)

- **`src/data/substances.js` touched, outside this phase's own FILE
  OWNERSHIP list, because a miracle CANNOT exist without one.** Unlike
  `data/tuning.js`/`rules/mining.js`, the plan does not name
  `data/substances.js` as an explicit exception. But `data/miracles.js`'s own
  header states the rule this phase was told to follow verbatim: "a miracle
  is a HELD PAIR... `id` is a substance id... needs an element of its own for
  the identical reason a trinket does." There is no alternative shape that
  keeps a miracle inside `data/miracles.js` alone -- the same structural
  necessity Phase 2b's own FINDINGS entry already made for `run.brandLeft`
  and Phase 2c's for `cyclops_maw`'s numbers. Added one row, `chasm` (tags
  `['miracle']`, crossing only into `forms.js#phial`, per that form's own
  `subTags` restriction), matching the tier's "content is deliberately
  thin" convention -- exactly one miracle shipped, exactly one substance row
  needed.

- **`data/drops.js`'s `trigger:'tribute'` row is NOT YET CONSUMED.** Phase 4
  STEP 4 names "a drop table on tribute completion" as trinket source (a),
  ahead of "a rare drop from deep strata tiles" (b). Audited
  `src/model/run.js`/`src/rules/`: `run.tribute` is written
  (`write.tribute(t)`) but nothing anywhere ever COMPLETES a tribute -- there
  is no cycle system, no clock, no consumer. Wiring source (a) to an event
  that does not exist would mean inventing the event, which is explicitly
  Phase 5+/"cycle draft, once cycles are real" territory per this same
  phase's own text for source (c). Shipped source (b) instead --
  `rules/mining.js`'s rare-drop hook, the plan's own explicit, narrow
  exception to this phase's FILE OWNERSHIP -- as the ONE live, reachable
  trinket source this phase, and left the tribute row in `data/drops.js` as
  data-ready-but-unconsumed, exactly the shape `docs/BUILD_PLAN.md` already
  accepts for source (c). Verified live via a headless script mining a
  granite tile (tier 2) 300 times with a tier-2 tool: multiple
  `bellows/relic` items were spawned by the hook (visible in
  `model/items.js#items`), through `rand()` and nowhere else.

- **`shell/input.js`'s key reshuffle happened across TWO commits, not one,
  by design.** Step 1 (the pure rename) kept `'b'` bound to exactly what it
  already did (the machine-grant draft, string renamed `'boon'` ->
  `'grant'`) so that commit's own "zero behaviour change" claim is literally
  true. Step 2 (this commit) is where `'b'` actually moves to the new timed
  tier and the grant draft moves to `'k'` -- the rebind could not happen
  correctly in Step 1 because the timed tier's rules/model files did not
  exist yet to bind it to. Final bindings, all behind `flags.showDebug`
  except the two real actions: `t` trinket draft, `b` boon draft, `k` grant
  draft, `y` miracle draft (all debug-only spawns); `v` use a held miracle,
  `p` equip the first held-but-unequipped trinket (both real actions, always
  live).

- **The debug-grant draft for miracles reuses `wants.draft = 'miracle'`,
  the SAME string `cmd.miracle` (a boolean, unrelated) happens to share in
  English.** Two different namespaces (`wants.draft` is a string enum,
  `cmd.miracle` is an edge-triggered flag) so there is no actual collision,
  but flagged here in case a future reader assumes there is one from the
  name alone.
