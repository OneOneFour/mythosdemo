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
