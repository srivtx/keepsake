import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const entry = new URL("../src/index.ts", import.meta.url);
const outfile = new URL("../site/assets/app.js", import.meta.url);

async function main() {
  const entryPath = fileURLToPath(entry);

  if (!existsSync(entryPath)) {
    process.stdout.write(
      `skipping: ${entryPath} not found (build the library first)\n`,
    );
    return;
  }

  await mkdir(dirname(fileURLToPath(outfile)), { recursive: true });

  await esbuild.build({
    entryPoints: [entryPath],
    outfile: fileURLToPath(outfile),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    globalName: "Keepsake",
    logLevel: "info",
  });

  process.stdout.write("built keepsake -> site/assets/app.js\n");
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
