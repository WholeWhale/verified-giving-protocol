# Power Poetry — unresolved before publication

`giving.json` in this directory is a **draft**. `verification.organization_approved` is
`false`, `giving.authorized_destinations` is empty, and every organization field that has
not been established from first-party evidence is `null`.

This is deliberate. VGP's entire purpose is to distinguish what an organization has
actually declared from what can be inferred about it. A reference implementation that
guessed its own EIN would refute the standard it ships with.

## What must be established

| Field | Status | Why it is blocked |
|---|---|---|
| `organization.legal_name` | unresolved | The relationship between **Power Poetry** and **To Be Heard Foundation** is not established. One is the public brand; the other appears as a donation recipient. VGP forbids inferring that a brand and a legal entity are the same party, and forbids inferring fiscal sponsorship or DBA status. |
| `organization.ein` | unresolved | Follows from `legal_name`. The EIN belongs to whichever entity actually receives the gift. |
| `organization.country` | unresolved | Left `null` rather than assumed. `US` is likely but has not been recorded from first-party evidence, and an approved US document is required by the validator to carry a valid EIN. |
| `giving.authorized_destinations` | empty | No administrator has affirmed any destination. Discovery cannot populate this array — only approval can. |
| `giving.designations` | empty | Navigation labels are not funds. Designations require confirmation that each is currently accepted. |

## How this file becomes publishable

1. Run VGPify against `https://powerpoetry.org` to produce `vgp-review.json` with an
   evidence ledger and candidate statuses.
2. Resolve the entity question with the organization directly. Do not resolve it from
   the website.
3. For each candidate, a nonprofit administrator affirms, verbatim:
   *"Our organization authorizes donations through this destination."*
4. Promote approved candidates with `skill/scripts/approve_destination.py`.
5. Validate, then serve at `https://powerpoetry.org/.well-known/giving.json`.

Steps 2 and 3 are human decisions. There is no automated path around them.
