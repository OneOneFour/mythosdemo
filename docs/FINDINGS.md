# Findings

Where a phase agent parks something outside its own scope. `file:line`, one
line of reason, and which phase (if any) should pick it up. Append; do not
rewrite history here.

---

## Phase 5a review (orchestrator)

- **`oxlint` is not a declared `devDependency`.** `package.json#scripts.lint`
  runs `oxlint src tools tests` directly (not via `npx`), and it currently
  passes only because an earlier ad hoc install left a binary in
  `node_modules/.bin`. First flagged in Phase 3's own report (`npx oxlint`
  resolving without an explicit dependency) and reconfirmed at Phase 5a's
  review. A genuinely fresh `npm install` on a clean checkout would fail
  `npm run lint`. Pick up in **Phase 6**, which owns `package.json`'s
  scripts/dependency hygiene as part of harness work — add `oxlint` to
  `devDependencies` at whatever version is currently in use (`1.80.0` as of
  this writing).

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

- **`'i'` now does two things (`flags.showInv` AND `shell/ui.js#toggle('main')`),
  and only the first has ever been visible.** See `src/shell/input.js`'s own
  comment at the `'i'` handler. This phase could not retire `flags.showInv`
  without breaking the 1-9 build-menu digits, which are gated on it
  (`src/shell/input.js` lines below), and breaking that would be a gameplay
  regression outside "infrastructure only." Phase 5b, once its tabbed window
  reads `isOpen('main')`, should decide whether the build menu migrates onto
  the new panel too or `flags.showInv` stays a second, permanent system.

## Phase 5b (the panels)

- **RESOLVED, the question the last bullet above left open.** `'i'` toggles
  `flags.showInv` and `shell/ui.js#toggle('main')` TOGETHER (unchanged), so
  the old text panel (`view/hud.js#invPanel`) and the new tabbed one always
  opened at once and drew directly on top of each other — confirmed by
  screenshot, not assumed. `view/hud.js#drawHUD` now gates the OLD panel on
  `!f.ui.stack.includes('main')`, so it only ever draws if the new one is
  somehow closed while `flags.showInv` stays true (Escape closes `'main'`
  via `closeTop()` without touching `flags.showInv` — a real, if minor,
  desync; pressing `'i'` twice resyncs both). The OLD panel's POCKETS and
  CRAFT sections are superseded by the new CHARACTER and CRAFTING tabs; its
  BUILD section (the only thing with no new equivalent) was ported into the
  new LOGISTICS tab (`view/ui/mainPanel.js#drawLogisticsTab`), reading the
  SAME `model/run.js#buildableMachines()` list `shell/input.js`'s 1-9 digit
  handler already keys off, so the digits keep working and keep a visible
  menu. `flags.showInv` itself is untouched — it is still the digit gate —
  only its own TEXT PANEL stopped drawing.

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

- **The three Tier 3 flows that place a machine, craft by hand, or drop
  material all needed real fixture debugging before they measured anything
  true, none of it a game bug.** Kept here because each is the exact
  "measures the wrong thing" trap CLAUDE.md warns about, caught only by
  actually reading what the state showed rather than trusting a plausible
  assertion:
    - The furnace flow's ingot count was rounding to 12 ore + 6 log which is
      the furnace's OWN build cost (`docs/SPEC.md` section 13) — there was
      nothing left to actually smelt once the bill was paid. Fixed by giving
      more than the bill.
    - The furnace flow's ingot then never reached the pockets because
      `rules/machines.js#produce` ejects a finished good from the machine's
      OWN mouth (the furnace's `top` port), which rests near the footprint's
      CENTRE — while the player who placed it is standing at the SIDE (per
      `rules/mining.js#aimAtKeys`'s "aim to the side" resolution with no
      up/down held), outside `eff('pickupR')` (10 px). Fixed by moving the
      player under the machine's centre after placing it, the same thing a
      real player would do to hand-feed or collect from what they just
      built.
    - The drop/climb flow's shed-then-reabsorb cycle: dropping material at
      the player's own feet and never moving away means anything given time
      to clear `rules/items.js#MAGNET_DELAY` (0.35s = 42 substeps) gets
      picked right back up. Fixed by shedding in a burst tighter than that
      window, with margin, since the immediately-following climb check
      itself runs long enough to cross the delay and reclaim a few units.
    - The craft-queue flow over-crafted (7-8 completions instead of 5) when
      driven as ONE `__mf.frames(1400)` call: `shell/main.js#tickCraftQueue`
      only drains what it can see in the journal SINCE THE LAST call, once
      per real animation frame in actual play, so a single giant batch holds
      `cmd.craft` continuously for the whole window regardless of how many
      times the queue should already have emptied. Fixed by ticking in small
      batches, the faithful stand-in for "once per real frame".

- **The phone project's screenshots are already blank in this sandbox,
  before and after this phase.** Every `phone` baseline this phase added
  (`shaft-*`, `ui-*`) hashes byte-IDENTICAL to the pre-existing, already-
  accepted `surface-phone-darwin.png` — a solid black canvas with only the
  DOM key-hints bar visible underneath it. This is a pre-existing
  characteristic of running this suite's `phone` project (390x844, per
  `playwright.config.js`, not the 200x422 figure an earlier draft of the
  build plan assumed) in THIS headless environment, not something Phase 6
  introduced: it reproduces on the ALREADY-COMMITTED `surface.png` baseline
  too. `maxDiffPixels: 0` still does its job either way (a future change
  that actually fixed or further broke phone rendering would move at least
  one of these bytes), but the phone screenshots are not currently proving
  anything about canvas CONTENT the way the desktop ones do. Not fixed here
  — out of this phase's scope (a rendering/environment question, not a
  harness-assertion one) — but worth a human's attention before trusting a
  phone screenshot diff at face value.

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
