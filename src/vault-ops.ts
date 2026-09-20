import { bm25 } from "./bm25.ts";
import { decryptVault, encryptVault } from "./vault.ts";
import type { Cell, VaultFile } from "./types.ts";

export { contextPack } from "./context.ts";
export type { ContextPack, ContextPackOptions } from "./context.ts";

export interface RotateOptions {
  iterations?: number;
}

export interface ForgetSelector {
  ids?: string[];
  query?: string;
  source?: string;
  tag?: string;
}

export interface ForgetResult {
  kept: Cell[];
  removed: Cell[];
}

export interface VaultDiff {
  added: Cell[];
  removed: Cell[];
  common: number;
}

function byCreatedAt(a: Cell, z: Cell): number {
  if (a.createdAt !== z.createdAt) return a.createdAt < z.createdAt ? -1 : 1;
  return a.id < z.id ? -1 : a.id > z.id ? 1 : 0;
}

function sortCells(cells: Cell[]): Cell[] {
  return [...cells].sort(byCreatedAt);
}

export function mergeCells(base: Cell[], incoming: Cell[]): Cell[] {
  const seenHashes = new Set<string>();
  const seenIds = new Set<string>();
  const merged: Cell[] = [];

  for (const cell of [...base, ...incoming]) {
    if (seenHashes.has(cell.hash) || seenIds.has(cell.id)) continue;
    seenHashes.add(cell.hash);
    seenIds.add(cell.id);
    merged.push(cell);
  }

  return sortCells(merged);
}

export function forgetCells(
  cells: Cell[],
  selector: ForgetSelector = {},
): ForgetResult {
  const { ids, query, source, tag } = selector;
  const hasSelector =
    ids !== undefined || query !== undefined || source !== undefined || tag !== undefined;

  if (!hasSelector) return { kept: [...cells], removed: [] };

  const matched = new Set<string>();

  if (ids !== undefined) {
    const wanted = new Set(ids);
    for (const cell of cells) {
      if (wanted.has(cell.id)) matched.add(cell.id);
    }
  }

  if (source !== undefined) {
    for (const cell of cells) {
      if (cell.source === source) matched.add(cell.id);
    }
  }

  if (tag !== undefined) {
    for (const cell of cells) {
      if (cell.tags.includes(tag)) matched.add(cell.id);
    }
  }

  if (query !== undefined) {
    const results = bm25([...cells], query, { limit: cells.length });
    for (const result of results) matched.add(result.cell.id);
  }

  const kept = cells.filter((cell) => !matched.has(cell.id));
  const removed = cells.filter((cell) => matched.has(cell.id));

  return { kept, removed };
}

export async function rotateVault(
  file: VaultFile,
  oldPassphrase: string,
  newPassphrase: string,
  options: RotateOptions = {},
): Promise<VaultFile> {
  const cells = await decryptVault(file, oldPassphrase);
  const rotated = await encryptVault(cells, newPassphrase, {
    iterations: options.iterations,
  });

  return { ...rotated, createdAt: file.createdAt, merkle: file.merkle };
}

export async function diffVaults(
  a: VaultFile,
  b: VaultFile,
  passphraseA: string,
  passphraseB: string,
): Promise<VaultDiff> {
  const cellsA = await decryptVault(a, passphraseA);
  const cellsB = await decryptVault(b, passphraseB);

  const hashesA = new Set(cellsA.map((cell) => cell.hash));
  const hashesB = new Set(cellsB.map((cell) => cell.hash));

  const added = sortCells(cellsB.filter((cell) => !hashesA.has(cell.hash)));
  const removed = sortCells(cellsA.filter((cell) => !hashesB.has(cell.hash)));

  let common = 0;
  for (const hash of hashesA) {
    if (hashesB.has(hash)) common += 1;
  }

  return { added, removed, common };
}
