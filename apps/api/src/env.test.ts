// Residue 2 (P0.15h): the harness run-spec sizing knobs are deploy-configurable via the api env. `maxUsdPerRun`
// sizes the per-phase SDK budget brake (`budgetShare × this`); the outer capCredits hold stays the hard ceiling.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readApiEnv } from "./env.js";

const REQUIRED = {
  DATABASE_URL: "postgresql://localhost/db",
  REDIS_URL: "redis://localhost:6379",
  OBJECTS_BUCKET: "rhema-objects",
  RUN_TOKEN_PRIVATE_KEY_SECRET: "projects/p/secrets/priv/versions/1",
  RUN_TOKEN_PUBLIC_KEY_SECRET: "projects/p/secrets/pub/versions/1",
};

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = process.env;
  // a clean slate with only the required vars; each test layers the knobs it exercises.
  process.env = { ...REQUIRED } as NodeJS.ProcessEnv;
});
afterEach(() => {
  process.env = saved;
});

describe("readApiEnv — harness run-spec sizing (residue 2)", () => {
  it("defaults: maxUsdPerRun + skillsDir unset (⇒ the runspec falls back to $10 / /app/skills)", () => {
    const env = readApiEnv();
    expect(env.maxUsdPerRun).toBeUndefined();
    expect(env.skillsDir).toBeUndefined();
  });

  it("MAX_USD_PER_RUN parses to maxUsdPerRun; SKILLS_DIR to skillsDir", () => {
    process.env.MAX_USD_PER_RUN = "40";
    process.env.SKILLS_DIR = "/app/skills";
    const env = readApiEnv();
    expect(env.maxUsdPerRun).toBe(40);
    expect(env.skillsDir).toBe("/app/skills");
  });

  it("a non-numeric or non-positive MAX_USD_PER_RUN is ignored (never becomes NaN / ≤0)", () => {
    for (const bad of ["", "abc", "0", "-5"]) {
      process.env.MAX_USD_PER_RUN = bad;
      expect(readApiEnv().maxUsdPerRun, `for ${JSON.stringify(bad)}`).toBeUndefined();
    }
  });

  it("still fails fast on a missing required var (a half-configured api must not start)", () => {
    delete process.env.DATABASE_URL;
    expect(() => readApiEnv()).toThrow(/DATABASE_URL/);
  });
});
