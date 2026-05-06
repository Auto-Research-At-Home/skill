# 0G Galileo — miner path (excerpt)

This file distills the **miner submit path** from [`autoresearch-create/references/onchain-0g-galileo.md`](../../autoresearch-create/references/onchain-0g-galileo.md). Use that doc for full deployment tables and publish (`createProject`) flow.

## Deployment layout

- Default bundled paths (inside `autoresearch-mine`): `contracts/0g-galileo-testnet/deployment.json`, `contracts/0g-galileo-testnet/artifacts/*.json`.
- Network: chainId **16602**, RPC **`https://evmrpc-testnet.0g.ai`** (see `deployment.json`).
- Contracts: **`ProjectRegistry`**, **`ProposalLedger`**, **`VerifierRegistry`**. **`ProjectToken`** is **per project** (address from `tokenOf`, not in root `deployment.json`).

## Hashes (must match publish pipeline)

- **`protocolHash`**, **`repoSnapshotHash`**, **`benchmarkHash`**, **`baselineMetricsHash`**: **SHA-256** of the respective file bytes, encoded as **`0x` + 64 hex chars** (bytes32). Same rule as `scripts/publish_project_0g_lib.mjs` (`hashFileBytes32`).
- **`claimedAggregateScore`**: **`int256`** on chain; the float metric in `protocol.json` is scaled with an integer **metric scale** agreed at `createProject` (same scale as baseline). Encode/decode consistently with the publish script.

## Miner transaction order

0. **Wallet preflight:** `ARAH_PRIVATE_KEY` must derive the miner EVM address that will pay gas, buy missing stake, approve the ledger, and submit. Scripts load `.env` from the current working directory, so if the key is missing ask the user to create `.env` with `ARAH_PRIVATE_KEY=0x...` and optional `ARAH_STAKE=1` (whole tokens; ProjectToken `decimals() == 0`, so the contract only requires `stake > 0`). Run **`scripts/check_wallet.py`** with `--project-id` or `--token-address` before starting the mining loop.
1. **`ProjectRegistry.tokenOf(projectId)`** → project token address. If the miner only has a token address, scan `tokenOf(0..nextProjectId-1)` to recover `projectId`.
2. **`ProjectToken.balanceOf(wallet)`** and **`allowance(wallet, ProposalLedger)`** → check stake readiness.
3. **`ProjectToken.costBetween(totalSupply, totalSupply + missingStake)`** → quote the native value needed to buy missing stake.
4. **`ProjectToken.buy()`** if the wallet needs more tokens for stake (bonding-curve buy).
5. **`ProjectToken.approve(ProposalLedger_address, stake)`** so the ledger can pull stake.
6. **`ProposalLedger.submit(projectId, codeHash, benchmarkLogHash, claimedAggregateScore, stake, rewardRecipient)`** → `proposalId`.

`rewardRecipient` is explicit and may differ from `msg.sender`.

## Registry reads (frontier / sync)

- **`ProjectRegistry.getProject(projectId)`** — project metadata including **`protocolHash`**, **`token`**, etc.
- **`ProjectRegistry.currentBestAggregateScore(projectId)`** — network best as **`int256`** (compare using the same metric scale as create).
- **`ProjectRegistry.tokenOf(projectId)`** — project token address. To mine from only a token address, `scripts/bootstrap_from_registry.py` scans `tokenOf(0..nextProjectId-1)` to recover the project id, then reads the project hashes.

## Bootstrap from token address

When publish used `--upload-artifacts-to-0g`, the project hash fields are 0G Storage roots. Miners can bootstrap directly:

```bash
python3 scripts/bootstrap_from_registry.py \
  --token-address 0xProjectTokenAddress \
  --output-dir /tmp/arah-mine/my-project \
  --download-artifacts
```

This downloads `protocol.json`, `repo-snapshot.tar`, `benchmark.tar`, and `baseline-metrics.log`, verifies each 0G Merkle root, unpacks the repo snapshot, initializes `.autoresearch/mine`, and writes registry frontier state.

If the project was published with plain SHA-256 file hashes, the registry proves integrity but does not provide retrievable storage roots. In that case, supply the local protocol and repo checkout to `bootstrap_from_registry.py` without `--download-artifacts`.

## Automatic buy / approve / submit

`scripts/submit_proposal.py` accepts either **`--project-id`** or **`--token-address`**. With **`--auto-buy`**, it resolves the ProjectToken, checks the wallet token balance, quotes any missing stake with `costBetween`, sends `buy()` with the quoted value plus slippage margin, then sends `approve()` and `submit()`.

Use `--dry-run` to print unsigned transactions after RPC resolution, or `--print-only` to verify local hashes and metric scaling without RPC (requires `--project-id`).

For normal mining, agents should call **`scripts/submit_trial_proposal.py`** instead of assembling hashes by hand. It archives the committed winning repo state from `HEAD`, uses `.autoresearch/mine/runs/<trial_id>/stdout.log` as the benchmark log, and then calls `submit_proposal.py`. The trigger is automatic: if a completed trial beats the freshly synced `ProjectRegistry.currentBestAggregateScore(projectId)`, submit the proposal transaction immediately.

## Out of scope here

Verifier **`approve` / `reject` / `claimReview`** flows are documented in the full onchain reference, not required for local mining PR gates.
