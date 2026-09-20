import { describe, expect, test } from "bun:test";
import { decryptVault, encryptVault, vaultSummary } from "../src/vault.ts";
import { fromBase64, toBase64 } from "../src/bytes.ts";
import { makeCell } from "../src/cell.ts";
import type { VaultFile } from "../src/types.ts";

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

describe("vault", () => {
  test("round-trips cells and sorts by createdAt then id", async () => {
    const cells = await sample();
    const vault = await encryptVault(cells, "correct horse", { iterations: 1000 });
    const restored = await decryptVault(vault, "correct horse");

    expect(restored.map((cell) => cell.id)).toEqual(["a", "b"]);
    expect(restored[0]!.text).toBe("first memory");
    expect(restored[0]!.hash).toBe(cells[1]!.hash);
    expect(vault.cells).toBe(2);
    expect(vault.format).toBe("keepsake/v1");
  });

  test("throws on a wrong passphrase", async () => {
    const vault = await encryptVault(await sample(), "right", { iterations: 1000 });
    await expect(decryptVault(vault, "wrong")).rejects.toThrow(
      "keepsake: wrong passphrase or corrupt vault",
    );
  });

  test("throws on tampered ciphertext", async () => {
    const vault = await encryptVault(await sample(), "pw", { iterations: 1000 });
    const bytes = fromBase64(vault.ciphertext);
    bytes[0] = bytes[0]! ^ 0xff;
    const tampered: VaultFile = { ...vault, ciphertext: toBase64(bytes) };
    await expect(decryptVault(tampered, "pw")).rejects.toThrow(
      "keepsake: wrong passphrase or corrupt vault",
    );
  });

  test("throws on an unexpected format", async () => {
    const vault = await encryptVault(await sample(), "pw", { iterations: 1000 });
    const foreign = { ...vault, format: "keepsake/v0" } as unknown as VaultFile;
    await expect(decryptVault(foreign, "pw")).rejects.toThrow(
      "keepsake: wrong passphrase or corrupt vault",
    );
  });

  test("summarizes without decrypting", async () => {
    const vault = await encryptVault(await sample(), "pw", { iterations: 1000 });
    const summary = vaultSummary(vault);
    expect(summary.format).toBe("keepsake/v1");
    expect(summary.cells).toBe(2);
    expect(summary.iterations).toBe(1000);
    expect(summary.merkle.length).toBe(64);
    expect(typeof summary.createdAt).toBe("string");
  });
});
