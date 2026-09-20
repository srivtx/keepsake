import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { formatConformance, runConformance, type Vectors } from "../src/index.ts";

const vectorsPath = fileURLToPath(new URL("../spec/vectors.json", import.meta.url));
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const workdir = mkdtempSync(join(tmpdir(), "keepsake-conf-"));

async function loadVectors(): Promise<Vectors> {
  return (await Bun.file(vectorsPath).json()) as Vectors;
}

function clone(vectors: Vectors): Vectors {
  return JSON.parse(JSON.stringify(vectors)) as Vectors;
}

describe("runConformance", () => {
  test("the published vectors pass every level", async () => {
    const report = await runConformance(await loadVectors());
    expect(report.ok).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.total).toBeGreaterThanOrEqual(20);
    expect(report.checks.some((check) => check.level === "L1")).toBe(true);
    expect(report.checks.some((check) => check.level === "L2")).toBe(true);
    expect(report.checks.some((check) => check.level === "L3")).toBe(true);
  });

  test("a tampered cell hash fails L2", async () => {
    const vectors = clone(await loadVectors());
    vectors.cells[0]!.hash = "0".repeat(64);
    const report = await runConformance(vectors);
    expect(report.ok).toBe(false);
    expect(report.checks.some((check) => check.level === "L2" && !check.ok)).toBe(true);
  });

  test("a tampered merkle root fails L2", async () => {
    const vectors = clone(await loadVectors());
    vectors.merkleRoot = "1".repeat(64);
    const report = await runConformance(vectors);
    expect(report.ok).toBe(false);
    expect(report.checks.some((check) => check.label.includes("merkle") && !check.ok)).toBe(true);
  });

  test("a wrong format identifier fails L1", async () => {
    const vectors = clone(await loadVectors());
    (vectors.vaultExample as { format: string }).format = "keepsake/v0";
    const report = await runConformance(vectors);
    expect(report.ok).toBe(false);
    expect(report.checks.some((check) => check.level === "L1" && !check.ok)).toBe(true);
  });

  test("formatConformance summarizes the run", async () => {
    const report = await runConformance(await loadVectors());
    const text = formatConformance(report);
    expect(text).toContain("pass");
    expect(text).toContain("checks passed");
  });
});

describe("conformance CLI", () => {
  function run(args: string[]) {
    const proc = Bun.spawnSync({
      cmd: ["bun", "run", cli, ...args],
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env } as Record<string, string>,
    });
    return { code: proc.exitCode, out: proc.stdout.toString() };
  }

  test("the bundled vectors pass from the CLI", () => {
    const { code, out } = run(["conformance"]);
    expect(code).toBe(0);
    expect(out).toContain("checks passed");
  });

  test("--json emits a parseable report", () => {
    const { code, out } = run(["conformance", "--json", "--quiet"]);
    expect(code).toBe(0);
    const report = JSON.parse(out) as { ok: boolean; total: number };
    expect(report.ok).toBe(true);
    expect(report.total).toBeGreaterThan(0);
  });

  test("tampered vectors exit 1", async () => {
    const vectors = clone(await loadVectors());
    vectors.vaultExample.merkle = "2".repeat(64);
    const path = join(workdir, "tampered.json");
    await Bun.write(path, JSON.stringify(vectors));
    expect(run(["conformance", "--vectors", path, "--quiet"]).code).toBe(1);
  });

  test("a missing vectors file is an I/O error", () => {
    expect(run(["conformance", "--vectors", join(workdir, "missing.json")]).code).toBe(3);
  });
});
