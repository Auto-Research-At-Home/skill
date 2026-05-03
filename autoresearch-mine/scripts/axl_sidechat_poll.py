#!/usr/bin/env python3
"""Drain inbound AXL sidechat messages into .autoresearch/mine/sidechat.jsonl."""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


PEER_RE = re.compile(r"^[0-9a-fA-F]{64}$")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def default_sidechat_file(repo_root: str) -> str:
    return os.path.join(repo_root, ".autoresearch", "mine", "sidechat.jsonl")


def decode_body(raw: bytes, from_peer_id: str | None) -> dict[str, Any]:
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {
            "schemaVersion": "1",
            "type": "AXL_RAW_MESSAGE",
            "fromPeerId": from_peer_id,
            "receivedAt": utc_now(),
            "bodyBase64": base64.b64encode(raw).decode("ascii"),
        }
    if not isinstance(obj, dict):
        obj = {"schemaVersion": "1", "type": "AXL_JSON_MESSAGE", "payload": obj}
    obj.setdefault("schemaVersion", "1")
    obj.setdefault("type", "AXL_JSON_MESSAGE")
    if from_peer_id and "fromPeerId" not in obj:
        obj["fromPeerId"] = from_peer_id.lower()
    obj["receivedAt"] = utc_now()
    return obj


def recv_one(axl_api: str, timeout: float, max_bytes: int) -> tuple[int, dict[str, Any] | None]:
    req = urllib.request.Request(f"{axl_api.rstrip('/')}/recv", method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        status = resp.status
        if status == 204:
            return status, None
        raw = resp.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise ValueError(f"AXL message exceeds max bytes: {max_bytes}")
        from_peer_id = resp.headers.get("X-From-Peer-Id")
        if from_peer_id and not PEER_RE.fullmatch(from_peer_id):
            from_peer_id = None
        return status, decode_body(raw, from_peer_id)


def append_jsonl(path: str, rows: list[dict[str, Any]]) -> None:
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, separators=(",", ":"), sort_keys=True) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=None, help="Repo root containing .autoresearch/mine")
    ap.add_argument("--sidechat-file", default=None, help="Output JSONL file; overrides --repo-root")
    ap.add_argument("--axl-api", default=os.environ.get("ARAH_AXL_API", "http://127.0.0.1:9002"))
    ap.add_argument("--max-messages", type=int, default=int(os.environ.get("ARAH_AXL_MAX_RECV", "50")))
    ap.add_argument("--max-message-bytes", type=int, default=int(os.environ.get("ARAH_AXL_MAX_MESSAGE_BYTES", str(1024 * 1024))))
    ap.add_argument("--timeout", type=float, default=float(os.environ.get("ARAH_AXL_TIMEOUT_SECONDS", "5")))
    args = ap.parse_args()

    if args.max_messages < 1:
        print("--max-messages must be >= 1", file=sys.stderr)
        return 1
    if args.sidechat_file:
        sidechat_file = args.sidechat_file
    elif args.repo_root:
        sidechat_file = default_sidechat_file(os.path.abspath(args.repo_root))
    else:
        print("provide --repo-root or --sidechat-file", file=sys.stderr)
        return 1

    rows: list[dict[str, Any]] = []
    try:
        for _ in range(args.max_messages):
            status, row = recv_one(args.axl_api, args.timeout, args.max_message_bytes)
            if status == 204:
                break
            if status < 200 or status >= 300:
                raise RuntimeError(f"AXL /recv returned HTTP {status}")
            if row is not None:
                rows.append(row)
        if rows:
            append_jsonl(sidechat_file, rows)
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as e:
        print(str(e), file=sys.stderr)
        return 1

    print(json.dumps({"received": len(rows), "sidechatFile": sidechat_file}, separators=(",", ":"), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
