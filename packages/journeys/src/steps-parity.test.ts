// R7FIX.7 (F-R7DEP.2-9) — the bundle-parity check's ranged-media arm: a `<video>` element's
// `Range` request is answered 206 Partial Content by a correct asset server (the hero clip's
// prod response), while a 206 on a non-media family still fails, as do wrong content-types.

import { describe, expect, it } from "vitest";
import { assertBundleParity } from "./steps.js";
import type { StepCtx } from "./runner.js";

function ctx(assetHits: StepCtx["assetHits"]): StepCtx {
  return {
    assetHits,
    consoleErrors: [],
    failedRequests: [],
  } as unknown as StepCtx;
}

describe("assertBundleParity ranged-media arm", () => {
  it("a 206 on the hero mp4 passes (correct ranged-video response), with the type asserted", () => {
    expect(() =>
      assertBundleParity(
        ctx([
          { url: "https://web.test/assets/media/hero-tour.mp4", status: 206, contentType: "video/mp4" },
          { url: "https://web.test/assets/app.js", status: 200, contentType: "text/javascript" },
        ]),
      ),
    ).not.toThrow();
  });

  it("a 206 on a non-media family still fails", () => {
    expect(() =>
      assertBundleParity(
        ctx([{ url: "https://web.test/assets/app.js", status: 206, contentType: "text/javascript" }]),
      ),
    ).toThrow(/bundle parity/);
  });

  it("a 206 media hit with the wrong content-type still fails", () => {
    expect(() =>
      assertBundleParity(
        ctx([{ url: "https://web.test/assets/media/hero-tour.mp4", status: 206, contentType: "text/html" }]),
      ),
    ).toThrow(/bundle parity/);
  });
});
