import { Hono } from "hono";
import type { Context } from "hono";
import { toProjectRowView, groupByAttention, groupByVoice } from "./state-map.js";
import { renderDocument } from "./render.js";
import {
  inviteElement,
  loginElement,
  projectsElement,
  projectElement,
  newProjectElement,
  importElement,
  importPreviewElement,
  runSheetElement,
  dossierElement,
  revisionElement,
  pageElement,
  exportElement,
  voicesElement,
  voiceNewElement,
  voiceDetailElement,
  settingsElement,
  usageElement,
  notFoundElement,
} from "./routes.js";
import { COPY } from "./copy.js";
import type { DataSource, SessionHeaders, ImportInput, ImportPreviewOutcome } from "./data.js";
import type { PageData } from "./page-data.js";
import { loadEditorPage, docJsonFor } from "./page-data.js";
import type { ConversionResult } from "@rhema/contracts";
import {
  RIGORS,
  MODEL_TIERS,
  createIpEmailThrottle,
  type ModelTier,
  type Rigor,
  type SignupMode,
  type IpEmailThrottle,
  type WorkflowKey,
} from "@rhema/contracts";
import { buildRunSheetView, sheetProfile, type ToggleState } from "@rhema/run-sheet";
import { ApiError } from "@rhema/api-client";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

// The beta web shell server (Hono). SSR only — every route renders HTML; forms POST and links navigate (no
// client bundle). Auth-gated routes redirect to /login. `signup.mode` decides what POST /login requires
// (REQ-BETA-19 amended 2026-09-16): `invite` — no code ⇒ no auth request is ever made; `open` — self-serve
// signup, a supplied code still validated. Account admission itself is the api's `POST /signup` (throttled
// per IP + email; invite consume happens there at creation); the magic-link SEND is throttled here. The
// live Better Auth session/OAuth binding is D-P0.01-3 (deploy) — injected via `session` / `beginAuth` so
// the shell is fully unit-testable offline.

export interface AuthOutcome {
  /** Redirect the browser here (e.g. the Google OAuth start, or the post-login landing). */
  readonly redirect?: string;
  /** A magic-link email was sent — show the "check your email" state. */
  readonly sent?: boolean;
}

export interface WebDeps {
  readonly dataSource: DataSource;
  /** Resolve the viewer's session into headers to forward to the api, or null when unauthenticated. */
  session(c: Context): SessionHeaders | null;
  /**
   * Begin auth AFTER the invite passed (magic link / Google). Default: magic-link "sent". The Context is
   * passed so the live impl can relay the api's Set-Cookie (the OAuth `state` cookie) onto the response.
   */
  beginAuth?(method: string, args: { code: string; email?: string }, c?: Context): Promise<AuthOutcome>;
  /** End the session (clears the cookie). Default: no-op. */
  endSession?(c: Context): Promise<void>;
  /**
   * PRB.16 — the auth proxy: forwards `/api/auth/*` to the api server-side so every Better Auth cookie
   * plants host-only on THIS (the app) host — the OAuth callback, magic-link verify, sign-out, and the
   * state cookie all round-trip through it. Unset ⇒ `/api/auth/*` 404s (pre-PRB.16 posture).
   */
  authProxy?(req: Request): Promise<Response>;
  /** PRB.08 — the final-month beta-plan offer's link (copy + link only; unset ⇒ no offer line renders). */
  readonly betaPlanOfferUrl?: string;
  /**
   * PRB.13 — `signup.mode` (REQ-BETA-19 amended 2026-09-16): `invite` keeps the PRB.01 gate; `open`
   * permits a no-code signup. Unset ⇒ `invite` — the flag fails closed.
   */
  readonly signupMode?: SignupMode;
  /**
   * PRB.13 — the magic-link request throttle (per source IP + per email; REQ-BETA-19 abuse control).
   * Unset ⇒ the beta-grade default below. Only requests that reach the send count against it.
   */
  readonly magicLinkThrottle?: IpEmailThrottle;
  /**
   * P1.03 — the collab WSS base the Page's island connects to (`wss://<host>/collab`, env
   * COLLAB_WS_URL). Unset ⇒ the Page mounts without a collab session (the static read view).
   */
  readonly collabWsUrl?: string;
}

/** The beta-grade magic-link throttle — per IP + per email, fixed window (PRB.13; D-PRB.13-1: in-memory). */
export const MAGIC_LINK_THROTTLE_DEFAULTS = { perIp: 20, perEmail: 4, windowMs: 3_600_000 } as const;

/** The source IP the LB forwarded (first XFF hop); absent ⇒ every headerless caller shares "unknown". */
function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function loginErrorFor(reason: string | undefined): string {
  switch (reason) {
    case "expired":
      return COPY.login.errorExpired;
    case "revoked":
      return COPY.login.errorRevoked;
    case "exhausted":
      return COPY.login.errorExhausted;
    case "email_mismatch":
      return COPY.login.errorEmailMismatch;
    default:
      return COPY.login.errorInvalid;
  }
}

const defaultBeginAuth = async (method: string): Promise<AuthOutcome> =>
  method === "google" ? { redirect: "/auth/google/start" } : { sent: true };

/** Map a refused admission's stable error code to copy (invite reject reasons reuse the invite copy). */
function signupErrorFor(error: string, open: boolean): string {
  switch (error) {
    case "rate_limited":
      return COPY.login.errorRateLimited;
    case "invite_required":
      return COPY.login.errorRequired;
    case "email_required":
      return open ? COPY.login.emailRequiredSelfServe : COPY.login.errorEmailRequired;
    case "signup_failed":
      return COPY.login.errorSignupUnavailable;
    default:
      return loginErrorFor(error);
  }
}

export function createWebApp(deps: WebDeps): Hono {
  const app = new Hono();
  const beginAuth = deps.beginAuth ?? defaultBeginAuth;
  const signupOpen = deps.signupMode === "open";
  const magicLinkThrottle = deps.magicLinkThrottle ?? createIpEmailThrottle({ ...MAGIC_LINK_THROTTLE_DEFAULTS });

  /** PRB.12 — mint a client-whitelisted analytics event through the api intake (POST /analytics/events).
   *  Fire-and-forget: telemetry NEVER breaks a page render, and an opted-out user simply records nothing. */
  const emit = (
    session: SessionHeaders,
    event: string,
    props: Record<string, unknown> = {},
    ids: { projectId?: string; runId?: string } = {},
  ): void => {
    try {
      void deps.dataSource.postAnalyticsEvent(session, { event, props, ...ids }).catch(() => undefined);
    } catch {
      // a seam that isn't bound yet drops the event — telemetry is never fatal to a page render.
    }
  };

  // PRB.16 — an api-side 401 on a data call means the session is gone/invalid: land on /login rather
  // than a bare 500 (the session cookie may be expired while still present).
  app.onError((err, c) => {
    if (err instanceof ApiError && err.status === 401) return c.redirect("/login");
    console.error("[web] unhandled route error:", err instanceof Error ? err.message : err);
    return c.text("internal error", 500);
  });

  app.get("/healthz", (c) => c.json({ ok: true, service: "web" }));

  // ---- P1.01 — the IDE shell (§5.1; REQ-IDE-8/38) ---------------------------------------------------
  // Every /p/:project… document is an IDE surface: renderDocument stamps the theme attrs (no wrong-theme
  // flash — the inline boot script resolves dark|light|auto + the per-project paper pin before paint) and
  // PageData.ide feeds the shell's per-user×project pane key + the same-origin write endpoints. The theme
  // reads are best-effort — a data seam missing them degrades to the defaults, never a failed page.
  const ideContext = async (
    c: Context,
    session: SessionHeaders,
    row: { id: string; slug: string; paperTheme?: "light" | "follow" | "dark"; headDraftId?: string | null; activeRun?: { runId: string; state: string } | null },
    opts: {
      inboxCount?: number;
      findings?: { id: string; severity: string; kind: string; excerpt: string }[];
      timeline?: { id: string; label: string; state: string; href?: string }[];
      status?: { version?: string; words?: number; readMin?: number; venueCap?: string; credits?: number; sync?: "synced" | "syncing" | "offline" };
    } = {},
  ): Promise<Pick<PageData, "theme" | "paperTheme" | "ide">> => {
    const [principal, theme] = await Promise.all([
      Promise.resolve()
        .then(() => deps.dataSource.getSessionPrincipal?.(session))
        .catch(() => null),
      Promise.resolve()
        .then(() => deps.dataSource.getTheme?.(session))
        .catch(() => null),
    ]);
    return {
      ...(theme?.appTheme ? { theme: { pref: theme.appTheme } } : {}),
      paperTheme: row.paperTheme ?? "light",
      ide: {
        ...(principal?.userId ? { userId: principal.userId } : {}),
        projectId: row.id,
        ...(c.req.query("focus") === "1" ? { initialView: "focus" as const } : {}),
        ...(row.headDraftId ? { sourceHref: `/p/${row.slug}/edit/${row.headDraftId}` } : {}),
        ...(row.activeRun ? { activeRun: row.activeRun } : {}),
        ...(opts.inboxCount != null ? { inboxCount: opts.inboxCount } : {}),
        ...(opts.findings ? { findings: opts.findings } : {}),
        ...(opts.timeline ? { timeline: opts.timeline } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        themeUrl: "/ide/theme",
        paperThemeUrl: `/p/${row.slug}/paper-theme`,
      },
    };
  };

  // The island's same-origin theme writes — the web server forwards the session to the api (the bundle
  // never holds a credential; REQ-ARCH-33). Fire-and-forget from the client; the localStorage mirror is
  // already applied optimistically, so a failed write degrades to session-local.
  app.post("/ide/theme", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => null)) as { appTheme?: unknown } | null;
    const appTheme = body?.appTheme;
    if (appTheme !== "dark" && appTheme !== "light" && appTheme !== "auto") {
      return c.json({ error: "appTheme must be 'dark' | 'light' | 'auto'" }, 422);
    }
    const out = await deps.dataSource.setTheme(session, appTheme).catch(() => null);
    return c.json({ ok: true, appTheme, ...(out ? {} : { deferred: true }) });
  });

  app.post("/p/:project/paper-theme", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const slug = c.req.param("project");
    const body = (await c.req.json().catch(() => null)) as { paperTheme?: unknown } | null;
    const paperTheme = body?.paperTheme;
    if (paperTheme !== "light" && paperTheme !== "follow" && paperTheme !== "dark") {
      return c.json({ error: "paperTheme must be 'light' | 'follow' | 'dark'" }, 422);
    }
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.json({ error: "project not found" }, 404);
    const out = await deps.dataSource.setPaperTheme(session, row.id, paperTheme).catch(() => null);
    return c.json({ ok: true, paperTheme, ...(out ? {} : { deferred: true }) });
  });


  // PRB.16 — the Better Auth surface, proxied to the api so the OAuth callback + auth cookies live on
  // this host (the browser never talks to api.rhema.tools; see apps/api/src/auth-context.ts).
  if (deps.authProxy) {
    const proxy = deps.authProxy;
    app.all("/api/auth/*", (c) => proxy(c.req.raw));
  }

  // A viewer with a live session never needs the public pages — send them straight to the app.
  // Without this check `/` renders the sign-in affordance unconditionally, so a returning signed-in
  // user "has to log in again" (each sign-in mints a redundant session row).
  const signedIn = async (c: Context): Promise<boolean> => {
    const s = deps.session(c);
    return s ? await deps.dataSource.checkSession(s).catch(() => false) : false;
  };

  // Public: the invite page (+ read-only sample dossier). In `open` mode the access note drops the
  // invitation requirement — still no marketing page, still factual.
  const invite = async (c: Context) =>
    (await signedIn(c))
      ? c.redirect("/app")
      : c.html(renderDocument(c.req.path, inviteElement, { invite: { signupOpen } }));
  app.get("/", invite);
  app.get("/invite", invite);

  // Public: sign in — invitation required in `invite` mode, optional in `open`. GET renders the form;
  // POST enforces the mode gate (REQ-BETA-19 amended).
  app.get("/login", async (c) =>
    (await signedIn(c))
      ? c.redirect("/app")
      : c.html(renderDocument(c.req.path, loginElement, { login: { signupOpen } })));

  app.post("/login", async (c) => {
    const form = await c.req.parseBody();
    const code = typeof form.code === "string" ? form.code : "";
    const email = typeof form.email === "string" ? form.email : "";
    const method = typeof form.method === "string" ? form.method : "magic_link";

    const renderLogin = (login: {
      error?: string;
      sent?: boolean;
      code?: string;
      email?: string;
    }, status: 200 | 400 | 429) =>
      // every re-render carries the mode flag — an error page must keep the open-mode copy.
      c.html(renderDocument(c.req.path, loginElement, { login: { ...login, signupOpen } }), status);

    // invite mode: no code ⇒ no auth request is ever made (the PRB.01 gate, preserved verbatim).
    if (!signupOpen && !code.trim()) {
      return renderLogin({ error: COPY.login.errorRequired, code, email }, 400);
    }

    if (method === "magic_link") {
      // a magic link needs an email; Google resolves it via OAuth instead.
      if (!email.trim()) {
        return renderLogin(
          { error: signupOpen ? COPY.login.emailRequiredSelfServe : COPY.login.errorEmailRequired, code, email },
          400,
        );
      }
      // the link SEND is the abusable resource — throttle per IP + email before any auth request is made.
      const verdict = magicLinkThrottle.attempt(clientIp(c), email);
      if (!verdict.allowed) {
        return renderLogin({ error: COPY.login.errorRateLimited, code, email }, 429);
      }
      // Admission + provisioning is the api's `POST /signup` — invite mode requires a valid code there and
      // consumes it at creation; open mode treats the code as optional (still validated when supplied);
      // a returning account resolves `created:false` so a re-login with an exhausted code still sends.
      let res: Awaited<ReturnType<DataSource["signup"]>> | null;
      try {
        res = await deps.dataSource.signup({ email, ...(code.trim() ? { code } : {}), method });
      } catch {
        res = null; // a transport/5xx failure is "unavailable", never a refusal
      }
      if (!res) {
        return renderLogin({ error: COPY.login.errorSignupUnavailable, code, email }, 400);
      }
      if (!res.ok) {
        return renderLogin(
          { error: signupErrorFor(res.error, signupOpen), code, email },
          res.status === 429 ? 429 : 400,
        );
      }
    } else if (!signupOpen || code.trim()) {
      // Google resolves the email via OAuth (unknown pre-auth), so admission — invite consume included —
      // runs post-OAuth at `user.create` in the live deploy (D-PRB.01-1). Here we only pre-gate the code:
      // required in invite mode; optional-but-validated in open mode.
      const check = await deps.dataSource.checkInvite(code, undefined);
      if (!check.ok) {
        return renderLogin({ error: loginErrorFor(check.reason), code, email }, 400);
      }
    }

    const outcome = await beginAuth(method, { code, email: email || undefined }, c);
    if (outcome.redirect) return c.redirect(outcome.redirect);
    return renderLogin({ sent: true, email }, 200);
  });

  app.post("/logout", async (c) => {
    await deps.endSession?.(c);
    return c.redirect("/");
  });

  // Auth-gated: the §5.2 workspace home (P1.04). The attention-grouped list (Needs you / Running /
  // Ready to read / Quiet-collapsed) or the alternate Voice grouping when the user's stored pref says
  // so; the Voice filter chips narrow both; `?q=` swaps the groups for the server-side search hits;
  // `?archived=1` adds the archived rows under the affordance. Every row's state arrives derived —
  // the api assembles it from the row sets through `projectState`; this route only maps → groups.
  app.get("/app", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const q = (c.req.query("q") ?? "").trim();
    const voiceFilter = c.req.query("voice") || null; // a personaId or 'unfiled'
    const protocolFilter = c.req.query("protocol") || null; // a protocol id (§5.2 organisation)
    const sort = c.req.query("sort") === "title" ? "title" : "recent"; // Recent is the default
    const showArchived = c.req.query("archived") === "1";
    const showDeleted = c.req.query("deleted") === "1";
    const [rows, voices, groupBy, bal, search, protocols, deletedRows] = await Promise.all([
      deps.dataSource.listProjects(session),
      // The P1.04 seams degrade to empty/attention when a data source lacks them (fixtures, stale
      // bindings) — a missing method is a TypeError, not a rejection, so invoke inside .then.
      Promise.resolve().then(() => deps.dataSource.listVoices(session)).catch(() => []),
      Promise.resolve()
        .then(() => deps.dataSource.getProjectGrouping(session))
        .catch(() => "attention" as const),
      // PRB.12 — the §14.5 level-0 balance chip rides the nav (best-effort: a billing-read miss never
      // blocks the list).
      deps.dataSource.getBillingBalance(session).catch(() => undefined),
      q
        ? Promise.resolve()
            .then(() => deps.dataSource.searchProjects(session, q))
            .catch(() => [])
        : Promise.resolve(null),
      // the Protocol filter dropdown's options (the four seeded cards — picker metadata only).
      Promise.resolve().then(() => deps.dataSource.listProtocolCards(session)).catch(() => []),
      // `?deleted=1` — the 30-day restore window's rows (a separate scope: the list never mixes them).
      showDeleted
        ? Promise.resolve()
            .then(() => deps.dataSource.listDeletedProjects?.(session) ?? [])
            .catch(() => [])
        : Promise.resolve([]),
    ]);
    let filtered = voiceFilter
      ? rows.filter((r) => (voiceFilter === "unfiled" ? r.voice == null : r.voice?.personaId === voiceFilter))
      : rows;
    if (protocolFilter) filtered = filtered.filter((r) => r.protocolId === protocolFilter);
    // Sort applies within each group (Needs-you keeps its deadline order regardless — §5.2).
    if (sort === "title") filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    const activeRows = filtered.filter((r) => r.archivedAt == null);
    const ctx = { voices };
    const toViews = (list: readonly typeof rows[number][]) => list.map((r) => toProjectRowView(r, ctx));
    return c.html(renderDocument(c.req.path, projectsElement, {
      home: {
        groupBy,
        attentionGroups: groupByAttention(activeRows).map((g) => ({ ...g, rows: toViews(g.rows) })),
        voiceGroups: groupByVoice(activeRows).map((g) => ({ ...g, rows: toViews(g.rows) })),
        voices,
        voiceFilter,
        protocolFilter,
        protocols,
        sort,
        showArchived,
        archivedRows: toViews(filtered.filter((r) => r.archivedAt != null)),
        showDeleted,
        deletedRows: toViews(deletedRows),
        ...(search != null ? { search: { q, results: search } } : {}),
      },
      ...(bal ? { balance: { spendableCredits: bal.spendableCredits, heldCredits: bal.heldCredits ?? 0 } } : {}),
    }));
  });

  // P1.04 — the Group-by select persists the per-user pref (PUT /settings/project-grouping) then
  // returns to the home (filter/search query params are dropped — grouping is the whole-page mode).
  app.post("/app/grouping", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const groupBy = form.groupBy === "voice" ? "voice" : "attention";
    await Promise.resolve()
      .then(() => deps.dataSource.setProjectGrouping(session, groupBy))
      .catch(() => undefined);
    return c.redirect("/app");
  });

  // ---- P1.04 — the §5.3 new-project sheet: exactly three entries (scratch / outline / draft) ----

  const NEW_PROJECT_ENTRIES = new Set(["scratch", "outline", "draft"] as const);
  type NewProjectEntry = "scratch" | "outline" | "draft";

  /** The sheet's submitted picker fields — carried through preview/poll/create as hidden inputs. */
  const newProjectForm = (form: Record<string, unknown>) => {
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string).trim() : "");
    const sv = Number(str("startVersion"));
    return {
      title: str("title"),
      protocolId: str("protocolId") || null,
      venue: str("venue") || null,
      personaId: str("personaId") || null,
      startVersion: Number.isInteger(sv) && sv >= 1 ? sv : null,
    };
  };

  /** The shared sheet loader: the protocol cards + the Voice picker's personas (+ REQ-GENRE-4's default
   *  display — Essay for no Voice; the api re-runs the full rule at create). */
  const loadNewProjectSheet = async (session: SessionHeaders) => {
    const [protocols, voices] = await Promise.all([
      Promise.resolve().then(() => deps.dataSource.listProtocolCards(session)).catch(() => []),
      Promise.resolve().then(() => deps.dataSource.listVoices(session)).catch(() => []),
    ]);
    return { protocols, voices };
  };

  /** The pending preview's poll URL — the form fields ride the query so a refresh round-trips them. */
  const newProjectPollUrl = (
    entry: NewProjectEntry,
    quarantineKey: string,
    form: ReturnType<typeof newProjectForm>,
    sourceLabel?: string,
  ): string => {
    const p = new URLSearchParams({ entry, qk: quarantineKey, title: form.title });
    if (form.protocolId) p.set("protocolId", form.protocolId);
    if (form.venue) p.set("venue", form.venue);
    if (form.personaId) p.set("personaId", form.personaId);
    if (form.startVersion != null) p.set("startVersion", String(form.startVersion));
    if (sourceLabel) p.set("src", sourceLabel);
    return `/app/new/preview?${p.toString()}`;
  };

  const renderNewProject = (
    c: Context,
    path: string,
    base: { protocols: Awaited<ReturnType<typeof loadNewProjectSheet>>["protocols"]; voices: Awaited<ReturnType<typeof loadNewProjectSheet>>["voices"] },
    np: Omit<NonNullable<PageData["newProject"]>, "protocols" | "voices">,
    extra?: Partial<PageData>,
  ) =>
    c.html(
      renderDocument(path, newProjectElement, {
        newProject: { protocols: base.protocols, voices: base.voices, ...np },
        ...extra,
      }),
    );

  app.get("/app/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const entryQ = c.req.query("entry");
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "scratch";
    const sheet = await loadNewProjectSheet(session);
    return renderNewProject(c, c.req.path, sheet, {
      entry,
      defaultProtocolId: null,
      askProtocol: false,
      form: { title: "", protocolId: null, venue: null, personaId: null, startVersion: null },
    });
  });

  // The sheet's submit: scratch creates immediately; the upload entries run the workspace-scoped
  // conversion preview FIRST (§5.3's make-or-break moment — nothing is created until the user sees
  // source-beside-converted and clicks Create).
  app.post("/app/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const entryQ = typeof form.entry === "string" ? form.entry : "";
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "scratch";
    const picks = newProjectForm(form);
    const sheet = await loadNewProjectSheet(session);
    if (!picks.title) {
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks, error: "A title is required.",
      }, undefined);
    }
    if (entry === "scratch") {
      let created;
      try {
        created = await deps.dataSource.createProject(session, {
          title: picks.title, entry, protocolId: picks.protocolId, venue: picks.venue, personaId: picks.personaId,
        });
      } catch (e) {
        const message = e instanceof ApiError ? `Could not create the project (${e.code ?? e.status}).` : "Could not create the project.";
        return renderNewProject(c, c.req.path, sheet, {
          entry, defaultProtocolId: null, askProtocol: false, form: picks, error: message,
        });
      }
      return c.redirect(`/p/${created.slug}?created=scratch`);
    }
    // Upload entries — presign → quarantine PUT → convert Job → the preview leg (the PRB.20 path,
    // workspace-scoped: no project exists yet).
    const file = form.file;
    const bytes =
      file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0
        ? new Uint8Array(await (file as File).arrayBuffer())
        : undefined;
    const fileName = bytes && file && typeof file === "object" ? (file as File).name : undefined;
    const paste = typeof form.paste === "string" ? form.paste : "";
    if (!bytes && !paste.trim()) {
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks,
        error: "Upload a file or paste the text.",
      });
    }
    const sourceLabel = fileName ?? "pasted text";
    const raw = await Promise.resolve()
      .then(() =>
        deps.dataSource.previewWorkspaceImport(session, {
          ...(bytes ? { bytes, ...(fileName ? { fileName } : {}) } : { text: paste }),
        }),
      )
      .catch((e: unknown) => e);
    const out =
      raw && typeof raw === "object" && "status" in raw ? (raw as ImportPreviewOutcome) : null;
    if (!out) {
      // the preview seam missing/failed — re-render the sheet with the honest error, nothing created.
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks,
        error: "The conversion could not start — try again.",
      });
    }
    if (out.status === "pending") {
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks,
        pending: { quarantineKey: out.quarantineKey, sourceLabel },
      }, {
        autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: newProjectPollUrl(entry, out.quarantineKey, picks, sourceLabel) },
      });
    }
    return renderNewProject(c, c.req.path, sheet, {
      entry, defaultProtocolId: null, askProtocol: false, form: picks,
      preview: {
        quarantineKey: out.quarantineKey,
        sourceLabel,
        sourceText: paste || (bytes ? `(${bytes.byteLength} bytes)` : ""),
        convertedMarkdown: out.preview.markdown,
        countLine: countLine(out.preview.counts),
        warnings: out.preview.warnings.map((w) => ({ message: w.message, blockId: w.anchor?.blockId ?? null })),
      },
    });
  });

  // PRB.21-style poll leg for the new-project preview (meta-refresh target): re-preview the SAME
  // quarantine key — a warm read-back answers in ~190 ms; cold re-answers pending inside the bound.
  app.get("/app/new/preview", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const entryQ = c.req.query("entry") ?? "draft";
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "draft";
    const picks = newProjectForm(c.req.query() as Record<string, unknown>);
    const qk = c.req.query("qk");
    if (!qk) return c.redirect(`/app/new?entry=${entry}`);
    const sheet = await loadNewProjectSheet(session);
    const sourceLabel = c.req.query("src") ?? "the upload";
    const out = await Promise.resolve()
      .then(() =>
        deps.dataSource.previewWorkspaceImport(session, {
          quarantineKey: qk,
          fileName: c.req.query("src") ?? undefined,
        }),
      )
      .catch(() => null);
    if (!out) return c.redirect(`/app/new?entry=${entry}`);
    if (out.status === "pending") {
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks,
        pending: { quarantineKey: qk, sourceLabel },
      }, {
        autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: newProjectPollUrl(entry, qk, picks, sourceLabel) },
      });
    }
    return renderNewProject(c, c.req.path, sheet, {
      entry, defaultProtocolId: null, askProtocol: false, form: picks,
      preview: {
        quarantineKey: qk,
        sourceLabel,
        sourceText: "(the uploaded source — already converted)",
        convertedMarkdown: out.preview.markdown,
        countLine: countLine(out.preview.counts),
        warnings: out.preview.warnings.map((w) => ({ message: w.message, blockId: w.anchor?.blockId ?? null })),
      },
    });
  });

  // The preview's Create (and Fix-now) — replays the quarantine key + the pick fields; the api adopts
  // the ALREADY-converted object (never a second upload or a second Job).
  app.post("/app/new/create", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const entryQ = typeof form.entry === "string" ? form.entry : "";
    const entry: NewProjectEntry = NEW_PROJECT_ENTRIES.has(entryQ as NewProjectEntry)
      ? (entryQ as NewProjectEntry)
      : "draft";
    const picks = newProjectForm(form);
    const qk = typeof form.qk === "string" ? form.qk : "";
    const sheet = await loadNewProjectSheet(session);
    let created;
    try {
      created = await deps.dataSource.createProject(session, {
        title: picks.title,
        entry,
        protocolId: picks.protocolId,
        venue: picks.venue,
        personaId: picks.personaId,
        ...(picks.startVersion != null ? { startVersion: picks.startVersion } : {}),
        quarantineKey: qk,
      });
    } catch (e) {
      // A still-converting key (a stale preview page or a slow Job) drops back to the converting
      // state — its poll finishes the preview, no bytes re-uploaded.
      if (e instanceof ApiError && e.status === 409 && e.code === "conversion_pending") {
        return renderNewProject(c, c.req.path, sheet, {
          entry, defaultProtocolId: null, askProtocol: false, form: picks,
          pending: { quarantineKey: qk, sourceLabel: "the upload" },
        }, {
          autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: newProjectPollUrl(entry, qk, picks) },
        });
      }
      const message = e instanceof ApiError ? `Could not create the project (${e.code ?? e.status}).` : "Could not create the project.";
      return renderNewProject(c, c.req.path, sheet, {
        entry, defaultProtocolId: null, askProtocol: false, form: picks, error: message,
      }, undefined);
    }
    // §5.3's per-entry landing: the project opens with its next-step card (`?created=` drives it) and —
    // for an upload that left warnings — the Conversion-notes line. Fix-now lands on the Page at the
    // imported draft where the [unconverted] markers live.
    const q = new URLSearchParams({ created: entry });
    if (created.conversionNotes) {
      q.set("cn", String(created.conversionNotes.warnings));
      q.set("cu", String(created.conversionNotes.unconverted));
    }
    const action = typeof form.action === "string" ? form.action : "create";
    if (action === "fix_now" && entry === "draft" && created.draftN != null) {
      return c.redirect(`/p/${created.slug}/v/${created.draftN}?${q.toString()}`);
    }
    return c.redirect(`/p/${created.slug}?${q.toString()}`);
  });

  // ---- P1.04 — the row actions (§5.2's "…" menu): the web POSTs resolve slug → id then call the
  // api through the data source. Slugs never change on rename; duplicate lands on the copy. ----

  /** Resolve the session-scoped project row for a slug (list rows are already tenant-scoped). */
  const projectRowFor = async (session: SessionHeaders, slug: string) =>
    (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug) ?? null;

  app.post("/p/:project/rename", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = await projectRowFor(session, slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const title = typeof form.title === "string" ? form.title.trim() : "";
    if (title) {
      await Promise.resolve()
        .then(() => deps.dataSource.renameProject(session, row.id, title))
        .catch(() => undefined);
    }
    return c.redirect(`/p/${slug}`);
  });

  app.post("/p/:project/duplicate", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = await projectRowFor(session, slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const copy = await Promise.resolve()
      .then(() => deps.dataSource.duplicateProject(session, row.id))
      .catch(() => null);
    return c.redirect(copy ? `/p/${copy.slug}` : `/p/${slug}`);
  });

  for (const [suffix, call] of [
    ["archive", (ds: DataSource, s: SessionHeaders, id: string) => ds.archiveProject(s, id)],
    ["unarchive", (ds: DataSource, s: SessionHeaders, id: string) => ds.unarchiveProject(s, id)],
    ["delete", (ds: DataSource, s: SessionHeaders, id: string) => ds.deleteProject(s, id)],
  ] as const) {
    app.post(`/p/:project/${suffix}`, async (c) => {
      const session = deps.session(c);
      if (!session) return c.redirect("/login");
      const slug = c.req.param("project");
      const row = await projectRowFor(session, slug);
      if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
      await Promise.resolve()
        .then(() => call(deps.dataSource, session, row.id))
        .catch(() => undefined);
      return c.redirect("/app");
    });
  }

  // Restore resolves against the DELETED rows (the live list never carries them — §5.2's 30-day window).
  app.post("/p/:project/restore", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const deleted = await Promise.resolve()
      .then(() => deps.dataSource.listDeletedProjects?.(session) ?? [])
      .catch(() => []);
    const row = deleted.find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    await Promise.resolve()
      .then(() => deps.dataSource.restoreProject(session, row.id))
      .catch(() => undefined);
    return c.redirect("/app?deleted=1");
  });

  // ---- PRB.12 — Settings (the REQ-PROD-15 toggle) + the §14.5 usage glance + the dwell beacon sink ----
  app.get("/settings", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const [privacy, theme] = await Promise.all([
      deps.dataSource.getPrivacySettings(session).catch(() => ({ analyticsOptOut: false })),
      Promise.resolve().then(() => deps.dataSource.getTheme?.(session)).catch(() => null),
    ]);
    return c.html(renderDocument(c.req.path, settingsElement, {
      privacy: { analyticsOptOut: privacy.analyticsOptOut, saved: c.req.query("saved") === "1" },
      ...(theme?.appTheme ? { theme: { pref: theme.appTheme } } : {}),
    }));
  });
  // P1.01 — the app-theme control (the no-JS form counterpart of the IDE shell's theme menu; both write
  // "user".app_theme through the api). The POST redirects back with the saved flash.
  app.post("/settings/theme", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const appTheme = form.appTheme;
    if (appTheme === "dark" || appTheme === "light" || appTheme === "auto") {
      await deps.dataSource.setTheme(session, appTheme).catch(() => undefined);
    }
    return c.redirect("/settings?saved=1");
  });
  app.post("/settings/privacy", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    // The checkbox posts "on" when sharing is on — the flag it binds is the inverse (opt-OUT).
    const optOut = form.analytics !== "on";
    await deps.dataSource.setAnalyticsOptOut(session, optOut);
    return c.redirect("/settings?saved=1");
  });
  app.get("/usage", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const usage = await deps.dataSource.getUsage(session).catch(() => undefined);
    return c.html(renderDocument(c.req.path, usageElement, {
      ...(usage ? { usage } : {}),
      dwellSurface: "usage",
    }));
  });
  // The dwell heartbeat's sink (REQ-BETA-10): the beacon posts {surface, ms}; the route wraps it into the
  // whitelisted `surface.dwell` mint. A missing/malformed body is a quiet 204 — heartbeats are lossy by design.
  app.post("/a/dwell", async (c) => {
    const session = deps.session(c);
    if (!session) return c.body(null, 401);
    const body = (await c.req.json().catch(() => null)) as { surface?: unknown; ms?: unknown } | null;
    if (typeof body?.surface === "string" && typeof body?.ms === "number" && body.ms > 0) {
      emit(session, "surface.dwell", { surface: body.surface.slice(0, 40), ms: Math.min(Math.round(body.ms), 3_600_000) });
    }
    return c.body(null, 204);
  });

  // Auth-gated: the flat project view (canonical /p/:project) + the Needs-you surface (PRB.05: the open
  // gate cards) and the Decisions list (the beta Inbox stand-in, §5.7).
  app.get("/p/:project", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const rows = await deps.dataSource.listProjects(session);
    const row = rows.find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const [gates, decisions, approvalOverrides, projectVoice] = await Promise.all([
      deps.dataSource.listGates(session, row.id).catch(() => []),
      deps.dataSource.listDecisions(session, row.id).catch(() => []),
      deps.dataSource.getApprovalOverrides(session, row.id).catch(() => ({}) as Record<string, number | null>),
      // PRB.10 — the voice picker: the project's linked-voice facts + the selectable personas (§9.6).
      // (Deferred inside .then so a data source missing the voice seam degrades to no-picker, not a 500.)
      Promise.all([
        Promise.resolve().then(() => deps.dataSource.getProjectVoice(session, row.id)).catch(() => null),
        Promise.resolve().then(() => deps.dataSource.listVoices(session)).catch(() => []),
      ]).then(([current, options]) => (current ? { current, options } : undefined)),
    ]);
    // a bounced disposition write (a gate row's per-finding override) re-renders with the error under
    // that row's controls — never dropped silently.
    const derror = c.req.query("derror");
    // PRB.12 — the presence timer actually rendered on this page for a card with a live countdown
    // (§6.4 item 2; REQ-SPEC-18). One mint per timer shown.
    for (const g of gates) {
      if (g.presenceDeadlineAt && !g.pausedWhileReading) {
        emit(session, "gate.presence_timer_shown", { kind: g.kind }, { projectId: row.id, runId: g.runId });
      }
    }
    // P1.02 item 12 — `/p/:project` opens the Page on the working head. The doc read is exact and
    // best-effort: a missing/locked head degrades to the plain overview, never a failed page.
    const pageLoad = row.headDraftId
      ? await loadEditorPage(deps.dataSource, session, row.id, row.headDraftId).catch(() => null)
      : null;
    return c.html(
      renderDocument(c.req.path, projectElement, {
        // P1.01 — the project overview mounts inside the IDE frame; ?focus=1 seeds the Focus view.
        ...(await ideContext(c, session, { ...row, slug }, {
          inboxCount: gates.length + decisions.length,
          ...(pageLoad
            ? {
                status: {
                  version: `v${pageLoad.doc.draftN}`,
                  ...(pageLoad.doc.meters?.words != null ? { words: pageLoad.doc.meters.words } : {}),
                  ...(pageLoad.doc.meters?.readMin != null ? { readMin: pageLoad.doc.meters.readMin } : {}),
                  ...(pageLoad.doc.venueCap ? { venueCap: pageLoad.doc.venueCap } : {}),
                },
              }
            : {}),
        })),
        project: {
          title: row.title,
          pill: row.state.pill,
          slug,
          headDraftId: row.headDraftId,
          // P1.04 — the row action's Rename (?rename=1 renders the inline title form) and the §5.3
          // create landing (?created=scratch|outline|draft → the next-step card; cn/cu carry the
          // conversion's warning/unconverted counts onto the Conversion-notes line).
          ...(c.req.query("rename") === "1" ? { rename: true } : {}),
          ...(["scratch", "outline", "draft"].includes(c.req.query("created") ?? "")
            ? {
                created: {
                  entry: c.req.query("created") as "scratch" | "outline" | "draft",
                  draftN: row.headDraftN ?? null,
                  ...(c.req.query("cn") != null || c.req.query("cu") != null
                    ? {
                        notes: {
                          warnings: Number(c.req.query("cn") ?? 0) || 0,
                          unconverted: Number(c.req.query("cu") ?? 0) || 0,
                        },
                      }
                    : {}),
                },
              }
            : {}),
        },
        ...(pageLoad
          ? {
              page: {
                slug,
                projectId: row.id,
                doc: pageLoad.doc,
                docJson: pageLoad.docJson,
                ...(deps.collabWsUrl ? { collabWsUrl: deps.collabWsUrl } : {}),
              },
            }
          : {}),
        gates,
        dwellSurface: "project",
        decisions,
        approvalOverrides,
        ...(projectVoice ? { projectVoice } : {}),
        compact: isPhoneRequest(c),
        ...(derror
          ? {
              triage: {
                dispositionError: {
                  findingId: derror,
                  message: COPY.triage.noteRequired,
                },
              },
            }
          : {}),
      }),
    );
  });

  // PRB.10 — the project voice picker (§9.6; REQ-DATA-32): the select POSTs the chosen persona (or "" for
  // "No voice" — the ad-hoc default, REQ-PERSONA-20); the api pins the profile snapshot server-side.
  app.post("/p/:project/voice", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const personaId = typeof form.personaId === "string" && form.personaId !== "" ? form.personaId : null;
    await deps.dataSource.setProjectVoice(session, row.id, { personaId }).catch(() => undefined);
    return c.redirect(`/p/${slug}`);
  });

  // PRB.05 — the per-project approve_triage 24-h opt-in (§6.4 R3): the checkbox writes the
  // `approval_overrides` row the api validates (≥2 h, wait-default kinds only — REQ-SPEC-1).
  app.post("/p/:project/approval-overrides", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const current = await deps.dataSource.getApprovalOverrides(session, row.id).catch(() => ({}) as Record<string, number | null>);
    const overrides: Record<string, number | null> = { ...current };
    if (form.approve_triage_24h === "on") overrides.approve_triage = 24 * 60 * 60 * 1000;
    else delete overrides.approve_triage;
    await deps.dataSource.setApprovalOverrides(session, row.id, overrides);
    return c.redirect(`/p/${slug}`);
  });

  // PRB.05 — a gate card's decision (§6.4). The card's action buttons POST here; the api resolves/holds.
  app.post("/p/:project/gates/:gid", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const action = typeof form.action === "string" ? form.action : "";
    const guidance = typeof form.guidance === "string" && form.guidance.trim() !== "" ? form.guidance : undefined;
    const standing = form.standing === "true" || form.standing === "on";
    await deps.dataSource.decideGate(session, row.id, c.req.param("gid"), {
      action: action === "wait" ? "wait" : (action as "approve" | "approve_autonomous" | "keep_planning" | "stop"),
      ...(guidance != null ? { guidance } : {}),
      ...(standing ? { standingRule: true } : {}),
    });
    return c.redirect(`/p/${slug}`);
  });

  // PRB.05 — a presence/reading ping from a gate card's inline script (§6.4 item 2; REQ-SPEC-18).
  // Progressive enhancement: with no JS the pings simply never arrive and the gate keeps its long
  // deadline. Returns 204 — the script doesn't navigate.
  app.post("/p/:project/gates/:gid/activity", async (c) => {
    const session = deps.session(c);
    if (!session) return c.body(null, 401);
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.body(null, 404);
    const form = await c.req.parseBody();
    const activity = typeof form.activity === "string" ? form.activity : "";
    if (activity !== "present" && activity !== "reading" && activity !== "blur") return c.body(null, 422);
    await deps.dataSource.recordGateActivity(session, row.id, c.req.param("gid"), activity).catch(() => undefined);
    return c.body(null, 204);
  });

  // PRB.05 — answer a Decisions row (the row's option, or "dismiss").
  app.post("/p/:project/decisions/:dcr", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const answer = typeof form.answer === "string" ? form.answer : "";
    await deps.dataSource.answerDecision(session, row.id, c.req.param("dcr"), answer);
    return c.redirect(`/p/${slug}`);
  });

  // Auth-gated: the §5.3 import flow (upload/paste → conversion preview → create).
  app.get("/p/:project/import", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(
      renderDocument(c.req.path, importElement, {
        ...(await ideContext(c, session, row)),
        project: { title: row.title, pill: row.state.pill, slug },
      }),
    );
  });

  app.post("/p/:project/import/preview", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const input = await parseImportInput(c, slug);
    const out = await deps.dataSource.previewImport(session, input);
    if (out.status === "pending") {
      // PRB.21 — a cold convert Job runs ~2.5–4 min; never hold one request for it. Render the
      // converting state; the page re-polls the GET below (the api joins the in-flight execution —
      // a retry is neither a second upload nor a duplicate `jobs:run`).
      return c.html(
        renderDocument(c.req.path, importPreviewElement, {
          ...(await ideContext(c, session, { id: slug, slug })),
          project: { title: input.fileName ?? slug, pill: "", slug },
          conversion: {
            projectSlug: slug,
            sourceLabel: input.fileName ?? "pasted text",
            pending: true,
            quarantineKey: out.quarantineKey,
          },
          autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: importPollUrl(slug, out.quarantineKey, input.fileName) },
        }),
      );
    }
    return c.html(
      renderDocument(c.req.path, importPreviewElement, {
        ...(await ideContext(c, session, { id: slug, slug })),
        project: { title: input.fileName ?? slug, pill: "", slug },
        conversion: toConversionData(slug, input, out.preview, out.quarantineKey),
      }),
    );
  });

  // PRB.21 — the pending preview's poll leg (the page's meta-refresh target): re-preview the SAME
  // quarantine key. Warm, the read-back cache answers in ~190 ms; cold, the api joins the still-running
  // execution and answers `pending` again inside the bounded wait — the page refreshes itself until ready.
  app.get("/p/:project/import/preview", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const qk = c.req.query("qk");
    if (!qk) return c.redirect(`/p/${slug}/import`);
    const src = c.req.query("src");
    const input: ImportInput = { projectSlug: slug, quarantineKey: qk, ...(src ? { fileName: src } : {}) };
    const out = await deps.dataSource.previewImport(session, input);
    if (out.status === "pending") {
      return c.html(
        renderDocument(c.req.path, importPreviewElement, {
          ...(await ideContext(c, session, { id: slug, slug })),
          project: { title: input.fileName ?? slug, pill: "", slug },
          conversion: {
            projectSlug: slug,
            sourceLabel: input.fileName ?? "the upload",
            pending: true,
            quarantineKey: out.quarantineKey,
          },
          autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: importPollUrl(slug, out.quarantineKey, input.fileName) },
        }),
      );
    }
    return c.html(
      renderDocument(c.req.path, importPreviewElement, {
        ...(await ideContext(c, session, { id: slug, slug })),
        project: { title: input.fileName ?? slug, pill: "", slug },
        conversion: toConversionData(slug, input, out.preview, out.quarantineKey),
      }),
    );
  });

  app.post("/p/:project/import/create", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const input = await parseImportInput(c, slug);
    try {
      await deps.dataSource.createImport(session, input);
    } catch (e) {
      // PRB.21 — the converted object wasn't there yet (a stale preview page or a slow Job): the api
      // 409s `conversion_pending` — drop back to the converting state; its poll finishes the preview.
      if (e instanceof ApiError && e.status === 409 && e.code === "conversion_pending" && input.quarantineKey) {
        return c.html(
          renderDocument(c.req.path, importPreviewElement, {
            conversion: {
              projectSlug: slug,
              sourceLabel: input.fileName ?? "the upload",
              pending: true,
              quarantineKey: input.quarantineKey,
            },
            autoRefresh: { seconds: IMPORT_PREVIEW_POLL_SECONDS, url: importPollUrl(slug, input.quarantineKey, input.fileName) },
          }),
        );
      }
      throw e;
    }
    // The draft now exists; the flat project view shows it. (Fix-now block editing is PRB.07.)
    return c.redirect(`/p/${slug}`);
  });

  // Auth-gated: the run sheet — the launcher for Review / Revise / Fact-check and the ONLY paywall (§5.6).
  // GET renders the sheet for the chosen workflow/rigor (query-driven, no client bundle); the estimate is
  // computed via the shared @rhema/run-sheet estimator (the same one the stateless /estimates endpoint uses).
  app.get("/p/:project/run", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    // PRB.21 / D-PRB.20-1 — the project already has a non-terminal run ⇒ the sheet renders its
    // in-progress state (a link to the run's surface) instead of the Run affordance; a second Run click
    // can never spawn a duplicate (the api also 409s — this is the honest first screen).
    if (row.activeRun) {
      return c.html(
        renderDocument(c.req.path, runSheetElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          runSheet: {
            slug,
            projectTitle: row.title,
            view: buildSheet(c.req.query(), undefined, deps.betaPlanOfferUrl),
            activeRun: row.activeRun,
          },
          compact: isPhoneRequest(c),
        }),
      );
    }
    // PRB.08 — the REAL balance: spendable credits, suspension, and the beta Payment Link for the panel.
    const billing = await deps.dataSource.getBillingBalance(session).catch(() => undefined);
    // PRB.10 — the voice line (§9.6): the project's linked persona + the shared pill, or the ad-hoc
    // default. When the pill's action is `update_voice` the priced chained action renders ("Update voice
    // first ≈N cr") — a fact + an action, never a gate (a stale/untested/never-built voice never blocks).
    const pv = await Promise.resolve()
      .then(() => deps.dataSource.getProjectVoice(session, row.id))
      .catch(() => null);
    let updateEstimateCredits: number | undefined;
    if (pv?.status?.action === "update_voice" && pv.personaId) {
      updateEstimateCredits = (
        await Promise.resolve()
          .then(() => deps.dataSource.estimateVoice(session, pv.personaId!, "quick"))
          .catch(() => null)
      )?.estimateCredits;
    }
    // PRB.12 — the staleness banner showing IS the `voice.staleness_shown` event (state = the pill's state).
    if (pv?.status?.action === "update_voice") {
      emit(session, "voice.staleness_shown", { state: pv.status.state }, { projectId: row.id });
    }
    const view = {
      ...buildSheet(c.req.query(), billing, deps.betaPlanOfferUrl),
      ...(pv
        ? {
            voice:
              pv.voiceMode === "ad_hoc"
                ? ({ mode: "ad_hoc" } as const)
                : ({
                    mode: "linked",
                    ...(pv.personaId ? { personaId: pv.personaId } : {}),
                    name: pv.name ?? pv.personaId,
                    ...(pv.status ? { pill: pv.status.pill } : {}),
                    ...(pv.snapshot?.builtAt ? { snapshotAt: pv.snapshot.builtAt } : {}),
                    ...(updateEstimateCredits != null
                      ? { updateEstimateCredits, updateAction: `/p/${slug}/update-voice` }
                      : {}),
                  } as const),
          }
        : {}),
    };
    // REQ-BETA-12 — the exhaustion prompt showing IS the telemetry event (action_taken:"shown"); the panel's
    // Payment-Link click records "open_payment_link" via /p/:slug/exhausted.
    if (view.insufficient) {
      await deps.dataSource.recordExhaustedPrompt(session, "shown").catch(() => undefined);
    }
    // PRB.05 / REQ-IDE-28: the Revise sheet shows "you pre-triaged N of M" (the user's rows are
    // highest-precedence guidance for the run). A failed read never blocks the sheet.
    let pretriage: { triaged: number; total: number } | undefined;
    if (view.workflow === "revise") {
      pretriage = await deps.dataSource
        .getPretriage(session, row.id)
        .then((p) => ({ triaged: p.triaged, total: p.total }))
        .catch(() => undefined);
    }
    return c.html(renderDocument(c.req.path, runSheetElement, {
      ...(await ideContext(c, session, row)),
      project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
      runSheet: { slug, projectTitle: row.title, view },
      ...(pretriage ? { pretriage } : {}),
      compact: isPhoneRequest(c),
    }));
  });

  // The Run click — the ONLY run creator (REQ-CHAT-25). Mints nothing new: the sheet-minted idempotency key
  // comes in the form. On success the sheet reports the run started (§5.6 item 10).
  app.post("/p/:project/run", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const workflow = normalizeWorkflow(str("workflow"));
    const rigor = normalizeRigor(str("rigor"));
    // §6.5: model tier is a CONSEQUENCE of rigor (the beta has no tier selector). Derive it from the
    // submitted rigor rather than trusting a possibly-stale (no-JS) hidden field — run creation re-derives
    // the estimate/cap from these, so the frozen figures always match the run's rigor+tier.
    const modelTier = normalizeTier("", workflow, rigor);
    const words = Number(str("words")) || 0;
    const claims = Number(str("claims")) || undefined;
    // PRB.23 — the Advanced toggles ride the SAME form as `toggle.<key>` checkboxes plus a
    // `toggleKeys` sentinel (an unchecked box submits NOTHING, so the sentinel is what lets an
    // explicit OFF reach the server). The resolved set is sent to the api, which freezes it into
    // the run's inputs (phase opt-out flags) and prices the SAME set — before this, the estimate
    // priced rigor defaults while the pod ran every manifest phase regardless.
    const toggleKeys = str("toggleKeys").split(",").filter(Boolean);
    const toggles: Record<string, boolean> = {};
    const toggleQuery: Record<string, string> = {};
    for (const key of toggleKeys) {
      const on = str(`toggle.${key}`) === "on";
      toggles[key] = on;
      toggleQuery[`toggle.${key}`] = on ? "on" : "off";
    }
    const billing = await deps.dataSource.getBillingBalance(session).catch(() => undefined);
    const view = buildSheet({ workflow, rigor, ...toggleQuery }, billing, deps.betaPlanOfferUrl);
    try {
      await deps.dataSource.createRun(session, row.id, {
        idempotencyKey: str("idempotencyKey") || randomUUID(),
        workflow,
        modelProfile: { tier: modelTier },
        modelTier,
        rigor,
        estimateCredits: Number(str("estimateCredits")) || 0,
        capCredits: Number(str("capCredits")) || 0,
        rateTableVersion: Number(str("rateTableVersion")) || 1,
        inputs: {},
        // the sheet's resolved Advanced toggle set — the api freezes it into the run inputs as
        // manifest opt-out flags AND re-derives the estimate from it (PRB.23).
        toggles,
        // REQ-BILL-6: freeze the word/claim counts the estimate was computed for on the run record.
        inputSnapshot: { wordCount: words, ...(claims != null ? { claimCount: claims } : {}) },
      });
    } catch (e) {
      // Insufficient balance (§14.6): never a silent bill — re-render the sheet with the resolution notice,
      // no run created. Any other api error is a real failure and propagates.
      // PRB.21 / D-PRB.20-1 — a run went live between the sheet render and the click (or a second tab):
      // the api 409s `run_in_progress` and no second hold was taken. Re-render the in-progress state,
      // refreshing the active run fact from the project list — never an error page.
      if (e instanceof ApiError && e.status === 409 && e.code === "run_in_progress") {
        const fresh = await deps.dataSource
          .listProjects(session)
          .then((rows) => rows.find((r) => r.slug === slug))
          .catch(() => undefined);
        return c.html(
          renderDocument(c.req.path, runSheetElement, {
            ...(await ideContext(c, session, { ...fresh, id: row.id, slug })),
            project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
            runSheet: {
              slug,
              projectTitle: row.title,
              view,
              activeRun: fresh?.activeRun ?? { runId: "", state: "" },
            },
          }),
          409,
        );
      }
      if (e instanceof ApiError && e.status === 402) {
        // the panel is showing again (the Run click hit the balance wall) — count the impression.
        await deps.dataSource.recordExhaustedPrompt(session, "shown").catch(() => undefined);
        return c.html(renderDocument(c.req.path, runSheetElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          runSheet: { slug, projectTitle: row.title, view, notice: COPY.runSheet.insufficient },
        }));
      }
      // REQ-SPEC-24.7 + PRB.13: a suspension or an unverified email can land between the sheet render and
      // the Run click — the api 403s with the reason code on the error (`account_suspended` /
      // `email_unverified`); re-render the sheet with the matching notice, never a silent failure.
      if (e instanceof ApiError && e.status === 403) {
        const fresh = buildSheet({ workflow, rigor }, await deps.dataSource.getBillingBalance(session).catch(() => undefined), deps.betaPlanOfferUrl);
        const notice = e.code === "email_unverified" ? COPY.runSheet.emailUnverified : COPY.runSheet.suspended;
        return c.html(renderDocument(c.req.path, runSheetElement, {
          ...(await ideContext(c, session, row)),
          project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
          runSheet: { slug, projectTitle: row.title, view: fresh, notice },
        }), 403);
      }
      throw e;
    }
    // Re-render the sheet with the run-started confirmation (the run card lives on the project view — P1.01).
    return c.html(renderDocument(c.req.path, runSheetElement, {
      ...(await ideContext(c, session, row)),
      project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
      runSheet: { slug, projectTitle: row.title, view, started: true },
    }));
  });

  // PRB.08 — the exhaustion panel's Payment-Link action (§14.6; the beta's ONE real-money channel). A plain
  // form POST (no JS needed): record `credits.exhausted_prompt{action_taken}` (REQ-BETA-12), then 302 to the
  // Payment Link for `open_payment_link`. The link URL comes from the api's balance read (deploy config) —
  // never a form field, so this route is no open redirect.
  app.post("/p/:project/exhausted", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const action = typeof form.action_taken === "string" && form.action_taken !== "" ? form.action_taken : "unknown";
    await deps.dataSource.recordExhaustedPrompt(session, action).catch(() => undefined);
    if (action === "open_payment_link") {
      const billing = await deps.dataSource.getBillingBalance(session).catch(() => undefined);
      // F32 (PRB.19): the Payment Link must carry `client_reference_id=<billingAccountId>` — without it the
      // Stripe-originated checkout lands `unresolved` (money taken, no grant(topup)). Composed, never
      // concatenated, so an existing query on the configured link survives.
      if (billing?.paymentLinkUrl) {
        return c.redirect(paymentLinkWithReference(billing.paymentLinkUrl, billing.billingAccountId));
      }
    }
    return c.redirect(`/p/${slug}/run`);
  });

  // Auth-gated: the delivered-review dossier reading surface (PRB.04, §5.5/§5.7/§6.6). The findings-core read
  // models + @rhema/ui surfaces render server-side; the live data binding (reading a delivered run) is D-PRB.04-1.
  app.get("/p/:project/review/:runId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const runId = c.req.param("runId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const dossier = await deps.dataSource.getDossier(session, { projectSlug: slug, runId });
    const savedFindingId = c.req.query("disposed") || undefined;
    // PRB.12 — the reading surface's view emissions (the intake whitelist's whole reason to exist):
    // the report view itself, each rendered finding, and the second-read section when it has content.
    emit(session, "run.report_viewed", { cost_actual: dossier.runCard.spentCredits }, { projectId: row.id, runId });
    for (const f of dossier.findings) {
      emit(session, "finding.viewed", { severity: f.severity, phase_of_origin: f.origin }, { projectId: row.id, runId });
    }
    if (dossier.findings.some((f) => f.origin === "second_read")) {
      emit(session, "secondread.opened", {}, { projectId: row.id, runId });
    }
    return c.html(renderDocument(c.req.path, dossierElement, {
      // P1.01 — the dossier IS the IDE's flagship reading surface: its findings feed the Margin
      // (cards ↔ ticks) + the Desk's screen-reader findings table, its run feeds the Timeline.
      ...(await ideContext(c, session, row, {
        findings: dossier.findings.map((f) => ({ id: f.id, severity: f.severity, kind: f.kind, excerpt: f.title })),
        timeline: [{ id: runId, label: dossier.versionLabel, state: "delivered", href: `/p/${slug}/review/${runId}` }],
        status: { version: dossier.versionLabel },
      })),
      project: { title: dossier.projectTitle, pill: "", slug, headDraftId: row.headDraftId },
      dossier,
      compact: isPhoneRequest(c),
      dwellSurface: "dossier",
      ...(savedFindingId ? { triage: { savedFindingId } } : {}),
    }));
  });

  // PRB.05 — the disposition write (§5.7): the five verbs + note + optional reason chip. Progressive
  // enhancement: a plain form POST; a validation error re-renders the dossier with the error under the
  // card (a rebut/escalate with no rationale round-trips a 422). Two mount paths: the dossier route (its
  // runId locates the dossier to re-render) and the project-scoped route a gate card's per-row override uses.
  const dispositionHandler = async (c: Context) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const runId = c.req.param("runId") ?? "";
    const findingId = c.req.param("fid") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row || findingId === "") return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const verb = str("verb");
    const note = str("note");
    const adaptedText = str("adapted_text");
    const reasonCode = str("reason_code");
    const back = safeBack(str("next"), runId !== "" ? `/p/${slug}/review/${runId}` : `/p/${slug}`);
    try {
      await deps.dataSource.recordDisposition(session, row.id, findingId, {
        kind: verb as "accept" | "adapt" | "rebut" | "defer" | "escalate",
        ...(note.trim() !== "" ? { rationale: note } : {}),
        ...(adaptedText.trim() !== "" ? { adaptedText } : {}),
        ...(reasonCode.trim() !== "" ? { reasonCode } : {}),
      });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 422 || e.status === 409)) {
        // Re-render the dossier with the error under the card when we have one; otherwise bounce back
        // to the project page (the error is on the gate row's form — the POST stays idempotent).
        if (runId === "") return c.redirect(`${back}${back.includes("?") ? "&" : "?"}derror=${encodeURIComponent(findingId)}`);
        const dossier = await deps.dataSource.getDossier(session, { projectSlug: slug, runId });
        const message =
          e.status === 409
            ? "This finding's disposition is frozen — the ledger locked at delivery."
            : `a rationale is required for ${verb}`;
        return c.html(
          renderDocument(c.req.path, dossierElement, {
            ...(await ideContext(c, session, row, {
              findings: dossier.findings.map((f) => ({ id: f.id, severity: f.severity, kind: f.kind, excerpt: f.title })),
            })),
            project: { title: dossier.projectTitle, pill: "", slug, headDraftId: row.headDraftId },
            dossier,
            compact: isPhoneRequest(c),
            triage: { dispositionError: { findingId, message } },
          }),
          e.status as 422 | 409,
        );
      }
      throw e;
    }
    return c.redirect(`${back}${back.includes("?") ? "&" : "?"}disposed=${encodeURIComponent(findingId)}`);
  };
  app.post("/p/:project/review/:runId/findings/:fid/disposition", dispositionHandler);
  app.post("/p/:project/findings/:fid/disposition", dispositionHandler);

  // PRB.06 — the What-changed page (§5.8): what changed and why for a delivered response. GET renders the
  // server-joined view; the hunk comment POST lands a Guidance row for the next Revise (§6.5).
  app.get("/p/:project/revisions/:cid", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const cid = c.req.param("cid");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const data = await deps.dataSource.getWhatChanged(session, row.id, cid).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!data) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const commented = c.req.query("commented") || undefined;
    return c.html(
      renderDocument(c.req.path, revisionElement, {
        ...(await ideContext(c, session, row)),
        project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
        revision: { slug, data, ...(commented ? { commentedHunkId: commented } : {}) },
        compact: isPhoneRequest(c),
      }),
    );
  });

  app.post("/p/:project/revisions/:cid/hunks/:hunkId/comments", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const cid = c.req.param("cid");
    const hunkId = c.req.param("hunkId");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const text = typeof form.text === "string" ? form.text.trim() : "";
    if (text !== "") {
      await deps.dataSource.commentOnHunk(session, row.id, cid, hunkId, text).catch(() => undefined);
    }
    return c.redirect(`/p/${slug}/revisions/${cid}?commented=${encodeURIComponent(hunkId)}`);
  });

  // -------------------------------------------------------------------------------------------------------------------
  // PRB.07 — the source editor (§5.4/§6.3; REQ-BETA-21 stopgap #1 → 1.x Source mode). GET renders the SSR
  // page (CodeMirror host + lock banner + projected findings rail + note field); the client bundle then
  // drives the debounced autosave + lock poll through the same-origin routes below — the browser never
  // talks to the api directly, so the session stays server-side. The form POSTs (note / cancel-run /
  // revise) are progressive enhancement: they work with no JS at all. There is no Save button and no
  // unsaved-changes dialog anywhere — /save is the autosave/beacon endpoint, not a control.
  // -------------------------------------------------------------------------------------------------------------------

  /** Resolve :project → the row + draftId param, or null (404). */
  const editorTarget = async (c: Context, session: SessionHeaders) => {
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return null;
    return { slug, row, draftId: c.req.param("draftId") ?? "" };
  };

  // -------------------------------------------------------------------------------------------------------------------
  // P1.02 — the Page routes (§5.4; REQ-DATA-28/29 amended). `/p/:project/v/working` is the editable
  // head; `/p/:project/v/:n` renders that version's draft (frozen ⇒ read-only Page — typing would fork,
  // but the frozen view itself is the read render). The CodeMirror `/edit/:draftId` page is superseded
  // (redirect below); its same-origin /doc /save /note /cancel-run /revise endpoints stay — they ARE
  // the Page's transport surface (the seam, unchanged for P1.03's swap).
  // -------------------------------------------------------------------------------------------------------------------

  app.get("/p/:project/v/:v", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const v = c.req.param("v") ?? "working";
    const resolved = await deps.dataSource.resolveEditorDraft(session, row.id, v).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!resolved) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const pageLoad = await loadEditorPage(deps.dataSource, session, row.id, resolved.draftId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!pageLoad) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const { doc } = pageLoad;
    return c.html(
      renderDocument(c.req.path, pageElement, {
        ...(await ideContext(c, session, row, {
          status: {
            version: `v${doc.draftN}`,
            ...(doc.meters?.words != null ? { words: doc.meters.words } : {}),
            ...(doc.meters?.readMin != null ? { readMin: doc.meters.readMin } : {}),
            ...(doc.venueCap ? { venueCap: doc.venueCap } : {}),
          },
        })),
        project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
        page: {
          slug,
          projectId: row.id,
          doc,
          docJson: pageLoad.docJson,
          ...(deps.collabWsUrl ? { collabWsUrl: deps.collabWsUrl } : {}),
          ...(c.req.query("noted") ? { noteSaved: true } : {}),
        },
        dwellSurface: "page",
      }),
    );
  });

  // P1.02 item 4 — the Page renders ANY markdown artifact, read-only (non-draft kinds have no save
  // path; the DTO's draftId is the artifact id, so the transport URLs 404 if ever called — the island
  // mounts read-only anyway).
  app.get("/p/:project/a/:artifactId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const doc = await deps.dataSource
      .getArtifactPage(session, row.id, c.req.param("artifactId") ?? "")
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 404 || e.status === 415)) return null;
        throw e;
      });
    if (!doc) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(
      renderDocument(c.req.path, pageElement, {
        ...(await ideContext(c, session, row, {
          status: {
            version: `v${doc.draftN}`,
            ...(doc.meters?.words != null ? { words: doc.meters.words } : {}),
            ...(doc.meters?.readMin != null ? { readMin: doc.meters.readMin } : {}),
          },
        })),
        project: { title: row.title, pill: row.state.pill, slug, headDraftId: row.headDraftId },
        page: {
          slug,
          projectId: row.id,
          doc,
          docJson: docJsonFor(doc),
          readOnly: true,
        },
        dwellSurface: "page",
      }),
    );
  });

  // The superseded CodeMirror page redirects to the Page (the route's JSON/form endpoints below stay —
  // the Page's transport uses them; `?noted=1` survives the hop).
  app.get("/p/:project/edit/:draftId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const doc = await deps.dataSource.getEditorDoc(session, t.row.id, t.draftId, { exact: true }).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!doc) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const noted = c.req.query("noted") ? "?noted=1" : "";
    return c.redirect(`/p/${t.slug}/v/${doc.draftN}${noted}`);
  });

  // The client bundle's lock poll — the doc read as JSON (the api's EditorDocDto verbatim).
  app.get("/p/:project/edit/:draftId/doc", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const t = await editorTarget(c, session);
    if (!t) return c.json({ error: "not_found" }, 404);
    const doc = await deps.dataSource.getEditorDoc(session, t.row.id, t.draftId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!doc) return c.json({ error: "not_found" }, 404);
    return c.json(doc);
  });

  // The debounced autosave (no Save button — this IS the save). The client bundle POSTs
  // application/json { markdown }; the pagehide beacon POSTs text/plain raw markdown (beacons can't set
  // JSON content types). A held §6.3 lock → the api's 409 passes through.
  app.post("/p/:project/edit/:draftId/save", async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    const t = await editorTarget(c, session);
    if (!t) return c.json({ error: "not_found" }, 404);
    const contentType = c.req.header("content-type") ?? "";
    let markdown: string | null = null;
    // P1.02 — the Page's live provenance capture rides the same JSON save body.
    let meta: { provenanceSpans?: { blockId: string; source: unknown }[]; agentSpans?: { blockId: string; from: number; to: number }[] } | undefined;
    if (contentType.includes("text/plain")) {
      markdown = await c.req.text();
    } else {
      const body = (await c.req.json().catch(() => ({}))) as {
        markdown?: string;
        provenanceSpans?: { blockId: string; source: unknown }[];
        agentSpans?: { blockId: string; from: number; to: number }[];
      };
      if (typeof body.markdown === "string") markdown = body.markdown;
      if (body.provenanceSpans || body.agentSpans) {
        meta = { provenanceSpans: body.provenanceSpans, agentSpans: body.agentSpans };
      }
    }
    if (markdown == null) return c.json({ error: "markdown required" }, 400);
    try {
      // only pass the 5th arg when the Page sent capture metadata — keeps the no-meta call shape the
      // beta contract established (and the existing route tests' exact-arity assertions intact).
      const saved = meta
        ? await deps.dataSource.saveEditorDraft(session, t.row.id, t.draftId, markdown, meta)
        : await deps.dataSource.saveEditorDraft(session, t.row.id, t.draftId, markdown);
      return c.json(saved);
    } catch (e) {
      // The api's status passes through — 409 (locked) is what flips the client bundle into the
      // read-only banner state; 5xx/network failures queue the doc for retry.
      if (e instanceof ApiError) return c.json({ error: e.message }, e.status as 400);
      throw e;
    }
  });

  // The note field → a Guidance row (REQ-DATA-41's beta form). Progressive enhancement: a plain form POST.
  app.post("/p/:project/edit/:draftId/note", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const text = typeof form.text === "string" ? form.text.trim() : "";
    if (text !== "") {
      await deps.dataSource.postEditorNote(session, t.row.id, t.draftId, text).catch(() => undefined);
    }
    return c.redirect(`/p/${t.slug}/edit/${t.draftId}?noted=1`);
  });

  // The banner's "Cancel run to edit" release (§6.3). A stale banner (the run already ended) just
  // re-renders — the next doc poll shows the released lock.
  app.post("/p/:project/edit/:draftId/cancel-run", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    await deps.dataSource.cancelEditorRun(session, t.row.id, t.draftId).catch(() => undefined);
    return c.redirect(`/p/${t.slug}/edit/${t.draftId}`);
  });

  // "Revise using your edits" (REQ-DATA-26): review of vN + the v(N+1) human-revision base. Lands on the
  // project page where the new run's card reports progress.
  app.post("/p/:project/edit/:draftId/revise", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await editorTarget(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    await deps.dataSource.reviseWithEdits(session, t.row.id, t.draftId).catch(() => undefined);
    return c.redirect(`/p/${t.slug}`);
  });

  // -------------------------------------------------------------------------------------------------------------------
  // PRB.11 — export + the AI-use statement (§13.4, §8.4 REQ-VIS-10, §11.7). The dialog GET reads formats +
  // the never-blocking obligation line + the statement preview (opening it sweeps pre_export horizons);
  // the export POST proxies the binary download; the addition POST is the only statement write
  // (append-only); /export/ai-use/:fmt is the standalone statement download.
  // -------------------------------------------------------------------------------------------------------------------

  /** slug → the project row (the shell's canonical lookup). */
  const projectRow = async (c: Context, session: SessionHeaders) => {
    const slug = c.req.param("project") ?? "";
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    return row ? { slug, row } : null;
  };

  app.get("/p/:project/export", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await projectRow(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const dialog = await deps.dataSource.getExportDialog(session, t.row.id).catch(() => null);
    if (!dialog) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(
      renderDocument(c.req.path, exportElement, {
        ...(await ideContext(c, session, t.row)),
        project: { title: t.row.title, pill: t.row.state.pill, slug: t.slug, headDraftId: t.row.headDraftId },
        export: {
          slug: t.slug,
          projectId: t.row.id,
          dialog,
          ...(c.req.query("error") ? { error: COPY.export.exportFailed } : {}),
          ...(c.req.query("added") ? { added: true } : {}),
        },
      }),
    );
  });

  // The export POST — a plain form POST that streams the download back (progressive enhancement: no JS).
  app.post("/p/:project/export", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await projectRow(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const format = typeof form.format === "string" ? form.format : "md";
    if (format !== "md" && format !== "txt" && format !== "docx") {
      return c.redirect(`/p/${t.slug}/export?error=1`);
    }
    try {
      const dl = await deps.dataSource.exportProject(session, t.row.id, {
        format,
        attachAiUse: form.attachAiUse === "on",
      });
      return new Response(dl.bytes, {
        status: 200,
        headers: {
          "content-type": dl.mediaType,
          "content-disposition": `attachment; filename="${dl.fileName}"`,
        },
      });
    } catch {
      return c.redirect(`/p/${t.slug}/export?error=1`);
    }
  });

  // The append-only statement write — one sentence at a time (REQ-VIS-10; no edit/delete exists).
  app.post("/p/:project/export/addition", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await projectRow(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const sentence = typeof form.sentence === "string" ? form.sentence.trim() : "";
    if (sentence !== "") {
      await deps.dataSource.appendAiUseAddition(session, t.row.id, sentence).catch(() => undefined);
    }
    return c.redirect(`/p/${t.slug}/export?added=1`);
  });

  // The standalone statement download (md/txt/docx — the §8.4 REQ-VIS-10 exportable artifact).
  app.get("/p/:project/export/ai-use/:fmt", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const t = await projectRow(c, session);
    if (!t) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const fmt = c.req.param("fmt");
    if (fmt !== "md" && fmt !== "txt" && fmt !== "docx") {
      return c.html(renderDocument(c.req.path, notFoundElement), 404);
    }
    const dl = await deps.dataSource.downloadAiUseStatement(session, t.row.id, fmt).catch(() => null);
    if (!dl) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return new Response(dl.bytes, {
      status: 200,
      headers: {
        "content-type": dl.mediaType,
        "content-disposition": `attachment; filename="${dl.fileName}"`,
      },
    });
  });

  // -------------------------------------------------------------------------------------------------------------------
  // PRB.10 — Quick Voice (§9.2–§9.6). SSR only: the library, the creation sheet, the detail page (seed
  // editor + samples + build history), the project picker's POST, and the run sheet's chained
  // "Update voice first" action. Every pill renders the shared status projection verbatim.
  // -------------------------------------------------------------------------------------------------------------------

  // The run sheet's "Update voice first (≈N cr)" — launches a Quick-Voice build for the project's linked
  // persona and lands back on the sheet (the sheet re-reads the pill, which now says Building). The main
  // run is NEVER blocked by voice state — this is the optional chained action only.
  app.post("/p/:project/update-voice", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const form = await c.req.parseBody();
    const personaId = typeof form.voice_persona === "string" ? form.voice_persona : "";
    if (personaId) {
      await deps.dataSource
        .buildVoice(session, personaId, { tier: "quick", projectId: row.id })
        .catch(() => undefined);
    }
    return c.redirect(`/p/${slug}/run${new URL(c.req.url).search}`);
  });

  // The voice library (§9.1's "Your voices" group).
  app.get("/voices", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const voices = await deps.dataSource.listVoices(session).catch(() => []);
    return c.html(renderDocument(c.req.path, voicesElement, { voices }));
  });

  // The §9.2 creation sheet (GET) — name required; description/byline/sample/mode/tier optional.
  app.get("/voices/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    return c.html(renderDocument(c.req.path, voiceNewElement, { voiceNew: {} }));
  });

  // The creation sheet's POST: create the persona (+ Mode metadata), attach any pasted sample through the
  // §9.5 model, and — on "Create and build" — start the profile_voice{tier: quick} run (§9.2 item 3).
  app.post("/voices/new", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const form = await c.req.parseBody();
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const name = str("name").trim();
    if (!name) {
      return c.html(
        renderDocument(c.req.path, voiceNewElement, { voiceNew: { error: COPY.voice.new.nameRequired } }),
        400,
      );
    }
    const intent = str("intent") === "build" ? "build" : "save";
    // Upload OR paste (§9.2 beta subset): a .md/.txt/.html file decodes to canonical text here; richer
    // formats ride the same quarantine→convert seam the api accepts as `quarantineKey` (the deploy leg).
    const file = form.sample_file;
    const fileText =
      file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0
        ? new TextDecoder().decode(await (file as File).arrayBuffer())
        : "";
    const sampleText = (fileText || str("sample_text")).trim();
    if (intent === "build" && !sampleText) {
      return c.html(
        renderDocument(c.req.path, voiceNewElement, { voiceNew: { error: COPY.voice.new.sampleRequired } }),
        400,
      );
    }
    const created = await deps.dataSource.createVoice(session, {
      name,
      ...(str("byline").trim() ? { byline: str("byline").trim() } : {}),
      ...(str("description").trim() ? { description: str("description") } : {}),
      mode: str("mode") || "self",
    });
    if (sampleText) {
      await deps.dataSource
        .addVoiceSample(session, created.personaId, {
          text: sampleText,
          ...(str("sample_title").trim() ? { title: str("sample_title").trim() } : {}),
        })
        .catch(() => undefined);
    }
    if (intent === "build") {
      await deps.dataSource.buildVoice(session, created.personaId, { tier: "quick" }).catch(() => undefined);
    }
    return c.redirect(`/v/${created.personaId}`);
  });

  // The voice detail page (§9.5): status + seed editor + samples + build history + profile artifacts.
  app.get("/v/:persona", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const personaId = c.req.param("persona");
    const detail = await deps.dataSource.getVoice(session, personaId).catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
    if (!detail) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    const estimate = await deps.dataSource.estimateVoice(session, personaId, "quick").catch(() => undefined);
    const notice =
      c.req.query("saved") === "1"
        ? COPY.voice.detail.seedSaved
        : c.req.query("added") === "1"
          ? COPY.voice.detail.sampleAdded
          : c.req.query("cancelled") === "1"
            ? COPY.voice.detail.cancelDone
            : undefined;
    return c.html(
      renderDocument(c.req.path, voiceDetailElement, {
        voice: { detail, ...(estimate ? { estimate } : {}), ...(notice ? { notice } : {}) },
      }),
    );
  });

  // The seed editor's save — recomputes the J9 hash; the pill flips live on the redirect (§9.3).
  app.post("/v/:persona/seed", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await c.req.parseBody();
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const registers = str("registers")
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r !== "");
    await deps.dataSource
      .saveVoiceSeed(session, personaId, {
        description: str("description"),
        byline: str("byline"),
        registers,
      })
      .catch(() => undefined);
    return c.redirect(`/v/${personaId}?saved=1`);
  });

  // A pasted sample through the §9.5 model — the response's refreshed corpus words + status are the
  // estimate's <500 ms refresh (REQ-PERSONA-3); the redirect re-reads them.
  app.post("/v/:persona/samples", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await c.req.parseBody();
    const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
    const file = form.file;
    const fileText =
      file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0
        ? new TextDecoder().decode(await (file as File).arrayBuffer())
        : "";
    const text = (fileText || str("text")).trim();
    if (text) {
      await deps.dataSource
        .addVoiceSample(session, personaId, {
          text,
          ...(str("title").trim() ? { title: str("title").trim() } : {}),
        })
        .catch(() => undefined);
    }
    return c.redirect(`/v/${personaId}?added=1`);
  });

  // The per-item include/omit toggle (REQ-INGEST-4).
  app.post("/v/:persona/samples/:itemId", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await c.req.parseBody();
    const included = form.included === "true" || form.included === "on";
    await deps.dataSource
      .setVoiceSampleIncluded(session, personaId, c.req.param("itemId"), included)
      .catch(() => undefined);
    return c.redirect(`/v/${personaId}`);
  });

  // "Build voice" / "Update voice" — a profile_voice{tier: quick} run (§9.2 item 3).
  app.post("/v/:persona/build", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const personaId = c.req.param("persona");
    await deps.dataSource.buildVoice(session, personaId, { tier: "quick" }).catch(() => undefined);
    return c.redirect(`/v/${personaId}`);
  });

  // Cancel an open build (the detail page's Cancel).
  app.post("/v/:persona/cancel", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const personaId = c.req.param("persona");
    const form = await c.req.parseBody();
    const runId = typeof form.runId === "string" ? form.runId : "";
    if (runId) await deps.dataSource.cancelVoiceRun(session, runId).catch(() => undefined);
    return c.redirect(`/v/${personaId}?cancelled=1`);
  });

  // The client bundles (built by build-client.mjs at `pnpm build`; gitignored). Missing → the page still
  // works: the textarea stays the read-only no-JS view and the form POSTs carry the write paths; the IDE
  // shell's server-rendered panes stay static (no drag/focus chrome).
  const clientBundlePath = new URL("../public/editor.js", import.meta.url);
  app.get("/assets/editor.js", async (c) => {
    const body = await readFile(clientBundlePath).catch(() => null);
    if (!body) return c.body(null, 404);
    return c.body(body, 200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
    });
  });
  const ideBundlePath = new URL("../public/ide.js", import.meta.url);
  app.get("/assets/ide.js", async (c) => {
    const body = await readFile(ideBundlePath).catch(() => null);
    if (!body) return c.body(null, 404);
    return c.body(body, 200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
    });
  });
  // P1.01 (REQ-IDE-39) — the self-hosted variable fonts themeCss()'s @font-face blocks point at
  // (/assets/fonts/<file>; build-client.mjs copies them from the Fontsource packages into public/fonts/).
  // Long-cacheable: the filenames carry the face+subset, and a changed face ships a new filename.
  app.get("/assets/fonts/:file", async (c) => {
    const file = c.req.param("file") ?? "";
    if (!/^[\w.-]+\.woff2$/.test(file)) return c.body(null, 404);
    const body = await readFile(new URL(`../public/fonts/${file}`, import.meta.url)).catch(() => null);
    if (!body) return c.body(null, 404);
    return c.body(body, 200, {
      "content-type": "font/woff2",
      "cache-control": "public, max-age=31536000, immutable",
    });
  });

  app.all("*", (c) => c.html(renderDocument(c.req.path, notFoundElement), 404));

  return app;
}

/** §10.1 — the phone-width input set is a server-rendered variant of the SAME components (REQ-SPEC-20);
 *  the shell picks it from the request's mobile hints (UA / Sec-CH-UA-Mobile). */
function isPhoneRequest(c: Context): boolean {
  if (c.req.header("sec-ch-ua-mobile") === "?1") return true;
  const ua = c.req.header("user-agent") ?? "";
  return /Mobi|iPhone|Android/i.test(ua);
}

/** A `next` redirect target must stay inside the app (no open redirects). */
function safeBack(next: string, fallback: string): string {
  return next.startsWith("/p/") ? next : fallback;
}

/**
 * F32 (PRB.19) — the Payment-Link 302 target carries `client_reference_id=<billingAccountId>` so the
 * Stripe-originated checkout joins the caller's account (a bare link lands the purchase `unresolved`).
 * Composed via `URL` (an existing query on the configured link survives; `set` never double-appends).
 * A malformed configured URL or a missing account id returns the link unchanged — the redirect never breaks.
 */
export function paymentLinkWithReference(link: string, billingAccountId: string | undefined): string {
  if (!billingAccountId) return link;
  try {
    const url = new URL(link);
    url.searchParams.set("client_reference_id", billingAccountId);
    return url.toString();
  } catch {
    return link;
  }
}

// ---- run sheet helpers (§5.6) ----

/** Generous beta house-credit balance (REQ-BETA-14): no plans/trials in the beta; runs draw house credits. */
const BETA_HOUSE_CREDITS = 200_000;

const RUN_SHEET_WORKFLOWS = new Set<WorkflowKey>(["review", "revise", "fact_check"]);
function normalizeWorkflow(v: string): WorkflowKey {
  return RUN_SHEET_WORKFLOWS.has(v as WorkflowKey) ? (v as WorkflowKey) : "review";
}
function normalizeRigor(v: string): Rigor {
  return (RIGORS as readonly string[]).includes(v) ? (v as Rigor) : "standard";
}
function normalizeTier(v: string, workflow: WorkflowKey, rigor: Rigor): ModelTier {
  if ((MODEL_TIERS as readonly string[]).includes(v)) return v as ModelTier;
  return sheetProfile(workflow).rigorDefaults[rigor].modelTier;
}

/** Build the RunSheetView from the query (beta launcher). Word count is query-driven; the live per-draft
 *  metadata binding is the deploy leg (like the import pipeline). PRB.08: the spendable balance is the
 *  account's REAL ledger balance when the billing read resolves — the flat beta house-credit figure is only
 *  the degraded fallback (an api outage must not block the sheet). */
function buildSheet(
  query: Record<string, string>,
  billing?: { spendableCredits: number; suspended: boolean; paymentLinkUrl?: string },
  planOfferUrl?: string,
) {
  const workflow = normalizeWorkflow(query.workflow ?? "review");
  const rigor = normalizeRigor(query.rigor ?? "standard");
  // §6.5: model tier follows rigor in the beta (no tier selector) — always the rigor's default.
  const modelTier = normalizeTier("", workflow, rigor);
  const words = Number(query.words) > 0 ? Number(query.words) : 5180;
  const toggles: ToggleState = {};
  for (const key of ["fact_check", "discourse", "second_read", "repair_research", "gap_check"] as const) {
    if (query[`toggle.${key}`] === "on") toggles[key] = true;
    else if (query[`toggle.${key}`] === "off") toggles[key] = false;
  }
  return buildRunSheetView({
    workflow,
    targetVersion: "v1",
    rigor,
    modelTier,
    inputs: { words },
    ...(Object.keys(toggles).length ? { toggles } : {}),
    scope: {
      protocol: "Essay",
      ...(query.venue ? { venue: query.venue } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
    },
    spendableCredits: billing?.spendableCredits ?? BETA_HOUSE_CREDITS,
    idempotencyKey: randomUUID(),
    insufficientMode: "beta",
    ...(billing?.paymentLinkUrl ? { paymentLinkUrl: billing.paymentLinkUrl } : {}),
    ...(billing?.suspended ? { suspended: true } : {}),
    ...(planOfferUrl ? { planOfferUrl } : {}),
  });
}

/** Render the §5.3 count line from the structured counts. */
function countLine(c: ConversionResult["counts"]): string {
  const n = (x: number) => x.toLocaleString("en-US");
  const p = (x: number, one: string) => `${n(x)} ${x === 1 ? one : one + "s"}`;
  return [p(c.words, "word"), p(c.footnotes, "footnote"), `${n(c.citationSpans)} citation-like ${c.citationSpans === 1 ? "span" : "spans"}`, p(c.tables, "table"), p(c.figures, "figure")].join(" · ");
}

/**
 * PRB.21 — the pending preview's self-poll cadence + its GET URL (meta-refresh target). The page
 * re-polls on the quarantine key every few seconds; each poll holds at most the api's bounded wait
 * (~20 s) and returns the moment the converted object lands.
 */
const IMPORT_PREVIEW_POLL_SECONDS = 5;
function importPollUrl(slug: string, quarantineKey: string, sourceLabel?: string): string {
  const q = `?qk=${encodeURIComponent(quarantineKey)}`;
  return `/p/${slug}/import/preview${q}${sourceLabel ? `&src=${encodeURIComponent(sourceLabel)}` : ""}`;
}

async function parseImportInput(c: Context, slug: string): Promise<ImportInput> {
  const form = await c.req.parseBody();
  // PRB.20 — the preview form replays the minted quarantine key in `qk` so Create does not re-upload.
  const qk = typeof form.qk === "string" && form.qk ? form.qk : undefined;
  const paste = typeof form.paste === "string" ? form.paste : "";
  const file = form.file;
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    return {
      projectSlug: slug,
      fileName: f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
      ...(qk ? { quarantineKey: qk } : {}),
    };
  }
  return { projectSlug: slug, text: paste, ...(qk ? { quarantineKey: qk } : {}) };
}

function toConversionData(slug: string, input: ImportInput, result: ConversionResult, quarantineKey: string) {
  return {
    projectSlug: slug,
    sourceLabel: input.fileName ?? "pasted text",
    // A re-polled preview (PRB.21) carries only the quarantine key — the source bytes already live in
    // quarantine, so the source pane states that plainly rather than rendering blank.
    sourceText: input.text ?? (input.bytes ? `(${input.bytes.byteLength} bytes)` : "(the uploaded source — already converted)"),
    convertedMarkdown: result.markdown,
    countLine: countLine(result.counts),
    warnings: result.warnings.map((w) => ({ message: w.message, blockId: w.anchor?.blockId ?? null })),
    // the create form replays this verbatim — no second upload, no second convert run.
    quarantineKey,
  };
}
