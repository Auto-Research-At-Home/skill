#!/usr/bin/env python3
"""Validate review row JSON and append one JSON Lines record (stdlib only)."""
from __future__ import annotations

import argparse
import json
import sys

REQUIRED = (
    "schemaVersion",
    "review_id",
    "utc_timestamp",
    "proposal_id",
    "project_id",
    "result",
    "reason_code",
    "stdout_log_path",
    "error",
)


def validate_row(obj: object) -> None:
    if not isinstance(obj, dict):
        raise ValueError("record must be a JSON object")
    d = obj
    for k in REQUIRED:
        if k not in d:
            raise ValueError(f"missing field: {k}")
    if d["schemaVersion"] != "1":
        raise ValueError('schemaVersion must be "1"')
    if d["result"] not in ("skipped", "approved", "rejected", "released", "operational_failure"):
        raise ValueError("result invalid")
    for sk in ("review_id", "utc_timestamp", "reason_code", "stdout_log_path", "error"):
        if not isinstance(d[sk], str):
            raise ValueError(f"{sk} must be string")
    if not isinstance(d["proposal_id"], int) or d["proposal_id"] < 0:
        raise ValueError("proposal_id must be non-negative int")
    if not isinstance(d["project_id"], int) or d["project_id"] < 0:
        raise ValueError("project_id must be non-negative int")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--record-file", required=True)
    ap.add_argument("--json-file", required=True)
    args = ap.parse_args()
    try:
        raw = open(args.json_file, encoding="utf-8").read()
        obj = json.loads(raw)
        validate_row(obj)
    except (OSError, json.JSONDecodeError, ValueError) as e:
        print(str(e), file=sys.stderr)
        return 1
    line = json.dumps(obj, separators=(",", ":"), sort_keys=True)
    try:
        with open(args.record_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError as e:
        print(str(e), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
