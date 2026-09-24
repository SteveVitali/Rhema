// P1.13 — the Review integration's deterministic half (§7.5; REQ-VIZ-13/14): the claim inventory
// consumes `provenance.json` + `data.csv` for figures INSERTED into the reviewed draft. This module
// derives the Tier-1 claim rows server-side (values from data.csv, labels + axis ranges from the
// spec, caption-comparison stubs for the reviewer) and mounts them as a `derived` server file for
// the Editor seat's hydration — the reviewer verifies each claim's refs (re-fetch/recompute) and
// its verdicts write back through the delivery transaction (mirror/delivery.ts). A figure whose
// provenance is `kind:"none"` inventories UNSUPPORTED by construction — the claims carry no refs.
//
// The mounted file is INPUT, never evidence: `assets/**` already mounts the underlying
// spec/data/provenance read-only for the seat, so a claim's refs name real paths the reviewer opens.

import {
  figureClaims,
  figureClaimsSupported,
  figureProvenanceSchema,
  parseFigureMarker,
  SPEC_FILENAME,
  type FigureClaim,
  type FigureProvenance,
  type FigureSpecKind,
} from "@rhema/contracts";
import { parseFigureCsv } from "@rhema/figures";
import type { ServerFile } from "@rhema/mirror";
import type { SqlClient } from "./tx.js";

/** The server file's mount path — a root `.rhema/` file is `derived` (never harvested, §12.2). */
export const FIGURE_CLAIMS_PATH = ".rhema/figure-claims.json";

/** One inserted figure's inventory block in `figure-claims.json`. */
export interface FigureClaimsFileEntry {
  readonly figureId: string;
  /** the figure's document-order number — the claims table groups under it (REQ-VIZ-14). */
  readonly figureNumber: number;
  /** the version the draft's marker pins. */
  readonly version: number;
  readonly specKind: FigureSpecKind;
  readonly provenanceKind: FigureProvenance["kind"];
  readonly verification: FigureProvenance["verification"];
  /** false ⇒ Unsupported by construction (kind:"none" — no refs, nothing to re-fetch). */
  readonly supported: boolean;
  /** the evidence paths the reviewer opens (mounted read-only under assets/**). */
  readonly evidence: { readonly provenance: string; readonly data: string | null; readonly spec: string };
  readonly claims: readonly FigureClaim[];
}

export interface FigureClaimsFile {
  readonly file: "figure-claims";
  readonly version: 1;
  /** the reviewed draft's ordinal the markers were read from. */
  readonly draftN: number;
  readonly figures: readonly FigureClaimsFileEntry[];
}

/** Spec-derived labels + axis ranges (deterministic — the reviewer's claim text needs no model). */
function specClaimsExtract(spec: unknown): { labels: string[]; axisRanges: { channel: string; min: unknown; max: unknown }[] } {
  const labels: string[] = [];
  const axisRanges: { channel: string; min: unknown; max: unknown }[] = [];
  if (typeof spec !== "object" || spec === null) return { labels, axisRanges };
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    const rec = node as Record<string, unknown>;
    if (typeof rec["title"] === "string" && rec["title"] !== "") labels.push(rec["title"] as string);
    const enc = rec["encoding"];
    if (typeof enc === "object" && enc !== null) {
      for (const [channel, def] of Object.entries(enc as Record<string, unknown>)) {
        if (typeof def !== "object" || def === null) continue;
        const d = def as Record<string, unknown>;
        if (typeof d["title"] === "string" && d["title"] !== "") labels.push(d["title"] as string);
        const scale = d["scale"];
        if (typeof scale === "object" && scale !== null) {
          const domain = (scale as Record<string, unknown>)["domain"];
          if (Array.isArray(domain) && domain.length === 2) {
            axisRanges.push({ channel, min: domain[0], max: domain[1] });
          }
        }
      }
    }
    for (const v of Object.values(rec)) if (typeof v === "object" && v !== null) walk(v);
  };
  walk(spec);
  return { labels: [...new Set(labels)], axisRanges };
}

async function headBytes(
  tx: SqlClient,
  store: { get(sha256: string): Promise<Uint8Array | null> },
  projectId: string,
  path: string,
): Promise<Uint8Array | null> {
  const row = (
    await tx.query(
      `select av.content_sha256 from artifacts a join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path = $2`,
      [projectId, path],
    )
  ).rows[0] as { content_sha256: string } | undefined;
  if (!row) return null;
  return store.get(row.content_sha256);
}

/**
 * Derive the figure-claims inventory for the reviewed draft: parse `drafts/v<N>.md`'s figure
// markers (document order → figureNumber), then per figure read its row + data.csv + spec and run
// the contract's deterministic claim extractor. Returns null when the draft carries no markers.
 */
export async function figureClaimsForDraft(
  tx: SqlClient,
  deps: { store: { get(sha256: string): Promise<Uint8Array | null> } },
  args: { projectId: string; draftN: number },
): Promise<FigureClaimsFile | null> {
  const draftBytes = await headBytes(tx, deps.store, args.projectId, `drafts/v${args.draftN}.md`);
  if (!draftBytes) return null;
  const markers = parseFigureMarker(Buffer.from(draftBytes).toString("utf8"));
  if (markers.length === 0) return null;

  const figures: FigureClaimsFileEntry[] = [];
  let figureNumber = 0;
  for (const m of markers) {
    figureNumber += 1;
    const row = (
      await tx.query(
        `select caption, alt, title, spec_kind, provenance from figures where id = $1 and project_id = $2`,
        [m.figureId, args.projectId],
      )
    ).rows[0] as
      | { caption: string | null; alt: string | null; title: string | null; spec_kind: string; provenance: unknown }
      | undefined;
    if (!row) continue; // a marker for an unknown/other-project figure contributes nothing
    const parsedProv = figureProvenanceSchema.safeParse(row.provenance);
    const provenance: FigureProvenance =
      parsedProv.success ? parsedProv.data : { kind: "none", refs: [], computedBy: "drafter", verification: "unverified" };
    const specKind = row.spec_kind as FigureSpecKind;
    const dir = `assets/figures/${m.figureId}`;

    const dataBytes = await headBytes(tx, deps.store, args.projectId, `${dir}/data.csv`);
    const rows = dataBytes
      ? (parseFigureCsv(Buffer.from(dataBytes).toString("utf8")) as Record<string, string | number>[])
      : [];
    const specBytes = await headBytes(tx, deps.store, args.projectId, `${dir}/${SPEC_FILENAME[specKind]}`);
    let spec: unknown = null;
    if (specKind === "vega_lite" && specBytes) {
      try {
        spec = JSON.parse(Buffer.from(specBytes).toString("utf8"));
      } catch {
        spec = null;
      }
    }
    const { labels, axisRanges } = specClaimsExtract(spec);

    const claims = figureClaims({
      figure: {
        id: m.figureId,
        caption: row.caption ?? "",
        title: row.title ?? "",
        specKind,
        provenance,
      },
      figureNumber,
      rows,
      labels,
    });
    // axis ranges ride the same ordinal stream — the spec asserts the extent; the reviewer
    // re-checks it against data.csv's computed min/max.
    let ordinal = claims.length;
    for (const r of axisRanges) {
      claims.push({
        figureId: m.figureId,
        figureNumber,
        ordinal: ++ordinal,
        kind: "axis_range",
        text: `axis ${r.channel}: ${String(r.min)}–${String(r.max)}`,
        refs: figureClaimsSupported(provenance) ? provenance.refs : [],
      });
    }
    figures.push({
      figureId: m.figureId,
      figureNumber,
      version: m.version,
      specKind,
      provenanceKind: provenance.kind,
      verification: provenance.verification,
      supported: figureClaimsSupported(provenance),
      evidence: {
        provenance: `${dir}/provenance.json`,
        data: dataBytes ? `${dir}/data.csv` : null,
        spec: `${dir}/${SPEC_FILENAME[specKind]}`,
      },
      claims,
    });
  }
  if (figures.length === 0) return null;
  return { file: "figure-claims", version: 1, draftN: args.draftN, figures };
}

/**
 * The hydration seam (REQ-VIZ-13): a review/fact_check run's Editor hydration mounts
// `.rhema/figure-claims.json` for the reviewed draft's inserted figures. Bound like
// `obligationMount` — the api injects the provider closed over the workspace store factory.
 */
export interface FigureClaimsMountProvider {
  forHydration(
    exec: SqlClient,
    args: { runId: string; projectId: string; draftN: number; workflow: string },
  ): Promise<ServerFile | null>;
}

/** Build the mount provider over the workspace-bound store factory (same seam shape as the api's
 *  `contentStoreFor`). Returns null when the draft has no figure markers — no file, no mount. */
export function figureClaimsMountProvider(
  contentStoreFor: (workspaceId: string) => Promise<{ get(sha256: string): Promise<Uint8Array | null> }>,
  workspaceId: string,
): FigureClaimsMountProvider {
  return {
    async forHydration(exec, args) {
      const store = await contentStoreFor(workspaceId);
      const claims = await figureClaimsForDraft(exec, { store }, { projectId: args.projectId, draftN: args.draftN });
      if (!claims) return null;
      return {
        path: FIGURE_CLAIMS_PATH,
        root: "project",
        bytes: new TextEncoder().encode(JSON.stringify(claims, null, 2)),
        kind: "sidecar",
        namespace: "shared",
      };
    },
  };
}
