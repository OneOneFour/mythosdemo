Bug report: $ARGUMENTS

PHASE 0 — intake. Do not investigate yet. Do not read code yet.

Decide whether the report is actionable. It needs: what was expected, what
happened instead, and how to reach it. If any is missing, ask me for it and
stop.

Ask me for a screenshot now if the symptom is visual — anything about sprites,
tiles, lighting, layering, the HUD, or wrong-looking rendering. The investigator
cannot ask you later. Also ask now for: the seed if the bug may be
generation-dependent, the save file if it appeared mid-run, and the console
output if anything threw.

Then stop and wait, unless the report was already complete.

PHASE 1 — dispatch. Launch the bug-investigator subagent with the full report
and any artefacts I supplied. Always dispatch, even when the cause seems obvious
to you — your first-pass instinct is what this command exists to check. Do not
read the implicated files yourself before dispatching; you will anchor on the
same wrong answer.

Relay the investigator's report to me verbatim. Then add, separately and
briefly, only where you disagree with it or think it missed something.

PHASE 2 — audit. Wait for my approval before editing anything.

If confidence is low, or root cause is unisolated, propose the cheapest
experiment to discriminate between the surviving hypotheses — a log line, a
one-value change, a git bisect range — and stop.

PHASE 3 — fix. On approval, apply the minimal change addressing the root cause.
Also fix every instance found under blast radius, or state why you are leaving
them. Do not refactor surrounding code. Do not fix unrelated things you noticed.
No `// Fixed: ...` comment — a comment goes in only if it meets a category in
CLAUDE.md, and "this used to be broken" is not one.

If the fix touches a registry entry or save-format field, check whether SPEC.md
states the contract and update it if the code was right and the spec was stale.

PHASE 4 — verify. State how to reproduce the original symptom and confirm it is
gone, then run the game's checks (`npm test`, `npm run lint`) if they exist.
Show `git diff`. If the bug was seed- or save-dependent, confirm against the
same seed or save.

Report the diff and the verification result. No summary of what you learned,
no restatement of the fix in prose.