// The snapshot model (ADR-126, REQ-CORPUS-9): every lazy chunk is one `SnapshotFile` envelope —
// a registered `kind`, the corpus `essay` key (never a `demo~` slug — 220 owns the registry),
// the DataSource `key` the twin resolves by, and the DTO payload itself (each payload type is
// `satisfies`-checked against `@rhema/api-client` at build time). Chunks are written as
// canonical JSON; nothing here does I/O.

import type {
  EditorDocDto,
  EditorResolveDto,
  VersionDiffDto,
  VersionRailDto,
  FilesDto,
  WhatChangedDto,
  ProjectRow,
} from "@rhema/api-client";

/** The document-side snapshot kinds this ticket emits (218a registers its own). */
export const SNAPSHOT_KINDS = [
  "projects",
  "editor-doc",
  "versions",
  "version-diff",
  "what-changed",
  "files",
  "artifact-page",
] as const;
export type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

/** The DTO each kind carries — the compile-time half of the contract harness. */
export interface KindDtoMap {
  readonly "projects": readonly ProjectRow[];
  readonly "editor-doc": EditorDocDto;
  readonly "versions": VersionRailDto;
  readonly "version-diff": VersionDiffDto;
  readonly "what-changed": WhatChangedDto;
  readonly "files": FilesDto;
  readonly "artifact-page": EditorDocDto;
}

export interface SnapshotFile<K extends string = string> {
  readonly format: 1;
  readonly kind: K;
  /** The corpus essay key; `"*"` on cross-essay payloads (`projects`). */
  readonly essay: string;
  /** The DataSource key (`draftId`, `"n:m"`, the response/pair id, an artifact path, `""`). */
  readonly key: string;
  readonly dto: unknown;
}

/**
 * The small per-essay index (REQ-CORPUS-9): the resolve table + a `kind → key → file` chunk map.
 * `resolve` IS the `resolveEditorDraft` payload set — index-sized, so it rides the index rather
 * than a chunk. 218a adds its kinds under `chunks` without touching this shape.
 */
export interface EssayIndex {
  readonly format: 1;
  readonly essay: string;
  readonly head: { readonly draftId: string; readonly n: number };
  /** `/v/:v` resolution — `"working"` plus every `"<n>"`. */
  readonly resolve: Readonly<Record<string, EditorResolveDto>>;
  readonly chunks: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** Declared envelope bytes per kind — the AC3 size bound: a snapshot file may not exceed the
 *  bytes of the one artifact it carries plus this envelope (the envelope covers the
 *  `SnapshotFile` wrapper + DTO meta; the carried-artifact definition is the test's `CARRIED`). */
export const ENVELOPE_BYTES: Readonly<Record<SnapshotKind, number>> = {
  "projects": 4096,
  "editor-doc": 96 * 1024, // blockIdMap + the findings rail + meters/markers on top of markdown
  "versions": 16 * 1024,
  "version-diff": 16 * 1024,
  "what-changed": 16 * 1024,
  "files": 256 * 1024, // one FileRowDto per corpus artifact (~300 B each)
  "artifact-page": 8 * 1024,
};
