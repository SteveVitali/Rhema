// P1.06 — `GET /projects/:id/run-sheet-context` (§5.6; REQ-IDE-13): the ONE read the run sheet's GET
// consumes — head-draft facts (version, words, sha, derived sections), the project's scope defaults
// (protocol · venue · approvals), obligation + standing-note counts, the unused trial entitlement, the
// user's "don't ask under N" pref, the project's non-terminal runs, and `blockedBy` — the run this
// sheet's workflow+scope would collide with under the P1.06 per-write-lock ruling (replacing the
// per-project `activeRun` gate, which would wrongly block a sheet while an unrelated reader runs).

import { Hono } from "hono";
import { NON_TERMINAL_RUN_STATES, computeLockSet, firstConflict, seatForWorkflow } from "@rhema/orchestrator";
import type { ContentStore } from "@rhema/mirror";
import { runSheetObligations } from "@rhema/obligations";
import { deriveSections } from "@rhema/commands";
import type { WorkflowKey } from "@rhema/contracts";
import type { Principal } from "./run-routes.js";
import type { SqlClient } from "./invite.js";
import { versionText } from "./editor-routes.js";

export interface SheetContextDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  readonly db: SqlClient;
  /** content store for section derivation (the promoted head's markdown); unset ⇒ no sections. */
  contentStoreFor?(workspaceId: string): Promise<ContentStore>;
  readonly store?: ContentStore;
}

export interface SheetSection {
  /** the heading index as the scope ref ("III"), matching `@section:III`. */
  readonly ref: string;
  readonly title: string;
  readonly words: number;
}

export function createSheetContextRoutes(deps: SheetContextDeps): Hono {
  const app = new Hono();

  app.get("/projects/:id/run-sheet-context", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const workflow = c.req.query("workflow") as WorkflowKey | undefined;
    const scopeParam = c.req.query("scope") ?? "";

    const project = (
      await deps.db.query(
        `select id, title, protocol_id, venue, approval_policy, persona_id
           from projects where id = $1 and workspace_id = $2 and deleted_at is null`,
        [projectId, principal.workspaceId],
      )
    ).rows[0] as
      | { id: string; title: string; protocol_id: string | null; venue: string | null; approval_policy: string; persona_id: string | null }
      | undefined;
    if (!project) return c.json({ error: "not_found" }, 404);

    // the working head (or newest draft) — the sheet's target.
    const head = (
      await deps.db.query(
        `select d.id, d.n, d.state, d.promoted_version_id, av.word_count, av.content_sha256
           from drafts d left join artifact_versions av on av.id = d.promoted_version_id
          where d.project_id = $1
          order by case when d.state = 'working' then 0 else 1 end, d.n desc limit 1`,
        [projectId],
      )
    ).rows[0] as
      | { id: string; n: number; state: string; promoted_version_id: string | null; word_count: number | null; content_sha256: string | null }
      | undefined;

    // Sections derive from the promoted head's markdown when a store is bound (content-addressed read).
    let sections: SheetSection[] = [];
    if (head?.promoted_version_id) {
      const store = deps.contentStoreFor ? await deps.contentStoreFor(principal.workspaceId) : deps.store;
      const v = await versionText(store ?? null, deps.db, head.promoted_version_id).catch(() => null);
      if (v) sections = deriveSections(v.text);
    }

    const obligations = await runSheetObligations(deps.db, projectId).catch(() => null);
    const standing = (
      await deps.db.query(
        `select count(*)::int as n from guidance where project_id = $1 and standing = true and (active is null or active = true)`,
        [projectId],
      ).catch(() => ({ rows: [{ n: 0 }] }))
    ).rows[0] as { n: number };

    const entitlement = (
      await deps.db.query(
        `select id, kind, word_cap, rigor, model_tier from trial_entitlements
          where billing_account_id = $1 and state = 'unused' and (expires_at is null or expires_at > now())
          order by expires_at asc nulls last limit 1`,
        [principal.billingAccountId],
      )
    ).rows[0] as
      | { id: string; kind: string; word_cap: number; rigor: string; model_tier: string }
      | undefined;

    const user = (
      await deps.db.query(`select consent_dont_ask_under from "user" where id = $1`, [principal.userId]).catch(() => ({ rows: [] }))
    ).rows[0] as { consent_dont_ask_under: number } | undefined;

    const activeRuns = (
      await deps.db.query(
        `select id, workflow, state, scope, lock_set from runs
          where project_id = $1 and state = any($2::text[]) order by created_at desc`,
        [projectId, [...NON_TERMINAL_RUN_STATES]],
      )
    ).rows as { id: string; workflow: string; state: string; scope: unknown; lock_set: string[] }[];

    // `blockedBy`: the run THIS sheet's workflow+scope would collide with (the P1.06 lock ruling), or
    // null — the sheet renders in-progress ONLY for a real conflict (an unrelated reader must not gate it).
    let blockedBy: { runId: string; state: string } | null = null;
    if (workflow) {
      const candidate = computeLockSet({
        workflow,
        seat: seatForWorkflow(workflow),
        projectId,
        draftId: head?.id,
        corrKind: workflow === "review" || workflow === "fact_check" ? workflow : undefined,
        corrK: 1,
        scopeKey: scopeParam || undefined,
      });
      for (const r of activeRuns) {
        if (firstConflict(candidate, r.lock_set ?? [])) {
          blockedBy = { runId: r.id, state: r.state };
          break;
        }
      }
    }

    return c.json({
      project: {
        protocol: project.protocol_id,
        venue: project.venue,
        approvalPolicy: project.approval_policy,
      },
      headDraft: head
        ? {
            id: head.id,
            n: head.n,
            state: head.state,
            words: head.word_count ?? null,
            sha256: head.content_sha256 ?? null,
          }
        : null,
      sections,
      openObligations: obligations?.open.length ?? 0,
      reviewScopeLine: obligations?.reviewScopeLine ?? null,
      reviseScopeLine: obligations?.reviseScopeLine ?? null,
      standingNotes: standing.n,
      entitlement: entitlement
        ? { id: entitlement.id, kind: entitlement.kind, wordCap: entitlement.word_cap, rigor: entitlement.rigor, modelTier: entitlement.model_tier }
        : null,
      dontAskUnder: user?.consent_dont_ask_under ?? 0,
      activeRuns: activeRuns.map((r) => ({ id: r.id, workflow: r.workflow, state: r.state, scope: r.scope })),
      blockedBy,
    });
  });

  return app;
}
