# Review — drop phone viewport support

**Verdict: pass.**

Independently reconfirmed: `grep -rni "phone" tests/ playwright.config.js`
returns nothing; `npm run check` and `npm run check:content` (157 checks)
both pass; the full Playwright suite is now 44 tests (down from 88 with two
projects) and all pass, including parity.

The `src/` audit's conclusion — no genuinely phone-only code existed,
`core/canvas.js#resize`'s size floors and `view/hud.js`'s narrow-panel clamp
are general small-window safety handling rather than phone-specific — is
correct and appropriately conservative: this was a scope reduction in what's
*tested*, not a licence to make the game brittle at a small desktop window.
Historical mentions of the phone project in `CLAUDE.md`/`docs/BUILD_PLAN.md`
(war stories about past bugs, or records of completed phase work) were
correctly left alone rather than scrubbed, since they remain valid regardless
of current viewport support.

No unexplained scope violations.
