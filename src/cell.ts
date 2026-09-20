import { canonicalJson } from "./canonical.ts";
import { sha256Hex } from "./crypto.ts";
import type { Cell, CellInput } from "./types.ts";

export function cellPayload(cell: Cell | CellInput): string {
  const id = cell.id ?? crypto.randomUUID();
  const createdAt = cell.createdAt ?? new Date().toISOString();
  const source = cell.source ?? "notes";
  const role = cell.role ?? "note";
  const tags = cell.tags ?? [];

  return canonicalJson({ id, text: cell.text, source, role, createdAt, tags });
}

export function cellHash(cell: Cell | CellInput): Promise<string> {
  return sha256Hex(cellPayload(cell));
}

export function hashCell(cell: Cell): Promise<string> {
  return cellHash(cell);
}

export async function makeCell(input: CellInput): Promise<Cell> {
  const base = {
    id: input.id ?? crypto.randomUUID(),
    text: input.text,
    source: input.source ?? "notes",
    role: input.role ?? "note",
    createdAt: input.createdAt ?? new Date().toISOString(),
    tags: input.tags ?? [],
  };

  const hash = await sha256Hex(cellPayload(base));
  return { ...base, hash };
}
