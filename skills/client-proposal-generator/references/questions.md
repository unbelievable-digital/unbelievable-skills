# Question flow

Ask one question at a time. Wait for each answer before asking the next.
Use the operator's own language for the conversation (the questions below are
in English for reference) unless they're already speaking another language —
then ask in that language.

## 1. Output format

"Word (.docx), PDF, or HTML?" If HTML, tell them it will include a built-in
"Download as PDF" button so the client can convert it themselves.

## 2. Proposal language

"Which language should the proposal itself be written in — Turkish, English,
or Bulgarian?" This is independent of the conversation language.

## 3. Client basics

- Client / company name
- Contact person (optional, skip if not offered)

## 4. Service selection

"Which service(s) is this proposal for?" (multi-select)

- Web / web app development
- E-commerce (Shopify etc.)
- SEO
- Design / branding
- Mobile app
- QA / testing

## 5. Project description

Open question: "Describe what the client wants, in your own words." Use this
to infer scope details in step 6 before asking — only ask what the
description didn't already answer.

## 6. Scope details (branch per selected service)

Ask only what's needed to run the pricing multiplier
(`references/pricing-logic.md`). Skip anything already clear from step 5.

**Web / web app / e-commerce:**
- Custom design or template/theme based?
- How many pages/screens, roughly?
- Any third-party integrations (payment, CRM, ERP, custom API)? How many?
- How many languages does the site need?

**SEO:**
- Rough scope: technical audit only, ongoing monthly work, or full campaign?
- Estimated hours/month if it's retainer work (or let the agent estimate from
  the description and confirm with the operator).

**Design / branding:**
- Logo + full identity system, or a narrower deliverable (e.g. just a style
  guide)?
- How many revision rounds are included?

**Mobile app:**
- iOS, Android, or both/cross-platform?
- Rough screen count.
- Backend/API work included, or frontend only?

**QA / testing:**
- One-time audit or ongoing?
- Device/browser matrix size (rough).

## 7. Timeline

"What's the expected timeline — is this urgent (under 2 weeks) or normal?"

## 8. Anything client already mentioned about budget

Optional — only ask if not obvious from the description. "Did the client
mention any budget expectation already?" Use this only as a sanity check
against the computed range, never to override the pricing logic.

## After questions: confirm before generating

Summarize the understood scope and the computed price range back to the
operator in one short message before producing the document. Let them correct
anything (e.g. "actually make it rush timeline") before you generate the
final file.
