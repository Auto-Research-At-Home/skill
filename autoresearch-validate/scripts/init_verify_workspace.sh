#!/usr/bin/env bash
# Initialize .autoresearch/verify under a repo root (extract tree or record root).
set -euo pipefail
usage() {
  echo "Usage: $0 <repo_root>" >&2
  exit 2
}
[[ ${1:-} ]] || usage
ROOT=$(cd "$1" && pwd)
mkdir -p "$ROOT/.autoresearch/verify/runs"
touch "$ROOT/.autoresearch/verify/reviews.jsonl"
