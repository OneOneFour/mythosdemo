# Review — Phase 4 (the four modifier tiers, D1 migration)

**Verdict: pass.** The most structurally significant phase so far, and it held
up under direct inspection, not just the agent's report.

## The rename, isolated and verified

`3b83bfb` is a clean, standalone commit — confirmed `npm run check` passes
with 0 layer violations immediately after it, before any new content exists,
proving the rename really was behaviour-neutral rather than bundled with new
functionality that happened to also work.

## Key bindings — independently re-derived, no collisions

Reproduced the full key table directly: `t`/`b`/`k`/`y` are the four
debug-only grant drafts (trinket/timed-boon/machine-grant/miracle), all behind
`flags.showDebug`; `v` (use miracle) and `p` (equip trinket) are real, ungated
actions; `q` (drop, Phase 2a) and `backspace` (deconstruct, Phase 3) remain
undisturbed. No collisions with the existing `w a s d g c h i o m r f l 1-9`
set. `b` binding to the timed-boon draft (not the machine-grant draft) is the
more sensible pick given D1's vocabulary — "boon" now means the timed tier by
definition, so `b` continuing to mean that reads correctly to anyone who
already knows the key.

## Both conflict-resolution modes shipped as real, checkable content

Read `data/boons.js` directly. `poseidon-flood` (suppress) vs
`hephaestus-forge` is `docs/DESIGN.md`'s own named example, not a generic
placeholder. `ares-frenzy` (invert) vs `athena-focus` is a genuine trap per the
row's own math: `pickPower` `add:0.2` reads as a plain buff in isolation, but
inverting Athena's `mul:1.25` to `0.8` while both are active nets *worse* than
holding neither — exactly the "some gifts are traps" line from `docs/DESIGN.md`
made mechanical rather than asserted. Both resolution branches are therefore
exercised by real content, not just implemented and left untested.

## The trinket-equip semantics change was caught by an EXISTING probe, correctly updated

`tools/check.mjs`'s own trinket behavioural checks now read "rate 1 -> 1.25
once equipped" and "spending the relic restores the base value and clears the
slot" — the probe text changed because the mechanic it tests changed (a held
trinket no longer auto-applies; it must be equipped). This is in-scope
maintenance of an existing check under Phase 4's own ownership of
`tools/check.mjs`, not a new deviation, and it's the right instinct: updating
the assertion's *behavior*, not just relaxing it to keep passing.

## Deviations

The one new `data/substances.js` row (a miracle needs an element, per the
substance/form rule) follows the exact precedent Phase 2b's `run.brandLeft`
set for "the phase's own spec requires content structurally impossible to
place inside the stated ownership block" — correctly flagged rather than
smuggled in silently. `data/drops.js`'s tribute-triggered row being
data-ready-but-unconsumed (tribute completion isn't a real event yet) is
honestly reported rather than faked with a stub trigger — the right call,
since a fake trigger would be exactly the kind of "half-finished
implementation" CLAUDE.md's own working style warns against.

## Checks reconfirmed independently

`npm run check` (154 checks, 0 violations) and `npm run check:content` (same
count standalone) both re-run here after both commits, both green.

No unexplained scope violations: diff matches the FILE OWNERSHIP block plus
the one documented, precedented exception.
