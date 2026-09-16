# Duo check catalogue

Rules added by `scripts/duo-qa.mjs`. The per-page rules it also runs in every
posture are documented in `mobile-ux-qa/references/checks.md`.

All transitions resize the viewport on the same page with no navigation, the way
the real device does, then wait 900ms for resize handlers and CSS transitions to
settle.

---

## Transition rules

Raised on the `<page>__<state>__duo-<transition>` runs.

### `duo-reload-on-resize` — HIGH
A token is written to `window` before the resize and read back after. If it is
gone, the page reloaded or navigated.

A real Duo never reloads a page on fold or rotate, so a site that does is
reacting to its own resize handler — usually a "mobile vs desktop" switch that
calls `location.reload()`. The user loses form input, open menus and scroll
position. No other transition rule runs after a reload, because there is nothing
left to compare.

False positive: a dev server with hot reload. Rerun on a production build.

### `duo-js-error-on-resize` — HIGH
Any uncaught exception thrown between the resize and the second snapshot.

Resize handlers are the least-tested code on most sites, because desktop users
rarely resize and phone users never could until now.

### `duo-overflow-after-resize` — HIGH
The document is wider than the viewport after the transition, and was not
before. Almost always the `fold` transition: something sized itself to 626px
while open and did not shrink back to 466px.

### `duo-stale-width` — HIGH
Fires when the viewport width changed by at least 100px and an element kept
exactly its previous width, and one of these holds:

- It was full-bleed before (width equal to the viewport, left edge at 0) and no
  longer matches the new viewport.
- It is wider than 300px and has an inline `style.width`, or its class names
  mark it as a carousel, slider, swiper or slick track.

Elements that merely have a CSS `max-width` do not fire — only an inline width
or a carousel keeps a size by accident. Up to eight offending selectors are
listed in `details.elements`.

False positive: a component that is fixed-width on purpose. Confirm against the
before/after pair.

### `duo-stale-height` — MEDIUM
The viewport height changed by at least 100px, and an element that was exactly
the old viewport height is still that height instead of the new one.

This is the `--vh` pattern — `document.documentElement.style.setProperty('--vh',
innerHeight / 100 + 'px')` run once at load — and full-screen menus sized from
`innerHeight`. CSS `100dvh`/`100svh` do not fire this rule. MEDIUM rather than
HIGH because the page is still usable; it just looks wrong until reload.

### `duo-overlay-broken` — HIGH
A `position: fixed` element that covered at least 90% of the screen before the
transition covers less than 90% after. An open menu, modal or cookie wall now
exposes the page behind it, often still clickable.

Only meaningful with a state that opens an overlay. With the default state it
rarely fires.

### `duo-fixed-drift` — HIGH
A fixed element was closer to the right (or bottom) edge than the left (or top),
the viewport changed on that axis by at least 100px, and afterwards the element
kept its left (or top) offset while its distance to the right (or bottom) edge
changed by more than 4px.

That is a position computed in JS from the old viewport — a floating action
button, chat launcher, or back-to-top button that drifts to the middle of the
screen on `unfold` and off screen on `fold`.

### `duo-scroll-reset` — MEDIUM
The page was scrolled more than 200px before the transition and is at exactly
0 after. Something in a resize handler scrolls to the top, or re-renders the
page.

Only the reset to 0 is reported. Ordinary drift of the reading position is not:
text reflows at the new width, and in testing an emulated WebKit resize lost the
reading position on a correct, fully fluid page too. Judge drift from the
`--viewport` before/after screenshots.

The reading-position scroll is only done for the `default` state, so that an
open drawer is not closed by scrolling.

---

## Posture rules

Compare the same page and state across postures. Attached to the `open-portrait`
run.

### `duo-width-unused` — MEDIUM
The text column (the horizontal span of visible paragraphs, headings and list
items longer than 40 characters, outside `nav`, `header` and `footer`) grew by
16px or less between `closed-portrait` and `open-portrait`, and uses less than
80% of the open screen's width.

The user opened the phone to get a bigger screen and got the same layout with
wider margins. Not a bug, which is why it is MEDIUM and why it must be confirmed
against the screenshot: a deliberate reading measure of about 65 characters is
a legitimate design and should be dropped from the report.

### `duo-breakpoints-crossed` — LOW
Lists the `min-width`/`max-width` media query breakpoints found in same-origin
stylesheets that fall between the narrowest and widest tested posture, and which
postures reach each one.

Informational. It tells the reader which postures got a different layout and
therefore which screenshots need the closest look. Breakpoints in cross-origin
stylesheets cannot be read; `details.unreadableStylesheets` counts them. `em` and
`rem` values are converted at 16px.

---

## What the rules cannot see

- Whether a layout that did change is a *good* layout at 626px or at 890 × 626.
- The crease. Safari exposes no hinge information, so nothing can be measured
  against it.
- Animation during the fold. Screenshots are taken after it settles.
- Anything that only breaks on a real device's continuous resize: the emulated
  resize is a single step.

The screenshot pass in `SKILL.md` step 6 exists for these.
