#!/usr/bin/env bash
# Run an arbitrary shell command inside a sandbox with scrubbed env, default-deny
# network, capped CPU/memory/PIDs, and a writable view limited to the repo workdir.
#
# Detection order (first available wins):
#   1. podman   (rootless preferred)
#   2. docker
#   3. bwrap    (Linux only; namespaces + seccomp)
#   4. fallthrough — refuses to run unless ARAH_SANDBOX=none is set explicitly
#
# Usage:
#   run_in_sandbox.sh \
#     --workdir /path/to/repo \
#     [--cwd .]                  # subdirectory of workdir
#     [--timeout 300]            # whole-command wall-clock seconds
#     [--cpus 2]                 # CPU quota
#     [--memory 4g]              # memory cap
#     [--pids 256]               # PID cap
#     [--network none|bridge]    # default: none
#     [--allow-host-net]         # alias for --network bridge
#     [--image <ref>]            # container image (default: docker.io/library/debian:stable-slim)
#     [--env KEY=VALUE]...       # explicit env (no host env passthrough)
#     -- <command...>
#
# Env knobs:
#   ARAH_SANDBOX           podman|docker|bwrap|none|auto (default: auto)
#   ARAH_SANDBOX_IMAGE     default container image
#   ARAH_SANDBOX_LOG_BYTES truncate captured stdout at N bytes (default: 67108864)
#
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=_log.sh
source "$SCRIPT_DIR/_log.sh"

DEFAULT_IMAGE=${ARAH_SANDBOX_IMAGE:-docker.io/library/debian:stable-slim}
SANDBOX=${ARAH_SANDBOX:-auto}

WORKDIR=""
CWD="."
TIMEOUT=0
CPUS="2"
MEMORY="4g"
PIDS="256"
NETWORK="none"
IMAGE="$DEFAULT_IMAGE"
ENV_ARGS=()
CMD=()

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workdir) WORKDIR=${2:?}; shift ;;
    --cwd) CWD=${2:?}; shift ;;
    --timeout) TIMEOUT=${2:?}; shift ;;
    --cpus) CPUS=${2:?}; shift ;;
    --memory) MEMORY=${2:?}; shift ;;
    --pids) PIDS=${2:?}; shift ;;
    --network) NETWORK=${2:?}; shift ;;
    --allow-host-net) NETWORK="bridge" ;;
    --image) IMAGE=${2:?}; shift ;;
    --env) ENV_ARGS+=("$2"); shift ;;
    --) shift; CMD=("$@"); break ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
  shift
done

[[ -n "$WORKDIR" ]] || { echo "--workdir required" >&2; exit 2; }
[[ ${#CMD[@]} -gt 0 ]] || { echo "missing -- <command...>" >&2; exit 2; }
WORKDIR=$(cd "$WORKDIR" && pwd)

detect_runtime() {
  case "$SANDBOX" in
    none|podman|docker|bwrap) printf '%s' "$SANDBOX"; return ;;
    auto) ;;
    *) echo "ARAH_SANDBOX must be one of auto|podman|docker|bwrap|none (got: $SANDBOX)" >&2; exit 2 ;;
  esac
  if command -v podman >/dev/null 2>&1; then printf 'podman'; return; fi
  if command -v docker >/dev/null 2>&1; then printf 'docker'; return; fi
  if [[ "$(uname -s)" == "Linux" ]] && command -v bwrap >/dev/null 2>&1; then
    printf 'bwrap'; return
  fi
  printf 'none'
}

RUNTIME=$(detect_runtime)
log_detail "sandbox: $RUNTIME  workdir: $WORKDIR  network: $NETWORK"

build_env_args() {
  local prefix=$1
  local out=()
  for kv in "${ENV_ARGS[@]+"${ENV_ARGS[@]}"}"; do
    out+=("$prefix" "$kv")
  done
  printf '%s\n' "${out[@]+"${out[@]}"}"
}

run_container() {
  local engine=$1
  local net_arg
  case "$NETWORK" in
    none) net_arg=(--network=none) ;;
    bridge|host) net_arg=(--network=bridge) ;;
    *) echo "unsupported --network: $NETWORK" >&2; exit 2 ;;
  esac

  local engine_args=(
    run --rm
    --read-only
    --tmpfs /tmp:rw,size=512m
    --tmpfs /var/tmp:rw,size=128m
    --workdir "/work/$CWD"
    -v "$WORKDIR:/work:rw"
    --cpus "$CPUS"
    --memory "$MEMORY"
    --pids-limit "$PIDS"
    --cap-drop=ALL
    --security-opt no-new-privileges
    "${net_arg[@]}"
    --env HOME=/tmp
    --env PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    --env LANG=C.UTF-8
    --env LC_ALL=C.UTF-8
  )
  if [[ "$engine" == "podman" ]]; then
    engine_args+=(--userns=keep-id)
  fi
  for kv in "${ENV_ARGS[@]+"${ENV_ARGS[@]}"}"; do
    engine_args+=(--env "$kv")
  done
  engine_args+=("$IMAGE" /bin/bash -c "$(printf '%q ' "${CMD[@]}")")
  if [[ "$TIMEOUT" -gt 0 ]] && command -v timeout >/dev/null 2>&1; then
    timeout "$TIMEOUT" "$engine" "${engine_args[@]}"
  else
    "$engine" "${engine_args[@]}"
  fi
}

run_bwrap() {
  local net=()
  case "$NETWORK" in
    none) net=(--unshare-net) ;;
    bridge|host) net=(--share-net) ;;
    *) echo "unsupported --network: $NETWORK" >&2; exit 2 ;;
  esac
  local bwrap_args=(
    --die-with-parent
    --unshare-pid
    --unshare-ipc
    --unshare-uts
    --unshare-cgroup-try
    "${net[@]}"
    --new-session
    --proc /proc
    --dev /dev
    --tmpfs /tmp
    --tmpfs /var/tmp
    --ro-bind /usr /usr
    --ro-bind /bin /bin
    --ro-bind /lib /lib
    --symlink usr/lib64 /lib64
    --ro-bind /etc/alternatives /etc/alternatives
    --ro-bind /etc/ld.so.cache /etc/ld.so.cache
    --ro-bind-try /etc/ssl /etc/ssl
    --ro-bind-try /etc/ca-certificates /etc/ca-certificates
    --ro-bind-try /etc/resolv.conf /etc/resolv.conf
    --bind "$WORKDIR" /work
    --chdir "/work/$CWD"
    --setenv HOME /tmp
    --setenv PATH /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    --setenv LANG C.UTF-8
    --setenv LC_ALL C.UTF-8
    --clearenv
  )
  for kv in "${ENV_ARGS[@]+"${ENV_ARGS[@]}"}"; do
    bwrap_args+=(--setenv "${kv%%=*}" "${kv#*=}")
  done
  bwrap_args+=(/bin/bash -c "$(printf '%q ' "${CMD[@]}")")
  if [[ "$TIMEOUT" -gt 0 ]] && command -v timeout >/dev/null 2>&1; then
    timeout "$TIMEOUT" bwrap "${bwrap_args[@]}"
  else
    bwrap "${bwrap_args[@]}"
  fi
}

run_none() {
  if [[ -z "${ARAH_SANDBOX_ALLOW_UNSAFE:-}" ]] && [[ "${ARAH_SANDBOX:-}" != "none" ]]; then
    log_fail "no sandbox runtime found (podman/docker/bwrap). Set ARAH_SANDBOX=none and ARAH_SANDBOX_ALLOW_UNSAFE=1 to opt into running on host."
    exit 4
  fi
  log_detail "ARAH_SANDBOX=none — running on host (no isolation)."
  local env_pairs=("HOME=${HOME:-/tmp}" "PATH=${PATH}" "LANG=${LANG:-C.UTF-8}" "LC_ALL=${LC_ALL:-C.UTF-8}")
  for kv in "${ENV_ARGS[@]+"${ENV_ARGS[@]}"}"; do
    env_pairs+=("$kv")
  done
  if [[ "$TIMEOUT" -gt 0 ]] && command -v timeout >/dev/null 2>&1; then
    env -i "${env_pairs[@]}" timeout "$TIMEOUT" bash -c "cd $(printf %q "$WORKDIR/$CWD") && $(printf '%q ' "${CMD[@]}")"
  else
    env -i "${env_pairs[@]}" bash -c "cd $(printf %q "$WORKDIR/$CWD") && $(printf '%q ' "${CMD[@]}")"
  fi
}

case "$RUNTIME" in
  podman) run_container podman ;;
  docker) run_container docker ;;
  bwrap)  run_bwrap ;;
  none)   run_none ;;
  *) echo "internal: unknown runtime $RUNTIME" >&2; exit 2 ;;
esac
