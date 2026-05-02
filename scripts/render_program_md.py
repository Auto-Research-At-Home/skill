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


def main() -> int:
    try:
        from jinja2 import Environment, FileSystemLoader
    except ImportError:
        print(
            "render_program_md: install Jinja2:  pip install jinja2",
            file=sys.stderr,
        )
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
        print(f"render_program_md: missing template: {template_dir / 'program.md.j2'}", file=sys.stderr)
        return 1

    path = args.protocol_json.resolve()
    if not path.is_file():
        print(f"render_program_md: not found: {path}", file=sys.stderr)
        return 1

    text = path.read_text(encoding="utf-8")
    ctx = json.loads(text)

    if ctx.get("schemaKind") != "protocol":
        print(
            "render_program_md: expected schemaKind 'protocol' (finalize protocol before rendering).",
            file=sys.stderr,
        )
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
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
