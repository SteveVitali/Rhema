import { describe, it, expect } from "vitest";
import { isBlockedIp, assertPublicHost } from "./ssrf.js";

// AC1 (REQ-ARCH-22). The IP denylist is the load-bearing SSRF control. This is its truth table + the
// DNS-then-IP host check (every resolved address must be public — the DNS-rebinding defense).

describe("isBlockedIp — blocked ranges", () => {
  const blocked = [
    ["IMDS", "169.254.169.254"],
    ["ECS credentials", "169.254.170.2"],
    ["link-local", "169.254.0.1"],
    ["loopback v4", "127.0.0.1"],
    ["loopback v4 /8", "127.9.9.9"],
    ["RFC1918 10/8", "10.1.2.3"],
    ["RFC1918 172.16/12", "172.16.5.5"],
    ["RFC1918 172.31 edge", "172.31.255.255"],
    ["RFC1918 192.168/16", "192.168.1.1"],
    ["CGNAT 100.64/10", "100.64.0.1"],
    ["unspecified", "0.0.0.0"],
    ["broadcast", "255.255.255.255"],
    ["multicast", "224.0.0.1"],
    ["TEST-NET", "192.0.2.5"],
    ["loopback v6", "::1"],
    ["unspecified v6", "::"],
    ["ULA fc00::/7", "fc00::1"],
    ["ULA fd00", "fd12:3456::1"],
    ["link-local v6", "fe80::1"],
    ["multicast v6", "ff02::1"],
    ["v4-mapped private", "::ffff:10.0.0.1"],
    ["v4-mapped IMDS", "::ffff:169.254.169.254"],
    ["v4-compatible IMDS (::/96)", "::a9fe:a9fe"],
    ["v4-compatible private", "::0a00:0001"],
    ["doc v6", "2001:db8::1"],
    ["not an IP", "example.com"],
  ] as const;
  for (const [name, ip] of blocked) {
    it(`blocks ${name} (${ip})`, () => expect(isBlockedIp(ip)).toBe(true));
  }
});

describe("isBlockedIp — allowed public addresses", () => {
  const allowed = [
    ["Google DNS", "8.8.8.8"],
    ["Cloudflare", "1.1.1.1"],
    ["a public host", "93.184.216.34"],
    ["172.15 (just below RFC1918)", "172.15.0.1"],
    ["172.32 (just above RFC1918)", "172.32.0.1"],
    ["100.63 (below CGNAT)", "100.63.255.255"],
    ["public v6", "2606:4700:4700::1111"],
    ["v4-mapped public", "::ffff:8.8.8.8"],
  ] as const;
  for (const [name, ip] of allowed) {
    it(`allows ${name} (${ip})`, () => expect(isBlockedIp(ip)).toBe(false));
  }
});

describe("assertPublicHost — DNS-then-IP", () => {
  const R = (map: Record<string, string[]>) => async (h: string) => map[h] ?? [];

  it("allows a host that resolves only to public IPs", async () => {
    const r = await assertPublicHost("good.example", R({ "good.example": ["93.184.216.34"] }));
    expect(r.ok).toBe(true);
  });

  it("blocks a host if ANY resolved address is private (rebinding via multi-record)", async () => {
    const r = await assertPublicHost("evil.example", R({ "evil.example": ["93.184.216.34", "169.254.169.254"] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/blocked IP/);
  });

  it("blocks an IP literal that is private", async () => {
    const r = await assertPublicHost("10.0.0.1", R({}));
    expect(r.ok).toBe(false);
  });

  it("recognises a bracketed IPv6 literal (as new URL().hostname yields it) without falling through to DNS", async () => {
    // brackets + a v4-mapped metadata address must be blocked directly, not treated as a resolvable name.
    const r = await assertPublicHost("[::ffff:169.254.169.254]", R({}));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/blocked IP literal/);
    const dotted = await assertPublicHost("169.254.169.254.", R({}));
    expect(dotted.ok).toBe(false);
  });

  it("blocks on DNS failure and on empty records (fail closed)", async () => {
    const fail = await assertPublicHost("x", async () => {
      throw new Error("nxdomain");
    });
    expect(fail.ok).toBe(false);
    const empty = await assertPublicHost("x", async () => []);
    expect(empty.ok).toBe(false);
  });
});
