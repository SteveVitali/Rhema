// Serializers (REQ-SPEC-9; gate write-back, review 13 F1). The exact inverse of the sidecar parsers:
// `rows → response-ledger.md (+ .json)`, `rows → structure-plan.md (+ .json)`, `rows → cut-list.md
// (+ .json)`. When a gate with structured edits is approved, the orchestrator (P0.10) serializes the
// post-decision rows into a new user-authored artifact version so the edits reach the files the next
// phase reads — not only a `guidance` string (§12.10: files are the only inter-phase interface). Only
// the three editable/write-back artifacts have serializers; the read-only sidecars (findings, rubric,
// claim ledger) are never edited as rows and so have parsers only. Round-trip is golden-tested on the
// three real projects: `parse(serialize(rows)) ≡ rows` (../parsers, ../test/roundtrip.test.ts).

import {
  cutListSidecarSchema,
  responseLedgerSidecarSchema,
  structurePlanSidecarSchema,
  type CutListSidecar,
  type ResponseLedgerSidecar,
  type StructurePlanSidecar,
} from "@rhema/contracts";
import {
  renderCutListMd,
  renderResponseLedgerMd,
  renderStructurePlanMd,
} from "../src/md-twins.js";

/** The pair a serializer emits: the human markdown deliverable and its authoritative sidecar JSON. */
export interface SerializedArtifact {
  markdown: string;
  json: string;
}

/** Canonical sidecar JSON (pretty, trailing newline) — the authoritative twin the parser validates. */
function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export function serializeResponseLedger(rows: ResponseLedgerSidecar): SerializedArtifact {
  const value = responseLedgerSidecarSchema.parse(rows); // normalize/validate before emitting
  return { markdown: renderResponseLedgerMd(value), json: toJson(value) };
}

export function serializeStructurePlan(rows: StructurePlanSidecar): SerializedArtifact {
  const value = structurePlanSidecarSchema.parse(rows);
  return { markdown: renderStructurePlanMd(value), json: toJson(value) };
}

export function serializeCutList(rows: CutListSidecar): SerializedArtifact {
  const value = cutListSidecarSchema.parse(rows);
  return { markdown: renderCutListMd(value), json: toJson(value) };
}

/** The write-back sidecar filenames that have a serializer (the inverse subset of the parsers). */
export const SERIALIZABLE_SIDECARS = [
  "response-ledger.json",
  "structure-plan.json",
  "cut-list.json",
] as const;
export type SerializableSidecar = (typeof SERIALIZABLE_SIDECARS)[number];

/** Dispatch a serializer by its canonical (sidecar) filename. */
export function serializeSidecar(filename: SerializableSidecar, rows: unknown): SerializedArtifact {
  switch (filename) {
    case "response-ledger.json":
      return serializeResponseLedger(rows as ResponseLedgerSidecar);
    case "structure-plan.json":
      return serializeStructurePlan(rows as StructurePlanSidecar);
    case "cut-list.json":
      return serializeCutList(rows as CutListSidecar);
  }
}
