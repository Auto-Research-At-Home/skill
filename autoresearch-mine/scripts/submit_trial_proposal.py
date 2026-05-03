#!/usr/bin/env python3
"""Package a committed winning trial and submit it on-chain."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from env_utils import env_or_default_stake, load_dotenv_from_cwd  # noqa: E402


def run(cmd: list[str], *, cwd: Path | None = None, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )


def git_clean_tracked(repo_root: Path) -> bool:
    result = run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=repo_root, capture=True)
    return result.stdout.strip() == ""


def git_head(repo_root: Path) -> str:
    return run(["git", "rev-parse", "HEAD"], cwd=repo_root, capture=True).stdout.strip()


def create_code_archive(repo_root: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "archive", "--format=tar", "--output", str(output), "HEAD"], cwd=repo_root)


def main() -> int:
    load_dotenv_from_cwd()

    parser = argparse.ArgumentParser(
        description="Archive the committed repo state for a trial and submit ProposalLedger.submit.",
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--project-id", type=int)
    source.add_argument("--token-address")
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--trial-id", required=True)
    parser.add_argument("--claimed-metric", required=True)
    parser.add_argument("--stake", default=env_or_default_stake())
    parser.add_argument("--reward-recipient", required=True)
    parser.add_argument("--metric-scale", type=int, default=int(os.environ.get("ARAH_METRIC_SCALE", "1000000")))
    parser.add_argument("--buy-value-wei", default="0")
    parser.add_argument("--auto-buy", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    repo_root = args.repo_root.expanduser().resolve()
    trial_log = repo_root / ".autoresearch" / "mine" / "runs" / args.trial_id / "stdout.log"
    if not trial_log.is_file():
        print(f"trial stdout log missing: {trial_log}", file=sys.stderr)
        return 1

    try:
        if not git_clean_tracked(repo_root):
            print("repo has uncommitted tracked changes; commit the winning trial before submitting", file=sys.stderr)
            return 1
        head = git_head(repo_root)
        submission_dir = repo_root / ".autoresearch" / "mine" / "submissions" / args.trial_id
        code_tar = submission_dir / "repo-snapshot.tar"
        create_code_archive(repo_root, code_tar)

        cmd = [
            sys.executable,
            str(SCRIPT_DIR / "submit_proposal.py"),
            "--code-file",
            str(code_tar),
            "--benchmark-log-file",
            str(trial_log),
            "--claimed-metric",
            args.claimed_metric,
            "--metric-scale",
            str(args.metric_scale),
            "--stake",
            args.stake,
            "--reward-recipient",
            args.reward_recipient,
            "--buy-value-wei",
            args.buy_value_wei,
        ]
        if args.project_id is not None:
            cmd.extend(["--project-id", str(args.project_id)])
        if args.token_address:
            cmd.extend(["--token-address", args.token_address])
        if args.auto_buy:
            cmd.append("--auto-buy")
        if args.dry_run:
            cmd.append("--dry-run")

        result = run(cmd, cwd=SCRIPT_DIR, capture=True)
        submission = {
            "schemaVersion": "1",
            "trial_id": args.trial_id,
            "utc_timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "git_head": head,
            "code_file": str(code_tar),
            "benchmark_log_file": str(trial_log),
            "claimed_metric": args.claimed_metric,
            "stake": args.stake,
            "reward_recipient": args.reward_recipient,
            "dry_run": args.dry_run,
            "submit_output": result.stdout,
        }
        (submission_dir / "submission.json").write_text(json.dumps(submission, indent=2) + "\n", encoding="utf-8")
        print(result.stdout, end="")
        print(str((submission_dir / "submission.json").resolve()))
        return 0
    except subprocess.CalledProcessError as e:
        if e.stdout:
            print(e.stdout, file=sys.stderr, end="")
        return e.returncode or 1
    except OSError as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
