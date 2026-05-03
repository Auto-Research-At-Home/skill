# Results logging (agent prompt)

Every completed trial must append **exactly one** JSON Lines row to `.autoresearch/mine/trials.jsonl` using:

```bash
python3 append_trial_record.py --record-file <repo>/.autoresearch/mine/trials.jsonl --json-file <row.json>
```

## Row contents

Match **`schemas/trial_record.schema.json`**. Required fields:

| Field | Notes |
|-------|--------|
| `schemaVersion` | `"1"` |
| `trial_id` | Unique id for this trial |
| `utc_timestamp` | ISO-8601 UTC |
| `protocol_bundle_id` | Copy `meta.protocolBundleId` |
| `run_ok` | True iff harness exit 0 **and** metric extracted |
| `primary_metric_name` | From protocol |
| `primary_metric_value` | Parsed float or `null` |
| `direction` | `minimize` or `maximize` |
| `beats_local_best` | Whether this trial won vs previous local best |
| `beats_network_best` | Whether metric beats `network_state.network_best_metric` (false if unknown) |
| `stdout_log_path` | Relative path under repo root, e.g. `.autoresearch/mine/runs/<id>/stdout.log` |
| `git_head_before` / `git_head_after` | SHAs or `null` |
| `harness_exit_code` | Integer exit code from `run_trial.sh` |
| `error` | Empty string if none |

Optional: `hypothesis` (string).

Never omit `stdout_log_path`.
