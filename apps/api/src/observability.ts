// OBS.1 — the api's request-correlation + error-line wiring (ADR-053). One middleware resolves the
// request identity (`x-cloud-trace-context` / `traceparent` from the GCP hop, then the web's
// `x-rhema-request-id`, else minted) and echoes it on every response; `app.onError` and any
// 5xx-returning path emit exactly ONE allowlisted structured line — service, route TEMPLATE
// (`c.req.routePath`, never the raw path — slugs are user-selected), method, status, upstream
// status/code, requestId, error class, message-stripped stack, and the Cloud Logging trace field.
// Nothing here can carry a body, query string, cookie, token, or user text: the formatter's input
// shape has no such field.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  REQUEST_ID_RESPONSE_HEADER,
  cloudLoggingTraceField,
  errorClass,
  resolveRequestId,
  routeErrorLine,
  stackForLog,
  type RequestLogContext,
} from "@rhema/contracts";

const REQUEST_LOG_KEY = "rhema.requestLog";
/** Marks the request whose ONE error line was already emitted (guards the fallback sweep). */
const ERROR_LOGGED_KEY = "rhema.errorLogged";

/**
 * OBS.1 — the request-scoped degraded-read counter (ADR-053), the api's half of the contract: a
 * best-effort store/query read a handler swallows (`.catch(() => null)` / `=> ({rows: []})`) still
 * answers <500, so the error sweep cannot see it. Call sites bump this; the middleware emits ONE
 * WARNING `degraded_reads` line with the count when the response stayed <500.
 */
const degradedScope = new AsyncLocalStorage<{ degraded: number }>();

/** Bump the current request's degraded-read counter (a no-op outside a request scope). */
export function noteDegradedRead(): void {
  const store = degradedScope.getStore();
  if (store) store.degraded += 1;
}

/**
 * Wrap a dependency funnel (`db.query`, `store.get`, `txRunner.run`, …) so EVERY rejection bumps the
 * request's degraded counter, then rethrows — the route's own `.catch(() => …)` decides whether the
 * page degrades (<500 → the WARNING line) or faults (≥500 → the error trail). Methods not named in
 * `methods` pass through untouched; the wrapped call binds the REAL target, not the proxy.
 */
export function instrumentReads<T extends object>(target: T, methods: readonly string[]): T {
  const wrapped = new Map<PropertyKey, unknown>();
  return new Proxy(target, {
    get(t, prop, recv) {
      const hit = wrapped.get(prop);
      if (hit) return hit;
      const v = Reflect.get(t, prop, recv);
      if (typeof v !== "function" || !methods.includes(prop as string)) return v;
      const fn = (...args: unknown[]) => {
        let out: unknown;
        try {
          out = (v as (...a: unknown[]) => unknown).apply(t, args);
        } catch (e) {
          noteDegradedRead();
          throw e;
        }
        if (out && typeof (out as Promise<unknown>).then === "function") {
          return (out as Promise<unknown>).then(
            (r) => r,
            (e) => {
              noteDegradedRead();
              throw e;
            },
          );
        }
        return out;
      };
      wrapped.set(prop, fn);
      return fn;
    },
  });
}

/**
 * Instrument a store FACTORY (`contentStoreFor` — its result is `Promise<ContentStore>` on the live
 * binding but a bare store on some test fakes). The resolved STORE is proxied, never the factory's
 * return value itself: proxying a Promise makes `await` invoke `Promise.prototype.then` through the
 * trap with `this` = the proxy → `TypeError` at `Proxy.then` (the prod dossier 500 OBS.1's own
 * error line caught on deploy). Null/undefined factory results pass through.
 */
export function instrumentStoreFactory<F extends (workspaceId: string) => unknown>(
  factory: F,
  methods: readonly string[],
): (workspaceId: string) => Promise<Awaited<ReturnType<F>>> {
  return (workspaceId: string) =>
    Promise.resolve(factory(workspaceId)).then((store) =>
      (store == null ? store : instrumentReads(store as object, methods)) as Awaited<ReturnType<F>>,
    );
}

/** The request's resolved correlation context, stashed by `requestContext` middleware. */
export function requestLogContext(c: Context): RequestLogContext {
  return (
    (c.get(REQUEST_LOG_KEY) as RequestLogContext | undefined) ?? { requestId: "unresolved", trace: null }
  );
}

/**
 * OBS.1 — a non-`Error` throw inside a handler bypasses Hono's `onError` (`compose` +
 * `#handleError` both gate on `err instanceof Error`) and escapes `app.fetch`, where
 * `@hono/node-server` answers a SILENT bare 500 — the "5xx with no app log line" class. Normalize
 * the throw to an `Error` at the outermost middleware so every failure reaches `onError`; the
 * message is fixed because the thrown value may be user data.
 */
class NonErrorThrowError extends Error {
  constructor() {
    super("a non-Error value was thrown from a handler");
    this.name = "NonErrorThrow";
  }
}

/**
 * Resolve + echo the request identity on every request. `gcpProject` builds the
 * `logging.googleapis.com/trace` join field (env `GOOGLE_CLOUD_PROJECT`); absent it, requestId
 * still propagates — the trace field is simply omitted.
 */
export function requestContext(gcpProject: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    const { requestId, traceId } = resolveRequestId((n) => c.req.header(n), () => randomUUID());
    const ctx: RequestLogContext = {
      requestId,
      trace: cloudLoggingTraceField(gcpProject, traceId),
    };
    c.set(REQUEST_LOG_KEY, ctx);
    c.header(REQUEST_ID_RESPONSE_HEADER, requestId);
    const scope = { degraded: 0 };
    try {
      await degradedScope.run(scope, () => next());
      // The fallback sweep: a route that ANSWERS ≥500 without logging (a `*_unavailable`/`not_wired`
      // 503 a path returns directly) still leaves its one line — routes that already called
      // `logApiRouteError` are marked and untouched.
      if (c.res.status >= 500 && !c.get(ERROR_LOGGED_KEY)) {
        logApiRouteError(c, undefined, { status: c.res.status, msg: "unlogged_5xx_response" });
      } else if (scope.degraded > 0 && c.res.status < 500) {
        // OBS.1 — best-effort reads degraded the payload without a 5xx: WARNING, not ERROR (the
        // 5xx metric never sees it), but the count leaves its trail.
        logApiRouteError(c, undefined, {
          status: c.res.status,
          msg: "degraded_reads",
          severity: "WARNING",
          degradedCount: scope.degraded,
        });
      }
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new NonErrorThrowError();
    }
  };
}

/**
 * Emit THE ONE structured error line for a 5xx this request produces. `route` defaults to the
 * matched route TEMPLATE — never `c.req.path` (a `/p/<user-slug>/…` path is user-selected data).
 */
export function logApiRouteError(
  c: Context,
  err: unknown,
  args: {
    status: number;
    upstreamStatus?: number | null;
    upstreamCode?: string | null;
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
      service: "api",
      route,
      method: c.req.method,
      status: args.status,
      upstreamStatus: args.upstreamStatus ?? null,
      upstreamCode: args.upstreamCode ?? null,
      errorClass: err === undefined && args.severity === "WARNING" ? "UpstreamDegradation" : errorClass(err),
      stack: stackForLog(err),
      degradedCount: args.degradedCount ?? null,
    }),
  );
}

/**
 * `app.onError`: the single structured line for every unhandled route error, then a bare 500 that
 * names the correlation id (the response body carries no stack, no message — just the id). A thrown
 * `HTTPException` keeps its own response/status: a <5xx is an expected refusal (not a server fault)
 * and is not logged as an error line; ≥500 logs the one line for that status.
 */
export function apiOnError(err: unknown, c: Context): Response {
  if (err instanceof HTTPException) {
    if (err.status >= 500) logApiRouteError(c, err, { status: err.status });
    return err.getResponse();
  }
  logApiRouteError(c, err, { status: 500 });
  const { requestId } = requestLogContext(c);
  return c.json({ error: "internal_error", requestId }, 500);
}
