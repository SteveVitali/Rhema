// P1.13 — the Figure run's delivery consequences (§7.5; REQ-VIZ-1/2/9). A figure run carries no
// dossier — its products are the committed asset files under `assets/figures/<figure-id>/` plus the
// `figure.json` card twin. Inside the finalize transaction this module:
//
//   1. folds `figure.json` (the caption phase's sidecar, committed under the seat `.rhema/` dir)
//      into the `figures` row — title/caption/alt (≤250)/sourceLine + the spec kind the seat
//      actually wrote;
//   2. folds the committed `provenance.json` artifact into `figures.provenance` (the structured
//      provenance the honesty step classified — never re-authored here);
//   3. pins the produced spec/data artifact versions onto the row (`spec_version_id`,
//      `data_version_id`) — the card + pane read the PINNED versions, so a failed iterate's
//      partial head never shows as the figure;
//   4. appends the `figure_versions` row for this iteration (n = max+1, or `priorVersion`+1 —
//      REQ-VIZ-9's version-per-iteration), and on an iterate run snapshots the PRIOR spec/data/
//      provenance bytes into `versions/<n>/` so the strip's restore reads real files;
//   5. enqueues nothing itself — the `figure.render` worker job is the render-step commit's
//      consequence (see `figureRenderJob` in this module), keeping the canonical render on the
//      deterministic server path, never a pod or browser.
//
// The insert-as-proposal path (`figure.proposed`/`figure.accepted`) is the API's, not this
// finalize's — the card appears as soon as the row reads complete.

import {
  figureSidecarSchema,
  figureProvenanceSchema,
  SPEC_FILENAME,
  FIGURE_KIND_BY_SPEC,
  type FigureProvenance,
  type FigureSpecKind,
} from "@rhema/contracts";
import { renderFigure, inlineCsvData } from "@rhema/figures";
import { persistHarvest, sha256Hex, type ContentStore, type NewVersion } from "@rhema/mirror";
import type { SqlClient, TxRunner } from "./tx.js";
import type { EventWriter } from "./event-writer.js";

/** Deps the figure delivery + render consequence share (subset of OrchestratorDeps + the store). */
export interface FigureDeps {
  readonly ids: (prefix: string) => string;
  readonly clock: { now(): Date };
  readonly eventWriter: EventWriter;
  readonly store: ContentStore;
}

export interface FigureDeliveryArgs {
  readonly runId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  /** the run's FROZEN inputs (`figureId`, `priorVersion?`, `entryPoint`, `request`). */
  readonly inputs: Record<string, unknown>;
}

/** The artifact row + head version at a mirror path (null when absent). */
async function artifactHead(
  tx: SqlClient,
  projectId: string,
  mirrorPath: string,
): Promise<{ artifactId: string; versionId: string | null; sha256: string | null; ordinal: number | null } | null> {
  const row = (
    await tx.query(
      `select a.id, av.id as version_id, av.content_sha256, av.ordinal
         from artifacts a left join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path = $2`,
      [projectId, mirrorPath],
    )
  ).rows[0] as
    | { id: string; version_id: string | null; content_sha256: string | null; ordinal: number | null }
    | undefined;
  if (!row) return null;
  return { artifactId: row.id, versionId: row.version_id, sha256: row.content_sha256, ordinal: row.ordinal };
}

/** Read + JSON-parse the head bytes at a mirror path (null when absent/unparseable). */
async function headJson<T>(tx: SqlClient, store: ContentStore, projectId: string, path: string): Promise<T | null> {
  const head = await artifactHead(tx, projectId, path);
  if (!head?.sha256) return null;
  const bytes = await store.get(head.sha256);
  if (!bytes) return null;
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Apply the Figure delivery consequences inside the finalize transaction. Returns the figure id +
 * the version ordinal the run produced; null when the run never produced a spec (a failed/empty
 * run leaves the figures row exactly as run creation seeded it — the pane shows a stub, never a
// half-written asset).
 */
export async function applyFigureDelivery(
  tx: SqlClient,
  deps: FigureDeps,
  args: FigureDeliveryArgs,
): Promise<{ figureId: string; versionOrdinal: number } | null> {
  const figureId = typeof args.inputs["figureId"] === "string" ? (args.inputs["figureId"] as string) : null;
  if (!figureId) return null;
  const row = (
    await tx.query(`select id, provenance from figures where id = $1 and project_id = $2`, [figureId, args.projectId])
  ).rows[0] as { id: string; provenance: unknown } | undefined;
  if (!row) return null; // a figure run on an unknown asset — never invent the row here

  const dir = `assets/figures/${figureId}`;
  const sidecar = figureSidecarSchema.safeParse(
    await headJson<unknown>(tx, deps.store, args.projectId, "agents/author/.rhema/figure.json"),
  );
  const provenanceRaw = await headJson<unknown>(tx, deps.store, args.projectId, `${dir}/provenance.json`);
  const provenance = figureProvenanceSchema.safeParse(provenanceRaw);

  // the spec artifact: the sidecar's declared kind first, then the other canonical paths.
  const specKind: FigureSpecKind | null = sidecar.success ? sidecar.data.specKind : null;
  const tried = specKind ? [specKind, ...(Object.keys(SPEC_FILENAME) as FigureSpecKind[]).filter((k) => k !== specKind)] : (Object.keys(SPEC_FILENAME) as FigureSpecKind[]);
  let spec: { artifactId: string; versionId: string | null; sha256: string | null; ordinal: number | null } | null = null;
  let resolvedKind: FigureSpecKind | null = null;
  for (const k of tried) {
    const h = await artifactHead(tx, args.projectId, `${dir}/${SPEC_FILENAME[k]}`);
    if (h?.versionId) {
      spec = h;
      resolvedKind = k;
      break;
    }
  }
  const data = await artifactHead(tx, args.projectId, `${dir}/data.csv`);
  if (!spec?.versionId) return null; // the spec phase never committed — nothing to pin
  // The render leg is a worker job racing the caption phase: when `figure.render` already landed,
  // its `render.svg` head pins here; when it lands later, the job itself back-fills the row.
  const rendered = await artifactHead(tx, args.projectId, `${dir}/render.svg`);

  const priorOrdinal = (
    await tx.query(`select coalesce(max(ordinal), 0) as n from figure_versions where figure_id = $1`, [figureId])
  ).rows[0] as { n: number };
  const ordinal = priorOrdinal.n + 1;

  // ---- the row fold: card fields + pinned versions + the structured provenance the honesty
  //      step wrote. `inserted_in_draft_id` is the ACCEPT path's field, untouched here. ----
  const prov = provenance.success ? provenance.data : (row.provenance as FigureProvenance | null);
  await tx.query(
    `update figures set
       title = $2, caption = $3, alt = $4, source_line = $5,
       spec_kind = $6, spec_version_id = $7, data_version_id = $8, artifact_id = $9,
       rendered_version_id = $10, provenance = $11, latest_run_id = $12
     where id = $1`,
    [
      figureId,
      sidecar.success ? sidecar.data.title : null,
      sidecar.success ? sidecar.data.caption : null,
      sidecar.success ? sidecar.data.alt : null,
      sidecar.success ? sidecar.data.sourceLine : null,
      resolvedKind ?? specKind,
      spec.versionId,
      data?.versionId ?? null,
      spec.artifactId,
      rendered?.versionId ?? null,
      JSON.stringify(prov ?? null),
      args.runId,
    ],
  );
  // the Versions strip's request text: the run's frozen request ("initial" on the first run).
  const requestText =
    typeof args.inputs["request"] === "string" ? (args.inputs["request"] as string) : ordinal === 1 ? "initial" : null;
  await tx.query(
    `insert into figure_versions (id, figure_id, ordinal, spec_version_id, data_version_id, rendered_version_id, request, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      deps.ids("figv"),
      figureId,
      ordinal,
      spec.versionId,
      data?.versionId ?? null,
      rendered?.versionId ?? null,
      requestText,
      deps.clock.now(),
    ],
  );

  // ---- REQ-VIZ-9 — the iterate snapshot: on version n+1, the PRIOR spec/data/provenance land
  //      under `versions/<n>/` (the strip's restore reads real files). Content-addressed and
  //      head-sha-compared, so a re-driven finalize never doubles them. ----
  if (ordinal > 1) {
    const snapshot: NewVersion[] = [];
    const snapshotFiles = [
      { srcDir: SPEC_FILENAME[resolvedKind!] ?? "spec.vl.json", name: "spec" },
      { srcDir: "data.csv", name: "data" },
      { srcDir: "provenance.json", name: "provenance" },
    ];
    for (const f of snapshotFiles) {
      // the PRIOR head = the version just before the current head at this path.
      const prev = (
        await tx.query(
          `select av.content_sha256 from artifact_versions av
             join artifacts a on a.id = av.artifact_id
            where a.project_id = $1 and a.mirror_path = $2 and av.ordinal < $3
            order by av.ordinal desc limit 1`,
          [args.projectId, `${dir}/${f.srcDir}`, (await artifactHead(tx, args.projectId, `${dir}/${f.srcDir}`))?.ordinal ?? 1],
        )
      ).rows[0] as { content_sha256: string } | undefined;
      if (!prev) continue;
      const dstPath = `${dir}/versions/${ordinal - 1}/${f.srcDir}`;
      const dst = await artifactHead(tx, args.projectId, dstPath);
      if (dst?.sha256 === prev.content_sha256) continue; // already snapshotted — idempotent
      const bytes = await deps.store.get(prev.content_sha256);
      if (!bytes) continue;
      snapshot.push({
        path: dstPath,
        root: "project",
        kind: "asset",
        namespace: "shared",
        sha256: prev.content_sha256,
        bytes,
        wordCount: 0,
      });
    }
    if (snapshot.length > 0) {
      await persistHarvest(
        tx,
        deps.store,
        deps,
        { workspaceId: args.workspaceId, projectId: args.projectId, createdBy: { kind: "run", runId: args.runId } },
        snapshot,
      );
    }
  }

  return { figureId, versionOrdinal: ordinal };
}

// ---------------------------------------------------------------------------------------------------------
// The render consequence — `figure.render` is the deterministic server-side render (§12.1; REQ-VIZ-6/7).
// ---------------------------------------------------------------------------------------------------------

/** The `figure.render` queue name (§12.1; declared in apps/worker WORKER_QUEUES). */
export const FIGURE_RENDER_QUEUE = "figure.render" as const;

/**
 * The render-step commit consequence: called post-commit when a `figure` run's `render` step lands.
 * Enqueues `figure.render` with a singleton key on (run, figure, attempt) — a retried step commit
// dedupes; the pod's caption phase runs while the worker renders (the card reacts to
// `figure.rendered`).
 */
export async function enqueueFigureRender(
  deps: { queue: { send(name: string, payload: Record<string, unknown>, opts?: { singletonKey?: string }): Promise<void> } },
  args: { runId: string; workspaceId: string; figureId: string; attempt: number },
): Promise<void> {
  await deps.queue.send(
    FIGURE_RENDER_QUEUE,
    { figureId: args.figureId, runId: args.runId, workspaceId: args.workspaceId, attempt: args.attempt },
    { singletonKey: `${FIGURE_RENDER_QUEUE}:${args.figureId}:${args.runId}:${args.attempt}` },
  );
}

/** The figure card's headline kind chip, derived from the committed spec kind. */
export function figureKindFor(specKind: FigureSpecKind): string {
  return FIGURE_KIND_BY_SPEC[specKind];
}

// ---------------------------------------------------------------------------------------------------------
// `figure.render` — the worker-owned canonical render (§12.1; REQ-VIZ-6/7/8).
// ---------------------------------------------------------------------------------------------------------

export interface FigureRenderJobDeps extends FigureDeps {
  readonly txRunner: TxRunner;
}

export type FigureRenderOutcome =
  | { readonly ok: true; readonly kind: "rendered" | "table" | "declined"; readonly suggestion?: string }
  | { readonly ok: false; readonly reason: string };

/**
 * The `figure.render` job (enqueued by the render step's commit): render the committed spec head to
 * the persisted light+dark SVG pair, pin `figures.rendered_version_id` (+ the `figure_versions` row
// carrying that spec), and emit `figure.rendered`. Idempotent — the persisted renders are
// content-addressed, so a replay that produces byte-identical SVGs just re-points the head.
 */
export async function figureRenderJob(
  deps: FigureRenderJobDeps,
  args: { figureId: string; runId: string | null; workspaceId: string },
): Promise<FigureRenderOutcome> {
  return deps.txRunner.run(args.workspaceId, async (tx): Promise<FigureRenderOutcome> => {
    const fig = (
      await tx.query(`select id, project_id, spec_kind, spec_version_id from figures where id = $1`, [args.figureId])
    ).rows[0] as
      | { id: string; project_id: string | null; spec_kind: string | null; spec_version_id: string | null }
      | undefined;
    if (!fig?.project_id) return { ok: false, reason: "figure not found" };
    const dir = `assets/figures/${args.figureId}`;

    // the committed spec head — prefer the run-pinned version, else probe the canonical paths.
    let specHead: { artifactId: string; versionId: string | null; sha256: string | null; ordinal: number | null } | null = null;
    let specKind: FigureSpecKind | null = null;
    if (fig.spec_version_id && fig.spec_kind) {
      specHead = await artifactHead(tx, fig.project_id, `${dir}/${SPEC_FILENAME[fig.spec_kind as FigureSpecKind]}`);
      specKind = fig.spec_kind as FigureSpecKind;
    }
    if (!specHead?.versionId) {
      for (const k of Object.keys(SPEC_FILENAME) as FigureSpecKind[]) {
        const h = await artifactHead(tx, fig.project_id, `${dir}/${SPEC_FILENAME[k]}`);
        if (h?.versionId) {
          specHead = h;
          specKind = k;
          break;
        }
      }
    }
    if (!specHead?.sha256 || !specKind) return { ok: false, reason: "no spec committed" };
    const specBytes = await deps.store.get(specHead.sha256);
    if (!specBytes) return { ok: false, reason: "spec bytes missing" };

    // bind the spec: vega_lite parses JSON (a `data.url` gets the committed data.csv inlined —
    // the canonical render never fetches); mermaid/table pass source text.
    let spec: unknown = Buffer.from(specBytes).toString("utf8");
    if (specKind === "vega_lite") {
      try {
        spec = JSON.parse(spec as string) as unknown;
      } catch {
        return { ok: false, reason: "spec.vl.json is not valid JSON" };
      }
      const dataHead = await artifactHead(tx, fig.project_id, `${dir}/data.csv`);
      if (dataHead?.sha256) {
        const csv = await deps.store.get(dataHead.sha256);
        if (csv) spec = inlineCsvData(spec, Buffer.from(csv).toString("utf8"));
      }
    }

    const result = await renderFigure({ specKind, spec });
    const now = deps.clock.now();

    if (result.kind === "rendered") {
      const versions: NewVersion[] = [
        {
          path: `${dir}/render.svg`,
          root: "project",
          kind: "figure",
          namespace: "shared",
          sha256: sha256Hex(result.svg),
          bytes: new TextEncoder().encode(result.svg),
          wordCount: 0,
        },
        {
          path: `${dir}/render.dark.svg`,
          root: "project",
          kind: "figure",
          namespace: "shared",
          sha256: sha256Hex(result.svgDark),
          bytes: new TextEncoder().encode(result.svgDark),
          wordCount: 0,
        },
      ];
      const persisted = await persistHarvest(
        tx,
        deps.store,
        deps,
        {
          workspaceId: args.workspaceId,
          projectId: fig.project_id,
          createdBy: args.runId != null ? { kind: "run", runId: args.runId } : { kind: "server" },
        },
        versions,
      );
      const renderV = persisted.find((p) => p.path.endsWith("/render.svg"))?.versionId ?? null;
      if (renderV) {
        // pin the render on the row ONLY when it's the render of the row's current spec (a stale
        // job replaying an old spec must not clobber a newer render); the version row for THIS
        // spec always back-fills.
        await tx.query(
          `update figure_versions set rendered_version_id = $2, render_status = 'rendered', render_error = null
            where figure_id = $1 and spec_version_id = $3`,
          [args.figureId, renderV, specHead.versionId],
        );
        await tx.query(
          `update figures set rendered_version_id = $2 where id = $1 and (spec_version_id = $3 or spec_version_id is null)`,
          [args.figureId, renderV, specHead.versionId],
        );
      }
    } else if (result.kind === "declined") {
      // the decline lands as a persisted fact (the pane shows the suggestion, never silence).
      const body = JSON.stringify({ suggestion: result.suggestion }, null, 2);
      await persistHarvest(
        tx,
        deps.store,
        deps,
        {
          workspaceId: args.workspaceId,
          projectId: fig.project_id,
          createdBy: args.runId != null ? { kind: "run", runId: args.runId } : { kind: "server" },
        },
        [
          {
            path: `${dir}/render.declined.json`,
            root: "project",
            kind: "figure",
            namespace: "shared",
            sha256: sha256Hex(body),
            bytes: new TextEncoder().encode(body),
            wordCount: 0,
          },
        ],
      );
      await tx.query(
        `update figure_versions set render_status = 'declined', render_error = $2
          where figure_id = $1 and spec_version_id = $3`,
        [args.figureId, result.suggestion ?? "declined", specHead.versionId],
      );
    } else if (result.kind === "table") {
      await tx.query(
        `update figure_versions set render_status = 'rendered', render_error = null
          where figure_id = $1 and spec_version_id = $2`,
        [args.figureId, specHead.versionId],
      );
    }
    // `table` — no render artifact; the card shows table.md itself (§7.5).

    // `figure.rendered` is a run-scoped event — a run-triggered render lands on its stream; a
    // restore-triggered render (runId null) has no stream and the pane re-reads the row instead.
    if (args.runId != null) {
      await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: "figure.rendered",
        payload: { figureId: args.figureId },
        at: now,
      });
    }
    return {
      ok: true,
      kind: result.kind,
      ...(result.kind === "declined" ? { suggestion: result.suggestion } : {}),
    };
  });
}
