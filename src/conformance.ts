import { fromBase64 } from "./bytes.ts";
import { canonicalJson } from "./canonical.ts";
import { cellHash } from "./cell.ts";
import { decryptVault, encryptVault } from "./vault.ts";
import { merkleRoot } from "./merkle.ts";
import type { Cell, VaultFile } from "./types.ts";

export interface ConformanceCheck {
  level: "L1" | "L2" | "L3";
  label: string;
  ok: boolean;
  detail: string;
}

export interface ConformanceReport {
  total: number;
  failed: number;
  ok: boolean;
  merkleRoot: string;
  checks: ConformanceCheck[];
}

interface VectorCell extends Partial<Cell> {
  id: string;
  text: string;
  source: string;
  role: Cell["role"];
  createdAt: string;
  tags: string[];
  hash: string;
  canonicalJson?: string;
}

export interface Vectors {
  version: string;
  passphraseForExample: string;
  cells: VectorCell[];
  merkleRoot: string;
  plaintextCanonicalJson?: string;
  vaultExample: VaultFile;
}

function payloadOf(cell: VectorCell): Omit<Cell, "hash"> {
  return {
    id: cell.id,
    text: cell.text,
    source: cell.source,
    role: cell.role,
    createdAt: cell.createdAt,
    tags: cell.tags,
  };
}

function safeLength(base64: string): number {
  try {
    return fromBase64(base64).length;
  } catch {
    return -1;
  }
}

export async function runConformance(vectors: Vectors): Promise<ConformanceReport> {
  const checks: ConformanceCheck[] = [];
  const vault = vectors.vaultExample;

  const record = (level: ConformanceCheck["level"], label: string, ok: boolean, detail: string): void => {
    checks.push({ level, label, ok, detail });
  };

  // L1 — parse: structural checks without a passphrase.
  record("L1", "format is keepsake/v1", vault.format === "keepsake/v1", String(vault.format));
  record("L1", "kdf.name is PBKDF2-SHA256", vault.kdf?.name === "PBKDF2-SHA256", String(vault.kdf?.name));
  record(
    "L1",
    "kdf.iterations is a positive integer",
    Number.isInteger(vault.kdf?.iterations) && vault.kdf.iterations > 0,
    String(vault.kdf?.iterations),
  );
  record("L1", "kdf.salt decodes to 16 bytes", safeLength(vault.kdf?.salt ?? "") === 16, `${safeLength(vault.kdf?.salt ?? "")} bytes`);
  record("L1", "cipher.name is AES-GCM", vault.cipher?.name === "AES-GCM", String(vault.cipher?.name));
  record("L1", "cipher.iv decodes to 12 bytes", safeLength(vault.cipher?.iv ?? "") === 12, `${safeLength(vault.cipher?.iv ?? "")} bytes`);
  record("L1", "ciphertext is at least 16 bytes", safeLength(vault.ciphertext ?? "") >= 16, `${safeLength(vault.ciphertext ?? "")} bytes`);
  record("L1", "merkle is 64 hex chars", /^[0-9a-f]{64}$/.test(vault.merkle ?? ""), String(vault.merkle));
  record("L1", "cells is a non-negative integer", Number.isInteger(vault.cells) && vault.cells >= 0, String(vault.cells));

  // L2 — integrity over the vector cells.
  const cells = vectors.cells;
  for (const cell of cells) {
    const payload = payloadOf(cell);
    const canonical = canonicalJson(payload);
    if (cell.canonicalJson !== undefined) {
      record("L2", `canonicalJson · ${cell.id.slice(0, 8)}`, canonical === cell.canonicalJson, canonical === cell.canonicalJson ? "matches" : "differs");
    }
    const hash = await cellHash(payload);
    record("L2", `cell hash · ${cell.id.slice(0, 8)}`, hash === cell.hash, hash === cell.hash ? hash.slice(0, 16) : `${hash.slice(0, 16)} ≠ ${cell.hash.slice(0, 16)}`);
  }
  const uniqueIds = new Set(cells.map((cell) => cell.id));
  record("L2", "cell ids are unique", uniqueIds.size === cells.length, `${uniqueIds.size} of ${cells.length}`);
  const root = await merkleRoot(cells.map((cell) => cell.hash));
  record("L2", "merkle root matches the vectors", root === vectors.merkleRoot && root === vault.merkle, root);

  // L3 — crypto round-trip.
  try {
    const opened = await decryptVault(vault, vectors.passphraseForExample);
    record("L3", "opens with the vector passphrase", true, `${opened.length} cell(s)`);
    const openedHashes = opened.map((cell) => cell.hash).sort().join(",");
    const expectedHashes = cells.map((cell) => cell.hash).sort().join(",");
    record("L3", "decrypted cells match the vector hashes", openedHashes === expectedHashes, `${opened.length} cell(s)`);
    if (vectors.plaintextCanonicalJson !== undefined) {
      const plaintext = canonicalJson(opened);
      record("L3", "plaintext is byte-for-byte canonical JSON", plaintext === vectors.plaintextCanonicalJson, `${plaintext.length} bytes`);
    }
    try {
      await decryptVault(vault, `${vectors.passphraseForExample}-wrong`);
      record("L3", "wrong passphrase is rejected", false, "decryption unexpectedly succeeded");
    } catch {
      record("L3", "wrong passphrase is rejected", true, "threw as expected");
    }
  } catch (err) {
    record("L3", "opens with the vector passphrase", false, err instanceof Error ? err.message : String(err));
  }

  // L3 — seal then open the same cells.
  try {
    const asCells = cells.map((cell) => cell as unknown as Cell);
    const resealed = await encryptVault(asCells, vectors.passphraseForExample, { iterations: 100_000 });
    const reopened = await decryptVault(resealed, vectors.passphraseForExample);
    const sameIds =
      reopened.map((cell) => cell.id).sort().join(",") ===
      cells.map((cell) => cell.id).sort().join(",");
    const sameHashes =
      reopened.map((cell) => cell.hash).sort().join(",") ===
      cells.map((cell) => cell.hash).sort().join(",");
    record("L3", "seal → open round-trips the same cells", sameIds && sameHashes, `${reopened.length} cell(s)`);
  } catch (err) {
    record("L3", "seal → open round-trips the same cells", false, err instanceof Error ? err.message : String(err));
  }

  const failed = checks.filter((check) => !check.ok).length;
  return { total: checks.length, failed, ok: failed === 0, merkleRoot: root, checks };
}

export function formatConformance(report: ConformanceReport): string {
  const lines = report.checks.map(
    (check) => `${check.level}  ${check.ok ? "pass" : "FAIL"}  ${check.label}  ${check.detail}`,
  );
  lines.push(`${report.total - report.failed}/${report.total} checks passed`);
  return lines.join("\n");
}
