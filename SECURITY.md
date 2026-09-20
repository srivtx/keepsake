# Security Policy

## keepsake

keepsake is an open, encrypted format for personal AI memory (`keepsake/v1`)
plus a reference implementation: a browser app, a Bun CLI, and an MCP server. It
imports a chat export or notes, stores them as hashed cells, seals them into a
single `.keepsake` file with AES-256-GCM under a PBKDF2-SHA256 key, and lets an
agent recall from that file. Transport is the file itself.

Because the file is the security boundary, this document states the threat model
plainly, including what the format does not protect.

## Supported versions

The latest commit on `main` is the only supported version. Security fixes land
on `main` and ship in the next tagged release. Older tags do not receive
backports.

| Version | Supported |
| --- | --- |
| Latest on `main` | Yes |
| Older tags | No |

## Threat model

- **Offline by design.** keepsake contains no network code. It never opens a
  socket, uploads a vault, fetches a remote resource, or checks for updates.
- **No telemetry.** Nothing about your vaults, your usage, or your machine is
  collected or transmitted.
- **Plaintext stays local.** Importing, searching, sealing, and opening run
  in-process. The passphrase is used only to derive a key in memory; it is not
  written to disk by the reference implementation.
- **The container is not secret.** A vault's `format`, `createdAt`, `cells`
  count, KDF parameters, and ciphertext length are visible to anyone with the
  file. The `merkle` root is a public commitment: equal roots mean equal cell
  sets, and a low-entropy cell can be guessed by recomputing its hash.
- **The passphrase is the only secret.** There is no key escrow, no recovery
  path, and no server-side key. A lost passphrase means a lost vault, and a
  guessed one means a read.
- **Untrusted vault input.** A `.keepsake` file is treated as hostile: it is
  size-bounded before parsing, and a malformed, truncated, or wrong-passphrase
  vault must fail safely rather than emit partial plaintext or exhaust the
  process.
- **Authenticated ciphertext.** AES-256-GCM authenticates the ciphertext, so a
  modified or truncated vault fails the tag check. It does not authenticate the
  base64 container or `createdAt`, which are informational.
- **No code execution from input.** Cells are data. Imported text is never
  evaluated, and a decrypted cell does not cause a fetch, a render, or a script.

## Cryptography

| Parameter | Value |
| --- | --- |
| KDF | PBKDF2-HMAC-SHA-256 |
| KDF salt | 16 random bytes per vault |
| KDF iterations | 250000 default; a reader honors the stored value |
| Derived key | 256 bits |
| Cipher | AES-256-GCM |
| IV | 12 random bytes per encryption |
| Tag | 128 bits, appended to the ciphertext |

A salt and IV must be drawn from a cryptographically secure random source for
every encryption. Reusing an IV under the same key breaks AES-GCM and is
catastrophic. The format specification, schema, and conformance vectors are in
`spec/`; the security notes there are normative for the format's honest limits.

## Exit codes

The CLI's exit codes are:

| Code | Meaning |
| --- | --- |
| `0` | Success (or a vault that verifies) |
| `1` | A finding or negative result, such as a failed integrity check |
| `2` | Invalid usage, or a vault or cell that does not parse |
| `3` | I/O error: a file could not be read, written, or found |

A failed GCM tag check or an integrity mismatch is reported as an error and
never as a clean result.

## Reporting a vulnerability

Report privately through GitHub Security Advisories on the repository:

https://github.com/srivtx/keepsake/security/advisories/new

Do not open a public issue for a suspected vulnerability. Include a description,
the affected revision, a minimal reproducer (a vault file or a short script
where possible), and any suggested fix. Expect an acknowledgement within a few
days.

## Verifying a build

```bash
bun install
bunx tsc --noEmit
bun test
```

This installs the locked dependency set, typechecks in strict mode, and runs the
test suite, including the conformance vectors in `spec/vectors.json`. In CI the
same gate runs on every push and pull request.
