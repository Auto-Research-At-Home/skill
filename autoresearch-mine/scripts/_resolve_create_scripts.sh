#!/usr/bin/env bash
# Resolve directory containing run_baseline.sh and preview_metrics.py.
# Default: bundled harness under autoresearch-mine/vendor/harness (no autoresearch-create install).
# Override: AUTORESEARCH_CREATE_SCRIPTS=/path/to/scripts (e.g. monorepo dev).
set -euo pipefail
export GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

if [[ -n "${AUTORESEARCH_CREATE_SCRIPTS:-}" ]]; then
  d="${AUTORESEARCH_CREATE_SCRIPTS%/}"
else
  d="$(cd "$SCRIPT_DIR/../vendor/harness" && pwd)"
fi

if [[ ! -f "$d/run_baseline.sh" ]]; then
  echo "Harness not found at: $d (missing run_baseline.sh)" >&2
  echo "Install autoresearch-mine completely, or set AUTORESEARCH_CREATE_SCRIPTS to a directory containing run_baseline.sh" >&2
  exit 1
fi

printf '%s\n' "$d"
