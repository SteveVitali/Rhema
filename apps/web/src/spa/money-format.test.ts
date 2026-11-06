import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// R7KIT.3b (REQ-COPY-5) — the migrated batch-b files and the shared run-sheet helpers carry NO
// ad-hoc `toFixed(`/`toLocaleString(` on money or credits: every figure routes through the ONE
// `@rhema/contracts` formatter (formatCredits/formatUsd/formatRate + the D5 sentence generators).
// The no-JS inline script is covered separately — its usd/cr emit from MONEY_FMT_INLINE_JS, which
// `number-format.test.ts` parity-tests against the canonical functions.

const FILES = [
  "apps/web/src/spa/surfaces/run-sheet.tsx",
  "apps/web/src/spa/surfaces/export.tsx",
  "apps/web/src/spa/surfaces/onboarding.tsx",
  "apps/web/src/spa/surfaces/usage.tsx",
  "packages/ui/src/run-sheet.tsx",
  "packages/run-sheet/src/view.ts",
] as const;

describe("REQ-COPY-5 — no ad-hoc toFixed/toLocaleString on money or credits (batch b)", () => {
  it.each(FILES.map((f) => [f] as const))("%s", (file) => {
    const src = readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");
    expect(src, `${file} contains ad-hoc number formatting`).not.toMatch(
      /\.toFixed\(|\.toLocaleString\(/,
    );
  });
});
