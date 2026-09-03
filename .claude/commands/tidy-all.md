Tidy every source file in the repo that needs it, in batches.

PHASE A — build the queue. Run:

  git ls-files '*.js' '*.mjs' | grep -v node_modules | xargs -I{} sh -c \
    'printf "%s %s\n" "$(grep -cE "^[[:space:]]*(//|\*|/\*)" {})" {}' | sort -rn

Drop files with a count under 5 — not worth a pass. Group the rest into batches
of at most 5 files, batching by directory so related files land together, and
order batches by total comment count descending. Put data/*.js last regardless
of count.

Show me the batch plan: batch number, files, comment counts. Stop.

PHASE B — for each batch in order, run the /tidy process from
.claude/commands/tidy.md in full: inventory table, my approval, apply, AST
verify. Then commit that batch alone as `tidy: <directory or file>` and move to
the next batch without waiting for further instruction.

Track progress in .claude/notes/tidy-progress.md — batch list, and each batch
marked pending/done with its commit sha. Update it after every commit so an
interrupted run can resume.

If any batch reports CODE CHANGED, stop the whole run and show that diff.