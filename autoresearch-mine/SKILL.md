---
name: autoresearch-mine
description: Run the Phase 2 Auto Research At Home mining loop on a finalized protocol.json and target repo. Self-contained bundled harness (run_baseline, preview_metrics), append-only trials.jsonl, optional miningLoop session limits, manual network_state.json for PR gating, unattended stop conditions. Use when the user wants to mine without installing autoresearch-create.
---

# autoresearch-mine

Run **unattended** mining against a finalized `protocol.json` and a **git checkout** of `meta.repo`. In this monorepo the canonical schema is [`protocol.schema.json`](../autoresearch-create/protocol.schema.json); miners normally receive a finalized protocol from the project owner. This skill **does not** re-approve the benchmark (that step lives in the **autoresearch-create** authoring flow).

**Self-contained:** Baseline harness scripts are **bundled** under [`vendor/harness/`](vendor/harness/) (vendored from `autoresearch-create`). Miners do **not** need to install **`autoresearch-create`**. Optional: set **`AUTORESEARCH_CREATE_SCRIPTS`** to use a different directory containing `run_baseline.sh` (e.g. when developing both skills side by side).

## Prerequisites

- `protocol.json` with `schemaKind: protocol` and `meta.eligibility: eligible`.
- `jq`, `git`, `bash`, `python3` on PATH.
- Target repo checkout (or run `bootstrap_repo.sh` to clone from `meta.repo.cloneUrl`).

## Unattended mode

- Export **`GIT_TERMINAL_PROMPT=0`** during mining so git never blocks on credentials in headless runs.
- Do **not** ask the miner between trials; stop only on limits, PR success (optional), or fatal errors.
- Optional env shortcuts: **`AUTORESEARCH_PROTOCOL`**, **`AUTORESEARCH_REPO_ROOT`** (document paths once at start).

### Env fallbacks (outer loop only; protocol `miningLoop` wins when set)

| Variable | Purpose |
|----------|---------|
| `AUTORESEARCH_CREATE_SCRIPTS` | Directory containing `run_baseline.sh` (optional; overrides bundled `vendor/harness`). |
| `MINING_MAX_TRIALS` | Fallback if `miningLoop.maxTrials` absent (default **50** if both absent). |
| `MINING_MAX_WALL_SECONDS` | Fallback if `miningLoop.maxSessionWallSeconds` absent (**-1** = no cap when merged in `read_mining_limits.py`). |
| `MINING_MAX_STAGNANT_TRIALS` | Fallback if `miningLoop.maxConsecutiveNonImprovements` absent (**-1** = no stagnation stop). |
| `MINING_STOP_AFTER_PR` | Fallback if `miningLoop.stopAfterSuccessfulPr` absent (default **true**). |
| `GH_TOKEN` / `GITHUB_TOKEN` | Non-interactive **`gh`** authentication. |

### Stop conditions (protocol-first)

1. **Per trial:** `execution.hardTimeoutSeconds` and `execution.stopCondition` — enforced only by **`run_baseline.sh`** via **`run_trial.sh`**. Never shorten these in the mine skill.
2. **Outer session:** optional **`miningLoop`** in `protocol.json` (also rendered in `program.md`). Query merged limits with **`read_mining_limits.py`** (see `workflow.md`).

## Machine layout (under target repo root)

```text
.autoresearch/mine/
  network_state.json
  trials.jsonl
  runs/<trial_id>/stdout.log
```

Initialize with **`init_mine_workspace.sh`**. Seed **`network_state.json`** from `templates/network_state.manual.json` and align IDs with `validate_network_state.sh`.

## Bundled resources

| Resource | Role |
|----------|------|
| `vendor/harness/` | Vendored `run_baseline.sh`, `_log.sh`, `_log.py`, `preview_metrics.py` (trial harness; sync from create when upstream changes — see [`vendor/README.md`](vendor/README.md)). |
| `scripts/_resolve_create_scripts.sh` | Resolve harness directory (default `vendor/harness`, override via env). |
| `scripts/read_mining_limits.py` | Print `max_trials`, `max_session_wall_seconds`, `max_stagnant_trials`, `stop_after_pr`. |
| `scripts/init_mine_workspace.sh` | Create `.autoresearch/mine` tree. |
| `scripts/bootstrap_repo.sh` | Clone or reuse repo from protocol `meta.repo`. |
| `scripts/run_trial.sh` | One harness run → `run_baseline.sh`, log under `runs/<trial_id>/stdout.log`. |
| `scripts/append_trial_record.py` | Append one validated JSON line to `trials.jsonl`. |
| `scripts/compare_metric.py` | Numeric compare by direction (exit code only). |
| `scripts/preview_mining_context.sh` | Wrapper for bundled `preview_metrics.py`. |
| `scripts/list_mutable_paths.py` | List tracked paths matching allowed globs. |
| `scripts/revert_mutable_surface.sh` | `git checkout HEAD` on allowed paths only. |
| `scripts/commit_improvement.sh` | `git add` allowed paths + commit with fixed message. |
| `scripts/prepare_pr_branch.sh` | `git checkout -B mine/<bundle>/<date>-<trial>`. |
| `scripts/validate_network_state.sh` | Check `network_state.json` vs protocol. |
| `scripts/open_pr_with_evidence.sh` | `gh pr create` after guard checks (`_open_pr_evidence.py`). |
| `schemas/trial_record.schema.json` | Trial row shape. |
| `schemas/network_state.schema.json` | Manual frontier file shape. |
| `prompts/*.md` | Agent contracts for bootstrap, loop, logging, git, PR. |

## Step-by-step

Run scripts from **`autoresearch-mine/scripts/`** (or invoke via absolute paths after skill install).

### 1. Bootstrap workspace

```bash
export GIT_TERMINAL_PROMPT=0
./init_mine_workspace.sh /path/to/repo
```

Fill `.autoresearch/mine/network_state.json` (replace placeholders from `templates/network_state.manual.json`).

### 2. Validate frontier file

```bash
./validate_network_state.sh /path/to/protocol.json /path/to/repo
```

### 3. Preview metrics / mining limits

```bash
./preview_mining_context.sh /path/to/protocol.json
python3 ./read_mining_limits.py /path/to/protocol.json
```

### 4. Mining loop (agent-driven)

Follow **`prompts/mining_loop.md`**, **`prompts/git_policy.md`**, **`prompts/results_logging.md`**. For each trial:

```bash
./run_trial.sh /path/to/protocol.json /path/to/repo <trial_id>
# Parse BASELINE_METRIC= from stdout when exit 0
./compare_metric.py --direction minimize --candidate 2.41 --baseline 2.50   # example
./append_trial_record.py --record-file /path/to/repo/.autoresearch/mine/trials.jsonl --json-file row.json
```

On improvement vs local best: **`commit_improvement.sh`**. Else: **`revert_mutable_surface.sh`**.

### 5. Optional PR

```bash
./prepare_pr_branch.sh /path/to/protocol.json /path/to/repo <trial_id>
# push branch if required by remote
./open_pr_with_evidence.sh /path/to/repo /path/to/protocol.json /path/to/repo/.autoresearch/mine/trials.jsonl
# or --allow-local-only-pr when network_best_metric is null (see prompts/pr_gate.md)
```

## Script exit codes

| Script | Codes |
|--------|--------|
| `_resolve_create_scripts.sh` | 0 success (prints dir); 1 missing `run_baseline.sh`. |
| `read_mining_limits.py` | 0; 1 error. |
| `init_mine_workspace.sh` | 0; 1 usage; 2 IO/template failure. |
| `bootstrap_repo.sh` | 0; 1 bad protocol; 2 git / path conflict. |
| `run_trial.sh` | Same as `run_baseline.sh`; **3** if harness dir missing. |
| `append_trial_record.py` | 0; 1 validation; 2 IO. |
| `compare_metric.py` | 0 improved; 1 not improved; 2 bad args/NaN. |
| `preview_mining_context.sh` | 0; 1. |
| `revert_mutable_surface.sh` | 0; 1. |
| `commit_improvement.sh` | 0 commit; 1 nothing to commit; 2 git error. |
| `prepare_pr_branch.sh` | 0; 1. |
| `validate_network_state.sh` | 0; 1 mismatch. |
| `open_pr_with_evidence.sh` | 0 PR opened; 1 `gh` error; 2 args/file; **3** no `gh`; **4** guard failed. |

## Out of scope (v1)

On-chain registry, wallet stake, validator TEE flows, IPFS/CID materialization — see repository **README** roadmap. Use manual **`network_state.json`** for the submission bar until **`autoresearch-status`** exists.

## Final response

Report paths to `protocol.json`, repo root, `trials.jsonl`, last metric, and whether a PR was opened.
