import { describe, expect, test } from "bun:test";
import { contextPack } from "../src/context.ts";
import { makeCell } from "../src/cell.ts";
import type { Cell } from "../src/types.ts";

async function cell(
  id: string,
  text: string,
  createdAt: string,
  source = "notes",
): Promise<Cell> {
  return makeCell({ id, text, source, createdAt });
}

describe("contextPack", () => {
  test("returns a Markdown block with the task and the included cells", async () => {
    const cells = [
      await cell("a", "coffee beans and roast", "2026-01-01T00:00:00.000Z"),
      await cell("b", "green tea leaves", "2026-01-02T00:00:00.000Z", "chat"),
    ];

    const pack = contextPack(cells, "coffee");

    expect(pack.task).toBe("coffee");
    expect(pack.text).toContain("# Memory context for: coffee");
    expect(pack.text).toContain("coffee beans and roast");
    expect(pack.cells.map((entry) => entry.id)).toEqual(["a"]);
  });

  test("formats each section and the footer comment", async () => {
    const cells = [await cell("a", "coffee beans", "2026-01-01T00:00:00.000Z", "chat")];
    const pack = contextPack(cells, "coffee");

    expect(pack.text).toContain("- [chat · 2026-01-01T00:00:00.000Z] coffee beans");
    expect(pack.text).toContain("<!-- keepsake/v1 · 1 cells · ~");
    expect(pack.text).toContain(" tokens -->");
  });

  test("respects a tiny budget by including fewer cells", async () => {
    const long = "data ".padEnd(401, "x");
    const cells = [
      await cell("a", long, "2026-01-01T00:00:00.000Z"),
      await cell("b", long, "2026-01-02T00:00:00.000Z"),
      await cell("c", long, "2026-01-03T00:00:00.000Z"),
    ];

    const pack = contextPack(cells, "data", { budgetTokens: 120 });

    expect(pack.cells.length).toBeLessThan(3);
    expect(pack.cells.length).toBe(1);
  });

  test("never returns an empty pack when cells exist", async () => {
    const cells = [await cell("a", "huge ".padEnd(2000, "x"), "2026-01-01T00:00:00.000Z")];
    const pack = contextPack(cells, "huge", { budgetTokens: 1 });

    expect(pack.cells.length).toBe(1);
    expect(pack.text.length).toBeGreaterThan(0);
  });

  test("falls back to the most recent cells for an empty task", async () => {
    const cells = [
      await cell("old", "older memory", "2026-01-01T00:00:00.000Z"),
      await cell("new", "newer memory", "2026-01-05T00:00:00.000Z"),
    ];

    const pack = contextPack(cells, "");

    expect(pack.cells[0]!.id).toBe("new");
    expect(pack.cells.length).toBe(2);
    expect(pack.text.startsWith("# Memory context for: ")).toBe(true);
  });

  test("falls back to the most recent cells when nothing matches", async () => {
    const cells = [
      await cell("old", "coffee notes", "2026-01-01T00:00:00.000Z"),
      await cell("new", "tea notes", "2026-01-05T00:00:00.000Z"),
    ];

    const pack = contextPack(cells, "zebra");

    expect(pack.cells[0]!.id).toBe("new");
  });

  test("keeps the token estimate within a sufficient budget", async () => {
    const cells = [
      await cell("a", "data ".padEnd(41, "x"), "2026-01-01T00:00:00.000Z"),
      await cell("b", "data ".padEnd(41, "x"), "2026-01-02T00:00:00.000Z"),
      await cell("c", "data ".padEnd(41, "x"), "2026-01-03T00:00:00.000Z"),
    ];

    const pack = contextPack(cells, "data", { budgetTokens: 1000 });

    expect(pack.cells.length).toBe(3);
    expect(pack.tokens).toBeLessThanOrEqual(1000);
  });

  test("honors the maxCells option", async () => {
    const cells = [
      await cell("a", "data one", "2026-01-01T00:00:00.000Z"),
      await cell("b", "data two", "2026-01-02T00:00:00.000Z"),
      await cell("c", "data three", "2026-01-03T00:00:00.000Z"),
      await cell("d", "data four", "2026-01-04T00:00:00.000Z"),
    ];

    const pack = contextPack(cells, "data", { maxCells: 2 });

    expect(pack.cells.length).toBe(2);
  });

  test("is deterministic for the same inputs", async () => {
    const cells = [
      await cell("a", "coffee beans", "2026-01-01T00:00:00.000Z"),
      await cell("b", "coffee roast", "2026-01-02T00:00:00.000Z"),
    ];

    const first = contextPack(cells, "coffee");
    const second = contextPack(cells, "coffee");

    expect(first.text).toBe(second.text);
    expect(first.tokens).toBe(second.tokens);
  });

  test("returns an empty pack for no cells", () => {
    const pack = contextPack([], "coffee");
    expect(pack.cells).toEqual([]);
    expect(pack.text).toContain("# Memory context for: coffee");
    expect(pack.text).toContain("0 cells");
  });
});
