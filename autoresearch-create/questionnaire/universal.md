# Experiment protocol questionnaire — universal block

Complete this block **before** merging a DiscoveryDraft into a finalized `protocol.json`. Branch to `questionnaire/by_archetype/<archetype>.md` after universal answers.

Record answers in your merge notes; map fields to `protocol.schema.json` in the experiment-protocol package (`schemaKind: "protocol"`).

---

## A. Identity and purpose

1. **Repository one-liner**  
   What single outcome should improve across experiments? (Maps to `meta.purposeStatement`.)

2. **Archetype confirmation**  
   From: `ml_train`, `rl_loop`, `benchmark_opt`, `build_test`, `solver_compete`, `pipeline_job`, `inference_serving`, `unknown`.  
   Does the DiscoveryDraft archetype match your intent? If not, correct it (maps to `meta.archetype`).

3. **Eligibility opinion**  
   After reading DiscoveryDraft `blockers`, do you believe this repo can support a **bounded** loop with a **scalar** primary metric? `yes` / `needs_harness` / `no` (informal; formal scoring is in `eligibility_rubric.md`).

---

## B. Primary metric (contract)

4. **Metric name** (human-readable, stable across runs). Maps to `measurement.primaryMetric.name`.

5. **Direction** — **minimize** or **maximize**? Maps to `measurement.primaryMetric.direction`.

6. **Why this metric** (one paragraph): ties experiments to product/research goals; helps resolve ties.

7. **Extraction**  
   How will an agent read the metric from logs?
   - Regex line pattern (preferred for stdout): exact pattern with **first capture group = numeric value**. Maps to `measurement.primaryMetric.extract.pattern` when `kind` is `regex`.
   - Paste a **real** stdout snippet into `extract.exampleStdout` (golden test).

8. **Secondary metrics** (optional list): name + direction + extraction notes.

---

## C. Trusted harness vs editable surface

9. **Immutable harness paths** — files/globs that define truth (eval, data pipeline, CI metric): maps to `immutableHarness.paths` + `immutableHarness.rationale`.

10. **Allowed edit globs** — where improvements may land: maps to `mutableSurface.allowedGlobs`.

11. **Forbidden globs** — never edit (tests, licenses, vendored code): maps to `mutableSurface.forbiddenGlobs`.

12. **Overlap check** — confirm **no** path matches both allowed and forbidden (validator / manual glob resolve).

13. **Allowed kinds** — `code_edit` and/or `config_edit`: maps to `mutableSurface.allowedKinds`.

---

## D. Environment and reproducibility

14. **Setup commands** (ordered): checkout, install deps, asset prep. Maps to `environment.setupCommands`.

15. **Package managers / pins**: uv, pip, npm, lockfiles present? Maps to `environment.packageManagers` + notes.

16. **OS / hardware class** for baseline (e.g. Apple Silicon M4, 24 GB): maps to `environment.osHints` + extension notes.

17. **Network policy** for runs: `sandbox` | `full` | `offline` | `unknown`. Maps to `environment.constraints.networkPolicy`.

18. **New dependencies** — may experimenters add packages? If no: `environment.constraints.noNewDependencies: true`.

19. **Secrets** — API keys, HF tokens: where stored (not in protocol JSON); blocker if unavailable?

---

## E. Execution contract

20. **Run command** — exact shell line for one experiment: maps to `execution.command`.

21. **Working directory** — repo root or subdir: maps to `execution.cwd`.

22. **Stop rule** — wall-clock budget, max steps, full test suite, etc.: maps to `execution.stopCondition`.

23. **Hard timeout** (seconds) — kill hung jobs: maps to `execution.hardTimeoutSeconds`.

24. **Determinism** — seeds required? Maps to `execution.determinism`.

---

## F. Baseline and provenance

25. **Baseline policy** — establish on **this** machine before comparing across trials? `measurement.baselinePolicy.establishOnHardware`.

26. **Data snapshot** — version/hash/cache path so baseline is not invalidated silently: `measurement.baselinePolicy.sameDataSnapshot` + free-text notes.

27. **Results log** — format (`tsv`|`csv`|`jsonl`), path, column headers: maps to `provenance.resultsLog`.

28. **Git workflow** — branch pattern, monorepo path prefix for staging, example `git add` line: maps to `provenance.gitWorkflow`.

29. **Protocol bundle id** — unique label for handoff to phase-2 experimenters: maps to `meta.protocolBundleId`.

---

## G. Safety and agent behavior

30. **OOM policy** — reduce batch, fail, or unknown: maps to `safety.oomPolicy`.

31. **Crash handling** — log `crash` status, retry, discard: maps to `safety.crashStatus`.

32. **Simplicity criterion** — prefer simpler winning changes? maps to `agentRules.simplicityCriterion`.

33. **Autonomy** — may agents loop without asking (optional, deployment-specific): `agentRules.autonomy.noAskHumanToContinue`.

34. **Log capture** — redirect stdout/stderr example for agents: `agentRules.logRedirectExample`.

---

## Completion checklist

- [ ] DiscoveryDraft merged; blockers addressed or deferred with explicit harness tasks.
- [ ] Primary metric extraction tested on **real** log output.
- [ ] Allowed/forbidden globs validated (no overlap).
- [ ] One **dry run** completed successfully (setup + command + timeout).
- [ ] Baseline row recorded in `provenance.resultsLog.path` with commit hash.
