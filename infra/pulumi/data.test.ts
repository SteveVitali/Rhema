import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// SPA.13 (REQ-BFF-16; design/22 §5/E-2) — the voices surface is the first browser-upload consumer:
// the SPA's presign→direct-PUT leg PUTs bytes straight to the `user-content` bucket's `quarantine/`
// prefix, so the bucket needs a CORS block scoped to PUT + the signed-URL extension headers and an
// EXPLICIT origin list (the app origin + operator-added `rhema:uploadCorsOrigins` — never a
// wildcard). data.ts is a Pulumi program, not a pure function, so these are structural assertions
// over the source — the same style as compute.test.ts's HOT.1 sweep.

const SRC = readFileSync(fileURLToPath(new URL("./data.ts", import.meta.url)), "utf8");
const INDEX_SRC = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

describe("SPA.13 — user-content bucket CORS for the browser's direct-PUT upload leg", () => {
  it("the quarantine bucket (user-content) carries a CORS block, and only it does", () => {
    // The cors block is conditioned on b === "user-content" — artifacts/benchmark-enclave stay
    // CORS-less (the upload surface never touches them).
    expect(SRC).toContain('b === "user-content"');
    expect(SRC.match(/cors:/g) ?? []).toHaveLength(1);
  });

  it("admits PUT + GET only — never a broad method list", () => {
    // SPA.13 PUT (presign→direct-PUT) + R6UCD.1 GET (a browser fetch() of an api-minted v4 URL is
    // a CORS read on storage.googleapis.com — the same explicit origins govern both).
    expect(SRC).toContain('methods: ["PUT", "GET"]');
    expect(SRC).not.toMatch(/methods:\s*\[[^\]]*"\*"/);
  });

  it("R6UCD.1 — the GET leg exposes the headers a ranged browser reader needs", () => {
    for (const h of ['"Content-Disposition"', '"Content-Length"', '"Accept-Ranges"', '"Content-Range"']) {
      expect(SRC).toContain(h);
    }
  });

  it("admits the signed-URL extension headers the v4 presigner requires", () => {
    // `presignQuarantinePut` binds `x-goog-content-length-range` into the signature; the browser
    // echoes it verbatim, so the preflight's allow-headers must carry it (plus Content-Type).
    expect(SRC).toContain("x-goog-content-length-range");
    expect(SRC).toContain('"Content-Type"');
  });

  it("sources origins explicitly — the app origin + operator config, never a wildcard", () => {
    expect(SRC).toContain("cfg.domains.app");
    expect(SRC).toContain("args.uploadCorsOrigins");
    // No wildcard origin anywhere in the cors block.
    expect(SRC).not.toContain('origins: ["*"]');
    expect(SRC).not.toMatch(/origins:\s*\[[^\]]*"\*"/);
  });

  it("index.ts plumbs `rhema:uploadCorsOrigins` (CSV, https-only) into createData", () => {
    expect(INDEX_SRC).toContain('rhemaConfig.get("uploadCorsOrigins")');
    expect(INDEX_SRC).toContain("uploadCorsOrigins:");
    // Anything not an https origin is dropped before it reaches the bucket config.
    expect(INDEX_SRC).toContain("/^https:\\/\\//.test(o)");
  });
});

describe("R6INF.1 — Cloud SQL availabilityType is a stage fact (REQ-DEP-3; GD-HA.R6)", () => {
  it("the DatabaseInstance reads cfg.database.cloudSqlAvailabilityType — never a bare literal", () => {
    // The HA posture moved from a program literal to the stage fact (prod pins REGIONAL —
    // the ruled paid-launch posture; the ZONAL→REGIONAL transition is an in-place patch).
    // A reintroduced `availabilityType: "ZONAL"`/`"REGIONAL"` literal in the Cloud SQL block
    // would silently decouple the deployed shape from the asserted fact — this pin fails.
    expect(SRC).toContain('availabilityType: cfg.database.cloudSqlAvailabilityType ?? "ZONAL"');
    const sqlBlock = SRC.slice(
      SRC.indexOf('new gcp.sql.DatabaseInstance(name("postgres")'),
      SRC.indexOf('new gcp.sql.Database(name("db")'),
    );
    expect(sqlBlock).not.toMatch(/availabilityType:\s*"ZONAL"|availabilityType:\s*"REGIONAL"/);
  });
});
