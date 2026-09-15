import { describe, it, expect, vi } from "vitest";
import type { ProjectRow } from "@rhema/api-client";
import { createWebApp, type WebDeps, type AuthOutcome } from "./server.js";
import type { DataSource } from "./data.js";

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

function makeDeps(over: Partial<WebDeps> = {}, checkInvite?: DataSource["checkInvite"]): WebDeps {
  return {
    dataSource: {
      listProjects: async () => PROJECTS,
      checkInvite: checkInvite ?? (async (code) => (code === "GOOD" ? { ok: true } : { ok: false, reason: "unknown" })),
      previewImport: async () => PREVIEW,
      createImport: async () => ({ draftId: "d_new" }),
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
    expect(beginAuth).toHaveBeenCalledWith("magic_link", { code: "GOOD", email: "a@b.com" });
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
