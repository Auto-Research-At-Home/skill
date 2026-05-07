# autoresearch-mine

Mining starts from either a finalized local `protocol.json` plus repo checkout, or an on-chain 0G project id / ProjectToken address.

For on-chain mining, create an isolated mining-wallet keystore (passphrase-encrypted, stored under `~/.autoresearch/wallets/<id>.json`). The skill never reads `ARAH_PRIVATE_KEY` and the keystore is decrypted only inside `wallet.py`, so the trial harness — which runs untrusted protocol code inside a podman/docker/bwrap sandbox — cannot reach the key.

```bash
python3 scripts/wallet.py init --id project-42
python3 scripts/wallet.py address --id project-42   # fund this address from the user's main wallet
```

Optional, in `.env` (gitignored), for non-interactive runs:

```bash
ARAH_STAKE=1                 # whole-token stake count (decimals==0); defaults to 1
ARAH_WALLET_PASSPHRASE=…     # or pass --passphrase-file <path>
```

Then run wallet preflight before trials:

```bash
python3 scripts/check_wallet.py \
  --wallet-id project-42 \
  --token-address 0xProjectTokenAddress
```

Then bootstrap project inputs:

```bash
python3 scripts/bootstrap_from_registry.py \
  --token-address 0xProjectTokenAddress \
  --output-dir /path/to/mining-work/project-token \
  --download-artifacts
```

When a trial beats the current on-chain best, submit with the keystore immediately. Set `--reward-recipient` to the user's *main* wallet, not the mining wallet — that way mining-key compromise can only steal one trial's stake + gas:

```bash
python3 scripts/submit_trial_proposal.py \
  --wallet-id project-42 \
  --token-address 0xProjectTokenAddress \
  --repo-root /path/to/repo \
  --trial-id <trial_id> \
  --claimed-metric 1.23 \
  --reward-recipient 0xUserMainWalletAddress \
  --auto-buy
```

`--auto-buy` resolves the project token, buys missing ProjectToken stake when needed, approves `ProposalLedger`, and submits the proposal. ProjectToken has `decimals() == 0`, so `ARAH_STAKE` (or `--stake`) is a count of whole tokens; scripts default to `1` when absent (the contract only requires `stake > 0`). Pass `--budget 0.05og` to cap how much native gas `--auto-buy` may spend on the bonding curve. Full workflow details are in [SKILL.md](SKILL.md).
