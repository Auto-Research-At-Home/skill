#!/usr/bin/env bash
# Clone meta.repo.cloneUrl into parent_dir/<owner>-<name>, or reuse existing git checkout.
set -euo pipefail
export GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}"

usage() {
  echo "Usage: $0 <protocol.json> <parent_dir_for_clone>" >&2
  exit 1
}

[[ ${2:-} ]] || usage
PROTOCOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
PARENT=$(cd "$2" && pwd)

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

SKIND=$(jq -r '.schemaKind // empty' "$PROTOCOL")
if [[ "$SKIND" != "protocol" ]]; then
  echo "protocol.json must have schemaKind protocol." >&2
  exit 1
fi

OWNER=$(jq -r '.meta.repo.owner // empty' "$PROTOCOL")
NAME=$(jq -r '.meta.repo.name // empty' "$PROTOCOL")
URL=$(jq -r '.meta.repo.cloneUrl // empty' "$PROTOCOL")

if [[ -z "$OWNER" || -z "$NAME" || -z "$URL" ]]; then
  echo "meta.repo.owner, name, cloneUrl required in protocol." >&2
  exit 1
fi

TARGET="$PARENT/$OWNER-$NAME"

if [[ -d "$TARGET/.git" ]]; then
  git -C "$TARGET" fetch --quiet origin 2>/dev/null || true
  DEFAULT_BRANCH=$(jq -r '.meta.repo.defaultBranch // empty' "$PROTOCOL")
  if [[ -n "$DEFAULT_BRANCH" ]]; then
    git -C "$TARGET" checkout "$DEFAULT_BRANCH" --quiet 2>/dev/null || true
  fi
  echo "$TARGET"
  exit 0
fi

if [[ -e "$TARGET" ]]; then
  echo "path exists and is not a git repo: $TARGET" >&2
  exit 2
fi

git clone --quiet "$URL" "$TARGET" || exit 2
echo "$TARGET"
exit 0
