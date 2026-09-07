# Two things learned about running agents concurrently in this repo

Salvaged from `docs/FINDINGS.md` when its orchestrator-process notes were
trimmed as session narration rather than open work items.

## Disjoint FILE OWNERSHIP is not enough to run agents concurrently unless they're isolated

Two agents were run concurrently against the same working directory
(no `isolation: "worktree"`), reasoning that their FILE OWNERSHIP blocks
were disjoint (one owned `data/`, `model/run.js`, `rules/placement.js`,
`shell/*`; the other owned `view/hud.js` only). That reasoning was
insufficient: the first agent detected mid-task that `view/hud.js` (owned by
the other agent) had uncommitted changes, and used `git stash`/`stash pop`
to isolate its own diff before committing. Both agents shared the SAME
working directory, so the stash snapshotted and restored the ENTIRE tree,
not just the files the first agent intended to touch — the second agent's
files were repeatedly reset to HEAD mid-session as a result, recovered only
because it happened to notice via its own `git status` checks and
re-applied its edits from context before committing. It worked out, but by
vigilance, not by design.

**The rule this produced**: disjoint FILE OWNERSHIP does not justify running
agents concurrently in a shared, non-worktree checkout — any `git
stash`/`checkout`/`reset` one agent runs to manage its own working state
affects every other agent's uncommitted files too. Either serialize agents
that might touch git state at all (the default, safe choice), or launch
concurrent agents with `isolation: "worktree"` so each gets its own working
tree and git-level operations can't cross-contaminate.

## A concurrent, out-of-scope edit to a file under test can look like your own diff

While one change was in progress, a second, unrelated task was independently
and concurrently editing `src/view/hud.js` (removing the always-on pocket
strip in favour of a burden bar — explicitly out of scope for the first
change). `src/view/hud.js` and its one dependent test assertion were left
completely untouched by the first change — reverted back to their in-flight
state after a scratch verification pass, never committed — precisely
because that file was not the first task's to touch. Worth remembering: a
`hud.js` diff appearing alongside an unrelated commit in history can belong
to a different, concurrently-running change entirely, not to the commit it
appears beside.
