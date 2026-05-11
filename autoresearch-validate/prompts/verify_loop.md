# Prompt banner

See [`prompt_banner.md`](prompt_banner.md).

# Verify loop (documentation)

This prompt currently describes the legacy 0G verifier loop. For Solana
projects, read `references/onchain-verify-solana.md` and use
`resolve_proposal_artifacts_solana.mjs` to fetch the proposal account and
download code/log artifacts by on-chain Irys ids before benchmark checks. Use
`settle_proposal_solana.mjs` for claim/approve/reject/release/expire
transactions after checks, passing `metricsIrysId` for approve/reject.

1. Discover claimable `proposalId`s (`watch_proposals.py` or `run_validate_loop.py`).
2. Resolve code + miner benchmark log via `ARAH_ARTIFACT_INDEX` (`artifact_resolve.py`).
3. Compare `protocol.json` SHA-256 to `ProjectRegistry.getProject(...).protocolHash` unless skipped by env.
4. `claimReview` → `verify_static_gates.py` → `run_verify_trial.sh`.
5. Compare scaled int metric to on-chain `claimedAggregateScore`.
6. `finalize_approve` or `finalize_reject` with metrics log hash.
