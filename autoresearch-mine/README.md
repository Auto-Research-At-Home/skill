# autoresearch-mine

Phase 2 **mining** for Auto Research At Home: run trials from a finalized `protocol.json` in a target repo, log `trials.jsonl`, and optionally open PRs. The skill is **self-contained** (bundled trial harness and 0G **contract bundle**; no `autoresearch-create` install at runtime).

- **SKILL for agents:** [`SKILL.md`](SKILL.md)
- **Workflow diagram:** [`workflow.md`](workflow.md)
- **Harness bundle:** [`vendor/harness/`](vendor/harness/) (see [`vendor/README.md`](vendor/README.md))
- **0G contracts (vendored):** [`contracts/0g-galileo-testnet/`](contracts/0g-galileo-testnet/) (see [`contracts/README.md`](contracts/README.md))

## Quick install (chain scripts)

```bash
cd autoresearch-mine
python3 -m venv .venv
.venv/bin/pip install -r requirements-chain.txt
```

Defaults resolve **`contracts/0g-galileo-testnet/deployment.json`** inside this skill. Override with **`ARAH_DEPLOYMENT_JSON`** / **`ARAH_RPC_URL`** / **`ARAH_PROJECT_REGISTRY`** / **`ARAH_PROPOSAL_LEDGER`** when pointing at a different deployment.

## Canonical upstream (parity only)

Maintainers sync ABI/deployment from **`autoresearch-create/contracts/0g-galileo-testnet/`**. Full narrative remains **`autoresearch-create/references/onchain-0g-galileo.md`**.
