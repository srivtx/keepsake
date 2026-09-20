import { writeFileSync } from "node:fs";
import { bm25, decryptVault, encryptVault, makeCell, memoryStats, vaultSummary } from "./index.ts";
import type { VaultFile } from "./types.ts";

export interface McpOptions {
  vaultPath: string;
  passphrase: string;
}

const SERVER_INFO = { name: "keepsake", version: "0.1.0" };

const TOOLS = [
  {
    name: "memory_recall",
    description:
      "Search the keepsake vault and return the most relevant memories, with their source and timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for." },
        size: {
          type: "integer",
          description: "Maximum number of memories to return (default 5).",
          minimum: 1,
          maximum: 50,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_remember",
    description: "Append one memory to the keepsake vault and persist it.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The memory to store." },
        tags: { type: "array", items: { type: "string" }, description: "Optional tags." },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_stats",
    description: "Summarize the vault: cell count, sources, tags, and plaintext size in bytes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "memory_verify",
    description: "Verify the vault's integrity: every cell hash and the Merkle root.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function loadVault(path: string): Promise<VaultFile> {
  const text = await Bun.file(path).text();
  return JSON.parse(text) as VaultFile;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function callTool(name: string, args: Record<string, unknown>, options: McpOptions): Promise<string> {
  switch (name) {
    case "memory_recall": {
      const query = asString(args["query"]);
      if (query.trim().length === 0) return "memory_recall requires a non-empty query.";
      const rawSize = args["size"];
      const size = typeof rawSize === "number" && Number.isFinite(rawSize) ? Math.min(Math.max(1, Math.floor(rawSize)), 50) : 5;
      const cells = await decryptVault(await loadVault(options.vaultPath), options.passphrase);
      const hits = bm25(cells, query, { limit: size });
      if (hits.length === 0) return `No memories matched ${JSON.stringify(query)}.`;
      return hits
        .map(
          (hit, index) =>
            `${index + 1}. [${hit.cell.source} · ${hit.cell.createdAt}] ${hit.cell.text}`,
        )
        .join("\n\n");
    }
    case "memory_remember": {
      const text = asString(args["text"]);
      if (text.trim().length === 0) return "memory_remember requires non-empty text.";
      const tags = Array.isArray(args["tags"]) ? args["tags"].map(String) : [];
      const cells = await decryptVault(await loadVault(options.vaultPath), options.passphrase);
      const cell = await makeCell({ text, source: "mcp", role: "note", tags });
      const next = [...cells, cell];
      const vault = await encryptVault(next, options.passphrase, {
        iterations: (await loadVault(options.vaultPath)).kdf.iterations,
      });
      writeFileSync(options.vaultPath, `${JSON.stringify(vault, null, 2)}\n`);
      return `Stored memory ${cell.id} (vault now holds ${next.length} cells).`;
    }
    case "memory_stats": {
      const cells = await decryptVault(await loadVault(options.vaultPath), options.passphrase);
      const stats = memoryStats(cells);
      return [
        `cells: ${stats.count}`,
        `bytes: ${stats.bytes}`,
        `sources: ${Object.entries(stats.sources).map(([key, value]) => `${key} (${value})`).join(", ") || "none"}`,
        `tags: ${Object.entries(stats.tags).map(([key, value]) => `${key} (${value})`).join(", ") || "none"}`,
      ].join("\n");
    }
    case "memory_verify": {
      const file = await loadVault(options.vaultPath);
      const cells = await decryptVault(file, options.passphrase);
      const summary = vaultSummary(file);
      return `ok — ${cells.length} cell(s), Merkle root ${summary.merkle}`;
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function reply(id: unknown, body: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, ...body })}\n`);
}

async function handle(
  message: Record<string, unknown>,
  options: McpOptions,
): Promise<void> {
  const id = message["id"];
  const method = message["method"];

  if (typeof method !== "string") return;

  if (method === "initialize") {
    reply(id, {
      result: {
        protocolVersion: asString(message["params"] && (message["params"] as Record<string, unknown>)["protocolVersion"], "2024-11-05"),
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    });
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "ping") {
    reply(id, { result: {} });
    return;
  }
  if (method === "tools/list") {
    reply(id, { result: { tools: TOOLS } });
    return;
  }
  if (method === "tools/call") {
    const params = (message["params"] ?? {}) as Record<string, unknown>;
    const name = asString(params["name"]);
    const args = (params["arguments"] ?? {}) as Record<string, unknown>;
    try {
      const text = await callTool(name, args, options);
      reply(id, { result: { content: [{ type: "text", text }] } });
    } catch (err) {
      reply(id, {
        result: {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        },
      });
    }
    return;
  }

  if (id !== undefined) {
    reply(id, { error: { code: -32601, message: `method not found: ${method}` } });
  }
}

export async function serve(options: McpOptions): Promise<void> {
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (line.length === 0) continue;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof message === "object" && message !== null) {
        await handle(message as Record<string, unknown>, options);
      }
    }
  }
}
