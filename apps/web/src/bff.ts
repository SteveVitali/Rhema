// SPA.5 — the BFF contract conventions every surface ticket's twins + mutation branches are built
// from (REQ-BFF-1..12, 14..30 conventions; REQ-DAT-1..6, 8, 9..14; REQ-SAFE-6; REQ-INV-3..5 —
// design/22 §1–§9 adopted by spec §5). The rules this module encodes:
//
//   • reads:  `GET /bff/<surface-path>` JSON twins; the document paths keep serving SSR HTML
//   • writes: existing POST paths gain a `wantsJson` JSON branch — the form post keeps its 302+flash
//   • success envelope: `{ok:true, redirect?, flash?, data?, pending?, url?}` — `redirect` carries
//     the IDENTICAL flash-parameterized URL the 302 would have (the journey-pinned vocabulary
//     stays verbatim), `url` is only ever an allowlist-validated external hand-off
//   • failures: `{error:"<stable_code>", detail?}` at the preserved upstream status — ApiError's
//     `{status, code, detail}` maps directly, ≥500 upstreams collapse to 502, 422 bodies pass
//     through verbatim; a JSON caller is NEVER answered with a redirect
//   • slug→id resolves exactly once per request (request-scoped memo — authorization-safe, never
//     a cross-request cache)
//   • telemetry: one structured `routeErrorLine` per failure + the `x-rhema-request-id` echo the
//     `requestContext` middleware already stamps on every response
//
// Deployable dark: nothing here changes an existing HTML path — the helpers are additive and the
// `wantsJson` predicate is the same one the chat/outline dual-mode branches already run.

import type { Context } from "hono";
import { ApiError } from "@rhema/api-client";
import type { ProjectRow } from "@rhema/api-client";
import {
  errorClass,
  isGoogleOAuthRedirect,
  isStripeHostedRedirect,
  stackForLog,
} from "@rhema/contracts";
import type { DataSource, SessionHeaders } from "./data.js";
import { logWebRouteError } from "./observability.js";

/**
 * The dual-mode content negotiation (REQ-BFF-1/2): the `content-type` OR `accept` header carrying
 * `application/json` selects the JSON branch — the `chatReply`/outline-POST precedent generalized.
 * There is no `?format=` convention.
 */
export function wantsJson(c: Context): boolean {
  return (
    (c.req.header("content-type") ?? "").includes("application/json") ||
    (c.req.header("accept") ?? "").includes("application/json")
  );
}

/**
 * The dual-mode body read (SPA.12 — the settings mutation grammar): a `content-type:
 * application/json` request parses `c.req.json()`; anything else (urlencoded, multipart) parses
 * `c.req.parseBody()` — keyed on CONTENT-TYPE, not `wantsJson`, so a form post that merely
 * accepts a JSON answer still reads its fields. Returns a flat `Record<string, unknown>` either
 * way; a malformed/absent body lands `{}` — every field lookup downstream degrades exactly like
 * an absent form field.
 */
export async function bodyFields(c: Context): Promise<Record<string, unknown>> {
  if ((c.req.header("content-type") ?? "").includes("application/json")) {
    const j = (await c.req.json().catch(() => null)) as unknown;
    return j != null && typeof j === "object" && !Array.isArray(j)
      ? (j as Record<string, unknown>)
      : {};
  }
  return (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
}

/** A 202-class pending marker — cadence stays server-owned (`pollAfterSeconds`). */
export interface MutationPending {
  readonly pollAfterSeconds?: number;
}

/**
 * The mutation success envelope (REQ-BFF-3, REQ-DAT-3): `redirect` is the full same-origin target
 * INCLUDING flash params (the `?disposed=`/`?saved=1` vocabulary); `flash` is its structured copy
 * for inline-notice renders; `data` carries the produced DTO; `url` is the EXTERNAL hand-off —
 * always server-validated against the hosted-origin allowlists before it is serialized.
 */
export interface MutationEnvelope<T = unknown> {
  readonly redirect?: string;
  readonly flash?: Record<string, string>;
  readonly data?: T;
  readonly pending?: MutationPending;
  readonly url?: string;
}

/**
 * Validate an external hand-off target (REQ-BFF-27, REQ-SAFE-6 amended by R11): `form-action`
 * never governed JS navigations, so the STRIPE_HOSTED_ORIGINS / GOOGLE_OAUTH_ORIGINS allowlists
 * are the sole enforcement — a `{url}` value must parse to an absolute https URL on one of those
 * origins. Anything else (lookalike subdomains, userinfo tricks, non-http schemes, relative paths)
 * is refused. Internal navigations never ride `url` — they are `redirect`.
 */
export function externalNavTarget(url: string): string | null {
  if (!/^https:\/\//.test(url)) return null;
  if (isStripeHostedRedirect(url) || isGoogleOAuthRedirect(url)) return url;
  return null;
}

/**
 * The dual-mode mutation responder (REQ-BFF-1/3): JSON callers get the `{ok:true, …}` envelope;
 * form posts keep today's 302 (`url` — validated — wins over `redirect`, matching the existing
 * mint→validate→302 hand-off). The allowlist is consulted HERE, at the last moment before the
 * value is serialized or redirected to — a refused target can never reach the wire through this
 * helper: JSON callers get the error envelope, form posts get nothing to follow.
 */
export function mutationOutcome<T>(c: Context, env: MutationEnvelope<T>): Response {
  const url = env.url == null ? null : externalNavTarget(env.url);
  if (env.url != null && url == null) {
    logWebRouteError(c, {
      status: 502,
      msg: "external_nav_url_refused",
      errorClass: "RefusedHandoff",
    });
    return c.json({ error: "external_nav_refused" }, 502);
  }
  if (wantsJson(c)) {
    const body: Record<string, unknown> = { ok: true };
    if (env.redirect != null) body["redirect"] = env.redirect;
    if (env.flash != null) body["flash"] = env.flash;
    if (env.data !== undefined) body["data"] = env.data;
    if (env.pending != null) body["pending"] = env.pending;
    if (url != null) body["url"] = url;
    return c.json(body);
  }
  if (url != null) return c.redirect(url);
  return c.redirect(env.redirect ?? c.req.path);
}

/**
 * The BFF failure responder (REQ-BFF-4/5, REQ-DAT-2/10): `{error, detail?}` at the PRESERVED
 * upstream status — an api refusal's code passes through unrenamed (`insufficient_balance`,
 * `run_in_progress`, `frozen`, `trial_*`, `invalid_*`…), a 422 validation body re-serializes
 * verbatim (its `detail` rides along untouched), an upstream ≥500 collapses to the 502 gateway
 * code, and an api 401 answers `{error:"unauthenticated"}` 401 — NEVER the `/login` document
 * redirect (the client owns that nav off the 401). Every failure emits ONE structured
 * `routeErrorLine`: the route template, the request's own id, upstream status/code — ERROR for a
 * real fault, WARNING for an expected refusal pass-through (OBS.1/ADR-053 semantics verbatim).
 */
export function bffFail(c: Context, e: unknown, opts?: { msg?: string }): Response {
  if (e instanceof ApiError) {
    if (e.status === 401) return c.json({ error: "unauthenticated" }, 401);
    const gateway = e.status >= 500;
    const status = gateway ? 502 : e.status;
    logWebRouteError(c, {
      status,
      upstreamStatus: e.status,
      upstreamCode: e.code ?? null,
      msg: opts?.msg ?? "bff_upstream_error",
      severity: gateway ? "ERROR" : "WARNING",
      errorClass: errorClass(e),
    });
    const body: Record<string, unknown> = {
      error: gateway ? "upstream_unavailable" : (e.code ?? "upstream_refused"),
    };
    // The 422 validation body passes through verbatim — the api already decided `detail` is safe.
    if (!gateway && e.detail !== undefined) body["detail"] = e.detail;
    return c.json(body, status as never);
  }
  logWebRouteError(c, {
    status: 500,
    msg: opts?.msg ?? "bff_unhandled_error",
    errorClass: errorClass(e),
    stack: stackForLog(e),
  });
  return c.json({ error: "internal_error" }, 500);
}

/** The seams a BFF route needs — `WebDeps`'s session/dataSource pair, structurally. */
export interface BffDeps {
  readonly session: (c: Context) => SessionHeaders | null;
  readonly dataSource: DataSource;
}

/**
 * The `/bff/*` handler wrapper (REQ-BFF-1/4/29): session gate → 401 `{error:"unauthenticated"}`
 * (the BFF answers JSON, never the `/login` redirect — that's `bffFetch`'s client-side leg), then
 * the handler under the `bffFail` error boundary. The request id + `routeErrorLine` come free:
 * `requestContext` already echoes `x-rhema-request-id` on every response and `bffFail` emits the
 * one structured line.
 */
export function bffRoute(
  deps: BffDeps,
  handler: (c: Context, session: SessionHeaders) => Response | Promise<Response>,
): (c: Context) => Promise<Response> {
  return async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    try {
      return await handler(c, session);
    } catch (e) {
      return bffFail(c, e);
    }
  };
}

/**
 * The best-effort seam swallow for aggregate reads (REQ-BFF-9, REQ-DAT-12): a degraded read
 * becomes `null`/omitted in the payload — the wrapped api-client fetch already counted it into the
 * `degraded_reads` WARNING line — but a genuine 401 is NOT degradation: it rethrows so the
 * envelope answers `unauthenticated` instead of a politely empty page.
 */
export function swallowDegraded(e: unknown): null {
  if (e instanceof ApiError && e.status === 401) throw e;
  return null;
}

// ---- Slug→id resolution — once per request, request-scoped (REQ-BFF-11, REQ-DAT-6) -------------

const PROJECT_LIST_MEMO = "rhema.bff.projectList";

/**
 * The request-scoped memoized `listProjects` — the SAME promise for every consumer in the request
 * (handler + downstream seams), so a composite twin issues one upstream read no matter how many
 * `projectRow` calls run. Deliberately NOT a cross-request cache: `listProjects` is session-scoped,
 * so the memo is authorization-safe; anything longer-lived would need session-keyed invalidation
 * for zero benefit (design/22 §8/OQ10).
 */
export function projectRows(
  c: Context,
  dataSource: Pick<DataSource, "listProjects">,
  session: SessionHeaders,
): Promise<ProjectRow[]> {
  const memoized = c.get(PROJECT_LIST_MEMO) as Promise<ProjectRow[]> | undefined;
  if (memoized) return memoized;
  const rows = Promise.resolve().then(() => dataSource.listProjects(session));
  c.set(PROJECT_LIST_MEMO, rows);
  return rows;
}

/** slug→row off the request's one `listProjects` read; null when the slug isn't this tenant's. */
export async function projectRow(
  c: Context,
  dataSource: Pick<DataSource, "listProjects">,
  session: SessionHeaders,
  slug: string,
): Promise<ProjectRow | null> {
  const rows = await projectRows(c, dataSource, session);
  return rows.find((r) => r.slug === slug) ?? null;
}

// ---- The one-shot side-effect conventions (design/22 §7 — the routes are wired by their owning
// surface tickets: confirm-email → SPA.12, handoff → SPA.23) ------------------------------------

/**
 * REQ-BFF-21 — `POST /bff/settings/account/confirm-email {token}`: consumes the email-confirm
 * token and answers the envelope with the SAME notice redirect the document GET would 302 to —
 * both outcomes are `200 {ok:true, redirect:"/app/settings/account?notice=email-confirmed|
 * email-confirm-failed"}` (the api's `{error}` arm maps to the failed notice, never an error
 * status). Idempotent-replay-safe: the api dedupes, a replay lands the failed notice.
 */
export function confirmEmailHandler(deps: BffDeps): (c: Context) => Promise<Response> {
  return bffRoute(deps, async (c, session) => {
    const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token : "";
    const out =
      token === ""
        ? undefined
        : await Promise.resolve()
            .then(() => deps.dataSource.confirmEmailChange?.(session, token))
            .catch(() => undefined);
    const ok = out != null && "ok" in out && out.ok === true;
    const envelope: MutationEnvelope<{ email: string }> = {
      redirect: `/app/settings/account?notice=${ok ? "email-confirmed" : "email-confirm-failed"}`,
      ...(ok && out != null && "email" in out ? { data: { email: out.email } } : {}),
    };
    return c.json({ ok: true, ...envelope });
  });
}

/**
 * REQ-BFF-22 — `POST /bff/p/:slug/handoff`: the unread `run_finished` hand-off as a POST so the
 * mark-read side effect never rides a prefetchable/cached GET. Resolves the slug off the request
 * memo, marks the item read (idempotent — the api tolerates re-marks), and returns its href;
 * `{handoff:null}` when nothing is owed (or `?focus=1` suppresses — the client only calls it on
 * client-side entries; the server check is belt-and-suspenders).
 */
export function projectHandoffHandler(deps: BffDeps): (c: Context) => Promise<Response> {
  return bffRoute(deps, async (c, session) => {
    const slug = c.req.param("slug");
    const row = slug ? await projectRow(c, deps.dataSource, session, slug) : null;
    if (!row) return c.json({ error: "not_found" }, 404);
    const none = c.json({ ok: true, data: { handoff: null } });
    if (c.req.query("focus") === "1" || deps.dataSource.getInbox == null) return none;
    const item = await Promise.resolve()
      .then(() => deps.dataSource.getInbox!(session))
      .then(
        (items) =>
          items.find(
            (i) =>
              i.kind === "event" &&
              i.type === "run_finished" &&
              i.unread === true &&
              i.projectId === row.id,
          ),
      )
      .catch(() => undefined);
    if (!item) return none;
    await Promise.resolve()
      .then(() => deps.dataSource.markInboxItemRead?.(session, item.id))
      .catch(() => undefined);
    return c.json({ ok: true, data: { handoff: { href: item.href, inboxItemId: item.id } } });
  });
}
