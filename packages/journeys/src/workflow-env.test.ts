// F-R6LCH.PAID-1 (2026-11-02) — the paid-arm env contract, pinned at the YAML layer where the
// defect lived. The bug was a `!paid` gate on the JOURNEY_DATABASE_URL injection (and on the
// IAP+SSH tunnel that carries its private host): the bound secret is the system-role postgres
// DSN (pg_roles rolbypassrls=true — the spend guard's own trust probe), so the paid arm needs
// it MORE than the free arm (the measured weekly read + the DB legs + the fixture substrate
// that re-seats N9/T8/B-leg rows). These tests read the committed workflow and assert the arms
// verbatim — they fail if the gate ever creeps back.
//
// The guard-side invariants ride their own suites (cited, not duplicated):
//   - cli-flags.test.ts — a non-cron --paid without the DSN refuses; the scheduled cron keeps
//     the no-db attestation (unbound ⇒ attests, never fabricates).
//   - spend-guard.test.ts — the pg_roles trust probe fails CLOSED on a non-bypass pool and the
//     meter query never runs under an untrusted role.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ssrCauseOfDocument } from "./settle.js";
import { tenantLookupRetryable } from "./stb5b-helpers.js";

const WORKFLOW = fileURLToPath(new URL("../../../.github/workflows/journeys.yml", import.meta.url));
const yaml = readFileSync(WORKFLOW, "utf8");

describe("journeys.yml — paid-arm env contract (F-R6LCH.PAID-1)", () => {
  const tunnelStep = yaml.slice(
    yaml.indexOf("Open the IAP+SSH DB tunnel"),
    yaml.indexOf("Run the journey suite"),
  );
  const runStep = yaml.slice(yaml.indexOf("Run the journey suite"));

  it("the IAP+SSH tunnel step is not paid-gated — both arms reach the private DB host", () => {
    expect(tunnelStep.length).toBeGreaterThan(0);
    // a `!paid`/`35 4 * * 1` gate on this step is exactly F-R6LCH.PAID-1's regression.
    expect(tunnelStep).not.toMatch(/if:.*35 4 \* \* 1/);
    expect(tunnelStep).not.toMatch(/if:.*inputs\.paid/);
  });

  it("JOURNEY_DATABASE_URL exports whenever the secret is bound — including the paid arm", () => {
    expect(runStep).toContain("JOURNEY_DATABASE_URL_BOUND: ${{ secrets.JOURNEY_DATABASE_URL }}");
    // the export guard is secret-presence only — a JOURNEY_PAID condition here is the bug.
    expect(runStep).toContain('if [ -n "${JOURNEY_DATABASE_URL_BOUND:-}" ]; then');
    expect(runStep).not.toMatch(/\$\{JOURNEY_PAID[^}]*\}[^=]*!= "true"\s*\]\s*&&\s*\[ -n "\$\{JOURNEY_DATABASE_URL_BOUND/);
  });

  it("--paid + the standing $3 headroom still ride JOURNEY_PAID, unchanged", () => {
    expect(runStep).toContain('github.event.schedule == \'35 4 * * 1\'');
    expect(runStep).toMatch(/JOURNEY_PAID[^\n]*= "true"[^\n]*--paid --headroom 3/);
  });
});

describe("F-R6LCH.PAID-3/4 — helper contracts", () => {
  it("tenantLookupRetryable: only the not-provisioned miss retries; a blind-pool error surfaces", () => {
    expect(tenantLookupRetryable(new Error("no workspace row for x@y (tenant not provisioned yet)"))).toBe(true);
    expect(tenantLookupRetryable(new Error("needs JOURNEY_DATABASE_URL (a read pool bound to the stage Postgres)"))).toBe(false);
    expect(tenantLookupRetryable(new Error("connection refused"))).toBe(false);
    expect(tenantLookupRetryable("needs JOURNEY_DATABASE_URL")).toBe(false);
    expect(tenantLookupRetryable(undefined)).toBe(false);
  });

  it("the read-only dossier discriminator: data-ssr-cause=showcase marks the unwritable seed", () => {
    expect(ssrCauseOfDocument('<html data-renderer="ssr" data-mounted data-ssr-cause="showcase">')).toBe("showcase");
    expect(ssrCauseOfDocument('<html data-renderer="spa" data-mounted>')).toBeNull();
  });
});
