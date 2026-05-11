# Mining bootstrap (agent prompt)

You are preparing an **autoresearch-mine** workspace. Operate **unattended**: do not ask the miner to confirm benchmark definitions (that is **autoresearch-create** only).

## Inputs

- Either a Solana project id / Irys publish manifest, a legacy 0G project id / ProjectToken address, or absolute paths to finalized `protocol.json` (`schemaKind: protocol`, `meta.eligibility: eligible`) and the **target repository root** (checkout of `meta.repo`).
- Optional path to `program.md` (human-readable mirror of the protocol).
- For legacy 0G on-chain mining, an initialized mining wallet keystore (`scripts/wallet.py init --id <id>`). The skill calls `submit_proposal.py` / `submit_trial_proposal.py` with `--wallet-id <id>` and `--passphrase-file` (or `ARAH_WALLET_PASSPHRASE`). It does **not** read `ARAH_PRIVATE_KEY`. The user's main wallet is only used as `--reward-recipient`; the mining keystore signs `buy()`, `approve()`, and `submit()`.
- For Solana on-chain mining, a dedicated local Solana keypair JSON for live `submit`, funded with native SOL for gas and missing project-token buys, plus the user's reward-recipient Solana wallet address. Only ask the user for faucet funding of the generated miner public key and for the reward-recipient address; do CLI installation and keypair setup yourself.

## Steps

1. Export `GIT_TERMINAL_PROMPT=0` for all subsequent shell/git operations.
2. For Solana projects, read `references/onchain-mining-solana.md` and finish wallet preflight before bootstrapping. If `solana --version` fails, install the CLI from the official Solana installer and verify it. Create or reuse `~/.config/solana/arah-mine-<project_id>.json`, print its public key, ask the user to fund that address with the faucet if the native SOL balance is zero/low, and ask for the reward-recipient address now. Prefer `bootstrap_from_solana.mjs` with the project id so the skill fetches the `Project` account, reads on-chain Irys ids, downloads those files, and verifies hashes before mining. Use `download_irys_artifacts.mjs` only when given explicit hashes/ids or a manifest. Do not run 0G wallet preflight or 0G proposal submit scripts for Solana projects; use `submit_trial_proposal.py --chain solana` after an improvement. The Solana submitter buys missing project-token stake with `buy()` before `submit`, so keep native SOL available for both gas and token purchase.
3. For legacy 0G on-chain mining, run **`check_wallet.py --wallet-id <id>`** before bootstrapping or trials, plus `--project-id` or `--token-address`. If the keystore does not exist, ask the user to run `python3 scripts/wallet.py init --id <id>`, fund the printed address from their main wallet, then rerun preflight. Optional `ARAH_STAKE=1` (whole tokens; ProjectToken `decimals() == 0`) overrides the default stake of `1`. Stop if the wallet has no native gas or cannot cover/buy the missing ProjectToken stake.
4. If starting from a legacy 0G token address or project id, run **`bootstrap_from_registry.py`** to resolve `ProjectRegistry`, download 0G artifacts when available, initialize `.autoresearch/mine`, and write registry frontier state. If starting from local files, run `init_mine_workspace.sh <repo_root>` from `autoresearch-mine/scripts/`.
5. Set `.autoresearch/mine/network_state.json`: either edit **`templates/network_state.manual.json`** placeholders, **or** call **`sync_registry_frontier.py`** with **`--project-id`**, **`--repo-root`**, and **`--protocol-json`** so `source` is **`registry`** (requires **`pip install -r requirements-chain.txt`**). Then run **`validate_network_state.sh`**.
6. Run `preview_mining_context.sh <protocol.json>` (uses bundled `vendor/harness/preview_metrics.py`).
7. Run `python3 read_mining_limits.py <protocol.json>` and record limits for the loop.

If `validate_network_state.sh` fails, fix `network_state.json` or stop with a clear error—do not proceed to the mining loop.
