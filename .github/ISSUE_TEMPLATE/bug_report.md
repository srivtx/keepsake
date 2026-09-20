---
name: Bug report
about: Report a problem with keepsake
title: "[Bug]: "
labels: bug
assignees: ""
---

**What happened**

A clear description of the incorrect behavior. Include the command you ran and
the output you saw. If a vault failed to open or an integrity check failed,
include the relevant error.

**Expected behavior**

What you expected keepsake to do instead.

**Reproduction**

Minimal steps and, if possible, a small vault or a short cell list that
reproduces the issue. Do not attach a real vault with personal memory; build a
minimal one with dummy cells.

```bash
keepsake verify vault.keepsake
```

**Format and version**

- Affected surface: browser app / CLI / MCP server / format
- Format version (`keepsake/v1`):
- keepsake version or revision:
- If the format is involved: the `kdf.iterations` and whether the vault was
  sealed by this project or another implementation

**Environment**

- OS:
- Bun version (`bun --version`):
- Install method (from source, install script, package manager):
- Browser and version, if the browser app is involved:
