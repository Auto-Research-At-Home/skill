#!/usr/bin/env bash
# Create and checkout mine/<protocolBundleId>/<YYYYMMDD>-<trial_id> (UTC date).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=_git_safe.sh
source "$SCRIPT_DIR/_git_safe.sh"

usage() {
  echo "Usage: $0 <protocol.json> <repo_root> <trial_id>" >&2
  exit 1
}

[[ ${3:-} ]] || usage
PROTOCOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
REPO_ROOT=$(cd "$2" && pwd)
TRIAL_ID=$3

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

BUNDLE=$(jq -r '.meta.protocolBundleId // "unknown-bundle"' "$PROTOCOL")
DATE=$(date -u +%Y%m%d)
BRANCH="mine/${BUNDLE}/${DATE}-${TRIAL_ID}"

git -C "$REPO_ROOT" checkout -B "$BRANCH"
exit 0
