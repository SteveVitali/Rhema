import { z } from "zod";

// Canonical, disjoint, verbatim vocabularies (REQ-SPEC-2; REQ-PROD-6; §4.3; Appendix D.2; cross-cutting
// invariant 1). P0.02 owns every shared name; these are the ONLY accepted terms. The *enum values* are
// the machine tokens stored in the DB and carried in contracts; the *display* strings (reserved in
// Appendix D.2) are the user-facing renderings, mapped by the i18n table (never re-spelled by later code).
// Synonyms are lint-banned (eslint-plugin-rhema/no-banned-strings, seeded from ./reserved-strings). The
// P0.01 placeholder values ('starter'/'pro'; 'Deep'; 'researcher'/'harness') are superseded here — no
// synonym survives (REQ-IDE-50: architecture may extend, never rename).

// ---------- plans / subscription tiers (§4.3, §14.2; Subscription.tier §11.3) ----------
/** Subscription tier enum values; display: Free · Writer · Studio · Studio Max · Team. "Trial" is a state of Free, never a tier. */
export const PLAN_TIERS = ["free", "writer", "studio", "studio_max", "team"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];
/** Display names, index-aligned with PLAN_TIERS (the reserved plan strings, Appendix D.2). */
export const PLAN_DISPLAY: Record<PlanTier, string> = {
  free: "Free",
  writer: "Writer",
  studio: "Studio",
  studio_max: "Studio Max",
  team: "Team",
};

// ---------- model tiers (§4.3, §12.3; ModelTier §11.3) ----------
/** Model tier enum values; display: Base · Balanced · Frontier. "QualityTier" does not exist (REQ-IDE-50). */
export const MODEL_TIERS = ["base", "balanced", "frontier"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];
export const MODEL_TIER_DISPLAY: Record<ModelTier, string> = {
  base: "Base",
  balanced: "Balanced",
  frontier: "Frontier",
};

// ---------- rigor (§4.3, §6.1; Rigor §11.3) ----------
/** Rigor notch enum values; display: Quick · Standard · Full board. The one first-class cost lever. */
export const RIGORS = ["quick", "standard", "full_board"] as const;
export type Rigor = (typeof RIGORS)[number];
export const RIGOR_DISPLAY: Record<Rigor, string> = {
  quick: "Quick",
  standard: "Standard",
  full_board: "Full board",
};

// ---------- seats / agent types (§4.3, §6.6; AgentTypeKey §11.3) ----------
/** The five seats (REQ-SPEC-21). 'author' displays as Drafter; 'system' displays as Rhema. */
export const AGENT_TYPE_KEYS = [
  "author",
  "editor",
  "assistant",
  "persona_builder",
  "system",
] as const;
export type AgentTypeKey = (typeof AGENT_TYPE_KEYS)[number];
/** Reserved seat display strings (Appendix D.2). "author"/"authored" are reserved for the human (REQ-PROD-1). */
export const SEAT_DISPLAY: Record<AgentTypeKey, string> = {
  author: "Drafter",
  editor: "Editor",
  assistant: "Assistant",
  persona_builder: "Persona builder",
  system: "Rhema",
};

// ---------- approval policy / autonomy (§6.4; ApprovalPolicy §11.3) ----------
export const APPROVAL_POLICIES = ["named", "wait_each", "run_to_completion"] as const;
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];

export const planTierSchema = z.enum(PLAN_TIERS);
export const modelTierSchema = z.enum(MODEL_TIERS);
export const rigorSchema = z.enum(RIGORS);
export const agentTypeKeySchema = z.enum(AGENT_TYPE_KEYS);
export const approvalPolicySchema = z.enum(APPROVAL_POLICIES);

/**
 * Every canonical enum whose values must never collide across classes (the disjointness invariant of
 * REQ-SPEC-2 / REQ-PROD-6). The contract test asserts pairwise-disjoint value sets, and that every value
 * is lower_snake (a machine token), never a reserved display string leaking into an enum.
 */
export const CANONICAL_VOCAB = {
  plan: PLAN_TIERS,
  modelTier: MODEL_TIERS,
  rigor: RIGORS,
  seat: AGENT_TYPE_KEYS,
  approvalPolicy: APPROVAL_POLICIES,
} as const;
