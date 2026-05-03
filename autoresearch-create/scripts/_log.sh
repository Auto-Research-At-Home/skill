# Tiny shared logger for autoresearch-create shell scripts.
# Source this file:  source "$(dirname "${BASH_SOURCE[0]}")/_log.sh"
#
# Visual grammar matches scripts/_log.py:
#   ▸ section   ·detail   ✓ ok   ✗ fail
# Falls back to ASCII when stdout is not a TTY or NO_COLOR is set.

if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
  _LOG_BOLD=$'\033[1m'
  _LOG_DIM=$'\033[2m'
  _LOG_GREEN=$'\033[32m'
  _LOG_RED=$'\033[31m'
  _LOG_RESET=$'\033[0m'
  _LOG_GLYPH_SECTION="▸"
  _LOG_GLYPH_DETAIL="·"
  _LOG_GLYPH_OK="✓"
  _LOG_GLYPH_FAIL="✗"
else
  _LOG_BOLD=""
  _LOG_DIM=""
  _LOG_GREEN=""
  _LOG_RED=""
  _LOG_RESET=""
  _LOG_GLYPH_SECTION="->"
  _LOG_GLYPH_DETAIL="*"
  _LOG_GLYPH_OK="[ok]"
  _LOG_GLYPH_FAIL="[err]"
fi

log_section() {
  printf '%s%s %s%s\n' "$_LOG_BOLD" "$_LOG_GLYPH_SECTION" "$1" "$_LOG_RESET"
}

log_detail() {
  printf '  %s%s %s%s\n' "$_LOG_DIM" "$_LOG_GLYPH_DETAIL" "$1" "$_LOG_RESET"
}

log_ok() {
  printf '  %s%s %s%s\n' "$_LOG_GREEN" "$_LOG_GLYPH_OK" "$1" "$_LOG_RESET"
}

log_fail() {
  printf '  %s%s %s%s\n' "$_LOG_RED" "$_LOG_GLYPH_FAIL" "$1" "$_LOG_RESET" >&2
}
