---
name: vgpify
description: Analyze a nonprofit website, discover its organization identity and giving pathways, flag conflicts, and generate an evidence-backed draft Verified Giving Protocol (VGP) declaration plus optional WebMCP tools. Use for requests such as "vgpify this nonprofit," auditing whether a donation destination is authorized, preparing `/giving.json`, comparing a third-party giving page against a nonprofit's declaration, or making a nonprofit website agent-ready for giving. Never infer authorization from discovery evidence.
---

# VGPify

Turn public nonprofit website evidence into a reviewable VGP draft. Keep discovery, authorization, and donor payment as three separate decisions.

## Non-negotiable trust rule

Treat these statements differently:

- `benefits`: A party says a destination benefits the organization.
- `confirmed`: Public evidence consistently identifies the destination and recipient.
- `authorized`: A nonprofit administrator explicitly approves the destination for publication.

Never promote `benefits` or `confirmed` to `authorized`. Never describe a destination absent from the nonprofit's approved VGP declaration as fraudulent; say it is **not listed as authorized**.

## Workflow

### 1. Establish scope

Accept one canonical nonprofit URL. Normalize it to an HTTPS origin and record redirects. Do not cross authentication, CAPTCHA, paywall, or robots restrictions.

Create a working evidence ledger with one row per claim:

- claim type
- extracted value
- source URL
- page title
- short supporting excerpt
- retrieval date
- confidence
- conflict notes

Read [references/evidence-rules.md](references/evidence-rules.md) before judging a candidate or resolving a conflict.

### 2. Crawl deliberately

Inspect the homepage and likely public pages:

- About, mission, leadership, and contact
- Donate and recurring-gift flows
- Ways to Give, DAF, stock, ACH, check, crypto, and workplace giving
- Footer, privacy, terms, disclosures, and tax/legal pages
- Linked processor pages and embedded form configuration visible to the public

Use the site's sitemap and internal search when available. Follow only relevant links. Record the final URL after redirects. Treat third-party processor content as external evidence even when linked by the nonprofit.

### 3. Identify the organization

Extract without guessing:

- legal name
- display name
- EIN or other jurisdictional identifier
- canonical domain
- country
- nonprofit status claim
- donation contact, if public

Use `null` for unresolved values in the review artifact. Do not fill gaps from memory or plausible naming.

### 4. Discover candidate pathways

Create one candidate per materially distinct giving destination. Capture:

- stable candidate ID
- method (`credit_card`, `ach`, `check`, `daf`, `stock`, `crypto`, `workplace`, or `other`)
- provider
- final destination URL or offline instructions
- named recipient
- recurring support
- designation support
- restrictions
- evidence
- discovery status: `confirmed`, `needs_review`, `conflicting`, or `not_verified`

`confirmed` means the evidence agrees about the candidate. It does **not** mean authorized.

### 5. Detect conflicts

Compare at minimum:

- website legal name vs. donation recipient
- EINs across first-party and processor pages
- canonical-domain claims vs. redirects
- current donate links vs. stale footer/legal links
- processor recipient vs. public-facing brand
- unrestricted messaging vs. fund/designation restrictions

Do not silently resolve parent/subsidiary, fiscal-sponsor, DBA, foundation, affiliate, or successor relationships. Mark the candidate `conflicting` unless first-party evidence explains the relationship.

### 6. Generate review artifacts

Produce:

1. `vgp-review.json` — all evidence, unresolved facts, candidates, and conflicts.
2. `giving.draft.json` — a schema-valid VGP file. Keep `giving.authorized_destinations` empty and `verification.organization_approved` false unless explicit administrator approval has already been supplied.
3. `approval-checklist.md` — concise questions requiring human answers.

Copy the schemas from `assets/` into the project when useful. Follow [references/vgp-0.1.md](references/vgp-0.1.md) for field semantics.

### 7. Require human authorization

Before moving a candidate into `authorized_destinations`, require the user to provide all of:

- the candidate ID
- confirmation that they are authorized to approve giving destinations for the nonprofit
- their organizational role (role only; do not require personal data)
- the exact statement: `Our organization authorizes donations through this destination.`

If any element is absent, stop at the draft and request it. Do not manufacture or paraphrase the affirmation.

After explicit approval, run:

```bash
python3 <skill-dir>/scripts/approve_destination.py \
  --review vgp-review.json \
  --vgp giving.draft.json \
  --candidate-id direct-card \
  --approver-role "Executive Director" \
  --statement "Our organization authorizes donations through this destination."
```

This gate records authorization metadata and promotes only the named candidate.

### 8. Generate WebMCP only from approved VGP data

After at least one destination is authorized, generate the integration:

```bash
python3 <skill-dir>/scripts/generate_webmcp.py \
  --output integration/giving-tools.js \
  --vgp-url /giving.json
```

The generated tools expose:

- `giving_verify`
- `giving_options`
- `giving_designations`
- `giving_prepare`

`giving_prepare` prepares a URL and must never charge, submit payment, or imply that payment occurred. The donor remains responsible for final payment authorization.

Read [references/webmcp.md](references/webmcp.md) before changing the integration because WebMCP remains a developing API.

### 9. Advertise the declaration

Publishing is not discovery. No agent looks for `/giving.json` yet, so a
declaration that is only served is a declaration nobody reads. Set up all
three, cheapest first:

- **A visible link on the donation page.** `<a href="/giving.json">` is the only
  mechanism that works with an agent that has never heard of VGP, because
  following a link needs no convention to have been adopted first. It also keeps
  the file legible to people.
- **Schema.org markup on the donation page.** Restate a subset of the
  declaration — `legalName`, `taxID`, `nonprofitStatus`, and a `DonateAction`
  whose `EntryPoint.urlTemplate` carries the prefill contract — in the
  vocabulary today's agents already parse. Derive every value from the
  declaration; it is a bridge, never a second source of truth.
- **An entry in `/llms.txt`**, where the site publishes one, naming the
  declaration as authoritative and the donate page as the one authorised
  pathway.

Then `<link rel="giving">` in the head, which costs nothing and will matter once
consumers exist.

### 10. Validate

Run both validators before publication:

```bash
python3 <skill-dir>/scripts/validate_vgp.py giving.draft.json
python3 <skill-dir>/scripts/validate_vgp.py giving.draft.json --check-urls
node --check integration/giving-tools.js
```

Also verify manually:

- `/giving.json` resolves on the canonical HTTPS domain.
- Tool responses contain only approved VGP destinations.
- An absent third-party destination produces `not listed as authorized`, not `fraudulent`.
- `giving_prepare` does not initiate payment.
- The live page registers tools in a clean WebMCP-capable browser.

## Output language

Use these exact distinctions:

- Candidate with only third-party claims: `This service says it benefits [organization], but authorization is not verified.`
- Candidate absent from approved VGP: `This destination is not listed by [organization] as an authorized giving pathway.`
- Conflict: `The website and donation flow identify different legal recipients. Administrator review is required.`
- Approved destination: `[Organization] lists this destination as authorized in its VGP declaration.`

Never claim tax deductibility, nonprofit status, fraud, ownership relationships, or processor legitimacy without direct supporting evidence.
