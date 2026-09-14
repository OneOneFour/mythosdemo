# Review — wave 5, phase 17f1

**Authored by the coordinator, not by a `reviewer` agent.** Reviewer agents
stalled three times running on 17e, so this phase was reviewed directly. §5
says what was re-verified independently and what was taken from the phase's own
report.

## 1. Verdict

**PASS WITH FINDINGS**

The gate is correct, the soft-lock is proven impossible by three independent
assertions, and all 59 re-accepted baselines moved for one cause. The commit
message states the wrong cause for eight of those baselines, and one scene no
longer shows what its name claims.

## 2. Brief coverage

| # | item | verdict | where |
|---|---|---|---|
| 1 | gate on tutorial beat 4, read as a `model` query | done | `src/rules/cycles.js:179`, `model/tutorial.js#beat` |
| 2 | grace on `run.t` past a new `altarGraceSecs` | done | `src/data/tuning.js:149-158`, `cycles.js:179` |
| 3 | beat 5's comment states present behaviour | done | `src/rules/tutorial.js:158-169` |
| 4 | `SPAWN_GAP`'s block corrected where false | done | `src/rules/cycles.js:148` |
| 5 | `tools/check.mjs` comments that assumed frame 0 | done | `:645`, `:1394`, `:4661` |
| 6 | `tests/visual.spec.js`'s nine altar comments | done | comments only, no logic |
| 7 | `docs/SPEC.md` §5 | done | four paragraphs after the beat table |
| 8 | `docs/FINDINGS.md` | done | the 59 baselines and the beat-jumping scenes |
| 9 | every new assertion proven red | done | §5 below re-derives it independently |

No `rules` sibling is imported. `eff` and `beat` both come from `model`. No new
`run` field, so `RUN_SCHEMA` needs nothing and invariant 8 holds. No `rand()`
call moved in count or order.

`&&` short-circuits in the phase's favour at `cycles.js:179` — once the beat has
fired, `eff('altarGraceSecs')` is never called again. The three guards run every
substep only while cycle 1 is live, because the first guard returns on any other
`at`. Not worth changing.

## 3. Out of scope

Nothing. The commit touches exactly the seven files of the ownership block plus
the 59 snapshots that `npm run test:visual:update` rewrote.

## 4. Defects

**D1 — the commit message gives the wrong reason for eight baselines, and git
now carries it.** `22c9b93` says the Character-tab shots "move by a 16 px aim
reticle, which retargets with the altar gone". They do not. They move by the
altar's own silhouette showing through a panel's dim overlay. In
`ui-character-desktop-darwin` the differing pixels run `(12,10,18)` →
`(25,24,32)` at [440,382]; across the three `draft-*` modals they run
`(12,10,18)` → `(14,12,19)`. Every one is a near-black shift of 1 to 13 of 255,
which is the exact class `threshold: 0.2` filtered silently until 17g1 set it
to 0. The phase report also groups `ui-crafting`, `ui-quickbar-full` and
`ui-boon-stack` with the reticle; those three carry the full 1,072 px sprite.
CLAUDE.md requires a re-accepted baseline to come with the reason its pixels
moved, and for eight images the recorded reason sends a future reader to a
mechanism that is not the one at work. Severity: low. The acceptance itself
stands — the altar is the real cause in all 59.

**D2 — `tribute-cycle1-armed` no longer shows cycle 1 armed at an altar.** The
scene sets `run.tutorialBeat` and draws without stepping
(`tests/visual.spec.js:4811`), so the director never gets a frame in which to
place anything, and the baseline is now the first trial armed with no altar
anywhere on screen. Five other `tribute-*` scenes share the shape, but this one
is the case where the picture contradicts its own name. `tests/visual.spec.js`
is inside the ownership block, so one `__mf.frames(1)` after the beat jump was
available and the phase chose `docs/FINDINGS.md` instead. Defensible as scope
discipline, and it should not survive the wave. Severity: low, assigned to
17g2, which owns the file.

## 5. Verification

Re-run here, not quoted from the phase report.

`npm run check` — section 0 `ok 86 files, 498 edges, 0 violations`; ends
`All checks passed.` Section 7a reads:

```
7a. the altar arrives: the beat, and the grace (D17-G)
  ..  1 s in at beat 0: cycle 1 armed, no altar standing
  ..  beat 4 fired 0.63 s in, 79 s short of the grace; the altar stood the next frame
  ok   THE ALTAR ARRIVES: ...
```

`npm run lint` — clean, exit 0.
`npm run test:visual` — 137 passed (14.4 s). No winch flake this run.

**The assertions can fail, re-proven independently.** Two perturbations of
`ensureAltarPlaced`, each reverted:

- Gate line deleted, so the altar returns to frame 0 →
  `FAIL: ALTAR GATE: after 1 s of real frames with no input, an altar exists = true (want false)`
  and the beat claim's own setup fails with it.
- Gate replaced by a bare `return`, which is the soft-lock this phase exists to
  avoid → three failures, from `ALTAR GATE (beat)`, `ALTAR GRACE`, and
  `TUTORIAL BEAT 5`. The third is a **pre-existing** assertion, so the soft-lock
  has a detector the phase did not have to write.

Cycle 1 carries `deadlineSecs:null` (`data/cycles.js:108`), so the 80 s grace
cannot eat a clock. That was the failure mode worth checking before accepting
the number and it is not present.

**All 59 baselines decoded, not two.** Every changed PNG was diffed against
`409bf21` and its differing pixels grouped into clusters at radius 3. Four
signatures, and nothing outside them:

| signature | count | what it is |
|---|---|---|
| 1,072 px, one 40×34 cluster | 40 | the altar sprite, desktop |
| 632 px, one 40×34 cluster | 4 | the same sprite, phone raster |
| 972 / 920 px, 40×34 | 2 | the sprite under the end screens' 0.78 wash |
| 256 px, 16×16 | 3 | the altar's marker on the overview map |
| 20–216 px, near-black | 10 | the sprite through a panel or modal overlay |

**No baseline has an unexplained second cluster.** That is the evidence 17g1
was promoted to make possible, and it is the first re-acceptance in the wave
where every image was accounted for mechanically rather than by sampling.

## 6. What a later phase must not undo

- **The grace clause is not redundant with the beat.** Cycle 1 has one
  receiver. Deleting the clause turns a beat predicate that fails to fire into
  an unplayable run, and perturbation B above shows exactly what that looks
  like.
- **`ALTAR_BEAT = 4` and `rules/tutorial.js#BEATS`'s fifth entry are one
  coupling held by two files that may not import each other.** Renumbering the
  beat sheet means editing both.
- **`ensureAltarPlaced` belongs in `step()`, not in `ensureLiveCycle()`.** At
  arming time neither condition has fired, so the old call site would withhold
  the altar for the whole run.
- 17f2 owns the presentation and will move these 59 baselines again. It should
  not re-derive the altar's position; `cycles.js:181` already derives it from
  the band's own `spawnTx`/`floorTy`, per invariant 2.
