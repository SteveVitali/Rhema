// P1.12 — the Approve-outline delivery consequences (§7.3; REQ-CHAT-17/18). `approve_outline` sits
// on the Outline workflow's LAST phase (`gaps`), so resolving it enters `finalizing` and the
// `run.finalize` worker job completes the run — no pod ever resumes. This module is the consequence
// half of that finalize, inside the same transaction as `finalizing → completed`:
//
//   1. the outline artifact the gaps phase committed at `agents/author/outline/<slug>.md` (+ its
//      `.json` twin) is located and named on the emitted `outline.approved` event;
//   2. the source notes the promotion froze into `inputs.sourceCopies` are COPIED
//      (`agents/assistant/research/…` → `agents/author/research/…`) as author-namespace versions —
//      content-addressed puts, created_by the run; a destination whose head is already byte-identical
//      is skipped (a re-driven finalize never doubles versions);
//   3. the assistant research index lands at `agents/author/research/index.json` with its entry
//      paths rewritten to the copied author paths, so the author-side research view lists the same
//      sources under their new home.
//
// The `outlined` project state + the "Draft v1" next-step card need no write here: they read
// `artifacts.kind = 'outline'` (project-state.ts) — the committed artifact flips the state by
// existing. A re-outline of the same slug lands as `vN+1` of the same artifact by the ordinary
// harvest/version mechanics.

import { persistHarvest, sha256Hex, type ContentStore, type NewVersion } from "@rhema/mirror";
import type { SqlClient } from "./tx.js";
import type { EventWriter } from "./event-writer.js";

/** Deps the consequence pass needs (subset of `OrchestratorDeps` + the workspace content store). */
export interface OutlineApprovalDeps {
  readonly ids: (prefix: string) => string;
  readonly clock: { now(): Date };
  readonly eventWriter: EventWriter;
  readonly store: ContentStore;
}

export interface OutlineApprovalArgs {
  readonly runId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  /** the run's FROZEN inputs (`outlineSlug`, `sourceCopies`, `threadId`, `scope`, `turnId`). */
  readonly inputs: Record<string, unknown>;
}

export interface OutlineApprovalOutcome {
  readonly slug: string;
  readonly outlineArtifactId: string;
  readonly outlineVersionId: string | null;
  /** the `agents/author/research/` paths written this pass. */
  readonly copiedNotes: readonly string[];
}

interface SourceCopy {
  readonly src: string;
  readonly dst: string;
}

function sourceCopiesFrom(inputs: Record<string, unknown>): SourceCopy[] {
  const raw = inputs["sourceCopies"];
  if (!Array.isArray(raw)) return [];
  const out: SourceCopy[] = [];
  for (const c of raw) {
    if (
      typeof c === "object" &&
      c !== null &&
      typeof (c as SourceCopy).src === "string" &&
      typeof (c as SourceCopy).dst === "string"
    ) {
      out.push({ src: (c as SourceCopy).src, dst: (c as SourceCopy).dst });
    }
  }
  return out;
}

/** The artifact row + head-version sha at a mirror path (null when absent). */
async function artifactHead(
  tx: SqlClient,
  projectId: string,
  mirrorPath: string,
): Promise<{ artifactId: string; versionId: string | null; sha256: string | null } | null> {
  const row = (
    await tx.query(
      `select a.id, av.id as version_id, av.content_sha256
         from artifacts a left join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path = $2`,
      [projectId, mirrorPath],
    )
  ).rows[0] as { id: string; version_id: string | null; content_sha256: string | null } | undefined;
  if (!row) return null;
  return { artifactId: row.id, versionId: row.version_id, sha256: row.content_sha256 };
}

function wordCountOf(bytes: Uint8Array): number {
  const t = Buffer.from(bytes).toString("utf8").trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

/**
 * Apply the Approve-outline consequences inside the finalize transaction. Returns null only when the
 * run produced no outline artifact at the declared path (a `gateArtifact` that never committed — the
 * gate could not have bound, but a hand-driven finalize still no-ops rather than throwing).
 */
export async function applyOutlineApproval(
  tx: SqlClient,
  deps: OutlineApprovalDeps,
  args: OutlineApprovalArgs,
): Promise<OutlineApprovalOutcome | null> {
  const slug =
    typeof args.inputs["outlineSlug"] === "string" && (args.inputs["outlineSlug"] as string).trim() !== ""
      ? (args.inputs["outlineSlug"] as string)
      : "outline";
  const mdPath = `agents/author/outline/${slug}.md`;
  const head = await artifactHead(tx, args.projectId, mdPath);
  if (!head) return null;

  // ---- source-note copies (§7.3 "copies the referenced agents/assistant/research/*.md to
  //      agents/author/research/"). Each copy is a NEW artifact (or version) in the author
  //      namespace — the assistant note stays put (chat provenance is never rewritten). ----
  const copies = sourceCopiesFrom(args.inputs);
  const newVersions: NewVersion[] = [];
  const copiedPaths: string[] = [];
  for (const c of copies) {
    const src = await artifactHead(tx, args.projectId, c.src);
    if (!src?.sha256) continue; // a source that never materialized copies nothing
    const dst = await artifactHead(tx, args.projectId, c.dst);
    if (dst?.sha256 === src.sha256) continue; // already copied — idempotent
    const bytes = await deps.store.get(src.sha256);
    if (!bytes) continue;
    newVersions.push({
      path: c.dst,
      root: "project",
      kind: "research",
      namespace: "agent:author",
      sha256: src.sha256, // content-addressed: the SAME bytes the assistant note carries
      bytes,
      wordCount: wordCountOf(bytes),
    });
    copiedPaths.push(c.dst);
  }

  // ---- the research index follows the notes: the assistant index's entries for the copied
  //      sources land at `agents/author/research/index.json` with `path` rewritten to the
  //      author copy (merge over any existing author index — the outline is additive). ----
  const indexSrc = await artifactHead(tx, args.projectId, "agents/assistant/research/index.json");
  if (indexSrc?.sha256) {
    const raw = await deps.store.get(indexSrc.sha256);
    if (raw) {
      try {
        const index = JSON.parse(Buffer.from(raw).toString("utf8")) as {
          version?: number;
          entries?: { path?: string }[];
        };
        const dstBySrc = new Map(copies.map((c) => [c.src, c.dst]));
        const copiedEntries: { path: string | undefined }[] = (index.entries ?? [])
          .filter((e) => typeof e.path === "string" && dstBySrc.has(e.path))
          .map((e) => ({ ...e, path: dstBySrc.get(e.path as string) }));
        if (copiedEntries.length > 0) {
          const dstIndex = await artifactHead(tx, args.projectId, "agents/author/research/index.json");
          let merged: { path: string | undefined }[] = copiedEntries;
          if (dstIndex?.sha256) {
            const prior = await deps.store.get(dstIndex.sha256);
            if (prior) {
              try {
                const prev = JSON.parse(Buffer.from(prior).toString("utf8")) as { entries?: { path?: string }[] };
                const seen = new Set(copiedEntries.map((e) => e.path));
                const kept: { path: string | undefined }[] = (prev.entries ?? [])
                  .filter((e) => !seen.has(e.path))
                  .map((e) => ({ ...e, path: e.path }));
                merged = [...kept, ...copiedEntries];
              } catch {
                /* a corrupt prior index is replaced, never fatal */
              }
            }
          }
          const bytes = Buffer.from(JSON.stringify({ version: 1, entries: merged }, null, 2) + "\n", "utf8");
          // The same idempotence rule as the notes: a merged index byte-identical to the current
          // head writes nothing (a re-driven finalize never doubles versions).
          if (sha256Hex(bytes) !== dstIndex?.sha256) {
            newVersions.push({
              path: "agents/author/research/index.json",
              root: "project",
              kind: "research",
              namespace: "agent:author",
              sha256: sha256Hex(bytes),
              bytes,
              wordCount: 0,
            });
            copiedPaths.push("agents/author/research/index.json");
          }
        }
      } catch {
        /* an unparseable assistant index copies nothing — the note copies still land */
      }
    }
  }

  if (newVersions.length > 0) {
    await persistHarvest(tx, deps.store, deps, {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      createdBy: { kind: "run", runId: args.runId },
    }, newVersions);
  }

  await deps.eventWriter.append(tx, {
    runId: args.runId,
    type: "outline.approved",
    payload: {
      slug,
      artifactId: head.artifactId,
      ...(head.versionId ? { versionId: head.versionId } : {}),
      copiedNotes: copiedPaths.length,
      ...(typeof args.inputs["threadId"] === "string" ? { threadId: args.inputs["threadId"] } : {}),
      ...(typeof args.inputs["scope"] === "string" ? { scope: args.inputs["scope"] } : {}),
    },
    at: deps.clock.now(),
  });

  return {
    slug,
    outlineArtifactId: head.artifactId,
    outlineVersionId: head.versionId,
    copiedNotes: copiedPaths,
  };
}
