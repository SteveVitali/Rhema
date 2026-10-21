// R5OPS.1 (REQ-OPS-4) — the committed first-finding ≤4-min measurement query, pinned by source
// scan + the exported SQL strings (the D-row carries FIRST_FINDING_QUERY verbatim).
import { describe, it, expect } from "vitest";
import { FIRST_FINDING_QUERY, FIRST_FINDING_SUMMARY } from "./first-finding-latency.mjs";

describe("first-finding-latency — the committed measurement query (REQ-OPS-4)", () => {
  it("joins signup.completed → first finding.viewed per user on non-test workspaces", () => {
    expect(FIRST_FINDING_QUERY).toContain("ae.event = 'signup.completed'");
    expect(FIRST_FINDING_QUERY).toContain("ae.event = 'finding.viewed'");
    expect(FIRST_FINDING_QUERY).toMatch(/not w\.is_test/g);
    expect(FIRST_FINDING_QUERY).toContain("min(ae.at) as first_finding_at");
  });
  it("measures minutes to first finding against the verbatim 4-minute bar", () => {
    expect(FIRST_FINDING_QUERY).toContain("extract(epoch from f.first_finding_at - s.signup_at) / 60.0");
    expect(FIRST_FINDING_QUERY).toContain("<= interval '4 minutes'");
    expect(FIRST_FINDING_QUERY).toContain("as within_4m");
  });
  it("honors the per-account analytics opt-out (REQ-PROD-15 read-time join)", () => {
    expect(FIRST_FINDING_QUERY).toContain('left join "user" u on u.id = ae.user_id');
    expect(FIRST_FINDING_QUERY).toContain("coalesce(u.analytics_opt_out, false) = false");
  });
  it("the summary aggregates the cohort (count, within-4m count, avg, p50)", () => {
    expect(FIRST_FINDING_SUMMARY).toContain("signups_with_findings");
    expect(FIRST_FINDING_SUMMARY).toContain("percentile_cont(0.5)");
    expect(FIRST_FINDING_SUMMARY).toContain("within_4m");
  });
  it("empty cohort is honestly labeled no-data, never evidence", () => {
    expect(FIRST_FINDING_QUERY).toBeTruthy();
    // the runner's printed note is the honesty marker.
    const src = String(FIRST_FINDING_SUMMARY) && require_fs();
    expect(src).toContain("empty cohort = no organic signups yet");
  });
});

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function require_fs() {
  return readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "first-finding-latency.mjs"),
    "utf8",
  );
}
