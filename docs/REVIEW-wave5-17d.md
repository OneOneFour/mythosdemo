# Review — Phase 17d (the rolling-window rate demand)

Spec: `docs/PLAN-wave5-closeout.md` §2 D17-C and §7. Diff: `c1927ad`.

## 1. Verdict

**PASS WITH FINDINGS**

The mechanism is correct, bounded, deterministic and inside its ownership block
with one recorded exception, but `docs/SPEC.md` §4 calls it a throughput quota
when it measures how tightly deliveries are bunched, and on cycle 4 as shipped
it changes nothing for a player who hauls the whole bill in one trip.

## 2. Brief coverage

| brief line | verdict | where |
|---|---|---|
| 1. SPEC first — §4's not-implemented paragraph | done | `docs/SPEC.md:78-84` |
| 1. SPEC first — §18.4's table | done | `docs/SPEC.md:1553-1559`, rate column added, `—` on rows 1-3 |
| 1. SPEC first — a new §18.x defining the clause | done | `docs/SPEC.md:1802-1848` |
| 1. `rate:{ sub, form, n, secs }` on a cycle row | done | `src/data/cycles.js:153`, header key documented at `:29-35` |
| 2. the credit ledger on `run.tribute`, pruned on write | done | `src/model/run.js:236-245`, called at `:381` |
| 2. `rateMet()` as a query | done | `src/model/run.js:687-690`, with `rateHave()` at `:674-682` |
| 2. `tributeMet()` gains the second clause | done | `src/model/run.js:665` |
| 2. `run.tribute` still replaced whole, never patched | done | see §4 D-note; verified, `src/rules/cycles.js:227-230` |
| 3. `creditTribute` stamps each credit with `run.t` | done | `src/rules/cycles.js:226-230` |
| 4. allocation note saying why the ledger is rebuilt per credit and what bounds it | done | `src/rules/cycles.js:212-222` |
| acceptance: slow feed does not pay, fast feed does, at 30 and 144 fps through the real `main.step()` | measured, not asserted | scratch harness, deleted; the three claims parked at `docs/FINDINGS.md:2405-2423` for 17g2 |

The acceptance criterion is met by measurement and not reproducible from the
repo. `tools/check.mjs` is not in this phase's ownership block, so parking is
the right call and the plan's own 17g brief already owns "the rate clause at 8
framerates".

## 3. Out of scope

| change | harmless? |
|---|---|
| `tools/check.mjs:5369-5374` — the WIN STATE probe fills the rate window alongside `have` | yes, and necessary |

The probe stubs a delivery by writing `have` straight onto `run.tribute`, which
is the one path that skips `creditTribute`. With cycle 4 rated, `tributeMet()`
stayed false and the win boundary never arrived, so the phase would have shipped
a red `npm run check`. The repair is `const credits = row.rate ? [{ t: run.run.t,
n: row.rate.n }] : []`, data-driven off the row rather than hardcoding cycle 4,
plus four comment lines. It adds no assertion and removes none.

It does not weaken the probe. For the three unrated rows the explicit `[]`
matches what `ensureLiveCycle` already put there, so those iterations are
bit-identical to before. For cycle 4 the probe now also fails if `rateMet()`
were broken to always return false, which is strictly more coverage than it had.
It would still pass if `rateMet()` were broken to always return true — the same
blind spot it had before the phase, not a new one. Nothing else in `tools/` or
`tests/` writes `have` for cycle 4; `tools/check.mjs:5453` is cycle 1 and
`tests/visual.spec.js:4853` is cycle 3.

No other file outside `src/data/cycles.js`, `src/model/run.js`,
`src/rules/cycles.js`, `docs/SPEC.md` and `docs/FINDINGS.md` is touched.
`src/data/tuning.js` is in the ownership block and correctly left alone — `n`
and `secs` are content-table numbers on a cycle row, the way `deadlineSecs`
already is, not tunables. No `src/view/` file is touched.

### Layer direction

`src/model/run.js` imports `CYCLE` from `data/cycles.js`, which it already did
at `:14`. `src/rules/cycles.js` adds `keyOf` to an existing import of
`model/items.js` at `:58`. No new module edge, no `rules` sibling import, no
upward import. `npm run check` section 0 reads 86 files, 494 edges, 0
violations.

### Invariants

- **10, fixed step.** Credits stamp `run.t` (`src/rules/cycles.js:228`) and the
  window compares against `run.t` (`src/model/run.js:679`, `:238`). `run.t`
  advances only in `write.tick(dt)` (`src/model/run.js:291`), scheduled first
  in `src/shell/schedule.js:241` and ahead of `cycles` at `:261`, so a credit
  is stamped with the current substep's time. No `Date.now()` and no variable
  dt anywhere in the path. The clause cannot be satisfied or defeated by
  framerate: every quantity in it is simulated seconds.
- **7, seeded randomness.** No `rand()` call is added, moved or removed.
- **9, view never mutates model.** No `src/view/` file is touched.
- **`RUN_SCHEMA`.** `credits` is a field inside the `run.tribute` record, not a
  new top-level `run` field, and the schema comment for `tribute` is updated at
  `src/model/run.js:53` and `:62-67`. `newRun()` clears `run.tribute` whole, so
  the reset is unchanged.
- **Second source of truth.** None. `tributeMet()` remains the single
  completion predicate and gains a term at `:665`; `rateHave()` is the one
  reader of the ledger and `rateMet()` calls it.

### The prune, checked adversarially

`prunedCredits` (`src/model/run.js:236-245`) drops the aged-out prefix, then
drops the oldest of the remainder while the newer suffix still sums to
`rate.n`. I reimplemented it standalone and ran four adversarial schedules and
70,000 random ones.

| case | longest array | `rateHave()` |
|---|---|---|
| 1,000 credits at the same `t` | 4 | 4 |
| one credit per frame for 10 simulated minutes (72,000 frames) | 4 | 4 |
| two credits, then a 5,000 s gap | 0 | 0 |
| 50 hauls of `n:4`, one per second | 1 | 4 |

The bound holds. Every entry carries at least 1 (`drainReceivers` guards `if
(!n) continue`), so after pass 2 the suffix past its first element sums to under
`rate.n` and therefore holds at most `rate.n - 1` entries. Pass 2 is also safe
against a later answer: 20,000 random schedules, each probed both at the credit
instant and at a random later idle time, produced **0** disagreements between
`rateMet()` on the pruned array and on a never-pruned one. A dropped entry is
always older than the suffix that already meets the threshold, so any future
window containing the dropped entry contains that suffix too.

`run.tribute` is replaced whole. `creditTribute` builds a fresh array with a
spread (`:228`) or passes the previous array by reference (`:229`);
`write.tribute` writes `t.credits` on the *incoming* object before publishing it
(`:381`) and `prunedCredits` returns either the same array or a `slice`. Nothing
ever pushes into or splices a published array, so the record cannot be observed
half-applied and `credits` did not become a mutated-in-place array inside a
replaced wrapper.

## 4. Defects

### D1 — the clause measures batch size, and SPEC §4 calls it throughput (major)

`src/data/cycles.js:153`, `docs/SPEC.md:78`.

A credit is stamped when cargo reaches the receiver, so a delivery of four
plates is one credit of `{ t, n:4 }` and satisfies "4 within any 120 s window"
in the instant it lands. The mechanism has no view of production at all. It
measures how close together arrivals are.

`docs/SPEC.md:78` says:

> **A throughput quota is a second clause on a demand, and cycle 4 carries the
> only one.**

That overclaims. The body two lines down is exact ("`n` of that pair inside any
window of `secs` seconds"), and §18.10's margin bullet is candid to the point of
saying it out loud — "the whole 8-plate bill pays the clause in two hauls of
four however long each haul takes." A player who stockpiles for ten minutes and
then makes two trips satisfies a "quota" whose nominal rate is 2 plates a minute
while producing at 0.8. §4 promises a measure the code does not make, which is
the same class of drift 13d had to correct in that exact paragraph.

It is worse than two hauls on the shipped numbers. Eight `copper/plate` weigh
19.2 T (`massOfPair` = `SUB.copper.item.mass 1.0` × `FORM.plate.massK 2.4`,
`src/data/substances.js:120`, `src/data/forms.js:162`), against `burden` 40 T
and `burdenSoft` 0.75 × 40 = 30 T (`src/data/tuning.js:132-133`). The whole
bill fits in one climb with no speed penalty at all, and hand-feeding it at the
dock takes seconds. **On cycle 4 as shipped the rate clause is a no-op for the
natural single-trip play.** It bites only a player who chooses four or more
separate trips spaced more than 40 s apart.

The remedy is one of two, and the choice is a design call:

- Say batch size. Rewrite §4's headline and §18.10's title to describe a
  delivery-burst clause, and pick `n` and `secs` against a bill the player
  cannot carry in one load — `n` above what `burden` permits in a single climb
  would make the clause bind.
- Or move the credit off arrival. Crediting per unit as cargo is produced or as
  it boards a carrier would measure a line, at the cost of a second write path
  and a new question about where production is observed. That is a mechanism
  change and not a 17d fix.

Until one lands, SPEC should say batch size.

### D2 — the TRIBUTE panel reads 100% on an unpaid cycle 4 (medium)

`src/view/hud.js:305-309`.

`aggFrac` sums `Math.min(have, d.n)` over the demand rows only. On cycle 4 with
eight plates and eight gravel delivered slowly, the panel draws `8 / 8`, `8 / 8`
and `100%` while `tributeMet()` is false and the deadline runs out. The player
sees a finished tribute, a running clock, and then a miss costing 2 hearts and
a favour, with nothing on screen naming the reason.

This is 17e brief item 1's subject and the plan sequences 17e immediately after,
so it is a transient by design. The phase did not record it. Neither the commit
message nor `docs/FINDINGS.md` names it, and a reader of the repo between the two
commits has no note saying the HUD is knowingly wrong on one cycle.

Breaks it: arm cycle 4, fill both demand rows, let the window empty.

### D3 — FINDINGS misdescribes how a typo'd rated pair fails (medium)

`docs/FINDINGS.md:2394-2399`, against `src/rules/cycles.js:227` and
`src/model/items.js:32`.

The note says a typo in a rated pair "is a clause nothing can ever satisfy and
nothing would throw." It throws. `keyOf` is `SUB[sub].id + '/' + FORM[form].id`,
so `keyOf(S['coppper'], F['plate'])` evaluates `SUB[undefined].id` and raises a
`TypeError`. The `rate &&` guard does not short-circuit it, because `rate` is
truthy. The throw fires inside `creditTribute` on the **first delivery of any
pair** to a rated cycle's receiver, not only on a delivery of the rated pair.

This matters for whoever writes the assertion. A `tools/content.mjs` check
written against "silently unsatisfiable" would be looking for the wrong symptom;
the observable failure is a mid-substep exception. A *valid but unholdable*
pair, say `granite/plate`, is the silent case the note describes.

The gap itself is real — assertion 19 (`tools/content.mjs:747-786`) runs
`holdable()` and `expand()` over every `demand` row and never looks at `rate`.
**It should be closed now rather than parked.** It is one `rate` block through
the two helpers assertion 19 already calls, in a file the wave still has an
owning phase for (17g owns `tools/check.mjs`, and `tools/content.mjs` has no
remaining owner in §§7-11). It is the same class as the `transmute` gap 17b
shipped and then had to close, and the failure mode is now known to be an
exception rather than a quiet false, which raises it from a content lint to a
crash guard.

### D4 — `rateHave()`'s JSDoc claims a total it does not return (low)

`src/model/run.js:668-673`.

> Units of the rated pair delivered inside the live window

After pruning it is the in-window total **capped near `rate.n`**, because pass 2
deliberately discards surplus. Measured over 40,000 random samples, the pruned
value differed from the true in-window total in 26,546 of them — an over-full
window reading 6 where 7 arrived. The returned value is always in
`[min(true, n), true]` and never over-reports (0 counterexamples in 500,000
samples), so a bar clamped at `rate.n` is exactly right and `rateMet()` is
unaffected.

The doc names "the TRIBUTE panel's bar" as a consumer, which is the one place
the difference can surface. If 17e draws a raw count rather than a clamped
fraction, it will draw a number smaller than the player delivered.

### D5 — style note, the reset probe's comment is now stale

`tools/check.mjs:908`. It says the real record is `{ id, have, left }`, which
`RUN_SCHEMA` no longer agrees with, and `:917` does not exercise `credits`.
Out of this phase's ownership, so leaving it is right. Recording it so 17g does
not have to rediscover it.

### D6 — style note, the cycle-4 rationale now lives in three places

`src/data/cycles.js:139-149` restates §18.4's new paragraph and §18.10's margin
bullets almost verbatim, and the commit message says the same thing a third
time. `CLAUDE.md`'s comment rules put mechanic rationale in `DESIGN.md` and
behavioural contracts in `SPEC.md`. The block does cite `docs/SPEC.md` section
18.10 at its end, and the surrounding file already argues at this length, so it
matches local precedent rather than breaking it. It is three copies to keep in
step.

## 5. Verification

Run here, on `c1927ad` with no working-tree changes to `src/` or `tools/`.

```
npm run check
  0. dependency direction
    ok   86 files, 494 edges, 0 violations
    ok   834 checks, 0 violations
  ...
  All checks passed.

npm run lint
  > oxlint src tools tests
  (no findings, exit 0)

npm run test:visual
  129 passed (15.0s)
```

This matches the phase report exactly — `86 files, 494 edges, 0 violations` and
`129 passed`. No snapshot file appears in `git show --stat c1927ad`, so no
baseline was re-accepted and the commit correctly makes no claim about moved
pixels.

The commit's scratch-harness claims are not reproducible from the repo, since
the harness was deleted. I checked their internal arithmetic instead. Claim 1's
figure is right: credits at `t` 0, 45, …, 315 leave exactly three inside
`[195, 315]`, so `rateHave()` reads 3 against `rate.n` 4. Claim 3 I reproduced
independently against a standalone copy of `prunedCredits` (table in §3). The
`docs/FINDINGS.md:2402-2405` citation of `tools/check.mjs:5240`'s TRIBUTE GATE
probe is accurate — that probe does place a `cloud_dock` in `topsoil` via
`machs.write.place` and arm a cycle directly through `run.write.cycle`.

The note is precise enough for 17g2 on the numbers (credit spacing, the 315 s
probe point, `rateHave()` 3 of 4, the 4-entry bound) and vague on two points
17g2 will have to decide for itself: it gives no seed, and "handed over" does
not say whether the plates went into the dock buffer for `drainReceivers` to
find or straight through a writer. Name both when the assertion lands.

The payability arithmetic in §18.10 checks out and is conservative. `press` is
3 ingots + 1 fuel at `secs:8.0` (`src/data/recipes.js:259-265`), `smelt` is 4
ore + 1 fuel at `secs:4.0` (`:239-245`), so the furnace is the bottleneck at
12 s per plate and 4 plates cost 48 s of the 120 s window. The furnace's
`servo:{ over:0.55, mult:1.38 }` (`src/data/machines.js:191`) makes a hand-fed
furnace *faster*, so a full feed buffer brings that to about 35 s. Mass checks
out at 9.6 T for four plates against a 40 T cap. The clause is comfortably
payable — which is D1's problem, not a safety margin.

## 6. What a later phase must not undo

- **Pass 2 of `prunedCredits` (`src/model/run.js:244`) looks redundant and is
  not.** Pass 1 alone bounds the array by arrival density, not by `rate.n`, so
  a run that delivers one unit a second for two minutes would carry 120 entries.
  Pass 2 is the only thing that makes the bound `rate.n`. It is safe only
  because the dropped entries are strictly older than a suffix that already
  meets the threshold — do not change it to drop from the newer end.
- **`prunedCredits` returns `cs` unchanged when `i === 0`
  (`src/model/run.js:245`).** `tickDeadline` calls `write.tribute` every substep
  on any clocked cycle, so this early return is what keeps the deadline tick
  from allocating an array 120 times a second.
- **`rateMet()` is vacuously true on an unrated row (`src/model/run.js:689`).**
  That is what lets `tributeMet()` use a bare `&&` with no branch. A later phase
  "tightening" it to require a `rate` block would make every unrated cycle
  unpayable.
- **`creditTribute` spreads into a new array rather than pushing
  (`src/rules/cycles.js:228`).** The published `run.tribute.credits` is shared
  by reference with the previous record in the unrated branch at `:229`. A push
  would mutate a published record in place and break the replaced-whole
  discipline the field's own comment states.
- **`run.t` and never `dt` or `Date.now()`** in both the stamp
  (`src/rules/cycles.js:228`) and the window comparisons
  (`src/model/run.js:238`, `:679`). Invariant 10.
- **The `credits: []` in `ensureLiveCycle` (`src/rules/cycles.js:115`)** keeps
  every armed record the same shape, so `rateHave()`'s `?? []` is a guard for
  test-written records only and not the normal path.
