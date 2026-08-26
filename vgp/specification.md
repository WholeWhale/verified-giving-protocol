# Verified Giving Protocol 0.1

**Status:** Draft. **Canonical schema:** [`schema.json`](schema.json). **License:** MIT.

## 1. Purpose

VGP lets the organization that controls a canonical domain publish, in machine-readable form, the giving destinations it **authorizes**.

It is not a payment rail, a tax-deductibility opinion, a fraud registry, a nonprofit directory, or an identity system. It moves no money, and it makes no claim about any party that has not published a VGP document.

## 2. Canonical location

Publish the approved document at:

```
https://<canonical-domain>/.well-known/giving.json
```

Serve it as `application/json` over HTTPS. Avoid redirects where practical.

The publishing domain **is** the authority. VGP asserts nothing about a document served from anywhere else, and a document's `canonical_domain` MUST match the host that served it.

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

<!--
TODO(george): the canonical sentence a consumer shows a donor when a destination is not
listed. This is the line a Challenge judge reads on screen during the trust demo, and the
line a wrongly-flagged third party could object to. That makes it a comms and legal call,
not an engineering one.

Constraints the wording has to satisfy:
  - states only what VGP actually asserts (this domain has not declared this destination)
  - makes no claim about the third party's conduct or intent
  - does not imply the absence was investigated or is conclusive
  - leaves the donor a next step rather than a dead end

Draft to approve, edit, or replace:

  "Power Poetry has not listed this destination in its published giving declaration.
   That is not a finding about this service — it means the organization has not
   declared it. To give through a pathway Power Poetry has authorized, use one of the
   options it publishes, or contact the organization directly to confirm."

Once settled, this string is the normative example for consumers, and is what
demo/third-party-example/ should display.
-->

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
| `recurring` | Boolean. |
| `designation_support` | Boolean. |
| `restrictions` | Plain-language limitations, or `null`. |
| `authorization` | Human approval metadata. See §3.1. |

`recipient` is deliberately separate from `organization.legal_name`. The two legitimately differ under fiscal sponsorship and similar arrangements — and when they differ for illegitimate reasons, that difference is precisely the signal. Collapsing them into one field would erase it.

### 4.3 Designations

Publish only designations the organization confirms it currently accepts. IDs are stable and separate from labels. Navigation labels scraped from a website are not funds.

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
