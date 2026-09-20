import { describe, expect, test } from "bun:test";
import { memoryStats } from "../src/stats.ts";
import { canonicalJson } from "../src/canonical.ts";
import { utf8 } from "../src/bytes.ts";
import type { Cell } from "../src/types.ts";

function cell(id: string, source: string, tags: string[]): Cell {
  return {
    id,
    text: `memory ${id}`,
    source,
    role: "note",
    createdAt: "2026-01-01T00:00:00.000Z",
    tags,
    hash: "",
  };
}

describe("memoryStats", () => {
  test("counts cells, sources, tags and bytes", () => {
    const cells = [
      cell("1", "notes", ["a", "shared"]),
      cell("2", "notes", ["shared"]),
      cell("3", "json", ["b"]),
    ];
    const stats = memoryStats(cells);

    expect(stats.count).toBe(3);
    expect(stats.sources).toEqual({ notes: 2, json: 1 });
    expect(stats.tags["shared"]).toBe(2);
    expect(Object.keys(stats.tags)).toEqual(["shared", "a", "b"]);
    expect(stats.bytes).toBe(utf8(canonicalJson(cells)).length);
    expect(stats.bytes).toBeGreaterThan(0);
  });

  test("handles an empty collection", () => {
    expect(memoryStats([])).toEqual({ count: 0, sources: {}, tags: {}, bytes: 2 });
  });
});
