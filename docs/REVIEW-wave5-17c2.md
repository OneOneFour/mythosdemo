# Review — Phase 17c2 (the draft modal is drawn, and a card can be clicked)

Commit under review: `a9ef209`. Spec: `docs/PLAN-wave5-closeout.md` §2 (D17-A,
D17-B, D17-F) and §6, brief item 4 plus the `shell/main.js` hit-test paragraph.
Prior context: `docs/REVIEW-wave5-17c1.md`, commits `f343c86`, `6989652`.

## 1. Verdict

**PASS WITH FINDINGS**

The modal is the phase and only the phase, the pointer is genuinely a second
caller rather than a second dispatch path, and every claim in the phase report
that I could check independently was true — but the floor scene's four
"nothing is clipped" assertions cannot fail, and the parked death-screen
finding misdescribes which half of its own defect is reachable.

## 2. Brief coverage

§6 brief item 4 is 17c2's; the `shell/main.js` hit-test paragraph was added to
the block after 17c1 landed. One row per clause.

| clause | state | where |
|---|---|---|
| `view/ui/draft.js` (new): the modal | done | `src/view/ui/draft.js:176` `drawDraft` |
| three cards | done | `src/view/ui/draft.js:216-234`; driven by `run.offer.ids.length`, so two is a real case (`:198-201`) |
| each naming the god, through `data/gods.js` | done | `src/view/ui/draft.js:140`, `godName` imported at `:39` |
| the row's `name` and `text` | done | `src/view/ui/draft.js:141,143` |
| for a trinket or a boon, its `mods` resolved the way `mainPanel.js#trinketDeltaLines` resolves them **through `model/mods.js#explain`** | done, with a justified deviation | `src/view/ui/draft.js:120-131`. The brief's literal instruction is not implementable and the agent's stated reason is correct: `src/model/mods.js:73-74` is `mods.rows.filter(...)`, i.e. the LIVE applied list, so it returns `[]` for an unequipped trinket or an unstarted boon. I verified the strings are byte-equivalent to `src/view/ui/mainPanel.js:305-319` (same dot split, same `label`, same `+N% LABEL` / `+N LABEL`). See defect F3 for the one behavioural divergence. |
| a REROLL row showing the price, dimmed and refusing when unaffordable | done | `src/view/ui/draft.js:159-171,243-247`; refusal strings come from the same `model/run.js#canReroll`/`#offerExhausted` pair `src/rules/draft.js:69-70` reads, so the drawn reason and the journalled one cannot drift |
| every rectangle recorded into `view/ui/state.js#drawn` | done | via `drawPanel` at `src/view/ui/draft.js:223,243`; ids `draft-card-<i>` / `draft-reroll` |
| every position measured (D8) | done | `src/view/ui/draft.js:188-213` — `textWidth` for the title, the reroll row and the wrap; no hardcoded origin |
| legible at the 200 px floor | done | `tests/visual.spec.js:5902`, baseline `draft-boon-floor-desktop-darwin.png` shows the 2+1 grid; but see defect F1 on what that test actually proves |
| `shell/main.js` hit-test branch only, a second CALLER not a second path | done | `src/shell/main.js:416,436-461`. Verified below. |
| `docs/SPEC.md` | done | new §18.9, and §18.8's "until it lands" paragraph corrected |

### The convergence check the prompt asked for, explicitly

`draftPointer()` (`src/shell/main.js:451-461`) has exactly two effects:
`wants.takeCard = Number(card[1])` or `wants.reroll = true`, plus consuming
`cmd.uiClick`. It calls no `rules` function, writes no `model` state and does
not touch `run.offer`. It is invoked at `src/shell/main.js:416`, at the top of
`applyDraftIntents()`, so both the pointer and `shell/input.js:318-322`'s
1/2/3/`r` land on the *same* `wants` fields and fall through the *same*
`src/shell/main.js:418-431` — `tier.grant(id)`, `runw.offer(null)`,
`closePanel('draft')` for a take; `draft.reroll(...)` for a reroll. A pointer
take and a key take converge on the identical lines. **Not a second dispatch
path.**

Two supporting facts I checked rather than assumed:

- The hit-test is against `view/ui/state.js#drawn.panels`, which
  `src/view/hud.js:127` clears at the top of every `drawHUD`, and the modal is
  drawn last in the exclusive chain — so `uiHitPanel`'s reverse scan returns a
  draft rect before the main panel's. The "swallowed" claim in the comment is
  correct.
- `cmd.uiClick` is consumed unconditionally once the modal stands. That also
  swallows the always-on hints toggle, which is consistent with
  `shell/input.js:300-317`'s "every other key is swallowed" and is the right
  call; it does **not** swallow the end-screen restart button, because
  `shell/input.js:587` `onEndRestart` fires in the DOM handler *above* the line
  that sets `cmd.uiClick`.

### Layer direction

`src/view/ui/draft.js` imports `core/font`, `core/pixels`, `data/boons`,
`data/gods`, `data/grants`, `data/miracles`, `data/palette`, `data/trinkets`,
`model/run` and the same-layer `./panel.js`. **No `shell`, no `rules`, no
`data/tuning.js`.** `f.ui.stack` is read through `frameCtx`
(`src/view/ui/draft.js:82`), which is the sanctioned route. Every `model/run.js`
symbol it uses is a pure arrow query — `offerGod` (`:636`), `rerollPrice`
(`:638`), `offerExhausted` (`:646`), `canReroll` (`:648`) — none of which
write. Mechanically: `86 files, 494 edges, 0 violations`, and
`two renders, 0 model writes`.

No `rand()` in the draw path, no `Date.now()`, no new `run` field, no new
tuning-worthy literal (the 86/128 clamp is a `view` layout constant and
`docs/SPEC.md` §18.9 owns both numbers).

## 3. Out of scope

Nothing. Every changed path is inside the block: `src/view/ui/draft.js` (new),
`src/view/hud.js` (one import + one call, `:69,180`), `src/shell/main.js`
(the hit-test branch only — I diffed it; there is no other hunk),
`docs/SPEC.md`, `docs/FINDINGS.md`, `tests/visual.spec.js` (six new scenes
appended at `:5708-5922`, nothing above them touched), and exactly four added
`.png` files. `git show --name-status` confirms `A` on all four snapshots and
`M` on no snapshot — **no baseline was re-accepted**, matching the commit
message.

## 4. Defects

### F1 — MODERATE, test. The floor scene's four "nothing is clipped" assertions cannot fail.
`tests/visual.spec.js:5913-5918`.

```
expect(p.x).toBeGreaterThanOrEqual(0);
expect(p.y).toBeGreaterThanOrEqual(0);
expect(p.x + p.w).toBeLessThanOrEqual(200);   // nothing overruns the buffer
expect(p.y + p.h).toBeLessThanOrEqual(180);
```

`src/view/ui/panel.js:34-37` clamps *before* recording the rect:
`w = min(w, vw-4)`, `h = min(h, vh-4)`, `x = max(2, min(x, vw-w-2))`,
`y = max(2, min(y, vh-h-2))`. Therefore `x >= 2`, `y >= 2`,
`x + w <= vw - 2 = 198` and `y + h <= vh - 2 = 178` hold for *every* panel this
project ever draws, whatever `view/ui/draft.js` computes. A layout bug that
made all three cards 196 px wide and stacked them on top of each other at
`x = 2` would satisfy all four.

What would break it: nothing. The only non-vacuous assertion in that test is
`expect(drawn.length).toBe(4)` (`:5912`), which goes red if a card or the
reroll row stops being drawn. The "nothing is clipped" claim is carried by the
baseline image alone, which is a human judgement, not an assertion — and
`CLAUDE.md` records two shipped tests that baselined a scene with the feature
off for exactly this reason.

The honest version measures the *unclamped* layout: assert the cards do not
overlap each other (`x + w <= next.x`), and assert the recorded `w` equals the
computed `cardW` rather than `vw - 4`.

### F2 — MINOR, documentation. The parked death-screen finding misdescribes its own defect, in the direction that would send the fixing phase to the wrong half.
`docs/FINDINGS.md`, 17c2's third bullet.

The parked item is real — `src/shell/main.js:204` guards `applyDraftIntents`
on `run.won` and not on `run.dead`, and `src/view/hud.js:168-180` puts
`deathScreen` above the modal — but three of its sentences are wrong:

1. **"Not reachable in play: the run is frozen while an offer stands, so the
   player cannot die under one."** The freeze does not begin when the offer is
   written. `src/rules/cycles.js:263` writes `run.offer` inside a substep;
   `src/shell/main.js:371-378` `raiseOffer()` opens the panel only at the end
   of the frame, in `applyIntents()`. Every remaining substep of that frame
   runs fully live: one at 60 Hz, and up to 30 at
   `MAX_CATCHUP = 0.25` (`src/shell/main.js:47,827`), i.e. after any stutter.
   `player` runs before `cycles` in `src/shell/schedule.js:242,260`, so a
   lethal fall landing in a *later* substep of the frame that paid the trial
   reaches dead-with-an-offer. The conclusion "vanishingly rare" survives; the
   stated reason does not. (A miss cannot do it: `src/rules/cycles.js:106`
   returns on `run.offer` and `complete()` re-arms a fresh deadline.)
2. **"an invisible card takeable by a click anywhere the death screen is not
   the restart button."** The pointer half is the one half that is *not*
   reachable. While `run.dead` the modal is never drawn, and
   `src/view/ui/state.js#resetDrawn` runs at the top of every `drawHUD`
   (`src/view/hud.js:127`), so no `draft-card-*` rect exists to hit and
   `draftPointer` (`src/shell/main.js:451`) cannot fire. The click was never
   hot screen-wide either — only over a recorded rect.
3. **The reachable half is the keyboard, and the finding does not mention it.**
   `src/shell/input.js:318` gates on `isOpen('draft')` alone, so in the
   dead-with-an-offer state `1`/`2`/`3` silently grant a permanent gift and
   `r` silently spends favour behind the death screen. A second consequence
   the finding also omits: with the modal on the stack, `pausesRun()` freezes
   the world behind the death screen, contradicting
   `src/shell/main.js:90`'s explicit "death leaves the world live behind the
   death screen, items still fall".

Checked and clean: the restart button still works in that state
(`src/shell/input.js:587`, above the `cmd.uiClick` assignment), so it is not a
soft-lock.

### F3 — STYLE, latent. `modLines` drops `trinketDeltaLines`'s per-key dedupe.
`src/view/ui/draft.js:142` vs `src/view/ui/mainPanel.js:292-294`.

`trinketDeltaLines` skips a repeated `raw.key`; `cardLines` iterates
`row.mods` straight. A row carrying its `mul` and its `add` as two separate
entries on one key would print two lines on the card and one in the Character
tab — the drift the byte-identical wording was meant to prevent. I scanned all
8 shipped `TRINKETS` + `BOONS` rows: zero duplicate keys, so it cannot fail
today. Worth carrying into the parked `formatModRow` lift so the lifted
function ends up with one behaviour, not two.

### F4 — STYLE. An unexplained magic number in a file that explains the others.
`src/view/ui/draft.js:190`, `vh >= 240` selects the scale-2 title. 86, 128, 3
and 8 all carry their reason; 240 does not. `CLAUDE.md` §Comments, "why a
magic number is that number".

### F5 — STYLE, not 17c2's to fix. A baseline now bakes in a content duplication.
`draft-boon-reroll-unaffordable-desktop-darwin.png` card 1 prints "THE WAY IS
EASED" twice, because `src/data/boons.js:47-48` gives `hades-passage` the same
string for `name` and for `text`. 17b's content, surfaced for the first time by
17c2's drawing. Fixing it will move that baseline.

### Observation, not a defect. What the card does not say.
The brief and `docs/SPEC.md` §18.9 both specify god / name / `mods` / `text`
and nothing else, so this is in scope as written — but a card for a **timed**
boon never states its `secs` (the one property that distinguishes the tier),
and `ares-frenzy`'s `trap:true` / `conflictsWith:[athena-focus, invert]`
(`src/data/boons.js:38-41`) is invisible at the exact moment the player is
choosing between the two. Worth a decision in 17e or 17h rather than a silent
omission.

### Judgement on the deliberate deviation (the dimmed REROLL row stays clickable)

**I agree with it, and it is better justified than the precedent it cites.**
The house rule is `src/shell/main.js:588-601`: an unaffordable recipe stays
clickable and the press produces the same `'refused'` journal row
`rules/placement.js` uses. The draft matches that shape exactly, and goes one
better — the recipe precedent keeps its affordability test in `shell`
(`canCraft`), whereas the reroll's predicate lives once in
`model/run.js#canReroll` and is read by `view` (to dim), by `rules/draft.js`
(to refuse) and by `__mf.ui.offer` (to report). Teaching `shell` `canReroll`
really would have made a third reader. D17-B's "never a hidden button" is
satisfied and `docs/SPEC.md` §18.9 documents the behaviour in its own
paragraph ("It stays clickable when dimmed — the press routes to the same
refusal the `r` key does").

### The other prompt questions, answered

- **`payTrial` does not fabricate what it observes.** `tests/visual.spec.js:5720-5744`
  writes only `write.tribute(null)`, `write.cycle(n)` and a receiver's buffer
  through `model/machines.js#write.take`. It never writes `run.offer`, never
  touches `ui.stack` and never names a card id. Everything after is
  `rules/cycles.js#drainReceivers` → `#resolve` → `#complete` →
  `rules/draft.js#offer` → `shell/main.js#raiseOffer`. The baselines do test the
  director.
- **The unaffordable-reroll scene really uses the pointer.**
  `tests/visual.spec.js:5886` calls `realClick`, which is a genuine
  `page.mouse.down/up` at `:1946-1957` — so it goes through
  `shell/input.js`'s DOM handler, `cmd.uiClick`, `draftPointer`,
  `wants.reroll`, `rules/draft.js#reroll`. It asserts favour 2 → 0 and
  `canReroll` false afterwards. Red if the pointer stopped reaching the reroll
  rect, or if the spend stopped happening.
- **The not-vacuous probe is real.** `tests/visual.spec.js:5810` asserts
  `closedPanels === 0` — zero `draft-*` rects in the off state — and then
  `inside > 0` and `total > inside` across two draws with no step between.
  Red if `draftOpen` stopped reading `f.ui.stack`, or if the card painted
  somewhere other than where it recorded itself.
- **`mods.js#explain` is genuinely unusable here.** `src/model/mods.js:73-74`
  is `mods.rows.filter(m => m.key === id || m.key.startsWith(id + '.'))` —
  purely the live applied list. An offered, unequipped trinket contributes no
  row, so it returns `[]`. The duplication was not avoidable inside the
  ownership block, and `docs/FINDINGS.md` names both `mainPanel.js:306` and
  `draft.js:114`.

## 5. Verification

Run by me, on `a9ef209` as it stands.

```
npm run check   → ok  86 files, 494 edges, 0 violations
                  ok  834 checks, 0 violations
                  ok  two renders, 0 model writes (epoch 319374)
                  All checks passed.
npm run lint    → clean, exit 0, no diagnostics
npm run test:visual → 121 passed (16.1s)
```

Every number matches the phase report exactly: `86 files, 494 edges, 0
violations`; `834 checks`; two renders / 0 model writes; `121 passed`. Six new
scenes at `tests/visual.spec.js:5749, 5781, 5821, 5852, 5876, 5902`, all green.
Four `.png` added, zero modified — I confirmed this from `git show
--name-status` rather than from the message.

One gap the report does not claim but a reader might assume: **the modal has no
coverage in `npm run check` at all.** The render-purity probes draw the HUD with
no offer standing, so `draftOpen` is false and `drawDraft` returns at its first
line. The modal's purity is asserted by nothing headless. That is 17g's brief
(§10 item 1), not a 17c2 defect, but it means "two renders, 0 model writes" says
nothing about this file.

I also read all four baselines rather than trusting their names. They show what
they claim: two-of-two with `THIS IS ALL THERE IS` dimmed; three boon cards with
`+25% PICKPOWER`, `-15% HARD`, `+50% FURNACE RATE` (both the `mul` and the `add`
branch of `modLines` are exercised — `+0.2 PICKPOWER` appears in the reroll
shot); a genuinely different three cards and `ATHENA 0` after the reroll; and a
2+1 grid at 200x180.

## 6. What a later phase must not undo

- **The modal sits BELOW `deathScreen`/`winScreen` in `view/hud.js`'s exclusive
  chain (`src/view/hud.js:168-180`) and this is load-bearing, not tidiness.**
  `src/shell/main.js:204` returns on `run.won` above `applyDraftIntents`, so a
  modal painted over the win screen would be a card nothing can take covering a
  restart button. Moving it above the end screens re-creates that. The correct
  fix for F2 is a `run.dead` guard in `shell/main.js`, **not** a z-order change.
- **`draftPointer` sets `wants.*` and returns.** If a later phase "simplifies"
  it by calling `tier.grant()` or `draft.reroll()` directly, the pointer and the
  keyboard stop being the same code and the plan's explicit prohibition is
  broken.
- **The REROLL rect is recorded even when dimmed** (`src/view/ui/draft.js:243`).
  Skipping the `drawPanel` call when `!rr.live` would look like a tidy-up and
  would move the refusal predicate into `shell`.
- **`modLines` builds from the row, not from `explain`.** If the parked
  `formatModRow` lift happens, lift the *formatter*; do not route the card
  through `trinketDeltaLines`, which reads the live list and would silently
  blank every card.
- **The card prints the ROW's god, not the asking god**
  (`src/view/ui/draft.js:140`) — a boon draft asked by Athena legitimately
  offers a Hades boon, and the grant baseline shows a Poseidon card in a
  Hephaestus draft. Not a bug; `docs/SPEC.md` §18.9 records it.
- **For Phase 17i specifically:** three of the four new baselines
  (`draft-grant-two-cards`, `draft-boon-three-cards`,
  `draft-boon-reroll-unaffordable`) show the quickbar's ten digit cells reading
  through the modal's 0.85 wash at bottom-right. Changing `quickbarSlots` 10 → 8
  will move these three as well as the quickbar scenes 17i already expects, and
  17i's commit must say so. Nothing in 17c2 blocks that change.
