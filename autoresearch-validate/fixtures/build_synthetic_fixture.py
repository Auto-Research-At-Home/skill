#!/usr/bin/env python3
"""Build a local verifier fixture used by scripts/run_tests.sh."""
from __future__ import annotations

import hashlib
import io
import json
import shutil
import tarfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "synthetic"
REPO = OUT / "repo"


def write_text(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def sha256_hex(path: Path) -> str:
    return "0x" + hashlib.sha256(path.read_bytes()).hexdigest()


def add_file(tf: tarfile.TarFile, path: Path, arcname: str) -> None:
    data = path.read_bytes()
    info = tarfile.TarInfo(arcname)
    info.size = len(data)
    info.mtime = 0
    info.mode = 0o644
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    tf.addfile(info, fileobj=io.BytesIO(data))


def main() -> int:
    shutil.rmtree(OUT, ignore_errors=True)
    REPO.mkdir(parents=True)

    protocol = {
        "schemaKind": "protocol",
        "schemaVersion": "1",
        "execution": {
            "cwd": ".",
            "command": "python3 src/solver.py",
            "hardTimeoutSeconds": 10,
        },
        "environment": {"setupCommands": []},
        "measurement": {
            "primaryMetric": {
                "name": "score",
                "direction": "minimize",
                "extract": {"kind": "regex", "pattern": r"score=([0-9.]+)"},
            }
        },
        "mutableSurface": {
            "allowedGlobs": ["src/**"],
            "forbiddenGlobs": ["secrets/**"],
        },
        "immutableHarness": {
            "paths": [".autoresearch/publish/**"],
        },
    }
    protocol_text = json.dumps(protocol, indent=2, sort_keys=True) + "\n"
    write_text(REPO / ".autoresearch/publish/protocol.json", protocol_text)
    write_text(OUT / "protocol.json", protocol_text)
    write_text(REPO / ".autoresearch/publish/benchmark.log", "score=2.5\nBASELINE_METRIC=2.5\n")
    write_text(REPO / "README.md", "# synthetic verifier fixture\n")
    write_text(REPO / "src/solver.py", "print('score=2.5')\n")

    tar_path = OUT / "synthetic_tar.tar"
    with tarfile.open(tar_path, "w") as tf:
        for path in sorted(p for p in REPO.rglob("*") if p.is_file()):
            add_file(tf, path, path.relative_to(REPO).as_posix())

    code_hash = sha256_hex(tar_path)
    benchmark_hash = sha256_hex(REPO / ".autoresearch/publish/benchmark.log")
    index = {
        "schemaVersion": "1",
        "entries": {
            code_hash: {
                "code_fetch_uri": tar_path.resolve().as_uri(),
                "benchmark_inline_path": ".autoresearch/publish/benchmark.log",
            }
        },
    }
    write_text(OUT / "artifact_index.json", json.dumps(index, indent=2, sort_keys=True) + "\n")
    write_text(OUT / "hashes.txt", f"codeHash={code_hash}\nbenchmarkLogHash={benchmark_hash}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
