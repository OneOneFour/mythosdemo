# Review — wave 5, phase 17f2

**Authored by the coordinator, not by a `reviewer` agent**, for the same reason
17e and 17f1 were. §5 separates what I re-ran here from what the phase
reported.

## 1. Verdict

**PASS**

The presentation is built, it is visible, it ends, and it consumes no
randomness. Every one of the 14 baselines is accounted for. Two style notes,
no defects.

## 2. Brief coverage

| # | item | verdict | where |
|---|---|---|---|
| 1 | a presentation for the arrival, all four of SPEC §5's elements | done | `src/view/scene.js#drawArrival`, `#rising` |
| 2 | derived from simulated time and the machine's own position | done | `run.t - run.arrival.t`, `hash2` of the arrival's world position |
| 3 | no `rand()` in a draw path | done | `npm run check` section 2, plus the op-stream repaint test |
| 4 | time-bounded, and it ends | done | `arrivalOf` returns null at `p >= 1` (`scene.js:848`) |
| 5 | new `run` state declared in `RUN_SCHEMA` | done | `src/model/run.js:214-230`, reset proven by the generic fingerprint test |
| 6 | integer pixels, palette entries, no inline hex | done | `INK.shaft` / `INK.shaftHi` resolve `colour('ichor')` / `colour('cloudA')` |
| 7 | one of `scene.js` or `fx.js`, named in the commit | done | `scene.js`; `fx.js` untouched |
| 8 | proven not vacuous | done | §5 re-derives it independently |

The phase read the brief's "derived from `clock.t`" and used `run.t` instead.
That is the better reading and it should stand. `run.t` is the fixed 1/120 s
accumulator, so the presentation lasts the same length of game at 30 fps and at
144 fps; `clock.t` would have made it framerate-dependent. The arrival stamp is
taken from `run.t`, so measuring progress against anything else would compare
two clocks.

`RUN_SCHEMA.arrival` holds a position rather than a machine reference, which
keeps `run` plain-serialisable and keeps every machine name out of `view`. The
renderer matches `m.box.x`/`m.box.y` against the stamp. That is the right shape.

## 3. Out of scope

Nothing. Six files, all inside the ownership block, plus 2 new and 12
re-accepted snapshots.

`rules/cycles.js` gained one line, `rw.arrival(m.box.x, m.box.y)`. The gate
itself is byte-identical, which the block required. `mw.place` already returned
the machine record (`model/machines.js:59`), so no signature changed to get it.

## 4. Defects

None.

Two style notes, neither of which can be described failing:

- **`RUN_SCHEMA.arrival`'s comment contradicts itself.** `src/model/run.js:227`
  says the field is "Written by `rules/cycles.js` and read by nothing else",
  eight lines after explaining that it exists so `view/scene.js` can read it.
  The intended sense is "no other writer, and no reader but the renderer".
- **"Pixel identical" is not quite true of the Character tab.** The report and
  the commit both say the panel and all four stat rows are pixel identical in
  the two `ui-character-stats-scrolled` shots. The glyphs and the layout are.
  The panel body differs by one level in the red channel throughout —
  `(22,24,33)` → `(23,24,33)` at [406,300] — because the panel is translucent
  and the world behind it moved with the camera. Harmless, and the cause is
  still the camera the report names. It is worth stating precisely because
  `threshold: 0` exists to make exactly this claim checkable.

One observation rather than a note: `arrivalOf` calls `eff('altarRiseSecs')`
on every frame for the rest of the run once the stamp exists, because the
`p >= 1` test comes after the lookup. One map read per frame. Not worth the
edit, and not worth a later agent "fixing" the order without understanding it.

## 5. Verification

Re-run here.

`npm run check` — section 0 `ok 86 files, 498 edges, 0 violations`; section 2
`ok two renders, 0 model writes (epoch 320519)` and `ok render() consumes no
randomness (invariant 7)`, both also passing with the main panel open. Ends
`All checks passed.` Invariant 8 is covered generically: `newRun() RESET: every
exported model object fingerprints identically across two fresh calls on the
same seed`, so `arrival` needed no bespoke assertion.

`npm run lint` — clean, exit 0.
`npm run test:visual` — 140 passed (14.4 s).

**The assertion bites, re-proven independently.** I stubbed `arrivalOf` to
return `null` and re-ran the phase's two tests. Both go red, and the hash
assertion reports exactly the collision the phase quoted:

```
Error: expect(received).not.toBe(expected)
Expected: not 942086086
  6826 |   expect(mid).not.toBe(done);
```

The pinning of `clock.t` and `cam` before the second draw is what makes that
test worth anything, and the phase found that out the hard way — it reports the
assertion passing twice with the presentation stubbed out, once because the
altar's halo pulses off `clock.t` and once because `updateCamera` was still
easing. Both pins are in the test with the measurement that forced them. That
is the first time in this wave a phase caught its own vacuous assertion before
review did.

**All 14 baselines decoded.** Diffed against `22c9b93` and clustered at radius
3. The two new images were inspected directly: `altar-arrival.png` shows the
tapering shaft from the top of the viewport to the altar's base with motes in
it, the base flare, the dimmed sky and the altar part-emerged;
`altar-arrival-over.png` shows the same altar settled with no light. The effect
is visible at a glance, which is the thing a baseline alone cannot establish.

The 12 re-accepted all move because the scene now waits the arrival out. The
large clusters resolve to the four causes the phase named:

| scene group | dominant cluster | cause |
|---|---|---|
| the five `drive-*` | 11,836 px, 538×22 at [370,770] | the bottom callout strip, faded in |
| `drive-*`, `seedling-phone`, `grown-tree-phone` | paired ~30×30 clusters, vertically separated | the stock pickaxe, mid-fall then landed |
| all | 250–700 px along the top of the sky | clouds, 2 s more of `clock.t` |
| the two `ui-character-stats-scrolled` | 151,924 px, 1224×292 | the camera finishing its ease; the world moved, the panel did not |

I checked the largest one by eye rather than trusting the cluster maths. The
panel's chrome, tabs, BURDEN row and toggle rows sit in identical pixels; the
world scrolls about 45 px behind and around it.

## 6. What a later phase must not undo

- **The `clock.t` and `cam` pins in the vacuity test.** Remove either and the
  assertion passes with the presentation deleted. The comment says so and
  names the measurement.
- **Progress is `run.t`, not `clock.t`.** Swapping it makes the presentation
  framerate-dependent and breaks its own stamp's clock.
- **`run.arrival` is a position, not a machine.** A live machine record holds a
  band holding typed arrays, and `run` is plain-serialisable everywhere else.
- **`arrivalOf`'s `p >= 1` is the assertion that the light goes out.**
  Perturbing it moves `altar-arrival-over.png` by 992,920 px.
- 17g2 owns `tribute-cycle1-armed`, which still pictures the first trial with
  no altar. 17f2 neither helped nor hurt it — no altar means no arrival means
  nothing drawn — so `docs/FINDINGS.md`'s entry from 17f1 stands.
