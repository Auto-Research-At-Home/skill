#!/usr/bin/env bash
# Restore tracked mutable paths from HEAD (discard working tree edits on allowed globs).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=_git_safe.sh
source "$SCRIPT_DIR/_git_safe.sh"

usage() {
  echo "Usage: $0 <protocol.json> <repo_root>" >&2
  exit 1
}

[[ ${2:-} ]] || usage
PROTOCOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
REPO_ROOT=$(cd "$2" && pwd)

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  git -C "$REPO_ROOT" checkout HEAD -- "$path"
done < <(python3 "$SCRIPT_DIR/list_mutable_paths.py" "$PROTOCOL" "$REPO_ROOT")

exit 0
