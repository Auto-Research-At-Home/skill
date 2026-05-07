#!/usr/bin/env python3
"""Mining-wallet manager: passphrase-encrypted keystore + sign-only entrypoint.

Subcommands:
  init         Generate a fresh secp256k1 key, encrypt to ~/.autoresearch/wallets/<id>.json
  address      Print the EVM address for a stored wallet (no decryption needed)
  status       Native + ProjectToken balance, allowance, gas readiness
  sign         Read an unsigned tx from stdin (JSON), output a signed raw tx (hex)
  send         sign + broadcast (used internally by submit_proposal.py)
  delete       Remove the keystore file

The decrypted private key only exists during the lifetime of `sign` / `send`
and never leaves this module. Other scripts (submit_proposal, check_wallet,
…) build unsigned transactions and shell out to `wallet.py sign|send`. They
do not read ARAH_PRIVATE_KEY anywhere.

Passphrase resolution (in order):
  --passphrase-file <path>   read first line, strip newline
  ARAH_WALLET_PASSPHRASE     env var (note: still in process env, prefer file)
  interactive prompt (TTY only)
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import secrets
import stat
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

DEFAULT_WALLET_HOME = Path(os.environ.get("ARAH_WALLET_HOME", "~/.autoresearch/wallets")).expanduser()


def _load_eth() -> tuple[Any, Any]:
    try:
        from eth_account import Account
        from web3 import Web3
    except ImportError as e:
        print("Install chain extras: pip install -r requirements-chain.txt", file=sys.stderr)
        raise SystemExit(1) from e
    return Account, Web3


def keystore_path(wallet_id: str) -> Path:
    if not wallet_id or "/" in wallet_id or ".." in wallet_id:
        raise ValueError(f"invalid wallet id: {wallet_id!r}")
    return DEFAULT_WALLET_HOME / f"{wallet_id}.json"


def read_passphrase(args: argparse.Namespace, *, confirm: bool = False) -> str:
    if getattr(args, "passphrase_file", None):
        text = Path(args.passphrase_file).expanduser().read_text(encoding="utf-8")
        passphrase = text.split("\n", 1)[0].rstrip("\r")
        if not passphrase:
            raise ValueError(f"--passphrase-file is empty: {args.passphrase_file}")
        return passphrase
    env = os.environ.get("ARAH_WALLET_PASSPHRASE")
    if env is not None:
        if not env:
            raise ValueError("ARAH_WALLET_PASSPHRASE is empty")
        return env
    if not sys.stdin.isatty():
        raise ValueError(
            "no passphrase available: pass --passphrase-file, set ARAH_WALLET_PASSPHRASE, "
            "or run from a TTY",
        )
    p1 = getpass.getpass("Wallet passphrase: ")
    if not p1:
        raise ValueError("empty passphrase")
    if confirm:
        p2 = getpass.getpass("Confirm passphrase: ")
        if p1 != p2:
            raise ValueError("passphrases do not match")
    return p1


def load_keystore(wallet_id: str) -> dict[str, Any]:
    path = keystore_path(wallet_id)
    if not path.is_file():
        raise FileNotFoundError(f"keystore not found: {path}. Run `wallet.py init --id {wallet_id}` first.")
    return json.loads(path.read_text(encoding="utf-8"))


def write_keystore(wallet_id: str, encrypted: dict[str, Any]) -> Path:
    DEFAULT_WALLET_HOME.mkdir(parents=True, exist_ok=True)
    os.chmod(DEFAULT_WALLET_HOME, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
    path = keystore_path(wallet_id)
    if path.exists():
        raise FileExistsError(f"keystore already exists: {path}. Delete it first if you really mean to replace it.")
    tmp = path.with_suffix(".json.partial")
    tmp.write_text(json.dumps(encrypted), encoding="utf-8")
    os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)
    tmp.rename(path)
    return path


def decrypt_account(wallet_id: str, passphrase: str):
    Account, _ = _load_eth()
    encrypted = load_keystore(wallet_id)
    key = Account.decrypt(encrypted, passphrase)
    return Account.from_key(key)


def cmd_init(args: argparse.Namespace) -> int:
    Account, Web3 = _load_eth()
    passphrase = read_passphrase(args, confirm=True)
    raw = secrets.token_bytes(32)
    account = Account.from_key(raw)
    encrypted = Account.encrypt(account.key, passphrase, iterations=args.kdf_iterations)
    path = write_keystore(args.id, encrypted)
    # Zero local references defensively.
    raw = b"\x00" * 32
    del raw
    print(json.dumps({"wallet_id": args.id, "address": account.address, "keystore": str(path)}, indent=2))
    return 0


def cmd_address(args: argparse.Namespace) -> int:
    encrypted = load_keystore(args.id)
    addr = encrypted.get("address")
    if not addr:
        return 1
    print("0x" + addr if not addr.startswith("0x") else addr)
    return 0


def cmd_delete(args: argparse.Namespace) -> int:
    path = keystore_path(args.id)
    if not path.exists():
        print(f"no keystore at {path}", file=sys.stderr)
        return 0
    if not args.yes:
        print(f"refusing to delete {path} without --yes", file=sys.stderr)
        return 1
    path.unlink()
    print(str(path))
    return 0


def _build_web3():
    from chain_config import (  # noqa: E402  (dynamic deps)
        chain_id,
        chain_rpc_url,
        load_deployment,
    )

    _, Web3 = _load_eth()
    deployment, _ = load_deployment()
    rpc = chain_rpc_url(deployment)
    cid = chain_id(deployment)
    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        raise RuntimeError(f"RPC connect failed: {rpc}")
    return w3, cid


def cmd_status(args: argparse.Namespace) -> int:
    encrypted = load_keystore(args.id)
    addr_hex = encrypted.get("address")
    if not addr_hex:
        return 1
    address = ("0x" + addr_hex) if not addr_hex.startswith("0x") else addr_hex
    try:
        w3, cid = _build_web3()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    native = int(w3.eth.get_balance(address))
    print(json.dumps({"wallet_id": args.id, "address": address, "chainId": cid, "nativeBalanceWei": str(native)}, indent=2))
    return 0


def _read_unsigned_tx(args: argparse.Namespace) -> dict[str, Any]:
    if args.tx_file:
        text = Path(args.tx_file).expanduser().read_text(encoding="utf-8")
    else:
        text = sys.stdin.read()
    if not text.strip():
        raise ValueError("no unsigned tx on stdin / --tx-file")
    tx = json.loads(text)
    if not isinstance(tx, dict):
        raise ValueError("unsigned tx must be a JSON object")
    return tx


def _normalize_tx(tx: dict[str, Any]) -> dict[str, Any]:
    """Coerce hex-string fields to integers as web3 expects when signing."""
    out = dict(tx)
    for k in ("value", "nonce", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas", "chainId", "type"):
        v = out.get(k)
        if isinstance(v, str):
            out[k] = int(v, 0) if v.startswith(("0x", "0X")) else int(v)
    return out


def cmd_sign(args: argparse.Namespace) -> int:
    Account, _ = _load_eth()
    passphrase = read_passphrase(args)
    account = decrypt_account(args.id, passphrase)
    tx = _normalize_tx(_read_unsigned_tx(args))
    signed = account.sign_transaction(tx)
    raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
    print(json.dumps({"signedRawTransaction": "0x" + raw.hex(), "from": account.address}, indent=2))
    # eth_account holds the key in the Account object's `_key_obj`; we drop our reference here.
    del account
    return 0


def cmd_send(args: argparse.Namespace) -> int:
    """sign + send, returning a tx receipt summary."""
    Account, Web3 = _load_eth()
    passphrase = read_passphrase(args)
    account = decrypt_account(args.id, passphrase)
    try:
        w3, _cid = _build_web3()
        tx = _normalize_tx(_read_unsigned_tx(args))
        if "from" not in tx:
            tx["from"] = account.address
        if "nonce" not in tx:
            tx["nonce"] = w3.eth.get_transaction_count(account.address)
        if "chainId" not in tx:
            tx["chainId"] = int(w3.eth.chain_id)
        if "gas" not in tx:
            tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.2)
        if "maxFeePerGas" not in tx and "gasPrice" not in tx:
            tx["gasPrice"] = w3.eth.gas_price
        signed = account.sign_transaction(tx)
        raw = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
        h = w3.eth.send_raw_transaction(raw)
        if args.no_wait:
            print(json.dumps({"transactionHash": h.hex(), "from": account.address}, indent=2))
            return 0
        receipt = w3.eth.wait_for_transaction_receipt(h, timeout=args.timeout)
        print(
            json.dumps(
                {
                    "status": receipt.status,
                    "transactionHash": receipt.transactionHash.hex(),
                    "from": account.address,
                },
                indent=2,
            )
        )
        return 0 if receipt.status == 1 else 1
    finally:
        del account


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_passphrase(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--passphrase-file", help="Path to a file containing the passphrase on its first line.")

    sp = sub.add_parser("init", help="Generate a new mining wallet")
    sp.add_argument("--id", required=True, help="Local wallet id (e.g. project-42, staging)")
    sp.add_argument("--kdf-iterations", type=int, default=262144)
    add_passphrase(sp)
    sp.set_defaults(func=cmd_init)

    sp = sub.add_parser("address", help="Print the wallet address (no passphrase needed)")
    sp.add_argument("--id", required=True)
    sp.set_defaults(func=cmd_address)

    sp = sub.add_parser("status", help="On-chain native balance for the wallet")
    sp.add_argument("--id", required=True)
    sp.set_defaults(func=cmd_status)

    sp = sub.add_parser("sign", help="Sign an unsigned transaction (JSON on stdin or --tx-file)")
    sp.add_argument("--id", required=True)
    sp.add_argument("--tx-file", help="Path to a JSON file with the unsigned tx. If omitted, reads stdin.")
    add_passphrase(sp)
    sp.set_defaults(func=cmd_sign)

    sp = sub.add_parser("send", help="Sign + broadcast an unsigned tx, optionally wait for receipt")
    sp.add_argument("--id", required=True)
    sp.add_argument("--tx-file")
    sp.add_argument("--no-wait", action="store_true")
    sp.add_argument("--timeout", type=int, default=180)
    add_passphrase(sp)
    sp.set_defaults(func=cmd_send)

    sp = sub.add_parser("delete", help="Delete a wallet keystore (requires --yes)")
    sp.add_argument("--id", required=True)
    sp.add_argument("--yes", action="store_true")
    sp.set_defaults(func=cmd_delete)

    args = p.parse_args()
    try:
        return args.func(args)
    except (FileNotFoundError, FileExistsError, ValueError, RuntimeError) as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
