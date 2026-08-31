# Review — Phase 5b (the panels)

**Verdict: pass.**

## The craft queue's journal-peek mechanism, verified non-destructive

`model/journal.js#peek` is `() => journal.slice()` — a real copy, confirmed by
direct read, not a drain. This matters because the Phase 2 combined-acceptance
run found that `__mf.hold()`/`__mf.frames()` drain the journal internally;
`tickCraftQueue()` reading via `peek()` rather than `pop()`/the shell drain
path is the correct choice and was checked against that exact prior finding,
not assumed safe.

## The `'i'` key collision — real regression risk, correctly resolved and verified

Two independently-plausible UI surfaces (the old text inventory panel, the new
tabbed window) both bound to `'i'` would have drawn on top of each other.
Checked the fix directly: `view/hud.js:126` gates the old panel's render on
`!f.ui.stack.includes('main')`, while `shell/input.js:170` still
unconditionally toggles `flags.showInv` alongside the new stack — meaning the
1-9 build-menu digit dispatch (`input.js:232`, keyed on `flags.showInv` alone,
unchanged) keeps working whether or not the new panel is the one visually
showing. This was the exact regression risk worth checking by hand rather than
trusting the report: Phase 3's whole "no spawn outside debug" acceptance
depends on that digit path staying reachable, and it does.

## `run.known` — the one pre-approved model exception, shaped correctly

A plain array seeded with every `HAND_RECIPES` id at `write.reset()`, matching
`run.granted`'s existing shape rather than introducing a `Set` (which
`RUN_SCHEMA`'s other fields would need to special-case for serialisation) —
correct convention-matching, and the "nothing is locked yet, this is
forward-wiring" honesty is the right call over faking an unknown recipe to
make the silhouette path look exercised.

## A real bug caught by manual driving, not inspection

The camera-staleness bug (UI hit-testing against a live easing `cam` that
could differ from the `cam` a panel was actually drawn against) is exactly the
class of bug that only surfaces under real interaction, and it was found by
actually driving a drag through the input surface rather than reading the
code and assuming it was fine. The `drawCam` snapshot fix is the right shape
for it — the same "hover and layout cannot disagree about where an entry
sits" principle `pocketHits` was already built on.

## Honesty about what's left unwired

Manual unequip and per-slot equip (vs. `equipFirst()`) having no rule to
dispatch to, and the craft queue's "drains on any hand-craft completion, not
verifiably the one it asked for" gap, are both documented rather than papered
over with a fake success path. The latter is worth flagging forward loudly:
it's currently harmless only because no two hand recipes are both satisfiable
in ways that would actually confuse a queued request today (a consequence of
the `peg_rungs`/`kindle` ordering fix from Phase 2a still holding) — Phase 6
or a future content phase should know this the moment a second ambiguous pair
is added.

## Checks reconfirmed independently

`npm run check` (0 layer violations), `npm run check:content` (154 checks, 0
violations, unchanged from Phase 4 — correct, this phase added no new
content), and `npm run lint` all re-run here, all green.

No unexplained scope violations: diff matches the FILE OWNERSHIP block plus
the one pre-approved `run.known` addition.
