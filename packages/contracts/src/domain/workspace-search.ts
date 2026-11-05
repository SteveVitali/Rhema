// R7SHELL.1c (REQ-SHELL-7; ADR-132) — the DTO for the tenant-scoped `GET /search` workspace read
// and its `/bff/search` twin. The api returns GROUPED hits: projects, drafts and letters out of
// `project_search_docs` (the same tsvector index `/projects/search` reads — behaviour there is
// unchanged), plus Voices matched by display name. The BFF maps each hit to its deep link —
// drafts → `/p/:slug/v/:n`, letters → `/p/:slug/revisions/:cid`, voices → `/v/:persona` —
// never `/edit/:id` (REQ-RELOAD-3).

export type WorkspaceSearchKind = "project" | "draft" | "letter" | "voice";

export interface WorkspaceSearchHit {
  readonly kind: WorkspaceSearchKind;
  /** The row's display text — the project title (project/draft/letter hits) or the Voice name. */
  readonly label: string;
  /** The ts_headline excerpt for indexed hits — rendered as escaped text, never HTML. */
  readonly snippet?: string;
  readonly projectId?: string;
  readonly projectSlug?: string;
  /** The indexed doc's ref: the draft id (draft hits) or the correspondence id (letter hits). */
  readonly refId?: string;
  /** The draft's ordinal — the `:n` in the `/p/:slug/v/:n` deep link. */
  readonly draftN?: number;
  /** The persona id (voice hits) — the `:persona` in the `/v/:persona` deep link. */
  readonly personaId?: string;
}

export interface WorkspaceSearchGroups {
  readonly projects: readonly WorkspaceSearchHit[];
  readonly drafts: readonly WorkspaceSearchHit[];
  readonly letters: readonly WorkspaceSearchHit[];
  readonly voices: readonly WorkspaceSearchHit[];
}

/** `GET /search?q=&project=` — the workspace-scoped answer (the twin adds `path` per hit). */
export interface WorkspaceSearchResponse {
  readonly results: WorkspaceSearchGroups;
}

export const EMPTY_SEARCH_GROUPS: WorkspaceSearchGroups = {
  projects: [],
  drafts: [],
  letters: [],
  voices: [],
};

/** A palette row after the twin's deep-link mapping (`path` is the SPA-navigable target). */
export interface WorkspaceSearchResult extends WorkspaceSearchHit {
  readonly path: string;
}

/** `GET /bff/search?q=&project=<slug>` — grouped hits carrying their SPA deep links. */
export interface WorkspaceSearchTwinResponse {
  readonly results: {
    readonly projects: readonly WorkspaceSearchResult[];
    readonly drafts: readonly WorkspaceSearchResult[];
    readonly letters: readonly WorkspaceSearchResult[];
    readonly voices: readonly WorkspaceSearchResult[];
  };
}
