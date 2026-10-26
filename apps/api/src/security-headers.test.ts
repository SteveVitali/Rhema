import { describe, expect, it } from "vitest";
import { createApp } from "./index.js";

// D-R6SECR.1-2 (F-R6SECR.1-2, LOW — the deferral names BOTH origins): `Strict-Transport-Security`
// rides the api's every-response header middleware, stamped only when the request actually arrived
// over TLS — `x-forwarded-proto` (the GFE/LB signal; the container socket is plaintext) or a raw
// `https://` request URL. An http request never caches a policy it can't honor.
describe("D-R6SECR.1-2 — Strict-Transport-Security on the api", () => {
  it("an https-forwarded response carries max-age + includeSubDomains (no preload)", async () => {
    const app = createApp();
    const res = await app.request("/healthz", { headers: { "x-forwarded-proto": "https" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    // the api's existing posture is untouched.
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("the https-request-URL arm stamps the same policy", async () => {
    const app = createApp();
    const res = await app.request("https://api.rhema.tools/healthz");
    expect(res.status).toBe(200);
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("an http request is never stamped — dev/plaintext hops keep no bogus policy", async () => {
    const app = createApp();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });
});
