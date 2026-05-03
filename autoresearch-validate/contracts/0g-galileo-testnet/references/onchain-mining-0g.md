# 0G Galileo — miner path (excerpt)

This file distills the **miner submit path** from [`autoresearch-create/references/onchain-0g-galileo.md`](../../../../autoresearch-create/references/onchain-0g-galileo.md). Use that doc for full deployment tables and publish (`createProject`) flow.

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

## Out of scope here

Verifier **`approve` / `reject` / `claimReview`** flows are documented in the full onchain reference, not required for local mining PR gates.
