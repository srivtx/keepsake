import { bm25 } from "./bm25.ts";
import type { Cell } from "./types.ts";

export interface ContextPackOptions {
  budgetTokens?: number;
  maxCells?: number;
}

export interface ContextPack {
  task: string;
  tokens: number;
  cells: Cell[];
  text: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function byRecent(a: Cell, z: Cell): number {
  if (a.createdAt !== z.createdAt) return a.createdAt < z.createdAt ? 1 : -1;
  return a.id < z.id ? -1 : a.id > z.id ? 1 : 0;
}

export function contextPack(
  cells: Cell[],
  task: string,
  options: ContextPackOptions = {},
): ContextPack {
  const budgetTokens = options.budgetTokens ?? 1500;
  const maxCells = options.maxCells ?? 50;

  const ranked =
    task.trim().length === 0
      ? []
      : bm25(cells, task, { limit: maxCells }).map((match) => match.cell);

  const ordered =
    ranked.length > 0
      ? ranked
      : [...cells].sort(byRecent).slice(0, maxCells);

  const header = `# Memory context for: ${task}`;
  let tokens = estimateTokens(header);
  const included: Cell[] = [];

  for (const cell of ordered) {
    const cellTokens = estimateTokens(cell.text);
    if (included.length > 0 && tokens + cellTokens > budgetTokens) break;
    included.push(cell);
    tokens += cellTokens;
  }

  const lines = [
    header,
    ...included.map((cell) => `- [${cell.source} · ${cell.createdAt}] ${cell.text}`),
    `<!-- keepsake/v1 · ${included.length} cells · ~${tokens} tokens -->`,
  ];

  return { task, tokens, cells: included, text: lines.join("\n") };
}
