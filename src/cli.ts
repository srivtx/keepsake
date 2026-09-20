#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bm25,
  decryptVault,
  detectSource,
  encryptVault,
  makeCell,
  memoryStats,
  normalizeImport,
  vaultSummary,
} from "./index.ts";
import { serve } from "./mcp.ts";
import type { Cell, VaultFile } from "./types.ts";

export type Command = "import" | "export" | "search" | "verify" | "stats" | "mcp";

export interface Options {
  command: Command | null;
  files: string[];
  query: string;
  vault: string | null;
  out: string;
  source: string | null;
  tags: string[];
  iterations: number | null;
  json: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

const COMMANDS: Command[] = ["import", "export", "search", "verify", "stats", "mcp"];

function readVersion(): string {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = readVersion();
const PASS_ENV = "KEEPSAKE_PASSPHRASE";

const USAGE = `keepsake - own your AI memory

Import a chat export or your notes, search it locally, seal it into an
encrypted, portable .keepsake vault, and let any agent recall it over MCP.
Nothing is uploaded; the vault is a file you own.

Usage:
  keepsake import <file...> [--out <vault>] [--source <name>] [--tags a,b]
  keepsake search <query>   --vault <vault> [--json] [--quiet]
  keepsake export           --vault <vault> [--json]
  keepsake verify           --vault <vault>
  keepsake stats            --vault <vault> [--json]
  keepsake mcp              --vault <vault>

Options:
  --vault <path>        The .keepsake vault file
  --out <path>          Output vault for import (default: keepsake.keepsake)
  --source <name>       Source label applied to every imported cell
  --tags <a,b,c>        Tags applied to every imported cell
  --iterations <n>      PBKDF2 iterations for import (default: 250000)
  --json                Print machine-readable JSON
  --quiet, -q           Print a single summary line
  -h, --help            Show this help
  -v, --version         Print the version
  --                    End of options; treat the rest as file arguments

Passphrase:
  Read from the ${PASS_ENV} environment variable, never from the command line,
  so it does not land in your shell history or the process table.

Exit codes:
  0  ok
  1  a negative result (search found nothing, or verification failed)
  2  invalid usage, or input that could not be parsed
  3  I/O error (a file could not be read or written)
`;

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function readNumber(value: string | undefined, flag: string): number {
  if (value === undefined || value.length === 0) throw new Error(`${flag} requires a number`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    throw new Error(`${flag} requires a number of at least 1000`);
  }
  return Math.floor(parsed);
}

export function parseArgs(argv: string[]): Options {
  const opts: Options = {
    command: null,
    files: [],
    query: "",
    vault: null,
    out: "keepsake.keepsake",
    source: null,
    tags: [],
    iterations: null,
    json: false,
    quiet: false,
    help: false,
    version: false,
  };
  let endOfOptions = false;

  const value = (arg: string, flag: string, next: string | undefined): string => {
    const inline = arg.startsWith(`${flag}=`);
    const v = inline ? arg.slice(flag.length + 1) : next;
    if (v === undefined || v.length === 0 || (!inline && v.startsWith("-"))) {
      throw new Error(`${flag} requires a value`);
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (endOfOptions) {
      opts.files.push(arg);
      continue;
    }
    if (arg === "--") {
      endOfOptions = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--quiet" || arg === "-q") {
      opts.quiet = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--version" || arg === "-v") {
      opts.version = true;
    } else if (arg === "--vault" || arg.startsWith("--vault=")) {
      opts.vault = value(arg, "--vault", argv[++i]);
    } else if (arg === "--out" || arg.startsWith("--out=")) {
      opts.out = value(arg, "--out", argv[++i]);
    } else if (arg === "--source" || arg.startsWith("--source=")) {
      opts.source = value(arg, "--source", argv[++i]);
    } else if (arg === "--tags" || arg.startsWith("--tags=")) {
      opts.tags = splitTags(value(arg, "--tags", argv[++i]));
    } else if (arg === "--iterations" || arg.startsWith("--iterations=")) {
      opts.iterations = readNumber(value(arg, "--iterations", argv[++i]), "--iterations");
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else if (opts.command === null && (COMMANDS as string[]).includes(arg)) {
      opts.command = arg as Command;
    } else if (opts.command === "search" && opts.query.length === 0) {
      opts.query = arg;
    } else {
      opts.files.push(arg);
    }
  }
  return opts;
}

function passphrase(): string {
  const value = process.env[PASS_ENV];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `no passphrase: set ${PASS_ENV} in the environment (keepsake never takes it as an argument)`,
    );
  }
  return value;
}

async function readJson(path: string): Promise<VaultFile> {
  let text: string;
  try {
    text = await Bun.file(path).text();
  } catch (err) {
    throw new Error(`cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return JSON.parse(text) as VaultFile;
  } catch {
    throw new Error(`${path} is not valid JSON`);
  }
}

function requireVault(opts: Options): string {
  if (opts.vault === null) throw new Error("--vault is required for this command");
  return opts.vault;
}

function printCell(cell: Cell, index?: number): string {
  const prefix = index === undefined ? "" : `${index + 1}. `;
  const tags = cell.tags.length > 0 ? `  #${cell.tags.join(" #")}` : "";
  return `${prefix}[${cell.source} · ${cell.role} · ${cell.createdAt}]${tags}\n${cell.text}`;
}

export async function run(argv: string[]): Promise<number> {
  let opts: Options;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`keepsake: ${err instanceof Error ? err.message : String(err)}`);
    console.error(USAGE);
    return 2;
  }

  if (opts.version) {
    console.log(VERSION);
    return 0;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (opts.command === null) {
    console.log(USAGE);
    return 2;
  }

  try {
    switch (opts.command) {
      case "import": {
        if (opts.files.length === 0) throw new Error("import needs at least one file");
        const secret = passphrase();
        const cells: Cell[] = [];
        for (const file of opts.files) {
          let text: string;
          try {
            text = await Bun.file(file).text();
          } catch (err) {
            console.error(
              `keepsake: cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`,
            );
            return 3;
          }
          const source = opts.source ?? detectSource(basename(file));
          const inputs = normalizeImport(text, source);
          for (const input of inputs) {
            const cell = await makeCell({ ...input, tags: [...input.tags ?? [], ...opts.tags] });
            cells.push(cell);
          }
        }
        if (cells.length === 0) {
          console.error("keepsake: nothing to import");
          return 1;
        }
        const vault = await encryptVault(
          cells,
          secret,
          opts.iterations === null ? {} : { iterations: opts.iterations },
        );
        try {
          await Bun.write(opts.out, `${JSON.stringify(vault, null, 2)}\n`);
        } catch (err) {
          console.error(
            `keepsake: cannot write ${opts.out}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return 3;
        }
        if (opts.json) {
          console.log(JSON.stringify({ out: opts.out, cells: cells.length, merkle: vault.merkle }, null, 2));
        } else if (opts.quiet) {
          console.log(`${opts.out}: ${cells.length} cell(s), merkle ${vault.merkle}`);
        } else {
          console.log(`sealed ${cells.length} cell(s) into ${opts.out}`);
          console.log(`merkle  ${vault.merkle}`);
        }
        return 0;
      }

      case "search": {
        if (opts.query.length === 0) throw new Error("search needs a query");
        const cells = await decryptVault(await readJson(requireVault(opts)), passphrase());
        const hits = bm25(cells, opts.query, { limit: 10 });
        if (opts.json) {
          console.log(JSON.stringify(hits.map((hit) => ({ score: hit.score, cell: hit.cell })), null, 2));
        } else if (hits.length === 0) {
          if (!opts.quiet) console.log(`no memories matched ${JSON.stringify(opts.query)}`);
        } else {
          console.log(hits.map((hit, index) => printCell(hit.cell, index)).join("\n\n"));
        }
        return hits.length === 0 ? 1 : 0;
      }

      case "export": {
        const cells = await decryptVault(await readJson(requireVault(opts)), passphrase());
        if (opts.json) {
          console.log(JSON.stringify(cells, null, 2));
        } else {
          console.log(cells.map((cell, index) => printCell(cell, index)).join("\n\n"));
        }
        return 0;
      }

      case "verify": {
        const file = await readJson(requireVault(opts));
        const summary = vaultSummary(file);
        const cells = await decryptVault(file, passphrase());
        if (opts.json) {
          console.log(JSON.stringify({ ok: true, cells: cells.length, merkle: summary.merkle }, null, 2));
        } else {
          console.log(`ok  ${cells.length} cell(s)  merkle ${summary.merkle}`);
        }
        return 0;
      }

      case "stats": {
        const cells = await decryptVault(await readJson(requireVault(opts)), passphrase());
        const stats = memoryStats(cells);
        if (opts.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log(`cells   ${stats.count}`);
          console.log(`bytes   ${stats.bytes}`);
          console.log(`sources ${Object.entries(stats.sources).map(([k, v]) => `${k} (${v})`).join(", ") || "none"}`);
          console.log(`tags    ${Object.entries(stats.tags).map(([k, v]) => `${k} (${v})`).join(", ") || "none"}`);
        }
        return 0;
      }

      case "mcp": {
        const vaultPath = requireVault(opts);
        await serve({ vaultPath, passphrase: passphrase() });
        return 0;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const line = message.startsWith("keepsake:") ? message : `keepsake: ${message}`;
    console.error(line);
    if (/wrong passphrase|corrupt vault/.test(message)) return 1;
    if (
      /(needs at least one file|needs a query|--vault is required|no passphrase|is not valid JSON|unknown option|requires a value|requires a number)/.test(
        message,
      )
    ) {
      return 2;
    }
    return 3;
  }
}

if (import.meta.main) {
  const code = await run(process.argv.slice(2));
  process.exit(code);
}
