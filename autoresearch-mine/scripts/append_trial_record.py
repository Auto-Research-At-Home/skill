#!/usr/bin/env python3
"""Validate trial row JSON and append one JSON Lines record (stdlib only)."""
from __future__ import annotations

import argparse
import json
import sys


REQUIRED = (
    "schemaVersion",
    "trial_id",
    "utc_timestamp",
    "protocol_bundle_id",
    "run_ok",
    "primary_metric_name",
    "primary_metric_value",
    "direction",
    "beats_local_best",
    "beats_network_best",
    "stdout_log_path",
    "git_head_before",
    "git_head_after",
    "harness_exit_code",
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
        raise ValueError("schemaVersion must be \"1\"")
    if not isinstance(d["trial_id"], str):
        raise ValueError("trial_id must be string")
    if not isinstance(d["run_ok"], bool):
        raise ValueError("run_ok must be boolean")
    pmv = d["primary_metric_value"]
    if pmv is not None and not isinstance(pmv, (int, float)):
        raise ValueError("primary_metric_value must be number or null")
    if d["direction"] not in ("minimize", "maximize"):
        raise ValueError("direction invalid")
    if not isinstance(d["beats_local_best"], bool):
        raise ValueError("beats_local_best must be boolean")
    if not isinstance(d["beats_network_best"], bool):
        raise ValueError("beats_network_best must be boolean")
    if not isinstance(d["stdout_log_path"], str):
        raise ValueError("stdout_log_path must be string")
    if not isinstance(d["harness_exit_code"], int):
        raise ValueError("harness_exit_code must be integer")
    if not isinstance(d["error"], str):
        raise ValueError("error must be string")
    for gh in ("git_head_before", "git_head_after"):
        v = d[gh]
        if v is not None and not isinstance(v, str):
            raise ValueError(f"{gh} must be string or null")
    if "hypothesis" in d and not isinstance(d["hypothesis"], str):
        raise ValueError("hypothesis must be string")


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
