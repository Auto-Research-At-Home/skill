#!/usr/bin/env python3
"""
Build discovery prompts for experiment-protocol Phase 1.

1. Clone a git repository (or use an existing checkout).
2. Gather README, manifests, CI, shallow tree, candidate entrypoints, optional script excerpt.
3. Fill prompts/discovery_user.md placeholders.
4. Copy prompts/discovery_system.md next to the filled user prompt for handoff to an LLM.

Usage (from the experiment-protocol package root):

  python scripts/build_discovery_bundle.py \\
    https://github.com/org/repo.git --output-dir ./discovery-out

  python scripts/build_discovery_bundle.py \\
    --existing-repo /path/to/checkout --output-dir ./out

Environment:
  GIT_TERMINAL_PROMPT=0  Recommended for non-interactive clones (avoid credential hangs).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


SKIP_DIR_NAMES = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".tox",
    "dist",
    "build",
    ".eggs",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "target",
    ".gradle",
}

PROTOCOL_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_USER = PROTOCOL_ROOT / "prompts" / "discovery_user.md"
TEMPLATE_SYSTEM = PROTOCOL_ROOT / "prompts" / "discovery_system.md"


def run_git(repo: Path | None, args: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    cmd = ["git"]
    if repo is not None:
        cmd.extend(["-C", str(repo)])
    cmd.extend(args)
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        check=False,
    )


def parse_repo_identity(url_or_path: str) -> tuple[str, str, str]:
    """Return (owner, name, clone_url_hint). Unknown pieces use N/A."""
    u = url_or_path.strip()
    m = re.search(r"github\.com[:/]([^/]+)/([^/.\s]+)", u)
    if m:
        return m.group(1), m.group(2).replace(".git", ""), u if u.startswith(("http", "git@")) else u
    m2 = re.match(r"git@([^:]+):([^/]+)/([^.\s]+)", u)
    if m2:
        return m2.group(2), m2.group(3).replace(".git", ""), u
    return "N/A", "N/A", u


def clone_repo(url: str, dest: Path, branch: str | None, depth: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["git", "clone", f"--depth={depth}", url, str(dest)]
    if branch:
        cmd[2:2] = ["--branch", branch]
    env = os.environ.copy()
    env.setdefault("GIT_TERMINAL_PROMPT", "0")
    r = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise RuntimeError(f"git clone failed: {r.stderr or r.stdout}")


def git_head(repo: Path) -> tuple[str, str]:
    r = run_git(repo, ["rev-parse", "HEAD"])
    sha = (r.stdout or "").strip() or "unknown"
    r2 = run_git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])
    head = (r2.stdout or "").strip() or "unknown"
    return sha, head


def git_remote_url(repo: Path) -> str:
    r = run_git(repo, ["remote", "get-url", "origin"])
    return (r.stdout or "").strip() or "N/A"


def read_if_exists(path: Path, max_chars: int | None = None) -> str | None:
    if not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    if max_chars is not None and len(text) > max_chars:
        return text[:max_chars] + "\n\n... [truncated]\n"
    return text


def file_tree_depth_2(root: Path, max_children: int = 80) -> str:
    lines: list[str] = []
    root = root.resolve()
    try:
        entries = sorted(root.iterdir(), key=lambda p: p.name.lower())
    except OSError as e:
        return f"(could not list root: {e})"
    shown = 0
    for p in entries:
        if p.name in SKIP_DIR_NAMES:
            continue
        if shown >= max_children:
            lines.append("... [truncated]")
            break
        rel = p.name
        if p.is_dir():
            lines.append(f"{rel}/")
            shown += 1
            sub_shown = 0
            try:
                subs = sorted(p.iterdir(), key=lambda q: q.name.lower())
            except OSError:
                continue
            for q in subs:
                if q.name in SKIP_DIR_NAMES:
                    continue
                if sub_shown >= 40:
                    lines.append("  ...")
                    break
                suf = "/" if q.is_dir() else ""
                lines.append(f"  {q.name}{suf}")
                sub_shown += 1
                shown += 1
                if shown >= max_children:
                    lines.append("... [truncated]")
                    break
        else:
            lines.append(rel)
            shown += 1
    return "\n".join(lines) if lines else "(empty root)"


def find_readme(repo: Path) -> str:
    for name in ("README.md", "README.rst", "readme.md", "Readme.md", "README"):
        p = repo / name
        if p.is_file():
            return read_if_exists(p, max_chars=None) or ""
    return "N/A"


def concat_python_manifests(repo: Path, max_total: int = 12000) -> str:
    chunks: list[str] = []
    total = 0
    for rel in ("pyproject.toml", "setup.cfg", "setup.py", "requirements.txt", "requirements-dev.txt"):
        p = repo / rel
        block = read_if_exists(p)
        if block:
            piece = f"--- {rel} ---\n{block}\n"
            if total + len(piece) > max_total:
                piece = piece[: max_total - total] + "\n... [truncated]\n"
                chunks.append(piece)
                break
            chunks.append(piece)
            total += len(piece)
    return "\n".join(chunks) if chunks else "N/A"


def read_node_manifest(repo: Path, max_chars: int = 8000) -> str:
    p = repo / "package.json"
    return read_if_exists(p, max_chars=max_chars) or "N/A"


def task_runner_excerpt(repo: Path, max_lines: int = 120, max_total_chars: int = 6000) -> str:
    parts: list[str] = []
    total = 0
    for rel in ("Makefile", "justfile", "Taskfile.yml", "taskfile.yml"):
        p = repo / rel
        raw = read_if_exists(p)
        if not raw:
            continue
        lines = raw.splitlines()
        body = "\n".join(lines[:max_lines])
        piece = f"--- {rel} ---\n{body}\n"
        if total + len(piece) > max_total_chars:
            piece = piece[: max_total_chars - total] + "\n... [truncated]\n"
            parts.append(piece)
            break
        parts.append(piece)
        total += len(piece)
    return "\n".join(parts) if parts else "N/A"


def ci_workflow_excerpt(repo: Path, max_per_file: int = 200, max_total: int = 10000) -> str:
    wf_dir = repo / ".github" / "workflows"
    if not wf_dir.is_dir():
        return "N/A"
    paths = sorted(wf_dir.glob("*.yml")) + sorted(wf_dir.glob("*.yaml"))
    if not paths:
        return "N/A"
    out: list[str] = []
    total = 0
    for p in paths[:12]:
        raw = read_if_exists(p)
        if not raw:
            continue
        lines = raw.splitlines()
        body = "\n".join(lines[:max_per_file])
        piece = f"--- {p.relative_to(repo)} ---\n{body}\n"
        if total + len(piece) > max_total:
            out.append(piece[: max_total - total] + "\n... [truncated]\n")
            break
        out.append(piece)
        total += len(piece)
    return "\n".join(out) if out else "N/A"


def iter_python_files(repo: Path, max_files: int = 400) -> Iterable[Path]:
    count = 0
    for dirpath, dirnames, filenames in os.walk(repo):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIR_NAMES and not d.startswith(".")]
        parts = Path(dirpath).relative_to(repo).parts
        if len(parts) > 8:
            dirnames[:] = []
            continue
        for fn in filenames:
            if not fn.endswith(".py"):
                continue
            yield Path(dirpath) / fn
            count += 1
            if count >= max_files:
                return


def candidate_entrypoints(repo: Path, max_bullets: int = 35) -> str:
    bullets: list[str] = []
    seen: set[str] = set()

    def add(rel: str) -> None:
        if rel not in seen:
            seen.add(rel)
            bullets.append(f"- `{rel}`")

    for p in repo.glob("train*.py"):
        if p.is_file():
            add(str(p.relative_to(repo)))
    for name in ("main.py", "run.py", "train.py"):
        q = repo / name
        if q.is_file():
            add(name)

    needle = "if __name__"
    for py in iter_python_files(repo):
        try:
            chunk = py.read_text(encoding="utf-8", errors="replace")[:4096]
        except OSError:
            continue
        if needle in chunk:
            add(str(py.relative_to(repo)))
        if len(bullets) >= max_bullets:
            break

    # CI python hints
    ci = ci_workflow_excerpt(repo, max_per_file=400, max_total=15000)
    for m in re.finditer(r"python\s+([^\s#]+\.py)", ci):
        path = m.group(1).strip().strip("`")
        if path and not path.startswith("$"):
            rp = repo / path
            if rp.is_file():
                add(path)

    return "\n".join(bullets[:max_bullets]) if bullets else "- _(none detected)_"


def pick_script_for_excerpt(repo: Path) -> Path | None:
    """Prefer train*.py shallow path, then root main.py, then first workflow-mentioned py."""
    ranked: list[Path] = []
    for p in sorted(repo.glob("**/train*.py")):
        if ".git" in p.parts:
            continue
        ranked.append(p)
    main = repo / "main.py"
    if main.is_file():
        ranked.insert(0, main)
    if ranked:
        ranked.sort(key=lambda x: (len(x.relative_to(repo).parts), str(x)))
        return ranked[0]

    ci = ci_workflow_excerpt(repo, max_per_file=300, max_total=12000)
    for m in re.finditer(r"python\s+([^\s#]+\.py)", ci):
        path = m.group(1).strip().strip("`")
        candidate = repo / path
        if candidate.is_file():
            return candidate
    return None


def head_lines(path: Path, n: int) -> str:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as e:
        return f"(read error: {e})"
    body = "\n".join(lines[:n])
    if len(lines) > n:
        body += "\n\n... [truncated]\n"
    return body


def fill_placeholders(template: str, mapping: dict[str, str]) -> str:
    out = template
    for key, value in mapping.items():
        out = out.replace("{{" + key + "}}", value)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Build discovery prompt bundle for experiment-protocol Phase 1.")
    parser.add_argument(
        "repo",
        nargs="?",
        help="Git clone URL (https or git@). Ignored if --existing-repo is set.",
    )
    parser.add_argument(
        "--existing-repo",
        type=Path,
        help="Use this checkout instead of cloning (skip git clone).",
    )
    parser.add_argument(
        "--branch",
        help="Branch to clone (passed to git clone --branch).",
    )
    parser.add_argument(
        "--clone-depth",
        type=int,
        default=1,
        help="git clone depth (default: 1 shallow).",
    )
    parser.add_argument(
        "--clone-dir",
        type=Path,
        help="Clone destination directory. Default: tempfile under system temp.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Directory to write discovery_user_filled.md, discovery_system.md, bundle_meta.json.",
    )
    parser.add_argument(
        "--readme-max-chars",
        type=int,
        default=8000,
        help="Truncate README after this many characters.",
    )
    parser.add_argument(
        "--script-excerpt-lines",
        type=int,
        default=200,
        help="Lines of optional_script_excerpt.",
    )
    args = parser.parse_args()

    if not TEMPLATE_USER.is_file():
        print(f"Missing template: {TEMPLATE_USER}", file=sys.stderr)
        return 1

    tmp_ctx: tempfile.TemporaryDirectory[str] | None = None
    repo_path: Path

    if args.existing_repo:
        repo_path = args.existing_repo.resolve()
        if not repo_path.is_dir():
            print(f"Not a directory: {repo_path}", file=sys.stderr)
            return 1
    else:
        if not args.repo:
            print("Provide a git URL or use --existing-repo.", file=sys.stderr)
            return 1
        if args.clone_dir:
            dest = args.clone_dir
            if dest.exists():
                print(f"Clone dir already exists: {dest}", file=sys.stderr)
                return 1
            clone_repo(args.repo, dest, args.branch, args.clone_depth)
            repo_path = dest
        else:
            tmp_ctx = tempfile.TemporaryDirectory(prefix="discovery_bundle_")
            dest = Path(tmp_ctx.name) / "repo"
            clone_repo(args.repo, dest, args.branch, args.clone_depth)
            repo_path = dest

    try:
        owner, name, url_hint = parse_repo_identity(args.repo or str(repo_path))
        sha, head_branch = git_head(repo_path)
        clone_url = git_remote_url(repo_path) if (repo_path / ".git").exists() else (args.repo or url_hint)

        readme_raw = find_readme(repo_path)
        if len(readme_raw) > args.readme_max_chars:
            readme_raw = readme_raw[: args.readme_max_chars] + "\n\n... [truncated]\n"

        script_path = pick_script_for_excerpt(repo_path)
        optional_excerpt = head_lines(script_path, args.script_excerpt_lines) if script_path else "N/A"

        mapping = {
            "REPO_OWNER": owner,
            "REPO_NAME": name,
            "DEFAULT_BRANCH": head_branch,
            "CLONE_URL": clone_url if clone_url != "N/A" else url_hint,
            "FILE_TREE_DEPTH_2": file_tree_depth_2(repo_path),
            "README_TRUNCATED": readme_raw or "N/A",
            "PYTHON_MANIFESTS": concat_python_manifests(repo_path),
            "NODE_MANIFESTS": read_node_manifest(repo_path),
            "MAKEFILE_OR_TASKS_EXCERPT": task_runner_excerpt(repo_path),
            "CI_WORKFLOW_EXCERPT": ci_workflow_excerpt(repo_path),
            "CANDIDATE_ENTRYPOINTS_BULLETS": candidate_entrypoints(repo_path),
            "OPTIONAL_SCRIPT_EXCERPT": optional_excerpt,
        }

        user_template = TEMPLATE_USER.read_text(encoding="utf-8")
        filled = fill_placeholders(user_template, mapping)

        args.output_dir.mkdir(parents=True, exist_ok=True)
        out_user = args.output_dir / "discovery_user_filled.md"
        out_system = args.output_dir / "discovery_system.md"
        out_meta = args.output_dir / "bundle_meta.json"

        out_user.write_text(filled, encoding="utf-8")
        if TEMPLATE_SYSTEM.is_file():
            out_system.write_text(TEMPLATE_SYSTEM.read_text(encoding="utf-8"), encoding="utf-8")

        meta = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "repoPath": str(repo_path.resolve()),
            "commitSha": sha,
            "headBranch": head_branch,
            "cloneUrl": clone_url,
            "parsedOwner": owner,
            "parsedName": name,
            "optionalScriptExcerptSource": str(script_path.relative_to(repo_path)) if script_path else None,
            "protocolRoot": str(PROTOCOL_ROOT),
            "schemaPath": str(PROTOCOL_ROOT / "protocol.schema.json"),
            "outputs": {
                "discoveryUserFilled": str(out_user.resolve()),
                "discoverySystem": str(out_system.resolve()) if out_system.is_file() else None,
            },
            "shallowClone": args.existing_repo is None,
            "clonePreserved": bool(args.clone_dir) or bool(args.existing_repo),
        }
        out_meta.write_text(json.dumps(meta, indent=2), encoding="utf-8")

        print(f"Wrote {out_user}")
        print(f"Wrote {out_system}")
        print(f"Wrote {out_meta}")
        if tmp_ctx and not args.clone_dir:
            print(
                "\nNote: repository was cloned to a temporary directory that will be deleted when this process exits.\n"
                "       Pass --clone-dir to keep the clone, or use --existing-repo.",
                file=sys.stderr,
            )
        return 0
    finally:
        if tmp_ctx is not None:
            tmp_ctx.cleanup()


if __name__ == "__main__":
    sys.exit(main())
