# Archetype addendum: `build_test`

Answer after the universal block. Maps to `archetypeExtensions.build_test`.

1. **Test command** — exact command (e.g. `pytest -q`, `cargo test`). Maps to `testCommand`.

2. **Subset for loop** — full suite vs smoke subset for speed? If subset, document risk of missing regressions: `testSubset`.

3. **Primary metric** — pass/fail only, or timing per suite? If timing, define extraction from pytest/JUnit output.

4. **Flakes** — known flaky tests? Policy: `flakePolicy` (retry count, quarantine list).

5. **Forbidden edits** — confirm tests directory is **forbidden** unless exception documented.
