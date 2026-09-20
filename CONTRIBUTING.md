# Contributing to keepsake

Thanks for helping improve portable, user-owned AI memory. This document covers
what you need to build, test, and submit a change.

## Development setup

keepsake targets [Bun](https://bun.sh) and TypeScript in strict mode.

```bash
git clone https://github.com/srivtx/keepsake.git
cd keepsake
bun install
```

Run the CLI from source while you work:

```bash
bun run src/cli.ts --help
```

## The gate

Every pull request must pass the same gate CI runs:

```bash
bun run typecheck && bun test
```

Do not open a PR with a red typecheck or a failing test. Fix the cause rather
than disabling a check.

## The format is normative

The format lives in `spec/SPEC.md` and is the whole point of the project.
Changes to it need extra care:

- The Cell and Vault member sets, canonical JSON, the hashing and Merkle rules,
  and the KDF and AEAD parameters are **stable**. A breaking change is a new
  format version, not an edit to `keepsake/v1`.
- `spec/keepsake-v1.schema.json` must match the prose exactly. Update both.
- `spec/vectors.json` must stay real. Vectors are generated from the rules with
  a script that runs the primitives for real, never copied from an
  implementation. If you change an algorithm, regenerate the vectors and explain
  why in the pull request.
- Keep the reference implementation and the specification in step. When they
  disagree, the spec wins and the implementation is the bug.

## Code style

- Strict TypeScript. No `any` to silence a type error, no non-null assertions to
  dodge null checks.
- `src/` must stay browser-safe: no `node:` imports and no Node-only globals,
  because it is bundled for the browser. Use WebCrypto and standard web APIs;
  Node-only code belongs in `src/cli.ts`.
- No new runtime dependencies without discussion in an issue first. The offline
  and dependency-light posture is a feature.
- No network access, ever. Importing, searching, sealing, and opening are local
  operations.
- Keep the format primitives (canonical JSON, hashing, Merkle, sealing) separate
  from import and CLI plumbing so they stay testable on their own.
- Match the surrounding style; keep modules small and focused.
- No comments unless they explain something non-obvious.

## Tests

Cover the primitives and the CLI:

- The format primitives belong in tests that read `spec/vectors.json` and check
  canonical JSON, cell hashes, the Merkle root, and the seal/open round-trip.
- Import mapping belongs in tests with small fixture exports.
- CLI behavior and exit codes belong in `tests/cli.test.ts`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

feat(crypto): support a reader-supplied iteration count
fix(merkle): carry an odd trailing hash instead of duplicating it
test(vectors): assert the example vault opens to the canonical plaintext
docs(spec): clarify the base64 encoding of the salt
```

Common types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`. Useful scopes:
`spec`, `crypto`, `merkle`, `import`, `cli`, `mcp`.

## Pull request checklist

- [ ] Tests added or updated for the change.
- [ ] `bun run typecheck` is clean.
- [ ] `bun test` passes.
- [ ] The spec, schema, and vectors are updated together when the format changes.
- [ ] Docs (`README.md` and `spec/SPEC.md`) updated when behavior changes.
- [ ] Commit messages follow Conventional Commits.
