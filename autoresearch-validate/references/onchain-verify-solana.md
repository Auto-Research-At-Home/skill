# Solana OpenResearch — verifier path

Solana verification must validate the same benchmark claims as the legacy 0G
path, but the chain and artifact assumptions change.

## Causation From Solana Create

`autoresearch-create` now writes project artifacts to Irys and stores raw
SHA-256 artifact hashes in the Solana project account. Therefore a verifier
must:

1. Read project and proposal accounts from the OpenResearch Solana program.
2. Resolve project bootstrap artifacts from Irys by hash/tag or manifest.
3. Resolve proposal code and benchmark-log artifacts by their on-chain hashes.
4. Recompute SHA-256 over downloaded bytes before running the harness.
5. Approve/reject/release/expire via Solana instructions, not 0G
   `ProposalLedger` calls.

## What Can Be Reused

The verifier can keep these existing local checks:

- artifact SHA-256 verification,
- tarball extraction hardening,
- `protocol.json` hash comparison,
- static gates,
- sandboxed benchmark rerun,
- metric parsing and scaled integer comparison,
- append-only review records.

## What Must Change

- Replace `ProjectRegistry.getProject` with Solana `Project` account fetch.
- Replace `ProposalLedger.getProposal` with Solana `Proposal` account fetch.
- Replace `VerifierRegistry.isVerifier` with the verifier PDA/account check.
- Replace `claimReview`, `approve`, `reject`, `releaseReview`, and `expire`
  EVM transactions with Solana instructions.
- Replace EVM keystore signing with Solana wallet/keypair signing.
- Replace 0G artifact index defaults with Irys resolution where proposal
  artifacts are published to Irys.

## Settlement

The skill bundles the full OpenResearch Anchor IDL at
`contracts/solana-open-research/open_research.json`. Use
`scripts/settle_proposal_solana.mjs` after artifact resolution and benchmark
rerun:

```bash
node scripts/settle_proposal_solana.mjs \
  --action claim-review \
  --proposal-id <proposal_id> \
  --keypair ~/.config/solana/id.json \
  --yes

node scripts/settle_proposal_solana.mjs \
  --action approve \
  --proposal-id <proposal_id> \
  --verified-metric <metric> \
  --metrics-log-file .autoresearch/verify/runs/<review_id>/stdout.log \
  --keypair ~/.config/solana/id.json \
  --yes
```

Supported actions are `claim-review`, `release-review`, `approve`, `reject`,
`expire`, and `claim-reward`. Dry-runs can pass `--actor <pubkey>` instead of
`--keypair`; for approve/reject/expire dry-runs also pass `--project-id`, and
approve dry-runs pass `--miner` plus `--reward-recipient`.

## Remaining Follow-up

1. Add a Solana artifact resolver for proposal code/log artifacts. If proposal
   artifacts use Irys, resolve by `Artifact-Role` and SHA-256 tags; otherwise
   keep `ARAH_ARTIFACT_INDEX` mandatory.
2. Add `watch_solana_proposals.mjs`.
3. Add a Solana branch to `run_validate_loop.py`.
4. Extend review records with `chain`, `cluster`, `programId`, `projectPda`,
   and `proposalPda`.
