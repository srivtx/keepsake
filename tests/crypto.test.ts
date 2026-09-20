import { describe, expect, test } from "bun:test";
import { pbkdf2Key, sha256Hex } from "../src/crypto.ts";
import { utf8 } from "../src/bytes.ts";

describe("crypto", () => {
  test("sha256 of 'abc' matches the well-known digest", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("hashes strings and bytes identically", async () => {
    expect(await sha256Hex("abc")).toBe(await sha256Hex(utf8("abc")));
  });

  test("pbkdf2 derives a non-extractable AES-GCM key", async () => {
    const key = await pbkdf2Key("passphrase", new Uint8Array(16), 1000);
    expect(key.type).toBe("secret");
    expect(key.usages.sort()).toEqual(["decrypt", "encrypt"]);
    expect(key.algorithm.name).toBe("AES-GCM");
  });
});
