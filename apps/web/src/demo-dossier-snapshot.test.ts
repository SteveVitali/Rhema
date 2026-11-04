// 218a_R7DEM.3b (REQ-DWEB-15; deliverable 7) — the committed demo dossier snapshot is checked
// against `DossierViewData` here because a package may not import from an app. The snapshot
// carries `DemoDossierDto` (the replayed variant: `runSummary` is the replayed card, `rigor`/
// `reviewedDraftId`/`accessReport` go absent); this test asserts every field the live dossier
// contract requires is present and correctly typed on the committed snapshot, and that the
// replayed fields ride the variant — never fabricated numerics.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DossierViewData } from "./dossier-view.js";
import type { DemoDossierDto } from "@rhema/api-client";

const SLUG = "the-borrowed-commons";
const SNAPSHOTS = fileURLToPath(
  new URL(
    "../../../packages/demo-corpus/fixtures/synthetic/snapshots",
    import.meta.url,
  ),
);

interface SnapshotEnvelope {
  readonly format: number;
  readonly kind: string;
  readonly essay: string;
  readonly key: string;
  readonly dto: unknown;
}

function dossier(runId: string): DemoDossierDto {
  const env = JSON.parse(
    readFileSync(join(SNAPSHOTS, SLUG, "dossier", `${runId}.json`), "utf8"),
  ) as SnapshotEnvelope;
  expect(env.format).toBe(1);
  expect(env.kind).toBe("dossier");
  expect(env.essay).toBe(SLUG);
  expect(env.key).toBe(runId);
  return env.dto as DemoDossierDto;
}

/** The fields `DossierViewData` requires — asserted structurally on the committed snapshot. */
const REQUIRED: readonly (keyof DossierViewData)[] = [
  "slug",
  "runId",
  "projectTitle",
  "versionLabel",
  "openObligations",
  "addressedObligations",
  "runSummary",
  "letterTitle",
  "letterSections",
  "claims",
  "fetchLog",
  "findings",
  "rubric",
];

describe("the committed dossier snapshot matches the dossier contract", () => {
  const d1 = dossier("v1-review");
  const d2 = dossier("v2-review");

  it("every required DossierViewData field is present and correctly typed", () => {
    for (const d of [d1, d2]) {
      for (const k of REQUIRED) expect(k in d, `missing ${k}`).toBe(true);
      expect(typeof d.slug).toBe("string");
      expect(typeof d.projectTitle).toBe("string");
      expect(typeof d.versionLabel).toBe("string");
      expect(typeof d.openObligations).toBe("number");
      expect(typeof d.addressedObligations).toBe("number");
      expect(typeof d.letterTitle).toBe("string");
      expect(Array.isArray(d.letterSections)).toBe(true);
      for (const s of d.letterSections) {
        expect(typeof s.id).toBe("string");
        expect(typeof s.title).toBe("string");
        expect(Array.isArray(s.paragraphs)).toBe(true);
      }
      expect(Array.isArray(d.claims)).toBe(true);
      expect(Array.isArray(d.fetchLog)).toBe(true);
      expect(Array.isArray(d.findings)).toBe(true);
      expect(Array.isArray(d.rubric)).toBe(true);
      for (const f of d.findings) {
        expect(typeof f.id).toBe("string");
        expect(typeof f.title).toBe("string");
        expect(typeof f.body).toBe("string");
      }
    }
  });

  it("the replayed run summary rides the variant — absent fields stay absent", () => {
    for (const d of [d1, d2]) {
      const card = d.runSummary.card;
      expect(card.replayed).toBe(true);
      expect(d.runSummary.createdAt).toBeNull();
      // the record holds no rigor/accessReport — the fields are absent, never zeroed
      expect(d.rigor).toBeUndefined();
      expect(d.accessReport).toBeUndefined();
      expect(d.demo?.notRecorded).toEqual(
        expect.arrayContaining(["rigor", "access_report", "fetch_log", "time", "credits", "model"]),
      );
      for (const k of ["spentCredits", "capCredits", "elapsedMs", "estimateCredits"])
        expect(k in card, k).toBe(false);
    }
  });

  it("a re-review dossier carries the prior round's rubric", () => {
    expect(d2.priorRubric).toEqual(d1.rubric);
  });
});
