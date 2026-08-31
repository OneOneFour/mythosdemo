# Review — quickbar digit selection, retiring the stale BUILD menu

**Verdict: pass.**

## The retirement was thorough, not partial

The agent traced `buildableMachines()`/`canAfford()`'s only remaining caller
and removed all four downstream call sites (input digit handler, LOGISTICS
BUILD rows, the old text-panel BUILD section, `buildGhost`'s BUILD-hover
branch), then followed the thread further to genuinely dead infrastructure
that existed only to serve the LOGISTICS click (`uiHitButton`/`btnHit`,
`drawn.buttons`, `wants.machine` with no setter left) — this is the right
depth of cleanup for a retirement, not a surface-level key rebind that leaves
orphaned code for someone else to find later. Confirmed `npm run lint`
(which catches unused/undefined identifiers) stayed clean through the
removal.

## Digit-to-slot wiring reuses the drawn glyph map, not a parallel one

`quickbar.js#slotForDigit` is described as "the deliberate inverse" of the
same file's own digit-glyph rendering map — checked this is the right
discipline (the same "one implementation, two readers" rule this codebase
applies everywhere else), since a hand-maintained second mapping is exactly
how "press 3, but slot 3 shows something else" bugs get introduced later.

## Guard conditions match the existing click-to-arm precedent

The digit press only arms a slot when the pair is still held AND actually
placeable (tile-capable or a `rig`) — mirrors the existing click-to-arm
guard in `shell/main.js` rather than a second, possibly-divergent check.
Empty/stale digits are confirmed silent no-ops, not spurious journal rows.

## Test coverage matches the new reality, not a patched-up old one

The retired LOGISTICS-BUILD-click test was removed outright (correct — its
target no longer exists, and a test asserting a deleted mechanism is worse
than no test) rather than awkwardly repointed. The new digit-disambiguation
test (arm slot 3, confirm the RIGHT item places, confirm the untouched
item stays untouched) is a real, meaningful assertion, not just "the key does
something."

## Checks reconfirmed independently

`npm run check` (0 layer violations), `npm run check:content` (157 checks),
`npm run lint`, and the full 48-test suite all re-run here, all green.

This closes out the quickbar gap the user asked about, and with it the full
arc of this session's post-launch fixes (UI interaction bugs, machines as
craftable items, machine status/right-click-deconstruct, the digging-stall
fix, and now the quickbar). No unexplained scope violations.
