#!/usr/bin/env python3
"""Print tracked repo paths matching mutableSurface.allowedGlobs (one path per line)."""
from __future__ import annotations

import json
import subprocess
import sys
import fnmatch


def match_any(path: str, globs: list[str]) -> bool:
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
    )
    if out.returncode != 0:
        return out.returncode
    raw = out.stdout.split(b"\0")
    for chunk in raw:
        if not chunk:
            continue
        path = chunk.decode("utf-8", errors="replace")
        if match_any(path, globs):
            print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
