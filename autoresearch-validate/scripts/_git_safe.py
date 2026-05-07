"""Hardened environment for host-side git subprocesses.

Use:
    from _git_safe import GIT_SAFE_ENV
    subprocess.run(["git", "-C", repo, "status"], env=GIT_SAFE_ENV, check=True)

Mirrors scripts/_git_safe.sh: nullifies hook execution, ignores system + global
git config, blocks user-driven protocol upgrades, and drops inherited SSH /
credential / askpass helpers from the parent shell.
"""

from __future__ import annotations

import os

_DROP = ("GIT_SSH", "GIT_SSH_COMMAND", "GIT_ASKPASS", "GIT_EDITOR")

_HARDENING = {
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_PROTOCOL_FROM_USER": "0",
    # GIT_CONFIG_COUNT/KEY/VALUE are git 2.31+; they layer onto every git call
    # in this process tree, so `core.hooksPath=/dev/null` applies even to
    # subcommands we don't pass `-c` to.
    "GIT_CONFIG_COUNT": "1",
    "GIT_CONFIG_KEY_0": "core.hooksPath",
    "GIT_CONFIG_VALUE_0": "/dev/null",
}


def _build() -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k not in _DROP}
    env.update(_HARDENING)
    return env


GIT_SAFE_ENV: dict[str, str] = _build()
