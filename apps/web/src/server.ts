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
  notFoundElement,
} from "./routes.js";
import { COPY } from "./copy.js";
import type { DataSource, SessionHeaders, ImportInput } from "./data.js";
import type { ConversionResult } from "@rhema/contracts";

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

  app.all("*", (c) => c.html(renderDocument(c.req.path, notFoundElement), 404));

  return app;
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
