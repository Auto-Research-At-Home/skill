# Experiment protocol (standalone)

Schemas, prompts, questionnaires, and tooling to turn an arbitrary Git repository into a **versioned experiment-loop contract** (`protocol.json`) and an agent-facing **`program.md`** (via Jinja).

This package lives **alongside** autoresearch-style training repos (for example `autoresearch-mlx`); it is **not** tied to MLX or a single benchmark.

## Contents

| Path | Purpose |
|------|---------|
| [`protocol.schema.json`](protocol.schema.json) | JSON Schema for **DiscoveryDraft** and full **protocol** documents |
| [`archetypes.yaml`](archetypes.yaml) | Repo archetypes and defaults |
| [`prompts/`](prompts/) | Discovery LLM system + user prompt template |
| [`questionnaire/`](questionnaire/) | Human questionnaire (universal + by archetype) |
| [`eligibility_rubric.md`](eligibility_rubric.md) | `eligible` / `needs_harness` / `ineligible` rules |
| [`templates/program.md.j2`](templates/program.md.j2) | Render Markdown from `protocol.json` |
| [`scripts/build_discovery_bundle.py`](scripts/build_discovery_bundle.py) | Clone or scan a repo; fill discovery prompt placeholders |
| [`scripts/run_baseline.sh`](scripts/run_baseline.sh) | Run setup + main command from `protocol.json` with OS-aware timeout (Linux `timeout`, macOS `gtimeout`, else Python) |
| [`scripts/render_program_md.py`](scripts/render_program_md.py) | Render **`program.md`** from `protocol.json` + [`templates/program.md.j2`](templates/program.md.j2) (needs **`pip install jinja2`**) |
| [`requirements-tools.txt`](requirements-tools.txt) | Optional deps (`jinja2`) for render script |
| [`workflow.md`](workflow.md) | End-to-end flow diagrams and entry points |

## Quick start — discovery bundle

From this directory:

```bash
python scripts/build_discovery_bundle.py https://github.com/org/repo.git --output-dir ./out
# or
python scripts/build_discovery_bundle.py --existing-repo /path/to/repo --output-dir ./out
```

Outputs: `out/discovery_user_filled.md`, `out/discovery_system.md`, `out/bundle_meta.json`.

See [`workflow.md`](workflow.md) for Phase 1 → Phase 2 handoff.

## Baseline run (after `protocol.json`)

Requires **jq** and **python3** (metric regex extraction).

```bash
./scripts/run_baseline.sh ./out/protocol.json /path/to/target-repo --log ./out/baseline_run.log
# On success, stdout includes a line: BASELINE_METRIC=<parsed value>
```

- **Linux:** uses GNU **`timeout`** when on `$PATH`.
- **macOS:** prefers **`gtimeout`** (`brew install coreutils`); otherwise **`timeout`** if installed; otherwise **Python** `subprocess` timeout (no extra brew package).

Dry-run: `./scripts/run_baseline.sh proto.json /repo --dry-run`

## Render `program.md` (after `protocol.json`)

Install Jinja2 once: `pip install -r requirements-tools.txt`

```bash
python scripts/render_program_md.py ./out/protocol.json
# writes ./out/program.md

python scripts/render_program_md.py ./out/protocol.json -o /path/to/target-repo/program.md
```

Updating **`protocol.json` does not** auto-run this step; re-run the render command whenever the protocol changes.

## License

MIT (match your monorepo policy if you fork).
