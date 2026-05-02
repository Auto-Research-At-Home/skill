# Archetype addendum: `pipeline_job`

Answer after the universal block.

1. **Job command** — batch transform or Spark/driver invocation.

2. **Success metric** — rows/sec, error rate, F1 on sample—must be machine-readable from logs.

3. **Input/output paths** — snapshot dirs or cloud prefixes; pin for baseline.

4. **Idempotency** — may runs mutate external stores? Safety constraints for experimenters.
