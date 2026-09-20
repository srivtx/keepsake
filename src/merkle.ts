import { cellHash } from "./cell.ts";
import { sha256Hex } from "./crypto.ts";
import type { Cell } from "./types.ts";

export async function merkleRoot(hashes: string[]): Promise<string> {
  if (hashes.length === 0) return sha256Hex("");

  let level = [...hashes].sort();

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] ?? "";
      const right = level[i + 1];
      if (right === undefined) {
        next.push(left);
      } else {
        next.push(await sha256Hex(left + right));
      }
    }
    level = next;
  }

  return level[0] ?? sha256Hex("");
}

export async function verifyCells(
  cells: Cell[],
): Promise<{ ok: boolean; root: string; bad: string[] }> {
  const bad: string[] = [];
  const recomputed: string[] = [];

  for (const cell of cells) {
    const hash = await cellHash(cell);
    recomputed.push(hash);
    if (hash !== cell.hash) bad.push(cell.id);
  }

  const root = await merkleRoot(recomputed);
  return { ok: bad.length === 0, root, bad };
}
