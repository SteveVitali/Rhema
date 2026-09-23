// The manual-revision save path (PRB.07; §5.4/§6.3/§11.6; REQ-DATA-24/26/29; REQ-BETA-7's manual half).
// One tenant transaction per debounced server save: the first save on a frozen head forks
// `v(N+1) origin='human_revision'` (no confirm — REQ-IDE-32's beta form) and emits `draft.forked`; the
// canonical markdown lands content-addressed with the block-id sidecar on the VERSION ROW (never in the
// text — REQ-DATA-29's stripping rule); findings filed on the reviewed base re-anchor onto the edited head
// as projections (lost quotes fall back to Whole piece pending triage); the block-level provenance map marks
// every touched block `human`; a restore-point row lands beside the live doc; and the PRB.06 seam emits
// `revision.move_traced` on the diff. "Save" is not a verb — this is the autosave path; reviewed versions
// stay immutable and nothing is ever deleted.

import {
  buildBlockIdMap,
  humanRevisionProvenance,
  projectFindingsOntoMarkdown,
  type FindingProjectionResult,
  type ProvenanceBase,
  type ProvenanceSpan,
} from "@rhema/findings-core";
import { parseRunEvent, type Actor, type Anchor, type ProvenanceSource } from "@rhema/contracts";
import { openHumanRevision } from "./freeze.js";
import { traceManualRevision } from "./manual-trace.js";
import { sha256Hex, s3KeyFor, type ContentStore } from "./content-store.js";
import type { DeliveryEventAppender } from "./delivery.js";
import type { PersistDeps } from "./persist.js";
import type { SqlExecutor } from "./sql.js";

export interface ManualRevisionDeps extends PersistDeps {
  readonly store: ContentStore;
  readonly eventWriter: DeliveryEventAppender;
}

export interface SaveManualRevisionArgs {
  readonly workspaceId: string;
  readonly projectId: string;
  /**
   * The draft the editor is bound to: the FROZEN head on the first keystroke's save (this call forks
   * v(N+1)), or the WORKING `human_revision` head an earlier save already created (autosaves update it
   * in place — repeated saves never re-fork).
   */
  readonly draftId: string;
  readonly markdown: string;
  readonly userId: string;
  /** a run to attribute the timeline events to when the save happened inside one (usually absent). */
  readonly runId?: string;
  /**
   * P1.02 — the live provenance the Page captured between saves (REQ-DATA-29 amended, REQ-POS-9):
   * `spans` = the per-block `{blockId → source}` map the editor's provenance plugin maintains (a human
   * edit inside a captured agent span already degraded to `mixed` client-side); `agentSpans` = the
   * write-only span sets recorded at each agent-origin transaction. Absent ⇒ the diff-derived
   * `humanRevisionProvenance` map is written (the PRB.07 behavior — a caller that doesn't track live
   * origins still gets a correct block-level map).
   */
  readonly provenance?: {
    readonly spans?: readonly ProvenanceSpan[];
    readonly agentSpans?: readonly { readonly blockId: string; readonly from: number; readonly to: number }[];
  };
  /**
   * P1.03 — the restore-point write this save performs. `'content-addressed'` (default — the HTTP save
   * path's beta behavior) inserts the `snapshot`/`auto` row pointing at the artifact's s3_key.
   * `'ydoc'` SKIPS it: the collab service owns restore points as Yjs update-deltas chained from daily
   * snapshots at `restore/<liveDoc>/<ts>` (§11.4; REQ-IDE-34's storage half), so the materialization
   * path must not double-write a content-addressed row beside them.
   */
  readonly restorePoint?: "content-addressed" | "ydoc";
}

export type SaveManualRevisionResult =
  | {
      readonly ok: true;
      /** the working head's id — the forked v(N+1) after a first save, else the draft itself. */
      readonly draftId: string;
      readonly draftN: number;
      readonly versionId: string;
      readonly sha256: string;
      /** true when THIS save created v(N+1) (the frozen→working fork; subsequent saves report false). */
      readonly forked: boolean;
      /** true when the bytes differ from the head's prior version (a no-op save reports false). */
      readonly changed: boolean;
      readonly restorePointId: string | null;
      readonly projections: readonly FindingProjectionResult[];
    }
  | { readonly ok: false; readonly reason: "draft_not_found" | "not_editable" };

interface DraftRow {
  id: string;
  project_id: string;
  n: number;
  origin: string;
  state: string;
  promoted_version_id: string | null;
  live_doc_id: string | null;
  base_draft_id: string | null;
}

/**
 * The event sink for a human save. A run-scoped `run_events` row needs a real `runs` FK target, so when the
 * save has no run (the normal case — a person typing) the SAME catalogue-validated events land in
 * `timeline_events`, the project-scoped half of the §5.5 timeline (migration 0019). When a run id IS
 * present (a save inside a delivery/finalize tx) the caller's run-scoped writer is used unchanged.
 */
function timelineSink(
  deps: ManualRevisionDeps,
  args: SaveManualRevisionArgs,
  now: Date,
): DeliveryEventAppender {
  if (args.runId) return deps.eventWriter;
  return {
    async append(exec: SqlExecutor, ev: { runId: string; type: string; payload: unknown; at: Date }) {
      // the catalogue whitelist still gates the write (REQ-DATA-37) — unknown type / bad payload throws.
      const parsed = parseRunEvent(ev.type, ev.payload);
      await exec.query(
        `insert into timeline_events(id, project_id, workspace_id, type, payload, at)
         values ($1,$2,$3,$4,$5,$6)`,
        [deps.ids("ev"), args.projectId, args.workspaceId, parsed.type, JSON.stringify(parsed.payload), ev.at ?? now],
      );
    },
  };
}

/** An `artifact_versions.created_by` actor → the ProvenanceSource a block inherits (§5.4 inheritance). */
function actorToSource(createdBy: unknown, draftN: number): ProvenanceSource {
  const a = createdBy as Actor | null | undefined;
  if (a?.kind === "agent") return { kind: "agent", runId: a.runId, draftN };
  // 'user' and 'system' (imports) both mean a person authored the block.
  return { kind: "human" };
}

async function readVersionText(
  exec: SqlExecutor,
  store: ContentStore,
  versionId: string | null,
): Promise<{ text: string; createdBy: unknown; blockIdMap: unknown; sha256: string } | null> {
  if (!versionId) return null;
  const res = await exec.query(
    "select content_sha256, created_by, block_id_map from artifact_versions where id = $1",
    [versionId],
  );
  const row = res.rows[0] as { content_sha256: string; created_by: unknown; block_id_map: unknown } | undefined;
  if (!row) return null;
  const bytes = await store.get(row.content_sha256);
  if (!bytes) return null;
  return {
    text: Buffer.from(bytes).toString("utf8"),
    createdBy: row.created_by,
    blockIdMap: row.block_id_map,
    sha256: row.content_sha256,
  };
}

/**
 * Save the editor's canonical markdown onto the draft's working head (the autosave path — §5.4). Forks a
 * frozen head on first save; otherwise updates the working `human_revision` head in place. Everything lands
 * in the caller's transaction: the new content-addressed version, the promoted pointer, the live doc, a
 * snapshot restore point, the projected findings, the block-level provenance map, and the timeline events.
 */
export async function saveManualRevision(
  exec: SqlExecutor,
  deps: ManualRevisionDeps,
  args: SaveManualRevisionArgs,
): Promise<SaveManualRevisionResult> {
  const now = deps.clock.now();
  const sink = timelineSink(deps, args, now);

  // 1. Resolve the editable head: frozen → fork v(N+1) (REQ-DATA-24); working human_revision → in place.
  const draftRes = await exec.query(
    `select id, project_id, n, origin, state, promoted_version_id, live_doc_id, base_draft_id
       from drafts where id = $1 and project_id = $2 for update`,
    [args.draftId, args.projectId],
  );
  const draft = draftRes.rows[0] as DraftRow | undefined;
  if (!draft) return { ok: false, reason: "draft_not_found" };

  let headId: string;
  let headN: number;
  let forked = false;
  if (draft.state === "frozen") {
    // A frozen base with an existing WORKING human_revision child already forked — saving to the base id
    // again must not fork v(N+2) (a stale client URL or a retried beacon). Route the save to the child.
    const child = (
      await exec.query(
        `select id, n from drafts
          where base_draft_id = $1 and origin = 'human_revision' and state = 'working'
          order by n desc limit 1`,
        [draft.id],
      )
    ).rows[0] as { id: string; n: number } | undefined;
    if (child) {
      headId = child.id;
      headN = child.n;
    } else {
      headId = deps.ids("dft");
      headN = await openHumanRevision(exec, {
        projectId: args.projectId,
        frozenDraftId: draft.id,
        newDraftId: headId,
        at: now,
      });
      forked = true;
      const ev = parseRunEvent("draft.forked", { draftId: headId, baseDraftId: draft.id, n: headN });
      await sink.append(exec, { runId: args.runId ?? headId, type: ev.type, payload: ev.payload, at: now });
    }
  } else if (draft.state === "working" && draft.origin === "human_revision") {
    headId = draft.id;
    headN = draft.n;
  } else {
    // a working agent/imported head is edited in place by other surfaces; this path owns human revisions.
    return { ok: false, reason: "not_editable" };
  }

  // 2. Load the head's current text (the frozen base's promoted version on a first save) + its
  //    provenance inputs — the base's spans + block-id sidecar drive inheritance.
  const headRow = (
    await exec.query("select promoted_version_id, base_draft_id, n from drafts where id = $1", [headId])
  ).rows[0] as { promoted_version_id: string | null; base_draft_id: string | null; n: number };
  let prevVersionId = headRow.promoted_version_id;
  if (!prevVersionId && headRow.base_draft_id) {
    const baseV = await exec.query("select promoted_version_id from drafts where id = $1", [
      headRow.base_draft_id,
    ]);
    prevVersionId = (baseV.rows[0] as { promoted_version_id: string | null } | undefined)?.promoted_version_id ?? null;
  }
  const prev = await readVersionText(exec, deps.store, prevVersionId);
  const beforeMd = prev?.text ?? "";

  // Findings were filed on the draft the review read — the working head's frozen base (the reviewed vN),
  // or the head itself when nothing precedes it.
  const findingDraftId = headRow.base_draft_id ?? headId;

  const sha256 = sha256Hex(args.markdown);
  const changed = !prev || prev.sha256 !== sha256;

  let versionId: string | null = null;
  let restorePointId: string | null = null;

  if (changed) {
    // 3. Persist the bytes content-addressed (an identical save never re-uploads — REQ-DATA-9a's rule).
    const bytes = new TextEncoder().encode(args.markdown);
    const { key } = await deps.store.put(args.workspaceId, sha256, bytes);

    // 4. The draft's artifact: drafts live at `drafts/v<N>.md` in the shared namespace (the seed's layout).
    const mirrorPath = `drafts/v${headN}.md`;
    const artRes = await exec.query(
      "select id from artifacts where project_id = $1 and mirror_path = $2",
      [args.projectId, mirrorPath],
    );
    let artifactId = (artRes.rows[0] as { id: string } | undefined)?.id;
    if (!artifactId) {
      artifactId = deps.ids("art");
      await exec.query(
        `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, created_at)
         values ($1,$2,$3,'draft','shared',$4,$5)`,
        [artifactId, args.workspaceId, args.projectId, mirrorPath, now],
      );
    }
    const ordinal = (
      (await exec.query("select coalesce(max(ordinal),0)+1 as n from artifact_versions where artifact_id = $1", [
        artifactId,
      ])).rows[0] as { n: number }
    ).n;

    // 5. The version row carries the block-id sidecar (`block_id_map`) — the canonical markdown itself
    //    NEVER carries ids or marks (REQ-DATA-29's stripping rule; AC5).
    versionId = deps.ids("av");
    await exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count,
         media_type, created_by, created_at, immutable, block_id_map)
       values ($1,$2,$3,$4,$5,$6,$7,'text/markdown',$8,$9,false,$10)`,
      [
        versionId,
        artifactId,
        ordinal,
        sha256,
        key,
        bytes.byteLength,
        args.markdown.split(/\s+/).filter(Boolean).length,
        JSON.stringify({ kind: "user", userId: args.userId } satisfies Actor),
        now,
        JSON.stringify(buildBlockIdMap(args.markdown)),
      ],
    );
    await exec.query("update artifacts set head_version_id = $2 where id = $1", [artifactId, versionId]);
    await exec.query("update drafts set promoted_version_id = $2 where id = $1", [headId, versionId]);

    // 6. The block-level provenance map (REQ-DATA-29's capture half): touched blocks are `human`;
    //    unchanged blocks inherit their base span via the content-hash sidecar.
    let baseSpans: readonly ProvenanceSpan[] | null = null;
    if (prevVersionId) {
      const pm = await exec.query("select spans from provenance_maps where draft_version_id = $1", [
        prevVersionId,
      ]);
      baseSpans = ((pm.rows[0] as { spans: ProvenanceSpan[] } | undefined)?.spans ?? null) as readonly ProvenanceSpan[] | null;
    }
    const provenanceBase: ProvenanceBase = {
      spans: baseSpans,
      blockIdMap: (prev?.blockIdMap as ProvenanceBase["blockIdMap"]) ?? null,
      fallbackSource: actorToSource(prev?.createdBy, headN - 1),
    };
    // P1.02: the Page's live capture wins when present (it saw the individual transactions — the diff
    // fallback can only see net change). Agent-span captures fold onto their block rows as `capture`
    // (write-only, REQ-POS-9 — additive jsonb; readers of {blockId,source} are unaffected).
    let spans: unknown[] = args.provenance?.spans
      ? args.provenance.spans.map((s) => ({ blockId: s.blockId, source: s.source }))
      : [...humanRevisionProvenance(beforeMd, args.markdown, provenanceBase)];
    const captures = args.provenance?.agentSpans ?? [];
    if (captures.length > 0) {
      const byBlock = new Map<string, { from: number; to: number }[]>();
      for (const c of captures) {
        const arr = byBlock.get(c.blockId) ?? [];
        arr.push({ from: c.from, to: c.to });
        byBlock.set(c.blockId, arr);
      }
      spans = spans.map((s) => {
        const row = s as { blockId: string };
        const cap = byBlock.get(row.blockId);
        return cap ? { ...(s as object), capture: cap } : s;
      });
    }
    await exec.query(
      `insert into provenance_maps(draft_version_id, granularity, spans) values ($1,'block',$2)
       on conflict (draft_version_id) do update set spans = excluded.spans`,
      [versionId, JSON.stringify(spans)],
    );

    // 7. The live doc + a snapshot restore point (§11.6's storage tier — auto cause; the browsing UI is P1.3).
    const live = (
      await exec.query("select live_doc_id from drafts where id = $1", [headId])
    ).rows[0] as { live_doc_id: string | null };
    let liveDocId = live.live_doc_id;
    if (!liveDocId) {
      liveDocId = deps.ids("doc");
      await exec.query(
        `insert into live_docs(id, draft_id, y_state, state_vector, md_sha256, materialized_at)
         values ($1,$2,'\\x'::bytea,'\\x'::bytea,$3,$4)`,
        [liveDocId, headId, sha256, now],
      );
      await exec.query("update drafts set live_doc_id = $2 where id = $1", [headId, liveDocId]);
    } else {
      await exec.query("update live_docs set md_sha256 = $2, materialized_at = $3 where id = $1", [
        liveDocId,
        sha256,
        now,
      ]);
    }
    if ((args.restorePoint ?? "content-addressed") === "content-addressed") {
      restorePointId = deps.ids("rp");
      await exec.query(
        `insert into restore_points(id, live_doc_id, s3_key, kind, cause) values ($1,$2,$3,'snapshot','auto')`,
        [restorePointId, liveDocId, s3KeyFor(args.workspaceId, sha256)],
      );
    }

    // 8. Findings follow the text (§5.4): every finding filed on the reviewed base projects onto the
    //    edited head; a lost quote lands on Whole piece ("passage changed — still applies?") as a
    //    `mooted` candidate for the next Revise's triage (REQ-DATA-26).
    const findings = (
      await exec.query("select id, anchor, projections from findings where draft_id = $1 order by ordinal", [
        findingDraftId,
      ])
    ).rows as { id: string; anchor: unknown; projections: unknown }[];
    const projected = projectFindingsOntoMarkdown(
      findings.map((f) => ({ id: f.id, anchor: f.anchor as Anchor | null })),
      args.markdown,
    );
    const byFinding = new Map(projected.map((p) => [p.findingId, p]));
    for (const f of findings) {
      const p = byFinding.get(f.id);
      if (!p) continue;
      const existing: { draftId: string; anchor: Anchor }[] = Array.isArray(f.projections)
        ? (f.projections as { draftId: string; anchor: Anchor }[]).filter((x) => x.draftId !== headId)
        : [];
      existing.push({ draftId: headId, anchor: p.anchor });
      await exec.query("update findings set projections = $2 where id = $1", [f.id, JSON.stringify(existing)]);
    }

    // 9. The PRB.06 trace seam: the vN→v(N+1) diff emits `revision.move_traced` (REQ-BETA-7's manual half).
    await traceManualRevision(exec, { store: deps.store, eventWriter: sink }, {
      draftId: headId,
      newVersionId: versionId,
      runId: args.runId,
      at: now,
    });
  } else {
    versionId = prevVersionId;
  }

  // The projection set this save leaves the editor with (recomputed on every save, changed or not, so the
  // response always describes the head's current findings view).
  const findingRows = (
    await exec.query("select id, anchor from findings where draft_id = $1 order by ordinal", [findingDraftId])
  ).rows as { id: string; anchor: unknown }[];
  const projections = projectFindingsOntoMarkdown(
    findingRows.map((f) => ({ id: f.id, anchor: f.anchor as Anchor | null })),
    args.markdown,
  );

  return {
    ok: true,
    draftId: headId,
    draftN: headN,
    versionId: versionId!,
    sha256,
    forked,
    changed,
    restorePointId,
    projections,
  };
}
