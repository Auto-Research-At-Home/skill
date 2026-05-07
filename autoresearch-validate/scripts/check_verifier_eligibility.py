#!/usr/bin/env python3
"""Query VerifierRegistry.isVerifier(address). Exit 0 if true."""
from __future__ import annotations

import argparse
import json
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
from wallet import keystore_path  # noqa: E402

try:
    from web3 import Web3
except ImportError:
    print("Install chain extras: python3 -m pip install -r requirements-chain.txt", file=sys.stderr)
    raise SystemExit(1)


def address_from_keystore(wallet_id: str) -> str:
    path = keystore_path(wallet_id)
    if not path.is_file():
        raise FileNotFoundError(f"keystore not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    addr = data.get("address")
    if not addr:
        raise ValueError(f"keystore at {path} has no address field")
    return ("0x" + addr) if not str(addr).startswith("0x") else str(addr)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--address", help="Verifier address (default: read from --wallet-id keystore).")
    p.add_argument("--wallet-id", help="Verifier wallet keystore id (scripts/wallet.py).")
    args = p.parse_args()

    deployment, deployment_path = load_deployment()
    dep_dir = deployment_dir(deployment_path)
    rpc = chain_rpc_url(deployment)
    cid = chain_id(deployment)
    vr_addr = verifier_registry_address(deployment)

    if args.address:
        addr = args.address
    elif args.wallet_id:
        try:
            addr = address_from_keystore(args.wallet_id)
        except (FileNotFoundError, ValueError) as e:
            print(str(e), file=sys.stderr)
            return 1
    else:
        print("Provide --address or --wallet-id", file=sys.stderr)
        return 1

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
