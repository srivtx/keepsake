# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-09-20

### Added

- Memory packs: `keepsake pack` writes a lossless, plaintext, agent-readable
  Markdown projection of a vault, and `keepsake unpack` verifies its per-cell
  hashes and Merkle root before sealing it into a new vault.
- `toBundle`, `fromBundle`, and `isBundle` in the library; the browser app gains
  a pack download and imports a pack with integrity verification.


## [0.3.0] - 2026-09-20

### Added

- `keepsake conformance [--vectors <path>] [--json]`, which runs the published
  vectors (L1 parse, L2 integrity, L3 crypto round-trip) against this
  implementation and exits non-zero on any failure, so any implementation of the
  format can be tested in CI.

### Fixed

- Corrected the README passphrase and `rotate` examples, and added the required
  `env` to the MCP configuration snippet.

## [0.2.0] - 2026-09-20

### Added

- Vault operations: `mergeCells`, `forgetCells`, `rotateVault`, and `diffVaults`.
- `contextPack`, a token-budgeted Markdown projection of the vault for a task.
- CLI commands `merge`, `forget`, `rotate`, `diff`, and `context`.
- MCP tools `memory_context` and `memory_forget`.
- Import parsers for Claude `conversations.json` exports and JSONL transcripts.
- `action.yml`, a composite GitHub Action that verifies a committed vault in CI.
- The browser app gains a context-pack card and an in-place forget control.

### Fixed

- The conformance page's "Run the vectors" button no longer throws, and the
  error callout is hidden when every check passes.

## [0.1.0] - 2026-09-20

### Added

- The `keepsake/v1` format specification: the Cell, canonical JSON, SHA-256
  cell hashing, the Merkle root, the Vault container, PBKDF2-SHA256 and
  AES-256-GCM parameters, import rules, and conformance levels L1 to L3.
- `spec/keepsake-v1.schema.json`, a JSON Schema (draft 2020-12) for the vault
  file and the cell.
- `spec/vectors.json`, conformance vectors with real cell hashes, a Merkle root,
  and a fully formed example vault sealed with the passphrase
  `conformance-vector`.
- The `keepsake` CLI: `import`, `search`, `export`, `verify`, `stats`, and `mcp`.
- The MCP server, which exposes a vault to any MCP-capable agent over stdio.
- The browser app: import, browse, search, and seal a vault locally, with no
  network calls.
- Import parsers that turn chat exports and notes into cells.
- `install.sh`, a one-line installer for the `keepsake` binary.

[Unreleased]: https://github.com/srivtx/keepsake/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/srivtx/keepsake/releases/tag/v0.4.0
[0.3.0]: https://github.com/srivtx/keepsake/releases/tag/v0.3.0
[0.2.0]: https://github.com/srivtx/keepsake/releases/tag/v0.2.0
[0.1.0]: https://github.com/srivtx/keepsake/releases/tag/v0.1.0
