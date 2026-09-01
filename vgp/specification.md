# Verified Giving Protocol 0.1

**Status:** Draft. **Canonical schema:** [`schema.json`](schema.json). **License:** MIT.

## 1. Purpose

VGP lets the organization that controls a canonical domain publish, in machine-readable form, the giving destinations it **authorizes**.

It is not a payment rail, a tax-deductibility opinion, a fraud registry, a nonprofit directory, or an identity system. It moves no money, and it makes no claim about any party that has not published a VGP document.

## 2. Canonical location

Publish the approved document at:

```
https://<canonical-domain>/giving.json
```

Serve it as `application/json` over HTTPS. Avoid redirects where practical.

The publishing domain **is** the authority. VGP asserts nothing about a document served from anywhere else, and a document's `canonical_domain` MUST match the host that served it.

The document root is deliberate, and the alternative was `/.well-known/`. Two kinds of file live at a site's root. One describes how to speak a protocol with the server, and belongs under `/.well-known/` — `openid-configuration`, `acme-challenge`. The other is a **policy the owner publishes about what third parties may do**, and has always lived at the root: `robots.txt`, `sitemap.xml`, `ads.txt`.

VGP is the second kind. The nearest analogue is `ads.txt`, in which a domain owner declares who is authorised to sell their inventory, published specifically to defeat unauthorised intermediaries trading on their name. Substitute donations for ad inventory and it is this specification's problem. A useful test: when the file is absent, `/.well-known/openid-configuration` means *this server does not speak that protocol*, while `robots.txt`, `ads.txt` and `giving.json` mean *the owner has declared nothing* — a statement about the owner, not the server. Section 3.4 depends on that reading.

The root also keeps the file legible to people. A programme officer, a journalist, or a board member can open `example.org/giving.json` and read who is authorised, the same way anyone can read a publisher's `ads.txt`. A declaration nobody but an agent can find is harder to hold an organization to.

### 2.1 Advertising the declaration

A page MAY advertise the declaration with a link relation:

```html
<link rel="giving" type="application/json" href="/giving.json">
```

This is a **hint, not a second canonical location.** The document root above remains the only normative one, and a consumer that finds no link MUST still try it.

The hint earns its place on a donation page. An agent that has arrived at `/donate` learns that a declaration exists without spending a request on a path that, today, almost never does — and it can distinguish *"this page points at a declaration"* from *"I guessed and got a 404"*, which §3.4 otherwise leaves it unable to tell apart.

Two further mechanisms are recommended, and neither is normative. A **visible link** to the declaration from the donation page is the only one that works with an agent that has never heard of this specification, because following a link requires no convention to have been adopted first. An entry in **`/llms.txt`**, where a site publishes one, puts the declaration where a growing number of agents already look. Both are advertisements; neither is a second location, and the document root above remains the only one.

Consumers MUST refuse a cross-origin `href`. Only a same-origin link may be followed, and the document it yields is still subject to the `canonical_domain` match above. A consumer that followed a cross-origin hint would let any page nominate another organization's declaration as its own — the unauthorized-fundraising-page problem inverted, with the protocol supplying the credibility.

## 3. Authorization semantics

This section is the protocol. Everything else is encoding.

VGP separates three statements that are routinely, and dangerously, conflated:

| Statement | Who makes it | What it means | Authorizes? |
|---|---|---|---|
| **benefits** | Anyone | "Proceeds from this go to Organization X." | **No** |
| **confirmed** | A discovery process | "Public evidence consistently identifies this destination and recipient." | **No** |
| **authorized** | The organization | "We declare this an approved giving destination." | **Yes** |

### 3.1 Normative rules

1. **Only the organization authorizes.** Authorization enters a VGP document through exactly one route: a nonprofit administrator affirms, verbatim, *"Our organization authorizes donations through this destination."* That exact string is recorded in `authorization.statement` and validated as a constant.

2. **Discovery MUST NOT promote.** No volume, quality, or agreement of evidence converts `confirmed` into `authorized`. An automated process MAY propose candidates; it MUST NOT publish them. Candidates live in a separate review artifact (`vgp-review.schema.json`), never in `giving.json`.

3. **Absence is not accusation.** See §3.3.

4. **Silence is not denial.** An organization that publishes no VGP document has declared nothing. Consumers MUST NOT treat a missing document as evidence against any destination.

5. **Authorization is revocable and dated.** `authorization.approved_at` records when the affirmation was made. Consumers SHOULD re-fetch rather than cache indefinitely. A destination that was authorized once is not authorized forever.

6. **The unapproved document is inert.** When `verification.organization_approved` is `false`, `giving.authorized_destinations` MUST be empty. This is enforced structurally by the schema rather than by convention: an unapproved document is *incapable* of carrying an authorized destination.

### 3.2 What a consumer may conclude

From a valid, approved VGP document, a consumer may conclude exactly this: *the party controlling this domain has declared these destinations authorized as of this date.*

A consumer MUST NOT extend that into claims about tax-deductibility, charitable status, the competence or solvency of the organization, or the legitimacy of any destination the document does not mention.

### 3.3 Describing a destination that is not listed

When a consumer checks a third-party destination against an organization's VGP document and finds no match, the correct response reports the **absence of a declaration** — not the presence of wrongdoing.

VGP establishes authorization. It does not establish universal truth. A destination may be absent because it is unauthorized, because the organization has not gotten to it yet, because it is new, or because the document is stale. A consumer cannot distinguish these cases and MUST NOT imply that it can.

Consumers MUST NOT describe an unlisted destination as fraudulent, fake, a scam, or illegitimate on the basis of its absence alone.

### 3.4 The reference response

Consumers SHOULD report an unlisted destination in substantially this form, substituting
the organization's `display_name`:

> **&lt;Organization&gt; has not listed this destination in its published giving
> declaration. That is not a finding about this service — it means the organization has
> not declared it. To give through a pathway &lt;Organization&gt; has authorized, use one
> of the options it publishes, or contact the organization directly to confirm.**

Each clause is doing work, and removing any one of them reintroduces a failure mode:

| Clause | Why it is there |
|---|---|
| "has not listed this destination in its published giving declaration" | States only what VGP actually asserts — the scope is this document, not the world. |
| "That is not a finding about this service" | Blocks the inference a donor would otherwise draw. Absence reads as an accusation unless it is explicitly disclaimed. |
| "it means the organization has not declared it" | Names the actual cause, and keeps the burden on the declaration rather than on the third party. |
| "use one of the options it publishes, or contact the organization directly" | Leaves the donor a route. A trust signal that only obstructs giving trains people to ignore it. |

Wording may be adapted to context — length, voice, a spoken interface — provided all four
functions survive. A consumer MUST NOT drop the disclaimer clause or the next step.

## 4. Document structure

```json
{
  "vgp_version": "0.1",
  "canonical_domain": "example.org",
  "organization": {
    "legal_name": "Example Foundation",
    "display_name": "Example",
    "ein": "12-3456789",
    "country": "US"
  },
  "giving": { "authorized_destinations": [], "designations": [] },
  "verification": {
    "organization_approved": false,
    "published_at": null,
    "updated_at": "2026-08-26T00:00:00Z"
  }
}
```

### 4.1 `organization`

All four keys are required. Unresolved values are `null` while `organization_approved` is `false`.

When `organization_approved` is `true`, `legal_name`, `display_name`, and `country` MUST be resolved, and a `US` organization MUST carry a valid `ein` (`NN-NNNNNNN`).

`null` is a first-class answer. An unresolved field MUST be `null` rather than guessed, abbreviated, or filled in from a plausible-looking brand name.

### 4.2 Destination fields

| Field | Notes |
|---|---|
| `id` | Stable, lowercase, hyphenated. Unique within the document. |
| `type` | `credit_card`, `ach`, `check`, `daf`, `stock`, `crypto`, `workplace`, `other`. |
| `provider` | Processor or provider name, or `null`. |
| `url` | Absolute HTTPS URL for online methods; `null` for offline methods such as `check`. |
| `recipient` | The legal or named recipient the approved flow actually shows the donor. |
| `currency` | ISO 4217 code the destination charges in. Required for online methods. |
| `recurring` | Boolean. |
| `designation_support` | Boolean. |
| `restrictions` | Plain-language limitations, or `null`. |
| `authorization` | Human approval metadata. See §3.1. |

`recipient` is deliberately separate from `organization.legal_name`. The two legitimately differ under fiscal sponsorship and similar arrangements — and when they differ for illegitimate reasons, that difference is precisely the signal. Collapsing them into one field would erase it.

### 4.3 Designations

Publish only designations the organization confirms it currently accepts. IDs are stable and separate from labels. Navigation labels scraped from a website are not funds.

`designation_support` describes **donor choice**, not earmarking. It is `true` only where the donor is offered a designation at checkout. A destination whose gifts are all directed to one programme by the organization sets it `false` and states the earmarking in `restrictions`: the donor selects nothing, so a consumer that offered them a choice would be inventing one. The two are easy to conflate and mean different things to an agent — one is a field it may fill, the other is a fact it should repeat.

### 4.4 Prefill

A destination MAY declare how to reach it with fields already filled:

```json
"prefill": {
  "url_template": "https://example.org/donate?amount={amount}&frequency={frequency}",
  "parameters": {
    "amount":    { "kind": "amount" },
    "frequency": { "kind": "enum", "values": ["once", "monthly", "yearly"] }
  },
  "verified_at": "2026-08-31"
}
```

`prefill` is optional and a document without it remains conformant.

**A consumer MUST NOT infer these parameters.** Donation platforms name and spell them differently — Givebutter accepts `frequency=monthly`, and `frequencyOptions`, `recurring` and `interval` are silently ignored — and a platform may change them without notice. An inferred parameter therefore fails in the worst available place: the donor believes they have set up a recurring gift and has not. Only the organization may declare this mapping, for the same reason only the organization may authorize a destination.

Normative rules for a consumer:

1. Fill **only** the keys present in `parameters`. Any other field MUST be left to the human.
2. Where `kind` is `enum`, send only a value listed in `values`. The platform's vocabulary is the platform's; `recurring` is not `monthly`.
3. Remove any placeholder left unfilled, together with the query key carrying it. A literal `{frequency}` MUST NOT be sent to a payment platform.
4. Refuse a `url_template` whose origin differs from the destination's `url`. A declaration that moves the donor to another origin is not describing its own destination.
5. `verified_at` records when the template was last checked against the live platform. A consumer MAY decline to use a stale template.
6. Where a parameter declares `min` or `max`, a consumer MUST omit the parameter entirely rather than send a value outside them. Platforms commonly ignore an out-of-range value in silence, which leaves the donor on a default the agent did not choose and believes it did not accept. Handing over an unprefilled URL is the honest outcome.

An amount is not an amount without a currency. `currency` is required on any destination with an online method, and a consumer MUST NOT infer one from `organization.country`: a US organization may perfectly well collect in CAD.

Prefilling does not make the tool transactional. `giving_prepare` still returns a URL, and the donor still authorizes the payment.

## 5. Consumer conformance

A conforming consumer:

1. Fetches `giving.json` from the same origin as the organization's canonical domain.
2. Rejects the document unless `vgp_version` is `0.1`.
3. Refuses to present any destination as authoritative unless `verification.organization_approved` is `true`.
4. Presents only entries whose `authorization.status` is `authorized` **and** whose `authorization.statement` matches the required constant exactly.
5. Treats every label, `restrictions` string, and `recipient` as untrusted display text. These are attacker-influencable in the general case, and MUST NOT be executed, interpreted as instructions, or rendered as markup.
6. Follows §3.3 when reporting an unlisted destination.

The reference consumer is [`../webmcp/giving-tools.js`](../webmcp/giving-tools.js).

## 6. Security considerations

- **The document is only as trustworthy as the domain.** VGP inherits the security of HTTPS and DNS and adds nothing to it. A compromised domain publishes compromised authorizations. VGP 0.1 has no cryptographic signing; that is an explicit non-goal.
- **Prompt injection.** VGP documents are consumed by AI agents. Free-text fields are an injection surface. See §5.5.
- **Stale authorization.** There is no revocation channel in 0.1 beyond republishing the document. Consumers SHOULD re-fetch.
- **No signing, no registry, no blockchain.** Deliberate. Each would require governance that a version 0.1 has not earned.

## 7. Versioning

`0.1` is intentionally small. Additive experiments SHOULD use extension keys, and only after the core schema and the authorization invariant have held in practice.

The meaning of `authorized` MUST NOT change silently. Any change to §3 requires a version bump.
