# Review — machine status/hover/right-click-deconstruct, lifecycle tests

**Verdict: pass**, plus one serious pre-existing bug surfaced that's worth
fixing immediately rather than filing away.

## Warning badge and hover — verified in code, not just by eyeballing screenshots

The rendered screenshots are small enough that a `!` glyph at font scale 1 is
genuinely hard to confirm by eye in a chat-embedded image — read the actual
diff instead. `view/paint.js#paintMachine`'s new line is a clean, correctly
gated boolean: `if (statusOf(m) === 'no-fuel') drawText(g, '!', ...)`, using
`INK.warn` = `colour('uiHeart')` — the same red already used for hearts and
refusal text elsewhere, a real reused semantic colour, not a new one-off.
This will unambiguously stop drawing the instant `statusOf` returns anything
else; no separate visual confirmation needed beyond confirming the gate
exists and is correct, which it is. The hover text is unambiguous by
inspection of the screenshot itself: stage 5's tooltip overlay plainly reads
"CRUDE FURNACE / RUNNING / MAKING SMELT" in the screenshot — directly
legible, not something requiring pixel-level scrutiny.

## Right-click deconstruct — correctly scoped, reuses existing dispatch

Read the diff directly: `aim`/`machineAt` are checked before falling back to
the old unconditional `cmd.place = true`, and the flag set
(`cmd.deconstruct`) is the exact same one `Backspace` already sets, consumed
by the exact same `rules/placement.js#deconstruct` — a second input source,
not a second implementation. The `uiRight` (panel-open) path is untouched,
confirmed by the diff not touching that branch at all.

## The digging-stall bug — real, well-diagnosed, and significant enough to fix now

This is not a minor edge case: `rules/mining.js#aimAtKeys` targets a single
centre column while `rules/player.js#boxSolid` requires BOTH hitbox-straddled
columns clear before `onGround` goes false, and ordinary continuous movement
(this game's own stated design — no acceleration, no grid-snapping) gives no
reason `player.x` would ever land on a tile-aligned multiple. That means any
player digging straight down with keyboard-only controls (holding `down` +
dig) will, in the overwhelmingly common case, break exactly one tile and then
get permanently wedged — which is exactly the shape of the existing, already
-accepted `digging.png` baseline (player standing at ground level, no visible
shaft, after 900 held substeps). This has apparently been silently broken
since that baseline was first taken, undetected because: mouse-driven aim
(`aimAtWorld`) tracks the cursor dynamically and likely papers over it during
real mouse-and-click play, and this session's own scripted verifications
mostly drove mining through direct model calls or ladder-based descent, not
sustained keyboard-only vertical digging.

Given the user's own request was specifically to verify "digging straight
down... works correctly," and it demonstrably does not for the input method
most likely to be used for a sustained vertical dig, this is being fixed as
an immediate follow-up rather than left as a filed finding.

## Checks reconfirmed independently

`npm run check`, `check:content` (157 checks), `lint`, and the full
Playwright suite (48/48, desktop-only) all re-run here, all green.
