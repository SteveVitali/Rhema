import { describe, expect, it } from "vitest";
import { evaluateUrl, normalizeUrl } from "./url-policy.js";
import type { UrlPolicy } from "./types.js";

// AC3 (REQ-DATA-15) — hold-out fetch denied for the persona builder; allowed for the calibrator only when
// the prediction-file precondition flag is set. Plus server-fetch disablement and user exclusions.

const HOLDOUT = "https://blog.example.com/holdout-essay";

const builderPolicy: UrlPolicy = {
  holdouts: [HOLDOUT],
  userExclusions: ["https://paywall.example.com/x"],
  calibratorAllow: [HOLDOUT],
  predictionFileWritten: false,
  serverFetchDisabled: true, // builder & calibrator: server web_fetch disabled
};

describe("normalizeUrl", () => {
  it("lowercases host, strips default port, trailing slash and fragment", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/path/#frag")).toBe("https://example.com/path");
    expect(normalizeUrl("http://example.com:80/")).toBe("http://example.com");
  });
});

describe("hold-out URL policy (AC3)", () => {
  it("denies a hold-out fetch for the persona builder (server web_fetch disabled)", () => {
    const d = evaluateUrl(HOLDOUT, builderPolicy, { isCalibrator: false });
    expect(d.decision).toBe("deny");
  });

  // The spec-real calibrator config: serverFetchDisabled stays true (it never uses server web_fetch); it
  // fetches through the client `fetcher`, so its calls arrive with viaFetcher:true (Finding 3).
  it("denies a hold-out for the calibrator until the prediction file is written", () => {
    const d = evaluateUrl(HOLDOUT, builderPolicy, { isCalibrator: true, viaFetcher: true });
    expect(d.decision).toBe("deny");
    expect(d.denyReason).toBe("holdout");
  });

  it("allows the calibrator the hold-out via the fetcher once the prediction file is written", () => {
    const pol: UrlPolicy = { ...builderPolicy, predictionFileWritten: true };
    const d = evaluateUrl(HOLDOUT, pol, { isCalibrator: true, viaFetcher: true });
    expect(d.decision).toBe("allow");
  });

  it("still denies a server web_fetch of the hold-out for the calibrator (must use the fetcher)", () => {
    const pol: UrlPolicy = { ...builderPolicy, predictionFileWritten: true };
    // No viaFetcher → this is the server WebFetch tool path → serverFetchDisabled short-circuits.
    expect(evaluateUrl(HOLDOUT, pol, { isCalibrator: true }).decision).toBe("deny");
  });

  it("still denies a non-calibrator the hold-out even via the fetcher after the prediction file exists", () => {
    const pol: UrlPolicy = { ...builderPolicy, predictionFileWritten: true };
    expect(evaluateUrl(HOLDOUT, pol, { isCalibrator: false, viaFetcher: true }).decision).toBe("deny");
  });

  it("only unlocks hold-outs on the calibrator's allow-list", () => {
    const pol: UrlPolicy = { ...builderPolicy, predictionFileWritten: true, calibratorAllow: [] };
    expect(evaluateUrl(HOLDOUT, pol, { isCalibrator: true, viaFetcher: true }).decision).toBe("deny");
  });

  it("is not evaded by an appended query string (Finding 4 / §12.8 exfil channel)", () => {
    const pol: UrlPolicy = { ...builderPolicy, serverFetchDisabled: false };
    const d = evaluateUrl(`${HOLDOUT}?d=c2VjcmV0`, pol);
    expect(d.decision).toBe("deny");
    expect(d.denyReason).toBe("holdout");
  });
});

describe("server-fetch disablement + exclusions", () => {
  it("denies every WebFetch when server fetch is disabled (client fetcher only)", () => {
    const d = evaluateUrl("https://ok.example.com/page", builderPolicy);
    expect(d.decision).toBe("deny");
    expect(d.denyReason).toBe("policy");
    expect(d.reason).toContain("client-side fetcher");
  });

  it("denies user-excluded sources", () => {
    const pol: UrlPolicy = { ...builderPolicy, serverFetchDisabled: false };
    const d = evaluateUrl("https://paywall.example.com/x", pol);
    expect(d.decision).toBe("deny");
    expect(d.denyReason).toBe("policy");
  });

  it("denies blocked domains and their subdomains", () => {
    const pol: UrlPolicy = {
      holdouts: [],
      userExclusions: [],
      calibratorAllow: [],
      predictionFileWritten: false,
      serverFetchDisabled: false,
      blockedDomains: ["paywall.com"],
    };
    expect(evaluateUrl("https://news.paywall.com/a", pol).denyReason).toBe("paywall");
    expect(evaluateUrl("https://open.example.com/a", pol).decision).toBe("allow");
  });

  it("allows an ordinary fetch under an unrestricted policy", () => {
    const pol: UrlPolicy = {
      holdouts: [],
      userExclusions: [],
      calibratorAllow: [],
      predictionFileWritten: false,
      serverFetchDisabled: false,
    };
    expect(evaluateUrl("https://ok.example.com/page", pol).decision).toBe("allow");
  });
});
