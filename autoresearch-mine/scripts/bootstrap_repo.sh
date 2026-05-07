#!/usr/bin/env bash
# Clone meta.repo.cloneUrl into <parent>/<owner>-<name>, or reuse an existing
# checkout. The clone runs with a scrubbed git config so that crafted repo
# urls / configs cannot execute attacker-controlled code (fsmonitor, sshCommand,
# etc.). Only https:// URLs from a small allowlist are accepted by default.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=_git_safe.sh
source "$SCRIPT_DIR/_git_safe.sh"

usage() {
  echo "Usage: $0 <protocol.json> <parent_dir_for_clone> [--allow-host <host>]..." >&2
  exit 1
}

[[ ${2:-} ]] || usage
PROTOCOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
PARENT=$(cd "$2" && pwd)
shift 2

# Default allowlist (host portion only; scheme must be https).
ALLOWED_HOSTS=("github.com" "gitlab.com" "codeberg.org" "bitbucket.org")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-host) ALLOWED_HOSTS+=("${2:?}"); shift ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
  shift
done

# Honor an env-supplied extra allowlist (colon-separated) too.
if [[ -n "${ARAH_BOOTSTRAP_EXTRA_HOSTS:-}" ]]; then
  IFS=':' read -r -a EXTRA <<<"$ARAH_BOOTSTRAP_EXTRA_HOSTS"
  ALLOWED_HOSTS+=("${EXTRA[@]}")
fi

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

# URL validation: require https://<host>/<owner>/<name>(.git)?  with host in allowlist.
if [[ ! "$URL" =~ ^https://([^/[:space:]]+)/(.+)$ ]]; then
  echo "refusing non-https cloneUrl: $URL" >&2
  exit 1
fi
HOST="${BASH_REMATCH[1]}"
host_ok=0
for h in "${ALLOWED_HOSTS[@]}"; do
  if [[ "$HOST" == "$h" ]]; then host_ok=1; break; fi
done
if [[ "$host_ok" -ne 1 ]]; then
  echo "cloneUrl host not in allowlist: $HOST" >&2
  echo "(allowlist: ${ALLOWED_HOSTS[*]}; extend with --allow-host <host> or ARAH_BOOTSTRAP_EXTRA_HOSTS)" >&2
  exit 1
fi

# Owner / name must look like normal git path components.
case "$OWNER$NAME" in
  *..*|*/*|*[[:space:]]*) echo "invalid meta.repo.owner/name characters" >&2; exit 1 ;;
esac

TARGET="$PARENT/$OWNER-$NAME"

# These -c flags neuter the dangerous post-clone hooks an attacker could
# embed in a malicious repository's .git/config or environment.
GIT_HARDEN=(
  -c protocol.allow=user
  -c protocol.file.allow=never
  -c protocol.ext.allow=never
  -c "core.fsmonitor="
  -c "core.sshCommand="
  -c "core.gitProxy="
  -c uploadpack.packObjectsHook=
  -c "credential.helper="
  -c http.followRedirects=true
)

if [[ -d "$TARGET/.git" ]]; then
  git "${GIT_HARDEN[@]}" -C "$TARGET" fetch --quiet origin 2>/dev/null || true
  DEFAULT_BRANCH=$(jq -r '.meta.repo.defaultBranch // empty' "$PROTOCOL")
  if [[ -n "$DEFAULT_BRANCH" ]]; then
    git "${GIT_HARDEN[@]}" -C "$TARGET" checkout "$DEFAULT_BRANCH" --quiet 2>/dev/null || true
  fi
  echo "$TARGET"
  exit 0
fi

if [[ -e "$TARGET" ]]; then
  echo "path exists and is not a git repo: $TARGET" >&2
  exit 2
fi

git "${GIT_HARDEN[@]}" clone --quiet "$URL" "$TARGET" || exit 2
echo "$TARGET"
exit 0
