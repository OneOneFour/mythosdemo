# ADR 0001 — exempt each hub's own footing tiles from the segment clear-path sweep

Extracted from `docs/PLAN-phase10.md` §2.6 (the defect) and §3.1 D-A (the
decision), once segment transport shipped. `docs/adr/` did not exist before
this file; CLAUDE.md has named it as the home for irreversible technical
decisions since before there was one to put here.

## Context

A straight vertical link between two legally-placed hubs was, before this
fix, **impossible**. A hub's anchor sits at `box.x + w/2, box.y + h/2`
(`model/segments.js#geometryOf`), which for a 2x2 footprint is exactly on a
column boundary and exactly on a row boundary. `solidNear` samples **both**
tiles sharing a boundary-exact coordinate (correct behaviour, fixed for a
different bug in commit `b48203d`). Every legally-placed hub has at least one
solid tile directly beneath its footprint (`footing:1`,
`model/run.js#placementCheck`). A span rising from the hub below terminates
at the upper hub's anchor, which is *inside* its own footprint — so the span
necessarily passes through the upper hub's own footing row, and `solidNear`
sees the footing tile in *either* column.

Measured (seed 1337, flat ground at surface `tx 40`, ground row 20, two hubs
exactly 12 tiles apart — the reach limit):

| upper hub's footing tile | `linkCheck` |
|---|---|
| none at all (placed with no footing) | `{ok:true}` |
| under its LEFT column | `{ok:false, why:'THE PATH IS BLOCKED'}` |
| under its RIGHT column | `{ok:false, why:'THE PATH IS BLOCKED'}` |
| under both columns | `{ok:false, why:'THE PATH IS BLOCKED'}` |

This is `docs/SPEC.md` §17.2's `footing:2` defect recurring at `footing:1`,
because boundary-exact sampling checks both columns instead of whichever
`Math.floor` happened to favour. Reducing `footing` from 2 to 1 fixed the one
instance the earlier bug hit; it did not fix the class of defect.

It was invisible to the test harness for exactly the reason an earlier phase
missed the original: the harness placed hubs through the raw model writer,
which asks nothing about footing, so no footing tile existed in any scene and
every vertical link passed. A full search over nearby offsets and both
footing columns, with placement legality checked for real, found that a
chain **could** climb, but only by leaning one or two columns sideways per
stage with the footing tile on the *far* side of the lean — and that lean
was not even enough to reach a dock on the Heavens' floor from the surface
band. The acceptance walkthrough this was building toward was not
performable.

## Decision

**Exempt each segment endpoint's own footing tiles from the clear-path
sweep.** In `sweepSpan`, skip solidity for a sample that lies within an
endpoint hub's own footprint columns, at or below that endpoint's anchor,
down to footprint-bottom + 1 row (`headframe(m)` in `model/segments.js`).

Four options were considered:

| option | change | cost |
|---|---|---|
| **exempt each endpoint's own footing tiles from the sweep (chosen)** | skip solidity for a sample within an endpoint hub's own footprint columns, at or below that endpoint's anchor, down to footprint bottom + 1 row | ~10 lines in `model/segments.js`, one SPEC §17.6 amendment. A 2-tile blind spot directly under each endpoint |
| move the anchor off the footprint centre (e.g. a `hub.mouth` offset) | breaks SPEC §17.5's locked anchor, moves every carrier, churns every drivetrain-era screenshot baseline |
| accept it and teach the lean (content + a callout) | the most obvious build (stack hubs straight up) always refuses, and the refusal points at a tile the player deliberately placed as the hub's own floor — a legibility disaster |
| `footing:0` on hubs | hubs float anywhere; kills the "a headframe straddles the shaft mouth" reading SPEC §17.2 argues for |

The chosen exemption is defensible on the same ground `model/segments.js`'s
own anchor-geometry comment already stands on: the anchor is *inside* a
footprint `placementCheck` has proved clear, and the footing tile is what
makes that footprint legal in the first place. The cable visibly leaves the
headframe, and a headframe straddles its own floor by construction. The
blind spot is exactly the footing row's tiles under each endpoint, both
immediately under a machine, and it cannot hide a meaningful obstruction
because the footprint above it is *required* clear and the footing tile
below it is *required* present — nothing else can ever occupy that exact
cell.

## Consequences

- After the exemption: 12 tiles per segment straight up, so surface ground to
  a dock on the Heavens' floor is 3 segments and 4 hubs, no lean required.
- The test harness must place hubs through the real placement path (with a
  real footing tile under each one) rather than the raw model writer, or this
  exact defect is invisible to it again. `tools/check.mjs`'s segment scenes do
  this today, and assert that a vertical link between two *legally-placed*
  hubs succeeds.
- `data/machines.js`'s own comment on `footing` records this blind spot for
  whoever next touches `solidNear` — the exemption is a deliberate hole
  punched in a safety check, and its justification must stay discoverable
  from the code, not only from history.
- If `docs/AUDIT-2.md` is ever resurrected or a similar audit repeats this
  measurement, it should cite `docs/SPEC.md` §17.6 and this ADR, not the
  spent phase plan.
