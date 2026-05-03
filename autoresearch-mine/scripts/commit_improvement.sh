#!/usr/bin/env bash
# Stage allowed globs and commit with fixed message format.
set -euo pipefail
export GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

usage() {
  echo "Usage: $0 <protocol.json> <repo_root> <trial_id> <metric_before> <metric_after>" >&2
  exit 1
}

[[ ${5:-} ]] || usage
PROTOCOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
REPO_ROOT=$(cd "$2" && pwd)
TRIAL_ID=$3
MET_BEFORE=$4
MET_AFTER=$5

has=0
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  git -C "$REPO_ROOT" add -- "$path"
  has=1
done < <(python3 "$SCRIPT_DIR/list_mutable_paths.py" "$PROTOCOL" "$REPO_ROOT")

if [[ "$has" -eq 0 ]]; then
  exit 1
fi

if git -C "$REPO_ROOT" diff --cached --quiet; then
  exit 1
fi

if ! git -C "$REPO_ROOT" commit -m "mine(${TRIAL_ID}): primary ${MET_BEFORE} -> ${MET_AFTER}"; then
  exit 2
fi
exit 0
