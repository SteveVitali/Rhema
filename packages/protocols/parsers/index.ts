// Sidecar parsers (ledger F10; REQ-SPEC-12 / REQ-DATA-7 amended). Each parser turns a structured-output
// sidecar (the machine-readable twin of a markdown deliverable, §11.1) into typed rows, validating it
// against its P0.02 zod schema. The sidecar is authoritative; where a structured markdown twin also
// exists (the three write-back artifacts serialized by ../serializers), the parser cross-checks the two
// and a mismatch is a validation failure. There is no partial: `parseStatus` is `ok | failed` only
// (REQ-DATA-7 amended — a schema/parse/mismatch failure is `failed(validation)`, never a silent partial
// completion). The parsers/serializers are half of the versioned trio in ../src/version.ts.

import {
  claimLedgerSidecarSchema,
  cutListSidecarSchema,
  findingsSidecarSchema,
  responseLedgerSidecarSchema,
  rubricSidecarSchema,
  structurePlanSidecarSchema,
  SIDECAR_REGISTRY,
  type ClaimLedgerSidecar,
  type ClaimSourceStance,
  type ClaimVerdict,
  type CutListSidecar,
  type FindingsSidecar,
  type ResponseLedgerSidecar,
  type RubricSidecar,
  type SidecarFilename,
  type StructurePlanSidecar,
} from "@rhema/contracts";
import { z } from "zod";
import {
  parseCutListMd,
  parseResponseLedgerMd,
  parseStructurePlanMd,
} from "../src/md-twins.js";

/** A parse outcome. `parseStatus` is `ok | failed` only — never a partial row set (REQ-DATA-7 amended). */
export type ParseResult<T> =
  | { parseStatus: "ok"; value: T }
  | { parseStatus: "failed"; errors: string[] };

type ClaimSidecarRow = ClaimLedgerSidecar["claims"][number];

function zodErrors(e: unknown): string[] {
  if (e instanceof z.ZodError) return e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return [String(e instanceof Error ? e.message : e)];
}

/** Canonical (sorted-key) JSON — the equality used for the markdown ↔ sidecar cross-check and round-trip. */
function canonical(value: unknown): string {
  const seen = new WeakSet();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) throw new Error("cycle");
    seen.add(v);
    if (Array.isArray(v)) return v.map(norm);
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = norm(o[k]);
    return out;
  };
  return JSON.stringify(norm(value));
}

/** Validate a sidecar JSON, and (when a structured markdown twin is supplied) cross-check it. */
function parseWithSchema<S extends z.ZodTypeAny>(
  schema: S,
  json: unknown,
  markdown: string | undefined,
  parseMd: ((md: string) => unknown) | undefined,
): ParseResult<z.output<S>> {
  let value: z.output<S>;
  try {
    value = schema.parse(json);
  } catch (e) {
    return { parseStatus: "failed", errors: zodErrors(e) };
  }
  if (markdown !== undefined && parseMd) {
    let mdValue: z.output<S>;
    try {
      mdValue = schema.parse(parseMd(markdown));
    } catch (e) {
      return { parseStatus: "failed", errors: ["markdown twin: ", ...zodErrors(e)] };
    }
    if (canonical(value) !== canonical(mdValue)) {
      return {
        parseStatus: "failed",
        errors: ["markdown ↔ sidecar mismatch: the sidecar is authoritative and the two disagree (REQ-SPEC-12)"],
      };
    }
  }
  return { parseStatus: "ok", value };
}

// ---------------- read-only sidecars (json only; their markdown is the prose deliverable) ----------------

export function parseFindings(json: unknown): ParseResult<FindingsSidecar> {
  return parseWithSchema(findingsSidecarSchema, json, undefined, undefined);
}

export function parseRubric(json: unknown): ParseResult<RubricSidecar> {
  return parseWithSchema(rubricSidecarSchema, json, undefined, undefined);
}

// ---------------- claim ledger (+ claim_sources stance edges, REQ-OBJ-18) ----------------

/** A `claim_sources` row (§11.4 DDL). `claim_id` is assigned at insert (P0.09); rows link by the claim's
 *  ordinal in the sidecar plus a per-claim source `ordinal` (matching the DDL primary key shape). */
export interface ClaimSourceRow {
  claimOrdinal: number;
  ordinal: number;
  url: string;
  normalizedUrl: string;
  accessedAt: string;
  stance: ClaimSourceStance;
  note?: string;
}

/** The per-verdict "verdict-determining" stance whose first source backs the singular `url` (REQ-OBJ-18).
 *  `null` where no source determines the verdict (nothing supported it / could not be checked). */
export function verdictDeterminingStance(verdict: ClaimVerdict): ClaimSourceStance | null {
  switch (verdict) {
    case "verified":
    case "substantially_accurate":
    case "verified_against_user_source":
      return "supports";
    case "contradicted":
      return "contradicts";
    case "misleading_in_context":
      return "contextualizes";
    case "unsupported":
    case "unverifiable":
      return null;
  }
}

/** The source whose `url` is the claim's singular `url` = sources[0] of the verdict-determining stance. */
export function verdictDeterminingSource(
  claim: Pick<ClaimSidecarRow, "verdict" | "sources">,
): { url: string; normalizedUrl: string; accessedAt: string; stance: ClaimSourceStance; note?: string } | null {
  const stance = verdictDeterminingStance(claim.verdict);
  if (!stance || !claim.sources) return null;
  return claim.sources.find((s) => s.stance === stance) ?? null;
}

export type ClaimLedgerParse = { parseStatus: "ok"; value: ClaimLedgerSidecar; claimSources: ClaimSourceRow[] } | {
  parseStatus: "failed";
  errors: string[];
};

export function parseClaimLedger(json: unknown): ClaimLedgerParse {
  const base = parseWithSchema(claimLedgerSidecarSchema, json, undefined, undefined);
  if (base.parseStatus === "failed") return base;
  const value = base.value;
  const claimSources: ClaimSourceRow[] = [];
  const errors: string[] = [];
  for (const claim of value.claims) {
    if (!claim.sources?.length) continue;
    claim.sources.forEach((s, i) => {
      claimSources.push({
        claimOrdinal: claim.ordinal,
        ordinal: i,
        url: s.url,
        normalizedUrl: s.normalizedUrl,
        accessedAt: s.accessedAt,
        stance: s.stance,
        ...(s.note !== undefined ? { note: s.note } : {}),
      });
    });
    // REQ-OBJ-18 invariant: the singular url is sources[0] of the verdict-determining stance.
    const determining = verdictDeterminingSource(claim);
    if (claim.url !== undefined && determining && claim.url !== determining.url) {
      errors.push(
        `claim ordinal ${claim.ordinal}: singular url (${claim.url}) does not equal sources[0] of the ` +
          `verdict-determining stance "${determining.stance}" (${determining.url}) — REQ-OBJ-18`,
      );
    }
  }
  if (errors.length) return { parseStatus: "failed", errors };
  return { parseStatus: "ok", value, claimSources };
}

// ---------------- write-back sidecars (json + optional structured markdown twin) ----------------

export function parseResponseLedger(json: unknown, markdown?: string): ParseResult<ResponseLedgerSidecar> {
  return parseWithSchema(responseLedgerSidecarSchema, json, markdown, parseResponseLedgerMd);
}

export function parseStructurePlan(json: unknown, markdown?: string): ParseResult<StructurePlanSidecar> {
  return parseWithSchema(structurePlanSidecarSchema, json, markdown, parseStructurePlanMd);
}

export function parseCutList(json: unknown, markdown?: string): ParseResult<CutListSidecar> {
  return parseWithSchema(cutListSidecarSchema, json, markdown, parseCutListMd);
}

/** Every sidecar filename that has a parser — the contract test asserts this covers SIDECAR_REGISTRY. */
export const PARSERS: Record<SidecarFilename, (json: unknown, markdown?: string) => ParseResult<unknown>> = {
  "findings.json": (j) => parseFindings(j),
  "01-claim-ledger.json": (j) => parseClaimLedger(j),
  "rubric.json": (j) => parseRubric(j),
  "response-ledger.json": (j, m) => parseResponseLedger(j, m),
  "structure-plan.json": (j, m) => parseStructurePlan(j, m),
  "cut-list.json": (j, m) => parseCutList(j, m),
};

/** Dispatch a sidecar by its canonical filename (data-driven, matching SIDECAR_REGISTRY). */
export function parseSidecar(
  filename: SidecarFilename,
  input: { json: unknown; markdown?: string },
): ParseResult<unknown> {
  const parser = PARSERS[filename];
  if (!parser) return { parseStatus: "failed", errors: [`no parser for sidecar "${filename}"`] };
  // touch the registry so the parser set and the schema registry stay in lockstep (fails fast on drift).
  if (!(filename in SIDECAR_REGISTRY)) return { parseStatus: "failed", errors: [`unknown sidecar "${filename}"`] };
  return parser(input.json, input.markdown);
}
