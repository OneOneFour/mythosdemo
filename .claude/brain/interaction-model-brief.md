# The brief that set the Phase 12 interaction model

Verbatim user messages, salvaged from `docs/PLAN-phase12.md` §1 when that
section was trimmed to a pointer.

**Message 1** (typos preserved; treated as written per the task instruction):

> under the KEYS menu please audit all keys. I want 'e' to be inventory open,
> 'r' to be action (i.e crank wrench or whatever), then that should be it.
> 'craft' should just be LMB after selecting an item, 'z' to cancel, 'q' can
> till be drop selected item. by defauly items shouldn't be picked up, press
> 'c' to collect, maybe in inventory there can be an 'auto collect' toggle
> THEN there should be no 'equip' button needed or 'use' button or really 'x'
> for dig is also not needed as is 'u' for craft (unneeded) remove these

**Message 2**, the quickbar clarification, same breath:

> For the quickbar, what I want working is that the quickbar is like an
> extension of inventory that's just always there on screen!

**Message 3**, the explicit ask:

> These might neded to be major changes, can you plan and add as phase 12!

What this resolved to: **`e`** = open/close the inventory panel (was `i`).
**`r`** = a generic "hold to act on a placed machine" verb (was `f`, the
crank turn). **LMB** = one contextual action covering mining, placing, using
a miracle and the craft-queue click, since `x`/dig, `v`/use, `p`/equip and
`u`/craft were all named for removal with nothing else offered to replace
mining or miracle-use. **`z`** = cancel a selection (new). **`q`** = drop,
unchanged. **`c`** = manual collect (new), replacing the always-on magnet
with an opt-in AUTO COLLECT toggle. **Removed outright as dedicated keys**:
`x`/`j` (dig), `u` (craft), `p` (equip), `v` (use miracle) — their mechanics
moved onto LMB or an existing redundant path. The quickbar became a live,
unassigned mirror of whatever the player currently holds.
