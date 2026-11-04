// EditorDocDto + raw artifact-page projections (REQ-CONV-13): draft chunks carry the full Page
// read (markdown, sha, findings rail, blockIdMap, meters); artifact pages carry raw markdown
// only — REQ-CORPUS-9 says each chunk holds ONE artifact. `demo` markers carry the REQ-CONV-14
// import-rule note and REQ-CORPUS-4 "not published" refs into the DTOs that display them.

import { buildBlockIdMap } from "@rhema/findings-core";
import { statusMeters } from "@rhema/editor";
import type {
  DemoMarkersDto,
  EditorDocDto,
  EditorFindingDto,
} from "@rhema/api-client";
import { parsePublished } from "../versions.js";
import type { DemoVersion } from "./versions.js";

export interface ArtifactMeta {
  readonly path: string;
  readonly sha256: string;
  readonly kind: string;
}

interface FindingsSidecar {
  readonly findings?: readonly {
    readonly ordinal: number;
    readonly title?: string;
    readonly severity?: string;
    readonly kind?: string;
    readonly anchor: unknown;
  }[];
}

interface LabelsFile {
  readonly findings?: readonly { readonly ordinal: number; readonly id: string }[];
  readonly importRule?: Readonly<Record<string, string>>;
  readonly roles?: Readonly<Record<string, string>>;
}

/** confidence → the Page rail's method vocabulary (exact incl. exact-multi, normalized, fuzzy). */
function methodOf(anchor: unknown): EditorFindingDto["method"] {
  if (anchor == null) return "unanchored";
  const c = (anchor as { confidence?: number }).confidence;
  if (c === undefined) return "unresolved";
  if (c >= 0.85 && c !== 0.9) return "exact";
  if (c >= 0.9) return "normalized";
  return "fuzzy";
}

/** The "from Review of vN" rail on a reviewed version — same derivation as prod's findingsDto. */
function findingsRail(
  findings: FindingsSidecar | undefined,
  labels: LabelsFile | undefined,
  round: string,
): EditorFindingDto[] {
  const idOf = new Map((labels?.findings ?? []).map((f) => [f.ordinal, f.id]));
  return (findings?.findings ?? []).map((f) => ({
    findingId: idOf.get(f.ordinal) ?? `F${f.ordinal + 1}`,
    title: f.title ?? "",
    severity: f.severity ?? "note",
    ...(f.kind !== undefined ? { kind: f.kind } : {}),
    suggestion: null,
    sourceLabel: `from Review of ${round}`,
    anchor: f.anchor,
    method: methodOf(f.anchor),
    lost: false,
  }));
}

function docBody(
  v: DemoVersion,
  files: ReadonlyMap<string, string>,
  meta: ReadonlyMap<string, ArtifactMeta>,
): { readonly markdown: string; readonly sha256: string | null } {
  const raw = files.get(v.file);
  if (raw === undefined) throw new Error(`projector: draft file missing: ${v.file}`);
  const markdown = v.origin === "imported" ? parsePublished(raw).body : raw;
  return { markdown, sha256: meta.get(v.file)?.sha256 ?? null };
}

/** One draft chunk — `getEditorDoc(draftId)` exact. */
export function editorDoc(
  v: DemoVersion,
  ctx: {
    readonly files: ReadonlyMap<string, string>;
    readonly meta: ReadonlyMap<string, ArtifactMeta>;
    readonly outputs: ReadonlyMap<string, string>;
    readonly markers: DemoMarkersDto | undefined;
  },
): EditorDocDto {
  const { markdown, sha256 } = docBody(v, ctx.files, ctx.meta);
  let findings: EditorFindingDto[] = [];
  let importRule: Readonly<Record<string, string>> | undefined;
  let roles: Readonly<Record<string, string>> | undefined;
  if (v.reviewed) {
    const dir = `correspondence/${v.draftId}-review`;
    const fj = ctx.outputs.get(`${dir}/findings.json`);
    const lj = ctx.outputs.get(`${dir}/labels.json`);
    const labels = lj !== undefined ? (JSON.parse(lj) as LabelsFile) : undefined;
    findings = findingsRail(
      fj !== undefined ? (JSON.parse(fj) as FindingsSidecar) : undefined,
      labels,
      v.draftId,
    );
    importRule = labels?.importRule;
    roles = labels?.roles;
  }
  const demo: DemoMarkersDto = {
    ...(importRule !== undefined ? { importRule } : {}),
    ...(roles !== undefined ? { roles } : {}),
    ...(ctx.markers?.notPublishedRefs !== undefined
      ? { notPublishedRefs: ctx.markers.notPublishedRefs }
      : {}),
  };
  return {
    draftId: v.draftId,
    draftN: v.n,
    origin: v.origin,
    state: v.state,
    baseDraftId: v.baseDraftId,
    baseDraftN: v.baseDraftN,
    markdown,
    sha256,
    lock: null,
    findings,
    provenance: null, // the corpus records no per-block provenance — never invented
    blockIdMap: buildBlockIdMap(markdown),
    venueCap: null,
    meters: statusMeters(markdown),
    proposals: [],
    versionLabel: v.label,
    ...(Object.keys(demo).length > 0 ? { demo } : {}),
  } satisfies EditorDocDto;
}

/** One raw artifact page — `getArtifactPage(artifactId)`; `artifactId` is the corpus-relative
 *  path (stable, needs no registry). Mirrors prod's artifact read (origin "artifact"). */
export function artifactPage(
  a: ArtifactMeta & { readonly artifactKind: string },
  ctx: { readonly files: ReadonlyMap<string, string>; readonly markers: DemoMarkersDto | undefined },
): EditorDocDto {
  const markdown = ctx.files.get(a.path);
  if (markdown === undefined) throw new Error(`projector: artifact file missing: ${a.path}`);
  return {
    draftId: a.path,
    draftN: 1,
    origin: "artifact",
    state: "frozen",
    baseDraftId: null,
    baseDraftN: null,
    markdown,
    sha256: a.sha256,
    lock: null,
    findings: [],
    blockIdMap: buildBlockIdMap(markdown),
    meters: statusMeters(markdown),
    proposals: [],
    artifactKind: a.artifactKind,
    artifactPath: a.path,
    ...(ctx.markers !== undefined && ctx.markers.notPublishedRefs !== undefined
      ? { demo: { notPublishedRefs: ctx.markers.notPublishedRefs } }
      : {}),
  } satisfies EditorDocDto;
}
