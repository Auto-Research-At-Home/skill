# 0G Galileo - Miner Path Excerpt

This file distills the miner submit path from `autoresearch-create/references/onchain-0g-galileo.md`. Use the verifier reference for approve, reject, claim, release, and expire flows.

## Deployment Layout

- Default bundled paths for validator scripts: `contracts/0g-galileo-testnet/deployment.json` and `contracts/0g-galileo-testnet/artifacts/*.json`.
- Network: chain ID `16602`, RPC `https://evmrpc-testnet.0g.ai` unless overridden by `ARAH_RPC_URL`.
- Contracts: `ProjectRegistry`, `ProposalLedger`, `VerifierRegistry`. `ProjectToken` is per project, from `ProjectRegistry.tokenOf(projectId)`.

## Hashes

- `protocolHash`, `repoSnapshotHash`, `benchmarkHash`, and `baselineMetricsHash` are SHA-256 file-byte hashes encoded as `0x` plus 64 hex characters.
- `claimedAggregateScore` is an `int256`; decimal metrics are scaled with the project metric scale, defaulting to `1000000` in these scripts unless `ARAH_METRIC_SCALE` overrides it.

## Miner Transaction Order

1. Read `ProjectRegistry.tokenOf(projectId)`.
2. Buy project tokens if the wallet needs more stake.
3. Approve `ProposalLedger` to transfer the stake.
4. Submit with `ProposalLedger.submit(projectId, codeHash, benchmarkLogHash, claimedAggregateScore, stake, rewardRecipient)`.

`rewardRecipient` is explicit and can differ from `msg.sender`.

## Registry Reads

- `ProjectRegistry.getProject(projectId)` returns project metadata including `protocolHash`.
- `ProjectRegistry.currentBestAggregateScore(projectId)` returns the network best score as `int256`; compare with the same metric scale used at project creation.
