// PGlite-backed test harness for @rhema/obligations — the chain's deterministic DB-test pattern. Reuses
// @rhema/mirror/testing (real migrations in-process, deterministic ids/clock, the in-memory content store) and
// adds obligation-specific seeders (a bare project/draft, a correspondence, a finding) so the state-machine,
// spawn, routing, lineage, counts and stall tests run against real Postgres semantics without a DB service.

import {
  createMirrorTestDb,
  InMemoryContentStore,
  seedBase,
  seedFetchLog,
  seedMirrorProject,
  seedRun,
  sha256Hex,
  testDeps,
  type MirrorTestDb,
} from "@rhema/mirror/testing";
import { normalizeUrl } from "@rhema/mirror";
import type { SqlExecutor } from "../types.js";
import type { SqlObligationHook } from "../hook.js";

export { createMirrorTestDb, InMemoryContentStore, sha256Hex, seedBase, seedMirrorProject, seedRun, seedFetchLog, testDeps };
export type { MirrorTestDb };

/** Create the PGlite test db (alias of the mirror harness). */
export const createObligationTestDb = createMirrorTestDb;

let seq = 0;
function localId(prefix: string): string {
  return `${prefix}_${(seq++).toString().padStart(4, "0")}`;
}

export interface SeededProject {
  readonly workspaceId: string;
  readonly userId: string;
  readonly projectId: string;
  readonly draftId: string;
}

/** Seed a base workspace + one project + one frozen draft (enough for obligation FKs). */
export async function seedProject(
  exec: SqlExecutor,
  store: InMemoryContentStore,
  opts: { projectId?: string } = {},
): Promise<SeededProject> {
  const { workspaceId, userId } = await seedBase(exec);
  const projectId = opts.projectId ?? localId("proj");
  const seeded = await seedMirrorProject(exec, store, workspaceId, {
    id: projectId,
    personaId: localId("prs"),
    tag: "Obligation fixture",
  });
  return { workspaceId, userId, projectId: seeded.projectId, draftId: seeded.draftId };
}

/** Insert a correspondence_item (a delivered review/response) and return its id. */
export async function seedCorrespondence(
  exec: SqlExecutor,
  args: { projectId: string; draftId: string; runId: string; kind?: string; ordinal?: number; at?: Date },
): Promise<string> {
  const id = localId("corr");
  await exec.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids)
     values ($1,$2,$3,$4,$5,$6,$7,'{}')`,
    [id, args.projectId, args.kind ?? "review", args.draftId, args.runId, args.ordinal ?? 1, args.at ?? new Date("2026-09-03T00:00:00Z")],
  );
  return id;
}

/** Insert a finding row and return its id (the obligation FKs need a real finding). */
export async function seedFinding(
  exec: SqlExecutor,
  args: {
    correspondenceId: string;
    draftId: string;
    ordinal: number;
    kind?: string;
    severity?: string;
    origin?: string;
    reconciliation?: string | null;
    title?: string;
    quote?: string;
    url?: string;
  },
): Promise<string> {
  const id = localId("fnd");
  const anchor = args.quote ? { blockId: `b${args.ordinal}`, quote: args.quote, startOffset: 0, endOffset: args.quote.length, confidence: 1 } : null;
  const evidence = args.url ? { urls: [{ url: args.url, accessed: "2026-09-03T00:00:00.000Z" }] } : null;
  await exec.query(
    `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, reconciliation, title, body, evidence, anchor)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      args.correspondenceId,
      args.draftId,
      args.ordinal,
      args.kind ?? "claim",
      args.severity ?? "major",
      args.origin ?? "editor",
      args.reconciliation ?? null,
      args.title ?? `Finding ${args.ordinal}`,
      "body",
      evidence ? JSON.stringify(evidence) : null,
      anchor ? JSON.stringify(anchor) : null,
    ],
  );
  return id;
}

/** One finding in a simulated review delivery. */
export interface DeliveredFindingSpec {
  readonly ordinal: number;
  readonly severity: string;
  readonly kind?: string;
  readonly title?: string;
  readonly origin?: string;
  readonly reconciliation?: string | null;
  readonly quote?: string;
  readonly url?: string;
  readonly carriesObligationId?: string | null;
}

/**
 * Drive a REVIEW delivery through the obligation hook (the lightweight path — it seeds the correspondence and
 * finding rows the hook needs and invokes `hook.onDelivery` with the same context `runDeliveryTransaction`
 * would build). Returns the correspondence id + the persisted finding ids in spec order.
 */
export async function deliverReviewViaHook(
  exec: SqlExecutor,
  hook: SqlObligationHook,
  args: {
    projectId: string;
    draftId: string;
    runId: string;
    ordinal?: number;
    sidecarCounts?: { carried: number; closed: number; new: number } | null;
    coversAllObligations?: boolean;
    findings: readonly DeliveredFindingSpec[];
    at?: Date;
  },
): Promise<{ correspondenceId: string; findingIds: string[] }> {
  const correspondenceId = await seedCorrespondence(exec, {
    projectId: args.projectId,
    draftId: args.draftId,
    runId: args.runId,
    kind: "review",
    ...(args.ordinal !== undefined ? { ordinal: args.ordinal } : {}),
    ...(args.at ? { at: args.at } : {}),
  });
  const findingIds: string[] = [];
  const ctxFindings = [];
  for (const f of args.findings) {
    const findingId = await seedFinding(exec, {
      correspondenceId,
      draftId: args.draftId,
      ordinal: f.ordinal,
      ...(f.kind ? { kind: f.kind } : {}),
      severity: f.severity,
      ...(f.origin ? { origin: f.origin } : {}),
      ...(f.reconciliation !== undefined ? { reconciliation: f.reconciliation } : {}),
      ...(f.title ? { title: f.title } : {}),
      ...(f.quote ? { quote: f.quote } : {}),
      ...(f.url ? { url: f.url } : {}),
    });
    findingIds.push(findingId);
    ctxFindings.push({
      findingId,
      ordinal: f.ordinal,
      severity: f.severity,
      kind: f.kind ?? "claim",
      title: f.title ?? `Finding ${f.ordinal}`,
      origin: f.origin ?? "editor",
      reconciliation: f.reconciliation ?? null,
      anchor: f.quote ? { quote: f.quote } : null,
      normalizedUrl: f.url ? normalizeUrl(f.url) : null, // mirror delivery.ts (normalizes the evidence url)
      carriesObligationId: f.carriesObligationId ?? null,
    });
  }
  await hook.onDelivery({
    exec,
    runId: args.runId,
    projectId: args.projectId,
    draftId: args.draftId,
    correspondenceId,
    correspondenceKind: "review",
    findings: ctxFindings,
    claims: [],
    sidecarCounts: args.sidecarCounts ?? null,
    coversAllObligations: args.coversAllObligations ?? true,
  });
  return { correspondenceId, findingIds };
}
