#!/usr/bin/env python3
"""Merge protocol miningLoop with env fallbacks; print KEY=value lines for agents and shell."""
from __future__ import annotations

import json
import os
import sys


def _env_int(name: str) -> int | None:
    v = os.environ.get(name)
    if v is None or v == "":
        return None
    try:
        return int(v, 10)
    except ValueError:
        return None


def _env_float(name: str) -> float | None:
    v = os.environ.get(name)
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _env_bool(name: str) -> bool | None:
    v = os.environ.get(name)
    if v is None or v == "":
        return None
    return v.strip().lower() in ("1", "true", "yes", "on")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: read_mining_limits.py <protocol.json>", file=sys.stderr)
        return 1
    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8") as f:
            proto = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(str(e), file=sys.stderr)
        return 1

    ml = proto.get("miningLoop") or {}

    max_trials = ml.get("maxTrials")
    if max_trials is None:
        max_trials = _env_int("MINING_MAX_TRIALS")
    if max_trials is None:
        max_trials = 50

    max_session = ml.get("maxSessionWallSeconds")
    if max_session is None:
        max_session = _env_float("MINING_MAX_WALL_SECONDS")
    if max_session is None:
        max_session = -1.0

    max_stagnant = ml.get("maxConsecutiveNonImprovements")
    if max_stagnant is None:
        max_stagnant = _env_int("MINING_MAX_STAGNANT_TRIALS")
    if max_stagnant is None:
        max_stagnant = -1

    stop_after = ml.get("stopAfterSuccessfulPr")
    if stop_after is None:
        eb = _env_bool("MINING_STOP_AFTER_PR")
        stop_after = True if eb is None else eb

    on_chain_project_id = _env_int("ARAH_PROJECT_ID")
    if on_chain_project_id is None:
        oc = ml.get("onChainProjectId")
        if oc is not None:
            on_chain_project_id = int(oc)

    print(f"max_trials={int(max_trials)}")
    print(f"max_session_wall_seconds={max_session}")
    print(f"max_stagnant_trials={int(max_stagnant)}")
    print(f"stop_after_pr={'true' if stop_after else 'false'}")
    if on_chain_project_id is not None:
        print(f"on_chain_project_id={int(on_chain_project_id)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
