import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const workdir = mkdtempSync(join(tmpdir(), "keepsake-mcp-"));
const vault = join(workdir, "memory.keepsake");
const notes = join(workdir, "notes.md");
const PASS = "mcp-test-passphrase";

async function session(lines: string[]): Promise<Array<Record<string, unknown>>> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", cli, "mcp", "--vault", vault],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, KEEPSAKE_PASSPHRASE: PASS } as Record<string, string>,
  });
  proc.stdin.write(`${lines.join("\n")}\n`);
  await proc.stdin.end();
  const text = await new Response(proc.stdout).text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeAll(() => {
  writeFileSync(notes, "The staging database is cart-staging and resets nightly.\n");
  Bun.spawnSync({
    cmd: ["bun", "run", cli, "import", notes, "--out", vault, "--iterations", "100000"],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, KEEPSAKE_PASSPHRASE: PASS } as Record<string, string>,
  });
});

describe("keepsake mcp server", () => {
  test("initializes and lists the four memory tools", async () => {
    const responses = await session([
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}',
      '{"jsonrpc":"2.0","method":"notifications/initialized"}',
      '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}',
    ]);
    const init = responses.find((r) => r["id"] === 1);
    expect((init?.["result"] as { serverInfo: { name: string } }).serverInfo.name).toBe("keepsake");
    const list = responses.find((r) => r["id"] === 2);
    const tools = (list?.["result"] as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(tools).toEqual(["memory_recall", "memory_remember", "memory_stats", "memory_verify"]);
  });

  test("recalls a stored memory", async () => {
    const responses = await session([
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}',
      '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"memory_recall","arguments":{"query":"staging database"}}}',
    ]);
    const call = responses.find((r) => r["id"] === 3);
    const content = (call?.["result"] as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(content).toContain("cart-staging");
  });

  test("reports stats", async () => {
    const responses = await session([
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}',
      '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"memory_stats","arguments":{}}}',
    ]);
    const call = responses.find((r) => r["id"] === 4);
    const content = (call?.["result"] as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(content).toContain("cells: 1");
  });

  test("answers unknown methods with an error", async () => {
    const responses = await session([
      '{"jsonrpc":"2.0","id":9,"method":"does/not/exist","params":{}}',
    ]);
    expect(responses.find((r) => r["id"] === 9)?.["error"]).toBeDefined();
  });
});
