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
  commit as the content it lints — that plan document is now deleted (spent),
  and the corrected number lives here and in the shipped `src/data/forms.js`.

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

## Phase 5a (the widget layer)

- **`text.js` was not created.** The primitives list names it "only if they
  earn their keep." Nothing this phase needs beyond `core/font.js#drawText`/
  `textWidth` as-is — no truncation-with-ellipsis, no multi-line wrap. Phase
  5b's crafting grid (a recipe name plus a missing-ingredient label, both at
  fixed widths) is the first plausible need; add it there if it turns out
  to, rather than speculatively now.

- **Click DISPATCH — hit-testing a UI click against a drawn rect and calling
  into `rules` — is explicitly Phase 5b's, not this phase's.** `cmd.uiClick`/
  `uiRight`/`uiCtrl`/`uiShift`/`uiWheel` (`src/shell/input.js`) and
  `shell/ui.js#setDrag`/`clearDrag` exist and are exercised by this phase's
  scratch harness directly, but nothing in `shell/main.js#applyIntents` reads
  them yet, because there is no drawn slot for a click to land on until a
  real panel exists. Phase 5b's dispatcher hit-tests `cmd.mx/my` (or the
  `uiClick`-time coordinate) against whatever `view/ui/*.js` drew that frame
  — the same rects `__mf.ui` projects — and only then decides drag-start vs.
  a plain click vs. a shift/ctrl-modified one.

- **`shell/ui.js#ui` is not cleared by `newRun()`.** It is presentation
  state (which panel is open, which tab, scroll position), never read by
  `rules` or `model`, so a field surviving a restart is not the invariant-8
  determinism bug it would be for `model` state — a player probably wants
  their open panel to survive their character dying. Flagged in case a
  later phase disagrees and wants it reset on death specifically (not on
  every `newRun()`).

## Phase 5b (the panels)

- **The `run.known` seeding decision, restated plainly for the commit that
  reads this file and not the code comment.** `model/run.js#RUN_SCHEMA.known`
  is a plain array of recipe ids (matching `run.granted`'s own shape, not a
  `Set`), seeded in `write.reset()` with every `HAND_RECIPES` id. Nothing is
  locked at game start because no drop/tribute/draft source that would ever
  reveal a NEW recipe exists in this build — Phase 4's "recipes are stolen"
  framing is about a future source, not this one. The CRAFTING tab's
  silhouette rendering path (`view/ui/mainPanel.js`'s `!known` branch in its
  recipe-grid item builder) is real, wired, and untestable by demonstration
  today: there is nothing to lock. The next phase that adds a real locking
  source (a rare mining drop, a tribute reward, a god's draft) should push
  new ids OUT of `run.known` at `newRun()` time (currently everything ships
  in) rather than adding a second, parallel "locked" list.

- **The craft queue is UI state over the SAME one-pair-of-hands scalar,
  not a new mechanic — the design question this leaves on record.**
  `rules/crafting.js#step` reads exactly one thing, `cmd.craft`, and forgets
  `run.craftProgress` the instant it goes false; it has no notion of "next in
  line." `shell/ui.js#ui.craftQueue` is a FIFO of recipe ids with no rules
  awareness at all. `shell/main.js#step` re-asserts `cmd.craft = true` every
  substep the queue is non-empty (a second source doing exactly what the
  `'u'` key already does — the two cannot conflict, only agree), and
  `shell/main.js#tickCraftQueue` drains one entry per real hand-craft
  completion, detected by peeking `model/journal.js` for a `'produce'` row
  shaped `{sub,form,made}` with no `def` key — the exact, pre-existing shape
  `rules/crafting.js` already pushes and `rules/machines.js`'s OWN
  `'produce'` row (`{def,made}`, no `sub`) does not, so the two kinds can
  never be confused without any new journal kind or any `rules` edit.
  CONSEQUENCE, stated as the open design question: because `choose()` in
  `rules/crafting.js` always runs the first HAND_RECIPES row it can afford in
  TABLE ORDER — not "whichever recipe the queue asked for" — a queued recipe
  only actually runs if it is *also* the first one the player's current
  pockets satisfy. Queuing `daedalan` while holding enough `timber/log` and
  `copper/plate` to *also* satisfy `smelt` (they do not share inputs today,
  so this cannot happen with current content, but a future recipe could
  make it possible) would silently drain the queue on `smelt` completions
  instead. `tickCraftQueue` cannot tell the difference — it dequeues on ANY
  hand-craft completion, not the one it asked for — because doing better
  would mean either duplicating `choose()`'s own selection logic in `shell`
  (a second implementation of "which recipe runs" to keep in sync with the
  first) or changing `rules/crafting.js` to accept a preferred id (a rules
  change this phase's FILE OWNERSHIP does not include). Whichever future
  phase touches `rules/crafting.js` next should decide whether the interpreter
  should accept a hint at all, or whether the honest fix is a UI warning when
  a queued recipe is not what would actually run next.

- **Drag hit-testing needed a `cam` snapshot that did not exist before this
  phase — a real bug, found and fixed, not a design question.**
  `view/scene.js#render()` rounds `cam.x`/`cam.y` to integers IN PLACE before
  drawing anything, and `updateCamera()` (inside `step()`, which runs BEFORE
  `draw()` every frame) eases `cam` again immediately afterward, continuously,
  even while the player stands still and the camera is still converging from
  wherever it started. A UI click's world-space `cmd.mx/my` (encoded against
  whatever `cam` was live at click time) therefore could not be decoded back
  to the SAME screen coordinate the panel was drawn at by subtracting the
  LIVE `cam` a `shell/main.js#applyIntents` call later — the two `cam` reads
  could legitimately differ by several pixels, and did, reproducibly, in
  manual verification (a drag confidently missed its own source slot).
  Fixed by snapshotting `cam` into a private `drawCam` right after each
  `draw()` call (the exact position everything in `view/ui/state.js#drawn`
  was laid out against) and hit-testing against THAT instead of the live,
  still-easing `cam`. `view/hud.js#buildGhost` and `view/hover.js` never hit
  this because they run INSIDE the same `render()` call that just rounded
  `cam`, with no `updateCamera()` in between; `shell/main.js`'s own dispatcher
  is the first thing in this codebase to hit-test a click ACROSS a frame
  boundary against screen-space geometry, which is why the bug did not exist
  before Phase 5b needed exactly that.

- **The bottom-of-screen "key hints" bar the task brief named
  (`view/hud.js#hint`) turned out not to be that bar.** `view/hud.js#hint`
  is, and always was, the transient TOAST line (`view/fx.js#toasts`), not a
  static legend. The actual permanent key-hints strip is `#keys` in
  `index.html` — plain HTML/CSS, `position:fixed`, entirely outside the
  canvas and outside this phase's FILE OWNERSHIP (`index.html` is not listed
  in Phase 5b's ownership block, and CLAUDE.md's D2 doctrine treats a DOM
  overlay as the wrong technology for game UI in the first place — this one
  predates that doctrine and was left alone rather than extended). It could
  not be "converted" or "collapsed" without editing a file this phase may
  not touch. The QUICKBAR's own one-toggleable-line hint
  (`view/ui/quickbar.js`, `ui.hintsOpen`) is a canvas-drawn, in-ownership
  parallel realisation of the same idea — collapsed to `'KEYS'` by default,
  click to expand — and the two now coexist (the HTML one always visible,
  centred; the canvas one bottom-left, collapsed). A future phase with
  `index.html` in its ownership should retire the HTML one in this canvas
  one's favour rather than maintaining both.

- **Logistics machine STATE is a heuristic over `model/machines.js`, not a
  duplicate of `rules/machines.js`'s own decisions.** `view` may not import
  `rules`, and this tab is explicitly a stub. RUNNING is `m.running ||
  m.charges > 0` (a lift/belt holding a banked charge reads as doing its job
  even the instant it is not ticking). UNFUELLED fires only when the
  machine's own `ports` declare a fuel-accepting selector and none is
  buffered. Anything else with SOME buffer contents reads STALLED — a full
  output port, a cold `needs` field gate, and a servo throttle all collapse
  into this one bucket, because telling them apart needs `rules` knowledge
  this tab does not have. An entirely empty buffer reads BLOCKED. A future
  phase that wants the real distinction should either expose a `why not
  running` reason off the machine record itself (a `model` addition, the
  same shape `rules/placement.js`'s `why` strings already use for a refused
  placement) or accept the stub is a stub.

- **Manual drag/drop only produces a signal while the panel is open, by a
  Phase 5a decision this phase did not need to revisit.**
  `shell/input.js`'s pointer handlers route a click into `uiClick`/`uiDown`
  ONLY while `isOpen(top())` is true at the moment of the DOM event;
  otherwise the same click is a world action (`place`/`mouse`). This means
  dragging an item onto the quickbar, or clicking the hints toggle, is only
  possible while the main window is open — consistent with how every other
  UI intent already behaves, and not a new restriction, but worth recording
  since the quickbar itself is drawn (read-only) at all times.

- **Manual unequip has no rule to dispatch, so it is not wired.**
  `rules/trinkets.js` exposes `grant`/`equipFirst`/`step` and nothing that
  clears a specific occupied slot on request — only losing the item (a drop,
  a future hazard) clears one, via `step()`'s own reconciliation pass. Drag-
  OUT-of an equipment slot is therefore a no-op in `shell/main.js`'s
  dispatcher rather than a silently-wrong action. Adding a real unequip verb
  is a `rules/trinkets.js` change, outside this phase's FILE OWNERSHIP.

- **Drag-to-equip dispatches the SAME `equipFirst()` the `'p'` key already
  calls, not a slot-specific equip.** This was the task brief's own explicit
  instruction ("a NEW, additional path to the same underlying action"), and
  with exactly one trinket in the game the two are indistinguishable in
  practice: whatever is dragged onto an equip slot, `equipFirst()` equips
  the first held-but-unequipped trinket, which is necessarily the one that
  was dragged. A second trinket would expose the gap; adding a slot-aware
  equip is a `rules/trinkets.js` change this phase may not make.

- **The craft-search field's keyboard capture swallows every other key
  while focused, including panel-closing Escape's usual meaning.**
  `shell/input.js`'s keydown handler branches to search-text handling FIRST,
  before any other binding, whenever `ui.searchFocus` is true — Escape and
  Enter both unfocus the field (not close the panel; a second Escape does
  that). This is the intended "only one thing owns the keyboard at a time"
  behaviour a real text input gives for free and this project has to hand-
  roll (no DOM `<input>` under `stage.cv`, per invariant 11).

## Phase 6 (harness)

- **No pre-commit hook infrastructure exists in this repo, so `check:content`
  is not wired to one.** Checked `.git/hooks` (nothing but the sample scripts
  Git ships by default) and the repo root/`package.json` for a Husky config
  or a `.huskyrc`/`simple-git-hooks` entry — none exists. Inventing a hook
  framework was explicitly out of scope for this phase ("if no pre-commit
  infrastructure exists in this repo, skip that part and note it here rather
  than inventing a new hook system"). `npm run check:content` remains
  runnable on demand and is also section 1b of `npm run check`, so it is not
  unreachable — it is simply not yet enforced automatically before a commit.
  A future phase that wants that enforcement should add Husky (or an
  equivalent) as a `devDependency` and a `.husky/pre-commit` calling
  `npm run check:content`, rather than hand-rolling a `.git/hooks/pre-commit`
  script that `npm install` cannot install for a second clone.

- **`tools/content.mjs`'s new depth-gate assertion (14) had a real bug on its
  first pass, caught by this phase's own "deliberately break it" requirement
  — not by real content.** `minMineDepth(subOrd)` compared a strata row's
  `s.sub` (a bare content-id STRING, e.g. `'granite'`, exactly as
  `data/world.js` writes it) directly against the ORDINAL its caller passed
  in (`S[subId]`, a number) — `string !== number` is always `true` in JS, so
  every substance's minimum mine depth silently came back `Infinity` and the
  new assertion could never fire, on real content OR on a deliberately broken
  one. Found immediately when the required "confirm this fails" step (see
  the phase's own acceptance criterion) produced zero violations against an
  obviously-broken `cyclops_maw.minDepth`. Fixed by translating the strata
  row's id through `S[...]` before comparing, matching how every other query
  in this file already works in ordinals. Left as a reminder of CLAUDE.md's
  own warning: "a test that measures the wrong thing passes and teaches
  nothing" — the fix was verified by re-running the same deliberate break and
  watching it fail correctly this time.

- **CONSERVATION (Tier 2, `tools/check.mjs`) is a STRUCTURAL bookkeeping
  check, not a re-derivation of mass fairness.** A live ledger has no
  independent "correct" answer to compare a recipe's own output against --
  only its own bookkeeping -- so a dynamic conservation test can only ever
  prove "every mass bucket (`run.inv`, `items`, a machine's `buf`) changed
  exactly as much as its own accountable writers say it did", which is a
  real, different, and structurally meaningful claim: it would catch a
  future code path that pokes one of those three buckets directly instead of
  going through `model/items.js#write.spawn/remove`,
  `model/run.js#write.collect/spend` or `model/machines.js#write.take/
  consume`. Whether a RECIPE nets mass from nothing (a content bug, not an
  engine one) is, and remains, `tools/content.mjs` assertion 6's job -- the
  two checks are complementary, not duplicates, and this was verified by
  deliberately bypassing the write API (a direct `run.inv[...] +=` inside the
  fuzz loop) rather than by editing a recipe's numbers, which this
  particular assertion is provably insensitive to (see the "T2=T3" and
  "BREAK-EVEN DEPTH" entries below for the same "what does a LIVE test add
  over a STATIC one" question asked twice more).

- **T2=T3's hand-mining half is a direct call to
  `model/mining.js#write.add`, not a controlled player run through the real
  aim/collision pipeline.** Getting a real player's hitbox to sit dead
  centre on one tile row for 60 consecutive substeps (so `aimAtKeys`
  resolves to the SAME tile every frame) needs exact sub-pixel placement
  against `PW`/`PH`/tile-size arithmetic that is fragile to get right by
  hand and, if gotten wrong, fails for a reason that has nothing to do with
  T2=T3 -- and would only end up re-proving `rules/mining.js`'s own
  aim-resolution plumbing, not the RATE the test is actually about. The
  placed Talos Head side runs through the real `stepReal`/`main.step`
  pipeline in full (it is autonomous, so it has no such fragility), which is
  the stronger half of the two anyway.

- **BREAK-EVEN DEPTH's `k` is derived from live game numbers (the lift's
  honest fuel mass, its span in tiles, one raw-ore item's mass), not
  restated as a module constant.** `docs/DESIGN.md`'s "around depth 30" is a
  PRE-IMPLEMENTATION estimate, written before the lift/fuel economy existed
  in code at all (that file's own words: "the fuel economics are not
  simulated"). Computing `k` from what actually shipped gives raw ore a
  break-even of ~10 tiles, not ~30 -- printed for a human to compare, and
  the assertion itself only checks the SHAPE the design argument depends on
  (finite, positive, strictly deeper per compression tier, and within a
  broad sanity band), not the exact figure, so a future honest retune of the
  lift's span, its fuel, or the compression ratios moves the printed number
  without failing the suite for no reason. See the DETERMINISM/CONSERVATION
  entries above for the same reasoning pattern applied to two other
  Phase 6 probes.

- **`src/shell/main.js#installTestHook` grew two new members,
  `__mf.intent(name, args)` and `__mf.give(sub, form, n)`, named here per the
  phase's own instruction ("more than trivial").** `give` is one line
  (`runw.collect`) and needs no further comment. `intent` is a small
  dispatcher (`tab` / `slot` / `wheel` / `drag`) that locates its target rect
  from `__mf.ui()`'s own live projection rather than a hardcoded screen
  coordinate, arms the matching `cmd.uiClick`/`uiShift`/`uiCtrl`/`uiWheel`/
  `uiDown` flags, and runs exactly one substep so the real
  `applyUiIntents()` dispatcher (unexported, and rightly so — it is not a
  public API, only this handle's own methods reach it) processes it. Needed
  one new import in `src/shell/main.js` (`write as runw` from
  `model/run.js`), nothing else.

- **`conflictsWith` symmetry is NOT required by design, only consistency
  where both directions happen to exist.** `rules/boons.js#step` only ever
  resolves a conflict off the boon granted LATER (it walks forward from an
  earlier index looking for a rival at a later one), so today's two shipped
  hostile pairs are deliberately ONE-DIRECTIONAL: `poseidon-flood` names
  `hephaestus-forge`, and `hephaestus-forge` does not name it back. That is
  accepted design (the rivalry only fires when the aggressor is the one cast
  second), not a gap. `tools/content.mjs`'s new lint therefore does not
  require both directions to be declared — it only requires that WHERE both
  are declared, their `mode`s agree, since a pair disagreeing about
  suppress-vs-invert would make the outcome depend on grant order in a way no
  content author would choose on purpose.

## Post-launch GUI bugfix pass (Bugs 1–4, Polish 5–6)

- **A real, previously-shipped bug: `wants.machine` set from inside
  `shell/main.js#applyUiIntents()` can never place anything.** Found while
  wiring the LOGISTICS BUILD rows to a real click (Bug 1). `wants.machine` is
  read at the TOP of `applyIntents()` (before `applyUiIntents()`, which runs
  at the very END of the same function, can ever set it), and `clearEdges()`
  — called once every real animation frame regardless of what ran — wipes
  `wants.machine` back to `null` before the NEXT frame's block gets a turn.
  A digit key (`shell/input.js`) never hits this because the keydown handler
  sets `wants.machine` asynchronously BETWEEN frames, so it is already true
  when that frame's `applyIntents()` starts and the SAME call's own block
  consumes and self-clears it immediately. A UI click has no such head start:
  anything setting `wants.machine` from inside the dispatcher would be
  silently erased, never placing anything, with no error and no refusal
  toast — just nothing happening. Fixed by having the BUILD-row click call
  `placeMachine` directly (mirroring the `wants.machine` block's own
  footprint arithmetic) instead of setting the flag. Any FUTURE UI action
  that wants to trigger a `wants.*`-shaped one-shot intent from inside
  `applyUiIntents()` will hit the identical trap — worth remembering before
  reusing that pattern.

- **`cmd.hasMouse` flips aim from keys to the literal world point under the
  cursor the instant ANY real DOM pointer event fires** (`shell/schedule.js`:
  `if (cmd.hasMouse) mining.aimAtWorld(cmd.mx, cmd.my); else
  mining.aimAtKeys(cmd);`), and `shell/input.js#toWorld` sets `hasMouse=true`
  on every pointermove/down/up — including ones that land on a UI panel.
  This means clicking a BUILD row (or, pre-existing, pressing a digit key
  with the mouse resting over the old inventory panel) aims wherever the
  panel happens to sit over the world on screen, not wherever the player was
  last facing. Not a new bug this pass introduced — verified it is identical
  for the pre-existing digit-key path — but it made testing the real click
  fiddly enough to document: a real-click placement test must resolve
  `__mf.aim` from the ACTUAL mouse position first (one real frame after
  `page.mouse.move`), then build its scenario around whatever tile that
  actually is, rather than precomputing a target tile and assuming the click
  will land there. See `tests/visual.spec.js`'s "a LOGISTICS BUILD row
  places the machine" test for the pattern.

- **Bug 4 investigated, no spend bypass found.** Clicking an unaffordable
  recipe never spent or produced anything — `rules/crafting.js#choose()`
  gates every input on `bestPocketed` before ever touching `run.craftProgress`
  — confirming the reported "feels free" was a missing-refusal /
  feedback gap, not a bypass, exactly as suspected before investigating.
  Fixed by refusing the click outright (`shell/main.js`'s recipe-click
  branch) rather than queuing an entry `choose()` can never run.

- **Equip/unequip was wired for real, not left a clearer no-op.**
  `rules/trinkets.js` exposes no per-slot equip/unequip verb (only
  `equipFirst()`, "first empty slot"), but `model/run.js#write.equip(slot,
  sub)` already exists and is already trusted-caller by its own header
  comment — calling it from `shell/main.js`'s drag dispatcher (the same way
  `give()` already calls `write.collect`) needed no `rules/` or `model/`
  file edit. Dragging a trinket onto a specific equip slot now equips it
  there (not just "the first empty slot"); dragging between two occupied
  equip slots swaps them; dragging OUT of an equip slot onto anything else
  unequips it. `ui.drag` gained an `index` field to make this possible
  (which equip slot a drag started from, not just which grid).

- **The LOGISTICS tab's BUILD rows were never clickable at all.** They were
  bare `drawText` calls with no rectangle recorded anywhere — visually
  identical in style to the CRAFTING tab's numbered rows right next door
  (same numbering, same afford-colour convention), but only the matching
  digit key (1-9) ever placed anything. This is almost certainly what the
  original bug report ("can't click on a lot of the buttons in there") was
  describing. Fixed by adding a generic clickable-text-row primitive
  (`view/ui/state.js#drawn.buttons`) and registering each BUILD row into it.

## Machine items: reversing Phase 3's "cost at placement" deviation (post-launch)

A DELIBERATE, user-requested DESIGN CHANGE, not a bugfix: crafting recipes
and machine-building are unified into one list, and a built machine is now
"a thing like wood or stone that lives in a pocket slot, but heavier."
`docs/SPEC.md` section 15 is the full mechanism writeup; this entry records
the gaps and judgment calls the reversal forced.

- **`kiln_divine` has no substance or recipe, and is a real, if narrow,
  regression against Phase 3.** Its `cost` bill was always inherited from
  `furnace` via `variantOf`, bit-identical, never independently tuned. Giving
  it its own hand-recipe with that identical bill would create the exact
  unbreakable tie `data/recipes.js#daedalan`/`#auger`'s differing log counts
  were written specifically to avoid: `rules/crafting.js#choose()`'s
  first-match rule would deterministically always produce `furnace` instead,
  forever, no matter which of the two is declared first (whichever loses is
  permanently unreachable, with no float-management workaround the way
  `daedalan`/`auger` has one, since the two bills are not merely similar but
  identical). Retuning `kiln_divine` to break the tie would invent a number
  Phase 3 never set, and the machine was already "content deliberately
  thin" — a variant-mechanism proof, not a load-bearing player goal. It
  remains grantable (`data/grants.js#gift-kiln`, the `k` debug key,
  untouched) but is not currently placeable by any means. Flagging loudly
  rather than silently shipping it broken or silently dropping the row.

- **`belt_r`/`belt_l`, `talos_head`/`talos_head_l` and
  `cyclops_maw`/`cyclops_maw_l` share ONE substance each, not two.** The
  same identical-bill tie above applies to every mirrored pair (each `_l`
  row is a `variantOf` differing only in a `belt.dir`/`mine.facing` flip, so
  its bill is always bit-identical to its base). Two separate substances
  would have hit the tie for real gameplay-relevant content this time —
  `belt_l` is a `STARTING_MACHINES` row, reachable from run start, unlike
  `kiln_divine`. The fix reuses a mechanism that was ALREADY sitting in
  `model/player.js`: `player.face` (+-1) is exactly the direction convention
  `belt.dir`/`mine.facing` already carry. `model/run.js#machineIdFor`
  resolves one held substance to a concrete machine id off the player's
  current facing at the moment of placement — no new state, no click-to-arm
  UI, "aim decides" the same way mining already does. This also happens to
  be why the tile-byte budget (see below) did not run out: three fewer
  substances than one-per-machine-id would have needed.

- **The tile-byte budget was the tightest constraint of this whole change,
  and very nearly did not fit.** Adding `data/forms.js#rig` (the 11th form)
  raises `STRIDE` from 11 to 12, and — per `data/forms.js`'s own guard — that
  alone drops the maximum substance count from 23 to 21, regardless of how
  many machine substances are added. The task's own enumerated "at least"
  list of 11 machines (one substance each) would have overflowed the budget
  by exactly 1 BEFORE even considering `kiln_divine`. Sharing one substance
  per mirrored pair (see above) brought the total to 19 (11 pre-existing +
  8 new), leaving exactly 2 substances of headroom — down from 12 before
  this change, and MUCH tighter than any previous phase's headroom
  reduction, entirely because a new FORM's stride cost is paid by every
  substance, existing and future, not just the ones added alongside it. A
  future content pass adding more than 2 substances (of ANY kind — ore,
  relic, machine or otherwise) needs this flagged before it starts.

- **`data/machines.js`'s `cost` key is gone from every row, not merely
  unused.** `tools/content.mjs`'s own machine-cost checks (assertions 3, 4,
  14) iterate `Object.keys(m.cost || {})`, which is already an empty-object
  fallback — removing `cost` entirely makes those three assertions run zero
  checks per machine rather than erroring, confirmed by the content lint's
  own check count. `model/run.js#buildableMachines()` and
  `view/hud.js`'s LOGISTICS/old-inventory BUILD rows still read `def.cost`
  (now always `undefined`) and `canAfford(undefined)` (now always `true`) —
  left alone deliberately, since a follow-up task owns re-wiring that
  display to grey out on the grant tier instead, and `view/`/`shell/ui.js`
  were explicitly out of this change's file ownership.

- **Existing tests updated, not rewritten wholesale.** Every test that
  exercised the old mechanism now gives the player the held `<id>/rig`
  pair directly (`__mf.give`/`write.collect`) instead of the old raw
  material bill, and the one flow test that used to read "craft nothing ->
  place a furnace" now actually holds the craft key first (`data/recipes.js
  #furnace`, 8.0s) and asserts the recipe fired and spent its bill before
  placing. The three belt-behaviour tests, the digit-menu "which machine"
  test, the furnace-look screenshot, the LOGISTICS-click regression test
  and the brazier dark-room test all needed this same one-line-shape
  substitution. The NO-SPAWN GUARD test's `f`/`l` assertions needed no
  change at all: those keys already did nothing with `flags.showDebug` off,
  and now they do nothing unconditionally (removed, not just gated), which
  is a strict subset of what the test already asserted.

- **Desktop-only scope reduction: the `phone` Playwright project is gone**
  (`playwright.config.js`), along with every `*-phone-*.png` baseline under
  `tests/visual.spec.js-snapshots/`. Stale comments in `tests/visual.spec.js`
  that justified the "never a hardcoded pixel coordinate" discipline by
  citing the phone project specifically were reworded to cite the
  still-real reason (a resizable desktop window) instead of a project that
  no longer exists — the discipline itself (drive clicks through
  `__mf.hits`/`__mf.ui()` rects) was kept, since it is still correct for a
  desktop-only game whose window can be resized.

  Audited `src/` for phone-only scaffolding and found none worth removing.
  Two things look phone-adjacent by name but are genuinely general
  narrow-window handling, not phone-only, so they were left alone:
  `core/canvas.js#resize`'s `Math.max(200, ...)` / `Math.max(180, ...)`
  floors (a degenerate-size safety clamp, not a phone breakpoint — it fires
  for any tiny window, desktop included), and `view/hud.js`'s panel clamps
  below ~240 px of base width (the same reasoning: a small desktop window
  can still hit that width). The one ambiguous spot is `view/hud.js`'s own
  comment calling the 200 px figure the "phone floor" — the number and the
  clamp are real and worth keeping, but the label is a holdover from when
  phone was a supported target; left as-is since renaming it is cosmetic
  and the surrounding CLAUDE.md/BUILD_PLAN.md/FINDINGS.md mentions of the
  phone project elsewhere are historical war-story records of past bugs,
  not current requirements, and were left untouched for the same reason.

## Machine status/hover/right-click-deconstruct pass — a real bug found, out of scope to fix

Added `model/machines.js#statusOf`/`fuelSelectorOf` (the `'running' |
'no-fuel' | 'idle'` query), a warning-badge draw in
`view/paint.js#paintMachine`, a status/producing-line extension to
`view/hover.js#resolveHover`'s machine branch, and a right-click-to-
deconstruct branch in `shell/input.js`'s pointerdown handler. All within
this task's own FILE OWNERSHIP. Full details in the commit messages; this
entry is only the one thing found outside that ownership.

- **REAL BUG, not fixed: digging straight down silently stalls after one
  tile whenever the player is not tile-aligned.** `rules/player.js#boxSolid`
  (~line 215) tests BOTH tile columns the player's hitbox spans —
  `PW` (6px, `model/player.js`) is narrower than a tile (8px), so unless
  `player.x` happens to be an exact multiple of the tile size the hitbox
  straddles two columns, and ordinary walk physics has no reason to ever
  land on a multiple (`rules/player.js`'s own header: "no acceleration...
  this is a digging game", i.e. continuous-speed movement, never
  grid-snapped). `rules/mining.js#aimAtKeys` (~line 77) aims straight down
  at exactly ONE column — the one under `playerCentre().x` — so a held
  `down`+`dig` clears only that column's tile and the untouched neighbour
  column keeps `boxSolid` true forever: `onGround` never goes false, no
  further tile ever breaks, and the player is wedged standing on what looks
  like open air from directly overhead.

  This is not a hypothetical: `tests/visual.spec.js-snapshots/digging-desktop-darwin.png`
  (the existing `'digging down into topsoil'` test's own accepted baseline,
  unrelated to this task) shows the player standing at ground level with no
  visible shaft at all after 900 held substeps of `dig`+`down` — consistent
  with breaking exactly one tile directly under a mis-aligned player and
  then never falling. Confirmed by hand with a substep-by-substep debug
  trace (not committed): `player.y` oscillates in a sawtooth
  (accelerate-then-snap-back-to-the-same-value) instead of decreasing,
  `onGround` stays `true` throughout, and the single tile the aim ever
  targets does read back as broken (`tileAt` returns `AIR`) — the collision,
  not the mining, is what stalls.

  The fix (clearing both straddled columns sequentially when digging
  straight down) landed in `rules/player.js`/`rules/mining.js`, below.

  **Worked around, not hidden:** `tests/visual.spec.js`'s new
  `'digging straight down: no drift, monotonic depth, correct drops'` test
  (added by this same pass) hand-carves a known vertical shaft and places
  the player EXACTLY tile-aligned over it — the same "don't trust natural
  worldgen" discipline the existing click-to-arm gravel test already uses —
  specifically to test the mining/drop/depth mechanics this task owns
  without also exercising the collision bug above. It passes; the mechanic
  it actually tests (no horizontal drift, monotonic depth, correct drops per
  tile) is confirmed correct once alignment is not itself in question.

## Fixed: the non-tile-aligned straight-down dig wedge, above

The bug diagnosed above is fixed, entirely in `rules/mining.js` — the
chosen direction from the finding's own list of options ("checking which of
the two straddled columns is CURRENTLY blocking the fall"), not the
grid-snap option the finding also listed and this task's brief explicitly
ruled out.

`aimAtKeys` now special-cases straight-down aim (`cmd.down` with no
`left`/`right`) into a new `resolveStraightDown`, which computes the same
two tile columns `rules/player.js#boxSolid` would test (`tileX` of
`player.x` and of `player.x + PW - 1`) and targets whichever one is
CURRENTLY `solidAt` the row just below the player's feet. Recomputed fresh
on every aim resolve, with no new persistent state — once the targeted
column breaks, the next resolve finds it no longer solid and retargets the
other one if it is still standing, so the two columns break SEQUENTIALLY,
each at its own normal one-tile hardness cost, never both progressing for
the price of one. When the two columns coincide (tile-aligned play) or
neither is currently solid, it falls back to the same centre-x column the
old unconditional `resolve()` always used, so aligned play — including the
hand-carved shaft test above — is byte-for-byte unchanged. `boxSolid` /
`moveY` in `rules/player.js` were not touched, as the finding's own
FILE OWNERSHIP note anticipated they would not need to be.

Verified with a new test, `'digging straight down from a non-tile-aligned x
still breaks through'` (`tests/visual.spec.js`), which places the player 3px
off the tile grid — deliberately not a multiple of the 8px tile, unlike the
hand-carved test above — over a shaft carved in BOTH columns the 6px hitbox
can straddle, and confirms a held `down`+`dig` breaks every row in both
columns and the player's depth (`run.deepest`, `player.y`) increases by
several tile-heights with no stall. Manually re-confirmed at five more
offsets (1, 2, 4, 5, 7px) via `__mf`, all descending multiple tiles cleanly.

The existing `'digging down into topsoil'` screenshot baseline
(`digging-desktop-darwin.png`) was re-accepted: before the fix it showed the
player standing at ground level with no visible shaft at all (the bug,
caught on camera); after the fix it shows a real dug shaft several tiles
deep with the player standing at the bottom of it. That is the bug being
fixed, not a regression — re-baselined via `npm run test:visual:update`.

## The old digit-driven BUILD menu retired; number keys now arm the quickbar

A playtester asked what the bottom-right "1 2 3 4 5 / 6 7 8 9 0" strip did —
it is the quickbar (`view/ui/quickbar.js`), assignable by drag and,
separately, armable for placement by CLICKING a slot directly (an earlier
task's click-to-arm work). The number KEYS did nothing with it: the only
digit handling that existed was `'123456789'.indexOf(k)` in
`shell/input.js`, gated on `flags.showInv`, driving the OLD BUILD menu
(`wants.machine = buildableMachines()[slot].id`) left over from before
machines became craftable, holdable items.

That old menu was more than merely redundant — its own display had been
silently wrong since the item-ification: `model/run.js#buildableMachines()`
read `def.cost`/`canAfford(def.cost)`, but `cost` was deleted from every
`data/machines.js` row when machines became items, so `canAfford(undefined)`
was always `true` and the list's "can you afford this" colouring had shown
every granted machine as affordable regardless of whether one was actually
held. Real placement still refused correctly (`rules/placement.js`/
`model/run.js#placementCheck` check the held `rig` item independently), so
this was a display bug, not a spend bypass — but it was a real, permanent
one, and it was drawn in TWO places: the old text `invPanel`
(`view/hud.js`, gated on `flags.showInv` with the new panel NOT open — a
rare desync case) and the LOGISTICS tab's own ported BUILD rows
(`view/ui/mainPanel.js#drawLogisticsTab`, real click target added in an
earlier "Bug 1" audit).

Retired outright, the same way the free `f`/`l` spawn keys were retired
earlier: holding, arming (click OR digit key) and placing an item is the one
real mechanism for every placeable now, tiles and machines alike, so a
second, stale-costed menu duplicating part of it serves no purpose. Removed:
`model/run.js#buildableMachines()` and `canAfford()` (the latter had no
other caller once the former was gone — it is the "stale-cost logic" the
finding above already flagged); the LOGISTICS tab's BUILD rows and the
`buildRows` height reservation around them; the old `invPanel`'s BUILD
section (POCKETS and CRAFT, already superseded by the CHARACTER/CRAFTING
tabs per that panel's own header, are untouched — they still draw in the
same rare desync case as before); `shell/main.js`'s `uiHitButton`/`btnHit`/
`'build:'` click branch and the now-fully-dead `drawn.buttons` generic
primitive (`view/ui/state.js`) it was the only producer and consumer of;
`wants.machine` (no setter left anywhere) and its `applyIntents()` branch;
and `view/hud.js#buildGhost`'s old BUILD-panel hover-preview branch
(`buildHits`, also deleted — the armed-pair ghost preview below it already
covers every placement path that remains).

Number keys now arm the matching QUICKBAR slot — exactly what a click on
that slot already does (`shell/main.js#applyUiIntents`'s click-to-arm
branch) — via a new `view/ui/quickbar.js#slotForDigit`, the deliberate
inverse of that file's own `digitOf` (both index one shared `DIGITS =
'1234567890'` string), so "press 3" and "the slot showing 3" cannot
disagree about which slot that is. Unconditional, no panel/`flags.showInv`
gate at all, matching the quickbar's own "permanent HUD" header comment and
the earlier fix that made its KEYS/legend toggle clickable with no panel
open. An empty slot, a slot whose item is no longer held, or a slot holding
a pair that could never be placed (dragged in without ever being armed by a
click — the same tile-or-`rig` form check the click branch already applies)
does nothing at all: no arm, no journal row, confirmed both by a Playwright
assertion (journal length unchanged, `armedPlace` stays `null`) and by
inspection of `shell/main.js`'s own gate the digit handler mirrors.

Verified with a rewritten test, `'a digit key arms the matching quickbar
slot, not just any held item'` (`tests/visual.spec.js`), replacing `'the
build menu places the machine at the pressed number...'`: two different
machine items in two different quickbar slots, pressing the digit for ONE
of them arms exactly that pair (not the other's) and 'E' places exactly
that machine, leaving the other item's count untouched — plus the
empty-slot no-op case up front. `'REAL CLICK: a LOGISTICS BUILD row places
the machine...'` (Bug 1) is removed outright rather than rewritten, since
the row it clicked no longer exists; click-to-arm's own pre-existing tests
already cover a real click arming and placing a machine through the
mechanism that remains. The two flows that used to place a furnace through
`flags.showInv` + a digit press (`'a placed furnace'`, `'cold start -> ...
-> it smelts'`) now assign the held item to a quickbar slot
(`shell/ui.js#assignQuickbar`, called directly rather than via a real drag —
the drag gesture itself is exercised elsewhere) and press its digit, then
'E'; the furnace screenshot baseline is unchanged (same look, same
mechanism's end state), confirming this is a wiring change, not a rendering
one.

---

## Phase 7 (worldgen relief/contacts/hollows) — three things parked

**1. `view/paint.js#paintChunk` is why surface relief only goes UP.**
`paint.js:104-106` paints an AIR tile as excavated cavity (dark, grained,
floor-lipped) whenever `ty >= b.cfg.floorTy`, and as transparent sky
otherwise. That test is a per-BAND constant, so a valley floor *below*
`floorTy` fills its own open sky with cave shading. Phase 7 therefore
anchors the height map at `floorTy` and lets relief run 0..-6 (hilltops
above the base row) rather than ±6 — the total relief is the same 48 px
BUILD_PLAN asks for, and `floorTy` keeps meaning what `shell/boot.js`'s
spawn and the depth datum assume. If Phase 8 (which owns painting) wants
terrain that dips below the declared ground line, the fix is for that test
to consult the column's own ground row rather than the band's `floorTy` —
worldgen already computes exactly that array, but it dies with the
`generate()` call and nothing in `model` stores it. Not worth storing until
somebody wants the valleys.

**2. `topsoil`'s own stone layer still carves its default one-row LIP at band
row 0** (`data/world.js`: `{ kind:'layer', sub:'stone', fromTy:0, toTy:320 }`,
no `lip:false`), i.e. ~45 AIR tiles along the very top row of the band, on
every seed, and this predates Phase 7. Harmless today (that row is buried
under the surface band's rock, and stone has no `grassCap`/`canopy` to
mis-place), but it does mean `skyExposedAt` is true for the tile under any
one of those holes, and it makes the hollow ceiling rule's `firstSolid` scan
return 1 rather than 0 in those columns. Either `lip:false` there or a
deliberate decision that the seam is meant to be ragged; nobody has chosen.

**3. `tests/visual.spec.js`'s `'the furnace build lifecycle'` assumed the
ground beside spawn was flat.** It walks ~5 tiles right of spawn and places a
3x2 furnace at the keyboard aim reticle, which the old dead-flat surface
always allowed. With relief it landed in a hillside and returned `NEEDS CLEAR
SPACE`. Phase 7 fixed it by widening the guaranteed shelf to `SPAWN_TX ± 9`
(the flat prototype's own number, `docs/ARCHAEOLOGY.md` §2.2) rather than by
editing the test — a 3x2 machine placeable at arm's length on the spawn shelf
is a real requirement of `docs/SPEC.md` §5 beat 6. Other tests in that file
carve their own patch first (`visual.spec.js:539`'s own comment says why);
this one did not, and still does not.

---

## Phase 8 (surface/sky/tree painting) — two things parked

**1. `shaft-unlit.png`, `shaft-lit.png` and `topsoil.png` are insensitive to
terrain painting, and this was measured, not guessed.** All three sit in the
`topsoil` band, and all three survived Phase 8's entire repaint of the strata
pass (per-substance grain, per-substance cliff-face tone, hash-jittered face
widths, a depth-darkening curve, strata contact lines) with **zero differing
pixels** — while the three surface-band shots moved by tens of thousands. To
rule out a stale-cache bug, `data/substances.js`'s stone row was temporarily
set to `speckle:0.95` (against its real 0.24, i.e. nearly every pixel grained
instead of a quarter of them) and `npx playwright test -g shaft` still passed
**bit-exactly**. The cause is compositing, not caching: `view/scene.js`'s
`drawDarkness` paints `DARK_ALPHA[0] = 0.94` over an unlit tile, `atmosphere`
then adds `min(0.55, (1 - 0.6) * 1.1) = 0.44` of void tint for topsoil's
`ambient`, and the vignette adds more — so any difference in the underlying
rock colour quantises to the same byte. Consequence for whoever next does deep
art: **the deep bands' appearance cannot currently be regression-tested by
screenshot at all**, and `shaft-lit.png` in particular does not prove what its
name claims (its brazier lights the shaft only marginally; the image is
near-black either way). Fixing it is a lighting question, not a painting one —
either `DARK_ALPHA[0]` comes down, or the shot samples a genuinely lit region,
or the test asserts on sampled pixel values instead of a full-frame diff.
Phase 8 deliberately did not touch it: `view/scene.js`'s darkness pass has its
own long-argued comment and its own phase.

**2. A dug pit in the soil grows turf on its own floor.** `model/tiles.js#
skyExposedAt` is "a clear vertical shot to the top of the band", which a
freshly dug two-tile hole satisfies, so the soil tile at the bottom of it
takes a full turf cap. Pre-existing (the two-pixel fringe did the same thing,
just less visibly) and arguably correct — the sun does reach the bottom of an
open pit. It only becomes wrong if a roof is ever built over one, since a
placed tile above WOULD clear the check and the turf would repaint away
correctly, or if grass is ever meant to imply "undisturbed ground". Recorded
because Phase 8 made it four times more visible, not because it is known to
be a bug.

---

## Phase 8c (tile-byte guard) — three things parked

**1. `CLAUDE.md` D7 cites the number this phase just corrected.** D7 opens
"`docs/SPEC.md` §15 records exactly **two substance rows** left before the
tile-id byte overflows ... Spending one on foliage would be the worst trade
available." The count is now **12** tile-capable rows, and non-tile rows cost
the byte nothing at all. D7's *conclusion* is untouched — canopy, grass and
cliff moss are still render-only decoration, because a substance row is not
the cheap way to draw a leaf and `view/treatments.js#TREAT` already exists —
but its stated *reason* is stale. `CLAUDE.md` was outside this phase's file
ownership; whoever next edits D7 should reword the premise, not the verdict.

**2. `docs/PLAN-gears-and-winches.md`'s recon (since trimmed, its blockers were resolved in Phase 8c) miscounted the non-packable rows.**
It says "Ten of the nineteen rows (`bellows`, `pick`, `auger`, `chasm`, and all
six machine substances)". There are **eight** machine substances (`furnace`,
`lift`, `press`, `belt_r`, `brazier`, `hearth`, `talos_head`, `cyclops_maw` —
`belt_l`, `talos_head_l` and `cyclops_maw_l` share a row, and `kiln_divine`
has none), so the count is **12 of 19**, not 10 of 19. Its headroom figure of
12 rows is nonetheless exactly right, since that is derived from `adamant`'s
ordinal (8) and not from the row count. Plan doc, not code.

**3. The assertion as §6.1 specifies it would not have fired on the probe
§6.1 specifies.** "its ordinal must be <= the packable maximum" is bounded by
the byte limit, ordinal 20; the suggested probe (a machine substance made
crossable with `gravel`) sits at ordinal 18 and would have passed. Assertion
16 therefore has two halves: the ordinal bound as specified, plus the fact
that actually has teeth — a substance crossable with a tile-capable form must
carry its own `tile` block, since without one `model/tiles.js#baseHardOf`
returns `Infinity` and the placed tile is a wall nobody can ever mine back
out. The probe fires on that half. Both halves were seen to fail: the second
under the §6.1 probe, the first only via the harder gate (`data/forms.js`
throws at import before the lint can run) with three appended substance rows.
Recorded because the same "specify the probe, then check the probe's own
arithmetic" step is worth repeating in later phases of that plan.

---

## Phase 8d (segment skeleton) — six things parked

**1. `shell/notify.js` has no text and `data/sfx.js` no sound for the two new
journal kinds.** `rules/placement.js#linkSegment` pushes `'link'` and
`#unlinkSegment` pushes `'unlink'` with `data.why = 'THE CABLE IS CUT'` — the
message `docs/PLAN-gears-and-winches.md` §4.5 names for a cut. Neither file
was in this phase's ownership, and an unmapped kind is *silent on purpose*
(`shell/notify.js`'s own words), so nothing is broken — but the cut message
currently travels as data and nobody reads it. Two lines in
`shell/notify.js#TEXT` (`link`, `unlink`) and one or two rows in
`data/sfx.js#KIND_SFX` would finish it. **Refusals already work**: they use the
existing `'refused'` kind, and all five `linkCheck` strings were observed
reaching `view/fx.js#toasts` through the real dispatch.

**2. `tools/check.mjs#snapshotModel` did not include `segments`, so the
`newRun()` reset probe could not see one.** `shell/boot.js` called
`segw.clear()` and this phase verified the reset by hand, but the harness
did not — a segment surviving a restart would have passed invariant 8's
fingerprint check regardless. Fixed by Phase 8g: `snapshotModel()` now
fingerprints `segments` directly (`tools/check.mjs`).

**3. TWO VERTICALLY STACKED HUBS CANNOT LINK UNTIL THE UPPER ONE'S FLOOR IS
MINED OUT.** A hub is `footing:2`, so both tiles under a 2-wide footprint must
be solid to place it — and those two tiles sit directly on the span, so
`linkCheck` correctly answers `'THE PATH IS BLOCKED'`. Observed, and it is not
a bug: footing is a placement check and is never re-tested (the same as every
other machine), so the fix is the one a player would reach for anyway — dig
the shaft. Mining the two tiles out leaves the hub standing and the link
succeeds immediately. **Recorded because it is a real usability edge Phase
8f's playtest will hit within a minute**, and because the honest answer might
instead be an `axle`-style narrower hub variant, or anchoring the cable at the
footprint's TOP centre rather than its middle (which does *not* fix it on its
own — the blocking floor is between the two hubs either way). A design call,
not a defect; `docs/SPEC.md` §17.5 states the anchor rule so whichever way it
goes is one edit in one place.

**4. The craft queue cannot actually choose a recipe, which makes the new rows
awkward to obtain by hand.** Pre-existing and documented in
`shell/ui.js#ui.craftQueue`'s own header, but worth naming here because this
phase adds four recipes to a first-match-wins list: `ui.craftQueue` holds
recipe *ids*, `shell/main.js#step` turns a non-empty queue into a bare
`cmd.craft = true`, and `rules/crafting.js#choose()` then runs the first
`HAND_RECIPES` row the player can afford — which may not be the queued one. So
queueing GEAR while holding 4 logs and 2 gravel builds a BRAZIER. Every
containment in `data/recipes.js` was re-derived pairwise and the new rows are
ordered so none of them shadows an existing recipe (and `crank`'s bill was
raised from 2 gravel to 3 specifically to break one), but overlaps that are not
containments still resolve by declaration order. The real fix is the queue
passing its chosen id down to `rules/crafting.js`, which is a change to that
file's one-pair-of-hands scalar and belongs to whoever owns the crafting UI
next.

**5. Three PRE-EXISTING hand-recipe shadowings, none of them this phase's.**
Mechanically checked over `HAND_RECIPES` in declaration order: `peg_rungs`
`{2 log}` and `kindle` `{1 log}` are both strict subsets of `daedalan`
`{2 plate, 4 log}`, and `kindle` is a strict subset of `auger`
`{2 plate, 1 log}` — so `daedalan` and `auger` are unreachable by hand for any
player holding a log, which is most of them. `data/recipes.js`'s own
`peg_rungs` and `auger` comments discuss the *pairs they were ordered against*
and did not catch these. Both would be fixed by moving `daedalan` and `auger`
above `peg_rungs`/`kindle`, which is a content-order change with a real
gameplay effect and so was deliberately not made inside this phase's diff.

**6. Two screenshot baselines moved, and the cause is data, not `view/`.**
`ui-crafting.png` and `furnace-lifecycle-1-crafting-ui.png` both shoot the
CRAFTING tab's default RAW category, whose grid is `HAND_RECIPES` filtered by
`view/ui/mainPanel.js#categoryOf` — and a `<id>/rig` output falls in `raw`, so
four new build recipes are four new slots and the existing ones shift right.
1,092 px of a 1,280x800 frame, confined to that one row; the other 47 shots are
bit-identical. Re-accepted with that reason. Worth noting for Phase 8e: the row
now holds **13** slots and looks close to the panel's width, so the next
machine added may be the one that forces the RAW grid to wrap or scroll.

---

## Phase 8f — the drivetrain, motion, riding, and the winch's retirement

**1. `docs/PLAN-gears-and-winches.md` §4.3 and §4.4 are mutually
inconsistent, and one of them had to give.** §4.3 says to apportion `supply`
across a component's segments in proportion to their own `need`; do that and
`surplus` becomes identically `need × (supply/demand − 1)`, whose **sign is
uniform across the component**. Two identical segments sharing one crank then do
not halve, they *stop* — which contradicts §4.4's own worked example ("one crank
feeding three segments turns all three at a third speed") and this phase's
acceptance step 6. Conversely §4.4's `drive` alone can never make a loaded
carrier run **backwards**, which is the brief's load-bearing correction. There
is no value of `crank.torque` that satisfies both readings: step 4 needs
`torque < 1.95` and step 6 (under apportionment) needs `torque > 2`.
**Resolved** by making `surplus` — computed against the *whole* component supply,
unapportioned — decide direction and descent magnitude, and `drive` throttle
ascent. Argued at the code in `rules/drive.js`'s header and locked in
`docs/SPEC.md` §17.8. Anyone re-litigating this should start from the six
behaviours the acceptance walkthrough demands, all of which are now measured,
rather than from either section alone.

**2. `hub.footing` had to drop from 2 to 1 or the mechanic was unbuildable.**
A cable leaves a hub from its footprint's own **centre**, i.e. down the
right-hand column. At `footing:2` both columns had to stand on rock, so the
first sample below the anchor was always the hub's own footing tile and
`linkCheck` refused every span steeper than 45° with `'THE PATH IS BLOCKED'`.
"A hub at the surface and a hub at the shaft floor" — the entire mechanic — was
therefore impossible to build through `rules/placement.js`. Phase 8e never saw
it because a screenshot scene places machines through
`model/machines.js#write.place`, which asks nothing about footing, so **every
static winch baseline depicts an arrangement the real placement path could not
produce**. That is still true of the *upper* hub in several of them (it floats
in carved air); the scenes are synthetic and the shots are appearance tests, so
this is noted rather than fixed. A harness that builds a scene through
`rules/placement.js` instead would be worth having, and is a natural Phase 8g
item.

**3. A rider cannot descend a 1-tile shaft, and the geometry says why.** A 2x2
hub's anchor sits on a tile boundary, so the carrier straddles two columns and
so does a player centred on it. With `footing:1` one of those two columns is
solid at `ty+2` — that is what holds the hub up — so a rider centred on the deck
is blocked one tile down. Standing on the **clear half** of the deck works and
travels the whole shaft (verified: 80 px down, 0 hearts). This is fiddly rather
than broken, and the honest fix is level design (a 2-wide shaft) or a wider
`CARRIER_W`, not code. `rules/drive.js#ride` refuses a translation that would
embed the hitbox in rock rather than resolving it — without that guard this
phase would have broken the 7,200-frame "never inside rock" fuzz.

**4. Riding UP under your own cranking is limited to about 1.5 tiles, and the
acceptance walkthrough's step 4 overstates it.** A crank's `reach` is 12 px. A
player standing on the carrier rises out of that reach after ~12 px, the supply
drops to zero, and the carrier slides back. Everything step 4 is actually
*testing* is verified — an empty rider rises, a 38 T rider runs backwards with a
`'TOO HEAVY TO LIFT'` toast, unloading lets it climb again — but "ride the shaft
by cranking" is not a thing the mechanic does, and arguably should not be: you
cannot pull yourself up by your own bootstraps. The brief's own framing supports
this ("the player can i guess ride the pulley if they wish but it will be
weighted right, so if they get on a platform it will want to go down!") — riding
is a **descent** mechanic, which is free, fast and takes no fall damage. Riding
up needs a power source you are not holding, i.e. the deferred generator. Worth
a design decision before anyone "fixes" it.

**5. `'<n> DELIVERED TO <BAND>'` can fire more than once for the same haul.**
Material released at the top of a segment sits within the carrier's own grab box
for the few frames it is falling clear, so if the carrier leaves and re-arrives
in that window the arrival row fires again. Observed in the three-segment chain
walkthrough (four topsoil toasts for one 4-unit haul). **No items are
duplicated** — the count is of what is aboard, and the chain delivered exactly 4
ore into `surface`. Cosmetic, and a natural assertion for Phase 8g: "one arrival
row per haul".

**6. The drop verb is self-defeating while standing still, which is
pre-existing.** `q` drops one unit at the player's feet and `rules/items.js`
re-pockets it 0.35 s later unless the player is over the hard cap or has moved
away. It only "sticks" when it matters (over-cap, D4's soft-lock case), so this
is consistent with why the verb exists — but acceptance step 4's "drop the ore
and it climbs again" requires stepping aside first, which is not obvious. Not
this phase's to change.

**7. Docs outside this phase's ownership still name `rules/lift.js`.**
`grep -rn "rules/lift" src/ tests/ tools/` is empty. `docs/DEVELOPER_GUIDE.md`'s
`#charges-and-honest-fuel` and `#the-rules-order` sections, which described the
staged winch as current, have since been updated to cover segment transport
instead. `docs/BUILD_PLAN.md` Phases 2a/9/10 carry the patches
`docs/PLAN-gears-and-winches.md` §7 specified and `02849b1` applied --
left alone, historical. `docs/AUDIT.md`, `docs/AUDIT-2.md`
and `docs/COMMENT_AUDIT.md`, dated records of a past state that this cleanup
pass superseded, are deleted; `docs/rfc/*` remains, correct as history.

**8. `model/run.js#write.spendHearts` has no caller.** Its only consumer was
`data/sources.js#vital`, deleted with the blood winch. Kept deliberately, with a
comment saying so: the rule it holds — *a machine may not kill you* — lives
nowhere else, and re-deriving it on the day something spends hearts again is how
two spenders end up disagreeing about whether the last heart may go.

**9. `tests/visual.spec.js#winchScene` had to move its carrier/load/turn writes
to AFTER `__mf.frames()`.** Phase 8e set them first, which was safe only while
nothing wrote them. `rules/drive.js` now owns `t`, `load`, `dir` and `turn` and
overwrites all four every substep, so seven baselines drifted (an unpowered
carrier slid ~0.9 px in 4 substeps, and every declared `load` was recomputed to
0). Setting them after the substeps restores the matrix bit-exactly and keeps
each test's own `expect(...t).toBe(t)` honest. The **moving** states are
Phase 8g's own matrix (`docs/PLAN-gears-and-winches.md`'s phase prompts,
since trimmed as executed).

**10. Phase 8b's tutorial callout couples EVERY early-game screenshot to
tutorial state, including scenes testing something else entirely.**
`view/hud.js#hint` now falls back to `data/callouts.js#CALLOUTS[beat(run)]`
whenever no toast is active, and a fresh `newRun()` starts at beat 0 — so
`winch-hub`, `winch-*` (Phase 8e's whole matrix), `ui-crafting`, `an unlit
shaft`, `debug overlays on`, and `the furnace build lifecycle` all picked up
a "TAKE THE PICKAXE" (or similar) box at the bottom edge, purely because none
of them advance `run.tutorialBeat` past 4 in their own setup. Re-baselined
all of them (`npm run test:visual:update`) rather than editing scenes
outside this phase's ownership; inspected `winch-hub` and `ui-crafting`
directly and both render correctly, just with an out-of-place instruction
line. Whoever next owns `tests/visual.spec.js` (Phase 8g/11) should consider
either a shared `settle()`-adjacent helper that advances past beat 4 for
scenes that aren't testing the tutorial, or accepting the coupling as
intentional (a screenshot of "the game as it actually looks on a fresh run"
is arguably more honest than one with the callout silently suppressed) —
this is a real design call, not a bug, and not mine to make unilaterally by
editing another phase's test file.

**11. Answering #10 for Phase 8g's own six shots, and only those.** The six
`drive-*` motion baselines advance `run.tutorialBeat` to 4 in `driveScene`, so
they carry no callout. The reason is narrow and worth keeping narrow: a baseline
whose whole subject is a moving drivetrain should not be re-taken every time
`data/callouts.js` is reworded, and six pictures of gears are the wrong place to
also assert what beat 0 says. Phase 8e's existing shots were deliberately NOT
touched — they are reviewed output belonging to another phase. **#10 is
therefore still open as a general ruling**: there is
no shared `settle()`-adjacent helper, and the next agent to own
`tests/visual.spec.js` inherits the same choice for whatever it adds.

**12. `model/segments.js`'s boundary-exact sampling was a real bug, and the
harness that found it was itself wrong first.** Recorded because the sequence is
the useful part. `b48203d` fixed `sweepSpan` (a vertical or horizontal span
between two same-footing hubs runs exactly along a tile grid line, and
`Math.floor` inside `tileX`/`tileY` sampled only one of the two columns sharing
it, so a solid tile in the other one was invisible). But the cross-band test that
found it ALSO had a defect of its own, in the same area, which masked the fix:
its clear window was carved as a fixed 4x4 around each hub's own PLACEMENT tile,
and a hub's anchor is its footprint CENTRE — one tile above that row for a 2x2 —
so the window never reached the band seam, and the lower band's row 0 (solid rock
in generated terrain) sat on the span. The lesson generalises past this phase:
**a test that carves terrain must size the carve from the GEOMETRY UNDER TEST,
not from the placement coordinates it happens to have handy.**
`tools/check.mjs#clearAlong` walks the actual anchor-to-anchor line and clears a
neighbourhood around every sample in every band, which is both shorter than the
buggy version and impossible to mis-size.

**13. The burden bar's label appears to overlap the bar when the value string is
wide — CLOSED, and not as reported.** The overlap was eyeballed off
`drive-reversing-overcap.png` (45.0 / 40 T) against
`drive-descending-loaded.png` (0.0 / 40 T) and was never real on that widget.
The HUD burden bar passes no `label` (`view/hud.js:225-231`), so
`view/ui/bar.js:70`'s `Math.max(w, label ? textWidth(label) : 0)` collapses to
`w` for it and the value has always started at `x + w + 3`. Nothing could have
moved those two screenshots.

The real instance of the class was on a different mount and is fixed: the
TRIBUTE demand rows do pass a `label`, and `TRIBUTE_BAR_W` is 50 against a
71 px "COPPER PLATE". `view/ui/bar.js:58-74` now measures `max(bar, label)`
before placing the value. That is a genuine D8 compliance win.

One residual, unverified by screenshot: `bar.js:72`'s clamp
(`Math.min(startX, Math.max(x, vw - vtw - 2))`) can pull a value string left,
back over its own bar, at a sufficiently narrow `vw`. At the 200 px floor the
burden bar's `startX` is 59 against a clamp ceiling of ~133, so it does not
fire today.

**14. `winch-unlit` / `winch-lit` failed once in a full parallel visual run and
passed in isolation and on the next full run, with no source change in
between — NOT REPRODUCED, and the evidence is in the Phase 17g2 section
below.** Observed twice during Phase 9 (164 px and a similar small diff). Both
baselines are `maxDiffPixels: 0` BY DESIGN, on the argument that the renderer
is deterministic by construction. A screenshot that can fail intermittently
either breaks that argument or hides a real nondeterminism behind "just re-run
it", and the CLAUDE.md rule about not raising the threshold to make a test
pass applies with full force.

52 full-suite runs since this was written, 43 at `threshold: 0`, have not
produced it. The run counts, what they rule out, and the one surviving
hypothesis are recorded once in the Phase 17g2 section rather than twice —
a fact recorded in two places will drift. Re-open with the repro conditions:
the whole suite at default parallelism, never `-g`.

**15. A visualisation is a test, and Phase 9's map proved it.**
`view/ui/mainPanel.js#machineState` classified every hub, crank, gear and axle as
`BLOCKED` — its last clause reads an empty buffer as a fault, and a drivetrain
machine has no ports, no recipes and no buffer to fill. In the LOGISTICS tab that
was one wrong word in a list nobody had reason to disbelieve; the instant the
same query coloured glyphs on a map, a perfectly good lift chain lit up red and
the bug was undeniable in one frame. Fixed in Phase 9 (`m.torque > 0` reads
RUNNING, no-ports-and-no-recipes reads IDLE), but the general point is the
finding: **drawing existing state in a new place is a cheap way to audit it**, and
the next phase that puts a query on screen should expect to find something.

## Phase 10a (the headframe exemption)

**16. Reducing `hub.footing` from 2 to 1 did not fix the class of defect; it
fixed the one instance that boundary-exact sampling then reopened.** The
measurement, before anything was touched — `topsoil`, seed 1337, flat room,
floor row 119, lower hub at `ty 117` on the floor, upper hub 12 tiles up at
`ty 105`, both anchors at world x 168 (a column boundary), span exactly 96 px
(`hub.reach`):

| upper hub's footing tile | `placementCheck` on the upper hub | `linkCheck` |
|---|---|---|
| none | `'NEEDS A FLOOR'` — illegal | `{ok:true}` |
| left column (`tx 20`, row 107) | `'NOTHING BUILT YET'` — every structural test passed | `{ok:false, why:'THE PATH IS BLOCKED', at:{x:168,y:1632}}` |
| right column (`tx 21`) | legal | same |
| both columns | legal | same |

y 1632 is the footing row's own *lower* boundary, which is the first sample a
sweep running upward from the hub below reaches. So `linkCheck` returned `ok`
for **exactly** the placements the game refuses to build, and refused every
placement it does build. Three facts compose into it and each is individually
correct: the anchor is the footprint's centre (`model/segments.js:114`,
`docs/SPEC.md` §17.5 locks it), `solidNear` samples both tiles sharing a
boundary-exact coordinate (`b48203d`, finding #12), and `footing:1` requires a
solid tile directly under the footprint (`model/run.js:290-292`). `footing:2 → 1`
narrowed the blockage from two columns to one and boundary sampling put the
other column back. **The lesson is not about hubs**: reducing a *quantity* to
dodge a geometric conflict leaves the conflict, and the second time it shows up
it looks like a new bug. Fixed in `sweepSpan` (`docs/SPEC.md` §17.6 holds the
exemption and the rejected alternatives), not in `data/`.

It survived Phase 8g because **every hub in `tools/check.mjs` floated over
air.** `model/machines.js#write.place` asks nothing about footing —
`data/machines.js:465-467` records that exact blind spot after `footing:2` — so
no span in the harness had ever met the tile every real span must cross. Closed
with `tools/check.mjs#footUnder`, which lays `def.footing` tiles under every hub
the file places. The general form is finding #12's, one step further on: **a
scene assembled through `model` write APIs is not a scene the game can reach,
and a scene the game cannot reach cannot see a defect in the rules that reach
it.** Any future harness that places a machine should place it the way
`rules/placement.js` would, or say why not.

**17. A RIDER still cannot pass their own upper headframe's footing tile —
out of scope here, and Phase 10b needs it.** The cable may now cross that tile;
`rules/drive.js#ride` still refuses any translation that would put the player's
box inside solid rock, and a 6 px box centred on the anchor straddles the
anchor's column boundary, so the footing tile is inside the box whichever column
holds it. Measured with footing tiles in place and the carrier parked at `t = 1`
on a 40-row span: **the rider descends 10 px and stops**, the carrier leaves
without them, and gravity then drops them onto the footing tile. `tools/check.mjs`
parks its ride probes 40 px below the upper anchor to keep measuring what they
claim to measure (`belowHeadframe`, which derives the 40 from the two exempt
rows plus `PH` plus the 2 px deck offset), and the two rider rigs' spans grew so
that "40 tiles" is still 40 tiles. **This is the one thing standing between A1
and `docs/PLAN-phase10.md` §4.4's "the player rides up and steps off onto
astral's floor"**: they arrive two rows short. Phase 10b owns it. The candidate
fixes are not equal — making the ride translation resolve against the grid
rather than refuse would be a collision change with fuzz consequences, whereas
letting a rider *arrive* by clamping them to the deck for the last two rows is
local to `rules/drive.js#ride`. Neither is designed here.

## Phase 10b (the loop)

**17 — CLOSED in Phase 10b.** Fixed in `rules/drive.js#boxSolid`, which now
takes the exempt tile ranges and gets them from `model/segments.js#headframe`
(exported for that one reader) rather than re-deriving them, so the rider passes
**exactly** the two rows the cable does. Reproduced first, on the same 12-tile
pair on real footing tiles: riding **up** under a held crank the rider stopped
dead at world y 1632 — 34 px, 4.25 tile rows, below the deck — then detached and
fell back down the shaft; riding **down** from `t = 1` they descended 10 px and
stopped, exactly as #17 measured. After the fix the descent drift off the deck
is 0.000 px over 3 s and the ascent arrives flush. `check.mjs` gained a RIDER
EXEMPTION section with three claims, and `belowHeadframe` — the helper that
existed only to park carriers clear of the defect — is deleted, so both ride
rigs now start at `t = 1` and the fix is load-bearing in five assertions rather
than two. Seen to fail both ways: without the exemption, four failures
(including two pre-existing ones that had been passing only because of
`belowHeadframe`); with the exemption widened by four rows, claim 3 fails.
`docs/SPEC.md` §17.6 holds the measurement.

**18. A RIDER CANNOT POWER THE SEGMENT THEY ARE RIDING, so nothing in the game
can lift a player.** Found while fixing #17 and it is not a bug — it is D10's
"manual only" meeting `crank.reach`. `rules/drive.js#supplyOf` requires
`overlaps(playerBox(), crank.box, crank.reach)`, `crank.reach` is 12 px, and a
carrier at `t = 0` sits at the lower hub's anchor, which is just within reach of
a crank placed against that hub. Measured, base torque, a 12-tile vertical span
with one crank at its foot and the player aboard holding `turn` for 40 s: the
carrier rose **18.0 px — 2.25 tiles — and stalled there**, oscillating at the
edge of reach for the remaining 38 s.

Consequences, in the order they bite:

- **`docs/PLAN-phase10.md` §4.5's ascent is a CLIMB, not a ride.** Its own stage
  table already has the player mining and laying scaffold up each stage; what it
  does not say is that this is *mandatory*, and that a segment is a cargo lift
  the player walks beside. The phase's acceptance walkthrough asks the player to
  "ride up to the dock", and that step is not performable — not because of #17,
  which is fixed, but because of this.
- **Riding is a DESCENT verb.** It is free, it is fast, it costs no hearts (a
  carrier is a one-way platform), and it is the cheapest way down a shaft the
  player has already built. Which is exactly "down is free, up is expensive"
  expressed in the drivetrain, so this is arguably the right answer and not a
  gap. It is written down because it reads as a bug when you hit it cold: you
  stand on the bucket, hold the crank, rise two tiles and stop.
- **The fix, if it is ever wanted, is content and not code.** `crank.reach` is a
  `data/machines.js` number and `segReach` is already a scoped tunable, so a
  long-reach crank tier (a `variantOf` row) or a `reach` wide enough to cover a
  stage would make a self-lifting ride possible without touching
  `rules/drive.js`. Adding a passive power source would not: D10 rejects it
  explicitly.

## Phase 14a (rubble becomes a prerequisite; D12 applied) — five things parked

1. **`docs/SPEC.md` §21 does not exist and could not, so this landed as §19.**
   `docs/PLAN-phase14-mining-and-drops.md` §5 and §6.1 both said "a new §21".
   SPEC's last section was **§18**; §19 and §20 did not exist, and
   `docs/PLAN-phase13.md` §5.3 reserves §20 for its own band gate. Numbering
   this 21 would have left two holes in a document nothing indexes
   sequentially, so it took the next free number and every `§21` reference in
   the plan document was rewritten to `§19` with a correction note in its §5.
   **14b, 14c and 14d should read §19.**

2. **`data/forms.js`'s prediction about the CRAFTING tab was wrong, and no
   craft baseline moved.** 14a's own prompt (and `docs/FINDINGS.md` 8d #6)
   expected the RAW recipe grid to gain a slot for `pack`'s output.
   `view/ui/mainPanel.js#categoryOf` sorts on the OUTPUT FORM: `form.tile` is
   tested before the `refined`/`raw` fallbacks, so `pack` lands in **PLACE**,
   beside `peg_rungs` and `daedalan`. Both crafting baselines
   (`ui-crafting`, `furnace-lifecycle-1-crafting-ui`) shoot the default RAW
   category and are bit-identical. The three baselines that DID move
   (`ui-character`, `ui-character-swap`, `ui-character-swap-phone`) moved for
   an unrelated and smaller reason: the inventory slot glyph at
   `mainPanel.js:190` is `FORM[slot.form].tile ? '#' : glyphOf(sub)`, and
   those scenes hold `timber/log`, which no longer carries a `tile` block.
   156 px, one glyph cell, verified against the diff image.

3. **`'THAT DOES NOT BUILD'` is reachable but NOT the refusal a player sees**,
   and this is the one legibility gap the phase leaves. 14a's prompt expected
   arming rubble and clicking to produce that journal row. It does not,
   because the pair can no longer be armed at all: both
   `rules/placement.js#placeableFromPockets` and `shell/main.js`'s
   click-to-arm branch gate on `FORM[...].tile`, so a gravel/log slot click
   falls through to the drag-resolve branch and is a **silent no-op**, and LMB
   on open ground mines instead. The refusal string is real and was verified
   by calling `placeTile` directly (`soil/gravel`, `timber/log`,
   `granite/gravel`, `copper/ore`, `adamant/gravel` — all five refused with
   it), but nothing in normal play reaches it. Not fixed here, and it is not a
   new defect: this is the identical silent no-op every non-placeable form has
   always had. **Owned by `docs/PLAN-phase16-interaction-model-v2.md`**, whose
   Part C already names "clicking an ore/ingot/plate/brand/relic is a
   confirmed silent no-op" as the gap it exists to close. Gravel and log have
   now joined that class; 16's own solution covers them for free.

4. **Comment-only edits in three `rules/` files, outside the phase's stated
   scope.** D14-C says "`rules/placement.js` is **not edited by this phase at
   all**", and no line of logic was. But four comments in `rules/` named the
   retired placeables as fact and would have been left false:
   `rules/placement.js`'s `---------- tiles ----------` header and
   `#placeableFromPockets` (both listed "`log`, `rung`, `stair`, `gravel`"),
   `rules/generate.js#trees` ("timber's `log` form is the only tile-capable
   form in the game" — already false when `rung`/`stair`/`gravel` existed),
   and `rules/player.js#boxClimbK` ("a rung or a placed log both read as 1").
   All four were corrected, comments only — `git diff` over those three
   files carries no behaviour change.

5. **`data/forms.js`'s packing header still had a stale illustration**, fixed
   in passing: "With four forms the stride is five, so a byte holds 50
   substances" was written when there were four forms. It now states the live
   figures (stride 13, guard 117 of 255, `PACKABLE_LIMIT` 18) and points at
   `data/substances.js`'s header for the append-vs-insert asymmetry.
   `docs/DEVELOPER_GUIDE.md`'s copy of the same sentence had the same problem
   and got the same fix.

---

## Phase 14c (the depletion cue) — three things parked

1. **§2.7(a) REPRODUCES IN A REAL BROWSER, and here is the repro.** The plan
   read the staleness off the code path and asked for it to be confirmed
   rather than believed. Confirmed, in Chromium, by pixel readback:

   - carve a lit copper vein (`tests/visual.spec.js#veinScene`), draw, then
     add **half a unit** of pick time to one tile through
     `model/mining.js#write.add` and draw again. `unitProgressAt` is now 0.5,
     far past `view/paint.js#paintTile`'s own `d > 0.05` gate, and the new
     depletion overlay draws nothing at all at `spent === 0` — so the crack
     marks are the only thing that could move. **0 pixels moved.**
   - then change ANY tile whose chunk neighbourhood includes that one
     (`tw.clear` two chunk rows down) and draw again. **8 pixels appear** on
     the untouched tile: the crack marks that should have appeared when the
     work landed, half a second earlier.

   `model/mining.js#write.add` calls `bump()` (the epoch) and never
   `model/tiles.js#write.touch` (a chunk version), so `chunkCanvas` returns
   the cached bitmap and the cracks you see while swinging are whatever was
   true at the last unrelated repaint. **Not fixed here** — D14-G says so in
   as many words, and conflating it with a new overlay would make this
   phase's baseline diff unreadable. It is the reason the depletion cue is a
   live pass: the obvious place to draw it inherits this bug.

   The candidate fix, for whoever takes it: `write.add` cannot call
   `write.touch` (that is `model/mining.js` → `model/tiles.js`, the reverse
   of the D14-E edge, and a cycle), so either the crack moves out of the bake
   into `drawDepletion`'s own pass — cheapest, and the pass is already there —
   or `rules/mining.js` touches the chunk itself after `digw.add`, which puts
   a view-cache concern in a rules file.

2. **The phase's own before/after proof is a pixel count, not a third
   screenshot, and it is the assertion that would actually fail.** Two
   baselines prove a fresh vein and a part-spent vein are not identical to
   each other; neither would notice `drawDepletion` becoming a no-op, because
   both would simply be re-accepted. So
   `tests/visual.spec.js`'s third test renders ONE scene twice with nothing
   different between the draws but `dig.work`, and asserts 64 px moved on the
   3-of-4 tile, 64 on the 1-of-4 tile, and **0 anywhere else in the frame**.
   Measured with the call commented out: 0 px, and the test fails. Headless,
   the same scene costs **+10 `fillRect` calls** (two washes, three notches on
   one tile and one on the other, at two rects each) with 0 model writes and
   an unmoved `rand()` cursor across six draws.

3. **A fourth copy of the visible-tile-window arithmetic was extracted rather
   than written.** `drawFields`, `drawDarkness` and `drawFog` each carried
   their own copy of the same four clamped divisions, two of them commented as
   being "the identical tile-range math" one of the others uses. The
   depletion pass would have been the fourth, so all four now share
   `view/scene.js#tileWindow`. Pure extraction: every one of the 100 visual
   baselines is bit-identical across it, which is the only evidence worth
   having for a refactor of a renderer.

---

## Phase 14d (the worldgen rebalance) — three things parked

1. **`count / charge` is the wrong arithmetic, and the plan's own indicative
   table is the worked example.** `docs/PLAN-phase14-mining-and-drops.md`
   D14-F proposed 8 / 48 / 38 / 30 / 22 as "÷ charge"; measured over 200 seeds
   those land **+43.2% / +34.5% / +36.5% / +35.7% / +31.7%** against the
   pre-14b cell totals. The reason is `rules/generate.js#blobs`: hollow-wall
   lining is opted in by `line:true` and runs *after* the `count` loop in the
   same call, so a row with `count:0` still lines every hollow it claimed.
   The lining term is a **fixed floor that no count change touches** — at the
   shipped counts it is 34% of `topsoil` granite's ore and 36% of its adamant
   — so dividing the count alone leaves it whole. Shipped: 5 / 34 / 26 / 19 /
   15, all within ±2.9%. Written up as `docs/SPEC.md` §19.7 with a correction
   note in the plan. **Anyone retuning ore again should solve against the
   measurement, not against the charge.**

2. **The beat-3 margin is 2 units, and that is thinner than it looks.**
   `tools/worldgen-check.mjs`'s new VEIN UNITS property measures 24 copper
   units within a 5-break dig on **every** seed of 200 — min, median and mode
   all 24, because at `r:2.4` the guaranteed vein's star has no random arm
   length and no shoulder, so it is exactly 6 cells forever. The bill is 10
   (§5 beat 3) + 12 (§13's furnace) = 22. **Not fixed here** because 24 ≥ 22
   and the vein shape is D14-F's own decision, but note what the zero variance
   means: the margin is not a distribution with a bad tail, it is a constant.
   Any future change to `charge`, to the furnace bill, or to `ORE_LONG` moves
   it in one step, and the assertion is deliberately placed to fail loudly
   when it does. If more slack is ever wanted, `r:2.6` crosses `ORE_LONG` and
   makes the vein 6–11 cells (24–44 units) at the cost of putting its top row
   at 24 on some seeds — i.e. a 4-tile dig, which contradicts §5's "5 tiles".

3. **`surface` copper is now 5 clusters in a 128 × 30 band, and nothing
   asserts that a wandering player ever meets one.** The unit total is right
   (239.6 vs 233.6 cells, +2.6%) and 66 of those units come from hollow
   lining, so most of the band's copper is *inside rooms* rather than in the
   open rock a surface-walking player breaks. That is the intended "fewer,
   smaller, richer" consequence D14-F names, and the guaranteed vein covers
   the tutorial regardless — but it does change what the surface band *reads*
   as, and no harness has an opinion about discoverability as distinct from
   reachability (property 9 only asks whether an ore body can be reached at
   its own tier, which a body sealed in a dark room passes). **Parked**: a
   "how far must a player walk before meeting ore they can see" property is a
   real gap, and it is a Phase 14e-shaped question, not a 14d one.

## Phase 14e (the harness) — five things parked

1. **Assertion 23 ships with the three known shadowings allowlisted, and the
   reorder that would "fix" them trades one unreachable recipe for another.**
   The three are the ones Phase 8d (#5 above) recorded and this phase
   re-derived mechanically: `peg_rungs {2 log}` and `kindle {1 log}` are
   implied by `daedalan {2 plate, 4 log}`, and `kindle` by
   `auger {2 plate, 1 log}`. Option (b) from the plan's §6.5 was checked
   rather than assumed — moving `daedalan` and `auger` above
   `peg_rungs`/`kindle` introduces **no** new shadowing, so it does work
   mechanically. It was still not taken, because of what it does to play: a
   player holding 2 plates and 4 logs currently gets **rungs** and would then
   get **stairs**, and `peg_rungs` becomes the row nobody can reach in that
   state. That is a content decision with a real feel to it (the cheap ladder
   is the one you want in a shaft; the stair is the one you want when you have
   plates to spare), it needs the craft queue's inability to *choose* a recipe
   fixed first (#4 above, still open), and a harness phase is the wrong diff
   for it. **The allowlist is exactly three ordered pairs**, so any twentieth
   recipe that shadows anything fails the build.

2. **`data/machines.js`' placed miners mine at the best tool power the CONTENT
   TABLES define, not the best one the player owns.**
   `rules/machines.js#bestHandToolPower()` scans `SUB[*].item.tool.power` over
   the whole substance table (its own comment says so: "a future hand tool
   raises every placed miner's rate the same day it raises a swinging
   player's"), so a Talos Head chews at the auger's **1.8** for a player who
   has never crafted an auger and swings at **1.0**. Measured while building
   the MINER PARITY probe: hand 3.8083 s against the head's 2.1167 s on
   identical copper tiles, a ratio of exactly 1.8. Not a break-site
   disagreement — the two sites agree to 0.0000 s once the auger is held,
   which is what the probe now asserts and what `docs/SPEC.md` §12's equality
   is actually a claim about ("T3 mines at exactly the **T2** hand rate").
   **Parked, not fixed**: reading the player's pockets instead would make a
   placed miner slower than the hand that placed it before the auger exists,
   which is a design call about whether automation is a *rate* purchase or a
   *parallelism* purchase (§12 says parallelism), and it moves a number
   `docs/DESIGN.md`'s break-evens are priced against.

3. **The pre-existing `newRun() RESET` probe cannot see the mining ledger, and
   since D14-E almost nothing can.** Comment `digw.clearAll()` out of
   `shell/boot.js` and section 4's reset probe still passes — twice over, in
   fact, because `snapshotModel()` only records `mining.activeCount()` and
   because the *count* is genuinely zero: `newRun()` reallocates every band, so
   worldgen writes every stratum into a freshly zeroed `mat`, every one of
   those writes is a byte **change**, and a byte change clears that
   coordinate's work (D14-E). Topsoil's air pockets are included — they are
   `tw.clear`ed out of stone the layer pass had already written. The only
   coordinates worldgen never writes are **true open sky** in the spawn band,
   which is why 8e's DEPLETION RESET probe plants half its stale work there
   and fails loudly (15 tiles, 9.6150 s) with `clearAll` disabled. Two things
   follow, both parked: `clearAll()` is now *nearly* redundant and must not be
   removed on that basis (sky is buildable space and an inherited half-vein
   there breaks the next run's first placed block on first touch), and
   `snapshotModel()`'s `mining` field would be strictly better as
   `{ n, sum }` than as a bare count — 8e fingerprints both itself rather than
   widening a shared helper mid-phase.

4. **`docs/PLAN-phase14-mining-and-drops.md` D14-B/D14-C claim more than the
   code does, and `docs/SPEC.md` §19.3 had a second, smaller version of the
   same slip.** The plan says "no `deposit` substance has an obtainable
   tile-capable crossing" and asks (§6.5) for an assertion written to that
   sentence; `copper/stair` is a counterexample it names in its own D14-C
   table two lines earlier (`daedalan` outputs the literal pair, and
   `model/tiles.js#baseChargeOf` has a paragraph about it). SPEC §19.3 got the
   design right — a Daedalan stair is refined bronze work, not a vein — but
   said `tin/stair` was obtainable too, which it never was. SPEC is corrected
   in this phase's commit and assertion 21 is written against **obtainability
   per pair** with `copper/stair` as its one argued exemption. The plan text is
   left as written, per the convention its own §4 D14-F correction note
   follows: the mistake stays legible rather than being erased.

5. **Nothing asserts that a `deposit` tile's charge is ever *reachable* at the
   tier that can mine it.** `adamant` is charge 2 at tier 3, and no hand tool
   reaches tier 3 at all — `data/machines.js#cyclops_maw` is the only thing
   that can bite it, so 8e's framerate sweep covers copper, tin and granite
   (the last with the auger, so the expected time is `hard × charge / power`
   and a probe that had hardcoded power 1.0 would fail) and leaves adamant to
   content assertion 22's static check. That is honest but thin: the arithmetic
   is shared (`model/mining.js#unitsCrossed`) so there is no reason to expect
   adamant to differ, and the MINER PARITY probe proves the machine break site
   runs the same code — but **no probe has ever exhausted an adamant tile**.
   A Maw-driven depletion case is the obvious extension, and it needs the
   `minDepth:200` gate satisfied, which is why it is parked rather than
   squeezed in.

---

## Phase 13a (UI text contrast) — three things parked

1. **`view/scene.js#bandLabel` has no caller and is not on screen at all.**
   It is exported and nothing in `src/`, `tools/` or `tests/` invokes it
   (grepped exhaustively), so the band name the acceptance step for this phase
   asks you to read at the bottom-left is simply not drawn. The tone and
   shadow were applied there anyway, per the phase's own file ownership, and
   are latent until it is wired back in. **Wiring it back is a layout
   decision, not a contrast one:** the bottom-left corner already holds the
   journal, and D8 requires an anchored pass over measured text rather than
   the hardcoded `f.H - 26` the function still carries. Parked with the phase's
   "no layout change of any kind" rule.

2. **`maxDiffPixels: 0` is not bit-exactness, and the committed baselines were
   already drifting under it.** `playwright.config.js` sets `maxDiffPixels: 0`
   but leaves `threshold` at Playwright's default `0.2` — a per-pixel YIQ
   colour tolerance — so a difference of a few units per channel counts as
   "not different" and never reaches the pixel budget. Measured while chasing
   what looked like a scope leak in this phase: at commit `84c0320`, with NO
   code change at all, the live render of the `shaft-unlit` scene differed from
   its own committed baseline by **239,932 of 1,024,000 pixels, max delta 8**,
   and the test passed. The same is true of `shaft-lit`, `topsoil`,
   `hollow-unlit` and `hollow-relic-unlit` — every one a dark, low-light
   scene, which is where a small absolute delta is proportionally largest. The
   render itself is perfectly repeatable (three fresh page loads of the same
   scene: 0 pixels different, max delta 0), so this is baseline staleness
   absorbed by the threshold, not nondeterminism. **Setting `threshold: 0`
   would make the suite genuinely bit-exact and is the right fix**, but it
   must land as its own commit with a full re-baseline, because it will
   immediately fail on drift that has nothing to do with whatever change is in
   flight — which is exactly how it wasted time here.

3. **`view/overview.js#drawMachines` draws a state-coloured glyph on a
   backing block tinted 45% toward that same colour**, so the glyph and its
   own backing are the two closest tones on screen: for the UNFUELLED/IDLE
   rung that is `uiDim` on roughly `#4b4644`, about 2.4:1. Not touched here —
   the block is what makes the glyph legible against mottled rock at all, and
   changing the tint ratio is a map-legibility decision that wants to be made
   for all five state colours at once rather than as a side effect of a text
   phase. `view/paint.js#INK.pipOff` shifted slightly as a knock-on of raising
   `uiDim` (it is `mix(uiBack, uiDim, 0.25)`); that is derived arithmetic, not
   a call-site edit, and the phase's "out of scope" note about `pipOff` was
   about not recolouring it, which was honoured.

## Phase 13b (the ladder sprite) — three things parked

1. **A form-level `look` cannot see which substance it was crossed with, so
   `copper/stair`'s tones are hardcoded copper.** `view/paint.js#paintTile`
   resolves the SUBSTANCE's palette into the depth-blended `look()` cache
   (`base`/`hi`/`lo`/`faceSun`/`faceShade`/`contact`, quantised into
   `DEPTH_STEPS`) and hands the treatment only `{ px, py, tx, ty, tile }`. A
   treatment therefore names its own colours from `data/palette.js` and gets no
   access to that cache — which is right for `glint` (a vein's own speckle
   colour is a property of the vein) and wrong for a form shared across
   substances. `stair` crosses with any `metal`, so a hypothetical `tin/stair`
   would draw in copper. **Not reachable today**: `recipes.js#daedalan` is the
   only source of a stair and it produces `copper/stair`, and `rung`'s only
   organic substance is timber. The fix is to pass the resolved tones through
   on the cell (the machine parts' `w`/`h`/`turn`/`t` precedent) and let a
   form's `look` omit a colour to inherit the substance's — worth doing the day
   a second substance can take a tile-capable form, and not before, because it
   adds a second colour-resolution path to every treatment that opts into it.

2. **The depth blend does not reach a form's sprite.** Following from 1: a
   ladder at row 300 is drawn in exactly the tones a ladder at row 20 is, while
   every rock tone around it has been pushed `DEPTH_K` toward `INK.deep`. That
   is deliberate for now — it keeps a placed ladder the most legible thing in a
   deep shaft, which is what you want from the object you climb out on — but it
   is a decision made by omission and should be made on purpose if 1 is ever
   done.

3. **`tools/content.mjs` assertion 15 was not walking `FORM`.** It walked
   `SUB`, `MACH` and `BANDS`, which was complete until this phase gave a form a
   `look` block; one line was added (`for (const f of FORM)`). Worth noting as a
   pattern rather than a one-off: the assertion is generic over the SHAPE of a
   look block but enumerates the TABLES by hand, so every new table that grows
   a `look` needs that one line and nothing will fail if it is forgotten. A
   registry of "tables that may carry a look" would close it permanently and is
   probably not worth a fourth abstraction yet.

## Phase 13d (closing the tribute loop) — four things parked

1. **Reaching the Cloud Dock means tunnelling nine rows of astral's own floor
   slab, and nothing anywhere says so.** `docs/SPEC.md` §18.2/§18.7 price the
   ascent as the 240 px gap between the two ground lines and a 3-segment chain,
   which is true about *reach* and silent about *rock*: astral is 40 rows with
   `floorTy:30`, so rows 30–39 are solid, and `model/segments.js#linkCheck`
   sweeps for solidity along the whole span. Verified by hand while driving the
   acceptance play-through — a link from a hub below to a dock standing on
   astral's floor is refused `THE PATH IS BLOCKED` until rows **31–39** are
   cleared. Row 30 is the one that does not need clearing, because
   `#headframe` exempts `ty + floor(th/2) .. ty + th`, which for the dock's
   `th:1` is exactly rows 29–30 (Phase 10a's own note, #1614, is the same
   mechanism). Two consequences worth a design decision rather than a
   discovery: the dock's `footing:2` must survive the shaft the cable comes up,
   and nine rows of tier-? astral rock is an unpriced material cost on the
   critical path of cycle 2. Neither is a bug; both belong in §18 next to the
   240 px figure.

2. **A cycle completion's toast is structurally unwinnable, which is why
   Phase 13d gave it the banner instead.** `view/fx.js#toast` keeps one line
   ("the newest fact wins"), and a completion frame contains several facts: the
   last `tribute` credit, the `cycle` row, and — for cycle 1 — two `grant` rows
   pushed by `rules/grants.js#step` in the same substep. Measured, not
   theorised: the toast ended on `THE CLOUD DOCK IS GRANTED` every time. The
   fix taken was to move the completion onto the banner slot nothing else
   competes for. The same collision still eats the `debt` row's line (the
   `hurt` row follows it in the same frame) and is documented in §20.5; a real
   fix for that class is a toast **queue** with per-kind priority, which is a
   `view/fx.js` change and was out of this phase's scope.

3. **`shell/main.js#step` now has two "this frame does not simulate" guards
   and they are not the same shape.** `flags.showMap` freezes a run that will
   resume; `run.won` freezes one that never will. They are one line apart and
   read identically, so a third would be the point at which the reason
   belongs in a named predicate rather than in a comment. Also worth stating:
   `run.dead` is deliberately NOT on that line — the world stays live behind
   the death screen, items keep falling, and nothing in this phase examined
   whether that is right.

4. **Fifteen of the twenty punch-list items in `docs/PLAN-phase13.md` §5.2 are
   untouched and still true**, including three the win screen now brushes
   against: `run.misses` is displayed on the win screen and nowhere else (#11),
   favour is summed there and still has no *spender* anywhere (#12), and the
   draft is still 1-of-1 (#4/#5, now marked as such in `docs/SPEC.md` §18.6
   rather than promised as 1-of-3). Nothing in this phase makes any of them
   easier or harder; they are named here only so the win screen's two new
   readouts are not mistaken for those items being closed.

## Phase 16a (the feed verb) — one thing resolved, one narrowed, one parked

1. **RESOLVED, same phase.** The feed verb's two refusal strings were
   initially unreachable from LMB: `docs/PLAN-phase16-interaction-model-v2.md`
   §6.2 step 3 specified rule 2 as *"a machine exists at the aimed tile, is
   within `handFeed.reach`, **and `feedCheck(...).ok`** → `cmd.feed = true`"*,
   and implementing that literally meant a machine that would refuse the pair
   never set `cmd.feed` at all — the press fell through to rule 3 (place),
   which in one measured case **placed a `timber/rung` inside a furnace's own
   footprint** (tile byte 38 at the machine's own tile, toast `TIMBER LADDER
   PLACED`) instead of refusing to feed it. Found in the same phase's hand
   verification and fixed in the same phase: `shell/input.js#feedTargetAt` no
   longer checks `feedCheck(...).ok` before setting `cmd.feed`, only that a
   reachable, hand-feedable machine is under the reticle at all — matching §5
   D16-A's own stated argument ("a machine under the reticle means the
   machine"). `handOne`/`feedCheck` are now always consulted downstream and
   their refusal always reaches the player. `docs/SPEC.md` §23.2/§23.4 record
   the fix in place; `tools/check.mjs` section 8i (direct) and
   `tests/visual.spec.js`'s "REAL CLICK: clicking an ore slot arms it..." test
   (a real `pointerdown` over a real machine, wrong pair armed) both cover it
   as a permanent regression.

2. **NARROWED, not closed.** `rules/placement.js#placeTile` still never asks
   `machineAt` — it tests bounds, `tileAt === AIR`, held count and the backing
   predicate only, and a machine's footprint tiles are genuine `AIR` in the
   tile grid. Item 1's fix shields this **only while something is armed**:
   with rule 2 now unconditional, any armed pair aimed at a reachable,
   hand-feedable machine feeds (or is refused) rather than reaching rule 3 at
   all, so a rung can no longer land inside such a machine's footprint by this
   path. But `placeTile` itself is unchanged, `rung` has always been armable,
   and a machine with no `handFeed` block (or one out of reach) still offers
   no protection — a `machineAt` clause in `placeTile` (which would need
   `placementCheck`'s "one decision, two readers" pair to learn the same
   refusal, so the build ghost agrees) is the real fix and remains out of
   scope here.

3. **Arming a non-placeable, non-feedable pair now costs a refusal toast where
   it used to cost nothing.** Widening both arm gates (docs/SPEC.md §23.1) was
   required and is right, but it means LMB at open air with, say, a
   `copper/ingot` in hand now fires rule 3 and prints `'THAT DOES NOT BUILD'`,
   where before the pair simply could not be armed. Judged acceptable — an
   existing string, one press, and legible — but it is a new toast in a common
   position and Phase 16c's legibility pass (D16-E, the `IN HAND` readout) is
   the right place to decide whether the ghost should be saying "this feeds,
   it does not build" before the press instead.

## Phase 16b (the proximity drain becomes opt-in) — three parked, one plan erratum

1. **PLAN ERRATUM, harmless.** `docs/PLAN-phase16-interaction-model-v2.md`
   §3.4 says "**Seven** machines carry a `handFeed` block" and then lists
   **eight** in the same sentence. Eight is right, and eight is what the repo
   has: `furnace`, `press`, `belt_r`, `brazier`, `talos_head`,
   `cyclops_maw`, `cloud_dock`, `altar` (plus four `variantOf` rows that
   inherit — `kiln_divine`, `belt_l`, `talos_head_l`, `cyclops_maw_l`, which
   is presumably where the miscount came from). The phase's design does not
   depend on the number: the gate is one line at the single call site and
   applies to every row that has the block. Recorded rather than silently
   corrected, because §6.4's own prompt makes the count a stop condition.

2. **PARKED — `docs/PLAN-phase10.md:771` still asserts the feed key.** The
   three live claims 16b was asked to fix are fixed (`data/machines.js` ×2,
   `docs/SPEC.md` §18.3, plus `data/machines.js`'s own `handFeed` key
   reference and `docs/DEVELOPER_GUIDE.md`). `docs/PLAN-phase10.md` is a
   HISTORICAL plan document, like `PLAN-phase12`/`13`, and its sentence is a
   true record of what Phase 10b intended rather than a claim about the repo
   today — so it was left alone on the same principle those documents' own
   stale recommendations are. Named here so a future reader who greps
   `"feed key"` finds the reason instead of a fourth bug.

3. **CLOSED — the Character tab's stat block scrolls.** The panel is still
   capped (`view/ui/mainPanel.js#drawMainPanel`) and the STATS block still
   clips to `body.bottom`, but the block is now a scroll region rather than a
   truncation: `drawCharacterTab` reports it through the ordinary grid path
   and `shell/ui.js#scrollBy` keys the offset under `main:stats`, the same
   mechanism `main:inv` already used (`view/ui/mainPanel.js:314-343`). All
   four stat rows are reachable at the desktop buffer and at the 200 px
   floor, asserted by driving real wheel events against the drawn rect rather
   than by recomputing the layout. A fourth tab was measured and rejected:
   `CHARACTER`/`CRAFTING`/`LOGISTICS` cost 171 px of the floor's 188, so
   `view/ui/tabs.js` would have dropped the new tab silently.

4. **PARKED — `handFeed`'s automatic path is now dead weight for content, and
   that is deliberate.** D16-C explicitly rejected deleting it this wave (a
   one-click revert for the reviewer, and a flag is cheaper than rewriting
   every proximity-feed scene in the same commit that adds a gesture). The
   consequence is that `rules/machines.js#handFeed` now runs in exactly two
   situations: a player who turned AUTO FEED on, and two test scenes that ask
   for it by name (`tools/check.mjs`'s conservation fuzz, which needs it as
   an accountable `take` writer, and three `tests/visual.spec.js` scenes
   whose subject is light/smelting/hover rather than feeding). If a later
   phase does delete it, those are the five call sites to convert, and
   section 8j's anti-hollow half is the assertion that would need rewriting
   rather than deleting.

---

## Phase 17b (three rows per tier, and the grant roster) — four parked

1. **PARKED — `.claude/brain/notes.md:48` still describes `GRANTS` as "one
   row, `gift-kiln`".** That row is retired in this commit and the tier is now
   `gift-talos`/`gift-maw`. Outside this phase's ownership block, and the note
   file is a session aid rather than a binding document, so it is recorded
   here rather than edited.

2. **PARKED — `CLAUDE.md` D1 (line ~344) cites `gift-kiln` as the worked
   example of the machine-grant tier.** Still true as a statement about what
   `data/boons.js` held when D1 was written, and false as a statement about
   the table today. `CLAUDE.md` is not editable from a phase; 17h's doc sweep
   owns it.

3. **PARKED — `docs/FINDINGS.md:816` (the machine-items entry) says
   `kiln_divine` "remains grantable (`data/grants.js#gift-kiln`, the `k` debug
   key, untouched)".** True when written; the grant is now retired and the
   machine row is a named exemption in `tools/content.mjs` assertion 25. Left
   in place rather than rewritten, per this file's own "append, do not rewrite
   history" rule.

4. **PARKED — `docs/DEVELOPER_GUIDE.md#adding-a-substance`'s canonical-example
   line numbers have drifted** (it cites `bellows` at `substances.js:126` and
   `chasm` at `:241`; they are at `:182` and `:317` before this commit). Not
   caused by this phase — the four new rows are appended below every cited
   line — but a reader following those citations lands on the wrong row today.
   `docs/DEVELOPER_GUIDE.md` is outside this block.

And one thing worth stating rather than parking: **`src/data/gods.js` ships
with no importer, and — correcting this entry as first written — with NO
EXECUTION COVERAGE AT ALL.** It is not exercised by `tools/check.mjs`'s
import pass: that pass is a hand-written list of `await import(...)` calls
(`tools/check.mjs:94-108`) and this file is not in it. `tools/layers.mjs`
reads every file as text and executes none, so its file count includes
`gods.js` without running it, and esbuild drops an unimported module from the
bundle. Only `oxlint` parses it, which would catch a syntax error and not a
runtime throw. CLAUDE.md records this exact failure mode ("`check.mjs` now
imports every module for exactly this reason"). The module as written is
trivially safe; the cost is that 17e, which gives it its first reader, is
also what gives it its first execution.

### 17b follow-up (against `docs/REVIEW-wave5-17b.md`)

- **Taken outside the ownership block, with the coordinator's explicit
  extension: one comment in `src/data/forms.js:413-433`.** It asserted "Only
  two things ever reach `packTile`", and `rules/miracles.js`'s `transmute`
  branch — landed in `f2c3d1a` — is a third, subject to neither of the two
  gates the narrowing rests on. That comment is the registry-coupling claim
  `tools/content.mjs` assertion 26 now enforces, so leaving it reading as
  true while tightening the assertion that contradicts it was the worse of
  the two options. No code in that file changed.

- **PARKED — no assertion binds a row's `god:` id to `data/gods.js#GODS`**
  (review D4). The sets are equal today by enumeration, but `godName`
  (`src/data/gods.js:31`) falls back to the uppercased id, so a future
  `hermes` would surface as a HUD label rather than as a build failure. 17e
  is the phase that gives `GODS` its readers and is the right place for the
  assertion.

- **PARKED — `docs/SPEC.md:330-332` (§12) still prices the tile byte the old
  way** (review D5): "adding the `auger` relic substance ... dropping
  headroom from 14 to 13". Under the narrowed guard `auger` is not packable
  and cost the guard nothing; §15 and §22 now agree with the code and §12 is
  the last disagreeing copy. Left for 17h's sweep rather than widened into
  this follow-up, which is about the `transmute` guard.

## Phase 17c1 (the offer, the pause and the reroll — headless half)

- **Taken outside the ownership block: one test in
  `tests/visual.spec.js:1847` ("granting a boon in debug activates it").**
  It pressed `b` and asserted `BOONS[0]`'s modifier went live; `b` now
  raises a 1-of-3 offer instead of granting outright, so the assertion was
  false for the reason this phase exists. The edit is the smallest one that
  keeps the test's own subject (a granted boon activates and expires): press
  `b`, read the baseline from the card `1` will take -- which row that is
  comes out of the seeded draw -- then press `1`. No screenshot and no other
  test changed, and no baseline was re-accepted. Leaving the suite red was
  the alternative, and the file is in neither 17c1's nor 17c2's block.

- **PARKED — a drawn draft card has nothing to click.** `shell/main.js
  #applyDraftIntents` dispatches keys 1/2/3 and `r` above the pause guard,
  and `applyUiIntents()` (the pointer dispatcher) is deliberately not
  reached while the modal stands, so a click on a card or on the REROLL row
  resolves nothing. 17c2 owns `src/view/ui/draft.js` and `src/view/hud.js`
  only, so the branch that hit-tests what it records into
  `view/ui/state.js#drawn` has to be added in `shell/main.js` by whoever
  owns that file next — the intents (`wants.takeCard`, `wants.reroll`) and
  the dispatch already exist and need only a second caller.

- **PARKED — `docs/DESIGN.md:128-129` is now stale.** It says "the draft is
  1-of-1, not a choice: `shell/main.js` takes `draftable()[0]` and grants it
  outright". Both halves are false as of this commit; `docs/DESIGN.md:179`
  ("a draft is still 1-of-3 after each cycle") is now true rather than
  aspirational. Outside this block; 17h's doc sweep.

- **PARKED — an offer is raised silently.** `data/sfx.js#KIND_SFX` has no
  kind for "a god has laid out a choice", and `rules/draft.js` deliberately
  pushes no new journal kind rather than adding one to a file it does not
  own (a kind with no `data/sfx.js` entry is silent by design, so the row
  would have been decoration). The refusals it does push ride the existing
  `'refused'` kind. `src/data/sfx.js` and `src/shell/notify.js` are 17c2's
  or 17e's to decide on.

- **Noted, not fixed: a `newRun()` under an open modal costs one frozen
  frame.** `shell/main.js#applyDraftIntents`'s staleness sweep closes a
  modal whose offer has gone, but `step()` has already returned early that
  frame, so the first substep after such a restart does not simulate. Not
  reachable in play — restart is only offered on the death screen and the
  run cannot die while frozen — and the alternative (clearing `ui.stack` in
  `shell/boot.js#newRun`) is outside this block and would change what a
  restart does to every other panel.

### 17c1 follow-up (against `docs/REVIEW-wave5-17c1.md`)

- **FOR 17g — `rules/draft.js` has no probe at all, and `tools/check.mjs` is
  the only place one can live.** Unasserted today: the offer is
  `eff('offerSize')` cards of distinct ids drawn from the tier's
  `draftable()`; a short tier offers fewer and an empty one refuses
  `'NOTHING LEFT TO OFFER'`; the world does not advance behind a standing
  offer (a falling item's `y` and `clock.t`/`run.t` unchanged across
  substeps); a reroll spends exactly `eff('rerollCost')` from the offer's own
  god and re-picks; both refusals (`'NOT ENOUGH FAVOUR'`,
  `'THIS IS ALL THERE IS'`) spend nothing; the same seed and the same input
  lay out the same cards; `newRun()` clears `run.offer`. All of it was
  verified in a scratch harness for this phase and then thrown away, which is
  exactly the evidence that should have been a permanent assertion. **The
  one that must be driven at several framerates is the last cycle's draft**:
  `rules/cycles.js#ensureLiveCycle` defers `rw.win()` while `run.offer`
  stands, and with that deferral removed the trinket draft is dropped at 30
  and 60 fps and survives at 72/120/144 — a real-accumulator loop
  (n substeps, then ONE `applyIntents`) is what makes the parity visible, and
  `stepReal` alone cannot see it. `tools/check.mjs` and `tests/` are outside
  both 17c1's and 17c2's blocks.

- **Taken outside the ownership block, again and for the same class of
  reason: `tools/check.mjs:5364-5378`, the WIN STATE probe.** It paid all
  four cycles through `stepReal` alone — half a frame, with no
  `applyIntents` — so with the win now deferred behind an outstanding reward
  it stalled on cycle 2's grant draft and `run.won` never came. Two lines:
  call `main.applyIntents()` after each resolve and take card 0 when an offer
  stands. The probe's own subject (the boundary is the table's length, fired
  exactly once) is unchanged, and it now drives the whole frame it always
  claimed to. A red `npm run check` was the alternative.

- **PARKED — D5, latent: `flags.showMap` is guarded above
  `applyDraftIntents`** (`src/shell/main.js:199` vs `:213`), so if anything
  ever set `showMap` true under a standing offer, neither the card nor the
  map could be reached. Unreachable today (the draft branch swallows `o`, and
  `raiseOffer` cannot run while the map is open) and left alone on the
  reviewer's own MINOR grading; the fix, if it is ever wanted, is to move the
  map guard below `applyDraftIntents()` exactly as the draft guard already
  is.

- **PARKED — D6, latent: `rules/draft.js#reroll` spends before it re-picks.**
  Only the freeze makes that safe. Narrower now than when it was written —
  the reroll is refused outright unless the pool is strictly larger than the
  offer, so the re-pick cannot come back empty — but the ordering is still
  the thing holding it.

- **PARKED — S1, style: `tests/visual.spec.js:1852` narrates the phase**
  ("THE DEBUG KEY NOW RAISES AN OFFER RATHER THAN GRANTING OUTRIGHT (Phase
  17c1)"), which `CLAUDE.md` says to delete. Left as-is by the coordinator's
  instruction; the half worth keeping is that the baseline comes from the
  seeded draw rather than from `BOONS[0]`.

### 17c2 (the draft modal)

- **`view/ui/mainPanel.js#formatModRow` should be lifted out of that file**
  (`src/view/ui/mainPanel.js:306`). It is a pure `{key, mul, add}` →
  presentation-string function with no dependency on the live `mods.rows`
  list, and `src/view/ui/draft.js:114`'s `modLines` now produces the same
  strings from its own copy — 8 duplicated lines. `mainPanel.js` is outside
  17c2's ownership block, so the export could not be added here. Note that
  `trinketDeltaLines` (`:291`) around it is **not** the reusable part: it
  filters `model/mods.js#explain`, which reads only modifiers already
  applied, so it returns nothing for an offered card.

- **A modifier's polarity is not knowable in `view`, so the draft card cannot
  colour a delta by whether it helps.** `src/view/ui/draft.js:109`.
  `poseidon-flood`'s `hard x0.85` is a benefit and `girdle`'s `climb x0.8` is
  a cost, and both print `-N%`. The fact that decides it belongs on the
  tuning row (a `better:'up'|'down'` key on `data/tuning.js`, surfaced
  through `model/mods.js`, which is the only file allowed to import that
  table). Until then both this file and `mainPanel.js#drawCharacterTab` paint
  every delta in one accent colour, which overstates the girdle's trade in
  the Character tab and states nothing on the card. `data/tuning.js` and
  `model/mods.js` are outside this block.

- **CLOSED, and the first version of this entry was wrong about why.** It
  claimed dead-with-an-offer was unreachable because the run freezes while a
  modal stands. It is reachable: `rules/cycles.js:263` writes `run.offer`
  inside a SUBSTEP, and `shell/main.js#raiseOffer` only opens the panel once
  per frame, so the remainder of that frame runs live -- one substep at
  60 Hz, up to 30 at `MAX_CATCHUP` -- and a lethal fall lands in the window.
  `view/hud.js#drawHUD` draws `deathScreen` above the modal (correctly: the
  restart button must stay reachable), so `shell/input.js:318`'s 1/2/3 would
  have granted a permanent gift off an invisible panel. Fixed with a
  `run.dead` return in `applyDraftIntents`. The POINTER half never needed
  one: `resetDrawn()` runs every frame and no `draft-card-*` rect is
  recorded on a frame the modal is not drawn.

- **FOR 17g -- the modal has no coverage in `npm run check` at all.** Section
  2's two purity probes render with no offer standing, so `view/ui/draft.js`
  returns at its first line and nothing in the headless harness has ever
  executed a line of it; only the six Playwright scenes do. What a headless
  probe could assert without a browser: that `drawDraft` records
  `ids.length + 1` rects, that none of them lands on a `view/ui/panel.js`
  clamp boundary at the 200x180 floor, and that a second render with an
  offer standing still performs zero model writes -- the epoch assertion
  proves purity only for the scene without one today. `tools/check.mjs` is
  outside both 17c1's and 17c2's blocks.

- **The `'cycle'` banner is swallowed by the modal it announces.**
  `src/view/fx.js#banner` fades on `stepFx`, which runs outside `step()` and
  therefore keeps running while the draft freezes the world — but
  `view/hud.js#drawHUD` draws the modal in place of the banner, so "THE TRIAL
  IS PAID" burns down unseen behind it. Arguably right (the modal *is* the
  announcement) and deliberately not changed here; recorded so a later phase
  that wants the beat knows where it went.

## Phase 17i (the quickbar is eight cells, and pickups fill it first)

- **`src/view/ui/grid.js:75-84` paints a cell for every column of every row
  it draws, so a grid whose item count its column count does not divide shows
  boxes that address nothing.** The cell loop runs `for (c = 0; c < cols;
  c++)` and pushes a slot for each position in the rectangle, drawing
  `CELL_BG` even where `idx >= items.length`. This phase hit it first. Eight
  slots at the old `COLS = 5` drew ten boxes, the last two without a digit
  glyph, without an empty-slot fill, and without a `run.inv` index. Closed
  here by matching `view/ui/quickbar.js#COLS` to the slot count rather than
  by changing the primitive, because `mainPanel.js`'s recipe and craft-queue
  grids are ragged by nature and share it. Those two are where the padded
  boxes still show, and whether that is right is a question for whoever owns
  the Crafting tab.

- **`src/rules/items.js:128-131`'s refusal comment still says "no free main
  slot".** The refusal now means no free slot anywhere, main or quickbar.
  One stale phrase, in a file outside this block.

- **FOR 17g — `hollow-relic-unlit.png` shows the same instability FINDINGS
  #14 reports for `winch-lit`/`winch-unlit`.** Rendering that scene with
  this phase's `src/` changes stashed produced a 12-pixel difference against
  the committed baseline, confined to (628,390)-(652,406) — the relic's own
  halo, nothing to do with the quickbar. The re-accepted baseline then
  passed three consecutive runs. So the scene varies between sessions rather
  than between renders, which is the shape a module-scope generator that
  `reset()` does not rewind would produce (`view/fx.js:25`, already named in
  17e's brief).

- **`src/view/hud.js#hint` centres the bottom callout without reserving the
  quickbar's rect, and the two now overlap by 4 px at the 200 px floor.**
  `y = H - 16` puts the callout band at rows 164-176 and the strip occupies
  153-167, which was already true when the strip was two rows of five —
  what changed is the width, so "TAKE THE PICKAXE" now runs under cells 1-5
  instead of 6-7. The fix is the D8 one (anchor off `drawn.grids`'s quickbar
  rect the way `hudRuler` already does), not a nudged constant.

## Phase 17g1 (the visual suite was never bit-exact)

- **`maxDiffPixels: 0` alone does not mean bit-exact, and the suite has never
  been bit-exact.** `playwright.config.js` set `maxDiffPixels: 0` and left
  `threshold` at Playwright's default of 0.2. `threshold` is a per-pixel YIQ
  colour distance a difference must exceed before pixelmatch counts the pixel
  at all, so `maxDiffPixels` only ever counted pixels that had already cleared
  a 20% bar. Every near-black shift of 1 to 11 units passed silently. Measured
  at `c803360^`: the committed `hollow-relic-unlit.png` reports 0 differing
  pixels at the default threshold and **100** at `threshold: 0`. The config now
  sets both, and CLAUDE.md's "screenshots are bit-exact (`maxDiffPixels: 0`)"
  should read "bit-exact (`threshold: 0`, `maxDiffPixels: 0`)".

- **Every "drift" `docs/REVIEW-wave5-17i.md` §4.1 could not explain is an
  ordinary source change the loose comparator hid. None of it was
  nondeterminism.** Bisected by re-running the suite at `threshold: 0` in a
  worktree at each commit:

  | baseline | moved at | what that commit did |
  |---|---|---|
  | `hollow-relic-unlit` | `fc3a40e` | gave `bellows` a sprite, drawn under its own halo |
  | `ui-character`, `ui-character-swap`, `ui-crafting`, `win-screen` | `a8ac398` | gave the starting `timber/brand` a sprite |
  | the same four | `35b6ce6` | stopped spawning that brand at all |
  | `ui-character-fresh-phone`, `ui-character-swap-phone`, `win-screen`, `win-screen-phone`, the four `draft-*` | `c803360` | quickbar `COLS` 5 → 8 moved the translucent strip |

  Each should have been re-accepted in its own commit and was not, because the
  suite stayed green. `c803360`'s blanket re-accept then wrote three of them
  into the reference images, which is how the review found them.

- **One real intermittent failure, and it is a late `resize`.**
  `tests/visual.spec.js`'s 200 px floor draft test was the one test driving the
  viewport through `page.setViewportSize` rather than `__mf.resize`.
  `setViewportSize` resolves when Chromium has resized; `shell/boot.js`'s own
  `resize` listener — which moves `VIEW` and re-clamps the camera — runs later,
  and under `?test=1` no RAF loop repaints after it. Whichever side of
  `settle()`'s `newRun` the listener landed on decided the camera, and the two
  outcomes differ by 49,716 pixels. It failed 3 of 6 full parallel runs at
  `threshold: 0`. Waiting on the stage canvas's backing width makes it
  deterministic; 10 full parallel runs green after.

- **FINDINGS #14's winch failure did not reproduce.** 34 full parallel runs, 25
  of them at `threshold: 0`, plus 64 fresh pages across 8 browser launches
  hashing the canvas backing store. `winch-lit`/`winch-unlit` never varied.
  Five Chromium raster configurations (default, `--disable-gpu`,
  `--disable-accelerated-2d-canvas`, `--use-gl=swiftshader`,
  `--in-process-gpu`) produce byte-identical canvases, so a raster-backend
  switch is ruled out on this machine. The 164 px the finding reports is far
  above the old 0.2 threshold, so it was never of the class diagnosed here. It
  stays open, with one lead: a late `resize` is now a proven mechanism for a
  large intermittent diff, and any test that draws while anything is still
  settling can produce one.

- **`webServer.reuseExistingServer: true` makes two concurrent `playwright
  test` invocations destroy each other.** The second reuses the first's server
  on :5173 and then tears it down when it exits, and the first sees
  `net::ERR_CONNECTION_REFUSED` on every remaining test. Two of the runs in
  this phase's first batch died that way, from my own parallel probe. Not
  worth changing — worth knowing before believing a mass failure.

- **`tests/visual.spec.js` now records the canvas op stream.**
  `installOpRecorder`/`recordOps`/`firstOpDiff` patch the 2D context prototype
  in the page and log every mutating call and style write, tagged by surface.
  A pixel diff names a rectangle; an op-stream diff names the draw call. Four
  tests use it, three of them asserting that a repaint emits an identical
  stream — which is `npm run check`'s render-purity probe extended into paths
  no headless probe reaches, `view/ui/draft.js` first among them. Compare
  streams with a warm chunk cache on both sides: `view/paint.js` repaints at
  most `REPAINT_BUDGET` chunks per frame, so a cold draw legitimately carries
  paint ops a warm one does not.

- **FOR WHOEVER TOUCHES `view/fx.js#spark` (17e): it is still latent.** 17a's
  reasoning holds and this phase found nothing against it. Every page is fresh,
  so the generator starts at the same offset in every test.

## Phase 17j (the ALL category in the crafting tab)

- **The DIVINE category is empty, and has been since it was written.**
  `view/ui/mainPanel.js:391` routes a recipe to `divine` when its output
  substance carries `relic` or `miracle`, and no row in
  `data/recipes.js#HAND_RECIPES` does — the 19 hand recipes split 13 raw, 2
  refined, 1 tool, 3 placeable, 0 divine. The tab draws, clicks and shows an
  empty grid. Content, not layout, so it is out of this phase's block; the new
  set-equality test states the count `0` outright so the day a divine hand
  recipe lands, the test says so.

- **`drawTabs` has two callers, not five.**
  `docs/PLAN-wave5-closeout.md:543` warns that wrapping the row costs "four
  other callers" their baselines. Both callers are in
  `view/ui/mainPanel.js` (`:139` the MENU row, `:426` the category row), and
  the MENU row's three labels cost 171 px against 188 px at the floor, so it
  never wraps and its pixels did not move.

## Phase 17d (the rolling-window batch clause)

- **Out of FILE OWNERSHIP, taken anyway because this phase would otherwise
  ship a red `npm run check`: `tools/check.mjs:5369`'s WIN STATE loop.** The
  probe stubs a delivery by writing `have` straight onto `run.tribute`, which
  is the one path that skips `rules/cycles.js#creditTribute` and therefore
  never stamps a batch credit. Cycle 4 now carries a batch clause, so
  `tributeMet()` stayed false there and the win boundary never arrived. The
  repair fills the window the same way a real credit does, two lines inside
  the existing probe's setup, and adds no assertion. Nothing else in `tools/`
  writes `have` for cycle 4.

- **CORRECTED, AND CLOSED. A typo'd batched pair crashes the game; it does
  not fail quietly.** The first version of this entry said a typo in
  `src/data/cycles.js`'s `batch:{ sub, form, n, secs }` (then named `rate`)
  would leave "a clause nothing can ever satisfy and nothing would throw".
  That is wrong. `rules/cycles.js#creditTribute` calls
  `keyOf(S[batch.sub], F[batch.form])` and `model/items.js#keyOf:32` reads
  `SUB[sub].id`, so a bad `sub` evaluates `SUB[undefined].id` and raises a
  `TypeError` mid-substep — on the first delivery of ANY pair to that cycle's
  receiver, not only of the batched one. The `batch &&` guard does not
  short-circuit it, because `batch` is truthy. A one-character content error
  takes the run down mid-trial. Only a pair that is valid but unholdable, say
  `granite/plate`, is the quiet case the old entry described.
  `tools/content.mjs` assertion 19 now validates `batch` the
  way it validates a `demand` row — `holdable()`, `expand()`, `n > 0` and
  `secs > 0` — and says in the failure text that it is guarding a throw.
  Closed here rather than parked, because no phase left in
  `docs/PLAN-wave5-closeout.md` owns the content lint (17g2 owns
  `tools/check.mjs` and `tests/`).

- **The TRIBUTE panel reads 100% on an unpaid cycle 4, knowingly, until
  17e.** `src/view/hud.js:305-309`'s `aggFrac` sums `Math.min(have, d.n)`
  over the demand rows and knows nothing about the batch clause, so a player
  who fills both demand rows slowly sees `8 / 8`, `8 / 8` and `100%` while
  `tributeMet()` is false and the clock runs out into a 2-heart miss with
  nothing on screen naming the reason. `src/view/` is not in 17d's ownership
  block and drawing the batch row is 17e brief item 1, so this is a transient
  by design — recorded because a reader of the repo between the two commits
  would otherwise have no note saying the HUD is wrong on one cycle.

- **FOR 17g2, the permanent assertions this phase verified in a scratch
  harness and then deleted.** The harness drove the real `main.step()` at
  1/30 and 1/144 with a `cloud_dock` placed in topsoil and cycle 4 armed
  directly, the same setup shape `tools/check.mjs:5240`'s TRIBUTE GATE probe
  already uses. Three claims, all measured and all passing, none of them
  asserted anywhere in the repo today:

  1. **The slow feed does not pay.** Eight `copper/plate` handed over one
     every 45 s, plus all eight `granite/gravel`, leaves `run.cycle` at 4 and
     `tributeMet()` false at `run.t` 315 s with both demand rows full —
     `batchHave()` reads 3 against `batch.n` 4, at 30 fps and at 144 fps
     alike.
  2. **The fast feed does pay.** Four more plates back to back complete the
     trial within two substeps, at both framerates.
  3. **The ledger is bounded.** Twelve plates handed over one per frame never
     grew `run.tribute.credits` past 4 entries, which is `batch.n`.

  A fixed-dt harness cannot see (1) or (2) — the window is the first quantity
  in the game measured over hundreds of simulated seconds, and CLAUDE.md
  records three framerate bugs that passed green for exactly that reason.

- **FOR 17h: a genuine throughput quota is still unbuilt, and punch-list #14
  closes as "mechanism shipped, promise reworded".** `docs/DESIGN.md`'s
  "refinement, not volume" argument wants a demand that measures production
  speed. The batch clause does not, and cannot: `rules/cycles.js#creditTribute`
  stamps a credit when a receiver's buffer is drained, so a stockpile hauled
  up in one trip credits in one instant and the window never sees the ten
  minutes of mining behind it. `docs/SPEC.md` §4 and §18.10 now say this
  outright, but the ambition and a mechanism that superficially resembles it
  are now sitting next to each other, which is the most confusing state for a
  later reader. 17h should park it in `FUTURE_IDEAS.md` with both routes
  named:

  1. **Stamp credits at production.** A second write path, and a new question
     about where production is observed — at the machine that makes the unit,
     or at the carrier it boards.
  2. **Make the demand exceed one load.** Cheaper, and pure content: on cycle
     4's numbers the whole 8-plate bill weighs 19.2 T against a 30 T soft cap,
     so the batch clause binds only above `n × 2.4 > 40`, i.e. seventeen
     plates. That is triple the trial's current cost and a real rebalance.

  **17h must not write #14 up as a kept throughput promise.** The mechanism
  shipped and the promise was reworded; those are different claims and the
  project has already had to correct that exact paragraph once.

## Phase 17e (the batch row and the HUD closeout)

- **`shell/main.js#uiHitGrid` (`:529`) scans `drawn.grids` FORWARD, so where
  two grids overlap the FIRST-DRAWN one wins — the opposite of
  `uiHitPanel` (`:515`), which scans backwards so the topmost panel wins.**
  At the 200 px floor the main panel is 172 px of a 180 px buffer and covers
  the quickbar, which `drawQuickbar` recorded first, so any grid of the
  panel's that reaches into the strip's rectangle hands its wheel notches to
  a widget the player cannot see. This phase worked around it inside its own
  ownership (`view/ui/mainPanel.js#contentBottom` stops the Character tab
  above the strip), but the CRAFTING tab's `recipes` grid has the same
  overlap at the floor today and nothing stops it. One line — iterating
  `drawn.grids` backwards — would close the class, and `uiHitPanel` is
  already the precedent for it. Outside this block.

- **`tools/check.mjs:4126` says `view/hud.js`'s only exports are
  `hoverInfo`, `drawHUD` and `pairLabel`.** Still true after this phase, and
  worth leaving here because the parenthetical is an enumeration that will go
  stale the first time anything is exported for a test to read. Nothing
  depends on it.

- **The bottom callout still draws through the main panel, faintly, at the
  200 px floor.** `view/ui/panel.js` backs a panel translucently, and the
  callout is now drawn UNDER the window rather than over it (`docs/SPEC.md`
  §26.6), so at the floor — where the panel covers nearly the whole buffer —
  the callout's own band shows through the panel's back. It is legible
  underneath rather than painted on top, which is the improvement this phase
  was after, and closing it properly means either an opaque panel back or a
  callout that yields entirely while a window is open. Neither is a HUD
  anchoring question.

- **The two-miss limit is now stated in two places.** `rules/cycles.js:309`
  owns the decision (`run.misses >= 2` tops the hearts off) and
  `view/hud.js#missTally` now says `ONE MORE ENDS THIS` at one miss, which
  restates it. A `model/run.js#missesLeft()` query would make it one fact
  with two readers, the same shape `tributeMet` already has. `model/` is
  outside this block, and the string is the whole of the duplication.

- **Chromium coalesces a run of upward wheel events and Playwright's
  `mouse.wheel` does not wait it out.** Seven consecutive `wheel(0, -120)`
  calls, each followed by `__mf.frames(1)`, moved
  `shell/ui.js#ui.scroll['main:stats']` exactly once; seven downward ones
  moved it seven times. Measured while writing the Character-tab scroll test,
  which now zeroes the offset through `scrollSet` and drives only the
  downward direction with real events. Worth knowing before believing a
  scroll-up test.

- **`shell/main.js#applyUiIntents` calls `scrollBy` with no `maxRow`, so a
  grid's stored offset grows without bound past the end of its list.**
  `view/ui/grid.js` clamps only for drawing, so a viewport change that
  shortens a list leaves the offset parked past the end and the player has to
  wheel back through the slack. It predates this phase — the `inv` and
  `recipes` grids have always behaved this way — and the new `stats` region
  inherits it. `shell/` is outside this block; the fix is to pass
  `rows - visible` from the rect the grid just returned.

- **A full parallel visual run stalls in `boot()` roughly one time in six on
  this machine, and it is not a pixel failure.** Measured across twelve full
  runs of the suite at `threshold: 0`: ten finished in 15-19 s and green; two
  ran for 1.8 and 15.3 minutes and lost one and six tests. The captured
  failure is `page.waitForFunction: Test timeout of 30000ms exceeded` inside
  `boot()` — the page never reached `__mf.ready` — on `overview with a broken
  lift chain`, a scene with nothing to do with this phase. That same test run
  alone 25 times in a row failed 0 times. It is a boot or server stall that
  lands on whichever worker is unlucky, the same class 17g1 already records
  for `webServer.reuseExistingServer`, and it should not be read as
  nondeterministic rendering: no run has ever produced a pixel diff.

- **Some near-spawn baselines hold a surface with no altar on it, and that is
  correct for most of them.** `rules/cycles.js#ensureAltarPlaced` withholds the
  altar until tutorial beat 4 or `altarGraceSecs`, so a scene that neither digs
  nor steps 80 s has none. 17f2 re-accepted the twelve that step, because they
  now wait the 1.6 s arrival out. What remained was the scenes that set
  `run.tutorialBeat` and draw without running a frame: the director never gets
  a frame in which to place anything. 17g2 fixed `tribute-cycle1-armed`, the
  case where the picture contradicted its own name, and left the five other
  `tribute-*` scenes alone with the reason written above each — three of them
  are armed at the dock and must not step at all, because a stepped frame with
  the ledger already full completes the trial out from under the picture.

## Phase 17g2 (the draft and batch sections, and five audited assertions)

- **`rules/draft.js` now has a headless section, and every branch of it was
  perturbed to red.** `tools/check.mjs` section 8l drives the offer through
  `main.step()` and `main.applyIntents()` only. Five perturbations of `src/`,
  each reverted:

  | perturbation | red |
  |---|---|
  | `pick` splices from index 0 instead of `(rand() * len) \| 0` | `all 40 seeds laid out the same [hephaestus-forge,poseidon-flood,athena-focus]` |
  | `pick` reads `pool[i]` without splicing | `seed 9760 laid out [hades-passage,athena-focus,hades-passage], which repeats a row` |
  | `shell/main.js#step`'s `pausesRun()` guard commented out | `60 real frames with the modal up moved the ore 42.000 px ... run.t by 0.5000 s` |
  | `rw.favour(god, -1)` instead of `-rerollPrice()` | `one reroll moved athena's favour 2 -> 1, spending 1 -- want exactly eff('rerollCost') = 2` |
  | `offerExhausted()` returns `false` | `the refused reroll moved hephaestus' favour 3 -> 1` |

- **The draft pause is asserted as "the run resumes where it stopped", not
  merely as "nothing moved".** A falling ore falls 42.000 px in 60 unfrozen
  substeps, 0 px in 60 frames behind the modal, and the same 42.000 px in the
  60 substeps after a card is taken. The control run is the same seed with no
  modal, so the number is measured rather than typed.

- **A poll loop in this harness must be bounded by frames, never by `run.t`.**
  Section 8m's `until()` first read `while (run.t < limit)`, and the first
  perturbation of the batch clause — `batchMet()` always true — pays cycle 4
  on the rig's own first step, wins the run, and `main.step()` then returns
  early without advancing the clock. The checker hung instead of failing, and
  a hung checker reports nothing. A perturbation that freezes the simulation
  is the ordinary case for a probe that drives the real loop.

- **The batch window measures exactly one polling frame wide at every
  framerate.** Section 8m delivers every plate through the real feed verb at
  the sweep's own frame and reads `run.t` off the simulation. One credit,
  from landing to ageing out:

  ```
   20 fps  120.0500 s (+0.0500)    107 fps  120.0000 s (+0.0000)
   30 fps  120.0333 s (+0.0333)    120 fps  120.0000 s (+0.0000)
   60 fps  120.0167 s (+0.0167)    144 fps  120.0069 s (+0.0069)
   90 fps  120.0111 s (+0.0111)    240 fps  120.0042 s (+0.0042)
  ```

  Every error is at most one frame and never negative, so the assertion is
  `err >= 0 && err <= dt` per rate rather than a blanket tolerance. Halving
  `batchHave`'s window reports `-59.95 s` at 20 fps; stamping a credit with
  `Date.now() / 1000` leaves it never ageing out at all.

- **All five of 17e's unaudited assertions can fail.** Perturbed one at a
  time in `src/view/`, each reverted:

  | assertion | perturbation | red |
  |---|---|---|
  | honest at every stage | the batch row stops counting towards the aggregate | `Expected: not "100%"` |
  | honest at every stage | `batchLabel` always returns the full name | `Expected: "CU PLT IN 2:00" Received: "COPPER PLATE IN 2:00"` |
  | the miss tally | `missTally` returns before drawing | `Expected: not 844597379` |
  | the urgency flash | `urgentFlash` returns `false` | `expect(hotB).not.toBe(hotA)` |
  | the urgency flash | `urgentFlash` drops the `urgentSecs` test | `expect(calmB).toBe(calmA)` |
  | the death tally | the death screen prints depth only | `Expected: not 1381599770` |
  | the chip stream | `reset()` stops rewinding `spark` | 18 of 18 chip velocities differ |

- **The chip-stream rewind IS demonstrable, and 17e already demonstrated
  it.** `docs/REVIEW-wave5-17e.md` §6 says it "cannot be demonstrated against
  a baseline", which is true and not the whole story — the test 17e wrote is
  not a baseline test. It bursts six chips, advances the stream, resets, and
  bursts six more inside one page, and deleting `spark = mulberry(SPARK_SEED)`
  from `view/fx.js#reset` turns it red. Nothing about it is latent or
  uncovered.

- **`src/view/hud.js:1049-1054` clamps the callout's PANEL to the buffer and
  then draws the text unclamped.** `bottomLine` computes
  `w = Math.min(textWidth(text) + 12, W - 4)` and then `drawText(g, text,
  x + 6, ...)` with no clip. At the 200 px floor `CALLOUTS[5]` —
  `'CLICK YOUR ORE, THEN THE ALTAR -- 10 COPPER'`, 257 px against a 196 px
  panel — runs 67 px past the right edge. Pre-existing, and newly pictured in
  `tribute-cycle1-armed-phone.png`, which now steps the director and so
  reaches beat 5; no callout long enough had ever been photographed at the
  floor. `view/` is outside this block. The fix is D8's own rule, the one
  `batchLabel` already follows, which is to measure and then abbreviate.

- **FINDINGS #14 did not reproduce in 18 more full parallel runs, and the
  CPU-contention lead explains a different failure from the one #14
  records.** 12 runs on this machine as found and 6 more under twelve extra
  busy loops; 140 tests each, 2,520 test executions, every run green in
  16-21 s. Every one of those runs competed with an unrelated process holding
  200-600% CPU throughout, which is the condition `docs/REVIEW-wave5-17e.md`
  §5 reports its six winch failures under. **Those six were `Test timeout of
  30000ms exceeded`, not pixel diffs** — the same class 17g1 records for a
  `boot()` stall and for `reuseExistingServer`. #14 is a 164 px PIXEL diff,
  observed twice in Phase 9 at `threshold: 0.2`. Contention produces a
  stalled worker; it has never produced a wrong pixel here. The two should
  not be read as one symptom.

  The running total against #14 is 52 full-suite runs since it was written,
  43 of them at `threshold: 0`, plus 17g1's 64 fresh-page canvas hashes across 8
  browser launches and 5 raster configurations. Ruled out by that evidence
  and by inspection: the raster backend, threshold-hidden drift, the chip
  stream (fresh page per test, and `reset()` has rewound the generator since
  17e), and CPU contention as a source of pixel error. One hypothesis
  survives, a late `resize` landing between the last `draw()` and the
  screenshot, which 17g1 proved is a real mechanism elsewhere — though it
  would move the camera and so cost tens of thousands of pixels, not 164.
  **What would settle it is one captured diff image.** Nothing in the
  evidence explains a small, localised, intermittent difference, and nothing
  since Phase 9 has produced one.

- **`tribute-cycle1-armed` pictures the first trial with its altar again, and
  an assertion now says so.** `altarOnScreen` reads the machine list and the
  camera and requires exactly one altar inside the buffer, so the scene
  cannot silently lose its subject a second time. The other five `tribute-*`
  scenes keep their no-altar framing on purpose. Two are armed at cycle 3 and
  cycle 4 with the dock as receiver, the over-cap scene's subject is the
  burden bar, and the three cycle-4 scenes must not step at all, because a
  stepped frame with the ledger already full completes the trial out from
  under the picture.

- **`view/hud.js#panel` drew its top bevel at full opacity regardless of the
  alpha it was handed — fixed.** The body used `a`, then `globalAlpha` went
  back to 1 before the bevel line, so a panel fading in showed a hard 1 px
  line over nothing. Only `bottomLine` passes a varying alpha, so the callout
  was the only visible instance, and it was the *entire* diff in
  `ore-against-pale-stone` and five other baselines — each of which had been
  recording the artifact as correct. `panel()` now takes a separate `fade` that
  scales both, defaulting to 1 so every static caller is bit-identical.
  `tests/visual.spec.js` "17k: a callout at the start of its fade draws
  nothing, bevel included" hashes the same strip at beats 2 and 3, whose rows
  are different widths, and asserts the two match.

- **Eight of the nine `data/callouts.js` rows overran the 200 px base buffer,
  and the tutorial lost words off the right edge — fixed.** `bottomLine`
  clamped its panel to `W - 4` and then drew text at `x + 6` with no clip, so
  at `core/canvas.js#BASE_W_MIN` a player read
  `CLICK YOUR ORE, THEN THE ALTAR -` and never saw `10 COPPER`. Only
  `TAKE THE PICKAXE` fitted. Wrapping was chosen over a `short` variant per
  row so no instruction loses content on the viewport where guidance matters
  most; `core/font.js#wrap` sits beside `textWidth`, the only authority on how
  wide a string is. `tools/check.mjs` section 8n asserts every row fits when
  wrapped and that at least one would overflow unwrapped, so the wrap is
  proven load-bearing rather than assumed.

## Phase: the II->III seam lights a row nothing reaches (docs/AUDIT-seam-light.md §6.1-2)

- **The audit's §7 assertion 2, taken literally, darkens the spawn band.** It
  asks that `lightAt(b, tx, 0) === 0` "for each band with a band above,
  wherever the band above is solid at its last row". `data/world.js:59` makes
  astral rows 30-39 a stone slab across all 128 columns, and it sits directly
  over `surface`'s own 20 rows of sky, so that reading takes the whole spawn
  band to light 0 and `view/scene.js#DARK_ALPHA[0]` paints it at 0.94. The
  world is a contiguous stack and the surface's daylight is a content
  statement, not an occlusion fact. The assertion shipped as "daylight at row
  0 implies `model/tiles.js#worldSkyAt`", with the same teeth at the
  surface/topsoil seam and no claim about a band that carries its own sky.
  `docs/SPEC.md` §11.1 records the rule and the table.

- **The seam carry runs downward only** (`src/rules/light.js:213`). A brazier
  below a seam does not light the rock above it, so a shaft crossing the seam
  with a light source in the lower band stays dark on the upper side.
  Resolving both directions needs the flood iterated to a fixed point across
  bands, or one flood over the union of bands, rather than the single top-down
  pass `step` makes. Neither is in the audit's scope.

- **FIXED TWICE. `src/view/scene.js:791` stepped the whole screen 8x in one
  frame at the surface/topsoil seam.** `atmosphere()` read `bandAt(cam.x + W/2,
  cam.y + H/2)` and tinted by `min(0.55, (1 - ambient) * 1.1)`, which is 0.055
  for `surface` and 0.440 for `topsoil`. Measured at the 200 px buffer, `cam.y`
  667 gave 0.055 and 668 gave 0.440.

  The first fix took the area-weighted mean of every visible band's
  `look.ambient`, which removed the step and left the whole frame on one alpha.
  That alpha then depended on what else was in frame, so the same rock changed
  brightness as the camera moved -- 0.055 to 0.209 in `drive-band-seam`, which
  is 40% underground -- and surface sky dimmed in proportion to how much
  topsoil sat under it.

  **THAT OPTION WAS TAKEN.** The note below used to record a per-band rect as
  the alternative, and the tint is now that: `view/scene.js#depthTint` gives
  every world row the alpha its own band claims, with adjacent bands ramping
  into each other over `TINT_SPAN` = 32 world px centred on the seam. The
  alpha at a world row is now independent of the camera to the bit, measured
  over all 3,328 world rows at three camera alignments and two buffers, and
  every interior is exact: 0.000 in astral, 0.055 in surface, 0.440 in
  topsoil. The worst step between adjacent world rows is 0.012, which is 3
  units of 255 against `abyC`.

  `17l` in `tests/visual.spec.js` asserts camera-invariance rather than the
  continuity of a frame-wide scalar, because a frame-wide scalar stopped
  describing the frame. `stats.depthTint` is gone with it; `stats.tint` records
  the alpha per screen row.

- **`npm run lint` does not catch an undefined identifier, which `CLAUDE.md`'s
  verification table says it does.** Dropping `cam` from `atmosphere`'s
  destructure in `view/scene.js` left a live `cam` reference in the machine-halo
  loop. `npm run lint` exited 0. The visual suite caught it as
  `ReferenceError: cam is not defined` in the two scenes that light a furnace,
  and `npm run check` passed too, because nothing it draws has `fire > 0.02`.
  `oxlint` with no config reports nothing for
  `export function f() { return notDefinedAnywhere + 1; }` either, so the rule
  is off rather than confused by the destructure. Either enable it in an
  `oxlint` config or correct the table in `CLAUDE.md`; both are outside this
  phase's ownership.

- **`tools/check.mjs:559`'s printed epoch is not reproducible.** Section 2
  prints `epoch ${before}` after `boot.boot(1337)` and one substep, and three
  consecutive runs at an unchanged HEAD gave 318,993 / 318,615 / 318,786. The
  assertion itself is sound -- it compares the counter across two `draw()`
  calls and that delta is 0 every time -- but the absolute number reads like a
  fingerprint and is not one, so a reviewer diffing check output will chase
  it. Something in boot writes a wall-clock-dependent number of times.

- **A viewport overhanging the world edge leaves those rows untinted.**
  `view/scene.js#depthTint` walks the bands and paints only the rows they
  cover, so screen rows above `bands[0]` or below the last band take no tint
  rect at all and read at full brightness. `shell/main.js#clampCam` keeps
  `cam.y` inside the world whenever the world is taller than the viewport,
  which it is at every shipped band configuration, so only a test that writes
  `cam.y` directly can see it. The area-weighted mean this replaced had the
  same blind spot in a different shape, normalising over covered area and so
  moving faster per camera row out there.

- **`src/rules/player.js:319` `rowBand` can now be deleted in favour of
  `model/world.js#bandSpans`.** `boxSolid`, `boxClimb` and their siblings walk
  world rows to get the seam split right, which is the same fact `bandSpans`
  returns as a per-band tile box. Not touched here — `rules/player.js` is
  outside this phase's ownership, and section 8h's motion claims are what
  would have to re-prove the refactor.

- **`npm run lint` does not catch an undefined identifier, and `CLAUDE.md`'s
  verification table claimed it did.** `oxlint` runs config-free here and its
  `no-undef` rule is off by default. Proven two ways: a file containing only
  `export function f() { return notDefinedAnywhere + 1; }` exits 0, and a
  planted `totallyNotDefinedXyz` in `src/core/font.js` is reported only when a
  config enabling the rule is passed with `-c`. `npm run check` does not cover
  the gap either — it imports every module, so a syntax error fails, but a bad
  identifier inside a function body only throws on the paths its assertions
  drive. Phase 17's tint fix hit this live: removing `cam` from
  `atmosphere`'s destructure left a stale `cam` in the machine-halo loop, both
  gates passed, and the visual suite caught it as
  `ReferenceError: cam is not defined` — only because two scenes light a
  furnace with `fire > 0.02`. `CLAUDE.md`'s table is corrected.

  The remedy, measured clean against `src`, `tools` and `tests` as of
  `73d734a`, and **not committed** because it reverses the documented
  "oxlint, no config" choice:

  ```json
  {
    "env": { "browser": true, "es2024": true, "node": true },
    "globals": { "__mf": "readonly", "__ops": "readonly" },
    "rules": { "no-undef": "error" }
  }
  ```

  `env.node` has to be global rather than an `overrides` entry for `tools/**`
  and `tests/**` — oxlint accepted the override block and went on reporting
  `process` in `tools/check.mjs`, so the narrower form does not work. The cost
  of the flat form is that a bare `process` in `src/` would go unreported,
  which is a far smaller hole than any typo anywhere going unreported.

## Wave 6, phase 6h (save and load)

- **`src/model/mining.js` has no inverse for its ledger key, so `shell/save.js`
  scans every tile instead.** `model/growth.js:79` already records the problem
  in its own header — walking a `Map` of packed `ord * 0x1000000 + idx` keys
  back to (band, tx, ty) means re-implementing the packing at the reader, which
  is wrong the first day a band's `tw` changes. `growth.js` solved it by
  carrying `ord`/`tx`/`ty` on the record and exporting `planted()`.
  `mining.js:47` stores a bare float, so the save asks `workAt(b, tx, ty)` once
  per tile in the traversal it already makes for the tile diff — 3 ms at the
  three shipped bands, and roughly 25 ms at wave 6 U3's 1,024-wide bands. An
  `entries()` query beside `growth.js#planted()` would let the save walk the
  sparse map directly and would keep one implementation of the key. Not added
  here; `model/mining.js` is only in this phase's ownership for a missing
  `write` path, and no write was missing.

- **`run.known` and `run.maxHearts` have no writer, so the save reproduces them
  rather than restoring them** (`docs/SPEC.md` §27.2). `write.reset` seeds
  `known` from every `HAND_RECIPES` id and nothing in `src/` adds to it. The
  day a source reveals a recipe or raises the heart cap, that phase has to add
  the writer *and* a line in `shell/save.js#applyRun`, or a loaded run silently
  loses the unlock. Nothing enforces the pairing.

- **`src/shell/save.js` is not in `tools/check.mjs`'s import list**, which is
  hand-written (`tools/check.mjs:93-127`). Combined with `no-undef` being off
  (see the Phase 17 note above), a typo'd identifier inside a function in that
  file is invisible to both gates. Phase 6h proved the module by executing it
  in a real browser through a throwaway Playwright script; phase 6p owns the
  committed test.

## Wave 6, phase 6c (the surface terrain heightmap rewrite)

- **`view/scene.js#drawSky:236` paints sky only down to the horizon, so a
  valley floor below `floorTy` has `INK.void` behind it and not sky.**
  `horizon = b.origin.y + floorTy * b.tile` and `y1 = min(H, horizon)`, and
  the frame's backdrop under that row is `R(g, 0, 0, W, H, INK.void)` at
  `scene.js:108` — `abyC`, `#0a0810`. Phase 6c's brief was to make air below
  `floorTy` legal by changing `view/paint.js`'s excavated test, and that half
  is done, but a `dip` on `data/world.js`'s `relief` row still renders a hard
  black band hugging every valley bottom (photographed at `dip:4`, seed 9550,
  surface column 64). `src/view/scene.js` is not in 6c's ownership block, so
  `dip` ships at 0 and `view/paint.js#excavated` keeps `ty >= floorTy` as the
  second half of a union. Whichever phase owns `view/scene.js` next should
  extend the sky ramp's last step from the horizon to the deepest row relief
  can reach (`floorTy + dip`); then deleting that one term in `excavated` and
  setting `dip` on the strata row is the whole of valleys below the datum.
  `docs/SPEC.md` §16.1 states the same in the locked numbers.

- **`tools/worldgen-check.mjs:342-350`'s relief budget is one-sided and will
  fail the day `dip` is spent.** `over = max(FLOOR_TY - RELIEF - row, row -
  (FLOOR_TY + 1))` reads `RELIEF` live off the `relief` strata row's `amp`,
  which is why it passes at `amp:10` today, but the `+ 1` lower slack is a
  leftover from the ragged lip 6c deleted. The one-line fix is to read `dip`
  off the same row and use it for the lower bound. Not taken — `tools/` is not
  in 6c's ownership block, and with `dip` at 0 the assertion is correct as
  written.

- **A standing tree trunk blocks a walk along the surface, and always has.**
  `data/substances.js:144` gives native `timber` `tile:{ solid:true }` and
  `data/world.js`'s `trees` row grows it 3 to 5 tiles up from the ground, so
  neither `rules/player.js#moveX`'s one-tile auto-step nor the hop clears one.
  Measured with the real player driven through `shell/main.js#step` at 1/120 s:
  0 of 12 seeds reach the right map edge from spawn and 1 of 12 reach the left,
  and clearing every timber tile first makes it 12 of 12 both ways. The same
  12 seeds stall at the same trunks under the pre-6c generator, so this is not
  a landform regression. Whether a tree should be a wall is a design question
  for whoever owns `data/substances.js` — felling it takes 0.35 s, so the
  answer may well be "yes, and that is the toll".

## Wave 6, phase 6j (named debug scenarios)

- **`src/model/items.js:83` — `itemsIn(r)` never re-tests the rect, so every
  catch box, carrier and belt reaches up to 32 px further than it claims.**
  `model/space.js#query`'s own header states the contract: "May visit an
  occupant whose exact position is outside `r`; callers that care re-test."
  `itemsIn` is the only caller and it does not re-test — it pushes every
  occupant of every 32 px bucket the rect overlaps. So `BUCKET` (32 px, four
  tiles), not the rect, is the real reach of `rules/machines.js#catchFalling`,
  `model/segments.js#carrierBox` and `rules/belts.js#groundBox` alike.
  Measured, this phase's `winch` scenario: a haul released at the top of an
  88 px segment comes to rest 6 px below the carrier's own box (which is 10 px
  tall, `CARRIER_GRAB` either side of a 4 px deck) — 1 px outside it — and is
  re-grabbed as cargo on the next frame because both sit in the same bucket, so
  releasing the crank carries the delivered ore back down the shaft. The fix is
  one rect test inside `itemsIn`, but it narrows every catch box in the game at
  once and would move the numbers `docs/SPEC.md` §17 and §18.3 lock (the dock's
  `catchBox.slack` of 6 is derived to 4.5 px of margin, which a real rect test
  would start enforcing). Not this phase's file and not a one-line change in
  consequence, so it is parked whole.

- **`npm run test:visual` could not be given a clean reading for this phase,
  and the reason is a shared working tree.** Phase 6c's terrain rewrite was
  mid-flight in the same checkout throughout: `src/rules/generate.js`,
  `src/data/world.js` and `src/view/paint.js` modified, `tests/visual.spec.js`
  and 113 baseline PNGs re-accepted partway through. Successive full runs
  reported 83, 82 and then 2 failures as that work landed, and the failing set
  changed between two consecutive runs with no edit of this phase's in between.
  Phase 6j is pixel-neutral by construction rather than by measurement: nothing
  anywhere in `src/` imports either of its two modules
  (`grep -rn scenarios src/` finds only the two files themselves), so neither
  reaches the shipped module graph and neither can be in the built artifact at
  all until phase 6o wires them. A sampled pixel diff was byte-identical
  (180,224 px on `surface hills`) with and without them. No baseline was
  updated here.

- **`src/rules/scenarios.js` is not in `tools/check.mjs`'s import list**, which
  is hand-written — the same gap phase 6h recorded for `src/shell/save.js`.
  With `no-undef` off (see the Phase 17 note above), a typo'd identifier inside
  a function in either file is invisible to both gates. This phase proved the
  module by applying and driving all five scenarios through the real `step()`
  loop in a throwaway script; phase 6p owns the committed test.

- **The one-line exception 6c took, declared.** `tests/visual.spec.js:2818`'s
  `click-to-arm` test hit a 16 px inventory slot with a 1 px margin, and any
  change to the `rand()` stream moved it out. `realClick` writes `cmd.mx/my`
  against the live `cam`, `shell/main.js#applyUiIntents:560` recovers the
  screen point against `drawCam` (the camera as of the last draw), and this
  scene's two teleports leave `cam.y` 300 px from its target and travelling 7
  to 14 px per substep. The fix is one `__mf.frames(240)` before the click, and
  it is neutral on the pre-6c generator (the test passes with and without 6c's
  changes). The test takes no screenshot, so it cost no baseline. A harness
  phase should consider whether `realClick` ought to write `cmd.mx/my` after
  the draw rather than before it, which would retire the whole class.

## Wave 6, phase 6r (the sky reaches the real skyline)

- **`src/data/world.js`'s relief-row comment is stale, and it is 6s's row to
  edit.** Lines 72-79 still say "`view/scene.js#drawSky` paints sky only down
  to `floorTy * tile`, so a valley floor under that row would have `INK.void`
  behind it and not sky" and point at phase 6c's entry above for what has to
  land first. Both passes now read `view/paint.js#skyBottomTy`, so the comment
  describes behaviour that no longer exists. `src/data/world.js` is outside
  6r's ownership block and 6s owns the `dip` value on that same row, so the
  correction belongs in the commit that spends it.

- **`tools/worldgen-check.mjs:342-350` is now the last thing in `dip`'s way.**
  Phase 6c parked the one-line fix above: `over = max(FLOOR_TY - RELIEF - row,
  row - (FLOOR_TY + 1))` reads `RELIEF` off the relief row but hardcodes `+ 1`
  of lower slack. Measured at a temporary `dip:4`: `npm run check:worldgen`
  reports 159 failures over 200 seeds, every one of the form "column 75 at row
  23 is 2 tile(s) outside [floorTy-10, floorTy+1]", while `npm run check`
  itself passes clean — the relief budget lives in the worldgen tool, not in
  `check.mjs`. `tools/` is outside 6r's ownership block too, so it goes with
  6s.

- **The per-column skyline query the brief asked for is measurable waste, and
  the measurement is why this phase did not write one.** Below the horizon the
  sky ramp is a single tone, so run-length encoding a skyline there trades one
  full-width rect per band per frame for one rect per run of equal ground
  height, and buys back only fill area that opaque rock covers anyway. Above
  the horizon a per-column skyline would stop painting sky behind a hill —
  also invisible, because `paintTile` fills every solid tile opaquely and
  `chunkCanvas` paints a first-sight chunk regardless of `REPAINT_BUDGET`.
  Neither variant can change a pixel, and `npm run check`'s `fillRect` total
  is 1,344,909 before and after this phase, so the version that ships is the
  one that adds no call at all: one rect from the horizon to `skyBottomTy`,
  zero rows tall while `dip` is 0.

- **`view` cannot tell a valley from a hand-dug shaft, so `excavated` cannot
  become the pure sky test.** Both are one sky-exposed column, and no `model`
  query records the height map `rules/generate.js#heightmap` started from — the
  tile grid is the only source of truth for terrain (invariant 1) and it holds
  the terrain as it is now. So the union stays and its depth term moves from
  `floorTy` to `skyBottomTy`, which is the relief envelope rather than the
  datum. Photographed at a temporary `dip:4`, seed 1337: the valley at column
  17 reads as sky where it wore a black band before, a 2-wide shaft at column
  30 reads as a lit hole with a daylit collar over its top two rows, and the
  tunnel driven sideways into the hilltop at column 76 is still a cavity. A
  phase that wants a quarry open to the sky needs `model` to remember the
  generated ground row per column; nothing needs that today.

## Wave 6, phase 6k (tree farming compounds)

- **THE ONE-LINE EXCEPTION THIS PHASE TOOK.** `tools/check.mjs:6076` asserted
  `seeds !== 1` with the message "eff('seedYield') is 1", so the harness pinned
  the very tunable this phase exists to raise and `npm run check` failed on a
  correct `seedYield` of 2. It now reads
  `wantSeeds = Math.max(0, Math.round(mods.eff('seedYield')))`, which is the
  same arithmetic `rules/mining.js:297` does, and the passing message prints
  the value instead of the word ONE. `tools/` belongs to phase 6p; this is the
  repo's one allowed zero-risk fix, because the phase cannot meet its own
  definition of done without it. The probe's other two assertions — three
  tiles came down, and nothing dropped before the last one — are untouched.

- **`src/data/forms.js:346` says a seed is 0.035 T. It is 0.08 T.**
  `model/items.js:44#massOfPair` is `SUB.timber.item.mass` 0.8 ×
  `FORM.seed.massK` 0.1. The 0.035 figure is `timber`'s `tile.hard` 0.35 read
  in place of its item mass. `docs/SPEC.md` §22.2 carried the same number and
  is corrected in this commit; `data/forms.js` is outside this phase's
  ownership block. Nothing computes from the comment, so no behaviour moves.

- **`docs/PLAN-phase15-trees.md` §D15-E is now stale in two ways.** Line 336
  still tables `seedYield` at 1, and line 368 calls 180 s "about two cycle-2
  deadlines' worth of an eighth" — a quarter of 480, where the ratio is three
  eighths. `docs/SPEC.md` §22.1 holds both corrected. A plan document
  describing what a phase intended is allowed to age, but the arithmetic error
  was copied forward into `data/tuning.js`'s own note, which is the reason to
  record it.

- **After 6e widens the bands to 1,024 columns, wild trees alone clear the
  attention ceiling.** `data/world.js`'s `trees` row at `chance:0.06` put 12,
  6 and 5 trees on the 128-column surface band at seeds 1337, 7 and 424242, so
  1,024 columns implies roughly 40–96. §22.1 derives the grove a player can
  actually keep felled and replanted at about 30 trees. So at the new width the
  compounding `seedYield` 2 buys is no longer what gets a player their first
  grove — it is what gets them a grove *where they want one*, next to the
  furnace rather than wherever worldgen put a tree. Worth a look from whoever
  re-tunes `chance` at the new width; nothing is broken today.
