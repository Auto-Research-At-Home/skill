---
name: autoresearch-validate
description: Verify OpenResearch mining proposals on-chain. Resolve code/benchmark artifacts by bytes32, rerun bundled harness, deterministic static gates, approve or reject via ProposalLedger. Fully unattended driver with artifact index, no GitHub PR workflow. Use when operating a verifier node or rerunning benchmark proofs against ProposalLedger.
---

# autoresearch-validate

Operate an **unattended verifier** against **`ProposalLedger`** on 0G Galileo (or override deployment via env). This skill **does not** watch GitHub PRs; settlement is **on-chain only**.

**Self-contained:** Bundled harness under [`vendor/harness/`](vendor/harness/), contracts under [`contracts/0g-galileo-testnet/`](contracts/0g-galileo-testnet/), and local fixtures under [`fixtures/`](fixtures/) are included so the skill can run after installation without sibling skill folders.

## Prerequisites

- `jq`, `bash`, `python3` on PATH (harness); `python3 -m pip install -r requirements-chain.txt` for RPC scripts.
- **`VerifierRegistry.isVerifier(your_address)`** must be true on-chain.
- **`ARAH_PRIVATE_KEY`** for transactions (`claimReview`, `approve`, `reject`, `releaseReview`, `expire`).
- **Exactly one** of **`ARAH_ARTIFACT_INDEX`** (local JSON file) or **`ARAH_ARTIFACT_INDEX_URL`** (HTTP GET) — maps each **`codeHash`** to downloadable artifacts (see [`schemas/artifact_index.schema.json`](schemas/artifact_index.schema.json)).

## Unattended rules

- Export **`GIT_TERMINAL_PROMPT=0`** for git-enabled harness steps.
- Do **not** prompt the operator mid-loop; stop on **`VALIDATE_MAX_PROPOSALS`**, empty queue, or fatal RPC/key errors.
- **`prompts/*.md`** are **non-authoritative** (documentation only).

## Environment variables

### Required for settlement

| Variable | Purpose |
|----------|---------|
| `ARAH_PRIVATE_KEY` | Verifier wallet (hex) |
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
| `contracts/0g-galileo-testnet/` | `deployment.json` + ABIs (`ProposalLedger`, `ProjectRegistry`, `VerifierRegistry`, `ProjectToken`) |
| `vendor/harness/` | `run_baseline.sh` trial harness (sync with create/mine) |
| `scripts/chain_config.py` | Resolve deployment + env |
| `scripts/artifact_resolve.py` | Download tarball + verify `codeHash`; verify miner benchmark log vs `benchmarkLogHash` |
| `scripts/verify_static_gates.py` | Forbidden globs + permit lists + red-flag regex |
| `scripts/run_verify_trial.sh` | Runs harness under `.autoresearch/verify/runs/` |
| `scripts/run_validate_loop.py` | End-to-end unattended pipeline |
| `scripts/watch_proposals.py` | Print claimable proposal ids |
| `scripts/check_verifier_eligibility.py` | `isVerifier` query |
| `scripts/claim_review.py` | `claimReview` |
| `scripts/finalize_approve.py` | `approve` |
| `scripts/finalize_reject.py` | `reject` |
| `scripts/release_review.py` | `releaseReview` |
| `scripts/expire_proposal.py` | `expire` |
| `scripts/metrics_hash.py` | SHA-256 → bytes32 hex |
| `scripts/parse_baseline_metric.py` | Parse `BASELINE_METRIC=` from harness log |
| `references/onchain-verify-0g.md` | Verifier-specific hash + economics notes |
| `references/onchain-mining-0g.md` | Miner submit-path context needed when interpreting proposals |
| `fixtures/build_synthetic_fixture.py` | Builds local fixture data for `scripts/run_tests.sh` |

## Pipeline ordering (normative)

1. **`getProposal`**: skip if `status` ∉ claimable set ([`constants/status_enum.json`](constants/status_enum.json)).
2. **`artifact_resolve`**: fail → **skip** (no chain tx), record `artifact_resolve_failed`.
3. Extract tarball; load **`protocol.json`** at `ARAH_PROTOCOL_SUBPATH`.
4. **Protocol hash**: `SHA-256(protocol.json)` vs `ProjectRegistry.getProject(projectId).protocolHash` unless skipped → mismatch → **`claimReview` + `reject`** (fraud).
5. Else **`claimReview`** → **`verify_static_gates`** → **`run_verify_trial`**.
6. Parse metric; compare scaled int to on-chain **`claimedAggregateScore`** (strict equality).
7. Match → **`approve`** with **metricsHash = SHA-256(harness stdout log)**. Mismatch / harness fail / static fail → **`reject`** with evidence file as metrics log.

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
