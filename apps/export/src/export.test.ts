import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import JSZip from "jszip";
import type { ExportFigure } from "@rhema/contracts";
import {
  exportMarkdown,
  exportFileName,
  EXPORT_FORMATS,
  MD_EXPORT_PROFILES,
  CSL_STYLES,
  PROVENANCE_APPENDIX_FORMATS,
} from "./export.js";
import { CSL_STYLE_XML } from "./csl-styles.js";
import { rewriteFiguresForFormat } from "./figures.js";
import { substackMarkdown } from "./substack.js";
import { execPandoc, pandocAvailable, typstAvailable, type PandocExec } from "./pandoc.js";

// P1.18 §13.4 — the full export core: the 7-format registry (+ the substack md profile), pandoc
// routing per format, `--pdf-engine=typst`, `--citeproc` through the five vendored CSL styles,
// REQ-VIZ-15 figure rewriting, real footnotes in docx + latex, and pandoc/typst confined to this
// image. The registry/passthrough/wiring assertions are fully deterministic (injected
// `PandocExec`); the golden-fidelity legs run the real binaries when present (`runIf` keeps
// binary-less CI green — the deploy image self-checks `pandoc --version`/`typst --version`).

const GOLDEN_MD = `# The Politics of Visibility

The injury is the thesis and it is the least-evidenced thing in the piece.[^1]

A second paragraph keeps the argument moving[^2] and ends cleanly.

[^1]: Anticipatory chilling is under-evidenced and Posner's counterargument goes unanswered.

[^2]: A mid-text footnote, carried through the same pipeline.
`;

const FIG_MD = `# Draft With A Chart

The trend is clear in the figure below.

![Funding rounds by year](asset://fig_01ARZ3NDEKTSV4RRFFQ69G5FAV)
*Figure 1. Funding rose steadily.[^9]*
<!-- rhema:figure id=fig_01ARZ3NDEKTSV4RRFFQ69G5FAV version=2 -->

[^9]: Source: internal ledger export.
`;

const figPayload = (over: Partial<ExportFigure>): ExportFigure => ({
  figureId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  embed: "svg",
  title: "Funding by year",
  caption: "Funding rose steadily.",
  altText: "Funding rounds by year",
  sourceFootnote: "Source: internal ledger export.",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`,
  ...over,
});

const hasPandoc = await pandocAvailable();
const hasTypst = hasPandoc && (await typstAvailable());

describe("export format registry (§13.4)", () => {
  it("exposes exactly the seven formats", () => {
    expect([...EXPORT_FORMATS].sort()).toEqual(["docx", "html", "latex", "md", "pdf", "rtf", "txt"]);
  });

  it("substack is an md PROFILE, never an eighth format", () => {
    expect([...MD_EXPORT_PROFILES]).toEqual(["substack"]);
    expect(EXPORT_FORMATS).not.toContain("substack");
  });

  it("registers the five MVP CSL styles and the appendix-capable set", () => {
    expect([...CSL_STYLES]).toEqual(["apa", "mla", "chicago-author-date", "harvard", "vancouver"]);
    for (const s of CSL_STYLES) expect(CSL_STYLE_XML[s]).toContain("<style xmlns");
    expect([...PROVENANCE_APPENDIX_FORMATS].sort()).toEqual(["docx", "html", "latex", "md", "pdf"]);
  });

  it("rejects out-of-registry formats before touching pandoc", async () => {
    for (const bad of ["odt", "epub", "gdoc", "zip", "substack", "word"]) {
      await expect(exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: bad })).rejects.toMatchObject({
        name: "ExportError",
        reason: "unsupported_format",
      });
    }
  });

  it("rejects a profile on a non-md format, and an unknown profile on md", async () => {
    const fake: PandocExec = async () => new Uint8Array();
    await expect(
      exportMarkdown({ pandoc: fake }, { markdown: GOLDEN_MD, format: "docx", profile: "substack" }),
    ).rejects.toMatchObject({ reason: "unsupported_profile" });
    await expect(
      exportMarkdown({ pandoc: fake }, { markdown: GOLDEN_MD, format: "md", profile: "ghost" }),
    ).rejects.toMatchObject({ reason: "unsupported_profile" });
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

  it("appends the figure-sources appendix without touching the body (REQ-VIZ-15 .md row)", async () => {
    const fig = figPayload({
      embed: "appendix",
      specSource: '{"mark":"bar","data":{"url":"data.csv"}}',
      dataCsv: "year,funding\n2020,10\n",
      provenanceJson: '{"kind":"fetched","refs":[{"url":"https://x.test"}],"computedBy":"drafter","verification":"verified"}',
    });
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: FIG_MD, format: "md", figures: [fig] });
    const text = new TextDecoder().decode(r.bytes);
    expect(text).toContain(FIG_MD.trimEnd()); // body verbatim
    expect(text).toContain("## Figure sources");
    expect(text).toContain('"mark":"bar"');
    expect(text).toContain("year,funding");
    expect(text).toContain('"verification":"verified"');
  });

  it("names the download <slug>.<ext>, with the profile marked in the name", () => {
    expect(exportFileName("the-politics-of-visibility", "docx")).toBe("the-politics-of-visibility.docx");
    expect(exportFileName("my draft (final)", "md")).toBe("my-draft-final.md");
    expect(exportFileName("", "txt")).toBe("manuscript.txt");
    expect(exportFileName("slug", "md", { profile: "substack" })).toBe("slug.substack.md");
    expect(exportFileName("slug", "latex")).toBe("slug.tex");
    expect(exportFileName("slug", "pdf")).toBe("slug.pdf");
  });
});

describe("pandoc wiring — deterministic (injected PandocExec)", () => {
  it("routes every format to its pandoc target with the right flags", async () => {
    const calls: { input: string; to: string; extraArgs: readonly string[] }[] = [];
    const fakePandoc: PandocExec = async (args) => {
      calls.push({ input: args.input, to: args.to, extraArgs: args.extraArgs ?? [] });
      return new TextEncoder().encode("converted");
    };
    for (const f of ["txt", "html", "docx", "rtf", "pdf", "latex"] as const) {
      await exportMarkdown({ pandoc: fakePandoc }, { markdown: GOLDEN_MD, format: f });
    }
    expect(calls.map((c) => c.to)).toEqual(["plain", "html", "docx", "rtf", "pdf", "latex"]);
    // html is standalone + self-contained (figures inline); rtf/latex standalone; pdf → typst.
    expect(calls[1]!.extraArgs).toEqual(["--standalone", "--embed-resources"]);
    expect(calls[3]!.extraArgs).toEqual(["--standalone"]);
    expect(calls[5]!.extraArgs).toEqual(["--standalone"]);
    expect(calls[4]!.extraArgs).toEqual(["--pdf-engine=typst"]);
    // md never touches the exec seam (canonical passthrough).
    calls.length = 0;
    await exportMarkdown({ pandoc: fakePandoc }, { markdown: GOLDEN_MD, format: "md" });
    expect(calls).toEqual([]);
  });

  it("citeproc rides --bibliography + --csl with the five styles vendored as sidecars", async () => {
    const calls: { extraArgs: readonly string[]; files: readonly { name: string }[] }[] = [];
    const fakePandoc: PandocExec = async (args) => {
      calls.push({ extraArgs: args.extraArgs ?? [], files: args.extraFiles ?? [] });
      return new TextEncoder().encode("ok");
    };
    const bib = JSON.stringify([{ id: "s", type: "book", title: "T", author: [{ family: "S" }] }]);
    await exportMarkdown(
      { pandoc: fakePandoc },
      { markdown: "text [@s]", format: "html", cslStyle: "vancouver", bibliography: bib },
    );
    expect(calls[0]!.extraArgs).toEqual([
      "--citeproc",
      "--bibliography=refs.json",
      "--csl=vancouver.csl",
      "--standalone",
      "--embed-resources",
    ]);
    const names = calls[0]!.files.map((f) => f.name);
    expect(names).toEqual(["refs.json", "vancouver.csl"]);
  });
});

describe("REQ-VIZ-15 — figure rewrite per format (deterministic)", () => {
  const capture = () => {
    const calls: { input: string; files: readonly { name: string; bytes: unknown }[] }[] = [];
    const fake: PandocExec = async (args) => {
      calls.push({ input: args.input, files: args.extraFiles ?? [] });
      return new Uint8Array([1]);
    };
    return { calls, fake };
  };

  it("html/pdf/latex embed the svg asset filename + write the light render", async () => {
    for (const format of ["html", "pdf", "latex"] as const) {
      const { calls, fake } = capture();
      await exportMarkdown({ pandoc: fake }, { markdown: FIG_MD, format, figures: [figPayload({ embed: "svg" })] });
      expect(calls[0]!.input).toContain("![Funding rounds by year](fig_01ARZ3NDEKTSV4RRFFQ69G5FAV.svg)");
      expect(calls[0]!.input).not.toContain("asset://");
      expect(calls[0]!.input).not.toContain("rhema:figure");
      expect(calls[0]!.files.map((f) => f.name)).toContain("fig_01ARZ3NDEKTSV4RRFFQ69G5FAV.svg");
    }
  });

  it("docx/rtf embed the png@2x asset filename + ship decoded png bytes", async () => {
    const { calls, fake } = capture();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    await exportMarkdown(
      { pandoc: fake },
      { markdown: FIG_MD, format: "docx", figures: [figPayload({ embed: "png2x", png2xBase64: png })] },
    );
    expect(calls[0]!.input).toContain("(fig_01ARZ3NDEKTSV4RRFFQ69G5FAV.png)");
    const file = calls[0]!.files.find((f) => f.name === "fig_01ARZ3NDEKTSV4RRFFQ69G5FAV.png");
    expect(new Uint8Array(file!.bytes as Uint8Array)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it("a table-kind figure embeds its native table source", () => {
    const r = rewriteFiguresForFormat(FIG_MD, [
      figPayload({ embed: "table", tableSource: "| y | $ |\n|---|---|\n| 2020 | 10 |" }),
    ]);
    expect(r.markdown).toContain("| y | $ |");
    expect(r.markdown).not.toContain("asset://");
    expect(r.files).toEqual([]);
  });

  it("txt keeps alt + caption + source, no asset refs", () => {
    const r = rewriteFiguresForFormat(FIG_MD, [figPayload({ embed: "text" })]);
    expect(r.markdown).toContain("[Figure: Funding rounds by year]");
    expect(r.markdown).toContain("*Figure 1. Funding rose steadily.[^9]*");
    expect(r.markdown).toContain("[^9]: Source: internal ledger export.");
    expect(r.markdown).not.toContain("asset://");
    expect(r.markdown).not.toContain("rhema:figure");
  });

  it("the [unverified data] badge lands as a caption note (REQ-VIZ-15)", () => {
    const r = rewriteFiguresForFormat(FIG_MD, [
      figPayload({ embed: "svg", captionNote: "[unverified data]" }),
    ]);
    expect(r.markdown).toContain("[unverified data]");
    expect(r.markdown).toContain("Funding rose steadily.");
  });

  it("a marker with no payload degrades to alt text — no internal URI leaks", () => {
    const r = rewriteFiguresForFormat(FIG_MD, []);
    expect(r.markdown).toContain("[Figure: Funding rounds by year]");
    expect(r.markdown).not.toContain("asset://");
    expect(r.markdown).not.toContain("rhema:figure");
  });
});

describe("substack profile (§13.4)", () => {
  it("strips comments + markers and flattens footnotes into a Notes list", () => {
    const out = substackMarkdown(FIG_MD.replace("<!-- rhema:figure", "<!-- x") + "\npara[^9]\n");
    expect(out).not.toContain("<!--");
    expect(out).toContain("## Notes");
    expect(out).toContain("1. Source: internal ledger export.");
    expect(out).not.toMatch(/\[\^9\]/);
  });

  it("runs the figure text-rewrite before flattening (end-to-end through exportMarkdown)", async () => {
    const r = await exportMarkdown(
      { pandoc: execPandoc },
      { markdown: FIG_MD, format: "md", profile: "substack", figures: [figPayload({ embed: "text" })] },
    );
    const text = new TextDecoder().decode(r.bytes);
    expect(text).toContain("[Figure: Funding rounds by year]");
    expect(text).toContain("## Notes");
    expect(text).not.toContain("asset://");
    expect(text).not.toContain("<!--");
  });
});

describe.runIf(hasPandoc)("golden conversions through the real pandoc binary", () => {
  it("txt round-trips the content as plain text (footnote bodies preserved)", async () => {
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: "txt" });
    const text = new TextDecoder().decode(r.bytes);
    expect(r.mediaType).toContain("text/plain");
    expect(text).toContain("The Politics of Visibility");
    expect(text).toContain("Posner");
    expect(text).not.toContain("[^1]");
  });

  it("html produces a standalone document with the content", async () => {
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: "html" });
    const text = new TextDecoder().decode(r.bytes);
    expect(text).toContain("<!DOCTYPE");
    expect(text).toContain("The Politics of Visibility");
    // footnotes are real html footnote links, never literal markers.
    expect(text).toContain("footnote-ref");
  });

  it("latex emits real \\footnote{…} structures, never flattened text", async () => {
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: "latex" });
    // pandoc wraps long lines — normalize whitespace, then the real \footnote{…} bodies must show.
    const text = new TextDecoder().decode(r.bytes).replace(/\s+/g, " ");
    expect(text).toContain("\\footnote{Anticipatory chilling is under-evidenced");
    expect(text).toContain("\\footnote{A mid-text footnote, carried through the same pipeline.}");
    expect(text).not.toContain("[^1]");
  });

  it("rtf emits an RTF document", async () => {
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: "rtf" });
    const text = new TextDecoder().decode(r.bytes);
    expect(text).toContain("{\\rtf");
    expect(text).toContain("Posner");
  });

  it("docx carries REAL footnotes — word/footnotes.xml, never flattened text (AC1 golden)", async () => {
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: "docx" });
    const zip = await JSZip.loadAsync(r.bytes);
    const footnotes = await zip.file("word/footnotes.xml")?.async("string");
    const document = await zip.file("word/document.xml")?.async("string");
    expect(footnotes, "word/footnotes.xml must exist — pandoc emitted real footnote structures").toBeTruthy();
    expect(footnotes).toContain("Anticipatory chilling is under-evidenced");
    expect(footnotes).toContain("A mid-text footnote");
    expect(document).toMatch(/footnoteReference/);
    expect(document).not.toContain("[^1]");
  });
});

describe.runIf(hasTypst)("pdf via pandoc --pdf-engine=typst", () => {
  it("emits a real PDF (vector-capable path)", async () => {
    const r = await exportMarkdown({ pandoc: execPandoc }, { markdown: GOLDEN_MD, format: "pdf" });
    expect(r.mediaType).toBe("application/pdf");
    expect(new TextDecoder().decode(r.bytes.slice(0, 8))).toBe("%PDF-");
  });
});

// --citeproc golden legs: the five vendored styles through the real pandoc. CSL-JSON one-item
// bibliography; each style's rendered output differs in its own signature way.
const CITE_MD = `The claim holds [@smith2020].

Another line cites it too [@smith2020 p. 42].`;
const CITE_BIB = JSON.stringify([
  {
    id: "smith2020",
    type: "article-journal",
    title: "The politics of visibility",
    author: [{ family: "Smith", given: "Joan D" }],
    issued: { "date-parts": [[2020]] },
    "container-title": "Journal of Tests",
    volume: "12",
    issue: "3",
    page: "45-67",
    DOI: "10.1/test",
  },
]);

describe.runIf(hasPandoc)("--citeproc renders the five CSL styles (golden)", () => {
  // pandoc wraps the rendered html — normalize whitespace so assertions are layout-stable.
  const render = async (style: string) =>
    new TextDecoder()
      .decode(
        (
          await exportMarkdown(
            { pandoc: execPandoc },
            { markdown: CITE_MD, format: "html", cslStyle: style, bibliography: CITE_BIB },
          )
        ).bytes,
      )
      .replace(/\s+/g, " ");

  it("apa renders (Smith, 2020) + an italicized-container reference", async () => {
    const html = await render("apa");
    expect(html).toContain("Smith, 2020");
    expect(html).toContain("Journal of Tests");
    expect(html).toContain("The politics of visibility");
  });
  it("mla renders (Smith) with a quoted-title works-cited entry", async () => {
    const html = await render("mla");
    expect(html).toMatch(/\(Smith/);
    expect(html).toContain("Journal of Tests");
  });
  it("chicago-author-date renders (Smith 2020) — no comma", async () => {
    const html = await render("chicago-author-date");
    expect(html).toContain("Smith 2020");
    expect(html).not.toContain("Smith, 2020");
  });
  it("harvard renders (Smith, 2020)", async () => {
    const html = await render("harvard");
    expect(html).toContain("Smith, 2020");
  });
  it("vancouver renders a numeric citation (1)", async () => {
    const html = await render("vancouver");
    expect(html).toMatch(/\(1\)/);
    expect(html).not.toContain("Smith, 2020");
  });
});

describe("AC5 — pandoc AND typst are confined to the export image", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const services = ["api", "web", "worker", "collab", "fetcher", "egress-proxy", "convert", "run-task"];

  it("no other service Dockerfile installs or copies pandoc/typst", () => {
    for (const svc of services) {
      const dockerfile = join(repoRoot, "apps", svc, "Dockerfile");
      const text = readFileSync(dockerfile, "utf8").toLowerCase();
      expect(text, `${svc} Dockerfile must not carry pandoc`).not.toContain("pandoc");
      expect(text, `${svc} Dockerfile must not carry typst`).not.toContain("typst");
    }
    // …and the export Dockerfile DOES carry both (the only place they are allowed).
    const own = readFileSync(join(repoRoot, "apps", "export", "Dockerfile"), "utf8").toLowerCase();
    expect(own).toContain("pandoc");
    expect(own).toContain("typst");
  });

  it("no api/web/worker package declares a pandoc/typst dependency", () => {
    for (const svc of services) {
      const pkg = JSON.parse(readFileSync(join(repoRoot, "apps", svc, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      expect(deps.filter((d) => /pandoc|typst/i.test(d)), `${svc} must not depend on pandoc/typst`).toEqual([]);
    }
  });

  it("no api/web/worker source execs pandoc/typst", () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "dist" || e.name === "node_modules" ? [] : sources(join(dir, e.name))) : [join(dir, e.name)],
      );
    for (const svc of ["api", "web", "worker"]) {
      for (const file of sources(join(repoRoot, "apps", svc, "src"))) {
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
        const text = readFileSync(file, "utf8");
        expect(
          /(execFile|spawn|execSync|spawnSync)\s*\(\s*[`'"](pandoc|typst)/.test(text),
          `${file} execs pandoc/typst`,
        ).toBe(false);
      }
    }
  });
});
