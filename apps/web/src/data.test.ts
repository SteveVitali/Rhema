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
