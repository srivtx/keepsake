import { contentText, normalizeRole } from "./chatgpt.ts";
import type { CellInput, Role } from "../types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasMessageShape(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  const hasRole = typeof entry.role === "string" || typeof entry.sender === "string";
  const hasText = typeof entry.content === "string" || typeof entry.text === "string";
  return hasRole && hasText;
}

function toRole(value: unknown): Role {
  if (value === "human") return "user";
  return normalizeRole(value);
}

function lineInput(entry: unknown, source: string): CellInput | null {
  if (!isRecord(entry)) return null;

  const roleValue = entry.role !== undefined ? entry.role : entry.sender;
  const raw = entry.content !== undefined ? entry.content : entry.text;
  const text = contentText(raw).trim();
  if (text.length === 0) return null;

  return { text, source, role: toRole(roleValue) };
}

export function parseJsonl(text: string, source: string): CellInput[] | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return null;

  const parsed: unknown[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      return null;
    }
  }

  if (!parsed.some(hasMessageShape)) return null;

  const out: CellInput[] = [];
  for (const entry of parsed) {
    const input = lineInput(entry, source);
    if (input) out.push(input);
  }
  return out;
}
