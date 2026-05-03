# 0G Galileo On-Chain Publishing

Use this reference only after the create flow has a finalized `protocol.json`, the benchmark has passed the Step 5b approval gate, and an eligible project has a measured baseline.

## Deployment

- Chain: 0G Galileo testnet
- Chain ID: `16602`
- RPC: `https://evmrpc-testnet.0g.ai`
- Deployment manifest: `contracts/0g-galileo-testnet/deployment.json`
- ABI/artifacts: `contracts/0g-galileo-testnet/artifacts/*.json`

Deployed contracts:

| Contract | Address |
|---|---|
| `VerifierRegistry` | `0x257974E406f206BfAEd3abB8D93C232e3226f032` |
| `ProposalLedger` | `0x701db5f8Ed847651209A438695dfe5520adD6A5A` |
| `ProjectRegistry` | `0xc84768e450534974C0DD5BAb7c1b695744124136` |
| `ProjectToken` | deployed per project by `ProjectRegistry.createProject(...)` |

## ABI-derived create flow

Create projects by calling:

```text
ProjectRegistry.createProject(
  bytes32 protocolHash,
  bytes32 repoSnapshotHash,
  bytes32 benchmarkHash,
  int256 baselineAggregateScore,
  bytes32 baselineMetricsHash,
  string tokenName,
  string tokenSymbol,
  uint256 basePrice,
  uint256 slope,
  uint256 minerPoolCap
) returns (uint256 projectId, address tokenAddr)
```

Before submitting a transaction, confirm or derive:

- `protocolHash`: bytes32 digest of the immutable protocol bundle or its canonical off-chain artifact.
- `repoSnapshotHash`: bytes32 digest of the repository snapshot miners must start from.
- `benchmarkHash`: bytes32 digest of the immutable benchmark/harness bundle.
- `baselineAggregateScore`: signed integer representation of the approved baseline metric. If the metric is decimal, choose and record a deterministic scale before publishing.
- `baselineMetricsHash`: bytes32 digest of the baseline metrics artifact/log.
- `tokenName`, `tokenSymbol`, `basePrice`, `slope`, `minerPoolCap`: tokenomics parameters. Ask the user if not already specified.

The `ProjectCreated(projectId, creator, token, protocolHash)` event gives the canonical `projectId` and per-project `ProjectToken` address. Store those values with the protocol authoring artifacts.

Do not pass raw IPFS CIDs or URLs into `bytes32` fields. Store CIDs/URLs off-chain and pass the agreed bytes32 digest that the contract expects.

Use `scripts/publish_project_0g.mjs` for publishing. It renders a WalletConnect/Reown QR code in the terminal, sends `eth_sendTransaction` through the wallet session after user approval, polls the 0G RPC for the receipt, and writes `publish_0g_galileo.json`.

## ABI-derived mining and review flow

Miner path:

1. Read `ProjectRegistry.tokenOf(projectId)` to find the project token.
2. Buy project tokens with `ProjectToken.buy()` if needed.
3. Approve stake transfer with `ProjectToken.approve(ProposalLedger, stake)`.
4. Submit a proposal with:

```text
ProposalLedger.submit(
  uint256 projectId,
  bytes32 codeHash,
  bytes32 benchmarkLogHash,
  int256 claimedAggregateScore,
  uint256 stake,
  address rewardRecipient
) returns (uint256 proposalId)
```

The `rewardRecipient` is separate from the transaction sender/miner and must be set deliberately.

Verifier path:

1. Check allowlist status with `VerifierRegistry.isVerifier(verifier)`.
2. A verifier claims work with `ProposalLedger.claimReview(proposalId)`.
3. Approve with `ProposalLedger.approve(proposalId, verifiedAggregateScore, metricsHash)` or reject with `ProposalLedger.reject(proposalId, metricsHash)`.
4. Expired proposals can be finalized with `ProposalLedger.expire(proposalId)`.

Approved proposals return stake to the miner and mint the reward to `rewardRecipient`. Rejected or expired proposals slash stake 50/50 across burn and verifier-pool paths according to the deployed ledger constants.
