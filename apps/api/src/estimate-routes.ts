// The stateless, cached estimate endpoint (REQ-SPEC-16; §5.6 item 1; §12.4 step 1). `POST
// /projects/:id/estimates {workflow, rigor, model_profile, inputs}` → `{estimate, cap, levers, claimCount?}`.
// It creates NO `runs` row (the sheet's Run click is the only run creator — REQ-CHAT-25) and emits
// `run.estimated`. Two figures from the same estimator: an IMMEDIATE provisional figure from the word
// count (returned without ever blocking the Run button), and a REFINED figure from a Haiku-class claim
// pre-pass cached per (draft sha, workflow, rigor, tier) — its ~5-credit COGS absorbed, paid once per draft
// version (§5.6 item 1). DEF.2 (F6) binds the live seams: `SqlEstimateCacheStore` over `estimate_cache`
// and `createProxyClaimPrePass`, which rides the egress proxy on a purpose-minted credential.

import { Hono } from "hono";
import {
  buildEstimate,
  buildLeverMatrix,
  type LeverMatrix,
} from "@rhema/run-sheet";
import type { EstimatorInputs } from "@rhema/protocols";
import type { ModelTier, Rigor, WorkflowKey } from "@rhema/contracts";
import type { Principal } from "./run-routes.js";
import type { SqlClient } from "./invite.js";
import { showcaseReadOnlyGuard } from "./showcase.js";

/** The Haiku-class claim pre-pass (§5.6 item 1). Returns the refined claim count for a draft version.
 *  `workspaceId`/`billingAccountId` come from the session principal — the live binding attributes its
 *  proxy-metered COGS usage row with them (the synthetic run context needs real tenant FKs). */
export interface ClaimPrePass {
  count(args: {
    projectId: string;
    workspaceId: string;
    billingAccountId: string;
    draftSha?: string;
    workflow: WorkflowKey;
    inputs: EstimatorInputs;
  }): Promise<number | null>; // null ⇒ no refinement (the route keeps the provisional figure)
}

/** One cached estimate row (per the `(draft sha, workflow, rigor, tier)` `cache_key`). */
export interface CachedEstimate {
  readonly estimateCredits: number;
  readonly capCredits: number;
  readonly rateTableVersion: number;
  readonly claimCount: number | null;
  readonly provisional: boolean;
}

/** The `estimate_cache` store seam (0017). Live binds to Postgres; tests bind an in-memory/PGlite store. */
export interface EstimateCacheStore {
  get(cacheKey: string): Promise<CachedEstimate | null>;
  put(cacheKey: string, row: CachedEstimate): Promise<void>;
}

/** The analytics `run.estimated` event (§3.5; REQ-SPEC-16) — no `runs` row, just telemetry. */
export interface RunEstimatedEvent {
  readonly kind: WorkflowKey;
  readonly rigor: Rigor;
  readonly estimate: number;
  readonly cap: number;
  readonly levers_shown: boolean;
}

export interface EstimateApiDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** the pre-pass result cache (0017). Unset ⇒ every call is provisional (no refinement persisted). */
  readonly estimateCache?: EstimateCacheStore;
  /** the Haiku-class claim pre-pass. Unset ⇒ refinement is a deferred live leg (stays provisional). */
  readonly claimPrePass?: ClaimPrePass;
  /** emit `run.estimated` (REQ-SPEC-16). Unset ⇒ no telemetry. */
  emitEstimated?(ctx: { projectId: string; principal: Principal }, event: RunEstimatedEvent): void;
  /** the pre-pass budget in ms (§5.6 item 1: ≤5 s). Default 5000. */
  readonly prePassBudgetMs?: number;
  clock?: { now(): Date };
  /** P1.17 — the scoped read the Showcase read-only guard uses. Unset ⇒ the guard is inert. */
  readonly db?: SqlClient;
}

interface EstimateBody {
  workflow: string;
  rigor: Rigor;
  modelTier: ModelTier;
  modelProfile?: unknown;
  inputs?: EstimatorInputs;
  variant?: string;
  draftSha?: string;
  entitlement?: boolean;
  breakerMultiplier?: 1 | 2;
  /** the client's follow-up refine request (within ≤5 s of open); default false (the immediate figure). */
  refine?: boolean;
  /**
   * P1.06 (§7.2) — the canonical serialized scope (`"section:III"`). Scoped estimates cache under their
   * own key (the scope is part of the price), and the web passes scoped estimator inputs (the section's
   * words, `findings:1`, …) in `inputs`.
   */
  scope?: string;
}

/** The `(draft sha, workflow, rigor, tier[, variant][, scope])` cache key (§12.4 step 1; P1.06 — scope
 *  is part of the key: a section-scoped estimate must never reuse the whole-draft refined figure). */
export function estimateCacheKey(b: {
  draftSha?: string;
  workflow: string;
  rigor: Rigor;
  modelTier: ModelTier;
  variant?: string;
  scope?: string;
}): string {
  return [b.draftSha ?? "nosha", b.workflow, b.rigor, b.modelTier, b.variant ?? "", b.scope ?? ""].join("|");
}

/** Race a promise against a budget; resolves `null` if the budget elapses first (never rejects on timeout). */
async function withBudget<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p.then((v) => v), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export function createEstimateRoutes(deps: EstimateApiDeps): Hono {
  const app = new Hono();
  // P1.17 (§15.4) — the Showcase dossier is read-only: bespoke estimates on it 409.
  if (deps.db) app.use("/projects/:id/*", showcaseReadOnlyGuard(deps.db));

  app.post("/projects/:id/estimates", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const body = (await c.req.json()) as EstimateBody;
    if (!body.workflow || !body.rigor || !body.modelTier) {
      return c.json({ error: "workflow, rigor and modelTier required" }, 400);
    }
    // DEF.2 (F6 hardening) — the project must belong to the caller's workspace: the estimate cache is
    // GLOBAL (tenantless, keyed on the content sha), so without this check an authenticated caller
    // could probe another workspace's refined estimates by project id. Unset `db` ⇒ the check defers
    // to the caller's own guard (tests); the live api always binds it.
    if (deps.db) {
      const owned = (
        await deps.db.query("select id from projects where id = $1 and workspace_id = $2", [
          projectId,
          principal.workspaceId,
        ])
      ).rows[0];
      if (!owned) return c.json({ error: "not_found" }, 404);
    }
    const workflow = body.workflow as WorkflowKey;
    const inputs = body.inputs ?? {};
    const common = {
      workflow,
      rigor: body.rigor,
      modelTier: body.modelTier,
      inputs,
      ...(body.variant ? { variant: body.variant } : {}),
      ...(body.breakerMultiplier ? { breakerMultiplier: body.breakerMultiplier } : {}),
    } as const;

    const cacheKey = estimateCacheKey(body);

    // A cached REFINED row short-circuits both intents (the pre-pass COGS is paid once per draft version).
    const cached = deps.estimateCache ? await deps.estimateCache.get(cacheKey) : null;
    if (cached && !cached.provisional) {
      return respond(c, deps, { projectId, principal }, workflow, body.rigor, {
        estimateCredits: cached.estimateCredits,
        capCredits: cached.capCredits,
        rateTableVersion: cached.rateTableVersion,
        provisional: false,
        ...(cached.claimCount != null ? { claimCount: cached.claimCount } : {}),
        levers: buildLeverMatrix({ ...common, claimCount: cached.claimCount ?? undefined }),
      });
    }

    // The IMMEDIATE provisional figure — never blocks the Run button (§5.6 item 1).
    const provisional = buildEstimate(common);

    // A refine request runs the pre-pass under the ≤5 s budget and caches the refined figure (§5.6 item 1).
    if (body.refine && deps.claimPrePass) {
      const count = await withBudget(
        deps.claimPrePass.count({
          projectId,
          workspaceId: principal.workspaceId,
          billingAccountId: principal.billingAccountId,
          draftSha: body.draftSha,
          workflow,
          inputs,
        }),
        deps.prePassBudgetMs ?? 5000,
      );
      if (count != null) {
        const refined = buildEstimate({ ...common, claimCount: count });
        if (deps.estimateCache) {
          await deps.estimateCache.put(cacheKey, {
            estimateCredits: refined.estimateCredits,
            capCredits: refined.capCredits,
            rateTableVersion: refined.rateTableVersion,
            claimCount: refined.claimCount ?? count,
            provisional: false,
          });
        }
        return respond(c, deps, { projectId, principal }, workflow, body.rigor, {
          estimateCredits: refined.estimateCredits,
          capCredits: refined.capCredits,
          rateTableVersion: refined.rateTableVersion,
          provisional: false,
          ...(refined.claimCount != null ? { claimCount: refined.claimCount } : {}),
          levers: buildLeverMatrix({ ...common, claimCount: count }),
        });
      }
      // budget elapsed → fall through to the provisional figure (the Run button was never blocked).
    }

    return respond(c, deps, { projectId, principal }, workflow, body.rigor, {
      estimateCredits: provisional.estimateCredits,
      capCredits: provisional.capCredits,
      rateTableVersion: provisional.rateTableVersion,
      provisional: provisional.provisional,
      ...(provisional.claimCount != null ? { claimCount: provisional.claimCount } : {}),
      levers: buildLeverMatrix(common),
    });
  });

  return app;
}

interface EstimateResponse {
  estimateCredits: number;
  capCredits: number;
  rateTableVersion: number;
  provisional: boolean;
  claimCount?: number;
  levers: LeverMatrix;
}

/** Emit `run.estimated` (REQ-SPEC-16) and return the estimate response. NO `runs` row is ever created. */
function respond(
  c: { json: (b: unknown, s?: number) => Response },
  deps: EstimateApiDeps,
  ctx: { projectId: string; principal: Principal },
  workflow: WorkflowKey,
  rigor: Rigor,
  res: EstimateResponse,
): Response {
  deps.emitEstimated?.(ctx, {
    kind: workflow,
    rigor,
    estimate: res.estimateCredits,
    cap: res.capCredits,
    levers_shown: true,
  });
  return c.json(res);
}
