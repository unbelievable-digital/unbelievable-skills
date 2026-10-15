---
name: client-proposal-generator
description: Use when drafting a price proposal/offer for a client project — asks about output format, language, the client's needs step by step, estimates a price range from the agency's own stored rates, and produces a Word/PDF/HTML proposal document. Triggers include "teklif hazırla", "müşteriye teklif", "client proposal", "price quote for client", "/teklif".
---

# Client proposal generator

Turns a short conversation with the operator into a client-ready proposal
document with an estimated price range, in Turkish, English, or Bulgarian,
as Word, PDF, or a self-contained HTML page.

The skill package itself contains no real pricing — only public market
benchmarks used as a reference when asking for rates. Each operator's actual
rates live outside the package at
`~/.claude/data/client-proposal-generator/rates.json`, so this skill is safe
to share or publish. Never put real rate numbers into the proposal template,
`references/pricing-logic.md`, or anywhere else inside this folder — only
the final computed range goes to the client, and only inside the generated
document.

## When to use

- Operator asks to prepare a proposal/offer/quote for a client
- Operator wants a price range for a described project, formatted to send

## When NOT to use

- Internal budgeting or estimating your own team's cost (not a client-facing
  document) — this skill is specifically for the client deliverable.

## Prerequisites

- A rates file at `~/.claude/data/client-proposal-generator/rates.json` (a
  path outside this skill's own folder — this skill may be installed as a
  shared plugin, so nothing it writes can live inside the installed
  package). If that file doesn't exist, run the setup flow below first —
  automatically, without asking whether to do it.

## Steps

1. **Check for `~/.claude/data/client-proposal-generator/rates.json`.** If
   missing, or if the operator says something like "update rates" /
   "ücretleri güncelle", run the setup in `references/pricing-logic.md`
   ("Setup: collecting the user's own rates") before anything else. Ask each
   rate one at a time, showing the Bulgaria 2026 benchmark as context, then
   create the directory if needed and write the file there — never inside
   this skill's own folder.
2. **Run the question flow** in `references/questions.md`, one question at a
   time, adapting to what the operator already said in earlier answers.
3. **Compute the price range** following
   `references/pricing-logic.md` ("Computing a proposal's price range"),
   using the stored rates from `~/.claude/data/client-proposal-generator/rates.json`.
4. **Confirm scope + price with the operator** before generating anything —
   a short summary, let them correct it.
5. **Generate the document**, in the chosen language, using
   `assets/proposal-template.html` as the structural base (fill in every
   `{{PLACEHOLDER}}`; the logo file is `assets/logo.png`, already referenced
   in the template as `logo.png` — copy it next to the output file or inline
   it as a base64 `data:` URI):
   - **HTML**: write the filled template directly as the output file. Keep
     the `.pdf-btn` button — it's the client's way to get a PDF.
   - **PDF**: build the same content as a PDF. Use the `pdf` skill if
     available for PDF creation; otherwise render the filled HTML and export
     it to PDF.
   - **Word**: use the `docx` skill to produce a `.docx` with equivalent
     structure (header with logo, title, understanding, scope table,
     timeline, investment range, next steps, footer) — match the section
     order of the HTML template.
6. **Hand off the file path** to the operator. Do not send or publish it
   anywhere yourself.

## Example

Operator: "Bir e-ticaret müşterisine teklif hazırlayalım, Shopify mağaza +
2 dil + ödeme entegrasyonu istiyor, 3 haftada bitsin."

→ Ask format → PDF. Ask language → Turkish. Ask client name → "Acme Ltd".
Service → E-commerce. Scope → custom theme, 2 languages, 1 payment
integration, normal timeline (3 weeks is not under 2, so no rush multiplier).
Compute range from stored e-commerce rate × estimated hours × (+10% language,
+10% integration). Confirm, then generate the PDF.

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| No `~/.claude/data/client-proposal-generator/rates.json` yet | First use | Run setup first, don't skip to questions |
| Operator gives a single target number, not a range | They want a tighter quote | Still compute the full range internally, but you may present the number they want alongside the range — never silently drop the range logic |
| Client description doesn't map to any clean service category | Mixed/unclear ask | Ask operator to pick the closest category(ies) rather than guessing silently |
| Logo missing from output | Didn't copy `assets/logo.png` next to the generated file, or didn't inline it | Always inline as base64 `data:` URI for HTML/PDF so the file is self-contained |

## References

- `references/pricing-logic.md` — rate setup, the benchmark table, and the
  multiplier math
- `references/questions.md` — the full step-by-step question flow, branched
  per service
- `assets/proposal-template.html` — structural template for all three output
  formats
- `assets/logo.png` — Unbelievable Digital brand mark
