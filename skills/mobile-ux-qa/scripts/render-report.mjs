#!/usr/bin/env node
/**
 * render-report — turn a mobile-qa report.json into a single HTML report.
 *
 * The agent writes report.json after looking at the screenshots (grouped
 * findings, summary, suggestions). This script only lays it out: severity
 * tables, one card per finding with its evidence screenshots inline, and a run
 * matrix built from findings.json. It makes no judgements of its own.
 *
 * Usage:
 *   node render-report.mjs qa-reports/<timestamp>
 *   node render-report.mjs qa-reports/<timestamp> --embed   # single portable file
 *
 * Without --embed, images are referenced relatively, so report.html must stay
 * next to screenshots/. With --embed, every referenced screenshot is inlined as
 * base64 and the HTML can be sent on its own. No dependencies, no network.
 *
 * See ../SKILL.md step 6 for the report.json shape.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const SEVERITIES = ['BLOCKER', 'HIGH', 'MEDIUM', 'LOW']
const VERDICTS = {
  'not-shippable': 'Not shippable',
  'shippable-with-fixes': 'Shippable after fixes',
  shippable: 'Shippable',
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Escape, then allow `inline code` — the only markup report text may carry. */
function text(value) {
  return esc(value).replace(/`([^`]+)`/g, '<code>$1</code>')
}

function paragraphs(value) {
  if (!value) return ''
  return String(value).split(/\n{2,}/).map((p) => `<p>${text(p)}</p>`).join('')
}

async function imageSrc(dir, rel, embed) {
  const file = path.join(dir, rel)
  if (!existsSync(file)) return null
  if (!embed) return rel.split(path.sep).join('/')
  const data = await readFile(file)
  return `data:image/png;base64,${data.toString('base64')}`
}

async function main() {
  const args = process.argv.slice(2)
  const dir = args.find((a) => !a.startsWith('--'))
  const embed = args.includes('--embed')
  if (!dir) {
    console.error('Usage: node render-report.mjs <report-dir> [--embed]')
    process.exit(2)
  }

  const reportPath = path.join(dir, 'report.json')
  if (!existsSync(reportPath)) {
    console.error(`No report.json in ${dir}. Write it first — see SKILL.md step 6.`)
    process.exit(2)
  }
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  const raw = existsSync(path.join(dir, 'findings.json'))
    ? JSON.parse(await readFile(path.join(dir, 'findings.json'), 'utf8'))
    : null

  const findings = report.findings ?? []
  const missing = []

  // -- Summary tables -------------------------------------------------------

  const grouped = Object.fromEntries(SEVERITIES.map((s) => [s, 0]))
  for (const f of findings) grouped[f.severity] = (grouped[f.severity] || 0) + 1
  const occurrences = raw?.summary?.bySeverity ?? {}

  const severityRows = SEVERITIES.map((s) => `
    <tr>
      <td><span class="sev sev-${s.toLowerCase()}">${s}</span></td>
      <td class="num">${grouped[s]}</td>
      ${raw ? `<td class="num muted">${occurrences[s] ?? 0}</td>` : ''}
    </tr>`).join('')

  // -- Findings -------------------------------------------------------------

  const cards = []
  for (const [i, f] of findings.entries()) {
    const shots = []
    for (const rel of f.evidence ?? []) {
      const src = await imageSrc(dir, rel, embed)
      if (!src) { missing.push(rel); continue }
      shots.push(`
        <figure>
          <a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(rel)}" loading="lazy"></a>
          <figcaption>${esc(path.basename(rel))}</figcaption>
        </figure>`)
    }

    const where = (f.where ?? []).map((w) => `
      <tr><td><code>${esc(w.page)}</code></td><td>${(w.devices ?? []).map(esc).join(', ')}</td></tr>`).join('')

    const measured = (f.measurements ?? []).map((m) => `
      <tr><th scope="row">${text(m.label)}</th><td>${text(m.value)}</td></tr>`).join('')

    const sev = String(f.severity || 'LOW').toUpperCase()
    cards.push(`
    <article class="finding" id="f${i + 1}">
      <header>
        <span class="idx">${i + 1}</span>
        <span class="sev sev-${sev.toLowerCase()}">${esc(sev)}</span>
        <h3>${text(f.title)}</h3>
        <span class="source">${f.source === 'visual' ? 'Observed visually' : esc(f.rule || 'Rule')}</span>
      </header>
      ${where ? `<table class="kv"><thead><tr><th>Page</th><th>Devices</th></tr></thead><tbody>${where}</tbody></table>` : ''}
      ${f.element ? `<p class="element">Element: <code>${esc(f.element)}</code></p>` : ''}
      ${paragraphs(f.impact)}
      ${measured ? `<table class="kv measured"><tbody>${measured}</tbody></table>` : ''}
      ${f.suggestion ? `<div class="suggestion"><strong>Suggestion</strong>${paragraphs(f.suggestion)}</div>` : ''}
      ${shots.length ? `<div class="shots">${shots.join('')}</div>` : ''}
    </article>`)
  }

  // -- Run matrix -----------------------------------------------------------

  let matrix = ''
  if (raw?.runs?.length) {
    const rows = raw.runs.map((r) => {
      const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]))
      for (const f of r.findings ?? []) counts[f.severity] = (counts[f.severity] || 0) + 1
      return `
      <tr>
        <td><code>${esc(r.path ?? r.page)}</code>${r.state ? ` <span class="muted">· ${esc(r.state)}</span>` : ''}</td>
        <td>${esc(r.deviceLabel ?? r.device)}</td>
        <td>${esc(r.orientation ?? '')}</td>
        <td>${esc(r.engine ?? '')}</td>
        ${SEVERITIES.map((s) => `<td class="num${counts[s] ? ` hit-${s.toLowerCase()}` : ' muted'}">${counts[s]}</td>`).join('')}
      </tr>`
    }).join('')
    matrix = `
    <section>
      <h2>Run matrix</h2>
      <p class="muted">Raw rule hits per run, before grouping. Visual findings are not counted here.</p>
      <div class="scroll">
        <table class="grid">
          <thead><tr><th>Page</th><th>Device</th><th>Orientation</th><th>Engine</th>${SEVERITIES.map((s) => `<th class="num">${s}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`
  }

  const errors = raw?.summary?.errors ?? []
  const notInvestigated = report.notInvestigated ?? []
  const toc = findings.map((f, i) => `
      <li><a href="#f${i + 1}"><span class="sev sev-${String(f.severity).toLowerCase()}">${esc(f.severity)}</span> ${text(f.title)}</a></li>`).join('')

  const verdict = VERDICTS[report.verdict]
  const title = `Mobile UX QA — ${report.project ?? 'Report'}`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<style>
  :root {
    --bg: #f7f7f5; --panel: #ffffff; --ink: #1c1c1a; --muted: #6b6b66; --line: #e3e2de;
    --code: #efeeea; --accent: #2f5fd0;
    --blocker: #b3261e; --high: #c2570c; --medium: #a17a00; --low: #4a6a8a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #141413; --panel: #1d1d1b; --ink: #ecebe6; --muted: #9b9a94; --line: #2f2e2b;
      --code: #2a2926; --accent: #8fb0ff;
      --blocker: #ff7b72; --high: #ffa657; --medium: #e3c35a; --low: #8fb3d6;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 1040px; margin: 0 auto; padding: 32px max(16px, env(safe-area-inset-left)) 64px; }
  h1 { font-size: 1.7rem; margin: 0 0 4px; }
  h2 { font-size: 1.2rem; margin: 40px 0 12px; }
  h3 { font-size: 1.05rem; margin: 0; flex: 1 1 240px; }
  p { margin: 8px 0; }
  a { color: var(--accent); }
  code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: .88em; word-break: break-word; }
  .muted { color: var(--muted); }
  .meta { color: var(--muted); margin: 0 0 20px; }
  .verdict { display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 600; border: 1px solid currentColor; }
  .verdict-not-shippable { color: var(--blocker); }
  .verdict-shippable-with-fixes { color: var(--high); }
  .verdict-shippable { color: var(--low); }
  .panel, .finding { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 20px; }
  .summary { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: start; }
  @media (max-width: 640px) { .summary { grid-template-columns: 1fr; } }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-weight: 600; font-size: .85rem; color: var(--muted); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .sev { display: inline-block; font-size: .72rem; font-weight: 700; letter-spacing: .04em;
    padding: 2px 8px; border-radius: 4px; color: #fff; }
  .sev-blocker { background: var(--blocker); } .sev-high { background: var(--high); }
  .sev-medium { background: var(--medium); } .sev-low { background: var(--low); }
  @media (prefers-color-scheme: dark) { .sev { color: #141413; } }
  .hit-blocker { color: var(--blocker); font-weight: 700; } .hit-high { color: var(--high); font-weight: 700; }
  .hit-medium { color: var(--medium); font-weight: 600; } .hit-low { color: var(--low); }
  .toc { list-style: none; padding: 0; margin: 0; }
  .toc li { padding: 4px 0; }
  .toc a { color: inherit; text-decoration: none; }
  .toc a:hover { text-decoration: underline; }
  .finding { margin: 0 0 20px; scroll-margin-top: 16px; }
  .finding header { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; margin-bottom: 12px; }
  .idx { color: var(--muted); font-variant-numeric: tabular-nums; }
  .source { font-size: .8rem; color: var(--muted); }
  .kv { margin: 10px 0; }
  .measured th { width: 40%; color: var(--ink); font-weight: 500; }
  .element { color: var(--muted); }
  .suggestion { border-left: 3px solid var(--accent); padding: 4px 0 4px 14px; margin: 14px 0; }
  .suggestion p { margin: 4px 0 0; }
  .shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-top: 14px; }
  figure { margin: 0; }
  figure img { display: block; width: 100%; max-height: 420px; object-fit: cover; object-position: top;
    border: 1px solid var(--line); border-radius: 6px; background: var(--code); }
  figcaption { font-size: .75rem; color: var(--muted); margin-top: 4px; word-break: break-all; }
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .grid { font-size: .88rem; white-space: nowrap; }
  ul.plain { margin: 8px 0; padding-left: 20px; }
</style>
</head>
<body>
<main>
  <h1>${esc(title)}</h1>
  <p class="meta">${[
    report.date && esc(report.date),
    report.target && `Target: <a href="${esc(report.target)}">${esc(report.target)}</a>`,
    raw?.summary?.devices && `Devices: ${raw.summary.devices.length}`,
    raw?.runs && `Pages: ${new Set(raw.runs.map((r) => r.path ?? r.page)).size}`,
    raw?.summary?.runCount != null && `Runs: ${raw.summary.runCount}`,
  ].filter(Boolean).join(' · ')}</p>

  <section class="panel summary">
    <div>
      ${verdict ? `<p><span class="verdict verdict-${esc(report.verdict)}">${esc(verdict)}</span></p>` : ''}
      ${paragraphs(report.summary)}
      ${report.orderRationale ? `<p class="muted">${text(report.orderRationale)}</p>` : ''}
    </div>
    <table>
      <thead><tr><th>Severity</th><th class="num">Findings</th>${raw ? '<th class="num">Rule hits</th>' : ''}</tr></thead>
      <tbody>${severityRows}</tbody>
    </table>
  </section>

  ${toc ? `<h2>Contents</h2><ol class="toc">${toc}</ol>` : ''}

  <section>
    <h2>Findings</h2>
    ${cards.join('') || '<p class="muted">No findings.</p>'}
  </section>

  ${matrix}

  ${errors.length ? `
  <section>
    <h2>Failed runs</h2>
    <ul class="plain">${errors.map((e) => `<li><code>${esc(e.run)}</code> — ${esc(e.error)}</li>`).join('')}</ul>
  </section>` : ''}

  ${notInvestigated.length ? `
  <section>
    <h2>Not investigated</h2>
    <ul class="plain">${notInvestigated.map((n) => `<li>${text(n)}</li>`).join('')}</ul>
  </section>` : ''}
</main>
</body>
</html>
`

  const out = path.join(dir, 'report.html')
  await writeFile(out, html)
  console.log(`Report: ${out}${embed ? '  (screenshots embedded)' : '  (keep next to screenshots/)'}`)
  if (missing.length) {
    console.warn(`\n${missing.length} evidence path(s) not found — fix them in report.json:`)
    for (const m of [...new Set(missing)]) console.warn(`  ${m}`)
  }
}

main().catch((err) => {
  console.error(`render-report failed: ${err.message || err}`)
  process.exit(2)
})
