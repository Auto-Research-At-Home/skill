#!/usr/bin/env bash
# Create .autoresearch/mine layout under repo root; seed network_state template if missing.
set -euo pipefail
export GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

usage() {
  echo "Usage: $0 <repo_root>" >&2
  exit 1
}

[[ ${1:-} ]] || usage
REPO_ROOT=$(cd "$1" && pwd)
MINE_DIR="$REPO_ROOT/.autoresearch/mine"
TEMPLATE="$SCRIPT_DIR/../templates/network_state.manual.json"

mkdir -p "$MINE_DIR/runs" || exit 2
touch "$MINE_DIR/trials.jsonl" || exit 2

if [[ ! -f "$MINE_DIR/network_state.json" ]]; then
  if [[ ! -f "$TEMPLATE" ]]; then
    echo "missing template: $TEMPLATE" >&2
    exit 2
  fi
  cp "$TEMPLATE" "$MINE_DIR/network_state.json" || exit 2
fi

exit 0
