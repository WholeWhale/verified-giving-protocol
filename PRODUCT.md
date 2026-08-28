# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro, deployed to Vercel. The site lives in its own repository,
`WholeWhale/verifiedgiving-site`, so this repository holds the standard and nothing else.

Publish-parity survives the split without a sync job. The site pins this repository as a
submodule and generates its published artifacts from it at build time: the rendered
specification comes from `vgp/specification.md`, and the JSON Schema served at
`verifiedgiving.ai/schema/` is copied from `skill/assets/vgp-0.1.schema.json` before every
build. There is therefore no second copy to drift — which is a stronger guarantee than the
byte-check it replaced, since the check could only ever report drift after it happened.

Chosen by the user for these reasons: content-first with zero JS shipped by default, spec
pages authored as Markdown/MDX so the real specification renders rather than being
retyped, and a single interactive island for the generator.

## Users

**Primary: the nonprofit's developer or web agency.** The person actually implementing
VGP on a nonprofit's site. They arrive knowing roughly what a `.well-known` file is, want
the specification, the schema, copy-paste snippets, and a way to check their work, and
they leave when `giving.json` is live and validating. Success is measured in about twenty
minutes from landing to shipped file.

Secondary audiences exist but do not drive design decisions: nonprofit staff who send the
link to their developer, and AI platform engineers evaluating whether to consume VGP.

## Product Purpose

verifiedgiving.ai is the home of the Verified Giving Protocol — the canonical place to
read the specification, fetch the schema, generate a valid declaration, and validate one.

VGP itself lets a nonprofit publish, from the one domain it controls, a machine-readable
declaration of the giving destinations it authorizes. Its purpose is to give the nonprofit
a voice in a routing decision it is currently absent from: when an AI agent is asked to
donate, it routes to whatever it can parse, and today that is structurally never the
nonprofit.

The site succeeds when a developer who has never heard of VGP ships a valid, serving
`giving.json` without contacting anyone.

## Positioning

VGP separates three statements that are routinely conflated: **benefits** (anyone may
claim it), **confirmed** (evidence supports it), and **authorized** (the organization
declares it). Only the third authorizes, and only a human at the nonprofit can create it.

The mechanism a neighboring product could not truthfully copy: the publishing domain is
the authority. VGP moves no money, holds no registry, runs no processor, and asserts
nothing about organizations that have not published. An aggregator cannot issue this
declaration on a nonprofit's behalf, because the whole claim is that the nonprofit
published it itself.

## Operating Context

A developer arrives from a search, a colleague, or the GitHub repository. They are working
inside a nonprofit's existing CMS — most often WordPress, sometimes Drupal, occasionally a
static or Next.js build — and they do not control that site's roadmap.

Constraints they bring with them:

- `/donate` on nonprofit sites is very frequently already a 302 to a third-party processor
  (Classy, Givebutter, Bloomerang, Funraise), which is why the canonical location is
  `/.well-known/giving.json`.
- Some servers deny dotted directories outside ACME challenges and must be reconfigured.
- The declaration must be served as JSON over HTTPS with `canonical_domain` matching the
  serving host.
- They frequently cannot answer the organization's own legal-entity or EIN questions and
  must go ask someone.

## Capabilities and Constraints

The site must provide, by 2026-09-03:

| Route | Function |
|---|---|
| `/` | What VGP is, the file itself, how to adopt it |
| `/spec/0.1` | The rendered specification |
| `/schema/vgp-0.1.schema.json` | The schema, served as real JSON |
| `/generate` | Deterministic form-driven `giving.json` builder |
| `/validate` | Conformance checker for a pasted document or URL |

Deferred: a registry of publishing organizations. It needs governance that VGP 0.1 has not
earned, and it is explicitly out of scope.

Hard constraints:

- The schema must be served with `Content-Type: application/schema+json` (or at minimum
  `application/json`), never `text/html`. The previously-considered `verifiedgiving.org`
  returned HTTP 200 with HTML on every path, which is the exact failure this must avoid.
- The published schema must remain byte-identical to `skill/assets/vgp-0.1.schema.json`.
- The generator on the site is **deterministic and form-driven**. It does not crawl and
  does not call a model. Evidence-led discovery stays in the installable VGPify skill,
  which needs a crawl budget and abuse protection a public endpoint should not carry.
- The generator must never mark a destination `authorized`. Authorization requires a
  human at the nonprofit affirming a fixed statement, verbatim.
- `verifiedgiving.ai` is currently parked (Sedo, `91.195.240.94`, name.com nameservers) and
  its TLS handshake fails. DNS and certificate issuance are lead-time items.

Terminology that must stay precise: *benefits*, *confirmed*, *authorized*, *destination*,
*designation*, *declaration*, *recipient*. `recipient` is deliberately distinct from
`organization.legal_name`.

## Brand Commitments

The user set one binding constraint: the site must read as **functional, open-source
infrastructure that can be trusted** — explicitly not as AI-generated marketing design.

Named as the reference family: securitytxt.org (the closest analog, being a `.well-known`
standard with a hosted form generator), jsonschema.org, letsencrypt.org, sqlite.org,
curl.se, and the IETF datatracker.

Named as prohibited: gradient meshes, glassmorphism, floating rounded cards over heroes,
icon-circle feature grids, emoji section headers, centered value-proposition heroes, and
Get Started / Learn More button pairs.

Voice: no marketing verbs. VGP's own §3.3 forbids consumers from describing an unlisted
destination as fraudulent, and the site's copy is held to the same discipline — it
describes what the protocol asserts and does not accuse or overclaim.

Recorded but not expanded here: whether the file itself should be the hero above the fold
is a surface decision, not product truth.

## Evidence on Hand

Real, in `C:\Users\gewei\github\verified-giving-protocol`:

- `vgp/specification.md` — VGP 0.1, including the authorization semantics (§3) and the
  normative not-listed response (§3.4)
- `vgp/schema.json` and `skill/assets/vgp-0.1.schema.json` — the schema, byte-identical
- `vgp/examples/` — a valid approved declaration and a valid unapproved draft
- `skill/` — the installable VGPify skill, 14 files
- `webmcp/giving-tools.js` — four working WebMCP tools
- `powerpoetry/giving.json` — reference implementation #1, an honest unapproved draft
- `demo/third-party-example/` — the not-listed trust fixture
- `tests/run_tests.py` — 48 passing checks, green on CI

Absences that must not be fabricated:

- **No nonprofit has published a VGP declaration yet.** There are zero adopters. No
  adoption counts, logos, testimonials, or "trusted by" claims exist or may be implied.
- Power Poetry's legal entity, EIN, and its relationship to To Be Heard Foundation are
  unresolved. The reference implementation is deliberately unapproved.
- VGP has no standards-body status, no IANA well-known URI registration, and no working
  group. It is a 0.1 draft published by one agency.

## Product Principles

1. **The domain is the authority.** Every design and product decision defers to the idea
   that the nonprofit's own domain is what makes a declaration true. Nothing on this site
   may position itself as the arbiter.
2. **Discovery proposes; humans authorize.** No surface, tool, or generator may produce an
   authorized destination. The gate is a person at the nonprofit, and it is not automatable.
3. **Absence is not accusation.** The protocol forbids calling an unlisted destination
   fraudulent. The product holds itself to the same standard about aggregators: the
   critique is defaults, delay, and severed donor relationships — never legitimacy.
4. **Ship the file, not the pitch.** The measure of the site is whether a developer leaves
   with a valid, serving declaration. Persuasion that does not end in a shipped file failed.
5. **Claim only what is built.** With zero adopters, credibility comes from the artifact's
   rigor — the spec, the schema, the tests — not from implied traction.

## Accessibility & Inclusion

No user-specific requirement has been established beyond standard practice. The primary
audience is developers who may be reading long specification text for extended periods, so
reading comfort at length is a functional requirement, not a stylistic one.
