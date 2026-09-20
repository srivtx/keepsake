import { describe, expect, test } from "bun:test";
import { normalizeImport } from "../src/import/index.ts";
import { parseClaudeExport } from "../src/import/claude.ts";
import { parseJsonl } from "../src/import/jsonl.ts";

describe("parseClaudeExport", () => {
  test("extracts messages that use a text field", () => {
    const conversations = [
      {
        name: "Roadmap",
        chat_messages: [
          { sender: "human", text: "when is the release?" },
          { sender: "assistant", text: "next quarter" },
        ],
      },
    ];
    const inputs = parseClaudeExport(conversations, "claude");
    expect(inputs).not.toBeNull();
    expect(inputs!.map((input) => input.role)).toEqual(["user", "assistant"]);
    expect(inputs!.map((input) => input.text)).toEqual(["when is the release?", "next quarter"]);
    expect(inputs!.every((input) => input.source === "Roadmap")).toBe(true);
  });

  test("joins content parts whose type is text", () => {
    const conversations = [
      {
        name: "Notes",
        chat_messages: [
          {
            sender: "human",
            content: [
              { type: "text", text: "first part" },
              { type: "tool_use", text: "ignored" },
              { type: "text", text: "second part" },
            ],
          },
          { sender: "assistant", content: [{ type: "text", text: "reply" }] },
        ],
      },
    ];
    const inputs = parseClaudeExport(conversations, "claude");
    expect(inputs).not.toBeNull();
    expect(inputs!.length).toBe(2);
    expect(inputs![0]!.text).toBe("first part\nsecond part");
    expect(inputs![1]!.text).toBe("reply");
  });

  test("falls back to the given source when a conversation has no name", () => {
    const conversations = [{ chat_messages: [{ sender: "human", text: "no name here" }] }];
    const inputs = parseClaudeExport(conversations, "claude-export");
    expect(inputs).not.toBeNull();
    expect(inputs![0]!.source).toBe("claude-export");
  });

  test("maps unknown senders to the system role", () => {
    const conversations = [
      {
        name: "System",
        chat_messages: [
          { sender: "human", text: "hi there" },
          { sender: "assistant", text: "hello" },
          { sender: "system", text: "policy reminder" },
        ],
      },
    ];
    const inputs = parseClaudeExport(conversations, "claude");
    expect(inputs!.map((input) => input.role)).toEqual(["user", "assistant", "system"]);
  });

  test("skips empty messages", () => {
    const conversations = [
      {
        name: "Mixed",
        chat_messages: [
          { sender: "human", text: "   " },
          { sender: "assistant", content: [{ type: "text", text: "" }] },
          { sender: "human", text: "real message" },
        ],
      },
    ];
    const inputs = parseClaudeExport(conversations, "claude");
    expect(inputs!.length).toBe(1);
    expect(inputs![0]!.text).toBe("real message");
  });

  test("returns null for data that is not a Claude export", () => {
    expect(parseClaudeExport({ messages: [] }, "claude")).toBeNull();
    expect(parseClaudeExport([{ role: "user", content: "hi" }], "claude")).toBeNull();
    expect(parseClaudeExport("nope", "claude")).toBeNull();
    expect(parseClaudeExport([], "claude")).toBeNull();
  });
});

describe("parseJsonl", () => {
  test("parses role/content lines", () => {
    const text = [
      JSON.stringify({ role: "user", content: "line one" }),
      JSON.stringify({ role: "assistant", content: "line two" }),
    ].join("\n");
    const inputs = parseJsonl(text, "jsonl");
    expect(inputs).not.toBeNull();
    expect(inputs!.map((input) => input.role)).toEqual(["user", "assistant"]);
    expect(inputs!.map((input) => input.text)).toEqual(["line one", "line two"]);
    expect(inputs!.every((input) => input.source === "jsonl")).toBe(true);
  });

  test("parses sender lines and maps human to user", () => {
    const text = [
      JSON.stringify({ sender: "human", text: "question" }),
      JSON.stringify({ sender: "assistant", text: "answer" }),
    ].join("\n");
    const inputs = parseJsonl(text, "jsonl");
    expect(inputs).not.toBeNull();
    expect(inputs!.map((input) => input.role)).toEqual(["user", "assistant"]);
    expect(inputs!.map((input) => input.text)).toEqual(["question", "answer"]);
  });

  test("returns null when a line is not JSON", () => {
    const text = ["hello world", JSON.stringify({ role: "user", content: "hi" })].join("\n");
    expect(parseJsonl(text, "jsonl")).toBeNull();
  });

  test("returns null for a single-line JSON document without a message shape", () => {
    expect(parseJsonl(JSON.stringify({ title: "x", notes: "y" }), "jsonl")).toBeNull();
    expect(parseJsonl(JSON.stringify(["a", "b"]), "jsonl")).toBeNull();
  });
});

describe("normalizeImport extras", () => {
  test("routes a Claude export through normalizeImport", () => {
    const conversations = [
      {
        name: "Trip",
        chat_messages: [
          { sender: "human", text: "where should we go?" },
          { sender: "assistant", content: [{ type: "text", text: "Kyoto" }] },
        ],
      },
    ];
    const inputs = normalizeImport(JSON.stringify(conversations), "json");
    expect(inputs.length).toBe(2);
    expect(inputs.map((input) => input.role)).toEqual(["user", "assistant"]);
    expect(inputs[0]!.source).toBe("Trip");
  });

  test("falls back to paragraphs for non-JSONL multi-line text", () => {
    const text =
      "First paragraph long enough.\nSecond line same paragraph.\n\nSecond paragraph long enough.";
    const inputs = normalizeImport(text, "notes");
    expect(inputs.length).toBe(2);
    expect(inputs[0]!.text).toBe("First paragraph long enough.\nSecond line same paragraph.");
    expect(inputs.every((input) => input.role === "note")).toBe(true);
  });

  test("does not treat a single-line JSON document as JSONL", () => {
    const inputs = normalizeImport(JSON.stringify({ title: "doc", body: "text" }), "json");
    expect(inputs).toEqual([]);
  });

  test("returns an empty list for empty and whitespace input", () => {
    expect(normalizeImport("", "notes")).toEqual([]);
    expect(normalizeImport("   \n\t  ", "notes")).toEqual([]);
  });

  test("keeps the existing ChatGPT mapping behavior working", () => {
    const conversations = [
      {
        title: "Project X",
        mapping: {
          n1: {
            message: {
              author: { role: "user" },
              content: { content_type: "text", parts: ["hello there friend"] },
            },
          },
          n2: {
            message: {
              author: { role: "assistant" },
              content: { content_type: "text", parts: ["hi ", "there"] },
            },
          },
        },
      },
    ];
    const inputs = normalizeImport(JSON.stringify(conversations), "json");
    expect(inputs.map((input) => input.source)).toEqual(["Project X", "Project X"]);
    expect(inputs.map((input) => input.role)).toEqual(["user", "assistant"]);
    expect(inputs[1]!.text).toBe("hi \nthere");
  });
});
