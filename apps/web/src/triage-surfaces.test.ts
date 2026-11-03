import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ApiError,
  type ProjectRow,
  type GateCardDto,
  type DecisionItemDto,
  type ApprovalSettingsDto,
} from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource, DossierData } from "./data.js";
import { buildRunCardView } from "@rhema/findings-core";
import { ProjectOverviewBody } from "./page-chrome.js";

// PRB.05 — the web shell's triage surfaces (§5.7/§6.4/§10.1): the dossier renders the five-verb disposition
// controls on every finalized finding; the disposition POST forwards verb/note/reason_code/adapted_text and
// re-renders on a 422/409; the project page mounts the gate cards + the Decisions list; the phone-width
// variant comes from the SAME components keyed off the request's mobile hints (REQ-SPEC-20).

// R7RO.1 — the only forced-SSR arm left is PHONE (ADR-128: the `showcase` arm is deleted; a
// showcase row on desktop serves the shell). The SSR render asserts below pin that arm — GETs
// expecting SSR markup send PHONE.
const PHONE = { headers: { "sec-ch-ua-mobile": "?1" } };

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_pv",
    slug: "the-politics-of-visibility",
    title: "The Politics of Visibility",
    // R7RO.1 — `showcase: true` is a read-only row fact now (the twins carry
    // `project.readOnlyProject{showcase}`); it no longer forces SSR — the PHONE request does.
    showcase: true,
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
  runSummary: {
    runId: "run_1",
    workflow: "review",
    state: "completed",
    createdAt: "2026-11-01T00:00:00Z",
    card: buildRunCardView({
      runId: "run_1",
      state: "completed",
      phases: [],
      spentCredits: 100,
      capCredits: 840,
    }),
  },
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
      disposition: {
        kind: "defer",
        rationale: "Not this round",
        by: { kind: "user", userId: "u_1" },
        at: "2026-09-16T00:00:00Z",
        frozen: false,
      },
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
  accessReport: {
    seat: "editor",
    mountedPathCount: 0,
    fetches: 0,
    deniedAttempts: 0,
    violations: 0,
    subagents: [],
  },
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
      {
        findingId: "f_1",
        ordinal: 1,
        title: "The injury is the least-evidenced thing.",
        severity: "blocking",
      },
      {
        findingId: "f_2",
        ordinal: 2,
        title: "A citation is misstated.",
        severity: "major",
        disposition: { kind: "escalate", rationale: "my call", actor: "user" },
      },
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

function makeDeps(
  over: Partial<DataSource> = {},
  session: WebDeps["session"] = () => ({}),
): WebDeps {
  const dataSource: DataSource = {
    listProjects: async () => PROJECTS,
    getDossier: async () => DOSSIER,
    checkInvite: async () => ({ ok: true }),
    previewImport: async () => {
      throw new Error("unused");
    },
    createImport: async () => ({ draftId: "d" }),
    createRun: async () => ({ runId: "run_new", state: "queued" }),
    recordDisposition: async () => ({
      id: "dsp_1",
      findingId: "f_1",
      kind: "accept",
      status: "proposed",
    }),
    listGates: async () => [GATE],
    decideGate: async () => {},
    recordGateActivity: async () => {},
    listDecisions: async () => [DECISION],
    answerDecision: async () => {},
    getPretriage: async () => ({ correspondenceId: "c_1", triaged: 1, total: 3, entries: [] }),
    getApprovalOverrides: async () => ({}),
    setApprovalOverrides: async () => {},
    getBillingBalance: async () => ({
      spendableCredits: 200_000,
      suspended: false,
      clawbackDebt: 0,
    }),
    recordExhaustedPrompt: async () => undefined,
    ...over,
  };
  return { dataSource, session };
}

function form(fields: Record<string, string>): { body: string; headers: Record<string, string> } {
  return {
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
}

const SLUG = "the-politics-of-visibility";

describe("the dossier's disposition controls (§5.7; REQ-BETA-6)", () => {
  // SPA.27 (REQ-TST-1) — the disposition-form render asserts (the five verbs × the three §5.7
  // surfaces, the reason chips, the selected-verb pre-fill, the pre-triage line) retired with the
  // dossier document: the findings leaf paints them off the twin (findings surface dom tests).
  // The POST contract — the forward, the flashes, the refusals — stays server-owned below.

  it("POST forwards verb/note/reason_code/adapted_text and bounces back with ?disposed=", async () => {
    const recordDisposition = vi.fn(async () => ({
      id: "dsp_1",
      findingId: "f_1",
      kind: "adapt",
      status: "proposed",
    }));
    const app = createWebApp(makeDeps({ recordDisposition }));
    const res = await app.request(`/p/${SLUG}/review/run_1/findings/f_1/disposition`, {
      method: "POST",
      ...form({
        verb: "adapt",
        note: "",
        adapted_text: "the fixed wording",
        reason_code: "already_knew",
        next: `/p/${SLUG}/review/run_1`,
      }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}/review/run_1?disposed=f_1`);
    expect(recordDisposition).toHaveBeenCalledWith(
      expect.anything(),
      "proj_pv",
      "f_1",
      expect.objectContaining({
        kind: "adapt",
        adaptedText: "the fixed wording",
        reasonCode: "already_knew",
      }),
    );
    // empty note → no rationale key at all.
    expect(recordDisposition.mock.calls[0]![3]).not.toHaveProperty("rationale");
  });

  it("a 422 (rationale required) bounces back with the ferr/fmsg flash the leaf paints under the card", async () => {
    const app = createWebApp(
      makeDeps({
        recordDisposition: async () => {
          throw new ApiError(422, "invalid_disposition");
        },
      }),
    );
    const res = await app.request(`/p/${SLUG}/review/run_1/findings/f_1/disposition`, {
      method: "POST",
      ...form({ verb: "rebut", note: "" }),
    });
    // SPA.27 — the dossier re-render is deleted: the refusal rides the SAME `ferr`/`fmsg` flash
    // vocabulary the finding-action posts carry; the leaf renders the error under the card.
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain(`/p/${SLUG}/review/run_1?ferr=f_1`);
    expect(loc).toContain("fmsg=");
    expect(decodeURIComponent(loc)).toContain("a rationale is required for rebut");
  });

  it("a 409 (frozen at delivery) bounces back with the frozen notice's flash", async () => {
    const app = createWebApp(
      makeDeps({
        recordDisposition: async () => {
          throw new ApiError(409, "frozen");
        },
      }),
    );
    const res = await app.request(`/p/${SLUG}/review/run_1/findings/f_1/disposition`, {
      method: "POST",
      ...form({ verb: "accept" }),
    });
    expect(res.status).toBe(302);
    const loc = decodeURIComponent(res.headers.get("location") ?? "");
    expect(loc).toContain(`/p/${SLUG}/review/run_1?ferr=f_1`);
    expect(loc).toContain("frozen");
  });

  it("the project-scoped POST (a gate row's per-finding override) bounces back to /p/:slug", async () => {
    const recordDisposition = vi.fn(async () => ({
      id: "dsp_1",
      findingId: "f_1",
      kind: "rebut",
      status: "proposed",
    }));
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
    // R7RO.1 — the desktop document is the shell on every row; these render asserts pin the
    // surviving forced-SSR PHONE arm.
    const res = await app.request(`/p/${SLUG}`, PHONE);
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

    const g = await app.request(`/p/${SLUG}/gates/gate_1`, {
      method: "POST",
      ...form({ action: "approve", guidance: "keep it tight", standing: "on" }),
    });
    expect(g.status).toBe(302);
    expect(decideGate).toHaveBeenCalledWith(expect.anything(), "proj_pv", "gate_1", {
      action: "approve",
      guidance: "keep it tight",
      standingRule: true,
    });

    const d = await app.request(`/p/${SLUG}/decisions/dcr_1`, {
      method: "POST",
      ...form({ answer: "dismiss" }),
    });
    expect(d.status).toBe(302);
    expect(answerDecision).toHaveBeenCalledWith(expect.anything(), "proj_pv", "dcr_1", "dismiss");
  });

  it("only an auto-proceed card carries the presence-ping script; its pings hit the activity route (REQ-SPEC-18)", async () => {
    const recordGateActivity = vi.fn(async () => {});
    const app = createWebApp(
      makeDeps({ listGates: async () => [GATE, GATE_AUTO], recordGateActivity }),
    );
    const res = await app.request(`/p/${SLUG}`, PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    // the wait-default approve_triage card emits NO presence script; the auto-proceed scope card does.
    expect(html).toContain(`data-gate-card="approve_triage"`);
    expect(html).toContain(`/p/${SLUG}/gates/gate_auto/activity`);
    expect(html).not.toContain(`/p/${SLUG}/gates/gate_1/activity`);
    // the script pings present/blur/reading at the card's activity endpoint.
    expect(html).toContain("sendBeacon");

    const p = await app.request(`/p/${SLUG}/gates/gate_auto/activity`, {
      method: "POST",
      ...form({ activity: "present" }),
    });
    expect(p.status).toBe(204);
    expect(recordGateActivity).toHaveBeenCalledWith(
      expect.anything(),
      "proj_pv",
      "gate_auto",
      "present",
    );
    // an invalid activity value is rejected before the data source is touched.
    const bad = await app.request(`/p/${SLUG}/gates/gate_auto/activity`, {
      method: "POST",
      ...form({ activity: "nope" }),
    });
    expect(bad.status).toBe(422);
  });
});

describe("phone width — the SAME components at the narrow input set (§10.1; REQ-SPEC-20)", () => {
  const MOBILE = { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile" } };

  // SPA.27 — the compact dossier render asserts retired with the document (the flipped surfaces
  // serve the shell at EVERY width; the leaf's own compact layout is client-side now). The gate
  // card's phone asserts below survive — `/p/:slug` keeps its forced-SSR Page render on phone.

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
    // R7RO.1 — the only forced-SSR arm left is phone, where approval config is the §10.1 ✗
    // column: the checkbox is withheld there. The desktop render is pinned on the shared
    // `ProjectOverviewBody` the leaf mounts (non-compact, no read-only reason).
    const app = createWebApp(makeDeps());
    const html = await (await app.request(`/p/${SLUG}`, PHONE)).text();
    expect(html).not.toContain('data-approval-opt-in="true"');
    expect(html).not.toContain('name="approve_triage_24h"');

    const body = renderToStaticMarkup(
      createElement(ProjectOverviewBody, { project: { slug: SLUG } }),
    );
    expect(body).toContain('data-approval-opt-in="true"');
    expect(body).toContain('name="approve_triage_24h"');
    expect(body).toContain("Auto-approve triage after 24 h");
    expect(body).not.toContain('name="approve_triage_24h" checked');
  });

  it("reflects a stored override as checked; POST merges the opt-in and bounces back", async () => {
    const setApprovalOverrides = vi.fn(async () => {});
    const app = createWebApp(
      makeDeps({
        getApprovalOverrides: async () => ({ approve_triage: 24 * 60 * 60 * 1000 }),
        setApprovalOverrides,
      }),
    );
    // the stored-override render is desktop chrome — the shared component's non-compact arm.
    const body = renderToStaticMarkup(
      createElement(ProjectOverviewBody, {
        project: { slug: SLUG },
        approvalOverrides: { approve_triage: 24 * 60 * 60 * 1000 },
      }),
    );
    expect(body).toContain('name="approve_triage_24h" checked=""');

    const res = await app.request(`/p/${SLUG}/approval-overrides`, {
      method: "POST",
      ...form({ approve_triage_24h: "on" }),
    });
    expect(res.status).toBe(302);
    expect(setApprovalOverrides).toHaveBeenCalledWith(expect.anything(), "proj_pv", {
      approve_triage: 24 * 60 * 60 * 1000,
    });

    // unchecking removes just the triage key, preserving any other overrides.
    const res2 = await app.request(`/p/${SLUG}/approval-overrides`, {
      method: "POST",
      ...form({}),
    });
    expect(res2.status).toBe(302);
    expect(setApprovalOverrides).toHaveBeenLastCalledWith(expect.anything(), "proj_pv", {});
  });
});

describe("the Revise sheet's pre-triage line (REQ-IDE-28)", () => {
  it("the twin carries `pretriage` on the revise sheet only", async () => {
    // SPA.27 — the sheet document is deleted; the pre-triage fact rides the twin (the leaf paints
    // 'you pre-triaged N of M' off it).
    const app = createWebApp(makeDeps());
    const res = await app.request(`/bff/p/${SLUG}/run?workflow=revise`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pretriage?: { triaged: number; total: number } };
    expect(body.pretriage).toEqual({ triaged: 1, total: 3 });
    const review = (await (await app.request(`/bff/p/${SLUG}/run?workflow=review`)).json()) as {
      pretriage?: unknown;
    };
    expect(review.pretriage).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// P1.09 — the full §6.4 approval surface on the web: the Needs-you ApprovalRow list (one <details> per
// gate, the IDENTICAL card inside), the §5.11 ordering, the one-time explainer, the Approvals settings
// section, the structured `ed.*` decode on the decide POST, and the per-run "autonomously" flag.

const GATE_DEADLINE: GateCardDto = {
  id: "gate_dl",
  runId: "run_d",
  kind: "approve_plan",
  workflow: "draft",
  openedAt: "2026-09-16T11:00:00Z",
  deadlineAt: "2026-09-17T10:00:00Z",
  pausedWhileReading: false,
  held: false,
  blocking: true,
  onExpiry: "proceed_conservative",
  spentCredits: 120,
  capCredits: 840,
};

const GATE_INFO: GateCardDto = {
  id: "gate_info",
  runId: "run_i",
  kind: "approve_scope",
  workflow: "review",
  openedAt: "2026-09-16T09:00:00Z",
  pausedWhileReading: false,
  held: false,
  blocking: false,
  onExpiry: "proceed_as_proposed",
  spentCredits: 100,
  capCredits: 840,
};

const SETTINGS = {
  policy: "named" as const,
  overrides: { approve_triage: 24 * 60 * 60 * 1000 },
  defaults: [
    {
      kind: "approve_plan",
      deadlineMs: 24 * 60 * 60 * 1000,
      onExpiry: "proceed_conservative",
      overridable: true,
    },
    { kind: "approve_triage", deadlineMs: null, onExpiry: "wait", overridable: true },
    { kind: "confirm_cost", deadlineMs: null, onExpiry: "cancel", overridable: false },
  ],
  standing: [
    {
      id: "gdn_1",
      body: "Always ask before apparatus over 1,000 words.",
      workflows: ["draft"],
      active: true,
      createdAt: "2026-09-10T00:00:00Z",
    },
  ],
  retired: [
    {
      id: "gdn_0",
      body: "An old rule.",
      workflows: [],
      active: false,
      createdAt: "2026-09-01T00:00:00Z",
    },
  ],
};

describe("P1.09 — the §6.4 approval surface on the web (AC1/AC5/AC6)", () => {
  it("each Needs-you row is a <details> ApprovalRow mounting the IDENTICAL card anatomy", async () => {
    const app = createWebApp(makeDeps({ listGates: async () => [GATE] }));
    const html = await (await app.request(`/p/${SLUG}`, PHONE)).text();
    expect(html).toContain('data-approval-row="gate_1"');
    expect(html).toContain("<details"); // SSR/no-JS — the row expands natively
    expect(html).toContain('data-approval-sheet="true"');
    expect(html).toContain('data-gate-card="approve_triage"');
    // the row itself carries kind + do-nothing on the summary (§5.11 — read before approving).
    expect(html).toContain('data-row-do-nothing="true"');
    expect(html).toContain('data-row-deadline="true"');
  });

  it("orders rows §5.11: deadline-bearing first (soonest), waiting next, informational last", async () => {
    const app = createWebApp(makeDeps({ listGates: async () => [GATE_INFO, GATE_DEADLINE, GATE] }));
    const html = await (await app.request(`/p/${SLUG}`, PHONE)).text();
    const order = [...html.matchAll(/data-approval-row="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["gate_dl", "gate_1", "gate_info"]);
  });

  it("the one-time explainer mounts on the first Approval card until dismissed (§5.11)", async () => {
    const fresh = createWebApp(makeDeps({ getExplainers: async () => ({ dismissed: [] }) }));
    const html = await (await fresh.request(`/p/${SLUG}`, PHONE)).text();
    expect(html).toContain('data-gate-explainer="true"');
    expect(html).toContain(`action="/p/${SLUG}/explainers/approvals/dismiss"`);

    const seen = createWebApp(
      makeDeps({ getExplainers: async () => ({ dismissed: ["approvals"] }) }),
    );
    expect(await (await seen.request(`/p/${SLUG}`, PHONE)).text()).not.toContain(
      "data-gate-explainer",
    );
  });

  it("the explainer dismiss POST hits the api seam and bounces back", async () => {
    const dismissExplainer = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(makeDeps({ dismissExplainer }));
    const res = await app.request(`/p/${SLUG}/explainers/approvals/dismiss`, {
      method: "POST",
      ...form({}),
    });
    expect(res.status).toBe(302);
    expect(dismissExplainer).toHaveBeenCalledWith(expect.anything(), "approvals");
  });

  it("the Approvals settings section renders the policy radios + per-kind grid + standing guidance", async () => {
    // R7RO.1 — the phone arm withholds approval policy config (§10.1 ✗); the desktop render is
    // pinned on the shared `ProjectOverviewBody` (the leaf mounts the same section).
    const app = createWebApp(makeDeps({ getApprovalSettings: async () => SETTINGS }));
    const phoneHtml = await (await app.request(`/p/${SLUG}`, PHONE)).text();
    expect(phoneHtml).not.toContain('data-approval-settings="true"');

    const body = renderToStaticMarkup(
      createElement(ProjectOverviewBody, {
        project: { slug: SLUG },
        approvalSettings: SETTINGS as ApprovalSettingsDto,
      }),
    );
    expect(body).toContain('data-approval-settings="true"');
    for (const p of ["named", "wait_each", "run_to_completion"]) {
      expect(body).toContain(`data-policy="${p}"`);
    }
    expect(body).toContain('name="policy" checked="" value="named"'); // the current pick renders checked
    // the standing row lists with a Retire affordance; the retired row shows in the audit list.
    expect(body).toContain("Always ask before apparatus over 1,000 words.");
    expect(body).toContain(`action="/p/${SLUG}/guidance/gdn_1/retire"`);
    expect(body).toContain("An old rule.");
  });

  it("POST /p/:slug/settings/approvals decodes the grid → policy + per-kind overrides", async () => {
    const putApprovalSettings = vi.fn(async () => SETTINGS);
    const app = createWebApp(makeDeps({ putApprovalSettings }));
    const res = await app.request(`/p/${SLUG}/settings/approvals`, {
      method: "POST",
      ...form({
        policy: "wait_each",
        ov_approve_plan: "wait", // remove → wait
        ov_approve_triage: String(6 * 60 * 60 * 1000), // add 6 h
        ov_confirm_cost: "", // spend kind — no control posts, ignored if it did
      }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/p/${SLUG}?approvals=saved`);
    expect(putApprovalSettings).toHaveBeenCalledWith(expect.anything(), "proj_pv", {
      policy: "wait_each",
      overrides: { approve_plan: null, approve_triage: 6 * 60 * 60 * 1000 },
    });
  });

  it("standing guidance add/retire forms forward to the api (§6.5)", async () => {
    const createProjectGuidance = vi.fn(async () => ({ ok: true as const, guidanceId: "gdn_2" }));
    const retireGuidance = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(makeDeps({ createProjectGuidance, retireGuidance }));
    const add = await app.request(`/p/${SLUG}/guidance`, {
      method: "POST",
      ...form({ body: "Prefer two-sentence paragraphs.", workflows: "draft, revise" }),
    });
    expect(add.status).toBe(302);
    expect(createProjectGuidance).toHaveBeenCalledWith(expect.anything(), "proj_pv", {
      body: "Prefer two-sentence paragraphs.",
      workflows: ["draft", "revise"],
    });
    const retire = await app.request(`/p/${SLUG}/guidance/gdn_1/retire`, {
      method: "POST",
      ...form({}),
    });
    expect(retire.status).toBe(302);
    expect(retireGuidance).toHaveBeenCalledWith(expect.anything(), "proj_pv", "gdn_1");
  });

  it("the decide POST decodes the card's ed.* fields into edits + the per-run override", async () => {
    const decideGate = vi.fn(async () => {});
    const app = createWebApp(makeDeps({ decideGate, listGates: async () => [GATE_DEADLINE] }));
    const res = await app.request(`/p/${SLUG}/gates/gate_dl`, {
      method: "POST",
      ...form({
        action: "approve",
        "ed.note": "trimmed the middle",
        "ed.spine.0.ord": "2",
        "ed.spine.1.strike": "1",
        "ed.spine.new.text": "Costs follow attention.",
        "ed.sec.0.targetWords": "900",
        "ed.runOverride": "wait",
      }),
    });
    expect(res.status).toBe(302);
    expect(decideGate).toHaveBeenCalledWith(
      expect.anything(),
      "proj_pv",
      "gate_dl",
      expect.objectContaining({
        action: "approve",
        edits: expect.objectContaining({
          note: "trimmed the middle",
          spine: expect.arrayContaining([
            { index: 0, order: 2 },
            { index: 1, strike: true },
          ]),
          newClaims: [{ text: "Costs follow attention." }],
          sections: [{ index: 0, targetWords: 900 }],
        }),
        // "this run only" resolved against the gate's REAL kind — never a client-named one.
        overrides: { approve_plan: null },
      }),
    );
  });

  it("the run sheet's 'this run only, autonomously' posts autoProceedRun to createRun", async () => {
    const createRun = vi.fn(async () => ({
      runId: "run_auto",
      state: "queued" as const,
      deduped: false,
    }));
    const app = createWebApp(makeDeps({ createRun }));
    const res = await app.request(`/p/${SLUG}/run`, {
      method: "POST",
      ...form({
        workflow: "review",
        rigor: "standard",
        idempotencyKey: "idem_auto",
        estimateCredits: "560",
        capCredits: "840",
        modelTier: "balanced",
        autoRun: "on",
      }),
    });
    expect(res.status).toBe(302); // SPA.27 — the started re-render is deleted; success lands on the sheet URL
    expect(createRun).toHaveBeenCalledWith(
      expect.anything(),
      "proj_pv",
      expect.objectContaining({ autoProceedRun: true }),
    );
  });
});
