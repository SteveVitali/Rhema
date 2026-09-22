import { describe, expect, it } from "vitest";
import {
  presignQuarantinePut,
  quarantineKey,
  convertedResultKey,
  parseQuarantineKey,
  QUARANTINE_PREFIX,
  CONVERTED_PREFIX,
  MAX_UPLOAD_BYTES,
  type SignedUrlProvider,
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
