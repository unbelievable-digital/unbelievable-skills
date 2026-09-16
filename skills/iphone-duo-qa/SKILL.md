---
name: iphone-duo-qa
description: Use when auditing a website specifically on Apple's foldable iPhone Duo — checking it closed and open, in portrait and landscape, and what breaks when the user folds, unfolds or rotates the device without a reload. Triggers include "iPhone Duo QA", "iPhone 18 Duo", "test on the Duo", "foldable iPhone", "does it break when unfolded", "fold/unfold test", "Duo landscape", "foldable QA".
---

# iPhone Duo QA

Audit a web project on one device only: the iPhone Duo. Four postures, four live
transitions, a report of what breaks, where, and a suggestion for each item.

The Duo is the one iPhone whose viewport changes size mid-session with no reload.
Every phone rule still applies, and on top of that the page has to survive the
user opening, closing and rotating the device while they read. This skill tests
exactly that.

## When to use

- A site is going to be used on the Duo and has never been checked on it.
- Someone reports "it breaks when I open my phone" or "the carousel is cut off
  after I unfold".
- Before shipping a layout, carousel, drawer or sticky-header change on a project
  with iPhone-heavy traffic.

## When NOT to use

- General mobile QA across many phones — use `mobile-ux-qa`. It already includes
  one Duo fold check; this skill is the deep pass on the Duo alone.
- Android foldables (Galaxy Z Fold, Pixel Fold). They run Chromium, have a
  visible hinge and support the Viewport Segments API. The rules here assume
  WebKit and no hinge information.
- Native iOS apps. This audits web pages in Safari.

## Prerequisites

- Node 18+ and Playwright with **WebKit** in the project under test. Set up
  exactly as in `mobile-ux-qa` step 1; only the `webkit` engine is needed.
- The `mobile-ux-qa` skill installed next to this one. The per-page rules
  (overflow, tap targets, keyboard, safe area) are imported from its runner, not
  copied. The `unbelievable-skills` plugin installs both. For a manual install,
  link both folders, or set `MOBILE_QA_CORE` to the path of
  `mobile-ux-qa/scripts/mobile-qa.mjs`.

Everything runs in WebKit, because every browser on the Duo is WebKit. A Duo
audit in Chromium is not a Duo audit.

---

## What gets tested

| Posture | CSS viewport | Why |
|---------|--------------|-----|
| `closed-portrait` | 466 × 678 | The outer screen. A wide-ish phone. |
| `closed-landscape` | 678 × 466 | Very short. Sticky headers and bottom bars eat the screen. |
| `open-portrait` | 626 × 890 | The dead zone: too wide for a phone layout, too narrow for `sm`/`md`. |
| `open-landscape` | 890 × 626 | Crosses `md` (768px) on most frameworks — often a tablet layout on a phone. |

| Transition | Change | What typically breaks |
|------------|--------|-----------------------|
| `unfold` | 466×678 → 626×890 | Carousels and JS-sized blocks keep the closed width |
| `fold` | 626×890 → 466×678 | The same blocks now overflow the narrower screen |
| `rotate-closed` | 466×678 → 678×466 | `--vh` heroes and full-height menus keep the old height |
| `rotate-open` | 626×890 → 890×626 | Layout switches breakpoint while the user is mid-page |

Viewport figures and their sources are in
`mobile-ux-qa/references/devices.md` — the single place they are kept.

---

## Steps

### 1. Ensure Playwright and WebKit

```bash
npx playwright --version 2>/dev/null || npm i -D playwright
npx playwright install webkit
```

### 2. Resolve the target

Same order as `mobile-ux-qa` step 2: a URL the user gave, then `baseUrl` in the
config, then the project's own dev server. `curl -sI <url>` before the run.

### 3. Ask two things, in one message

1. **Which pages matter.** Do not crawl. Ask as well which interactions matter on
   the Duo — an open menu, an open modal, a focused input, a carousel. A drawer
   that is open while the user unfolds the phone is the single most common Duo
   defect, and it is only found if the state is in the config.
2. **Report format.** HTML (one page, tables, before/after screenshots inline)
   or text (`report.md`). Skip the question if the user already said. Default to
   text if there is no way to ask.

### 4. Write the config

The config format is the `mobile-ux-qa` one — copy
`mobile-ux-qa/assets/mobile-qa.config.example.json` to `duo-qa.config.json` in
the project root. If the project already has a `mobile-qa.config.json`, the
runner uses it when no `duo-qa.config.json` exists; do not create a second file
for nothing.

Credentials go in the environment via `valueFromEnv`, never in the file.

### 5. Run the audit

Resolve the runner once:

```bash
DUO=$(find ~/.claude/plugins/cache ~/.claude/skills "$PWD/.claude/skills" \
      -name duo-qa.mjs -path '*iphone-duo-qa*' 2>/dev/null | head -1)
```

When `$CLAUDE_PLUGIN_ROOT` is set, prefer
`$CLAUDE_PLUGIN_ROOT/skills/iphone-duo-qa/scripts/duo-qa.mjs`.

Run from the project under test. With no `--config`, the runner picks up
`duo-qa.config.json`, then `mobile-qa.config.json`:

```bash
node "$DUO"
```

| Flag | Effect |
|------|--------|
| `--url <url>` | Override `baseUrl` |
| `--pages /,/cart` | Override the page list |
| `--postures closed-portrait,open-portrait` | Limit the static postures |
| `--transitions unfold,fold` | Limit the transitions |
| `--no-transitions` | Static postures only |
| `--fail-on blocker,high` | Exit 1 when those severities are present |
| `--headed` | Watch it run |

Runs per page and state: 4 postures + 4 transitions = 8. Output goes to
`qa-reports/duo-<timestamp>/`: `findings.json` and `screenshots/`.

### 6. Look at every screenshot

**Not optional.** The rules measure; they do not see.

Files per page and state:

| File | What it is |
|------|------------|
| `<page>__<state>__duo-<posture>.png` | Full page in that posture |
| `<page>__<state>__duo-<posture>--viewport.png` | First screen only — judge fixed chrome here |
| `<page>__<state>__duo-<transition>-1-before.png` / `-2-after.png` | Full page before and after the resize |
| `…-1-before--viewport.png` / `…-2-after--viewport.png` | The screen the user was looking at, before and after |

For every transition, put the `before` and `after` shots side by side. What
only this pass catches:

- A single narrow column floating in the open screen with wide empty margins —
  the page did not break, it just was never designed for 626px.
- An open-landscape layout that switched to a tablet design which does not fit
  626px of height: a hero that fills the screen, the content below the fold.
- The reading position drifting to unrelated content after a resize. Some drift
  is normal reflow — an emulated resize drifts on correct sites too — but a jump
  to a different section is worth a finding.
- Text or controls sitting exactly on the vertical centre of the open screen,
  where the crease is. Worth a LOW note if it is a primary action.
- Images that stayed at their closed-size resolution and now look soft.

Record visual findings in the same shape as rule findings, marked as observed
visually, with the screenshot filenames as evidence.

### 7. Write the report

Follow `mobile-ux-qa` step 6 for both formats — the structure, the `report.json`
shape, the renderer and the rules for writing findings are the same. For HTML:

```bash
node "$(dirname "$DUO")/../../mobile-ux-qa/scripts/render-report.mjs" qa-reports/duo-<timestamp>
```

If that path does not resolve, find `render-report.mjs` the same way as `$DUO`.
Add `--embed` when the HTML will be sent on its own.

Duo-specific rules for the report:

- **Name the posture or transition in every finding.** "iPhone Duo" alone is
  not a location. Write `open-portrait` or `fold (626→466)`.
- **For transition findings, the evidence is the pair.** Link both `-1-before`
  and `-2-after`; one screenshot without the other proves nothing.
- **Group across transitions.** A carousel that caches its width fails on
  `unfold`, `fold` and both rotations — that is one finding with four locations,
  not four findings.
- **Order by what the user does most.** Unfold and fold happen far more often
  than rotating an open Duo. A HIGH on `unfold` outranks a HIGH on `rotate-open`.

### 8. Say whether it ships on the Duo

State plainly whether the site is usable on the Duo in all four postures and
across transitions. If there are HIGH transition findings, say what the user
experiences — "open the phone on the product page and the image gallery is cut
off at the old width" — not the rule name.

For anything ambiguous, rerun one page with `--headed --transitions unfold` and
watch it, or step through with the Playwright MCP tools.

---

## Reference

- `references/checks.md` — every Duo rule, its threshold, severity, and what
  produces a false positive.
- `mobile-ux-qa/references/checks.md` — the per-page rules imported by this
  runner.
- `mobile-ux-qa/references/devices.md` — the Duo's viewport figures, the 626 vs
  669 discrepancy, and sources.

## Failure modes

| Symptom | Cause | What to do |
|---------|-------|------------|
| `The mobile-ux-qa skill was not found` | Only this skill folder is installed | Install `mobile-ux-qa` alongside it, or set `MOBILE_QA_CORE` |
| `Playwright is not installed in <dir>` | Runner resolves Playwright from the working directory | Run from the project under test after `npm i -D playwright` |
| `Executable doesn't exist` | WebKit not installed | `npx playwright install webkit` |
| `duo-reload-on-resize` on every transition of a correct site | A dev server with hot reload reacting to the resize, or a service worker update | Rerun against a production build before reporting it |
| `duo-js-error-on-resize` from a third-party script | Analytics or chat widget throwing on resize | Report once, name the script, and add its container to `ignore` for the rerun |
| `duo-stale-width` on an element that is fixed-width by design | A deliberately fixed-width component such as an embedded map | Confirm against the before/after pair, then drop the finding and say why |
| `duo-width-unused` on a page with a deliberate reading measure | Text column capped at ~65ch on purpose | Check the open-portrait screenshot; drop it if the margins look intentional |
| A state fails on some postures only | The trigger is hidden at that width, e.g. the menu button disappears at 768px in open-landscape | Expected. Note that the state does not exist in that posture |
| Every run fails on navigation | Server not up, or wrong port | `curl -sI <url>` first |

## Scope

Deliberately excluded: other phones (`mobile-ux-qa`), Android foldables, native
apps, the physical crease (Safari exposes no hinge information, so it cannot be
measured), and performance (use `mobile-ux-qa --perf`; the Duo does not change
what is slow).
