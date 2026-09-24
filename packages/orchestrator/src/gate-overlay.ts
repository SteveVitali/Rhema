// Gate write-back overlays (REQ-SPEC-9; §11.5, §12.4 step 7). When a gate with structured edits is approved,
// the orchestrator serializes the post-decision rows (via the P0.04 serializers — the inverse of the sidecar
// parsers) into a NEW user-authored `artifact_version`, records its id on `Decision.overlayVersionIds`, and
// passes it in `hydration.overlays[]` so resume materializes the user's rewrite over the committed file. Both
// the human markdown deliverable and its authoritative `.json` twin are versioned (rows → *.md + *.json), so
// the next phase reads the user's rows AS ROWS with `actor: user` (REQ-WF-9 is enforced structurally).

import { serializeSidecar, type SerializableSidecar } from "@rhema/protocols";
import { pathToNamespace } from "@rhema/protocols";
import {
  persistHarvest,
  sha256Hex,
  type ContentStore,
  type NewVersion,
  type PersistDeps,
} from "@rhema/mirror";
import type { SqlClient } from "./tx.js";

/** The structured artifact kinds that have a write-back serializer → their canonical sidecar filename. */
const KIND_TO_SIDECAR = {
  structure_plan: "structure-plan.json",
  response_ledger: "response-ledger.json",
  cut_list: "cut-list.json",
  // P1.12 — Approve-outline edits serialize through the `outline` sidecar (provenance + [unverified]
  // rows ride the rows untouched — the serializer re-validates the whole document).
  outline: "outline.json",
} as const satisfies Record<string, SerializableSidecar>;

/** True when a gate's structured artifact has a serializer (approve_plan/triage/cutlist write-backs). */
export function isSerializableKind(kind: string): kind is keyof typeof KIND_TO_SIDECAR {
  return kind in KIND_TO_SIDECAR;
}

export interface SerializeOverlayArgs {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly userId: string;
  /** the committed structured artifact under decision (the gate's `.md`); its path + kind drive serialization. */
  readonly artifactVersionId: string;
  /** the post-decision sidecar rows (validated by the serializer's schema before emit). */
  readonly rows: unknown;
}

const wordCount = (s: string): number => (s.trim() === "" ? 0 : s.trim().split(/\s+/).length);

/**
 * Serialize the post-decision rows into a user-authored overlay: a new `artifact_version` for the structured
 * `.md` and its `.json` twin (both `createdBy:{kind:'user'}`). Returns the overlay version ids (md first, then
 * json) for `Decision.overlayVersionIds` + `hydration.overlays[]`. Runs inside the resolution transaction.
 */
export async function serializeGateOverlay(
  tx: SqlClient,
  deps: PersistDeps,
  store: ContentStore,
  args: SerializeOverlayArgs,
): Promise<string[]> {
  // resolve the committed structured artifact's mirror path + kind from the gate's artifact_version_id.
  const res = await tx.query(
    `select a.mirror_path, a.kind
       from artifact_versions av join artifacts a on a.id = av.artifact_id
      where av.id = $1`,
    [args.artifactVersionId],
  );
  const row = res.rows[0] as { mirror_path: string; kind: string } | undefined;
  if (!row) throw new Error(`gate overlay: artifact_version ${args.artifactVersionId} not found`);
  const kind = row.kind;
  if (!isSerializableKind(kind)) throw new Error(`gate overlay: kind '${kind}' has no serializer (REQ-SPEC-9)`);

  const mdPath = row.mirror_path;
  const jsonPath = mdPath.replace(/\.md$/, ".json");
  const { markdown, json } = serializeSidecar(KIND_TO_SIDECAR[kind], args.rows);

  const newVersions: NewVersion[] = [
    { path: mdPath, root: "project", kind, namespace: pathToNamespace(mdPath), sha256: sha256Hex(markdown), bytes: Buffer.from(markdown, "utf8"), wordCount: wordCount(markdown) },
    { path: jsonPath, root: "project", kind: "sidecar", namespace: pathToNamespace(jsonPath), sha256: sha256Hex(json), bytes: Buffer.from(json, "utf8"), wordCount: 0 },
  ];

  const persisted = await persistHarvest(tx, store, deps, {
    workspaceId: args.workspaceId,
    projectId: args.projectId,
    createdBy: { kind: "user", userId: args.userId }, // provenance is honest: the user rewrote the plan (REQ-SPEC-9)
  }, newVersions);

  return persisted.map((p) => p.versionId);
}
