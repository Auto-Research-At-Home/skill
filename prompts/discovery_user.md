# User prompt template: repository discovery (fill placeholders)

## Instruction to the model

Read the **Repository bundle** below. Emit one JSON object conforming to `DiscoveryDraft` in `protocol.schema.json` at the repository root of the experiment-protocol package (`schemaKind: "discoveryDraft"`, `protocolVersion: "1.0"`). Output JSON only.

---

## Repository bundle

### meta

- **owner / name (if known)**: {{REPO_OWNER}} / {{REPO_NAME}}
- **default branch (if known)**: {{DEFAULT_BRANCH}}
- **clone URL (if known)**: {{CLONE_URL}}

### file_tree_depth_2

```
{{FILE_TREE_DEPTH_2}}
```

### README (truncated)

```markdown
{{README_TRUNCATED}}
```

### package_manifests (excerpt or full)

**pyproject.toml / setup.cfg / requirements.txt (as available):**

```
{{PYTHON_MANIFESTS}}
```

**package.json (as available):**

```
{{NODE_MANIFESTS}}
```

### Makefile / task runner (excerpt)

```
{{MAKEFILE_OR_TASKS_EXCERPT}}
```

### CI workflow (excerpt, if present)

```yaml
{{CI_WORKFLOW_EXCERPT}}
```

### candidate_entrypoints (from static scan / heuristics)

{{CANDIDATE_ENTRYPOINTS_BULLETS}}

### optional_script_excerpt (first ~200 lines of primary train / main script)

```
{{OPTIONAL_SCRIPT_EXCERPT}}
```

---

## Field injection notes (for the tool author)

- Replace `{{...}}` tokens before sending to the model. Use `N/A` or empty string for missing sections; keep keys in the prompt so the bundle shape is stable.
- `CANDIDATE_ENTRYPOINTS_BULLETS` should be a markdown bullet list of paths (e.g. from ripgrep for `if __name__ ==`, `train*.py`, workflow `script:` steps).
- Truncate long files consistently (e.g. README first 8k chars) to control context size.
