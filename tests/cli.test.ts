import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
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
});
