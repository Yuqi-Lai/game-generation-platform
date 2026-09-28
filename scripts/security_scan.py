#!/usr/bin/env python3
"""Scan the current working tree for forbidden files and known credential forms.

This deliberately scans the current tree rather than historical commits. The repository
owner has chosen to retain the already-revoked historical credential in Git history.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKIP_PARTS = {".git", "node_modules", ".pytest_cache", "test-results", "playwright-report"}

PATTERNS = {
    "Google API key": re.compile(rb"AIza[0-9A-Za-z_-]{30,}"),
    "OpenAI API key": re.compile(rb"(?<![A-Za-z0-9])sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}"),
    "AWS access key": re.compile(rb"(?<![A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])"),
    "GitHub token": re.compile(rb"gh[pousr]_[A-Za-z0-9]{20,}"),
    "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    "sk_ credential": re.compile(rb"(?<![A-Za-z0-9])sk_[A-Za-z0-9_-]{20,}"),
    "credentialed URL": re.compile(
        rb"(?i)(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?)://"
        rb"[^\s/:@]{1,80}:[^\s/@]{4,80}@"
    ),
}


def included(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    return not any(part in SKIP_PARTS for part in relative.parts)


def main() -> int:
    violations: list[str] = []

    for path in ROOT.rglob("*"):
        if not path.is_file() or not included(path):
            continue

        relative = path.relative_to(ROOT)
        if "__pycache__" in relative.parts or path.suffix in {".pyc", ".pyo"}:
            violations.append(f"forbidden generated file: {relative}")
            continue

        if path.name == "key.txt" or (
            path.name.startswith(".env") and path.name != ".env.example"
        ):
            violations.append(f"forbidden credential file: {relative}")
            continue

        data = path.read_bytes()
        for label, pattern in PATTERNS.items():
            if pattern.search(data):
                violations.append(f"{label} signature: {relative}")

    dockerignore = (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
    if "legacy/" not in {line.strip() for line in dockerignore}:
        violations.append(".dockerignore must exclude legacy/")
    if not (ROOT / "legacy" / "playrpg" / "server.py").is_file():
        violations.append("legacy server is missing from its quarantined reference path")

    if violations:
        print("Current-tree security scan failed:", file=sys.stderr)
        for violation in violations:
            print(f"- {violation}", file=sys.stderr)
        return 1

    print("Current-tree security scan passed: no known credential signatures or forbidden files found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

