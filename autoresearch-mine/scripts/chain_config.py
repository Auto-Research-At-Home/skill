"""Resolve bundled 0G deployment + env overrides (no runtime dependency on autoresearch-create)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

MINE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DEPLOYMENT = MINE_ROOT / "contracts" / "0g-galileo-testnet" / "deployment.json"


def resolve_deployment_path() -> Path:
    env = os.environ.get("ARAH_DEPLOYMENT_JSON")
    if env:
        return Path(env).expanduser().resolve()
    return DEFAULT_DEPLOYMENT


def load_deployment() -> tuple[dict[str, Any], Path]:
    path = resolve_deployment_path()
    with path.open(encoding="utf-8") as f:
        return json.load(f), path


def chain_rpc_url(deployment: dict[str, Any]) -> str:
    return os.environ.get("ARAH_RPC_URL") or deployment["network"]["rpcUrl"]


def chain_id(deployment: dict[str, Any]) -> int:
    return int(os.environ.get("ARAH_CHAIN_ID", deployment["network"]["chainId"]))


def project_registry_address(deployment: dict[str, Any]) -> str:
    return os.environ.get("ARAH_PROJECT_REGISTRY") or deployment["contracts"]["ProjectRegistry"]["address"]


def proposal_ledger_address(deployment: dict[str, Any]) -> str:
    return os.environ.get("ARAH_PROPOSAL_LEDGER") or deployment["contracts"]["ProposalLedger"]["address"]


def artifact_path(deployment_dir: Path, relative: str) -> Path:
    return (deployment_dir / relative).resolve()


def load_contract_abi(deployment_dir: Path, artifact_relative: str) -> list[dict[str, Any]]:
    p = artifact_path(deployment_dir, artifact_relative)
    with p.open(encoding="utf-8") as f:
        return json.load(f)["abi"]
