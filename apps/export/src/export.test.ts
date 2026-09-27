import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import JSZip from "jszip";
import { exportMarkdown, exportFileName, EXPORT_FORMATS } from "./export.js";
import { execPandoc, pandocAvailable, type PandocExec } from "./pandoc.js";

// PRB.11 AC1/AC5 — the beta export core: md/txt/docx from canonical markdown, docx footnotes are REAL
// footnotes (golden fixture), and pandoc exists only inside this container. The format-registry, md
// passthrough, and pandoc-wiring assertions are fully deterministic (the wiring leg uses an injected
// fake `PandocExec`, so the txt/docx path is proven without the binary). The golden-fidelity legs run
// the real pandoc binary when present (the image pins pandoc 3.x — `runIf` keeps pandoc-less CI green).

const GOLDEN_MD = `# The Politics of Visibility

The injury is the thesis and it is the least-evidenced thing in the piece.[^1]

A second paragraph keeps the argument moving[^2] and ends cleanly.

[^1]: Anticipatory chilling is under-evidenced and Posner's counterargument goes unanswered.

[^2]: A mid-text footnote, carried through the same pipeline.
`;

const hasPandoc = await pandocAvailable();

describe("export format registry (§13.4 beta subset)", () => {
  it("exposes exactly md/txt/docx — the P1.18 formats are not registered", () => {
    expect([...EXPORT_FORMATS].sort()).toEqual(["docx", "md", "txt"]);
  });

  it("rejects out-of-beta formats before touching pandoc", async () => {
    for (const bad of ["pdf", "latex", "html", "rtf", "odt", "epub", "gdoc", "zip"]) {
      await expect(exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: bad })).rejects.toMatchObject({
        name: "ExportError",
        reason: "unsupported_format",
      });
    }
  });

  it("rejects an empty draft", async () => {
    await expect(exportMarkdown({ pandoc: execPandoc }, { markdown: "  \n ", format: "md" })).rejects.toMatchObject({
      reason: "empty_input",
    });
  });
});

describe("md export — canonical passthrough (Q-9: the way out is byte-faithful)", () => {
  it("returns the canonical markdown untouched", async () => {
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: "md" });
    expect(new TextDecoder().decode(r.bytes)).toBe(GOLDEN_MD);
    expect(r.mediaType).toContain("text/markdown");
    expect(r.extension).toBe("md");
  });

  it("names the download <slug>.<ext> with unsafe characters stripped", () => {
    expect(exportFileName("the-politics-of-visibility", "docx")).toBe("the-politics-of-visibility.docx");
    expect(exportFileName("my draft (final)", "md")).toBe("my-draft-final.md");
    expect(exportFileName("", "txt")).toBe("manuscript.txt");
  });
});

describe("pandoc wiring — deterministic (injected PandocExec)", () => {
  it("invokes pandoc with -f markdown → -t <target> per the format registry", async () => {
    const calls: { input: string; to: string }[] = [];
    const fakePandoc: PandocExec = async (args) => {
      calls.push({ input: args.input, to: args.to });
      return new TextEncoder().encode("converted");
    };
    const txt = await exportMarkdown({ pandoc: fakePandoc }, { markdown: GOLDEN_MD, format: "txt" });
    const docx = await exportMarkdown({ pandoc: fakePandoc }, { markdown: GOLDEN_MD, format: "docx" });
    expect(calls).toEqual([
      { input: GOLDEN_MD, to: "plain" },
      { input: GOLDEN_MD, to: "docx" },
    ]);
    expect(new TextDecoder().decode(txt.bytes)).toBe("converted");
    expect(docx.mediaType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    // md never touches the exec seam (canonical passthrough).
    calls.length = 0;
    await exportMarkdown({ pandoc: fakePandoc }, { markdown: GOLDEN_MD, format: "md" });
    expect(calls).toEqual([]);
  });
});

describe.runIf(hasPandoc)("txt + docx via the real pandoc binary", () => {
  it("txt round-trips the content as plain text (footnote bodies preserved)", async () => {
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: "txt" });
    const text = new TextDecoder().decode(r.bytes);
    expect(r.mediaType).toContain("text/plain");
    expect(text).toContain("The Politics of Visibility");
    expect(text).toContain("least-evidenced thing");
    // pandoc renders footnote bodies into the plain output — content survives, markdown syntax does not.
    expect(text).toContain("Posner");
    expect(text).not.toContain("[^1]");
  });

  it("docx carries REAL footnotes — word/footnotes.xml, never flattened text (AC1 golden)", async () => {
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: "docx" });
    expect(r.mediaType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(r.bytes.byteLength).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(r.bytes);
    const footnotes = await zip.file("word/footnotes.xml")?.async("string");
    const document = await zip.file("word/document.xml")?.async("string");
    expect(footnotes, "word/footnotes.xml must exist — pandoc emitted real footnote structures").toBeTruthy();
    expect(document).toBeTruthy();
    // Both footnote bodies land in the footnotes part…
    expect(footnotes).toContain("Anticipatory chilling is under-evidenced");
    expect(footnotes).toContain("A mid-text footnote");
    // …and the body references them via real footnoteReference runs, not literal "[^n]" text.
    expect(document).toMatch(/footnoteReference/);
    expect(document).not.toContain("[^1]");
    expect(document).toContain("least-evidenced thing");
  });
});

describe("AC5 — pandoc is confined to the export image", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const services = ["api", "web", "worker", "collab", "fetcher", "egress-proxy", "convert", "run-task"];

  it("no other service Dockerfile installs or copies pandoc", () => {
    for (const svc of services) {
      const dockerfile = join(repoRoot, "apps", svc, "Dockerfile");
      const text = readFileSync(dockerfile, "utf8");
      expect(text.toLowerCase(), `${svc} Dockerfile must not carry pandoc`).not.toContain("pandoc");
    }
    // …and the export Dockerfile DOES (the only place it is allowed).
    expect(readFileSync(join(repoRoot, "apps", "export", "Dockerfile"), "utf8")).toContain("pandoc");
  });

  it("no api/web/worker package declares a pandoc dependency", () => {
    for (const svc of services) {
      const pkg = JSON.parse(readFileSync(join(repoRoot, "apps", svc, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      expect(deps.filter((d) => /pandoc/i.test(d)), `${svc} must not depend on a pandoc package`).toEqual([]);
    }
  });

  it("no api/web/worker source execs pandoc", () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "dist" || e.name === "node_modules" ? [] : sources(join(dir, e.name))) : [join(dir, e.name)],
      );
    for (const svc of ["api", "web", "worker"]) {
      for (const file of sources(join(repoRoot, "apps", svc, "src"))) {
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
        const text = readFileSync(file, "utf8");
        // No exec/spawn of pandoc in the request-path services — conversion goes through the ExportRunner seam.
        expect(/(execFile|spawn|execSync|spawnSync)\s*\(\s*[`'"]pandoc/.test(text), `${file} execs pandoc`).toBe(false);
      }
    }
  });
});
