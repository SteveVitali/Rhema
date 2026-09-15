import { Hono } from "hono";
import type { Context } from "hono";
import { toProjectRowView } from "./state-map.js";
import { renderDocument } from "./render.js";
import {
  inviteElement,
  loginElement,
  projectsElement,
  projectElement,
  notFoundElement,
} from "./routes.js";
import { COPY } from "./copy.js";
import type { DataSource, SessionHeaders } from "./data.js";

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
        project: { title: row.title, pill: row.state.pill },
      }),
    );
  });

  app.all("*", (c) => c.html(renderDocument(c.req.path, notFoundElement), 404));

  return app;
}
