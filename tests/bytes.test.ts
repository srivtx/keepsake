import { describe, expect, test } from "bun:test";
import { fromBase64, fromUtf8, hex, toBase64, utf8 } from "../src/bytes.ts";

describe("base64", () => {
  test("round-trips an empty buffer", () => {
    const bytes = new Uint8Array(0);
    expect(toBase64(bytes)).toBe("");
    expect(fromBase64("").length).toBe(0);
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual([]);
  });

  test("round-trips a single byte", () => {
    const bytes = new Uint8Array([0x00]);
    expect(toBase64(bytes)).toBe("AA==");
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual([0]);
  });

  test("round-trips more than 64KB", () => {
    const bytes = new Uint8Array(70_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const restored = fromBase64(toBase64(bytes));
    expect(restored.length).toBe(bytes.length);
    expect(restored).toEqual(bytes);
  });

  test("round-trips utf8 text", () => {
    const text = "keepsake — mémoire 🔐";
    expect(fromUtf8(utf8(text))).toBe(text);
  });

  test("formats hex with zero padding", () => {
    expect(hex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  });
});
