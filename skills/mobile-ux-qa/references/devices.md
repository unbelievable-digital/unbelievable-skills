# Device matrix

Every entry is a **CSS viewport**, not a physical resolution. Physical pixels
divided by the device pixel ratio is what the page actually lays out against.

## Why the engine matters more than the viewport

A Playwright "device" is a viewport plus a user-agent string. That is emulation,
not simulation. The part that changes real behaviour is the **engine**:

- **WebKit** is what every browser on iOS runs, including Chrome and Firefox on
  iOS. Bugs that only reproduce here: zoom-on-focus when an input's font size is
  under 16px, `100vh` extending under the address bar, `env(safe-area-inset-*)`
  resolution, `position: sticky` inside overflow containers, native date and
  select pickers.
- **Chromium** is what Android runs.

Testing an iPhone viewport in Chromium produces a report that looks complete and
misses the entire class of iOS-only defects. Always pair the viewport with the
engine the real device uses.

## Default set

Run with no `--devices` flag and you get these four, chosen to cover the extremes
rather than the averages.

| id | Label | Engine | Viewport | DPR | Orientations | Why it is in the set |
|----|-------|--------|----------|-----|--------------|----------------------|
| `galaxy-s8plus` | Galaxy S8+ | chromium | 360 × 740 | 4 | portrait, landscape | Narrowest viewport still in common use. Overflow shows up here first. |
| `iphone-se` | iPhone SE (2nd/3rd gen) | webkit | 375 × 667 | 2 | portrait, landscape | Shortest iPhone. Vertical budget problems surface here. |
| `iphone-14-pro` | iPhone 14 Pro | webkit | 393 × 852 | 3 | portrait, landscape | Dynamic Island plus home indicator — the safe-area reference device. |
| `iphone-duo-unfolded` | iPhone Duo (open) | webkit | 626 × 890 | 3 | portrait, landscape | The awkward width. See below. |

## Extended set (`--devices all`)

| id | Label | Engine | Viewport | DPR | Orientations |
|----|-------|--------|----------|-----|--------------|
| `pixel-7` | Pixel 7 | chromium | 412 × 915 | 2.625 | portrait |
| `iphone-duo-folded` | iPhone Duo (closed) | webkit | 466 × 678 | 3 | portrait |

## Tablets (`--tablets`)

Off by default. Turn them on for a project where tablets are a real share of
traffic rather than a rounding error.

| id | Label | Engine | Viewport | DPR | Orientations |
|----|-------|--------|----------|-----|--------------|
| `ipad-mini` | iPad mini | webkit | 768 × 1024 | 2 | portrait, landscape |
| `ipad-pro-11` | iPad Pro 11" | webkit | 834 × 1194 | 2 | portrait, landscape |

## iPhone Duo

Apple announced the iPhone Duo, its first foldable, in September 2026. It matters
to a mobile-first audit out of proportion to its market share, because it breaks
assumptions that every other phone lets you get away with.

| State | Physical pixels | CSS viewport | DPR |
|-------|-----------------|--------------|-----|
| Closed (outer, 5.4") | 1398 × 2034 | 466 × 678 | 3 |
| Open (inner, 7.6") portrait | 1878 × 2670 | 626 × 890 | 3 |
| Open landscape | — | 890 × 626 | 3 |

### Three things it breaks

**The 626px dead zone.** Tailwind's `sm` breakpoint starts at 640px, so the open
Duo is still "mobile" to the framework while being 34% wider than the phone the
layout was designed for. A single-column layout stretches to fill 626px of screen
with one column of content. Bootstrap's `sm` starts at 576px, so the same page
crosses a breakpoint and lays out differently again. Neither result was designed;
both need to be looked at.

**Live resize with no reload.** Opening the device changes the viewport from
466 to 626 CSS px mid-session. There is no navigation and no reload. Anything
that measured the viewport once at mount — a carousel that cached slide widths, a
`--vh` custom property set from `innerHeight`, a virtualised list, a sticky offset
computed in JS — is now holding a stale number. This is what the fold-transition
check exercises.

**Safari cannot see the fold.** Chromium ships the Viewport Segments API; WebKit
does not. There is no way to read the hinge position from CSS or JS on the actual
device. The only defence is a layout that is fluid at every width rather than one
that special-cases known breakpoints.

### A known discrepancy

Device databases report the inner display's CSS viewport as **626 × 890**, which
is the physical resolution divided by 3. Apple's own developer material describes
the inner display as **669 × 951 points**, which implies the panel is rendered at
a larger logical size and downsampled — the same trick the iPhone 6 Plus used.

This audit uses **626 × 890**, because two independent device databases agree on
it and because the outer display's arithmetic (1398/3 = 466, 2034/3 = 678) is
exact under the same assumption. Native points and Safari CSS pixels are not
required to match.

If you have access to a physical unit, open Safari and read `window.innerWidth`
on the inner display. That settles it. Until then, treat the 626 figure as
well-supported rather than confirmed, and note that a layout which is fluid
between 600 and 700px is correct under either number.

## Sources

- [Apple unveils iPhone Duo](https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/)
- [iPhone Duo technical specifications](https://www.apple.com/iphone-duo/specs/)
- [WebMobileFirst — iPhone Duo folded](https://www.webmobilefirst.com/en/devices/apple-iphone-duo-folded-2026/)
- [WebMobileFirst — iPhone Duo unfolded](https://www.webmobilefirst.com/en/devices/apple-iphone-duo-unfolded-2026/)
- [iPhone Duo for Developers: the 1.42 problem](https://blakecrosley.com/blog/iphone-duo-for-developers)
- [Websites on iPhone Duo: Safari can't see the fold](https://iphoneduosupport.com/blog/websites-on-iphone-duo/)
