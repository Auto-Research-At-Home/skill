# Prompt banner

See [`prompt_banner.md`](prompt_banner.md).

# Verify loop (documentation)

This prompt currently describes the legacy 0G verifier loop. For Solana
projects, use `run_validate_loop_solana.mjs` unless explicitly debugging a
single step. If the user says "start autoresearch validating <token_address>",
treat the token address as the Solana project mint, resolve and print the
project summary, check Solana CLI/keypair/balance, check the verifier PDA, then
run the Solana loop with `--token-address <mint> --keypair ~/.config/solana/id.json --yes`.

The Solana loop must claim first. Only after `claim-review` succeeds may it
download proposal artifacts, rerun the benchmark, upload verifier metrics or
reject evidence to Irys with the validator wallet, and approve/reject/release.
Do not skip the Irys upload for approve/reject.

1. Discover claimable `proposalId`s (`watch_proposals.py` or `run_validate_loop.py`).
2. Resolve code + miner benchmark log via `ARAH_ARTIFACT_INDEX` (`artifact_resolve.py`).
3. Compare `protocol.json` SHA-256 to `ProjectRegistry.getProject(...).protocolHash` unless skipped by env.
4. `claimReview` → `verify_static_gates.py` → `run_verify_trial.sh`.
5. Compare scaled int metric to on-chain `claimedAggregateScore`.
6. `finalize_approve` or `finalize_reject` with metrics log hash.
