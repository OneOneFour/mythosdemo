# Why each content-lint assertion is shaped the way it is

Salvaged from `tools/content.mjs` when its per-assertion essays were cut to a
few lines each. The source keeps what the assertion proves; this keeps the
argument for its shape, the rejected alternative, and the silent failure it was
written against. Method for assertions in general is
[[harness-assertion-method]].

## The recurring rule: a lint may not learn its vocabulary from the data

Assertions 10, 18, 19, 20 and 26 each hardcode a closed set —
`'suppress'`/`'invert'`, `carries`, the four draft tiers, the three terrain
buckets, the two miracle kinds. Every one of those sets is defined by call
sites in `rules/`, not by content. Deriving the set from the table being linted
makes any typo self-justifying.

## 15 — `look` blocks

Three file headers used to claim a `tools/resolve.mjs` failed an unknown `fn`
"at build time rather than drawing nothing at depth 300". There was no such
file, and grepping `check.mjs` for `colour`, `palette`, `treat` or `fn`
returned nothing. The claim was made true by writing this assertion.

## 16 — the tile byte

`data/forms.js`'s import-time guard used to price every substance row as if it
were tile-capable, and so refused content over a cost nothing was paying. It
now measures from the highest PACKABLE ordinal, which is derived from the
tables and cannot go stale — and which depends on a fact that file cannot check
for itself. The assertion is that fact. What keeps the eight machine
substances, the three relics and the miracle off the byte is precisely that
none of them crosses with a tile-capable form.

## 21 — deposits

Written against obtainability rather than crossability. `stair`'s
`subTags:['metal']` legitimately admits `adamant/stair` — a legal pair nothing
produces, kept because adamant carries `metal` for a future smelt path its own
row describes. Asserting mere crossability would flag it, and the honest fix
would then be to weaken the rule.

`copper/stair` is the one named exemption and a real design decision.
`data/recipes.js#daedalan` is the tier-2 ladder, `data/forms.js#stair` is
written around it, and `model/tiles.js#baseChargeOf` handles it explicitly:
charging a placed stair by its substance would turn one stair into four on the
way back out. The exemption is per-PAIR, so a `tin/stair` recipe or a
`granite`-admitting form still fails the build.

## 23 — hand-recipe shadowing

The assertion shipped with three named exemptions — `peg_rungs` and `kindle`
both shadowing `daedalan`, and `kindle` shadowing `auger` — because fixing them
by reordering alone would have traded one dead recipe for another. Repricing
the two bills instead (`daedalan` to 3 plate + 1 log, `kindle` moved below
both) retired all three, so there is no allowlist at all now and any shadowing
pair fails the build.

The test is sound rather than complete: it can miss a shadowing where two
clauses of the shadowing row are answered by one pocketed pair. It never
invents one.

## 24 — `tile.roots`

Stated over the FORM table rather than as a comment on the `seed` row, for the
same reason assertion 22 is stated over every substance: the row that breaks it
is the row someone adds next, by copying the nearest existing one, and a
per-row reminder cannot reach that row.

## 25 — machine reachability

Both halves exist because the first half alone went green over the bug that
motivated it. `kiln_divine` was named by the only `GRANTS` row there was, and
`machineHeldSub('kiln_divine')` is undefined, so `placementCheck` refused it
'NOTHING BUILT YET' at every depth for ever. `talos_head` and `cyclops_maw`
were the other half: three tables each and no grant anywhere, which also made
their recipes permanently unknown, since `isKnown` gates a machine-build recipe
on `canPlace`.

## 27 — debug scenarios

Not checked, deliberately: footing, and whether the path between two hubs is
clear. Both are questions about live tiles after the carve rects apply, and
re-deriving the generated world inside a lint would be a second worldgen.
`linkCheck` asks the path question at apply time and journals its refusal;
footing is proved by driving each scenario by hand.

## 28 — strata windows

Checked as DECLARED, not as shifted. `heightmap()` moves both bounds by the
same per-column offset, so a declared window inside the band can still clamp at
a hilltop — that is worldgen's business, and `tools/worldgen-check.mjs`'s
density floor measures it. What no tool saw is a row whose window is outside
the band before a single column is shifted.

See also [[machine-rows]], [[substance-rows]], [[recipe-order-and-worldgen-numbers]].
