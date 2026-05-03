# PR gate (agent prompt)

Open a PR **only** when submission criteria are met and the repo reflects the winning commit.

## Before `open_pr_with_evidence.sh`

1. Re-run `validate_network_state.sh <protocol.json> <repo_root>` if you changed protocol or network state.
2. Re-read `.autoresearch/mine/network_state.json`. Default rule: PR only if `network_best_metric` is **not** `null` and your trial metric **strictly improves** it (`compare_metric.py` vs that baseline).
3. If `network_best_metric` is `null`, **`open_pr_with_evidence.sh` refuses** unless you pass **`--allow-local-only-pr`** and the trial has **`beats_local_best: true`** (risk of noisy upstream PRs).

## Command

```bash
open_pr_with_evidence.sh [--allow-local-only-pr] <repo_root> <protocol.json> <trial_json_or_trials.jsonl>
```

Use the trial row JSON file or the full `trials.jsonl` (last line used).

## Requirements

- **`gh`** installed and authenticated (`GH_TOKEN` / `GITHUB_TOKEN` for CI).
- Current branch pushed if your fork/remote requires it (`gh pr create` needs a remote branch).

Race conditions with other miners are **out of scope** until an on-chain registry exists—humans merge competing PRs.
