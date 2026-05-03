# Mining bootstrap (agent prompt)

You are preparing an **autoresearch-mine** workspace. Operate **unattended**: do not ask the miner to confirm benchmark definitions (that is **autoresearch-create** only).

## Inputs

- Either a 0G project id / ProjectToken address, or absolute paths to finalized `protocol.json` (`schemaKind: protocol`, `meta.eligibility: eligible`) and the **target repository root** (checkout of `meta.repo`).
- Optional path to `program.md` (human-readable mirror of the protocol).
- For on-chain mining, `ARAH_PRIVATE_KEY` must be available in the environment or in `.env` in the current working directory. This key is used by the skill itself to sign `buy()`, `approve()`, and `submit()` transactions.

## Steps

1. Export `GIT_TERMINAL_PROMPT=0` for all subsequent shell/git operations.
2. For on-chain mining, run **`check_wallet.py`** before bootstrapping or trials. Pass **`--project-id`** or **`--token-address`**. If `ARAH_PRIVATE_KEY` is missing, ask the user to put a `.env` file in the current working directory with `ARAH_PRIVATE_KEY=0x...` and optional `ARAH_STAKE_WEI=1000000000000000000`, then rerun preflight. Stop if the wallet cannot sign, has no native gas, or cannot cover/buy the missing ProjectToken stake. When `ARAH_STAKE_WEI` is absent, use the default `1000000000000000000`.
3. If starting from a token address or project id, run **`bootstrap_from_registry.py`** to resolve `ProjectRegistry`, download 0G artifacts when available, initialize `.autoresearch/mine`, and write registry frontier state. If starting from local files, run `init_mine_workspace.sh <repo_root>` from `autoresearch-mine/scripts/`.
4. Set `.autoresearch/mine/network_state.json`: either edit **`templates/network_state.manual.json`** placeholders, **or** call **`sync_registry_frontier.py`** with **`--project-id`**, **`--repo-root`**, and **`--protocol-json`** so `source` is **`registry`** (requires **`pip install -r requirements-chain.txt`**). Then run **`validate_network_state.sh`**.
5. Run `preview_mining_context.sh <protocol.json>` (uses bundled `vendor/harness/preview_metrics.py`).
6. Run `python3 read_mining_limits.py <protocol.json>` and record limits for the loop.

If `validate_network_state.sh` fails, fix `network_state.json` or stop with a clear error—do not proceed to the mining loop.
