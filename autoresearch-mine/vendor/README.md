# Vendored harness

These files are **copies** of [`autoresearch-create/scripts/`](../../autoresearch-create/scripts/) in this monorepo so **`autoresearch-mine` installs standalone**: miners do not need the `autoresearch-create` skill.

| File | Role |
|------|------|
| `harness/run_baseline.sh` | Phase-1 baseline / trial harness (`run_trial.sh` delegates here). |
| `harness/_log.sh` | Shared logging for `run_baseline.sh`. |
| `harness/preview_metrics.py` | Benchmark preview (`preview_mining_context.sh`). |
| `harness/_log.py` | Logging helpers for `preview_metrics.py`. |

**Do not edit** vendored files for day-to-day mining. When `autoresearch-create/scripts/` changes in this repo, refresh copies:

```bash
# From repository root:
cp autoresearch-create/scripts/{run_baseline.sh,_log.sh,_log.py,preview_metrics.py} autoresearch-mine/vendor/harness/
```

Developers can point **`AUTORESEARCH_CREATE_SCRIPTS`** at `autoresearch-create/scripts` instead of the bundled harness.
