import { describe, it, expect } from "vitest";
import type { ProjectRow, ExportDialogDto, ExportDownloadDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// PRB.11 — the export dialog web surface (§13.4, §8.4 REQ-VIS-10, §11.7): the format radios, the
// never-blocking obligation line with links (a returned pre_export obligation marked), the AI-use attach
// toggle + statement preview + append-only addition form, the standalone-statement links, and the export
// POST proxying the binary download.

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_1",
    slug: "the-piece",
    title: "The Piece",
    headDraftId: "d_2",
    state: { key: "edited_by_you", pill: "Edited by you", overlay: null, suggested: { action: "revise_using_edits", label: "Revise using your edits" } },
  },
];

const DIALOG: ExportDialogDto = {
  projectId: "proj_1",
  formats: [
    { id: "md", label: "Markdown", extension: "md", blurb: "The canonical file.", provenanceAppendix: true },
    { id: "txt", label: "Plain text", extension: "txt", blurb: "Text only.", provenanceAppendix: false },
    { id: "html", label: "HTML", extension: "html", blurb: "A self-contained page.", provenanceAppendix: true },
    { id: "docx", label: "Word (.docx)", extension: "docx", blurb: "A Word document.", provenanceAppendix: true },
    { id: "rtf", label: "RTF", extension: "rtf", blurb: "Rich text.", provenanceAppendix: false },
    { id: "pdf", label: "PDF", extension: "pdf", blurb: "Typeset by Typst.", provenanceAppendix: true },
    { id: "latex", label: "LaTeX", extension: "tex", blurb: "A .tex source file.", provenanceAppendix: true },
  ],
  mdProfiles: [
    { id: "substack", label: "Substack", blurb: "Markdown shaped for the Substack editor." },
  ],
  citations: {
    hasBibliography: true,
    styles: [
      { id: "apa", label: "APA" },
      { id: "mla", label: "MLA" },
      { id: "chicago-author-date", label: "Chicago (author-date)" },
      { id: "harvard", label: "Harvard" },
      { id: "vancouver", label: "Vancouver" },
    ],
  },
  provenance: {
    available: true,
    defaultOn: false,
    label: "Block-level provenance.",
    formats: ["md", "html", "docx", "pdf", "latex"],
  },
  surfaces: { disclosure: true, exclusivityReminder: "Confirm this piece is not under review anywhere else." },
  obligations: {
    blockingOpen: 2,
    open: 3,
    line: "2 blocking obligations open",
    items: [
      { id: "ob_1", title: "Resolve the thesis gap", severity: "blocking", state: "open", findingId: "f_1", reviewRunId: "run_9" },
      { id: "ob_2", title: "Tighten the close", severity: "blocking", state: "open", findingId: "f_2", reviewRunId: null },
      { id: "ob_3", title: "Parked until export", severity: "major", state: "open", findingId: "f_3", reviewRunId: "run_9" },
    ],
    returnedIds: ["ob_3"],
  },
  statement: {
    template: "general",
    generated: [
      "This manuscript was prepared in Rhēma, an editorial-review environment that runs editorial workflows on the text.",
      "At the time this statement was generated, 3 review obligations remained open, 2 of them blocking.",
    ],
    additions: [{ id: "ad_1", sentence: "I rewrote the ending myself.", createdAt: "2026-09-04T00:00:00.000Z" }],
    markdown: "# AI-use statement\n\n…\n",
    openObligations: 3,
    blockingOpen: 2,
    generatedAt: "2026-09-04T00:00:00.000Z",
  },
};

const DL: ExportDownloadDto = {
  bytes: new TextEncoder().encode("# the manuscript").buffer as ArrayBuffer,
  mediaType: "text/markdown; charset=utf-8",
  fileName: "the-piece.md",
};

function makeDeps(over: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      listProjects: async () => PROJECTS,
      getExportDialog: async () => DIALOG,
      exportProject: async () => DL,
      downloadAiUseStatement: async () => DL,
      appendAiUseAddition: async () => ({ id: "ad_2", sentence: "x", createdAt: "2026-09-04T00:00:00.000Z" }),
      ...over,
    } as DataSource,
    session: () => ({ "x-rhema-user-id": "u_1" }),
  };
}

function form(fields: Record<string, string>) {
  return {
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
}

describe("export dialog — SSR (PRB.11)", () => {
  it("redirects to /login unauthenticated", async () => {
    const app = createWebApp({ ...makeDeps(), session: () => null });
    const res = await app.request("/p/the-piece/export");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("the twin ships the dialog verbatim — the leaf paints radios, the obligation line + the statement", async () => {
    // SPA.27 — the §13.4 dialog render retired with the document; the api's ExportDialogDto
    // passes through `/bff/p/:slug/export` unmassaged (formats/profiles/citations/obligations/
    // statement are the leaf's paint inputs).
    const app = createWebApp(makeDeps());
    expect((await app.request("/p/the-piece/export")).status).toBe(200); // the shell
    const res = await app.request("/bff/p/the-piece/export");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { export: { slug: string; dialog: ExportDialogDto } };
    const dialog = body.export.dialog;
    expect(body.export.slug).toBe("the-piece");
    // the full seven-format registry (P1.18) reaches the leaf.
    expect(dialog.formats.map((f) => f.id)).toEqual(["md", "txt", "html", "docx", "rtf", "pdf", "latex"]);
    expect(dialog.mdProfiles[0].id).toBe("substack");
    expect(dialog.citations.styles.length).toBe(5);
    expect(dialog.provenance.available).toBe(true);
    expect(dialog.surfaces.exclusivityReminder).toContain("not under review");
    // the §11.7 count line — informational, never a block — plus the returned item's mark.
    expect(dialog.obligations.line).toBe("2 blocking obligations open");
    expect(dialog.obligations.items[0].reviewRunId).toBe("run_9");
    expect(dialog.obligations.returnedIds).toEqual(["ob_3"]);
    // the AI-use attach + statement preview (the generated line + the append rows ride verbatim).
    expect(dialog.statement.generated[0]).toContain("editorial-review environment");
    expect(dialog.statement.generated[1]).toContain("3 review obligations remained open");
    expect(dialog.statement.additions[0].id).toBe("ad_1");
    expect(dialog.statement.additions[0].sentence).toBe("I rewrote the ending myself.");
  });

  it("POST /export proxies the binary download (format + attach flags forwarded)", async () => {
    let seen: Record<string, unknown> = {};
    const app = createWebApp(
      makeDeps({
        exportProject: async (_s, _p, req) => {
          seen = req as Record<string, unknown>;
          return DL;
        },
      }),
    );
    const res = await app.request("/p/the-piece/export", {
      method: "POST",
      ...form({ format: "docx", attachAiUse: "on", attachProvenance: "on", cslStyle: "apa", profile: "substack" }),
    });
    expect(res.status).toBe(200);
    // the substack profile is md-only — the POST drops it for docx; the rest forwards verbatim.
    expect(seen).toEqual({ format: "docx", attachAiUse: true, attachProvenance: true, cslStyle: "apa" });
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("the-piece.md");
    expect(await res.text()).toBe("# the manuscript");
  });

  it("POST /export forwards the substack profile on .md only", async () => {
    let seen: Record<string, unknown> = {};
    const app = createWebApp(
      makeDeps({
        exportProject: async (_s, _p, req) => {
          seen = req as Record<string, unknown>;
          return DL;
        },
      }),
    );
    const res = await app.request("/p/the-piece/export", {
      method: "POST",
      ...form({ format: "md", profile: "substack" }),
    });
    expect(res.status).toBe(200);
    expect(seen.profile).toBe("substack");
  });

  it("POST /export/addition appends a sentence and redirects back", async () => {
    let appended = "";
    const app = createWebApp(
      makeDeps({
        appendAiUseAddition: async (_s, _p, sentence) => {
          appended = sentence;
          return { id: "ad_2", sentence, createdAt: "2026-09-04T00:00:00.000Z" };
        },
      }),
    );
    const res = await app.request("/p/the-piece/export/addition", {
      method: "POST",
      ...form({ sentence: "I rewrote the ending myself." }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-piece/export?added=1");
    expect(appended).toBe("I rewrote the ending myself.");
  });

  it("GET /export/ai-use/:fmt streams the standalone statement", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-piece/export/ai-use/md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("the-piece.md");
    const bad = await app.request("/p/the-piece/export/ai-use/epub");
    expect(bad.status).toBe(404);
    // pdf is a registered format now — it streams too.
    const pdf = await app.request("/p/the-piece/export/ai-use/pdf");
    expect(pdf.status).toBe(200);
  });
});
