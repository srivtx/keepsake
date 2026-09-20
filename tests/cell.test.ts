import { describe, expect, test } from "bun:test";
import { cellHash, cellPayload, hashCell, makeCell } from "../src/cell.ts";
import type { Cell } from "../src/types.ts";

const base = {
  id: "cell-1",
  text: "the quick brown fox",
  source: "notes",
  role: "note" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  tags: ["animals"],
};

describe("cell", () => {
  test("cellPayload is byte-stable for the same cell", () => {
    expect(cellPayload(base)).toBe(cellPayload({ ...base, tags: ["animals"] }));
  });

  test("cellHash is stable across calls", async () => {
    expect(await cellHash(base)).toBe(await cellHash(base));
  });

  test("identical inputs produce the same hash", async () => {
    const a = await makeCell(base);
    const b = await makeCell(base);
    expect(a.hash).toBe(b.hash);
  });

  test("changing a tag changes the hash", async () => {
    const a = await makeCell(base);
    const b = await makeCell({ ...base, tags: ["plants"] });
    expect(b.hash).not.toBe(a.hash);
  });

  test("makeCell fills in defaults", async () => {
    const cell = await makeCell({ text: "hello" });
    expect(cell.source).toBe("notes");
    expect(cell.role).toBe("note");
    expect(cell.tags).toEqual([]);
    expect(cell.id.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(cell.createdAt))).toBe(false);
    expect(cell.hash.length).toBe(64);
  });

  test("hashCell matches cellHash", async () => {
    const cell = (await makeCell(base)) as Cell;
    expect(await hashCell(cell)).toBe(await cellHash(cell));
  });
});
