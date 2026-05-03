#!/usr/bin/env bash
# Run Phase-1 baseline from a finalized protocol.json: setup commands, timed main command, metric extract.
#
# Usage:
#   ./run_baseline.sh <protocol.json> <repo_root> [--dry-run] [--log baseline_run.log]
#
# Requires: jq, bash 4+. Uses GNU timeout on Linux, gtimeout (brew coreutils) on macOS when available,
# otherwise python3 for subprocess timeouts.
#
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=_log.sh
source "$SCRIPT_DIR/_log.sh"

usage() {
  echo "Usage: $0 <protocol.json> <repo_root> [--dry-run] [--log FILE]" >&2
  exit 1
}

[[ ${1-} ]] && [[ ${2-} ]] || usage
PROTOCOL=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
REPO_ROOT=$(cd "$2" && pwd)
shift 2

DRY_RUN=0
LOG_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --log) LOG_FILE=${2:?}; shift ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
  shift
done

if ! command -v jq >/dev/null 2>&1; then
  log_fail "jq is required (brew install jq / apt install jq)."
  exit 1
fi

if [[ ! -f "$PROTOCOL" ]]; then
  log_fail "protocol not found: $PROTOCOL"
  exit 1
fi

UNAME_S=$(uname -s)

# Timeout selection: Linux prefers GNU timeout(1); macOS prefers gtimeout (brew install coreutils),
# then any timeout on PATH; finally python3 subprocess (portable).
run_with_timeout() {
  local secs=$1
  shift

  if [[ "$secs" == "0" ]] || [[ -z "$secs" ]]; then
    "$@"
    return $?
  fi

  if [[ "$UNAME_S" == "Linux" ]] && command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
    return $?
  fi

  if [[ "$UNAME_S" == "Darwin" ]] && command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
    return $?
  fi

  if command -v timeout >/dev/null 2>&1; then
    timeout "$secs" "$@"
    return $?
  fi

  if command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$secs" "$@"
    return $?
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import subprocess, sys
s = int(sys.argv[1])
raise SystemExit(subprocess.run(sys.argv[2:], timeout=s).returncode)' "$secs" "$@"
    return $?
  fi

  log_fail "no timeout binary (timeout/gtimeout/python3); running without wall limit."
  "$@"
  return $?
}

SKIND=$(jq -r '.schemaKind // empty' "$PROTOCOL")
if [[ "$SKIND" != "protocol" ]]; then
  log_fail "protocol.json must have schemaKind \"protocol\" (got: ${SKIND:-missing})."
  exit 1
fi

REL_CWD=$(jq -r '.execution.cwd // "."' "$PROTOCOL")
HARD=$(jq -r '.execution.hardTimeoutSeconds // 0' "$PROTOCOL")
# Normalize to integer seconds for timeout(1) / Python.
HARD=$(printf '%.0f' "$HARD")
MAIN_CMD=$(jq -r '.execution.command // empty' "$PROTOCOL")

if [[ -z "$MAIN_CMD" ]]; then
  log_fail "execution.command is empty."
  exit 1
fi

WORKDIR="$REPO_ROOT/$REL_CWD"
WORKDIR=$(cd "$WORKDIR" && pwd)

if [[ -z "$LOG_FILE" ]]; then
  LOG_FILE="$WORKDIR/baseline_run.log"
fi

log_section "baseline"
log_detail "workdir: $WORKDIR"
log_detail "log:     $LOG_FILE"
log_detail "timeout: ${HARD}s   os: $UNAME_S"

# Read setup commands once into an array so we can summarize cleanly.
SETUP_CMDS=()
while IFS= read -r cmd; do
  [[ -z "$cmd" ]] && continue
  SETUP_CMDS+=("$cmd")
done < <(jq -r '.environment.setupCommands[]? // empty' "$PROTOCOL")

run_setup() {
  local n=${#SETUP_CMDS[@]}
  if [[ "$n" -eq 0 ]]; then
    return 0
  fi
  log_section "baseline · setup ($n command$([[ $n -eq 1 ]] || echo s))"
  local i=0
  if [[ "$n" -gt 5 ]]; then
    log_detail "(verbose; collapsed — full output streams below)"
  fi
  for cmd in "${SETUP_CMDS[@]}"; do
    i=$((i + 1))
    if [[ "$n" -le 5 ]]; then
      log_detail "[$i/$n] $cmd"
    fi
    if [[ "$DRY_RUN" -eq 1 ]]; then
      continue
    fi
    (cd "$WORKDIR" && bash -lc "$cmd")
  done
}

extract_metric() {
  local log_path=$1
  python3 - "$PROTOCOL" "$log_path" <<'PY'
import json, re, sys

proto_path, log_path = sys.argv[1], sys.argv[2]
with open(proto_path, encoding="utf-8") as f:
    proto = json.load(f)
ext = proto["measurement"]["primaryMetric"]["extract"]
kind = ext.get("kind")
pattern = ext.get("pattern") or ""
with open(log_path, encoding="utf-8", errors="replace") as f:
    text = f.read()
if kind != "regex":
    print("extract kind is not regex; inspect log manually.", file=sys.stderr)
    sys.exit(2)
m = re.search(pattern, text, re.MULTILINE)
if not m:
    print("primary metric regex did not match log.", file=sys.stderr)
    sys.exit(3)
val = m.group(1) if m.lastindex else m.group(0)
print(val)
PY
}

if [[ "$DRY_RUN" -eq 1 ]]; then
  log_section "baseline · dry run"
  if [[ ${#SETUP_CMDS[@]} -gt 0 ]]; then
    log_detail "would run ${#SETUP_CMDS[@]} setup command(s) from protocol"
  fi
  log_detail "would run: (cd \"$WORKDIR\" && timeout ${HARD}s bash -lc <main>) |& tee \"$LOG_FILE\""
  log_detail "main: $MAIN_CMD"
  exit 0
fi

run_setup

log_section "baseline · run (timeout ${HARD}s)"
log_detail "main: $MAIN_CMD"
log_detail "(streaming to $LOG_FILE)"

set +e
cd "$WORKDIR" && run_with_timeout "$HARD" bash -lc "$MAIN_CMD" 2>&1 | tee "$LOG_FILE"
EXIT_MAIN=${PIPESTATUS[0]}
set -e

log_section "baseline · result"
METRIC=""
if [[ "$EXIT_MAIN" -eq 0 ]]; then
  if METRIC=$(extract_metric "$LOG_FILE" 2>/tmp/baseline_extract_err.$$); then
    log_ok "exit 0   metric=$METRIC"
    echo "BASELINE_METRIC=$METRIC"
  else
    log_fail "exit 0 but metric not extractable: $(cat /tmp/baseline_extract_err.$$ 2>/dev/null)"
  fi
  rm -f /tmp/baseline_extract_err.$$
else
  log_fail "main command failed (exit $EXIT_MAIN); skipping metric extraction."
fi

exit "$EXIT_MAIN"
