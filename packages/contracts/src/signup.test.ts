import { describe, it, expect } from "vitest";
import { parseSignupMode, SIGNUP_MODES } from "./signup.js";
import { createIpEmailThrottle } from "./rate-limit.js";

// PRB.13 — REQ-BETA-19 (amended 2026-09-16): the signup mode flag + the beta-grade throttle.

describe("parseSignupMode", () => {
  it("recognizes both modes and fails CLOSED on anything else", () => {
    expect(SIGNUP_MODES).toEqual(["invite", "open"]);
    expect(parseSignupMode("open")).toBe("open");
    expect(parseSignupMode("invite")).toBe("invite");
    // an absent value or a deploy typo can never silently open signup.
    for (const bad of [undefined, null, "", "OPEN", "public", "0", "yes"]) {
      expect(parseSignupMode(bad)).toBe("invite");
    }
  });
});

describe("createIpEmailThrottle (per-IP + per-email fixed windows)", () => {
  it("allows up to perIp then blocks the NEXT attempt from that IP with a retryAfter", () => {
    let t = 1_000_000;
    const th = createIpEmailThrottle({ perIp: 2, perEmail: 10, windowMs: 60_000, now: () => t });
    expect(th.attempt("1.1.1.1").allowed).toBe(true);
    expect(th.attempt("1.1.1.1").allowed).toBe(true);
    const blocked = th.attempt("1.1.1.1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    // a different IP is unaffected.
    expect(th.attempt("2.2.2.2").allowed).toBe(true);
    // the window resets on schedule, not on last hit.
    t += 61_000;
    expect(th.attempt("1.1.1.1").allowed).toBe(true);
  });

  it("blocks per email independently of the IP (same email, fresh IPs)", () => {
    const th = createIpEmailThrottle({ perIp: 100, perEmail: 2, windowMs: 60_000 });
    expect(th.attempt("1.1.1.1", "a@b.com").allowed).toBe(true);
    expect(th.attempt("2.2.2.2", "a@b.com").allowed).toBe(true);
    expect(th.attempt("3.3.3.3", "a@b.com").allowed).toBe(false); // email dimension over
    expect(th.attempt("3.3.3.3", "c@d.com").allowed).toBe(true); // different email fine
  });

  it("normalizes email case and treats a missing email as ip-only", () => {
    const th = createIpEmailThrottle({ perIp: 100, perEmail: 1, windowMs: 60_000 });
    expect(th.attempt("1.1.1.1", "A@B.com").allowed).toBe(true);
    expect(th.attempt("9.9.9.9", "a@b.com").allowed).toBe(false); // case-insensitive key
    expect(th.attempt("9.9.9.9").allowed).toBe(true); // no email ⇒ ip dimension only
  });

  it("returns the email verdict's retryAfter when the email dimension blocks", () => {
    let t = 0;
    const th = createIpEmailThrottle({ perIp: 100, perEmail: 1, windowMs: 90_000, now: () => t });
    th.attempt("1.1.1.1", "x@y.com");
    t = 30_000;
    const v = th.attempt("2.2.2.2", "x@y.com");
    expect(v).toEqual({ allowed: false, retryAfterSec: 60 });
  });
});
