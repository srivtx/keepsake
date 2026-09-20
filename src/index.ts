export { SPEC_VERSION } from "./types.ts";
export type {
  Role,
  Cell,
  CellInput,
  KdfInfo,
  CipherInfo,
  VaultFile,
  MemoryStats,
} from "./types.ts";

export { canonicalJson } from "./canonical.ts";
export { toBase64, fromBase64, utf8, fromUtf8, hex } from "./bytes.ts";
export { sha256Hex, pbkdf2Key, DEFAULT_ITERATIONS } from "./crypto.ts";
export { cellPayload, cellHash, hashCell, makeCell } from "./cell.ts";
export { merkleRoot, verifyCells } from "./merkle.ts";
export { tokenize, bm25 } from "./bm25.ts";
export type { Bm25Options } from "./bm25.ts";
export { encryptVault, decryptVault, vaultSummary } from "./vault.ts";
export type { EncryptOptions } from "./vault.ts";
export { normalizeImport } from "./import/index.ts";
export { detectSource } from "./import/detect.ts";
export {
  contentText,
  normalizeRole,
  extractMessage,
  isConversation,
  parseConversation,
} from "./import/chatgpt.ts";
export { memoryStats } from "./stats.ts";
export { runConformance, formatConformance } from "./conformance.ts";
export type { ConformanceCheck, ConformanceReport, Vectors } from "./conformance.ts";
export { mergeCells, forgetCells, rotateVault, diffVaults } from "./vault-ops.ts";
export type { ForgetResult, ForgetSelector, RotateOptions, VaultDiff } from "./vault-ops.ts";
export { contextPack } from "./context.ts";
export type { ContextPack, ContextPackOptions } from "./context.ts";
