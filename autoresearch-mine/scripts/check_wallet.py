#!/usr/bin/env python3
"""Preflight a mining wallet (keystore) for 0G Galileo mining.

Reads the wallet address from a passphrase-encrypted keystore (no decryption
needed for status checks). To sign txs later, scripts call `wallet.py send`
with the same `--wallet-id` and the passphrase.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from chain_config import (  # noqa: E402
    chain_id,
    chain_rpc_url,
    load_contract_abi,
    load_deployment,
    project_registry_address,
    proposal_ledger_address,
)
from env_utils import env_or_default_stake, load_dotenv_from_cwd, missing_wallet_message  # noqa: E402
from wallet import keystore_path  # noqa: E402


def parse_uint256(text: str | None) -> int | None:
    if text is None:
        return None
    n = int(text, 0) if text.startswith("0x") else int(text)
    if n < 0:
        raise ValueError("unsigned integer required")
    return n


def load_chain_deps() -> Any:
    try:
        from web3 import Web3
    except ImportError as e:
        print("Install chain extras: pip install -r requirements-chain.txt", file=sys.stderr)
        raise SystemExit(1) from e
    return Web3


def resolve_project_id(registry: Any, w3: Any, project_id: int | None, token_address: str | None) -> int | None:
    if project_id is not None:
        return project_id
    if not token_address:
        return None
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


def load_keystore_address(wallet_id: str) -> str:
    path = keystore_path(wallet_id)
    if not path.is_file():
        raise FileNotFoundError(missing_wallet_message(wallet_id))
    data = json.loads(path.read_text(encoding="utf-8"))
    addr = data.get("address")
    if not addr:
        raise ValueError(f"keystore at {path} has no address field")
    return ("0x" + addr) if not str(addr).startswith("0x") else str(addr)


def main() -> int:
    load_dotenv_from_cwd()

    p = argparse.ArgumentParser(description="Check the mining wallet (RPC, balances, allowance, stake readiness).")
    p.add_argument("--wallet-id", required=True, help="Local keystore id (created by `wallet.py init --id ...`)")
    p.add_argument("--project-id", type=int)
    p.add_argument("--token-address")
    p.add_argument(
        "--stake",
        default=env_or_default_stake(),
        help="Required ProjectToken stake in WHOLE tokens (decimals==0). Defaults to ARAH_STAKE or 1.",
    )
    p.add_argument(
        "--buy-slippage-bps",
        type=int,
        default=100,
        help="Margin to add to the missing-token quote for readiness reporting.",
    )
    args = p.parse_args()

    if args.buy_slippage_bps < 0:
        p.error("--buy-slippage-bps must be >= 0")

    try:
        owner = load_keystore_address(args.wallet_id)
    except (FileNotFoundError, ValueError) as e:
        print(str(e), file=sys.stderr)
        return 1

    try:
        stake = parse_uint256(args.stake)
    except ValueError as e:
        print(str(e), file=sys.stderr)
        return 1

    try:
        Web3 = load_chain_deps()
        deployment, deployment_path = load_deployment()
        dep_dir = deployment_path.parent
        rpc = chain_rpc_url(deployment)
        cid = chain_id(deployment)
        registry_addr = project_registry_address(deployment)
        ledger_addr = proposal_ledger_address(deployment)

        w3 = Web3(Web3.HTTPProvider(rpc))
        if not w3.is_connected():
            raise RuntimeError(f"RPC connect failed: {rpc}")
        owner = Web3.to_checksum_address(owner)

        reg_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProjectRegistry"]["artifact"])
        token_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProjectToken"]["artifact"])
        registry = w3.eth.contract(address=Web3.to_checksum_address(registry_addr), abi=reg_abi)

        project_id = resolve_project_id(registry, w3, args.project_id, args.token_address)
        token_addr = None
        token_balance = None
        allowance = None
        missing_stake = None
        auto_buy_quote_wei = None
        auto_buy_value_wei = None

        if project_id is not None:
            token_addr = w3.to_checksum_address(registry.functions.tokenOf(project_id).call())
        elif args.token_address:
            token_addr = w3.to_checksum_address(args.token_address)

        if token_addr:
            token = w3.eth.contract(address=token_addr, abi=token_abi)
            token_balance = int(token.functions.balanceOf(owner).call())
            allowance = int(token.functions.allowance(owner, Web3.to_checksum_address(ledger_addr)).call())
            if stake is not None:
                missing_stake = max(0, stake - token_balance)
                if missing_stake:
                    total_supply = int(token.functions.totalSupply().call())
                    auto_buy_quote_wei = int(
                        token.functions.costBetween(total_supply, total_supply + missing_stake).call()
                    )
                    auto_buy_value_wei = auto_buy_quote_wei + (
                        auto_buy_quote_wei * args.buy_slippage_bps // 10_000
                    )

        native_balance = int(w3.eth.get_balance(owner))
        can_auto_buy = (
            auto_buy_value_wei is not None
            and native_balance > auto_buy_value_wei
        )
        stake_covered = True
        needs_approval = False
        if stake is not None and token_addr:
            stake_covered = (token_balance or 0) >= stake or can_auto_buy
            needs_approval = (allowance or 0) < stake
        ready = native_balance > 0 and stake_covered

        print(
            json.dumps(
                {
                    "ready": ready,
                    "walletId": args.wallet_id,
                    "wallet": owner,
                    "chainId": cid,
                    "rpcUrl": rpc,
                    "nativeBalanceWei": str(native_balance),
                    "projectId": project_id,
                    "tokenAddress": token_addr,
                    "proposalLedger": Web3.to_checksum_address(ledger_addr),
                    "stake": str(stake) if stake is not None else None,
                    "tokenBalance": str(token_balance) if token_balance is not None else None,
                    "allowance": str(allowance) if allowance is not None else None,
                    "needsApproval": needs_approval,
                    "missingStake": str(missing_stake) if missing_stake is not None else None,
                    "autoBuyQuoteWei": str(auto_buy_quote_wei) if auto_buy_quote_wei is not None else None,
                    "autoBuyValueWei": str(auto_buy_value_wei) if auto_buy_value_wei is not None else None,
                    "canAutoBuyMissingStake": can_auto_buy,
                },
                indent=2,
            )
        )
        return 0 if ready or can_auto_buy else 1
    except (OSError, ValueError, RuntimeError) as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
