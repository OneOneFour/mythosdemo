# Review — machines become craftable/holdable items (Agent 2a)

**Verdict: pass.**

## Concurrency handling — verified clean

`git status` after this agent's commits shows only `src/view/hud.js` modified
(uncommitted) — the HUD-simplification agent's own in-progress work, exactly
as it should be. `git stash list` is empty, confirming no leftover stash from
the isolation dance the agent describes. `npm run check`, `check:content`
(157 checks), and `lint` all still pass with the two agents' work coexisting
(one committed, one still uncommitted in the working tree) — no interference
between them.

## The belt_r/belt_l facing resolution is the right reuse, not a new mechanism

`machineIdFor()` (`model/run.js:278`) resolves a held mirrored-pair substance
to its concrete left/right id off `player.face` — read directly, and it does
reuse the *exact* existing directional convention `belt.dir`/`mine.facing`
already carry, rather than inventing new placement UI. This was the correct
call given the recipe-tie constraint the agent identified (a `belt_r`-only
and `belt_l`-only recipe would be bit-identical inputs, which
`rules/crafting.js#choose()`'s first-match rule can never disambiguate) —
applying the same fix uniformly to `talos_head`/`cyclops_maw`'s own mirrored
pairs rather than a one-off special case is the right level of generality.

## The `kiln_divine` gap is a pre-existing content hole, correctly surfaced rather than papered over

`kiln_divine`'s cost bill is bit-identical to `furnace`'s with no quantity
difference to break the tie, so it gets no substance/recipe and stays
grantable-but-unplaceable. This isn't a regression this change introduced —
`kiln_divine` was already the single most vestigial piece of content in the
game (Phase 4's review already noted the machine-grant tier has essentially
no real content). Correctly documented in `docs/FINDINGS.md` rather than
forced into an awkward special case to make it superficially placeable.

## The tile-byte headroom is now the tightest constraint in the whole codebase — flagging loudly

**Only 2 substances of headroom remain** (down from 19 after Phase 1, 14
after Phase 2a, 13 after Phase 2c) — this change alone spent 11 of the
remaining 13 by adding one substance per machine plus the `rig` form's own
STRIDE cost. Any future work that wants a new substance (the `docs/FINDINGS.md`-recorded
"essence" tier for repricing the hearth, any new trinket, boon, or miracle
substance, a T5 mining tier, etc.) needs to know this budget is nearly
exhausted and plan around it — likely by increasing `BEDROCK`'s effective
range or reconsidering whether every machine truly needs its own substance
row versus a shared mechanism. This is worth surfacing to the user directly,
not just left in `docs/FINDINGS.md` for someone to discover mid-implementation.

## Checks reconfirmed independently

`npm run check`, `npm run check:content`, `npm run lint` all re-run here
against the current mixed state, all green. Full `npm run test:visual` not
re-run in this pass since the working tree currently mixes this agent's
committed work with the HUD agent's still-uncommitted changes — will re-run
once both land, against the true final combined state.

No unexplained scope violations: `src/view/hud.js` was correctly left
untouched per the concurrent-edit detection, and the diff otherwise matches
the FILE OWNERSHIP block.
