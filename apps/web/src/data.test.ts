import { describe, expect, it } from "vitest";
import { ApiError } from "@rhema/api-client";
import { apiDataSource } from "./data.js";

// PRB.16 — the live dossier binding (D-PRB.04-1): the web data source resolves the project slug → id via
// listProjects (session forwarded), then GETs the api's dossier endpoint and passes the server-side DTO
// through as the DossierData the reading surfaces render.

function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as unknown as typeof fetch;
}

const SESSION = { cookie: "__Host-rhema.session_token=tok_1" };

const PROJECT = {
  id: "proj_pv",
  slug: "the-politics-of-visibility",
  title: "The Politics of Visibility",
  state: {
    key: "reviewed",
    pill: "Reviewed",
    overlay: null,
    suggested: { action: "read_letter", label: "Read the letter" },
  },
};

const DOSSIER = {
  slug: "the-politics-of-visibility",
  runId: "run_1",
  projectTitle: "The Politics of Visibility",
  versionLabel: "Review of v1",
  openObligations: 1,
  addressedObligations: 0,
  runCard: { runId: "run_1", state: "completed", phases: [], spent: 520, cap: 840 },
  letterTitle: "The Politics of Visibility",
  letterSections: [{ id: "verdict", title: "Verdict", paragraphs: ["…"] }],
  claims: [],
  fetchLog: ["https://example.com/stat"],
  findings: [],
  rubric: [{ dimension: "structure", score: 3 }],
  accessReport: {
    seat: "reviewer",
    mountedPathCount: 1,
    byTopLevel: {},
    fetches: 1,
    deniedAttempts: 0,
    violations: 0,
    subagents: [],
  },
  findingObligations: { fnd_1: "open" },
};

describe("apiDataSource.getDossier — the live dossier binding (D-PRB.04-1)", () => {
  it("resolves slug → id, forwards the session, and returns the server-side DTO", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const ds = apiDataSource(
      "http://api.local",
      fakeFetch((url, init) => {
        seen.push({ url, init });
        if (url.endsWith("/projects"))
          return new Response(JSON.stringify({ projects: [PROJECT] }), { status: 200 });
        return new Response(JSON.stringify(DOSSIER), { status: 200 });
      }),
    );
    const dossier = await ds.getDossier(SESSION, {
      projectSlug: "the-politics-of-visibility",
      runId: "run_1",
    });
    expect(seen.map((s) => s.url)).toEqual([
      "http://api.local/projects",
      "http://api.local/projects/proj_pv/review/run_1/dossier",
    ]);
    // the session headers ride BOTH calls — the dossier read is a session-authed row read.
    for (const s of seen) {
      expect((s.init.headers as Record<string, string>).cookie).toBe(SESSION.cookie);
    }
    expect(dossier).toMatchObject({
      runId: "run_1",
      versionLabel: "Review of v1",
      openObligations: 1,
      findingObligations: { fnd_1: "open" },
      fetchLog: ["https://example.com/stat"],
    });
    expect(dossier.accessReport.seat).toBe("reviewer");
  });

  it("404s as an ApiError when the slug is not one of the session's projects", async () => {
    const ds = apiDataSource(
      "http://api.local",
      fakeFetch(() => new Response(JSON.stringify({ projects: [PROJECT] }), { status: 200 })),
    );
    await expect(
      ds.getDossier(SESSION, { projectSlug: "not-mine", runId: "run_1" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

// PRB.20 (D-PRB.02-1) — the live import binding: presign → PUT to GCS → api preview/create. The session
// cookie rides ONLY the api calls; the GCS PUT carries just the signed headers.
const CONVERSION = {
  sourceFormat: "md",
  markdown: "# Hi",
  counts: { words: 1, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
  warnings: [],
  unconverted: [],
  quality: "clean",
  qualityNotes: [],
};

describe("apiDataSource import — presign → PUT → preview → create (PRB.20)", () => {
  const PRESIGN = {
    url: "https://storage.googleapis.com/rhema-dev-user-content/quarantine/ws1/up1?sig=abc",
    key: "quarantine/ws1/up1",
    maxBytes: 25 * 1024 * 1024,
    requiredHeaders: { "x-goog-content-length-range": "0,26214400" },
  };

  function flowFetch(seen: { url: string; init: RequestInit }[]) {
    return fakeFetch((url, init) => {
      seen.push({ url, init });
      if (url.endsWith("/projects")) return new Response(JSON.stringify({ projects: [PROJECT] }));
      if (url.endsWith("/import/presign")) return new Response(JSON.stringify(PRESIGN));
      if (url.startsWith("https://storage.googleapis.com/")) return new Response(null, { status: 200 });
      if (url.endsWith("/import/preview")) return new Response(JSON.stringify({ preview: CONVERSION }));
      if (url.endsWith("/import/create"))
        return new Response(JSON.stringify({ draft: { draftId: "d1", versionId: "v1", artifactId: "a1", n: 1, wordCount: 1, contentSha256: "sha" } }), { status: 201 });
      return new Response("not found", { status: 404 });
    });
  }

  it("file upload: presign → PUT bytes with the signed headers → preview posts the quarantine key", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const ds = apiDataSource("http://api.local", flowFetch(seen));
    const out = await ds.previewImport(SESSION, {
      projectSlug: PROJECT.slug,
      fileName: "ch1.md",
      bytes: new TextEncoder().encode("# Hi"),
    });
    expect(seen.map((s) => s.url)).toEqual([
      "http://api.local/projects",
      "http://api.local/import/presign",
      PRESIGN.url,
      `http://api.local/projects/${PROJECT.id}/import/preview`,
    ]);
    // the session cookie rides the api calls…
    for (const s of [seen[0]!, seen[1]!, seen[3]!])
      expect((s.init.headers as Record<string, string>).cookie).toBe(SESSION.cookie);
    // …but NEVER the GCS PUT — it carries only the signed range header + the bytes.
    const put = seen[2]!;
    expect(put.init.method).toBe("PUT");
    expect(put.init.headers).toEqual({ "x-goog-content-length-range": "0,26214400" });
    expect(put.init.headers).not.toHaveProperty("cookie");
    expect(new TextDecoder().decode(put.init.body as Uint8Array)).toBe("# Hi");
    // preview posts the minted key
    expect(JSON.parse(seen[3]!.init.body as string)).toEqual({ quarantineKey: PRESIGN.key });
    expect(out).toEqual({ preview: CONVERSION, quarantineKey: PRESIGN.key });
  });

  it("pasted text goes through the same quarantine path (encoded as utf-8 bytes)", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const ds = apiDataSource("http://api.local", flowFetch(seen));
    await ds.previewImport(SESSION, { projectSlug: PROJECT.slug, text: "hello world" });
    const put = seen.find((s) => s.url === PRESIGN.url)!;
    expect(new TextDecoder().decode(put.init.body as Uint8Array)).toBe("hello world");
  });

  it("create replays the preview's quarantine key — no second presign, no second PUT", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const ds = apiDataSource("http://api.local", flowFetch(seen));
    const out = await ds.createImport(SESSION, { projectSlug: PROJECT.slug, quarantineKey: PRESIGN.key });
    expect(seen.map((s) => s.url)).toEqual([
      "http://api.local/projects",
      `http://api.local/projects/${PROJECT.id}/import/create`,
    ]);
    expect(JSON.parse(seen[1]!.init.body as string)).toEqual({ quarantineKey: PRESIGN.key });
    expect(out).toEqual({ draftId: "d1" });
  });

  it("surfaces a GCS PUT refusal (over-cap bytes hit the signed range bound)", async () => {
    const ds = apiDataSource(
      "http://api.local",
      fakeFetch((url) => {
        if (url.endsWith("/projects")) return new Response(JSON.stringify({ projects: [PROJECT] }));
        if (url.endsWith("/import/presign")) return new Response(JSON.stringify(PRESIGN));
        return new Response(null, { status: 413 });
      }),
    );
    await expect(
      ds.previewImport(SESSION, { projectSlug: PROJECT.slug, bytes: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
