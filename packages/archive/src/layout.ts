// The whole-account zip layout (REQ-ACCT-3; §13.4). One deterministic structure shared by
// buildAccountZip (export) and importAccountZip (import):
//
//   manifest.json            — version + counts + the full {path → sha256} file index
//   state.json               — the portable row records the importer replays (ORIGINAL ids; the
//                              importer derives new ids — nothing in the zip is workspace-bound)
//   ledger.csv               — the §14.5 usage CSV (debit rows; RFC-4180)
//   projects/<slug>/…        — every project artifact at its mirror path (agents/editor/* excluded —
//                              the Editor's working tree is internal, §11.1) + a generated
//                              manifest.md + a project.json row record
//   voices/<slug>/…          — every persona artifact at its mirror path (PERSONA.md, docs/,
//                              profile/ incl. the calibration report) + samples/<item>-v<n>.md
//                              (canonical markdown) + voice.json
//
// Determinism: files are added in sorted path order, every entry is stamped with the export
// instant, and all content is either verbatim store bytes or generated from row data — the same
// account builds the same zip.

export const ARCHIVE_ZIP_VERSION = 1 as const;

/** One exported artifact file's row record (state.json) — original ids, portable shape. */
export interface ArchiveArtifactRow {
  /** "project" | "persona" — which scope key the row's `scopeId` names. */
  readonly scope: "project" | "persona";
  /** the ORIGINAL project/persona id (mapped on import). */
  readonly scopeId: string;
  readonly path: string;
  readonly kind: string;
  readonly namespace: string;
  readonly sha256: string;
  readonly byteLen: number;
  readonly wordCount: number | null;
  readonly mediaType: string;
  readonly createdBy: unknown;
  readonly createdAt: string;
  readonly immutable: boolean;
  readonly ordinal: number;
  readonly blockIdMap: unknown;
}

export interface ArchiveProjectRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly protocolId: string | null;
  readonly protocolVersion: number;
  readonly venue: string | null;
  readonly rigorDefault: string;
  readonly modelTierDefault: string | null;
  readonly approvalPolicy: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
}

export interface ArchiveDraftRow {
  readonly projectId: string;
  readonly n: number;
  readonly origin: string;
  readonly state: string;
  /** the draft's canonical artifact path (`drafts/v<n>.md`) — resolves its version on import. */
  readonly artifactPath: string | null;
  readonly baseDraftN: number | null;
  readonly frozenAt: string | null;
  readonly createdAt: string;
}

export interface ArchiveProvenanceRow {
  /** identifies the artifact version the map belongs to (project artifact by path). */
  readonly projectId: string;
  readonly artifactPath: string;
  readonly granularity: string;
  readonly spans: unknown;
}

export interface ArchiveFigureRow {
  readonly id: string;
  readonly projectId: string;
  readonly specKind: string;
  readonly title: string | null;
  readonly caption: string | null;
  readonly alt: string | null;
  readonly sourceLine: string | null;
  readonly provenance: unknown;
  readonly createdAt: string | null;
}

export interface ArchiveFigureVersionRow {
  readonly figureId: string;
  readonly ordinal: number;
  readonly request: string | null;
  readonly createdAt: string;
}

export interface ArchivePersonaRow {
  readonly id: string;
  readonly slug: string | null;
  readonly displayName: string | null;
  readonly byline: string | null;
  readonly mode: string;
  readonly kind: string;
  readonly provenance: string | null;
  readonly registers: readonly string[] | null;
  readonly seedAuthoredBy: string | null;
}

export interface ArchiveConnectionRow {
  readonly personaId: string;
  readonly provider: string;
  readonly handle: string | null;
  readonly status: string | null;
  readonly schedule: string | null;
  readonly autoIncludeNew: boolean | null;
}

export interface ArchiveDiscoveredItemRow {
  readonly id: string;
  readonly personaId: string;
  readonly provider: string;
  readonly externalId: string | null;
  readonly title: string | null;
  readonly url: string | null;
  readonly date: string | null;
  readonly wordCount: number | null;
  readonly state: string;
}

export interface ArchiveSampleRow {
  readonly discoveredItemId: string;
  readonly n: number;
  readonly sha256: string;
  readonly wordCount: number | null;
  readonly quality: string | null;
}

/** §11.7 — the requesting user's preference-profile rows (exported with the account; the importer
 *  intentionally leaves a fresh account's own prefs alone). */
export interface ArchivePreferencesRow {
  readonly userId: string;
  readonly appTheme: string | null;
  readonly projectGroupBy: string | null;
  readonly analyticsOptOut: boolean;
  readonly consentDontAskUnder: number;
  readonly dismissedExplainers: readonly string[];
  /** P1.20 (§11.7/Q-26) — the "user".prefs blob: the account defaults + the preference-profile
   *  opt-out flag ride the account zip; the profile dies with the account. */
  readonly prefs?: Record<string, unknown>;
}

export interface ArchiveState {
  readonly version: typeof ARCHIVE_ZIP_VERSION;
  readonly projects: readonly ArchiveProjectRow[];
  readonly drafts: readonly ArchiveDraftRow[];
  readonly artifacts: readonly ArchiveArtifactRow[];
  readonly provenance: readonly ArchiveProvenanceRow[];
  readonly figures: readonly ArchiveFigureRow[];
  readonly figureVersions: readonly ArchiveFigureVersionRow[];
  readonly personas: readonly ArchivePersonaRow[];
  readonly connections: readonly ArchiveConnectionRow[];
  readonly discoveredItems: readonly ArchiveDiscoveredItemRow[];
  readonly samples: readonly ArchiveSampleRow[];
  /** §11.7 — the requesting user's preference profile when the row exists. Import ignores it. */
  readonly preferences?: ArchivePreferencesRow | null;
  /** content-store paths inside the zip that never became artifacts (head bytes missing) — for ops
   *  review; import ignores it. */
  readonly missing: readonly string[];
}

export interface ArchiveManifest {
  readonly version: typeof ARCHIVE_ZIP_VERSION;
  readonly exportedAt: string;
  readonly projects: readonly { slug: string; title: string }[];
  readonly voices: readonly { slug: string; displayName: string | null }[];
  /** every file in the zip (except manifest.json itself): path → sha256 of its bytes. */
  readonly files: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------------------------------
// path helpers
// ---------------------------------------------------------------------------------------------------------------------

export function projectZipDir(slug: string): string {
  return `projects/${slug}`;
}

export function voiceZipDir(slug: string): string {
  return `voices/${slug}`;
}

/** `voices/<slug>/samples/<file>` — samples export as canonical markdown under the voice dir. */
export function sampleZipPath(voiceSlug: string, itemKey: string, n: number): string {
  const safe = itemKey.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "sample";
  return `${voiceZipDir(voiceSlug)}/samples/${safe}-v${n}.md`;
}

/** A generated per-tree manifest.md — the on-disk record of what shipped (§8.2 manifest shape). */
export function renderTreeManifestMd(title: string, paths: readonly string[]): string {
  const lines = ["# Manifest", "", `${title}`, ""];
  for (const p of [...paths].sort()) lines.push(`- \`${p}\``);
  return `${lines.join("\n")}\n`;
}
