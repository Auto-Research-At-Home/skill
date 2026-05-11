---
name: autoresearch-validate
description: Verify OpenResearch mining proposals on-chain. Resolve code/benchmark artifacts by bytes32, rerun bundled harness, deterministic static gates, and approve/reject when the chain path is supported. Fully unattended legacy 0G driver with artifact index, no GitHub PR workflow, plus Solana settlement wrappers backed by the bundled full IDL. Use when operating a verifier node or rerunning benchmark proofs.
---

# autoresearch-validate

Operate an **unattended verifier** against **legacy `ProposalLedger`** on 0G Galileo (or override deployment via env). This skill **does not** watch GitHub PRs; settlement is **on-chain only**.

For projects created by the current `autoresearch-create` default path, use the
Solana validator loop. When the user says something like **"start autoresearch
validating `<token_address>`"**, treat `<token_address>` as the Solana project
token mint, resolve the project on-chain, print the project summary for
confirmation, check the validator's Solana CLI/keypair/signing setup, check the
validator PDA registration, then run
`scripts/run_validate_loop_solana.mjs --token-address <mint> --keypair ~/.config/solana/id.json --yes`.
The loop claims each proposal first; only after `claim-review` succeeds does it
download proposal artifacts, rerun the benchmark, upload verifier metrics or
reject evidence to Irys with the validator wallet, and approve/reject/release.

**Self-contained:** Bundled harness under [`vendor/harness/`](vendor/harness/), contracts under [`contracts/0g-galileo-testnet/`](contracts/0g-galileo-testnet/), and local fixtures under [`fixtures/`](fixtures/) are included so the skill can run after installation without sibling skill folders.

## Prerequisites

- `jq`, `bash`, `python3` on PATH (harness); `python3 -m pip install -r requirements-chain.txt` for RPC scripts.
- For Solana validation: Node dependencies installed (`npm install` from the repo root or `autoresearch-validate` root), Solana CLI on PATH, and a Solana keypair able to sign and pay gas. If `solana --version` fails, install it before proceeding.
- A sandbox runtime — **`podman`** (preferred), **`docker`**, or **`bwrap`**. Verifiers re-run untrusted miner code, so the harness refuses to execute it without a sandbox unless `ARAH_SANDBOX=none ARAH_SANDBOX_ALLOW_UNSAFE=1` is set explicitly (do not do this in production).
- **`VerifierRegistry.isVerifier(your_address)`** must be true on-chain.
- For Solana, the validator wallet must have a verifier PDA/account. If it is not registered, stop and report that directly; do not try to validate proposals.
- A passphrase-encrypted **verifier wallet keystore**: `python3 scripts/wallet.py init --id verifier-1`. All settlement scripts (`claim_review.py`, `finalize_approve.py`, `finalize_reject.py`, `release_review.py`, `expire_proposal.py`, `run_validate_loop.py`) take **`--wallet-id`** + **`--passphrase-file`** (or `ARAH_WALLET_PASSPHRASE`). They do **not** read `ARAH_PRIVATE_KEY`.
- **Exactly one** of **`ARAH_ARTIFACT_INDEX`** (local JSON file) or **`ARAH_ARTIFACT_INDEX_URL`** (HTTP GET) — maps each **`codeHash`** to downloadable artifacts (see [`schemas/artifact_index.schema.json`](schemas/artifact_index.schema.json)). `schemaVersion: "2"` lets index entries declare `sandbox_image_digest` and `network_policy_used`; the validator pins the harness to those exact values for the run, eliminating false rejects from sandbox / network drift between miner and verifier.

## Unattended rules

- Export **`GIT_TERMINAL_PROMPT=0`** for git-enabled harness steps.
- Do **not** prompt the operator mid-loop; stop on **`VALIDATE_MAX_PROPOSALS`**, empty queue, or fatal RPC/key errors.
- **`prompts/*.md`** are **non-authoritative** (documentation only).

## Environment variables

### Required for settlement

| Variable / argument | Purpose |
|----------|---------|
| `--wallet-id <id>` (CLI) | Verifier wallet keystore id from `scripts/wallet.py init` |
| `--passphrase-file <path>` (CLI) or `ARAH_WALLET_PASSPHRASE` | Passphrase source for the keystore |
| `ARAH_ARTIFACT_INDEX` **or** `ARAH_ARTIFACT_INDEX_URL` | Artifact manifest (see schema) |

### Chain overrides (same family as mine)

| Variable | Purpose |
|----------|---------|
| `ARAH_DEPLOYMENT_JSON` | Path to `deployment.json` (default: bundled `contracts/0g-galileo-testnet/deployment.json`) |
| `ARAH_RPC_URL` | RPC endpoint |
| `ARAH_CHAIN_ID` | Default **16602** |
| `ARAH_PROPOSAL_LEDGER` / `ARAH_PROJECT_REGISTRY` / `ARAH_VERIFIER_REGISTRY` | Address overrides |

### Metrics / protocol

| Variable | Purpose |
|----------|---------|
| `ARAH_METRIC_SCALE` | int256 scale for decimal metrics (default **1000000**, match `createProject`) |
| `ARAH_PROTOCOL_SUBPATH` | Path inside extracted tarball to `protocol.json` (default **`.autoresearch/publish/protocol.json`**) |
| `ARAH_SKIP_PROTOCOL_HASH_COMPARE` | If `1`/`true`/`yes`, skip SHA-256(protocol.json) vs `ProjectRegistry.protocolHash` |
| `ARAH_CLAIMABLE_STATUS_CODES` | Comma-separated claimable `status` integers (overrides [`constants/status_enum.json`](constants/status_enum.json)) |

### Records / limits

| Variable | Purpose |
|----------|---------|
| `ARAH_VERIFY_RECORD_ROOT` | Repo root where **`.autoresearch/verify/reviews.jsonl`** is appended (default: skill root directory) |
| `VALIDATE_MAX_PROPOSALS` | Cap per `run_validate_loop.py` run (default **50**, overridable by `--max-proposals`) |
| `ARAH_ARTIFACT_FETCH_TIMEOUT` | HTTP timeout seconds (default **120**) |
| `ARAH_EXTRA_PERMIT_GLOBS` | Extra `:`-separated glob permits for `verify_static_gates.py` |
| `AUTORESEARCH_CREATE_SCRIPTS` | Directory containing Solana helper modules (`solana_open_research.mjs`, `irys_storage.mjs`); defaults to sibling `autoresearch-create/scripts`. |

## Machine layout

| Path | Role |
|------|------|
| `.autoresearch/verify/reviews.jsonl` | Append-only review records |
| `.autoresearch/verify/runs/<review_id>/stdout.log` | Harness stdout |
| `templates/chain_cursor.json` | Optional future event-indexer cursor |

Initialize with **`scripts/init_verify_workspace.sh <repo_root>`**.

## Bundled resources

| Resource | Role |
|----------|------|
| `contracts/solana-open-research/` | Solana program deployment metadata + full bundled Anchor IDL. |
| `contracts/0g-galileo-testnet/` | `deployment.json` + ABIs (`ProposalLedger`, `ProjectRegistry`, `VerifierRegistry`, `ProjectToken`) |
| `vendor/harness/` | `run_baseline.sh` trial harness (sync with create/mine) |
| `scripts/chain_config.py` | Resolve deployment + env |
| `scripts/artifact_resolve.py` | Download tarball + verify `codeHash`; verify miner benchmark log vs `benchmarkLogHash` |
| `scripts/resolve_proposal_artifacts_solana.mjs` | Fetch Solana `Proposal`, download code/log by on-chain Irys ids, and verify hashes. |
| `scripts/verify_static_gates.py` | Forbidden globs + permit lists + red-flag regex |
| `scripts/run_verify_trial.sh` | Runs harness under `.autoresearch/verify/runs/` |
| `scripts/run_validate_loop.py` | End-to-end unattended pipeline |
| `scripts/run_validate_loop_solana.mjs` | Solana validator daemon: resolve project by token mint/project id, check CLI + verifier PDA, poll proposals, claim first, verify, upload metrics/evidence to Irys, then settle. |
| `scripts/watch_proposals.py` | Print claimable proposal ids |
| `scripts/check_verifier_eligibility.py` | `isVerifier` query |
| `scripts/claim_review.py` | `claimReview` |
| `scripts/finalize_approve.py` | `approve` |
| `scripts/finalize_reject.py` | `reject` |
| `scripts/release_review.py` | `releaseReview` |
| `scripts/expire_proposal.py` | `expire` |
| `scripts/settle_proposal_solana.mjs` | Solana `claim_review`, `approve`, `reject`, `release_review`, `expire`, and `claim_reward`. |
| `scripts/upload_irys_file_solana.mjs` | Upload verifier metrics/evidence to Irys using the validator Solana keypair and print the Irys id used by settlement. |
| `scripts/metrics_hash.py` | SHA-256 → bytes32 hex |
| `scripts/parse_baseline_metric.py` | Parse `BASELINE_METRIC=` from harness log |
| `references/onchain-verify-0g.md` | Verifier-specific hash + economics notes |
| `references/onchain-mining-0g.md` | Miner submit-path context needed when interpreting proposals |
| `references/onchain-verify-solana.md` | Solana + Irys verifier path, reusable checks, and settlement blockers. |
| `fixtures/build_synthetic_fixture.py` | Builds local fixture data for `scripts/run_tests.sh` |

## Pipeline ordering (normative)

The ordering below is for the legacy 0G path. For Solana projects,
`run_validate_loop_solana.mjs` is the normative unattended path:

1. Resolve the project from `--token-address <project_mint>` or `--project-id`.
2. Print project identity (`projectId`, token mint/name/symbol, current best,
   program id, cluster) before live mode; require `--yes` to proceed.
3. Check `solana --version`, keypair readability, CLI address, and balance.
4. Check the validator PDA. If missing, print "not registered as verifier" and stop with no transactions.
5. Poll `Proposal` accounts for the project with `status=Pending` and `stake > 0`.
6. Send `claim-review`. If it fails, skip that proposal.
7. Download proposal code/log from on-chain Irys ids and verify SHA-256 hashes.
8. Extract code, run static gates, rerun the benchmark in the sandbox, parse `BASELINE_METRIC`.
9. Convert metric to aggregate score: `maximize => scaled(metric)`, `minimize => -scaled(metric)`, with `ARAH_METRIC_SCALE` semantics (`1e6` default).
10. If aggregate score equals `claimedAggregateScore`, upload verifier stdout log to Irys and `approve --verified-score-int256`.
11. If static gates fail or aggregate score mismatches, upload reject evidence to Irys and `reject`.
12. If the harness fails or metric parsing fails, `release-review` rather than slash.

Legacy 0G path:

1. **`getProposal`**: skip if `status` ∉ claimable set ([`constants/status_enum.json`](constants/status_enum.json)).
2. **`artifact_resolve`**: fail → **skip** (no chain tx), record `artifact_resolve_failed`.
3. Extract tarball; load **`protocol.json`** at `ARAH_PROTOCOL_SUBPATH`.
4. **Protocol hash**: `SHA-256(protocol.json)` vs `ProjectRegistry.getProject(projectId).protocolHash` unless skipped → mismatch → **`claimReview` + `reject`** (fraud).
5. Else **`claimReview`** → **`verify_static_gates`** → **`run_verify_trial`**.
6. Parse metric; compare scaled int to on-chain **`claimedAggregateScore`** (strict equality).
7. Outcomes:
   - **Match** → **`approve`** with `metricsHash = SHA-256(harness stdout log)`.
   - **Static-gate fail / metric mismatch / metric encode fail** → **`reject`** with evidence file as metrics log (slashing — these are unambiguous miner-side faults).
   - **Harness exit ≠ 0 / metric not parseable from log** → **`releaseReview`** (NOT reject). These signals are ambiguous: they could be miner-side, but they could also be verifier-side (no sandbox runtime, image divergence, `networkPolicy=full` without `ARAH_ALLOW_FULL_NETWORK=1`). Slashing on those signals is unsafe; let another verifier try. If every verifier fails, the proposal eventually expires.

## Script exit codes (selected)

| Script | Codes |
|--------|-------|
| `artifact_resolve.py` | 0 ok; 1 IO/validation; 2 missing index entry |
| `verify_static_gates.py` | 0 pass; 3 forbidden; 4 not permitted; 5 red flag |
| `check_verifier_eligibility.py` | 0 verifier; 2 not verifier |
| `watch_proposals.py` | 0 |
| `run_validate_loop.py` | 0 loop finished; 1 RPC / missing key |

## Out of scope

TEE attestation automation, IPFS/0G Storage upload daemons (operators supply **`ARAH_ARTIFACT_INDEX`**), GitHub PR merges.

## Final response

Report **`reviews.jsonl`** path, last proposal ids processed, and whether txs were sent (`--dry-run` if applicable).
