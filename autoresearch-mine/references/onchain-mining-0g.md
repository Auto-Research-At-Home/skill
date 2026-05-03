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

1. **`ProjectRegistry.tokenOf(projectId)`** → project token address.
2. **`ProjectToken.buy()`** if the wallet needs more tokens for stake (bonding-curve buy).
3. **`ProjectToken.approve(ProposalLedger_address, stake)`** so the ledger can pull stake.
4. **`ProposalLedger.submit(projectId, codeHash, benchmarkLogHash, claimedAggregateScore, stake, rewardRecipient)`** → `proposalId`.

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

## Out of scope here

Verifier **`approve` / `reject` / `claimReview`** flows are documented in the full onchain reference, not required for local mining PR gates.
