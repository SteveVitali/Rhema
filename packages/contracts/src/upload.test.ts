import { describe, expect, it } from "vitest";
import {
  presignQuarantinePut,
  quarantineKey,
  convertedResultKey,
  parseQuarantineKey,
  parseConvertedKey,
  userContentKeyOwner,
  userContentResponsePolicy,
  mintUserContentUrl,
  USERCONTENT_RENDERED_TYPES,
  USERCONTENT_URL_TTL_SECONDS,
  QUARANTINE_PREFIX,
  CONVERTED_PREFIX,
  MAX_UPLOAD_BYTES,
  type SignedUrlProvider,
  type UserContentSigner,
} from "./upload.js";

// The quarantine upload wire contract (REQ-ARCH-24; §13.3): key shape, size bound, converted-output
// derivation, and the tenant-scoping validator the api routes enforce.

describe("presignQuarantinePut", () => {
  it("mints a workspace-scoped quarantine key and clamps the size bound to 25 MB", async () => {
    let seen: { bucket: string; key: string; maxBytes: number; expiresSeconds: number } | null = null;
    const provider: SignedUrlProvider = {
      signedPut: async (a) => {
        seen = a;
        return { url: `https://storage.googleapis.com/${a.bucket}/${a.key}?signed`, requiredHeaders: { "x-goog-content-length-range": `0,${a.maxBytes}` } };
      },
    };
    const up = await presignQuarantinePut(provider, {
      bucket: "rhema-dev-user-content",
      workspaceId: "ws1",
      uploadId: "u1",
      maxBytes: 999_999_999,
    });
    expect(up.key).toBe(quarantineKey("ws1", "u1"));
    expect(up.key).toBe(`${QUARANTINE_PREFIX}/ws1/u1`);
    expect(up.maxBytes).toBe(MAX_UPLOAD_BYTES); // clamped to 25 MB
    expect(seen!.maxBytes).toBe(MAX_UPLOAD_BYTES);
    expect(up.requiredHeaders["x-goog-content-length-range"]).toBe(`0,${MAX_UPLOAD_BYTES}`);
  });
});

describe("convertedResultKey", () => {
  it("maps quarantine/<ws>/<id> to converted/<ws>/<id>.json", () => {
    expect(convertedResultKey("quarantine/WS01/UP01")).toBe(`${CONVERTED_PREFIX}/WS01/UP01.json`);
  });
});

describe("parseQuarantineKey", () => {
  it("accepts the minted shape and parses the segments", () => {
    expect(parseQuarantineKey("quarantine/01M2V3PM11XSF05VJ9G01PM5ZB/01M35ABC")).toEqual({
      workspaceId: "01M2V3PM11XSF05VJ9G01PM5ZB",
      uploadId: "01M35ABC",
    });
  });

  it("rejects other-tenant keys when workspaceId is bound (the cross-tenant wall)", () => {
    expect(parseQuarantineKey("quarantine/other-ws/u1", "ws1")).toBeNull();
    expect(parseQuarantineKey("quarantine/ws1/u1", "ws1")).not.toBeNull();
  });

  it("rejects traversal + malformed shapes", () => {
    for (const bad of [
      "quarantine/ws1", // missing segment
      "quarantine/ws1/u1/extra", // extra segment
      "quarantine/../u1", // traversal
      "quarantine/ws1/..",
      "converted/ws1/u1", // wrong prefix — a caller can never hand the api a converted key
      "quarantine//u1",
      "quarantine/ws1/u 1", // whitespace
      "",
      42,
      null,
      "quarantine/ws1/u1.json/../x",
    ]) {
      expect(parseQuarantineKey(bad, "ws1")).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// R6UCD.1 (REQ-POST-7, ADR-113) — the API-minted user-content delivery vocabulary.
// ---------------------------------------------------------------------------

describe("userContentResponsePolicy (the §13.3 serve contract)", () => {
  it("renders allowlisted image types inline as themselves", () => {
    for (const t of USERCONTENT_RENDERED_TYPES) {
      expect(userContentResponsePolicy(t)).toEqual({ contentType: t, contentDisposition: "inline" });
    }
    // case + parameter normalization still resolves the base type
    expect(userContentResponsePolicy("Image/PNG; foo=bar")).toEqual({
      contentType: "image/png",
      contentDisposition: "inline",
    });
  });

  it("forces attachment + application/octet-stream for EVERYTHING else", () => {
    for (const t of ["text/html", "image/svg+xml", "application/pdf", "text/javascript", "", null, undefined, "weird"]) {
      expect(userContentResponsePolicy(t)).toEqual({
        contentType: "application/octet-stream",
        contentDisposition: "attachment",
      });
    }
    // svg is an image/* but is NOT on the allowlist — it must never render inline.
    expect(userContentResponsePolicy("image/svg+xml").contentDisposition).toBe("attachment");
  });
});

describe("parseConvertedKey / userContentKeyOwner", () => {
  it("parses converted/<ws>/<id>.json and enforces the bound workspace", () => {
    expect(parseConvertedKey("converted/ws1/u1.json")).toEqual({ workspaceId: "ws1", uploadId: "u1" });
    expect(parseConvertedKey("converted/ws1/u1.json", "ws1")).not.toBeNull();
    expect(parseConvertedKey("converted/ws1/u1.json", "other")).toBeNull();
    for (const bad of ["converted/ws1/u1", "converted/../u1.json", "converted/ws1", "converted//u1.json", 42, null]) {
      expect(parseConvertedKey(bad)).toBeNull();
    }
  });

  it("extracts the tenant segment of mint-eligible keys and rejects tenant-less shapes", () => {
    expect(userContentKeyOwner("quarantine/ws1/u1")).toEqual({ workspaceId: "ws1" });
    expect(userContentKeyOwner("converted/ws1/u1.json")).toEqual({ workspaceId: "ws1" });
    // ingest-originals/<sha> carries NO tenant segment — only a tenant-scoped row resolve can
    // prove ownership (the /raw path); the generic mint route must never guess.
    for (const bad of [
      "ingest-originals/0123abcd",
      "restore/ws1/x",
      "quarantine/../x",
      "quarantine/ws1/u1/extra",
      "exports/ws1/x.zip",
      "",
      42,
      null,
      undefined,
    ]) {
      expect(userContentKeyOwner(bad)).toBeNull();
    }
  });
});

describe("mintUserContentUrl (the ONE mint decision)", () => {
  const signer = (calls: Parameters<UserContentSigner["signGet"]>[0][]): UserContentSigner => ({
    async signGet(a) {
      calls.push(a);
      return { url: `https://storage.googleapis.com/bkt/${a.key}?X-Goog-Signature=x`, expiresAt: 1_000 + a.expiresSeconds * 1_000 };
    },
  });

  it("mints a short-lived GET with the §13.3 response-* params signed in", async () => {
    const calls: Parameters<UserContentSigner["signGet"]>[0][] = [];
    const out = await mintUserContentUrl(signer(calls), { key: "quarantine/ws1/u1", contentType: "text/html" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      key: "quarantine/ws1/u1",
      expiresSeconds: USERCONTENT_URL_TTL_SECONDS,
      responseType: "application/octet-stream",
      responseDisposition: "attachment",
    });
    expect(out.expiresAt).toBe(1_000 + USERCONTENT_URL_TTL_SECONDS * 1_000);
    expect(out.url).toContain("quarantine/ws1/u1");
  });

  it("signs allowlisted types as inline and clamps a too-long TTL to the bound", async () => {
    const calls: Parameters<UserContentSigner["signGet"]>[0][] = [];
    const out = await mintUserContentUrl(signer(calls), {
      key: "quarantine/ws1/up1", // the allowlisted fixture literal (.gitleaks.toml)
      contentType: "image/webp",
      expiresSeconds: 86_400, // a caller can NEVER buy a longer-lived URL than the bound
    });
    expect(calls[0]!.expiresSeconds).toBeLessThanOrEqual(USERCONTENT_URL_TTL_SECONDS);
    expect(calls[0]!.expiresSeconds).toBe(USERCONTENT_URL_TTL_SECONDS);
    expect(calls[0]!.responseType).toBe("image/webp");
    expect(calls[0]!.responseDisposition).toBe("inline");
    expect(out.expiresAt).toBeLessThanOrEqual(1_000 + USERCONTENT_URL_TTL_SECONDS * 1_000);
  });
});
