# Verified Giving Protocol (VGP)

**Nonprofits get a machine-readable way to declare where they authorize donations to go. WebMCP lets AI agents discover and use those declarations.**

The web has standards for discovering pages and for buying products. Agentic giving needs a standard for discovering *who is actually authorized to receive a nonprofit's money.*

[![CI](https://github.com/WholeWhale/verified-giving-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/WholeWhale/verified-giving-protocol/actions/workflows/ci.yml)
&nbsp;License: MIT

---

## The problem

AI agents can already find nonprofits, recommend where to give, and navigate donation flows. What they cannot do is answer the one question that matters before money moves:

> **Does this nonprofit actually authorize this donation pathway?**

Today an agent infers legitimacy from web pages, search results, and intermediary claims. Any third party can assert that a donation "benefits" a nonprofit without that nonprofit controlling, endorsing, or even knowing about the pathway. Inference is not infrastructure.

## The distinction the whole project rests on

| | Statement | Who makes it | Authorizes? |
|---|---|---|---|
| **benefits** | "Proceeds from this go to Organization X." | Anyone | **No** |
| **confirmed** | "Public evidence consistently identifies this destination." | A discovery process | **No** |
| **authorized** | "We declare this an approved giving destination." | The organization | **Yes** |

These are not equivalent, and nothing in this repository is permitted to collapse them. An automated process may *propose*; only a nonprofit administrator may *authorize*.

## How it fits together

```
Nonprofit domain          VGP is the trust layer
       |                  /giving.json
       v                  identity, EIN, authorized destinations, designations
     VGP
       |                  WebMCP is the agent interaction layer
       v                  giving_verify / giving_options
    WebMCP                giving_designations / giving_prepare
       |
       v                  Existing processors are the transaction layer
 Payment provider         Stripe, PayPal, DAF, ACH, check
       |
       v
 Human authorization      VGP never moves money
```

VGP is payment-rail neutral, AI-platform neutral, and has no blockchain dependency. It remains useful without WebMCP — the JSON document stands on its own.

## What is in here

| Path | What it is |
|---|---|
| [`vgp/specification.md`](vgp/specification.md) | VGP 0.1. **§3 is the protocol**; everything else is encoding. |
| [`vgp/schema.json`](vgp/schema.json) | JSON Schema for `giving.json`. |
| [`vgp/examples/`](vgp/examples) | A valid approved document and a valid unapproved draft. |
| [`skill/`](skill) | **VGPify** — an installable agent skill that turns a nonprofit website into a reviewable draft. |
| [`webmcp/giving-tools.js`](webmcp/giving-tools.js) | The four WebMCP tools. Generated from the skill template. |
| [`powerpoetry/`](powerpoetry) | Reference implementation #1. Currently an honest, unapproved draft — see [`UNRESOLVED.md`](powerpoetry/UNRESOLVED.md). |
| [`demo/third-party-example/`](demo/third-party-example) | A labeled fixture for the trust scenario. Fictional service, no payment fields. |
| [`tests/run_tests.py`](tests/run_tests.py) | 33 checks. The negatives are the interesting ones. |

## Setup

No dependencies. Python 3.9+ for the tooling; Node only for a syntax check.

```bash
git clone https://github.com/WholeWhale/verified-giving-protocol
cd verified-giving-protocol
python tests/run_tests.py
```

Expected: `33 passed, 0 failed`.

### Validate a declaration

```bash
python skill/scripts/validate_vgp.py vgp/examples/approved.giving.json
python skill/scripts/validate_vgp.py vgp/examples/approved.giving.json --check-urls
```

### Install the VGPify skill

Copy or symlink `skill/` into your agent's skills directory, then ask an agent to *"vgpify https://some-nonprofit.org"*. It crawls, extracts identity and giving pathways, records an evidence ledger, flags conflicts, and emits a **draft** — never an authorization.

### Authorize a destination

Discovery cannot do this. A human does:

```bash
python skill/scripts/approve_destination.py \
  --review   vgp-review.json \
  --vgp      giving.json \
  --candidate-id direct-card \
  --approver-role "Executive Director" \
  --statement "Our organization authorizes donations through this destination."
```

`--statement` is compared as a constant. A paraphrase is refused, and unresolved organization identity blocks approval outright. Both behaviors are tested.

### Serve it

See [`powerpoetry/integration/README.md`](powerpoetry/integration/README.md).

---

## Why WebMCP makes this meaningfully better

VGP alone gives an agent a file it must know to look for, fetch cross-origin, parse, and interpret correctly — including all six conformance rules in §5, which most agents will get subtly wrong.

WebMCP moves that burden to the party that should carry it: **the nonprofit's own site.** The site fetches its own declaration same-origin, checks its own approval flag, filters to genuinely authorized destinations, and exposes the result as named, described, schema-typed tools the agent discovers automatically.

Concretely, that changes three things:

1. **Discovery instead of scraping.** The agent finds `giving_options` rather than guessing which button on the page is the real donate button.
2. **The failure mode inverts.** The tools **fail closed**. A site with an unapproved declaration registers *no* giving tools at all, so an agent sees "this site exposes no authorized giving pathways" rather than a plausible-looking form it might use anyway. Absence of a tool is a much safer default than presence of an ambiguous UI.
3. **The safety rule is enforced in code, not in a prompt.** `giving_options` cannot return an unauthorized destination — it filters on `authorization.status` *and* the exact affirmation constant before the agent ever sees the list. Third-party claims cannot become nonprofit authorization, because the code path that would do it does not exist.

## The WebMCP implementation

[`webmcp/giving-tools.js`](webmcp/giving-tools.js) registers four tools via `document.modelContext.registerTool()`.

| Tool | Returns | Mode |
|---|---|---|
| `giving_verify` | Legal name, display name, EIN, canonical domain, VGP version, approval status, last updated | read-only |
| `giving_options` | Only destinations the organization authorized: method, provider, authorized URL, recipient, restrictions, designation support | read-only |
| `giving_designations` | Funds or programs a gift may be designated to | read-only |
| `giving_prepare` | A prepared, authorized donation URL for a validated amount and designation | **non-transactional** |

`giving_prepare` deliberately does not charge anything. It returns `payment_completed: false` and `requires_human_payment_authorization: true`, validates the amount range, and refuses any designation not present in the approved declaration. The donor authorizes the payment. Always.

Registration is refused entirely if the document is missing, is the wrong version, is not organization-approved, or contains no properly-affirmed destination.

## Human–agent collaboration

The machine handles bureaucracy. Humans keep the two decisions that carry consequences.

| Actor | Owns |
|---|---|
| **AI** | Discovery, extraction, structuring, conflict detection, tool execution, preparation |
| **Nonprofit administrator** | **Where may money legitimately go?** — authorization, and nothing else |
| **Donor** | **Do I actually want to send it?** — intent, selection, payment approval |

This split is enforced mechanically rather than asked for politely. `approve_destination.py` compares the affirmation as a constant and refuses to proceed on unresolved identity. The schema makes an unapproved document structurally incapable of carrying an authorized destination. The WebMCP tools filter on the affirmation before returning anything.

The most useful demonstration of that is our own reference implementation: **`powerpoetry/giving.json` ships unapproved, with `legal_name` and `ein` as `null`.** The relationship between Power Poetry and To Be Heard Foundation is unresolved, so we did not resolve it. A project that guessed its own EIN would refute the standard it ships with.

## Testing

```bash
python tests/run_tests.py
```

The suite asserts that each of the following is **rejected**:

- an unapproved document carrying a destination (discovery cannot smuggle)
- a paraphrased authorization statement
- `authorization.status` of `confirmed` rather than `authorized`
- an approved US document with no EIN
- an approved document with zero destinations
- a plain-HTTP destination URL
- `canonical_domain` given as a URL rather than a host
- duplicate destination IDs
- an approval attempt on a document with unresolved identity (the live Power Poetry case)
- re-approving an already-authorized destination

It also asserts no drift between artifacts that exist at two paths: `vgp/schema.json` must be byte-identical to the skill's copy, and `webmcp/giving-tools.js` must match a fresh generation. A standard whose own repository contradicts itself is worse than no standard.

## Scenarios

**Authorized giving.** *"I want to donate $100 to Power Poetry. What are my options?"* The agent calls `giving_verify`, `giving_options`, `giving_designations`, presents what the nonprofit actually authorized, and calls `giving_prepare` on the donor's choice. The donor authorizes payment.

**Not listed.** Viewing [`demo/third-party-example/`](demo/third-party-example), a donor asks *"Can I donate to Power Poetry through this?"* The agent checks the declaration, finds no match, and answers:

> Power Poetry has not listed this destination in its published giving declaration. That is not a finding about this service — it means the organization has not declared it. To give through a pathway Power Poetry has authorized, use one of the options it publishes, or contact the organization directly to confirm.

Not *"this is fraudulent."* VGP establishes authorization, not universal truth — a destination can be absent because it is unauthorized, because it is new, or because the document is stale, and an agent cannot tell those apart. The wording is normative and each of its four clauses is load-bearing; see [§3.3 and §3.4](vgp/specification.md). Tests assert the clauses stay present in both the specification and the demo.

## Status and non-goals

VGP 0.1 is a draft, deliberately small.

Explicitly **not** built here: a payment processor, a cryptocurrency protocol, a blockchain registry, a universal nonprofit database, a tax-deductibility engine, a DAF transaction system, donor accounts, identity/KYC infrastructure, autonomous money movement, or production-grade cryptographic signing.

VGP 0.1 has no signing. It inherits the security of HTTPS and DNS and adds nothing to it. A compromised domain publishes compromised authorizations. See [§6](vgp/specification.md).

## License

MIT. See [LICENSE](LICENSE).
