import { describe, expect, test } from "bun:test";
import { normalizeImport } from "../src/import/index.ts";
import { detectSource } from "../src/import/detect.ts";

describe("normalizeImport", () => {
  test("splits plain text on blank lines and drops short paragraphs", () => {
    const text = "First paragraph long enough.\n\nSecond paragraph long enough.\n\ntiny";
    const inputs = normalizeImport(text, "notes");
    expect(inputs.length).toBe(2);
    expect(inputs[0]!.role).toBe("note");
    expect(inputs[0]!.source).toBe("notes");
    expect(inputs[1]!.text).toBe("Second paragraph long enough.");
  });

  test("parses a JSON array of role/content messages", () => {
    const json = JSON.stringify([
      { role: "user", content: "what is keepsake?" },
      { role: "assistant", content: "an encrypted memory format" },
      { role: "user", content: "   " },
    ]);
    const inputs = normalizeImport(json, "json");
    expect(inputs.map((input) => input.role)).toEqual(["user", "assistant"]);
    expect(inputs[0]!.text).toBe("what is keepsake?");
    expect(inputs[1]!.source).toBe("json");
  });

  test("parses an object with a messages array", () => {
    const json = JSON.stringify({
      messages: [
        { role: "system", content: "be helpful" },
        { role: "user", text: "hello there" },
      ],
    });
    const inputs = normalizeImport(json, "json");
    expect(inputs.length).toBe(2);
    expect(inputs[0]!.role).toBe("system");
    expect(inputs[1]!.role).toBe("user");
    expect(inputs[1]!.text).toBe("hello there");
  });

  test("parses ChatGPT mapping nodes in order", () => {
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
          n3: { message: null },
          n4: {
            message: {
              author: { role: "tool" },
              content: { parts: ["tool output here"] },
            },
          },
        },
      },
    ];

    const inputs = normalizeImport(JSON.stringify(conversations), "json");
    expect(inputs.length).toBe(3);
    expect(inputs.map((input) => input.source)).toEqual(["Project X", "Project X", "Project X"]);
    expect(inputs.map((input) => input.role)).toEqual(["user", "assistant", "system"]);
    expect(inputs[1]!.text).toBe("hi \nthere");
  });

  test("treats a plain array of strings as notes", () => {
    const inputs = normalizeImport(JSON.stringify(["first note here", "", "second note here"]), "json");
    expect(inputs.length).toBe(2);
    expect(inputs.every((input) => input.role === "note")).toBe(true);
    expect(inputs[0]!.text).toBe("first note here");
  });

  test("handles non-JSON garbage without throwing", () => {
    const inputs = normalizeImport("definitely not { json ] here", "notes");
    expect(inputs.length).toBe(1);
    expect(inputs[0]!.role).toBe("note");
  });

  test("returns an empty list for empty input", () => {
    expect(normalizeImport("   \n  ", "notes")).toEqual([]);
  });

  test("parses an array of mapping-value messages", () => {
    const json = JSON.stringify([
      { message: { role: "user", content: "question one" } },
      { message: { role: "assistant", content: "answer one" } },
    ]);
    const inputs = normalizeImport(json, "json");
    expect(inputs.map((input) => input.role)).toEqual(["user", "assistant"]);
    expect(inputs[1]!.text).toBe("answer one");
  });
});

describe("detectSource", () => {
  test("maps known extensions", () => {
    expect(detectSource("export.json")).toBe("json");
    expect(detectSource("notes.md")).toBe("notes");
    expect(detectSource("notes.markdown")).toBe("notes");
    expect(detectSource("notes.TXT")).toBe("notes");
    expect(detectSource("mystery.bin")).toBe("notes");
  });
});
