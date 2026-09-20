import { utf8 } from "./bytes.ts";
import { canonicalJson } from "./canonical.ts";
import type { Cell, MemoryStats } from "./types.ts";

export function memoryStats(cells: Cell[]): MemoryStats {
  const sources: Record<string, number> = {};
  const tagCounts = new Map<string, number>();

  for (const cell of cells) {
    sources[cell.source] = (sources[cell.source] ?? 0) + 1;
    for (const tag of cell.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const sortedTags = [...tagCounts.entries()].sort((a, z) => {
    if (z[1] !== a[1]) return z[1] - a[1];
    return a[0] < z[0] ? -1 : a[0] > z[0] ? 1 : 0;
  });

  const tags: Record<string, number> = {};
  for (const [tag, count] of sortedTags) tags[tag] = count;

  return {
    count: cells.length,
    sources,
    tags,
    bytes: utf8(canonicalJson(cells)).length,
  };
}
