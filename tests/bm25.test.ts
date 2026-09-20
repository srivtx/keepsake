import { describe, expect, test } from "bun:test";
import { bm25, tokenize } from "../src/bm25.ts";
import type { Cell } from "../src/types.ts";

function cell(id: string, text: string): Cell {
  return {
    id,
    text,
    source: "notes",
    role: "note",
    createdAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    hash: "",
  };
}

describe("tokenize", () => {
  test("lowercases, splits on punctuation and drops single characters", () => {
    expect(tokenize("Hello, World! a I go")).toEqual(["hello", "world", "go"]);
  });
});

describe("bm25", () => {
  const cells = [
    cell("a", "coffee coffee coffee beans"),
    cell("b", "coffee beans and tea"),
    cell("c", "green tea leaves"),
  ];

  test("ranks the most relevant cell first", () => {
    const results = bm25(cells, "coffee");
    expect(results.length).toBe(2);
    expect(results[0]!.cell.id).toBe("a");
    expect(results[1]!.cell.id).toBe("b");
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  test("returns nothing for an empty query", () => {
    expect(bm25(cells, "")).toEqual([]);
    expect(bm25(cells, "   ")).toEqual([]);
  });

  test("returns nothing when no term matches", () => {
    expect(bm25(cells, "spaceship")).toEqual([]);
  });

  test("respects the limit option", () => {
    expect(bm25(cells, "tea", { limit: 1 }).length).toBe(1);
  });
});
