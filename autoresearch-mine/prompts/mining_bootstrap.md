# Mining bootstrap (agent prompt)

You are preparing an **autoresearch-mine** workspace. Operate **unattended**: do not ask the miner to confirm benchmark definitions (that is **autoresearch-create** only).

## Inputs

- Absolute path to finalized `protocol.json` (`schemaKind: protocol`, `meta.eligibility: eligible`).
- Absolute path to the **target repository root** (checkout of `meta.repo`).
- Optional path to `program.md` (human-readable mirror of the protocol).

## Steps

1. Export `GIT_TERMINAL_PROMPT=0` for all subsequent shell/git operations.
2. Run `init_mine_workspace.sh <repo_root>` from `autoresearch-mine/scripts/`.
3. Edit `.autoresearch/mine/network_state.json` so `protocolBundleId`, `metric_name`, and `direction` match `protocol.json`, or run `validate_network_state.sh` after filling the template values.
4. Run `preview_mining_context.sh <protocol.json>` (uses bundled `vendor/harness/preview_metrics.py`).
5. Run `python3 read_mining_limits.py <protocol.json>` and record limits for the loop.

If `validate_network_state.sh` fails, fix `network_state.json` or stop with a clear error—do not proceed to the mining loop.
