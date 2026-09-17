# Shell wiring — reasoning removed from `src/shell/` comments

Salvaged during a comment-only pass. None of this belongs in source comments;
it is here so a future session need not re-derive it.

## Why the save payload is the seed plus the edits

Serialising the per-band `mat` arrays is ~1.3 MB raw for the three shipped
bands and was rejected. `load()` regenerates from the seed and replays the
stored tile edits on top, which is why four separate signatures (`v`, `world`,
`content`, `gen`) exist: the payload only means anything against the generator
that produced it. `gen` in particular catches a rewritten generator without
anyone having to remember to bump a version number.

The body-validation gate was not always as strict as it is now. A `typeof`-only
gate let a `seen` string of `'!!!!'` reach `atob` and throw out of the middle of
the restore with band 0's tile edits already written — and `run` has no
whole-record setter to roll that back. Hence: validate everything, decode the
fog bitset during validation, and never fail during the apply.

`REPLAY_MAX` (1e4) exists because `misses` and `tutorialBeat` restore by
repeated one-way increments (their writers take no argument), so an edited 1e9
would hang the boot rather than corrupt it.

## Why `ui.craftQueue` is session state and not a rules change

`rules/crafting.js` is still a single scalar on `run`, because a player has one
pair of hands. The queue re-asserts that same one intent every frame it is
non-empty; it is not a parallel crafting system. Cancelling refunds nothing
because nothing was spent — no input leaves the pockets until the recipe's
`secs` is reached. The quickbar is likewise not session state: its cells are
the tail of `run.inv` itself.

## Why `autoCollect` / `autoFeed` live in `shell` rather than on `run`

`rules/items.js` and `rules/machines.js` may import only `core`/`data`/`model`,
so neither could read a `shell` flag directly — they take it on `cmd`. Putting
it on `run` instead would need a `RUN_SCHEMA` field for a fact no world-state
fingerprint should carry. Both are simulation-affecting input state rather than
presentation preferences, which is why `newRun()` resets them: surviving a
restart would diverge one seed's two runs.

## Camera clamp

`clampCam`'s Y clamp is against the union of every band, not the current one. A
per-band clamp snapped a full viewport height the instant `player.band` flipped.
X stays per-band because bands differ in width.

## Map offset ownership

`ui.map.x/y` is stored unclamped and clamped by `view/overview.js#transform`
every frame, so there is exactly one answer to "where does the world end". A
second clamp in `shell` would be a second answer. The consequence is that a
held pan at the world's bottom parked the offset thousands of px past the edge
until `mapPan` started clamping its own *seed* through `mapClamp`.

## Draft modal key ownership

The draft branch in the `keydown` handler is first, not merely early: with the
crafting search field focused when a trial paid, the field swallowed 1/2/3/r
into the search string and Escape popped the modal off the stack. Escape is
deliberately not a way out of a draft — an un-taken permanent gift is
unrecoverable, and must not be losable to a reflex keypress.

## Journal-to-toast contention

`toast()` keeps exactly one line and the newest fact wins. A cycle completion
is one frame holding several facts — the last `tribute` credit, the `cycle` row
and two `grant` rows — so the god's own line was guaranteed to be overwritten
inside its own frame. That is why `cycle` takes the banner slot and has no
`TEXT` row, and why `debt` is usually superseded by the `hurt` row `miss` pushes
immediately after it (the hurt line carries the more urgent number; the debt
row's sound and chips still land).
