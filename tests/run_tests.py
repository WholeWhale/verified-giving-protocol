#!/usr/bin/env python3
"""VGP test suite. No third-party dependencies, matching the validator it exercises.

Run from the repository root:  python tests/run_tests.py
"""

from __future__ import annotations

import copy
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "skill" / "scripts"
STATEMENT = "Our organization authorizes donations through this destination."

FAILURES: list[str] = []
PASSES = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASSES
    if condition:
        PASSES += 1
        print(f"  ok    {name}")
    else:
        FAILURES.append(f"{name}{f' :: {detail}' if detail else ''}")
        print(f"  FAIL  {name}{f' :: {detail}' if detail else ''}")


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, *args], capture_output=True, text=True, cwd=ROOT
    )


def validate(path: Path) -> subprocess.CompletedProcess:
    return run(str(SCRIPTS / "validate_vgp.py"), str(path))


def validates_ok(doc: dict, tmp: Path, label: str) -> bool:
    target = tmp / f"{label}.json"
    target.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    return validate(target).returncode == 0


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------
# 1. Artifacts that exist at two paths must not drift
# --------------------------------------------------------------------------
def test_no_artifact_drift() -> None:
    print("\nartifact drift")

    canonical = ROOT / "vgp" / "schema.json"
    source = ROOT / "skill" / "assets" / "vgp-0.1.schema.json"
    check(
        "vgp/schema.json is byte-identical to the skill copy",
        canonical.read_bytes() == source.read_bytes(),
        "the standard must not disagree with its own tooling",
    )

    with tempfile.TemporaryDirectory() as raw:
        regenerated = Path(raw) / "giving-tools.js"
        result = run(
            str(SCRIPTS / "generate_webmcp.py"), "--output", str(regenerated)
        )
        check("generate_webmcp.py runs clean", result.returncode == 0, result.stderr)
        if result.returncode == 0:
            shipped = (ROOT / "webmcp" / "giving-tools.js").read_bytes()
            produced = regenerated.read_bytes()
            check(
                "webmcp/giving-tools.js matches a fresh generation",
                shipped == produced,
                "regenerate with: python skill/scripts/generate_webmcp.py "
                "--output webmcp/giving-tools.js",
            )
            # Regression guard. Path.write_text opens in text mode, which rewrites
            # newlines on Windows, so the generator used to emit CRLF there and LF
            # on Linux. That is invisible on any single platform and breaks the
            # comparison above only for the half of users on the other one.
            check(
                "generator output is byte-deterministic across platforms",
                b"\r" not in produced,
                "generated output must be LF-only regardless of host OS",
            )

    shipped_text = (ROOT / "webmcp" / "giving-tools.js").read_text(encoding="utf-8")
    check(
        "generated tools carry no unsubstituted placeholder",
        "__VGP_URL__" not in shipped_text,
    )


# --------------------------------------------------------------------------
# 2. Documents that ship in this repo must be valid
# --------------------------------------------------------------------------
def test_shipped_documents_validate() -> None:
    print("\nshipped documents")
    for relative in (
        "vgp/examples/approved.giving.json",
        "vgp/examples/draft.giving.json",
        "powerpoetry/giving.json",
    ):
        result = validate(ROOT / relative)
        check(f"{relative} is valid", result.returncode == 0, result.stderr.strip())

    powerpoetry = load(ROOT / "powerpoetry" / "giving.json")
    check(
        "powerpoetry/giving.json is still an unapproved draft",
        powerpoetry["verification"]["organization_approved"] is False,
        "the reference implementation must not claim approval it has not received",
    )
    check(
        "powerpoetry/giving.json asserts no legal entity",
        powerpoetry["organization"]["legal_name"] is None
        and powerpoetry["organization"]["ein"] is None,
        "the Power Poetry / To Be Heard Foundation relationship is unresolved",
    )


# --------------------------------------------------------------------------
# 3. Trust invariants: the negatives are the point of the protocol
# --------------------------------------------------------------------------
def test_trust_invariants() -> None:
    print("\ntrust invariants (each of these MUST be rejected)")
    approved = load(ROOT / "vgp" / "examples" / "approved.giving.json")
    draft = load(ROOT / "vgp" / "examples" / "draft.giving.json")

    with tempfile.TemporaryDirectory() as raw:
        tmp = Path(raw)

        # A discovered candidate cannot ride into an unapproved document.
        smuggled = copy.deepcopy(draft)
        smuggled["giving"]["authorized_destinations"] = copy.deepcopy(
            approved["giving"]["authorized_destinations"][:1]
        )
        check(
            "unapproved document carrying a destination is rejected",
            not validates_ok(smuggled, tmp, "smuggled"),
            "discovery must never populate an unapproved document",
        )

        # The affirmation is a constant, not a paraphrase.
        paraphrased = copy.deepcopy(approved)
        paraphrased["giving"]["authorized_destinations"][0]["authorization"][
            "statement"
        ] = "We approve of this donation destination."
        check(
            "paraphrased authorization statement is rejected",
            not validates_ok(paraphrased, tmp, "paraphrased"),
        )

        # status must be the literal "authorized"
        downgraded = copy.deepcopy(approved)
        downgraded["giving"]["authorized_destinations"][0]["authorization"][
            "status"
        ] = "confirmed"
        check(
            "a 'confirmed' status in authorization is rejected",
            not validates_ok(downgraded, tmp, "downgraded"),
            "confirmed is a discovery status and never authorizes",
        )

        # An approved US document cannot hide its EIN.
        no_ein = copy.deepcopy(approved)
        no_ein["organization"]["ein"] = None
        check(
            "approved US document without an EIN is rejected",
            not validates_ok(no_ein, tmp, "no_ein"),
        )

        # An approved document with nothing authorized is meaningless.
        empty_approved = copy.deepcopy(approved)
        empty_approved["giving"]["authorized_destinations"] = []
        check(
            "approved document with zero destinations is rejected",
            not validates_ok(empty_approved, tmp, "empty_approved"),
        )

        # Transport matters: a giving URL is HTTPS or it is nothing.
        insecure = copy.deepcopy(approved)
        insecure["giving"]["authorized_destinations"][0]["url"] = (
            "http://example.org/donate"
        )
        check(
            "plain-HTTP destination URL is rejected",
            not validates_ok(insecure, tmp, "insecure"),
        )

        # canonical_domain is a host, not a URL.
        as_url = copy.deepcopy(approved)
        as_url["canonical_domain"] = "https://example.org/"
        check(
            "canonical_domain given as a URL is rejected",
            not validates_ok(as_url, tmp, "as_url"),
        )

        # Duplicate IDs would make destinations ambiguous to an agent.
        duplicated = copy.deepcopy(approved)
        first = copy.deepcopy(duplicated["giving"]["authorized_destinations"][0])
        duplicated["giving"]["authorized_destinations"].append(first)
        check(
            "duplicate destination id is rejected",
            not validates_ok(duplicated, tmp, "duplicated"),
        )


# --------------------------------------------------------------------------
# 4. The approval gate
# --------------------------------------------------------------------------
def test_approval_gate() -> None:
    print("\napproval gate")
    review_template = ROOT / "skill" / "assets" / "vgp-review.template.json"
    draft_template = ROOT / "skill" / "assets" / "giving.draft.template.json"

    with tempfile.TemporaryDirectory() as raw:
        tmp = Path(raw)
        review = tmp / "review.json"
        shutil.copyfile(review_template, review)

        def approve(vgp: Path, statement: str, role: str = "Executive Director"):
            return run(
                str(SCRIPTS / "approve_destination.py"),
                "--review", str(review),
                "--vgp", str(vgp),
                "--candidate-id", "direct-card",
                "--approver-role", role,
                "--statement", statement,
            )

        # Wrong words, no authorization.
        vgp_a = tmp / "a.json"
        shutil.copyfile(draft_template, vgp_a)
        check(
            "paraphrased affirmation cannot authorize",
            approve(vgp_a, "We authorize this destination.").returncode != 0,
            "the affirmation is a constant, not a sentiment",
        )
        check(
            "the rejected document was left untouched",
            load(vgp_a)["giving"]["authorized_destinations"] == [],
        )

        # An unknown candidate cannot be approved into existence.
        result = run(
            str(SCRIPTS / "approve_destination.py"),
            "--review", str(review),
            "--vgp", str(vgp_a),
            "--candidate-id", "not-a-real-candidate",
            "--approver-role", "Executive Director",
            "--statement", STATEMENT,
        )
        check("unknown candidate id is refused", result.returncode != 0)

        # The Power Poetry case: unresolved identity blocks approval outright.
        vgp_pp = tmp / "powerpoetry.json"
        shutil.copyfile(ROOT / "powerpoetry" / "giving.json", vgp_pp)
        blocked = approve(vgp_pp, STATEMENT)
        check(
            "unresolved organization identity blocks approval",
            blocked.returncode != 0,
            "this is exactly why powerpoetry/giving.json cannot be published yet",
        )
        check(
            "the blocked Power Poetry draft was left untouched",
            load(vgp_pp)["verification"]["organization_approved"] is False,
        )

        # Happy path: resolved identity plus the exact affirmation.
        vgp_ok = tmp / "ok.json"
        shutil.copyfile(draft_template, vgp_ok)
        good = approve(vgp_ok, STATEMENT)
        check("exact affirmation authorizes", good.returncode == 0, good.stderr.strip())

        if good.returncode == 0:
            result_doc = load(vgp_ok)
            destinations = result_doc["giving"]["authorized_destinations"]
            check("one destination was promoted", len(destinations) == 1)
            check(
                "promoted destination records the exact statement",
                destinations[0]["authorization"]["statement"] == STATEMENT,
            )
            check(
                "promoted destination records an approver role",
                destinations[0]["authorization"]["approved_by_role"]
                == "Executive Director",
            )
            check(
                "the document flipped to approved",
                result_doc["verification"]["organization_approved"] is True,
            )
            check(
                "the promoted document validates",
                validate(vgp_ok).returncode == 0,
                validate(vgp_ok).stderr.strip(),
            )
            # Approving twice must not silently duplicate.
            check(
                "re-approving the same destination is refused",
                approve(vgp_ok, STATEMENT).returncode != 0,
            )


# --------------------------------------------------------------------------
# 5. Everything compiles / parses
# --------------------------------------------------------------------------
def test_sources_parse() -> None:
    print("\nsource integrity")
    result = subprocess.run(
        [sys.executable, "-m", "compileall", "-q", str(SCRIPTS)],
        capture_output=True, text=True, cwd=ROOT,
    )
    check("skill scripts compile", result.returncode == 0, result.stdout + result.stderr)

    for relative in ("vgp/schema.json", "skill/assets/vgp-review.schema.json"):
        try:
            json.loads((ROOT / relative).read_text(encoding="utf-8"))
            ok, detail = True, ""
        except json.JSONDecodeError as exc:
            ok, detail = False, str(exc)
        check(f"{relative} is parseable JSON", ok, detail)

    node = shutil.which("node")
    if node:
        result = subprocess.run(
            [node, "--check", str(ROOT / "webmcp" / "giving-tools.js")],
            capture_output=True, text=True,
        )
        check("webmcp/giving-tools.js parses", result.returncode == 0, result.stderr)
    else:
        print("  skip  node --check (node not on PATH)")


# --------------------------------------------------------------------------
# 6. The approved not-listed wording must not drift
# --------------------------------------------------------------------------
def test_not_listed_wording() -> None:
    print("\nnot-listed wording (VGP 0.1 section 3.4)")
    def flatten(path: Path) -> str:
        # Prose is line-wrapped differently in Markdown and in HTML, so collapse
        # whitespace before matching sentences across either.
        return " ".join(path.read_text(encoding="utf-8").split())

    spec = flatten(ROOT / "vgp" / "specification.md")
    demo = flatten(ROOT / "demo" / "third-party-example" / "index.html")

    # The four clauses the wording is required to carry. Each blocks a distinct
    # failure mode, so losing any one of them is a substantive regression rather
    # than a copy edit. See specification.md section 3.4.
    clauses = {
        "scope: names the declaration": "has not listed this destination in its published giving",
        "disclaimer: no finding about the service": "not a finding about this service",
        "cause: names the declaration, not the party": "the organization has not declared it",
        "next step: leaves the donor a route": "contact the organization directly to confirm",
    }
    for label, fragment in clauses.items():
        check(f"spec keeps clause -- {label}", fragment in spec, fragment)
        check(f"demo keeps clause -- {label}", fragment in demo, fragment)

    # Scope this to the reference response itself. Scanning a whole document for
    # "fraudulent" cannot distinguish asserting the word from forbidding it, and
    # the specification necessarily forbids it in prose.
    def reference_response(text: str) -> str | None:
        start = text.find("has not listed this destination")
        if start == -1:
            return None
        end = text.find("confirm.", start)
        return text[start : end + len("confirm.")] if end != -1 else None

    for label, text in (("specification", spec), ("demo page", demo)):
        response = reference_response(text)
        check(f"{label} contains the reference response", response is not None)
        if response:
            offenders = [
                word
                for word in ("fraudulent", "scam", "fake", "illegitimate", "phishing")
                if word in response.lower()
            ]
            check(
                f"{label} reference response accuses no one",
                not offenders,
                f"found: {offenders}",
            )

    # The specification must still forbid the accusation explicitly.
    check(
        "specification forbids describing an unlisted destination as fraudulent",
        "MUST NOT describe an unlisted destination as fraudulent" in spec,
    )
    check(
        "the wording decision is settled, not still a TODO",
        "TODO(george)" not in spec,
    )


def main() -> int:
    print("VGP 0.1 test suite")
    test_no_artifact_drift()
    test_shipped_documents_validate()
    test_trust_invariants()
    test_approval_gate()
    test_not_listed_wording()
    test_sources_parse()

    print(f"\n{PASSES} passed, {len(FAILURES)} failed")
    for failure in FAILURES:
        print(f"  FAILED: {failure}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
