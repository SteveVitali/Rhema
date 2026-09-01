import { z } from "zod";

// Canonical, disjoint, verbatim vocabularies (REQ-SPEC-2; Appendix D.2; cross-cutting invariant 1).
// These are the ONLY accepted terms; synonyms are lint-banned (eslint-plugin-rhema/no-banned-strings).
// The full sets are ratified in the spec; P0.01 seeds the ones later tickets extend.

export const PLANS = ["free", "starter", "pro", "team"] as const;
export type Plan = (typeof PLANS)[number];

/** Model tiers (§12.3). */
export const MODEL_TIERS = ["Base", "Balanced", "Frontier"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** Rigor levels (§6.1). */
export const RIGOR_LEVELS = ["Quick", "Standard", "Deep"] as const;
export type RigorLevel = (typeof RIGOR_LEVELS)[number];

/** Seats — the write-scoped identities in a run (§12; boundary hooks, P0.05). */
export const SEATS = ["author", "editor", "researcher", "harness"] as const;
export type Seat = (typeof SEATS)[number];

export const planSchema = z.enum(PLANS);
export const modelTierSchema = z.enum(MODEL_TIERS);
export const rigorLevelSchema = z.enum(RIGOR_LEVELS);
export const seatSchema = z.enum(SEATS);
