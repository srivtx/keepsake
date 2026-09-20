import { describe, expect, test } from "bun:test";
import { fromBundle, isBundle, toBundle } from "../src/interchange.ts";
import { canonicalJson } from "../src/canonical.ts";
import { makeCell } from "../src/cell.ts";
import { merkleRoot } from "../src/merkle.ts";
import { encryptVault } from "../src/vault.ts";
import type { Cell } from "../src/types.ts";

const OPEN = "<!-- keepsake:data -->";
const CLOSE = "<!-- /keepsake:data -->";

async function sample(): Promise<Cell[]> {
  return [
    await makeCell({
      id: "a",
      text: "first\nmemory",
      source: "notes",
      role: "note",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    await makeCell({
      id: "b",
      text: "second memory",
      source: "chat",
      role: "user",
      createdAt: "2026-01-02T00:00:00.000Z",
    }),
    await makeCell({
      id: "c",
      text: "third memory",
      source: "json",
      role: "assistant",
      createdAt: "2026-01-03T00:00:00.000Z",
    }),
  ];
}

function payload(bundle: string): string {
  const start = bundle.indexOf(OPEN);
  const end = bundle.indexOf(CLOSE);
  const block = bundle.slice(start, end);
  const match = block.match(/```json\n([\s\S]*?)\n```/);
  return match ? (match[1] ?? "") : "";
}

function withRawData(bundle: string, raw: string): string {
  const start = bundle.indexOf(OPEN);
  const end = bundle.indexOf(CLOSE);
  const head = bundle.slice(0, start + OPEN.length);
  const tail = bundle.slice(end);
  return head + "\n```json\n" + raw + "\n```\n" + tail;
}

function tamperMerkle(bundle: string): string {
  return bundle.replace(/^merkle: .*$/m, `merkle: ${"0".repeat(64)}`);
}

describe("interchange", () => {
  test("round-trips cells losslessly and preserves the merkle root", async () => {
    const cells = await sample();
    const bundle = await toBundle(cells);
    const restored = await fromBundle(bundle);

    expect(canonicalJson(restored)).toBe(canonicalJson(cells));
    expect(restored.length).toBe(cells.length);
    expect(await merkleRoot(restored.map((cell) => cell.hash))).toBe(
      await merkleRoot(cells.map((cell) => cell.hash)),
    );
    expect(restored.map((cell) => cell.id)).toEqual(["a", "b", "c"]);
  });

  test("isBundle is true for a produced bundle", async () => {
    expect(isBundle(await toBundle(await sample()))).toBe(true);
  });

  test("isBundle is false for plain text", () => {
    expect(isBundle("just some notes about coffee beans")).toBe(false);
  });

  test("isBundle is false for a vault file", async () => {
    const vault = await encryptVault(await sample(), "pw", { iterations: 1000 });
    expect(isBundle(JSON.stringify(vault))).toBe(false);
  });

  test("isBundle is false for a ChatGPT export", () => {
    const chatgpt = JSON.stringify({ title: "Trip", mapping: { root: { id: "root" } } });
    expect(isBundle(chatgpt)).toBe(false);
  });

  test("contains the numbered human list sorted by createdAt then id", async () => {
    const cells = await sample();
    const bundle = await toBundle(cells);

    expect(bundle).toContain(
      "1. [notes · note · 2026-01-01T00:00:00.000Z] first memory",
    );
    expect(bundle).toContain(
      "2. [chat · user · 2026-01-02T00:00:00.000Z] second memory",
    );
    expect(bundle).toContain(
      "3. [json · assistant · 2026-01-03T00:00:00.000Z] third memory",
    );
  });

  test("has the heading, the data markers, and the not-encrypted warning", async () => {
    const bundle = await toBundle(await sample());

    expect(bundle).toContain("# keepsake memory pack");
    expect(bundle).toContain(OPEN);
    expect(bundle).toContain(CLOSE);
    expect(bundle).toContain("not encrypted");
  });

  test("puts the data markers immediately around the fenced json block", async () => {
    const bundle = await toBundle(await sample());
    const start = bundle.indexOf(OPEN);
    const end = bundle.indexOf(CLOSE);

    expect(bundle.slice(start + OPEN.length, end)).toContain("```json");
    expect(bundle.slice(0, start)).toContain("# keepsake memory pack");
  });

  test("writes the front matter keys in order", async () => {
    const bundle = await toBundle(await sample());

    expect(bundle.startsWith("---\n")).toBe(true);
    expect(bundle).toContain("keepsake: keepsake/v1");
    expect(bundle).toContain("kind: memory-pack");

    const order = ["keepsake:", "kind:", "createdAt:", "cells:", "merkle:"].map((key) =>
      bundle.indexOf(key),
    );
    expect(order).toEqual([...order].sort((a, z) => a - z));
  });

  test("stores the full cells array as canonical JSON in the data block", async () => {
    const cells = await sample();
    const bundle = await toBundle(cells);

    expect(payload(bundle)).toBe(canonicalJson(cells));
  });

  test("strips newlines inside the human list text", async () => {
    const bundle = await toBundle(await sample());
    expect(bundle).toContain("first memory");
    expect(bundle).not.toContain("first\nmemory");
  });

  test("throws when the JSON payload is tampered without updating the hash", async () => {
    const bundle = await toBundle(await sample());
    const data = JSON.parse(payload(bundle)) as Cell[];
    data[0]!.text = "tampered memory";
    const bad = withRawData(bundle, JSON.stringify(data));

    await expect(fromBundle(bad)).rejects.toThrow(
      "keepsake: not a memory pack or the pack is corrupt",
    );
  });

  test("throws when the front-matter merkle is tampered", async () => {
    const bundle = await toBundle(await sample());

    await expect(fromBundle(tamperMerkle(bundle))).rejects.toThrow(
      "keepsake: not a memory pack or the pack is corrupt",
    );
  });

  test("throws when the data markers are removed", async () => {
    const bundle = await toBundle(await sample());
    const stripped = bundle.replace(OPEN, "").replace(CLOSE, "");

    expect(stripped).toContain("```json");
    await expect(fromBundle(stripped)).rejects.toThrow(
      "keepsake: not a memory pack or the pack is corrupt",
    );
  });

  test("throws when the data block is not valid JSON", async () => {
    const bundle = await toBundle(await sample());
    const bad = withRawData(bundle, "{not valid json");

    await expect(fromBundle(bad)).rejects.toThrow(
      "keepsake: not a memory pack or the pack is corrupt",
    );
  });

  test("throws when the data block is not an array", async () => {
    const bundle = await toBundle(await sample());
    const bad = withRawData(bundle, JSON.stringify({ cells: [] }));

    await expect(fromBundle(bad)).rejects.toThrow(
      "keepsake: not a memory pack or the pack is corrupt",
    );
  });

  test("round-trips an empty pack and is still a bundle", async () => {
    const bundle = await toBundle([]);
    const restored = await fromBundle(bundle);

    expect(restored).toEqual([]);
    expect(bundle).toContain("cells: 0");
    expect(isBundle(bundle)).toBe(true);
  });
});
