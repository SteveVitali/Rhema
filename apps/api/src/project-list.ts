import { Hono } from "hono";
import { projectState } from "@rhema/orchestrator";
import type { ProjectState, ProjectStateInput } from "@rhema/orchestrator";
import type { Principal } from "./run-routes.js";
import type { SqlClient, InviteGate } from "./invite.js";

// The beta project list (PRB.01; REQ-PROD-9 / REQ-SPEC-3). Each row's pill + primary action is DERIVED from
// the §6.3 state function — the project table stores no `status` column. This module reads the project's
// row-sets (drafts, review/response correspondence, runs, the accepted version, archive flag), assembles the
// pure `ProjectStateInput`, and returns `projectState(input)` per project. Export/outline/chat inputs are
// empty in the beta (no export table, no outline editor, no Assistant) — those surfaces arrive later.

export interface ProjectListRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly state: ProjectState;
}

interface ProjectRowDb {
  id: string;
  slug: string;
  title: string;
  accepted_draft_id: string | null;
  archived_at: string | Date | null;
}
interface DraftRowDb {
  project_id: string;
  id: string;
  n: number;
  origin: string;
}

/** Assemble the §6.3 state inputs for one project from its already-fetched row-sets (pure, testable). */
export function assembleProjectStateInput(args: {
  drafts: readonly { n: number; origin: string }[];
  reviews: readonly { draftN: number }[];
  responses: readonly { reviewDraftN: number }[];
  runs: readonly { state: string }[];
  acceptedVersionN: number | null;
  archivedAt: string | Date | null;
}): ProjectStateInput {
  return {
    outlinePresent: false, // no outline editor in the beta
    versions: args.drafts.map((d) => ({ n: d.n, origin: d.origin })),
    reviews: args.reviews.map((r) => ({ draftN: r.draftN })), // letterOpenedAt is a client read-signal (unset here)
    responses: args.responses.map((r) => ({ reviewDraftN: r.reviewDraftN })),
    runs: args.runs.map((r) => ({ state: r.state })),
    acceptedVersionN: args.acceptedVersionN,
    exports: [], // no export table yet (PRB.11)
    archivedAt: args.archivedAt,
    // chat omitted — no Assistant/chat in the beta (defaults to zero turns)
  };
}

/**
 * List every project in the principal's workspace with its derived §6.3 state. Batched (no N+1): one query
 * per row-set over all the workspace's projects. Filters by `workspace_id` explicitly; the live deploy runs it
 * inside a `withTenant` transaction so RLS is the backstop.
 */
export async function listProjectStates(db: SqlClient, principal: Principal): Promise<ProjectListRow[]> {
  const projRes = await db.query(
    `select id, slug, title, accepted_draft_id, archived_at
       from projects where workspace_id = $1 order by created_at desc, id`,
    [principal.workspaceId],
  );
  const projects = projRes.rows as ProjectRowDb[];
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);

  const draftsRes = await db.query(
    `select project_id, id, n, origin from drafts where project_id = any($1::text[])`,
    [ids],
  );
  const drafts = draftsRes.rows as DraftRowDb[];
  const draftNById = new Map(drafts.map((d) => [d.id, d.n]));

  // reviews / responses: join to the reviewed draft's ordinal (`n`) — the state function keys on version N.
  const reviewsRes = await db.query(
    `select ci.project_id, d.n as draft_n
       from correspondence_items ci join drafts d on d.id = ci.draft_id
      where ci.project_id = any($1::text[]) and ci.kind = 'review'`,
    [ids],
  );
  const reviews = reviewsRes.rows as { project_id: string; draft_n: number }[];

  const responsesRes = await db.query(
    `select resp.project_id, rd.n as review_draft_n
       from correspondence_items resp
       join correspondence_items rev on rev.id = resp.prior_review_id
       join drafts rd on rd.id = rev.draft_id
      where resp.project_id = any($1::text[]) and resp.kind = 'response'`,
    [ids],
  );
  const responses = responsesRes.rows as { project_id: string; review_draft_n: number }[];

  const runsRes = await db.query(
    `select project_id, state from runs where project_id = any($1::text[])`,
    [ids],
  );
  const runs = runsRes.rows as { project_id: string; state: string }[];

  const byProject = <T extends { project_id: string }>(rows: readonly T[], id: string) =>
    rows.filter((r) => r.project_id === id);

  return projects.map((p) => {
    const acceptedVersionN =
      p.accepted_draft_id != null ? draftNById.get(p.accepted_draft_id) ?? null : null;
    const input = assembleProjectStateInput({
      drafts: byProject(drafts, p.id).map((d) => ({ n: d.n, origin: d.origin })),
      reviews: byProject(reviews, p.id).map((r) => ({ draftN: r.draft_n })),
      responses: byProject(responses, p.id).map((r) => ({ reviewDraftN: r.review_draft_n })),
      runs: byProject(runs, p.id).map((r) => ({ state: r.state })),
      acceptedVersionN,
      archivedAt: p.archived_at,
    });
    return { id: p.id, slug: p.slug, title: p.title, state: projectState(input) };
  });
}

export interface ShellApiDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  readonly db: SqlClient;
  /** The invite gate — mounts the public `POST /invite/check` used by the web signup gate (REQ-BETA-19). */
  readonly inviteGate?: InviteGate;
}

/** The beta shell's data routes: the project list (session-authed) + the public invite check. */
export function createShellRoutes(deps: ShellApiDeps): Hono {
  const app = new Hono();
  app.get("/projects", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const rows = await listProjectStates(deps.db, principal);
    return c.json({ projects: rows });
  });
  // Public: the web /login gate validates an invite BEFORE any auth request is made (no valid code ⇒ no
  // signup). This only reports validity for a code the caller supplies; it consumes nothing. NOTE: it is an
  // unauthenticated validity oracle — for the private, operator-issued, revocable beta codes that is an
  // accepted risk; a public launch adds rate-limiting / coarser reasons here (follow-up, tracked in the PRB.01
  // run ledger security note).
  if (deps.inviteGate) {
    const gate = deps.inviteGate;
    app.post("/invite/check", async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { code?: unknown; email?: unknown };
      const code = typeof body.code === "string" ? body.code : "";
      const email = typeof body.email === "string" ? body.email : undefined;
      return c.json(await gate.check(code, email));
    });
  }
  return app;
}
