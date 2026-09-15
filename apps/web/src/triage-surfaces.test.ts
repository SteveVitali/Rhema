import { describe, it, expect, vi } from "vitest";
import { ApiError, type ProjectRow, type GateCardDto, type DecisionItemDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource, DossierData } from "./data.js";

// PRB.05 — the web shell's triage surfaces (§5.7/§6.4/§10.1): the dossier renders the five-verb disposition
// controls on every finalized finding; the disposition POST forwards verb/note/reason_code/adapted_text and
// re-renders on a 422/409; the project page mounts the gate cards + the Decisions list; the phone-width
// variant comes from the SAME components keyed off the request's mobile hints (REQ-SPEC-20).

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_pv",
    slug: "the-politics-of-visibility",
    title: "The Politics of Visibility",
    state: {
      key: "reviewed",
      pill: "Reviewed",
      overlay: null,
      suggested: { action: "read_letter", label: "Read the Editor's letter" },
    },
  },
];

const DOSSIER: DossierData = {
  slug: "the-politics-of-visibility",
  runId: "run_1",
  projectTitle: "The Politics of Visibility",
  versionLabel: "Review of v1",
  openObligations: 1,
  addressedObligations: 0,
  runCard: { runId: "run_1", state: "completed", phases: [], spentCredits: 100, capCredits: 840 },
  letterTitle: "The Politics of Visibility",
  letterSections: [{ id: "verdict", title: "Verdict", paragraphs: ["Holds."] }],
  claims: [],
  fetchLog: [],
  findings: [
    {
      id: "f_1",
      correspondenceId: "c_1",
      draftId: "d_1",
      kind: "argument",
      severity: "blocking",
      origin: "editor",
      anchor: null,
      title: "The injury is the least-evidenced thing.",
      body: "Asserted more than shown.",
      rubricDims: [],
      provisional: false,
    },
    {
      id: "f_2",
      correspondenceId: "c_1",
      draftId: "d_1",
      kind: "claim",
      severity: "major",
      origin: "editor",
      anchor: null,
      title: "A citation is misstated.",
      body: "The ruling did the opposite.",
      rubricDims: [],
      provisional: false,
      disposition: { kind: "defer", rationale: "Not this round", by: { kind: "user", userId: "u_1" }, at: "2026-09-16T00:00:00Z", frozen: false },
    },
    {
      id: "f_s",
      correspondenceId: "c_1",
      draftId: "d_1",
      kind: "claim",
      severity: "minor",
      origin: "editor",
      anchor: null,
      title: "A streaming finding.",
      body: "still arriving",
      rubricDims: [],
      provisional: true,
    },
  ],
  rubric: [],
  accessReport: { seat: "editor", mountedPathCount: 0, fetches: 0, deniedAttempts: 0, violations: 0, subagents: [] },
};

const GATE: GateCardDto = {
  id: "gate_1",
  runId: "run_9",
  kind: "approve_triage",
  workflow: "revise",
  openedAt: "2026-09-16T10:00:00Z",
  pausedWhileReading: false,
  held: false,
  blocking: true,
  onExpiry: "wait",
  spentCredits: 120,
  capCredits: 840,
  triage: {
    rows: [
      { findingId: "f_1", ordinal: 1, title: "The injury is the least-evidenced thing.", severity: "blocking" },
      { findingId: "f_2", ordinal: 2, title: "A citation is misstated.", severity: "major", disposition: { kind: "escalate", rationale: "my call", actor: "user" } },
    ],
  },
};

const DECISION: DecisionItemDto = {
  id: "dcr_1",
  projectId: "proj_pv",
  obligationId: "obl_1",
  text: "Escalated finding: A citation is misstated.",
  options: ["decide", "dismiss"],
  createdAt: null,
};

/** An auto-proceed twin of GATE — this card DOES arm the presence timer, so it carries the ping script. */
const GATE_AUTO: GateCardDto = {
  ...GATE,
  id: "gate_auto",
  kind: "approve_scope",
  onExpiry: "proceed_as_proposed",
  blocking: false,
};
delete (GATE_AUTO as Record<string, unknown>).triage;

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
    listGates: async () => [GATE],
    decideGate: async () => {},
    recordGateActivity: async () => {},
    listDecisions: async () => [DECISION],
    answerDecision: async () => {},
    getPretriage: async () => ({ correspondenceId: "c_1", triaged: 1, total: 3, entries: [] }),
    getApprovalOverrides: async () => ({}),
    setApprovalOverrides: async () => {},
    ...over,
  };
  return { dataSource, session };
}

function form(fields: Record<string, string>): { body: string; headers: Record<string, string> } {
  return { body: new URLSearchParams(fields).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } };
}

const SLUG = "the-politics-of-visibility";

describe("the dossier's disposition controls (§5.7; REQ-BETA-6)", () => {
  it("renders the five verbs + a note + optional reason chips on every FINALIZED finding — none while provisional", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/review/run_1`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // two finalized findings carry the form; the provisional one does not.
    expect(html.match(/data-disposition-form="true"/g)).toHaveLength(2);
    expect(html).toContain(`action="/p/${SLUG}/review/run_1/findings/f_1/disposition"`);
    for (const verb of ["accept", "adapt", "rebut", "defer", "escalate"]) {
      expect(html).toContain(`data-verb="${verb}"`);
    }
    expect(html).toContain('name="note"');
    for (const code of ["wrong", "stylistic_disagreement", "already_knew", "too_costly", "not_this_round", "other"]) {
      expect(html).toContain(`data-reason-chip="${code}"`);
    }
    // f_2's recorded defer marks its verb selected and pre-fills the note (reversible until freeze).
    expect(html).toContain('data-verb="defer" data-selected="true"');
    // the pre-triage line reports the decided count (REQ-IDE-28).
    expect(html).toContain('data-pretriage-line="true"');
  });

  it("POST forwards verb/note/reason_code/adapted_text and bounces back with ?disposed=", async () => {
    const recordDisposition = vi.fn(async () => ({ id: "dsp_1", findingId: "f_1", kind: "adapt", status: "proposed" }));
    const app = createWebApp(makeDeps({ recordDisposition }));
    const res = await app.request(`/p/${SLUG}/review/run_1/findings/f_1/disposition`, {
      method: "POST",
      ...form({ verb: "adapt", note: "", adapted_text: "the fixed wording", reason_code: "already_knew", next: `/p/${SLUG}/review/run_1` }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/review/run_1?disposed=f_1`);
    expect(recordDisposition).toHaveBeenCalledWith(
      expect.anything(),
      "proj_pv",
      "f_1",
      expect.objectContaining({ kind: "adapt", adaptedText: "the fixed wording", reasonCode: "already_knew" }),
    );
    // empty note → no rationale key at all.
    expect(recordDisposition.mock.calls[0]![3]).not.toHaveProperty("rationale");
  });

  it("a 422 (rationale required) re-renders the dossier with the error under the card", async () => {
    const app = createWebApp(
      makeDeps({ recordDisposition: async () => { throw new ApiError(422, "invalid_disposition"); } }),
    );
    const res = await app.request(`/p/${SLUG}/review/run_1/findings/f_1/disposition`, {
      method: "POST",
      ...form({ verb: "rebut", note: "" }),
    });
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain("a rationale is required for rebut");
    expect(html).toContain('role="alert"');
  });

  it("a 409 (frozen at delivery) re-renders with the frozen notice", async () => {
    const app = createWebApp(
      makeDeps({ recordDisposition: async () => { throw new ApiError(409, "frozen"); } }),
    );
    const res = await app.request(`/p/${SLUG}/review/run_1/findings/f_1/disposition`, {
      method: "POST",
      ...form({ verb: "accept" }),
    });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("frozen");
  });

  it("the project-scoped POST (a gate row's per-finding override) bounces back to /p/:slug", async () => {
    const recordDisposition = vi.fn(async () => ({ id: "dsp_1", findingId: "f_1", kind: "rebut", status: "proposed" }));
    const app = createWebApp(makeDeps({ recordDisposition }));
    const res = await app.request(`/p/${SLUG}/findings/f_1/disposition`, {
      method: "POST",
      ...form({ verb: "rebut", note: "the stat is fine", next: `/p/${SLUG}` }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}?disposed=f_1`);
  });
});

describe("the Needs-you gate cards + Decisions list on the project page (§6.4)", () => {
  it("renders the approve_triage card with the ledger (escalations flagged, 'Approve proposals')", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-needs-you="true"');
    expect(html).toContain('data-gate-card="approve_triage"');
    expect(html).toContain("Approve proposals");
    expect(html).toContain('data-triage-ledger="true"');
    // the wait-default card shows NO presence timer.
    expect(html).not.toContain("data-presence-timer");
    // per-row overrides ride the same disposition control.
    expect(html).toContain(`action="/p/${SLUG}/findings/f_1/disposition"`);
    // the Decisions list carries the escalation ask with inline options.
    expect(html).toContain("Escalated finding: A citation is misstated.");
    expect(html).toContain('value="dismiss"');
  });

  it("POST a gate decision → decideGate; POST a decision answer → answerDecision", async () => {
    const decideGate = vi.fn(async () => {});
    const answerDecision = vi.fn(async () => {});
    const app = createWebApp(makeDeps({ decideGate, answerDecision }));

    const g = await app.request(`/p/${SLUG}/gates/gate_1`, { method: "POST", ...form({ action: "approve", guidance: "keep it tight", standing: "on" }) });
    expect(g.status).toBe(302);
    expect(decideGate).toHaveBeenCalledWith(expect.anything(), "proj_pv", "gate_1", { action: "approve", guidance: "keep it tight", standingRule: true });

    const d = await app.request(`/p/${SLUG}/decisions/dcr_1`, { method: "POST", ...form({ answer: "dismiss" }) });
    expect(d.status).toBe(302);
    expect(answerDecision).toHaveBeenCalledWith(expect.anything(), "proj_pv", "dcr_1", "dismiss");
  });

  it("only an auto-proceed card carries the presence-ping script; its pings hit the activity route (REQ-SPEC-18)", async () => {
    const recordGateActivity = vi.fn(async () => {});
    const app = createWebApp(makeDeps({ listGates: async () => [GATE, GATE_AUTO], recordGateActivity }));
    const res = await app.request(`/p/${SLUG}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // the wait-default approve_triage card emits NO presence script; the auto-proceed scope card does.
    expect(html).toContain(`data-gate-card="approve_triage"`);
    expect(html).toContain(`/p/${SLUG}/gates/gate_auto/activity`);
    expect(html).not.toContain(`/p/${SLUG}/gates/gate_1/activity`);
    // the script pings present/blur/reading at the card's activity endpoint.
    expect(html).toContain("sendBeacon");

    const p = await app.request(`/p/${SLUG}/gates/gate_auto/activity`, { method: "POST", ...form({ activity: "present" }) });
    expect(p.status).toBe(204);
    expect(recordGateActivity).toHaveBeenCalledWith(expect.anything(), "proj_pv", "gate_auto", "present");
    // an invalid activity value is rejected before the data source is touched.
    const bad = await app.request(`/p/${SLUG}/gates/gate_auto/activity`, { method: "POST", ...form({ activity: "nope" }) });
    expect(bad.status).toBe(422);
  });
});

describe("phone width — the SAME components at the narrow input set (§10.1; REQ-SPEC-20)", () => {
  const MOBILE = { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile" } };

  it("the dossier stacks the same five verbs + note compactly", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/review/run_1`, MOBILE);
    const html = await res.text();
    expect(html).toContain('data-disposition-form="true" data-compact="true"');
    for (const verb of ["accept", "adapt", "rebut", "defer", "escalate"]) {
      expect(html).toContain(`data-verb="${verb}"`);
    }
    expect(html).toContain('name="note"');
    expect(html).not.toContain("bulk");
  });

  it("the gate card narrows to Approve / Wait for me / Stop — same component, same contract", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}`, MOBILE);
    const html = await res.text();
    expect(html).toContain('data-gate-card="approve_triage"');
    for (const a of ["approve", "wait", "stop"]) expect(html).toContain(`data-action="${a}"`);
    expect(html).not.toContain('data-action="approve_autonomous"');
    expect(html).not.toContain('data-action="keep_planning"');
  });
});

describe("the per-project approve_triage 24-h opt-in (§6.4 R3)", () => {
  it("the project page renders the opt-in checkbox (unchecked while waiting by default)", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request(`/p/${SLUG}`)).text();
    expect(html).toContain('data-approval-opt-in="true"');
    expect(html).toContain('name="approve_triage_24h"');
    expect(html).toContain("Auto-approve triage after 24 h");
    expect(html).not.toContain('name="approve_triage_24h" checked');
  });

  it("reflects a stored override as checked; POST merges the opt-in and bounces back", async () => {
    const setApprovalOverrides = vi.fn(async () => {});
    const app = createWebApp(
      makeDeps({
        getApprovalOverrides: async () => ({ approve_triage: 24 * 60 * 60 * 1000 }),
        setApprovalOverrides,
      }),
    );
    const html = await (await app.request(`/p/${SLUG}`)).text();
    expect(html).toContain('name="approve_triage_24h" checked=""');

    const res = await app.request(`/p/${SLUG}/approval-overrides`, {
      method: "POST",
      ...form({ approve_triage_24h: "on" }),
    });
    expect(res.status).toBe(302);
    expect(setApprovalOverrides).toHaveBeenCalledWith(expect.anything(), "proj_pv", {
      approve_triage: 24 * 60 * 60 * 1000,
    });

    // unchecking removes just the triage key, preserving any other overrides.
    const res2 = await app.request(`/p/${SLUG}/approval-overrides`, { method: "POST", ...form({}) });
    expect(res2.status).toBe(302);
    expect(setApprovalOverrides).toHaveBeenLastCalledWith(expect.anything(), "proj_pv", {});
  });
});

describe("the Revise sheet's pre-triage line (REQ-IDE-28)", () => {
  it("shows 'you pre-triaged N of M' on the revise sheet only", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(`/p/${SLUG}/run?workflow=revise`);
    const html = await res.text();
    expect(html).toContain('data-pretriage-line="true"');
    expect(html).toContain("1"); // triaged
    const review = await app.request(`/p/${SLUG}/run?workflow=review`);
    expect(await review.text()).not.toContain('data-pretriage-line="true"');
  });
});
