import { readFile, writeFile } from "node:fs/promises";
import { convertBytes } from "./convert.js";

// Convert job entrypoint (§12.1: a Cloud Run Job per batch, no network, no DB). The live job reads quarantine
// bytes from GCS and writes canonical markdown back (that binding is the deploy leg, D-PRB.02-1). This CLI is
// the runnable core: `node dist/main.js <input> [output.md]` → convert the file, print the §5.3 preview JSON,
// and write the canonical markdown.

export async function runConvertFile(inputPath: string, outputPath?: string): Promise<void> {
  const bytes = new Uint8Array(await readFile(inputPath));
  const result = await convertBytes(bytes);
  const out = outputPath ?? `${inputPath}.md`;
  await writeFile(out, result.markdown, "utf8");
  // The preview payload (count line + warnings) goes to stdout for the caller/job to record.
  console.log(JSON.stringify({ sourceFormat: result.sourceFormat, counts: result.counts, warnings: result.warnings, quality: result.quality, output: out }));
}

if (process.argv[1] && process.argv[1].endsWith("main.js")) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("usage: convert <input> [output.md]");
    process.exit(2);
  }
  runConvertFile(input, output).catch((e) => {
    console.error(`convert failed: ${String((e as Error)?.message ?? e)}`);
    process.exit(1);
  });
}
