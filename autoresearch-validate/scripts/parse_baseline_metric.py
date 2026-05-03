#!/usr/bin/env python3
"""Extract last BASELINE_METRIC=value from harness stdout log."""
from __future__ import annotations

import argparse
import re
import sys


def parse_metric(text: str) -> str | None:
    last = None
    for line in text.splitlines():
        m = re.search(r"BASELINE_METRIC=([^\s]+)", line)
        if m:
            last = m.group(1).strip()
    return last


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("log_file", type=argparse.FileType("r", encoding="utf-8", errors="replace"))
    args = p.parse_args()
    body = args.log_file.read()
    v = parse_metric(body)
    if v is None:
        print("no BASELINE_METRIC= found", file=sys.stderr)
        return 1
    print(v)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
