#!/usr/bin/env python3
"""
Render agent-facing program.md from a finalized protocol.json using templates/program.md.j2.

Requires: pip install jinja2

Usage:
  python scripts/render_program_md.py path/to/protocol.json -o path/to/program.md
  python scripts/render_program_md.py ./out/protocol.json   # writes ./out/program.md
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _log  # noqa: E402


def main() -> int:
    try:
        from jinja2 import Environment, FileSystemLoader
    except ImportError:
        _log.fail("Jinja2 missing — install with:  pip install jinja2")
        return 1

    parser = argparse.ArgumentParser(description="Render program.md from protocol.json")
    parser.add_argument(
        "protocol_json",
        type=Path,
        help="Finalized protocol (schemaKind: protocol)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output Markdown path (default: next to protocol.json as program.md)",
    )
    parser.add_argument(
        "--template-dir",
        type=Path,
        default=None,
        help="Directory containing program.md.j2 (default: ../templates under package root)",
    )
    args = parser.parse_args()

    pkg_root = Path(__file__).resolve().parent.parent
    template_dir = args.template_dir or (pkg_root / "templates")
    if not (template_dir / "program.md.j2").is_file():
        _log.fail(f"missing template: {template_dir / 'program.md.j2'}")
        return 1

    path = args.protocol_json.resolve()
    if not path.is_file():
        _log.fail(f"not found: {path}")
        return 1

    text = path.read_text(encoding="utf-8")
    ctx = json.loads(text)

    if ctx.get("schemaKind") != "protocol":
        _log.fail("expected schemaKind 'protocol' (finalize protocol before rendering).")
        return 1

    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    template = env.get_template("program.md.j2")
    rendered = template.render(**ctx)

    out = args.output
    if out is None:
        out = path.parent / "program.md"
    else:
        out = out.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(rendered, encoding="utf-8")
    _log.section("program.md rendered")
    _log.detail(str(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
