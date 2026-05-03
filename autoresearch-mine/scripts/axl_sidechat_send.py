#!/usr/bin/env python3
"""Broadcast the latest mining trial as an optional AXL sidechat message."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


PEER_RE = re.compile(r"^[0-9a-fA-F]{64}$")
TRUE_VALUES = {"1", "true", "yes", "on"}
FALSE_VALUES = {"0", "false", "no", "off"}


def env_flag(name: str) -> bool | None:
    raw = os.environ.get(name)
    if raw is None:
        return None
    value = raw.strip().lower()
    if value in TRUE_VALUES:
        return True
    if value in FALSE_VALUES:
        return False
    raise ValueError(f"{name} must be one of: {', '.join(sorted(TRUE_VALUES | FALSE_VALUES))}")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_latest_jsonl(path: str) -> dict[str, Any]:
    try:
        with open(path, encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]
    except OSError as e:
        raise ValueError(str(e)) from e
    if not lines:
        raise ValueError(f"record file has no JSONL rows: {path}")
    try:
        obj = json.loads(lines[-1])
    except json.JSONDecodeError as e:
        raise ValueError(f"latest JSONL row is invalid JSON: {e}") from e
    if not isinstance(obj, dict):
        raise ValueError("latest JSONL row must be an object")
    return obj


def split_peers(values: list[str]) -> list[str]:
    peers: list[str] = []
    seen: set[str] = set()
    for value in values:
        for part in value.split(","):
            peer = part.strip()
            if not peer:
                continue
            if not PEER_RE.fullmatch(peer):
                raise ValueError(f"AXL peer id must be 64 hex characters: {peer}")
            peer = peer.lower()
            if peer not in seen:
                peers.append(peer)
                seen.add(peer)
    return peers


def fetch_miner_id(axl_api: str, timeout: float) -> str | None:
    req = urllib.request.Request(f"{axl_api.rstrip('/')}/topology", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(1024 * 1024)
    except (OSError, urllib.error.URLError):
        return None
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(obj, dict):
        return None
    peer_id = obj.get("our_public_key")
    if isinstance(peer_id, str) and PEER_RE.fullmatch(peer_id):
        return peer_id.lower()
    return None


def summary_for(record: dict[str, Any]) -> str:
    if not record.get("run_ok"):
        error = str(record.get("error") or "").strip()
        return error[:240] if error else "Trial failed before producing a usable metric."
    metric_name = record.get("primary_metric_name")
    metric_value = record.get("primary_metric_value")
    if record.get("beats_local_best"):
        return f"Trial improved local best: {metric_name}={metric_value}."
    return f"Trial completed without improving local best: {metric_name}={metric_value}."


def build_message(args: argparse.Namespace, record: dict[str, Any], axl_api: str) -> dict[str, Any]:
    timeout = args.timeout
    miner_id = args.miner_id or os.environ.get("ARAH_MINER_ID") or fetch_miner_id(axl_api, timeout)
    return {
        "schemaVersion": "1",
        "type": "MINER_EXPERIENCE",
        "projectId": args.project_id or os.environ.get("ARAH_PROJECT_ID"),
        "protocolBundleId": record.get("protocol_bundle_id"),
        "trialId": record.get("trial_id"),
        "minerId": miner_id,
        "timestamp": utc_now(),
        "hypothesis": record.get("hypothesis", ""),
        "metricName": record.get("primary_metric_name"),
        "metricValue": record.get("primary_metric_value"),
        "direction": record.get("direction"),
        "beatsLocalBest": record.get("beats_local_best"),
        "beatsNetworkBest": record.get("beats_network_best"),
        "runOk": record.get("run_ok"),
        "summary": args.summary or summary_for(record),
        "ask": args.ask or "",
        "stdoutLogPath": record.get("stdout_log_path"),
        "gitHeadAfter": record.get("git_head_after"),
    }


def send_message(axl_api: str, peer: str, message: dict[str, Any], timeout: float) -> int:
    body = json.dumps(message, separators=(",", ":"), sort_keys=True).encode("utf-8")
    req = urllib.request.Request(
        f"{axl_api.rstrip('/')}/send",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Destination-Peer-Id": peer,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status < 200 or resp.status >= 300:
            raise RuntimeError(f"AXL /send returned HTTP {resp.status}")
        sent = resp.headers.get("X-Sent-Bytes")
        return int(sent) if sent and sent.isdigit() else len(body)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--record-file", required=True, help="Path to .autoresearch/mine/trials.jsonl")
    ap.add_argument("--peer", action="append", default=[], help="Destination AXL peer id; may be repeated")
    ap.add_argument("--peers", default=os.environ.get("ARAH_AXL_PEERS", ""), help="Comma-separated destination peer ids")
    ap.add_argument("--axl-api", default=os.environ.get("ARAH_AXL_API", "http://127.0.0.1:9002"))
    ap.add_argument("--project-id", default=None)
    ap.add_argument("--miner-id", default=None)
    ap.add_argument("--summary", default="")
    ap.add_argument("--ask", default="")
    ap.add_argument("--timeout", type=float, default=float(os.environ.get("ARAH_AXL_TIMEOUT_SECONDS", "5")))
    ap.add_argument("--dry-run", action="store_true", help="Print the message and do not call AXL")
    args = ap.parse_args()

    try:
        enabled = env_flag("ARAH_AXL_ENABLED")
        if enabled is False and not args.dry_run:
            print("AXL sidechat disabled by ARAH_AXL_ENABLED", file=sys.stderr)
            return 0
        record = read_latest_jsonl(args.record_file)
        peers = split_peers(args.peer + ([args.peers] if args.peers else []))
        message = build_message(args, record, args.axl_api)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 1

    if args.dry_run:
        print(json.dumps({"message": message, "peers": peers}, indent=2, sort_keys=True))
        return 0
    if not peers:
        print("no AXL peers configured; nothing sent", file=sys.stderr)
        return 0

    sent: list[dict[str, Any]] = []
    failed: list[dict[str, str]] = []
    for peer in peers:
        try:
            sent_bytes = send_message(args.axl_api, peer, message, args.timeout)
            sent.append({"peer": peer, "bytes": sent_bytes})
        except Exception as e:  # noqa: BLE001 - CLI should report all peer failures.
            failed.append({"peer": peer, "error": str(e)})

    print(json.dumps({"sent": sent, "failed": failed}, separators=(",", ":"), sort_keys=True))
    return 1 if failed and not sent else 0


if __name__ == "__main__":
    raise SystemExit(main())
