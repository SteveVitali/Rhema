// OBS.1 — the shared request/error observability primitives (ADR-053). The contract:
//
//   Every user-visible 5xx leaves ONE structured line an operator can follow from the load
//   balancer to the line of code, and NOTHING in that line carries user text. Route fields are
//   the registered Hono TEMPLATE (`/runs/:id/events`), never the raw path — slugs are
//   user-selected. The formatter takes a fixed-shape input and serializes a fixed allowlist of
//   keys, so no call site can smuggle a body, query string, cookie, token, or message text into
//   the log even by accident.
//
// Request/trace IDs ride `x-rhema-request-id` between web→api (same convention as SEC.2's
// `x-rhema-client-ip`) and are read from the GCP hop headers when present
// (`x-cloud-trace-context`, W3C `traceparent`); absent both, one is minted. The Cloud Logging
// `logging.googleapis.com/trace` field joins the app line to the LB's trace-sampled request log.

/** The web→api request-id header (same `x-rhema-*` convention as the trusted-IP stamp). */
export const REQUEST_ID_HEADER = "x-rhema-request-id";
/** The response header that echoes the request id back to the caller. */
export const REQUEST_ID_RESPONSE_HEADER = "x-rhema-request-id";

/** Minimal header bag both `Headers` and hono's `c.req.header` adapt to. */
export type HeaderReader = (name: string) => string | undefined;

/** `x-cloud-trace-context`: `<TRACE_ID>/<SPAN_ID>[;o=<true>]`. Returns the 32-hex trace id or null. */
export function cloudTraceId(header: string | undefined): string | null {
  const trace = header?.split("/")[0]?.trim() ?? "";
  return /^[0-9a-f]{32}$/.test(trace) ? trace : null;
}

/** W3C `traceparent`: `<ver>-<trace-id>-<parent-id>-<flags>`. Returns the 32-hex trace id or null. */
export function traceparentId(header: string | undefined): string | null {
  const m = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/.exec(header?.trim() ?? "");
  return m ? m[1]! : null;
}

/** A caller-supplied request id is honored only if it is inert transport text (no whitespace, bounded). */
export function sanitizeRequestId(header: string | undefined): string | null {
  const v = header?.trim() ?? "";
  return v.length > 0 && v.length <= 128 && /^[\w:+\-=./]+$/.test(v) ? v : null;
}

export interface RequestIdentity {
  /** The request's correlation id — the LB's trace id when the hop carried one, else a minted id. */
  readonly requestId: string;
  /** The GCP trace id when the hop carried one (32-hex), else null. */
  readonly traceId: string | null;
}

/**
 * Resolve the request identity for one incoming request. Precedence: `x-cloud-trace-context` and
 * `traceparent` (the LB's own trace, so app lines join the LB's trace-sampled request log), then a
 * sanitized caller `x-rhema-request-id` (the web service's forward), else a fresh UUID.
 */
export function resolveRequestId(getHeader: HeaderReader, mint: () => string): RequestIdentity {
  const traceId = cloudTraceId(getHeader("x-cloud-trace-context")) ?? traceparentId(getHeader("traceparent"));
  const callerId = sanitizeRequestId(getHeader(REQUEST_ID_HEADER));
  return { requestId: traceId ?? callerId ?? mint(), traceId };
}

/** The Cloud Logging trace field joining an app line to the LB's request log (`projects/<p>/traces/<t>`). */
export function cloudLoggingTraceField(projectId: string | undefined, traceId: string | null): string | null {
  return projectId && traceId ? `projects/${projectId}/traces/${traceId}` : null;
}

/**
 * The error's CLASS, sanitized — never `err.message` (messages can embed user text: a thrown
 * `new Error("…" + userInput)` would otherwise leak). Class names are code vocabulary by
 * construction (`ApiError`, `TypeError`, …); the regex keeps only inert characters anyway.
 */
export function errorClass(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name && err.name !== "Error" ? err.name : (err.constructor?.name ?? "Error");
    const clean = name.replace(/[^A-Za-z0-9_.$:-]/g, "").slice(0, 80);
    return clean.length > 0 ? clean : "Error";
  }
  return "NonErrorThrow";
}

/**
 * The error's stack with the MESSAGE LINE stripped. `err.stack`'s first line is `<name>: <message>` —
 * the message is user-content-unsafe, so the log keeps `<class>` + the frame lines only. Frames are
 * code positions (`at fn (file:line:col)`), never payload. Returns null when no stack exists.
 */
export function stackForLog(err: unknown): string | null {
  if (!(err instanceof Error) || typeof err.stack !== "string") return null;
  const frames = err.stack.split("\n").slice(1).join("\n").trim();
  return frames.length > 0 ? `${errorClass(err)}\n${frames}` : errorClass(err);
}

/**
 * The fields of the ONE structured error line. This is the allowlist — anything not named here
 * cannot be logged (no `msg`, no `path`, no `query`, no `body`, no `upstreamBody` fields exist).
 */
export interface RouteErrorFields {
  /**
   * The stable event name — a code-literal vocabulary token (`unhandled_route_error`,
   * `chat_upstream_refused`…), never the error's own message text.
   */
  readonly msg: string;
  /** Owning service label (`"api"` | `"web"` | …). */
  readonly service: string;
  /** The registered Hono route TEMPLATE (`/p/:slug/chat/turns`), never the raw request path. */
  readonly route: string;
  readonly method: string;
  /** The status the caller sees. */
  readonly status: number;
  /**
   * `ERROR` (default) for a server fault; `WARNING` for an EXPECTED refusal pass-through (the api's
   * 4xx reaching the proxy) — the 5xx metric keys severity=ERROR so refusals never page anyone.
   */
  readonly severity?: "ERROR" | "WARNING";
  /** The upstream status when this 5xx is a refusal pass-through, else null. */
  readonly upstreamStatus: number | null;
  /** An upstream refusal CODE (`rate_limited`, `chat_refused`…) — a code is a vocabulary token, never text. */
  readonly upstreamCode: string | null;
  readonly requestId: string;
  /** `logging.googleapis.com/trace` value, else null. */
  readonly trace: string | null;
  /** `errorClass(err)` — sanitized. */
  readonly errorClass: string;
  /** `stackForLog(err)` — frames only, else null. */
  readonly stack: string | null;
  /**
   * The degraded-upstream-read count for `degraded_reads` lines: how many upstream calls failed
   * (transport drop or 5xx) while the page still answered <500 — a number, never text. Omitted
   * from the output when null/undefined.
   */
  readonly degradedCount?: number | null;
}

/**
 * Serialize ONE structured error line. The Cloud Logging `severity`/`logging.googleapis.com/trace`
 * special fields are populated so the line lands in Error Reporting's ERROR stream and joins the
 * LB request log by trace. The output is a single JSON line — `JSON.stringify` escapes any
 * hostile content that somehow reaches a field value.
 */
export function formatRouteErrorLine(f: RouteErrorFields): string {
  const entry: Record<string, unknown> = {
    severity: f.severity ?? "ERROR",
    msg: f.msg,
    service: f.service,
    route: f.route,
    method: f.method,
    status: f.status,
    upstreamStatus: f.upstreamStatus,
    upstreamCode: f.upstreamCode,
    requestId: f.requestId,
    errorClass: f.errorClass,
  };
  if (f.trace) entry["logging.googleapis.com/trace"] = f.trace;
  if (f.stack) entry.stack = f.stack;
  if (typeof f.degradedCount === "number") entry.degradedCount = f.degradedCount;
  return JSON.stringify(entry);
}

/** The request-scoped pieces a route needs to build a compliant line without re-deriving them. */
export interface RequestLogContext {
  readonly requestId: string;
  readonly trace: string | null;
}

/**
 * Build a compliant error line for one request. `errorFields` may only override the
 * request-invariant fields — requestId/trace always come from the resolved context, so a call
 * site can never log a line that cannot be traced back.
 */
export function routeErrorLine(
  ctx: RequestLogContext,
  f: Omit<RouteErrorFields, "requestId" | "trace">,
): string {
  return formatRouteErrorLine({ ...f, requestId: ctx.requestId, trace: ctx.trace });
}
