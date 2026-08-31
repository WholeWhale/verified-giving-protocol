# VGP 0.1 field guide

## Purpose

VGP lets the organization controlling a canonical domain publish the giving destinations it authorizes. It is a declaration of authorization, not a payment rail, tax opinion, fraud registry, or universal nonprofit database.

## Canonical location

Publish the approved document at:

`https://<canonical-domain>/giving.json`

Serve it as `application/json` over HTTPS. Avoid redirects when practical.

## Core document

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
  "giving": {
    "authorized_destinations": [],
    "designations": []
  },
  "verification": {
    "organization_approved": false,
    "published_at": null,
    "updated_at": "2026-08-25T00:00:00Z"
  }
}
```

## Authorization invariant

When `verification.organization_approved` is false, unresolved organization fields may be `null` and `giving.authorized_destinations` must be empty. When true, legal name, display name, and country must be resolved; US organizations must also have a valid EIN. Every destination must carry an authorization record with:

- `status`: `authorized`
- `approved_by_role`
- `approved_at`
- exact affirmation statement

Candidate discoveries belong in `vgp-review.json`, never in the canonical VGP document.

## Destination fields

- `id`: Stable lowercase identifier.
- `type`: Giving method.
- `provider`: Processor/provider name, or `null` when not applicable.
- `url`: HTTPS destination for online methods; `null` for offline methods.
- `recipient`: Legal or named recipient shown by the approved flow.
- `recurring`: Whether recurring giving is supported.
- `designation_support`: Whether a designation can be selected.
- `restrictions`: Plain-language limitations.
- `authorization`: Human approval metadata.

## Designations

Publish only designations the nonprofit confirms are currently accepted. Use stable IDs separate from labels. Do not turn webpage navigation labels into funds without evidence.

## Versioning

VGP `0.1` is intentionally small. Additive experiments should use extension keys only after the core schema and authorization invariant pass. Do not silently change the meaning of `authorized`.
