# Review — wave 5, phase 17h

**Authored by the coordinator.** §5 separates what I re-verified from what the
phase reported.

## 1. Verdict

**PASS**

Every document the brief named is brought into line, every number I checked is
right, and the phase reported what it could not verify instead of smoothing
over it. The one thing it could not do — `CLAUDE.md` — was outside its
ownership by design, and is now done.

## 2. Brief coverage

| # | item | verdict | where |
|---|---|---|---|
| 1 | `docs/SPEC.md` §4, §18.4, §18.6, §20, the reroll price | done | §20.3 and §25 changed; the rest verified already correct |
| 2 | `docs/DESIGN.md` draft lines, the favour sink, promises marked | done | draft moved to implemented, tier mixing kept as unbuilt |
| 3 | `docs/BUILD_PLAN.md` wave-5 status block | done | phase-to-commit table in waves 3 and 4's shape |
| 4 | `docs/PLAN-phase17-drafts.md` no longer reads "unbuilt" | done | retired to a stub pointing at the closeout plan |
| 5 | `docs/PLAN-phase13.md` §5.2, twenty items, stale citations | done | verdict and re-derived citation per row |
| 6 | `FUTURE_IDEAS.md` cycles 5–6, meta-progression, stolen recipes | done | five entries, storage constraint stated |
| 7 | `docs/DEVELOPER_GUIDE.md` draft modal, batch demand, three module sections | done | four new sections |
| 8 | the DIVINE tab's cause, corrected in SPEC | done | `docs/SPEC.md` §25 |
| 9 | FINDINGS text written out rather than applied | done | 142 lines in the scratchpad, four entries |

The carve-out worked. 17g2 held `docs/FINDINGS.md` throughout and the two
commits do not intersect.

## 3. Out of scope

Nothing. Eight documents, all inside the ownership block. It correctly declined
`CLAUDE.md` and `docs/PLAN-phase16-interaction-model-v2.md` rather than reaching
for them, and said so.

## 4. Defects

None.

Three carried items, none of them this phase's fault:

- **`CLAUDE.md` had three stale claims, and the phase could only see two.** It
  flagged D1's `gift-kiln` and D9's `tw:96` / `origin:{x:128,y:0}`. Checking
  those, I found a third in the same sentence: D9 cites
  `data/machines.js`'s winch stage declaring `lift:{ span:64, toBand:'astral' }`
  as live evidence that the Heavens are reachable. There is no `lift:` or
  `toBand` key anywhere in `data/machines.js`, and `src/rules/lift.js` does not
  exist — D10 replaced both with segment transport. All three are fixed in this
  commit. `cloud_dock`'s `band:'astral'` (`data/machines.js:753`) is what
  carries that argument now.
- **`model/run.js#write.retire()` has no caller.** Defined at `:303`, called
  from nowhere in `src/`, `tools/` or `tests/`. The phase found this while
  writing a `FUTURE_IDEAS.md` entry that assumed the opposite, and corrected
  itself before committing. It is dead code and belongs to the general review.
- **FINDINGS #14's verdict is conditional** on 17g2, which had not reported.
  The phase wrote the settled half — the eliminated hypotheses — and left two
  alternative verdict templates. That is the right call.

## 5. Verification

**Every number re-derived from the live tables**, not read back from the docs:

```
BOONS 5  MIRACLES 3  GRANTS 2  TRINKETS 3
SUB.length 27  FORM.length 13  PACKABLE_LIMIT 17
HAND_RECIPES 19
```

All match what the phase wrote, including the two counts it corrected in
`docs/DESIGN.md`.

**Citations spot-checked, nine of them, all resolving:** `data/machines.js:753`
is `band:'astral'`; `model/run.js:566-567` is the band refusal;
`shell/main.js:375` is the draft request; `view/ui/ruler.js:104` is the
charting-is-knowledge comment; `view/hud.js:253-254` is `urgentFlash` and
`data/tuning.js:182` is `urgentSecs`; `view/hud.js:1163` is `tallyLines`;
`view/scene.js:873` is `drawArrival`; `shell/schedule.js:289` is the re-export
the guide cites it for.

`npm run check` passes. It does not isolate this phase — 17g2 was editing
`tools/check.mjs` and `src/model/run.js` concurrently — but nothing in this
commit is executable, so the check is a guard on the tree rather than evidence
about the documents.

**The DIVINE correction is right and its recommendation is right.** I confirmed
independently that `auger` is the only one of 19 hand recipes whose output
substance carries `relic` or `miracle`, and that it also carries `item.tool`.
Reordering `categoryOf`'s clauses would move ADAMANT AUGER into DIVINE and
leave TOOLS empty, which is worse. SPEC now says so.

## 6. What a later phase must not undo

- **`docs/SPEC.md` §25's tool clause on the DIVINE row is not a typo.** It
  records why the tab is empty. Deleting it re-opens a question three
  documents have now answered.
- **`FUTURE_IDEAS.md`'s meta-progression entry states the storage
  constraint.** `CLAUDE.md` forbids `localStorage`/`sessionStorage`, so
  "banked favour carries between runs" cannot mean what `docs/DESIGN.md`
  implies. An entry that drops the constraint invites building the wrong thing.
- **`docs/PLAN-phase17-drafts.md` is a stub on purpose.** It pointed at work
  that is now built; the record lives in `docs/PLAN-wave5-closeout.md`.
- `docs/PLAN-phase16-interaction-model-v2.md:671` still says to extract the
  drafts plan "when 13d has a greenlight". Harmless, and left alone on the same
  principle the other historical plans are.
