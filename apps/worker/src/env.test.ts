import { afterEach, describe, expect, it } from "vitest";
import { readWorkerEnv } from "./env.js";

// R7COPY.0 (ADR-130) — the walkthrough generator's env read is gone; the ingest reconstructor's key
// must resolve identically on every deployed stage: `INGEST_MODEL_KEY_SECRET` first, the retired
// `WALKTHROUGH_MODEL_KEY_SECRET` name only as the legacy alias it always was.
const KEYS = ["INGEST_MODEL_KEY_SECRET", "WALKTHROUGH_MODEL_KEY_SECRET"] as const;
const REQUIRED = {
  DATABASE_URL: "postgres://x",
  REDIS_URL: "redis://x",
  RUN_TOKEN_PRIVATE_KEY_SECRET: "sm://priv",
  RUN_TOKEN_PUBLIC_KEY_SECRET: "sm://pub",
  RUN_TASK_IMAGE_DIGEST: "sha256:x",
  RUN_TASK_IMAGE_REPO: "repo",
  RUN_SERVICE_ACCOUNT: "sa",
  OBJECTS_BUCKET: "bucket",
  SANDBOX_NODE_POOL: "pool",
  KUBE_SERVICE_ACCOUNT: "ksa",
  API_INTERNAL_URL: "http://api",
  ANTHROPIC_BASE_URL: "http://proxy",
  SYSTEM_DATABASE_URL: "postgres://sys",
} as const;
const saved: Record<string, string | undefined> = {};
afterEach(() => {
  for (const k of [...KEYS, ...Object.keys(REQUIRED)]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
    saved[k] = undefined;
  }
});
const setEnv = (env: Partial<Record<(typeof KEYS)[number], string | undefined>>) => {
  for (const k of [...KEYS, ...Object.keys(REQUIRED)]) {
    if (!(k in saved)) saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, REQUIRED, env);
};

describe("readWorkerEnv — the ingest key after the walkthrough retirement (R7COPY.0)", () => {
  it("resolves INGEST_MODEL_KEY_SECRET with no walkthrough var bound", () => {
    setEnv({ INGEST_MODEL_KEY_SECRET: "sm://ingest" });
    const env = readWorkerEnv();
    expect(env.ingestModelKeySecret).toBe("sm://ingest");
    // the walkthrough's own env slot no longer exists on the shape
    expect("walkthroughModelKeySecret" in env).toBe(false);
  });

  it("the retired WALKTHROUGH_MODEL_KEY_SECRET still resolves as the legacy ingest alias", () => {
    setEnv({ WALKTHROUGH_MODEL_KEY_SECRET: "sm://anthropic" });
    expect(readWorkerEnv().ingestModelKeySecret).toBe("sm://anthropic");
  });

  it("prefers INGEST_MODEL_KEY_SECRET when both names are bound (same invariant as before)", () => {
    setEnv({ INGEST_MODEL_KEY_SECRET: "sm://ingest", WALKTHROUGH_MODEL_KEY_SECRET: "sm://legacy" });
    expect(readWorkerEnv().ingestModelKeySecret).toBe("sm://ingest");
  });

  it("neither name ⇒ the reconstructor's seam stays unconfigured (fails closed by name)", () => {
    setEnv({});
    expect(readWorkerEnv().ingestModelKeySecret).toBeUndefined();
  });
});
