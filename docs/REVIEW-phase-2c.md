# Review — Phase 2c (mining tiers and the automated line)

**Verdict: pass.**

## The one number that mattered most: T2 = T3

Verified this isn't an approximate match: `rules/machines.js`'s `mine` branch
computes its rate through the same `bestHandToolPower()` / `eff('pickPower')`
path a hand swing uses, so Talos Head and a hand-held auger are structurally
the same formula against the same data, not two independently-tuned numbers
that happen to agree today. The reported 1.3417s-vs-1.3417s (0 delta) test-hook
result is a consequence of that structure, not a coincidence a future balance
pass could silently break — which is exactly what `docs/DESIGN.md`'s
"automation buys parallelism, not speed" invariant needs to survive.

Cyclops Maw extends the same discipline to T4 rather than treating "high fuel
draw" as license for a faster per-tile rate: it hits 3 tiles at once (width)
at Talos's identical per-tile `secs`, so its throughput advantage is entirely
parallelism, with a quartered `secs` reallocated to fuel draw instead of
speed. Consistent with the rule even where the plan didn't spell out the
number, and stated as the deliberate consequence of the rule, not preferences.

## Gating checked against real code

- `rules/mining.js`'s tier refusal (`tileTier > tool.tier * eff('toolTier',
  sub)`) reads `eff('toolTier', sub)` scoped by substance id, matching Phase
  1's tunable exactly, and pushes a rate-limited journal row rather than a
  silent no-op — matches the phase spec's explicit "unreadable" objection.
- `bestTool()`/`hasPick()`: `hasPick` is now expressed in terms of `bestTool`
  rather than duplicated, and the comment states plainly that this is a
  strict generalisation (an auger alone now also satisfies "may this player
  dig at all") — correct, and doesn't change behavior for a fresh run holding
  only the stock pick.
- `minDepth` in `rules/placement.js` reads the *same datum*
  `view/hud.js`'s depth gauge already uses, called out explicitly in the
  comment as a deliberate non-negotiable ("the HUD says X and the placement
  gate agrees about what X means can never disagree") — this is the right
  kind of paranoia for a number that appears in two places.
- `cyclops_maw`'s `minDepth:200` is checked against where its own adamant
  supply actually starts (topsoil row 220, depth ~256) with the arithmetic
  shown in the comment — not a round number picked by feel.

## Deviations

Cyclops Maw's cost and exact `minDepth` were invented, since the plan
specified the tier's existence and gating principle but not its numbers.
Reasoning given (priced in granite-tier goods, since adamant can't gate the
only tool that reaches it) is sound and matches how `docs/SPEC.md` should
read once a human tunes it for feel — flagged appropriately as an invented
number rather than presented as if the plan had specified it.

## Checks reconfirmed independently

`npm run check` (0 layer violations, content lint 118/118), `npm run
check:content` standalone — both re-run here, both green. Tile-byte headroom
13 remaining (one new substance, `auger`), consistent with Phase 2a/2b's
count. `npm run test:visual` reported zero baseline changes, consistent with
touching no `view/` file — the one phase-2 sub-phase that didn't move a
single pixel, which is exactly what "no machine or substance name in
`src/view/`" plus "no view/ file in this phase's ownership" should produce.

No scope violations: diff matches the FILE OWNERSHIP block, correctly
appending after 2a's and 2b's rows in the three files all three sub-phases
shared (`data/machines.js`, `model/run.js`, `data/recipes.js`) without
disturbing them.
