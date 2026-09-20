export interface VectorHit {
  index: number;
  score: number;
}

export function cosine(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalizeVector(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

export function rankVectors(
  vectors: number[][],
  queryVector: number[],
  limit = 10,
): VectorHit[] {
  const hits: VectorHit[] = [];
  for (let index = 0; index < vectors.length; index++) {
    const vector = vectors[index];
    if (vector === undefined) continue;
    const score = cosine(vector, queryVector);
    if (score > 0) hits.push({ index, score });
  }
  hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));
  return hits.slice(0, limit);
}

function minMax(values: number[]): number[] {
  if (values.length === 0) return [];
  let min = values[0] ?? 0;
  let max = values[0] ?? 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (max === min) return values.map(() => 0);
  return values.map((value) => (value - min) / (max - min));
}

export function hybridRank(
  lexical: number[],
  semantic: number[],
  options: { alpha?: number; limit?: number } = {},
): VectorHit[] {
  const alpha = options.alpha ?? 0.5;
  const limit = options.limit ?? 10;
  const length = Math.min(lexical.length, semantic.length);
  const lex = minMax(lexical.slice(0, length));
  const sem = minMax(semantic.slice(0, length));
  const hits: VectorHit[] = [];
  for (let index = 0; index < length; index++) {
    const score = alpha * (sem[index] ?? 0) + (1 - alpha) * (lex[index] ?? 0);
    if (score > 0) hits.push({ index, score });
  }
  hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));
  return hits.slice(0, limit);
}
