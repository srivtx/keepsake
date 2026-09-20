import { extractMessage, isConversation, parseConversation } from "./chatgpt.ts";
import type { CellInput, Role } from "../types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageArray(list: unknown[], source: string): CellInput[] {
  const out: CellInput[] = [];
  for (const entry of list) {
    const input = extractMessage(entry, source);
    if (input) out.push(input);
  }
  return out;
}

function fromArray(value: unknown[], source: string): CellInput[] {
  if (value.length === 0) return [];

  if (value.every((item) => typeof item === "string")) {
    return value
      .map((item) => (item as string).trim())
      .filter((item) => item.length > 0)
      .map((item) => ({ text: item, source, role: "note" as Role }));
  }

  const messages = messageArray(value, source);
  if (messages.length > 0) return messages;

  const conversations = value.filter(isConversation);
  if (conversations.length > 0) {
    const out: CellInput[] = [];
    for (const conversation of conversations) {
      out.push(...parseConversation(conversation, source));
    }
    if (out.length > 0) return out;
  }

  return [];
}

function fromValue(value: unknown, source: string): CellInput[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length > 0 ? [{ text, source, role: "note" }] : [];
  }

  if (Array.isArray(value)) return fromArray(value, source);

  if (isRecord(value)) {
    if (Array.isArray(value.messages)) {
      const messages = messageArray(value.messages, source);
      if (messages.length > 0) return messages;
    }

    if (isConversation(value)) return parseConversation(value, source);

    const single = extractMessage(value, source);
    if (single) return [single];
  }

  return [];
}

function fromParagraphs(text: string, source: string): CellInput[] {
  const paragraphs = text
    .split(/\r?\n[ \t]*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 8);

  if (paragraphs.length > 0) {
    return paragraphs.map((paragraph) => ({ text: paragraph, source, role: "note" as Role }));
  }

  const whole = text.trim();
  return whole.length > 0 ? [{ text: whole, source, role: "note" }] : [];
}

export function normalizeImport(text: string, source: string): CellInput[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return fromValue(parsed, source);
  } catch {
    return fromParagraphs(trimmed, source);
  }
}
