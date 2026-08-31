# Review — Phase 5a (the GUI widget layer)

**Verdict: pass.**

## No view->shell edge — verified, not just asserted

The layer-safety concern this phase was most likely to trip was checked
directly: `src/view/ui/*.js` contains no import of `shell/ui.js`; the
`cmd.uiClick`/`uiRight`/`uiCtrl`/`uiShift`/`uiWheel` fields live on the
existing `cmd` object in `shell/input.js`, set there and read by `shell`'s own
dispatch — `view` only ever reports rectangles (`view/ui/state.js`'s
"drawn" registry, the `pocketHits` idiom extended), it never reads `ui.js`
directly. `npm run check` section 0 (0 layer violations) and section 2 (0
model writes across two renders) both re-run here, both still green.

## `__mf.ui` — read directly, confirmed a real projection

`shell/main.js:320`'s `get ui()` composes `shell/ui.js`'s live session state
with `view/ui/state.js`'s live drawn geometry on every read, spreading (not
referencing) nested objects — matches the "rebuilt each draw, never a cached
copy" requirement literally, not just by convention.

## Self-caught bugs during the phase's own verification

`grid.js` clamping reported width while still looping the full requested
column count (so slots could paint past the reported/viewport bounds) and the
matching `tabs.js` overflow fix are exactly the kind of bug a throwaway
verification harness exists to catch before it ships — good that both were
found and fixed within the phase rather than left for Phase 5b or 6 to
discover the hard way.

## Key decision: reusing `i` rather than migrating it

Correct call — retiring `flags.showInv` would have broken the 1-9 build-menu
digit path (a real gameplay regression, not a UI nicety), which is exactly the
kind of adjacent-file collateral damage this whole build plan's phase
separation exists to avoid. Making `i` inert-but-present until Phase 5b reads
`isOpen('main')` is the right amount of infrastructure-only restraint for this
phase.

## A pre-existing gap, not a regression

`oxlint` is invoked by `npm run lint` but isn't declared in
`package.json#devDependencies` — Phase 3's own report already flagged this
same gap (`npx oxlint` resolving without an explicit dependency). Confirmed
here that `npm run lint` currently exits 0 in this environment (oxlint is
present in `node_modules/.bin` from an earlier ad hoc install), but a genuinely
fresh `npm install` on a clean checkout would fail this script. Not
introduced by this phase and not blocking, but worth a one-line fix — flagged
for Phase 6, which owns `package.json`'s scripts and dependency hygiene as
part of harness work.

## Checks reconfirmed independently

`npm run check` (0 layer violations) and `npm run lint` (exit 0) both re-run
here. Zero visual baseline changes, consistent with no panel opening by
default — the correct outcome for an infrastructure-only phase, unlike prior
phases where a rendering change was an expected consequence.

No scope violations: diff matches the FILE OWNERSHIP block.
