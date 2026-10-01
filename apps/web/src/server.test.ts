import { describe, it, expect, vi } from "vitest";
import { ApiError, type ProjectRow } from "@rhema/api-client";
import { createIpEmailThrottle } from "@rhema/contracts";
import { createWebApp, type WebDeps, type AuthOutcome } from "./server.js";
import type { DataSource, DossierData } from "./data.js";

// A minimal-but-representative delivered-review dossier fixture (PRB.04): a contradicted Tier-1 claim carrying a
// fetched URL, a two-source stance claim, an unanchored finding (Whole piece), a pre-triage-then-rejected
// conflict, a rubric cap, and an access_report the trust chip derives from.
const DOSSIER: DossierData = {
  slug: "the-politics-of-visibility",
  runId: "run_1",
  projectTitle: "The Politics of Visibility",
  versionLabel: "Review of v2",
  openObligations: 3,
  addressedObligations: 2,
  runCard: {
    runId: "run_1",
    state: "completed",
    phases: [
      { key: "reading_the_piece", ordinal: 1, status: "done" },
      { key: "checking_claims", ordinal: 2, status: "done", counters: [{ key: "claims", value: 56, of: 56 }] },
      { key: "mapping_the_field", ordinal: 3, status: "off" },
      { key: "second_read", ordinal: 4, status: "done" },
    ],
    spentCredits: 412,
    capCredits: 1860,
  },
  letterTitle: "The Politics of Visibility",
  letterSections: [
    { id: "verdict", title: "Verdict", paragraphs: ["The center holds."] },
    { id: "one-thing", title: "The one thing", paragraphs: ["Answer the strongest counterargument."], findingRefs: [{ findingId: "f_1", label: "See finding 1" }] },
  ],
  claims: [
    { id: "cl_12", correspondenceId: "c_1", draftId: "d_1", ordinal: 12, text: "The court struck it down.", tier: 1, verdict: "contradicted", url: "https://www.courtlistener.com/o/1?x=1", normalizedUrl: "https://courtlistener.com/o/1", accessedAt: "2026-09-16T00:00:00Z", humanAdded: false },
    { id: "cl_20", correspondenceId: "c_1", draftId: "d_1", ordinal: 20, text: "A contested reading.", tier: 2, verdict: "misleading_in_context", humanAdded: false, sources: [
      { url: "https://a.test/s", normalizedUrl: "https://a.test/s", accessedAt: "2026-09-16T00:00:00Z", stance: "supports" },
      { url: "https://courtlistener.com/o/1", normalizedUrl: "https://courtlistener.com/o/1", accessedAt: "2026-09-16T00:00:00Z", stance: "contradicts" },
    ] },
    { id: "cl_30", correspondenceId: "c_1", draftId: "d_1", ordinal: 30, text: "The most important essay of the decade.", tier: 3, verdict: "unverifiable", kind: "interpretive", humanAdded: false },
  ],
  fetchLog: ["https://courtlistener.com/o/1"],
  findings: [
    { id: "f_1", correspondenceId: "c_1", draftId: "d_1", kind: "argument", severity: "blocking", origin: "both", anchor: null, title: "The injury is the least-evidenced thing in the piece.", body: "Asserted more than shown.", rubricDims: [], provisional: false },
    { id: "f_2", correspondenceId: "c_1", draftId: "d_1", kind: "claim", severity: "major", origin: "editor", anchor: { blockId: "b1", quote: "q", startOffset: 0, endOffset: 1, confidence: 1 }, title: "A load-bearing citation is misstated.", body: "The ruling did the opposite.", rubricDims: [], provisional: false },
    { id: "f_conf", correspondenceId: "c_1", draftId: "d_1", kind: "discourse", severity: "major", origin: "second_read", reconciliation: "rejected", anchor: { blockId: "b2", quote: "z", startOffset: 0, endOffset: 1, confidence: 1 }, title: "The lineage claim.", body: "Withdrawn by the second read.", rubricDims: [], provisional: false, disposition: { kind: "accept", by: { kind: "user", userId: "u_1" }, at: "2026-09-16T00:00:00Z", frozen: false } },
    { id: "f_rej", correspondenceId: "c_1", draftId: "d_1", kind: "craft", severity: "minor", origin: "second_read", reconciliation: "rejected", anchor: null, title: "A withdrawn craft note.", body: "On reflection, fine.", rubricDims: [], provisional: false },
  ],
  rubric: [
    { dimension: "thesis_contribution", score: 4 },
    { dimension: "argument_rigor", score: 3 },
    { dimension: "evidence_accuracy", score: 2, cap: { at: 2, reason: "a contradicted Tier-1 claim caps Evidence at 2", entailedByFindingOrdinal: 12 } },
    { dimension: "originality_situatedness", score: 3 },
    { dimension: "structure", score: 4 },
    { dimension: "prose", score: 5 },
    { dimension: "voice_audience_fit", score: 4 },
    { dimension: "intellectual_honesty", score: 5 },
  ],
  accessReport: { seat: "editor", mountedPathCount: 12, fetches: 52, deniedAttempts: 1, violations: 0, subagents: [{ label: "Second read", inputsKind: "explicit_files", fileCount: 1 }] },
};

// AC1 (invite gating), AC2 (state-fn rows), AC3 (read-only sample dossier), AC5 (no pricing). Driven via
// Hono's app.request (no network), with an in-memory data source + injected session/auth seams.

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_pv",
    slug: "the-politics-of-visibility",
    title: "The Politics of Visibility",
    state: {
      key: "edited_by_you",
      pill: "Edited by you",
      overlay: null,
      suggested: { action: "revise_using_edits", label: "Revise using your edits" },
    },
  },
  {
    id: "proj_new",
    slug: "new-essay",
    title: "New Essay",
    state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "review", label: "Review" } },
  },
];

const PREVIEW = {
  sourceFormat: "html" as const,
  markdown: "## Heading\n\nA paragraph.\n\n<!-- rhema:unconverted id=\"unconv-1\" -->\n<iframe></iframe>\n<!-- /rhema:unconverted -->\n",
  counts: { words: 3, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
  warnings: [{ kind: "unconverted_span" as const, message: "1 iframe block could not be converted — kept verbatim", anchor: { blockId: "unconv-1", quote: "<iframe>", startOffset: 0, endOffset: 8, confidence: 1 } }],
  unconverted: [{ blockId: "unconv-1", raw: "<iframe></iframe>", reason: "<iframe> is not convertible" }],
  quality: "partial" as const,
  qualityNotes: [],
};

function makeDeps(
  over: Partial<WebDeps> = {},
  checkInvite?: DataSource["checkInvite"],
  signup?: DataSource["signup"],
  checkSession: DataSource["checkSession"] = async () => true,
): WebDeps {
  return {
    dataSource: {
      checkSession,
      listProjects: async () => PROJECTS,
      checkInvite: checkInvite ?? (async (code) => (code === "GOOD" ? { ok: true } : { ok: false, reason: "unknown" })),
      // The api's POST /signup stand-in (PRB.13): "GOOD" redeems, anything else refuses like the real
      // invite reasons; a missing code answers `invite_required` (the api's invite-mode refusal).
      signup:
        signup ??
        (async (req) =>
          req.code === "GOOD"
            ? { ok: true as const, created: true }
            : req.code == null
              ? { ok: false as const, status: 403, error: "invite_required" }
              : { ok: false as const, status: 403, error: "unknown" }),
      previewImport: async () => ({ preview: PREVIEW, quarantineKey: "quarantine/ws1/up1" }),
      createImport: async () => ({ draftId: "d_new" }),
      createRun: async () => ({ runId: "run_new", state: "queued", deduped: false }),
      getDossier: async () => DOSSIER,
      getBillingBalance: async () => ({ spendableCredits: 200_000, suspended: false, clawbackDebt: 0 }),
      recordExhaustedPrompt: async () => undefined,
    },
    session: () => null,
    ...over,
  };
}

function form(fields: Record<string, string>): { body: string; headers: Record<string, string> } {
  return {
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
}

describe("AC1 — invite gating", () => {
  it("refuses signup with no code (no auth attempted)", async () => {
    const beginAuth = vi.fn<(m: string, a: { code: string; email?: string }) => Promise<AuthOutcome>>();
    const app = createWebApp(makeDeps({ beginAuth }));
    const res = await app.request("/login", { method: "POST", ...form({ email: "a@b.com", method: "magic_link" }) });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("An invitation code is required");
    expect(beginAuth).not.toHaveBeenCalled();
  });

  it("refuses signup with an invalid code (no auth attempted)", async () => {
    const beginAuth = vi.fn<(m: string, a: { code: string; email?: string }) => Promise<AuthOutcome>>();
    const app = createWebApp(makeDeps({ beginAuth }));
    const res = await app.request("/login", { method: "POST", ...form({ code: "NOPE", email: "a@b.com", method: "magic_link" }) });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("code isn"); // "That invitation code isn't valid." (apostrophe HTML-escaped)
    expect(beginAuth).not.toHaveBeenCalled();
  });

  it("with a valid code + email, begins the magic-link flow and shows the sent state", async () => {
    const beginAuth = vi.fn(async () => ({ sent: true }) as AuthOutcome);
    const app = createWebApp(makeDeps({ beginAuth }));
    const res = await app.request("/login", { method: "POST", ...form({ code: "GOOD", email: "a@b.com", method: "magic_link" }) });
    expect(res.status).toBe(200);
    expect(beginAuth).toHaveBeenCalledWith("magic_link", { code: "GOOD", email: "a@b.com" }, expect.anything());
    expect(await res.text()).toContain("Check your email");
  });

  it("with a valid code and Google, redirects into the OAuth start", async () => {
    const app = createWebApp(makeDeps({ beginAuth: async () => ({ redirect: "/auth/google/start" }) }));
    const res = await app.request("/login", { method: "POST", ...form({ code: "GOOD", method: "google" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/google/start");
  });

  it("Google validates the invite code-only (email resolved by OAuth, not required pre-auth)", async () => {
    const seen: (string | undefined)[] = [];
    const checkInvite: DataSource["checkInvite"] = async (code, email) => {
      seen.push(email);
      return code === "GOOD" ? { ok: true } : { ok: false, reason: "unknown" };
    };
    const app = createWebApp(makeDeps({ beginAuth: async () => ({ redirect: "/auth/google/start" }) }, checkInvite));
    const res = await app.request("/login", { method: "POST", ...form({ code: "GOOD", method: "google" }) });
    expect(res.status).toBe(302);
    expect(seen).toEqual([undefined]); // no email passed to checkInvite for the Google path
  });

  it("a magic link with no email is refused with a clear message", async () => {
    const beginAuth = vi.fn<(m: string, a: { code: string; email?: string }) => Promise<AuthOutcome>>();
    const app = createWebApp(makeDeps({ beginAuth }));
    const res = await app.request("/login", { method: "POST", ...form({ code: "GOOD", method: "magic_link" }) });
    expect(res.status).toBe(400);
    expect(beginAuth).not.toHaveBeenCalled();
  });

  it("an unauthenticated visitor to /app is sent to /login", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/app");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });
});

describe("PRB.13 — open self-serve signup (REQ-BETA-19 amended 2026-09-16)", () => {
  // The api stand-in for open mode: no code creates, a supplied bad code still refuses.
  const openSignup: DataSource["signup"] = async (req) =>
    req.code == null || req.code === "GOOD"
      ? { ok: true as const, created: true }
      : { ok: false as const, status: 403, error: "unknown" };

  it("GET /login in open mode renders the optional-code form (no invite-required copy)", async () => {
    const app = createWebApp(makeDeps({ signupMode: "open" }));
    const res = await app.request("/login");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("an invitation code is optional");
    expect(html).toContain("Invitation code (optional)");
    expect(html).not.toContain("an invitation code is required");
  });

  it("GET / redirects a viewer whose session still resolves — no redundant re-login", async () => {
    const app = createWebApp(
      makeDeps({ session: () => ({ cookie: "__Host-rhema.session_token=tok.sig" }) }),
    );
    const res = await app.request("/", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app");
  });

  it("GET / renders the invite page when the forwarded session is stale", async () => {
    const app = createWebApp(
      makeDeps(
        { session: () => ({ cookie: "__Host-rhema.session_token=stale.sig" }) },
        undefined,
        undefined,
        async () => false,
      ),
    );
    const res = await app.request("/");
    expect(res.status).toBe(200);
  });

  it("open mode: no code admits the account through POST /signup and sends the link", async () => {
    const beginAuth = vi.fn(async () => ({ sent: true }) as AuthOutcome);
    const signup = vi.fn(openSignup);
    const app = createWebApp(makeDeps({ signupMode: "open", beginAuth }, undefined, signup));
    const res = await app.request("/login", { method: "POST", ...form({ email: "a@b.com", method: "magic_link" }) });
    expect(res.status).toBe(200);
    expect(signup).toHaveBeenCalledWith({ email: "a@b.com", method: "magic_link" }); // no code field
    expect(beginAuth).toHaveBeenCalledWith("magic_link", { code: "", email: "a@b.com" }, expect.anything());
    expect(await res.text()).toContain("Check your email");
  });

  it("open mode: a supplied bad code still refuses (partner codes are never silently ignored)", async () => {
    const beginAuth = vi.fn();
    const app = createWebApp(makeDeps({ signupMode: "open", beginAuth }, undefined, openSignup));
    const res = await app.request("/login", { method: "POST", ...form({ code: "NOPE", email: "a@b.com", method: "magic_link" }) });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("code isn");
    // the error re-render keeps the open-mode copy (the optional label, not the invite-required note).
    expect(html).toContain("Invitation code (optional)");
    expect(html).not.toContain("an invitation code is required");
    expect(beginAuth).not.toHaveBeenCalled();
  });

  it("open mode: a magic link with no email is refused with the self-serve copy", async () => {
    const app = createWebApp(makeDeps({ signupMode: "open" }, undefined, openSignup));
    const res = await app.request("/login", { method: "POST", ...form({ method: "magic_link" }) });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Enter your email to get a sign-in link");
  });

  it("open mode: Google with no code skips the invite check entirely", async () => {
    const checkInvite = vi.fn(async () => ({ ok: false as const, reason: "unknown" }));
    const app = createWebApp(
      makeDeps({ signupMode: "open", beginAuth: async () => ({ redirect: "/auth/google/start" }) }, checkInvite),
    );
    const res = await app.request("/login", { method: "POST", ...form({ method: "google" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/google/start");
    expect(checkInvite).not.toHaveBeenCalled(); // admission runs post-OAuth in the live deploy
  });

  it("the landing page in open mode drops the invitation requirement (still no marketing)", async () => {
    const app = createWebApp(makeDeps({ signupMode: "open" }));
    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain("credits you add yourself");
    expect(html).not.toContain("Access is by invitation");
  });

  it("magic-link requests throttle per IP — the send is refused 429, never silent", async () => {
    const app = createWebApp(
      makeDeps(
        { signupMode: "open", magicLinkThrottle: createIpEmailThrottle({ perIp: 2, perEmail: 100, windowMs: 60_000 }) },
        undefined,
        openSignup,
      ),
    );
    const post = () => app.request("/login", { method: "POST", ...form({ email: "a@b.com", method: "magic_link" }) });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    const res = await post();
    expect(res.status).toBe(429);
    expect(await res.text()).toContain("Too many attempts");
  });

  it("magic-link requests throttle per email across IPs", async () => {
    const app = createWebApp(
      makeDeps(
        { signupMode: "open", magicLinkThrottle: createIpEmailThrottle({ perIp: 100, perEmail: 1, windowMs: 60_000 }) },
        undefined,
        openSignup,
      ),
    );
    const post = (ip: string) =>
      app.request("/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip },
        body: new URLSearchParams({ email: "a@b.com", method: "magic_link" }).toString(),
      });
    expect((await post("1.1.1.1")).status).toBe(200);
    expect((await post("2.2.2.2")).status).toBe(429); // same email, fresh IP ⇒ still blocked
  });

  it("an api-side 429 (account-creation throttle) propagates as the rate-limit copy", async () => {
    const signup: DataSource["signup"] = async () => ({ ok: false as const, status: 429, error: "rate_limited" });
    const app = createWebApp(makeDeps({ signupMode: "open" }, undefined, signup));
    const res = await app.request("/login", { method: "POST", ...form({ email: "a@b.com", method: "magic_link" }) });
    expect(res.status).toBe(429);
    expect(await res.text()).toContain("Too many attempts");
  });

  it("a run-sheet 403 with error=email_unverified renders the verification notice (not the suspension one)", async () => {
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      createRun: async () => {
        throw new ApiError(403, "http://api/projects/proj_pv/runs", undefined, "email_unverified");
      },
    };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/run", {
      method: "POST",
      ...form({ workflow: "review", rigor: "standard", idempotencyKey: "idem_uv", estimateCredits: "560", capCredits: "840" }),
    });
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("Runs need a verified email");
    expect(html).not.toContain("payment dispute");
    expect(html).not.toContain("Your run has started");
  });
});

describe("AC2 — project rows derive from the state function", () => {
  it("renders each project's pill + primary action from its state DTO", async () => {
    const app = createWebApp(makeDeps({ session: () => ({}) }));
    const res = await app.request("/app");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("The Politics of Visibility");
    expect(html).toContain("Edited by you");
    expect(html).toContain("Revise using your edits");
    expect(html).toContain("New Essay");
    expect(html).toContain(">Draft<");
    expect(html).toContain(">Review<");
    // rows link to the canonical /p/:project shape
    expect(html).toContain('href="/p/the-politics-of-visibility"');
  });
});

describe("AC3 — read-only sample dossier (REQ-POS-3)", () => {
  it("the public invite page renders the dossier with a contradicted Tier-1 claim + fetched URL, read-only", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("The Politics of Visibility");
    expect(html).toContain("Contradicted · Tier 1");
    expect(html).toContain('data-contradicted-tier1="true"');
    expect(html).toContain('data-fetched="true"');
    expect(html).toContain("courtlistener.com");
    expect(html).toContain('data-readonly="true"');
    // read-only: no disposition/triage controls on the public page
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });
});

describe("§5.3 import flow (deliverable 4)", () => {
  const authed = () => makeDeps({ session: () => ({}) });

  it("GET /p/:project/import renders the upload form", async () => {
    const res = await createWebApp(authed()).request("/p/the-politics-of-visibility/import");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Import a draft");
    expect(html).toContain('type="file"');
    expect(html).toContain("Convert and preview");
  });

  it("POST preview renders source-beside-converted, the count line, warnings + two actions", async () => {
    const res = await createWebApp(authed()).request("/p/the-politics-of-visibility/import/preview", {
      method: "POST",
      ...form({ paste: "<h1>Heading</h1><p>A paragraph.</p><iframe></iframe>" }),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Conversion preview");
    expect(html).toContain("3 words · 0 footnotes"); // count line
    expect(html).toContain("Source");
    expect(html).toContain("Converted");
    expect(html).toContain("could not be converted"); // the anchored warning (Conversion notes)
    expect(html).toContain("Create and fix later");
    expect(html).toContain("Fix now");
    expect(html).toContain("unconv-1"); // the unconverted block id shown in the notes
    // PRB.20 — the preview form replays the minted quarantine key so Create never re-uploads.
    expect(html).toContain('type="hidden" name="qk" value="quarantine/ws1/up1"');
  });

  it("POST create makes the draft and redirects to the project", async () => {
    const res = await createWebApp(authed()).request("/p/the-politics-of-visibility/import/create", {
      method: "POST",
      ...form({ paste: "hello" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility");
  });

  it("import is auth-gated (unauthenticated → /login)", async () => {
    const res = await createWebApp(makeDeps()).request("/p/x/import");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });
});

describe("AC5 — private + capped (REQ-BETA-19)", () => {
  it("no pricing route, and the shell carries the dark theme", async () => {
    const app = createWebApp(makeDeps());
    expect((await app.request("/pricing")).status).toBe(404);
    const home = await (await app.request("/")).text();
    expect(home).toContain('data-theme="dark"');
    expect(home.toLowerCase()).not.toContain("pricing");
    expect(home.toLowerCase()).not.toContain("plans");
  });

  it("healthz responds", async () => {
    const app = createWebApp(makeDeps());
    expect((await app.request("/healthz")).status).toBe(200);
  });
});

describe("run sheet (§5.6 — the launcher + the only paywall)", () => {
  const authed = () => makeDeps({ session: () => ({}) });

  it("GET /p/:project/run requires a session", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/run");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("renders the launcher: title, Rigor, the dollars-first estimate box and the single Paywall mount", async () => {
    const app = createWebApp(authed());
    const html = await (await app.request("/p/the-politics-of-visibility/run?workflow=review&rigor=standard&words=5180")).text();
    expect(html).toContain("Run the Editor");
    expect(html).toContain("Review v1 · 5,180 words");
    expect(html).toContain("≈ $"); // dollars-first
    expect(html).toContain("never more than");
    expect(html).toContain('data-paywall="run-sheet"');
    expect((html.match(/data-paywall="run-sheet"/g) ?? []).length).toBe(1); // REQ-GROWTH-13: exactly one mount
    expect(html).not.toMatch(/token/i); // AC6
  });

  it("renders the Fact-check verb from the query (Run label when no consent is needed)", async () => {
    const app = createWebApp(authed());
    // low-cost config (Base tier, few words) so the estimate stays under the consent threshold.
    const html = await (await app.request("/p/the-politics-of-visibility/run?workflow=fact_check&rigor=quick&modelTier=base&words=800")).text();
    expect(html).toContain("Fact-check v1");
    expect(html).toContain(">Run fact-check</button>"); // the visible button label (not the confirm label)
    expect(html).toContain('data-needs-consent="false"');
  });

  it("404 for an unknown project", async () => {
    const app = createWebApp(authed());
    expect((await app.request("/p/nope/run")).status).toBe(404);
  });

  it("POST /p/:project/run is the only run creator — it calls createRun and reports the run started", async () => {
    const calls: { projectId: string; workflow: string }[] = [];
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      createRun: async (_s, projectId, req) => {
        calls.push({ projectId, workflow: req.workflow });
        return { runId: "run_x", state: "queued", deduped: false };
      },
    };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/run", {
      method: "POST",
      ...form({ workflow: "review", rigor: "standard", idempotencyKey: "idem_sheet", estimateCredits: "560", capCredits: "840", modelTier: "balanced" }),
    });
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ projectId: "proj_pv", workflow: "review" }]);
    const html = await res.text();
    expect(html).toContain("Your run has started");
  });

  it("an insufficient-balance 402 re-renders the sheet with the resolution notice, not started (§14.6)", async () => {
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      createRun: async () => {
        throw new ApiError(402, "http://api/projects/proj_pv/runs");
      },
    };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/run", {
      method: "POST",
      ...form({ workflow: "review", rigor: "standard", idempotencyKey: "idem_x", estimateCredits: "560", capCredits: "840" }),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("more than your spendable balance");
    expect(html).not.toContain("Your run has started");
  });
});

describe("PRB.04 — the delivered-review dossier reading surface (§5.5/§5.7/§6.6)", () => {
  async function getDossierHtml(over: Partial<DossierData> = {}): Promise<string> {
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = { ...deps.dataSource, getDossier: async () => ({ ...DOSSIER, ...over }) };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/review/run_1");
    expect(res.status).toBe(200);
    return res.text();
  }

  it("requires a session (redirects to /login)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/review/run_1");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("renders every reading surface: run card, letter, claims, second read, rubric, findings", async () => {
    const html = await getDossierHtml();
    expect(html).toContain('data-run-card="run_1"');
    expect(html).toContain('data-letter-view="true"');
    expect(html).toContain('data-claims-table="true"');
    expect(html).toContain('data-second-read="true"');
    expect(html).toContain('data-rubric="true"');
    expect(html).toContain('data-findings-list="true"');
  });

  it("AC2/REQ-IDE-11 — the run card shows the off phase and the orchestrator credits, no agent prose", async () => {
    const html = await getDossierHtml();
    expect(html).toContain('data-phase-status="off"');
    expect(html).toContain("412 / 1,860 cr");
  });

  it("AC4 — the contradicted Tier-1 claim carries a fetched-✓ chip; the two-source claim shows both stances", async () => {
    const html = await getDossierHtml();
    expect(html).toContain('data-contradicted-tier1="true"');
    expect(html).toContain('data-fetched="true"'); // the courtlistener URL is in the fetch log
    expect(html).toContain('data-stance="supports"');
    expect(html).toContain('data-stance="contradicts"');
    expect(html).toContain("not a matter of verification"); // interpretive claim (REQ-OBJ-19)
  });

  it("AC5 — the rubric renders eight dot rows + a cap, with no aggregate", async () => {
    const html = await getDossierHtml();
    expect((html.match(/data-rubric-row=/g) ?? []).length).toBe(8);
    expect(html).toContain("capped at 2");
    expect(html.toLowerCase()).not.toContain("out of 40");
    expect(html).not.toMatch(/\/\s*40/);
  });

  it("AC6 — the trust chip renders text derived from access_report only", async () => {
    const html = await getDossierHtml();
    expect(html).toContain('data-trust-chip="true"');
    expect(html).toContain("52 URLs fetched");
    expect(html).toContain("second read received the draft only");
    expect(html).toContain("1 blocked attempt");
  });

  it("AC7 — an unanchored finding is listed under 'Whole piece', never dropped", async () => {
    const html = await getDossierHtml();
    expect(html).toContain('data-group="Whole piece"');
    expect(html).toContain("The injury is the least-evidenced thing in the piece.");
  });

  it("REQ-IDE-15 — the pre-triage-then-rejected finding renders a conflict row", async () => {
    const html = await getDossierHtml();
    expect(html).toContain('data-conflict-row="f_conf"');
    expect(html).toContain("the Editor withdrew it");
  });

  it("REQ-OBJ-6 — the version header carries the open/addressed obligation summary", async () => {
    const html = await getDossierHtml();
    expect(html).toContain('data-version-obligations="true"');
    expect(html).toContain("⚑ 3 open · 2 addressed");
  });

  it("404s for an unknown project slug (no dossier read attempted)", async () => {
    let called = false;
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = { ...deps.dataSource, getDossier: async () => { called = true; return DOSSIER; } };
    const app = createWebApp(deps);
    const res = await app.request("/p/no-such-project/review/run_1");
    expect(res.status).toBe(404);
    expect(called).toBe(false);
  });
});

// PRB.06 — the What-changed page (§5.8): the server-joined view SSRs (move cards + strip + unlinked +
// rebutted) and the hunk-comment POST forwards to the api then redirects back with the saved marker.
describe("PRB.06 — the revision (What-changed) page", () => {
  const WHAT_CHANGED = {
    ok: true as const,
    responseId: "corr_resp",
    reviewId: "corr_rev",
    beforeN: 2,
    afterN: 3,
    view: {
      strip: { addressed: 1, rebutted: 1, stillOpen: 2, moves: 1, hunks: 2 },
      moves: [
        {
          moveOrdinal: 1,
          moveId: "M1",
          title: "Restate the pillar",
          type: "argument",
          findings: [{ findingOrdinal: 1, kind: "accept" as const }],
          dischargeLines: [
            { obligationId: "obl_1", label: "OBL-1", lineage: "(F-01, carried from v2)", verifiedBy: "gap_check" as const, state: "discharged" },
          ],
          hunks: [
            {
              id: "h1",
              kind: "edited" as const,
              before: [{ index: 2, blockId: "b2", text: "The old claim.", startOffset: 0, endOffset: 14 }],
              after: [{ index: 2, blockId: "b2", text: "The restated claim.", startOffset: 0, endOffset: 19 }],
              charsChanged: 33,
            },
          ],
        },
      ],
      unlinked: {
        hunks: [
          {
            id: "h2",
            kind: "added" as const,
            before: [],
            after: [{ index: 4, blockId: "b4", text: "A new paragraph.", startOffset: 0, endOffset: 16 }],
            charsChanged: 16,
          },
        ],
        entries: [],
      },
      rebutted: [{ findingOrdinal: 2, title: "unsupported stat", rationale: "the stat is sourced in §2" }],
    },
  };

  function revisionDeps(extra: Partial<WebDeps["dataSource"]> = {}) {
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      getWhatChanged: async () => WHAT_CHANGED,
      commentOnHunk: async () => ({ guidanceId: "gdn_1", hunkId: "h1" }),
      ...extra,
    };
    return deps;
  }

  it("renders the strip, the move card with its discharge line + hunk, Unlinked, and the rebutted card", async () => {
    const app = createWebApp(revisionDeps());
    const res = await app.request("/p/the-politics-of-visibility/revisions/corr_resp");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-what-changed="true"');
    expect(html).toContain("v2 → v3");
    expect(html).toContain('data-move-card="M1"');
    expect(html).toContain("discharges OBL-1");
    expect(html).toContain("The restated claim.");
    expect(html).toContain('data-unlinked-group="true"');
    expect(html).toContain("A new paragraph.");
    expect(html).toContain('data-rebutted-finding="2"');
    expect(html).toContain("the stat is sourced in §2");
    // every hunk carries a no-JS comment form (→ Guidance for the next Revise).
    expect(html).toContain('action="/p/the-politics-of-visibility/revisions/corr_resp/hunks/h1/comments"');
    expect(html).toContain('action="/p/the-politics-of-visibility/revisions/corr_resp/hunks/h2/comments"');
  });

  it("the hunk-comment POST forwards the text and redirects back with the saved marker", async () => {
    const calls: { responseId: string; hunkId: string; text: string }[] = [];
    const deps = revisionDeps({
      commentOnHunk: async (_s, _p, responseId, hunkId, text) => {
        calls.push({ responseId, hunkId, text });
        return { guidanceId: "gdn_1", hunkId };
      },
    });
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/revisions/corr_resp/hunks/h1/comments", {
      method: "POST",
      ...form({ text: "tighten this" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/revisions/corr_resp?commented=h1");
    expect(calls).toEqual([{ responseId: "corr_resp", hunkId: "h1", text: "tighten this" }]);
    // the saved marker renders on the redirect target.
    const page = await app.request("/p/the-politics-of-visibility/revisions/corr_resp?commented=h1");
    expect((await page.text()).includes('data-comment-saved="true"')).toBe(true);
  });

  it("an empty comment is a no-op redirect (no api call)", async () => {
    let called = false;
    const deps = revisionDeps({
      commentOnHunk: async () => {
        called = true;
        return { guidanceId: "gdn_1", hunkId: "h1" };
      },
    });
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/revisions/corr_resp/hunks/h1/comments", {
      method: "POST",
      ...form({ text: "   " }),
    });
    expect(res.status).toBe(302);
    expect(called).toBe(false);
  });

  it("unauthenticated GET redirects to login; unknown response 404s", async () => {
    const unauth = createWebApp(makeDeps());
    expect((await unauth.request("/p/the-politics-of-visibility/revisions/corr_resp")).status).toBe(302);
    const deps = revisionDeps({
      getWhatChanged: async () => {
        throw new ApiError(404, "/x", "not_found");
      },
    });
    const res = await createWebApp(deps).request("/p/the-politics-of-visibility/revisions/nope");
    expect(res.status).toBe(404);
  });
});

// PRB.16 — the /api/auth/* proxy mount: present ⇒ forwarded verbatim to the api (the OAuth callback +
// cookies stay on this host); absent ⇒ 404 (the pre-PRB.16 posture). The relay itself lives in main.ts.
describe("PRB.16 — /api/auth/* proxy mount", () => {
  it("forwards the request to the authProxy seam and returns its response (set-cookie preserved)", async () => {
    const seen: string[] = [];
    const app = createWebApp(
      makeDeps({
        authProxy: async (req) => {
          seen.push(`${req.method} ${new URL(req.url).pathname}`);
          return new Response("ok", {
            status: 200,
            headers: [["set-cookie", "__Host-rhema.state=abc; Path=/; Secure; HttpOnly"]],
          });
        },
      }),
    );
    const res = await app.request("/api/auth/callback/google?code=x", { method: "GET" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("set-cookie")).toContain("__Host-rhema.state=abc");
    expect(seen).toEqual(["GET /api/auth/callback/google"]);
  });

  it("without the seam the surface 404s", async () => {
    const res = await createWebApp(makeDeps()).request("/api/auth/session");
    expect(res.status).toBe(404);
  });
});
