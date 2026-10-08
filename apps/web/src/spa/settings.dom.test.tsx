// @vitest-environment happy-dom
//
// SPA.12 — the `settings` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/9/16/17/21, REQ-DAT-4, REQ-UX-6/16; design/22 §2 + design/25 §settings). Mounted through
// the production router (memory history + a stub fetch) at each `/app/settings/<section>` leaf and
// `/p/:project/settings`: the shared nav strip, every section's SSR-verbatim vocabulary, the JSON
// mutation branches (the forms keep SSR markup — the delegated onSubmit posts the flat fields,
// follows the `{ok,redirect|url}` envelope, and invalidates the `["bff"]` twins on settle), the
// REQ-UX-16 in-flight affordance (`aria-busy` + disabled controls), the multipart import (FormData,
// never a JSON field), the binary download left a document `<a>`, the degraded-twin
// `data-settings-unavailable` legs, the `?confirmEmail` consume in beforeLoad, the SsrHandoff
// no-BFF leg, and the REQ-TST-2 parity legs against the SSR `SettingsPage`/`ProjectSettingsPage`
// under a PageDataContext provider. Component axe covers the mounted interactive sections.
//
// The fixtures mirror the retained SSR spec's (settings-pages.test.ts) — the parity legs compare
// the two renderers on the SAME data.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AccountExportDto,
  AccountSettingsDto,
  ApprovalSettingsDto,
  DataSettingsDto,
  IntegrationsSettingsDto,
  NotificationPrefsDto,
  PreferencesSettingsDto,
  ProjectSettingsDto,
} from "@rhema/api-client";
import { ACCOUNT_DELETION_CONFIRMATION, NOTIFICATION_EVENT_TYPES } from "@rhema/contracts";
import { PageDataContext } from "../page-data.js";
import { ProjectSettingsPage, SettingsPage } from "../pages.js";
import { hooksForSurface } from "../dom-contract.js";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import { spaRuntime } from "./dom.js";
import { axeCheck, expectManifestEmission } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "acme";

// ---- fixtures — the settings-pages.test.ts set, enriched for the conditional hooks -------------

const ACCOUNT: AccountSettingsDto = {
  user: {
    id: "u1",
    name: "Seed User",
    email: "seed@example.test",
    emailVerified: true,
    image: null,
    byline: "S. Seed",
    pendingEmail: "new@example.test",
  },
  signInMethods: [
    { kind: "magic_link", label: "Email magic link", detail: "seed@example.test" },
    { kind: "google", label: "Google" },
  ],
  sessions: [
    {
      id: "s1",
      userAgent: "Test Browser",
      ipAddress: "127.0.0.1",
      createdAt: "2026-09-19T00:00:00Z",
      expiresAt: "2026-10-19T00:00:00Z",
      current: true,
    },
    {
      id: "s2",
      userAgent: "Other Browser",
      ipAddress: null,
      createdAt: "2026-09-18T00:00:00Z",
      expiresAt: "2026-10-18T00:00:00Z",
      current: false,
    },
  ],
  deletion: { requestedAt: "2026-10-01T00:00:00Z", graceEndsAt: "2026-10-15T00:00:00Z" },
};

const PREFS: PreferencesSettingsDto = {
  prefs: {
    defaultModelTier: "balanced",
    defaultRigor: "standard",
    rigorByWorkflow: { review: "full_board" },
    approvalPolicy: "named",
    editor: { paperTheme: "light", fontPreset: "serif", fontSizeStep: 0 },
  },
  consentDontAskUnder: 240,
  appTheme: "dark",
};

const NOTIF: NotificationPrefsDto & { projects: { id: string; title: string }[] } = {
  matrix: {},
  quietHours: { startMinutesUtc: 21 * 60, endMinutesUtc: 7 * 60 },
  prefs: {
    email: { run_finished: false },
    inApp: {},
    digest: { run_finished: "hourly" },
    project: { p1: { run_progress: true } },
  },
  projects: [
    { id: "p1", title: "Alpha Essay" },
    { id: "p2", title: "Beta Notes" },
  ],
};

const INTEGRATIONS: IntegrationsSettingsDto = {
  connections: [
    {
      id: "cn1",
      provider: "substack",
      handle: "@seed",
      status: "degraded",
      error: "token expired",
      lastSyncAt: "2026-09-19T00:00:00Z",
      persona: { id: "p1", name: "Voice One", slug: "voice-one" },
      items: 12,
      includedItems: 9,
    },
  ],
  voices: [{ id: "p1", slug: "voice-one", name: "Voice One" }],
};

const DATA: DataSettingsDto = {
  analyticsOptOut: false,
  preferenceOptOut: false,
  supportAccess: {
    active: true,
    grant: { grantedAt: "2026-09-20T00:00:00Z", expiresAt: "2026-09-23T00:00:00Z" },
    log: [
      { id: "l1", grantId: "g1", actor: "user", action: "granted", detail: null, at: "2026-09-20T00:00:00Z" },
      { id: "l2", grantId: "g1", actor: "op_1", action: "accessed", detail: "triaged ticket 41", at: "2026-09-20T06:00:00Z" },
    ],
  },
  deletion: null,
};

const EXPORT: AccountExportDto = {
  id: "ex1",
  status: "ready",
  bytes: 1024,
  sha256: "abc",
  error: null,
  createdAt: "2026-10-01T00:00:00Z",
  readyAt: "2026-10-01T01:00:00Z",
  expiresAt: "2026-10-08T00:00:00Z",
  expired: false,
  downloadedAt: null,
};

const PROJECT_SETTINGS: ProjectSettingsDto = {
  project: {
    id: "p1",
    slug: SLUG,
    title: "Acme Essay",
    protocolId: "essay",
    protocolVersion: 1,
    venue: "LRB",
    rigorDefault: null,
    modelTierDefault: null,
    paperTheme: "follow",
    approvalPolicy: "named",
    persona: { id: "p1", name: "Voice One", slug: "voice-one" },
    tags: ["essay"],
    protocolChangedAt: "2026-09-30T00:00:00Z",
    protocolOverrides: { length: 8000, phaseDefaults: { verification: false }, stage: "early" },
  },
  protocols: [
    { id: "essay", name: "Essay" },
    { id: "academic", name: "Academic" },
  ],
};

const APPROVALS: ApprovalSettingsDto = {
  policy: "named",
  overrides: { approve_scope: 24 * 60 * 60 * 1000 },
  defaults: [
    { kind: "approve_scope", deadlineMs: null, onExpiry: "wait", overridable: true },
    { kind: "approve_plan", deadlineMs: 48 * 60 * 60 * 1000, onExpiry: "proceed_as_proposed", overridable: true },
    { kind: "spend", deadlineMs: null, onExpiry: "wait", overridable: false },
  ],
  standing: [
    { id: "g1", body: "Keep openings under 700 words.", workflows: ["review"], active: true, createdAt: "2026-09-01T00:00:00Z" },
  ],
  retired: [
    { id: "g0", body: "Old note.", workflows: [], active: false, createdAt: "2026-08-01T00:00:00Z" },
  ],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FetchOpts {
  account?: { account: AccountSettingsDto | null };
  accountStatus?: number;
  sessionStatus?: number;
  project?: unknown;
  projectStatus?: number;
  confirmReply?: { ok: true; redirect?: string };
  /** per-path deferred replies — the REQ-UX-16 in-flight leg holds a POST open. */
  hold?: Record<string, Promise<Response>>;
  /** mutation overrides — path → envelope (default `{ok:true, redirect:"…?saved=1"}` per action). */
  mutations?: Record<string, { ok: true; redirect?: string; url?: string }>;
}

/** The fetch stub — every same-origin path the mounts can reach is named; anything else 500s so a
 *  surprise read fails loudly rather than fabricating data. POSTs record their init. */
function makeFetch(opts: FetchOpts = {}) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/session") {
      return opts.sessionStatus != null && opts.sessionStatus !== 200
        ? jsonResponse(opts.sessionStatus, { error: "unauthenticated" })
        : jsonResponse(200, PRINCIPAL);
    }
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (url === "/bff/settings/account") {
      return opts.accountStatus != null && opts.accountStatus !== 200
        ? jsonResponse(opts.accountStatus, { error: "upstream_unavailable" })
        : jsonResponse(200, opts.account ?? { account: ACCOUNT });
    }
    if (url === "/bff/settings/preferences") return jsonResponse(200, { preferences: PREFS });
    if (url === "/bff/settings/notifications") return jsonResponse(200, { notifications: NOTIF });
    if (url === "/bff/settings/integrations") return jsonResponse(200, { integrations: INTEGRATIONS });
    if (url === "/bff/settings/data") {
      return jsonResponse(200, {
        privacy: { analyticsOptOut: false },
        data: DATA,
        accountExport: { export: EXPORT },
      });
    }
    if (url === `/bff/p/${SLUG}/settings`) {
      return opts.projectStatus != null && opts.projectStatus !== 200
        ? jsonResponse(opts.projectStatus, { error: "not_found" })
        : jsonResponse(
            200,
            opts.project ?? {
              projectSettings: { slug: SLUG, settings: PROJECT_SETTINGS, approvalSettings: APPROVALS },
            },
          );
    }
    if (url === "/bff/settings/account/confirm-email") {
      return jsonResponse(
        200,
        opts.confirmReply ?? { ok: true, redirect: "/app/settings/account?notice=email-confirmed" },
      );
    }
    if (opts.hold?.[url] != null) return opts.hold[url]!;
    if (opts.mutations?.[url] != null) return jsonResponse(200, opts.mutations[url]!);
    // The settings mutation grammar — the SSR action paths answer the JSON envelope.
    if (url === "/app/settings/account" || url === "/app/settings/sessions/revoke" || url === "/app/settings/account/delete/cancel") {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/account?saved=1" });
    }
    if (url === "/app/settings/account/email") {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/account?notice=email-pending" });
    }
    if (url === "/app/settings/account/delete") {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/data?notice=deletion-scheduled" });
    }
    if (url === "/app/settings/preferences") {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/preferences?saved=1" });
    }
    if (url === "/app/settings/notifications") {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/notifications?saved=1" });
    }
    if (url === "/app/settings/integrations/cn1/disconnect") {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/integrations?saved=1" });
    }
    if (url === "/app/settings/data/privacy" || url === "/app/settings/data/support-access" || url === "/app/settings/data/preference-learning") {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/data?saved=1" });
    }
    if (url === "/app/settings/data/export") {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/data?notice=requested" });
    }
    if (url === "/app/settings/data/import") {
      return jsonResponse(200, { ok: true, redirect: "/app/settings/data?notice=imported&p=1&v=1&f=2" });
    }
    if (url === `/p/${SLUG}/settings`) {
      return jsonResponse(200, { ok: true, redirect: `/p/${SLUG}/settings?saved=1` });
    }
    if (url === `/p/${SLUG}/settings/approvals`) {
      return jsonResponse(200, { ok: true, redirect: `/p/${SLUG}/settings?approvals=saved` });
    }
    if (url === `/p/${SLUG}/settings/guidance/g1` || url === `/p/${SLUG}/guidance` || url === `/p/${SLUG}/guidance/g1/retire`) {
      return jsonResponse(200, { ok: true, redirect: `/p/${SLUG}/settings` });
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
}

function bootFor(surfaces: Record<string, "spa" | "ssr">): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass: "desktop", surfaces };
}

/** The five account-leaf route ids + the project leaf — one `settings` verdict covers all six. */
const SPA_ALL = {
  "/app/settings/account": "spa",
  "/app/settings/preferences": "spa",
  "/app/settings/notifications": "spa",
  "/app/settings/integrations": "spa",
  "/app/settings/data": "spa",
  "/app/settings/billing": "ssr",
  "/p/$project/settings": "spa",
} as const;

let assignSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>) {
  vi.stubGlobal("fetch", fetchImpl);
  const el = document.createElement("div");
  el.setAttribute("data-spa-root", "");
  document.body.appendChild(el);
  const { router, queryClient } = createSpaRouter({
    boot,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const root = createRoot(el);
  mounted.push(root);
  await act(async () => {
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
    await router.load();
  });
  return { router, queryClient, el };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

/** The REQ-TST-2 emission filter — which manifest entries the SSR twin emits on a markup string. */
function emittedOn(ssrMarkup: string) {
  const esc = (s: string) => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");
  return hooksForSurface("settings").filter((entry) => {
    if (entry.kind === "attr") return new RegExp(`\\b${esc(entry.hook)}(?:[\\s=>/]|$)`).test(ssrMarkup);
    if (entry.kind === "attr-prefix") return new RegExp(`\\b${esc(entry.hook)}[\\w-]`).test(ssrMarkup);
    if (entry.kind === "field") return new RegExp(`\\bname=["']${esc(entry.hook)}["']`).test(ssrMarkup);
    if (entry.kind === "field-prefix") return new RegExp(`\\bname=["'\`]${esc(entry.hook)}`).test(ssrMarkup);
    return false;
  });
}

/** A deferred Response — the REQ-UX-16 leg holds a mutation in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Submit one form inside an act — fireEvent + the mutation's microtask flush. */
async function submit(form: Element) {
  await act(async () => {
    fireEvent.submit(form);
  });
}

beforeEach(() => {
  assignSpy = vi.fn();
  spaRuntime.assign = assignSpy;
  document.documentElement.removeAttribute("data-route");
  document.documentElement.removeAttribute("data-mounted");
  document.title = "";
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  spaRuntime.assign = (href) => window.location.assign(href);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---- /app/settings/account ----------------------------------------------------------------------

describe("GET /app/settings/account mounted (REQ-SEQ-9)", () => {
  const BOOT = bootFor({ "/app/settings/account": "spa" });

  it("renders the profile/email/sign-in/sessions/deletion vocabulary verbatim", async () => {
    await mountAt("/app/settings/account", BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(COPY.settings.heading);
    // The shared strip — six visible sections, active = account (REQ-NAV-6 deep links stay <a>).
    const nav = main.querySelector("[data-settings-nav]");
    expect(nav).not.toBeNull();
    const links = [...nav!.querySelectorAll<HTMLAnchorElement>("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/app/settings/account",
      "/app/settings/preferences",
      "/app/settings/notifications",
      "/app/settings/integrations",
      "/app/settings/billing",
      "/app/settings/data",
    ]);
    // Profile fields — canonical names + the fixture's values.
    expect(main.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe("Seed User");
    expect(main.querySelector<HTMLInputElement>('[name="byline"]')?.value).toBe("S. Seed");
    expect(main.querySelector<HTMLInputElement>('[name="image"]')).not.toBeNull();
    // The pending email-change line + the email-change form.
    expect(main.querySelector("[data-email-pending]")?.textContent).toContain("new@example.test");
    expect(main.querySelector<HTMLInputElement>('[name="email"]')).not.toBeNull();
    // Sign-in methods + the session rows with revoke.
    expect(main.querySelector('[data-signin-method="google"]')).not.toBeNull();
    expect(main.querySelector('[data-signin-method="magic_link"]')).not.toBeNull();
    expect(main.querySelector('[data-session="s2"]')).not.toBeNull();
    expect(main.querySelector<HTMLInputElement>('[name="sessionId"]')?.value).toBe("s2");
    expect(main.querySelector("[data-revoke-session]")).not.toBeNull();
    // The grace banner + cancel (deletion fixture set).
    expect(main.querySelector("[data-deletion-banner]")?.textContent).toContain("2026-10-15");
    expect(main.querySelector("[data-deletion-cancel]")).not.toBeNull();
    // The delete control stays in Data — Account carries the pointer link only.
    const pointer = main.querySelector<HTMLAnchorElement>('a[href="/app/settings/data#delete"]');
    expect(pointer).not.toBeNull();
  });

  it("the profile form posts the JSON branch; the envelope nav lands the saved flash + refetches", async () => {
    const f = makeFetch();
    const { router } = await mountAt("/app/settings/account", BOOT, f);
    const reads = () => f.mock.calls.filter(([u]) => String(u) === "/bff/settings/account").length;
    const baseline = reads();
    expect(baseline).toBeGreaterThanOrEqual(1);
    const form = el()!.querySelector('form[action="/app/settings/account"]')!;
    expect(form.getAttribute("method")).toBe("post");
    await submit(form);
    const post = f.mock.calls.find(([u, i]) => String(u) === "/app/settings/account" && i != null);
    expect(post).toBeDefined();
    const init = post![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json", accept: "application/json" });
    expect(JSON.parse(String(init.body))).toMatchObject({ name: "Seed User", byline: "S. Seed" });
    // The envelope's redirect is an IN-ROUTER nav — the ?saved=1 flash renders, no document nav.
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-settings-saved]")).not.toBeNull();
    });
    expect(router.state.location.pathname).toBe("/app/settings/account");
    // The router serializes the "1" flag JSON-quoted (`?saved=%221%22`) — the flash rendered above.
    expect(router.state.location.href).toContain("saved=");
    await vi.waitFor(() => expect(reads()).toBeGreaterThan(baseline));
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("the email-change and session-revoke forms post their own JSON branches", async () => {
    const f = makeFetch();
    await mountAt("/app/settings/account", BOOT, f);
    const emailForm = el()!.querySelector('form[action="/app/settings/account/email"]')!;
    const input = emailForm.querySelector<HTMLInputElement>('[name="email"]')!;
    input.value = "n@x.test";
    await submit(emailForm);
    const emailPost = f.mock.calls.find(([u]) => String(u) === "/app/settings/account/email" && u[1] != null);
    expect(emailPost).toBeDefined();
    expect(JSON.parse(String((emailPost![1] as RequestInit).body))).toEqual({ email: "n@x.test" });
    const revoke = el()!.querySelector('form[action="/app/settings/sessions/revoke"]')!;
    await submit(revoke);
    const revPost = f.mock.calls.find(([u]) => String(u) === "/app/settings/sessions/revoke" && u[1] != null);
    expect(JSON.parse(String((revPost![1] as RequestInit).body))).toEqual({ sessionId: "s2" });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("REQ-BFF-21 — ?confirmEmail=<token> is consumed in beforeLoad; the token never reaches the shell", async () => {
    const f = makeFetch();
    const { router } = await mountAt("/app/settings/account?confirmEmail=tok123", BOOT, f);
    const post = f.mock.calls.find(([u]) => String(u) === "/bff/settings/account/confirm-email");
    expect(post).toBeDefined();
    expect((post![1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ token: "tok123" });
    // The envelope's notice URL is where the leaf lands — the same 302 target the document emits.
    expect(router.state.location.pathname).toBe("/app/settings/account");
    expect(router.state.location.href).toContain("notice=email-confirmed");
    expect(router.state.location.href).not.toContain("confirmEmail");
    // The account twin still warms for the landed leaf.
    await vi.waitFor(() =>
      expect(el()!.querySelector("[data-settings-nav]")).not.toBeNull(),
    );
  });

  it("a degraded twin (account: null) renders the section's honest-empty state", async () => {
    await mountAt("/app/settings/account", BOOT, makeFetch({ account: { account: null } }));
    expect(el()!.querySelector('[data-settings-unavailable="account"]')).not.toBeNull();
    expect(el()!.querySelector('[name="name"]')).toBeNull();
  });

  it("REQ-TST-2 parity — every account hook the SSR page emits on this fixture is emitted", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ settings: { section: "account", account: ACCOUNT } }}>
        <SettingsPage />
      </PageDataContext.Provider>,
    );
    await mountAt("/app/settings/account", BOOT, makeFetch());
    const spaMarkup = el()!.innerHTML;
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(8);
    expectManifestEmission(spaMarkup, emitted);
    for (const literal of [
      'data-signin-method="google"',
      'data-session="s2"',
      'data-email-pending="true"',
      'data-deletion-banner="true"',
      'data-deletion-cancel="true"',
      'name="sessionId"',
      'name="byline"',
      'name="image"',
    ]) {
      expect(spaMarkup, literal).toContain(literal);
      expect(ssrMarkup, literal).toContain(literal);
    }
  });

  it("component axe on the mounted account section (REQ-VFY-6)", async () => {
    await mountAt("/app/settings/account", BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });

  it("a non-401 twin failure renders the designed error state — not a /login lie", async () => {
    await mountAt("/app/settings/account", BOOT, makeFetch({ accountStatus: 502 }));
    expect(el()?.querySelector("[data-spa-error]")).not.toBeNull();
    expect(assignSpy).not.toHaveBeenCalledWith("/login");
  });

  it("a 401 twin answer drops the session and document-navigates to /login (REQ-FW-6)", async () => {
    await mountAt("/app/settings/account", BOOT, makeFetch({ accountStatus: 401 }));
    await vi.waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/login"));
  });

  it("an unflipped verdict hands the document back — no surface, no BFF read", async () => {
    const f = makeFetch();
    await mountAt("/app/settings/account", bootFor({ "/app/settings/account": "ssr" }), f);
    expect(assignSpy).toHaveBeenCalledWith("/app/settings/account");
    expect(el()?.querySelector("[data-settings-nav]")).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u) === "/bff/settings/account")).toBe(false);
  });
});

// ---- /app/settings/preferences ------------------------------------------------------------------

describe("GET /app/settings/preferences mounted", () => {
  const BOOT = bootFor({ "/app/settings/preferences": "spa" });

  it("renders the tier/rigor/approval/consent/editor vocabulary with canonical values", async () => {
    await mountAt("/app/settings/preferences", BOOT, makeFetch());
    const main = el()!;
    // Canonical vocab only — no raw model names (the banned-strings posture).
    for (const t of ["Base", "Balanced", "Frontier"]) expect(main.textContent).toContain(t);
    for (const r of ["Quick", "Standard", "Full board"]) expect(main.textContent).toContain(r);
    expect(main.querySelector('[data-tier="frontier"]')).not.toBeNull();
    expect(main.querySelector('[data-approval-policy="run_to_completion"]')).not.toBeNull();
    // The per-workflow rigor grid — launched workflows only, rigor_<workflow> selects.
    const grid = main.querySelector("[data-rigor-by-workflow]");
    expect(grid).not.toBeNull();
    expect(grid!.querySelectorAll('select[name^="rigor_"]').length).toBeGreaterThanOrEqual(2);
    // The full field set — literal selector refs so the manifest's assertion scan counts them.
    expect(main.querySelector('[name="defaultModelTier"]')).not.toBeNull();
    expect(main.querySelector('[name="defaultRigor"]')).not.toBeNull();
    expect(main.querySelector('[name="approvalPolicy"]')).not.toBeNull();
    expect(main.querySelector('[name="consentUnder"]')).not.toBeNull();
    expect(main.querySelector('[name="paperTheme"]')).not.toBeNull();
    expect(main.querySelector('[name="fontPreset"]')).not.toBeNull();
    expect(main.querySelector('[name="fontSizeStep"]')).not.toBeNull();
    expect(main.querySelector('[name="appTheme"]')).not.toBeNull();
    // The fixture's values land in the controls.
    expect(main.querySelector<HTMLInputElement>('[name="consentUnder"]')?.value).toBe("240");
    expect(main.querySelector<HTMLSelectElement>('[name="appTheme"]')?.value).toBe("dark");
  });

  it("the prefs form posts the flat vocabulary as JSON and lands ?saved=1", async () => {
    const f = makeFetch();
    await mountAt("/app/settings/preferences", BOOT, f);
    const form = el()!.querySelector('form[action="/app/settings/preferences"]')!;
    await submit(form);
    const post = f.mock.calls.find(([u]) => String(u) === "/app/settings/preferences" && u[1] != null);
    expect(post).toBeDefined();
    const body = JSON.parse(String((post![1] as RequestInit).body)) as Record<string, string>;
    expect(body["defaultModelTier"]).toBe("balanced");
    expect(body["approvalPolicy"]).toBe("named");
    expect(body["consentUnder"]).toBe("240");
    expect(body["appTheme"]).toBe("dark");
    await vi.waitFor(() => expect(el()!.querySelector("[data-settings-saved]")).not.toBeNull());
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("REQ-TST-2 parity — the SSR preferences vocabulary is emitted verbatim", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ settings: { section: "preferences", preferences: PREFS } }}>
        <SettingsPage />
      </PageDataContext.Provider>,
    );
    await mountAt("/app/settings/preferences", BOOT, makeFetch());
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(8);
    expectManifestEmission(el()!.innerHTML, emitted);
  });

  it("component axe on the mounted preferences section (REQ-VFY-6)", async () => {
    await mountAt("/app/settings/preferences", BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });
});

// ---- /app/settings/notifications ----------------------------------------------------------------

describe("GET /app/settings/notifications mounted", () => {
  const BOOT = bootFor({ "/app/settings/notifications": "spa" });

  it("renders the §5.11 matrix — every event row, locked rows, the per-project cell", async () => {
    await mountAt("/app/settings/notifications", BOOT, makeFetch());
    const main = el()!;
    expect(main.querySelector("[data-notification-matrix]")).not.toBeNull();
    expect(main.querySelector("[data-notifications-form]")).not.toBeNull();
    const rows = [...main.querySelectorAll("[data-notification-row]")];
    expect(rows.map((r) => r.getAttribute("data-notification-row"))).toEqual([...NOTIFICATION_EVENT_TYPES]);
    // The two non-configurable rows are locked (no select) — REQ-ACCT-1.
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(main.querySelectorAll("[data-locked]").length).toBeGreaterThanOrEqual(2);
    // run_progress's in-app cell is the per-project note, not a select.
    expect(main.querySelector("[data-per-project]")).not.toBeNull();
    // The email/in-app selects + digest + quiet-hours fields + per-project rp_* rows.
    expect(main.querySelectorAll('select[name^="email_"]').length).toBeGreaterThanOrEqual(8);
    expect(main.querySelectorAll('select[name^="inapp_"]').length).toBeGreaterThanOrEqual(6);
    expect(main.querySelector('[name="digest_run_finished"]')).not.toBeNull();
    for (const name of ["qh_enabled", "qh_start", "qh_end"]) {
      expect(main.querySelector(`[name="${name}"]`), name).not.toBeNull();
    }
    expect(main.querySelector<HTMLInputElement>('[name="qh_start"]')?.value).toBe("21:00");
    expect(main.querySelector('[name="rp_p1"]')).not.toBeNull();
    expect(main.querySelector('[name="rp_p2"]')).not.toBeNull();
  });

  it("the matrix form posts the flat vocabulary as JSON and lands ?saved=1", async () => {
    const f = makeFetch();
    await mountAt("/app/settings/notifications", BOOT, f);
    const form = el()!.querySelector('form[action="/app/settings/notifications"]')!;
    await submit(form);
    const post = f.mock.calls.find(([u]) => String(u) === "/app/settings/notifications" && u[1] != null);
    expect(post).toBeDefined();
    const body = JSON.parse(String((post![1] as RequestInit).body)) as Record<string, string>;
    // run_finished email was toggled off in the fixture → "off" posts verbatim.
    expect(body["email_run_finished"]).toBe("off");
    expect(body["qh_enabled"]).toBe("on");
    expect(body["qh_start"]).toBe("21:00");
    expect(body["rp_p1"]).toBe("on");
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("REQ-TST-2 parity — the SSR notifications vocabulary is emitted verbatim", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ settings: { section: "notifications", notifications: NOTIF } }}>
        <SettingsPage />
      </PageDataContext.Provider>,
    );
    await mountAt("/app/settings/notifications", BOOT, makeFetch());
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(8);
    expectManifestEmission(el()!.innerHTML, emitted);
  });

  it("component axe on the mounted matrix (REQ-VFY-6 — the select-name additions carry)", async () => {
    await mountAt("/app/settings/notifications", BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });
});

// ---- /app/settings/integrations -----------------------------------------------------------------

describe("GET /app/settings/integrations mounted", () => {
  const BOOT = bootFor({ "/app/settings/integrations": "spa" });

  it("renders the three provider cards with the connection row + error + disconnect", async () => {
    await mountAt("/app/settings/integrations", BOOT, makeFetch());
    const main = el()!;
    for (const p of ["substack", "medium", "gdrive"]) {
      expect(main.querySelector(`[data-integration-card="${p}"]`), p).not.toBeNull();
    }
    // Every card carries its "what we never do" line (§14.7).
    expect(main.querySelectorAll("[data-integration-never]").length).toBe(3);
    // The degraded connection row: status, handle, persona, items, error, disconnect form.
    const conn = main.querySelector('[data-connection="cn1"]')!;
    expect(conn).not.toBeNull();
    expect(conn.querySelector('[data-conn-status="degraded"]')).not.toBeNull();
    expect(conn.querySelector("[data-conn-error]")?.textContent).toContain("token expired");
    const form = conn.querySelector<HTMLFormElement>('form[action="/app/settings/integrations/cn1/disconnect"]');
    expect(form).not.toBeNull();
    expect(form!.querySelector("[data-disconnect]")).not.toBeNull();
    // The empty cards link to the first voice's samples tab (P1.15's connect path).
    expect(main.querySelector('a[href="/v/voice-one?tab=samples"]')).not.toBeNull();
  });

  it("disconnect posts the JSON branch to the connection's own path", async () => {
    const f = makeFetch();
    await mountAt("/app/settings/integrations", BOOT, f);
    const form = el()!.querySelector('form[action="/app/settings/integrations/cn1/disconnect"]')!;
    await submit(form);
    const post = f.mock.calls.find(([u]) => String(u) === "/app/settings/integrations/cn1/disconnect" && u[1] != null);
    expect(post).toBeDefined();
    expect((post![1] as RequestInit).method).toBe("POST");
    await vi.waitFor(() => expect(el()!.querySelector("[data-settings-saved]")).not.toBeNull());
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("REQ-TST-2 parity — the SSR integrations vocabulary is emitted verbatim", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ settings: { section: "integrations", integrations: INTEGRATIONS } }}>
        <SettingsPage />
      </PageDataContext.Provider>,
    );
    await mountAt("/app/settings/integrations", BOOT, makeFetch());
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(5);
    expectManifestEmission(el()!.innerHTML, emitted);
  });
});

// ---- /app/settings/data -------------------------------------------------------------------------

describe("GET /app/settings/data mounted (REQ-ACCT-3/4 + REQ-VIS-11)", () => {
  const BOOT = bootFor({ "/app/settings/data": "spa" });

  it("renders privacy/support/posture/preference/export/import/delete — the full vocabulary", async () => {
    await mountAt("/app/settings/data", BOOT, makeFetch());
    const main = el()!;
    // Privacy + support grant + visible log.
    expect(main.querySelector("[data-privacy-form]")).not.toBeNull();
    expect(main.querySelector("[data-analytics-toggle]")).not.toBeNull();
    expect(main.querySelector('[name="analyticsOptOut"]')).not.toBeNull();
    expect(main.querySelector("[data-support-access-form]")).not.toBeNull();
    expect(main.querySelector("[data-support-access-toggle]")).not.toBeNull();
    expect(main.querySelector('[name="enabled"]')).not.toBeNull();
    expect(main.querySelector("[data-support-active]")?.textContent).toContain("2026-09-23");
    const log = main.querySelector("[data-support-log]");
    expect(log).not.toBeNull();
    expect(log!.querySelectorAll("[data-support-log-row]").length).toBe(2);
    // §11.7 Q-26 + the training posture — verbatim copy, capture-only.
    expect(main.querySelector("[data-training-posture]")).not.toBeNull();
    expect(main.querySelector("[data-preference-copy]")).not.toBeNull();
    expect(main.querySelector("[data-preference-form]")).not.toBeNull();
    expect(main.querySelector("[data-preference-toggle]")).not.toBeNull();
    expect(main.querySelector('[name="learning"]')).not.toBeNull();
    // The export card — ready state carries the document-download <a> with ?id=.
    expect(main.querySelector("[data-account-export]")).not.toBeNull();
    expect(main.querySelector('[data-export-status="ready"]')).not.toBeNull();
    const dl = main.querySelector<HTMLAnchorElement>("[data-export-download]");
    expect(dl?.getAttribute("href")).toBe("/app/settings/data/export/download?id=ex1");
    // The multipart import + the typed-confirmation delete form.
    const importForm = main.querySelector<HTMLFormElement>("[data-account-import]");
    expect(importForm).not.toBeNull();
    expect(importForm!.enctype).toBe("multipart/form-data");
    const del = main.querySelector<HTMLFormElement>("[data-delete-account-form]");
    expect(del).not.toBeNull();
    expect(del!.querySelector<HTMLInputElement>('[name="confirmation"]')?.getAttribute("pattern")).toBe(
      ACCOUNT_DELETION_CONFIRMATION,
    );
  });

  it("the export download stays a document <a> — never an intercepted fetch (REQ-BFF-17)", async () => {
    await mountAt("/app/settings/data", BOOT, makeFetch());
    const dl = el()!.querySelector<HTMLAnchorElement>("[data-export-download]")!;
    // A plain href the browser navigates — no form, no button role.
    expect(dl.tagName).toBe("A");
    expect(dl.closest("form")).toBeNull();
  });

  it("privacy/support/preference forms post their own JSON branches", async () => {
    const f = makeFetch();
    await mountAt("/app/settings/data", BOOT, f);
    for (const action of [
      "/app/settings/data/privacy",
      "/app/settings/data/support-access",
      "/app/settings/data/preference-learning",
    ]) {
      await submit(el()!.querySelector(`form[action="${action}"]`)!);
      const post = f.mock.calls.find(([u]) => String(u) === action && u[1] != null);
      expect(post, action).toBeDefined();
      expect((post![1] as RequestInit).headers).toMatchObject({ "content-type": "application/json" });
    }
    // The unchecked analytics checkbox posts nothing — the flat vocabulary's absent-means-off
    // semantics (the server's bodyFields decode relies on it).
    const privacy = f.mock.calls.find(([u]) => String(u) === "/app/settings/data/privacy" && u[1] != null);
    expect(JSON.parse(String((privacy![1] as RequestInit).body))).toEqual({});
    const pref = f.mock.calls.find(([u]) => String(u) === "/app/settings/data/preference-learning" && u[1] != null);
    // preferenceOptOut=false ⇒ the learning checkbox is checked ⇒ "learning":"on" rides the body.
    expect(JSON.parse(String((pref![1] as RequestInit).body))).toEqual({ learning: "on" });
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("the export-request POST lands ?notice=requested → data-export-notice", async () => {
    const f = makeFetch();
    const { router } = await mountAt("/app/settings/data", BOOT, f);
    await submit(el()!.querySelector('form[action="/app/settings/data/export"]')!);
    const post = f.mock.calls.find(([u]) => String(u) === "/app/settings/data/export" && u[1] != null);
    expect(post).toBeDefined();
    await vi.waitFor(() => {
      expect(router.state.location.href).toContain("notice=requested");
      expect(el()!.querySelector("[data-export-notice]")).not.toBeNull();
    });
  });

  it("the import POST rides multipart FormData — never a JSON field (REQ-BFF-17)", async () => {
    const f = makeFetch();
    await mountAt("/app/settings/data", BOOT, f);
    const form = el()!.querySelector<HTMLFormElement>("[data-account-import]")!;
    const file = form.querySelector<HTMLInputElement>('[name="archive"]')!;
    // happy-dom's DataTransfer is unavailable — assign the file list directly.
    Object.defineProperty(file, "files", { value: [new File(["zip"], "backup.zip", { type: "application/zip" })], configurable: true });
    await submit(form);
    const post = f.mock.calls.find(([u]) => String(u) === "/app/settings/data/import" && u[1] != null);
    expect(post).toBeDefined();
    const init = post![1] as RequestInit;
    expect(init.body instanceof FormData).toBe(true);
    // No JSON content-type — the browser sets the multipart boundary itself.
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
    await vi.waitFor(() => {
      // The envelope's imported-count URL lands the import notice with the counts.
      expect(el()!.querySelector('[data-import-notice="imported"]')).not.toBeNull();
    });
  });

  it("the delete form posts the typed confirmation; the cancel form posts inside the grace", async () => {
    const f = makeFetch();
    await mountAt("/app/settings/data", BOOT, f);
    const del = el()!.querySelector<HTMLFormElement>("[data-delete-account-form]")!;
    const confirmation = del.querySelector<HTMLInputElement>('[name="confirmation"]')!;
    confirmation.value = "delete";
    await submit(del);
    const post = f.mock.calls.find(([u]) => String(u) === "/app/settings/account/delete" && u[1] != null);
    expect(post).toBeDefined();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({ confirmation: "delete" });
  });

  it("a deletion fixture renders the banner + cancel and hides the delete form", async () => {
    // The data twin carries the pending deletion — the banner mirrors it, the form is absent.
    const dataWithDeletion = { ...DATA, deletion: { requestedAt: "2026-10-01T00:00:00Z", graceEndsAt: "2026-10-15T00:00:00Z" } };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/bff/settings/data") {
        return jsonResponse(200, { privacy: { analyticsOptOut: true }, data: dataWithDeletion, accountExport: { export: EXPORT } });
      }
      return makeFetch()(input);
    });
    await mountAt("/app/settings/data", BOOT, fetchImpl);
    const main = el()!;
    expect(main.querySelector("[data-deletion-banner]")).not.toBeNull();
    const cancel = main.querySelector<HTMLFormElement>('form[action="/app/settings/account/delete/cancel"]')!;
    expect(cancel.querySelector("[data-deletion-cancel]")).not.toBeNull();
    expect(main.querySelector("[data-delete-account-form]")).toBeNull();
    // The analytics toggle reflects the twin's opt-out state.
    expect(main.querySelector<HTMLInputElement>("[data-analytics-toggle]")?.checked).toBe(true);
  });

  it("?saved=1 lands the saved flash + the privacy-saved line; ?p,v,f lands the import counts", async () => {
    await mountAt("/app/settings/data?saved=1", BOOT, makeFetch());
    expect(el()!.querySelector("[data-settings-saved]")).not.toBeNull();
    expect(el()!.querySelector("[data-privacy-saved]")).not.toBeNull();
  });

  it("?notice=imported&p=2&v=1&f=3 renders the import counts (URL state, never payload)", async () => {
    await mountAt("/app/settings/data?notice=imported&p=2&v=1&f=3", BOOT, makeFetch());
    const notice = el()!.querySelector('[data-import-notice="imported"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain("2");
  });

  it("?notice=deduped renders the deduped line", async () => {
    await mountAt("/app/settings/data?notice=deduped", BOOT, makeFetch());
    expect(el()!.querySelector('[data-import-notice="deduped"]')).not.toBeNull();
  });

  it("a degraded data seam (data: null) keeps the export card but drops the support section", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/bff/settings/data") {
        return jsonResponse(200, { privacy: { analyticsOptOut: false }, data: null, accountExport: { export: EXPORT } });
      }
      return makeFetch()(input);
    });
    await mountAt("/app/settings/data", BOOT, fetchImpl);
    const main = el()!;
    // The privacy form still renders (its own seam), the support grant section honestly drops.
    expect(main.querySelector("[data-privacy-form]")).not.toBeNull();
    expect(main.querySelector("[data-support-access-form]")).toBeNull();
    expect(main.querySelector("[data-account-export]")).not.toBeNull();
  });

  it("REQ-TST-2 parity — the SSR data vocabulary is emitted verbatim", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider
        value={{
          settings: { section: "data", data: DATA },
          privacy: { analyticsOptOut: false, saved: false },
          accountExport: { export: EXPORT },
        }}
      >
        <SettingsPage />
      </PageDataContext.Provider>,
    );
    await mountAt("/app/settings/data", BOOT, makeFetch());
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(15);
    expectManifestEmission(el()!.innerHTML, emitted);
  });

  it("component axe on the mounted data section (REQ-VFY-6)", async () => {
    await mountAt("/app/settings/data", BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });
});

// ---- /p/:project/settings -----------------------------------------------------------------------

describe("GET /p/:project/settings mounted (REQ-GENRE-2 + REQ-GATE-3/10)", () => {
  const BOOT = bootFor({ "/p/$project/settings": "spa" });

  it("renders the safe-field form + the shared approval surface + standing guidance", async () => {
    await mountAt(`/p/${SLUG}/settings`, BOOT, makeFetch());
    const main = el()!;
    // §6.7's protocol-changed marker (the fixture stamps it).
    expect(main.querySelector("[data-protocol-changed]")).not.toBeNull();
    // The REQ-GENRE-2 safe fields — venue/protocol/rigor/tier/paper/stage/length/pd_*.
    expect(main.querySelector('[name="venue"]')).not.toBeNull();
    expect(main.querySelector('[name="protocolId"]')).not.toBeNull();
    expect(main.querySelector('[name="rigorDefault"]')).not.toBeNull();
    expect(main.querySelector('[name="modelTierDefault"]')).not.toBeNull();
    expect(main.querySelector('[name="paperTheme"]')).not.toBeNull();
    expect(main.querySelector('[name="stage"]')).not.toBeNull();
    expect(main.querySelector('[name="ov_length"]')).not.toBeNull();
    expect(main.querySelector<HTMLInputElement>('[name="venue"]')?.value).toBe("LRB");
    expect(main.querySelector<HTMLInputElement>('[name="ov_length"]')?.value).toBe("8000");
    expect(main.querySelectorAll('select[name^="pd_"]').length).toBeGreaterThanOrEqual(2);
    // The shared approval surface — policy radios, the override grid, guidance management.
    expect(main.querySelector("[data-approval-settings]")).not.toBeNull();
    expect(main.querySelector('[data-policy="named"]')).not.toBeNull();
    expect(main.querySelector('[name="policy"]')).not.toBeNull();
    const grid = main.querySelector("[data-override-grid]")!;
    expect(grid).not.toBeNull();
    expect(grid.querySelectorAll("[data-override-row]").length).toBe(3);
    // REQ-SPEC-1 — the non-overridable kind shows "always waits for you", never a control.
    expect(grid.querySelector("[data-never-override]")).not.toBeNull();
    expect(grid.querySelector('[name="ov_approve_scope"]')).not.toBeNull();
    // Standing guidance — row + retire + edit disclosure + the add form's fields.
    expect(main.querySelector("[data-standing-guidance]")).not.toBeNull();
    expect(main.querySelector('[data-guidance="g1"]')).not.toBeNull();
    expect(main.querySelector("[data-retire]")).not.toBeNull();
    expect(main.querySelector("[data-guidance-edit]")).not.toBeNull();
    expect(main.querySelector("[data-guidance-save]")).not.toBeNull();
    expect(main.querySelector("[data-retired-guidance]")).not.toBeNull();
    expect(main.querySelectorAll('[name="returnTo"]').length).toBeGreaterThanOrEqual(3);
    expect(main.querySelectorAll('[name="body"]').length).toBeGreaterThanOrEqual(2);
    expect(main.querySelectorAll('[name="workflows"]').length).toBeGreaterThanOrEqual(2);
    // The voice + tags rows.
    expect(main.querySelector('a[href="/v/voice-one"]')).not.toBeNull();
  });

  it("the settings form posts the flat vocabulary to /p/:slug/settings", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/settings`, BOOT, f);
    await submit(el()!.querySelector(`form[action="/p/${SLUG}/settings"]`)!);
    const post = f.mock.calls.find(([u]) => String(u) === `/p/${SLUG}/settings` && u[1] != null);
    expect(post).toBeDefined();
    const body = JSON.parse(String((post![1] as RequestInit).body)) as Record<string, string>;
    expect(body["venue"]).toBe("LRB");
    expect(body["protocolId"]).toBe("essay");
    expect(body["ov_length"]).toBe("8000");
    expect(body["stage"]).toBe("early");
    await vi.waitFor(() => expect(el()!.querySelector("[data-settings-saved]")).not.toBeNull());
  });

  it("the approvals form posts policy + ov_* + returnTo; guidance posts body + workflows", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/settings`, BOOT, f);
    await submit(el()!.querySelector(`form[action="/p/${SLUG}/settings/approvals"]`)!);
    const post = f.mock.calls.find(([u]) => String(u) === `/p/${SLUG}/settings/approvals` && u[1] != null);
    expect(post).toBeDefined();
    const body = JSON.parse(String((post![1] as RequestInit).body)) as Record<string, string>;
    expect(body["policy"]).toBe("named");
    expect(body["ov_approve_scope"]).toBe("86400000");
    expect(body["returnTo"]).toBe(`/p/${SLUG}/settings`);
    // The guidance edit disclosure's save posts the replace vocabulary.
    const editForm = el()!.querySelector(`form[action="/p/${SLUG}/settings/guidance/g1"]`)!;
    await submit(editForm);
    const gPost = f.mock.calls.find(([u]) => String(u) === `/p/${SLUG}/settings/guidance/g1` && u[1] != null);
    expect(gPost).toBeDefined();
    const gBody = JSON.parse(String((gPost![1] as RequestInit).body)) as Record<string, string>;
    expect(gBody["body"]).toBe("Keep openings under 700 words.");
    expect(gBody["workflows"]).toBe("review");
    expect(gBody["returnTo"]).toBe(`/p/${SLUG}/settings`);
    // The retire CTA posts to the shared retire path.
    const retireForm = el()!.querySelector(`form[action="/p/${SLUG}/guidance/g1/retire"]`)!;
    await submit(retireForm);
    expect(f.mock.calls.some(([u]) => String(u) === `/p/${SLUG}/guidance/g1/retire` && u[1] != null)).toBe(true);
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("?notice= renders the flash line; ?saved=1 renders the saved line", async () => {
    await mountAt(`/p/${SLUG}/settings?notice=invalid&saved=1`, BOOT, makeFetch());
    expect(el()!.querySelector("[data-settings-notice]")?.textContent).toContain("invalid");
    expect(el()!.querySelector("[data-settings-saved]")).not.toBeNull();
  });

  it("a 404 twin answer maps to the router's not-found — the document's parity", async () => {
    await mountAt(`/p/${SLUG}/settings`, BOOT, makeFetch({ projectStatus: 404 }));
    const main = el()!;
    expect(main.textContent).toContain(COPY.notFound.heading);
    expect(main.querySelector("[data-approval-settings]")).toBeNull();
  });

  it("REQ-TST-2 parity — the SSR project-settings vocabulary is emitted verbatim", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider
        value={{ projectSettings: { slug: SLUG, settings: PROJECT_SETTINGS, approvalSettings: APPROVALS } }}
      >
        <ProjectSettingsPage />
      </PageDataContext.Provider>,
    );
    await mountAt(`/p/${SLUG}/settings`, BOOT, makeFetch());
    const emitted = emittedOn(ssrMarkup);
    expect(emitted.length).toBeGreaterThanOrEqual(15);
    expectManifestEmission(el()!.innerHTML, emitted);
  });

  it("component axe on the mounted project settings (REQ-VFY-6 — the override grid carries)", async () => {
    await mountAt(`/p/${SLUG}/settings`, BOOT, makeFetch());
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });

  it("an unflipped verdict hands the document back — no surface, no BFF read", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/settings`, bootFor({ "/p/$project/settings": "ssr" }), f);
    expect(assignSpy).toHaveBeenCalledWith(`/p/${SLUG}/settings`);
    expect(el()?.querySelector("[data-approval-settings]")).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u).startsWith("/bff/p/"))).toBe(false);
  });
});

// ---- REQ-UX-16 — the in-flight affordance + the no-retry posture ---------------------------------

describe("REQ-UX-16/REQ-BFF-30 — mutation pending affordance", () => {
  const BOOT = bootFor({ "/app/settings/preferences": "spa" });

  it("an in-flight POST marks the form aria-busy + disables its controls, restored on settle", async () => {
    const gate = deferred<Response>();
    const f = makeFetch({ hold: { "/app/settings/preferences": gate.promise } });
    await mountAt("/app/settings/preferences", BOOT, f);
    const form = el()!.querySelector<HTMLFormElement>('form[action="/app/settings/preferences"]')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    // In flight — the affordance is visible: aria-busy on the form, controls disabled, no flash yet.
    await vi.waitFor(() => expect(form.getAttribute("aria-busy")).toBe("true"));
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitButton.disabled).toBe(true);
    expect(el()!.querySelector("[data-settings-saved]")).toBeNull();
    // A second submit while busy is swallowed — REQ-BFF-30's no-retry rule (one in-flight POST).
    await act(async () => {
      fireEvent.submit(form);
    });
    const posts = f.mock.calls.filter(([u, i]) => String(u) === "/app/settings/preferences" && i != null);
    expect(posts.length).toBe(1);
    // Settle — the envelope lands the flash, the affordance restores.
    await act(async () => {
      gate.resolve(jsonResponse(200, { ok: true, redirect: "/app/settings/preferences?saved=1" }));
      await gate.promise.catch(() => undefined);
    });
    await vi.waitFor(() => {
      expect(form.getAttribute("aria-busy")).toBeNull();
      expect(submitButton.disabled).toBe(false);
      expect(el()!.querySelector("[data-settings-saved]")).not.toBeNull();
    });
  });

  it("a mutation envelope with url= is a document navigation (server-validated external)", async () => {
    const f = makeFetch({
      mutations: { "/app/settings/preferences": { ok: true, url: "https://billing.example.test/portal" } },
    });
    await mountAt("/app/settings/preferences", BOOT, f);
    await submit(el()!.querySelector('form[action="/app/settings/preferences"]')!);
    await vi.waitFor(() => expect(assignSpy).toHaveBeenCalledWith("https://billing.example.test/portal"));
  });
});

// ---- the whole-manifest emission leg --------------------------------------------------------------

describe("the settings surface's manifest coverage (REQ-VFY-2)", () => {
  it("every manifest hook the rich fixture set emits is emitted across the mounted sections", async () => {
    // The union of the SSR emissions across ALL fixture variants IS the per-fixture parity legs'
    // contract — this roll-up just re-runs them as one assertion for the report line.
    const fixtures: { path: string; ssr: string }[] = [];
    const ssrOf = (value: Parameters<typeof PageDataContext.Provider>[0]["value"], project = false) =>
      renderToStaticMarkup(
        <PageDataContext.Provider value={value}>
          {project ? <ProjectSettingsPage /> : <SettingsPage />}
        </PageDataContext.Provider>,
      );
    fixtures.push({
      path: "/app/settings/account",
      ssr: ssrOf({ settings: { section: "account", account: ACCOUNT } }),
    });
    fixtures.push({
      path: "/app/settings/preferences",
      ssr: ssrOf({ settings: { section: "preferences", preferences: PREFS } }),
    });
    fixtures.push({
      path: "/app/settings/notifications",
      ssr: ssrOf({ settings: { section: "notifications", notifications: NOTIF } }),
    });
    fixtures.push({
      path: "/app/settings/integrations",
      ssr: ssrOf({ settings: { section: "integrations", integrations: INTEGRATIONS } }),
    });
    fixtures.push({
      path: "/app/settings/data?notice=imported&p=2&v=1&f=3",
      ssr: ssrOf({
        settings: { section: "data", data: DATA },
        privacy: { analyticsOptOut: false },
        accountExport: {
          export: EXPORT,
          notice: "imported",
          imported: { projects: 2, voices: 1, files: 3, deduped: false },
        },
      }),
    });
    fixtures.push({
      path: `/p/${SLUG}/settings`,
      ssr: ssrOf(
        { projectSettings: { slug: SLUG, settings: PROJECT_SETTINGS, approvalSettings: APPROVALS } },
        true,
      ),
    });
    let total = 0;
    for (const fix of fixtures) {
      const emitted = emittedOn(fix.ssr);
      total += emitted.length;
      await mountAt(fix.path, bootFor(SPA_ALL), makeFetch());
      expectManifestEmission(el()!.innerHTML, emitted);
      for (const r of mounted.splice(0)) act(() => r.unmount());
      document.body.innerHTML = "";
    }
    // The fixture set must exercise the surface deeply — a thin total means the fixtures drifted.
    expect(total).toBeGreaterThanOrEqual(55);
  });
});
