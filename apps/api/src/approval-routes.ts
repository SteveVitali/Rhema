// P1.09 — the approval-policy settings surface (§6.4 item 3; REQ-SPEC-1, REQ-GATE-3/10). Session-authed,
// thin Hono adapters over existing mechanics:
//   GET /projects/:id/settings/approvals              — policy + overrides + R3 defaults + standing guidance
//   PUT /projects/:id/settings/approvals              — save policy and/or overrides (422 on an illegal one)
//   PUT /projects/:id/runs/:runId/gate-overrides      — the per-run override ("this run only") + autonomous flag
//   POST /projects/:id/guidance                       — add a standing-guidance rule (project scope)
//   POST /projects/:id/guidance/:gid/retire           — retire a standing rule (active=false, never delete)
//   GET /settings/explainers                          — the user's dismissed one-time explainers
//   POST /settings/explainers/:name/dismiss           — mark a one-time inline explainer seen
// Nothing here re-implements gate mechanics: policy/overrides feed `resolveGatePolicy` (orchestrator)
// at the next gate open; guidance writes ride `captureGuidance`/`retireGuidance`.

import { Hono } from "hono";
import { approvalOverridesSchema, GATE_DEFAULTS, GATE_KINDS } from "@rhema/contracts";
import { captureGuidance, retireGuidance, type ApprovalPolicy } from "@rhema/orchestrator";
import type { RunApiDeps } from "./run-routes.js";
import { showcaseReadOnlyGuard } from "./showcase.js";

export type ApprovalApiDeps = RunApiDeps & {
  /** the raw SQL client for project/user-scoped reads (the shell's `db`). */
  db: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };
};

const POLICIES: readonly ApprovalPolicy[] = ["named", "wait_each", "run_to_completion"];

interface ProjectPolicyRow {
  approval_policy: string;
  approval_overrides: unknown;
}

interface GuidanceRow {
  id: string;
  body: string;
  workflows: string[] | null;
  active: boolean;
  created_at: string | Date;
}

export function createApprovalRoutes(deps: ApprovalApiDeps): Hono {
  const app = new Hono();
  // P1.17 (§15.4) — the Showcase dossier is read-only: approval policies, overrides + guidance 409.
  app.use("/projects/:id/*", showcaseReadOnlyGuard(deps.db));

  const ownProject = async (projectId: string, workspaceId: string) => {
    const r = (
      await deps.db.query(`select workspace_id from projects where id = $1`, [projectId])
    ).rows[0] as { workspace_id: string } | undefined;
    return r != null && r.workspace_id === workspaceId;
  };

  const loadSettings = async (projectId: string) => {
    const project = (
      await deps.db.query(
        `select approval_policy, approval_overrides from projects where id = $1`,
        [projectId],
      )
    ).rows[0] as ProjectPolicyRow | undefined;
    if (!project) return null;
    const guidance = (
      await deps.db.query(
        `select id, body, workflows, active, created_at from guidance
          where project_id = $1 and standing = true order by created_at, id`,
        [projectId],
      )
    ).rows as GuidanceRow[];
    const overridesParsed = approvalOverridesSchema.safeParse(project.approval_overrides ?? {});
    const rows = guidance.map((g) => ({
      id: g.id,
      body: g.body,
      workflows: g.workflows ?? [],
      active: g.active,
      createdAt: new Date(g.created_at).toISOString(),
    }));
    return {
      policy: POLICIES.includes(project.approval_policy as ApprovalPolicy)
        ? (project.approval_policy as ApprovalPolicy)
        : "named",
      overrides: overridesParsed.success ? overridesParsed.data : {},
      /** the §6.4 R3 defaults the settings table annotates each row with (server truth). */
      defaults: GATE_KINDS.map((kind) => ({
        kind,
        deadlineMs: GATE_DEFAULTS[kind].deadlineMs,
        onExpiry: GATE_DEFAULTS[kind].onExpiry,
        // spend/refusal kinds never take an override (REQ-SPEC-1; the schema rejects it).
        overridable: GATE_DEFAULTS[kind].neverAutoProceed !== true,
      })),
      standing: rows.filter((g) => g.active),
      retired: rows.filter((g) => !g.active),
    };
  };

  // ---- the policy settings read (§6.4 item 3). ----
  app.get("/projects/:id/settings/approvals", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    if (!(await ownProject(projectId, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const settings = await loadSettings(projectId);
    if (!settings) return c.json({ error: "not_found" }, 404);
    return c.json(settings);
  });

  // ---- save the policy and/or overrides (REQ-SPEC-1: schema-validated, 422 on an illegal override). ----
  app.put("/projects/:id/settings/approvals", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    if (!(await ownProject(projectId, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { policy?: string; overrides?: unknown };
    if (body.policy != null && !POLICIES.includes(body.policy as ApprovalPolicy)) {
      return c.json({ error: "invalid_policy", detail: `unknown policy '${body.policy}'` }, 422);
    }
    let overrides: unknown;
    if (body.overrides != null) {
      const parsed = approvalOverridesSchema.safeParse(body.overrides);
      if (!parsed.success) {
        return c.json({ error: "invalid_overrides", detail: parsed.error.issues[0]?.message }, 422);
      }
      overrides = parsed.data;
    }
    const updated = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      if (body.policy != null) {
        await tx.query(`update projects set approval_policy = $2 where id = $1`, [projectId, body.policy]);
      }
      if (overrides !== undefined) {
        await tx.query(`update projects set approval_overrides = $2::jsonb where id = $1`, [
          projectId,
          JSON.stringify(overrides),
        ]);
      }
      return true;
    });
    if (!updated) return c.json({ error: "not_found" }, 404);
    const settings = await loadSettings(projectId);
    return c.json(settings);
  });

  // ---- the per-run override (§6.4 — "this run only"; runs.gate_overrides layers over the project's). ----
  app.put("/projects/:id/runs/:runId/gate-overrides", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const runId = c.req.param("runId");
    if (!(await ownProject(projectId, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      overrides?: unknown;
      gatesOff?: boolean;
    };
    if (body.overrides != null) {
      const parsed = approvalOverridesSchema.safeParse(body.overrides);
      if (!parsed.success) {
        return c.json({ error: "invalid_overrides", detail: parsed.error.issues[0]?.message }, 422);
      }
      const updated = await deps.db.query(
        `update runs set gate_overrides = $2::jsonb where id = $1 and project_id = $3 returning id`,
        [runId, JSON.stringify(parsed.data), projectId],
      );
      if (updated.rows.length === 0) return c.json({ error: "not_found" }, 404);
    }
    // "This run, autonomously" — the same flag "Approve and run autonomously" sets (REQ-GATE-3).
    if (body.gatesOff === true) {
      await deps.db.query(`update runs set gates_off = true where id = $1 and project_id = $2`, [
        runId,
        projectId,
      ]);
    }
    return c.json({ ok: true });
  });

  // ---- standing-guidance management (§6.5; REQ-GATE-10): add project-scope; retire never deletes. ----
  app.post("/projects/:id/guidance", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    if (!(await ownProject(projectId, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { body?: string; workflows?: string[] };
    const text = body.body?.trim();
    if (!text) return c.json({ error: "body required" }, 400);
    const { guidanceId } = await captureGuidance(deps, {
      workspaceId: principal.workspaceId,
      projectId,
      userId: principal.userId,
      source: "settings",
      text,
      scope: "project",
      ...(body.workflows != null ? { workflows: body.workflows } : {}),
    });
    return c.json({ ok: true, guidanceId }, 201);
  });

  app.post("/projects/:id/guidance/:gid/retire", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    if (!(await ownProject(projectId, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const res = await retireGuidance(deps, {
      workspaceId: principal.workspaceId,
      guidanceId: c.req.param("gid"),
    });
    if (!res.retired) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  // P1.20 (REQ-GATE-10's management half) — edit an ACTIVE standing rule's body/workflows in place;
  // a retired row is history and 409s. The row's id, created_at, and consumed_by lineage stay —
  // an edit never rewrites what a run already consumed.
  app.put("/projects/:id/guidance/:gid", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    if (!(await ownProject(projectId, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      body?: unknown;
      workflows?: unknown;
    };
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) return c.json({ error: "body required" }, 400);
    const workflows =
      body.workflows === null
        ? null
        : Array.isArray(body.workflows) && body.workflows.every((w) => typeof w === "string")
          ? (body.workflows as string[])
          : undefined;
    if (body.workflows !== undefined && workflows === undefined) {
      return c.json({ error: "workflows must be a string array" }, 422);
    }
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const upd = await tx.query(
        `update guidance set body = $3,
           workflows = case when $5::boolean then $4::text[] else workflows end
          where id = $1 and project_id = $2 and standing = true and active = true
          returning id`,
        // an explicit `workflows: null` widens the rule to all workflows; a missing key keeps it.
        [c.req.param("gid"), projectId, text, workflows ?? null, body.workflows !== undefined],
      );
      return upd.rows.length;
    });
    if (res === 0) return c.json({ error: "not_found_or_retired" }, 409);
    return c.json({ ok: true });
  });

  // ---- the one-time inline explainers (§5.11/§6.4; user-scoped — "user".dismissed_explainers, 0032). ----
  app.get("/settings/explainers", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const row = (
      await deps.db.query(`select dismissed_explainers from "user" where id = $1`, [principal.userId])
    ).rows[0] as { dismissed_explainers: string[] | null } | undefined;
    return c.json({ dismissed: row?.dismissed_explainers ?? [] });
  });

  app.post("/settings/explainers/:name/dismiss", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const name = c.req.param("name");
    if (!/^[a-z_][a-z0-9_]{0,63}$/.test(name)) return c.json({ error: "invalid_name" }, 422);
    await deps.db.query(
      `update "user" set dismissed_explainers =
         case when dismissed_explainers @> array[$2]::text[] then dismissed_explainers
              else dismissed_explainers || $2 end
       where id = $1`,
      [principal.userId, name],
    );
    return c.json({ ok: true });
  });

  return app;
}
