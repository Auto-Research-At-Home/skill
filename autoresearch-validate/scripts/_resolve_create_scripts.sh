#!/usr/bin/env bash
# Resolve harness directory: bundled vendor/harness by default, or AUTORESEARCH_CREATE_SCRIPTS override.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
if [[ -n "${AUTORESEARCH_CREATE_SCRIPTS:-}" ]]; then
  echo "$AUTORESEARCH_CREATE_SCRIPTS"
  exit 0
fi
if [[ -f "$ROOT/vendor/harness/run_baseline.sh" ]]; then
  echo "$ROOT/vendor/harness"
  exit 0
fi
echo "run_baseline.sh not found under vendor/harness or AUTORESEARCH_CREATE_SCRIPTS" >&2
exit 1
