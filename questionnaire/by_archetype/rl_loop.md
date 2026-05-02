# Archetype addendum: `rl_loop`

Answer after the universal block. Maps to `archetypeExtensions.rl_loop` and measurement notes.

1. **Environment id** — gym id, custom env module path, or simulator version: `envId`.

2. **Episode horizon** — step cap per episode; maps to `episodeHorizon` if fixed.

3. **Stochasticity** — are multiple RNG seeds required for fair comparison? How many? `numSeeds`.

4. **Reward hacking** — may reward or transition code change, or only policy? Narrow `mutableSurface` if reward must stay fixed.

5. **Parallelism** — vectorized envs change wall-clock vs sample count; state which is canonical for the metric.
