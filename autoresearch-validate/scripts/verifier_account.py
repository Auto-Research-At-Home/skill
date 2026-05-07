"""Verifier-side wallet loader.

Reads a passphrase-encrypted keystore via wallet.py instead of pulling the
private key from ARAH_PRIVATE_KEY. All five settlement scripts (claim/approve/
reject/release/expire) share this helper so a verifier configures their wallet
in exactly one place.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from wallet import decrypt_account, read_passphrase  # noqa: E402


def add_wallet_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--wallet-id", required=True, help="Verifier wallet keystore id (scripts/wallet.py).")
    p.add_argument("--passphrase-file", help="Path to a file with the wallet passphrase (or set ARAH_WALLET_PASSPHRASE).")


def load_account(args: argparse.Namespace) -> Any:
    passphrase = read_passphrase(args)
    try:
        return decrypt_account(args.wallet_id, passphrase)
    finally:
        # Best-effort scrub the local string reference.
        passphrase = "\x00" * len(passphrase)
        del passphrase


def legacy_private_key_warning() -> None:
    if os.environ.get("ARAH_PRIVATE_KEY"):
        print(
            "warning: ARAH_PRIVATE_KEY is set but ignored. Migrate to a keystore "
            "with `python3 scripts/wallet.py init --id <id>`.",
            file=sys.stderr,
        )
