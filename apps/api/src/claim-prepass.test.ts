// DEF.2 (F6) — `createProxyClaimPrePass` deterministic unit tests: the mint → proxied call → revoke
// lifecycle is asserted against a recording SqlExecutor + a fetch double — no network, no PGlite.
// The contract under test (REQ-ARCH-30): the api NEVER presents a provider key; the ONLY credential
// on the wire is `x-rhema-proxy-credential`, scoped to `/v1/messages` + the Haiku bare id, and the
// synthetic `est_<id>` run context meters the ~5-credit COGS without touching the ledger.

import { describe, it, expect } from "vitest";
import { InMemoryContentStore, sha256Hex } from "@rhema/mirror";
import { sequentialIds } from "@rhema/orchestrator";
import {
  createProxyClaimPrePass,
  CLAIM_PREPASS_MODEL,
  CLAIM_PREPASS_ROLE,
  type ClaimPrePassDeps,
} from "./claim-prepass.js";
import type { SqlExecutor } from "./estimate-cache.js";
import type { ClaimPrePass } from "./estimate-routes.js";

class RecordingExec implements SqlExecutor {
  readonly calls: { sql: string; params: readonly unknown[] | undefined }[] = [];
  async query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }> {
    this.calls.push({ sql, params });
    return { rows: [] };
  }
  inserts(table: string) {
    return this.calls.filter((c) => c.sql.includes(`insert into ${table}`));
  }
}

interface SeenRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: unknown;
}

function anthropicResponse(text: string): Response {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makeDeps(over: Partial<ClaimPrePassDeps> = {}): {
  deps: ClaimPrePassDeps;
  exec: RecordingExec;
  store: InMemoryContentStore;
  seen: SeenRequest[];
} {
  const exec = new RecordingExec();
  const store = new InMemoryContentStore();
  const seen: SeenRequest[] = [];
  const fetchDouble: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return anthropicResponse("21");
  }) as typeof fetch;
  return {
    deps: {
      proxyBaseUrl: "http://proxy.internal:8443",
      db: exec,
      contentStore: store,
      ids: sequentialIds(),
      clock: { now: () => new Date("2026-10-01T12:00:00Z") },
      fetch: fetchDouble,
      ...over,
    },
    exec,
    store,
    seen,
  };
}

const ARGS: Parameters<ClaimPrePass["count"]>[0] = {
  projectId: "p1",
  workspaceId: "w1",
  billingAccountId: "b1",
  draftSha: sha256Hex("the revenue grew 40% in 2024; sales doubled"),
  workflow: "review",
  inputs: {},
};

async function seedDraft(store: InMemoryContentStore, sha: string, text: string): Promise<void> {
  await store.put("w1", sha, new TextEncoder().encode(text));
}

describe("createProxyClaimPrePass (F6; REQ-ARCH-30 via the egress proxy)", () => {
  it("mints a scoped credential, calls the proxy with it (never a provider key), parses the count, revokes", async () => {
    const { deps, exec, store, seen } = makeDeps();
    await seedDraft(store, ARGS.draftSha!, "the revenue grew 40% in 2024; sales doubled");
    const prePass = createProxyClaimPrePass(deps);

    const n = await prePass.count(ARGS);
    expect(n).toBe(21);

    // the mint: one allowlist + one credential, both bound to a synthetic est_<id> run id.
    const [allow] = exec.inserts("proxy_allowlists");
    const [cred] = exec.inserts("proxy_credentials");
    expect(allow).toBeTruthy();
    expect(cred).toBeTruthy();
    const pseudoRunId = String(cred!.params![1]);
    expect(pseudoRunId).toMatch(/^est_/);
    expect(allow!.params![1]).toBe(pseudoRunId);
    // the allowlist admits ONLY /v1/messages on the provider host + the Haiku bare id.
    expect(JSON.parse(String(allow!.params![3]))).toEqual([
      { host: "api.anthropic.com", pathPrefix: "/v1/messages" },
    ]);
    expect(allow!.params![4]).toEqual([CLAIM_PREPASS_MODEL]);
    // the context attributes the COGS row to the caller's tenant (real FKs) + marks it prepass.
    const context = JSON.parse(String(cred!.params![5])) as Record<string, unknown>;
    expect(context).toMatchObject({
      runId: pseudoRunId,
      role: CLAIM_PREPASS_ROLE,
      workspaceId: "w1",
      billingAccountId: "b1",
      projectId: "p1",
      provider: "anthropic",
      modelTier: "base",
    });

    // the wire call: the proxy URL, the credential header, NO provider key anywhere.
    expect(seen).toHaveLength(1);
    const req = seen[0]!;
    expect(req.url).toBe("http://proxy.internal:8443/v1/messages");
    expect(req.headers["x-rhema-proxy-credential"]).toBeTruthy();
    expect(req.headers["x-api-key"]).toBeUndefined();
    expect(req.headers["authorization"]).toBeUndefined();
    const body = req.body as { model: string; max_tokens: number; stream: boolean };
    expect(body.model).toBe(CLAIM_PREPASS_MODEL);
    expect(body.stream).toBe(false);

    // the revoke lands in a finally — even had the call failed.
    const revoke = exec.calls.find((c) => c.sql.includes("update proxy_credentials set revoked_at"));
    expect(revoke).toBeTruthy();
    expect(revoke!.params![1]).toBe(cred!.params![0]);
  });

  it("returns null without a draftSha (nothing content-addressed to count)", async () => {
    const { deps, exec, seen } = makeDeps();
    const n = await createProxyClaimPrePass(deps).count({ ...ARGS, draftSha: undefined });
    expect(n).toBeNull();
    expect(seen).toHaveLength(0);
    expect(exec.calls).toHaveLength(0);
  });

  it("returns null when the draft bytes are absent from the content store", async () => {
    const { deps, seen } = makeDeps();
    const n = await createProxyClaimPrePass(deps).count(ARGS); // sha seeded nowhere
    expect(n).toBeNull();
    expect(seen).toHaveLength(0);
  });

  it("returns null on a proxy refusal (403/402) — the route falls back to provisional", async () => {
    const { deps, store } = makeDeps({
      fetch: (async () => new Response("{}", { status: 403 })) as typeof fetch,
    });
    await seedDraft(store, ARGS.draftSha!, "text");
    const n = await createProxyClaimPrePass(deps).count(ARGS);
    expect(n).toBeNull();
  });

  it("returns null when the model answers with no integer", async () => {
    const { deps, store } = makeDeps({
      fetch: (async () => anthropicResponse("I cannot determine that")) as typeof fetch,
    });
    await seedDraft(store, ARGS.draftSha!, "text");
    const n = await createProxyClaimPrePass(deps).count(ARGS);
    expect(n).toBeNull();
  });

  it("still revokes the credential when the fetch throws", async () => {
    const { deps, exec, store } = makeDeps({
      fetch: (async () => {
        throw new Error("connection refused");
      }) as typeof fetch,
    });
    await seedDraft(store, ARGS.draftSha!, "text");
    const n = await createProxyClaimPrePass(deps).count(ARGS);
    expect(n).toBeNull();
    expect(exec.calls.some((c) => c.sql.includes("update proxy_credentials set revoked_at"))).toBe(true);
  });
});
