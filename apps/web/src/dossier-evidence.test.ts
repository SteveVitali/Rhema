import { describe, it, expect } from "vitest";
import type { FindingView } from "@rhema/contracts";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource, DossierData } from "./data.js";
import type { ProjectRow } from "@rhema/api-client";

// HOT.1 — the dossier-500 regression pack (PR-J3/BL-52): production-shaped evidence blobs that actually
// shipped (canonical, the {verdict}-only sidecar carry, the pre-canonical Showcase [{claim, source}]
// array, a partial/malformed blob) must all SSR without throwing. If a future change bypasses
// normalizeEvidence at a render seam, the legacy-shape cases fail.

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
  runCard: {
    runId: "run_1",
    state: "completed",
    phases: [{ key: "reading_the_piece", ordinal: 1, status: "done" }],
    spentCredits: 3860,
    capCredits: 5850,
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
  accessReport: { seat: "editor", mountedPathCount: 1, fetches: 1, deniedAttempts: 0, violations: 0, subagents: [] },
});

function makeDeps(findings: readonly FindingView[]): WebDeps {
  const dataSource: DataSource = {
    checkSession: async () => true,
    listProjects: async () => PROJECTS,
    getDossier: async () => dossier(findings),
    checkInvite: async () => ({ ok: false, reason: "unknown" }),
    signup: async () => ({ ok: false, status: 403, error: "invite_required" }),
    previewImport: async () => ({ status: "ready" as const, preview: {
      sourceFormat: "markdown" as const, markdown: "", counts: { words: 0, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
      warnings: [], unconverted: [], quality: "full" as const, qualityNotes: [],
    } }),
    createImport: async () => ({ draftId: "d_new" }),
    createRun: async () => ({ runId: "run_new", state: "queued", deduped: false }),
    getBillingBalance: async () => ({ spendableCredits: 0, suspended: false, clawbackDebt: 0 }),
    recordExhaustedPrompt: async () => undefined,
  };
  return { dataSource, session: () => ({}) };
}

async function getDossierHtml(findings: readonly FindingView[]): Promise<string> {
  const app = createWebApp(makeDeps(findings));
  const res = await app.request("/p/showcase/review/run_1");
  expect(res.status).toBe(200); // the 500 this pack exists to kill
  return res.text();
}

describe("HOT.1 — dossier evidence shapes that shipped in prod all render (REQ-POS-3 surface)", () => {
  it("canonical evidence renders the url + the verdict chip + the explainer", async () => {
    const html = await getDossierHtml([
      finding("f_canon", {
        claimId: "cl_1",
        verdict: "contradicted",
        urls: [{ url: SCOTLAND_URL, accessed: "2026-09-30T00:00:00Z" }],
      }),
    ]);
    expect(html).toContain('data-finding-evidence="true"');
    expect(html).toContain("Contradicted");
    expect(html).toContain(encodeURI(SCOTLAND_URL));
    expect(html).toContain('data-evidence-explainer="true"');
  });

  it("the {verdict}-only sidecar carry (the STB.3 Memo shape) renders — no urls, no crash", async () => {
    const html = await getDossierHtml([finding("f_verdict_only", { verdict: "verified" })]);
    expect(html).toContain('data-finding-evidence="true"');
    expect(html).toContain("Verified");
    // no urls ⇒ no evidence explainer (it only speaks when a URL exists to explain)
    expect(html).not.toContain('data-evidence-explainer="true"');
  });

  it("the legacy Showcase [{claim, source}] array renders its URL (pre-normalization this 500'd)", async () => {
    const html = await getDossierHtml([
      finding("f_legacy", [{ claim: "The 1871 census recorded 3.1M households.", source: SCOTLAND_URL }]),
    ]);
    expect(html).toContain(encodeURI(SCOTLAND_URL));
    expect(html).toContain('data-evidence-explainer="true"');
    expect(html).toContain('data-fetched="true"'); // SCOTLAND_URL is in the fetch log
  });

  it("a malformed evidence blob (urls: not-an-array) renders the card, no evidence block, no crash", async () => {
    const html = await getDossierHtml([finding("f_bad", { urls: "not-an-array" })]);
    expect(html).toContain("finding f_bad");
    expect(html).not.toContain('data-evidence-explainer="true"');
  });

  it("a dossier mixing every shipped shape renders in one pass (the real Showcase+Memo page mix)", async () => {
    const html = await getDossierHtml([
      finding("f_a", { verdict: "contradicted", urls: [{ url: SCOTLAND_URL, accessed: "2026-09-30T00:00:00Z" }] }),
      finding("f_b", { verdict: "verified" }),
      finding("f_c", [{ claim: "x", source: "https://archive.org/web/" }]),
      finding("f_d", undefined),
    ]);
    expect(html).toContain("finding f_a");
    expect(html).toContain("finding f_b");
    expect(html).toContain("finding f_c");
    expect(html).toContain("finding f_d");
    expect(html).toContain(encodeURI(SCOTLAND_URL));
    expect(html).toContain("https://archive.org/web/");
  });

  it("REQ-POS-3 — the contradicted Tier-1 claim still carries its fetched URL", async () => {
    const html = await getDossierHtml([finding("f_canon", { verdict: "contradicted", urls: [{ url: SCOTLAND_URL }] })]);
    expect(html).toContain('data-contradicted-tier1="true"');
    expect(html).toContain('data-fetched="true"');
  });

  it("RES.2 — the persisted Unverified label renders as the banner above the verdict", async () => {
    const data: DossierData = { ...dossier([]), deliveryLabel: "unverified" };
    const dataSource: DataSource = { ...makeDeps([]).dataSource, getDossier: async () => data };
    const res = await createWebApp({ dataSource, session: () => ({}) }).request("/p/showcase/review/run_1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-delivery-label="unverified"');
    // the banner reads "Unverified" — the reserved run-level word — above the verdict section.
    expect(html.indexOf('data-delivery-label="unverified"')).toBeLessThan(html.indexOf("Verdict"));
    // and a dossier with no label renders no banner.
    const plain = await getDossierHtml([]);
    expect(plain).not.toContain("data-delivery-label");
  });
});
