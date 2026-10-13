import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ANALYTICS_EVENT_NAMES, CLIENT_ANALYTICS_EVENT_NAMES, type AnalyticsEventName } from "@rhema/contracts";
import { BETA_EMISSION_AUDIT, emissionAuditByStatus } from "./emission-audit.js";

// PRB.12 — AC1's audit half: "every beta surface emits its catalogued events". The map must classify
// every catalogue event exactly once; each `emitted` row must name a file that actually contains the
// event literal (a drift guard — an emitter renamed away flips this red); each `beta_absent` row must
// carry the documented reason (the ticket's named exclusions among them).

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** Cache of repo-relative source file → text (lazy). */
const fileText = new Map<string, string>();
function sourceText(repoRel: string): string | null {
  if (!fileText.has(repoRel)) {
    const abs = join(REPO, repoRel);
    fileText.set(repoRel, existsSync(abs) ? readFileSync(abs, "utf8") : "");
  }
  return fileText.get(repoRel) ?? null;
}

describe("BETA_EMISSION_AUDIT — every catalogued event classified exactly once", () => {
  it("covers the whole catalogue, no extras", () => {
    expect(Object.keys(BETA_EMISSION_AUDIT).sort()).toEqual([...ANALYTICS_EVENT_NAMES].sort());
  });

  it("every `emitted` row's file exists and contains the event literal (AC1)", () => {
    const emitted = emissionAuditByStatus().emitted;
    expect(emitted.length).toBeGreaterThan(0);
    for (const name of emitted) {
      const entry = BETA_EMISSION_AUDIT[name];
      expect(entry.source, `${name} emitted but names no source`).toBeTruthy();
      const text = sourceText(entry.source!);
      expect(text, `${name}: ${entry.source} must exist`).toBeTruthy();
      expect(
        text!.includes(`"${name}"`) || text!.includes(`'${name}'`),
        `${name}: ${entry.source} must contain the event literal`,
      ).toBe(true);
    }
  });

  it("every web-emitted event is on the client whitelist — an unlisted one would 403 + drop silently", () => {
    for (const name of emissionAuditByStatus().emitted) {
      const entry = BETA_EMISSION_AUDIT[name];
      if (entry.source === "apps/web/src/server.ts") {
        expect(
          CLIENT_ANALYTICS_EVENT_NAMES.has(name),
          `${name} emits through POST /analytics/events but is not in CLIENT_ANALYTICS_EVENTS`,
        ).toBe(true);
      }
    }
  });

  it("every `materialized` row names the projector's source rows", () => {
    for (const name of emissionAuditByStatus().materialized) {
      const entry = BETA_EMISSION_AUDIT[name];
      expect(entry.source, `${name} materialized but names no source`).toContain("materializeRunAnalytics");
    }
  });

  it("every `beta_absent` row carries a documented reason; the ticket's named exclusions are absent", () => {
    for (const name of emissionAuditByStatus().beta_absent) {
      expect(BETA_EMISSION_AUDIT[name].reason, `${name} beta_absent without a reason`).toBeTruthy();
    }
    for (const excluded of ["triage.mode_entered", "finding.applied"] as AnalyticsEventName[]) {
      expect(BETA_EMISSION_AUDIT[excluded].status).toBe("beta_absent");
    }
  });
});

// D-CAP.1-2 (CAP.3) — the REVERSE sweep the forward map cannot see: an emitter that names an
// UNCATALOGUED event writes a row the audit never classifies (the intake 403s it — a silent drop),
// and an emitter the map calls `beta_absent`/`materialized` is a live contradiction. The stream
// cannot find either — it only sees what landed — so this leg scans every emission idiom in the
// source: the web `emit(session, "x.y")` sink, the api `recordAnalyticsEvent({ event: "x.y" })`
// mints, and the client beacons' `event:"x.y"` payloads. The zero-*uninstrumented*-surface half
// (a surface that emits nothing leaves no trace) stays the live leg named in the D-CAP.1-2 row.
describe("reverse emission sweep — every emitted literal is catalogued + classified", () => {
  function* sources(dir: string): Generator<string> {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.name === "node_modules" || ent.name === "dist" || ent.name === "testing") continue;
      if (ent.isDirectory()) yield* sources(p);
      else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.endsWith(".test.ts") && !ent.name.endsWith(".d.ts")) yield p;
    }
  }

  // the emission idioms: `emit(session, "x.y"` (web) · `event: "x.y"` / `event:"x.y"` (api mints +
  // client beacons). Bare `"x.y"` literals elsewhere are not emission sites (run_events ride `type:`).
  const IDIOM = /(?:emit\([^,()]*,|event:)\s*"([a-z_]+\.[a-z_]+)"/g;

  const swept = new Map<string, string[]>(); // literal → files
  for (const root of [join(REPO, "apps"), join(REPO, "packages")]) {
    for (const file of sources(root)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(IDIOM)) {
        const name = m[1]!;
        const rel = file.slice(REPO.length).replace(/^\/+/, "");
        swept.set(name, [...(swept.get(name) ?? []), rel]);
      }
    }
  }

  it("the sweep sees the known emitters (not vacuous)", () => {
    expect(swept.size).toBeGreaterThanOrEqual(20);
    for (const known of ["run.report_viewed", "signup.completed", "project.exported", "landing.viewed"]) {
      expect(swept.has(known), `sweep missed ${known}`).toBe(true);
    }
  });

  it("every emitted literal is a catalogued AnalyticsEventName", () => {
    for (const [name, files] of swept) {
      expect(
        (ANALYTICS_EVENT_NAMES as readonly string[]).includes(name),
        `"${name}" emitted in ${files.join(", ")} but absent from the catalogue — the intake would 403 + drop it`,
      ).toBe(true);
    }
  });

  it("every emitted literal is classified `emitted` in BETA_EMISSION_AUDIT (a silent emitter is impossible)", () => {
    for (const [name, files] of swept) {
      const status = BETA_EMISSION_AUDIT[name as AnalyticsEventName]?.status;
      expect(
        status,
        `"${name}" emitted in ${files.join(", ")} but unclassified in BETA_EMISSION_AUDIT`,
      ).toBe("emitted");
    }
  });
});
