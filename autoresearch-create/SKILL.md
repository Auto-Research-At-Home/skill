---
name: autoresearch-create
description: Create an OpenResearch experiment protocol from a GitHub repository or local checkout. Builds a discovery prompt bundle, emits a DiscoveryDraft JSON, asks the protocol questionnaire, finalizes protocol.json, renders program.md, runs a baseline, then asks the user whether to publish an eligible project to the configured on-chain registry. Use when the user asks to create/start/bootstrap an autoresearch or OpenResearch project from a repo.
---

# autoresearch-create

Create an OpenResearch project contract from an existing repository. The output is a versioned experiment-loop protocol bundle:

- `protocol.json`: canonical machine-readable contract
- `program.md`: optional agent-facing render of the same contract
- discovery and baseline artifacts retained for auditability

Use the bundled experiment-protocol toolkit in this skill directory. Do not modify the bundled resource files while creating a project.

## Bundled resources

- `scripts/build_discovery_bundle.py`: clone or scan a repo and produce the LLM discovery bundle.
- `prompts/discovery_system.md` and `prompts/discovery_user.md`: discovery prompt contract.
- `protocol.schema.json`: schema for both `discoveryDraft` and finalized `protocol` documents.
- `questionnaire/universal.md` and `questionnaire/by_archetype/*.md`: human questions needed to finalize a protocol.
- `archetypes.yaml`: archetype taxonomy and defaults.
- `eligibility_rubric.md`: rules for `eligible`, `needs_harness`, and `ineligible`.
- `scripts/render_program_md.py` and `templates/program.md.j2`: render `program.md` from finalized `protocol.json`.
- `scripts/preview_metrics.py`: print a focused benchmark review block from `protocol.json` for the Step 5b approval gate.
- `scripts/run_baseline.sh`: run setup plus the primary command from `protocol.json` and parse the baseline metric.
- `scripts/publish_project_solana.mjs`: default publish path. Prepares and publishes the Solana OpenResearch `createProject` call via a localhost browser wallet (Phantom/Solflare/Backpack/Wallet Standard); dry-run emits PDA/account plans, live mode uploads artifacts to Irys and submits via the connected wallet without a filesystem private key.
- `scripts/local_solana_wallet_publish.mjs`: localhost HTTP + HTML page used by the Solana publish flow to discover Solana wallet extensions, upload artifacts to Irys, build the unsigned `createProject` transaction, and capture the wallet-signed transaction signature.
- `scripts/irys_storage.mjs`: prepares raw SHA-256 artifact hashes, Irys browser upload plans, and `storage_irys.json` metadata for Solana publishes.
- `scripts/publish_project_0g.mjs`: alternate path. Prepare and publish legacy 0G Galileo `ProjectRegistry.createProject(...)` via a localhost browser wallet flow, or write an unsigned transaction/dry-run artifact.
- `scripts/solana_open_research.mjs`: Solana client helpers for RPC/program config, bytes32/u64/i64 conversion, PDAs, Associated Token Accounts, and Anchor account maps.
- `contracts/solana-open-research/deployment.json`: OpenResearch Solana program id, public cluster RPC defaults, and the path to the bundled Anchor IDL.
- `contracts/solana-open-research/open_research.json`: bundled full Anchor IDL covering project creation, miner proposals, verifier settlement, reward claims, and account decoding. Used by default; override with `--idl` when testing another build.
- `contracts/0g-galileo-testnet/deployment.json`: deployed 0G Galileo testnet contract addresses and artifact paths (alternate path).
- `contracts/0g-galileo-testnet/artifacts/*.json`: ABI/artifact JSON for `ProjectRegistry`, `ProjectToken`, `ProposalLedger`, and `VerifierRegistry`.
- `references/onchain-solana.md`: Solana program id, PDA seeds, and publish flow. Read it for the default Solana publish work.
- `references/onchain-0g-galileo.md`: ABI-derived on-chain create, mining, and review flow for the 0G Galileo alternate path.
- `workflow.md`: detailed phase diagram. Read it when the user asks for process detail.

## Step 1: Collect inputs

Ask for the target repository:

- GitHub URL, or
- absolute or relative path to an existing local checkout.

If the user provides a URL, the script clones into `./.autoresearch/repos/<owner>-<name>` relative to the user's current working directory by default. Pass `--clone-dir <path>` to override, or `--ephemeral` to clone into a system temp dir that is deleted on exit. If the default path already contains a git repo, it is reused (no re-clone).

Ask where to write the protocol authoring bundle. Default: `<repo-or-clone>/.autoresearch/create`.

## Step 2: Build discovery bundle

Run one of these from the skill directory:

For a Git URL (uses default clone dir `./.autoresearch/repos/<owner>-<name>`):

```bash
python3 scripts/build_discovery_bundle.py <git-url> --output-dir <output-dir>
```

Override the clone destination with `--clone-dir <path>` or use `--ephemeral` for a throwaway clone.

For an existing checkout:

```bash
python3 scripts/build_discovery_bundle.py --existing-repo <repo-path> --output-dir <output-dir>
```

Expected outputs:

- `<output-dir>/discovery_system.md`
- `<output-dir>/discovery_user_filled.md`
- `<output-dir>/bundle_meta.json`

If the script fails, stop and report the exact failure. Do not fabricate discovery data.

## Step 3: Produce DiscoveryDraft JSON

Read `<output-dir>/discovery_system.md` as the discovery system prompt and `<output-dir>/discovery_user_filled.md` as the user prompt. Follow them exactly and emit a single JSON object with:

- `schemaKind: "discoveryDraft"`
- `protocolVersion: "1.0"`
- all required fields described by `protocol.schema.json`

Write the JSON to:

```text
<output-dir>/discovery_draft.json
```

Validate the draft against `protocol.schema.json` if a JSON Schema validator is available. At minimum, parse it as JSON and manually check the schema-required keys. If validation fails, fix the draft from source evidence or stop with the validation error.

## Step 4: Ask questionnaire

Read `questionnaire/universal.md` and ask only the questions needed to fill missing or uncertain fields in the final protocol. Use the DiscoveryDraft `blockers` to focus the interview.

Then select the archetype:

1. Start from `discovery_draft.json` field `meta.archetypeGuess`.
2. Confirm or correct it with the user.
3. Read the matching `questionnaire/by_archetype/<archetype>.md` file and ask its relevant addendum questions.

Keep answers in `<output-dir>/questionnaire_answers.md`.

## Step 5: Finalize protocol.json

Merge:

- `discovery_draft.json`
- questionnaire answers
- `archetypes.yaml`
- `eligibility_rubric.md`

Write the finalized protocol to:

```text
<output-dir>/protocol.json
```

Rules:

- `schemaKind` must be `"protocol"`.
- `protocolVersion` must be `"1.0"`.
- The document must match `protocol.schema.json`.
- `meta.eligibility` must be justified by `eligibility_rubric.md`.
- Do not mark `eligible` unless the repo has one runnable command, one scalar metric, bounded resources, non-overlapping mutable/immutable surfaces, and an achievable baseline policy.
- Use `needs_harness` when the project intent is valid but a wrapper, benchmark script, metric printer, fixture, or load generator must be added before baseline.
- Use `ineligible` when the repo cannot support a bounded scalar experiment loop.

## Step 5b: Benchmark review (HARD APPROVAL GATE)

The primary metric is the optimization target for every downstream experiment run. A wrong name, wrong direction, or a regex that does not match real output silently corrupts the entire research loop. **Do not skip this step.**

Run:

```bash
python3 scripts/preview_metrics.py <output-dir>/protocol.json
```

This prints a focused review block: primary metric (name, direction, extract pattern, example stdout), execution command and timeout, baseline policy, and any secondary metrics. It also flags missing or weak fields.

Then ask the user, in plain language and one question at a time:

1. Is the metric **name** the right thing to optimize for this project?
2. Is the **direction** (minimize / maximize) correct?
3. Will the **regex pattern** actually match what the command prints? Compare against the example stdout fragment shown.
4. Is the **baseline policy** realistic on the user's hardware?
5. Are the secondary metrics (if any) the right supporting signals?

Only proceed to Step 6 after the user **explicitly** confirms the benchmark. If anything is wrong, return to Step 5 and update `protocol.json`, then re-run the preview. Do not paraphrase the metric to the user from memory — always show them the preview output.

## Step 6: Render program.md

Only after Step 5b approval, render the agent-facing handoff:

```bash
python3 scripts/render_program_md.py <output-dir>/protocol.json
```

The rendered `program.md` opens with a prominent **Benchmark** section that mirrors the approved metric definition. Show this section to the user one more time and confirm it matches what they approved before handing the document off downstream.

If Jinja2 is missing, install the bundled optional tooling in the user's environment only after stating the command:

```bash
python3 -m pip install -r requirements-tools.txt
```

Expected output:

```text
<output-dir>/program.md
```

## Step 7: Baseline dry run or measured run

If `meta.eligibility` is `eligible`, offer a baseline dry run first:

```bash
scripts/run_baseline.sh <output-dir>/protocol.json <repo-path> --dry-run
```

If the user approves a measured baseline:

```bash
scripts/run_baseline.sh <output-dir>/protocol.json <repo-path> --log <output-dir>/baseline_run.log
```

On success, capture `BASELINE_METRIC=<value>` and update or report the baseline artifact according to `protocol.json` fields `measurement.baselinePolicy` and `provenance`.

## Step 8: Ask to publish on-chain

Publishing is the handoff that lets other people discover and contribute to the open research project. After a measured baseline succeeds, make publishing the default next step for eligible projects.

Only ask to publish after:

- `meta.eligibility` is `eligible`
- Step 5b benchmark approval is complete
- `program.md` has been rendered or intentionally skipped
- a measured baseline has succeeded

Ask the user directly:

```text
The baseline is complete. Do you want me to publish this project to the Solana OpenResearch registry now?
```

Do not submit a transaction until the user approves publishing and the signing/wallet requirements are satisfied.

The default publish target is the Solana OpenResearch program. The default signing path is a temporary localhost browser wallet page. The CLI opens `http://127.0.0.1:<port>/...`; the browser discovers injected Solana wallets (Phantom, Solflare, Backpack) plus any Wallet Standard wallet, uploads the artifacts to Irys with the connected Solana wallet, then asks the user to approve a single `createProject` transaction. Do not ask the user for a private key, seed phrase, 0G key, or web2 API key. Pass `--keypair ~/.config/solana/id.json` only when the user explicitly opts into a filesystem keypair and `--allow-skip-storage`.

Read `references/onchain-solana.md` before preparing the transaction. The active program id is `ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3` on Solana devnet. `scripts/publish_project_solana.mjs` ships the bundled full Anchor IDL at `contracts/solana-open-research/open_research.json`; pass `--idl` only when testing another build.

Prepare `createProject(...)` arguments from the approved protocol and baseline artifacts:

- `protocolHash`, `repoSnapshotHash`, `benchmarkHash`, and `baselineMetricsHash` must be 32-byte hashes.
- Prefer Irys storage (default for live Solana publishes, or `--upload-artifacts-to-irys` in dry-run). The Solana instruction stores both raw SHA-256 hashes and 32-byte Irys transaction ids; `storage_irys.json` records the readable ids and gateway URLs for retrieval.
- `baselineAggregateScore` must be the agreed signed integer representation of the primary metric. Ask the user to confirm scaling for decimal metrics.
- Ask for `tokenName`, `tokenSymbol`, `basePrice`, `slope`, and `minerPoolCap` if not already specified.

Irys uses Solana wallet signing/payment: devnet/testnet publishes use Irys devnet, and mainnet-beta publishes use Irys mainnet. Override with `--irys-network devnet|mainnet` only when the user explicitly asks. Pass `--allow-skip-storage` only if the user intentionally wants registry hashes that point to nothing retrievable.

After a successful transaction, record the Solana transaction signature, project id, creator pubkey, account map, instruction args, and `storage_irys.json` next to the protocol authoring bundle.

Preferred command shape (browser wallet, default):

```bash
node scripts/publish_project_solana.mjs \
  --protocol-json <output-dir>/protocol.json \
  --repo-snapshot-file <repo-snapshot-artifact> \
  --benchmark-file <benchmark-artifact> \
  --baseline-metrics-file <output-dir>/baseline_run.log \
  --baseline-aggregate-score <integer-score> \
  --token-name "<name>" \
  --token-symbol <symbol> \
  --base-price <lamports> \
  --slope <lamports> \
  --miner-pool-cap <token-units> \
  --upload-artifacts-to-irys \
  --yes
```

Use `--dry-run` first when values are uncertain (defaults `--project-id` to 0). Use `--baseline-metric <decimal> --metric-scale <integer>` instead of `--baseline-aggregate-score` when the measured metric needs deterministic scaling. The filesystem keypair path cannot upload to Irys; use the browser-wallet path unless the user explicitly chooses `--keypair ... --allow-skip-storage`.

### Alternate path: 0G Galileo

The legacy 0G Galileo EVM registry remains supported. Use it only when the user explicitly asks. Read `references/onchain-0g-galileo.md` before preparing that transaction. Use `contracts/0g-galileo-testnet/deployment.json` for the legacy deployment:

- chain ID `16602`
- RPC `https://evmrpc-testnet.0g.ai`
- `ProjectRegistry` `0xc84768e450534974C0DD5BAb7c1b695744124136`
- `ProposalLedger` `0x701db5f8Ed847651209A438695dfe5520adD6A5A`
- `VerifierRegistry` `0x257974E406f206BfAEd3abB8D93C232e3226f032`

The 0G Galileo path uses `scripts/publish_project_0g.mjs` with the same browser-wallet flow (EIP-6963, SIWE-style approval, then `eth_sendTransaction`).

## Final response

Report:

1. path to `protocol.json`
2. path to `program.md`, if rendered
3. path to `baseline_run.log`, if run
4. on-chain project id, token address, and transaction hash, if published
5. eligibility state and blockers, if any
6. next action: review `protocol.json`, add harness if `needs_harness`, proceed to baseline, or ask to publish if `eligible` and baseline succeeded
