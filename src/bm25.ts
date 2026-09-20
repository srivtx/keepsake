import type { Cell } from "./types.ts";

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

export interface Bm25Options {
  limit?: number;
  k1?: number;
  b?: number;
}

export function bm25(
  cells: Cell[],
  query: string,
  options: Bm25Options = {},
): Array<{ cell: Cell; score: number }> {
  const limit = options.limit ?? 10;
  const k1 = options.k1 ?? 1.2;
  const b = options.b ?? 0.75;

  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || cells.length === 0) return [];

  const documents = cells.map((cell) => tokenize(cell.text));
  const totalLength = documents.reduce((sum, tokens) => sum + tokens.length, 0);
  const avgdl = totalLength / cells.length;

  const documentFrequency = new Map<string, number>();
  for (const tokens of documents) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const scored: Array<{ cell: Cell; score: number }> = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (!cell) continue;

    const tokens = documents[i] ?? [];
    const length = tokens.length;
    const norm = avgdl === 0 ? 0 : length / avgdl;
    const lengthFactor = 1 - b + b * norm;

    const counts = new Map<string, number>();
    for (const term of tokens) counts.set(term, (counts.get(term) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const frequency = counts.get(term) ?? 0;
      if (frequency === 0) continue;

      const docs = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (cells.length - docs + 0.5) / (docs + 0.5));
      score += (idf * (frequency * (k1 + 1))) / (frequency + k1 * lengthFactor);
    }

    if (score > 0) scored.push({ cell, score });
  }

  scored.sort((a, z) => {
    if (z.score !== a.score) return z.score - a.score;
    return a.cell.id < z.cell.id ? -1 : a.cell.id > z.cell.id ? 1 : 0;
  });

  return scored.slice(0, limit);
}
