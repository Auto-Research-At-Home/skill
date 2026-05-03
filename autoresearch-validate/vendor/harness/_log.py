"""Tiny shared logger for autoresearch-create scripts.

Visual grammar:

  ▸ section heading        (bold)
    · detail line          (dim, indented)
    ✓ success message      (green)
    ✗ failure message      (red)

Falls back to ASCII (`->`, `*`, `[ok]`, `[err]`) when stdout is not a TTY
or when NO_COLOR is set.
"""

from __future__ import annotations

import os
import sys
from typing import TextIO


def _use_color(stream: TextIO) -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    return getattr(stream, "isatty", lambda: False)()


def _ansi(code: str, text: str, stream: TextIO) -> str:
    if not _use_color(stream):
        return text
    return f"\033[{code}m{text}\033[0m"


def section(label: str, *, stream: TextIO = sys.stdout) -> None:
    glyph = "▸" if _use_color(stream) else "->"
    stream.write(_ansi("1", f"{glyph} {label}", stream) + "\n")
    stream.flush()


def detail(text: str, *, stream: TextIO = sys.stdout) -> None:
    glyph = "·" if _use_color(stream) else "*"
    stream.write(_ansi("2", f"  {glyph} {text}", stream) + "\n")
    stream.flush()


def blank(*, stream: TextIO = sys.stdout) -> None:
    stream.write("\n")
    stream.flush()


def ok(text: str, *, stream: TextIO = sys.stdout) -> None:
    glyph = "✓" if _use_color(stream) else "[ok]"
    stream.write("  " + _ansi("32", f"{glyph} {text}", stream) + "\n")
    stream.flush()


def fail(text: str, *, stream: TextIO = sys.stderr) -> None:
    glyph = "✗" if _use_color(stream) else "[err]"
    stream.write("  " + _ansi("31", f"{glyph} {text}", stream) + "\n")
    stream.flush()
