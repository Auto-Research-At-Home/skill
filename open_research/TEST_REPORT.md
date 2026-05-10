# OpenResearch Solana Integration Test Report

Date: 2026-05-09

## Scope

This report covers the client/skill integration added in this repository for
the deployed OpenResearch Solana Anchor program:

```text
Program ID: ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3
Network: devnet
RPC: https://api.devnet.solana.com
```

The Anchor program's own Rust/Anchor test report was not present in this
checkout. Copy the upstream program `open_research/TEST_REPORT.md` over this
file if you need the on-chain program test results rather than the client
integration test results.

## Verified Locally

Command:

```bash
npm test
```

Result:

```text
30 tests passed
0 tests failed
```

Coverage included:

- Solana program id and RPC configuration resolution.
- `bytes32` conversion into exactly 32 bytes.
- `u64` and `i64` boundary validation before Anchor serialization.
- Little-endian PDA derivation for config, verifier, project, mint, mint
  authority, SOL vault, project pool, proposal, proposal escrow, claimable,
  and Metaplex metadata accounts.
- Associated Token Account derivation for project SPL tokens.
- Anchor `createProject` argument and account-map generation.
- Anchor `submit` proposal account-map generation without ERC20 approval
  assumptions.
- JSON-safe Solana publish plan generation.
- Existing 0G publish and AXL sidechat tests.

Additional CLI smoke test:

```bash
node autoresearch-create/scripts/publish_project_solana.mjs \
  --protocol-json <tmp>/protocol.json \
  --repo-snapshot-file <tmp>/repo.tar \
  --benchmark-file <tmp>/benchmark.tar \
  --baseline-metrics-file <tmp>/baseline.log \
  --baseline-aggregate-score 7 \
  --token-name "Research Token" \
  --token-symbol RCH \
  --base-price 100 \
  --slope 2 \
  --miner-pool-cap 1000000 \
  --creator 9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj \
  --project-id 42 \
  --upload-artifacts-to-0g \
  --dry-run
```

Result: publish plan and 0G Storage root hashes were generated successfully.

## Not Run

- Live Solana `createProject` transaction, because this checkout does not
  include a funded authority keypair.
- `initialize` and `addVerifier` transactions, for the same reason.

## Frontend Readiness Checklist

- Copy the bundled Anchor IDL into the frontend, for example:
  `src/idl/open_research.json`.
- Configure:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_OPEN_RESEARCH_PROGRAM_ID=ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3
```

- Call `initialize` once after deployment if it has not already been called.
- Add verifiers using the authority wallet.
- Use PDA helpers and instruction examples in
  `open_research/FRONTEND_INTEGRATION_README.md`.
