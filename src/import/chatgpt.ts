import type { CellInput, Role } from "../types.ts";

export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((part): part is string => typeof part === "string").join("\n");
  }
  if (content && typeof content === "object") {
    const record = content as { parts?: unknown; text?: unknown };
    if (Array.isArray(record.parts)) {
      return record.parts.filter((part): part is string => typeof part === "string").join("\n");
    }
    if (typeof record.text === "string") return record.text;
  }
  return "";
}

export function normalizeRole(role: unknown): Role {
  if (role === "user" || role === "assistant" || role === "system") return role;
  if (role === "tool") return "system";
  return "note";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractMessage(entry: unknown, source: string): CellInput | null {
  if (!isRecord(entry)) return null;

  const message = isRecord(entry.message) ? entry.message : entry;
  let role: unknown = message.role;
  if (role === undefined && isRecord(message.author)) role = message.author.role;

  const raw = message.content !== undefined ? message.content : message.text;
  const text = contentText(raw).trim();
  if (text.length === 0) return null;

  return { text, source, role: normalizeRole(role) };
}

export function isConversation(value: unknown): boolean {
  return isRecord(value) && isRecord(value.mapping);
}

export function parseConversation(conversation: unknown, fallbackSource: string): CellInput[] {
  if (!isRecord(conversation) || !isRecord(conversation.mapping)) return [];

  const title =
    typeof conversation.title === "string" && conversation.title.trim().length > 0
      ? conversation.title.trim()
      : fallbackSource;

  const out: CellInput[] = [];
  for (const node of Object.values(conversation.mapping)) {
    const input = extractMessage(node, title);
    if (input) out.push(input);
  }
  return out;
}
