import { z } from "zod";

// Branded id types (§11.3, design/3 §3.2). IDs are ULIDs stored as text (sortable, no sequence
// contention). The brand is compile-time only; at runtime an id is a plain string. A single zod schema
// (`idSchema`) validates the ULID shape; `brandedId<T>()` gives a typed parser per entity.

export type Id<T extends string> = string & { readonly __brand: T };
export type Sha256 = string & { readonly __brand: "sha256" };

// Common entity ids used across contracts (the brands the spec names explicitly).
export type UserId = Id<"user">;
export type WorkspaceId = Id<"ws">;
export type ProjectId = Id<"proj">;
export type ArtifactId = Id<"art">;
export type ArtifactVersionId = Id<"artv">;
export type DraftId = Id<"draft">;
export type RunId = Id<"run">;
export type StepId = Id<"step">;
export type GateId = Id<"gate">;
export type PersonaId = Id<"persona">;
export type ProfileId = Id<"prof">;
export type SampleId = Id<"smp">;
export type CorrespondenceId = Id<"corr">;
export type ClaimId = Id<"claim">;
export type FindingId = Id<"find">;
export type DispositionId = Id<"disp">;
export type ObligationId = Id<"obl">;
export type AgentInstanceId = Id<"agi">;
export type ProtocolId = Id<"protocol">;
export type BillingAccountId = Id<"bill">;
export type LedgerEntryId = Id<"led">;
export type FigureId = Id<"fig">;

/** ISO-8601 timestamp string (the spec's `ISO` type). */
export type ISO = string;

// Crockford base32 (ULID) — 26 chars. We accept ULID; the migrator/seed generate ULIDs.
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** A ULID string; the shape every entity id takes. */
export const idSchema = z.string().regex(ULID_RE, "id must be a 26-char Crockford-base32 ULID");

/** A branded ULID parser for entity `T` (the brand is erased at runtime). */
export function brandedId<T extends string>(): z.ZodType<Id<T>> {
  return idSchema as unknown as z.ZodType<Id<T>>;
}

/** SHA-256, lowercase hex (64 chars) — content address of a stored object. */
export const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "sha256 must be 64 lowercase hex chars") as unknown as z.ZodType<Sha256>;

/** An http(s) URL. */
export const urlSchema = z.string().url();
/** ISO-8601 datetime string. */
export const isoSchema = z.string().datetime({ offset: true });
