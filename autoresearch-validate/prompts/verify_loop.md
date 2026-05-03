# Prompt banner

See [`prompt_banner.md`](prompt_banner.md).

# Verify loop (documentation)

1. Discover claimable `proposalId`s (`watch_proposals.py` or `run_validate_loop.py`).
2. Resolve code + miner benchmark log via `ARAH_ARTIFACT_INDEX` (`artifact_resolve.py`).
3. Compare `protocol.json` SHA-256 to `ProjectRegistry.getProject(...).protocolHash` unless skipped by env.
4. `claimReview` → `verify_static_gates.py` → `run_verify_trial.sh`.
5. Compare scaled int metric to on-chain `claimedAggregateScore`.
6. `finalize_approve` or `finalize_reject` with metrics log hash.
