# Eligibility rubric (experiment-loop protocol)

Use this rubric when merging a **DiscoveryDraft** with questionnaire answers to set `meta.eligibility` on the finalized `protocol` document (`schemaKind: "protocol"`).

Scoring is **qualitative**; all criteria must be satisfied for **`eligible`**. Partial satisfaction with a concrete harness plan → **`needs_harness`**. Fundamental mismatch → **`ineligible`**.

---

## States

| State | Meaning |
|-------|---------|
| `eligible` | Phase 1 can complete: dry run + baseline without new harness code. |
| `needs_harness` | Intent is valid but a **thin wrapper** (benchmark script, metric printer, fixture) must be added **before** baseline; track tasks in `blockers`/issue list. |
| `ineligible` | No bounded scalar loop or unsafe/unbounded cost; do not pretend otherwise. |

---

## Criteria (must pass for `eligible`)

### E1 — Runnable primary command

- There exists **one** documented shell command (`execution.command`) that an agent can run unattended after setup.
- Command completes within `execution.hardTimeoutSeconds` on the reference environment **or** fails loudly (non-zero exit).

**Fail examples:** “run notebook cell 4”; “click Run in IDE”; SSH into cluster-only.

### E2 — Scalar primary metric

- `measurement.primaryMetric` has a defined **direction** and **extract** path (regex, junit, etc.).
- A **golden** `exampleStdout` (or junit artifact path) parses to the metric **deterministically** on repeated runs with identical inputs.

**Fail examples:** “looks better”; reviewer judgment only.

### E3 — Bounded resource story

- Stop condition (`execution.stopCondition`) + hard timeout prevent infinite runs.
- Cost of one experiment is predictable (no unbounded paid API loop without budget).

### E4 — Disjoint mutable vs immutable surfaces

- `mutableSurface.allowedGlobs` is non-empty.
- `immutableHarness.paths` is non-empty **or** explicitly documented as “no harness files” with metric coming only from command output (rare).
- **No overlap** between allowed and forbidden globs when resolved against the repo tree.

### E5 — Baseline comparability

- `measurement.baselinePolicy.sameDataSnapshot` is achievable (pinned data, revision, or local cache path).
- Comparisons across experimenters assume **same protocol bundle id** (`meta.protocolBundleId`) and compatible hardware class.

---

## Partial credit → `needs_harness`

Assign **`needs_harness`** when:

- **N1 — Metric exists but not printed:** Add a 5–20 line wrapper that runs upstream code and prints `METRIC_NAME: value`.
- **N2 — Multiple commands:** Define a single driver script that orchestrates sub-steps and emits one summary line.
- **N3 — Flaky tests:** Subset or retry policy documented under `archetypeExtensions.build_test.flakePolicy` before eligible.
- **N4 — Serving / API:** No load generator yet; plan documented in questionnaire addendum.

Do **not** mark `eligible` until the harness exists and E1–E5 pass on **dry run**.

---

## `ineligible` triggers

- **I1 — Subjective success** only (UX, aesthetics) without automated proxy.
- **I2 — Secret-only runtime** with no stub/mirror for experimenters.
- **I3 — Unbounded external spend** or legal/safety constraints incompatible with autonomous loops.
- **I4 — Docs-only or empty repo** with no runnable target after DiscoveryDraft + questionnaire.

---

## Ownership of fields (review checklist)

| Concern | DiscoveryDraft | Questionnaire | Validator / human |
|---------|----------------|---------------|-------------------|
| Archetype guess | yes | confirms | human |
| Setup commands | partial | completes | dry run |
| Run command | partial | confirms | dry run |
| Metric extraction | partial | golden log | automated parse test |
| Eligibility | — | decides | rubric + overlap check |

---

## Versioning

When eligibility rules change, bump `protocolVersion` and note migrations at the top of this file.
