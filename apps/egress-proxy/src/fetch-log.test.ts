import { describe, expect, it } from "vitest";
import { buildRequestFetchLogRow, buildServerToolFetchLogRow, normalizeUrl } from "./fetch-log.js";

const base = { runId: "run_1", attempt: 3, agentLabel: "editor", ts: "2026-09-02T00:00:00.000Z" };

describe("fetch log of record (REQ-DATA-16, AC6)", () => {
  it("tags a served request row with run/attempt/agent, url, status, decision", () => {
    const row = buildRequestFetchLogRow(base, {
      url: "https://api.anthropic.com/v1/messages",
      status: 200,
      bytes: 512,
      decision: "allow",
    });
    expect(row).toEqual({
      runId: "run_1",
      ts: "2026-09-02T00:00:00.000Z",
      agentLabel: "editor",
      attempt: 3,
      kind: "inference",
      query: null,
      url: "https://api.anthropic.com/v1/messages",
      normalizedUrl: "https://api.anthropic.com/v1/messages",
      status: 200,
      bytes: 512,
      decision: "allow",
      denyReason: null,
      phaseClass: null, // CITE.1 — unstamped traffic carries NULL (0056 `phase_class`)
    });
  });

  it("records a denied request with its reason", () => {
    const row = buildRequestFetchLogRow(base, {
      url: "https://evil.example/v1/messages",
      status: 403,
      decision: "deny",
      denyReason: "off-allowlist endpoint",
    });
    expect(row.decision).toBe("deny");
    expect(row.denyReason).toBe("off-allowlist endpoint");
    expect(row.status).toBe(403);
  });

  it("records server-tool search/fetch rows (the cited⇒fetched source)", () => {
    const search = buildServerToolFetchLogRow(base, { kind: "search", query: "widgets", decision: "allow" });
    expect(search).toMatchObject({ kind: "search", query: "widgets", url: null, decision: "allow", attempt: 3 });
    const fetch = buildServerToolFetchLogRow(base, {
      kind: "fetch",
      url: "https://Src.Example/Page",
      decision: "deny",
      denyReason: "novel_domain_cap",
    });
    expect(fetch.kind).toBe("fetch");
    expect(fetch.normalizedUrl).toBe("https://src.example/Page");
    expect(fetch.denyReason).toBe("novel_domain_cap");
  });

  it("normalizes URLs (lowercase host, drop fragment)", () => {
    expect(normalizeUrl("HTTPS://API.Anthropic.com/v1/messages#frag")).toBe("https://api.anthropic.com/v1/messages");
    expect(normalizeUrl(undefined)).toBeNull();
  });
});
