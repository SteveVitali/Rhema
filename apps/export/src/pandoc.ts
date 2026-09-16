import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The pandoc invocation seam (§13.4). Pandoc runs ONLY inside this container — never in `api`, `web`
// or `worker` (AC5; the images carry no pandoc binary). `PandocExec` is injectable so the export core
// is unit-testable without the binary; `execPandoc` is the real child_process binding.

export interface PandocArgs {
  /** The canonical markdown to convert. */
  readonly input: string;
  /** The pandoc output format (`plain`, `docx`, …). */
  readonly to: string;
  /** Extra pandoc argv (appended before `-o`). */
  readonly extraArgs?: readonly string[];
}

export interface PandocExec {
  (args: PandocArgs): Promise<Uint8Array>;
}

export class PandocError extends Error {
  readonly code = "pandoc_failed";
  constructor(
    message: string,
    readonly exitCode: number | null,
  ) {
    super(message);
    this.name = "PandocError";
  }
}

/** The pandoc binary: `PANDOC_BIN` wins (the image sets it), else `pandoc` on PATH. */
export function pandocBin(): string {
  return process.env.PANDOC_BIN ?? "pandoc";
}

/** True when the pandoc binary resolves and answers `--version` (test guard + image self-check). */
export async function pandocAvailable(bin: string = pandocBin()): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 10_000 }, (err) => resolve(!err));
  });
}

/** The real pandoc runner: input via a temp file, output via `-o` (binary-safe for docx). */
export const execPandoc: PandocExec = async (args) => {
  const dir = await mkdtemp(join(tmpdir(), "rhema-export-"));
  const inPath = join(dir, "in.md");
  const outPath = join(dir, "out.bin");
  try {
    await writeFile(inPath, args.input, "utf8");
    const argv = ["-f", "markdown", "-t", args.to, ...(args.extraArgs ?? []), "-o", outPath, inPath];
    await new Promise<void>((resolve, reject) => {
      execFile(pandocBin(), argv, { timeout: 60_000 }, (err, _stdout, stderr) => {
        if (err) {
          const code = typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : null;
          reject(new PandocError(`pandoc -t ${args.to} failed: ${stderr?.trim() || err.message}`, code));
        } else {
          resolve();
        }
      });
    });
    return new Uint8Array(await readFile(outPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
