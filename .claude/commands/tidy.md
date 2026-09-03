Tidy the comments and JSDoc in $ARGUMENTS. Do not change executable code.

Apply the comment and JSDoc rules from CLAUDE.md exactly as written.

PHASE 1 — inventory. Read the files, then output a table with one row per
comment block and JSDoc block: location, abbreviated content, disposition.
Dispositions are exactly:

  KEEP      earns its place under the CLAUDE.md categories
  TIGHTEN   right information, too many words — give the replacement
  DELETE    violates the rules and the content is worthless
  → CLAUDE  operational fact a future agent needs but a human reader doesn't:
            file ownership between subagents, which module owns which canvas
            layer, dev-server quirks, debugging gotchas that cost an hour.
            Destination .claude/notes/<topic>.md
  → DESIGN  rationale for a mechanic or a balance decision → DESIGN.md
  → SPEC    a behavioural contract currently only documented in a comment
            (tick order, save-format field, registry schema) → SPEC.md
  → ADR     an irreversible technical decision with alternatives considered
            → docs/adr/NNNN-<slug>.md

Test for CLAUDE vs the human-facing three: would a new human collaborator care,
or only a future agent at a terminal? Do not create a parallel docs tree —
SPEC.md and DESIGN.md already own their material; find the right existing
section and extend it.

Flag separately, above the table: every commented-out code block you found
(comment text containing `;`, `=>`, `function`, or a brace pair). These are all
DELETE, but I want to see them listed before they go.

Stop after the table. Wait for my approval.

PHASE 2 — apply. Edit comments and JSDoc only. Every routed item must appear at
its destination before it leaves the source. Read the destination file first and
extend the relevant section rather than appending a near-duplicate; consolidate
instead of appending once a .claude/notes file passes ~200 lines.

PHASE 3 — verify. For each touched .js/.mjs file:

  git show HEAD:<path> > /tmp/old.js
  node tools/ast-same.mjs /tmp/old.js <path>

Report git diff --stat and the per-file AST result. If any file reports CODE
CHANGED, show that file's diff and stop. Nothing else — no praise, no summary
of what the code does.