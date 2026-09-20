#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bm25,
  contextPack,
  decryptVault,
  detectSource,
  diffVaults,
  encryptVault,
  forgetCells,
  makeCell,
  memoryStats,
  mergeCells,
  normalizeImport,
  rotateVault,
  vaultSummary,
} from "./index.ts";
import { serve } from "./mcp.ts";
import type { Cell, VaultFile } from "./types.ts";

export type Command =
  | "import"
  | "export"
  | "search"
  | "verify"
  | "stats"
  | "merge"
  | "forget"
  | "rotate"
  | "diff"
  | "context"
  | "mcp";

export interface Options {
  command: Command | null;
  files: string[];
  query: string;
  vault: string | null;
  out: string | null;
  source: string | null;
  tags: string[];
  ids: string[];
  tag: string | null;
  budget: number | null;
  iterations: number | null;
  json: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

const COMMANDS: Command[] = [
  "import",
  "export",
  "search",
  "verify",
  "stats",
  "merge",
  "forget",
  "rotate",
  "diff",
  "context",
  "mcp",
];

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
const PASS_ENV_B = "KEEPSAKE_PASSPHRASE_B";
const NEW_PASS_ENV = "KEEPSAKE_NEW_PASSPHRASE";

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
  keepsake context <task>   --vault <vault> [--budget <tokens>] [--json]
  keepsake forget           --vault <vault> [--id <uuid>]... [--tag <t>] [--source <s>] [--query <q>] [--out <vault>]
  keepsake merge <a> <b>    --out <vault>
  keepsake diff <a> <b>
  keepsake rotate           --vault <vault>
  keepsake mcp              --vault <vault>

Options:
  --vault <path>        The .keepsake vault file
  --out <path>          Output vault for import/merge/forget (default: keepsake.keepsake)
  --source <name>       Source label for import, or the source to forget
  --tags <a,b,c>        Tags applied to every imported cell
  --id <uuid>           Forget one cell id (repeatable)
  --tag <t>             Forget every cell carrying this tag
  --budget <tokens>     Token budget for context (default: 1500)
  --iterations <n>      PBKDF2 iterations for import/rotate (default: 250000)
  --json                Print machine-readable JSON
  --quiet, -q           Print a single summary line
  -h, --help            Show this help
  -v, --version         Print the version
  --                    End of options; treat the rest as file arguments

Passphrase:
  Read from the ${PASS_ENV} environment variable, never from the command line,
  so it does not land in your shell history or the process table. Commands that
  touch a second vault read ${PASS_ENV_B}; rotate reads the new passphrase from
  ${NEW_PASS_ENV}.

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
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${flag} requires a positive number`);
  }
  return Math.floor(parsed);
}

export function parseArgs(argv: string[]): Options {
  const opts: Options = {
    command: null,
    files: [],
    query: "",
    vault: null,
    out: null,
    source: null,
    tags: [],
    ids: [],
    tag: null,
    budget: null,
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
    } else if (arg === "--query" || arg.startsWith("--query=")) {
      opts.query = value(arg, "--query", argv[++i]);
    } else if (arg === "--id" || arg.startsWith("--id=")) {
      opts.ids.push(value(arg, "--id", argv[++i]));
    } else if (arg === "--tag" || arg.startsWith("--tag=")) {
      opts.tag = value(arg, "--tag", argv[++i]);
    } else if (arg === "--budget" || arg.startsWith("--budget=")) {
      opts.budget = readNumber(value(arg, "--budget", argv[++i]), "--budget");
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else if (opts.command === null && (COMMANDS as string[]).includes(arg)) {
      opts.command = arg as Command;
    } else if ((opts.command === "search" || opts.command === "context") && opts.query.length === 0) {
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

async function writeVault(path: string, vault: VaultFile): Promise<void> {
  try {
    await Bun.write(path, `${JSON.stringify(vault, null, 2)}\n`);
  } catch (err) {
    throw new Error(`cannot write ${path}: ${err instanceof Error ? err.message : String(err)}`);
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
        const out = opts.out ?? "keepsake.keepsake";
        const vault = await encryptVault(
          cells,
          secret,
          opts.iterations === null ? {} : { iterations: opts.iterations },
        );
        await writeVault(out, vault);
        if (opts.json) {
          console.log(JSON.stringify({ out, cells: cells.length, merkle: vault.merkle }, null, 2));
        } else if (opts.quiet) {
          console.log(`${out}: ${cells.length} cell(s), merkle ${vault.merkle}`);
        } else {
          console.log(`sealed ${cells.length} cell(s) into ${out}`);
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

      case "context": {
        if (opts.query.trim().length === 0) throw new Error("context needs a task");
        const cells = await decryptVault(await readJson(requireVault(opts)), passphrase());
        const pack = contextPack(cells, opts.query, { budgetTokens: opts.budget ?? 1500 });
        if (opts.json) {
          console.log(JSON.stringify(pack, null, 2));
        } else if (pack.cells.length === 0) {
          console.log(`no memories for ${JSON.stringify(opts.query)}`);
        } else {
          console.log(pack.text);
        }
        return pack.cells.length === 0 ? 1 : 0;
      }

      case "forget": {
        const vaultPath = requireVault(opts);
        const secret = passphrase();
        const cells = await decryptVault(await readJson(vaultPath), secret);
        const { kept, removed } = forgetCells(cells, {
          ...(opts.ids.length > 0 ? { ids: opts.ids } : {}),
          ...(opts.query.length > 0 ? { query: opts.query } : {}),
          ...(opts.source !== null ? { source: opts.source } : {}),
          ...(opts.tag !== null ? { tag: opts.tag } : {}),
        });
        if (removed.length === 0) {
          console.error("keepsake: no memories matched");
          return 1;
        }
        const vault = await encryptVault(
          kept,
          secret,
          opts.iterations === null ? {} : { iterations: opts.iterations },
        );
        const out = opts.out ?? vaultPath;
        await writeVault(out, vault);
        if (opts.json) {
          console.log(JSON.stringify({ out, removed: removed.length, cells: kept.length }, null, 2));
        } else {
          console.log(`forgot ${removed.length} cell(s); ${kept.length} remain in ${out}`);
        }
        return 0;
      }

      case "merge": {
        if (opts.files.length < 2) throw new Error("merge needs two vault files");
        if (opts.out === null) throw new Error("merge requires --out");
        const secretA = passphrase();
        const secretB = process.env[PASS_ENV_B] ?? secretA;
        const a = await decryptVault(await readJson(opts.files[0]!), secretA);
        const b = await decryptVault(await readJson(opts.files[1]!), secretB);
        const merged = mergeCells(a, b);
        const vault = await encryptVault(
          merged,
          secretA,
          opts.iterations === null ? {} : { iterations: opts.iterations },
        );
        await writeVault(opts.out, vault);
        if (opts.json) {
          console.log(JSON.stringify({ out: opts.out, cells: merged.length }, null, 2));
        } else {
          console.log(`merged ${a.length} + ${b.length} -> ${merged.length} cell(s) in ${opts.out}`);
        }
        return 0;
      }

      case "diff": {
        if (opts.files.length < 2) throw new Error("diff needs two vault files");
        const secretA = passphrase();
        const secretB = process.env[PASS_ENV_B] ?? secretA;
        const result = await diffVaults(
          await readJson(opts.files[0]!),
          await readJson(opts.files[1]!),
          secretA,
          secretB,
        );
        if (opts.json) {
          console.log(
            JSON.stringify(
              { added: result.added.length, removed: result.removed.length, common: result.common },
              null,
              2,
            ),
          );
        } else {
          console.log(`added   ${result.added.length}`);
          console.log(`removed ${result.removed.length}`);
          console.log(`common  ${result.common}`);
          for (const cell of result.added) console.log(`+ ${cell.id}  ${cell.source}  ${cell.text.slice(0, 80)}`);
          for (const cell of result.removed) console.log(`- ${cell.id}  ${cell.source}  ${cell.text.slice(0, 80)}`);
        }
        return result.added.length === 0 && result.removed.length === 0 ? 0 : 1;
      }

      case "rotate": {
        const vaultPath = requireVault(opts);
        const newSecret = process.env[NEW_PASS_ENV];
        if (newSecret === undefined || newSecret.length === 0) {
          throw new Error(`rotate needs ${NEW_PASS_ENV} set to the new passphrase`);
        }
        const rotated = await rotateVault(
          await readJson(vaultPath),
          passphrase(),
          newSecret,
          opts.iterations === null ? {} : { iterations: opts.iterations },
        );
        await writeVault(vaultPath, rotated);
        if (opts.json) {
          console.log(JSON.stringify({ vault: vaultPath, cells: rotated.cells, merkle: rotated.merkle }, null, 2));
        } else {
          console.log(`rotated ${rotated.cells} cell(s) in ${vaultPath}`);
        }
        return 0;
      }

      case "mcp": {
        const vaultPath = requireVault(opts);
        await serve({ vaultPath, passphrase: passphrase(), version: VERSION });
        return 0;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const line = message.startsWith("keepsake:") ? message : `keepsake: ${message}`;
    console.error(line);
    if (/wrong passphrase|corrupt vault/.test(message)) return 1;
    if (
      /(needs at least one file|needs a query|needs a task|needs two vault files|requires --out|needs KEEPSAKE_NEW_PASSPHRASE|--vault is required|no passphrase|is not valid JSON|unknown option|requires a value|requires a number)/.test(
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
