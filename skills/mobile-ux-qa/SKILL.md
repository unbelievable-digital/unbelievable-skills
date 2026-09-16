---
name: mobile-ux-qa
description: Use when auditing a web project's mobile user experience — running mobile QA, checking how a site behaves on phones in portrait and landscape, hunting for layout breakage, tap-target and safe-area problems, or producing a mobile UX report. Triggers include "mobile QA", "mobile UX audit", "check this on mobile", "does this work on phones", "mobile-first review", "responsive QA", "test on iPhone", "landscape broken", "foldable".
---

# Mobile UX QA

Audit a web project the way its users actually meet it: on a phone, one thumb, in
both orientations. Produces a report of what is broken, where, on which device,
and a suggestion for each item.

This skill assumes a **mobile-first** posture. Desktop is not the baseline that
mobile deviates from — the phone is the product and the desktop is the edge case.
Frame findings accordingly.

## When to use

- Before shipping a release on a project whose traffic is mostly mobile.
- After a redesign, a CSS framework upgrade, or a layout refactor.
- When someone reports "it looks wrong on my phone" and you need to reproduce it
  across a matrix rather than one device.
- As a recurring check on a site that changes often.

## When NOT to use

- Visual regression against a baseline (this skill has no baseline; it judges
  each run on its own).
- A full accessibility audit — this covers the mobile-relevant subset only. Use a
  dedicated axe-based pass for WCAG conformance.
- Desktop-only or admin-panel projects.

## Prerequisites

Node 18+. Playwright is installed by step 1 if it is missing.

Two browser engines are required, and the reason is not optional detail: iOS runs
WebKit, Android runs Chromium, and a large class of iOS defects — zoom-on-focus,
`100vh` under the address bar, safe-area resolution — simply do not reproduce in
Chromium. Auditing an iPhone viewport in Chromium produces a clean report and a
broken site.

---

## Steps

### 1. Ensure Playwright is available

```bash
npx playwright --version 2>/dev/null || npm i -D playwright
npx playwright install chromium webkit
```

Install into the project being tested, not globally. If the project has no
`package.json`, install into a scratch directory and run the script from there
with `--url` pointing at the target.

### 2. Resolve the target

In order of precedence:

1. A URL the user gave you → pass it as `--url`.
2. `baseUrl` in `mobile-qa.config.json`.
3. Otherwise start the project's dev server yourself: read `package.json`, run
   the dev script in the background, wait until the port answers, and use that.

Confirm the target actually serves the app before running the full matrix. One
`curl -sI` beats twelve failed runs.

### 3. Write the config

Copy `assets/mobile-qa.config.example.json` into the project root as
`mobile-qa.config.json` and fill it in. Ask the user which pages matter — do not
guess, and do not crawl. A checkout flow audited at three URLs the user chose is
worth more than forty routes discovered automatically.

Add `states` for anything whose defects only appear after an interaction. This is
where most real mobile breakage lives:

- the navigation drawer open
- a modal or bottom sheet open
- an input focused, so the keyboard is up
- the page scrolled past the point where the header goes sticky

A page audited only in its initial state is a page audited at its best moment.

**Credentials never go in the config file.** Use `valueFromEnv` and pass them in
the environment. The config is committed; the environment is not.

### 4. Run the audit

The runner lives next to this file. Where "next to this file" is depends on how
the skill was installed, so resolve it once and reuse the variable:

```bash
QA=$(find ~/.claude/plugins/cache ~/.claude/skills "$PWD/.claude/skills" \
     -name mobile-qa.mjs -path '*mobile-ux-qa*' 2>/dev/null | head -1)
```

When the skill is loaded as a plugin, `$CLAUDE_PLUGIN_ROOT` points at the plugin
root and `$CLAUDE_PLUGIN_ROOT/skills/mobile-ux-qa/scripts/mobile-qa.mjs` is the
runner — prefer that when the variable is set.

Run it from the directory of the project under test, because that is where
Playwright is resolved from and where the report is written:

```bash
node "$QA" --config mobile-qa.config.json
```

Useful flags:

| Flag | Effect |
|------|--------|
| `--url <url>` | Override `baseUrl` |
| `--pages /,/cart` | Override the page list, no config needed |
| `--devices all` | Add Pixel 7 and the folded iPhone Duo |
| `--tablets` | Add iPad mini and iPad Pro 11" |
| `--perf` | Run the performance group, throttled (Chromium only, slower) |
| `--no-fold` | Skip the iPhone Duo fold-transition check |
| `--fail-on blocker,high` | Exit 1 when those severities are present |
| `--headed` | Watch it run |

Default exit code is 0 even with findings. This is a reporting tool; it fails a
pipeline only when asked to.

Output lands in `qa-reports/<timestamp>/` inside the project under test:
`findings.json` plus a `screenshots/` directory.

Add `qa-reports/` to the project's `.gitignore` unless the user wants the history
committed.

### 5. Look at every screenshot

**This step is not optional and cannot be delegated to the rules.**

Read every PNG in `screenshots/`. Each run produces two: `<run>.png` is the full
page, and `<run>--viewport.png` is the first screen only.

Judge fixed and sticky chrome from the **viewport** shot. A full-page capture
repaints fixed elements at each scroll position, so a sticky header appears
several times down the image. That is a capture artefact, not a defect — do not
report it.

The rules in step 4 measure what is measurable; they do not see whether the page
looks right. Things only this pass catches:

- A layout that is technically within tolerance and still ugly — mismatched
  gutters, an orphaned heading, a card grid with a single item stranded on the
  last row.
- Text over an image where contrast is unreadable (the contrast rule skips these
  rather than guessing).
- Content clipped rather than overflowing, so no overflow rule fires.
- Visual hierarchy that collapses at a narrow width, leaving everything the same
  weight.
- The open iPhone Duo at 626px: a single column of content floating in a space
  designed for 375px, with enormous empty margins. No rule fires. It looks wrong.
- Anything simply broken in a way nobody wrote a rule for.

Compare the same page across devices side by side — a defect often only becomes
obvious next to the version that works. For the fold transition, compare
`*-1-folded.png` against `*-2-unfolded.png` directly.

Record what you see as findings in the same shape as the automated ones, marked
as observed visually. Reference the screenshot filename so the reader can check
your judgement.

### 6. Write the report

Write `qa-reports/<timestamp>/report.md`. Structure:

```markdown
# Mobile UX QA — <project> — <date>

Target: <url> · Devices: <n> · Pages: <n> · Runs: <n>

## Summary

<Two or three sentences. The worst thing found, whether the site is shippable
as it stands, and the single change with the largest payoff.>

| Severity | Count |
|----------|-------|
| BLOCKER  | n |
| HIGH     | n |
| MEDIUM   | n |
| LOW      | n |

## Findings

### 1. [BLOCKER] <what is wrong, in plain words>

**Where:** `/checkout` · iPhone SE landscape, Galaxy S8+ landscape
**Element:** `form.checkout > button.submit`
**Evidence:** `screenshots/checkout__email-focused__iphone-se-landscape.png`

<What happens to the user. One or two sentences, concrete.>

<Measured numbers, if there are any.>

*Suggestion:* <a light touch — "this would probably sit better as a sticky
footer button so it clears the keyboard" rather than a prescribed patch.>

---

## Not investigated

<Anything deliberately out of scope, and why.>
```

Rules for the report:

- **Group by defect, not by run.** One heading per problem, listing every device
  it appears on. Twelve runs finding the same 38px button is one finding.
- **Order by real impact, not raw severity.** A MEDIUM on every device usually
  beats a HIGH on one. Say why the order is what it is.
- **Suggestions stay light.** "This would be better as X" — a direction, not a
  patch. The person who owns the code knows constraints you do not. Never write
  the fix as if it were decided.
- **Link the screenshot for every finding.** The evidence is what makes the
  report actionable rather than arguable.
- **State what you did not check.** A report that implies total coverage is
  worse than one that names its gaps.

### 7. Offer the follow-up

Say plainly whether the site is shippable. If there are BLOCKERs, say so first
and without hedging.

If a finding needs closer inspection than a screenshot allows, rerun the single
case with `--headed` and drive it manually, or use the Playwright MCP tools to
step through the flow. The script is the broad sweep; manual driving is the
follow-up on anything ambiguous.

---

## Reference

- `references/devices.md` — the device matrix, why each device is in it, engine
  pairing, and the iPhone Duo's CSS viewport figures with sources.
- `references/checks.md` — every rule, its threshold, its severity, and the
  reason behind the threshold. Read this before disputing or explaining a
  finding.

## Failure modes

| Symptom | Cause | What to do |
|---------|-------|------------|
| `Executable doesn't exist` | Engine not installed, or the installed build does not match the Playwright version | `npx playwright install chromium webkit` |
| `Playwright is not installed in <dir>` | The runner resolves Playwright from the working directory | Run it from the project under test after `npm i -D playwright` |
| Every run fails on navigation | Dev server not up, or wrong port | `curl -sI <url>` first; check the dev script's real port |
| Hundreds of contrast findings | Design system uses a low-contrast palette deliberately | Report it once as a systemic finding, not once per element |
| Zero findings on a real site | Pages behind auth returned a login page | Check `auth` in the config; look at the screenshots to confirm what was captured |
| `State "x" is not defined` | A page lists a state with no matching entry in `states` | Add it, or remove the reference |
| Fold check reports stale blocks on a correct site | Layout is genuinely fixed-width at that size by design | Verify against the two screenshots, then drop the finding and say why |
| Screenshot is a blank white page | Captured before content painted, or a lazy-loaded route | Add a `{ "waitFor": "<selector>" }` step to the page's state |
| Header appears several times down a screenshot | Full-page capture repaints fixed elements per scroll position | Capture artefact, not a defect. Judge chrome from the `--viewport.png` shot |
| Run takes very long | Full matrix × pages × states × `--perf` | Drop `--perf` for the sweep and rerun it alone on the two pages that matter |

## Scope

Deliberately excluded: visual regression baselines, full WCAG conformance, real
device clouds, multi-language layout checks, and network-level security. Each is
a separate concern and, where useful, a separate skill.
