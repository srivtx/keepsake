import { describe, expect, test } from "bun:test";
import { merkleRoot, verifyCells } from "../src/merkle.ts";
import { makeCell } from "../src/cell.ts";
import { sha256Hex } from "../src/crypto.ts";
import type { Cell } from "../src/types.ts";

async function cell(id: string, text: string): Promise<Cell> {
  return makeCell({ id, text, createdAt: "2026-01-01T00:00:00.000Z" });
}

describe("merkleRoot", () => {
  test("empty set is sha256 of the empty string", async () => {
    const expected = await sha256Hex("");
    expect(await merkleRoot([])).toBe(expected);
    expect(expected).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("a single hash is returned unchanged", async () => {
    const h = await sha256Hex("only");
    expect(await merkleRoot([h])).toBe(h);
  });

  test("is order-independent", async () => {
    const hashes = [await sha256Hex("a"), await sha256Hex("b"), await sha256Hex("c")];
    const shuffled = [hashes[2]!, hashes[0]!, hashes[1]!];
    expect(await merkleRoot(hashes)).toBe(await merkleRoot(shuffled));
  });

  test("carries an odd node up unchanged", async () => {
    const sorted = [await sha256Hex("a"), await sha256Hex("b"), await sha256Hex("c")].sort();
    const expected = await sha256Hex((await sha256Hex(sorted[0]! + sorted[1]!)) + sorted[2]!);
    expect(await merkleRoot(sorted)).toBe(expected);
  });
});

describe("verifyCells", () => {
  test("accepts an untampered set", async () => {
    const cells = [await cell("1", "alpha"), await cell("2", "beta")];
    const result = await verifyCells(cells);
    expect(result.ok).toBe(true);
    expect(result.bad).toEqual([]);
    expect(result.root.length).toBe(64);
  });

  test("catches a tampered cell", async () => {
    const cells = [await cell("1", "alpha"), await cell("2", "beta")];
    const tampered: Cell = { ...cells[1]!, text: "changed" };
    const result = await verifyCells([cells[0]!, tampered]);
    expect(result.ok).toBe(false);
    expect(result.bad).toEqual(["2"]);
  });
});
