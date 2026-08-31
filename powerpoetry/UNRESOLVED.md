# Power Poetry — unresolved before publication

`giving.json` in this directory is a **draft**. `verification.organization_approved` is
`false`, `giving.authorized_destinations` is empty, and every organization field that has
not been established from first-party evidence is `null`.

This is deliberate. VGP's entire purpose is to distinguish what an organization has
actually declared from what can be inferred about it. A reference implementation that
guessed its own EIN would refute the standard it ships with.

## Resolved 2026-08-27

Power Poetry is a **program of To Be Heard Foundation**. Donations are earmarked for the
program and routed through the main 501(c)(3), which is the party that actually receives
the gift.

That is a fiscal structure, not a conflict. Discovery tooling flags the two names as
`conflicting` because a scraper sees one name on the site and another on the donation
page, and VGP forbids inferring that a brand and a legal entity are the same party. The
organisation stating the relationship is exactly the gap the protocol closes:

| Field | Value | Why |
|---|---|---|
| `organization.legal_name` | To Be Heard Foundation | The 501(c)(3) that receives the gift. |
| `organization.display_name` | Power Poetry | The public name on this domain. |
| `destination.recipient` | To Be Heard Foundation | What the approved flow actually shows the donor. |
| `designations[].id` | `power-poetry` | The earmarked program. |

## What is still unresolved

| Field | Status | Why it is blocked |
|---|---|---|
| `organization.ein` | **unresolved** | To Be Heard Foundation's EIN has not been recorded from a first-party source. The validator requires one before an approved US document is valid, and `approve_destination.py` refuses to promote any destination without it. This is now the only field blocking publication. |
| `giving.authorized_destinations` | empty | No administrator has affirmed any destination. Discovery cannot populate this array; only approval can. |
| Current donation URL and processor | unresolved | The live giving flow and its recipient display have not been confirmed. |

## How this file becomes publishable

1. Run VGPify against `https://powerpoetry.org` to produce `vgp-review.json` with an
   evidence ledger and candidate statuses.
2. Resolve the entity question with the organization directly. Do not resolve it from
   the website.
3. For each candidate, a nonprofit administrator affirms, verbatim:
   *"Our organization authorizes donations through this destination."*
4. Promote approved candidates with `skill/scripts/approve_destination.py`.
5. Validate, then serve at `https://powerpoetry.org/giving.json`.

Steps 2 and 3 are human decisions. There is no automated path around them.
