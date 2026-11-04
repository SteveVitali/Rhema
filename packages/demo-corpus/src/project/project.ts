// The projector core orchestrator (REQ-CORPUS-9/12/13, REQ-CONV-13/14): corpus files + the
// converter's canonical-JSON outputs → the lazy snapshot set. Pure — `projectEssay` returns a
// `path → bytes` map; the build script (`tools/demo-corpus/project.mjs`) owns all file I/O.
// Fail-closed: a missing draft, artifact, golden or key aborts the essay with NO partial output.

import type { DemoMarkersDto, ProjectRow } from "@rhema/api-client";
import { statusMeters } from "@rhema/editor";
import { canonicalJson } from "../convert/index.js";
import type { ConvertProjectResult } from "../convert/index.js";
import type { WhatChangedArtifact } from "../convert/what-changed.js";
import { extractTitle, parsePublished, type VersionIndex } from "../versions.js";
import type { EssayIndex, SnapshotFile } from "./model.js";
import { projectVersions, type DemoVersion } from "./versions.js";
import { editorDoc, artifactPage, type ArtifactMeta } from "./dtos.js";
import { versionRail, resolveTable, pairSnapshots } from "./views.js";
import { filesTree, artifactKindFor } from "./files-tree.js";

export interface ProjectEssayInput {
  /** The corpus essay key (never a `demo~` slug — 220 owns the registry). */
  readonly essay: string;
  /** corpus-relative path → file text (the sanitized `corpus/<slug>/` tree). */
  readonly files: ReadonlyMap<string, string>;
  /** `convertProject`'s canonical-JSON outputs (the 217 goldens' live form). */
  readonly convert: Extract<ConvertProjectResult, { ok: true }>;
  /** The export manifest's recorded export date (the only honest "created" stamp). */
  readonly exportDate: string;
  /** The corpus PROVENANCE.md text (the excluded/fragments source for the Files note). */
  readonly provenance: string;
}

export interface ProjectEssayResult {
  /** `<essay>`-relative snapshot path → canonical-JSON bytes (chunks + `index.json`). */
  readonly outputs: ReadonlyMap<string, string>;
  /** The `listProjects` row for this essay (aggregated into `projects.json` by the caller). */
  readonly row: ProjectRow;
  readonly versions: readonly DemoVersion[];
}

const json = <T>(text: string): T => JSON.parse(text) as T;

interface ExcludedRefsFile {
  readonly refs?: readonly {
    readonly file: string;
    readonly line: number;
    readonly excluded: string;
  }[];
}

interface IndexJson {
  readonly artifacts?: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly kind: string;
  }[];
}

/** PROVENANCE.md's `### Excluded` bullet reasons containing "fragment" → the Files note. */
export function fragmentCount(provenance: string, slug: string): number {
  const section = provenance.split(`## ${slug}`)[1] ?? "";
  const ex = section.split("### Excluded")[1]?.split("###")[0] ?? "";
  return ex.split("\n").filter((l) => /^- `[^`]+` — .*fragment/i.test(l)).length;
}

const artifactMeta = (idx: IndexJson): ReadonlyMap<string, ArtifactMeta> => {
  const m = new Map<string, ArtifactMeta>();
  for (const a of idx.artifacts ?? [])
    if (a.kind === "markdown") m.set(a.path, { path: a.path, sha256: a.sha256, kind: a.kind });
  return m;
};

function markersFor(refs: ExcludedRefsFile, file: string): DemoMarkersDto | undefined {
  const hits = (refs.refs ?? []).filter((r) => r.file === file);
  if (hits.length === 0) return undefined;
  return { notPublishedRefs: hits.map((r) => ({ line: r.line, path: r.excluded })) };
}

const put = (outputs: Map<string, string>, path: string, env: SnapshotFile) =>
  outputs.set(path, canonicalJson(env));

/** Project ONE essay's document-side snapshot set. */
export function projectEssay(input: ProjectEssayInput): ProjectEssayResult {
  const files = input.files;
  const outputs = input.convert.outputs;
  const need = (p: string): string => {
    const t = files.get(p);
    if (t === undefined) throw new Error(`projector: missing ${input.essay}/${p}`);
    return t;
  };
  const versionsJson = json<VersionIndex>(need("versions.json"));
  const idx = json<IndexJson>(need("index.json"));
  const refs = files.has("excluded-refs.json")
    ? json<ExcludedRefsFile>(files.get("excluded-refs.json")!)
    : {};
  const meta = artifactMeta(idx);
  const paths = [...files.keys()];
  const versions = projectVersions(versionsJson, {
    // exact match for files; a trailing-`/` path is a directory probe (prefix match)
    has: (p) => files.has(p) || (p.endsWith("/") && paths.some((k) => k.startsWith(p))),
    exportDate: input.exportDate,
    ...(versionsJson.published !== null && files.has(versionsJson.published.file)
      ? {
          publishedTitle: extractTitle(
            parsePublished(files.get(versionsJson.published.file)!).body,
          ).title,
        }
      : {}),
  });

  const out = new Map<string, string>();
  const chunks: Record<string, Record<string, string>> = {
    "editor-doc": {},
    "version-diff": {},
    "what-changed": {},
    "artifact-page": {},
    versions: { "": "versions.json" },
    files: { "": "files.json" },
  };

  // Draft chunks — one EditorDocDto per version, Published included (the head).
  const words = new Map<string, number>();
  for (const v of versions) {
    const doc = editorDoc(v, { files, meta, outputs, markers: markersFor(refs, v.file) });
    const rel = `drafts/${v.draftId}.json`;
    chunks["editor-doc"]![v.draftId] = rel;
    words.set(v.draftId, doc.meters?.words ?? 0);
    put(out, rel, { format: 1, kind: "editor-doc", essay: input.essay, key: v.draftId, dto: doc });
  }

  // The version rail + the per-pair diff/what-changed chunks.
  put(out, "versions.json", {
    format: 1,
    kind: "versions",
    essay: input.essay,
    key: "",
    dto: versionRail(versions, { outputs, words }),
  });

  for (let i = 0; i + 1 < versions.length; i++) {
    const before = versions[i]!;
    const after = versions[i + 1]!;
    const stem = `${before.draftId}-${after.draftId}`;
    const artifactBytes = outputs.get(`what-changed/${stem}.json`);
    // 217 emits an artifact for every adjacent corpus-version pair; the imported Published node
    // is the one pair with no artifact (it is not a converter output) — its diff still emits,
    // every hunk honestly Unlinked.
    const artifact =
      artifactBytes !== undefined
        ? json<WhatChangedArtifact>(artifactBytes)
        : after.origin === "imported"
          ? undefined
          : (() => {
              throw new Error(`projector: no what-changed artifact for ${stem}`);
            })();
    const pair = pairSnapshots(before, after, { files, outputs, artifact });
    const dKey = `${before.n}:${after.n}`;
    const dRel = `diffs/${before.n}-${after.n}.json`;
    chunks["version-diff"]![dKey] = dRel;
    put(out, dRel, { format: 1, kind: "version-diff", essay: input.essay, key: dKey, dto: pair.diff });
    const wRel = `what-changed/${stem}.json`;
    chunks["what-changed"]![stem] = wRel;
    put(out, wRel, { format: 1, kind: "what-changed", essay: input.essay, key: stem, dto: pair.whatChanged });
  }

  // Raw artifact pages — every markdown artifact that isn't a version draft (RAW_ONLY plus the
  // sidecar'd files' raw twins, REQ-CONV-13).
  const draftFiles = new Set(versions.map((v) => v.file));
  const artifacts = (idx.artifacts ?? []).filter(
    (a) => a.kind === "markdown" || a.kind === "image",
  );
  for (const a of artifacts) {
    if (draftFiles.has(a.path) || a.kind !== "markdown") continue;
    const kind = artifactKindFor(a.path);
    if (kind === null) throw new Error(`projector: no artifact kind for ${a.path}`);
    const m = meta.get(a.path);
    if (m === undefined) throw new Error(`projector: index.json missing sha for ${a.path}`);
    const rel = `artifacts/${a.path}.json`;
    chunks["artifact-page"]![a.path] = rel;
    put(out, rel, {
      format: 1,
      kind: "artifact-page",
      essay: input.essay,
      key: a.path,
      dto: artifactPage({ ...m, artifactKind: kind }, { files, markers: markersFor(refs, a.path) }),
    });
  }

  // The Files pane — one row per artifact + draft; the fragments note from PROVENANCE.
  const allWords = new Map<string, number>(words);
  for (const a of artifacts)
    if (a.kind === "markdown") allWords.set(a.path, statusMeters(files.get(a.path)!).words);
  put(out, "files.json", {
    format: 1,
    kind: "files",
    essay: input.essay,
    key: "",
    dto: filesTree(versions, {
      artifacts: artifacts.map((a) => ({ path: a.path, kind: a.kind })),
      words: allWords,
      createdAt: `${input.exportDate}T00:00:00.000Z`,
      fragments: fragmentCount(input.provenance, input.essay),
    }),
  });

  const head = versions[versions.length - 1]!;
  const index: EssayIndex = {
    format: 1,
    essay: input.essay,
    head: { draftId: head.draftId, n: head.n },
    resolve: resolveTable(versions),
    chunks,
  };
  out.set("index.json", canonicalJson(index));

  const row: ProjectRow = {
    id: input.essay,
    slug: input.essay, // essay key — 220's registry maps it to demo~<essay> at serve time
    title:
      head.title ??
      [...versions].reverse().find((v) => v.title !== null)?.title ??
      input.essay,
    state: {
      key: "accepted",
      pill: "Accepted",
      overlay: null,
      suggested: { action: "open", label: null },
    },
    headDraftId: head.draftId,
    headDraftN: head.n,
    activeRun: null,
    voice: null,
    protocolId: null,
    venue: null,
    archivedAt: null,
  };
  return { outputs: out, row, versions };
}
