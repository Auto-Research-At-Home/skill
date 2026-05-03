#!/usr/bin/env bash
# Ensure .autoresearch/mine/network_state.json matches protocol bundle id and metric fields.
set -euo pipefail
export GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}"

usage() {
  echo "Usage: $0 <protocol.json> <repo_root>" >&2
  exit 1
}

[[ ${2:-} ]] || usage
PROTOCOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
REPO_ROOT=$(cd "$2" && pwd)
NET="$REPO_ROOT/.autoresearch/mine/network_state.json"

if [[ ! -f "$NET" ]]; then
  echo "missing: $NET (run init_mine_workspace.sh)" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

PID=$(jq -r '.meta.protocolBundleId // empty' "$PROTOCOL")
NM=$(jq -r '.measurement.primaryMetric.name // empty' "$PROTOCOL")
DIR=$(jq -r '.measurement.primaryMetric.direction // empty' "$PROTOCOL")

EPID=$(jq -r '.protocolBundleId // empty' "$NET")
ENM=$(jq -r '.metric_name // empty' "$NET")
EDIR=$(jq -r '.direction // empty' "$NET")

if [[ "$EPID" != "$PID" ]]; then
  echo "network_state.protocolBundleId ($EPID) != protocol meta.protocolBundleId ($PID)" >&2
  exit 1
fi
if [[ "$ENM" != "$NM" ]]; then
  echo "network_state.metric_name ($ENM) != protocol primary metric ($NM)" >&2
  exit 1
fi
if [[ "$EDIR" != "$DIR" ]]; then
  echo "network_state.direction ($EDIR) != protocol ($DIR)" >&2
  exit 1
fi

exit 0
