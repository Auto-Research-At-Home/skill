#!/usr/bin/env python3
"""Query VerifierRegistry.isVerifier(address). Exit 0 if true."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from chain_config import (
    chain_id,
    chain_rpc_url,
    deployment_dir,
    load_contract_abi,
    load_deployment,
    verifier_registry_address,
)

try:
    from eth_account import Account
    from web3 import Web3
except ImportError:
    print("Install chain extras: python3 -m pip install -r requirements-chain.txt", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--address", help="Verifier address (default: derived from ARAH_PRIVATE_KEY)")
    args = p.parse_args()

    deployment, deployment_path = load_deployment()
    dep_dir = deployment_dir(deployment_path)
    rpc = chain_rpc_url(deployment)
    cid = chain_id(deployment)
    vr_addr = verifier_registry_address(deployment)

    if args.address:
        addr = args.address
    else:
        key = os.environ.get("ARAH_PRIVATE_KEY")
        if not key:
            print("Provide --address or ARAH_PRIVATE_KEY", file=sys.stderr)
            return 1
        addr = Account.from_key(key).address

    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        print(f"RPC connect failed: {rpc}", file=sys.stderr)
        return 1

    abi = load_contract_abi(dep_dir, deployment["contracts"]["VerifierRegistry"]["artifact"])
    reg = w3.eth.contract(address=Web3.to_checksum_address(vr_addr), abi=abi)
    ok = reg.functions.isVerifier(Web3.to_checksum_address(addr)).call()
    print(json.dumps({"address": addr, "chainId": cid, "isVerifier": ok}))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
