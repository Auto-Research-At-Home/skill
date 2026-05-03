---
name: autoresearch-create
description: Create an Auto Research At Home experiment protocol from a GitHub repository or local checkout. Builds a discovery prompt bundle, emits a DiscoveryDraft JSON, asks the protocol questionnaire, finalizes protocol.json, renders program.md, runs a baseline, then asks the user whether to publish an eligible project to the configured on-chain registry. Use when the user asks to create/start/bootstrap an autoresearch or ARAH project from a repo.
---

# autoresearch-create

Create an Auto Research At Home project contract from an existing repository. The output is a versioned experiment-loop protocol bundle:

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
- `scripts/publish_project_0g.mjs`: prepare and publish `ProjectRegistry.createProject(...)` via WalletConnect/Reown QR signing, or write an unsigned transaction/dry-run artifact.
- `contracts/0g-galileo-testnet/deployment.json`: deployed 0G Galileo testnet contract addresses and artifact paths.
- `contracts/0g-galileo-testnet/artifacts/*.json`: ABI/artifact JSON for `ProjectRegistry`, `ProjectToken`, `ProposalLedger`, and `VerifierRegistry`.
- `references/onchain-0g-galileo.md`: ABI-derived on-chain create, mining, and review flow. Read it only for publish/mining/review work.
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
python scripts/build_discovery_bundle.py <git-url> --output-dir <output-dir>
```

Override the clone destination with `--clone-dir <path>` or use `--ephemeral` for a throwaway clone.

For an existing checkout:

```bash
python scripts/build_discovery_bundle.py --existing-repo <repo-path> --output-dir <output-dir>
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
python scripts/preview_metrics.py <output-dir>/protocol.json
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
python scripts/render_program_md.py <output-dir>/protocol.json
```

The rendered `program.md` opens with a prominent **Benchmark** section that mirrors the approved metric definition. Show this section to the user one more time and confirm it matches what they approved before handing the document off downstream.

If Jinja2 is missing, install the bundled optional tooling in the user's environment only after stating the command:

```bash
python -m pip install -r requirements-tools.txt
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
The baseline is complete. Do you want me to publish this project to the 0G Galileo registry now?
```

Do not submit a transaction until the user approves publishing and the signing/wallet requirements are satisfied.

The supported signing path is WalletConnect/Reown QR signing. Do not ask the user for a private key or seed phrase, and do not require a local private key environment variable.

Read `references/onchain-0g-galileo.md` before preparing any transaction. Use `contracts/0g-galileo-testnet/deployment.json` for the active deployment:

- chain ID `16602`
- RPC `https://evmrpc-testnet.0g.ai`
- `ProjectRegistry` `0xc84768e450534974C0DD5BAb7c1b695744124136`
- `ProposalLedger` `0x701db5f8Ed847651209A438695dfe5520adD6A5A`
- `VerifierRegistry` `0x257974E406f206BfAEd3abB8D93C232e3226f032`

Prepare `ProjectRegistry.createProject(...)` arguments from the approved protocol and baseline artifacts:

- `protocolHash`, `repoSnapshotHash`, `benchmarkHash`, and `baselineMetricsHash` must be `bytes32`.
- `baselineAggregateScore` must be the agreed signed integer representation of the primary metric. Ask the user to confirm scaling for decimal metrics.
- Ask for `tokenName`, `tokenSymbol`, `basePrice`, `slope`, and `minerPoolCap` if not already specified.

After a successful transaction, record `projectId`, `tokenAddr`, transaction hash, chain ID, and contract addresses next to the protocol authoring bundle. Treat the emitted `ProjectCreated(projectId, creator, token, protocolHash)` event as canonical.

Preferred command shape:

```bash
node scripts/publish_project_0g.mjs \
  --protocol-json <output-dir>/protocol.json \
  --repo-snapshot-file <repo-snapshot-artifact> \
  --benchmark-file <benchmark-artifact> \
  --baseline-metrics-file <output-dir>/baseline_run.log \
  --baseline-aggregate-score <integer-score> \
  --token-name "<name>" \
  --token-symbol <symbol> \
  --base-price <wei> \
  --slope <wei> \
  --miner-pool-cap <token-wei> \
  --reown-project-id <project-id> \
  --yes
```

Use `--dry-run` first when values are uncertain. Use `--baseline-metric <decimal> --metric-scale <integer>` instead of `--baseline-aggregate-score` when the measured metric needs deterministic scaling.

## Final response

Report:

1. path to `protocol.json`
2. path to `program.md`, if rendered
3. path to `baseline_run.log`, if run
4. on-chain project id, token address, and transaction hash, if published
5. eligibility state and blockers, if any
6. next action: review `protocol.json`, add harness if `needs_harness`, proceed to baseline, or ask to publish if `eligible` and baseline succeeded
