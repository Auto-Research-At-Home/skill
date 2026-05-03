#!/usr/bin/env python3
"""Submit a mining proposal: ProjectToken tokenOf → optional buy → approve → ProposalLedger.submit."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from chain_config import (
    chain_id,
    chain_rpc_url,
    load_contract_abi,
    load_deployment,
    project_registry_address,
    proposal_ledger_address,
)

try:
    from eth_account import Account
    from web3 import Web3
except ImportError as e:
    print("Install chain extras: pip install -r requirements-chain.txt", file=sys.stderr)
    raise SystemExit(1) from e


def hash_file_bytes32(file_path: Path) -> str:
    data = file_path.read_bytes()
    return "0x" + hashlib.sha256(data).hexdigest()


def assert_bytes32(value: str, label: str) -> str:
    s = value.strip()
    if not (s.startswith("0x") and len(s) == 66):
        raise ValueError(f"{label} must be 0x + 64 hex chars")
    return s


def parse_uint256(text: str) -> int:
    n = int(text, 0) if text.startswith("0x") else int(text)
    if n < 0:
        raise ValueError("unsigned integer required")
    return n


def parse_int256(text: str) -> int:
    return int(text, 0) if text.startswith("0x") else int(text)


def decimal_metric_to_scaled_int(metric_text: str, scale: int) -> int:
    scale_b = int(scale)
    if scale_b <= 0:
        raise ValueError("metric scale must be positive")
    s = metric_text.strip()
    negative = s.startswith("-")
    if negative:
        s = s[1:]
    if "." in s:
        whole, frac = s.split(".", 1)
        if not whole:
            whole = "0"
        den = 10 ** len(frac)
        num = int(whole) * den + int(frac or "0")
        num *= scale_b
        if num % den != 0:
            raise ValueError("metric cannot be represented exactly at this scale")
        v = num // den
    else:
        v = int(s) * scale_b
    return -v if negative else v


def tx_summary(tx: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for k, v in tx.items():
        if hasattr(v, "hex"):
            out[k] = v.hex()
        elif isinstance(v, bytes):
            out[k] = "0x" + v.hex()
        else:
            out[k] = v
    return out


def send_or_dump(w3: Web3, account: Account, tx: dict[str, Any], dry_run: bool) -> Any:
    if dry_run:
        print(json.dumps(tx_summary(tx), indent=2))
        return None
    gas_est = w3.eth.estimate_gas(tx)
    tx["gas"] = int(gas_est * 1.2)
    if "maxFeePerGas" not in tx and "gasPrice" not in tx:
        tx["gasPrice"] = w3.eth.gas_price
    signed = account.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
    h = w3.eth.send_raw_transaction(raw)
    return w3.eth.wait_for_transaction_receipt(h)


def main() -> int:
    p = argparse.ArgumentParser(description="Submit ProposalLedger.submit for a project (0G Galileo).")
    p.add_argument("--project-id", type=int, required=True)
    p.add_argument("--code-hash", type=str, help="bytes32 hex for repo/code snapshot")
    p.add_argument("--code-file", type=Path, help="File to SHA-256 as codeHash (overrides --code-hash)")
    p.add_argument("--benchmark-log-hash", type=str)
    p.add_argument("--benchmark-log-file", type=Path)
    p.add_argument("--claimed-score-int256", type=str, help="Raw int256 string for claimedAggregateScore")
    p.add_argument("--claimed-metric", type=str, help="Decimal metric; combined with --metric-scale")
    p.add_argument(
        "--metric-scale",
        type=int,
        default=int(os.environ.get("ARAH_METRIC_SCALE", "1000000")),
    )
    p.add_argument("--stake", type=str, required=True, help="Stake amount in wei (uint256)")
    p.add_argument("--reward-recipient", type=str, required=True, help="address")
    p.add_argument(
        "--buy-value-wei",
        type=str,
        default="0",
        help="Optional ETH (wei) to send with ProjectToken.buy() if balance < stake",
    )
    p.add_argument("--skip-buy", action="store_true", help="Do not call buy() even if balance is low")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print transactions only (still sets ARAH_PRIVATE_KEY for from/nonce when estimating).",
    )
    p.add_argument(
        "--print-only",
        action="store_true",
        help="Resolve hashes/metrics only; no RPC and no wallet (no ARAH_PRIVATE_KEY).",
    )
    args = p.parse_args()

    key = os.environ.get("ARAH_PRIVATE_KEY")

    if args.code_file:
        code_hash = hash_file_bytes32(args.code_file.resolve())
    elif args.code_hash:
        code_hash = assert_bytes32(args.code_hash, "codeHash")
    else:
        p.error("provide --code-file or --code-hash")

    if args.benchmark_log_file:
        bench_hash = hash_file_bytes32(args.benchmark_log_file.resolve())
    elif args.benchmark_log_hash:
        bench_hash = assert_bytes32(args.benchmark_log_hash, "benchmarkLogHash")
    else:
        p.error("provide --benchmark-log-file or --benchmark-log-hash")

    if args.claimed_score_int256 is not None:
        claimed = parse_int256(args.claimed_score_int256)
    elif args.claimed_metric is not None:
        claimed = decimal_metric_to_scaled_int(args.claimed_metric, args.metric_scale)
    else:
        p.error("provide --claimed-score-int256 or --claimed-metric")

    stake = parse_uint256(args.stake)
    reward = Web3.to_checksum_address(args.reward_recipient)
    buy_wei = parse_uint256(args.buy_value_wei)

    if args.print_only:
        print(
            json.dumps(
                {
                    "projectId": args.project_id,
                    "codeHash": code_hash,
                    "benchmarkLogHash": bench_hash,
                    "claimedAggregateScore": str(claimed),
                    "stake": str(stake),
                    "rewardRecipient": reward,
                    "buyValueWei": str(buy_wei),
                },
                indent=2,
            )
        )
        return 0

    if not key:
        print("ARAH_PRIVATE_KEY is required (or use --print-only)", file=sys.stderr)
        return 1

    account = Account.from_key(key)
    owner = account.address

    deployment, deployment_path = load_deployment()
    dep_dir = deployment_path.parent
    rpc = chain_rpc_url(deployment)
    cid = chain_id(deployment)
    registry_addr = project_registry_address(deployment)
    ledger_addr = proposal_ledger_address(deployment)

    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        print(f"RPC connect failed: {rpc}", file=sys.stderr)
        return 1

    reg_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProjectRegistry"]["artifact"])
    ledger_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProposalLedger"]["artifact"])
    token_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProjectToken"]["artifact"])

    registry = w3.eth.contract(address=Web3.to_checksum_address(registry_addr), abi=reg_abi)
    ledger = w3.eth.contract(address=Web3.to_checksum_address(ledger_addr), abi=ledger_abi)

    token_addr = registry.functions.tokenOf(args.project_id).call()
    token = w3.eth.contract(address=Web3.to_checksum_address(token_addr), abi=token_abi)

    nonce = w3.eth.get_transaction_count(owner)
    balance = token.functions.balanceOf(owner).call()
    if balance < stake and not args.skip_buy:
        if buy_wei <= 0:
            print(
                f"token balance {balance} < stake {stake}; pass --buy-value-wei or --skip-buy",
                file=sys.stderr,
            )
            return 1
        buy_tx = token.functions.buy().build_transaction(
            {
                "from": owner,
                "value": buy_wei,
                "nonce": nonce,
                "chainId": cid,
            }
        )
        print("buy() …")
        send_or_dump(w3, account, buy_tx, args.dry_run)
        nonce = nonce + 1 if args.dry_run else w3.eth.get_transaction_count(owner)

    balance2 = token.functions.balanceOf(owner).call()
    if balance2 < stake and not args.dry_run:
        print(f"token balance {balance2} still < stake {stake}", file=sys.stderr)
        return 1

    approve_tx = token.functions.approve(Web3.to_checksum_address(ledger_addr), stake).build_transaction(
        {"from": owner, "nonce": nonce, "chainId": cid}
    )
    print("approve(ProposalLedger, stake) …")
    send_or_dump(w3, account, approve_tx, args.dry_run)
    nonce = nonce + 1 if args.dry_run else w3.eth.get_transaction_count(owner)
    submit_tx = ledger.functions.submit(
        args.project_id,
        Web3.to_bytes(hexstr=code_hash),
        Web3.to_bytes(hexstr=bench_hash),
        claimed,
        stake,
        reward,
    ).build_transaction({"from": owner, "nonce": nonce, "chainId": cid})
    print("submit(…) …")
    receipt = send_or_dump(w3, account, submit_tx, args.dry_run)
    if receipt is not None:
        print(
            json.dumps(
                {"status": receipt.status, "transactionHash": receipt.transactionHash.hex()},
                indent=2,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
