import { canonicalJson } from "./canonical.ts";
import { cellHash } from "./cell.ts";
import { merkleRoot } from "./merkle.ts";
import { SPEC_VERSION } from "./types.ts";
import type { Cell } from "./types.ts";

const DATA_OPEN = "<!-- keepsake:data -->";
const DATA_CLOSE = "<!-- /keepsake:data -->";

function byCell(a: Cell, z: Cell): number {
  if (a.createdAt !== z.createdAt) return a.createdAt < z.createdAt ? -1 : 1;
  return a.id < z.id ? -1 : a.id > z.id ? 1 : 0;
}

function oneLine(text: string): string {
  return text.replace(/\r?\n/g, " ");
}

function frontMatterValue(text: string, key: string): string | undefined {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) return undefined;
  for (const line of match[1]!.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    if (line.slice(0, colon).trim() === key) return line.slice(colon + 1).trim();
  }
  return undefined;
}

function extractDataBlock(text: string): string {
  const start = text.indexOf(DATA_OPEN);
  const end = text.indexOf(DATA_CLOSE);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("keepsake: not a memory pack or the pack is corrupt");
  }

  let block = text.slice(start + DATA_OPEN.length, end).trim();

  if (block.startsWith("```")) {
    const firstLineEnd = block.indexOf("\n");
    block = firstLineEnd === -1 ? "" : block.slice(firstLineEnd + 1);
    const lastFence = block.lastIndexOf("```");
    if (lastFence !== -1) block = block.slice(0, lastFence);
    block = block.trim();
  }

  return block;
}

export async function toBundle(cells: Cell[]): Promise<string> {
  const ordered = [...cells].sort(byCell);

  const merkle = await merkleRoot(ordered.map((cell) => cell.hash));
  const createdAt = new Date().toISOString();

  const frontMatter = [
    "---",
    `keepsake: ${SPEC_VERSION}`,
    "kind: memory-pack",
    `createdAt: ${createdAt}`,
    `cells: ${ordered.length}`,
    `merkle: ${merkle}`,
    "---",
  ];

  const list = ordered.map(
    (cell, index) =>
      `${index + 1}. [${cell.source} · ${cell.role} · ${cell.createdAt}] ${oneLine(cell.text)}`,
  );

  const lines = [
    ...frontMatter,
    "",
    "# keepsake memory pack",
    "",
    "This file is a lossless, re-importable copy of your memory: every cell can be imported back without losing a byte. It is plaintext and not encrypted.",
    "",
    ...(list.length > 0 ? [...list, ""] : []),
    DATA_OPEN,
    "```json",
    canonicalJson(ordered),
    "```",
    DATA_CLOSE,
    "",
    `The Merkle root of these cells is ${merkle}. This file is safe to paste anywhere, but it is not encrypted: anyone who has the file can read it.`,
  ];

  return `${lines.join("\n")}\n`;
}

export async function fromBundle(text: string): Promise<Cell[]> {
  try {
    const raw = extractDataBlock(text);
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("keepsake: not a memory pack or the pack is corrupt");
    }
    const cells = parsed as Cell[];

    for (const cell of cells) {
      const expected = await cellHash(cell);
      if (expected !== cell.hash) {
        throw new Error("keepsake: not a memory pack or the pack is corrupt");
      }
    }

    const root = await merkleRoot(cells.map((cell) => cell.hash));
    const declared = frontMatterValue(text, "merkle");
    if (declared === undefined || declared !== root) {
      throw new Error("keepsake: not a memory pack or the pack is corrupt");
    }

    return cells.sort(byCell);
  } catch {
    throw new Error("keepsake: not a memory pack or the pack is corrupt");
  }
}

export function isBundle(text: string): boolean {
  return (
    text.includes("kind: memory-pack") &&
    text.includes(DATA_OPEN) &&
    text.includes(DATA_CLOSE)
  );
}
