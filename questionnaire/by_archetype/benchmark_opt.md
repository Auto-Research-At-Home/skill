# Archetype addendum: `benchmark_opt`

Answer after the universal block.

1. **Benchmark driver command** — entrypoint and arguments for the scalar score.

2. **Deterministic replay** — fixed input artifact path or seed archive for reproducibility.

3. **Score definition** — single float printed where? Attach golden stdout line.

4. **Iteration meaning** — one command invocation = one experiment, or inner loop steps?

5. **External deps** — offline fixtures required? Document paths under harness, not in mutable surface unless intended.
