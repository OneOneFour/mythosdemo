# Review — comment audit, developer guide, and the trim execution

**Verdict: pass.** This was a large, low-risk-by-design task (comment-only,
no logic changes) and it delivered on that promise: zero behavioral or
visual changes across the entire trim.

## The planning pass

`docs/COMMENT_AUDIT.md` classified 794 multi-line prose blocks into four
buckets with an explicit bias toward keeping anything that might be a
load-bearing gotcha (confirmed: bucket 2 was the largest single bucket, and
the audit's own summary states this plainly rather than as an afterthought).
`docs/DEVELOPER_GUIDE.md` is genuinely excellent — organized around real
tasks ("Adding a machine," "The four gift tiers," "Layer rules that will
fail your build"), every claim backed by a real file:line pointer to the
canonical example rather than a paraphrase. `.claude/brain/notes.md` is
correctly scoped as subordinate scratch material, with its authority level
stated plainly at the top of the file so a future session can't mistake it
for policy.

## The execution pass — verified independently, not just trusted

Reconfirmed directly: 5 commits (`708ae35` through `ffab4e2`), working tree
clean, `npm run check`/`check:content`/`lint` all pass, and the full
Playwright suite (48/48) passes with **zero snapshot changes** — the
strongest possible evidence this stayed comment-only, since any accidental
logic change would almost certainly have moved at least one screenshot given
how much of this codebase's behavior renders visibly.

Spot-checked `data/machines.js`'s header directly: the key reference
(bucket 1, kept) reads as a clean, complete row-shape reference on its own,
with a single pointer line to the guide for the deeper "why" — exactly the
intended shape, not a stub that lost information.

## The two self-flagged judgement calls — both reasonable, one genuinely correct rather than a compromise

- **`model/machines.js#statusOf`'s "memoised" pointer to §Buffers and
  pockets**: checked this directly — it's *correct*, not a fallback. The
  function's own behavior (`'running'|'no-fuel'|'idle'`) is fully documented
  in its own kept docstring; only the *memoization pattern* aside points
  elsewhere, and the guide's Buffers and pockets section explicitly names
  `fuelSelectorOf`'s memoization as one of two examples of the same
  precedent. No content gap here at all.
- **`rules/reveal.js`'s Pass A/Pass B structure**: this one is a genuine,
  minor organizational gap — the guide has no dedicated "sight and fog"
  section, so the agent correctly chose to keep a compact factual version in
  source rather than point at a heading that doesn't fully cover the claim.
  This loses no information (the fact survives in source, just not also
  centralized in the guide) — a nice-to-have follow-up, not a defect.

## A bonus fix, correctly scoped

Caught and fixed a stale `data/boons.js#STARTING_MACHINES` reference in
`rules/placement.js` left over from the Phase 4 rename to `data/grants.js`
— exactly the kind of accuracy check this whole exercise was worth doing
for, done in passing rather than out of scope creep (it was directly in the
sentence being rewritten anyway).

## Gap-filling against `.claude/brain/notes.md`

Two facts the original audit assigned to bucket 4b were not actually present
in the notes file yet; both were added before the source comment was
deleted, closing the exact gap this two-pass design exists to prevent
(classification and execution were different passes; a fact could have
fallen through the seam between them, and one did, and was caught).

No unexplained scope violations. This closes out the comment-cleanup task
cleanly.
