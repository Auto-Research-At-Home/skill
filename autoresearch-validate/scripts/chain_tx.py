"""Shared transaction send helpers for chain scripts."""

from __future__ import annotations

import json
from typing import Any

from web3 import Web3


def tx_summary(tx: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in tx.items():
        if hasattr(v, "hex"):
            out[k] = v.hex()
        elif isinstance(v, bytes):
            out[k] = "0x" + v.hex()
        else:
            out[k] = v
    return out


def send_or_dump(w3: Web3, account: Any, tx: dict[str, Any], dry_run: bool) -> Any:
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
