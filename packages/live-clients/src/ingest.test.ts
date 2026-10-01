import { describe, expect, it } from "vitest";
import {
  createGcsV4SignedUrlProvider,
  createConvertJobPreview,
  type ConvertJobArgs,
  type RestFetchLike,
  type GcsObjectsLike,
  type GcsSignedUrlStorageLike,
} from "./ingest.js";
import type { ConversionResult } from "@rhema/contracts";

// PRB.20 (D-PRB.02-1) — the live ingestion bindings, deterministic:
//  - the v4 presigner binds a content-length-range extension header and the workspace-scoped key,
//  - the convert-Job binding posts jobs:run with mounted-path container args, polls the Execution
//    (a Job-child resource the job-scoped IAM grant covers), and reads the converted/<ws>/<id>.json
//    object back — with an idempotent read-back-first path.

const RESULT: ConversionResult = {
  sourceFormat: "md",
  markdown: "# hi",
  counts: { words: 1, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
  warnings: [],
  unconverted: [],
  quality: "clean",
  qualityNotes: [],
};

function fakeObjects(seed: Record<string, string> = {}): GcsObjectsLike & { written: string[] } {
  const written: string[] = [];
  return {
    written,
    file: (name: string) => ({
      download: async (): Promise<readonly [Uint8Array]> => {
        if (!(name in seed)) {
          const e = new Error("No such object") as Error & { code: number };
          e.code = 404;
          throw e;
        }
        return [new TextEncoder().encode(seed[name]!)] as const;
      },
    }),
  };
}

function fakeFetch(
  handler: (url: string, init: { method?: string; body?: string }) => { status: number; body: unknown },
): RestFetchLike & { calls: { url: string; method?: string; body?: string }[] } {
  const calls: { url: string; method?: string; body?: string }[] = [];
  const f = (async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method, body: init?.body });
    const r = handler(url, init ?? {});
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  }) as RestFetchLike & { calls: typeof calls };
  f.calls = calls;
  return f;
}

const JOB = "projects/rhema/locations/us-central1/jobs/rhema-dev-convert";
const KEY = "quarantine/ws1/u1";

function baseArgs(over: Partial<ConvertJobArgs>): ConvertJobArgs {
  return {
    job: JOB,
    bucket: "rhema-dev-user-content",
    objects: fakeObjects(),
    tokenFor: async () => "tok",
    sleep: async () => undefined,
    ...over,
  };
}

describe("createGcsV4SignedUrlProvider", () => {
  it("signs a v4 PUT with the content-length-range bound into the signature + required headers", async () => {
    let seen: { key: string; cfg: Record<string, unknown> } | null = null;
    const storage: GcsSignedUrlStorageLike = {
      bucket: (name) => ({
        file: (key) => ({
          getSignedUrl: async (cfg) => {
            seen = { key, cfg: cfg as Record<string, unknown> };
            return [`https://storage.googleapis.com/${name}/${key}?X-Goog-Signature=abc`];
          },
        }),
      }),
    };
    const provider = createGcsV4SignedUrlProvider(storage, () => 1_000);
    const out = await provider.signedPut({ bucket: "b", key: KEY, maxBytes: 42, expiresSeconds: 300 });
    expect(seen!.key).toBe(KEY);
    expect(seen!.cfg).toMatchObject({
      version: "v4",
      action: "write",
      expires: 1_000 + 300_000,
      extensionHeaders: { "x-goog-content-length-range": "0,42" },
    });
    expect(out.url).toContain("X-Goog-Signature");
    // the client MUST echo the signed range header — the api hands it to the browser verbatim.
    expect(out.requiredHeaders).toEqual({ "x-goog-content-length-range": "0,42" });
  });
});

describe("createConvertJobPreview", () => {
  const EXEC = `${JOB}/executions/ex1`;

  it("runs the job with mounted-path container args, polls the Execution, and reads the converted object", async () => {
    const seed: Record<string, string> = {};
    const objects = fakeObjects(seed);
    let polled = 0;
    const f = fakeFetch((url) => {
      if (url.endsWith(":run")) {
        // jobs:run returns an Operation whose metadata.name is the EXECUTION resource (child of the
        // job — covered by the Job-scoped IAM grant; the operations/ resource is not).
        return { status: 200, body: { name: "projects/rhema/locations/us-central1/operations/op1", metadata: { name: EXEC } } };
      }
      // poll: first in-flight — the Completed condition exists from creation with status "Unknown"
      // ("Waiting for execution to start"); only True/False is terminal (surfaced live 2026-09-22).
      polled += 1;
      if (polled === 1) {
        return {
          status: 200,
          body: { name: EXEC, conditions: [{ type: "Completed", status: "Unknown", message: "Waiting for execution to start." }] },
        };
      }
      seed["converted/ws1/u1.json"] = JSON.stringify(RESULT);
      return { status: 200, body: { name: EXEC, completionTime: "t", succeededCount: 1, conditions: [{ type: "Completed", status: "True" }] } };
    });
    const conv = createConvertJobPreview(baseArgs({ objects, fetchImpl: f, mountPath: "/usercontent" }));
    const result = await conv.preview(KEY);
    expect(result).toEqual(RESULT);

    const run = f.calls.find((c) => c.url.endsWith(":run"))!;
    expect(run.method).toBe("POST");
    expect(JSON.parse(run.body!)).toEqual({
      overrides: {
        taskCount: 1,
        containerOverrides: [
          { args: [`/usercontent/${KEY}`, "/usercontent/converted/ws1/u1.json"] },
        ],
      },
    });
    // the execution polls carry the bearer token — never to GCS, only to run.googleapis.com.
    expect(f.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("read-back-first: an existing converted object skips the Job run entirely", async () => {
    const objects = fakeObjects({ "converted/ws1/u1.json": JSON.stringify(RESULT) });
    const f = fakeFetch(() => ({ status: 500, body: {} }));
    const conv = createConvertJobPreview(baseArgs({ objects, fetchImpl: f }));
    expect(await conv.preview(KEY)).toEqual(RESULT);
    expect(f.calls).toHaveLength(0); // no run call at all
  });

  it("rejects a malformed quarantine key before touching the job", async () => {
    const f = fakeFetch(() => ({ status: 500, body: {} }));
    const conv = createConvertJobPreview(baseArgs({ fetchImpl: f }));
    await expect(conv.preview("converted/ws1/x")).rejects.toThrow("invalid_quarantine_key");
    await expect(conv.preview("quarantine/../x")).rejects.toThrow("invalid_quarantine_key");
    expect(f.calls).toHaveLength(0);
  });

  it("surfaces a failed execution", async () => {
    const f = fakeFetch((url) =>
      url.endsWith(":run")
        ? { status: 200, body: { name: "op2", metadata: { name: EXEC } } }
        : {
            status: 200,
            body: {
              name: EXEC,
              failedCount: 1,
              conditions: [{ type: "Completed", status: "False", reason: "task_failed", message: "task failed" }],
            },
          },
    );
    const conv = createConvertJobPreview(baseArgs({ fetchImpl: f }));
    await expect(conv.preview(KEY)).rejects.toThrow("convert job failed: task failed");
  });

  it("times out when the execution never completes", async () => {
    const f = fakeFetch((url) =>
      url.endsWith(":run")
        ? { status: 200, body: { name: "op3", metadata: { name: EXEC } } }
        : { status: 200, body: { name: EXEC, conditions: [] } },
    );
    const conv = createConvertJobPreview(
      baseArgs({
        fetchImpl: f,
        timeoutMs: 1,
        // real 2ms sleep — guarantees the deadline check trips on the second iteration.
        sleep: () => new Promise((r) => setTimeout(r, 2)),
      }),
    );
    await expect(conv.preview(KEY)).rejects.toThrow("convert job timed out");
  });

  it("fails loud when the job completes but no converted object appears", async () => {
    const f = fakeFetch((url) =>
      url.endsWith(":run")
        ? { status: 200, body: { name: "op4", metadata: { name: EXEC } } }
        : { status: 200, body: { name: EXEC, completionTime: "t", conditions: [{ type: "Completed", status: "True" }] } },
    );
    const conv = createConvertJobPreview(baseArgs({ fetchImpl: f }));
    await expect(conv.preview(KEY)).rejects.toThrow("convert_output_missing");
  });
});
