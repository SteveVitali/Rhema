import { describe, it, expect, vi } from "vitest";
import type {
  AccountSettingsDto,
  ApprovalSettingsDto,
  DataSettingsDto,
  IntegrationsSettingsDto,
  NotificationPrefsDto,
  PreferencesSettingsDto,
  ProjectSettingsDto,
} from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// P1.20 — the §14.7 settings tree's web half (`/app/settings/:section` + `/p/:slug/settings`):
//  • the section nav renders the six visible sections (Team stays hidden), at the §4.2 paths.
//  • Account — profile fields, sign-in methods, sessions with revoke, the email-change form.
//  • Preferences — canonical vocab (Base/Balanced/Frontier, Quick/Standard/Full board), the
//    ≤1,000-credit confirmation threshold, the null-unset PATCH, and the theme write.
//  • Notifications — the P1.19 matrix with the two locked rows (no select), quiet hours, and the
//    per-project run-progress opt-ins (the api writes one project per call — the form fans out).
//  • Integrations — the uniform provider cards with their "what we read / never" lines + disconnect.
//  • Data — privacy toggles, the 72-h support grant + visible log, the verbatim Q-26 + training
//    posture copy, "Export everything", and the typed-confirmation delete form.
//  • Project settings — the REQ-GENRE-2 safe fields, P1.09's approval surface, standing guidance.

const ACCOUNT: AccountSettingsDto = {
  user: {
    id: "u1",
    name: "Seed User",
    email: "seed@example.test",
    emailVerified: true,
    image: null,
    byline: "S. Seed",
    pendingEmail: null,
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
  deletion: null,
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

const NOTIF: NotificationPrefsDto = {
  matrix: {},
  quietHours: null,
  prefs: { email: { run_finished: false }, inApp: {}, project: {} },
};

const INTEGRATIONS: IntegrationsSettingsDto = {
  connections: [
    {
      id: "cn1",
      provider: "substack",
      handle: "@seed",
      status: "connected",
      error: null,
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

const PROJECT_SETTINGS: ProjectSettingsDto = {
  project: {
    id: "p1",
    slug: "demo",
    title: "Demo",
    protocolId: "essay",
    protocolVersion: 1,
    venue: "LRB",
    rigorDefault: null,
    modelTierDefault: null,
    paperTheme: "follow",
    approvalPolicy: "named",
    persona: { id: "p1", name: "Voice One", slug: "voice-one" },
    tags: ["essay"],
    protocolChangedAt: null,
    protocolOverrides: { length: 8000, phaseDefaults: { verification: false } },
  },
  protocols: [
    { id: "essay", name: "Essay" },
    { id: "academic", name: "Academic" },
  ],
};

const APPROVALS: ApprovalSettingsDto = {
  policy: "named",
  overrides: {},
  defaults: [
    { kind: "approve_scope", deadlineMs: null, onExpiry: "wait", overridable: true },
    { kind: "spend", deadlineMs: null, onExpiry: "wait", overridable: false },
  ],
  standing: [{ id: "g1", body: "Keep openings under 700 words.", workflows: [], active: true, createdAt: "2026-09-01T00:00:00Z" }],
  retired: [],
};

function makeDeps(over: Partial<WebDeps> = {}, dsOver: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      listProjects: async () => [
        { id: "p1", slug: "demo", title: "Demo", state: { pill: "ready" }, headDraftId: "d1" },
      ],
      checkInvite: async () => ({ ok: true }),
      getPrivacySettings: async () => ({ analyticsOptOut: false }),
      setAnalyticsOptOut: async () => undefined,
      getAccountSettings: async () => ACCOUNT,
      getPreferencesSettings: async () => PREFS,
      getNotificationPrefs: async () => NOTIF,
      getIntegrationsSettings: async () => INTEGRATIONS,
      getDataSettings: async () => DATA,
      getAccountExportState: async () => ({ export: null }),
      getProjectSettings: async () => PROJECT_SETTINGS,
      getApprovalSettings: async () => APPROVALS,
      ...dsOver,
    } as DataSource,
    session: () => ({}),
    ...over,
  };
}

const form = (fields: Record<string, string>) => ({
  body: new URLSearchParams(fields).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded" },
});

describe("the §14.7 settings tree — six visible sections, canonical paths (P1.20)", () => {
  it("each section renders the strip; Team is nowhere in the nav", async () => {
    const app = createWebApp(makeDeps());
    for (const s of ["account", "preferences", "notifications", "integrations", "data"]) {
      const res = await app.request(`/app/settings/${s}`);
      expect(res.status, s).toBe(200);
      const html = await res.text();
      expect(html).toContain('data-settings-nav="true"');
      for (const t of ["account", "preferences", "notifications", "integrations", "billing", "data"]) {
        expect(html, `${s} nav ${t}`).toContain(`data-section="${t}"`);
        expect(html).toContain(`/app/settings/${t}`);
      }
      expect(html).not.toContain('data-section="team"');
      expect(html).not.toContain(">Team<");
    }
  });

  it("/settings and /app/settings redirect to the account section", async () => {
    const app = createWebApp(makeDeps());
    for (const path of ["/settings", "/app/settings"]) {
      const res = await app.request(path, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/app/settings/account");
    }
  });
});

describe("Account section", () => {
  it("renders profile, email change, sign-in methods, sessions with revoke", async () => {
    const res = await createWebApp(makeDeps()).request("/app/settings/account");
    const html = await res.text();
    expect(html).toContain('value="Seed User"');
    expect(html).toContain('value="S. Seed"');
    expect(html).toContain("seed@example.test");
    expect(html).toContain('data-signin-method="google"');
    expect(html).toContain('data-session="s2"');
    expect(html).toContain('data-revoke-session="true"');
    expect(html).toContain("This device");
    expect(html).toContain("/app/settings/data#delete"); // the delete control lives in Data
  });

  it("posts the profile fields; posts revoke with the session id", async () => {
    const upd = vi.fn(async () => ({ ok: true as const }));
    const rev = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(makeDeps({}, { updateAccountSettings: upd, revokeSession: rev }));
    const res = await app.request("/app/settings/account", {
      method: "POST",
      ...form({ name: "New Name", byline: "", image: "https://x.test/a.png" }),
    });
    expect(res.headers.get("location")).toBe("/app/settings/account?saved=1");
    expect(upd).toHaveBeenCalledWith(expect.anything(), {
      name: "New Name",
      byline: null, // "" → clear
      image: "https://x.test/a.png",
    });
    await app.request("/app/settings/sessions/revoke", { method: "POST", ...form({ sessionId: "s2" }) });
    expect(rev).toHaveBeenCalledWith(expect.anything(), "s2");
  });

  it("the email-change form posts and the confirm token lands on the account GET", async () => {
    const req = vi.fn(async () => ({ ok: true as const, pendingEmail: "n@x.test" }));
    const confirm = vi.fn(async () => ({ ok: true as const, email: "n@x.test" }));
    const app = createWebApp(makeDeps({}, { requestEmailChange: req, confirmEmailChange: confirm }));
    const res = await app.request("/app/settings/account/email", { method: "POST", ...form({ email: "n@x.test" }) });
    expect(res.headers.get("location")).toBe("/app/settings/account?notice=email-pending");
    expect(req).toHaveBeenCalledWith(expect.anything(), "n@x.test");
    const back = await app.request("/app/settings/account?confirmEmail=tok123", { redirect: "manual" });
    expect(confirm).toHaveBeenCalledWith(expect.anything(), "tok123");
    expect(back.headers.get("location")).toBe("/app/settings/account?notice=email-confirmed");
  });
});

describe("Preferences section", () => {
  it("renders the canonical vocab (Base/Balanced/Frontier · Quick/Standard/Full board), no raw model names", async () => {
    const html = await (await createWebApp(makeDeps()).request("/app/settings/preferences")).text();
    for (const t of ["Base", "Balanced", "Frontier"]) expect(html).toContain(t);
    for (const r of ["Quick", "Standard", "Full board"]) expect(html).toContain(r);
    expect(html).not.toMatch(/opus|sonnet|haiku|gpt-|claude-3/i);
    expect(html).toContain('data-tier="frontier"');
    expect(html).toContain('data-approval-policy="run_to_completion"');
    expect(html).toContain('name="consentUnder"');
    expect(html).toContain("1,000 max");
    expect(html).toContain("always win over these account defaults");
  });

  it("POST sends the prefs patch (empty selects → null unset) + the clamped threshold + theme", async () => {
    const upd = vi.fn(async () => ({ ok: true as const, prefs: {} }));
    const consent = vi.fn(async () => undefined);
    const theme = vi.fn(async () => undefined);
    const app = createWebApp(makeDeps({}, { updatePreferences: upd, setConsentPref: consent, setTheme: theme }));
    const res = await app.request("/app/settings/preferences", {
      method: "POST",
      ...form({
        defaultModelTier: "frontier",
        defaultRigor: "",
        rigor_review: "full_board",
        rigor_revise: "",
        approvalPolicy: "wait_each",
        paperTheme: "dark",
        fontPreset: "",
        fontSizeStep: "2",
        consentUnder: "99999",
        appTheme: "light",
      }),
    });
    expect(res.headers.get("location")).toBe("/app/settings/preferences?saved=1");
    const patch = upd.mock.calls[0]![1] as {
      defaultModelTier: string | null;
      defaultRigor: string | null;
      rigorByWorkflow: Record<string, string | null>;
      approvalPolicy: string;
      editor: { paperTheme: string; fontPreset: string | null; fontSizeStep: number };
    };
    expect(patch.defaultModelTier).toBe("frontier");
    expect(patch.defaultRigor).toBeNull(); // "Default" → unset
    expect(patch.rigorByWorkflow).toEqual({ review: "full_board", revise: null });
    expect(patch.approvalPolicy).toBe("wait_each");
    expect(patch.editor).toEqual({ paperTheme: "dark", fontPreset: null, fontSizeStep: 2 });
    expect(consent).toHaveBeenCalledWith(expect.anything(), 1000); // clamped at the §14.7 cap
    expect(theme).toHaveBeenCalledWith(expect.anything(), "light");
  });
});

describe("Notifications section", () => {
  it("renders the matrix; the two non-configurable rows are locked (no select)", async () => {
    const html = await (await createWebApp(makeDeps()).request("/app/settings/notifications")).text();
    expect(html).toContain('data-notification-matrix="true"');
    // SPA.6 — the form-level hook the journey pins the POST to (settings gate).
    expect(html).toContain('data-notifications-form="true"');
    for (const locked of ["spend_gate", "trial_payment"]) {
      const row = html.match(new RegExp(`<tr[^>]*data-notification-row="${locked}"[^>]*>[\\s\\S]*?</tr>`))?.[0] ?? "";
      expect(row, locked).toContain("Always on");
      expect(row).not.toContain("<select"); // nothing to flip — the api rejects a write too
    }
    const run = html.match(/<tr[^>]*data-notification-row="run_finished"[\s\S]*?<\/tr>/)?.[0] ?? "";
    expect(run).toContain('name="email_run_finished"');
    expect(run).toContain('name="inapp_run_finished"');
    // run_progress is per-project — the matrix row carries the note, the Advanced list the selects.
    expect(html).toContain('name="rp_p1"');
    expect(html).toContain('name="qh_start"');
  });

  it("POST fans out: the account matrix + digest + quiet hours ride the first write; each project is its own call", async () => {
    const calls: unknown[] = [];
    const app = createWebApp(
      makeDeps(
        {},
        {
          listProjects: async () => [
            { id: "p1", slug: "a", title: "A", state: { pill: "ready" }, headDraftId: null },
            { id: "p2", slug: "b", title: "B", state: { pill: "ready" }, headDraftId: null },
          ] as never,
          updateNotificationPrefs: async (_s: unknown, patch: unknown) => {
            calls.push(patch);
            return { ok: true as const, prefs: {} };
          },
        },
      ),
    );
    const res = await app.request("/app/settings/notifications", {
      method: "POST",
      ...form({
        email_run_finished: "off",
        inapp_run_finished: "on",
        digest_run_finished: "hourly",
        qh_enabled: "on",
        qh_start: "21:00",
        qh_end: "07:00",
        rp_p1: "on",
        rp_p2: "off",
      }),
    });
    expect(res.headers.get("location")).toBe("/app/settings/notifications?saved=1");
    expect(calls).toHaveLength(2); // one call per project opt-in (the api's contract)
    expect(calls[0]).toMatchObject({
      email: { run_finished: false },
      inApp: { run_finished: true },
      digest: { run_finished: "hourly" },
      quietHours: { startMinutesUtc: 1260, endMinutesUtc: 420 },
      project: { p1: { run_progress: true } },
    });
    expect(calls[1]).toMatchObject({ project: { p2: { run_progress: false } } });
    expect((calls[1] as Record<string, unknown>).email).toBeUndefined();
  });

  it("a rejected write lands on ?notice=rejected", async () => {
    const app = createWebApp(
      makeDeps({}, { updateNotificationPrefs: async () => ({ error: "spend_gate is not configurable" }) }),
    );
    const res = await app.request("/app/settings/notifications", { method: "POST", ...form({ email_run_finished: "on" }) });
    expect(res.headers.get("location")).toBe("/app/settings/notifications?notice=rejected");
  });
});

describe("Integrations section", () => {
  it("renders the three uniform cards with their read/never lines + the disconnect form", async () => {
    const html = await (await createWebApp(makeDeps()).request("/app/settings/integrations")).text();
    for (const p of ["substack", "medium", "gdrive"]) expect(html).toContain(`data-integration-card="${p}"`);
    expect(html).toContain("We never post to your Substack.");
    expect(html).toContain("drive.file scope");
    expect(html).toContain('data-conn-status="connected"');
    expect(html).toContain("12 items discovered · 9 in the voice");
    expect(html).toContain('action="/app/settings/integrations/cn1/disconnect"');
  });

  it("disconnect posts the connection id", async () => {
    const dis = vi.fn(async () => ({ ok: true as const }));
    const res = await createWebApp(makeDeps({}, { disconnectIntegration: dis })).request(
      "/app/settings/integrations/cn1/disconnect",
      { method: "POST", ...form({}) },
    );
    expect(res.headers.get("location")).toBe("/app/settings/integrations?saved=1");
    expect(dis).toHaveBeenCalledWith(expect.anything(), "cn1");
  });
});

describe("Data section", () => {
  it("renders the support grant + visible log, the verbatim posture/Q-26 copy, export, delete", async () => {
    const html = await (await createWebApp(makeDeps()).request("/app/settings/data")).text();
    expect(html).toContain("Allow Rhema staff to view my projects for support (per request, 72 h)");
    expect(html).toContain('data-support-log="true"');
    expect(html).toContain("Staff viewed your projects"); // the accessed log row is user-visible
    expect(html).toContain("Active until 2026-09-23 00:00 (UTC)");
    // §14.7 verbatim — training posture + residual-risk sentence; no DPA/SOC 2 badge.
    expect(html).toContain("Rhema does not train models on your content.");
    expect(html).toContain("a search query is text that leaves Rhema");
    expect(html).toContain("Enterprise? Ask us about a DPA");
    expect(html).not.toMatch(/SOC ?2/i);
    // §11.7 verbatim — the Q-26 capture-only posture.
    expect(html).toContain("Rhema learns your working preferences from your decisions to help the Drafter and pre-fill defaults. The Editor never sees this — reviews never soften.");
    expect(html).toContain('data-account-export="true"');
    expect(html).toContain('action="/app/settings/data/export"');
    expect(html).toContain('data-delete-account-form="true"');
    expect(html).toContain('pattern="delete"');
  });

  it("posts support-access + preference-learning + delete-request/cancel through the api", async () => {
    const support = vi.fn(async () => ({ ok: true as const }));
    const pref = vi.fn(async () => ({ ok: true as const, preferenceOptOut: true }));
    // the api is the typed-confirmation authority — a wrong string answers {error}.
    const del = vi.fn(async (_s: unknown, confirmation: string) =>
      confirmation === "delete"
        ? ({
            ok: true as const,
            deletion: { requestedAt: "2026-09-20T00:00:00Z", graceEndsAt: "2026-10-04T00:00:00Z" },
          } as const)
        : ({ error: "confirmation_required" } as const),
    );
    const cancel = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(
      makeDeps(
        {},
        { setSupportAccess: support, setPreferenceOptOut: pref, requestAccountDeletion: del, cancelAccountDeletion: cancel },
      ),
    );
    await app.request("/app/settings/data/support-access", { method: "POST", ...form({ enabled: "on" }) });
    expect(support).toHaveBeenCalledWith(expect.anything(), true);
    // unchecked box ⇒ learning OFF ⇒ optOut true.
    await app.request("/app/settings/data/preference-learning", { method: "POST", ...form({}) });
    expect(pref).toHaveBeenCalledWith(expect.anything(), true);
    // the web forwards the typed confirmation verbatim — the API is the authority and 422s it.
    const bad = await app.request("/app/settings/account/delete", { method: "POST", ...form({ confirmation: "bye" }) });
    expect(bad.headers.get("location")).toBe("/app/settings/data?notice=confirmation-required");
    expect(del).toHaveBeenCalledWith(expect.anything(), "bye");
    const good = await app.request("/app/settings/account/delete", { method: "POST", ...form({ confirmation: "delete" }) });
    expect(del).toHaveBeenCalledWith(expect.anything(), "delete");
    expect(good.headers.get("location")).toBe("/app/settings/data?notice=deletion-scheduled");
    const c = await app.request("/app/settings/account/delete/cancel", { method: "POST", ...form({}) });
    expect(cancel).toHaveBeenCalled();
    expect(c.headers.get("location")).toBe("/app/settings/data?notice=deletion-cancelled");
  });

  it("the grace banner renders over every section while the clock runs", async () => {
    const deletion = { requestedAt: "2026-09-20T00:00:00Z", graceEndsAt: "2026-10-04T00:00:00Z" };
    const app = createWebApp(
      makeDeps({}, {
        getAccountSettings: async () => ({ ...ACCOUNT, deletion }),
        getDataSettings: async () => ({ ...DATA, deletion }),
      }),
    );
    const html = await (await app.request("/app/settings/account")).text();
    expect(html).toContain('data-deletion-banner="true"');
    expect(html).toContain("2026-10-04");
    expect(html).toContain('action="/app/settings/account/delete/cancel"');
    const dataHtml = await (await app.request("/app/settings/data")).text();
    expect(dataHtml).toContain('data-deletion-banner="true"');
    expect(dataHtml).not.toContain('data-delete-account-form="true"'); // no second destructive form
  });
});

describe("Project settings (/p/:project/settings)", () => {
  it("renders the safe fields + the approval surface + standing guidance", async () => {
    const html = await (await createWebApp(makeDeps()).request("/p/demo/settings")).text();
    expect(html).toContain("Demo — Project settings");
    expect(html).toContain('name="venue"');
    expect(html).toContain('name="protocolId"');
    expect(html).toContain('name="rigorDefault"');
    expect(html).toContain('name="modelTierDefault"');
    expect(html).toContain('name="pd_verification"');
    expect(html).toContain('action="/p/demo/settings/approvals"');
    expect(html).toContain("Keep openings under 700 words.");
    expect(html).toContain('action="/p/demo/guidance"'); // Add
    expect(html).toContain("/p/demo/guidance/g1/retire"); // Retire
  });

  it("POST maps the form to the safe-field patch (empty = inherit/clear)", async () => {
    const upd = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(makeDeps({}, { updateProjectSettings: upd }));
    const res = await app.request("/p/demo/settings", {
      method: "POST",
      ...form({
        venue: "",
        protocolId: "essay",
        rigorDefault: "full_board",
        modelTierDefault: "",
        paperTheme: "dark",
        stage: "early",
        ov_length: "12000",
        pd_verification: "off",
        pd_discourse: "on",
      }),
    });
    expect(res.headers.get("location")).toBe("/p/demo/settings?saved=1");
    expect(upd).toHaveBeenCalledWith(expect.anything(), "p1", {
      venue: null,
      protocolId: "essay",
      rigorDefault: "full_board",
      modelTierDefault: null, // "" ⇒ inherit the account default
      paperTheme: "dark",
      protocolOverrides: { length: 12000, stage: "early", phaseDefaults: { verification: false, discourse: true } },
    });
  });

  it("the guidance edit posts to the settings endpoint; approvals posts carry returnTo", async () => {
    const upd = vi.fn(async () => ({ ok: true as const }));
    const putApprovals = vi.fn(async () => APPROVALS);
    const app = createWebApp(makeDeps({}, { updateGuidance: upd, putApprovalSettings: putApprovals }));
    const res = await app.request("/p/demo/settings/guidance/g1", {
      method: "POST",
      ...form({ body: "Under 600 words.", workflows: "review, revise" }),
    });
    expect(res.headers.get("location")).toBe("/p/demo/settings?saved=1");
    expect(upd).toHaveBeenCalledWith(expect.anything(), "p1", "g1", { body: "Under 600 words.", workflows: ["review", "revise"] });

    const ap = await app.request("/p/demo/settings/approvals", {
      method: "POST",
      ...form({ policy: "wait_each", returnTo: "/p/demo/settings" }),
    });
    expect(putApprovals).toHaveBeenCalledWith(expect.anything(), "p1", expect.objectContaining({ policy: "wait_each" }));
    expect(ap.headers.get("location")).toBe("/p/demo/settings?approvals=saved");
  });
});
