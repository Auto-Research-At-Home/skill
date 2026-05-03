# Vendored 0G Galileo testnet bundle

This directory mirrors [`autoresearch-create/contracts/0g-galileo-testnet/`](../../autoresearch-create/contracts/0g-galileo-testnet/) so **`autoresearch-mine` does not depend on `autoresearch-create` at runtime.** Scripts resolve `deployment.json` and ABI JSON from here by default.

## Sync from upstream (maintainers)

When contracts are redeployed or artifacts change, copy from the create skill into this tree:

```bash
# From the experiment-protocol repo root
SRC=autoresearch-create/contracts/0g-galileo-testnet
DST=autoresearch-mine/contracts/0g-galileo-testnet
cp "$SRC/deployment.json" "$DST/"
cp "$SRC/artifacts/"*.json "$DST/artifacts/"
# Refresh the miner reference excerpt if onchain-0g-galileo.md changed materially:
# edit autoresearch-mine/contracts/0g-galileo-testnet/references/onchain-mining-0g.md
```

Canonical documentation for parity remains [`autoresearch-create/references/onchain-0g-galileo.md`](../../autoresearch-create/references/onchain-0g-galileo.md).
