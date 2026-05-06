# autoresearch-mine

Mining starts from either a finalized local `protocol.json` plus repo checkout, or an on-chain 0G project id / ProjectToken address.

For on-chain mining, put the miner key in `.env` in the current working directory or export it in the shell. `.env` is gitignored:

```bash
ARAH_PRIVATE_KEY=0x...
ARAH_STAKE=1
```

Then run wallet preflight before trials:

```bash
python3 scripts/check_wallet.py \
  --token-address 0xProjectTokenAddress
```

Then bootstrap project inputs:

```bash
python3 scripts/bootstrap_from_registry.py \
  --token-address 0xProjectTokenAddress \
  --output-dir /path/to/mining-work/project-token \
  --download-artifacts
```

When a trial beats the current on-chain best, submit with the same wallet immediately:

```bash
python3 scripts/submit_trial_proposal.py \
  --token-address 0xProjectTokenAddress \
  --repo-root /path/to/repo \
  --trial-id <trial_id> \
  --claimed-metric 1.23 \
  --reward-recipient 0xYourAddress \
  --auto-buy
```

`--auto-buy` resolves the project token, buys missing ProjectToken stake when needed, approves `ProposalLedger`, and submits the proposal. ProjectToken has `decimals() == 0`, so `ARAH_STAKE` (or `--stake`) is a count of whole tokens; scripts default to `1` when absent (the contract only requires `stake > 0`). Pass `--budget 0.05og` to cap how much native gas `--auto-buy` may spend on the bonding curve. Full workflow details are in [SKILL.md](SKILL.md).
