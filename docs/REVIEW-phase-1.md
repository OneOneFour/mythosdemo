# Review — Phase 1 (extend the registry)

**Verdict: pass.**

## Against the spec

- No `data/items.js`/`data/entities.js` created; all new content is append-only
  rows on `substances.js`/`forms.js`/`recipes.js`/`tuning.js`, per the rule.
- Tile-byte guard: reported headroom (19 substances remaining, down from 29)
  independently re-derivable from the stated `STRIDE` arithmetic; `npm run
  check` doesn't throw at import, which is the guard's own proof.
- `tools/content.mjs` exists, composed into `npm run check` section 1b, and
  runnable standalone via `npm run check:content`. The lint-can-fail proof was
  actually performed (kindle pointed at a nonexistent tag, reverted after
  confirming failure) rather than asserted without evidence.
- All four definition-of-done checks independently reconfirmed here: `npm run
  check` (71 checks, 0 layer violations), `npm run check:content` standalone,
  `npm run test:visual` (48/48).

## The orphan-check fix held

The assertion-5 rescoping (declared pairs, not the full `crossable()` tag
space) was implemented as specified in the corrected `docs/BUILD_PLAN.md`
text, and it's why `adamant`'s `metal` tag shipped without incident — nothing
declares `adamant/ore|ingot|plate` as an output or cost this phase, so under
the corrected scope there was nothing to flag. Confirms the pre-implementation
fix was the right one and not just theoretically sound.

## Two self-caught deviations, both correctly handled

1. **`brand` massK 0.3, not the planned ~0.5.** The mass-conservation
   assertion (6) caught that `kindle` (1 log -> 3 brands) would net *more*
   mass than it consumed at 0.5 — exactly the bug class that check exists for.
   Correcting the number rather than reaching for `transmute:true` is the
   right call: nothing is being created here, only split lighter, so a
   transmute exemption would have hidden a real numbers bug instead of fixing
   it.
2. **Two visual baselines re-accepted, with real root-causing, not a shrug.**
   `map.png`'s diff is the new content actually appearing, which is the
   test's whole purpose. `digging.png`'s ~20px shift was chased to its actual
   cause — worldgen's single fixed `rand()` stream means any change to a
   band's `strata` array reshuffles every later draw, including item-toss
   scatter in an unrelated band — and confirmed by reverting just that one
   change and watching the diff disappear. Correctly identified as invariant 7
   working as designed (still bit-reproducible from the seed; the seed now
   produces a different but equally deterministic result) rather than a
   purity regression, and cross-checked against `npm run check`'s own
   determinism probes, which still pass. Flagged in `docs/FINDINGS.md` as a
   standing fact future phases should expect, not just this one's surprise.

No scope violations: diff is confined to the FILE OWNERSHIP block plus the two
baseline PNGs the spec's own acceptance criterion anticipated might move.
