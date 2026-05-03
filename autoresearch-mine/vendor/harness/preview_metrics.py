#!/usr/bin/env python3
"""Print a focused benchmark/metrics review block from a finalized protocol.json.

The primary metric is the optimization target for every downstream experiment
run. This preview is meant to be shown to the user as a hard approval gate
before program.md is rendered or any baseline is run.

Usage:
  python scripts/preview_metrics.py <output-dir>/protocol.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _log  # noqa: E402


def _get(d: dict, *path, default=None):
    cur = d
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("protocol_json", type=Path)
    args = parser.parse_args()

    path = args.protocol_json.resolve()
    if not path.is_file():
        _log.fail(f"not found: {path}")
        return 1

    proto = json.loads(path.read_text(encoding="utf-8"))
    if proto.get("schemaKind") != "protocol":
        _log.fail("expected schemaKind 'protocol' (finalize before previewing).")
        return 1

    primary = _get(proto, "measurement", "primaryMetric", default={}) or {}
    secondary = _get(proto, "measurement", "secondaryMetrics", default=[]) or []
    baseline = _get(proto, "measurement", "baselinePolicy", default={}) or {}
    extract = primary.get("extract") or {}
    cmd = _get(proto, "execution", "command", default="(none)")
    timeout = _get(proto, "execution", "hardTimeoutSeconds", default="(unset)")

    _log.section("BENCHMARK REVIEW — please confirm before proceeding")
    _log.detail(f"protocol: {path}")
    _log.blank()
    _log.detail("PRIMARY METRIC (the optimization target)")
    _log.detail(f"  name:       {primary.get('name', '(missing)')}")
    _log.detail(f"  direction:  {primary.get('direction', '(missing)')}")
    _log.detail(f"  extractor:  {extract.get('kind', '(missing)')}")
    if extract.get("kind") == "regex":
        _log.detail(f"  pattern:    {extract.get('pattern', '(missing)')}")
        example = extract.get("exampleStdout") or "(no example provided — risky)"
        _log.detail("  example stdout fragment:")
        for line in str(example).splitlines() or ["(empty)"]:
            _log.detail(f"    | {line}")
    _log.blank()
    _log.detail("EXECUTION")
    _log.detail(f"  command:        {cmd}")
    _log.detail(f"  hard timeout:   {timeout}s")
    _log.blank()
    _log.detail("BASELINE POLICY")
    _log.detail(f"  establish on this hardware:  {baseline.get('establishOnHardware', '(missing)')}")
    _log.detail(f"  same data snapshot:          {baseline.get('sameDataSnapshot', '(missing)')}")
    if baseline.get("baselineNotes"):
        _log.detail(f"  notes: {baseline['baselineNotes']}")
    _log.blank()
    if secondary:
        _log.detail(f"SECONDARY METRICS ({len(secondary)})")
        for m in secondary:
            _log.detail(f"  · {m.get('name', '?')}  (direction: {m.get('direction', '?')})")
    else:
        _log.detail("SECONDARY METRICS: none")
    _log.blank()

    missing = []
    if not primary.get("name"):
        missing.append("primaryMetric.name")
    if not primary.get("direction"):
        missing.append("primaryMetric.direction")
    if extract.get("kind") == "regex" and not extract.get("pattern"):
        missing.append("primaryMetric.extract.pattern")
    if extract.get("kind") == "regex" and not extract.get("exampleStdout"):
        missing.append("primaryMetric.extract.exampleStdout (recommended)")
    if missing:
        _log.fail("missing/weak fields: " + ", ".join(missing))
        _log.detail("Fix these in protocol.json before approving the benchmark.")
    else:
        _log.ok("all required metric fields are present")

    _log.blank()
    _log.detail("Ask the user: does this benchmark match what they want to optimize?")
    _log.detail("  · Is the metric NAME the right thing to track?")
    _log.detail("  · Is DIRECTION (minimize/maximize) correct?")
    _log.detail("  · Will the regex actually match the run output? (compare to example)")
    _log.detail("  · Is the baseline policy realistic on this hardware?")
    _log.detail("Do not render program.md or run baseline until the user explicitly approves.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
