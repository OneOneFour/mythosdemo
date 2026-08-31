# Findings

Where a phase agent parks something outside its own scope. `file:line`, one
line of reason, and which phase (if any) should pick it up. Append; do not
rewrite history here.

---

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
