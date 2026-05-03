#!/usr/bin/env python3
"""Compute metricsHash bytes32 (SHA-256 of verifier benchmark log bytes, as 0x + 64 hex)."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def file_sha256_bytes32(path: Path) -> str:
    data = path.read_bytes()
    return "0x" + hashlib.sha256(data).hexdigest()


def main() -> int:
    p = argparse.ArgumentParser(description="SHA-256 file → bytes32 hex string.")
    p.add_argument("file", type=Path)
    args = p.parse_args()
    if not args.file.is_file():
        print("file not found", file=__import__("sys").stderr)
        return 1
    print(file_sha256_bytes32(args.file.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
