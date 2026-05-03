# autoresearch-validate

Verifier skill for **Auto Research At Home**: poll **`ProposalLedger`**, fetch artifact bundles by **`codeHash`**, rerun the bundled harness, compare metrics on-chain, then **`approve`** / **`reject`**.

- Install Python extras: `python3 -m pip install -r requirements-chain.txt` (use a venv).
- Read **[SKILL.md](SKILL.md)** for env vars and exit codes.

Local automation tests (artifact index + static gates + helpers + optional RPC):

```bash
python3 -m pip install -r requirements-chain.txt   # if web3 not installed; run_tests.sh installs this automatically when missing
./scripts/run_tests.sh
```

Quick smoke (no chain txs):

```bash
export ARAH_ARTIFACT_INDEX=/path/to/index.json
python3 scripts/artifact_resolve.py --code-hash 0x… --benchmark-log-hash 0x…
python3 scripts/check_verifier_eligibility.py --address 0xYourVerifier
```

Full unattended driver:

```bash
export GIT_TERMINAL_PROMPT=0
export ARAH_PRIVATE_KEY=...
export ARAH_ARTIFACT_INDEX=/path/to/index.json
python3 scripts/run_validate_loop.py --max-proposals 5
```
