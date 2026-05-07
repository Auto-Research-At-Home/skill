#!/usr/bin/env python3
"""Submit a mining proposal: resolve project token → optional buy → approve → ProposalLedger.submit.

Signing is done via the keystore-backed mining wallet (scripts/wallet.py).
This script never reads ARAH_PRIVATE_KEY from env or .env files.
"""

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

from bonding_curve import cost_between
from chain_config import (
    chain_id,
    chain_rpc_url,
    load_contract_abi,
    load_deployment,
    project_registry_address,
    proposal_ledger_address,
)
from env_utils import env_or_default_stake, load_dotenv_from_cwd
from wallet import decrypt_account, read_passphrase

# Flat native-gas reserve for buy() + approve() + submit() on Galileo.
GAS_RESERVE_WEI = 5 * 10**15  # 0.005 OG


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


def parse_budget_wei(text: str) -> int:
    s = text.strip().lower().replace(" ", "")
    if not s:
        raise ValueError("empty budget")
    if s.endswith("og"):
        amount = s[:-2]
        whole, frac = (amount.split(".", 1) + [""])[:2] if "." in amount else (amount, "")
        whole_int = int(whole) if whole else 0
        frac = frac[:18].ljust(18, "0")
        return whole_int * 10**18 + int(frac or "0")
    if s.endswith("wei"):
        return int(s[:-3])
    if s.startswith("0x"):
        return int(s, 16)
    return int(s)


def format_og(wei: int, places: int = 6) -> str:
    sign = "-" if wei < 0 else ""
    n = abs(wei)
    whole, frac = divmod(n, 10**18)
    frac_str = f"{frac:018d}"[:places].rstrip("0")
    return f"{sign}{whole}.{frac_str}" if frac_str else f"{sign}{whole}"


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


def load_chain_deps() -> Any:
    try:
        from web3 import Web3
    except ImportError as e:
        print("Install chain extras: pip install -r requirements-chain.txt", file=sys.stderr)
        raise SystemExit(1) from e
    return Web3


def send_or_dump(w3: Any, account: Any, tx: dict[str, Any], dry_run: bool) -> Any:
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


def resolve_project_id(registry: Any, w3: Any, project_id: int | None, token_address: str | None) -> int:
    if project_id is not None:
        if token_address:
            expected = w3.to_checksum_address(token_address)
            actual = w3.to_checksum_address(registry.functions.tokenOf(project_id).call())
            if actual != expected:
                raise ValueError(f"--project-id token {actual} does not match --token-address {expected}")
        return project_id
    if not token_address:
        raise ValueError("provide --project-id or --token-address")

    target = w3.to_checksum_address(token_address)
    next_project_id = int(registry.functions.nextProjectId().call())
    for candidate in range(next_project_id):
        try:
            token = registry.functions.tokenOf(candidate).call()
        except Exception:
            continue
        if token and w3.to_checksum_address(token) == target:
            return candidate
    raise ValueError(f"token address not found in ProjectRegistry: {token_address}")


def main() -> int:
    load_dotenv_from_cwd()

    p = argparse.ArgumentParser(description="Submit ProposalLedger.submit for a project (0G Galileo).")
    p.add_argument("--wallet-id", help="Mining wallet keystore id (required unless --print-only).")
    p.add_argument("--passphrase-file", help="Path to a file containing the wallet passphrase (or set ARAH_WALLET_PASSPHRASE).")
    p.add_argument("--project-id", type=int)
    p.add_argument("--token-address", type=str)
    p.add_argument("--code-hash", type=str)
    p.add_argument("--code-file", type=Path)
    p.add_argument("--benchmark-log-hash", type=str)
    p.add_argument("--benchmark-log-file", type=Path)
    p.add_argument("--claimed-score-int256", type=str)
    p.add_argument("--claimed-metric", type=str)
    p.add_argument("--metric-scale", type=int, default=int(os.environ.get("ARAH_METRIC_SCALE", "1000000")))
    p.add_argument("--stake", type=str, default=env_or_default_stake())
    p.add_argument("--reward-recipient", type=str, required=True)
    p.add_argument("--buy-value-wei", type=str, default="0")
    p.add_argument("--auto-buy", action="store_true")
    p.add_argument("--budget", type=str, default=None)
    p.add_argument("--buy-slippage-bps", type=int, default=100)
    p.add_argument("--skip-buy", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--print-only", action="store_true",
                   help="Resolve hashes/metrics only; no RPC and no wallet.")
    args = p.parse_args()

    if args.project_id is None and not args.token_address:
        p.error("provide --project-id or --token-address")
    if args.buy_slippage_bps < 0:
        p.error("--buy-slippage-bps must be >= 0")

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
    buy_wei = parse_uint256(args.buy_value_wei)

    if args.print_only:
        if args.project_id is None:
            p.error("--print-only with --token-address cannot resolve project id without RPC; provide --project-id")
        print(
            json.dumps(
                {
                    "projectId": args.project_id,
                    "tokenAddress": args.token_address,
                    "codeHash": code_hash,
                    "benchmarkLogHash": bench_hash,
                    "claimedAggregateScore": str(claimed),
                    "stake": str(stake),
                    "rewardRecipient": args.reward_recipient,
                    "buyValueWei": str(buy_wei),
                },
                indent=2,
            )
        )
        return 0

    if not args.wallet_id:
        p.error("--wallet-id is required (use scripts/wallet.py init --id <id>)")

    try:
        passphrase = read_passphrase(args)
        account = decrypt_account(args.wallet_id, passphrase)
        owner = account.address
        passphrase = "\x00" * len(passphrase)
        del passphrase

        Web3 = load_chain_deps()
        reward = Web3.to_checksum_address(args.reward_recipient)

        deployment, deployment_path = load_deployment()
        dep_dir = deployment_path.parent
        rpc = chain_rpc_url(deployment)
        cid = chain_id(deployment)
        registry_addr = project_registry_address(deployment)
        ledger_addr = proposal_ledger_address(deployment)
    except (OSError, ValueError, FileNotFoundError) as e:
        print(str(e), file=sys.stderr)
        return 1

    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        print(f"RPC connect failed: {rpc}", file=sys.stderr)
        return 1

    reg_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProjectRegistry"]["artifact"])
    ledger_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProposalLedger"]["artifact"])
    token_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProjectToken"]["artifact"])

    registry = w3.eth.contract(address=Web3.to_checksum_address(registry_addr), abi=reg_abi)
    ledger = w3.eth.contract(address=Web3.to_checksum_address(ledger_addr), abi=ledger_abi)

    try:
        resolved_project_id = resolve_project_id(registry, w3, args.project_id, args.token_address)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 1

    token_addr = registry.functions.tokenOf(resolved_project_id).call()
    token = w3.eth.contract(address=Web3.to_checksum_address(token_addr), abi=token_abi)

    nonce = w3.eth.get_transaction_count(owner)
    balance = int(token.functions.balanceOf(owner).call())

    decimals = int(token.functions.decimals().call())
    base_price = int(token.functions.basePrice().call())
    slope = int(token.functions.slope().call())
    total_supply = int(token.functions.totalSupply().call())
    print(
        json.dumps(
            {
                "token": token_addr,
                "decimals": decimals,
                "basePrice": str(base_price),
                "slope": str(slope),
                "totalSupply": str(total_supply),
                "ownerTokenBalance": str(balance),
                "stakeTokens": str(stake),
                "wallet": owner,
            },
            indent=2,
        )
    )
    if decimals != 0:
        print(
            f"refusing to size stake: ProjectToken decimals={decimals}, expected 0.",
            file=sys.stderr,
        )
        return 1

    budget_wei = parse_budget_wei(args.budget) if args.budget else None

    if balance < stake and not args.skip_buy:
        if args.auto_buy:
            missing = stake - balance
            quoted_local = cost_between(base_price, slope, total_supply, total_supply + missing)
            quoted_chain = int(token.functions.costBetween(total_supply, total_supply + missing).call())
            if quoted_local != quoted_chain:
                print(
                    f"bonding-curve formula mismatch: local={quoted_local} chain={quoted_chain}",
                    file=sys.stderr,
                )
                return 1
            quoted = quoted_chain
            slippage = quoted * args.buy_slippage_bps // 10_000
            buy_wei = quoted + slippage

            native_balance = int(w3.eth.get_balance(owner))
            available = native_balance - GAS_RESERVE_WEI
            print(
                f"buy preflight: missing {missing} tokens; "
                f"curve cost {format_og(quoted)} OG + slippage {format_og(slippage)} OG "
                f"+ gas reserve {format_og(GAS_RESERVE_WEI)} OG "
                f"= total {format_og(buy_wei + GAS_RESERVE_WEI)} OG; "
                f"wallet has {format_og(native_balance)} OG"
            )
            if buy_wei > available:
                shortfall = buy_wei - available
                print(
                    f"insufficient native balance for --auto-buy: need additional "
                    f"{format_og(shortfall)} OG. Lower --stake or top up the wallet.",
                    file=sys.stderr,
                )
                return 1
            if budget_wei is not None and buy_wei > budget_wei:
                print(
                    f"--auto-buy cost {format_og(buy_wei)} OG exceeds --budget "
                    f"{format_og(budget_wei)} OG; aborting before sending tx.",
                    file=sys.stderr,
                )
                return 1

        if buy_wei <= 0:
            print(
                f"token balance {balance} < stake {stake}; pass --auto-buy, --buy-value-wei, or --skip-buy",
                file=sys.stderr,
            )
            return 1
        buy_tx = token.functions.buy().build_transaction(
            {"from": owner, "value": buy_wei, "nonce": nonce, "chainId": cid}
        )
        print(f"buy() value={format_og(buy_wei)} OG (msg.value={buy_wei} wei) …")
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
        resolved_project_id,
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
