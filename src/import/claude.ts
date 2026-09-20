import type { CellInput, Role } from "../types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentParts(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
      parts.push(part.text);
    }
  }
  return parts.join("\n");
}

function messageText(message: Record<string, unknown>): string {
  if (typeof message.text === "string" && message.text.trim().length > 0) return message.text;
  return contentParts(message.content);
}

function toRole(sender: unknown): Role {
  if (sender === "human") return "user";
  if (sender === "assistant") return "assistant";
  return "system";
}

function looksLikeClaudeExport(conversations: unknown[]): boolean {
  return conversations.some(
    (conversation) => isRecord(conversation) && Array.isArray(conversation.chat_messages),
  );
}

export function parseClaudeExport(
  conversations: unknown,
  fallbackSource: string,
): CellInput[] | null {
  if (!Array.isArray(conversations)) return null;
  if (!looksLikeClaudeExport(conversations)) return null;

  const out: CellInput[] = [];
  for (const conversation of conversations) {
    if (!isRecord(conversation) || !Array.isArray(conversation.chat_messages)) continue;

    const source =
      typeof conversation.name === "string" && conversation.name.trim().length > 0
        ? conversation.name.trim()
        : fallbackSource;

    for (const message of conversation.chat_messages) {
      if (!isRecord(message)) continue;
      const text = messageText(message).trim();
      if (text.length === 0) continue;
      out.push({ text, source, role: toRole(message.sender) });
    }
  }
  return out;
}
