import { canonicalJson } from "./canonical.ts";
import { fromBase64, fromUtf8, toArrayBuffer, toBase64, utf8 } from "./bytes.ts";
import { cellHash } from "./cell.ts";
import { DEFAULT_ITERATIONS, pbkdf2Key } from "./crypto.ts";
import { merkleRoot } from "./merkle.ts";
import { SPEC_VERSION } from "./types.ts";
import type { Cell, VaultFile } from "./types.ts";

export interface EncryptOptions {
  iterations?: number;
}

export async function encryptVault(
  cells: Cell[],
  passphrase: string,
  options: EncryptOptions = {},
): Promise<VaultFile> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const key = await pbkdf2Key(passphrase, salt, iterations);
  const plaintext = utf8(canonicalJson(cells));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext),
  );
  const ciphertext = new Uint8Array(encrypted);
  const merkle = await merkleRoot(cells.map((cell) => cell.hash));

  return {
    format: SPEC_VERSION,
    createdAt: new Date().toISOString(),
    cells: cells.length,
    kdf: { name: "PBKDF2-SHA256", iterations, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv: toBase64(iv) },
    ciphertext: toBase64(ciphertext),
    merkle,
  };
}

export async function decryptVault(file: VaultFile, passphrase: string): Promise<Cell[]> {
  try {
    if (!file || file.format !== SPEC_VERSION) throw new Error("bad format");
    if (!file.kdf || file.kdf.name !== "PBKDF2-SHA256") throw new Error("bad kdf");
    if (!file.cipher || file.cipher.name !== "AES-GCM") throw new Error("bad cipher");

    const salt = fromBase64(file.kdf.salt);
    const iv = fromBase64(file.cipher.iv);
    const key = await pbkdf2Key(passphrase, salt, file.kdf.iterations);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(fromBase64(file.ciphertext)),
    );

    const cells = JSON.parse(fromUtf8(new Uint8Array(decrypted))) as Cell[];
    if (!Array.isArray(cells)) throw new Error("bad payload");

    for (const cell of cells) {
      const expected = await cellHash(cell);
      if (expected !== cell.hash) throw new Error("tampered cell");
    }

    const root = await merkleRoot(cells.map((cell) => cell.hash));
    if (root !== file.merkle) throw new Error("merkle mismatch");

    return [...cells].sort((a, z) => {
      if (a.createdAt !== z.createdAt) return a.createdAt < z.createdAt ? -1 : 1;
      return a.id < z.id ? -1 : a.id > z.id ? 1 : 0;
    });
  } catch {
    throw new Error("keepsake: wrong passphrase or corrupt vault");
  }
}

export function vaultSummary(file: VaultFile): {
  format: string;
  createdAt: string;
  cells: number;
  merkle: string;
  iterations: number;
} {
  return {
    format: file.format,
    createdAt: file.createdAt,
    cells: file.cells,
    merkle: file.merkle,
    iterations: file.kdf.iterations,
  };
}
