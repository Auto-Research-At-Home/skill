# shellcheck shell=bash
# Source this from any script that runs `git` on the host against a working
# tree that may have been mutated by an untrusted trial inside the sandbox.
#
# Neutralizes:
#   - hooks the trial may have planted in .git/hooks/* (core.hooksPath=/dev/null)
#   - system + global git config that might add a credential helper, fsmonitor,
#     sshCommand, or pager that runs code (GIT_CONFIG_NOSYSTEM, GIT_CONFIG_GLOBAL)
#   - protocol upgrades by random URLs (GIT_PROTOCOL_FROM_USER=0)
#   - inherited SSH/credential helpers from the parent shell
#
# Use after `set -euo pipefail`:
#     source "$(dirname "${BASH_SOURCE[0]}")/_git_safe.sh"

export GIT_TERMINAL_PROMPT="${GIT_TERMINAL_PROMPT:-0}"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_PROTOCOL_FROM_USER=0

# Inject `core.hooksPath=/dev/null` into every git invocation in this shell.
# Git 2.31+ honors GIT_CONFIG_COUNT / GIT_CONFIG_KEY_<n> / GIT_CONFIG_VALUE_<n>.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=core.hooksPath
export GIT_CONFIG_VALUE_0=/dev/null

unset GIT_SSH GIT_SSH_COMMAND GIT_ASKPASS GIT_EDITOR
