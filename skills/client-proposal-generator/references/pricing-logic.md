# Pricing logic

The benchmark numbers below are public market data (Bulgaria 2026, from
public agency listings) — safe to publish. The operator's actual rates are
never written here; they go to `~/.claude/data/client-proposal-generator/rates.json`,
outside this package. Never hand a client the benchmark table or the raw
rate card — only the final computed range belongs in a proposal.

## Setup: collecting the user's own rates

On first run (no `~/.claude/data/client-proposal-generator/rates.json`), ask
the operator for their hourly rate in EUR for each service line below. Show
the Bulgaria 2026 benchmark as a reference point in the question, but save
whatever number the operator gives — their number is the one that gets used,
the benchmark is only context.

| Service | Bulgaria 2026 benchmark (EUR/hr) |
|---|---|
| Web / web app development | 35–50 (range 25–90) |
| E-commerce (Shopify etc.) | 35–50 |
| SEO | 50–90 |
| Design / branding | 30–45 |
| Mobile app development | 40–60 |
| QA / testing | 25–40 |

Also ask for project-type base bands (used for fixed-scope web/app work instead
of pure hourly math), again showing the benchmark:

| Project type | Bulgaria 2026 benchmark (EUR) |
|---|---|
| Template / brochure site | 150–400 |
| Custom small site | 400–1,200 |
| Corporate custom design | 1,500–4,500 |
| Custom web app | 15,000+ |

Save answers to `~/.claude/data/client-proposal-generator/rates.json`
(create the directory if it doesn't exist):

```json
{
  "currency": "EUR",
  "updated": "<ISO date>",
  "hourly_rates": {
    "web": { "min": 0, "max": 0 },
    "ecommerce": { "min": 0, "max": 0 },
    "seo": { "min": 0, "max": 0 },
    "design": { "min": 0, "max": 0 },
    "mobile": { "min": 0, "max": 0 },
    "qa": { "min": 0, "max": 0 }
  },
  "project_bands": {
    "template_site": { "min": 0, "max": 0 },
    "custom_site": { "min": 0, "max": 0 },
    "corporate_site": { "min": 0, "max": 0 },
    "web_app": { "min": 0, "max": 0 }
  }
}
```

If the operator says "update rates" / "ücretleri güncelle" later, re-run this
setup and overwrite the file.

## Computing a proposal's price range

For each selected service:

1. **Pick a base.**
   - If the service is web/web app work and the project clearly matches one of
     the project-type bands (template, custom site, corporate, web app), use
     that band as the base range.
   - Otherwise (SEO, design, mobile, QA, or anything without a clean band
     match), estimate an hour range from the scope answers, then multiply by
     the stored hourly rate range: `base = hours_range × hourly_rate_range`.
2. **Apply the scope multiplier** (stack additively, as a percentage on top of
   the base range):
   - Custom design instead of a template/theme: **+30%**
   - Each additional language beyond the first: **+10%**
   - Each third-party integration (payment, CRM, ERP, custom API, etc.): **+10%**
   - Rush timeline (client wants delivery in under 2 weeks): **+25%**
   - Large scope: more than 10 pages/screens **+20%**, more than 25 **+40%**
     (these two don't stack with each other — use the higher one)
3. **Sum across services** if the client selected more than one (e.g. web +
   SEO): add each service's final min to the total min, each max to the total
   max.
4. **Present as a range, never a single number.** Round to clean figures (tens
   for small projects, hundreds for larger ones). Add a line noting the range
   firms up after a scoping call.

## Worked example

Client wants a custom-designed corporate site (not a template), in 2
languages, with a CRM integration, normal timeline, 8 pages.

- Base (corporate custom design band, from config): e.g. €1,500–4,500
- Multiplier: custom design is already priced into that band, so don't double
  count it — only add language (+10%) and integration (+10%) = **+20%**
- Result: €1,500 × 1.20 – €4,500 × 1.20 = **€1,800–5,400**

If instead this were hourly-estimated work (say, SEO, 20–40 hours at a stored
rate of €40–60/hr), with a rush timeline (+25%):

- Base: 20–40 × €40–60 = €800–2,400
- Rush: +25% → **€1,000–3,000**
