# Git policy (agent prompt)

Map harness outcomes to git commands **only** via bundled scripts—do not run blanket `git checkout .` or `git add -A`.

| Outcome | Action |
|---------|--------|
| Trial succeeded and metric **strictly improves** local best (`compare_metric.py` exit 0 vs previous best) | `commit_improvement.sh <protocol.json> <repo_root> <trial_id> <metric_before> <metric_after>` |
| Trial failed, timeout, or metric not better | `revert_mutable_surface.sh <protocol.json> <repo_root>` |
| Edit accidentally touched forbidden paths | Revert manually to protocol scope before running the harness |

**Forbidden:** modifying paths under `immutableHarness` or `mutableSurface.forbiddenGlobs`.
