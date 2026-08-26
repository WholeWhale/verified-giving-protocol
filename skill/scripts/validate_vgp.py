#!/usr/bin/env python3
"""Validate the VGP 0.1 trust invariants with no third-party dependencies."""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


STATEMENT = "Our organization authorizes donations through this destination."
METHODS = {"credit_card", "ach", "check", "daf", "stock", "crypto", "workplace", "other"}
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DOMAIN_RE = re.compile(r"^(?=.{1,253}$)(?!-)[A-Za-z0-9.-]+(?<!-)$")
EIN_RE = re.compile(r"^[0-9]{2}-[0-9]{7}$")


def is_datetime(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def check_url(url: str) -> str | None:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "VGPify/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status >= 400:
                return f"returned HTTP {response.status}"
    except urllib.error.HTTPError as exc:
        if exc.code in {405, 501}:
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "VGPify/0.1"})
                with urllib.request.urlopen(request, timeout=10) as response:
                    if response.status < 400:
                        return None
            except Exception as retry_exc:  # diagnostic only
                return str(retry_exc)
        return f"returned HTTP {exc.code}"
    except Exception as exc:  # diagnostic only
        return str(exc)
    return None


def validate(data: object, check_urls: bool) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(data, dict):
        return ["document must be a JSON object"], warnings

    required = {"vgp_version", "canonical_domain", "organization", "giving", "verification"}
    missing = required - data.keys()
    if missing:
        errors.append(f"missing top-level fields: {', '.join(sorted(missing))}")
        return errors, warnings
    if data.get("vgp_version") != "0.1":
        errors.append("vgp_version must equal 0.1")

    domain = data.get("canonical_domain")
    if not isinstance(domain, str) or not DOMAIN_RE.fullmatch(domain) or "://" in domain:
        errors.append("canonical_domain must be a hostname without scheme or path")

    organization = data.get("organization")
    if not isinstance(organization, dict):
        errors.append("organization must be an object")
    else:
        for key in ("legal_name", "display_name", "ein", "country"):
            if key not in organization:
                errors.append(f"organization.{key} is required")
        ein = organization.get("ein")
        if ein is not None and (not isinstance(ein, str) or not EIN_RE.fullmatch(ein)):
            errors.append("organization.ein must be null or NN-NNNNNNN")
        country = organization.get("country")
        if country is not None and (not isinstance(country, str) or not re.fullmatch(r"[A-Z]{2}", country)):
            errors.append("organization.country must be null or a two-letter uppercase code")

    giving = data.get("giving")
    if not isinstance(giving, dict):
        errors.append("giving must be an object")
        return errors, warnings
    destinations = giving.get("authorized_destinations")
    designations = giving.get("designations")
    if not isinstance(destinations, list):
        errors.append("giving.authorized_destinations must be an array")
        destinations = []
    if not isinstance(designations, list):
        errors.append("giving.designations must be an array")
        designations = []

    verification = data.get("verification")
    if not isinstance(verification, dict):
        errors.append("verification must be an object")
        return errors, warnings
    approved = verification.get("organization_approved")
    if not isinstance(approved, bool):
        errors.append("verification.organization_approved must be boolean")
    if approved is False and destinations:
        errors.append("unapproved VGP document must have zero authorized destinations")
    if approved is True and not destinations:
        errors.append("approved VGP document must contain at least one authorized destination")
    if approved is True and isinstance(organization, dict):
        if not str(organization.get("legal_name") or "").strip():
            errors.append("approved VGP document requires organization.legal_name")
        if not str(organization.get("display_name") or "").strip():
            errors.append("approved VGP document requires organization.display_name")
        if not isinstance(organization.get("country"), str) or not re.fullmatch(r"[A-Z]{2}", organization.get("country", "")):
            errors.append("approved VGP document requires organization.country")
        if organization.get("country") == "US" and not organization.get("ein"):
            errors.append("approved US VGP document requires organization.ein")
    if verification.get("published_at") is not None and not is_datetime(verification.get("published_at")):
        errors.append("verification.published_at must be null or ISO 8601 date-time")
    if not is_datetime(verification.get("updated_at")):
        errors.append("verification.updated_at must be ISO 8601 date-time")

    ids: set[str] = set()
    for index, item in enumerate(destinations):
        prefix = f"authorized_destinations[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue
        destination_id = item.get("id")
        if not isinstance(destination_id, str) or not ID_RE.fullmatch(destination_id):
            errors.append(f"{prefix}.id must be a stable lowercase hyphenated ID")
        elif destination_id in ids:
            errors.append(f"{prefix}.id is duplicated")
        else:
            ids.add(destination_id)
        if item.get("type") not in METHODS:
            errors.append(f"{prefix}.type is unsupported")
        if not isinstance(item.get("recipient"), str) or not item.get("recipient", "").strip():
            errors.append(f"{prefix}.recipient is required")
        url = item.get("url")
        if item.get("type") != "check" and not isinstance(url, str):
            errors.append(f"{prefix}.url is required for online methods")
        if isinstance(url, str):
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.netloc:
                errors.append(f"{prefix}.url must be an absolute HTTPS URL")
            elif check_urls:
                problem = check_url(url)
                if problem:
                    warnings.append(f"{prefix}.url {problem}")
        for field in ("recurring", "designation_support"):
            if not isinstance(item.get(field), bool):
                errors.append(f"{prefix}.{field} must be boolean")
        auth = item.get("authorization")
        if not isinstance(auth, dict):
            errors.append(f"{prefix}.authorization is required")
        else:
            if auth.get("status") != "authorized":
                errors.append(f"{prefix}.authorization.status must equal authorized")
            if auth.get("statement") != STATEMENT:
                errors.append(f"{prefix}.authorization.statement is invalid")
            if not isinstance(auth.get("approved_by_role"), str) or len(auth.get("approved_by_role", "").strip()) < 2:
                errors.append(f"{prefix}.authorization.approved_by_role is required")
            if not is_datetime(auth.get("approved_at")):
                errors.append(f"{prefix}.authorization.approved_at must be ISO 8601")

    designation_ids: set[str] = set()
    for index, item in enumerate(designations):
        prefix = f"designations[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue
        identifier = item.get("id")
        if not isinstance(identifier, str) or not ID_RE.fullmatch(identifier):
            errors.append(f"{prefix}.id must be lowercase and hyphenated")
        elif identifier in designation_ids:
            errors.append(f"{prefix}.id is duplicated")
        else:
            designation_ids.add(identifier)
        if not isinstance(item.get("label"), str) or not item.get("label", "").strip():
            errors.append(f"{prefix}.label is required")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--check-urls", action="store_true")
    args = parser.parse_args()
    try:
        data = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"INVALID: {exc}", file=sys.stderr)
        return 1

    errors, warnings = validate(data, args.check_urls)
    for warning in warnings:
        print(f"WARNING: {warning}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"VALID: {args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
