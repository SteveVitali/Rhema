import { describe, expect, it } from "vitest";
import { retryPolicyFor, subtypeToErrorClass } from "./error-class.js";

describe("retry classes (§12.4; REQ-RUN-16)", () => {
  it("maps SDK result subtypes to error classes (success/aborted → null)", () => {
    expect(subtypeToErrorClass("success")).toBeNull();
    expect(subtypeToErrorClass("aborted")).toBeNull();
    expect(subtypeToErrorClass("budget")).toBe("budget");
    expect(subtypeToErrorClass("refusal")).toBe("refusal");
    expect(subtypeToErrorClass("error_max_turns")).toBe("artifact_missing");
    expect(subtypeToErrorClass("error_during_execution")).toBe("infra");
  });

  it("infra retries ≤2 with backoff, then failed", () => {
    const p = retryPolicyFor("infra");
    expect(p.maxRetries).toBe(2);
    expect(p.backoff).toBe(true);
    expect(p.onExhaust).toBe("failed");
  });

  it("provider_transient lets the engine retry first, then ≤2, then failed", () => {
    const p = retryPolicyFor("provider_transient");
    expect(p.engineRetryFirst).toBe(true);
    expect(p.maxRetries).toBe(2);
  });

  it("budget borrows once then opens resume_partial", () => {
    const p = retryPolicyFor("budget");
    expect(p.maxRetries).toBe(1);
    expect(p.onExhaust).toBe("resume_partial");
  });

  it("artifact_missing → one GUIDED retry then failed-with-partials", () => {
    const p = retryPolicyFor("artifact_missing");
    expect(p.maxRetries).toBe(1);
    expect(p.guided).toBe(true);
    expect(p.onExhaust).toBe("failed_with_partials");
  });

  it("refusal opens a refusal gate; boundary is not a failure; stale_task exits", () => {
    expect(retryPolicyFor("refusal").onExhaust).toBe("refusal_gate");
    expect(retryPolicyFor("boundary").isFailure).toBe(false);
    expect(retryPolicyFor("boundary").onExhaust).toBe("quarantine");
    expect(retryPolicyFor("stale_task").onExhaust).toBe("exit");
  });
});
