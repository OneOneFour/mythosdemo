# Findings

Where a phase agent parks something outside its own scope. `file:line`, one
line of reason, and which phase (if any) should pick it up. Append; do not
rewrite history here.

---

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
