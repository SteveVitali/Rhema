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

describe("readApiEnv — PRB.13 signup.mode (REQ-BETA-19 amended 2026-09-16)", () => {
  it("SIGNUP_MODE unset or unknown ⇒ invite (the flag fails closed); only 'open' opens", () => {
    expect(readApiEnv().signupMode).toBe("invite");
    for (const bad of ["OPEN", "public", "1"]) {
      process.env.SIGNUP_MODE = bad;
      expect(readApiEnv().signupMode, `for ${JSON.stringify(bad)}`).toBe("invite");
    }
    process.env.SIGNUP_MODE = "open";
    expect(readApiEnv().signupMode).toBe("open");
  });
});

describe("readApiEnv — BILL.3 purchase + Stripe request switches", () => {
  it("PURCHASE_MODE unset or unknown ⇒ closed; only the literal 'open' re-opens", () => {
    expect(readApiEnv().purchaseMode).toBe("closed");
    for (const bad of ["OPEN", "true", "1"]) {
      process.env.PURCHASE_MODE = bad;
      expect(readApiEnv().purchaseMode, `for ${JSON.stringify(bad)}`).toBe("closed");
    }
    process.env.PURCHASE_MODE = "open";
    expect(readApiEnv().purchaseMode).toBe("open");
  });

  it("STRIPE_AUTOMATIC_TAX only opts in at the literal 'true' (default off)", () => {
    expect(readApiEnv().stripeAutomaticTax).toBeUndefined();
    for (const bad of ["1", "TRUE", "yes"]) {
      process.env.STRIPE_AUTOMATIC_TAX = bad;
      expect(readApiEnv().stripeAutomaticTax, `for ${JSON.stringify(bad)}`).toBeUndefined();
    }
    process.env.STRIPE_AUTOMATIC_TAX = "true";
    expect(readApiEnv().stripeAutomaticTax).toBe(true);
  });
});

describe("readApiEnv — PRB.16 auth binding (D-P0.01-3)", () => {
  it("the auth secret names + client id are optional and pass through verbatim", () => {
    const env = readApiEnv();
    expect(env.betterAuthSecretName).toBeUndefined();
    expect(env.googleOauthClientId).toBeUndefined();
    expect(env.googleOauthClientSecretName).toBeUndefined();
    process.env.BETTER_AUTH_SECRET_NAME = "projects/p/secrets/bas/versions/latest";
    process.env.GOOGLE_OAUTH_CLIENT_ID = "id.apps.googleusercontent.com";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET_NAME = "projects/p/secrets/gos/versions/latest";
    const env2 = readApiEnv();
    expect(env2.betterAuthSecretName).toBe("projects/p/secrets/bas/versions/latest");
    expect(env2.googleOauthClientId).toBe("id.apps.googleusercontent.com");
    expect(env2.googleOauthClientSecretName).toBe("projects/p/secrets/gos/versions/latest");
  });

  it("IDENTITY_HEADERS only turns on at the literal 'true' (the forgeable-header shim; never prod)", () => {
    expect(readApiEnv().identityHeaders).toBeUndefined();
    for (const bad of ["1", "TRUE", "yes"]) {
      process.env.IDENTITY_HEADERS = bad;
      expect(readApiEnv().identityHeaders, `for ${JSON.stringify(bad)}`).toBeUndefined();
    }
    process.env.IDENTITY_HEADERS = "true";
    expect(readApiEnv().identityHeaders).toBe(true);
  });
});

describe("readApiEnv — ECON.2/R5ECON.2 COGS lever envs", () => {
  it("COGS_LEVERS parses a JSON lever set; malformed/empty ⇒ undefined (all-off default)", () => {
    expect(readApiEnv().cogsLevers).toBeUndefined();
    process.env.COGS_LEVERS = '{"l1PerPhaseWindow":true,"l3PhaseRouting":true,"junk":1}';
    const env = readApiEnv();
    expect(env.cogsLevers).toMatchObject({ l1PerPhaseWindow: true, l3PhaseRouting: true });
    process.env.COGS_LEVERS = "not json";
    expect(readApiEnv().cogsLevers).toBeUndefined();
  });

  it("R5ECON.2 — COGS_LEVERS_TEST parses the is_test overlay; unknown-only/malformed ⇒ undefined", () => {
    process.env.COGS_LEVERS_TEST = '{"testCheapRoute":true}';
    // the overlay keeps ONLY the named keys — never a full set that would strip the main env's arms.
    expect(readApiEnv().cogsLeversTest).toEqual({ testCheapRoute: true });
    for (const bad of ["", "  ", "not json", "{}", '{"bogus":true}', "[true]"]) {
      process.env.COGS_LEVERS_TEST = bad;
      expect(readApiEnv().cogsLeversTest, `for ${JSON.stringify(bad)}`).toBeUndefined();
    }
  });
});
