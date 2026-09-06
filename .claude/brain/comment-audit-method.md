# Comment audit method

Salvaged from `docs/COMMENT_AUDIT.md` (deleted — a 794-row classification
worksheet, fully executed across commits `708ae35`…`ffab4e2`; its `file:line`
column went stale the moment any listed file was edited again, which the
`tidy:` commits did repeatedly). The taxonomy and the measured distribution
below are the only durable part and are directly reusable by the next
comment-tidy pass.

**Buckets**

| code | meaning | action |
|---|---|---|
| `1` | KEEP — docstring. Factual description of what a thing is / param / return / row shape. | none |
| `2` | KEEP — gotcha. Non-obvious constraint, ordering requirement, recorded bug at the exact line where a plausible "fix" would reintroduce it. | none |
| `3` | EXTRACT — developer guide. Reusable pattern prose. | replace with pointer to `docs/DEVELOPER_GUIDE.md#<anchor>` |
| `4b` | EXTRACT — brain. Real observation or revisitable decision, not needed by a reader of the code. | move to `.claude/brain/notes.md` |
| `4t` | TRIM — redundant. Process commentary, phase/file-ownership narration, restatement of what another doc already says. | delete, no replacement |

A block spanning two buckets is marked `1+3`, `2+4t` and so on. **`LAYER x —
... Imports ... May be imported by ...` declarations are always `1` and never
trimmed**, even when the rest of their block is `3`.

**Distribution, approximate**, from a 794-block pass over `src/`, `tools/`
and `tests/`: roughly 270 `1`, 220 `2`, 95 `3`, 70 `4b`, 140 `4t`. The shape
that matters: **`2` is the largest bucket and most of `src/rules/` and
`tests/` is in it** — expect to remove far less than the raw comment volume
suggests.
