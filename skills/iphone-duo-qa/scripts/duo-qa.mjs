#!/usr/bin/env node
/**
 * duo-qa — iPhone Duo audit runner.
 *
 * Audits a set of pages on the iPhone Duo only, in all four postures (closed and
 * open, each in portrait and landscape), then exercises the transitions a real
 * user makes without reloading: opening the device, closing it, and rotating it
 * in either posture. Captures before/after screenshots of every transition.
 *
 * The per-page rules (overflow, tap targets, keyboard, safe area, ...) come from
 * the mobile-ux-qa runner and are imported, not copied. This file adds only what
 * is specific to a foldable: the postures and the live-resize checks.
 *
 * Writes findings.json and screenshots/ in the same shape as mobile-qa, so the
 * mobile-ux-qa report renderer works on the output unchanged.
 *
 * Usage:
 *   node duo-qa.mjs --url https://example.com --pages /,/cart
 *   node duo-qa.mjs --config duo-qa.config.json
 *
 * See ../SKILL.md for the workflow and ../references/checks.md for the rules.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Core rules from mobile-ux-qa
// ---------------------------------------------------------------------------

const HERE = path.dirname(realpathSync(fileURLToPath(import.meta.url)))

function findCore() {
  const candidates = [
    process.env.MOBILE_QA_CORE,
    // Same repository or plugin: skills/iphone-duo-qa/scripts → skills/mobile-ux-qa/scripts
    path.join(HERE, '..', '..', 'mobile-ux-qa', 'scripts', 'mobile-qa.mjs'),
    process.env.CLAUDE_PLUGIN_ROOT && path.join(process.env.CLAUDE_PLUGIN_ROOT, 'skills', 'mobile-ux-qa', 'scripts', 'mobile-qa.mjs'),
    path.join(process.cwd(), '.claude', 'skills', 'mobile-ux-qa', 'scripts', 'mobile-qa.mjs'),
    path.join(os.homedir(), '.claude', 'skills', 'mobile-ux-qa', 'scripts', 'mobile-qa.mjs'),
  ].filter(Boolean)
  const found = candidates.find((c) => existsSync(c))
  if (!found) {
    throw new Error(
      'The mobile-ux-qa skill was not found. iphone-duo-qa reuses its rules.\n' +
      '  Install both skills (the unbelievable-skills plugin includes both), or set\n' +
      '  MOBILE_QA_CORE to the path of mobile-ux-qa/scripts/mobile-qa.mjs.',
    )
  }
  return found
}

// ---------------------------------------------------------------------------
// Postures and transitions
// ---------------------------------------------------------------------------

/** Filled from the core DEVICES registry so the viewport figures live in one place. */
function buildPostures(DEVICES) {
  const closed = DEVICES['iphone-duo-folded']
  const open = DEVICES['iphone-duo-unfolded']
  const make = (id, base, orientation, label) => ({
    id, label, orientation,
    device: base === closed ? 'iphone-duo-folded' : 'iphone-duo-unfolded',
    width: orientation === 'portrait' ? base.width : base.height,
    height: orientation === 'portrait' ? base.height : base.width,
    dpr: base.dpr,
  })
  return {
    'closed-portrait': make('closed-portrait', closed, 'portrait', 'iPhone Duo closed · portrait'),
    'closed-landscape': make('closed-landscape', closed, 'landscape', 'iPhone Duo closed · landscape'),
    'open-portrait': make('open-portrait', open, 'portrait', 'iPhone Duo open · portrait'),
    'open-landscape': make('open-landscape', open, 'landscape', 'iPhone Duo open · landscape'),
  }
}

const TRANSITIONS = [
  { id: 'unfold', from: 'closed-portrait', to: 'open-portrait', label: 'Open the device' },
  { id: 'fold', from: 'open-portrait', to: 'closed-portrait', label: 'Close the device' },
  { id: 'rotate-closed', from: 'closed-portrait', to: 'closed-landscape', label: 'Rotate while closed' },
  { id: 'rotate-open', from: 'open-portrait', to: 'open-landscape', label: 'Rotate while open' },
]

// ---------------------------------------------------------------------------
// In-page snapshots
//
// Run inside the browser. Must be fully self-contained.
// ---------------------------------------------------------------------------

/**
 * Tags layout-relevant elements with data-duoqa so the same nodes can be
 * measured again after the resize, rather than matching by index.
 */
function snapshotBefore({ scroll }) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const selector = [
    'main', '[role="main"]', 'header', 'footer', 'nav', 'aside', 'section', 'article',
    '[class*="container"]', '[class*="wrapper"]', '[class*="carousel"]', '[class*="slider"]',
    '[class*="swiper"]', '[class*="slick"]', '[class*="grid"]', 'img', 'video', 'canvas', 'iframe',
  ].join(',')

  function cssPath(el) {
    if (el.id) return `#${el.id}`
    const parts = []
    let node = el
    for (let depth = 0; node && node.nodeType === 1 && depth < 4; depth++) {
      let part = node.tagName.toLowerCase()
      const cls = (node.getAttribute('class') || '').split(/\s+/).filter((c) => c && c.length < 30).slice(0, 2)
      if (cls.length) part += '.' + cls.join('.')
      parts.unshift(part)
      if (node.id) { parts[0] = `#${node.id}`; break }
      node = node.parentElement
    }
    return parts.join(' > ')
  }

  const seen = new Set()
  const candidates = [...document.querySelectorAll(selector)]
  // Anything sized to the viewport is a candidate too: that is what 100vh,
  // --vh from innerHeight, and JS-measured full-bleed blocks look like.
  for (const el of document.body.querySelectorAll('*')) {
    if (candidates.length > 600) break
    const r = el.getBoundingClientRect()
    if (Math.abs(r.height - vh) <= 2 || Math.abs(r.width - vw) <= 2 || getComputedStyle(el).position === 'fixed') {
      candidates.push(el)
    }
  }

  const elements = []
  for (const el of candidates) {
    if (seen.has(el) || elements.length >= 250) continue
    seen.add(el)
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 20) continue
    const key = String(elements.length)
    el.setAttribute('data-duoqa', key)
    elements.push({
      key,
      selector: cssPath(el),
      position: style.position,
      inlineWidth: el.style.width || null,
      inlineHeight: el.style.height || null,
      x: Math.round(r.left), y: Math.round(r.top),
      width: Math.round(r.width), height: Math.round(r.height),
      right: Math.round(vw - r.right), bottom: Math.round(vh - r.bottom),
    })
  }

  // Scroll to a reading position so a lost scroll anchor is detectable.
  const maxScroll = document.documentElement.scrollHeight - vh
  if (scroll && maxScroll > vh) window.scrollTo(0, Math.round(maxScroll * 0.4))
  let anchor = null
  for (const y of scroll ? [vh * 0.25, vh * 0.4, vh * 0.5] : []) {
    let el = document.elementFromPoint(vw / 2, y)
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect()
      if (r.height < vh * 0.8 && getComputedStyle(el).position !== 'fixed' && getComputedStyle(el).position !== 'sticky') break
      el = el.parentElement
    }
    if (el && el !== document.body && el !== document.documentElement) {
      el.setAttribute('data-duoqa-anchor', '1')
      anchor = { selector: cssPath(el), top: Math.round(el.getBoundingClientRect().top), text: (el.textContent || '').trim().slice(0, 60) }
      break
    }
  }

  window.__duoqaToken = Math.random().toString(36).slice(2)
  return {
    token: window.__duoqaToken,
    viewport: { width: vw, height: vh },
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    scrollY: Math.round(window.scrollY),
    elements,
    anchor,
  }
}

function snapshotAfter() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const elements = {}
  for (const el of document.querySelectorAll('[data-duoqa]')) {
    const style = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    elements[el.getAttribute('data-duoqa')] = {
      visible: style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0,
      position: style.position,
      x: Math.round(r.left), y: Math.round(r.top),
      width: Math.round(r.width), height: Math.round(r.height),
      right: Math.round(vw - r.right), bottom: Math.round(vh - r.bottom),
    }
  }
  const anchorEl = document.querySelector('[data-duoqa-anchor]')
  const anchor = anchorEl ? { top: Math.round(anchorEl.getBoundingClientRect().top), height: Math.round(anchorEl.getBoundingClientRect().height) } : null
  return {
    token: window.__duoqaToken ?? null,
    viewport: { width: vw, height: vh },
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    scrollY: Math.round(window.scrollY),
    elements,
    anchor,
  }
}

/** Width actually used by running text. Compared across postures by the runner. */
function textColumn() {
  const vw = window.innerWidth
  let left = Infinity
  let right = -Infinity
  let count = 0
  for (const el of document.querySelectorAll('p, h1, h2, h3, li, blockquote, dd')) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue
    if (el.closest('nav, header, footer, [role="navigation"], [aria-hidden="true"]')) continue
    if ((el.textContent || '').trim().length < 40) continue
    const r = el.getBoundingClientRect()
    if (r.width < 100 || r.right < 0 || r.left > vw) continue
    left = Math.min(left, Math.max(0, r.left))
    right = Math.max(right, Math.min(vw, r.right))
    count++
  }
  return count ? { left: Math.round(left), right: Math.round(right), width: Math.round(right - left), samples: count } : null
}

/** Author breakpoints, read from same-origin stylesheets. Cross-origin sheets are skipped. */
function breakpoints() {
  const found = new Set()
  const walk = (rules) => {
    for (const rule of rules) {
      const text = rule.conditionText || rule.media?.mediaText || ''
      for (const m of text.matchAll(/(min|max)-width\s*:\s*([\d.]+)(px|em|rem)/g)) {
        const px = m[3] === 'px' ? Number(m[2]) : Number(m[2]) * 16
        found.add(`${m[1]}:${Math.round(px)}`)
      }
      if (rule.cssRules) walk(rule.cssRules)
    }
  }
  let unreadable = 0
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules) } catch { unreadable++ }
  }
  return { list: [...found], unreadable }
}

// ---------------------------------------------------------------------------
// Transition analysis (Node side)
// ---------------------------------------------------------------------------

function analyseTransition(transition, before, after, pageErrors) {
  const findings = []
  const add = (rule, severity, selector, message, details) =>
    findings.push({ rule, severity, selector, box: null, message, details: details || {} })

  const dw = after.viewport.width - before.viewport.width
  const dh = after.viewport.height - before.viewport.height

  if (!after.token || after.token !== before.token) {
    add('duo-reload-on-resize', 'HIGH', null,
      `The page reloaded or navigated during "${transition.label}". A real Duo does not reload on fold or rotate; anything the user typed or opened is lost.`)
    return findings // nothing below is meaningful after a reload
  }

  for (const err of pageErrors) {
    add('duo-js-error-on-resize', 'HIGH', null,
      `JavaScript error thrown during "${transition.label}": ${err.slice(0, 200)}`, { error: err.slice(0, 500) })
  }

  if (after.documentWidth > after.viewport.width + 1 && before.documentWidth <= before.viewport.width + 1) {
    add('duo-overflow-after-resize', 'HIGH', null,
      `After "${transition.label}" the page overflows horizontally (${after.documentWidth}px in a ${after.viewport.width}px viewport). It did not overflow before.`,
      { documentWidth: after.documentWidth, viewportWidth: after.viewport.width })
  }

  const staleWidth = []
  const staleHeight = []
  const fixedDrift = []
  const overlayBroken = []

  for (const b of before.elements) {
    const a = after.elements[b.key]
    if (!a || !a.visible) continue

    // An overlay reported as broken is not also reported as a stale size.
    if (b.position === 'fixed') {
      const coversBefore = b.width * b.height >= before.viewport.width * before.viewport.height * 0.9
      const coversAfter = a.width * a.height >= after.viewport.width * after.viewport.height * 0.9
      if (coversBefore && !coversAfter) {
        overlayBroken.push({ selector: b.selector, before: `${b.width}×${b.height}`, after: `${a.width}×${a.height}` })
        continue
      }
    }

    const wasFullWidth = Math.abs(b.width - before.viewport.width) <= 2 && b.x <= 1
    const wasFullHeight = Math.abs(b.height - before.viewport.height) <= 2

    // Full-bleed before, and no longer matching the new viewport width.
    if (Math.abs(dw) >= 100 && wasFullWidth && Math.abs(a.width - after.viewport.width) > 2 && a.width === b.width) {
      staleWidth.push({ selector: b.selector, width: a.width, inline: b.inlineWidth })
    } else if (Math.abs(dw) >= 100 && b.width > 300 && a.width === b.width && b.position !== 'fixed' &&
      (b.inlineWidth || /carousel|slider|swiper|slick/i.test(b.selector))) {
      // A wide block with a JS-written width, or a carousel, that did not move.
      staleWidth.push({ selector: b.selector, width: a.width, inline: b.inlineWidth })
    }

    if (Math.abs(dh) >= 100 && wasFullHeight && a.height === b.height && Math.abs(a.height - after.viewport.height) > 2) {
      staleHeight.push({ selector: b.selector, height: a.height, inline: b.inlineHeight })
    }

    if (b.position === 'fixed') {
      // Anchored to the right or bottom edge before: it should keep that
      // distance. Keeping its left/top instead means JS computed the offset.
      const rightAnchored = b.right < b.x && Math.abs(dw) >= 100
      const bottomAnchored = b.bottom < b.y && Math.abs(dh) >= 100
      const lostRight = rightAnchored && Math.abs(a.right - b.right) > 4 && Math.abs(a.x - b.x) <= 2
      const lostBottom = bottomAnchored && Math.abs(a.bottom - b.bottom) > 4 && Math.abs(a.y - b.y) <= 2
      if (lostRight || lostBottom) {
        fixedDrift.push({
          selector: b.selector,
          edge: lostRight ? 'right' : 'bottom',
          before: lostRight ? b.right : b.bottom,
          after: lostRight ? a.right : a.bottom,
        })
      }
    }
  }

  if (staleWidth.length) {
    add('duo-stale-width', 'HIGH', staleWidth[0].selector,
      `${staleWidth.length} element(s) kept the width they had before "${transition.label}" although the viewport changed by ${dw}px. That is a width measured once and cached — typically a carousel, a JS-sized container, or an inline style.`,
      { elements: staleWidth.slice(0, 8), viewportDelta: dw })
  }
  if (staleHeight.length) {
    add('duo-stale-height', 'MEDIUM', staleHeight[0].selector,
      `${staleHeight.length} element(s) sized to the old viewport height did not follow "${transition.label}" (${before.viewport.height}px → ${after.viewport.height}px). Usually a --vh custom property or a height set from innerHeight once.`,
      { elements: staleHeight.slice(0, 8), viewportHeightBefore: before.viewport.height, viewportHeightAfter: after.viewport.height })
  }
  if (overlayBroken.length) {
    add('duo-overlay-broken', 'HIGH', overlayBroken[0].selector,
      `An overlay that covered the screen stopped covering it after "${transition.label}". The page behind is exposed and may be interactive.`,
      { elements: overlayBroken.slice(0, 4) })
  }
  if (fixedDrift.length) {
    add('duo-fixed-drift', 'HIGH', fixedDrift[0].selector,
      `${fixedDrift.length} fixed element(s) anchored to the right or bottom edge did not follow it after "${transition.label}" — they kept their old left/top offset, which means the position was computed in JS for the old viewport. They may now float mid-screen or sit off screen.`,
      { elements: fixedDrift.slice(0, 6) })
  }

  // Only a reset to the top is reported. Drift of the reading position is
  // normal reflow in emulation (WebKit has no scroll anchoring) and is judged
  // from the before/after screenshots instead.
  if (before.scrollY > 200 && after.scrollY === 0) {
    add('duo-scroll-reset', 'MEDIUM', null,
      `The page jumped back to the top during "${transition.label}" (scrollY ${before.scrollY} → 0). The user loses their place every time they open, close or rotate the device.`,
      { scrollYBefore: before.scrollY, anchor: before.anchor })
  }

  return findings
}

/** Cross-posture checks that need more than one run of the same page and state. */
function analysePostures(byPosture) {
  const findings = []
  const closed = byPosture['closed-portrait']
  const open = byPosture['open-portrait']
  if (closed?.textColumn && open?.textColumn) {
    const gained = open.textColumn.width - closed.textColumn.width
    const extra = open.viewport.width - closed.viewport.width
    const ratio = open.textColumn.width / open.viewport.width
    if (gained <= 16 && ratio < 0.8) {
      findings.push({
        rule: 'duo-width-unused', severity: 'MEDIUM', selector: null, box: null,
        message: `Opening the device adds ${extra}px of width, but the text column grew by only ${gained}px and uses ${Math.round(ratio * 100)}% of the open screen. Check the open-portrait screenshot: a narrow column floating in wide margins looks unfinished.`,
        details: { textColumnClosed: closed.textColumn, textColumnOpen: open.textColumn },
      })
    }
  }

  const bp = open?.breakpoints
  if (bp) {
    const widths = Object.values(byPosture).map((p) => p.viewport.width)
    const min = Math.min(...widths)
    const max = Math.max(...widths)
    const inside = bp.list
      .map((s) => ({ kind: s.split(':')[0], px: Number(s.split(':')[1]) }))
      .filter((b) => b.px > min && b.px <= max)
      .sort((a, b) => a.px - b.px)
    if (inside.length) {
      const where = (px) => Object.entries(byPosture)
        .filter(([, p]) => p.viewport.width >= px).map(([id]) => id)
      findings.push({
        rule: 'duo-breakpoints-crossed', severity: 'LOW', selector: null, box: null,
        message: `The stylesheet has ${inside.length} width breakpoint(s) between ${min}px and ${max}px, so the Duo's postures land on different layouts: ${inside.map((b) => `${b.kind}-width ${b.px}px`).join(', ')}. Confirm each posture's layout was designed, not inherited.`,
        details: { breakpoints: inside.map((b) => ({ ...b, reachedBy: where(b.px) })), unreadableStylesheets: bp.unreadable },
      })
    }
  }
  return findings
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  const core = await import(pathToFileURL(findCore()).href)
  const args = core.parseArgs(process.argv)

  if (args.help) {
    console.log(`duo-qa — iPhone Duo audit

  --config <path>       Config file (default: duo-qa.config.json, then mobile-qa.config.json)
  --url <url>           Base URL. Overrides config baseUrl.
  --pages <list>        Comma-separated paths. Overrides config pages.
  --out <dir>           Output directory (default: qa-reports/duo-<timestamp>)
  --postures <list>     closed-portrait,closed-landscape,open-portrait,open-landscape (default: all)
  --transitions <list>  unfold,fold,rotate-closed,rotate-open (default: all)
  --no-transitions      Static postures only
  --fail-on <list>      Exit 1 if findings at these severities exist, e.g. blocker,high
  --headed              Show the browser
  --timeout <ms>        Navigation timeout (default: 30000)
`)
    return
  }

  const ENGINES = await core.loadPlaywright()
  const config = await core.loadConfig(['duo-qa.config.json', 'mobile-qa.config.json'])
  const POSTURES = buildPostures(core.DEVICES)
  const timeout = Number(args.timeout) || 30000

  const postureIds = typeof args.postures === 'string'
    ? args.postures.split(',').map((s) => s.trim())
    : Object.keys(POSTURES)
  const unknownPostures = postureIds.filter((id) => !POSTURES[id])
  if (unknownPostures.length) throw new Error(`Unknown posture(s): ${unknownPostures.join(', ')}. Known: ${Object.keys(POSTURES).join(', ')}`)

  let transitions = args['no-transitions'] ? [] : TRANSITIONS
  if (typeof args.transitions === 'string') {
    const wanted = args.transitions.split(',').map((s) => s.trim())
    const unknown = wanted.filter((id) => !TRANSITIONS.some((t) => t.id === id))
    if (unknown.length) throw new Error(`Unknown transition(s): ${unknown.join(', ')}. Known: ${TRANSITIONS.map((t) => t.id).join(', ')}`)
    transitions = TRANSITIONS.filter((t) => wanted.includes(t.id))
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
  const outDir = typeof args.out === 'string' ? args.out : path.join('qa-reports', `duo-${stamp}`)
  const shotDir = path.join(outDir, 'screenshots')
  await mkdir(shotDir, { recursive: true })

  const storageState = await core.ensureAuth(ENGINES, config, timeout)
  const statesByName = new Map((config.states || []).map((s) => [s.name, s]))
  const runs = []
  const errors = []

  // WebKit only: every browser on the Duo is WebKit.
  const browser = await ENGINES.webkit.launch({ headless: !args.headed })
  const newContext = (posture) => browser.newContext({
    viewport: { width: posture.width, height: posture.height },
    deviceScaleFactor: posture.dpr,
    userAgent: core.UA_IOS,
    hasTouch: true,
    storageState,
  })

  async function fullShot(page, file) {
    try {
      await page.screenshot({ path: file, fullPage: true })
    } catch {
      await page.screenshot({ path: file }) // very long pages can exceed the surface limit
    }
  }

  async function prepare(page, pageDef, stateName) {
    await page.goto(new URL(pageDef.path, config.baseUrl).href, { waitUntil: 'load', timeout })
    await core.settle(page, timeout)
    if (stateName !== 'default') {
      const state = statesByName.get(stateName)
      if (!state) throw new Error(`State "${stateName}" is not defined in the config`)
      await core.runSteps(page, state.steps, timeout)
      await page.waitForTimeout(300)
    }
  }

  // -- Static postures ------------------------------------------------------

  const crossPosture = new Map() // `${page}__${state}` → { postureId: { viewport, textColumn, breakpoints } }

  for (const postureId of postureIds) {
    const posture = POSTURES[postureId]
    const context = await newContext(posture)

    for (const pageDef of config.pages) {
      for (const stateName of ['default', ...(pageDef.states || [])]) {
        const label = `${pageDef.name}__${stateName}__duo-${postureId}`
        const page = await context.newPage()
        try {
          await prepare(page, pageDef, stateName)
          const result = await page.evaluate(core.pageAudit, {
            ignore: config.ignore,
            keyboardHeight: core.KEYBOARD_HEIGHT[posture.orientation],
            orientation: posture.orientation,
          })

          const key = `${pageDef.name}__${stateName}`
          if (!crossPosture.has(key)) crossPosture.set(key, { pageDef, stateName, byPosture: {} })
          crossPosture.get(key).byPosture[postureId] = {
            viewport: { width: posture.width, height: posture.height },
            textColumn: await page.evaluate(textColumn),
            breakpoints: postureId === 'open-portrait' ? await page.evaluate(breakpoints) : null,
          }

          const shot = path.join(shotDir, `${label}.png`)
          await fullShot(page, shot)
          const viewportShot = path.join(shotDir, `${label}--viewport.png`)
          await page.screenshot({ path: viewportShot })

          runs.push({
            id: label,
            page: pageDef.name, path: pageDef.path, state: stateName,
            device: posture.device, deviceLabel: posture.label, engine: 'webkit', orientation: posture.orientation,
            posture: postureId,
            viewport: { width: posture.width, height: posture.height }, dpr: posture.dpr,
            screenshot: path.relative(outDir, shot),
            screenshotViewport: path.relative(outDir, viewportShot),
            metrics: result.metrics,
            findings: result.findings,
          })
          console.log(`  ${label}: ${result.findings.length} finding(s)`)
        } catch (err) {
          errors.push({ run: label, error: String(err.message || err) })
          console.error(`  ${label}: FAILED — ${err.message || err}`)
        } finally {
          await page.close()
        }
      }
    }
    await context.close()
  }

  // Cross-posture findings attach to the open-portrait run of that page/state.
  for (const { pageDef, stateName, byPosture } of crossPosture.values()) {
    const extra = analysePostures(byPosture)
    if (!extra.length) continue
    const target = runs.find((r) => r.page === pageDef.name && r.state === stateName && r.posture === 'open-portrait')
    if (target) {
      target.findings.push(...extra)
      console.log(`  ${pageDef.name}__${stateName}__duo-postures: ${extra.length} finding(s)`)
    }
  }

  // -- Live transitions -----------------------------------------------------

  for (const transition of transitions) {
    const from = POSTURES[transition.from]
    const to = POSTURES[transition.to]
    console.log(`transition ${transition.id}: ${from.width}×${from.height} → ${to.width}×${to.height}`)
    const context = await newContext(from)

    for (const pageDef of config.pages) {
      for (const stateName of ['default', ...(pageDef.states || [])]) {
        const label = `${pageDef.name}__${stateName}__duo-${transition.id}`
        const page = await context.newPage()
        const pageErrors = []
        try {
          await prepare(page, pageDef, stateName)
          // A state such as "menu-open" must stay open, and scrolling can close
          // a drawer, so the reading-position check runs on the default state only.
          const before = await page.evaluate(snapshotBefore, { scroll: stateName === 'default' })
          await page.waitForTimeout(200)
          await page.screenshot({ path: path.join(shotDir, `${label}-1-before--viewport.png`) })
          await fullShot(page, path.join(shotDir, `${label}-1-before.png`))

          page.on('pageerror', (err) => pageErrors.push(String(err.message || err)))
          // The real device changes size without navigating. So do we.
          await page.setViewportSize({ width: to.width, height: to.height })
          await page.waitForTimeout(900)

          const after = await page.evaluate(snapshotAfter)
          await page.screenshot({ path: path.join(shotDir, `${label}-2-after--viewport.png`) })
          await fullShot(page, path.join(shotDir, `${label}-2-after.png`))

          const findings = analyseTransition(transition, before, after, pageErrors)
          if (after.token === before.token) {
            const audit = await page.evaluate(core.pageAudit, {
              ignore: config.ignore,
              keyboardHeight: core.KEYBOARD_HEIGHT[to.orientation],
              orientation: to.orientation,
            })
            // Only rules whose outcome can change because of the resize itself.
            const relevant = new Set(['fixed-overlap', 'fixed-vertical-budget', 'submit-below-keyboard', 'focus-not-scrolled-into-view'])
            findings.push(...audit.findings.filter((f) => relevant.has(f.rule)))
          }

          runs.push({
            id: label,
            page: pageDef.name, path: pageDef.path, state: stateName,
            device: 'iphone-duo', deviceLabel: `iPhone Duo · ${transition.label.toLowerCase()}`,
            engine: 'webkit', orientation: to.orientation,
            transition: transition.id, posture: `${transition.from} → ${transition.to}`,
            viewport: { width: to.width, height: to.height }, dpr: to.dpr,
            screenshot: `screenshots/${label}-2-after.png`,
            screenshotBefore: `screenshots/${label}-1-before.png`,
            screenshotViewport: `screenshots/${label}-2-after--viewport.png`,
            screenshotViewportBefore: `screenshots/${label}-1-before--viewport.png`,
            metrics: {
              before: { viewport: before.viewport, documentWidth: before.documentWidth, documentHeight: before.documentHeight, scrollY: before.scrollY },
              after: { viewport: after.viewport, documentWidth: after.documentWidth, documentHeight: after.documentHeight, scrollY: after.scrollY },
            },
            findings,
          })
          console.log(`  ${label}: ${findings.length} finding(s)`)
        } catch (err) {
          errors.push({ run: label, error: String(err.message || err) })
          console.error(`  ${label}: FAILED — ${err.message || err}`)
        } finally {
          await page.close()
        }
      }
    }
    await context.close()
  }

  await browser.close()

  // -- Output ---------------------------------------------------------------

  const all = runs.flatMap((r) => r.findings.map((f) => ({ ...f, run: r.id })))
  const bySeverity = { BLOCKER: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  const byRule = {}
  for (const f of all) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1
    byRule[f.rule] ??= { count: 0, runs: [] }
    byRule[f.rule].count++
    byRule[f.rule].runs.push(f.run)
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    devices: [...new Set(postureIds.map((id) => POSTURES[id].device))],
    postures: postureIds,
    transitions: transitions.map((t) => t.id),
    runCount: runs.length,
    findingCount: all.length,
    bySeverity,
    byRule,
    errors,
  }

  await writeFile(path.join(outDir, 'findings.json'), JSON.stringify({ summary, runs }, null, 2))

  console.log('')
  console.log(`Runs: ${runs.length}   Findings: ${all.length}`)
  console.log(`  BLOCKER ${bySeverity.BLOCKER}  HIGH ${bySeverity.HIGH}  MEDIUM ${bySeverity.MEDIUM}  LOW ${bySeverity.LOW}`)
  if (errors.length) console.log(`  ${errors.length} run(s) failed — see findings.json`)
  console.log('')
  console.log(`Output:      ${outDir}`)
  console.log(`Screenshots: ${shotDir}  (look at every one; compare before/after pairs side by side)`)

  if (typeof args['fail-on'] === 'string') {
    const gate = args['fail-on'].split(',').map((s) => s.trim().toUpperCase())
    const tripped = gate.filter((s) => (bySeverity[s] || 0) > 0)
    if (tripped.length) {
      console.error(`\nGate failed: findings present at ${tripped.join(', ')}`)
      process.exit(1)
    }
  }
}

main().catch((err) => {
  console.error(`duo-qa failed: ${err.message || err}`)
  process.exit(2)
})
