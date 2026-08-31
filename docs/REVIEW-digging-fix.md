# Review — fix straight-down dig wedge for non-tile-aligned players

**Verdict: pass.** This was a real, significant bug and the fix is minimal,
well-reasoned, and independently confirmed working.

## The fix, read directly

`rules/mining.js#resolveStraightDown` recomputes, on every aim resolve,
which of the two hitbox-straddled columns is currently `solidAt` the row
below the player's feet, and targets that one — degenerating cleanly to the
old fixed centre-x column when the player happens to be aligned or neither
column blocks the fall. No new persistent state: `aw` (`model/aim.js`'s
write API) was already imported and used exactly as before, `PW`/`solidAt`
are the only new imports, and `rules/player.js` is untouched, matching the
task's own constraint to keep this out of the codebase's most historically
fragile collision code.

## The four constraints, checked against the actual diff

1. **Alignment no longer required** — confirmed by the mechanism itself
   (recomputes the blocking column fresh every call) and by the new test's
   explicit 3px-off placement, not just asserted.
2. **No movement/positioning change** — `git show`'s diff touches only
   `rules/mining.js`; `rules/player.js` has zero changes.
3. **No regression** — `npm run check`'s hardness-at-8-framerates,
   7,200-frame collision fuzz, fall-damage table, and determinism probes all
   re-run here, all still green, alongside `check:content`, `lint`, and the
   full 49-test suite.
4. **No double-mining** — the fix retargets rather than mining both columns
   at once; each column still costs its own full hardness time, sequentially,
   confirmed by the code's own logic (one `target` chosen per resolve, not
   two tiles credited per swing).

## The re-baselined screenshot, viewed directly

Compared the old and new `digging-desktop-darwin.png` myself rather than
trusting the report. The new baseline unambiguously shows the fix working:
the player stands at the bottom of a real dug shaft roughly 5 meters into
the topsoil (HUD depth gauge reads "5M"), with visibly accumulated burden
(3.8/40 T) from the ore/gravel picked up along the way — a completely
different, correct outcome from the old baseline's "player standing at
ground level, no shaft, nothing mined." This is exactly what a fixed bug's
before/after should look like.

## Checks reconfirmed independently

`npm run check`, `npm run check:content`, `npm run lint` all re-run here
against the final state, all green.

No unexplained scope violations: diff is confined to `rules/mining.js`,
`tests/**`, and `docs/FINDINGS.md`, matching the assigned ownership exactly.
