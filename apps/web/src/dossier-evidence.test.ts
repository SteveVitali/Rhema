import { describe, it, expect } from "vitest";
import type { FindingView } from "@rhema/contracts";
import { buildRunCardView } from "@rhema/findings-core";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource, DossierData } from "./data.js";
import type { ProjectRow } from "@rhema/api-client";

// HOT.1 — the dossier-500 regression pack (PR-J3/BL-52): production-shaped evidence blobs that actually
// shipped (canonical, the {verdict}-only sidecar carry, the pre-canonical Showcase [{claim, source}]
// array, a partial/malformed blob) must all surface without throwing. SPA.27 — the SSR dossier is
// deleted; the pack repoints at the `/bff/p/:slug/review/:runId` twin: every shipped shape rides
// the payload VERBATIM (the twin never normalizes — the leaf's normalizeEvidence coverage lives in
// `spa/dossier.dom.test.tsx`) and the read never 500s.

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_hot1",
    slug: "showcase",
    title: "The archive that remembers",
    state: {
      key: "edited_by_you",
      pill: "Edited by you",
      overlay: null,
      suggested: { action: "revise_using_edits", label: "Revise using your edits" },
    },
  },
];

const SCOTLAND_URL = "https://www.nrscotland.gov.uk/publications/1871-census-population-tables";

const finding = (id: string, evidence: unknown): FindingView => ({
  id,
  correspondenceId: "corr_1",
  draftId: "d_1",
  kind: "claim",
  severity: "major",
  origin: "editor",
  anchor: null,
  title: `finding ${id}`,
  body: "body",
  rubricDims: [],
  provisional: false,
  // the cast is the point: the api payload is JSON — the field's runtime shape is whatever history wrote.
  ...(evidence !== undefined ? { evidence: evidence as FindingView["evidence"] } : {}),
});

const dossier = (findings: readonly FindingView[]): DossierData => ({
  slug: "showcase",
  runId: "run_1",
  projectTitle: "The archive that remembers",
  versionLabel: "Review of v1",
  openObligations: 0,
  addressedObligations: 0,
  runSummary: {
    runId: "run_1",
    workflow: "review",
    state: "completed",
    createdAt: "2026-11-01T00:00:00Z",
    card: buildRunCardView({
      runId: "run_1",
      state: "completed",
      phases: [{ key: "reading_the_piece", ordinal: 1, status: "done" }],
      spentCredits: 3860,
      capCredits: 5850,
    }),
  },
  letterTitle: "The archive that remembers",
  letterSections: [{ id: "verdict", title: "Verdict", paragraphs: ["One real problem."] }],
  claims: [
    {
      id: "cl_1",
      correspondenceId: "corr_1",
      draftId: "d_1",
      ordinal: 0,
      text: "The 1871 census recorded 3.1 million households in Scotland.",
      tier: 1,
      verdict: "contradicted",
      url: SCOTLAND_URL,
      normalizedUrl: SCOTLAND_URL.replace(/\/$/, ""),
      accessedAt: "2026-09-30T00:00:00Z",
      humanAdded: false,
    },
  ],
  fetchLog: [SCOTLAND_URL],
  findings,
  rubric: [{ dimension: "evidence_accuracy", score: 2 }],
  accessReport: {
    seat: "editor",
    mountedPathCount: 1,
    fetches: 1,
    deniedAttempts: 0,
    violations: 0,
    subagents: [],
  },
});

function makeDeps(findings: readonly FindingView[]): WebDeps {
  const dataSource: DataSource = {
    checkSession: async () => true,
    listProjects: async () => PROJECTS,
    getDossier: async () => dossier(findings),
    checkInvite: async () => ({ ok: false, reason: "unknown" }),
    signup: async () => ({ ok: false, status: 403, error: "invite_required" }),
    previewImport: async () => ({
      status: "ready" as const,
      preview: {
        sourceFormat: "markdown" as const,
        markdown: "",
        counts: { words: 0, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
        warnings: [],
        unconverted: [],
        quality: "full" as const,
        qualityNotes: [],
      },
    }),
    createImport: async () => ({ draftId: "d_new" }),
    createRun: async () => ({ runId: "run_new", state: "queued", deduped: false }),
    getBillingBalance: async () => ({ spendableCredits: 0, suspended: false, clawbackDebt: 0 }),
    recordExhaustedPrompt: async () => undefined,
  };
  return { dataSource, session: () => ({}) };
}

// The twin's `dossier` is the composition's verbatim data-source DTO — findings, claims,
// fetchLog, deliveryLabel and the showcase flag ride unmassaged.
async function getDossier(findings: readonly FindingView[]): Promise<DossierData> {
  const app = createWebApp(makeDeps(findings));
  const res = await app.request("/bff/p/showcase/review/run_1");
  expect(res.status).toBe(200); // the 500 this pack exists to kill
  return ((await res.json()) as { dossier: DossierData }).dossier;
}

const evidenceOf = async (findings: readonly FindingView[]) =>
  (await getDossier(findings)).findings.map((f) => f.evidence);

describe("HOT.1 — dossier evidence shapes that shipped in prod all ride the twin (REQ-POS-3 surface)", () => {
  it("canonical evidence ships its urls + verdict verbatim (the leaf paints chip + explainer)", async () => {
    const [ev] = await evidenceOf([
      finding("f_canon", {
        claimId: "cl_1",
        verdict: "contradicted",
        urls: [{ url: SCOTLAND_URL, accessed: "2026-09-30T00:00:00Z" }],
      }),
    ]);
    expect(ev).toMatchObject({
      verdict: "contradicted",
      urls: [{ url: SCOTLAND_URL, accessed: "2026-09-30T00:00:00Z" }],
    });
  });

  it("the {verdict}-only sidecar carry (the STB.3 Memo shape) ships verbatim — no urls, no crash", async () => {
    const [ev] = await evidenceOf([finding("f_verdict_only", { verdict: "verified" })]);
    expect(ev).toEqual({ verdict: "verified" });
  });

  it("the legacy Showcase [{claim, source}] array ships verbatim (pre-normalization this 500'd)", async () => {
    const [ev] = await evidenceOf([
      finding("f_legacy", [
        { claim: "The 1871 census recorded 3.1M households.", source: SCOTLAND_URL },
      ]),
    ]);
    expect(ev).toEqual([
      { claim: "The 1871 census recorded 3.1M households.", source: SCOTLAND_URL },
    ]);
  });

  it("a malformed evidence blob (urls: not-an-array) ships verbatim — the leaf degrades it", async () => {
    const d = await getDossier([finding("f_bad", { urls: "not-an-array" })]);
    expect(d.findings[0].id).toBe("f_bad");
    expect(d.findings[0].evidence).toEqual({ urls: "not-an-array" });
  });

  it("a dossier mixing every shipped shape ships in one pass (the real Showcase+Memo page mix)", async () => {
    const d = await getDossier([
      finding("f_a", {
        verdict: "contradicted",
        urls: [{ url: SCOTLAND_URL, accessed: "2026-09-30T00:00:00Z" }],
      }),
      finding("f_b", { verdict: "verified" }),
      finding("f_c", [{ claim: "x", source: "https://archive.org/web/" }]),
      finding("f_d", undefined),
    ]);
    expect(d.findings.map((f) => f.id)).toEqual(["f_a", "f_b", "f_c", "f_d"]);
    expect(d.findings[2].evidence).toEqual([{ claim: "x", source: "https://archive.org/web/" }]);
  });

  it("REQ-POS-3 — the contradicted Tier-1 claim still carries its fetched URL", async () => {
    const d = await getDossier([
      finding("f_canon", { verdict: "contradicted", urls: [{ url: SCOTLAND_URL }] }),
    ]);
    expect(d.claims[0]).toMatchObject({ tier: 1, verdict: "contradicted", url: SCOTLAND_URL });
    expect(d.fetchLog).toContain(SCOTLAND_URL); // the leaf's data-fetched pin
  });

  it("RES.2 — the persisted Unverified label rides the payload (the leaf paints the banner)", async () => {
    const data: DossierData = { ...dossier([]), deliveryLabel: "unverified" };
    const dataSource: DataSource = { ...makeDeps([]).dataSource, getDossier: async () => data };
    const res = await createWebApp({ dataSource, session: () => ({}) }).request(
      "/bff/p/showcase/review/run_1",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dossier: DossierData };
    expect(body.dossier.deliveryLabel).toBe("unverified");
    // and a dossier with no label ships none.
    expect((await getDossier([])).deliveryLabel).toBeUndefined();
  });

  it("SPA.6 — the showcase flag rides the payload (the leaf's banner + Duplicate affordance)", async () => {
    const data: DossierData = { ...dossier([]), showcase: true };
    const dataSource: DataSource = { ...makeDeps([]).dataSource, getDossier: async () => data };
    const res = await createWebApp({ dataSource, session: () => ({}) }).request(
      "/bff/p/showcase/review/run_1",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dossier: DossierData };
    expect(body.dossier.showcase).toBe(true);
    // an ordinary dossier ships no showcase flag.
    expect((await getDossier([])).showcase).toBeUndefined();
  });
});
