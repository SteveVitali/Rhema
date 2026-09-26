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
});
