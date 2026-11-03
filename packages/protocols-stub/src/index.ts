// @rhema/protocols (PUBLIC STUB — DORMANT) — REQ-ARCH-37 amended 2026-09-01, re-amended 2026-11-03.
//
// Formerly the export-time replacement for `@rhema/protocols` (dropped package + renamed stub).
// Per the operator ruling of 2026-11-02 (R6OSS.1; ADR-002 amendment; ADR-125), `packages/protocols`
// ships PUBLIC with the repository — this package is retained as a dormant escape-hatch shim in
// case the boundary ever reverses again. It carries the manifest TYPES and a single harmless
// fixture manifest — and deliberately NO rubric text, calibration language, skill prompts, or
// protocol markers (REQ-ARCH-33). The `public-safe` CI job still compiles it as the kept-warm
// fallback; nothing resolves `@rhema/protocols` to it today.

import type { Rigor, AgentTypeKey } from "@rhema/contracts";

/** Phase class routing category (§12.2 / §12.3). */
export type PhaseClass = "research" | "judge" | "generate" | "package";

/** A single phase in a workflow manifest (subset of the §12.2 shape; types only, no content). */
export interface PhaseManifest {
  key: string;
  index: number;
  label: string;
  skillPhase: string;
  seat: AgentTypeKey;
  artifacts: string[];
  predicates: string[];
  sidecars: string[];
  gateAfter?: string;
  /** the declared artifact whose produced version a `gateAfter` gate binds (stub parity; PRB.16b F19). */
  gateArtifact?: string;
  optional?: Rigor;
  phaseClass: PhaseClass;
  parallelGroup?: string;
  maxIterations?: number;
  budgetShare: number;
  backEdges?: string[];
  allowsSubagents: boolean;
}

export interface WorkflowManifest {
  workflow: string;
  phases: PhaseManifest[];
}

/**
 * The versioned (skill sha, manifest, parsers/serializers) trio recorded on every run and deploy
 * (REQ-SPEC-22 / REQ-ARCH-39). The stub reports a sentinel so provenance is well-formed; the private
 * package reports the real content-addressed version.
 */
export const PROTOCOLS_VERSION = "stub-0.0.0" as const;

/** A minimal, content-free fixture manifest so downstream packages have something real to type against. */
export const fixtureManifest: WorkflowManifest = {
  workflow: "fixture",
  phases: [
    {
      key: "noop",
      index: 0,
      label: "Fixture phase",
      skillPhase: "0",
      seat: "system",
      artifacts: [],
      predicates: [],
      sidecars: [],
      phaseClass: "package",
      budgetShare: 1,
      allowsSubagents: false,
    },
  ],
};

/** True when the private protocols package is NOT in use (the stub is the resolved implementation). */
export const IS_PROTOCOLS_STUB = true as const;

/**
 * Stub parity for `@rhema/protocols`' `SECOND_READ_PROMPT` (DEF.1) — the real constant is protocol IP
 * (REQ-ARCH-33), so the stub exports an empty placeholder; no public build ever runs a real phase.
 */
export const SECOND_READ_PROMPT = "" as const;
