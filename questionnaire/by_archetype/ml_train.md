# Archetype addendum: `ml_train`

Answer after the universal block. Maps primarily to `archetypeExtensions.ml_train` and execution/measurement tuning.

1. **Validation split** — fixed held-out set? Path or generator seed?

2. **Leakage risks** — train/eval overlap, checkpoint contamination: mitigation?

3. **Metric anchor** — tied to a named function or script line (e.g. `evaluate_loss`)? Paste reference path.

4. **Time vs steps** — is wall-clock budget primary, or step cap for reproducibility across hardware?

5. **Hardware sensitivity** — should comparisons be **same machine only**? Document in `archetypeExtensions.ml_train.hardwareNotes`.

6. **Eval token / sample budget** — if applicable, cap for fast iteration: `evalTokens` or equivalent note.

7. **Data snapshot** — Hugging Face revision, local shard checksum, or cache dir path: `dataSnapshot`.
