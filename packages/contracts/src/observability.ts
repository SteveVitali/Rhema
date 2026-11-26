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

/** Bounded non-Error metadata fields that survive `errorSummary` (driver/driver-adjacent facts, never values). */
const ERROR_TAG_FIELDS = ["code", "constraint", "routine", "syscall"] as const;

/**
 * One-line error summary for logs: `errorClass` plus any bounded driver tags a thrown Error carries
 * (node `code` like `ECONNREFUSED`, Postgres `code`/`constraint`/`routine` like `23503` /
 * `claims_draft_id_fkey` — field NAMES and enum tokens, never `err.message` which can embed user
 * text or row values). Non-Error throws collapse to `NonErrorThrow`. Use where a full
 * `stackForLog` line is too heavy (heartbeat/sweep/best-effort diagnostics).
 */
export function errorSummary(err: unknown): string {
  if (!(err instanceof Error)) return "NonErrorThrow";
  const rec = err as Error & Record<string, unknown>;
  const tags: string[] = [];
  for (const k of ERROR_TAG_FIELDS) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 0) {
      const clean = v.replace(/[^A-Za-z0-9_.$-]/g, "").slice(0, 80);
      if (clean.length > 0) tags.push(`${k}=${clean}`);
    }
  }
  return tags.length > 0 ? `${errorClass(err)} ${tags.join(" ")}` : errorClass(err);
}

/**
 * The bounded driver tags alone (`code=57P01 routine=…`) for the route error line's `driverTags`
 * field — same allowlist as `errorSummary`'s tags (driver/driver-adjacent facts, never messages or
 * values). pg `DatabaseError`s carry the SQLSTATE on `code`; a bare-name stack (`errorClass` alone)
 * then still names the class. null when the error carries none of the tag fields.
 */
export function driverTagsForLog(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const rec = err as Error & Record<string, unknown>;
  const tags: string[] = [];
  for (const k of ERROR_TAG_FIELDS) {
    const v = rec[k];
    if (typeof v === "string" && v.length > 0) {
      const clean = v.replace(/[^A-Za-z0-9_.$-]/g, "").slice(0, 80);
      if (clean.length > 0) tags.push(`${k}=${clean}`);
    }
  }
  return tags.length > 0 ? tags.join(" ") : null;
}

/**
 * The whole-Error log value for `console.error(prefix, errorLogValue(err))`: `errorSummary` on the
 * first line plus the message-stripped frames, so the emitted line groups sanely in Error Reporting
 * (frame identity) while never carrying `err.message` text. This is the ADR-053-safe replacement
 * for passing a raw `err`/`err.message` to a console sink.
 */
export function errorLogValue(err: unknown): string {
  const summary = errorSummary(err);
  const stack = stackForLog(err);
  if (!stack) return summary;
  const frames = stack.split("\n").slice(1).join("\n");
  return frames ? `${summary}\n${frames}` : summary;
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
  /**
   * R6FIX.55 — the bounded driver tags from `driverTagsForLog` (`code=08006`, `routine=…`) —
   * enum tokens a thrown driver error carries, never its message. A pg `DatabaseError`'s SQLSTATE
   * lands here so a bare `errorClass:"error"` line still names its failure class.
   */
  readonly driverTags?: string | null;
  /**
   * RH-21 residual — the running release (the image-baked `RHEMA_BUILD_GIT_SHA`), emitted as
   * `serviceContext.version` so Cloud Error Reporting attributes each grouped error to a release
   * instead of an unversioned bucket. Service-level identity (like `service`), never request data;
   * `routeErrorLine` always binds it from the resolved context — a call site cannot forge it.
   */
  readonly serviceVersion?: string | null;
}

/**
 * A release stamp is inert transport text — a git SHA or Cloud Run revision token (`[\w.:+\-/]+`,
 * bounded). Anything else is dropped: the formatter's output contract is that no field can carry
 * user text, and `serviceVersion` is env-derived but still validated at the emit seam.
 */
function sanitizeServiceVersion(version: string | null | undefined): string | null {
  const v = typeof version === "string" ? version.trim() : "";
  return v.length > 0 && v.length <= 80 && /^[\w.:+\-/]+$/.test(v) ? v : null;
}

/**
 * Serialize ONE structured error line. The Cloud Logging `severity`/`logging.googleapis.com/trace`
 * special fields are populated so the line lands in Error Reporting's ERROR stream and joins the
 * LB request log by trace. The output is a single JSON line — `JSON.stringify` escapes any
 * hostile content that somehow reaches a field value.
 */
export function formatRouteErrorLine(f: RouteErrorFields): string {
  const serviceVersion = sanitizeServiceVersion(f.serviceVersion);
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
    // Cloud Error Reporting's release attribution field: `service` is already allowlisted; the
    // `version` half lands only when a sanitized release stamp was provided (RH-21 residual —
    // unversioned errors group but never attribute to a release).
    serviceContext: {
      service: f.service,
      ...(serviceVersion ? { version: serviceVersion } : {}),
    },
  };
  if (f.trace) entry["logging.googleapis.com/trace"] = f.trace;
  if (f.stack) entry.stack = f.stack;
  if (typeof f.degradedCount === "number") entry.degradedCount = f.degradedCount;
  // the tag string is code vocabulary only (key=value tokens) — re-validated at the seam so a
  // hostile or message-bearing value can never reach the line even from a direct caller.
  if (typeof f.driverTags === "string" && /^[\w .=$-]{1,200}$/.test(f.driverTags)) {
    entry.driverTags = f.driverTags;
  }
  return JSON.stringify(entry);
}

/** The request-scoped pieces a route needs to build a compliant line without re-deriving them. */
export interface RequestLogContext {
  readonly requestId: string;
  readonly trace: string | null;
  /**
   * The service-level release stamp the `requestContext` middleware resolved once (env
   * `RHEMA_BUILD_GIT_SHA`), carried on the request context so every emitted line attributes to the
   * running release. Not request data — requestId/trace stay per-request.
   */
  readonly serviceVersion?: string | null;
}

/**
 * Build a compliant error line for one request. `errorFields` may only override the
 * request-invariant fields — requestId/trace/serviceVersion always come from the resolved
 * context, so a call site can never log a line that cannot be traced back nor forge the release
 * stamp. `serviceVersion` is Omit'd for the same reason: it is service identity (one release per
 * process), not per-call data — a direct `formatRouteErrorLine` caller may still set it.
 */
export function routeErrorLine(
  ctx: RequestLogContext,
  f: Omit<RouteErrorFields, "requestId" | "trace" | "serviceVersion">,
): string {
  return formatRouteErrorLine({
    ...f,
    requestId: ctx.requestId,
    trace: ctx.trace,
    serviceVersion: ctx.serviceVersion ?? null,
  });
}
