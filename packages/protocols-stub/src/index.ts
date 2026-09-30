// @rhema/protocols (PUBLIC STUB) — REQ-ARCH-37 amended, spec §13.2.
//
// This is the stub that a PUBLIC clone resolves `@rhema/protocols` to when the private checkout is
// absent (via RHEMA_PROTOCOLS_PATH + .pnpmfile.cjs). It carries the manifest TYPES and a single
// harmless fixture manifest so the engine/harness build and typecheck without the private repo — and
// deliberately NO rubric text, calibration language, skill prompts, or protocol markers (REQ-ARCH-33).
// The `public-safe` CI job builds exactly this.

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
