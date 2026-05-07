#!/usr/bin/env python3
"""Print tracked repo paths matching mutableSurface.allowedGlobs (one path per line).

Applies a hard-coded denylist that overrides whatever the protocol claims.
Paths matching the denylist are never listed even if the protocol's
allowedGlobs cover them — these paths can execute code on the host (git hooks,
GitHub Actions runners, direnv) or contain secrets, and a malicious protocol
must not be able to opt them in.
"""
from __future__ import annotations

import fnmatch
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from _git_safe import GIT_SAFE_ENV  # noqa: E402

# Always-denied paths regardless of mutableSurface.allowedGlobs.
HARD_DENY_GLOBS = (
    ".git/**",
    ".git/*",
    ".github/workflows/**",
    ".github/workflows/*",
    ".gitlab-ci.yml",
    ".gitlab/**",
    ".husky/**",
    ".husky/*",
    ".envrc",
    ".envrc.*",
    ".direnv/**",
    ".direnv/*",
    ".vscode/tasks.json",
    ".vscode/launch.json",
    ".idea/**",
    ".idea/*",
)


def match_any(path: str, globs) -> bool:
    for g in globs:
        if fnmatch.fnmatch(path, g):
            return True
        base = path.split("/")[-1]
        if fnmatch.fnmatch(base, g):
            return True
    return False


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: list_mutable_paths.py <protocol.json> <repo_root>", file=sys.stderr)
        return 2
    proto_path, repo_root = sys.argv[1], sys.argv[2]
    with open(proto_path, encoding="utf-8") as f:
        proto = json.load(f)
    globs = proto.get("mutableSurface", {}).get("allowedGlobs") or []
    if not globs:
        return 0
    out = subprocess.run(
        ["git", "-C", repo_root, "ls-files", "-z"],
        check=False,
        capture_output=True,
        env=GIT_SAFE_ENV,
    )
    if out.returncode != 0:
        return out.returncode
    raw = out.stdout.split(b"\0")
    for chunk in raw:
        if not chunk:
            continue
        path = chunk.decode("utf-8", errors="replace")
        if match_any(path, HARD_DENY_GLOBS):
            continue
        if match_any(path, globs):
            print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
