---
name: autoresearch-mine
description: Run the Phase 2 Auto Research At Home mining loop on a finalized protocol.json and target repo. Self-contained bundled harness (run_baseline, preview_metrics), append-only trials.jsonl, optional miningLoop session limits, network_state (manual or 0G ProjectRegistry sync), optional submit to ProposalLedger, unattended stop conditions. Use when the user wants to mine without installing autoresearch-create.
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

### 0G Galileo (optional; still no `autoresearch-create` install)

| Variable | Purpose |
|----------|---------|
| `ARAH_DEPLOYMENT_JSON` | Path to `deployment.json` (default: bundled `contracts/0g-galileo-testnet/deployment.json` in this skill). |
| `ARAH_RPC_URL` | Override RPC (default in deployment). |
| `ARAH_CHAIN_ID` | Override chain id (default **16602**). |
| `ARAH_PROJECT_REGISTRY` / `ARAH_PROPOSAL_LEDGER` | Override contract addresses. |
| `ARAH_METRIC_SCALE` | Integer scale for int256 ↔ float (match `createProject`; default **1000000**). |
| `ARAH_PRIVATE_KEY` | Miner key for **`submit_proposal.py`** (hex, no `0x` prefix accepted by eth-account either way). |
| `ARAH_PROJECT_ID` | On-chain **project id** for frontier sync; overrides **`miningLoop.onChainProjectId`** in `protocol.json` when set. |

Install Python chain deps once: **`pip install -r requirements-chain.txt`** (e.g. in a venv).

### Stop conditions (protocol-first)

1. **Per trial:** `execution.hardTimeoutSeconds` and `execution.stopCondition` — enforced only by **`run_baseline.sh`** via **`run_trial.sh`**. Never shorten these in the mine skill.
2. **Outer session:** optional **`miningLoop`** in `protocol.json` (also rendered in `program.md`). Query merged limits with **`read_mining_limits.py`** (see [`references/workflow.md`](references/workflow.md)).

## Machine layout (under target repo root)

```text
.autoresearch/mine/
  network_state.json
  trials.jsonl
  runs/<trial_id>/stdout.log
```

Initialize with **`init_mine_workspace.sh`**. Seed **`network_state.json`** from `templates/network_state.manual.json` **or** refresh from chain with **`sync_registry_frontier.py`** (writes `source: registry`). Align with `validate_network_state.sh` after editing or syncing.

## Bundled resources

| Resource | Role |
|----------|------|
| `references/overview.md` | Short maintainer-facing map for this skill. |
| `references/workflow.md` | Phase 1 to Phase 2 workflow diagram and limits/frontier notes. |
| `references/contracts-sync.md` | Maintainer instructions for refreshing vendored 0G deployment + ABI artifacts from `autoresearch-create`. |
| `references/vendor-harness.md` | Maintainer instructions for refreshing vendored harness scripts from `autoresearch-create`. |
| `references/onchain-mining-0g.md` | Miner-focused excerpt (hash rules, submit order). |
| `contracts/0g-galileo-testnet/` | Vendored **`deployment.json`** + ABI artifacts for **`ProjectRegistry`**, **`ProposalLedger`**, **`ProjectToken`**, **`VerifierRegistry`**. |
| `vendor/harness/` | Vendored `run_baseline.sh`, `_log.sh`, `_log.py`, `preview_metrics.py` trial harness. |
| `scripts/_resolve_create_scripts.sh` | Resolve harness directory (default `vendor/harness`, override via env). |
| `scripts/read_mining_limits.py` | Print `max_trials`, `max_session_wall_seconds`, `max_stagnant_trials`, `stop_after_pr`, and optionally **`on_chain_project_id`** (if `miningLoop.onChainProjectId` or **`ARAH_PROJECT_ID`** is set). |
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
| `scripts/sync_registry_frontier.py` | `eth_call` registry → write **`network_state.json`** (`source: registry`). |
| `scripts/submit_proposal.py` | **`ProposalLedger.submit`** + **`ProjectToken`** approve / optional `buy`. |
| `scripts/chain_config.py` | Resolve bundled deployment + env overrides (imported by chain scripts). |
| `scripts/open_pr_with_evidence.sh` | `gh pr create` after guard checks (`_open_pr_evidence.py`). |
| `schemas/trial_record.schema.json` | Trial row shape. |
| `schemas/network_state.schema.json` | `network_state.json` shape (manual or registry). |
| `requirements-chain.txt` | `web3`, `eth-account` for chain scripts only. |
| `prompts/*.md` | Agent contracts for bootstrap, loop, logging, git, PR. |

## Step-by-step

Run scripts from **`autoresearch-mine/scripts/`** (or invoke via absolute paths after skill install).

### 1. Bootstrap workspace

```bash
export GIT_TERMINAL_PROMPT=0
./init_mine_workspace.sh /path/to/repo
```

### 2. Frontier (manual or chain)

**Manual:** edit `.autoresearch/mine/network_state.json` from `templates/network_state.manual.json`.

**0G registry sync** (optional): before comparing to “network best”, refresh from **`ProjectRegistry.currentBestAggregateScore`**:

```bash
python3 ./sync_registry_frontier.py \
  --project-id "${ARAH_PROJECT_ID:?}" \
  --repo-root /path/to/repo \
  --protocol-json /path/to/protocol.json
# optional: --verify-protocol-hash (requires matching protocol.json bytes vs on-chain protocolHash)
./validate_network_state.sh /path/to/protocol.json /path/to/repo
```

### 3. Validate frontier file

```bash
./validate_network_state.sh /path/to/protocol.json /path/to/repo
```

### 4. Preview metrics / mining limits

```bash
./preview_mining_context.sh /path/to/protocol.json
python3 ./read_mining_limits.py /path/to/protocol.json
```

### 5. Mining loop (agent-driven)

Follow **`prompts/mining_loop.md`**, **`prompts/git_policy.md`**, **`prompts/results_logging.md`**. For each trial:

```bash
./run_trial.sh /path/to/protocol.json /path/to/repo <trial_id>
# Parse BASELINE_METRIC= from stdout when exit 0
./compare_metric.py --direction minimize --candidate 2.41 --baseline 2.50   # example
./append_trial_record.py --record-file /path/to/repo/.autoresearch/mine/trials.jsonl --json-file row.json
```

On improvement vs local best: **`commit_improvement.sh`**. Else: **`revert_mutable_surface.sh`**.

### 6. Optional on-chain submit

After a winning trial, optionally publish a proposal (wallet + stake). See **[`references/onchain-mining-0g.md`](references/onchain-mining-0g.md)** for **`bytes32`** hashing (SHA-256 of file bytes) and metric scale.

```bash
export ARAH_PRIVATE_KEY=...
python3 ./submit_proposal.py \
  --project-id "${ARAH_PROJECT_ID}" \
  --code-file /path/to/repo-snapshot.tar \
  --benchmark-log-file /path/to/benchmark.log \
  --claimed-metric 1.23 \
  --stake 1000000000000000000 \
  --reward-recipient 0xYourAddress \
  --buy-value-wei 0
```

Use **`--print-only`** to dump resolved args without RPC; **`--dry-run`** to print unsigned txs without sending.

### 7. Optional PR

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
| `sync_registry_frontier.py` | 0; 1 RPC / validation / hash mismatch. |
| `submit_proposal.py` | 0 submitted; 1 args / balance / RPC. |
| `open_pr_with_evidence.sh` | 0 PR opened; 1 `gh` error; 2 args/file; **3** no `gh`; **4** guard failed. |

## Out of scope (v1)

Verifier review / TEE / deep IPFS hosting automation — use **`autoresearch-create`** to publish projects and the full onchain reference for governance flows beyond miner **`submit`**.

## Final response

Report paths to `protocol.json`, repo root, `trials.jsonl`, last metric, and whether a PR was opened.
