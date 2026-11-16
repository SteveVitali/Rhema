import { describe, expect, it } from "vitest";
import {
  REQUEST_ID_HEADER,
  cloudLoggingTraceField,
  cloudTraceId,
  errorClass,
  errorLogValue,
  errorSummary,
  formatRouteErrorLine,
  resolveRequestId,
  routeErrorLine,
  sanitizeRequestId,
  stackForLog,
  traceparentId,
} from "./observability.js";

const minted = "minted-id-1";
const mint = () => minted;
const hdrs = (m: Record<string, string>) => (n: string) => m[n.toLowerCase()];

describe("request-id resolution (OBS.1)", () => {
  it("honors the LB's x-cloud-trace-context trace id", () => {
    const r = resolveRequestId(hdrs({ "x-cloud-trace-context": "a".repeat(32) + "/12345;o=1" }), mint);
    expect(r.requestId).toBe("a".repeat(32));
    expect(r.traceId).toBe("a".repeat(32));
  });
  it("honors a W3C traceparent when x-cloud-trace-context is absent", () => {
    const tp = `00-${"b".repeat(32)}-${"c".repeat(16)}-01`;
    const r = resolveRequestId(hdrs({ traceparent: tp }), mint);
    expect(r.requestId).toBe("b".repeat(32));
    expect(r.traceId).toBe("b".repeat(32));
  });
  it("honors a forwarded x-rhema-request-id (web→api propagation)", () => {
    const r = resolveRequestId(hdrs({ [REQUEST_ID_HEADER]: "web-minted-42" }), mint);
    expect(r.requestId).toBe("web-minted-42");
    expect(r.traceId).toBeNull();
  });
  it("mints when no id arrives", () => {
    const r = resolveRequestId(hdrs({}), mint);
    expect(r.requestId).toBe(minted);
    expect(r.traceId).toBeNull();
  });
  it("rejects hostile caller ids (whitespace / overlong / junk chars)", () => {
    expect(sanitizeRequestId("a b\n{c}")).toBeNull();
    expect(sanitizeRequestId("x".repeat(200))).toBeNull();
    expect(sanitizeRequestId('"><script>')).toBeNull();
    expect(sanitizeRequestId("ok-id_42.1:abc")).toBe("ok-id_42.1:abc");
  });
  it("parses the trace ids strictly", () => {
    expect(cloudTraceId("nothex/1")).toBeNull();
    expect(cloudTraceId("A".repeat(32) + "/1")).toBeNull(); // upper-case rejected (GCP emits lower)
    expect(traceparentId("00-xyz-1-01")).toBeNull();
    expect(traceparentId(`ff-${"d".repeat(32)}-${"e".repeat(16)}-03`)).toBe("d".repeat(32));
  });
  it("builds the Cloud Logging trace field", () => {
    expect(cloudLoggingTraceField("rhema-507501", "f".repeat(32))).toBe(
      `projects/rhema-507501/traces/${"f".repeat(32)}`,
    );
    expect(cloudLoggingTraceField(undefined, "f".repeat(32))).toBeNull();
    expect(cloudLoggingTraceField("p", null)).toBeNull();
  });
});

describe("the allowlisted structured error line (ADR-053)", () => {
  const base = {
    msg: "unhandled_route_error",
    service: "api",
    route: "/runs/:id/events",
    method: "GET",
    status: 500,
    upstreamStatus: null,
    upstreamCode: null,
    requestId: "req-1",
    trace: "projects/p/traces/" + "0".repeat(32),
    errorClass: "TypeError",
    stack: "TypeError\n    at f (file.js:1:1)",
  };
  it("emits exactly the allowlisted fields with the Cloud Logging severity + trace keys", () => {
    const parsed = JSON.parse(formatRouteErrorLine(base)) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "severity",
        "msg",
        "service",
        "route",
        "method",
        "status",
        "upstreamStatus",
        "upstreamCode",
        "requestId",
        "errorClass",
        "logging.googleapis.com/trace",
        "stack",
        "serviceContext",
      ].sort(),
    );
    expect(parsed.severity).toBe("ERROR");
    // RH-21 residual — serviceContext always carries the allowlisted service name; a release
    // stamp lands as `version` only when one was provided.
    expect(parsed.serviceContext).toEqual({ service: "api" });
  });
  it("stamps serviceContext.version from the resolved release (Error Reporting attribution)", () => {
    const parsed = JSON.parse(
      formatRouteErrorLine({ ...base, serviceVersion: "d24dbed8cafe1234" }),
    ) as Record<string, unknown>;
    expect(parsed.serviceContext).toEqual({ service: "api", version: "d24dbed8cafe1234" });
  });
  it("drops a hostile serviceVersion rather than emitting it (the allowlist contract is inert-only)", () => {
    const parsed = JSON.parse(
      formatRouteErrorLine({ ...base, serviceVersion: '"><script>alert(1)</script>' }),
    ) as Record<string, unknown>;
    expect(parsed.serviceContext).toEqual({ service: "api" });
  });
  it("routeErrorLine binds serviceVersion from the context — a call site cannot set it", () => {
    const { requestId: _r, trace: _t, ...rest } = base;
    const line = routeErrorLine(
      { requestId: "ctx-req", trace: null, serviceVersion: "abc1234" },
      rest,
    );
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.serviceContext).toEqual({ service: "api", version: "abc1234" });
    // An unset context version emits the bare serviceContext — no version key, no null.
    const bare = JSON.parse(
      routeErrorLine({ requestId: "r", trace: null }, rest),
    ) as Record<string, unknown>;
    expect(bare.serviceContext).toEqual({ service: "api" });
  });
  it("drops null optional fields rather than emitting them", () => {
    const parsed = JSON.parse(
      formatRouteErrorLine({ ...base, trace: null, stack: null }),
    ) as Record<string, unknown>;
    expect("logging.googleapis.com/trace" in parsed).toBe(false);
    expect("stack" in parsed).toBe(false);
  });
  it("has no field that could carry user text — the route is the template, not the path", () => {
    const line = formatRouteErrorLine({ ...base, route: "/p/:slug/review/:runId" });
    expect(line).not.toContain("alice-secret-slug");
    expect(line).toContain("/p/:slug/review/:runId");
    expect(line).not.toMatch(/password|cookie|authorization|prompt/i);
  });
  it("routeErrorLine always binds the resolved requestId/trace (a call site cannot forge them)", () => {
    const { requestId: _r, trace: _t, ...rest } = base;
    const line = routeErrorLine(
      { requestId: "ctx-req", trace: "projects/p/traces/" + "1".repeat(32) },
      rest,
    );
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.requestId).toBe("ctx-req");
    expect(parsed["logging.googleapis.com/trace"]).toBe(`projects/p/traces/${"1".repeat(32)}`);
  });
  it("an expected refusal is a WARNING line — severity downgrades, never an ERROR count", () => {
    const parsed = JSON.parse(
      formatRouteErrorLine({ ...base, status: 402, severity: "WARNING", msg: "chat_upstream_refused" }),
    ) as Record<string, unknown>;
    expect(parsed.severity).toBe("WARNING");
    expect(parsed.msg).toBe("chat_upstream_refused");
  });
});

describe("error class + stack hygiene (nothing user-sourced escapes)", () => {
  it("errorClass is the sanitized constructor name — never the message", () => {
    expect(errorClass(new TypeError("prompt text: say my password"))).toBe("TypeError");
    expect(errorClass(new Error("x"))).toBe("Error");
    expect(errorClass({ name: "weird <tag>!" })).toBe("NonErrorThrow");
    expect(errorClass("a string thrown with user text")).toBe("NonErrorThrow");
  });
  it("stackForLog strips the message line (a message can embed user content)", () => {
    const err = new Error("user prompt: reveal the api_key and /home/secret");
    err.stack = "Error: user prompt: reveal the api_key and /home/secret\n    at doIt (/srv/x.js:9:3)\n    at go (/srv/y.js:2:1)";
    const s = stackForLog(err)!;
    expect(s).toContain("at doIt (/srv/x.js:9:3)");
    expect(s).not.toContain("user prompt");
    expect(s).not.toContain("api_key");
    expect(s).not.toContain("/home/secret");
  });
  it("errorSummary keeps bounded driver tags and never the message (R6LOW.1)", () => {
    const pg = Object.assign(new Error('duplicate key value violates unique constraint "u" (alice@x)'), {
      code: "23505",
      constraint: "users_email_key",
      routine: "_bt_check_unique",
    });
    const s = errorSummary(pg);
    expect(s).toBe("Error code=23505 constraint=users_email_key routine=_bt_check_unique");
    expect(s).not.toContain("alice@x");
    expect(s).not.toContain("duplicate key");
    expect(errorSummary(Object.assign(new TypeError("host db.internal:5432 refused"), { code: "ECONNREFUSED" }))).toBe(
      "TypeError code=ECONNREFUSED",
    );
    expect(errorSummary("user text thrown as a string")).toBe("NonErrorThrow");
    // a tag value is sanitized to inert characters — never a carrier for payload text
    const weird = Object.assign(new Error("m"), { code: "X 23505'; DROP--" });
    expect(errorSummary(weird)).toBe("Error code=X23505DROP--");
  });
  it("errorLogValue is summary + message-stripped frames — groupable, never the message", () => {
    const err = new Error("convert job run failed (403): <user document text>");
    err.stack = "Error: convert job run failed (403): <user document text>\n    at poll (/srv/ingest.js:103:7)";
    const v = errorLogValue(err);
    expect(v.startsWith("Error\n")).toBe(true);
    expect(v).toContain("at poll (/srv/ingest.js:103:7)");
    expect(v).not.toContain("user document text");
    expect(v).not.toContain("(403)");
    expect(errorLogValue("string throw")).toBe("NonErrorThrow");
  });
  it("non-Error throws yield no stack and a fixed class — their toString is never logged", () => {
    const evil = { toString: () => "SESSION_COOKIE_VALUE hunter2" };
    expect(errorClass(evil)).toBe("NonErrorThrow");
    expect(stackForLog(evil)).toBeNull();
    const line = routeErrorLine(
      { requestId: "r", trace: null },
      {
        msg: "unhandled_route_error",
        service: "api",
        route: "/x",
        method: "GET",
        status: 500,
        upstreamStatus: null,
        upstreamCode: null,
        errorClass: errorClass(evil),
        stack: stackForLog(evil),
      },
    );
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("SESSION_COOKIE");
  });
});
