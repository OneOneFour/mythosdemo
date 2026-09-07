# Two bugs that survived a verification method that didn't test the real path

Salvaged from `docs/SPEC.md` when its "how this was found" narration was
trimmed, since a review process that missed something once is worth
remembering, not just the fix.

## A screenshot harness that places machines by direct model write can't see a placement-geometry bug

`hub.footing` was 2 until Phase 8f, and at `footing:2` a hub straddling a
shaft mouth (one column on solid ground, one over the void) could never
actually be placed through `rules/placement.js` — the cable, leaving from
the footprint's own centre, ran straight into the hub's own footing tile one
row below, so `linkCheck` refused every span steeper than 45°.

Phase 8e's own screenshot scenes never saw this because they place machines
through `model/machines.js#write.place`, which asks nothing about footing —
a scene built by direct model write skips the exact check a real player
placement goes through. It surfaced only when Phase 8f physically performed
its own acceptance walkthrough by hand. See also
`docs/DEVELOPER_GUIDE.md` §"Writing tests": "a scene assembled through
`model` write APIs is not a scene the game can reach."

## A rule gated on the wrong function's answer is unreachable from the one path that exercises it

Phase 16a's rule 2 (a machine under the reticle takes priority over
placement) needed a first draft that read "and it accepts the armed pair"
literally, gating rule 2 itself on `feedCheck(...).ok` before it would fire
at all. That made both of SPEC §23.4's refusal strings **unreachable** from
a real press: the moment the armed pair was wrong or the machine was full,
rule 2 simply didn't fire, and the press fell through to rule 3 (place) —
which is how a ladder rung ended up placed *inside* a furnace's own
footprint instead of refusing to feed it.

Found by hand during Phase 16a's own acceptance walkthrough (a scripted
test wouldn't have hit it either, unless it specifically tried a wrong pair
against a real machine through a real click — which `tests/visual.spec.js`
now does, permanently). The fix moved the "is this pair welcome" question
downstream into `handOne`, so rule 2 always fires for a reachable
hand-feedable machine and the refusal happens where the player can see it.

**The pattern in both**: a verification method (screenshot scene, gating
logic) that takes a shortcut around the real dispatch path stops being able
to see defects that live exactly in that path. The fix in both cases was to
route the check through the same mechanism a real player action uses,
not around it.
