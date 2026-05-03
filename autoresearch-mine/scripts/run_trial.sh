#!/usr/bin/env bash
# Run one benchmark trial: delegates to bundled run_baseline.sh (vendor/harness by default).
set -euo pipefail
export GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=_resolve_create_scripts.sh
CREATE_SCRIPTS_DIR=$("$SCRIPT_DIR/_resolve_create_scripts.sh") || exit 3

usage() {
  echo "Usage: $0 <protocol.json> <repo_root> <trial_id>" >&2
  exit 2
}

[[ ${3:-} ]] || usage
PROTOCOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
REPO_ROOT=$(cd "$2" && pwd)
TRIAL_ID=$3

RUN_DIR="$REPO_ROOT/.autoresearch/mine/runs/$TRIAL_ID"
mkdir -p "$RUN_DIR"
LOG_FILE="$RUN_DIR/stdout.log"

exec bash "$CREATE_SCRIPTS_DIR/run_baseline.sh" "$PROTOCOL" "$REPO_ROOT" --log "$LOG_FILE"
