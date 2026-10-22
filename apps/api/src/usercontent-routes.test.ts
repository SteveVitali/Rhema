// R6UCD.1 (REQ-POST-7, ADR-113) — the user-content mint route's deterministic AC legs:
// foreign-tenant id → 404 with NO url; allowlisted vs non-allowlisted disposition bound into the
// signature; the TTL bound; unauth → 401; unbound seam → 503. The signer is faked — the live v4
// wire is Stage-B/operator-gated.

import { describe, expect, it } from "vitest";
import {
  quarantineKey,
  convertedResultKey,
  USERCONTENT_URL_TTL_SECONDS,
  type UserContentSigner,
} from "@rhema/contracts";
import { createApp, type Principal } from "./index.js";

const WS = "01M2V3PM11XSF05VJ9G01PM5ZB";
const OTHER_WS = "01M9QQQQ11XSF05VJ9G01PMQQQ";

type SignCall = Parameters<UserContentSigner["signGet"]>[0];

const fakeSigner = (calls: SignCall[]): UserContentSigner => ({
  async signGet(a) {
    calls.push(a);
    return {
      url: `https://storage.googleapis.com/rhema-user-content/${a.key}?X-Goog-Expires=${a.expiresSeconds}&response-content-disposition=${encodeURIComponent(a.responseDisposition)}&response-content-type=${encodeURIComponent(a.responseType)}&X-Goog-Signature=deadbeef`,
      expiresAt: Date.now() + a.expiresSeconds * 1_000,
    };
  },
});

const appFor = (args: { calls?: SignCall[]; authed?: boolean; signer?: UserContentSigner | null } = {}) => {
  const calls = args.calls ?? [];
  const signer = args.signer === null ? undefined : (args.signer ?? fakeSigner(calls));
  const principal = (): Principal | null =>
    args.authed === false ? null : { userId: "u1", workspaceId: WS, billingAccountId: "b1" };
  // createApp() with only the seams this surface needs — the usercontent mount needs just the
  // principal fn + the signer.
  const app = createApp(
    { principal, ...(signer ? { userContentSigner: signer } : {}) } as unknown as Parameters<
      typeof createApp
    >[0],
  );
  return { app, calls };
};

describe("GET /usercontent/sign (R6UCD.1)", () => {
  it("401 unauthenticated — no URL is ever minted for an anonymous caller", async () => {
    const { app, calls } = appFor({ authed: false });
    const res = await app.request(`/usercontent/sign?key=${encodeURIComponent(quarantineKey(WS, "u1"))}`);
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("503 when the mint seam is unbound (fail-closed, never a fabricated URL)", async () => {
    const { app } = appFor({ signer: null });
    const res = await app.request(`/usercontent/sign?key=${encodeURIComponent(quarantineKey(WS, "u1"))}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "usercontent_unavailable" });
  });

  it("404 + no URL for a foreign-tenant quarantine key (the cross-tenant wall)", async () => {
    const { app, calls } = appFor();
    const res = await app.request(`/usercontent/sign?key=${encodeURIComponent(quarantineKey(OTHER_WS, "u1"))}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.url).toBeUndefined();
    expect(calls).toHaveLength(0); // the signer is never even ASKED for a foreign key
  });

  it("404 + no URL for a foreign-tenant converted key and for tenant-less key shapes", async () => {
    const { app, calls } = appFor();
    for (const key of [
      convertedResultKey(quarantineKey(OTHER_WS, "u1")), // converted/<other-ws>/<id>.json
      "ingest-originals/0123abcdef", // no tenant segment — row-resolve paths only
      "quarantine/../x", // traversal
      "exports/ws1/x.zip", // wrong prefix entirely
      "quarantine/" + WS, // malformed
    ]) {
      const res = await app.request(`/usercontent/sign?key=${encodeURIComponent(key)}`);
      expect(res.status, key).toBe(404);
      expect(((await res.json()) as Record<string, unknown>).url).toBeUndefined();
    }
    expect(calls).toHaveLength(0);
    // a missing key param answers the same uniform 404
    const res = await app.request(`/usercontent/sign`);
    expect(res.status).toBe(404);
  });

  it("200 + a short-lived signed GET for an own quarantine key — octet-stream + attachment by default", async () => {
    const { app, calls } = appFor();
    const key = quarantineKey(WS, "u1");
    const res = await app.request(`/usercontent/sign?key=${encodeURIComponent(key)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; expiresAt: number };
    expect(body.url).toContain(`/${key}?`);
    expect(body.url).toContain("response-content-disposition=attachment");
    expect(body.url).toContain(`response-content-type=${encodeURIComponent("application/octet-stream")}`);
    // no Set-Cookie can ever ride the minted path — the api response itself carries none either
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(calls).toEqual([
      {
        key,
        expiresSeconds: USERCONTENT_URL_TTL_SECONDS,
        responseType: "application/octet-stream",
        responseDisposition: "attachment",
      },
    ]);
    expect(body.expiresAt - Date.now()).toBeLessThanOrEqual(USERCONTENT_URL_TTL_SECONDS * 1_000);
  });

  it("the type claim is allowlist-clamped: image/png inlines as itself; text/html and everything else stays a download", async () => {
    const { app, calls } = appFor();
    const key = quarantineKey(WS, "img1");
    const img = await app.request(`/usercontent/sign?key=${encodeURIComponent(key)}&type=image/png`);
    expect(img.status).toBe(200);
    expect(calls[0]).toMatchObject({ responseType: "image/png", responseDisposition: "inline" });
    const html = await app.request(`/usercontent/sign?key=${encodeURIComponent(key)}&type=text/html`);
    expect(html.status).toBe(200);
    expect(calls[1]).toMatchObject({
      responseType: "application/octet-stream",
      responseDisposition: "attachment",
    });
    // a forged allowlist-lookalike still tightens to octet-stream
    const svg = await app.request(`/usercontent/sign?key=${encodeURIComponent(key)}&type=image/svg%2Bxml`);
    expect(svg.status).toBe(200);
    expect(calls[2]).toMatchObject({ responseType: "application/octet-stream" });
  });

  it("mints own converted/ keys too (the probe route's second prefix)", async () => {
    const { app, calls } = appFor();
    const key = convertedResultKey(quarantineKey(WS, "u2"));
    const res = await app.request(`/usercontent/sign?key=${encodeURIComponent(key)}`);
    expect(res.status).toBe(200);
    expect(calls[0]!.key).toBe(key);
  });
});
