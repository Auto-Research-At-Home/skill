#!/usr/bin/env bash
# Open GitHub PR with evidence from trial record; enforces network_state guardrails.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=_git_safe.sh
source "$SCRIPT_DIR/_git_safe.sh"

ALLOW_LOCAL=0
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-local-only-pr) ALLOW_LOCAL=1 ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done
set -- "${ARGS[@]}"

usage() {
  echo "Usage: $0 [--allow-local-only-pr] <repo_root> <protocol.json> <trial_json_or_jsonl>" >&2
  exit 2
}

[[ ${3:-} ]] || usage
REPO_ROOT=$(cd "$1" && pwd)
PROTOCOL=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
REF="$3"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) not installed — brew install gh or https://cli.github.com/" >&2
  exit 3
fi

NET="$REPO_ROOT/.autoresearch/mine/network_state.json"
if [[ ! -f "$NET" ]]; then
  echo "missing network_state.json" >&2
  exit 2
fi

TMP_TRIAL=$(mktemp)
BODY_FILE=$(mktemp)
trap 'rm -f "$TMP_TRIAL" "$BODY_FILE"' EXIT

case "$REF" in
  *.jsonl) tail -n 1 "$REF" >"$TMP_TRIAL" ;;
  *) cp "$REF" "$TMP_TRIAL" ;;
esac

python3 "$SCRIPT_DIR/_open_pr_evidence.py" \
  --protocol "$PROTOCOL" \
  --network-state "$NET" \
  --trial-json "$TMP_TRIAL" \
  --allow-local-only-pr "$ALLOW_LOCAL" \
  --repo-root "$REPO_ROOT" \
  --compare-script "$SCRIPT_DIR/compare_metric.py" || exit 4

python3 <<PY >"$BODY_FILE"
import json
with open("$TMP_TRIAL", encoding="utf-8") as f:
    t = json.load(f)
lines = [
    "## Mining trial",
    "",
    f"- **trial_id:** {t.get('trial_id', '')}",
    f"- **primary metric:** {t.get('primary_metric_name', '')} = {t.get('primary_metric_value')}",
    f"- **stdout log:** `{t.get('stdout_log_path', '')}`",
    "",
    "Opened by autoresearch-mine `open_pr_with_evidence.sh`.",
]
print("\\n".join(lines))
PY

TID=$(python3 -c "import json; print(json.load(open('$TMP_TRIAL'))['trial_id'])")
(
  cd "$REPO_ROOT"
  gh pr create --title "mine: improve ${TID}" --body-file "$BODY_FILE"
) || exit 1

exit 0
