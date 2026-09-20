import { describe, expect, test } from "bun:test";
import { canonicalJson } from "../src/canonical.ts";

describe("canonicalJson", () => {
  test("sorts object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ b: { d: 1, c: 2 }, a: [3, 1] })).toBe(
      '{"a":[3,1],"b":{"c":2,"d":1}}',
    );
  });

  test("keeps array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  test("is stable regardless of insertion order", () => {
    const a = canonicalJson({ x: 1, y: { b: 2, a: 3 }, z: [1, 2] });
    const b = canonicalJson({ z: [1, 2], y: { a: 3, b: 2 }, x: 1 });
    expect(a).toBe(b);
  });

  test("emits no whitespace", () => {
    expect(canonicalJson({ a: 1, b: [1, 2, 3] })).toBe('{"a":1,"b":[1,2,3]}');
  });

  test("handles null, booleans and strings", () => {
    expect(canonicalJson({ n: null, t: true, s: "hi" })).toBe('{"n":null,"s":"hi","t":true}');
  });
});
