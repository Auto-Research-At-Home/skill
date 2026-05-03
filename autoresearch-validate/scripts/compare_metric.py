#!/usr/bin/env python3
"""Exit 0 if candidate strictly improves baseline for direction; 1 if not; 2 on error."""
from __future__ import annotations

import argparse
import math
import sys


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--direction", choices=("minimize", "maximize"), required=True)
    p.add_argument("--candidate", required=True)
    p.add_argument("--baseline", required=True)
    args = p.parse_args()
    try:
        c = float(args.candidate)
        b = float(args.baseline)
    except ValueError:
        return 2
    if math.isnan(c) or math.isnan(b):
        return 2
    if args.direction == "minimize":
        improved = c < b
    else:
        improved = c > b
    return 0 if improved else 1


if __name__ == "__main__":
    raise SystemExit(main())
