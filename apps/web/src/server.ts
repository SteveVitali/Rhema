import { Hono } from "hono";
import type { Context } from "hono";
import { toProjectRowView } from "./state-map.js";
import { renderDocument } from "./render.js";
import {
  inviteElement,
  loginElement,
  projectsElement,
  projectElement,
  importElement,
  importPreviewElement,
  runSheetElement,
  notFoundElement,
} from "./routes.js";
import { COPY } from "./copy.js";
import type { DataSource, SessionHeaders, ImportInput } from "./data.js";
import type { ConversionResult } from "@rhema/contracts";
import { RIGORS, MODEL_TIERS, type ModelTier, type Rigor, type WorkflowKey } from "@rhema/contracts";
import { buildRunSheetView, sheetProfile, type ToggleState } from "@rhema/run-sheet";
import { ApiError } from "@rhema/api-client";
import { randomUUID } from "node:crypto";

// The beta web shell server (Hono). SSR only — every route renders HTML; forms POST and links navigate (no
// client bundle). Auth-gated routes redirect to /login. The invite gate is enforced HERE at POST /login: no
// valid invitation ⇒ no auth request is ever made (REQ-BETA-19). The live Better Auth session/OAuth binding is
// D-P0.01-3 (deploy) — injected via `session` / `beginAuth` so the shell is fully unit-testable offline.

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
  /** Begin auth AFTER the invite passed (magic link / Google). Default: magic-link "sent". */
  beginAuth?(method: string, args: { code: string; email?: string }): Promise<AuthOutcome>;
  /** End the session (clears the cookie). Default: no-op. */
  endSession?(c: Context): Promise<void>;
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

export function createWebApp(deps: WebDeps): Hono {
  const app = new Hono();
  const beginAuth = deps.beginAuth ?? defaultBeginAuth;

  app.get("/healthz", (c) => c.json({ ok: true, service: "web" }));

  // Public: the invite page (+ read-only sample dossier).
  const invite = (c: Context) => c.html(renderDocument(c.req.path, inviteElement));
  app.get("/", invite);
  app.get("/invite", invite);

  // Public: sign in — invitation required. GET renders the form; POST enforces the gate.
  app.get("/login", (c) => c.html(renderDocument(c.req.path, loginElement, { login: {} })));

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
    }, status: 200 | 400) => c.html(renderDocument(c.req.path, loginElement, { login }), status);

    if (!code.trim()) {
      return renderLogin({ error: COPY.login.errorRequired, code, email }, 400);
    }
    // Google resolves the email via OAuth (unknown pre-auth), so an email-bound (allowlist) invite is validated
    // code-only here and its email binding is enforced at consume() post-OAuth (D-PRB.01-1). Magic link supplies
    // the email up front, so its binding is enforced now.
    const check = await deps.dataSource.checkInvite(
      code,
      method === "google" ? undefined : email || undefined,
    );
    if (!check.ok) {
      return renderLogin({ error: loginErrorFor(check.reason), code, email }, 400);
    }
    // Invite is valid. A magic link needs an email; Google resolves the email via OAuth.
    if (method === "magic_link" && !email.trim()) {
      return renderLogin({ error: COPY.login.errorEmailRequired, code, email }, 400);
    }
    const outcome = await beginAuth(method, { code, email: email || undefined });
    if (outcome.redirect) return c.redirect(outcome.redirect);
    return renderLogin({ sent: true, email }, 200);
  });

  app.post("/logout", async (c) => {
    await deps.endSession?.(c);
    return c.redirect("/");
  });

  // Auth-gated: the project list.
  app.get("/app", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const rows = (await deps.dataSource.listProjects(session)).map(toProjectRowView);
    return c.html(renderDocument(c.req.path, projectsElement, { projects: rows }));
  });

  // Auth-gated: the flat project view (canonical /p/:project).
  app.get("/p/:project", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const rows = await deps.dataSource.listProjects(session);
    const row = rows.find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(
      renderDocument(c.req.path, projectElement, {
        project: { title: row.title, pill: row.state.pill, slug },
      }),
    );
  });

  // Auth-gated: the §5.3 import flow (upload/paste → conversion preview → create).
  app.get("/p/:project/import", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const row = (await deps.dataSource.listProjects(session)).find((r) => r.slug === slug);
    if (!row) return c.html(renderDocument(c.req.path, notFoundElement), 404);
    return c.html(renderDocument(c.req.path, importElement, { project: { title: row.title, pill: row.state.pill, slug } }));
  });

  app.post("/p/:project/import/preview", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const input = await parseImportInput(c, slug);
    const result = await deps.dataSource.previewImport(session, input);
    return c.html(renderDocument(c.req.path, importPreviewElement, { conversion: toConversionData(slug, input, result) }));
  });

  app.post("/p/:project/import/create", async (c) => {
    const session = deps.session(c);
    if (!session) return c.redirect("/login");
    const slug = c.req.param("project");
    const input = await parseImportInput(c, slug);
    await deps.dataSource.createImport(session, input);
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
    const view = buildSheet(c.req.query());
    return c.html(renderDocument(c.req.path, runSheetElement, { runSheet: { slug, projectTitle: row.title, view } }));
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
    const view = buildSheet({ workflow, rigor });
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
        // REQ-BILL-6: freeze the word/claim counts the estimate was computed for on the run record.
        inputSnapshot: { wordCount: words, ...(claims != null ? { claimCount: claims } : {}) },
      });
    } catch (e) {
      // Insufficient balance (§14.6): never a silent bill — re-render the sheet with the resolution notice,
      // no run created. Any other api error is a real failure and propagates.
      if (e instanceof ApiError && e.status === 402) {
        return c.html(renderDocument(c.req.path, runSheetElement, { runSheet: { slug, projectTitle: row.title, view, notice: COPY.runSheet.insufficient } }));
      }
      throw e;
    }
    // Re-render the sheet with the run-started confirmation (the run card lives on the project view — P1.01).
    return c.html(renderDocument(c.req.path, runSheetElement, { runSheet: { slug, projectTitle: row.title, view, started: true } }));
  });

  app.all("*", (c) => c.html(renderDocument(c.req.path, notFoundElement), 404));

  return app;
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
 *  metadata binding is the deploy leg (like the import pipeline). Balance = beta house credits (REQ-BETA-14). */
function buildSheet(query: Record<string, string>) {
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
    spendableCredits: BETA_HOUSE_CREDITS,
    idempotencyKey: randomUUID(),
    insufficientMode: "beta",
  });
}

/** Render the §5.3 count line from the structured counts. */
function countLine(c: ConversionResult["counts"]): string {
  const n = (x: number) => x.toLocaleString("en-US");
  const p = (x: number, one: string) => `${n(x)} ${x === 1 ? one : one + "s"}`;
  return [p(c.words, "word"), p(c.footnotes, "footnote"), `${n(c.citationSpans)} citation-like ${c.citationSpans === 1 ? "span" : "spans"}`, p(c.tables, "table"), p(c.figures, "figure")].join(" · ");
}

async function parseImportInput(c: Context, slug: string): Promise<ImportInput> {
  const form = await c.req.parseBody();
  const paste = typeof form.paste === "string" ? form.paste : "";
  const file = form.file;
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    return { projectSlug: slug, fileName: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
  }
  return { projectSlug: slug, text: paste };
}

function toConversionData(slug: string, input: ImportInput, result: ConversionResult) {
  return {
    projectSlug: slug,
    sourceLabel: input.fileName ?? "pasted text",
    sourceText: input.text ?? (input.bytes ? `(${input.bytes.byteLength} bytes)` : ""),
    convertedMarkdown: result.markdown,
    countLine: countLine(result.counts),
    warnings: result.warnings.map((w) => ({ message: w.message, blockId: w.anchor?.blockId ?? null })),
  };
}
