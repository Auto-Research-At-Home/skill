"""Small .env loader for miner-side scripts.

Security notes:
  - We deliberately refuse to load `ARAH_PRIVATE_KEY` from .env files. Use the
    wallet keystore instead (`scripts/wallet.py init|sign`). Loading a private
    key into process env exposes it to every subprocess, including the
    untrusted benchmark harness.
"""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_STAKE_TOKENS = "1"

# Keys we never auto-load from .env; if a user has them set in the shell
# already we let them through (other code may be intentionally relying on
# them), but the dotenv loader will not import them.
DENYLIST = frozenset({"ARAH_PRIVATE_KEY", "ARAH_WALLET_PASSPHRASE"})


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def load_dotenv_from_cwd() -> Path | None:
    """Load KEY=VALUE pairs from .env in the current working directory.

    Existing environment variables win over .env values. Variables in
    DENYLIST are never loaded — keep secrets out of process env.
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
        if not key or key in os.environ or key in DENYLIST:
            continue
        os.environ[key] = _strip_quotes(value.strip())
    return path


def env_or_default_stake() -> str:
    """Return the configured stake count in *whole ProjectToken units*.

    ProjectToken has decimals() == 0, so the stake is just an integer count
    of tokens. Defaults to 1 — the contract only requires stake > 0.
    """
    return os.environ.get("ARAH_STAKE", DEFAULT_STAKE_TOKENS)


def missing_wallet_message(wallet_id: str | None = None) -> str:
    target = wallet_id or "<id>"
    return (
        "No mining wallet keystore found. Initialize one with:\n"
        f"  python3 scripts/wallet.py init --id {target}\n"
        "Then fund the printed address with native gas + ProjectToken stake. "
        "Pass --wallet-id and --passphrase-file (or set ARAH_WALLET_PASSPHRASE) "
        "to scripts that need to sign."
    )
