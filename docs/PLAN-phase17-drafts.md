# Plan — the real 1-of-3 draft (Phase 17)

Extracted from `docs/PLAN-phase16-interaction-model-v2.md` §7.3 before that
document's own trim, because this is the one piece of unshipped work inside
any of the shipped phase plans and would otherwise have been destroyed along
with the scaffolding around it. `docs/PLAN-phase13.md` §7 first parked this
call: *"Throughput/rate demands and a real 1-of-3 draft are both genuinely
the next thing the loop wants after 13d, and both need content and a UI
surface rather than a fix. They belong in their own plan."*

**Status: unbuilt.** Nothing below has landed. This is a plan, not a record.

## Why this is its own phase

Bigger than a targeted fix, and a *different kind* of work (content
authoring plus a new modal) from anything in the interaction-model or
tribute-loop waves (a handful of targeted fixes each). Folding it into either
would have broken both documents' scope discipline.

## What a real 1-of-3 draft needs

**Content.** Enough rows to construct an offer in three of four gift tiers:
`data/grants.js` has 1 row today, `data/trinkets.js` has 1, `data/miracles.js`
has 1. `data/boons.js` has 5 and is fine. Getting each of the other three
tiers to a plausible 1-of-3 choice is a content-authoring job with a
mass-conservation and selector-reachability cost (`tools/content.mjs`
assertions 11-13), not a UI job. Size this half honestly: it is probably
larger than the UI half below.

**A modal.** A new `ui.stack` entry — which `shell/ui.js`'s own header was
explicitly built for ("`ui.stack` is a STACK, not a single id, so a future
modal... can sit on top of the tabbed window") — a new `view/ui/` file, and a
new dispatch branch in `shell/main.js`. Also a decision about whether the
draft pauses the run: `flags.showMap`'s freeze (`shell/main.js` returns
early from `step()` while the map is open) is the precedent for "yes,
pause"; `view/ui/mainPanel.js`'s own header is the counter-precedent (the
main tabbed panel deliberately pauses nothing). A draft that interrupts a
frozen crank mid-turn is a different feel from one that does not; decide
which before building either.

**A bug fix.** Cycle 4's trinket draft is a guaranteed no-op today:
`data/drops.js#tribute-bellows` hands `bellows` over at cycle 1 with
`chance:1` (verified still true, September 2026), so `rules/trinkets.js`'s
own `draftable()` — the same "grants not yet taken" shape every tier's
draftable uses — is empty by the time cycle 4 asks. A real 1-of-3 draft
needs a trinket pool deep enough that at least one offer is still real that
late, or the draft UI itself needs to degrade honestly (fewer than three
options, or a different tier entirely) rather than silently offering
nothing.

## Scope note

This document does not re-litigate anything already decided elsewhere:
CLAUDE.md D1's four-tier vocabulary, the `model/mods.js` modifier pipeline,
and the existing per-tier `draftable()`/`grant()` shape are all load-bearing
and unchanged by this work. This phase adds content rows and a UI surface on
top of them, nothing structural underneath.
