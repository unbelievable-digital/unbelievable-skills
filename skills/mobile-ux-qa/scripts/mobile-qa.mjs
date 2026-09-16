#!/usr/bin/env node
/**
 * mobile-qa — mobile-first UX audit runner.
 *
 * Walks a set of pages across a device matrix, in both orientations, measures
 * what is measurable, and captures a screenshot of every combination so a human
 * (or an agent with vision) can judge what the rules cannot.
 *
 * Writes findings.json and screenshots/ into the output directory. It does not
 * write the report — that is composed after the screenshots have been looked at.
 *
 * Usage:
 *   node mobile-qa.mjs --url https://example.com --pages /,/products,/cart
 *   node mobile-qa.mjs --config mobile-qa.config.json
 *
 * See ../SKILL.md for the workflow and ../references/checks.md for the rules.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

/**
 * Playwright lives in the project under test, not next to this script, so a
 * bare `import 'playwright'` resolves against the skill directory and fails.
 * Resolve it from the working directory first, then fall back to the script's
 * own neighbourhood for the case where the skill folder has its own install.
 */
async function loadPlaywright() {
  const attempts = [
    () => createRequire(path.join(process.cwd(), 'index.js')).resolve('playwright'),
    () => createRequire(import.meta.url).resolve('playwright'),
  ]
  for (const attempt of attempts) {
    try {
      const mod = await import(pathToFileURL(attempt()).href)
      // Playwright ships CommonJS, so a dynamic import puts the real exports
      // on `default` rather than on the namespace itself.
      return mod.chromium ? mod : mod.default
    } catch { /* try the next location */ }
  }
  throw new Error(
    'Playwright is not installed in ' + process.cwd() + '.\n' +
    '  npm i -D playwright && npx playwright install chromium webkit',
  )
}

const { chromium, webkit } = await loadPlaywright()

// ---------------------------------------------------------------------------
// Device registry
// ---------------------------------------------------------------------------

const UA_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const UA_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

/** Viewports are CSS pixels. See ../references/devices.md for provenance. */
const DEVICES = {
  'galaxy-s8plus': {
    label: 'Galaxy S8+', engine: 'chromium', width: 360, height: 740,
    dpr: 4, ua: UA_ANDROID, orientations: ['portrait', 'landscape'], tier: 'default',
  },
  'iphone-se': {
    label: 'iPhone SE', engine: 'webkit', width: 375, height: 667,
    dpr: 2, ua: UA_IOS, orientations: ['portrait', 'landscape'], tier: 'default',
  },
  'iphone-14-pro': {
    label: 'iPhone 14 Pro', engine: 'webkit', width: 393, height: 852,
    dpr: 3, ua: UA_IOS, orientations: ['portrait', 'landscape'], tier: 'default',
  },
  'iphone-duo-unfolded': {
    label: 'iPhone Duo (open)', engine: 'webkit', width: 626, height: 890,
    dpr: 3, ua: UA_IOS, orientations: ['portrait', 'landscape'], tier: 'default',
  },
  'pixel-7': {
    label: 'Pixel 7', engine: 'chromium', width: 412, height: 915,
    dpr: 2.625, ua: UA_ANDROID, orientations: ['portrait'], tier: 'extended',
  },
  'iphone-duo-folded': {
    label: 'iPhone Duo (closed)', engine: 'webkit', width: 466, height: 678,
    dpr: 3, ua: UA_IOS, orientations: ['portrait'], tier: 'extended',
  },
  'ipad-mini': {
    label: 'iPad mini', engine: 'webkit', width: 768, height: 1024,
    dpr: 2, ua: UA_IPAD, orientations: ['portrait', 'landscape'], tier: 'tablet',
  },
  'ipad-pro-11': {
    label: 'iPad Pro 11"', engine: 'webkit', width: 834, height: 1194,
    dpr: 2, ua: UA_IPAD, orientations: ['portrait', 'landscape'], tier: 'tablet',
  },
}

/** Estimated on-screen keyboard height in CSS px, measured from the viewport bottom. */
const KEYBOARD_HEIGHT = { portrait: 260, landscape: 200 }

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] }
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith('--')) { args._.push(raw); continue }
    const [key, ...rest] = raw.slice(2).split('=')
    args[key] = rest.length ? rest.join('=') : true
  }
  return args
}

const args = parseArgs(process.argv)

if (args.help) {
  console.log(`mobile-qa — mobile-first UX audit

  --config <path>     Config file (default: mobile-qa.config.json if present)
  --url <url>         Base URL. Overrides config baseUrl.
  --pages <list>      Comma-separated paths. Overrides config pages.
  --out <dir>         Output directory (default: qa-reports/<timestamp>)
  --devices <set>     default | all | comma-separated ids (default: default)
  --tablets           Add the tablet devices
  --perf              Run the performance group (Chromium only, slower)
  --no-fold           Skip the iPhone Duo fold-transition check
  --fail-on <list>    Exit 1 if findings at these severities exist, e.g. blocker,high
  --headed            Show the browser
  --timeout <ms>      Navigation timeout (default: 30000)
`)
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

async function loadConfig() {
  const explicit = typeof args.config === 'string' ? args.config : null
  const candidate = explicit ?? 'mobile-qa.config.json'
  let config = {}

  if (existsSync(candidate)) {
    config = JSON.parse(await readFile(candidate, 'utf8'))
  } else if (explicit) {
    throw new Error(`Config file not found: ${explicit}`)
  }

  if (typeof args.url === 'string') config.baseUrl = args.url
  if (typeof args.pages === 'string') {
    config.pages = args.pages.split(',').map((p) => {
      const trimmed = p.trim()
      const name = trimmed === '/' ? 'home' : trimmed.replace(/^\//, '').replace(/[^\w-]+/g, '-')
      return { name: name || 'page', path: trimmed }
    })
  }

  if (!config.baseUrl) {
    throw new Error('No target. Pass --url, or set baseUrl in the config file.')
  }
  if (!config.pages?.length) {
    throw new Error('No pages. Pass --pages, or list pages in the config file.')
  }

  config.states ??= []
  config.ignore ??= []
  return config
}

function selectDevices() {
  const requested = typeof args.devices === 'string' ? args.devices : 'default'
  let ids

  if (requested === 'all') {
    ids = Object.keys(DEVICES).filter((id) => DEVICES[id].tier !== 'tablet')
  } else if (requested === 'default') {
    ids = Object.keys(DEVICES).filter((id) => DEVICES[id].tier === 'default')
  } else {
    ids = requested.split(',').map((s) => s.trim())
    const unknown = ids.filter((id) => !DEVICES[id])
    if (unknown.length) {
      throw new Error(`Unknown device id(s): ${unknown.join(', ')}. Known: ${Object.keys(DEVICES).join(', ')}`)
    }
  }

  if (args.tablets) {
    ids = ids.concat(Object.keys(DEVICES).filter((id) => DEVICES[id].tier === 'tablet'))
  }
  return [...new Set(ids)]
}

// ---------------------------------------------------------------------------
// In-page audit
//
// Runs inside the browser. Must be fully self-contained — it cannot close over
// anything in this module.
// ---------------------------------------------------------------------------

function pageAudit(opts) {
  const { ignore, keyboardHeight, orientation } = opts
  const findings = []
  const vw = window.innerWidth
  const vh = window.innerHeight

  const ignored = new Set()
  for (const sel of ignore) {
    try {
      document.querySelectorAll(sel).forEach((el) => {
        ignored.add(el)
        el.querySelectorAll('*').forEach((child) => ignored.add(child))
      })
    } catch { /* an invalid selector in config should not abort the audit */ }
  }

  // -- helpers --------------------------------------------------------------

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return ''
    if (el.id) return `#${el.id}`
    const parts = []
    let node = el
    let depth = 0
    while (node && node.nodeType === 1 && depth < 4) {
      let part = node.tagName.toLowerCase()
      const cls = (node.getAttribute('class') || '')
        .split(/\s+/)
        .filter((c) => c && !/^(is-|has-|js-)/.test(c) && c.length < 30)
        .slice(0, 2)
      if (cls.length) part += '.' + cls.join('.')
      if (node.parentElement) {
        const siblings = [...node.parentElement.children].filter((s) => s.tagName === node.tagName)
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
      }
      parts.unshift(part)
      if (node.id) { parts[0] = `#${node.id}`; break }
      node = node.parentElement
      depth++
    }
    return parts.join(' > ')
  }

  function isVisible(el) {
    if (ignored.has(el)) return false
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }

  function box(el) {
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.x), y: Math.round(r.y + window.scrollY),
      w: Math.round(r.width), h: Math.round(r.height),
    }
  }

  function add(rule, severity, el, message, details) {
    findings.push({
      rule, severity,
      selector: el ? cssPath(el) : null,
      message,
      details: details || {},
      box: el ? box(el) : null,
    })
  }

  function hasDirectText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim().length > 1) return true
    }
    return false
  }

  function parseColor(value) {
    const m = value && value.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const parts = m[1].split(',').map((n) => parseFloat(n))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }

  function luminance(c) {
    const channel = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
  }

  /** Walk up for the first opaque background. Returns null when it cannot be resolved. */
  function effectiveBackground(el) {
    let node = el
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node)
      if (style.backgroundImage && style.backgroundImage !== 'none') return null
      const bg = parseColor(style.backgroundColor)
      if (bg && bg.a >= 0.95) return bg
      node = node.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }

  function contrastRatio(a, b) {
    const la = luminance(a)
    const lb = luminance(b)
    const light = Math.max(la, lb)
    const dark = Math.min(la, lb)
    return (light + 0.05) / (dark + 0.05)
  }

  const INTERACTIVE = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [onclick], summary'

  // -- Group 1: layout integrity -------------------------------------------

  const docWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body ? document.body.scrollWidth : 0,
  )
  if (docWidth > vw + 1) {
    const offenders = []
    document.querySelectorAll('body *').forEach((el) => {
      if (offenders.length >= 8 || !isVisible(el)) return
      const r = el.getBoundingClientRect()
      if (r.right > vw + 1 && r.width > 8) {
        // Only blame the element if its parent is not already overflowing.
        const parent = el.parentElement
        const pr = parent ? parent.getBoundingClientRect() : null
        if (!pr || pr.right <= vw + 1) {
          offenders.push({ selector: cssPath(el), right: Math.round(r.right), width: Math.round(r.width) })
        }
      }
    })
    findings.push({
      rule: 'overflow-horizontal', severity: 'HIGH', selector: offenders[0]?.selector ?? null,
      message: `Page scrolls horizontally: content is ${Math.round(docWidth)}px wide in a ${vw}px viewport.`,
      details: { documentWidth: Math.round(docWidth), viewportWidth: vw, overflowBy: Math.round(docWidth - vw), offenders },
      box: null,
    })
  }

  // Fixed and sticky chrome.
  const pinned = []
  document.querySelectorAll('body *').forEach((el) => {
    if (!isVisible(el)) return
    const style = getComputedStyle(el)
    if (style.position !== 'fixed' && style.position !== 'sticky') return
    const r = el.getBoundingClientRect()
    if (r.width < vw * 0.5 || r.height < 8 || r.height > vh * 0.9) return
    pinned.push({ el, rect: r, style })
  })

  let topChrome = 0
  let bottomChrome = 0
  for (const { el, rect, style } of pinned) {
    const atTop = rect.top <= 2
    const atBottom = rect.bottom >= vh - 2
    if (atTop) topChrome = Math.max(topChrome, rect.height)
    if (atBottom) bottomChrome = Math.max(bottomChrome, rect.height)

    if (atTop || atBottom) {
      const inline = el.getAttribute('style') || ''
      const padded = atTop
        ? parseFloat(style.paddingTop) > 0
        : parseFloat(style.paddingBottom) > 0
      const usesEnv = /env\(\s*safe-area-inset/.test(inline) ||
        /env\(\s*safe-area-inset/.test(style.paddingTop + style.paddingBottom + style.height)
      if (!usesEnv && !padded) {
        add('safe-area-unhandled', 'MEDIUM', el,
          `Fixed element is flush against the ${atTop ? 'top' : 'bottom'} edge with no padding and no env(safe-area-inset-*). Confirm against the screenshot that it clears the notch or home indicator.`,
          { edge: atTop ? 'top' : 'bottom', height: Math.round(rect.height) })
      }
    }
  }

  const chromeTotal = topChrome + bottomChrome
  if (chromeTotal > vh * 0.35) {
    findings.push({
      rule: 'fixed-vertical-budget',
      severity: orientation === 'landscape' ? 'HIGH' : 'MEDIUM',
      selector: null,
      message: `Fixed chrome takes ${Math.round((chromeTotal / vh) * 100)}% of the ${vh}px viewport height, leaving ${Math.round(vh - chromeTotal)}px for content.`,
      details: { topChrome: Math.round(topChrome), bottomChrome: Math.round(bottomChrome), viewportHeight: vh },
      box: null,
    })
  }

  // -- Group 2: touch and legibility ---------------------------------------

  const targets = []
  document.querySelectorAll(INTERACTIVE).forEach((el) => {
    if (!isVisible(el)) return
    if (el.disabled) return
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > document.documentElement.scrollHeight) return
    targets.push({ el, rect: r })

    const min = Math.min(r.width, r.height)
    if (min < 44) {
      add(min < 24 ? 'tap-target-small' : 'tap-target-small', min < 24 ? 'BLOCKER' : 'MEDIUM', el,
        `Tap target is ${Math.round(r.width)}×${Math.round(r.height)}px, below the 44×44px minimum.`,
        { width: Math.round(r.width), height: Math.round(r.height), text: (el.textContent || '').trim().slice(0, 40) })
    }
  })

  // Crowding: only report the first occurrence per element pair.
  const crowdedSeen = new Set()
  for (let i = 0; i < targets.length && crowdedSeen.size < 20; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i].rect
      const b = targets[j].rect
      if (targets[i].el.contains(targets[j].el) || targets[j].el.contains(targets[i].el)) continue
      const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right))
      const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom))
      if (dx === 0 && dy === 0) continue // overlapping or nested layout, not a gap problem
      const gap = dx === 0 ? dy : dy === 0 ? dx : Math.hypot(dx, dy)
      if (gap < 8) {
        const key = cssPath(targets[i].el) + '|' + cssPath(targets[j].el)
        if (crowdedSeen.has(key)) continue
        crowdedSeen.add(key)
        add('tap-target-crowded', 'MEDIUM', targets[i].el,
          `Only ${Math.round(gap)}px between this target and the next one. Mis-taps are likely.`,
          { neighbour: cssPath(targets[j].el), gap: Math.round(gap) })
        break
      }
    }
  }

  document.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!isVisible(el)) return
    if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio') return
    const size = parseFloat(getComputedStyle(el).fontSize)
    if (size < 16) {
      add('input-font-size-zoom', 'HIGH', el,
        `Control renders text at ${size}px. iOS Safari zooms the page on focus below 16px, and does not zoom back out.`,
        { fontSize: size })
    }
  })

  const textSeen = new Set()
  document.querySelectorAll('body *').forEach((el) => {
    if (textSeen.size > 400) return
    if (!isVisible(el) || !hasDirectText(el)) return
    const style = getComputedStyle(el)
    const size = parseFloat(style.fontSize)
    const weight = parseInt(style.fontWeight, 10) || 400

    if (size < 12) {
      add('text-too-small', 'MEDIUM', el, `Text renders at ${size}px.`,
        { fontSize: size, text: el.textContent.trim().slice(0, 60) })
    }

    const fg = parseColor(style.color)
    const bg = effectiveBackground(el)
    if (fg && bg && fg.a >= 0.95) {
      const ratio = contrastRatio(fg, bg)
      const large = size >= 24 || (size >= 18.66 && weight >= 700)
      const threshold = large ? 3 : 4.5
      if (ratio < threshold) {
        add('contrast-insufficient', 'MEDIUM', el,
          `Contrast ratio is ${ratio.toFixed(2)}:1, below the WCAG AA minimum of ${threshold}:1.`,
          { ratio: Number(ratio.toFixed(2)), required: threshold, fontSize: size, text: el.textContent.trim().slice(0, 60) })
      }
    }
    textSeen.add(el)
  })

  const viewportMeta = document.querySelector('meta[name="viewport"]')
  if (viewportMeta) {
    const content = viewportMeta.getAttribute('content') || ''
    const maxScale = parseFloat((content.match(/maximum-scale\s*=\s*([\d.]+)/) || [])[1])
    if (/user-scalable\s*=\s*(no|0)/.test(content) || (maxScale && maxScale < 1.5)) {
      add('zoom-disabled', 'MEDIUM', viewportMeta,
        'The viewport meta tag blocks pinch-zoom, which removes the accessibility escape hatch for low-vision users.',
        { content })
    }
  }

  // -- Group 3: forms and keyboard -----------------------------------------

  const FIELD_HINTS = [
    { re: /phone|tel|mobil|gsm/i, type: ['tel'], inputmode: ['tel', 'numeric'], autocomplete: 'tel' },
    { re: /e-?mail|eposta/i, type: ['email'], inputmode: ['email'], autocomplete: 'email' },
    { re: /zip|postal|posta.?kod/i, type: ['text', 'number'], inputmode: ['numeric'], autocomplete: 'postal-code' },
    { re: /card.?number|kart.?no/i, type: ['text'], inputmode: ['numeric'], autocomplete: 'cc-number' },
    { re: /quantity|adet|qty/i, type: ['number'], inputmode: ['numeric'], autocomplete: null },
  ]

  document.querySelectorAll('input').forEach((el) => {
    if (!isVisible(el)) return
    if (['hidden', 'checkbox', 'radio', 'submit', 'button', 'file'].includes(el.type)) return

    const label = el.labels && el.labels[0] ? el.labels[0].textContent : ''
    const haystack = [el.name, el.id, el.placeholder, label, el.getAttribute('aria-label')].filter(Boolean).join(' ')
    const hint = FIELD_HINTS.find((h) => h.re.test(haystack))

    if (hint) {
      const inputmode = el.getAttribute('inputmode')
      const typeOk = hint.type.includes(el.type)
      const modeOk = inputmode && hint.inputmode.includes(inputmode)
      if (!typeOk && !modeOk) {
        add('input-type-mismatch', 'MEDIUM', el,
          `Field looks like ${hint.re.source.split('|')[0]} but has type="${el.type}"${inputmode ? ` inputmode="${inputmode}"` : ''}. The user gets the wrong keyboard.`,
          { expectedType: hint.type, expectedInputmode: hint.inputmode, actualType: el.type })
      }
      if (hint.autocomplete && !el.getAttribute('autocomplete')) {
        add('autocomplete-missing', 'LOW', el,
          `No autocomplete attribute; autofill cannot fill this field. Expected autocomplete="${hint.autocomplete}".`,
          { expected: hint.autocomplete })
      }
    }
  })

  // Modal / drawer scroll lock.
  const overlay = document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]')
  if (overlay && isVisible(overlay)) {
    const bodyStyle = getComputedStyle(document.body)
    const locked = bodyStyle.overflow === 'hidden' ||
      bodyStyle.position === 'fixed' ||
      getComputedStyle(document.documentElement).overflow === 'hidden'
    if (!locked && document.documentElement.scrollHeight > vh) {
      add('body-scroll-not-locked', 'MEDIUM', overlay,
        'An overlay is open but the page behind it still scrolls. On a phone the background scrolls instead of the overlay content.',
        {})
    }
  }

  // Keyboard-aware checks, only meaningful when something is focused.
  const active = document.activeElement
  const isField = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
  if (isField) {
    const visibleBottom = vh - keyboardHeight
    const fieldRect = active.getBoundingClientRect()

    if (fieldRect.bottom > visibleBottom) {
      add('focus-not-scrolled-into-view', 'HIGH', active,
        `The focused field sits at ${Math.round(fieldRect.bottom)}px, below the estimated keyboard line at ${Math.round(visibleBottom)}px. The user types into a field they cannot see.`,
        { fieldBottom: Math.round(fieldRect.bottom), keyboardLine: Math.round(visibleBottom), keyboardHeight })
    }

    const form = active.closest('form')
    const submit = (form || document).querySelector('button[type="submit"], input[type="submit"], button:not([type])')
    if (submit && isVisible(submit)) {
      const sr = submit.getBoundingClientRect()
      if (sr.top > visibleBottom) {
        add('submit-below-keyboard', 'BLOCKER', submit,
          `The submit control sits at ${Math.round(sr.top)}px, under the estimated keyboard line at ${Math.round(visibleBottom)}px. With the keyboard open it cannot be reached.`,
          { submitTop: Math.round(sr.top), keyboardLine: Math.round(visibleBottom), keyboardHeight })
      }
    }
  }

  // -- Images ---------------------------------------------------------------

  document.querySelectorAll('img').forEach((el) => {
    if (!isVisible(el)) return
    const style = getComputedStyle(el)
    const hasAttrs = el.getAttribute('width') && el.getAttribute('height')
    const hasRatio = style.aspectRatio && style.aspectRatio !== 'auto'
    if (!hasAttrs && !hasRatio) {
      add('image-no-dimensions', 'MEDIUM', el,
        'Image has no width/height attributes and no CSS aspect-ratio, so its space is unknown until it loads. This is the usual cause of layout shift.',
        { src: (el.currentSrc || el.src || '').slice(0, 120) })
    }

    const displayed = el.getBoundingClientRect().width * window.devicePixelRatio
    if (el.naturalWidth && displayed > 0 && el.naturalWidth > displayed * 2) {
      add('image-oversized', 'MEDIUM', el,
        `Image is ${el.naturalWidth}px wide but is displayed at ${Math.round(displayed)}px of device pixels. The extra data costs the user bandwidth and delays paint.`,
        { naturalWidth: el.naturalWidth, displayedDevicePx: Math.round(displayed), src: (el.currentSrc || el.src || '').slice(0, 120) })
    }
  })

  return {
    findings,
    metrics: {
      viewportWidth: vw,
      viewportHeight: vh,
      documentWidth: Math.round(docWidth),
      documentHeight: document.documentElement.scrollHeight,
      topChrome: Math.round(topChrome),
      bottomChrome: Math.round(bottomChrome),
      interactiveCount: targets.length,
    },
  }
}

/** Collected separately so the fold check can compare structure before and after a resize. */
function layoutFingerprint() {
  const blocks = []
  const candidates = document.querySelectorAll('main, [role="main"], section, article, .container, .wrapper, header, footer, nav')
  candidates.forEach((el, i) => {
    if (i > 30) return
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 20) return
    blocks.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      width: Math.round(r.width),
      height: Math.round(r.height),
    })
  })
  return {
    blocks,
    documentWidth: Math.round(document.documentElement.scrollWidth),
    documentHeight: document.documentElement.scrollHeight,
    viewportWidth: window.innerWidth,
  }
}

// ---------------------------------------------------------------------------
// Step runner
// ---------------------------------------------------------------------------

async function runSteps(page, steps, timeout) {
  for (const step of steps || []) {
    if (step.click) {
      await page.locator(step.click).first().click({ timeout })
    } else if (step.focus) {
      await page.locator(step.focus).first().focus({ timeout })
    } else if (step.fill) {
      const value = step.valueFromEnv ? process.env[step.valueFromEnv] : step.value
      if (value == null) throw new Error(`Step fill "${step.fill}" has no value (env ${step.valueFromEnv} is unset)`)
      await page.locator(step.fill).first().fill(value, { timeout })
    } else if (step.press) {
      await page.keyboard.press(step.press)
    } else if (step.scroll != null) {
      await page.evaluate((y) => window.scrollTo(0, y), step.scroll)
    } else if (step.waitForUrl) {
      await page.waitForURL(step.waitForUrl, { timeout })
    } else if (step.waitFor) {
      await page.locator(step.waitFor).first().waitFor({ timeout })
    } else if (step.wait != null) {
      await page.waitForTimeout(step.wait)
    } else {
      throw new Error(`Unknown step: ${JSON.stringify(step)}`)
    }
  }
}

async function settle(page, timeout) {
  try {
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 8000) })
  } catch {
    // A page with polling or a persistent connection never goes idle. Not an error.
  }
  await page.waitForTimeout(400)
}

// ---------------------------------------------------------------------------
// Performance group
// ---------------------------------------------------------------------------

const PERF_INIT = `
  window.__perf = { lcp: 0, cls: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__perf.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) { /* unsupported engine */ }
`

async function applyThrottling(context, page) {
  // CDP is Chromium-only. Fast 3G-ish profile plus a mid-range CPU.
  const session = await context.newCDPSession(page)
  await session.send('Network.enable')
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  })
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  return session
}

function perfFindings(perf) {
  const out = []
  if (perf.lcp > 4000) {
    out.push({ rule: 'lcp-slow', severity: 'HIGH', selector: null, box: null,
      message: `LCP is ${(perf.lcp / 1000).toFixed(2)}s under 4× CPU throttling and a slow connection.`,
      details: { lcpMs: Math.round(perf.lcp) } })
  } else if (perf.lcp > 2500) {
    out.push({ rule: 'lcp-slow', severity: 'MEDIUM', selector: null, box: null,
      message: `LCP is ${(perf.lcp / 1000).toFixed(2)}s, above the 2.5s "good" threshold.`,
      details: { lcpMs: Math.round(perf.lcp) } })
  }
  if (perf.cls > 0.25) {
    out.push({ rule: 'cls-high', severity: 'HIGH', selector: null, box: null,
      message: `Cumulative Layout Shift is ${perf.cls.toFixed(3)}. Content moves under the user's thumb while they tap.`,
      details: { cls: Number(perf.cls.toFixed(3)) } })
  } else if (perf.cls > 0.1) {
    out.push({ rule: 'cls-high', severity: 'MEDIUM', selector: null, box: null,
      message: `Cumulative Layout Shift is ${perf.cls.toFixed(3)}, above the 0.1 "good" threshold.`,
      details: { cls: Number(perf.cls.toFixed(3)) } })
  }
  return out
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const ENGINES = { chromium, webkit }

async function main() {
  const config = await loadConfig()
  const deviceIds = selectDevices()
  const timeout = Number(args.timeout) || 30000
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
  const outDir = typeof args.out === 'string' ? args.out : path.join('qa-reports', stamp)
  const shotDir = path.join(outDir, 'screenshots')

  await mkdir(shotDir, { recursive: true })

  const statesByName = new Map((config.states || []).map((s) => [s.name, s]))
  const runs = []
  const errors = []
  let storageState

  // Authenticate once and reuse the session across every device.
  if (config.auth?.login) {
    const statePath = config.auth.storageState || '.auth/mobile-qa.json'
    if (existsSync(statePath)) {
      storageState = statePath
      console.log(`auth: reusing saved session at ${statePath}`)
    } else {
      console.log('auth: logging in…')
      const browser = await ENGINES.chromium.launch({ headless: !args.headed })
      const context = await browser.newContext({ viewport: { width: 393, height: 852 } })
      const page = await context.newPage()
      await page.goto(new URL(config.auth.login.path, config.baseUrl).href, { waitUntil: 'load', timeout })
      await runSteps(page, config.auth.login.steps, timeout)
      await mkdir(path.dirname(statePath), { recursive: true })
      await context.storageState({ path: statePath })
      await browser.close()
      storageState = statePath
      console.log(`auth: session saved to ${statePath}`)
    }
  }

  const byEngine = {}
  for (const id of deviceIds) (byEngine[DEVICES[id].engine] ??= []).push(id)

  for (const [engineName, ids] of Object.entries(byEngine)) {
    const browser = await ENGINES[engineName].launch({ headless: !args.headed })

    for (const id of ids) {
      const device = DEVICES[id]

      for (const orientation of device.orientations) {
        const width = orientation === 'portrait' ? device.width : device.height
        const height = orientation === 'portrait' ? device.height : device.width

        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: device.dpr,
          userAgent: device.ua,
          isMobile: engineName === 'chromium' ? true : undefined,
          hasTouch: true,
          storageState,
        })

        for (const pageDef of config.pages) {
          const stateNames = ['default', ...(pageDef.states || [])]

          for (const stateName of stateNames) {
            const label = `${pageDef.name}__${stateName}__${id}-${orientation}`
            const page = await context.newPage()
            const runPerf = Boolean(args.perf) && engineName === 'chromium' && stateName === 'default'

            try {
              if (runPerf) {
                await page.addInitScript(PERF_INIT)
                await applyThrottling(context, page)
              }

              const url = new URL(pageDef.path, config.baseUrl).href
              await page.goto(url, { waitUntil: 'load', timeout })
              await settle(page, timeout)

              if (stateName !== 'default') {
                const state = statesByName.get(stateName)
                if (!state) throw new Error(`State "${stateName}" is not defined in the config`)
                await runSteps(page, state.steps, timeout)
                await page.waitForTimeout(300)
              }

              const result = await page.evaluate(pageAudit, {
                ignore: config.ignore,
                keyboardHeight: KEYBOARD_HEIGHT[orientation],
                orientation,
              })

              if (runPerf) {
                const perf = await page.evaluate(() => window.__perf || { lcp: 0, cls: 0 })
                result.findings.push(...perfFindings(perf))
                result.metrics.perf = { lcpMs: Math.round(perf.lcp), cls: Number(perf.cls.toFixed(3)) }
              }

              const shot = path.join(shotDir, `${label}.png`)
              try {
                await page.screenshot({ path: shot, fullPage: true })
              } catch {
                await page.screenshot({ path: shot }) // very long pages can exceed the surface limit
              }

              // A full-page capture repaints fixed elements at their scroll
              // position, so sticky chrome appears more than once and cannot be
              // judged from it. This second shot is what the fixed-element and
              // above-the-fold findings should be checked against.
              const viewportShot = path.join(shotDir, `${label}--viewport.png`)
              await page.screenshot({ path: viewportShot })

              runs.push({
                id: label,
                page: pageDef.name, path: pageDef.path, state: stateName,
                device: id, deviceLabel: device.label, engine: engineName, orientation,
                viewport: { width, height }, dpr: device.dpr,
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
    }
    await browser.close()
  }

  // -- Fold transition ------------------------------------------------------

  if (!args['no-fold']) {
    console.log('fold transition: 466×678 → 626×890')
    const browser = await ENGINES.webkit.launch({ headless: !args.headed })
    const context = await browser.newContext({
      viewport: { width: 466, height: 678 },
      deviceScaleFactor: 3,
      userAgent: UA_IOS,
      hasTouch: true,
      storageState,
    })

    for (const pageDef of config.pages) {
      const page = await context.newPage()
      const label = `${pageDef.name}__fold-transition`
      try {
        await page.goto(new URL(pageDef.path, config.baseUrl).href, { waitUntil: 'load', timeout })
        await settle(page, timeout)

        const before = await page.evaluate(layoutFingerprint)
        await page.screenshot({ path: path.join(shotDir, `${label}-1-folded.png`), fullPage: true })

        // The real device changes size without navigating. So do we.
        await page.setViewportSize({ width: 626, height: 890 })
        await page.waitForTimeout(800)

        const after = await page.evaluate(layoutFingerprint)
        const audit = await page.evaluate(pageAudit, {
          ignore: config.ignore,
          keyboardHeight: KEYBOARD_HEIGHT.portrait,
          orientation: 'portrait',
        })
        await page.screenshot({ path: path.join(shotDir, `${label}-2-unfolded.png`), fullPage: true })

        const findings = []

        if (after.documentWidth > 627) {
          findings.push({
            rule: 'fold-transition-break', severity: 'HIGH', selector: null, box: null,
            message: `After opening the device the page overflows horizontally (${after.documentWidth}px in a 626px viewport). It did not overflow when closed.`,
            details: { documentWidthAfter: after.documentWidth },
          })
        }

        const stale = []
        for (let i = 0; i < Math.min(before.blocks.length, after.blocks.length); i++) {
          const a = before.blocks[i]
          const b = after.blocks[i]
          if (a.tag !== b.tag) continue
          // 160px of new width appeared. A block that did not move at all is
          // holding a width it measured once and cached.
          if (a.width === b.width && a.width > 300) {
            stale.push({ tag: b.tag, id: b.id, width: b.width })
          }
        }
        if (stale.length) {
          findings.push({
            rule: 'fold-transition-break', severity: 'HIGH', selector: null, box: null,
            message: `${stale.length} layout block(s) kept an identical width after the viewport grew by 160px, which suggests a width measured once at mount and cached.`,
            details: { blocks: stale.slice(0, 8) },
          })
        }

        const heightDelta = before.documentHeight
          ? Math.abs(after.documentHeight - before.documentHeight) / before.documentHeight
          : 0
        if (heightDelta > 0.5) {
          findings.push({
            rule: 'fold-transition-break', severity: 'MEDIUM', selector: null, box: null,
            message: `Document height changed by ${Math.round(heightDelta * 100)}% across the fold. Verify against the two screenshots that the reflow is intentional.`,
            details: { heightBefore: before.documentHeight, heightAfter: after.documentHeight },
          })
        }

        runs.push({
          id: label,
          page: pageDef.name, path: pageDef.path, state: 'fold-transition',
          device: 'iphone-duo', deviceLabel: 'iPhone Duo (fold transition)',
          engine: 'webkit', orientation: 'portrait',
          viewport: { width: 626, height: 890 }, dpr: 3,
          screenshot: `screenshots/${label}-2-unfolded.png`,
          screenshotBefore: `screenshots/${label}-1-folded.png`,
          metrics: { before, after: { ...after, blocks: undefined } },
          findings: [...findings, ...audit.findings.filter((f) => f.rule === 'overflow-horizontal')],
        })
        console.log(`  ${label}: ${findings.length} finding(s)`)
      } catch (err) {
        errors.push({ run: label, error: String(err.message || err) })
        console.error(`  ${label}: FAILED — ${err.message || err}`)
      } finally {
        await page.close()
      }
    }
    await context.close()
    await browser.close()
  }

  // -- Output ---------------------------------------------------------------

  const all = runs.flatMap((r) => r.findings.map((f) => ({ ...f, run: r.id, device: r.device, orientation: r.orientation, page: r.page, state: r.state })))
  const bySeverity = { BLOCKER: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  const byRule = {}
  for (const f of all) {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1
    byRule[f.rule] ??= { count: 0, devices: new Set() }
    byRule[f.rule].count++
    byRule[f.rule].devices.add(f.device)
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    devices: deviceIds,
    runCount: runs.length,
    findingCount: all.length,
    bySeverity,
    byRule: Object.fromEntries(
      Object.entries(byRule).map(([rule, v]) => [rule, { count: v.count, devices: [...v.devices] }]),
    ),
    errors,
  }

  await writeFile(path.join(outDir, 'findings.json'), JSON.stringify({ summary, runs }, null, 2))

  console.log('')
  console.log(`Runs: ${runs.length}   Findings: ${all.length}`)
  console.log(`  BLOCKER ${bySeverity.BLOCKER}  HIGH ${bySeverity.HIGH}  MEDIUM ${bySeverity.MEDIUM}  LOW ${bySeverity.LOW}`)
  if (errors.length) console.log(`  ${errors.length} run(s) failed — see findings.json`)
  console.log('')
  console.log(`Output:      ${outDir}`)
  console.log(`Screenshots: ${shotDir}  (${runs.length} runs, full-page + viewport — look at every one)`)

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
  console.error(`mobile-qa failed: ${err.message || err}`)
  process.exit(2)
})
