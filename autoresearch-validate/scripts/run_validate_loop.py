#!/usr/bin/env python3
"""
Unattended verifier driver: resolve artifacts → protocol hash → claim → static gates → harness → approve/reject.

Requires: ARAH_PRIVATE_KEY, exactly one of ARAH_ARTIFACT_INDEX or ARAH_ARTIFACT_INDEX_URL, RPC env from chain_config.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from artifact_resolve import resolve_artifacts
from chain_config import (
    chain_rpc_url,
    deployment_dir,
    load_contract_abi,
    load_deployment,
    project_registry_address,
    proposal_ledger_address,
)
from metric_codec import decimal_metric_to_scaled_int

try:
    from web3 import Web3
except ImportError:
    print("Install chain extras: python3 -m pip install -r requirements-chain.txt", file=sys.stderr)
    raise SystemExit(1)

STATUS_PATH = ROOT / "constants" / "status_enum.json"


def load_claimable() -> set[int]:
    data = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
    env = os.environ.get("ARAH_CLAIMABLE_STATUS_CODES")
    if env:
        return {int(x.strip()) for x in env.split(",") if x.strip()}
    return {int(x) for x in data["claimable_status_codes"]}


def utc_now() -> str:
    return (
        datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    )


def write_evidence(text: str) -> Path:
    p = Path(tempfile.mkstemp(prefix="arah-evidence-", suffix=".txt")[1])
    p.write_text(text, encoding="utf-8")
    return p


def append_record(repo_root: Path, row: dict[str, object]) -> None:
    tmp = Path(tempfile.mkstemp(prefix="review-", suffix=".json")[1])
    tmp.write_text(json.dumps(row, indent=2), encoding="utf-8")
    subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "append_review_record.py"), "--record-file", str(repo_root / ".autoresearch/verify/reviews.jsonl"), "--json-file", str(tmp)],
        check=True,
    )
    tmp.unlink(missing_ok=True)


def run_cmd(argv: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, cwd=cwd, text=True, capture_output=True)


def process_one(
    proposal_id: int,
    w3: Web3,
    ledger: object,
    registry: object,
    claimable: set[int],
    metric_scale: int,
    dry_run: bool,
) -> str:
    """Returns result: skipped | approved | rejected | operational_failure."""
    prop = ledger.functions.getProposal(proposal_id).call()
    project_id = prop[0]
    code_hash = Web3.to_hex(prop[3])
    bench_hash = Web3.to_hex(prop[4])
    claimed_score = prop[6]
    status = prop[-1]

    review_id = f"p{proposal_id}-{uuid.uuid4().hex[:8]}"
    record_root = Path(os.environ.get("ARAH_VERIFY_RECORD_ROOT", str(ROOT)))

    def record(result: str, reason: str, **extra: object) -> None:
        row = {
            "schemaVersion": "1",
            "review_id": review_id,
            "utc_timestamp": utc_now(),
            "proposal_id": proposal_id,
            "project_id": project_id,
            "result": result,
            "reason_code": reason,
            "stdout_log_path": str(extra.get("stdout_log_path", "")),
            "error": str(extra.get("error", "")),
        }
        if "benchmark_log_hash_ok" in extra:
            row["benchmark_log_hash_ok"] = extra["benchmark_log_hash_ok"]  # type: ignore[assignment]
        if "protocol_hash_ok" in extra:
            row["protocol_hash_ok"] = extra["protocol_hash_ok"]  # type: ignore[assignment]
        if "claimed_aggregate_score" in extra:
            row["claimed_aggregate_score"] = str(extra["claimed_aggregate_score"])
        if "verified_aggregate_score" in extra:
            row["verified_aggregate_score"] = str(extra["verified_aggregate_score"])
        append_record(record_root, row)

    if status not in claimable:
        record("skipped", "not_claimable_status", stdout_log_path="", error=f"status={status}")
        return "skipped"

    key = os.environ.get("ARAH_PRIVATE_KEY")
    if not key and not dry_run:
        print("ARAH_PRIVATE_KEY required", file=sys.stderr)
        sys.exit(1)

    paths: dict[str, str] | None = None
    work_dir: Path | None = None
    extract_root: Path | None = None
    try:
        paths = resolve_artifacts(code_hash, bench_hash)
        work_dir = Path(paths["work_dir"])
        extract_root = Path(paths["extract_root"])
    except (OSError, KeyError, ValueError) as e:
        record("skipped", "artifact_resolve_failed", stdout_log_path="", error=str(e))
        return "skipped"

    assert extract_root is not None and paths is not None
    subprocess.run(["bash", str(SCRIPT_DIR / "init_verify_workspace.sh"), str(extract_root)], check=True)

    subpath = Path(paths["protocol_subpath"])
    protocol_path = (extract_root / subpath).resolve()
    if not protocol_path.is_file():
        shutil.rmtree(work_dir, ignore_errors=True)
        record("skipped", "protocol_file_missing", stdout_log_path="", error=str(protocol_path))
        return "skipped"

    skip_ph = os.environ.get("ARAH_SKIP_PROTOCOL_HASH_COMPARE", "").lower() in ("1", "true", "yes")
    protocol_ok = True
    if not skip_ph:
        proj = registry.functions.getProject(project_id).call()
        on_chain = bytes(proj[0])
        local = hashlib.sha256(protocol_path.read_bytes()).digest()
        protocol_ok = local == on_chain

    def ledger_tx(script: str, extra: list[str]) -> bool:
        cmd = [sys.executable, str(SCRIPT_DIR / script)] + extra
        if dry_run:
            cmd.append("--dry-run")
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            return False
        return True

    try:
        if not protocol_ok:
            if not ledger_tx("claim_review.py", ["--proposal-id", str(proposal_id)]):
                record("skipped", "claim_review_failed", stdout_log_path="", error="claim_review revert or RPC error")
                return "skipped"
            ev = write_evidence("protocol_hash_mismatch")
            if not ledger_tx("finalize_reject.py", ["--proposal-id", str(proposal_id), "--metrics-log-file", str(ev)]):
                record("operational_failure", "finalize_reject_failed", stdout_log_path="", error="reject tx failed")
                return "operational_failure"
            ev.unlink(missing_ok=True)
            record("rejected", "protocol_hash_mismatch", stdout_log_path="", error="", protocol_hash_ok=False)
            return "rejected"

        if not ledger_tx("claim_review.py", ["--proposal-id", str(proposal_id)]):
            record("skipped", "claim_review_failed", stdout_log_path="", error="claim_review revert or lost race")
            return "skipped"

        sg = run_cmd(
            [
                sys.executable,
                str(SCRIPT_DIR / "verify_static_gates.py"),
                "--protocol",
                str(protocol_path),
                "--repo-root",
                str(extract_root),
            ]
        )
        if sg.returncode != 0:
            ev = write_evidence(sg.stderr or sg.stdout or "verify_static_gates failed")
            if not ledger_tx("finalize_reject.py", ["--proposal-id", str(proposal_id), "--metrics-log-file", str(ev)]):
                record("operational_failure", "finalize_reject_failed", stdout_log_path="", error="reject after static gate failed")
                ev.unlink(missing_ok=True)
                return "operational_failure"
            ev.unlink(missing_ok=True)
            record("rejected", "static_gate_failed", stdout_log_path="", error=sg.stderr.strip())
            return "rejected"

        rt = run_cmd(
            ["bash", str(SCRIPT_DIR / "run_verify_trial.sh"), str(protocol_path), str(extract_root), review_id],
            cwd=extract_root,
        )
        log_path = extract_root / ".autoresearch/verify/runs" / review_id / "stdout.log"
        if rt.returncode != 0:
            ev = write_evidence(rt.stderr or rt.stdout or "run_verify_trial failed")
            if not ledger_tx("finalize_reject.py", ["--proposal-id", str(proposal_id), "--metrics-log-file", str(ev)]):
                record("operational_failure", "finalize_reject_failed", stdout_log_path=str(log_path), error="reject after harness failed")
                ev.unlink(missing_ok=True)
                return "operational_failure"
            ev.unlink(missing_ok=True)
            record("rejected", "harness_failed", stdout_log_path=str(log_path), error=rt.stderr.strip())
            return "rejected"

        pm = run_cmd([sys.executable, str(SCRIPT_DIR / "parse_baseline_metric.py"), str(log_path)])
        if pm.returncode != 0:
            ev = write_evidence("parse_baseline_metric failed: " + (pm.stderr or ""))
            if not ledger_tx("finalize_reject.py", ["--proposal-id", str(proposal_id), "--metrics-log-file", str(ev)]):
                record("operational_failure", "finalize_reject_failed", stdout_log_path=str(log_path), error="reject after parse failed")
                ev.unlink(missing_ok=True)
                return "operational_failure"
            ev.unlink(missing_ok=True)
            record("rejected", "metric_parse_failed", stdout_log_path=str(log_path), error=pm.stderr.strip())
            return "rejected"

        metric_s = pm.stdout.strip()
        try:
            verified_scaled = decimal_metric_to_scaled_int(metric_s, metric_scale)
        except ValueError as e:
            ev = write_evidence(str(e))
            if not ledger_tx("finalize_reject.py", ["--proposal-id", str(proposal_id), "--metrics-log-file", str(ev)]):
                record("operational_failure", "finalize_reject_failed", stdout_log_path=str(log_path), error="reject after encode failed")
                ev.unlink(missing_ok=True)
                return "operational_failure"
            ev.unlink(missing_ok=True)
            record("rejected", "metric_encode_failed", stdout_log_path=str(log_path), error=str(e))
            return "rejected"

        if verified_scaled != int(claimed_score):
            ev = write_evidence(
                json.dumps(
                    {"claimed": str(int(claimed_score)), "verified": str(verified_scaled), "metric_scale": metric_scale},
                    indent=2,
                )
            )
            if not ledger_tx("finalize_reject.py", ["--proposal-id", str(proposal_id), "--metrics-log-file", str(ev)]):
                record("operational_failure", "finalize_reject_failed", stdout_log_path=str(log_path), error="reject after mismatch failed")
                ev.unlink(missing_ok=True)
                return "operational_failure"
            ev.unlink(missing_ok=True)
            record(
                "rejected",
                "metric_mismatch",
                stdout_log_path=str(log_path),
                error="claimed != verified",
                claimed_aggregate_score=str(int(claimed_score)),
                verified_aggregate_score=str(verified_scaled),
            )
            return "rejected"

        if not ledger_tx(
            "finalize_approve.py",
            [
                "--proposal-id",
                str(proposal_id),
                "--metrics-log-file",
                str(log_path),
                "--verified-score-int256",
                str(verified_scaled),
            ],
        ):
            record("operational_failure", "finalize_approve_failed", stdout_log_path=str(log_path), error="approve tx failed")
            return "operational_failure"
        record(
            "approved",
            "ok",
            stdout_log_path=str(log_path),
            error="",
            benchmark_log_hash_ok=True,
            protocol_hash_ok=True,
            claimed_aggregate_score=str(int(claimed_score)),
            verified_aggregate_score=str(verified_scaled),
        )
        return "approved"
    finally:
        if work_dir and work_dir.exists():
            shutil.rmtree(work_dir, ignore_errors=True)


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--proposal-id", type=int, help="Process a single proposal id (otherwise scans claimable ids)")
    ap.add_argument("--dry-run", action="store_true", help="Print txs only where supported")
    ap.add_argument("--max-proposals", type=int, default=int(os.environ.get("VALIDATE_MAX_PROPOSALS", "50")))
    args = ap.parse_args()

    dry_run = args.dry_run
    metric_scale = int(os.environ.get("ARAH_METRIC_SCALE", "1000000"))
    claimable = load_claimable()

    record_home = Path(os.environ.get("ARAH_VERIFY_RECORD_ROOT", str(ROOT)))
    subprocess.run(["bash", str(SCRIPT_DIR / "init_verify_workspace.sh"), str(record_home)], check=True)

    deployment, deployment_path = load_deployment()
    dep_dir = deployment_dir(deployment_path)
    rpc = chain_rpc_url(deployment)
    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        print(f"RPC connect failed: {rpc}", file=sys.stderr)
        return 1

    reg_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProjectRegistry"]["artifact"])
    ledger_abi = load_contract_abi(dep_dir, deployment["contracts"]["ProposalLedger"]["artifact"])
    registry = w3.eth.contract(address=Web3.to_checksum_address(project_registry_address(deployment)), abi=reg_abi)
    ledger = w3.eth.contract(address=Web3.to_checksum_address(proposal_ledger_address(deployment)), abi=ledger_abi)

    if args.proposal_id is not None:
        ids = [args.proposal_id]
    else:
        nxt = ledger.functions.nextProposalId().call()
        ids = []
        for pid in range(nxt):
            st = ledger.functions.getProposal(pid).call()[-1]
            if st in claimable:
                ids.append(pid)

    done = 0
    for pid in ids:
        if done >= args.max_proposals:
            break
        process_one(pid, w3, ledger, registry, claimable, metric_scale, dry_run)
        done += 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
