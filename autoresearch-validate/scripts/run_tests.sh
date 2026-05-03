#!/usr/bin/env bash
# Local smoke tests (no ARAH_PRIVATE_KEY, optional RPC for watch_proposals).
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
PY="${PYTHON:-python3}"
export PYTHONPATH="$ROOT/scripts${PYTHONPATH:+:$PYTHONPATH}"

# Chain scripts import web3 even for --help; install deps if missing (use python3 -m pip — works without a pip shim).
if ! "$PY" -c "import web3, eth_account" 2>/dev/null; then
  echo "== install requirements-chain.txt ($PY -m pip) =="
  if ! "$PY" -m pip install -r "$ROOT/requirements-chain.txt"; then
    echo "Install failed. Use a venv and: $PY -m pip install -r requirements-chain.txt" >&2
    exit 1
  fi
fi

echo "== compileall scripts =="
$PY -m compileall -q scripts

echo "== build synthetic fixture =="
$PY fixtures/build_synthetic_fixture.py

echo "== extract fixture tarball =="
rm -rf fixtures/synthetic/extract
mkdir -p fixtures/synthetic/extract
tar -xf fixtures/synthetic/synthetic_tar.tar -C fixtures/synthetic/extract

echo "== artifact_resolve =="
export ARAH_ARTIFACT_INDEX="$ROOT/fixtures/synthetic/artifact_index.json"
CH=$(grep '^codeHash=' fixtures/synthetic/hashes.txt | cut -d= -f2)
BH=$(grep '^benchmarkLogHash=' fixtures/synthetic/hashes.txt | cut -d= -f2)
$PY scripts/artifact_resolve.py --code-hash "$CH" --benchmark-log-hash "$BH" | $PY -c "import json,sys; json.load(sys.stdin); print('artifact_resolve JSON ok')"

echo "== verify_static_gates =="
$PY scripts/verify_static_gates.py --protocol fixtures/synthetic/protocol.json --repo-root "$ROOT/fixtures/synthetic/extract"

echo "== parse_baseline_metric =="
printf '%s\n' 'BASELINE_METRIC=2.5' > /tmp/arah-test-m.log
test "$($PY scripts/parse_baseline_metric.py /tmp/arah-test-m.log)" = "2.5"

echo "== compare_metric =="
$PY scripts/compare_metric.py --direction minimize --candidate 1.0 --baseline 2.0
$PY scripts/compare_metric.py --direction minimize --candidate 3.0 --baseline 2.0 && exit 1 || true

echo "== metric_codec =="
$PY -c "from metric_codec import decimal_metric_to_scaled_int; assert decimal_metric_to_scaled_int('2.5',1000000)==2500000"

echo "== chain scripts --help =="
for s in check_verifier_eligibility watch_proposals claim_review finalize_approve finalize_reject release_review expire_proposal; do
  $PY "scripts/${s}.py" --help >/dev/null
done

echo "== RPC watch_proposals (read-only) =="
$PY scripts/watch_proposals.py | head -20 || true

echo "ALL TESTS PASSED"
