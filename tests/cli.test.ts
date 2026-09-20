import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const workdir = mkdtempSync(join(tmpdir(), "keepsake-cli-"));
const vault = join(workdir, "memory.keepsake");
const notes = join(workdir, "notes.md");

const PASS = "cli-test-passphrase";
const ITER = "100000";

function run(args: string[], passphrase: string | null = PASS) {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (passphrase === null) delete env["KEEPSAKE_PASSPHRASE"];
  else env["KEEPSAKE_PASSPHRASE"] = passphrase;
  const proc = Bun.spawnSync({ cmd: ["bun", "run", cli, ...args], stdout: "pipe", stderr: "pipe", env });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

beforeAll(() => {
  writeFileSync(
    notes,
    "The staging database is cart-staging and it resets nightly.\n\nDeploys ship on Tuesdays and Thursdays only.\n",
  );
});

afterAll(() => {
  void existsSync(vault);
});

describe("keepsake cli", () => {
  test("--version prints a semver", () => {
    const { code, out } = run(["--version"]);
    expect(code).toBe(0);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("--help prints usage", () => {
    const { code, out } = run(["--help"]);
    expect(code).toBe(0);
    expect(out).toContain("keepsake");
    expect(out).toContain("KEEPSAKE_PASSPHRASE");
  });

  test("no command is a usage error", () => {
    expect(run([]).code).toBe(2);
  });

  test("unknown option is a usage error", () => {
    expect(run(["--nope"]).code).toBe(2);
  });

  test("import seals a vault", () => {
    const { code, out } = run(["import", notes, "--out", vault, "--iterations", ITER]);
    expect(code).toBe(0);
    expect(out).toContain("sealed");
    expect(existsSync(vault)).toBe(true);
  });

  test("import without a passphrase is a usage error", () => {
    const { code } = run(["import", notes, "--out", join(workdir, "x.keepsake"), "--iterations", ITER], null);
    expect(code).toBe(2);
  });

  test("import with no files is a usage error", () => {
    expect(run(["import"]).code).toBe(2);
  });

  test("search finds a matching memory", () => {
    const { code, out } = run(["search", "staging", "--vault", vault]);
    expect(code).toBe(0);
    expect(out).toContain("cart-staging");
  });

  test("search reports a negative result", () => {
    const { code } = run(["search", "kubernetes", "--vault", vault]);
    expect(code).toBe(1);
  });

  test("search --json is parseable", () => {
    const { code, out } = run(["search", "deploys", "--vault", vault, "--json"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as Array<{ cell: { text: string } }>;
    expect(parsed.length).toBeGreaterThan(0);
  });

  test("verify succeeds with the right passphrase", () => {
    const { code, out } = run(["verify", "--vault", vault]);
    expect(code).toBe(0);
    expect(out).toContain("ok");
  });

  test("verify fails with the wrong passphrase", () => {
    expect(run(["verify", "--vault", vault], "wrong-pass").code).toBe(1);
  });

  test("stats --json reports the cell count", () => {
    const { code, out } = run(["stats", "--vault", vault, "--json"]);
    expect(code).toBe(0);
    const stats = JSON.parse(out) as { count: number };
    expect(stats.count).toBe(2);
  });

  test("export --json returns every cell", () => {
    const { code, out } = run(["export", "--vault", vault, "--json"]);
    expect(code).toBe(0);
    expect((JSON.parse(out) as unknown[]).length).toBe(2);
  });

  test("a command needing a vault without --vault is a usage error", () => {
    expect(run(["verify"]).code).toBe(2);
  });

  test("a missing vault file is an I/O error", () => {
    expect(run(["verify", "--vault", join(workdir, "missing.keepsake")]).code).toBe(3);
  });

  test("context prints a token-budgeted pack", () => {
    const { code, out } = run(["context", "staging database", "--vault", vault, "--budget", "500"]);
    expect(code).toBe(0);
    expect(out).toContain("# Memory context for: staging database");
    expect(out).toContain("cart-staging");
  });

  test("context --json is parseable", () => {
    const { code, out } = run(["context", "deploys", "--vault", vault, "--json"]);
    expect(code).toBe(0);
    const pack = JSON.parse(out) as { task: string; tokens: number; cells: unknown[] };
    expect(pack.task).toBe("deploys");
    expect(pack.cells.length).toBeGreaterThan(0);
  });

  test("rotate re-encrypts under the new passphrase", () => {
    const rotated = join(workdir, "rotated.keepsake");
    const copy = Bun.file(vault);
    expect(copy.size).toBeGreaterThan(0);
    const seeded = Bun.spawnSync({
      cmd: ["bun", "run", cli, "import", notes, "--out", rotated, "--iterations", ITER],
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, KEEPSAKE_PASSPHRASE: PASS } as Record<string, string>,
    });
    expect(seeded.exitCode).toBe(0);
    const rotate = Bun.spawnSync({
      cmd: ["bun", "run", cli, "rotate", "--vault", rotated],
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, KEEPSAKE_PASSPHRASE: PASS, KEEPSAKE_NEW_PASSPHRASE: "new-secret" } as Record<
        string,
        string
      >,
    });
    expect(rotate.exitCode).toBe(0);
    expect(run(["verify", "--vault", rotated], "new-secret").code).toBe(0);
    expect(run(["verify", "--vault", rotated], PASS).code).toBe(1);
  });

  test("forget removes by query and rewrites the vault", () => {
    const target = join(workdir, "forget.keepsake");
    Bun.spawnSync({
      cmd: ["bun", "run", cli, "import", notes, "--out", target, "--iterations", ITER],
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, KEEPSAKE_PASSPHRASE: PASS } as Record<string, string>,
    });
    const result = run(["forget", "--vault", target, "--query", "staging"]);
    expect(result.code).toBe(0);
    expect(run(["search", "staging", "--vault", target]).code).toBe(1);
    expect(run(["search", "deploys", "--vault", target]).code).toBe(0);
  });

  test("pack writes a plaintext memory pack and unpack restores it", () => {
    const packPath = join(workdir, "memory-pack.md");
    const restored = join(workdir, "unpacked.keepsake");
    expect(run(["pack", "--vault", vault, "--out", packPath]).code).toBe(0);
    const pack = readFileSync(packPath, "utf8");
    expect(pack).toContain("# keepsake memory pack");
    expect(pack).toContain("<!-- keepsake:data -->");
    expect(run(["unpack", packPath, "--out", restored]).code).toBe(0);
    const stats = run(["stats", "--vault", restored, "--json"]);
    expect((JSON.parse(stats.out) as { count: number }).count).toBe(2);
  });

  test("unpack rejects a tampered pack", () => {
    const packPath = join(workdir, "tampered-pack.md");
    writeFileSync(packPath, "---\nkind: memory-pack\n---\n<!-- keepsake:data -->\n```json\n[]\n```\n<!-- /keepsake:data -->\n");
    expect(run(["unpack", packPath, "--out", join(workdir, "nope.keepsake")]).code).toBe(1);
  });

  test("merge unions two vaults", () => {
    const a = join(workdir, "merge-a.keepsake");
    const b = join(workdir, "merge-b.keepsake");
    const out = join(workdir, "merge-out.keepsake");
    const notesB = join(workdir, "notes-b.md");
    writeFileSync(notesB, "The design review happens every second Wednesday.\n");
    for (const [file, target] of [[notes, a], [notesB, b]] as const) {
      Bun.spawnSync({
        cmd: ["bun", "run", cli, "import", file, "--out", target, "--iterations", ITER],
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, KEEPSAKE_PASSPHRASE: PASS } as Record<string, string>,
      });
    }
    const merged = run(["merge", a, b, "--out", out]);
    expect(merged.code).toBe(0);
    const stats = run(["stats", "--vault", out, "--json"]);
    expect((JSON.parse(stats.out) as { count: number }).count).toBe(3);
  });
});
