import { describe, it, expect, vi } from "vitest";
import { ApiError, type ProjectRow } from "@rhema/api-client";
import type { FindingView } from "@rhema/contracts";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource, DossierData } from "./data.js";

// P1.07 — the findings surface's web wiring (§5.7): the dossier renders the Margin surface + the Desk
// findings table off the ONE filtered list; Apply / promote / Add-to-obligations POST to the api and
// bounce back with notices; the deep link resolves finding → dossier anchor; the bulk actions round
// through the ONE consolidated preview (REQ-IDE-29 amended — checked rows only).

const SLUG = "the-politics-of-visibility";

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_pv",
    slug: SLUG,
    title: "The Politics of Visibility",
    state: { key: "reviewed", pill: "Reviewed", overlay: null, suggested: { action: "read_letter", label: "Read the letter" } },
  },
];

const finding = (over: Partial<FindingView>): FindingView => ({
  id: "f_1",
  correspondenceId: "c_1",
  draftId: "d_1",
  kind: "argument",
  severity: "major",
  origin: "editor",
  anchor: { blockId: "p1", startOffset: 0, endOffset: 4, quote: "the ", confidence: 1 },
  title: "A finding",
  body: "body",
  rubricDims: [],
  provisional: false,
  ...over,
});

const DOSSIER: DossierData = {
  slug: SLUG,
  runId: "run_1",
  projectTitle: "The Politics of Visibility",
  versionLabel: "Review of v1",
  rigor: "standard",
  openObligations: 0,
  addressedObligations: 0,
  runCard: { runId: "run_1", state: "completed", phases: [], spentCredits: 100, capCredits: 840 },
  letterTitle: "The Politics of Visibility",
  letterSections: [{ id: "verdict", title: "Verdict", paragraphs: ["Holds."] }],
  claims: [],
  fetchLog: [],
  findings: [
    finding({ id: "f_1", severity: "blocking", suggestion: { replacement: "better wording" } }),
    finding({ id: "f_2", severity: "note", title: "A note", suggestion: { replacement: "tweak" }, letterSection: "strength" }),
    finding({ id: "f_3", severity: "minor", title: "A minor one" }),
    finding({ id: "f_s", title: "streaming", provisional: true }),
  ],
  rubric: [],
  accessReport: { seat: "editor", mountedPathCount: 0, fetches: 0, deniedAttempts: 0, violations: 0, subagents: [] },
};

function makeDeps(over: Partial<DataSource> = {}, session: WebDeps["session"] = () => ({})): WebDeps {
  const dataSource: DataSource = {
    listProjects: async () => PROJECTS,
    getDossier: async () => DOSSIER,
    checkInvite: async () => ({ ok: true }),
    previewImport: async () => {
      throw new Error("unused");
    },
    createImport: async () => ({ draftId: "d" }),
    createRun: async () => ({ runId: "run_new", state: "queued" }),
    recordDisposition: async () => ({ id: "dsp_1", findingId: "f_1", kind: "accept", status: "proposed" }),
    listGates: async () => [],
    decideGate: async () => {},
    recordGateActivity: async () => {},
    listDecisions: async () => [],
    answerDecision: async () => {},
    getPretriage: async () => ({ correspondenceId: "c_1", triaged: 0, total: 4, entries: [] }),
    getApprovalOverrides: async () => ({}),
    setApprovalOverrides: async () => {},
    getBillingBalance: async () => ({ spendableCredits: 200_000, suspended: false, clawbackDebt: 0 }),
    recordExhaustedPrompt: async () => undefined,
    applyFinding: async () => ({ ok: true as const, findingId: "f_1", draftId: "d_2", draftN: 2, versionId: "v_2", disposition: { kind: "accept" as const, applied: true } }),
    promoteFinding: async () => ({ ok: true as const, findingId: "f_1" }),
    addFindingToObligations: async () => ({ ok: true as const, obligationId: "obl_1" }),
    resolveFinding: async () => ({ findingId: "f_1", runId: "run_1", anchor: "finding-f_1" }),
    previewBulkFindings: async () => ({
      action: "apply_notes" as const,
      rows: [{ findingId: "f_2", title: "A note", severity: "note", disposition: "accept" as const, obligation: "none" as const }],
      skipped: [{ findingId: "f_1", title: "A finding", reason: "severity_not_note" }],
      total: 4,
    }),
    applyBulkFindings: async () => ({ ok: true as const, applied: ["f_2"], skipped: [], count: 1 }),
    ...over,
  };
  return { dataSource, session };
}

function form(fields: Record<string, string>): { body: string; headers: Record<string, string> } {
  return { body: new URLSearchParams(fields).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } };
}

describe("P1.07 — the dossier's three surfaces share one list (§5.7)", () => {
  it("renders the Margin surface + the Desk findings table + the Apply affordance", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/review/run_1`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-margin-surface="true"');
    expect(html).toContain('data-findings-desk="true"');
    // f_1 + f_2 carry suggestions → the free Apply button posts to the api route.
    expect(html.match(/data-apply="true"/g)!.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain(`/p/${SLUG}/review/run_1/findings/f_1/apply`);
    // the shared filter bar + the bulk affordances render on the Desk surface.
    expect(html).toContain('data-findings-filters="true"');
    expect(html).toContain('data-bulk-controls="true"');
    expect(html).toContain("/findings/bulk-preview");
  });

  it("the shared filters narrow every surface together (?sev=note hides the rest)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/review/run_1?sev=note`);
    const html = await res.text();
    expect(html).toContain('data-desk-row="f_2"');
    expect(html).not.toContain('data-desk-row="f_1"');
    expect(html).not.toContain('data-margin-card="true" id="finding-f_1"');
  });

  it("?triage=1 renders the sectioned queue + the progress pill", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/review/run_1?triage=1`);
    const html = await res.text();
    expect(html).toContain('data-triage-mode="true"');
    expect(html).toContain("of 4 decided");
    expect(html).toContain('data-triage-section="strength"');
  });

  it("?bulk=apply_notes renders the consolidated preview checklist", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/review/run_1?bulk=apply_notes`);
    const html = await res.text();
    expect(html).toContain('data-bulk-preview="true"');
    expect(html).toContain('name="only"');
    expect(html).toContain('value="f_2"');
    expect(html).toContain("severity_not_note");
    expect(html).toContain(`/p/${SLUG}/review/run_1/findings/bulk`);
  });
});

describe("P1.07 — the finding write routes", () => {
  it("Apply POSTs through and bounces back with the applied notice", async () => {
    const applyFinding = vi.fn(async () => ({ ok: true as const, findingId: "f_1", draftId: "d_2", draftN: 2, versionId: "v_2", disposition: { kind: "accept" as const, applied: true } }));
    const app = createWebApp(makeDeps({ applyFinding }));
    const res = await app.request(`/p/${SLUG}/review/run_1/findings/f_1/apply`, { method: "POST", ...form({}) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/review/run_1?applied=f_1#finding-f_1`);
    expect(applyFinding).toHaveBeenCalledWith(expect.anything(), "proj_pv", "f_1");
  });

  it("an Apply 422 bounces back with the error notice", async () => {
    const applyFinding = vi.fn(async () => {
      throw new ApiError(422, "anchor_lost");
    });
    const app = createWebApp(makeDeps({ applyFinding }));
    const res = await app.request(`/p/${SLUG}/review/run_1/findings/f_1/apply`, { method: "POST", ...form({}) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("ferr=f_1");
  });

  it("promote + add-to-obligations POST through with the right notices", async () => {
    const promoteFinding = vi.fn(async () => ({ ok: true as const, findingId: "f_1" }));
    const addFindingToObligations = vi.fn(async () => ({ ok: true as const, obligationId: "obl_1" }));
    const app = createWebApp(makeDeps({ promoteFinding, addFindingToObligations }));
    const p = await app.request(`/p/${SLUG}/findings/f_1/promote`, {
      method: "POST",
      ...form({ next: `/p/${SLUG}/review/run_1` }),
    });
    expect(p.headers.get("location")).toContain("promoted=f_1");
    const o = await app.request(`/p/${SLUG}/findings/f_1/obligations`, {
      method: "POST",
      ...form({ next: `/p/${SLUG}/review/run_1` }),
    });
    expect(o.headers.get("location")).toContain("obligated=f_1");
    expect(addFindingToObligations).toHaveBeenCalledWith(expect.anything(), "proj_pv", "f_1");
  });

  it("the deep link resolves finding → dossier anchor", async () => {
    const resolveFinding = vi.fn(async () => ({ findingId: "f_1", runId: "run_1", anchor: "finding-f_1" }));
    const app = createWebApp(makeDeps({ resolveFinding }));
    const res = await app.request(`/p/${SLUG}/f/f_1`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/review/run_1#finding-f_1`);
  });

  it("an unresolvable deep link 404s", async () => {
    const resolveFinding = vi.fn(async () => {
      throw new ApiError(404, "not_found");
    });
    const app = createWebApp(makeDeps({ resolveFinding }));
    const res = await app.request(`/p/${SLUG}/f/nope`);
    expect(res.status).toBe(404);
  });

  it("the palette's free-form obligation (REQ-OBJ-10): the form GETs, the POST files source:'user'", async () => {
    const createObligation = vi.fn(async () => ({ ok: true as const, obligationId: "obl_new" }));
    const app = createWebApp(makeDeps({ createObligation }));
    const page = await app.request(`/p/${SLUG}/obligations/new?next=${encodeURIComponent(`/p/${SLUG}/review/run_1`)}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('name="title"');
    expect(html).toContain(`action="/p/${SLUG}/obligations"`);
    // the palette carries the row (navigation only — the form does the write).
    const res = await app.request(`/p/${SLUG}/review/run_1`);
    const shell = await res.text();
    expect(shell).toContain("New obligation");
    expect(shell).toContain(`/p/${SLUG}/obligations/new`);
    const res2 = await app.request(`/p/${SLUG}/obligations`, {
      method: "POST",
      ...form({ title: "Re-check the census stats", severity: "major", next: `/p/${SLUG}/review/run_1` }),
    });
    expect(res2.status).toBe(302);
    expect(res2.headers.get("location")).toBe(`/p/${SLUG}/review/run_1?obligation=new`);
    expect(createObligation).toHaveBeenCalledWith(expect.anything(), "proj_pv", { title: "Re-check the census stats", severity: "major" });
  });

  it("an empty obligation title re-renders the form 422", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/obligations`, {
      method: "POST",
      ...form({ title: "", next: `/p/${SLUG}` }),
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("Give the obligation a title.");
  });

  it("bulk-preview POSTs bounce to the GET preview; bulk dispatch posts the checked subset", async () => {
    const applyBulkFindings = vi.fn(async () => ({ ok: true as const, applied: ["f_2"], skipped: [], count: 1 }));
    const app = createWebApp(makeDeps({ applyBulkFindings }));
    const pv = await app.request(`/p/${SLUG}/review/run_1/findings/bulk-preview`, {
      method: "POST",
      ...form({ action: "apply_notes" }),
    });
    expect(pv.status).toBe(302);
    expect(pv.headers.get("location")).toBe(`/p/${SLUG}/review/run_1?bulk=apply_notes#findings`);
    const bad = await app.request(`/p/${SLUG}/review/run_1/findings/bulk-preview`, {
      method: "POST",
      ...form({ action: "nope" }),
    });
    expect(bad.headers.get("location")).toBe(`/p/${SLUG}/review/run_1`);
    const done = await app.request(`/p/${SLUG}/review/run_1/findings/bulk`, {
      method: "POST",
      ...form({ action: "apply_notes", only: "f_2" }),
    });
    expect(done.headers.get("location")).toBe(`/p/${SLUG}/review/run_1?bulkdone=1&bulkskip=0#findings`);
    expect(applyBulkFindings).toHaveBeenCalledWith(
      expect.anything(),
      "proj_pv",
      "run_1",
      expect.objectContaining({ action: "apply_notes", only: ["f_2"] }),
    );
  });
});
