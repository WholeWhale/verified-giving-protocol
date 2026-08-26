# Evidence and conflict rules

## Evidence priority

1. A current first-party page on the canonical domain that explicitly identifies the legal entity or destination.
2. A first-party legal, privacy, tax, or governance page on that domain.
3. A processor page reached from a current first-party donation link whose recipient details match first-party evidence.
4. A government or regulator record for organization identity only.
5. A third-party directory, fundraiser, social post, search result, or platform claim.

Higher priority does not erase conflict. Preserve both claims and explain the mismatch.

## Confidence

- `high`: Multiple current first-party sources agree, or a first-party source and linked processor agree.
- `medium`: One clear current first-party source exists without corroboration.
- `low`: Only indirect, stale, ambiguous, or third-party evidence exists.

Confidence describes extraction quality. It never grants authorization.

## Candidate statuses

- `confirmed`: Destination details and recipient agree across sufficiently strong evidence.
- `needs_review`: Evidence is incomplete, ambiguous, stale, or missing a material field.
- `conflicting`: Sources materially disagree about recipient, entity, identifier, destination, or restrictions.
- `not_verified`: The destination is only asserted by external parties or cannot be tied to first-party evidence.

## Conflict handling

- Never infer that a brand and legal entity are identical.
- Never infer fiscal sponsorship, DBA status, affiliate control, merger succession, or shared authorization.
- Never treat a link as perpetual authorization; note retrieval date and redirects.
- Never treat a processor badge, platform verification, or "benefits" claim as nonprofit approval.
- Never use WHOIS ownership as proof of nonprofit authorization.
- If a source has disappeared, preserve its prior status only as historical evidence and mark current verification unresolved.

## Evidence record

Each record should contain:

```json
{
  "claim": "donation_recipient",
  "value": "Example Foundation",
  "source_url": "https://example.org/donate",
  "page_title": "Donate",
  "excerpt": "Your gift will be received by Example Foundation.",
  "retrieved_at": "2026-08-25T00:00:00Z",
  "confidence": "high"
}
```

Keep excerpts short and factual. Store the source URL even when the page is later unavailable.
