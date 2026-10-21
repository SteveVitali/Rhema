// R6FOR.2 (REQ-FOR-4) — the exposure-forensics script's classification, attribution, and
// verdict logic over synthetic fixtures; each test fails if the behaviour it pins is removed.
import { describe, it, expect } from "vitest";
import {
  decodeUlidMs,
  uaClass,
  classifyPath,
  toEntry,
  extractIds,
  buildBuckets,
  pairWebEntry,
  inferRequester,
  exposedOwners,
  verdict,
  anonymizer,
  analyze,
} from "./rls-exposure-forensics.mjs";

const entry = (over = {}) => ({
  ts: Date.parse("2026-09-24T12:00:00Z"),
  service: "api",
  host: "api.rhema.tools",
  method: "GET",
  path: "/voices",
  status: 200,
  ip: "203.0.113.9",
  ua: "Mozilla/5.0",
  family: "voices-list",
  ...over,
});

describe("decodeUlidMs", () => {
  it("decodes the 48-bit ms prefix; rejects non-ULIDs", () => {
    expect(decodeUlidMs("01M2F0SYNTH000000000000001")).toBeLessThan(Date.parse("2026-10-21"));
    expect(decodeUlidMs("01M2F0SYNTH000000000000001")).toBeGreaterThan(Date.parse("2026-08-01"));
    expect(decodeUlidMs("my-first-project")).toBeNull();
    expect(decodeUlidMs(null)).toBeNull();
  });
});

describe("classifyPath", () => {
  it("maps the confirmed leak routes + residual bucket-A voices-id", () => {
    expect(classifyPath("api", "api.rhema.tools", "GET", "/voices")).toBe("voices-list");
    expect(classifyPath("api", "api.rhema.tools", "GET", "/voices/01M2F0SYNTH000000000000001")).toBe("voices-id");
    expect(classifyPath("api", "api.rhema.tools", "GET", "/voices/01M2F0SYNTH000000000000001/estimate")).toBe("voices-id");
    expect(classifyPath("api", "api.rhema.tools", "GET", "/projects/01M2F0SYNTH000000000000001/review/01M3F0SYNTH000000000000005/dossier")).toBe("dossier");
    expect(classifyPath("api", "api.rhema.tools", "GET", "/projects/01M2F0SYNTH000000000000001/chat")).toBe("chat");
    expect(classifyPath("api", "api.rhema.tools", "POST", "/projects/01M2F0SYNTH000000000000001/chat/threads/01M4F0SYNTH000000000000006/turns")).toBe("chat-write");
    expect(classifyPath("api", "api.rhema.tools", "GET", "/projects/01M2F0SYNTH000000000000001/outline")).toBe("outline");
    expect(classifyPath("web", "rhema.tools", "GET", "/voices")).toBe("voices-list");
    expect(classifyPath("web", "rhema.tools", "GET", "/api/chat/visitor/channelInfo")).toBe("non-app");
  });
});

describe("attribution — buckets + BFF pairing", () => {
  const ownerOf = (id) => (id === "01M2AAAAAAAAAAAAAAAAAAAAAA" ? { ws: "wsA" } : null);
  it("modal resource owner is the requester estimate", () => {
    const win = [
      entry({ ip: "198.51.100.7", path: "/projects/01M2AAAAAAAAAAAAAAAAAAAAAA/chat", family: "chat" }),
      entry({ ip: "198.51.100.7", path: "/projects/01M2AAAAAAAAAAAAAAAAAAAAAA/outline", family: "outline" }),
    ];
    const buckets = buildBuckets(win, ownerOf);
    const r = inferRequester(entry({ ip: "198.51.100.7" }), buckets, []);
    expect(r.ws).toBe("wsA");
    expect(r.via).toBe("bucket-modal");
  });
  it("pairs an api call to the nearest same-family web entry (BFF carries the egress IP)", () => {
    const api = entry({ ts: 100000, service: "api", ip: "203.0.113.10", ua: "node" });
    const web = [
      entry({ ts: 99970, service: "web", ip: "198.51.100.7", family: "voices-list" }),
      entry({ ts: 150000, service: "web", ip: "198.51.100.8", family: "voices-list" }),
    ];
    expect(pairWebEntry(api, web)?.ip).toBe("198.51.100.7");
  });
});

describe("verdict", () => {
  const isTest = (ws) => ws === "wsTest";
  it("real requester + foreign real owner → exposed", () => {
    expect(verdict(entry(), { ws: "wsA" }, new Set(["wsA", "wsB"]), isTest)).toBe("exposed");
  });
  it("requester owning every returnable row → own", () => {
    expect(verdict(entry(), { ws: "wsA" }, new Set(["wsA"]), isTest)).toBe("own");
  });
  it("non-2xx served nothing", () => {
    expect(verdict(entry({ status: 401 }), { ws: "wsA" }, new Set(["wsB"]), isTest)).toBe("not-served");
    expect(verdict(entry({ status: 404 }), { ws: "wsA" }, new Set(["wsB"]), isTest)).toBe("not-served");
  });
  it("unattributed requester with real owners → unresolved-possible", () => {
    expect(verdict(entry(), { ws: null }, new Set(["wsB"]), isTest)).toBe("unresolved-possible");
  });
  it("test-workspace traffic is out of the REQ-FOR-4 definition", () => {
    expect(verdict(entry(), { ws: "wsTest" }, new Set(["wsB"]), isTest)).toBe("test-requester");
    expect(verdict(entry(), { ws: "wsA" }, new Set(["wsTest"]), isTest)).toBe("foreign-test-only");
  });
});

describe("analyze — end-to-end over a synthetic fixture", () => {
  const wsA = "01M2F0SYNTH000000000000001";
  const wsB = "01M2F0SYNTH000000000000002";
  const personaB = "01M2F0SYNTH000000000000010";
  const prod = {
    workspaces: [
      { id: wsA, kind: "personal", is_test: false },
      { id: wsB, kind: "personal", is_test: false },
      { id: "wsT", kind: "personal", is_test: true },
    ],
    members: [{ workspace_id: wsA, user_id: "u1" }],
    sessions: [{ user_id: "u1", created_at: "2026-09-20", expires_at: "2026-09-27" }],
    personas: [{ id: personaB, workspace_id: wsB, deleted_at: null }],
    projects: [{ id: "01M2F0SYNTH000000000000004", workspace_id: wsA, slug: "p1" }],
    runs: [],
    threads: [],
    connections: [],
    deploys: [
      { id: "prod:f3c7e135x", git_sha: "f3c7e135aaaa", deployed_at: "2026-09-25T22:14:02Z" },
      { id: "prod:987ce0024x", git_sha: "987ce0024aaaa", deployed_at: "2026-10-01T01:54:21Z" },
    ],
  };
  it("a ws-A requester listing /voices while only ws-B personas exist → yes + counts", () => {
    const leak = [
      entry({ ts: Date.parse("2026-09-26T12:00:00Z"), ip: "198.51.100.7", ua: "Mozilla", path: "/voices", family: "voices-list" }),
    ];
    const win = [
      ...leak,
      entry({ ts: Date.parse("2026-09-26T12:00:00Z"), ip: "198.51.100.7", path: `/projects/01M2F0SYNTH000000000000004/chat`, family: "chat" }),
    ];
    const { perRoute } = analyze(win, prod);
    expect(perRoute["voices-list"].verdict).toBe("yes");
    expect(perRoute["voices-list"].exposureEvents).toBe(1);
    expect(perRoute["voices-list"].distinctRequesterRealWorkspaces).toBe(1);
    expect(perRoute["voices-list"].distinctOwnerRealWorkspaces).toBe(1);
  });
  it("post-fix requests cannot expose — outcome post-fix", () => {
    const leak = [
      entry({ ts: Date.parse("2026-10-02T00:00:00Z"), path: "/voices", family: "voices-list" }),
    ];
    const { perRoute } = analyze(leak, prod);
    expect(perRoute["voices-list"].outcomes["post-fix"]).toBe(1);
    expect(perRoute["voices-list"].verdict).toBe("no");
  });
});

describe("de-identification", () => {
  it("anonymizer emits stable labels and collapses test workspaces", () => {
    const anon = anonymizer();
    expect(anon("ws-one", false)).toBe("real-ws-1");
    expect(anon("ws-two", false)).toBe("real-ws-2");
    expect(anon("ws-one", false)).toBe("real-ws-1");
    expect(anon("ws-test", true)).toBe("test-ws");
  });
});
