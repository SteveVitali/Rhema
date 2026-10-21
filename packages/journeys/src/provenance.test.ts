import { describe, expect, it } from "vitest";
import { fetchDeployedSha, provenanceMatch } from "./provenance.js";

const ok = (sha: string) =>
  new Response(JSON.stringify({ ok: true, service: "x", build: { gitSha: sha } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const gfe404 = () =>
  new Response("<html><title>Error 404</title></html>", { status: 404 });

describe("fetchDeployedSha", () => {
  it("reads /healthz verbatim on a host that serves it", async () => {
    const seen: string[] = [];
    const sha = await fetchDeployedSha("https://app.example", async (url) => {
      seen.push(String(url));
      return ok("abc123");
    });
    expect(sha).toBe("abc123");
    expect(seen).toEqual(["https://app.example/healthz"]);
  });

  it("VERIF.2 (F-OPS.1-10) — falls back to /healthz/ when the bare path is GFE-intercepted", async () => {
    const seen: string[] = [];
    const sha = await fetchDeployedSha("https://svc-abc-uc.a.run.app/", async (url) => {
      const u = String(url);
      seen.push(u);
      return u.endsWith("/healthz/") ? ok("def456") : gfe404();
    });
    expect(sha).toBe("def456");
    expect(seen).toEqual([
      "https://svc-abc-uc.a.run.app/healthz",
      "https://svc-abc-uc.a.run.app/healthz/",
    ]);
  });

  it("stays null when neither path reaches the app", async () => {
    expect(await fetchDeployedSha("https://x.example", async () => gfe404())).toBeNull();
    expect(
      await fetchDeployedSha("https://x.example", async () => {
        throw new Error("connrefused");
      }),
    ).toBeNull();
  });

  it("treats an unknown/empty gitSha as unproven", async () => {
    expect(await fetchDeployedSha("https://x.example", async () => ok("unknown"))).toBeNull();
    expect(await fetchDeployedSha("https://x.example", async () => ok(""))).toBeNull();
  });
});

describe("provenanceMatch", () => {
  it("prefix-matches either direction and fails closed on null/unknown", () => {
    expect(provenanceMatch("abcdef1234", { web: "abcdef1234ffff", api: "abcdef1234" })).toBe(true);
    expect(provenanceMatch("abcdef1234ffff", { web: "abcdef1234" })).toBe(true);
    expect(provenanceMatch("abc", { web: "abc", api: null })).toBe(false);
    expect(provenanceMatch("abc", { web: "abc", api: "unknown" })).toBe(false);
    expect(provenanceMatch("", { web: "abc" })).toBe(false);
  });
});
