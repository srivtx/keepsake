# keepsake format specification

**Format:** `keepsake/v1`
**Status:** draft, version 0.1
**Editor:** svx
**Repository:** https://github.com/srivtx/keepsake

## Abstract

`keepsake` is an open, encrypted, portable format for personal AI memory. A
memory is a **Cell**: one message, note, or record with a stable identity and a
content hash. A **Vault** is a single JSON file that holds any number of cells,
sealed with authenticated encryption, plus a Merkle root that commits to the
exact plaintext. The vault is transported as a file. There is no server, no
account, and no network call.

This document specifies the wire format, the canonical encoding, the hashing
and Merkle rules, the key-derivation and encryption parameters, import rules, and
three conformance levels. Everything here is normative unless marked otherwise.

## Goals

- **Ownership.** A vault is one file the user can copy, back up, and carry
  between tools. No vendor holds the only copy.
- **Portability.** The format is self-describing JSON with documented
  algorithms, so any implementation can read it without the reference code.
- **Confidentiality.** The plaintext never touches disk unencrypted by default;
  the vault leaks only a small, documented amount of metadata.
- **Integrity.** A vault detects any change to the ciphertext, and a cell hash
  and Merkle root detect any change to the plaintext.
- **Determinism.** Two implementations given the same cells, passphrase, salt,
  and IV produce byte-identical plaintext and ciphertext. This makes
  conformance testable.

## Non-goals

- Not a semantic memory. Version 0.1 has no embeddings, vector search, or model
  inference. Recall is exact and lexical.
- Not a sync protocol. Version 0.1 defines a file, not a service or a
  multi-writer merge.
- Not a key-management system. Version 0.1 has no key rotation, no escrow, and
  no recovery path.
- Not an access-control system. Anyone with the file and the passphrase has the
  full plaintext.
- Not a general archive format. It stores cells, not files or arbitrary blobs.

## Terminology

| Term | Meaning |
|---|---|
| **Cell** | One unit of memory: an id, text, source, role, timestamp, tags, and a content hash. |
| **Payload** | A cell without its `hash` field: the six fields that are hashed. |
| **Vault** | The sealed file defined in this document, with the `.keepsake` extension by convention. |
| **canonical JSON** | The deterministic JSON encoding defined in [Canonical JSON](#canonical-json). |
| **Merkle root** | A single SHA-256 hash that commits to the vault's cell hashes, independent of cell order. |
| **KDF** | Key-derivation function; here always PBKDF2-SHA256. |
| **AEAD** | Authenticated encryption with associated data; here always AES-256-GCM. |

## The Cell

A cell is a JSON object with exactly these seven members:

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

| Member | Type | Required | Rules |
|---|---|---|---|
| `id` | string | yes | A UUID, canonical lowercase hyphenated form (`8-4-4-4-12`). Version 4 is recommended for generated ids. Unique within a vault. |
| `text` | string | yes | The cell content. UTF-8. MUST be non-empty after trimming. Imports MUST normalize to NFC and trim surrounding whitespace. |
| `source` | string | yes | A stable, human-meaningful identifier for where the cell came from, such as `chatgpt-export` or `notes.md`. MUST be non-empty. MUST NOT contain an absolute filesystem path or other machine-local identifier. |
| `role` | string | yes | One of `user`, `assistant`, `note`, `system`. Case-sensitive. |
| `createdAt` | string | yes | An ISO 8601 timestamp in UTC with millisecond precision, exactly `YYYY-MM-DDTHH:MM:SS.sssZ` (for example `2026-01-05T09:12:00.000Z`). |
| `tags` | array of string | yes | Zero or more tags. Each tag MUST be non-empty after trimming and MUST be unique within the array. Order is significant and preserved. |
| `hash` | string | yes | Lowercase hex SHA-256 (64 characters) of the canonical payload, defined below. |

A cell with no `tags` uses an empty array, never `null` or a missing member.

### The canonical payload

The canonical payload of a cell is its six members other than `hash`:

```
{ id, text, source, role, createdAt, tags }
```

`hash` is `SHA-256(canonicalJson(payload))`, encoded as lowercase hex.

### Example

Payload:

```json
{
  "id": "8b1e5a7c-2d3f-4a6b-8c9d-0e1f2a3b4c5d",
  "text": "Portable memory means one encrypted file that you control.",
  "source": "chatgpt-export",
  "role": "assistant",
  "createdAt": "2026-01-05T09:12:04.000Z",
  "tags": ["memory"]
}
```

Canonical JSON (keys sorted, no whitespace):

```
{"createdAt":"2026-01-05T09:12:04.000Z","id":"8b1e5a7c-2d3f-4a6b-8c9d-0e1f2a3b4c5d","role":"assistant","source":"chatgpt-export","tags":["memory"],"text":"Portable memory means one encrypted file that you control."}
```

Hash:

```
e7aef9cdcd7d685e874fff697be0357afa79fc5b47f3c83ca57d288261128ab5
```

## Canonical JSON

`canonicalJson(value)` is a deterministic encoding of a JSON value. It is the
exact string that is hashed and encrypted, so every implementation must produce
the same bytes.

Rules:

1. **Objects.** Members are emitted in ascending order of their key, compared by
   Unicode code point. Members whose value is `undefined` are omitted. There is
   no insignificant whitespace: `{` and `}` hug the first and last member, and
   `,` and `:` are unadorned.
2. **Arrays.** Element order is preserved. Arrays may be empty (`[]`).
3. **Strings.** Encoded with the standard JSON escapes: `"` and `\` are escaped,
   and control characters below `0x20` use the shortest of `\b`, `\t`, `\n`,
   `\f`, `\r`, or `\u00XX`. Non-ASCII characters are emitted literally as UTF-8
   (they are not `\u`-escaped). The output is UTF-8.
4. **Numbers.** Emitted as JSON numbers with no leading zero and no trailing
   fraction zero. Only integers appear in the fields this format defines.
5. **Booleans and null.** Emitted as `true`, `false`, and `null`.
6. **`undefined`.** Has no JSON form. As an object member it is omitted, and as
   an array element it becomes `null`, matching `JSON.stringify`.

The sort is over the raw key strings, not a locale-aware comparison. For the
ASCII keys used in this format, code-point order is the same as byte order.

Reference implementation:

```js
function canonicalJson(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}
```

## Hashing

`SHA-256` is the only hash. It is applied to UTF-8 bytes and rendered as
lowercase hex with no `0x` prefix and no separators.

- **Cell hash:** `sha256(canonicalJson(payload))`.
- **Empty hash:** the SHA-256 of the empty byte string, used as the Merkle root
  of an empty vault:

  ```
  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  ```

## The Merkle root

The Merkle root commits to the set of cell hashes. It is computed as follows:

1. Take the `hash` of every cell as a lowercase hex string.
2. Sort the list of hex strings in ascending order (lexicographic order; for
   lowercase hex this equals numeric order per byte). The root does not depend
   on cell order in the vault.
3. While more than one value remains:
   - Walk the list left to right, taking values in adjacent pairs.
   - For a pair `(left, right)`, compute
     `sha256(left + right)`, where `+` concatenates the two hex **strings** and
     the result is hashed as UTF-8. This hashes the ASCII hex text, not the raw
     bytes it represents.
   - If the list has an odd length, the final value is carried to the next level
     unchanged (it is **not** duplicated).
4. The single remaining value is the root, lowercase hex.

An empty cell set has root `sha256("")` (see [Hashing](#hashing)).

Worked example using the three hashes from `vectors.json`:

```
32003353cb5403744610e2570bd435030b4aaa5d930e272c8723a382f7526516
e7aef9cdcd7d685e874fff697be0357afa79fc5b47f3c83ca57d288261128ab5
c2ead5e68cafbe7bb91ee118aa5ac67dffe1e3981a11ddfad2e47fe6a5d140ff
```

Sorted in ascending order the sequence becomes `32003353…`, `c2ead5e6…`,
`e7aef9cd…`. Pairs are `(32003353…, c2ead5e6…)` with the odd trailing
`e7aef9cd…` carried, so the levels are:

```
level0 (sorted): 32003353…, c2ead5e6…, e7aef9cd…
level1:          7941ca79fa0a5717166aa96ed3304c76c425667024eea361012710e30f416c00, e7aef9cd…   (odd value carried)
level2:          sha256(7941ca79… + e7aef9cd…)
```

where `7941ca79…` is `sha256(32003353…c2ead5e6…)`.

The resulting root is:

```
4e540078fb922de39e689dcf86a9828e4e274986fd6fe5a03da2333724c96d2d
```

## The Vault container

A vault is a UTF-8 JSON file. It has exactly these seven members:

```json
{
  "format": "keepsake/v1",
  "createdAt": "2026-03-01T12:00:00.000Z",
  "cells": 3,
  "kdf": {
    "name": "PBKDF2-SHA256",
    "iterations": 100000,
    "salt": "AAECAwQFBgcICQoLDA0ODw=="
  },
  "cipher": {
    "name": "AES-GCM",
    "iv": "AAECAwQFBgcICQoL"
  },
  "ciphertext": "vRAacb8fyhuvnGNI6nOkBdDzKpiLTMjhOFXTBpPjbuKzCUo9k7eJMXrnfmOuGcIcUhwaEJYyFAghgcNBGjwvc1SiyCACGVWpGDMTgMNHz3gjSMU8Novb7sAfydXF+UGHTX/e+26/npVECoqcsyARdN212qUCNjE29faSDT7ZO/VlFvaxGahB3TOGbPtOMCG04oazyb38s4Rusi3hHNBxTRa5kzew/geJ5fR16SZv51kHtdos5pH3SBIbey7uyF08824y/fEMBAOxlXWlXgoWpqr5QiOZ9UEygbdaOn3qYyuJwp2/t0aPz04+yU2vb6m1loAEdWvI+Eo4SL3MI0x5KOOLAKYDajLMMIhoBh4qjI8WTkEXnQ4E3UeWN0/ctwox16yThd2mqGuBs6yBLfAYkWH3PhCavRfLYUP909xQUdFnr7iZCMqvcqlqK99mkXs7L6wnryr7Y4vT17j00n7wM0QM9aElICFZheeOoxQ6qshNcR06fg6thka0i1zuTpQtnDb+YhM/4NpgdKMZas1uiqce7KOXyFMAREY5l1TM1A2flNjihU2NcCvR1o4VcCL5lBrg1EESuxawuoEB/ikDDE6ZMR221UPn3H1lyNmQSfFPExyeIietSKrOfcRDf/uNbBZAHU7GZJcozFcJi1noFpH0y+2I3RrdqUiMNtMjJsaFf5E6M3I4kWMtsILhJcGcYHvNYs1oBI/ODbZNBhJjLO6HtyfRBlvFx184oSAkoqXm8uaJV9+goGlTEfCGW8PUGKhf/3+If1S1FbNKTJTD/2vD6UO3fujGN4l//dP8HVcOoS5lgRFR/hX7H467jSEagcq7M38oj93cE5TW2yIQPkl9+8QhRtT9bNpDRpl1cfLzFHtp4QityYLrpQJ7RuvplxmlrJmqW5Zp8kji6Z0eTbmdB/A1nMBCXy8aML+mLeqFRfT/iyp9C06aYu1FR6j3nrXVz3FNAgtKCpdylkycpN8lvOojgLhbNxvXqXY53qi7smVqnrSIezHAU2pHTjNl6coUnAZLr0KqamuChRfo0TBnBuPBcqFcYB4BsIBTapzcscocc0ehSdUU0Z3omitzboo9P9N8+Whsb37kQgJ+8cr07eURWJhBXFD3FFu58LhMP+dRp6jnOTVSPRVL3kOKJHgM",
  "merkle": "4e540078fb922de39e689dcf86a9828e4e274986fd6fe5a03da2333724c96d2d"
}
```

| Member | Type | Required | Rules |
|---|---|---|---|
| `format` | string | yes | Exactly `keepsake/v1`. |
| `createdAt` | string | yes | ISO 8601 UTC with milliseconds, exactly as a cell `createdAt`. The time the vault was sealed. Informational. |
| `cells` | integer | yes | The number of cells in the plaintext array. Non-negative. MUST equal the decrypted array length. |
| `kdf` | object | yes | Key-derivation parameters, defined below. |
| `cipher` | object | yes | Cipher parameters, defined below. |
| `ciphertext` | string | yes | Base64 (standard alphabet, with padding) of the AEAD output, which is the ciphertext followed by the 16-byte GCM tag appended by AES-GCM. |
| `merkle` | string | yes | Lowercase hex Merkle root (64 characters) of the plaintext cells. |

### The `kdf` object

| Member | Type | Required | Rules |
|---|---|---|---|
| `name` | string | yes | Exactly `PBKDF2-SHA256`. |
| `iterations` | integer | yes | PBKDF2 iteration count. MUST be a positive integer. The default is `250000`; a reader MUST honor whatever value is present and MUST NOT silently substitute its own. |
| `salt` | string | yes | Base64 of exactly 16 random bytes. MUST differ between vaults. |

### The `cipher` object

| Member | Type | Required | Rules |
|---|---|---|---|
| `name` | string | yes | Exactly `AES-GCM`. |
| `iv` | string | yes | Base64 of exactly 12 random bytes. MUST NOT be reused under the same key. |

### Plaintext

The plaintext is the canonical JSON of the cells array, where each element is a
complete cell object including its `hash`, encoded as UTF-8. The array preserves
the cell order the sealer chose; the Merkle root does not depend on that order.

```
plaintext = UTF-8( canonicalJson( [ cell0, cell1, … ] ) )
```

### Operations

Merge, forget, rotate, and diff are defined over this same `keepsake/v1`
container; none of them introduces a new format or changes the member set. Each
operation opens the input vault (or vaults), acts on the cell set, and seals the
result as a new vault with a fresh salt and IV. A vault MAY therefore be
rewritten at any time by re-encrypting the same cells.

- **merge** produces the union of two vaults' cells.
- **forget** produces the input vault minus the cells that match a selector (id,
  tag, source, or query).
- **rotate** re-encrypts the same cells under a new passphrase.
- **diff** reports the cells that differ between two vaults.

A rewrite draws a fresh salt and IV, so the `ciphertext`, the `kdf.salt`, the
`cipher.iv`, and (for a changed cell set) the `merkle` root differ from the
original; the ids and hashes of carried-over cells are preserved. Rewriting is
the only way to change a vault: a sealed vault is never mutated in place.

A **context pack** is not part of the on-disk format. It is a transient,
token-budgeted projection of a vault's cells, assembled on demand for a task. It
is not stored in the container and does not appear in the plaintext array; any
implementation may choose its own budget and framing without affecting
conformance.

A **memory pack** is a transport projection, not a vault. It is a single
plaintext Markdown file that carries the same cells losslessly, in a form a human
or an LLM can read and any implementation can import. It is not encrypted: an
observer of the file sees every cell. A pack is integrity-checked by the
per-cell hashes and the Merkle root it carries, and an implementation MUST verify
those before importing a pack; a pack that does not verify MUST be rejected.

## Key derivation and encryption

Sealing and opening use only standard primitives.

**Key derivation.** Let `P` be the passphrase as UTF-8 bytes. Derive a 256-bit
AES key with PBKDF2:

```
key = PBKDF2-SHA256(password = P,
                    salt      = base64decode(kdf.salt),
                    iterations = kdf.iterations,
                    dkLen      = 32)
```

**Encryption.** Encrypt the plaintext with AES-256-GCM using the derived key and
a fresh 96-bit IV:

```
ciphertext = AES-256-GCM-Encrypt(key, iv = base64decode(cipher.iv),
                                 plaintext, tagLength = 128)
```

The output is the ciphertext with the 16-byte authentication tag appended (the
WebCrypto convention). No additional authenticated data is used. The stored
`ciphertext` is `base64(ciphertext)`.

**Opening** is the inverse: derive the same key, base64-decode the IV, and
decrypt. A failed GCM tag check means the file is corrupt, truncated, or the
passphrase is wrong; the reader MUST report that as an error and MUST NOT emit
partial plaintext.

### Parameters at a glance

| Parameter | Value |
|---|---|
| KDF | PBKDF2-HMAC-SHA-256 |
| KDF salt | 16 random bytes per vault |
| KDF iterations | 250000 default; reader honors the stored value |
| Derived key | 256 bits (32 bytes) |
| Cipher | AES-256-GCM |
| IV | 12 random bytes per encryption |
| Tag length | 128 bits (16 bytes), appended to the ciphertext |
| AAD | none |
| Ciphertext encoding | Base64, standard alphabet with padding |
| Plaintext | UTF-8 canonical JSON of the cells array |

## Import rules

An importer turns a source (a chat export, a notes file, a JSONL dump) into
cells. These rules keep imports deterministic and privacy-preserving:

1. **One record, one cell.** Each source message, note, or line becomes exactly
   one cell. Do not merge or split.
2. **Identity.** If the source provides a stable UUID, it MAY be used. Otherwise
   generate a UUIDv4. Ids MUST be unique within a vault.
3. **Text.** Normalize to Unicode NFC, trim leading and trailing whitespace, and
   drop the record if the result is empty.
4. **Source.** Set a short, stable origin label that does not reveal the local
   machine, for example `chatgpt-export` or `notes.md`. Do not embed absolute
   paths, usernames, or hostnames.
5. **Role.** Map the source's speaker to `user`, `assistant`, or `system`. Map
   anything that is not a chat turn (a note, a bookmark, a journal entry) to
   `note`. Unknown roles become `note`.
6. **Timestamp.** If the source has a timestamp, parse it and emit UTC with
   milliseconds. If it has none, use the Unix epoch
   `1970-01-01T00:00:00.000Z` so that re-running the import is reproducible.
   Never use the current wall-clock time for a record that lacks a timestamp.
7. **Tags.** Keep zero or more tags. Normalize each to NFC, trim, and lowercase.
   Drop empty tags and deduplicate. Preserve the first occurrence's order.
8. **Hash last.** Compute `hash` after every other member is final.
9. **Deduplicate.** Two cells with the same `hash` are the same content; an
   importer SHOULD drop exact duplicates and MUST keep cells that differ in any
   payload member.
10. **No rewriting.** Importing into an existing vault produces a new vault with
    a new Merkle root; it MUST NOT mutate a sealed vault in place.

Import is lossy by design: it records text and metadata, not attachments,
images, or tool calls.

## Conformance levels

An implementation declares which levels it supports. A higher level includes the
lower ones.

### L1 - Parse

The implementation can read a vault's structure without a passphrase.

- The file is valid UTF-8 JSON that validates against `keepsake-v1.schema.json`.
- `format` is exactly `keepsake/v1`.
- `kdf.name` is `PBKDF2-SHA256`, `iterations` is a positive integer, and `salt`
  base64-decodes to exactly 16 bytes.
- `cipher.name` is `AES-GCM` and `iv` base64-decodes to exactly 12 bytes.
- `ciphertext` base64-decodes to at least 16 bytes (the GCM tag), and
  `merkle` matches `^[0-9a-f]{64}$`.
- `cells` is a non-negative integer.

### L2 - Integrity

Given the passphrase, the implementation can confirm the plaintext is exactly
what the vault commits to.

- L1 passes and decryption succeeds with a valid GCM tag.
- The decrypted plaintext is valid UTF-8 canonical JSON, parses to an array of
  cells, and its length equals `cells`.
- Each cell validates against the `Cell` definition and its `id` values are
  unique.
- For every cell, `sha256(canonicalJson(payload))` equals the cell's `hash`.
- The Merkle root of all cell hashes equals the vault's `merkle`.

### L3 - Crypto round-trip

The implementation reproduces the exact bytes, so results are interchangeable.

- L2 passes.
- Opening the `vaultExample` in `vectors.json` with the passphrase
  `conformance-vector` yields a plaintext byte-for-byte equal to its
  `plaintextCanonicalJson`.
- Re-encrypting that plaintext with the same derived key, the same IV, and the
  same parameters reproduces the `vaultExample.ciphertext` byte for byte.
- Sealing the vector cells with a fixed salt and IV reproduces the example
  vault's `merkle` and `ciphertext`.

Conformance vectors live in [`vectors.json`](./vectors.json) and are generated
from the rules in this document, not copied from an implementation.

## Security notes

This section is informative. It describes the security model and its honest
limits; it is not a formal audit.

### Passphrase handling

- The passphrase is never stored in the vault and is never written to disk by
  the reference implementation. There is no recovery: a lost passphrase means a
  lost vault.
- The passphrase is used only to derive the key in memory. It should not be
  logged, placed in shell history where avoidable, or passed on a command line
  when an environment variable or prompt is available.
- Use a high-entropy passphrase. PBKDF2 with 250,000 iterations raises the cost
  of guessing but cannot rescue a weak passphrase.

### Keys and algorithms

- Keys are derived per vault from the stored salt. A fresh 16-byte salt and a
  fresh 12-byte IV MUST be drawn from a cryptographically secure random source
  for every encryption. Reusing an IV under the same key breaks AES-GCM and is
  catastrophic.
- AES-256-GCM authenticates the ciphertext: a modified, truncated, or reordered
  file fails the tag check. It does not authenticate the base64 container or the
  `createdAt` metadata, which are informational.
- There is no key escrow, no server-side key, and no network fallback.

### What the vault reveals

The container is not encrypted. An observer of the file can see the format
version, the creation time, the cell count, the KDF parameters, and the exact
ciphertext length (which approximates the plaintext length). The `merkle` root
is also public: equal roots mean equal cell sets, and a low-entropy cell could
be guessed and confirmed by recomputing its hash. Version 0.1 does not pad the
plaintext.

### Honest limits

- **No semantic recall.** Version 0.1 has no embeddings and no vector search;
  recall is lexical.
- **No sync.** There is no server, account, multi-writer merge, or conflict
  resolution.
- **No key rotation.** Changing the passphrase means opening the vault and
  sealing a new one; there is no re-wrap-in-place.
- **No forward secrecy.** A single long-lived passphrase protects every
  generation of the vault.
- **No revocation.** Copies cannot be recalled once they exist.

### Reporting

Report suspected vulnerabilities privately through GitHub Security Advisories at
https://github.com/srivtx/keepsake/security/advisories/new. Do not open a public
issue.
