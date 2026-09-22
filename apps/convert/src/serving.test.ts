import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { servingHeadersFor, USERCONTENT_ORIGIN, RENDERED_ALLOWLIST } from "./serving.js";
import { presignQuarantinePut, quarantineKey, MAX_UPLOAD_BYTES, type SignedUrlProvider } from "@rhema/contracts";

// AC3 (REQ-ARCH-24): uploaded HTML is served from the cookieless usercontent origin as attachment/octet-stream.

describe("servingHeadersFor (usercontent origin)", () => {
  it("serves uploaded HTML as an octet-stream attachment (never inline)", () => {
    const h = servingHeadersFor("text/html");
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toBe("attachment");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect("Set-Cookie" in h).toBe(false); // cookieless
  });

  it("also downloads docx/pdf/txt (nothing but the image allowlist renders inline)", () => {
    for (const t of ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]) {
      expect(servingHeadersFor(t)["Content-Disposition"]).toBe("attachment");
    }
    // an allowlisted image renders inline with its true type
    expect(servingHeadersFor("image/png")).toMatchObject({ "Content-Type": "image/png", "Content-Disposition": "inline" });
    expect(RENDERED_ALLOWLIST).toContain("image/png");
  });

  it("the usercontent origin is a distinct cookieless host on the app's zone (amended 2026-09-17)", () => {
    expect(USERCONTENT_ORIGIN.host).toBe("usercontent.rhema.tools");
    expect(USERCONTENT_ORIGIN.registrableDomain).toBe("rhema.tools");
    expect(USERCONTENT_ORIGIN.setsCookies).toBe(false);
    expect(USERCONTENT_ORIGIN.isSubresourceOfApp).toBe(false);
    // Same zone, distinct ORIGIN — the cookie boundary is now carried by host-only `__Host-` auth
    // cookies (apps/api/src/auth.test.ts) plus this origin never emitting Set-Cookie.
    expect(USERCONTENT_ORIGIN.host.endsWith(`.${USERCONTENT_ORIGIN.registrableDomain}`)).toBe(true);
  });
});

describe("presignQuarantinePut", () => {
  it("presigns a quarantine-prefixed PUT with a size condition, content-type NOT bound", async () => {
    let seen: { bucket: string; key: string; maxBytes: number } | null = null;
    const provider: SignedUrlProvider = {
      async signedPut(args) {
        seen = { bucket: args.bucket, key: args.key, maxBytes: args.maxBytes };
        return { url: `https://storage.example/${args.key}?sig=x` };
      },
    };
    const up = await presignQuarantinePut(provider, { bucket: "rhema-dev-quarantine", workspaceId: "ws1", uploadId: "u1", maxBytes: 999_999_999 });
    expect(up.key).toBe(quarantineKey("ws1", "u1"));
    expect(up.key).toBe("quarantine/ws1/u1");
    expect(up.maxBytes).toBe(MAX_UPLOAD_BYTES); // clamped to 25 MB
    expect(seen!.maxBytes).toBe(MAX_UPLOAD_BYTES);
    expect(up.url).toContain("quarantine/ws1/u1");
  });
});

describe("AC2 (part 2) — convert has no network route and no DB credentials", () => {
  it("declares no DB, pg, storage, or generic-network dependency", () => {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    for (const banned of ["@rhema/db", "pg", "drizzle-orm", "@google-cloud/storage", "undici", "ioredis", "pg-boss"]) {
      expect(deps).not.toContain(banned);
    }
  });
});
