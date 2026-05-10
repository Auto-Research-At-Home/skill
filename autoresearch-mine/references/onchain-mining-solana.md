# Solana OpenResearch — miner path

The Solana path is now the default for projects created by
`autoresearch-create`. Project metadata is stored in the OpenResearch Solana
program, and project artifacts are stored on Irys.

## What Changed From 0G

- Project ids are Solana `u64` ids, not 0G EVM registry ids.
- Project/token/proposal addresses are PDAs, not deployed EVM contract
  addresses.
- Artifact fields are raw SHA-256 bytes32 values for file bytes, not 0G
  Storage Merkle roots.
- Artifact retrieval is via Irys ids/gateway URLs. When a publish manifest is
  unavailable, resolve by Irys tags:
  - `App-Name = OpenResearch AutoResearch`
  - `Artifact-Role = protocol | repoSnapshot | benchmark | baselineMetrics`
  - `SHA-256 = <hex without 0x>`
- Stake/token flows use SPL token accounts and program instructions. There is
  no ERC20 `approve`.

## Implemented Now

`scripts/download_irys_artifacts.mjs` downloads and verifies the four project
bootstrap artifacts from Irys. It accepts raw on-chain hashes:

```bash
node scripts/download_irys_artifacts.mjs \
  --output-dir /tmp/arah-project/artifacts \
  --protocol-hash 0x... \
  --repo-snapshot-hash 0x... \
  --benchmark-hash 0x... \
  --baseline-metrics-hash 0x... \
  --network devnet
```

If the creator supplied `storage_irys.json`, pass it as a fast path:

```bash
node scripts/download_irys_artifacts.mjs ... \
  --manifest /path/to/storage_irys.json
```

The script writes `download_irys_artifacts.json` and verifies every downloaded
file by SHA-256 before it can be used for mining.

## Proposal Submission

The skill bundles the full OpenResearch Anchor IDL at
`contracts/solana-open-research/open_research.json`. Submit improved trials
with the same archive-and-log packaging used by the legacy path:

```bash
python3 scripts/submit_trial_proposal.py \
  --chain solana \
  --project-id <project_id> \
  --repo-root /path/to/repo \
  --trial-id <trial_id> \
  --claimed-metric <metric> \
  --reward-recipient <SOLANA_REWARD_PUBKEY> \
  --solana-keypair ~/.config/solana/id.json \
  --yes
```

Dry-run without a keypair:

```bash
python3 scripts/submit_trial_proposal.py \
  --chain solana \
  --project-id <project_id> \
  --repo-root /path/to/repo \
  --trial-id <trial_id> \
  --claimed-metric <metric> \
  --reward-recipient <SOLANA_REWARD_PUBKEY> \
  --solana-miner <SOLANA_MINER_PUBKEY> \
  --solana-proposal-id <proposal_id> \
  --dry-run
```

Direct script:

```bash
node scripts/submit_proposal_solana.mjs \
  --project-id <project_id> \
  --code-file .autoresearch/mine/submissions/<trial_id>/repo-snapshot.tar \
  --benchmark-log-file .autoresearch/mine/runs/<trial_id>/stdout.log \
  --claimed-metric <metric> \
  --stake 1 \
  --reward-recipient <SOLANA_REWARD_PUBKEY> \
  --keypair ~/.config/solana/id.json \
  --yes
```

## Remaining Follow-up

1. Add `scripts/bootstrap_from_solana.mjs`:
   - derive project PDA from project id,
   - fetch and decode the `Project` account,
   - call `download_irys_artifacts.mjs`,
   - unpack the repo snapshot,
   - initialize `.autoresearch/mine`,
   - write `network_state.json` with `source: solana`.
2. Add `scripts/sync_solana_frontier.mjs`.
