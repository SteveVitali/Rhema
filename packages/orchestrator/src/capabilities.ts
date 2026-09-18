// Model routing validated against the §12.3 phase-class capability table (REQ-ARCH-9/10).
//
// Routing is by PHASE CLASS. A model profile is `{tier, overrides}`; the API rejects an override whose
// provider lacks the class's capabilities (AC6). Research phases stay on Anthropic at MVP because only
// Anthropic exposes search + fetch + fresh-context fan-out inside the harness (§12.3); a profile that routes a
// research phase to a provider without those server tools is refused at run creation.

import { PROVIDERS } from "@rhema/contracts";
import type { ModelTier } from "@rhema/contracts";

/** The four phase classes routing keys on (mirrors @rhema/protocols `PhaseClass`). */
export const PHASE_CLASSES = ["research", "judge", "generate", "package"] as const;
export type PhaseClass = (typeof PHASE_CLASSES)[number];

export type Provider = (typeof PROVIDERS)[number]; // "anthropic" | "openai" | "google"

/** Fine-grained capabilities a phase class may require of a provider (§12.3 "Needs" column). */
export type Capability =
  | "web_search"
  | "web_fetch"
  | "pdf"
  | "subagent_fanout"
  | "file_rw"
  | "long_context"
  | "read"
  | "write";

/** §12.3 "Needs": what each phase class requires of whatever provider serves it. */
export const PHASE_CLASS_REQUIREMENTS: Readonly<Record<PhaseClass, readonly Capability[]>> = {
  // search + fetch + PDF + fan-out + file R/W (verification, discourse, grounding, response research, close-reading)
  research: ["web_search", "web_fetch", "pdf", "subagent_fanout", "file_rw"],
  judge: ["long_context", "read"], //     long context + Read
  generate: ["long_context", "write"], // long context + Write; single context
  package: ["read", "write"], //          Read/Write
};

/**
 * What each provider can do inside the harness at MVP. Only Anthropic (the direct API) exposes the server
 * tools + fresh-context fan-out; Vertex (1.x) is a re-host of Claude that LACKS those server tools and is
 * reserved for non-Anthropic models; openai/google likewise have no in-harness search/fetch/fan-out. Non-
 * Anthropic providers enter only through @rhema/harness for judge/generate/chat (REQ-ARCH-10).
 */
export const PROVIDER_CAPABILITIES: Readonly<Record<Provider, ReadonlySet<Capability>>> = {
  anthropic: new Set<Capability>([
    "web_search",
    "web_fetch",
    "pdf",
    "subagent_fanout",
    "file_rw",
    "long_context",
    "read",
    "write",
  ]),
  openai: new Set<Capability>(["long_context", "read", "write"]),
  google: new Set<Capability>(["long_context", "read", "write"]),
};

/** A per-phase-class routing override on a model profile (§12.3 `{tier, overrides}`). */
export interface PhaseClassOverride {
  readonly phaseClass: PhaseClass;
  readonly provider: Provider;
  readonly model?: string;
}

export interface ModelProfile {
  readonly tier: ModelTier;
  /** Per-phase-class provider/model overrides; absent = the tier default (Anthropic at MVP). */
  readonly overrides?: readonly PhaseClassOverride[];
}

export interface CapabilityRejection {
  readonly phaseClass: PhaseClass;
  readonly provider: Provider;
  readonly missing: Capability[];
}

export type ValidationResult = { ok: true } | { ok: false; rejections: CapabilityRejection[] };

/** The tier default provider is Anthropic at MVP (§12.3): every class routes to Anthropic unless overridden. */
export const DEFAULT_PROVIDER: Provider = "anthropic";

function missingFor(provider: Provider, phaseClass: PhaseClass): Capability[] {
  const have = PROVIDER_CAPABILITIES[provider];
  return PHASE_CLASS_REQUIREMENTS[phaseClass].filter((cap) => !have.has(cap));
}

/**
 * Validate a model profile against the capability table for exactly the phase classes a run will execute
 * (REQ-ARCH-9). An override whose provider is missing a required capability for its class is rejected; a class
 * with no override uses the Anthropic default, which satisfies every class. Returns every rejection (not just
 * the first) so the run sheet can report all of them.
 */
export function validateModelProfile(
  profile: ModelProfile | undefined,
  phaseClassesUsed: readonly PhaseClass[],
): ValidationResult {
  const used = new Set(phaseClassesUsed);
  const rejections: CapabilityRejection[] = [];
  for (const override of profile?.overrides ?? []) {
    if (!used.has(override.phaseClass)) continue; // an override for a class this run never runs is inert
    const missing = missingFor(override.provider, override.phaseClass);
    if (missing.length > 0) {
      rejections.push({ phaseClass: override.phaseClass, provider: override.provider, missing });
    }
  }
  return rejections.length === 0 ? { ok: true } : { ok: false, rejections };
}

export class ModelProfileRejectedError extends Error {
  constructor(readonly rejections: CapabilityRejection[]) {
    super(
      `model profile rejected: ${rejections
        .map((r) => `${r.phaseClass}→${r.provider} lacks ${r.missing.join(", ")}`)
        .join("; ")}`,
    );
    this.name = "ModelProfileRejectedError";
  }
}
