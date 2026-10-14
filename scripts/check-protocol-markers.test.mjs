import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkProtocolMarkers,
  checkSentinelsArmed,
  scanEmittedFile,
} from "./check-protocol-markers.mjs";
import { findProvenanceLeaks, DEFAULT_MARKERS } from "./lib/protocol-markers.mjs";

// SPA.8 / REQ-SAFE-1/2 + REQ-TL-14 — the A4 audit found this gate vacuous twice over (target dirs
// that never exist at CI time AND zero planted sentinels). These legs pin the repaired contract
// end-to-end on tmpdir fixtures: REQUIRED_DIRS fail closed when absent/empty, the sentinel
// armed-check fails when the markers aren't planted, a sentinel in a bundle fails, and the `.map`
// `sources[]` provenance scan fails on protocol/eval/server-side paths inside a public artifact.

/** A minimal non-vacuous fixture root: armed sentinels + the two required output dirs. */
function fixtureRoot({ bundleText = "export const x = 1;" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "rhema-markers-"));
  // the sentinel source tree — one file carrying the planted constants
  mkdirSync(join(root, "packages/protocols/src"), { recursive: true });
  const body = DEFAULT_MARKERS.map((m) => `export const S_${m.replace(/\W/g, "_")} = ${JSON.stringify(m)};`).join("\n");
  writeFileSync(join(root, "packages/protocols/src/protocols.ts"), body + "\n");
  // the required emitted dirs
  mkdirSync(join(root, "apps/web/public/spa/assets"), { recursive: true });
  writeFileSync(join(root, "apps/web/public/spa/assets/main-abc.js"), bundleText);
  writeFileSync(
    join(root, "apps/web/public/spa/assets/main-abc.js.map"),
    JSON.stringify({ version: 3, sources: ["../../../src/spa/main.tsx", "../src/copy.ts"] }),
  );
  mkdirSync(join(root, "packages/api-client/dist"), { recursive: true });
  writeFileSync(join(root, "packages/api-client/dist/index.js"), "export {};\n");
  return root;
}

describe("checkSentinelsArmed — the tripwire's live ammunition (REQ-SAFE-2 layer 3)", () => {
  it("passes when every marker is planted in the sources", () => {
    expect(checkSentinelsArmed(fixtureRoot())).toEqual([]);
  });

  it("fails when a marker is absent — deleting a planted sentinel unarms the gate", () => {
    const root = fixtureRoot();
    // overwrite the source with a body missing every marker
    writeFileSync(join(root, "packages/protocols/src/protocols.ts"), "export const x = 1;\n");
    const violations = checkSentinelsArmed(root);
    expect(violations.length).toBe(DEFAULT_MARKERS.length);
    expect(violations[0]).toContain("unarmed");
  });

  it("fails when the source dir itself is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "rhema-markers-"));
    const violations = checkSentinelsArmed(root);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("missing");
  });
});

describe("scanEmittedFile — the leak directions", () => {
  it("a planted sentinel inside a bundle fails (the leak direction)", () => {
    const root = fixtureRoot();
    const file = join(root, "apps/web/public/spa/assets/leak.js");
    writeFileSync(file, `const x = "prelude RHEMA-PROTOCOL-SECRET rubric";`);
    const violations = scanEmittedFile(file, root);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("RHEMA-PROTOCOL-SECRET");
  });

  it("a clean bundle file passes", () => {
    const root = fixtureRoot();
    const file = join(root, "apps/web/public/spa/assets/main-abc.js");
    expect(scanEmittedFile(file, root)).toEqual([]);
  });
});

describe("findProvenanceLeaks — REQ-SAFE-2 layer 2 (map sources[])", () => {
  it.each([
    ["../../../../packages/protocols/src/protocols.ts", "packages/protocols"],
    ["../../packages/evals/src/scorer.ts", "packages/evals"],
    ["node_modules/.pnpm/@rhema+evals@1.0.0/node_modules/@rhema/evals/dist/x.js", "@rhema/evals"],
    ["../../apps/run-task/src/main.ts", "apps/run-task"],
    ["../../apps/api/src/server.ts", "apps/api"],
    ["../../../packages/db/src/schema/x.ts", "packages/db"],
  ])("flags %s [%s]", (source, label) => {
    const hits = findProvenanceLeaks([source, "../src/spa/main.tsx"]);
    expect(hits).toEqual([`${source} [${label}]`]);
  });

  it("ignores client-safe sources", () => {
    expect(
      findProvenanceLeaks([
        "../../../src/spa/main.tsx",
        "../../../src/copy.ts",
        "../../packages/contracts/dist/ids.js",
        "../../packages/ui/dist/shell.js",
        "node_modules/.pnpm/react@19.3.0/node_modules/react/index.js",
      ]),
    ).toEqual([]);
  });
});

describe("the SPA graph's stricter provenance rules", () => {
  it("a server-side apps/web module (server.ts) inside a public/spa map fails", () => {
    const root = fixtureRoot();
    const file = join(root, "apps/web/public/spa/assets/main-abc.js.map");
    writeFileSync(
      file,
      JSON.stringify({ version: 3, sources: ["../../../src/spa/main.tsx", "../../../src/server.ts"] }),
    );
    const violations = scanEmittedFile(file, root);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("server.ts");
  });

  it("an api-client value import inside a public/spa map fails (REQ-FW-9 emitted-graph leg)", () => {
    const root = fixtureRoot();
    const file = join(root, "apps/web/public/spa/assets/main-abc.js.map");
    writeFileSync(
      file,
      JSON.stringify({ version: 3, sources: ["../../../src/spa/main.tsx", "../../../../packages/api-client/dist/index.js"] }),
    );
    const violations = scanEmittedFile(file, root);
    expect(violations.some((v) => v.includes("api-client"))).toBe(true);
  });

  it("the same api-client source is legal in a NON-spa map (islands scope is narrower)", () => {
    const root = fixtureRoot();
    const file = join(root, "packages/api-client/dist/index.js.map");
    writeFileSync(file, JSON.stringify({ version: 3, sources: ["../src/index.ts"] }));
    expect(scanEmittedFile(file, root)).toEqual([]);
  });

  it("an unparseable .map fails closed rather than skipping", () => {
    const root = fixtureRoot();
    const file = join(root, "apps/web/public/spa/assets/broken.js.map");
    writeFileSync(file, "{ not json");
    const violations = scanEmittedFile(file, root);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("unparseable");
  });
});

describe("checkProtocolMarkers — the composed gate on a fixture root", () => {
  it("passes on an armed, clean fixture", () => {
    const { ok, violations, scanned, armed } = checkProtocolMarkers(fixtureRoot());
    expect(violations).toEqual([]);
    expect(ok).toBe(true);
    expect(armed).toBe(true);
    expect(scanned).toBeGreaterThan(0);
  });

  it("fails closed when a REQUIRED_DIR is absent — the scan never silently skips real output", () => {
    const root = fixtureRoot();
    // remove the required SPA dir entirely
    rmSync(join(root, "apps/web/public/spa"), { recursive: true });
    const { ok, violations } = checkProtocolMarkers(root);
    expect(ok).toBe(false);
    expect(violations.some((v) => v.includes("apps/web/public/spa") && v.includes("missing"))).toBe(true);
  });

  it("fails closed when a REQUIRED_DIR holds no scannable artifacts", () => {
    const root = fixtureRoot();
    rmSync(join(root, "apps/web/public/spa/assets/main-abc.js"));
    rmSync(join(root, "apps/web/public/spa/assets/main-abc.js.map"));
    const { ok, violations } = checkProtocolMarkers(root);
    expect(ok).toBe(false);
    expect(violations.some((v) => v.includes("apps/web/public/spa") && v.includes("no scannable"))).toBe(true);
  });

  it("both directions at once: sentinel absent AND sentinel in the bundle → fails", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "packages/protocols/src/protocols.ts"), "export const x = 1;\n");
    writeFileSync(
      join(root, "apps/web/public/spa/assets/leak.js"),
      `window.__x = "RHEMA-PROTOCOL-SECRET";`,
    );
    const { ok, violations } = checkProtocolMarkers(root);
    expect(ok).toBe(false);
    expect(violations.some((v) => v.includes("unarmed"))).toBe(true);
    expect(violations.some((v) => v.includes("leak.js"))).toBe(true);
  });
});
