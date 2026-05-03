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
- For on-chain mining, an EVM wallet in **`ARAH_PRIVATE_KEY`** before the loop starts. Scripts load `.env` from the current working directory; if the key is missing, ask the user to create `.env` with `ARAH_PRIVATE_KEY=0x...` and optional `ARAH_STAKE_WEI=1000000000000000000`. Run **`check_wallet.py`** first so the miner can sign transactions, has native gas, and either has enough ProjectToken stake or enough native balance to buy the missing stake automatically.

## Unattended mode

- Export **`GIT_TERMINAL_PROMPT=0`** during mining so git never blocks on credentials in headless runs.
- Do **not** ask the miner between trials; stop only on limits, PR success (optional), or fatal errors.
- Optional env shortcuts: **`AUTORESEARCH_PROTOCOL`**, **`AUTORESEARCH_REPO_ROOT`** (document paths once at start).
- If the user provides a **project token address** or **0G project id** instead of local files, run **`bootstrap_from_registry.py`** first to resolve/download mining inputs.

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
| `ARAH_PRIVATE_KEY` | Miner EVM key for **`check_wallet.py`** and **`submit_proposal.py`** (hex, no `0x` prefix accepted by eth-account either way). May be set in the shell or in `.env` in the current working directory. |
| `ARAH_PROJECT_ID` | On-chain **project id** for frontier sync; overrides **`miningLoop.onChainProjectId`** in `protocol.json` when set. |
| `ARAH_STAKE_WEI` | Optional stake amount. Defaults to **`1000000000000000000`** ProjectToken base units when absent. |

Install Python chain deps once: **`pip install -r requirements-chain.txt`** (e.g. in a venv).

For full artifact download from 0G Storage, install Node deps once from the skill root:

```bash
npm install
```

`bootstrap_from_registry.py` can still resolve project metadata and initialize an existing protocol/repo checkout without Node deps; Node deps are only required for **`--download-artifacts`**.

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
| `scripts/bootstrap_from_registry.py` | Resolve by **`--project-id`** or **`--token-address`**, read `ProjectRegistry`, optionally download 0G artifacts, unpack the repo snapshot, initialize mining workspace, and write registry frontier state. |
| `scripts/download_0g_artifacts.mjs` | Download protocol/repo/benchmark/baseline artifacts from 0G Storage root hashes and verify Merkle roots with the 0G SDK. |
| `scripts/env_utils.py` | Load `.env` from the current working directory and provide the default stake. |
| `scripts/check_wallet.py` | Preflight **`ARAH_PRIVATE_KEY`**, RPC, native gas balance, ProjectToken balance, allowance, and missing-stake buy quote. |
| `scripts/run_trial.sh` | One harness run → `run_baseline.sh`, log under `runs/<trial_id>/stdout.log`. |
| `scripts/submit_trial_proposal.py` | Archive committed trial code, pair it with the trial benchmark log, and send the on-chain proposal transaction automatically. |
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

### 1. Wallet preflight for on-chain mining

When the user provides a project token address or 0G project id, start by checking the wallet. The same wallet signs **`buy()`**, **`approve()`**, and **`submit()`** later.

```bash
# .env in the current working directory:
# ARAH_PRIVATE_KEY=0x...
# ARAH_STAKE_WEI=1000000000000000000

python3 ./check_wallet.py \
  --token-address 0xProjectTokenAddress
# or: --project-id "${ARAH_PROJECT_ID:?}"
```

If `ready` is false, stop and report the missing gas/token/stake condition before spending compute on trials. If `missingStake` is nonzero and `canAutoBuyMissingStake` is true, continue and submit later with **`--auto-buy`**. A low allowance is reported as `needsApproval`; it is not fatal because **`submit_proposal.py`** sends `approve()` itself.

### 2. Bootstrap workspace

**From project token address or project id** (preferred when the project was published with 0G Storage artifacts):

```bash
python3 ./bootstrap_from_registry.py \
  --token-address 0xProjectTokenAddress \
  --output-dir /path/to/mining-work/project-token \
  --download-artifacts
# or: --project-id 123
```

This writes `bootstrap_result.json`, initializes `.autoresearch/mine`, and prints the resolved `protocolJson` and `repoRoot`. Continue the loop with those paths.

If the project was published with plain SHA-256 hashes instead of 0G Storage roots, `--download-artifacts` cannot fetch files; ask the user for `protocol.json` and a repo checkout, then use the same script without `--download-artifacts`:

```bash
python3 ./bootstrap_from_registry.py \
  --token-address 0xProjectTokenAddress \
  --protocol-json /path/to/protocol.json \
  --repo-root /path/to/repo \
  --output-dir /path/to/mining-work/project-token
```

**From existing local files:**

```bash
export GIT_TERMINAL_PROMPT=0
./init_mine_workspace.sh /path/to/repo
```

### 3. Frontier (manual or chain)

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

### 4. Validate frontier file

```bash
./validate_network_state.sh /path/to/protocol.json /path/to/repo
```

### 5. Preview metrics / mining limits

```bash
./preview_mining_context.sh /path/to/protocol.json
python3 ./read_mining_limits.py /path/to/protocol.json
```

### 6. Mining loop (agent-driven)

Follow **`prompts/mining_loop.md`**, **`prompts/git_policy.md`**, **`prompts/results_logging.md`**. For each trial:

```bash
./run_trial.sh /path/to/protocol.json /path/to/repo <trial_id>
# Parse BASELINE_METRIC= from stdout when exit 0
./compare_metric.py --direction minimize --candidate 2.41 --baseline 2.50   # example
./append_trial_record.py --record-file /path/to/repo/.autoresearch/mine/trials.jsonl --json-file row.json
```

On improvement vs local best: **`commit_improvement.sh`**. Else: **`revert_mutable_surface.sh`**.

If the trial beats the freshly synced **on-chain** best, do not wait for manual approval. After committing the improvement, call **`submit_trial_proposal.py`** immediately. It creates `.autoresearch/mine/submissions/<trial_id>/repo-snapshot.tar`, uses `.autoresearch/mine/runs/<trial_id>/stdout.log` as `benchmarkLog`, and sends the proposal transaction through **`submit_proposal.py`**.

### 7. Automatic on-chain submit after beating registry best

After any trial beats the current registry best, publish a proposal with the same wallet. See **[`references/onchain-mining-0g.md`](references/onchain-mining-0g.md)** for **`bytes32`** hashing (SHA-256 of file bytes) and metric scale. If the token balance is below the stake and wallet preflight reported `canAutoBuyMissingStake: true`, keep **`--auto-buy`** enabled so the script buys the missing ProjectToken stake, approves the ledger, then submits.

```bash
python3 ./submit_trial_proposal.py \
  --token-address 0xProjectTokenAddress \
  --repo-root /path/to/repo \
  --trial-id <trial_id> \
  --claimed-metric 1.23 \
  --reward-recipient 0xYourAddress \
  --auto-buy
```

Use **`--print-only`** to dump resolved args without RPC; **`--dry-run`** to print unsigned txs without sending.

### 8. Optional PR

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
| `bootstrap_from_registry.py` | 0 bootstrapped; 1 args / RPC / token not found / download / unpack failure. |
| `download_0g_artifacts.mjs` | 0 downloaded; 1 args / missing deps / download / root verification failure. |
| `env_utils.py` | Helper module; no direct CLI. |
| `check_wallet.py` | 0 wallet can proceed; 1 missing key / RPC / gas / unresolved token / insufficient stake and auto-buy funds. |
| `run_trial.sh` | Same as `run_baseline.sh`; **3** if harness dir missing. |
| `submit_trial_proposal.py` | 0 submitted; 1 args / dirty repo / missing trial log / submit failure. |
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
