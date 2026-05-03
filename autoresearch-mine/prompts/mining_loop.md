# Mining loop (agent prompt)

You run the **outer mining loop** without asking the human between trials.

## Before each batch of iterations

1. If mining against an on-chain project: when **`read_mining_limits.py`** prints **`on_chain_project_id=…`** (from **`miningLoop.onChainProjectId`** or env **`ARAH_PROJECT_ID`**), refresh **`network_state.json`** with **`sync_registry_frontier.py`** using that id—same **`--metric-scale`** as `createProject`—so comparisons use the current registry best.
2. Run `read_mining_limits.py <protocol.json>` and parse `KEY=value` lines:
   - `max_trials`, `max_session_wall_seconds` (-1 = no cap), `max_stagnant_trials` (-1 = no stagnation stop), `stop_after_pr`.
3. Track: trial count (every completed append to `trials.jsonl`), session wall time from first `run_trial.sh` start, consecutive non-improvements (increment when no new **local** best; reset on commit that improves local best).

## Each iteration

1. Propose a hypothesis; edit **only** paths allowed by `mutableSurface.allowedGlobs` in `protocol.json` (see `program.md` “What you CAN do”).
2. Record `git_head_before` from `git rev-parse HEAD` in `repo_root`.
3. Run `run_trial.sh <protocol.json> <repo_root> <trial_id>` from `autoresearch-mine/scripts/`.
4. Parse **`BASELINE_METRIC=<float>`** from the script stdout on success (same token as `run_baseline.sh`).
5. Compare numerically using **`compare_metric.py`** — never compare floats in prose.
6. If improved vs last local best: run `commit_improvement.sh <protocol.json> <repo_root> <trial_id> <before> <after>`; else run `revert_mutable_surface.sh <protocol.json> <repo_root>`.
7. Build a JSON object for **`append_trial_record.py`** (see `prompts/results_logging.md`) and append one line to `trials.jsonl`.

## Per-trial time limits

Do **not** override `execution.hardTimeoutSeconds` or `execution.stopCondition`. The harness (`run_trial.sh` → `run_baseline.sh`) reads them from `protocol.json`.

## Stop the outer loop when any fires

- Trial count ≥ `max_trials`
- Session wall ≥ `max_session_wall_seconds` if that value is **≥ 0**
- Stagnant trials ≥ `max_stagnant_trials` if that value is **≥ 0**
- Successful PR when `stop_after_pr` is true (after `open_pr_with_evidence.sh` exits 0)
- Unrecoverable script failure (report once and exit)
