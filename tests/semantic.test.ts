import { describe, expect, test } from "bun:test";
import { cosine, hybridRank, normalizeVector, rankVectors } from "../src/index.ts";

describe("cosine", () => {
  test("identical vectors score 1", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  test("orthogonal vectors score 0", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  test("opposite vectors score -1", () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  test("scale does not matter", () => {
    expect(cosine([1, 1], [10, 10])).toBeCloseTo(1, 10);
  });

  test("a zero vector scores 0", () => {
    expect(cosine([0, 0], [1, 2])).toBe(0);
  });

  test("mismatched lengths score 0", () => {
    expect(cosine([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe("normalizeVector", () => {
  test("produces a unit vector", () => {
    const unit = normalizeVector([3, 4]);
    expect(Math.hypot(unit[0] ?? 0, unit[1] ?? 0)).toBeCloseTo(1, 10);
  });

  test("a zero vector normalizes to zeros", () => {
    expect(normalizeVector([0, 0])).toEqual([0, 0]);
  });
});

describe("rankVectors", () => {
  test("orders by similarity and respects the limit", () => {
    const vectors = [
      [1, 0],
      [0.9, 0.1],
      [0, 1],
    ];
    const hits = rankVectors(vectors, [1, 0], 2);
    expect(hits.map((hit) => hit.index)).toEqual([0, 1]);
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 0);
  });

  test("drops non-positive scores", () => {
    expect(rankVectors([[0, 1]], [1, 0]).length).toBe(0);
  });
});

describe("hybridRank", () => {
  test("blends lexical and semantic signals", () => {
    const lexical = [0, 1, 0];
    const semantic = [1, 0, 0];
    const semanticFirst = hybridRank(lexical, semantic, { alpha: 0.9 });
    expect(semanticFirst[0]?.index).toBe(0);
    const lexicalFirst = hybridRank(lexical, semantic, { alpha: 0.1 });
    expect(lexicalFirst[0]?.index).toBe(1);
  });

  test("returns an empty list when everything is zero", () => {
    expect(hybridRank([0, 0], [0, 0]).length).toBe(0);
  });

  test("respects the limit", () => {
    expect(hybridRank([1, 2, 3], [3, 2, 1], { limit: 2 }).length).toBe(2);
  });
});
