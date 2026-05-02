# Archetype addendum: `inference_serving`

Answer after the universal block. Often results in `meta.eligibility: needs_harness` until a synthetic load generator exists.

1. **Synthetic harness** — wrk/locust/custom script path that produces stable latency numbers.

2. **SLO** — p50/p99 latency and throughput definition; extraction from tool output.

3. **Cost metric** — optional $ or token cost if cloud inference; document billing boundary.

4. **Cold start** — include or exclude warm-up from measured window?

5. **If no harness yet** — describe minimal benchmark wrapper required before `eligible`.
