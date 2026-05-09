# Solana OpenResearch Publishing

OpenResearch Solana program id:

```text
ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3
```

Deployment:

```text
Network: devnet
RPC: https://api.devnet.solana.com
```

Frontend env:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_OPEN_RESEARCH_PROGRAM_ID=ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3
```

0G Storage remains the artifact layer. The Solana program stores the same
`bytes32` roots for protocol, repo snapshot, benchmark bundle, and baseline
metrics. `scripts/publish_project_solana.mjs` reuses the existing artifact flags
and can compute 0G roots in dry-run mode:

```bash
node scripts/publish_project_solana.mjs \
  --protocol-json ./out/protocol.json \
  --repo-snapshot-file ./repo-snapshot.tar \
  --benchmark-file ./benchmark.tar \
  --baseline-metrics-file ./out/baseline_run.log \
  --baseline-aggregate-score 12345 \
  --token-name "My Research Token" \
  --token-symbol MRT \
  --base-price 100000 \
  --slope 1000 \
  --miner-pool-cap 21000000 \
  --creator <solana-pubkey> \
  --project-id 0 \
  --upload-artifacts-to-0g \
  --dry-run
```

For a live Solana transaction, pass an Anchor IDL and a Solana keypair:

```bash
node scripts/publish_project_solana.mjs ... \
  --idl ./target/idl/open_research.json \
  --keypair ~/.config/solana/id.json \
  --yes
```

Live 0G Storage uploads still require a 0G/EVM storage signer. Set
`ZG_STORAGE_PRIVATE_KEY` only for an intentionally local publisher wallet with
0G testnet gas.

## PDA Seeds

All numeric ids are little-endian `u64`:

| Account | Seeds |
|---|---|
| config | `"config"` |
| verifier | `"verifier"`, verifier public key |
| project | `"project"`, project id |
| mint | `"mint"`, project id |
| mint authority | `"mint_authority"`, project id |
| SOL vault | `"sol_vault"`, project id |
| project pool | `"pool"`, project id |
| proposal | `"proposal"`, proposal id |
| proposal escrow | `"proposal_escrow"`, proposal id |
| claimable | `"claim"`, project id, account public key |
| token metadata | Metaplex metadata PDA for the project mint |

Use `scripts/solana_open_research.mjs` for canonical derivation and input
conversion. It validates bytes32 hashes, `u64` token/lamport fields, `i64`
scores, Associated Token Accounts, and Anchor account maps.

## Frontend Action Items

1. Copy the Anchor IDL into the frontend and build calls through
   `program.methods.*`.
2. Call `initialize` once after deployment if it was not already called.
3. Add verifiers using the authority wallet.
4. Derive PDAs from seeds instead of storing per-module contract addresses.
5. Treat project tokens as SPL Token mints with `decimals = 0`.
6. Convert every EVM `address` to a Solana `PublicKey`.
7. Convert every EVM `bytes32` to exactly 32 bytes.
8. Convert EVM `uint256` values to Anchor `BN`, then ensure on-chain
   token/lamport amounts fit `u64`.
9. Replace ERC20 approval/allowance flows with wallet-signed SPL token account
   transfers.

Detailed frontend examples are mirrored in
`open_research/FRONTEND_INTEGRATION_README.md`.
