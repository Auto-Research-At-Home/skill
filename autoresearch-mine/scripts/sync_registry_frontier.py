#!/usr/bin/env python3
"""Read ProjectRegistry on 0G Galileo and write .autoresearch/mine/network_state.json (source=registry)."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from chain_config import (
    chain_id,
    chain_rpc_url,
    load_contract_abi,
    load_deployment,
    project_registry_address,
)

try:
    from web3 import Web3
except ImportError as e:
    print("Install chain extras: pip install -r requirements-chain.txt", file=sys.stderr)
    raise SystemExit(1) from e


def hash_file_bytes32(file_path: Path) -> str:
    data = file_path.read_bytes()
    return "0x" + hashlib.sha256(data).hexdigest()


def scaled_int_to_float(value: int, scale: int) -> float:
    return float(value) / float(scale)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync network frontier from ProjectRegistry (currentBestAggregateScore).",
    )
    parser.add_argument("--project-id", type=int, required=True)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument(
        "--protocol-json",
        type=Path,
        help="Protocol file: fills protocolBundleId / metric fields; enables --verify-protocol-hash.",
    )
    parser.add_argument(
        "--metric-scale",
        type=int,
        default=int(__import__("os").environ.get("ARAH_METRIC_SCALE", "1000000")),
        help="Integer scale for decoding int256 aggregate score to float (same as createProject). "
        "Default: env ARAH_METRIC_SCALE or 1000000.",
    )
    parser.add_argument(
        "--verify-protocol-hash",
        action="store_true",
        help="Require protocol.json SHA-256 (bytes32) to match on-chain project.protocolHash.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Override output path (default: <repo-root>/.autoresearch/mine/network_state.json).",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    deployment, deployment_path = load_deployment()
    dep_dir = deployment_path.parent
    rpc = chain_rpc_url(deployment)
    cid = chain_id(deployment)
    registry_addr = project_registry_address(deployment)

    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        print(f"failed to connect to RPC: {rpc}", file=sys.stderr)
        return 1

    reg_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProjectRegistry"]["artifact"])
    registry = w3.eth.contract(address=Web3.to_checksum_address(registry_addr), abi=reg_abi)

    best_raw = registry.functions.currentBestAggregateScore(args.project_id).call()
    best_int = int(best_raw)

    protocol_bundle_id = "UNKNOWN"
    metric_name = "UNKNOWN"
    direction = "maximize"
    if args.protocol_json:
        protocol = json.loads(args.protocol_json.read_text(encoding="utf-8"))
        protocol_bundle_id = protocol["meta"]["protocolBundleId"]
        metric_name = protocol["measurement"]["primaryMetric"]["name"]
        direction = protocol["measurement"]["primaryMetric"]["direction"]

        if args.verify_protocol_hash:
            local_hash = hash_file_bytes32(args.protocol_json.resolve())
            proj = registry.functions.getProject(args.project_id).call()
            on_chain = proj[0] if isinstance(proj, (list, tuple)) else proj["protocolHash"]
            if isinstance(on_chain, bytes):
                on_chain = "0x" + on_chain.hex()
            if local_hash.lower() != str(on_chain).lower():
                print(
                    f"protocol hash mismatch: local {local_hash} != chain {on_chain}",
                    file=sys.stderr,
                )
                return 1

    metric_float = scaled_int_to_float(best_int, args.metric_scale)
    out_path = args.output or (args.repo_root / ".autoresearch" / "mine" / "network_state.json")

    state = {
        "schemaVersion": "1",
        "source": "registry",
        "protocolBundleId": protocol_bundle_id,
        "project_id": args.project_id,
        "chain_id": cid,
        "project_registry": registry_addr,
        "network_best_metric": metric_float,
        "aggregate_score_int256": str(best_int),
        "metric_scale": args.metric_scale,
        "metric_name": metric_name,
        "direction": direction,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    if args.dry_run:
        print(json.dumps(state, indent=2))
        return 0

    if not args.protocol_json:
        print(
            "warning: --protocol-json omitted; protocolBundleId/metric fields may not match "
            "your repo (validate_network_state.sh will fail).",
            file=sys.stderr,
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    print(str(out_path.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
