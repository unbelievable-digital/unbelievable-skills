# Check catalogue

Each rule below has an id, a threshold, a severity, and — more importantly — the
reason the threshold is what it is. When a finding is disputed, the reason is the
part that settles it.

Severity is assigned by the rule, then adjusted when writing the report:

- **BLOCKER** — a user cannot complete the task. Not "it looks wrong", but "the
  button cannot be reached" or "the text cannot be read".
- **HIGH** — visibly broken. Horizontal scrolling, clipped text, overlapping
  elements.
- **MEDIUM** — a standard is violated but the page still works. A 38px tap
  target, a 3.8:1 contrast ratio.
- **LOW** — an improvement worth making. Inconsistent spacing, a missing
  `autocomplete` attribute.

A MEDIUM that reproduces on every device in the matrix is worth more attention
than a HIGH that only appears on one. Say so in the report rather than reordering
by raw severity.

---

## Group 1 — Layout integrity

### `overflow-horizontal` — HIGH
`document.documentElement.scrollWidth` exceeds `window.innerWidth` by more than
1px, and the elements whose bounding box crosses the right edge are listed.

The page scrolls sideways. On a phone this is never intentional and it breaks
every swipe gesture on the page, because the browser now has to guess whether a
horizontal drag is a carousel swipe or a page pan.

Usual causes: a fixed-width element, a negative margin without a matching
`overflow: hidden` on the parent, a `100vw` width on a page that has a vertical
scrollbar, an unwrapped `<table>`, a long unbroken string.

### `viewport-taller-than-content` — LOW
The page's content is shorter than the viewport while a `min-height: 100vh`
wrapper forces a scrollbar anyway. Cosmetic, but it makes the page feel broken.

### `fixed-overlap` — HIGH
A `position: fixed` or `position: sticky` element covers content that has no
compensating padding or margin. Measured by comparing the fixed element's box
against the boxes of text-bearing elements underneath it.

### `fixed-vertical-budget` — HIGH in landscape, MEDIUM in portrait
Fixed top and bottom chrome together consume more than 35% of the viewport
height. In landscape on a 667px-tall phone rotated to 375px of height, a 56px
header and a 64px footer leave 255px for the actual page.

### `safe-area-unhandled` — MEDIUM
A fixed element is flush against the top or bottom edge of the viewport and
neither its computed padding nor its inline style references `env(safe-area-inset-*)`.

On a device with a notch or a home indicator the content sits underneath the
system UI. This rule cannot prove the element is wrong — a wrapper further up may
handle it — so it is reported as something to verify against the screenshot, not
as a certain defect.

### `fold-transition-break` — HIGH
Specific to the iPhone Duo. The viewport is resized from 466 × 678 to 626 × 890
without navigating, then the layout is measured again. A finding is raised when
the resized page has horizontal overflow, when an element's box is unchanged
despite the 160px of new width (a sign of a cached measurement), or when the
document height changes by more than 50%.

See `devices.md` for why this matters.

---

## Group 2 — Touch and legibility

### `tap-target-small` — MEDIUM, BLOCKER under 24px
An interactive element's hit area is smaller than **44 × 44 CSS px**.

44px is Apple's Human Interface Guidelines figure; Android's Material guidance
says 48dp. 44 is used here as the lower of the two, so a passing result passes
both. The measurement uses the element's own box unioned with any padding — a
24px icon inside a 44px padded button passes, which is the correct outcome.

Under 24px the element is effectively unhittable for a large share of users and
is raised to BLOCKER.

### `tap-target-crowded` — MEDIUM
Two interactive elements are less than 8px apart. Adjacent small targets cause
mis-taps even when each one individually meets the size threshold, and the cost
of a mis-tap is high when one of the two is destructive.

### `input-font-size-zoom` — HIGH
An `<input>`, `<select>` or `<textarea>` has a computed `font-size` below 16px.

iOS Safari zooms the page when focus enters a control with text smaller than
16px. The zoom is not undone on blur. The user is left on a zoomed page that now
scrolls horizontally, mid-form. This is one of the most common and most
frustrating mobile defects, and it is invisible on a desktop browser and in
Chromium.

### `text-too-small` — MEDIUM
Body text is rendered below 12px. Applies to elements with their own text
content, not to containers.

### `contrast-insufficient` — MEDIUM
Text fails WCAG 2.1 AA: below 4.5:1 for normal text, below 3:1 for large text
(24px and above, or 18.66px and above when bold).

The background colour is resolved by walking up the ancestor chain to the first
non-transparent background. Text over an image or a gradient cannot be measured
this way and is skipped rather than guessed at — the screenshot pass catches
those.

### `zoom-disabled` — MEDIUM
The viewport meta tag sets `user-scalable=no`, or a `maximum-scale` below 1.5.

This removes pinch-zoom, which is the accessibility escape hatch for anyone whose
eyesight does not match the designer's. It is usually added to work around
`input-font-size-zoom` above, which means fixing the font size lets you delete it.

---

## Group 3 — Forms and keyboard

### `input-type-mismatch` — MEDIUM
A field whose name, id, label or placeholder indicates a phone number, email,
numeric quantity or postal code does not carry a matching `type` or `inputmode`.

The consequence is a full QWERTY keyboard where a number pad belongs, which turns
a three-tap interaction into a fifteen-tap one.

### `autocomplete-missing` — LOW
A recognisable field (email, name, address, postal code, card number) has no
`autocomplete` attribute, so the browser cannot autofill it. On a phone, autofill
is the difference between a checkout that takes ten seconds and one that takes
two minutes.

### `submit-below-keyboard` — BLOCKER
Evaluated in a state where an input is focused. The submit control's position
falls inside the region the on-screen keyboard would occupy.

The keyboard height is estimated — 260px in portrait and 200px in landscape,
measured from the bottom of the viewport — because a headless browser has no real
keyboard. The estimate is deliberately conservative. In landscape the keyboard
routinely takes more than half the screen, which is why this rule fires there
most often.

### `focus-not-scrolled-into-view` — HIGH
After focusing an input, its box is outside the visible region above the
estimated keyboard. The user is typing into a field they cannot see.

### `body-scroll-not-locked` — MEDIUM
Evaluated in a state where a modal or drawer is open. The page behind the overlay
still scrolls. On a phone this means the user scrolls the background while trying
to scroll the modal, loses their place, and closes the modal to recover.

---

## Group 4 — Performance and media (`--perf`)

Chromium only. Throttled to a 4× CPU slowdown and a Fast 3G network profile,
which approximates a mid-range Android phone on a real connection rather than a
developer laptop on office wifi.

### `lcp-slow` — HIGH above 4s, MEDIUM above 2.5s
Largest Contentful Paint. The 2.5s threshold is Google's "good" boundary.

### `cls-high` — HIGH above 0.25, MEDIUM above 0.1
Cumulative Layout Shift. On a phone a layout shift is not cosmetic: it moves the
thing under the user's thumb while they are tapping it.

### `image-no-dimensions` — MEDIUM
An `<img>` has neither `width`/`height` attributes nor a CSS `aspect-ratio`. The
space it will occupy is unknown until it loads, which is the main cause of CLS.

### `image-oversized` — MEDIUM
An image's natural resolution is more than twice its displayed size after
accounting for DPR. A 2000px-wide file rendered into a 375px slot wastes the
user's data allowance and their battery, and delays LCP.

---

## What the rules cannot see

The rules measure what is measurable. They do not see:

- A layout that is technically within tolerance and still ugly — mismatched
  gutters, an orphaned heading, a card grid with one item on the last row.
- Text over an image where the contrast is genuinely unreadable.
- Visual hierarchy that collapses at a narrow width, so everything looks equally
  important.
- An element that is clipped rather than overflowing, so no rule fires.
- Something that is simply wrong in a way nobody wrote a rule for.

This is why the screenshot pass exists, and why it is not optional.
