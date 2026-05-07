# Mining bootstrap (agent prompt)

You are preparing an **autoresearch-mine** workspace. Operate **unattended**: do not ask the miner to confirm benchmark definitions (that is **autoresearch-create** only).

## Inputs

- Either a 0G project id / ProjectToken address, or absolute paths to finalized `protocol.json` (`schemaKind: protocol`, `meta.eligibility: eligible`) and the **target repository root** (checkout of `meta.repo`).
- Optional path to `program.md` (human-readable mirror of the protocol).
- For on-chain mining, an initialized mining wallet keystore (`scripts/wallet.py init --id <id>`). The skill calls `submit_proposal.py` / `submit_trial_proposal.py` with `--wallet-id <id>` and `--passphrase-file` (or `ARAH_WALLET_PASSPHRASE`). It does **not** read `ARAH_PRIVATE_KEY`. The user's main wallet is only used as `--reward-recipient`; the mining keystore signs `buy()`, `approve()`, and `submit()`.

## Steps

1. Export `GIT_TERMINAL_PROMPT=0` for all subsequent shell/git operations.
2. For on-chain mining, run **`check_wallet.py --wallet-id <id>`** before bootstrapping or trials, plus `--project-id` or `--token-address`. If the keystore does not exist, ask the user to run `python3 scripts/wallet.py init --id <id>`, fund the printed address from their main wallet, then rerun preflight. Optional `ARAH_STAKE=1` (whole tokens; ProjectToken `decimals() == 0`) overrides the default stake of `1`. Stop if the wallet has no native gas or cannot cover/buy the missing ProjectToken stake.
3. If starting from a token address or project id, run **`bootstrap_from_registry.py`** to resolve `ProjectRegistry`, download 0G artifacts when available, initialize `.autoresearch/mine`, and write registry frontier state. If starting from local files, run `init_mine_workspace.sh <repo_root>` from `autoresearch-mine/scripts/`.
4. Set `.autoresearch/mine/network_state.json`: either edit **`templates/network_state.manual.json`** placeholders, **or** call **`sync_registry_frontier.py`** with **`--project-id`**, **`--repo-root`**, and **`--protocol-json`** so `source` is **`registry`** (requires **`pip install -r requirements-chain.txt`**). Then run **`validate_network_state.sh`**.
5. Run `preview_mining_context.sh <protocol.json>` (uses bundled `vendor/harness/preview_metrics.py`).
6. Run `python3 read_mining_limits.py <protocol.json>` and record limits for the loop.

If `validate_network_state.sh` fails, fix `network_state.json` or stop with a clear error—do not proceed to the mining loop.
