// P1.17 (§15.4) — the Showcase lifecycle on the api side: the provisioning seed (one deterministic
// fixture dossier per workspace at $0) and the read-only guards every write surface shares.
//
// Precedence (§15.3): if the user arrived carrying a dropped file, their project is the first screen
// and the Showcase becomes the second row; otherwise the Showcase opens first, on finding 1. The
// `GET /app` redirect in apps/web reads `GET /showcase` for that decision.

import { seedShowcaseProject, type ShowcaseSeedResult, type ShowcaseStore } from "@rhema/db";
import type { MiddlewareHandler } from "hono";
import type { SqlClient } from "./invite.js";

export const SHOWCASE_READ_ONLY = "showcase_read_only" as const;
export const SHOWCASE_NOT_DELETABLE = "showcase_not_deletable" as const;

/** Is this project the workspace's Showcase? (one query, used by every write guard.) */
export async function isShowcaseProject(db: SqlClient, projectId: string): Promise<boolean> {
  const res = await db
    .query(`select showcase from projects where id = $1`, [projectId])
    .catch(() => ({ rows: [] as { showcase?: boolean }[] }));
  return (res.rows[0] as { showcase?: boolean } | undefined)?.showcase === true;
}

/** §15.4 lifecycle verbs exempt from read-only — archive/unarchive/restore are the hide affordance,
 *  duplicate produces the user's own editable copy, and delete keeps its own `showcase_not_deletable`
 *  refusal (project-routes owns that 409's code). */
const LIFECYCLE_VERBS = new Set(["duplicate", "archive", "unarchive", "restore", "delete"]);

/**
 * P1.17 (§15.4) — Hono middleware: every mutating verb under `/projects/:id/*` on a Showcase project
 * gets a 409 with an inline explanation ("Duplicate it first") — the dossier is read-only. Mounted
 * per router (editor / outline / triage / findings / chat / revisions / versions / figures /
 * estimates / export / approvals / imports); because Hono folds sub-app middleware into the shared
 * router for the path pattern, the guard is path-aware: lifecycle verbs above pass through so the
 * allowed state changes keep working. GET/HEAD always pass — the worked example reads everywhere.
 */
export function showcaseReadOnlyGuard(db: SqlClient): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
    const projectId = c.req.param("id");
    const tail = c.req.path.split("/").filter(Boolean).pop() ?? "";
    if (LIFECYCLE_VERBS.has(tail)) return next();
    if (typeof projectId === "string" && (await isShowcaseProject(db, projectId))) {
      return c.json(
        {
          error: SHOWCASE_READ_ONLY,
          message:
            "This is the read-only worked example. Duplicate it into your own project before editing — the copy is yours to change.",
        },
        409,
      );
    }
    return next();
  };
}

export interface ShowcaseSeederDeps {
  readonly txRunner: { run<T>(workspaceId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> };
  readonly ids: () => string;
  readonly clock?: { now(): Date };
  /** the workspace content store — bound in the live deploy so letter/draft bytes render. */
  readonly store?: ShowcaseStore;
}

/**
 * The provisioning seam: returns a callback `(workspaceId, ownerId) => seed`. Runs inside the
 * tenant-scoped transaction so RLS is satisfied; idempotent — a second provision of the same
 * workspace returns the existing showcase's ids.
 */
export function createShowcaseSeeder(
  deps: ShowcaseSeederDeps,
): (workspaceId: string, ownerId: string) => Promise<ShowcaseSeedResult> {
  return (workspaceId, ownerId) =>
    deps.txRunner.run(workspaceId, (tx) =>
      seedShowcaseProject(tx as unknown as import("@rhema/db").MigrationDb, {
        workspaceId,
        ownerId,
        ids: deps.ids,
        ...(deps.clock ? { clock: deps.clock } : {}),
        ...(deps.store ? { store: deps.store } : {}),
      }),
    );
}
