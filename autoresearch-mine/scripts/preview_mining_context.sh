#!/usr/bin/env bash
set -euo pipefail
export GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CREATE_SCRIPTS_DIR=$("$SCRIPT_DIR/_resolve_create_scripts.sh") || exit 1

[[ ${1:-} ]] || { echo "Usage: $0 <protocol.json>" >&2; exit 1; }
PROTOCOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")

exec python3 "$CREATE_SCRIPTS_DIR/preview_metrics.py" "$PROTOCOL"
