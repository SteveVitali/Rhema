import { describe, it, expect } from "vitest";
import { evaluateLicense, evaluateAll, missingRequired } from "./license-policy.mjs";

const policy = {
  allowlist: { allow: ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"] },
  exceptions: {
    exceptions: {
      "@anthropic-ai/claude-agent-sdk": { license: "Commercial", rationale: "the harness" },
      pandoc: { license: "GPL-2.0-or-later", rationale: "separate process" },
    },
  },
};

describe("evaluateLicense", () => {
  it("passes permissive allowlisted licences", () => {
    expect(evaluateLicense("lodash", "MIT", policy).ok).toBe(true);
    expect(evaluateLicense("x", "Apache-2.0", policy).ok).toBe(true);
  });

  it("fails SSPL/BSL/AGPL that are not excepted (AC4)", () => {
    expect(evaluateLicense("mongo", "SSPL-1.0", policy).ok).toBe(false);
    expect(evaluateLicense("bsl-lib", "BUSL-1.1", policy).ok).toBe(false);
    expect(evaluateLicense("agpl-lib", "AGPL-3.0-only", policy).ok).toBe(false);
  });

  it("passes a disallowed licence when the package is in the exception list", () => {
    const v = evaluateLicense("@anthropic-ai/claude-agent-sdk", "Commercial", policy);
    expect(v.ok).toBe(true);
    expect(v.reason).toMatch(/exception/);
  });

  it("accepts an SPDX OR-expression if any branch is allowlisted", () => {
    expect(evaluateLicense("x", "(MIT OR SSPL-1.0)", policy).ok).toBe(true);
  });

  it("rejects a missing licence field", () => {
    expect(evaluateLicense("x", undefined, policy).ok).toBe(false);
  });
});

describe("evaluateAll", () => {
  it("collects every violation", () => {
    const { ok, violations } = evaluateAll(
      [
        { name: "a", license: "MIT" },
        { name: "b", license: "AGPL-3.0-only" },
        { name: "c", license: "SSPL-1.0" },
      ],
      policy,
    );
    expect(ok).toBe(false);
    expect(violations.map((v) => v.name)).toEqual(["b", "c"]);
  });
});

describe("missingRequired — the SPA.8 non-vacuity leg (REQ-SAFE-9)", () => {
  it("returns the required names absent from the enumeration", () => {
    expect(
      missingRequired([{ name: "react" }, { name: "vite" }], ["react", "@tanstack/react-router"]),
    ).toEqual(["@tanstack/react-router"]);
  });

  it("returns [] when the SPA dependency set is covered", () => {
    const spaSet = [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "vite",
      "@vitejs/plugin-react",
      "axe-core",
    ];
    expect(missingRequired(spaSet.map((name) => ({ name })), spaSet)).toEqual([]);
  });

  it("an empty enumeration misses everything — a vacuous gate cannot pass", () => {
    expect(missingRequired([], ["react"]).length).toBe(1);
  });
});
