export const SPEC_VERSION = "keepsake/v1";

export type Role = "user" | "assistant" | "note" | "system";

export interface Cell {
  id: string;
  text: string;
  source: string;
  role: Role;
  createdAt: string;
  tags: string[];
  hash: string;
}

export interface CellInput {
  text: string;
  source?: string;
  role?: Role;
  tags?: string[];
  createdAt?: string;
  id?: string;
}

export interface KdfInfo {
  name: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
}

export interface CipherInfo {
  name: "AES-GCM";
  iv: string;
}

export interface VaultFile {
  format: typeof SPEC_VERSION;
  createdAt: string;
  cells: number;
  kdf: KdfInfo;
  cipher: CipherInfo;
  ciphertext: string;
  merkle: string;
}

export interface MemoryStats {
  count: number;
  sources: Record<string, number>;
  tags: Record<string, number>;
  bytes: number;
}
