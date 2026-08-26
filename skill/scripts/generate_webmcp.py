#!/usr/bin/env python3
"""Generate VGP WebMCP integration from the bundled reviewed template."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--vgp-url", default="/.well-known/giving.json")
    args = parser.parse_args()

    if not args.vgp_url.startswith("/") and not args.vgp_url.startswith("https://"):
        parser.error("--vgp-url must be a root-relative or HTTPS URL")

    template = Path(__file__).resolve().parent.parent / "assets" / "giving-tools.js"
    content = template.read_text(encoding="utf-8").replace("__VGP_URL__", args.vgp_url)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # write_bytes, not write_text: text mode rewrites newlines on Windows, so the
    # same template would produce different output bytes per platform. A tool that
    # emits a canonical declaration has to be byte-deterministic everywhere.
    args.output.write_bytes(content.encode("utf-8"))
    print(f"Generated {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
