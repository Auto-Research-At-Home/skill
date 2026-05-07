#!/usr/bin/env python3
"""Load artifact index and resolve codeHash → verified tarball path + benchmark log bytes."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def sha256_file(path: Path) -> bytes:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.digest()


def bytes32_norm(h: str) -> str:
    s = h.strip().lower()
    if not s.startswith("0x"):
        s = "0x" + s
    if len(s) != 66:
        raise ValueError("bytes32 must be 0x + 64 hex chars")
    return s


def load_index() -> dict[str, Any]:
    path = os.environ.get("ARAH_ARTIFACT_INDEX")
    url = os.environ.get("ARAH_ARTIFACT_INDEX_URL")
    if bool(path) == bool(url):
        raise ValueError("Set exactly one of ARAH_ARTIFACT_INDEX or ARAH_ARTIFACT_INDEX_URL")
    if path:
        raw = Path(path).expanduser().read_text(encoding="utf-8")
    else:
        req = urllib.request.Request(url, headers={"User-Agent": "autoresearch-validate"})
        with urllib.request.urlopen(req, timeout=int(os.environ.get("ARAH_ARTIFACT_FETCH_TIMEOUT", "120"))) as resp:
            raw = resp.read().decode("utf-8")
    data = json.loads(raw)
    if data.get("schemaVersion") != "1":
        raise ValueError("artifact index schemaVersion must be 1")
    return data


def fetch_url(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "autoresearch-validate"})
    with urllib.request.urlopen(req, timeout=int(os.environ.get("ARAH_ARTIFACT_FETCH_TIMEOUT", "120"))) as resp:
        dest.write_bytes(resp.read())


def extract_tarball(tar_path: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    if tar_path.suffix == ".gz" or str(tar_path).endswith(".tar.gz"):
        mode = "r:gz"
    else:
        mode = "r:"
    with tarfile.open(tar_path, mode) as tf:
        try:
            tf.extractall(dest, filter="data")  # type: ignore[call-arg]
        except TypeError:
            tf.extractall(dest)


def resolve_artifacts(code_hash: str, benchmark_log_hash: str) -> dict[str, str]:
    """Download + extract; verify tarball and miner benchmark log vs on-chain hashes. Returns paths dict."""
    code_hash = bytes32_norm(code_hash)
    bench_hash = bytes32_norm(benchmark_log_hash)
    index = load_index()
    entries = index.get("entries") or {}
    entry = entries.get(code_hash) or entries.get(code_hash.lower())
    if not entry:
        raise KeyError(f"codeHash not in index: {code_hash}")
    code_uri = entry["code_fetch_uri"]
    tmp = Path(tempfile.mkdtemp(prefix="arah-artifacts-"))
    tar_path = tmp / "code.tar"
    fetch_url(code_uri, tar_path)
    digest = sha256_file(tar_path)
    want = bytes.fromhex(code_hash[2:])
    if digest != want:
        raise ValueError("code tarball SHA-256 does not match codeHash")

    extract_root = tmp / "extract"
    extract_tarball(tar_path, extract_root)

    if entry.get("benchmark_log_uri"):
        lp = tmp / "benchmark.log"
        fetch_url(entry["benchmark_log_uri"], lp)
        log_bytes = lp.read_bytes()
    elif entry.get("benchmark_inline_path"):
        inner = (extract_root / entry["benchmark_inline_path"]).resolve()
        if not str(inner).startswith(str(extract_root.resolve())):
            raise ValueError("benchmark_inline_path escapes extract root")
        log_bytes = inner.read_bytes()
    else:
        raise ValueError("index entry needs benchmark_log_uri or benchmark_inline_path")

    if hashlib.sha256(log_bytes).digest() != bytes.fromhex(bench_hash[2:]):
        raise ValueError("benchmark log SHA-256 does not match benchmarkLogHash")

    out: dict[str, str] = {
        "work_dir": str(tmp),
        "extract_root": str(extract_root),
        "tar_path": str(tar_path),
        "protocol_subpath": os.environ.get("ARAH_PROTOCOL_SUBPATH", ".autoresearch/publish/protocol.json"),
    }
    # Optional reproducibility hints (artifact_index schemaVersion 2). The
    # validate loop uses these to pin the verifier's sandbox to the same
    # configuration the miner ran with.
    img = entry.get("sandbox_image_digest")
    if isinstance(img, str) and img:
        out["sandbox_image_digest"] = img
    pol = entry.get("network_policy_used")
    if isinstance(pol, str) and pol:
        out["network_policy_used"] = pol
    return out


def main() -> int:
    p = argparse.ArgumentParser(description="Resolve artifacts for a codeHash; writes temp dirs.")
    p.add_argument("--code-hash", required=True)
    p.add_argument("--benchmark-log-hash", required=True)
    args = p.parse_args()
    try:
        out = resolve_artifacts(args.code_hash, args.benchmark_log_hash)
    except KeyError as e:
        print(str(e), file=sys.stderr)
        return 2
    except (OSError, ValueError, urllib.error.URLError) as e:
        print(str(e), file=sys.stderr)
        return 1
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
