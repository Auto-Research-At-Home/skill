"""Small .env loader for miner-side scripts."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_STAKE_WEI = "1000000000000000000"


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def load_dotenv_from_cwd() -> Path | None:
    """Load KEY=VALUE pairs from .env in the current working directory.

    Existing environment variables win over .env values. This intentionally
    avoids a python-dotenv dependency because these scripts must stay portable.
    """

    path = Path.cwd() / ".env"
    if not path.is_file():
        return None

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = _strip_quotes(value.strip())
    return path


def env_or_default_stake() -> str:
    return os.environ.get("ARAH_STAKE_WEI", DEFAULT_STAKE_WEI)


def missing_private_key_message() -> str:
    return (
        "ARAH_PRIVATE_KEY is required. Put a .env file in the current working directory "
        "with ARAH_PRIVATE_KEY=0x... and optionally ARAH_STAKE_WEI="
        f"{DEFAULT_STAKE_WEI}, then rerun."
    )
