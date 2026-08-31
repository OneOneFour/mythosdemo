# Review — click-to-arm placement and grant-tier lock gating (Agent 2b)

**Verdict: pass**, with one commit-hygiene note and one leftover-display gap
flagged for later cleanup.

## Git history check — not corrupted, just mislabeled

The agent's own report flagged that its work landed under a commit titled
"no phone support" it didn't recognize authoring. Investigated directly:
`git reflog` is clean and linear, no rebase, no lost commits — `ec845f5`
(the actual phone-removal commit from the prior task) still exists exactly
where expected. `921ac18` ("no phone support") is a real, single commit
whose diff (`src/model/run.js`, `shell/{input,main,ui}.js`,
`view/{hud,ui/mainPanel,ui/quickbar,ui/slot}.js`, `tests/visual.spec.js`, one
baseline) matches exactly what this agent describes building. **This is a
mislabeled commit message on otherwise-correct, otherwise-intact work** —
not corruption. Left as-is per this repo's "never amend without an explicit
request" rule; flagged to the user for a quick fix if they want one.

## Lock-gating logic, read directly

`model/run.js#machineOutputOf`/`isKnown` — a recipe is known if its id is in
`run.known` AND (it's not a machine-build recipe, or the target machine
passes `canPlace`). Confirmed the reasoning: this narrows the existing
"everything seeded known" behavior only for machine recipes, exactly as
scoped, and reuses `canPlace` (the same check `placementCheck` already makes)
rather than a second grant check.

## A leftover from the machine-items change, now visible

`model/run.js#buildableMachines()` (feeds the old digit-key BUILD menu and
the LOGISTICS tab's BUILD-row list) still reads `def.cost`/`canAfford(def.cost)`
— but Agent 2a's earlier change deleted `cost` from every `data/machines.js`
row, so `def.cost` is now always `undefined` and `canAfford(undefined)` is
always `true` (the exact "free furnace" shape from before Phase 3, just
relocated). **This is not a functional bug** — `placementCheck` is still the
real gate and still correctly refuses a placement with no held `rig` item —
but the legacy BUILD list now always displays every granted machine as
"affordable" regardless of whether the player holds one, which is misleading
now that the click-to-arm-from-inventory flow is the intended path. Recorded
here rather than fixed inline, since the cleanest real fix is probably
retiring the digit/LOGISTICS-BUILD path entirely (it's fully redundant with
"hold the item, arm it, place it" now) rather than patching its stale
affordability math — a design call worth making deliberately, not as a
drive-by.

## Checks reconfirmed independently

`npm run check`, `check:content` (157 checks), `lint`, and the full
Playwright suite (46/46, desktop-only) all re-run here, all green, including
both new tests (furnace success/fail via click-to-arm, dig-then-restore).
