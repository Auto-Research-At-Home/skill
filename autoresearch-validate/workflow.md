# autoresearch-validate workflow

Phase 2 miners submit `ProposalLedger.submit`; validators rerun benchmarks off-chain and settle with **`approve` / `reject` / `releaseReview`**.

```mermaid
flowchart LR
  subgraph inputs [Inputs]
    rpc[RPC + deployment ABIs]
    keys[ARAH_PRIVATE_KEY]
    index[ARAH_ARTIFACT_INDEX]
  end
  subgraph skill [autoresearch-validate]
    poll[watch_proposals / run_validate_loop]
    resolve[artifact_resolve]
    gates[verify_static_gates]
    trial[run_verify_trial]
    tx[claim approve reject]
  end
  inputs --> poll --> resolve --> gates --> trial --> tx
```

See [`SKILL.md`](SKILL.md) for ordering and failure semantics.
