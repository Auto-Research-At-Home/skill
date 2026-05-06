# autoresearch-mine

Phase 2 **mining** for OpenResearch: run trials from a finalized `protocol.json` in a target repo, log `trials.jsonl`, and optionally open PRs. The skill is **self-contained** (bundled trial harness and 0G **contract bundle**; no `autoresearch-create` install at runtime). For the full product narrative and how this fits Phase 1 (`autoresearch-create`), see the [repository README](../../README.md).

- **SKILL for agents:** [`SKILL.md`](../SKILL.md)
- **Workflow diagram:** [`workflow.md`](workflow.md)
- **Harness bundle:** [`vendor/harness/`](../vendor/harness/) (see [`vendor-harness.md`](vendor-harness.md))
- **0G contracts (vendored):** [`contracts/0g-galileo-testnet/`](../contracts/0g-galileo-testnet/) (see [`contracts-sync.md`](contracts-sync.md))

## Quick install (chain scripts)

```bash
cd autoresearch-mine
python3 -m venv .venv
.venv/bin/pip install -r requirements-chain.txt
```

Defaults resolve **`contracts/0g-galileo-testnet/deployment.json`** inside this skill. Override with **`ARAH_DEPLOYMENT_JSON`** / **`ARAH_RPC_URL`** / **`ARAH_PROJECT_REGISTRY`** / **`ARAH_PROPOSAL_LEDGER`** when pointing at a different deployment.

For bootstrap directly from a project token address or project id with 0G artifact downloads:

```bash
cd autoresearch-mine
npm install
python3 scripts/bootstrap_from_registry.py \
  --token-address 0xProjectTokenAddress \
  --output-dir /tmp/arah-mine/project \
  --download-artifacts
```

## Canonical upstream (parity only)

Maintainers sync ABI/deployment from **`autoresearch-create/contracts/0g-galileo-testnet/`**. Full narrative remains **`autoresearch-create/references/onchain-0g-galileo.md`**.
