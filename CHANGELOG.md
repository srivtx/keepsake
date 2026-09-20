# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- The `keepsake` CLI: `import`, `search`, `seal`, `open`, `verify`, and `mcp`.
- The MCP server, which exposes a vault to any MCP-capable agent over stdio.
- The browser app: import, browse, search, and seal a vault locally, with no
  network calls.
- Import parsers that turn chat exports and notes into cells.
- `install.sh`, a one-line installer for the `keepsake` binary.

[Unreleased]: https://github.com/srivtx/keepsake/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/srivtx/keepsake/releases/tag/v0.1.0
