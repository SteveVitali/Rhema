import { describe, it, expect } from "vitest";
import { createApiClient, ApiError, type ProjectRow } from "./index.js";

// The client shapes requests + parses responses against an injected fetch (no network).

function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as unknown as typeof fetch;
}

const row: ProjectRow = {
  id: "proj_pv",
  slug: "the-politics-of-visibility",
  title: "The Politics of Visibility",
  state: { key: "edited_by_you", pill: "Edited by you", overlay: null, suggested: { action: "revise_using_edits", label: "Revise using your edits" } },
};

describe("createApiClient", () => {
  it("listProjects GETs /projects, forwards headers, and unwraps { projects }", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const client = createApiClient({
      baseUrl: "http://api.local/",
      headers: { cookie: "s=1" },
      fetch: fakeFetch((url, init) => {
        seen = { url, init };
        return new Response(JSON.stringify({ projects: [row] }), { status: 200 });
      }),
    });
    const projects = await client.listProjects({ headers: { "x-req": "1" } });
    expect(projects).toEqual([row]);
    expect(seen!.url).toBe("http://api.local/projects");
    expect(seen!.init.method).toBe("GET");
    expect((seen!.init.headers as Record<string, string>).cookie).toBe("s=1");
    expect((seen!.init.headers as Record<string, string>)["x-req"]).toBe("1");
  });

  it("checkInvite POSTs the code and returns the check", async () => {
    const client = createApiClient({
      baseUrl: "http://api.local",
      fetch: fakeFetch(
        (_url, init) => {
          expect(JSON.parse(String(init.body))).toEqual({ code: "BETA-1", email: "a@b.com" });
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      ),
    });
    expect(await client.checkInvite("BETA-1", "a@b.com")).toEqual({ ok: true });
  });

  it("throws ApiError on a non-2xx", async () => {
    const client = createApiClient({
      baseUrl: "http://api.local",
      fetch: fakeFetch(() => new Response("nope", { status: 401 })),
    });
    await expect(client.listProjects()).rejects.toBeInstanceOf(ApiError);
  });

  it("estimate POSTs /projects/:id/estimates (the stateless service — REQ-SPEC-16)", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const client = createApiClient({
      baseUrl: "http://api.local",
      headers: { cookie: "s=1" },
      fetch: fakeFetch((url, init) => {
        seen = { url, init };
        return new Response(JSON.stringify({ estimateCredits: 560, capCredits: 840, rateTableVersion: 1, provisional: true, levers: {} }), { status: 200 });
      }),
    });
    const est = await client.estimate("proj_pv", { workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 5180 } });
    expect(est.estimateCredits).toBe(560);
    expect(seen!.url).toBe("http://api.local/projects/proj_pv/estimates");
    expect(seen!.init.method).toBe("POST");
    expect((seen!.init.headers as Record<string, string>).cookie).toBe("s=1");
  });

  it("signup POSTs /signup and returns the created flag (PRB.13)", async () => {
    const client = createApiClient({
      baseUrl: "http://api.local",
      fetch: fakeFetch((url, init) => {
        expect(url).toBe("http://api.local/signup");
        expect(JSON.parse(String(init.body))).toEqual({ email: "a@b.com", code: "BETA-1", method: "magic_link" });
        return new Response(JSON.stringify({ ok: true, created: true }), { status: 201 });
      }),
    });
    expect(await client.signup({ email: "a@b.com", code: "BETA-1", method: "magic_link" })).toEqual({
      ok: true,
      created: true,
    });
  });

  it("signup surfaces an expected refusal as {ok:false,error} — the api's {error} code is data", async () => {
    const client = createApiClient({
      baseUrl: "http://api.local",
      fetch: fakeFetch(() => new Response(JSON.stringify({ error: "invite_required" }), { status: 403 })),
    });
    expect(await client.signup({ email: "a@b.com" })).toEqual({
      ok: false,
      status: 403,
      error: "invite_required",
    });
  });

  it("ApiError carries the api's {error} code so callers can branch on a 403's reason", async () => {
    const client = createApiClient({
      baseUrl: "http://api.local",
      fetch: fakeFetch(() => new Response(JSON.stringify({ error: "email_unverified" }), { status: 403 })),
    });
    const err = await client.listProjects().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("email_unverified");
  });

  it("createRun POSTs /projects/:id/runs with the client-minted idempotency key (REQ-CHAT-25)", async () => {
    let body: string | null = null;
    const client = createApiClient({
      baseUrl: "http://api.local",
      fetch: fakeFetch((_url, init) => {
        body = init.body as string;
        return new Response(JSON.stringify({ runId: "run_1", state: "queued", deduped: false }), { status: 201 });
      }),
    });
    const res = await client.createRun("proj_pv", {
      idempotencyKey: "idem_1",
      workflow: "review",
      modelProfile: { tier: "balanced" },
      modelTier: "balanced",
      rigor: "standard",
      estimateCredits: 560,
      capCredits: 840,
      rateTableVersion: 1,
    });
    expect(res.runId).toBe("run_1");
    expect(JSON.parse(body!).idempotencyKey).toBe("idem_1");
  });
});
