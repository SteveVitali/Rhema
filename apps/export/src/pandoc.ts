import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The pandoc invocation seam (§13.4). Pandoc runs ONLY inside this container — never in `api`, `web`
// or `worker` (AC5; the images carry no pandoc binary). `PandocExec` is injectable so the export core
// is unit-testable without the binary; `execPandoc` is the real child_process binding. The pdf path
// is pandoc's `-t pdf --pdf-engine=typst` — typst is the second confined binary (same AC5 rule).
//
// `extraFiles` are the conversion's sidecar inputs written next to `in.md` in the scratch dir and
// referenced by relative filename — figure payloads (`fig_<id>.svg|png`), the CSL-JSON
// bibliography, and the `--csl` style file. The exec runs with `cwd` = the scratch dir so the
// relative refs resolve for every writer (docx embeds them, html inlines them, typst reads them).

export interface PandocArgs {
  /** The canonical markdown to convert. */
  readonly input: string;
  /** The pandoc output format (`plain`, `docx`, `pdf`, …). */
  readonly to: string;
  /** Extra pandoc argv (appended before `-o`). */
  readonly extraArgs?: readonly string[];
  /** Sidecar files written beside the input (relative filenames the markdown/argv reference). */
  readonly extraFiles?: readonly { name: string; bytes: Uint8Array | string }[];
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

/** The typst binary (pdf engine only — it never runs standalone here): `TYPST_BIN` wins. */
export function typstBin(): string {
  return process.env.TYPST_BIN ?? "typst";
}

/** True when the pandoc binary resolves and answers `--version` (test guard + image self-check). */
export async function pandocAvailable(bin: string = pandocBin()): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 10_000 }, (err) => resolve(!err));
  });
}

/** True when the typst binary resolves — the `--pdf-engine=typst` path needs it (test guard). */
export async function typstAvailable(bin: string = typstBin()): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 10_000 }, (err) => resolve(!err));
  });
}

/** The real pandoc runner: input + sidecars via a scratch dir, output via `-o` (binary-safe). */
export const execPandoc: PandocExec = async (args) => {
  const dir = await mkdtemp(join(tmpdir(), "rhema-export-"));
  const inPath = join(dir, "in.md");
  const outPath = join(dir, "out.bin");
  try {
    await writeFile(inPath, args.input, "utf8");
    for (const f of args.extraFiles ?? []) {
      const name = f.name.replace(/^\.{1,2}\/+/, "").replace(/\//g, "_"); // confined to the scratch dir
      await writeFile(join(dir, name), f.bytes);
    }
    const argv = ["-f", "markdown", "-t", args.to, ...(args.extraArgs ?? []), "-o", outPath, inPath];
    await new Promise<void>((resolve, reject) => {
      execFile(pandocBin(), argv, { timeout: 120_000, cwd: dir }, (err, _stdout, stderr) => {
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
