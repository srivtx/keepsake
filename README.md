<div align="center">

# keepsake

> Own your AI memory.

**Import a chat export or your notes, search it locally, seal it into an encrypted, portable `.keepsake` vault, and let any AI agent recall from it over MCP.**

**by svx** · MIT Licensed

[![CI](https://github.com/srivtx/keepsake/actions/workflows/ci.yml/badge.svg)](https://github.com/srivtx/keepsake/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/srivtx/keepsake?sort=semver&color=c026d3)](https://github.com/srivtx/keepsake/releases)
[![license](https://img.shields.io/badge/license-MIT-0f766e)](LICENSE)

</div>

---

**Live site:** [keepsake](https://srivtx.github.io/keepsake)  ·  **Source:** [github.com/srivtx/keepsake](https://github.com/srivtx/keepsake)

**Docs:** [Spec](https://srivtx.github.io/keepsake/spec)  ·  [Usage](https://srivtx.github.io/keepsake/usage)  ·  [Conformance](https://srivtx.github.io/keepsake/conformance)  ·  [FAQ](https://srivtx.github.io/keepsake/faq)

**Format:** [keepsake/v1](https://srivtx.github.io/keepsake/spec)

## Why

The memory you give an AI is trapped in that vendor's cloud. It is not a file
you can copy, it is not portable between assistants, and it disappears when the
account does. Exporting usually means a pile of JSON with no integrity story and
no way to hand it to a different agent.

`keepsake` makes your memory a file you own: an open format, encrypted at rest,
portable across tools, and readable by any agent that speaks MCP.

## What it is

- **An open format** — `keepsake/v1`, a small, fully specified, deterministic
  container for memory cells. See [`spec/SPEC.md`](spec/SPEC.md).
- **A browser app** — import, browse, search, and seal locally. No upload, no
  account, no network. The vault is built in the page and saved with the File
  System Access API or a download.
- **A Bun CLI** — the same engine for scripts and CI: import, search, seal,
  open, verify.
- **An MCP server** — expose a vault to any MCP-capable agent over stdio so it
  can recall from your memory without a vendor holding it.

All four are a reference implementation of the format, not the format itself.
Anything that follows the spec can read and write the same vaults.

## Install

`keepsake` is not published to npm. Install it from GitHub with the one-line
script (requires [Bun](https://bun.sh)):

```bash
# One-line install (installs the `keepsake` binary)
curl -fsSL https://raw.githubusercontent.com/srivtx/keepsake/main/install.sh | sh

# Or run once, without installing
bunx github:srivtx/keepsake#main --help

# Install globally
bun add -g github:srivtx/keepsake
keepsake --help

# Add to a project as a dev dependency
bun add -d github:srivtx/keepsake
```

## Usage

### CLI

```bash
# Import a chat export into a new sealed vault
keepsake import chatgpt-export.zip --source chatgpt-export --out memory.keepsake

# Import notes as free-form memories
keepsake import notes.md --source notes.md --out memory.keepsake

# Search a vault locally (exact, lexical)
keepsake search "sourdough" memory.keepsake

# Open a vault to plaintext cells, or seal a plaintext file back up
keepsake open memory.keepsake --out cells.json
keepsake seal cells.json --out memory.keepsake

# Verify the integrity of a vault (hashes and Merkle root)
keepsake verify memory.keepsake

# Merge two vaults into one
keepsake merge memory.keepsake archive.keepsake --out merged.keepsake

# Remove cells by id, tag, source, or query, then rewrite the vault
keepsake forget --vault memory.keepsake --query "staging database" --out pruned.keepsake

# Re-encrypt a vault under a new passphrase
keepsake rotate --vault memory.keepsake --out memory.keepsake

# Compare two vaults
keepsake diff memory.keepsake archive.keepsake

# Print a token-budgeted Markdown context pack for a task
keepsake context "plan the migration" --vault memory.keepsake --budget 1500

# Serve the vault over MCP on stdio
keepsake mcp --vault memory.keepsake
```

Import accepts ChatGPT exports, Claude `conversations.json`, JSONL transcripts,
JSON message arrays, and plain text or notes. The passphrase is never written to
disk. The CLI prompts for it, or reads `KEEPSAKE_PASSPHRASE` when it is set for
non-interactive use. There is no recovery if it is lost.

Exit codes:

| Code | Meaning |
|---|---|
| `0` | Success (or, for `verify`, a vault that checks out) |
| `1` | A finding or negative result (a failed check, or no matches) |
| `2` | Invalid usage, or a vault or cell that does not parse |
| `3` | I/O error: a file could not be read, written, or found |

### MCP

Any MCP-capable agent can recall from a vault over stdio:

```json
{
  "mcpServers": {
    "keepsake": {
      "command": "bunx",
      "args": ["github:srivtx/keepsake#main", "mcp", "--vault", "/path/to/memory.keepsake"]
    }
  }
}
```

The server exposes `memory_recall`, `memory_context`, `memory_stats`, and
`memory_verify` over your cells, plus `memory_remember` and `memory_forget` to
write. `memory_context` returns the same token-budgeted pack as the CLI, and
`memory_forget` removes a memory by id or query. The server asks for the
passphrase on startup. It makes no network calls: the vault is opened
in-process.

## Verify a vault in CI

Commit a `.keepsake` vault and let CI prove it still opens and checks out. The
repository ships a composite action that installs Bun and runs `keepsake verify`
against the vault, failing the job if the passphrase is wrong or any cell hash or
the Merkle root does not match.

```yaml
name: Verify memory
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: srivtx/keepsake@v0.2.0
        with:
          vault: memory.keepsake
          passphrase: ${{ secrets.KEEPSAKE_PASSPHRASE }}
```

Pass the passphrase as a repository secret, never a literal string. The action
defaults to `version: main`; pin it to a tag to match the release you run:

```yaml
      - uses: srivtx/keepsake@v0.2.0
        with:
          vault: memory.keepsake
          passphrase: ${{ secrets.KEEPSAKE_PASSPHRASE }}
          version: v0.2.0
```

## The format in brief

A memory is a **Cell**:

```json
{
  "id": "3f7c9d2e-1a4b-4c8d-9e0f-1a2b3c4d5e6f",
  "text": "I want to move my chat history out of the cloud.",
  "source": "chatgpt-export",
  "role": "user",
  "createdAt": "2026-01-05T09:12:00.000Z",
  "tags": ["privacy", "memory"],
  "hash": "32003353cb5403744610e2570bd435030b4aaa5d930e272c8723a382f7526516"
}
```

The `hash` is the SHA-256 of the cell's canonical JSON: its six non-`hash`
fields with object keys sorted recursively. A vault is a JSON file:

```json
{
  "format": "keepsake/v1",
  "createdAt": "2026-03-01T12:00:00.000Z",
  "cells": 3,
  "kdf": { "name": "PBKDF2-SHA256", "iterations": 250000, "salt": "…base64…" },
  "cipher": { "name": "AES-GCM", "iv": "…base64…" },
  "ciphertext": "…base64, includes the 16-byte GCM tag…",
  "merkle": "4e540078fb922de39e689dcf86a9828e4e274986fd6fe5a03da2333724c96d2d"
}
```

The plaintext is the canonical JSON of the cells array, encrypted with
AES-256-GCM under a key derived by PBKDF2-SHA256 (250,000 iterations, 16-byte
salt, 12-byte IV). The `merkle` root is a SHA-256 hash tree over the sorted cell
hashes; an empty vault's root is `sha256("")`. Transport is the file itself:
there is no server, no account, and no network call.

The full specification, the JSON Schema, and conformance vectors are in
[`spec/`](spec/).

## Security

- **Local only.** No network code. Importing, searching, sealing, and opening
  all run on your machine.
- **Encrypted at rest.** AES-256-GCM with the tag included; any change to the
  ciphertext fails to open.
- **Integrity you can check.** Per-cell hashes and a Merkle root detect any
  change to the plaintext.
- **No key escrow.** The passphrase is never stored and there is no recovery.
- **Honest limits.** `keepsake/v1` has no semantic embeddings and no sync.
  `keepsake rotate` re-encrypts a vault under a new passphrase, but there is no
  in-place re-wrap. The container leaks its format, creation time, cell count,
  KDF parameters, and approximate size. See the security notes in the spec.

Report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/srivtx/keepsake/security/advisories/new).

## Roadmap

- **Embeddings** — optional local semantic recall layered over the same cells,
  without changing the vault format.
- **Sync** — optional, opt-in multi-device sync with a documented merge and
  conflict model.
- **Key rotation in place** — re-wrap a vault under a new passphrase without
  re-encrypting every cell; today `keepsake rotate` rewrites the file.

## For agents

Every surface is built to be read by a program: the spec is normative and
deterministic, the schema is machine-checkable, and the MCP server exposes a
vault directly.

- **Docs index:** the site serves a machine-readable index at
  [srivtx.github.io/keepsake/llms.txt](https://srivtx.github.io/keepsake/llms.txt).
- **Agent guide:** [`AGENTS.md`](AGENTS.md) covers build, test, layout, and the
  hard rules.
- **MCP server:** point an agent at a vault over stdio.

  ```json
  {
    "mcpServers": {
      "keepsake": {
        "command": "bunx",
        "args": ["github:srivtx/keepsake#main", "mcp", "--vault", "/path/to/memory.keepsake"]
      }
    }
  }
  ```

## License

[MIT](LICENSE).
