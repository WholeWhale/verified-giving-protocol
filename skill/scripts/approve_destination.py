#!/usr/bin/env python3
"""Promote one reviewed destination after explicit nonprofit authorization."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


REQUIRED_STATEMENT = "Our organization authorizes donations through this destination."
ALLOWED_STATUSES = {"confirmed", "needs_review", "conflicting", "not_verified"}


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", required=True, type=Path)
    parser.add_argument("--vgp", required=True, type=Path)
    parser.add_argument("--candidate-id", required=True)
    parser.add_argument("--approver-role", required=True)
    parser.add_argument("--statement", required=True)
    args = parser.parse_args()

    if args.statement != REQUIRED_STATEMENT:
        parser.error(f"--statement must exactly equal: {REQUIRED_STATEMENT}")
    if len(args.approver_role.strip()) < 2:
        parser.error("--approver-role must identify the nonprofit approver's role")

    review = load_json(args.review)
    vgp = load_json(args.vgp)
    matches = [item for item in review.get("candidates", []) if item.get("id") == args.candidate_id]
    if len(matches) != 1:
        parser.error("--candidate-id must match exactly one reviewed candidate")

    candidate = matches[0]
    if candidate.get("status") not in ALLOWED_STATUSES:
        parser.error("candidate has an invalid discovery status")
    if not candidate.get("recipient"):
        parser.error("candidate recipient is unresolved; do not authorize it yet")
    if candidate.get("type") not in {"check"} and not candidate.get("url"):
        parser.error("online candidate URL is unresolved; do not authorize it yet")

    organization = vgp.get("organization", {})
    if not str(organization.get("legal_name") or "").strip():
        parser.error("organization legal_name is unresolved; do not approve the VGP yet")
    if not str(organization.get("display_name") or "").strip():
        parser.error("organization display_name is unresolved; do not approve the VGP yet")
    country = organization.get("country")
    if not isinstance(country, str) or len(country) != 2 or not country.isupper():
        parser.error("organization country is unresolved; do not approve the VGP yet")
    if organization.get("country") == "US" and not organization.get("ein"):
        parser.error("US organization EIN is unresolved; do not approve the VGP yet")

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    destination = {
        key: candidate.get(key)
        for key in (
            "id",
            "type",
            "provider",
            "url",
            "recipient",
            "recurring",
            "designation_support",
            "restrictions",
        )
    }
    destination["authorization"] = {
        "status": "authorized",
        "approved_by_role": args.approver_role.strip(),
        "approved_at": now,
        "statement": REQUIRED_STATEMENT,
    }

    giving = vgp.setdefault("giving", {})
    destinations = giving.setdefault("authorized_destinations", [])
    if any(item.get("id") == args.candidate_id for item in destinations):
        parser.error("destination is already authorized")
    destinations.append(destination)

    verification = vgp.setdefault("verification", {})
    verification["organization_approved"] = True
    verification["updated_at"] = now
    if verification.get("published_at") is None:
        verification["published_at"] = now

    args.vgp.write_text(json.dumps(vgp, indent=2) + "\n", encoding="utf-8")
    print(f"Authorized {args.candidate_id} in {args.vgp}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
