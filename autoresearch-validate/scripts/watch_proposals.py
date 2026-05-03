#!/usr/bin/env python3
"""List proposal ids that are claimable (status in claimable_status_codes)."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from chain_config import (
    chain_rpc_url,
    deployment_dir,
    load_contract_abi,
    load_deployment,
    proposal_ledger_address,
)

try:
    from web3 import Web3
except ImportError:
    print("Install chain extras: python3 -m pip install -r requirements-chain.txt", file=sys.stderr)
    raise SystemExit(1)

STATUS_PATH = Path(__file__).resolve().parent.parent / "constants" / "status_enum.json"


def load_claimable_codes() -> list[int]:
    data = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
    env = os.environ.get("ARAH_CLAIMABLE_STATUS_CODES")
    if env:
        return [int(x.strip()) for x in env.split(",") if x.strip()]
    return [int(x) for x in data["claimable_status_codes"]]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--max-id", type=int, help="Override nextProposalId scan upper bound")
    args = p.parse_args()

    deployment, deployment_path = load_deployment()
    dep_dir = deployment_dir(deployment_path)
    rpc = chain_rpc_url(deployment)
    ledger_addr = proposal_ledger_address(deployment)

    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        print(f"RPC connect failed: {rpc}", file=sys.stderr)
        return 1

    abi = load_contract_abi(dep_dir, deployment["contracts"]["ProposalLedger"]["artifact"])
    ledger = w3.eth.contract(address=Web3.to_checksum_address(ledger_addr), abi=abi)

    nxt = args.max_id if args.max_id is not None else ledger.functions.nextProposalId().call()
    claimable = set(load_claimable_codes())

    for pid in range(nxt):
        prop = ledger.functions.getProposal(pid).call()
        status = prop[-1]
        if status in claimable:
            print(pid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
