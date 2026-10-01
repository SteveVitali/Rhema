import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { convertBytes } from "./convert.js";

// Convert job entrypoint (§12.1: a Cloud Run Job per batch, no network, no DB). The live job reads quarantine
// bytes and writes the result through a MOUNTED user-content bucket (a gcsfuse volume at the deploy's mount
// path — IAM gates the write to the `converted/` prefix), so the process itself carries no GCS client and no
// network credential (PRB.20). This CLI is the runnable core:
//   `node dist/main.js <input> [output]` → convert the file, print the §5.3 preview JSON to stdout.
// The output path selects the payload: a `*.json` output receives the FULL ConversionResult (markdown +
// counts + warnings — the api's readback object), anything else receives the canonical markdown (the
// original `output.md` behavior, kept for local use).

/** Convert a file at `inputPath`, write the result to `outputPath`, print the preview line to stdout. */
export async function runConvertFile(inputPath: string, outputPath?: string): Promise<void> {
  const bytes = new Uint8Array(await readFile(inputPath));
  const result = await convertBytes(bytes);
  const out = outputPath ?? `${inputPath}.md`;
  // The mounted-bucket path may not exist yet inside the prefix tree — gcsfuse realizes it on write.
  await mkdir(dirname(out), { recursive: true }).catch(() => undefined);
  if (out.endsWith(".json")) {
    await writeFile(out, JSON.stringify(result), "utf8");
  } else {
    await writeFile(out, result.markdown, "utf8");
  }
  // The preview payload (count line + warnings) goes to stdout for the caller/job logs to record.
  console.log(JSON.stringify({ sourceFormat: result.sourceFormat, counts: result.counts, warnings: result.warnings, quality: result.quality, output: out }));
}

if (process.argv[1] && process.argv[1].endsWith("main.js")) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("usage: convert <input> [output]");
    process.exit(2);
  }
  runConvertFile(input, output).catch((e) => {
    console.error(`convert failed: ${String((e as Error)?.message ?? e)}`);
    process.exit(1);
  });
}
