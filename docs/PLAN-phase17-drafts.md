# Plan — the real 1-of-3 draft (Phase 17)

**BUILT, and absorbed. `docs/PLAN-wave5-closeout.md` is the record**, as
Phases 17b (the content) and 17c1/17c2 (the modal, the pause and the
reroll). `docs/SPEC.md` §18.8 and §18.9 hold the contract and the numbers,
`docs/SPEC.md` §14 the four tiers' rosters.

This file was extracted from `docs/PLAN-phase16-interaction-model-v2.md`
§7.3 to keep the one piece of unshipped work in the shipped phase plans from
being trimmed away with the scaffolding around it. It is kept as a stub
because `docs/PLAN-phase16-interaction-model-v2.md` §7.3 and
`docs/PLAN-wave5-closeout.md` both cite it by name.

The three things it asked for, and what each became:

- **Content enough for a 1-of-3 offer.** Five boons, three trinkets, three
  miracles and two machine grants. The grant tier ships at two by decision
  and offers two-of-two rather than padding.
- **A modal, and a decision about whether the draft pauses the run.** It
  pauses. `shell/ui.js#pausesRun()` is one predicate over `ui.stack`,
  consulted by the same two entry points that already guard on the map
  overview and on a won run.
- **Cycle 4's guaranteed-empty trinket draft.** Fixed by the content, not by
  the drop: `tribute-bellows` stays `chance:1`, because the first trial paid
  is where the player learns the tier exists.
