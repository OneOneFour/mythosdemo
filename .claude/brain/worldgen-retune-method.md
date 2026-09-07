# The 14b ore-count retune: what went wrong and how it was fixed

Salvaged from `docs/PLAN-phase14-mining-and-drops.md` D14-F when that section
was trimmed. The live numbers are `docs/SPEC.md` §16.5/§19.7; this is the
method that produced them, kept for the reasoning rather than the result.

D14-F's original table divided every `data/world.js` `blobs` count by
`tile.charge`, on the assumption that ore units scale with `count × charge`.
That arithmetic ignored `rules/generate.js#blobs`'s lining behaviour
(SPEC §16.4): a hollow is lined whenever `line:true` is set, independent of
`count` — so a row with `count:0` still lines — meaning the lining term is a
**fixed floor the retune does not touch**. Dividing only the count left that
floor whole, and measured over 200 seeds the divide-by-charge table landed
+43.2% / +34.5% / +36.5% / +35.7% / +31.7% against the pre-14b cell totals
(surface copper, topsoil copper/tin/granite/adamant) — outside the ±10% band
SPEC §6.4 sets, on all five rows.

The fix: solve against the measurement instead of the arithmetic. Two
iterations — one linear fit per row against two measured points, then one
verification pass — landed shipped counts of 5 / 34 / 26 / 19 / 15, measuring
+2.6% / −1.4% / −1.3% / −0.6% / −2.9%. Those are the counts `data/world.js`
ships today.

The one row the original table got right without this process: `vein`
(`r:2.4, n:1`), which measured 6.0 cells / 24.0 units over 200 seeds exactly
as predicted — a single star doesn't interact with the lining floor the way
a multi-cluster `blobs` row does.
