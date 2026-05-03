#!/usr/bin/env python3
"""ProposalLedger.approve(proposalId, verifiedAggregateScore, metricsHash)."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from chain_config import chain_id, chain_rpc_url, deployment_dir, load_contract_abi, load_deployment, proposal_ledger_address
from chain_tx import send_or_dump
from metric_codec import decimal_metric_to_scaled_int
from metrics_hash import file_sha256_bytes32

try:
    from eth_account import Account
    from web3 import Web3
except ImportError:
    print("Install chain extras: python3 -m pip install -r requirements-chain.txt", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--proposal-id", type=int, required=True)
    p.add_argument("--metrics-log-file", type=Path, required=True, help="File whose SHA-256 becomes metricsHash on-chain")
    p.add_argument("--verified-score-int256", type=str)
    p.add_argument("--verified-metric", type=str, help="Decimal string; use with --metric-scale")
    p.add_argument(
        "--metric-scale",
        type=int,
        default=int(os.environ.get("ARAH_METRIC_SCALE", "1000000")),
    )
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if bool(args.verified_score_int256) == bool(args.verified_metric):
        p.error("provide exactly one of --verified-score-int256 or --verified-metric")

    if args.verified_score_int256 is not None:
        score = int(args.verified_score_int256, 0) if args.verified_score_int256.startswith("0x") else int(args.verified_score_int256)
    else:
        assert args.verified_metric is not None
        score = decimal_metric_to_scaled_int(args.verified_metric, args.metric_scale)

    mhash = Web3.to_bytes(hexstr=file_sha256_bytes32(args.metrics_log_file.resolve()))
    if len(mhash) != 32:
        print("metrics hash must be 32 bytes", file=sys.stderr)
        return 2

    key = os.environ.get("ARAH_PRIVATE_KEY")
    if not key and not args.dry_run:
        print("ARAH_PRIVATE_KEY required (or --dry-run)", file=sys.stderr)
        return 1

    deployment, deployment_path = load_deployment()
    dep_dir = deployment_dir(deployment_path)
    rpc = chain_rpc_url(deployment)
    cid = chain_id(deployment)
    ledger_addr = proposal_ledger_address(deployment)

    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        print(f"RPC connect failed: {rpc}", file=sys.stderr)
        return 1

    abi = load_contract_abi(dep_dir, deployment["contracts"]["ProposalLedger"]["artifact"])
    ledger = w3.eth.contract(address=Web3.to_checksum_address(ledger_addr), abi=abi)
    account = Account.from_key(key) if key else None
    owner = account.address if account else "0x0000000000000000000000000000000000000000"

    tx = ledger.functions.approve(args.proposal_id, score, mhash).build_transaction(
        {"from": owner, "nonce": w3.eth.get_transaction_count(owner) if account else 0, "chainId": cid}
    )
    if args.dry_run:
        print(json.dumps({"from": tx["from"], "to": tx["to"], "data": tx["data"]}, indent=2))
        return 0
    assert account is not None
    receipt = send_or_dump(w3, account, tx, False)
    if receipt is not None:
        print(json.dumps({"status": receipt.status, "transactionHash": receipt.transactionHash.hex()}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
