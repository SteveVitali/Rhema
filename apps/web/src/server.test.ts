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
      previewImport: async () => ({ status: "ready" as const, preview: PREVIEW, quarantineKey: "quarantine/ws1/up1" }),
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

  it("the landing page in open mode drops the invitation requirement (P1.17: the real §15.1 landing)", async () => {
    const app = createWebApp(makeDeps({ signupMode: "open" }));
    const res = await app.request("/");
    const html = await res.text();
    expect(html).toContain("An editorial board for everything you write.");
    expect(html).not.toContain("Access is by invitation");
    expect(html).toContain('href="/signup'); // the funnel's CTA — open mode needs no code
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
  it("the public landing renders the dossier with a contradicted Tier-1 claim + fetched URL, read-only", async () => {
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
    // read-only: the sample dossier's article carries no disposition/triage controls. (The page's
    // own drop-zone <form> is the §15.1 hero's — outside the dossier block; P1.17 put it there.)
    const dossier = html.slice(html.indexOf('data-readonly="true"'), html.indexOf("</article>"));
    expect(dossier).not.toContain("<button");
    expect(dossier).not.toContain("<form");
    expect(dossier).not.toContain('name="disposition"');
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

  it("PRB.21 — a pending preview renders the converting state + a meta-refresh poll on the quarantine key", async () => {
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      previewImport: async () => ({ status: "pending" as const, quarantineKey: "quarantine/ws1/up1" }),
    };
    const res = await createWebApp(deps).request("/p/the-politics-of-visibility/import/preview", {
      method: "POST",
      ...form({ paste: "hello" }),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("cold start can take a few minutes");
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain("/p/the-politics-of-visibility/import/preview?qk=quarantine%2Fws1%2Fup1");
    // no Create affordance on a pending page — there is nothing to create yet.
    expect(html).not.toContain("Create and fix later");
  });

  it("PRB.21 — the poll GET re-previews the quarantine key: pending stays pending, ready renders the preview", async () => {
    const deps = makeDeps({ session: () => ({}) });
    const seen: string[] = [];
    let ready = false;
    deps.dataSource = {
      ...deps.dataSource,
      previewImport: async (_s, input) => {
        seen.push(input.quarantineKey ?? "");
        return ready
          ? { status: "ready" as const, preview: PREVIEW, quarantineKey: input.quarantineKey! }
          : { status: "pending" as const, quarantineKey: input.quarantineKey! };
      },
    };
    const app = createWebApp(deps);
    const url = "/p/the-politics-of-visibility/import/preview?qk=" + encodeURIComponent("quarantine/ws1/up1");

    const p1 = await app.request(url);
    expect(p1.status).toBe(200);
    expect(await p1.text()).toContain("cold start can take a few minutes");

    ready = true;
    const p2 = await app.request(url);
    expect(p2.status).toBe(200);
    const html = await p2.text();
    expect(html).toContain("Conversion preview");
    expect(html).toContain("Create and fix later");
    // both polls replayed the SAME quarantine key — never a re-upload.
    expect(seen).toEqual(["quarantine/ws1/up1", "quarantine/ws1/up1"]);
  });

  it("PRB.21 — a create that hits conversion_pending drops back to the converting state", async () => {
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      createImport: async () => {
        throw new ApiError(409, "http://api/projects/proj_pv/import/create", undefined, "conversion_pending");
      },
    };
    const res = await createWebApp(deps).request("/p/the-politics-of-visibility/import/create", {
      method: "POST",
      ...form({ qk: "quarantine/ws1/up1" }),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("cold start can take a few minutes");
    expect(html).toContain('http-equiv="refresh"');
  });
});

describe("AC5 — public funnel (P1.17; the beta's invite-only rule yields to the §15 launch surface)", () => {
  it("/pricing renders the derived public page, and the shell carries the dark theme", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/pricing");
    expect(res.status).toBe(200);
    const pricing = await res.text();
    // §15.2: the derived cards + the dollars-shown annual toggle copy — every figure comes from
    // pricing.json via buildPricingPageData (the hand-edit trap lives in the contracts tests).
    expect(pricing).toContain("Pricing");
    expect(pricing).toContain("Annual");
    const home = await (await app.request("/")).text();
    expect(home).toContain('data-theme="dark"');
    expect(home.toLowerCase()).toContain("pricing"); // §15.1 section 10 links the public pricing page
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

  it("renders the Fact-check verb from the query (consent label — the floor now always crosses)", async () => {
    const app = createWebApp(authed());
    // PRB.25: the fact_check floor is (220 intercept + 2×100 churn + 27/claim) ×1.5 metered
    // coverage — even 0 claims prices 630 > the 500-credit consent threshold, so the verb now
    // always renders with the confirm label (the no-consent path is covered by the next test).
    const html = await (await app.request("/p/the-politics-of-visibility/run?workflow=fact_check&rigor=quick&modelTier=base&words=600")).text();
    expect(html).toContain("Fact-check v1");
    expect(html).toContain('data-run-label="Run fact-check"'); // the verb from the query
    expect(html).toContain(">Confirm and run</button>");
    expect(html).toContain('data-needs-consent="true"');
  });

  it("renders the plain Run label when the estimate stays under the consent threshold", async () => {
    const app = createWebApp(authed());
    // review/quick/base with fact_check off: (40 + 0.012×600 + 4×100 churn) ×1.25 ×0.6 ≈ 336 —
    // under 500 absolute and under 25% of the spendable balance ⇒ no second click.
    const html = await (await app.request("/p/the-politics-of-visibility/run?workflow=review&rigor=quick&modelTier=base&words=600&toggle.fact_check=off")).text();
    expect(html).toContain(">Run review</button>"); // the visible button label (not the confirm label)
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

  it("PRB.23 — the run POST forwards the submitted toggle set (sentinel resolves unchecked = off)", async () => {
    // An unchecked checkbox submits no field, so `toggleKeys` is the sentinel: every rendered
    // toggle is listed there, and only `toggle.<key>=on` means on. The resolved set reaches the
    // api, which freezes it into the run inputs as phase opt-out flags. `toggleRigor` marks the
    // rigor the boxes were rendered for — the POST honors the set only when it still matches.
    const seen: Record<string, boolean>[] = [];
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      createRun: async (_s, _p, req) => {
        seen.push({ ...(req.toggles ?? {}) });
        return { runId: "run_t", state: "queued", deduped: false };
      },
    };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/run", {
      method: "POST",
      ...form({
        workflow: "review", rigor: "quick", idempotencyKey: "idem_tgl",
        estimateCredits: "288", capCredits: "432",
        toggleRigor: "quick", // the sheet rendered this rigor — the set is coherent
        toggleKeys: "fact_check,discourse,second_read",
        "toggle.fact_check": "on",
        "toggle.discourse": "on",
        // second_read deliberately unchecked → absent → resolves false (an explicit off).
      }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ fact_check: true, discourse: true, second_read: false }]);
  });

  it("ECON.1 §6.5 — a stale form (rendered for another rigor) drops its toggle claims server-side", async () => {
    // The incident shape: the sheet rendered Standard's Advanced boxes (discourse + second_read
    // checked); the user switched the radio to Quick and submitted. Without the `toggleRigor`
    // guard those boxes claim discourse/second_read ON for a Quick run — the opposite of §6.5.
    // The POST drops the stale set; the api derives Quick's own defaults (both OFF).
    const seen: Record<string, boolean>[] = [];
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      createRun: async (_s, _p, req) => {
        seen.push({ ...(req.toggles ?? {}) });
        return { runId: "run_t", state: "queued", deduped: false };
      },
    };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/run", {
      method: "POST",
      ...form({
        workflow: "review", rigor: "quick", idempotencyKey: "idem_stale",
        estimateCredits: "288", capCredits: "432",
        toggleRigor: "standard", // rendered for Standard, submitted under Quick → stale
        toggleKeys: "fact_check,discourse,second_read",
        "toggle.fact_check": "on",
        "toggle.discourse": "on",
        "toggle.second_read": "on",
      }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([{}]); // no claim survives — Quick's rigor defaults govern
  });

  it("PRB.23 — no sentinel ⇒ no toggles sent (rigor defaults apply server-side)", async () => {
    const seen: (Readonly<Record<string, boolean>> | undefined)[] = [];
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      createRun: async (_s, _p, req) => {
        seen.push(req.toggles);
        return { runId: "run_t2", state: "queued", deduped: false };
      },
    };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/run", {
      method: "POST",
      ...form({ workflow: "review", rigor: "standard", idempotencyKey: "idem_tgl2", estimateCredits: "560", capCredits: "840" }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([{}]);
  });

  it("PRB.21 — GET renders the in-progress state (not the Run affordance) when the project has an active run", async () => {
    const deps = makeDeps({ session: () => ({}) });
    const running: ProjectRow[] = [
      { ...PROJECTS[0]!, activeRun: { runId: "run_live", state: "running" } },
      PROJECTS[1]!,
    ];
    deps.dataSource = { ...deps.dataSource, listProjects: async () => running };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/run");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("A run is already in progress on this project");
    expect(html).toContain('href="/p/the-politics-of-visibility/review/run_live"');
    // the Run affordance is REPLACED — a second click can never spawn a duplicate.
    expect(html).not.toContain("Confirm and run");
    expect(html).not.toContain('data-paywall="run-sheet"');
  });

  it("PRB.21 — a 409 run_in_progress on POST re-renders the in-progress state (never an error page)", async () => {
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      createRun: async () => {
        throw new ApiError(409, "http://api/projects/proj_pv/runs", undefined, "run_in_progress");
      },
      // the re-render refreshes the active-run fact from the project list.
      listProjects: async () => [
        { ...PROJECTS[0]!, activeRun: { runId: "run_live", state: "queued" } },
        PROJECTS[1]!,
      ],
    };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/run", {
      method: "POST",
      ...form({ workflow: "review", rigor: "standard", idempotencyKey: "idem_dup", estimateCredits: "560", capCredits: "840" }),
    });
    expect(res.status).toBe(409);
    const html = await res.text();
    expect(html).toContain("A run is already in progress on this project");
    expect(html).toContain('href="/p/the-politics-of-visibility/review/run_live"');
    expect(html).not.toContain("Your run has started");
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

  it("STB.2 — an api 404 (a run that completed with no dossier) renders the not-found page, not a 500", async () => {
    const deps = makeDeps({ session: () => ({}) });
    deps.dataSource = {
      ...deps.dataSource,
      getDossier: async () => {
        throw new ApiError(404, "http://api/projects/x/review/run_1/dossier");
      },
    };
    const app = createWebApp(deps);
    const res = await app.request("/p/the-politics-of-visibility/review/run_1");
    expect(res.status).toBe(404);
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

// -------------------------------------------------------------------------------------------------------------------
// P1.01 — the IDE shell mount (§5.1) + SSR theme stamping (REQ-IDE-38 amended): /p/:project… documents
// carry the seven-region markup + the deferred ide.js island + data-app-theme/data-paper BEFORE first
// paint; the same-origin theme writes forward through the data seam. The flat-shell pages stay flat.
describe("P1.01 — the IDE shell + theme stamping on /p/:project…", () => {
  const SESSION = { cookie: "tok" };
  const ideDeps = (over: Partial<DataSource> = {}): WebDeps =>
    makeDeps({
      session: () => SESSION,
      dataSource: {
        ...makeDeps().dataSource,
        listProjects: async () => [
          { ...PROJECTS[0]!, paperTheme: "follow" as const, headDraftId: "d_head" },
        ],
        listGates: async () => [],
        listDecisions: async () => [],
        getApprovalOverrides: async () => ({}),
        getProjectVoice: async () => {
          throw new ApiError(404, "none");
        },
        listVoices: async () => [],
        getSessionPrincipal: async () => ({ userId: "u_1", workspaceId: "ws_1", billingAccountId: "ba_1" }),
        getTheme: async () => ({ appTheme: "auto" as const }),
        setTheme: vi.fn(async () => ({ appTheme: "light" as const })),
        setPaperTheme: vi.fn(async () => ({ paperTheme: "dark" as const })),
        ...over,
      },
    });

  it("the project page mounts the seven regions + the deferred island + stamped theme attrs", async () => {
    const res = await createWebApp(ideDeps()).request("/p/the-politics-of-visibility");
    expect(res.status).toBe(200);
    const html = await res.text();
    // the seven §5.1 regions
    for (const cls of ["ide-rail", "ide-files", "ide-page", "ide-margin", "ide-timeline", "ide-desk", "ide-statusbar"]) {
      expect(html).toContain(cls);
    }
    expect(html).toContain('data-ide="1"');
    expect(html).toContain('src="/assets/ide.js"');
    // REQ-IDE-38: the stored pref stamps data-app-theme; auto resolves dark SSR-side (re-resolved pre-paint).
    expect(html).toContain('data-app-theme="auto"');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('data-paper="follow"');
    expect(html).toContain('data-user="u_1"');
    expect(html).toContain('data-theme-url="/ide/theme"');
    expect(html).toContain('data-paper-url="/p/the-politics-of-visibility/paper-theme"');
  });

  it("?focus=1 seeds the Focus view (the island strips the flag)", async () => {
    const html = await (await createWebApp(ideDeps()).request("/p/the-politics-of-visibility?focus=1")).text();
    expect(html).toContain('data-view="focus"');
  });

  it("a stored light pref stamps data-theme=light; an absent pref stamps no data-app-theme", async () => {
    const light = await (await createWebApp(ideDeps({ getTheme: async () => ({ appTheme: "light" as const }) }))
      .request("/p/the-politics-of-visibility")).text();
    expect(light).toContain('data-app-theme="light"');
    expect(light).toContain('data-theme="light"');
    const none = await (await createWebApp(
      ideDeps({ getTheme: async () => { throw new ApiError(500, "down"); } }),
    ).request("/p/the-politics-of-visibility")).text();
    expect(none).not.toContain('data-app-theme="'); // the <html> pref attr (data-app-theme-pref is the shell's)
    expect(none).toContain('data-theme="dark"'); // the default, never a broken page
  });

  it("the flat pages carry no IDE markup; the boot script is inline in every document", async () => {
    const home = await (await createWebApp(makeDeps()).request("/")).text();
    expect(home).not.toContain('data-ide="1"');
    expect(home).not.toContain("/assets/ide.js");
    expect(home).toContain('data-theme="dark"');
  });

  it("POST /ide/theme validates the enum and forwards through the data seam", async () => {
    const setTheme = vi.fn(async () => ({ appTheme: "light" as const }));
    const app = createWebApp(ideDeps({ setTheme }));
    const ok = await app.request("/ide/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appTheme: "light" }),
    });
    expect(ok.status).toBe(200);
    expect(setTheme).toHaveBeenCalledWith(SESSION, "light");
    const bad = await app.request("/ide/theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appTheme: "sepia" }),
    });
    expect(bad.status).toBe(422);
    expect((await createWebApp(makeDeps()).request("/ide/theme", { method: "POST" })).status).toBe(401);
  });

  it("POST /p/:project/paper-theme resolves the slug → id and forwards; bad values 422", async () => {
    const setPaperTheme = vi.fn(async () => ({ paperTheme: "dark" as const }));
    const app = createWebApp(ideDeps({ setPaperTheme }));
    const ok = await app.request("/p/the-politics-of-visibility/paper-theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paperTheme: "dark" }),
    });
    expect(ok.status).toBe(200);
    expect(setPaperTheme).toHaveBeenCalledWith(SESSION, "proj_pv", "dark");
    const bad = await app.request("/p/the-politics-of-visibility/paper-theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paperTheme: "sepia" }),
    });
    expect(bad.status).toBe(422);
    const missing = await app.request("/p/nope/paper-theme", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paperTheme: "dark" }),
    });
    expect(missing.status).toBe(404);
  });
});

describe("P1.01 — the Settings app-theme control (the no-JS counterpart of the shell menu)", () => {
  const SESSION = { cookie: "tok" };
  it("P1.20 — the control lives in Preferences: GET /app/settings/preferences renders the select with the stored pref; POST /settings/theme (legacy) persists + redirects to the new section", async () => {
    const setTheme = vi.fn(async () => ({ appTheme: "auto" as const }));
    const deps = makeDeps({
      session: () => SESSION,
      dataSource: {
        ...makeDeps().dataSource,
        getPreferencesSettings: async () => ({
          prefs: {},
          consentDontAskUnder: 0,
          appTheme: "auto",
        }),
        setTheme,
      },
    });
    const app = createWebApp(deps);
    const html = await (await app.request("/app/settings/preferences")).text();
    expect(html).toContain('name="appTheme"');
    expect(html).toContain('option value="auto" selected');
    const res = await app.request("/settings/theme", {
      method: "POST",
      ...form({ appTheme: "auto" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app/settings/preferences?saved=1");
    expect(setTheme).toHaveBeenCalledWith(SESSION, "auto");
  });

  it("a bad theme value is refused (no write) but still redirects — the form is progressive enhancement", async () => {
    const setTheme = vi.fn(async () => ({ appTheme: "dark" as const }));
    const app = createWebApp(makeDeps({
      session: () => SESSION,
      dataSource: { ...makeDeps().dataSource, setTheme },
    }));
    const res = await app.request("/settings/theme", { method: "POST", ...form({ appTheme: "sepia" }) });
    expect(res.status).toBe(302);
    expect(setTheme).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------------------------------------------------
// P1.04 — the §5.2 workspace home + the §5.3 three-entry new-project flow: grouped rows, the filters
// (Voice chips + Protocol + Sort + Archived/Deleted affordances), the conversion preview on the live
// PRB.20 path, and the per-entry landing cards. Every seam is a data-source stub — the api tests carry
// the DB truth; these assert the web surface wires it up.
describe("P1.04 — the /app home + the three-entry new-project flow (§5.2/§5.3)", () => {
  const SESSION = { cookie: "tok" };
  const PROTOCOL_CARD = {
    id: "essay",
    name: "Essay",
    tagline: "The argued piece.",
    holdYouTo: "A thesis that pays off.",
    venueBar: { kind: "typeahead", table: [{ venue: "n+1" }], prompt: "Pick or type a venue" },
    lengthNorms: { unit: "words", default: 3000, apparatus: "light" },
    entryDefault: "essay",
    typicalReviewCredits: 640,
  };
  const VOICES = [
    {
      personaId: "per_self",
      name: "Mine",
      byline: null,
      mode: "self",
      sampleCount: 4,
      status: { pill: { label: "Ready", tone: "ready" }, stale: false },
    },
    {
      personaId: "per_house",
      name: "House",
      byline: null,
      mode: "house",
      sampleCount: 9,
      status: { pill: { label: "Ready", tone: "ready" }, stale: false },
    },
  ];
  const homeDeps = (over: Partial<DataSource> = {}): WebDeps =>
    makeDeps({
      session: () => SESSION,
      dataSource: {
        ...makeDeps().dataSource,
        listVoices: async () => VOICES as never,
        getProjectGrouping: async () => "attention" as const,
        setProjectGrouping: async () => undefined,
        listProtocolCards: async () => [PROTOCOL_CARD] as never,
        searchProjects: async () => [],
        listDeletedProjects: async () => [],
        listGates: async () => [],
        listDecisions: async () => [],
        getApprovalOverrides: async () => ({}),
        getProjectVoice: async () => {
          throw new ApiError(404, "none");
        },
        getSessionPrincipal: async () => ({ userId: "u_1", workspaceId: "ws_1", billingAccountId: "ba_1" }),
        createProject: async () => ({ id: "p_new", slug: "my-essay", draftId: "d3", draftN: 3 }),
        previewWorkspaceImport: async () => ({
          status: "ready" as const,
          preview: PREVIEW,
          quarantineKey: "quarantine/ws1/up_new",
        }),
        ...over,
      },
    });

  it("/app renders the attention groups, the row anatomy, and the control bar (filter/sort/group)", async () => {
    const res = await createWebApp(homeDeps()).request("/app");
    expect(res.status).toBe(200);
    const html = await res.text();
    // the four §5.2 groups render (Quiet collapsed with its Unfiled/Voice sub-counts)
    for (const g of ["needs_you", "running", "ready_to_read", "quiet"]) {
      // empty groups render nothing; the fixture rows land in quiet
      void g;
    }
    expect(html).toContain('data-collapsed-group="quiet"');
    // HOT.1 (REQ-IDE-4) — the suppressed native marker is replaced by an explicit affordance.
    expect(html).toContain('data-collapsed-marker="true"');
    expect(html).toContain('data-cue-when-closed="true"');
    expect(html).toContain("Unfiled");
    // the bar: search, Group-by (persisted), Protocol filter, Sort, Archived + Deleted affordances
    expect(html).toContain('name="q"');
    expect(html).toContain('name="groupBy"');
    expect(html).toContain('name="protocol"');
    expect(html).toContain('name="sort"');
    expect(html).toContain("All protocols");
    expect(html).toContain("Recent");
    expect(html).toContain("Show archived");
    expect(html).toContain("Show recently deleted");
    // the row: state pill + one primary action + the "…" menu's seven actions
    expect(html).toContain("Edited by you");
    expect(html).toContain("Revise using your edits");
    for (const label of ["Rename", "Duplicate", "Change voice", "Export", "Archive", "Delete"]) {
      expect(html).toContain(label);
    }
    // the Voice filter chips render (All + each voice + Unfiled)
    expect(html).toContain('data-voice-filters="true"');
    // exactly one New-project affordance
    expect(html.match(/data-new-project="true"/g)?.length).toBe(1);
  });

  it("?protocol= filters the rows; ?sort=title orders them; ?voice= narrows to a voice", async () => {
    const rows = [
      { ...PROJECTS[0]!, protocolId: "academic" },
      { ...PROJECTS[1]!, protocolId: "essay" },
    ];
    const app = createWebApp(homeDeps({ listProjects: async () => rows }));
    const html = await (await app.request("/app?protocol=essay")).text();
    expect(html).toContain("New Essay");
    expect(html).not.toContain("The Politics of Visibility");
    const sorted = await (await app.request("/app?sort=title")).text();
    expect(sorted.indexOf("New Essay")).toBeLessThan(sorted.indexOf("The Politics of Visibility"));
  });

  it("?deleted=1 renders the restore window's rows; POST /p/:slug/restore calls the api", async () => {
    const restoreProject = vi.fn(async () => undefined);
    const app = createWebApp(
      homeDeps({
        listDeletedProjects: async () => [{ ...PROJECTS[0]!, deletedAt: "2026-01-01T00:00:00Z" }],
        restoreProject,
      }),
    );
    const html = await (await app.request("/app?deleted=1")).text();
    expect(html).toContain('data-deleted-section="true"');
    expect(html).toContain("Recently deleted");
    expect(html).toContain("/p/the-politics-of-visibility/restore");
    const res = await app.request("/p/the-politics-of-visibility/restore", { method: "POST" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app?deleted=1");
    expect(restoreProject).toHaveBeenCalledWith(SESSION, "proj_pv");
  });

  it("POST /app/grouping persists the per-user pref and returns home", async () => {
    const setProjectGrouping = vi.fn(async () => undefined);
    const app = createWebApp(homeDeps({ setProjectGrouping }));
    const res = await app.request("/app/grouping", { method: "POST", ...form({ groupBy: "voice" }) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app");
    expect(setProjectGrouping).toHaveBeenCalledWith(SESSION, "voice");
  });

  it("GET /app/new renders exactly three entry cards + the protocol/venue/Voice pickers", async () => {
    const html = await (await createWebApp(homeDeps()).request("/app/new")).text();
    for (const entry of ["scratch", "outline", "draft"]) {
      expect(html).toContain(`data-entry="${entry}"`);
    }
    // no fourth entry point exists (the draft+review import is a 1.x in-project action)
    expect(html.match(/data-entry="/g)?.length).toBe(3);
    // protocol cards carry tagline + hold-you-to + the typical Review estimate
    expect(html).toContain('data-protocol-card="essay"');
    expect(html).toContain("A thesis that pays off.");
    expect(html).toContain("Review ≈ 640 credits");
    // the venue typeahead over the card's table + free text
    expect(html).toContain('list="np-venues"');
    expect(html).toContain("n+1");
    // the Voice picker: No voice + Your voices / House styles optgroups
    expect(html).toContain("No voice");
    expect(html).toContain("Your voices");
    expect(html).toContain("House styles");
  });

  it("the draft entry's sheet carries the REQ-PROD-8 starting-version field", async () => {
    const html = await (await createWebApp(homeDeps()).request("/app/new?entry=draft")).text();
    expect(html).toContain('name="startVersion"');
  });

  it("POST /app/new scratch creates immediately and lands on the §5.3 next-step card", async () => {
    const createProject = vi.fn(async () => ({ id: "p_new", slug: "my-essay" }));
    const app = createWebApp(homeDeps({ createProject }));
    const res = await app.request("/app/new", {
      method: "POST",
      ...form({ entry: "scratch", title: "My Essay", protocolId: "essay" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/my-essay?created=scratch");
    expect(createProject).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({ title: "My Essay", entry: "scratch", protocolId: "essay" }),
    );
  });

  it("POST /app/new draft runs the conversion preview FIRST — nothing is created until Create", async () => {
    const createProject = vi.fn(async () => ({ id: "p_new", slug: "my-essay" }));
    const previewWorkspaceImport = vi.fn(async () => ({
      status: "ready" as const,
      preview: PREVIEW,
      quarantineKey: "quarantine/ws1/up_new",
    }));
    const app = createWebApp(homeDeps({ createProject, previewWorkspaceImport }));
    const res = await app.request("/app/new", {
      method: "POST",
      ...form({ entry: "draft", title: "My Essay", paste: "<h1>Heading</h1>", startVersion: "3" }),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    // the §5.3 preview contract: source beside converted, the count line, anchored warnings, both actions
    expect(html).toContain("Source");
    expect(html).toContain("Converted");
    expect(html).toContain("3 words · 0 footnotes");
    expect(html).toContain("could not be converted");
    expect(html).toContain("Create and fix later");
    expect(html).toContain("Fix now");
    // the form replays the SAME quarantine key + every pick — Create never re-uploads
    expect(html).toContain('type="hidden" name="qk" value="quarantine/ws1/up_new"');
    expect(html).toContain('name="startVersion" value="3"');
    expect(createProject).not.toHaveBeenCalled();
    expect(previewWorkspaceImport).toHaveBeenCalledOnce();
  });

  it("POST /app/new/create replays the quarantine key + picks; fix_now lands on the draft's Page", async () => {
    const createProject = vi.fn(async () => ({
      id: "p_new",
      slug: "my-essay",
      draftId: "d3",
      draftN: 3,
      conversionNotes: { warnings: 1, unconverted: 1 },
    }));
    const app = createWebApp(homeDeps({ createProject }));
    const res = await app.request("/app/new/create", {
      method: "POST",
      ...form({
        entry: "draft", title: "My Essay", protocolId: "essay", venue: "n+1",
        personaId: "per_self", startVersion: "3", qk: "quarantine/ws1/up_new", action: "fix_now",
      }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/p/my-essay/v/3?created=draft");
    expect(res.headers.get("location")).toContain("cn=1");
    expect(createProject).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({
        title: "My Essay", entry: "draft", protocolId: "essay", venue: "n+1",
        personaId: "per_self", startVersion: 3, quarantineKey: "quarantine/ws1/up_new",
      }),
    );
    // the default action lands on the project page with the next-step card
    const plain = await app.request("/app/new/create", {
      method: "POST",
      ...form({ entry: "outline", title: "My Essay", qk: "quarantine/ws1/up_new" }),
    });
    expect(plain.headers.get("location")).toContain("/p/my-essay?created=outline");
  });

  it("GET /p/:slug?created=draft renders the next-step card + the conversion-notes line", async () => {
    const app = createWebApp(homeDeps());
    const html = await (
      await app.request("/p/the-politics-of-visibility?created=draft&cn=2&cu=1")
    ).text();
    expect(html).toContain('data-next-step-card="draft"');
    expect(html).toContain("Review v");
    expect(html).toContain("Conversion notes");
  });

  it("a still-converting key re-renders the pending state with a meta-refresh poll (never a re-upload)", async () => {
    const app = createWebApp(
      homeDeps({
        previewWorkspaceImport: async () => ({
          status: "pending" as const,
          quarantineKey: "quarantine/ws1/up_cold",
        }),
      }),
    );
    const res = await app.request("/app/new", {
      method: "POST",
      ...form({ entry: "outline", title: "My Essay", paste: "notes" }),
    });
    const html = await res.text();
    expect(html).toContain('data-conversion-pending="true"');
    expect(html).toContain("http-equiv=\"refresh\"");
    // the poll URL replays the same quarantine key (HTML-escaped & in the meta content)
    expect(html).toContain("/app/new/preview?entry=outline&amp;");
    expect(html).toContain("qk=quarantine%2Fws1%2Fup_cold");
  });
});

// -------------------------------------------------------------------------------------------------------------------
// P1.05 — the Timeline pane, the run page (/p/:slug/r/:run), the live-feed proxy, and the §6.5 steering
// posts (§5.5/§6.5/§14.5). In-memory DataSource fakes; the reads are best-effort so failures degrade.
describe("P1.05 — timeline, run page, steering", () => {
  const SESSION = { cookie: "tok" };

  const CARD = {
    runId: "run_tl",
    state: "completed" as const,
    phases: [{ key: "reading_the_piece", ordinal: 1, status: "done" as const }],
    spentCredits: 520,
    capCredits: 840,
    creditFraction: 0.62,
    refundedCredits: 0,
    elapsedMs: 60000,
    etaBand: null,
    done: 1,
    running: 0,
    total: 6,
    estimateCredits: 840,
    queuePosition: null,
    paused: false,
    waitingGate: null,
    deliverables: [{ key: "letter" }, { key: "findings", count: 49 }],
    walkthrough: { status: "ready" as const, text: "A letter and a claims ledger were delivered." },
    failureCode: null,
    resumable: false,
    queuedNotes: 0,
    actions: ["open_deliverable" as const, "report" as const],
  };

  const TIMELINE = {
    project: { id: "proj_pv", slug: "the-politics-of-visibility", title: "The Politics of Visibility" },
    state: PROJECTS[0]!.state,
    nextStep: { verb: "revise", label: "Revise using your edits", estimateCredits: 1240, headDraftN: 2 },
    rounds: [
      {
        n: 1,
        anchor: { draftId: "d_v1", n: 1, origin: "imported" },
        producedN: 2,
        parts: [
          { kind: "version" as const, n: 1 },
          { kind: "run" as const, workflow: "review", count: 49 },
          { kind: "version" as const, n: 2 },
        ],
        runs: [
          {
            runId: "run_tl",
            workflow: "review",
            state: "completed" as const,
            createdAt: "2026-09-01T12:00:00Z",
            subjectN: 1,
            producedN: null,
            card: CARD,
          },
        ],
      },
    ],
    ungrouped: [],
    originChip: { kind: "imported_draft" as const },
  };

  const REPORT = {
    kind: "ok" as const,
    report: {
      runId: "run_tl",
      workflow: "review",
      state: "completed" as const,
      estimateCredits: 840,
      spentCredits: 520,
      capCredits: 840,
      refundedCredits: 0,
      estimateRatio: 0.62,
      phases: [
        { key: "checking_claims", ordinal: 2, status: "done" as const, seat: "verifier", credits: 300, durationMs: 120000, searches: 12, fetches: 40, subagentLabels: [] },
      ],
      seatSplit: [{ seat: "verifier", credits: 300, share: 1 }],
      flags: ["fact_check_dominated" as const],
      claims: { checked: 56, verified: 50, creditsPerVerified: 10.4 },
      drivers: [{ key: "phase_share" as const, phase: "checking_claims", share: 0.58 }],
      suggestedGuidance: ["guidance.fact_check_dominated"],
    },
    projectSlug: "the-politics-of-visibility",
  };

  const p105Deps = (over: Partial<DataSource> = {}): WebDeps =>
    makeDeps({
      session: () => SESSION,
      dataSource: {
        ...makeDeps().dataSource,
        listGates: async () => [],
        listDecisions: async () => [],
        getApprovalOverrides: async () => ({}),
        getProjectVoice: async () => {
          throw new ApiError(404, "none");
        },
        getSessionPrincipal: async () => ({ userId: "u_1", workspaceId: "ws_1", billingAccountId: "ba_1" }),
        getTimeline: async () => TIMELINE as never,
        getRunReport: async (_s: unknown, _r: unknown, opts?: { advanced?: boolean }) =>
          ({
            ...REPORT,
            ...(opts?.advanced
              ? {
                  advancedView: {
                    runId: "run_tl",
                    rows: [
                      {
                        phase: "checking_claims",
                        seat: "verifier",
                        subagentLabel: null,
                        model: "claude-sonnet-4-6",
                        modelTier: "balanced",
                        credits: 300,
                        durationMs: null,
                        searches: 12,
                        fetches: 40,
                        inputTokens: 4000,
                        outputTokens: 900,
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                        providerRequestIds: ["req_1"],
                      },
                    ],
                  },
                }
              : {}),
          }) as never,
        getRunEvents: async () => [
          { seq: 1, type: "run.state_changed", payload: { to: "running" }, density: "summary", at: "2026-09-01T12:00:00Z" },
          { seq: 2, type: "claim.checked", payload: { claimOrdinal: 3, verdict: "verified" }, density: "normal", at: "2026-09-01T12:01:00Z" },
        ] as never,
        pauseRun: vi.fn(async () => ({ ok: true as const, state: "running" })),
        resumeRun: vi.fn(async () => ({ ok: true as const, state: "queued" })),
        stopRun: vi.fn(async () => ({ ok: true as const, state: "cancelled" })),
        postRunNote: vi.fn(async () => ({ ok: true as const, guidanceId: "gdn_1" })),
        retryWalkthrough: vi.fn(async () => ({ status: "requeued" })),
        ...over,
      },
    });

  it("/p/:slug renders the Timeline pane — next-step card, round parts, the run card", async () => {
    const html = await (await createWebApp(p105Deps()).request("/p/the-politics-of-visibility")).text();
    expect(html).toContain('data-timeline-pane');
    // §5.5's three verbs row — each opens the run sheet for that workflow
    expect(html).toContain('data-timeline-verbs');
    expect(html).toContain('href="/p/the-politics-of-visibility/run?workflow=draft" data-verb="draft"');
    expect(html).toContain('data-verb="review"');
    expect(html).toContain('data-verb="revise"');
    expect(html).toContain('data-next-step="revise"');
    expect(html).toContain('data-run-card="run_tl"');
    // the card's report href lands on the run page
    expect(html).toContain('/p/the-politics-of-visibility/r/run_tl');
  });

  it("P1.09 — a waiting run mounts the IDENTICAL gate card inline + its permanent decision lines (§6.4)", async () => {
    const WAITING_RUN = {
      runId: "run_wait",
      workflow: "draft",
      state: "waiting_gate" as const,
      createdAt: "2026-09-02T08:00:00Z",
      subjectN: 1,
      producedN: null,
      card: {
        ...CARD,
        runId: "run_wait",
        state: "waiting_gate" as const,
        // P1.09 — the run's permanent decision record (§6.4 item 8; REQ-RUN-5/6).
        decisions: [
          {
            id: "gate_done",
            gateId: "gate_done",
            kind: "approve_plan",
            action: "approve",
            byActor: "user",
            presence: false,
            at: "2026-09-02T09:00:00Z",
            changes: 3,
          },
        ],
      },
      // P1.09 — the open gate DTO the run card expands into the §6.4 card (the same DTO the
      // Needs-you row renders — one render path, identical anatomy).
      gate: {
        id: "gate_wait",
        runId: "run_wait",
        kind: "approve_plan",
        workflow: "draft",
        openedAt: "2026-09-02T08:30:00Z",
        deadlineAt: "2026-09-03T08:30:00Z",
        pausedWhileReading: false,
        held: false,
        blocking: true,
        onExpiry: "proceed_conservative",
        spentCredits: 120,
        capCredits: 840,
        artifactTitle: "02-structure-plan",
      },
    };
    const timeline = {
      ...TIMELINE,
      rounds: [{ ...TIMELINE.rounds[0]!, runs: [WAITING_RUN, ...TIMELINE.rounds[0]!.runs] }],
    };
    const app = createWebApp(p105Deps({ getTimeline: async () => timeline as never }));
    const html = await (await app.request("/p/the-politics-of-visibility")).text();
    // the run card mounts the identical card (same component, same data-gate-card anatomy).
    expect(html).toContain('data-run-card="run_wait"');
    expect(html).toContain('data-gate-card="approve_plan"');
    expect(html).toContain('action="/p/the-politics-of-visibility/gates/gate_wait"');
    // the decision line rides the run card — the "with N changes" record (REQ-RUN-5).
    expect(html).toContain('data-run-decisions');
    expect(html).toContain('data-decision="gate_done"');
    expect(html).toMatch(/with 3 changes|3 changes/);
  });

  it("an active run opens the Desk on the live feed with replayed rows + the same-origin events URL", async () => {
    const live: ProjectRow[] = [
      { ...PROJECTS[0]!, activeRun: { runId: "run_live", state: "running" } },
      PROJECTS[1]!,
    ];
    const deps = p105Deps({ listProjects: async () => live });
    const html = await (await createWebApp(deps).request("/p/the-politics-of-visibility")).text();
    expect(html).toContain('data-feed-events="/p/the-politics-of-visibility/r/run_live/events"');
    expect(html).toContain('data-feed-last-seq="2"');
    expect(html).toContain('data-feed-labels='); // the island's embedded label maps
  });

  it("/p/:slug/r/:runId renders the Level-3 report; the Advanced disclosure lazy-loads Level 4", async () => {
    const app = createWebApp(p105Deps());
    const l3 = await (await app.request("/p/the-politics-of-visibility/r/run_tl")).text();
    expect(l3).toContain("Run report");
    expect(l3).not.toContain("inputTokens");
    expect(l3).not.toContain('data-usage-row');
    // Level 4 loads ONLY on the disclosure — the affordance is a ?advanced=1 read (§14.5)
    expect(l3).toContain('/p/the-politics-of-visibility/r/run_tl?advanced=1');
    const adv = await (await app.request("/p/the-politics-of-visibility/r/run_tl?advanced=1")).text();
    expect(adv).toContain("Run report");
    expect(adv).toContain('data-usage-row');
    expect(adv).toContain("4,000");
    // 404 when the api has no report for the run
    const missing = createWebApp(
      p105Deps({ getRunReport: async () => { throw new ApiError(404, "no"); } }),
    );
    expect((await missing.request("/p/the-politics-of-visibility/r/run_x")).status).toBe(404);
  });

  it("/app/usage/r/:run redirects to the canonical /p/ path with #report", async () => {
    const res = await createWebApp(p105Deps()).request("/app/usage/r/run_tl");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/r/run_tl#report");
  });

  it("the §6.5 steering posts forward through the data seam and redirect back to the project", async () => {
    const pauseRun = vi.fn(async () => ({ ok: true as const, state: "running" }));
    const resumeRun = vi.fn(async () => ({ ok: true as const, state: "queued" }));
    const postRunNote = vi.fn(async () => ({ ok: true as const, guidanceId: "g" }));
    const stopRun = vi.fn(async () => ({ ok: true as const, state: "cancelled" }));
    const app = createWebApp(p105Deps({ pauseRun, resumeRun, postRunNote, stopRun }));

    const pause = await app.request("/p/the-politics-of-visibility/r/run_tl/pause", { method: "POST", ...form({}) });
    expect(pause.status).toBe(302);
    expect(pause.headers.get("location")).toBe("/p/the-politics-of-visibility");
    expect(pauseRun).toHaveBeenCalledWith(SESSION, "run_tl");

    const resume = await app.request("/p/the-politics-of-visibility/r/run_tl/resume", {
      method: "POST",
      ...form({ note: "go easy" }),
    });
    expect(resume.headers.get("location")).toBe("/p/the-politics-of-visibility");
    expect(resumeRun).toHaveBeenCalledWith(SESSION, "run_tl", "go easy");

    const note = await app.request("/p/the-politics-of-visibility/r/run_tl/note", {
      method: "POST",
      ...form({ text: "check §2" }),
    });
    expect(postRunNote).toHaveBeenCalledWith(SESSION, "run_tl", "check §2");
    expect(note.status).toBe(302);

    const stop = await app.request("/p/the-politics-of-visibility/r/run_tl/stop", { method: "POST", ...form({}) });
    expect(stopRun).toHaveBeenCalledWith(SESSION, "run_tl");
    expect(stop.status).toBe(302);
  });

  it("a stale-state ApiError (409/404/400) on a steering post still redirects — the Timeline re-reads", async () => {
    const pauseRun = vi.fn(async () => {
      throw new ApiError(409, "http://api/runs/run_tl/pause", undefined, "not_running");
    });
    const app = createWebApp(p105Deps({ pauseRun }));
    const res = await app.request("/p/the-politics-of-visibility/r/run_tl/pause", { method: "POST", ...form({}) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility");
  });

  it("an empty note post is a no-op (never a write)", async () => {
    const postRunNote = vi.fn(async () => ({ ok: true as const, guidanceId: "g" }));
    const app = createWebApp(p105Deps({ postRunNote }));
    const res = await app.request("/p/the-politics-of-visibility/r/run_tl/note", {
      method: "POST",
      ...form({ text: "   " }),
    });
    expect(res.status).toBe(302);
    expect(postRunNote).not.toHaveBeenCalled();
  });

  it("the events proxy pipes the upstream SSE body through same-origin (session forwarded)", async () => {
    const sse = "id: 1\nevent: run.state_changed\ndata: {\"seq\":1,\"type\":\"run.state_changed\"}\n\n";
    const streamRunEvents = vi.fn(async () => new Response(sse, { status: 200 }));
    const app = createWebApp(p105Deps({ streamRunEvents: streamRunEvents as never }));
    const res = await app.request("/p/the-politics-of-visibility/r/run_live/events?after=0");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await res.text()).toBe(sse);
    expect(streamRunEvents).toHaveBeenCalledWith(SESSION, "run_live", { after: "0" });
    // upstream down → 502, never an empty page
    const down = createWebApp(
      p105Deps({ streamRunEvents: async () => { throw new ApiError(502, "down"); } }),
    );
    expect((await down.request("/p/the-politics-of-visibility/r/run_live/events")).status).toBe(502);
  });
});
