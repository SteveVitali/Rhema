import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// HOT.1 (BL-65) — every external-LB backend service must carry request logging
// (`logConfig { enable, sampleRate }`), the loadbalancing.googleapis.com/requests trail the 2026-09-30
// review found absent when the dossier 500s hit prod. compute.ts is a Pulumi program (not a pure
// function), so this is a structural assertion over the source — the same style as the launch-surface
// sweeps; it fails if a backend loses or never gains its logConfig block.

const SRC = readFileSync(fileURLToPath(new URL("./compute.ts", import.meta.url)), "utf8");

/** Extract the `{ … });` object literal of `new gcp.compute.BackendService(name("<n>"), {`. */
function backendBlock(name: string): string {
  const marker = `new gcp.compute.BackendService(name("${name}")`;
  const start = SRC.indexOf(marker);
  if (start < 0) return "";
  const brace = SRC.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") {
      depth--;
      if (depth === 0) return SRC.slice(brace, i + 1);
    }
  }
  return "";
}

describe("HOT.1 — LB request logging on every external backend service (BL-65)", () => {
  for (const backend of ["web-backend", "api-backend", "collab-backend"]) {
    it(`${backend} logs requests to loadbalancing.googleapis.com/requests`, () => {
      const block = backendBlock(backend);
      expect(block, `${backend} definition found`).not.toBe("");
      expect(block).toContain("logConfig");
      expect(block).toMatch(/enable:\s*true/);
      expect(block).toMatch(/sampleRate:\s*1\.0?/);
    });
  }
});

describe("BILL.3 — the purchase switch is deploy config on the api", () => {
  it("injects PURCHASE_MODE from the stage fact (a mode string, never a secret)", () => {
    expect(SRC).toContain('{ name: "PURCHASE_MODE", value: cfg.purchaseMode }');
  });
});
