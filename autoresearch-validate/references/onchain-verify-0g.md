# 0G Galileo — verifier (claim / approve / reject)

Use with finalized deployments under `contracts/0g-galileo-testnet/`. Full publish flow: [`autoresearch-create/references/onchain-0g-galileo.md`](../../autoresearch-create/references/onchain-0g-galileo.md).

## Deployment

- Chain: 0G Galileo testnet, chain id **16602**
- RPC: `https://evmrpc-testnet.0g.ai` (overridable via `ARAH_RPC_URL`)
- `ProposalLedger` and `VerifierRegistry` addresses: see `deployment.json` in this skill

## Verifier path (ABI)

1. `VerifierRegistry.isVerifier(verifier)` must be true.
2. `ProposalLedger.claimReview(proposalId)`
3. `ProposalLedger.approve(proposalId, verifiedAggregateScore, metricsHash)` or `reject(proposalId, metricsHash)` or `releaseReview(proposalId)` (operational release) or `expire(proposalId)` (expiry window).

## Status enum (`uint8`)

The `getProposal` tuple includes `status` as the last field. Default mapping is shipped in [`constants/status_enum.json`](../constants/status_enum.json) (`Submitted=0` …). If your deployment differs, set `ARAH_CLAIMABLE_STATUS_CODES` to the comma-separated list of claimable status integers.

**Why defaults might need updates:** the on-chain `nextProposalId` on Galileo was **0** at the time of writing, so the enum was not derivable from live proposals. Re-verify against verified contract source before production stakes.

## `metricsHash` (normative for this skill)

On-chain `approve` / `reject` accept `metricsHash` as **`bytes32`**.

This skill sets **`metricsHash` = SHA-256 (32 bytes) of the verifier harness stdout log file** referenced by `--metrics-log-file` in `finalize_approve.py` / `finalize_reject.py`, encoded as hex **`0x` + 64 hex characters** (same as other ARAH file hashes).

- Approve: hash of **`.autoresearch/verify/runs/<review_id>/stdout.log`** after a successful `run_verify_trial.sh`.
- Reject: hash of an evidence file (stderr, JSON diff, or short UTF-8 reason) passed to `--metrics-log-file`.

This is **not** automatically equal to the miner’s `benchmarkLogHash`. The miner’s log commitment is checked **offline** when resolving artifacts (`artifact_resolve.py`) against the artifact index.

## Slash economics

Read live constants from the ledger (`SLASH_BPS_TO_BURN`, `SLASH_BPS_TO_VERIFIER_POOL`, `BPS_DENOMINATOR`) via `eth_call`, or inspect the deployed `ProposalLedger` artifact. Rejected proposals slash stake across burn + verifier pool per deployed rules.

## Protocol hash compare

`ProjectRegistry.getProject(projectId)` returns `protocolHash` (`bytes32`). With default settings, this skill compares **`SHA-256 (protocol.json bytes)`** from the extracted tarball to that field.

If your project published **`protocolHash` as a 0G Storage Merkle root** (not raw SHA-256 of JSON), set **`ARAH_SKIP_PROTOCOL_HASH_COMPARE=1`** and enforce alignment through your artifact pipeline (not recommended unless you operate the indexer yourself).
