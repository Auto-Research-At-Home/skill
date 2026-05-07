#!/usr/bin/env python3
"""Bootstrap mining inputs from ProjectRegistry by project id or project token."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
MINE_ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from chain_config import (  # noqa: E402
    chain_id,
    chain_rpc_url,
    load_contract_abi,
    load_deployment,
    project_registry_address,
)

PROJECT_FIELDS = (
    "protocolHash",
    "repoSnapshotHash",
    "benchmarkHash",
    "baselineAggregateScore",
    "baselineMetricsHash",
    "currentBestCodeHash",
    "currentBestAggregateScore",
    "currentBestMetricsHash",
    "currentBestMiner",
    "token",
    "creator",
    "createdAt",
)


def bytes32_to_hex(value: Any) -> str:
    if isinstance(value, bytes):
        return "0x" + value.hex()
    return str(value)


def normalize_project(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        data = {k: raw[k] for k in PROJECT_FIELDS}
    else:
        data = dict(zip(PROJECT_FIELDS, raw, strict=True))
    out: dict[str, Any] = {}
    for k, v in data.items():
        if k.endswith("Hash"):
            out[k] = bytes32_to_hex(v)
        elif k in ("baselineAggregateScore", "currentBestAggregateScore", "createdAt"):
            out[k] = int(v)
        else:
            out[k] = str(v)
    return out


def build_registry_contract():
    try:
        from web3 import Web3
    except ImportError as e:
        raise RuntimeError("Install chain extras: pip install -r requirements-chain.txt") from e

    deployment, deployment_path = load_deployment()
    dep_dir = deployment_path.parent
    rpc = chain_rpc_url(deployment)
    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        raise RuntimeError(f"failed to connect to RPC: {rpc}")
    registry_addr = project_registry_address(deployment)
    reg_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProjectRegistry"]["artifact"])
    registry = w3.eth.contract(address=Web3.to_checksum_address(registry_addr), abi=reg_abi)
    return deployment, rpc, registry_addr, w3, registry


def resolve_project_id(registry: Any, w3: Any, project_id: int | None, token_address: str | None) -> int:
    if project_id is not None:
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


def scaled_int_to_float(value: int, scale: int) -> float:
    return float(value) / float(scale)


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def safe_extract_tar(tar_path: Path, dest: Path) -> None:
    """Extract `tar_path` into `dest` with hardening against path traversal,
    symlink/hardlink escapes, device files, and other dangerous member types.

    Prefers the Python 3.12+ `filter='data'` extraction filter, which rejects
    everything that isn't a regular file / dir / safe-target symlink. Falls
    back to a manual path check for older interpreters.
    """
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path) as tf:
        dest_resolved = dest.resolve()
        # Defense in depth: still walk members and reject obvious escapes
        # before letting the filter do its own pass.
        for member in tf.getmembers():
            if member.isdev() or member.ischr() or member.isblk() or member.isfifo():
                raise RuntimeError(f"refusing dangerous tar member type: {member.name}")
            target = (dest / member.name).resolve()
            if target != dest_resolved and dest_resolved not in target.parents:
                raise RuntimeError(f"unsafe tar member path: {member.name}")
            if member.islnk() or member.issym():
                link_target = (dest / member.name).parent / member.linkname
                link_resolved = link_target.resolve()
                if link_resolved != dest_resolved and dest_resolved not in link_resolved.parents:
                    raise RuntimeError(f"unsafe tar link target: {member.name} -> {member.linkname}")
        try:
            tf.extractall(dest, filter="data")  # type: ignore[call-arg]
        except TypeError:
            # Python < 3.12 — manual check above is the only line of defense.
            tf.extractall(dest)


def find_repo_root(extract_dir: Path) -> Path:
    if (extract_dir / ".git").is_dir():
        return extract_dir
    candidates = [p for p in extract_dir.rglob(".git") if p.is_dir()]
    if candidates:
        return candidates[0].parent
    dirs = [p for p in extract_dir.iterdir() if p.is_dir()]
    if len(dirs) == 1:
        return dirs[0]
    return extract_dir


def run(cmd: list[str], cwd: Path | None = None) -> None:
    subprocess.run(cmd, cwd=str(cwd) if cwd else None, check=True)


def download_artifacts(args: argparse.Namespace, project: dict[str, Any], artifacts_dir: Path) -> None:
    script = SCRIPT_DIR / "download_0g_artifacts.mjs"
    cmd = [
        "node",
        str(script),
        "--output-dir",
        str(artifacts_dir),
        "--protocol-root",
        project["protocolHash"],
        "--repo-snapshot-root",
        project["repoSnapshotHash"],
        "--benchmark-root",
        project["benchmarkHash"],
        "--baseline-metrics-root",
        project["baselineMetricsHash"],
        "--indexer-rpc",
        args.indexer_rpc,
    ]
    if args.skip_existing:
        cmd.append("--skip-existing")
    if args.no_proof:
        cmd.append("--no-proof")
    run(cmd, cwd=MINE_ROOT)


def init_workspace(repo_root: Path) -> None:
    run([str(SCRIPT_DIR / "init_mine_workspace.sh"), str(repo_root)])


def write_network_state(
    *,
    output: Path,
    protocol: dict[str, Any],
    project_id: int,
    chain: int,
    registry_addr: str,
    best_score: int,
    metric_scale: int,
) -> None:
    state = {
        "schemaVersion": "1",
        "source": "registry",
        "protocolBundleId": protocol["meta"]["protocolBundleId"],
        "project_id": project_id,
        "chain_id": chain,
        "project_registry": registry_addr,
        "network_best_metric": scaled_int_to_float(best_score, metric_scale),
        "aggregate_score_int256": str(best_score),
        "metric_scale": metric_scale,
        "metric_name": protocol["measurement"]["primaryMetric"]["name"],
        "direction": protocol["measurement"]["primaryMetric"]["direction"],
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    write_json(output, state)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Resolve a ProjectRegistry project by project id or token address, optionally "
            "download 0G Storage artifacts, unpack the repo snapshot, and initialize mining."
        ),
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--project-id", type=int)
    source.add_argument("--token-address")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument(
        "--indexer-rpc",
        default=os.environ.get("ZG_STORAGE_INDEXER_RPC", "https://indexer-storage-testnet-turbo.0g.ai"),
    )
    parser.add_argument(
        "--metric-scale",
        type=int,
        default=int(os.environ.get("ARAH_METRIC_SCALE", "1000000")),
    )
    parser.add_argument("--download-artifacts", action="store_true")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--no-proof", action="store_true")
    parser.add_argument(
        "--repo-root",
        type=Path,
        help="Existing repo checkout to initialize when --download-artifacts is not used.",
    )
    parser.add_argument(
        "--protocol-json",
        type=Path,
        help="Existing protocol.json to use when --download-artifacts is not used.",
    )
    parser.add_argument(
        "--no-init",
        action="store_true",
        help="Resolve/download only; do not initialize .autoresearch/mine.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    out_dir = args.output_dir.expanduser().resolve()
    artifacts_dir = out_dir / "artifacts"
    repo_extract_dir = out_dir / "repo"
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        deployment, rpc, registry_addr, w3, registry = build_registry_contract()
        project_id = resolve_project_id(registry, w3, args.project_id, args.token_address)
        project = normalize_project(registry.functions.getProject(project_id).call())
        best_raw = int(registry.functions.currentBestAggregateScore(project_id).call())

        chain = chain_id(deployment)
        record = {
            "projectId": project_id,
            "tokenAddress": w3.to_checksum_address(project["token"]),
            "projectRegistry": registry_addr,
            "chainId": chain,
            "rpcUrl": rpc,
            "project": project,
        }
        write_json(out_dir / "registry_project.json", record)

        if args.download_artifacts:
            download_artifacts(args, project, artifacts_dir)
            protocol_path = artifacts_dir / "protocol.json"
            repo_tar = artifacts_dir / "repo-snapshot.tar"
            if repo_extract_dir.exists() and not args.skip_existing:
                shutil.rmtree(repo_extract_dir)
            if not repo_extract_dir.exists():
                safe_extract_tar(repo_tar, repo_extract_dir)
            repo_root = find_repo_root(repo_extract_dir)
        else:
            if not args.protocol_json or not args.repo_root:
                raise ValueError(
                    "--protocol-json and --repo-root are required unless --download-artifacts is set",
                )
            protocol_path = args.protocol_json.expanduser().resolve()
            repo_root = args.repo_root.expanduser().resolve()

        protocol = json.loads(protocol_path.read_text(encoding="utf-8"))
        if not args.no_init:
            init_workspace(repo_root)
            write_network_state(
                output=repo_root / ".autoresearch" / "mine" / "network_state.json",
                protocol=protocol,
                project_id=project_id,
                chain=chain,
                registry_addr=registry_addr,
                best_score=best_raw,
                metric_scale=args.metric_scale,
            )

        result = {
            "projectId": project_id,
            "tokenAddress": w3.to_checksum_address(project["token"]),
            "protocolJson": str(protocol_path.resolve()),
            "repoRoot": str(repo_root.resolve()),
            "trialsJsonl": str((repo_root / ".autoresearch" / "mine" / "trials.jsonl").resolve()),
            "networkState": str((repo_root / ".autoresearch" / "mine" / "network_state.json").resolve()),
            "registryProject": str((out_dir / "registry_project.json").resolve()),
        }
        write_json(out_dir / "bootstrap_result.json", result)
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError, json.JSONDecodeError, tarfile.TarError) as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
