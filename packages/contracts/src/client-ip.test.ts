import { describe, it, expect, vi } from "vitest";
import {
  forwardedClientIp,
  resolveClientIp,
  INTERNAL_CLIENT_IP_HEADER,
  INTERNAL_IDENTITY_HEADER,
} from "./client-ip.js";

// SEC.2 (ADR-040) — the client-IP derivation the throttles key on: the penultimate (LB-appended) XFF
// hop, never the caller-controlled first hop; the stamped `x-rhema-client-ip` only when the internal
// OIDC token verifies.

const headers = (init: Record<string, string>) => new Headers(init);

describe("forwardedClientIp — the penultimate (LB-appended) hop", () => {
  it("takes the second-to-last hop: the caller's first-hop claim is untrusted", () => {
    // GCP LB appends <real client>, <lb> — everything before is caller-controlled.
    expect(forwardedClientIp("1.2.3.4, 203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
    expect(forwardedClientIp("forged, 203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
  });
  it("a single hop is used as-is; absent ⇒ the shared unknown bucket", () => {
    expect(forwardedClientIp("203.0.113.9")).toBe("203.0.113.9");
    expect(forwardedClientIp("  ")).toBe("unknown");
    expect(forwardedClientIp(undefined)).toBe("unknown");
  });
});

describe("resolveClientIp — the trusted stamped channel", () => {
  it("ignores the stamped IP without a verified token (a forged header is just another claim)", async () => {
    const verify = vi.fn(async () => false);
    const ip = await resolveClientIp(
      headers({
        "x-forwarded-for": "9.9.9.9, 8.8.8.8",
        [INTERNAL_CLIENT_IP_HEADER]: "1.1.1.1",
        [INTERNAL_IDENTITY_HEADER]: "forged-jwt",
      }),
      verify,
    );
    expect(verify).toHaveBeenCalledWith("forged-jwt");
    expect(ip).toBe("9.9.9.9"); // fell back to the penultimate hop
  });

  it("honors the stamped IP when the token verifies (the web-mediated hop)", async () => {
    const verify = vi.fn(async (t) => t === "good-token");
    const ip = await resolveClientIp(
      headers({
        "x-forwarded-for": "203.0.113.9, 10.4.4.4, 10.0.0.1",
        [INTERNAL_CLIENT_IP_HEADER]: "203.0.113.9",
        [INTERNAL_IDENTITY_HEADER]: "good-token",
      }),
      verify,
    );
    expect(ip).toBe("203.0.113.9");
  });

  it("no token ⇒ the stamped IP is never read; a verifier throw degrades to the XFF rule", async () => {
    expect(
      await resolveClientIp(
        headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8", [INTERNAL_CLIENT_IP_HEADER]: "1.1.1.1" }),
        async () => true,
      ),
    ).toBe("9.9.9.9");
    expect(
      await resolveClientIp(
        headers({
          "x-forwarded-for": "9.9.9.9, 8.8.8.8",
          [INTERNAL_CLIENT_IP_HEADER]: "1.1.1.1",
          [INTERNAL_IDENTITY_HEADER]: "t",
        }),
        async () => {
          throw new Error("jwks unreachable");
        },
      ),
    ).toBe("9.9.9.9");
  });
});
