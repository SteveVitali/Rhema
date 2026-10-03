// OBS.1 — the web edge's request-correlation + error-line wiring (ADR-053). Same contract as the
// api: one middleware resolves the request identity and echoes it on every response; `app.onError`
// and every 5xx-returning path emit exactly ONE allowlisted structured line. Differences from the
// api: (a) the web MINTS the id for browser traffic — a browser-supplied `x-rhema-request-id` is
// client-forgeable noise and is never honored; the LB's `x-cloud-trace-context`/`traceparent` still
// join the app line to the LB's trace-sampled request log; (b) the resolved id is stamped onto the
// session headers so EVERY api-client call forwards it (the api honors `x-rhema-request-id`).

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  REQUEST_ID_HEADER,
  REQUEST_ID_RESPONSE_HEADER,
  cloudLoggingTraceField,
  errorClass,
  resolveRequestId,
  routeErrorLine,
  stackForLog,
  type RequestLogContext,
} from "@rhema/contracts";
import type { SessionHeaders } from "./data.js";

const REQUEST_LOG_KEY = "rhema.requestLog";
/** Marks the request whose ONE error line was already emitted (guards the fallback sweep). */
const ERROR_LOGGED_KEY = "rhema.errorLogged";

/**
 * OBS.1 — the request-scoped degraded-upstream counter (ADR-053): a best-effort read that the page
 * swallows (`.catch(() => null)` — ~110 sites) still answers <500, so the error sweep cannot see it.
 * The api-client funnel (`data.ts`'s wrapped fetch) bumps this per upstream 5xx/transport drop; the
 * middleware emits ONE WARNING `degraded_reads` line with the count when the page still answered
 * <500. ALS carries the counter because the funnel sits below the route call sites — no per-site
 * edits, and nothing outside the request's async scope can touch it.
 */
const degradedScope = new AsyncLocalStorage<{ degraded: number }>();

/** Bump the current request's degraded-upstream counter (a no-op outside a request scope). */
export function noteDegradedUpstream(): void {
  const store = degradedScope.getStore();
  if (store) store.degraded += 1;
}

/** The request's resolved correlation context, stashed by `requestContext` middleware. */
export function requestLogContext(c: Context): RequestLogContext {
  return (
    (c.get(REQUEST_LOG_KEY) as RequestLogContext | undefined) ?? { requestId: "unresolved", trace: null }
  );
}

/**
 * OBS.1 — a non-`Error` throw bypasses Hono's `onError` (`compose` + `#handleError` gate on
 * `err instanceof Error`) and escapes to a SILENT bare 500 from `@hono/node-server` — the "5xx
 * with no app log line" class. Normalize at the outermost middleware; the thrown value may be
 * user data so the message is fixed.
 */
class NonErrorThrowError extends Error {
  constructor() {
    super("a non-Error value was thrown from a handler");
    this.name = "NonErrorThrow";
  }
}

/**
 * Resolve + echo the request identity on every browser request. The LB's trace headers win; absent
 * them a fresh id is minted — the inbound `x-rhema-request-id` is deliberately NOT read (a browser
 * can set it; only the api honors it, from the web's forward). `gcpProject` builds the
 * `logging.googleapis.com/trace` join field (env `GOOGLE_CLOUD_PROJECT`).
 */
export function requestContext(gcpProject: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    const { requestId, traceId } = resolveRequestId(
      (n) => (n === REQUEST_ID_HEADER ? undefined : c.req.header(n)),
      () => randomUUID(),
    );
    const ctx: RequestLogContext = {
      requestId,
      trace: cloudLoggingTraceField(gcpProject, traceId),
    };
    c.set(REQUEST_LOG_KEY, ctx);
    c.header(REQUEST_ID_RESPONSE_HEADER, requestId);
    const scope = { degraded: 0 };
    try {
      await degradedScope.run(scope, () => next());
      // The fallback sweep: a route that ANSWERS ≥500 without logging still leaves its one line —
      // paths that already called `logWebRouteError` are marked and untouched.
      if (c.res.status >= 500 && !c.get(ERROR_LOGGED_KEY)) {
        logWebRouteError(c, { status: c.res.status, msg: "unlogged_5xx_response" });
      } else if (scope.degraded > 0 && c.res.status < 500) {
        // OBS.1 — best-effort reads degraded the page without a 5xx: stays out of the ERROR stream
        // (WARNING) but leaves its counter line for the log metric/audit trail.
        logWebRouteError(c, {
          status: c.res.status,
          msg: "degraded_reads",
          severity: "WARNING",
          degradedCount: scope.degraded,
          errorClass: "UpstreamDegradation",
        });
      }
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new NonErrorThrowError();
    }
  };
}

/**
 * The session headers PLUS the request id — `deps.session` is wrapped once so every api-client
 * call (chat, SSE proxy, dossier, …) forwards `x-rhema-request-id` without a call-site change.
 */
export function withRequestId(session: SessionHeaders | null, c: Context): SessionHeaders | null {
  if (!session) return null;
  return { ...session, [REQUEST_ID_HEADER]: requestLogContext(c).requestId };
}

/**
 * Emit THE ONE structured line for a request-scoped failure. `route` defaults to the matched
 * route TEMPLATE — never `c.req.path` (a `/p/<user-slug>/…` path is user-selected data).
 */
export function logWebRouteError(
  c: Context,
  args: {
    status: number;
    upstreamStatus?: number | null;
    upstreamCode?: string | null;
    errorClass?: string;
    stack?: string | null;
    msg?: string;
    severity?: "ERROR" | "WARNING";
    degradedCount?: number | null;
  },
): void {
  const route = c.req.routePath && c.req.routePath !== "*" ? c.req.routePath : "<unmatched>";
  c.set(ERROR_LOGGED_KEY, true);
  console.error(
    routeErrorLine(requestLogContext(c), {
      msg: args.msg ?? "unhandled_route_error",
      severity: args.severity,
      service: "web",
      route,
      method: c.req.method,
      status: args.status,
      upstreamStatus: args.upstreamStatus ?? null,
      upstreamCode: args.upstreamCode ?? null,
      errorClass: args.errorClass ?? "Error",
      stack: args.stack ?? null,
      degradedCount: args.degradedCount ?? null,
    }),
  );
}

/**
 * `app.onError`: the single structured line for every unhandled route error, then a bare 500 whose
 * ONLY reference is the request id (no stack, no message, no path). A thrown `HTTPException` keeps
 * its own response; a <5xx is an expected refusal and is not logged as an error line.
 */
export function webOnError(err: unknown, c: Context): Response {
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      logWebRouteError(c, {
        status: err.status,
        errorClass: errorClass(err),
        stack: stackForLog(err),
      });
    }
    return err.getResponse();
  }
  logWebRouteError(c, { status: 500, errorClass: errorClass(err), stack: stackForLog(err) });
  const { requestId } = requestLogContext(c);
  return c.text(`internal error — reference ${requestId}`, 500);
}
