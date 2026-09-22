import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { FixedClock } from "./clock.js";
import { Rs256RunTokenService, HmacRunTokenService, RUN_TOKEN_TTL_MS, type RunTokenClaims } from "./token.js";

const CLAIMS: Omit<RunTokenClaims, "iat" | "exp"> = {
  runId: "run_1",
  attempt: 2,
  workspaceId: "ws_1",
  projectId: "proj_1",
  seat: "editor",
};

function keypair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

describe("Rs256RunTokenService (D-P0.08-1 — the live JWT signer)", () => {
  it("mints with the private key and verifies with the public key (round-trip)", () => {
    const { privateKey, publicKey } = keypair();
    const clock = new FixedClock(new Date("2026-09-03T00:00:00Z"));
    const api = new Rs256RunTokenService({ privateKey, publicKey, keyId: "k1" }, clock);
    const token = api.mint(CLAIMS);
    // A standard 3-part JWT with an RS256 header.
    expect(token.split(".")).toHaveLength(3);
    const header = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8"));
    expect(header).toMatchObject({ alg: "RS256", typ: "JWT", kid: "k1" });

    const verified = api.verify(token);
    expect(verified).toMatchObject({ ...CLAIMS, iat: clock.now().getTime(), exp: clock.now().getTime() + RUN_TOKEN_TTL_MS });
  });

  it("a verify-only holder (the proxy: public key only) verifies but cannot mint", () => {
    const { privateKey, publicKey } = keypair();
    const clock = new FixedClock(new Date("2026-09-03T00:00:00Z"));
    const api = new Rs256RunTokenService({ privateKey, publicKey }, clock);
    const proxy = new Rs256RunTokenService({ publicKey }, clock); // no private key
    const token = api.mint(CLAIMS);
    expect(proxy.verify(token)).toMatchObject({ runId: "run_1", attempt: 2 });
    expect(() => proxy.mint(CLAIMS)).toThrow(/cannot mint without a private key/);
  });

  it("rejects a token signed by a DIFFERENT key (the proxy cannot be fooled)", () => {
    const clock = new FixedClock(new Date("2026-09-03T00:00:00Z"));
    const a = keypair();
    const b = keypair();
    const forger = new Rs256RunTokenService({ privateKey: b.privateKey, publicKey: b.publicKey }, clock);
    const proxy = new Rs256RunTokenService({ publicKey: a.publicKey }, clock); // trusts key A only
    expect(proxy.verify(forger.mint(CLAIMS))).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const { privateKey, publicKey } = keypair();
    const clock = new FixedClock(new Date("2026-09-03T00:00:00Z"));
    const svc = new Rs256RunTokenService({ privateKey, publicKey }, clock);
    const [h, , s] = svc.mint(CLAIMS).split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ ...CLAIMS, attempt: 999, iat: 0, exp: Date.now() + 1e9 })).toString("base64url");
    expect(svc.verify(`${h}.${forgedPayload}.${s}`)).toBeNull();
  });

  it("rejects an expired token and a non-RS256/none-alg header", () => {
    const { privateKey, publicKey } = keypair();
    const clock = new FixedClock(new Date("2026-09-03T00:00:00Z"));
    const svc = new Rs256RunTokenService({ privateKey, publicKey }, clock);
    const token = svc.mint(CLAIMS, 1000); // 1s ttl
    clock.advance(2000);
    expect(svc.verify(token)).toBeNull();

    // An alg-confusion attempt: swap the header to alg:none — rejected before any signature check.
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const parts = svc.mint(CLAIMS).split(".");
    expect(svc.verify(`${noneHeader}.${parts[1]}.${parts[2]}`)).toBeNull();
  });

  it("returns null for malformed tokens", () => {
    const { publicKey } = keypair();
    const svc = new Rs256RunTokenService({ publicKey }, new FixedClock(new Date()));
    expect(svc.verify("")).toBeNull();
    expect(svc.verify("a.b")).toBeNull();
    expect(svc.verify("not-base64.@@@.$$$")).toBeNull();
  });

  it("is a drop-in for the HMAC seam: same claims shape", () => {
    const clock = new FixedClock(new Date("2026-09-03T00:00:00Z"));
    const { privateKey, publicKey } = keypair();
    const rs = new Rs256RunTokenService({ privateKey, publicKey }, clock).verify(
      new Rs256RunTokenService({ privateKey, publicKey }, clock).mint(CLAIMS),
    );
    const hmac = new HmacRunTokenService("secret", clock).verify(new HmacRunTokenService("secret", clock).mint(CLAIMS));
    expect(Object.keys(rs!).sort()).toEqual(Object.keys(hmac!).sort());
  });
});
