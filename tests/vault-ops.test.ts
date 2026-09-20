import { describe, expect, test } from "bun:test";
import {
  diffVaults,
  forgetCells,
  mergeCells,
  rotateVault,
} from "../src/vault-ops.ts";
import { decryptVault, encryptVault } from "../src/vault.ts";
import { makeCell } from "../src/cell.ts";
import type { Cell } from "../src/types.ts";

function raw(id: string, text: string, overrides: Partial<Cell> = {}): Cell {
  return {
    id,
    text,
    source: "notes",
    role: "note",
    createdAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    hash: `hash-${id}-${text}`,
    ...overrides,
  };
}

async function sample() {
  return [
    await makeCell({
      id: "b",
      text: "second memory",
      source: "notes",
      createdAt: "2026-01-02T00:00:00.000Z",
    }),
    await makeCell({
      id: "a",
      text: "first memory",
      source: "json",
      role: "user",
      tags: ["intro"],
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
  ];
}

describe("mergeCells", () => {
  test("unions disjoint cells and sorts by createdAt then id", () => {
    const base = [raw("b", "second", { createdAt: "2026-01-02T00:00:00.000Z" })];
    const incoming = [
      raw("c", "third", { createdAt: "2026-01-03T00:00:00.000Z" }),
      raw("a", "first", { createdAt: "2026-01-01T00:00:00.000Z" }),
    ];

    expect(mergeCells(base, incoming).map((cell) => cell.id)).toEqual(["a", "b", "c"]);
  });

  test("drops a cell whose hash already exists", () => {
    const base = [raw("a", "first", { hash: "shared" })];
    const incoming = [raw("b", "second", { hash: "shared" })];
    const merged = mergeCells(base, incoming);

    expect(merged.length).toBe(1);
    expect(merged[0]!.id).toBe("a");
  });

  test("drops a cell whose id already exists", () => {
    const base = [raw("a", "first", { hash: "h1" })];
    const incoming = [raw("a", "second", { hash: "h2" })];
    const merged = mergeCells(base, incoming);

    expect(merged.length).toBe(1);
    expect(merged[0]!.text).toBe("first");
  });

  test("returns a new array without mutating its inputs", () => {
    const base = [raw("a", "first")];
    const incoming = [raw("b", "second")];
    const merged = mergeCells(base, incoming);

    expect(merged).not.toBe(base);
    expect(base.length).toBe(1);
    expect(incoming.length).toBe(1);
  });

  test("drops duplicates coming from inside the same list", () => {
    const incoming = [raw("a", "first", { hash: "h1" }), raw("a", "again", { hash: "h2" })];
    expect(mergeCells([], incoming).map((cell) => cell.id)).toEqual(["a"]);
  });
});

describe("forgetCells", () => {
  const cells = [
    raw("a", "coffee beans", { source: "notes", tags: ["food"] }),
    raw("b", "green tea leaves", { source: "chat", tags: ["drink"] }),
    raw("c", "spaceship launch", { source: "notes", tags: ["space"] }),
  ];

  test("removes by exact ids", () => {
    const { kept, removed } = forgetCells(cells, { ids: ["a", "c"] });
    expect(kept.map((cell) => cell.id)).toEqual(["b"]);
    expect(removed.map((cell) => cell.id)).toEqual(["a", "c"]);
  });

  test("removes by tag membership", () => {
    const { kept, removed } = forgetCells(cells, { tag: "drink" });
    expect(removed.map((cell) => cell.id)).toEqual(["b"]);
    expect(kept.length).toBe(2);
  });

  test("removes by source", () => {
    const { kept, removed } = forgetCells(cells, { source: "notes" });
    expect(removed.map((cell) => cell.id)).toEqual(["a", "c"]);
    expect(kept.map((cell) => cell.id)).toEqual(["b"]);
  });

  test("removes by query", () => {
    const { removed } = forgetCells(cells, { query: "coffee" });
    expect(removed.map((cell) => cell.id)).toEqual(["a"]);
  });

  test("removes nothing when no selector field is provided", () => {
    const { kept, removed } = forgetCells(cells, {});
    expect(removed).toEqual([]);
    expect(kept.map((cell) => cell.id)).toEqual(["a", "b", "c"]);
  });

  test("removes cells matching any provided selector", () => {
    const { removed } = forgetCells(cells, { source: "chat", tag: "space" });
    expect(removed.map((cell) => cell.id)).toEqual(["b", "c"]);
  });

  test("does not mutate the input", () => {
    const before = cells.length;
    forgetCells(cells, { query: "tea" });
    expect(cells.length).toBe(before);
  });
});

describe("rotateVault", () => {
  test("round-trips the cells with the new passphrase", async () => {
    const vault = await encryptVault(await sample(), "old", { iterations: 1000 });
    const rotated = await rotateVault(vault, "old", "new", { iterations: 1000 });
    const restored = await decryptVault(rotated, "new");

    expect(restored.map((cell) => cell.id)).toEqual(["a", "b"]);
    expect(restored[0]!.text).toBe("first memory");
  });

  test("rejects the old passphrase after rotation", async () => {
    const vault = await encryptVault(await sample(), "old", { iterations: 1000 });
    const rotated = await rotateVault(vault, "old", "new", { iterations: 1000 });

    await expect(decryptVault(rotated, "old")).rejects.toThrow(
      "keepsake: wrong passphrase or corrupt vault",
    );
  });

  test("rejects a wrong old passphrase", async () => {
    const vault = await encryptVault(await sample(), "old", { iterations: 1000 });
    await expect(rotateVault(vault, "wrong", "new", { iterations: 1000 })).rejects.toThrow(
      "keepsake: wrong passphrase or corrupt vault",
    );
  });

  test("preserves createdAt and merkle and the cell count", async () => {
    const vault = await encryptVault(await sample(), "old", { iterations: 1000 });
    const rotated = await rotateVault(vault, "old", "new", { iterations: 1000 });

    expect(rotated.createdAt).toBe(vault.createdAt);
    expect(rotated.merkle).toBe(vault.merkle);
    expect(rotated.cells).toBe(vault.cells);
  });

  test("applies the iterations option", async () => {
    const vault = await encryptVault(await sample(), "old", { iterations: 1000 });
    const rotated = await rotateVault(vault, "old", "new", { iterations: 1234 });
    expect(rotated.kdf.iterations).toBe(1234);
  });
});

describe("diffVaults", () => {
  test("reports added, removed, and common cells", async () => {
    const shared = await makeCell({
      id: "shared",
      text: "shared memory",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const onlyA = await makeCell({
      id: "only-a",
      text: "kept in a",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const onlyB = await makeCell({
      id: "only-b",
      text: "new in b",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    const a = await encryptVault([shared, onlyA], "a", { iterations: 1000 });
    const b = await encryptVault([shared, onlyB], "b", { iterations: 1000 });
    const diff = await diffVaults(a, b, "a", "b");

    expect(diff.added.map((cell) => cell.id)).toEqual(["only-b"]);
    expect(diff.removed.map((cell) => cell.id)).toEqual(["only-a"]);
    expect(diff.common).toBe(1);
  });

  test("reports no differences for identical vaults", async () => {
    const cells = await sample();
    const a = await encryptVault(cells, "pw", { iterations: 1000 });
    const b = await encryptVault(cells, "pw", { iterations: 1000 });
    const diff = await diffVaults(a, b, "pw", "pw");

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.common).toBe(2);
  });

  test("sorts added and removed by createdAt then id", async () => {
    const b1 = await makeCell({
      id: "z",
      text: "late",
      createdAt: "2026-01-05T00:00:00.000Z",
    });
    const b2 = await makeCell({
      id: "y",
      text: "early",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const a = await encryptVault([], "a", { iterations: 1000 });
    const b = await encryptVault([b1, b2], "b", { iterations: 1000 });
    const diff = await diffVaults(a, b, "a", "b");

    expect(diff.added.map((cell) => cell.id)).toEqual(["y", "z"]);
  });
});
