// R7DEM.4 (REQ-DWEB-3; ADR-126) — `demoDataSource`: the snapshot-backed DataSource the nested
// demo app serves. It reads 218/218a's projector output (the `SnapshotFile` envelopes + the
// per-essay `index.json` chunk maps) from disk, lazily per artifact, inside the web image.
//
// REQ-DWEB-3 boundary — this module's runtime graph carries no `fetch`, no `process.env`, and no
// runtime import of `@rhema/api-client`, `@rhema/db` or `@rhema/live-clients` (enforced by the
// eslint boundary rule plus demo.test.ts's module-graph scan). `@rhema/api-client` and
// `@rhema/demo-corpus` appear as `import type` only — DTO shapes, never code. A snapshot miss is
// `DemoError{status:404}`; the nested-app seam in demo.ts adapts it to `ApiError` so the shared
// compositions' `instanceof ApiError && status === 404` arms keep working verbatim.
//
// Every DataSource key outside the implemented `Pick` is a throwing `DemoUnsupported` proxy —
// an unimplemented seam fails loudly in tests (and the §7 walk), never answers a silent empty.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import type {
  EditorDocDto,
  EditorResolveDto,
  FigureCardDto,
  FigureListItemDto,
  FilesDto,
  PrincipalDto,
  ThemeSettingsDto,
  VersionDiffDto,
  VersionRailDto,
  WhatChangedDto,
  ProjectRow,
} from "@rhema/api-client";
import { DEMO_SLUG_PREFIX } from "@rhema/contracts";
import type { DataSource, SessionHeaders } from "./data.js";

/** A snapshot-miss / malformed-request error — the adapter in demo.ts maps it to `ApiError`. */
export class DemoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = "DemoError";
  }
}

/** A DataSource seam the demo does not implement — never a silent empty (REQ-DWEB-3). */
export class DemoUnsupported extends Error {
  constructor(method: string | symbol) {
    super(`demoDataSource: ${String(method)} is outside the demo seam`);
    this.name = "DemoUnsupported";
  }
}

/** The nested demo app's constant session — a non-null marker only; the data source ignores it. */
export const DEMO_SESSION: SessionHeaders = {};

/**
 * The request-scoped essay hint the nested app's session resolver stamps (`session` on the
 * DataSource is a per-request context bag — the `/bff/p/demo~<essay>/r/:runId` twin's
 * `getRunReport` is the one method whose signature carries no project/slug, so the replayed
 * runId (essay-unique, `v1-review`) resolves through this marker).
 */
const DEMO_ESSAY_HINT = "x-rhema-demo-essay";

/** Stamp the per-request essay hint (demo.ts's nested session resolver). */
export function demoSessionFor(essay: string): SessionHeaders {
  return { [DEMO_ESSAY_HINT]: essay };
}

/** `demo~<essay>` or a bare essay key → the registered essay key (404-shaped DemoError). */
function essayFor(ref: string): string {
  return ref.startsWith(DEMO_SLUG_PREFIX) ? ref.slice(DEMO_SLUG_PREFIX.length) : ref;
}

/**
 * The snapshot file contract, declared structurally here (the projector's `SnapshotFile` +
 * `EssayIndex` shapes, `@rhema/demo-corpus/src/project/model.ts`) — this module reads the JSON
 * off disk and never imports the package, so the shapes are local mirrors, not a runtime edge.
 */
interface SnapshotEnvelope {
  readonly format?: number;
  readonly dto?: unknown;
}
interface DemoEssayIndex {
  readonly chunks: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly resolve: Readonly<Record<string, unknown>>;
}

function readJson<T>(file: string): Promise<T> {
  return readFile(file, "utf8").then((t) => JSON.parse(t) as T);
}

/** The snapshot kinds this source resolves through the essay index's `chunks` map. */
type ChunkKind =
  | "editor-doc"
  | "versions"
  | "version-diff"
  | "what-changed"
  | "files"
  | "artifact-page"
  | "dossier"
  | "run-report"
  | "timeline"
  | "card-facts"
  | "figure-image";

const notFound = (what: string) => new DemoError(404, "not_found", what);

/**
 * The snapshot-backed read seam (R3 §1's table — provisional until 221's regenerated walk
 * finalizes the set, per the DWEB-3 amendment). `root` is the corpus DATA dir (it holds
 * `snapshots/` + `corpus/`): prod resolves it from `@rhema/demo-corpus`'s installed package
 * root; tests pass the committed `fixtures/synthetic` dir (S-12 — tests run the fixture only).
 */
export function demoDataSource(root: string): DataSource {
  const snapRoot = join(root, "snapshots");
  const indexCache = new Map<string, Promise<DemoEssayIndex>>();
  const chunkCache = new Map<string, Promise<unknown>>();

  const index = (essay: string): Promise<DemoEssayIndex> => {
    let p = indexCache.get(essay);
    if (!p) {
      p = readJson<DemoEssayIndex>(join(snapRoot, essay, "index.json")).catch(() => {
        throw notFound(`essay ${essay}`);
      });
      indexCache.set(essay, p);
    }
    return p;
  };

  /** kind+key → the chunk file's `dto` (404 when the essay, kind or key is absent). */
  const chunk = async <T>(essay: string, kind: ChunkKind, key: string): Promise<T> => {
    const ix = await index(essay);
    const file = ix.chunks[kind]?.[key];
    if (file == null) throw notFound(`${kind} ${key} for ${essay}`);
    const cacheKey = `${essay}/${file}`;
    let p = chunkCache.get(cacheKey);
    if (!p) {
      p = readJson<SnapshotEnvelope>(join(snapRoot, essay, file)).then((env) => env.dto);
      chunkCache.set(cacheKey, p);
    }
    return p as Promise<T>;
  };

  let projects: Promise<ProjectRow[]> | null = null;
  const rows = (): Promise<ProjectRow[]> => {
    projects ??= readJson<SnapshotEnvelope>(join(snapRoot, "projects.json"))
      .then((env) => (env.dto as readonly ProjectRow[]).slice())
      .then((list) =>
        list.map((r) => ({
          ...r,
          slug: `${DEMO_SLUG_PREFIX}${r.slug}`,
          // demo rows are always read-only, never showcase, never a live run (REQ-DWEB-5).
          showcase: false,
          activeRun: null,
        })),
      )
      .catch(() => {
        throw notFound("projects");
      });
    return projects;
  };

  /** The essay hint for slug-less seams (`getRunReport`) — missing ⇒ unique-scan fallback. */
  const hintedEssay = (session: SessionHeaders): string | null => {
    const hint = session[DEMO_ESSAY_HINT];
    return typeof hint === "string" && hint !== "" ? hint : null;
  };

  const impl = {
    listProjects: () => rows(),
    getEditorDoc: (_s: SessionHeaders, projectId: string, draftId: string) =>
      chunk<EditorDocDto>(essayFor(projectId), "editor-doc", draftId),
    resolveEditorDraft: async (_s: SessionHeaders, projectId: string, v: string) => {
      const ix = await index(essayFor(projectId));
      const resolved = ix.resolve[v];
      if (!resolved) throw notFound(`resolve ${v}`);
      return resolved as EditorResolveDto;
    },
    getVersions: (_s: SessionHeaders, projectId: string) =>
      chunk<VersionRailDto>(essayFor(projectId), "versions", ""),
    getVersionDiff: (_s: SessionHeaders, projectId: string, n: string, m: string) =>
      chunk<VersionDiffDto>(essayFor(projectId), "version-diff", `${n}:${m}`),
    getArtifactPage: (_s: SessionHeaders, projectId: string, artifactId: string) =>
      // R7DEM.5 — decode the `--`-flattened route id back to the corpus path (see `getFiles`).
      chunk<EditorDocDto>(
        essayFor(projectId),
        "artifact-page",
        artifactId.split("--").join("/"),
      ),
    getWhatChanged: (_s: SessionHeaders, projectId: string, cid: string) =>
      chunk<WhatChangedDto>(essayFor(projectId), "what-changed", cid),
    getDossier: (_s: SessionHeaders, args: { projectSlug: string; runId: string }) =>
      chunk(essayFor(args.projectSlug), "dossier", args.runId) as Promise<
        Awaited<ReturnType<DataSource["getDossier"]>>
      >,
    getTimeline: (_s: SessionHeaders, projectSlug: string) =>
      chunk(essayFor(projectSlug), "timeline", "") as Promise<
        Awaited<ReturnType<DataSource["getTimeline"]>>
      >,
    getRunReport: async (session: SessionHeaders, runId: string) => {
      const hint = hintedEssay(session);
      if (hint != null) {
        return chunk(essayFor(hint), "run-report", runId) as Promise<
          Awaited<ReturnType<DataSource["getRunReport"]>>
        >;
      }
      // No hint (e.g. `/app/usage/r/:runId`): a unique match across the registry wins; an
      // ambiguous or absent runId is a 404, never the wrong essay's record.
      const essays = (await rows()).map((r) => essayFor(r.slug));
      const hits: string[] = [];
      for (const essay of essays) {
        const ix = await index(essay);
        if (ix.chunks["run-report"]?.[runId] != null) hits.push(essay);
      }
      if (hits.length !== 1) throw notFound(`run report ${runId}`);
      return chunk(hits[0]!, "run-report", runId) as Promise<
        Awaited<ReturnType<DataSource["getRunReport"]>>
      >;
    },
    getFiles: async (_s: SessionHeaders, projectId: string) => {
      const dto = await chunk<FilesDto>(essayFor(projectId), "files", "");
      // R7DEM.5 — the `/a/$artifactId` route is single-segment; corpus-relative artifact ids
      // carry `/`. The demo flattens them to a `--`-joined form everywhere a link is built
      // (`files()` here; `getArtifactPage` decodes on the way back in).
      const flat = (id: string) => (id.includes("/") ? id.split("/").join("--") : id);
      // R7DEM.5 — a `kind:"figure"` row's binary asset has no artifact page (it rides the
      // figure card + the asset route): emit `figureId` (basename minus extension) so the
      // row links the card, never a `/a/…png` 404.
      const figureId = (r: { kind: string; artifactId: string }): string | undefined =>
        r.kind === "figure"
          ? (r.artifactId.split("/").pop() ?? r.artifactId).replace(/\.[a-z]+$/i, "")
          : undefined;
      return {
        ...dto,
        sections: dto.sections.map((s) => ({
          ...s,
          rows: s.rows.map((r) => ({
            ...r,
            artifactId: flat(r.artifactId),
            ...(figureId(r) != null ? { figureId: figureId(r) } : {}),
          })),
          advancedRows: s.advancedRows.map((r) => ({
            ...r,
            artifactId: flat(r.artifactId),
            ...(figureId(r) != null ? { figureId: figureId(r) } : {}),
          })),
        })),
      };
    },
    listFigures: async (_s: SessionHeaders, projectId: string) => {
      const essay = essayFor(projectId);
      const ix = await index(essay);
      const ids = Object.keys(ix.chunks["figure-image"] ?? {}).sort();
      const items: FigureListItemDto[] = [];
      for (const id of ids) {
        const card = await chunk<{ id: string; assetUri: string; title: string }>(
          essay,
          "figure-image",
          id,
        );
        items.push({
          id: card.id,
          assetUri: card.assetUri,
          title: card.title,
          caption: "",
          // S-7's imported-image variant rides the card shape verbatim — the Figures-list leaf
          // (220a) reads the marker fields, never a spec/SVG that does not exist.
          specKind: "image" as unknown as FigureListItemDto["specKind"],
          kind: "chart" as const,
          badge: null,
          badgeText: null,
          n: items.length + 1,
          renderStatus: "rendered",
          hasRender: true,
          insertedInDraftId: null,
          pendingProposal: false,
          latestRunId: null,
        } satisfies FigureListItemDto);
      }
      return items;
    },
    getFigure: (_s: SessionHeaders, projectId: string, figureId: string) =>
      chunk(essayFor(projectId), "figure-image", figureId) as Promise<FigureCardDto>,
    getSessionPrincipal: async () =>
      ({ userId: "demo", workspaceId: "demo", billingAccountId: "demo" }) satisfies PrincipalDto,
    // `null` so the localStorage mirror wins (R3 §1) — the shell never embeds it either way.
    getTheme: async () => null as unknown as ThemeSettingsDto,
    listGates: async () => [],
    listDecisions: async () => [],
    getApprovalOverrides: async () => ({}),
    // every known explainer dismissed so no one-time explainer mounts in the demo (R3 §1).
    getExplainers: async () => ({ dismissed: ["approvals", "evidence"] }),
    getProjectVoice: async () => null as unknown as Awaited<
      ReturnType<NonNullable<DataSource["getProjectVoice"]>>
    >,
    listVoices: async () => [],
    // The demo's palette search endpoint answers an empty result set (R3 §2 — server-side).
    searchPalette: async () => [],
    postAnalyticsEvent: async () => ({ ok: true, recorded: false }),
    // R7DEM.5 — the walk's reach report names `checkSession` + `postAcquisitionEvent` as
    // implemented-but-never-invoked: they leave the Pick (DWEB-3's amended contract — the
    // implemented set is EXACTLY the set the walk records) and become DemoUnsupported.
  };

  // `Pick` over the enumerated set — every other key is a throwing DemoUnsupported proxy.
  const target = impl as Pick<
    DataSource,
    | "listProjects"
    | "getEditorDoc"
    | "resolveEditorDraft"
    | "getVersions"
    | "getVersionDiff"
    | "getArtifactPage"
    | "getWhatChanged"
    | "getDossier"
    | "getTimeline"
    | "getRunReport"
    | "getFiles"
    | "listFigures"
    | "getFigure"
    | "getSessionPrincipal"
    | "getTheme"
    | "listGates"
    | "listDecisions"
    | "getApprovalOverrides"
    | "getExplainers"
    | "getProjectVoice"
    | "listVoices"
    | "searchPalette"
    | "postAnalyticsEvent"
  >;
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === "string" && prop in t) return Reflect.get(t, prop, receiver);
      // A rejected promise (not a sync throw): callers that `.catch(() => …)` degrade exactly as
      // a missing api seam degrades, and a direct call surfaces DemoUnsupported unambiguously.
      return () => Promise.reject(new DemoUnsupported(prop));
    },
  }) as DataSource;
}

/**
 * The production corpus root — `@rhema/demo-corpus`'s installed package dir (the deploy bundle
 * ships it as a whole package, so `snapshots/` + `corpus/` ride beside `dist/`). Returns null
 * when the package is not resolvable — the caller then never builds the nested app (the demo
 * paths fall through to the ordinary handlers, a fail-closed 404 posture).
 */
export function defaultDemoCorpusRoot(): string | null {
  try {
    const req = createRequire(import.meta.url);
    // `<root>/dist/index.js` → package root. The package's `exports` map pins this entry.
    const entry = req.resolve("@rhema/demo-corpus");
    return join(entry, "..", "..");
  } catch {
    return null;
  }
}
