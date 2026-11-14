"""Look for secret-looking text (TC-SEC-004): private keys and access tokens must never reach git or the app bundle.

    python tools/secret_scan.py --diff BASE HEAD    lines added between two commits (CI on every pull request)
    python tools/secret_scan.py --dir DIR           every file under DIR, e.g. the `expo export` output

A hit prints the file, the line and the kind of secret, never the secret itself: CI logs are public.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

# Token formats with a fixed prefix: almost no false alarms, so they are checked everywhere.
TOKENS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "GitHub token": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})"),
    "Slack token": re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    "Google API key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "API secret key": re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}"),
}
# `password = "..."` and friends. Only for source lines a person wrote: minified bundles are full of such words.
ASSIGNED = re.compile(r"""(?i)\b(?:api[_-]?key|secret|access[_-]?token|passwd|password)\b["']?\s*[:=]\s*["'][^"'\s<>]{12,}["']""")


def scan_line(text, with_assignments):
    kinds = [name for name, rx in TOKENS.items() if rx.search(text)]
    if with_assignments and ASSIGNED.search(text):
        kinds.append("assigned secret")
    return kinds


def added_lines(base, head):
    diff = subprocess.run(["git", "-c", "core.quotePath=false", "diff", "-U0", "--no-color", "--no-ext-diff", base, head],
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    if diff.returncode != 0:
        sys.exit(f"::error::git diff failed, so nothing was scanned: {diff.stderr.strip()}")
    path, line = "?", 0
    for raw in diff.stdout.splitlines():
        if raw.startswith("+++ "):
            path = raw[4:].strip('"').removeprefix("b/")
        elif raw.startswith("@@"):
            line = int(re.match(r"@@ -\S+ \+(\d+)", raw).group(1))
        elif raw.startswith("+"):
            yield path, line, raw[1:]
            line += 1


def file_lines(root):
    for f in sorted(Path(root).rglob("*")):
        if f.is_file():
            text = f.read_bytes().decode("latin-1")  # bytecode too: Hermes keeps string literals readable
            for i, line in enumerate(text.splitlines(), 1):
                yield str(f.relative_to(root)), i, line


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--diff", nargs=2, metavar=("BASE", "HEAD"))
    group.add_argument("--dir")
    args = ap.parse_args()

    lines = added_lines(*args.diff) if args.diff else file_lines(args.dir)
    scanned = hits = 0
    for path, line, text in lines:
        scanned += 1
        for kind in scan_line(text, with_assignments=bool(args.diff)):
            hits += 1
            print(f"::error file={path},line={line}::{path}:{line}: looks like a {kind} - keep secrets out of git")
    print(f"secret scan: {scanned} line(s), {hits} hit(s)")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
