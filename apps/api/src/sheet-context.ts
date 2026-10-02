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
import { PROTOCOL_CARDS, PROTOCOL_SEEDS } from "@rhema/protocols";
import {
  allowedModelTiers,
  parseUserPrefs,
  projectProtocolOverridesSchema,
  PRICING,
  trialAudienceAllows,
  type ModelTier,
  type PlanTier,
  type WorkflowKey,
} from "@rhema/contracts";
import { durationCells, effectivePlanTier, sizeBandFor } from "@rhema/ledger";
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
        `select id, title, protocol_id, protocol_version, venue, approval_policy, persona_id,
                rigor_default, model_tier_default, protocol_changed_at, protocol_overrides
           from projects where id = $1 and workspace_id = $2 and deleted_at is null`,
        [projectId, principal.workspaceId],
      )
    ).rows[0] as
      | {
          id: string;
          title: string;
          protocol_id: string | null;
          protocol_version: number | null;
          venue: string | null;
          approval_policy: string;
          persona_id: string | null;
          rigor_default: string | null;
          model_tier_default: string | null;
          protocol_changed_at: string | Date | null;
          protocol_overrides: unknown;
        }
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

    // ACT.1 — the sheet must see the entitlement in BOTH pre-claim states (PR-J1: signup provisions
    // it `locked`; the first Run click's unlock gate moves it `locked→unused`). A row counts only
    // when the account's trial machine is live (`trial_pending`|`trial_active`), the kill switch is
    // unset, the window is open, and the workspace sits inside the go-live audience (`is_test` is
    // operator-set; the everyone-flip is the operator's pause). `wordCap` emits the CONFIG cap —
    // runs read the cap from config at claim time, never a stale row value (ADR-042).
    const entitlement = (
      await deps.db.query(
        `select e.id, e.kind, e.rigor, e.model_tier, e.state, e.expires_at,
                b.trial_state, b.trial_killed_at, w.is_test
           from trial_entitlements e
           join billing_accounts b on b.id = e.billing_account_id
           join workspaces w on w.billing_account_id = b.id and w.id = $2
          where e.billing_account_id = $1
            and e.state in ('locked','unused')
            and (e.expires_at is null or e.expires_at > now())
          order by e.expires_at asc nulls last limit 1`,
        [principal.billingAccountId, principal.workspaceId],
      )
    ).rows[0] as
      | {
          id: string; kind: string; rigor: string; model_tier: string;
          state: string; expires_at: string | null;
          trial_state: string | null; trial_killed_at: string | null; is_test: boolean;
        }
      | undefined;
    const claimableEntitlement =
      entitlement &&
      entitlement.trial_killed_at == null &&
      (entitlement.trial_state === "trial_pending" || entitlement.trial_state === "trial_active") &&
      trialAudienceAllows(PRICING.trial.audience, entitlement.is_test === true)
        ? entitlement
        : undefined;

    const user = (
      await deps.db.query(`select consent_dont_ask_under, prefs from "user" where id = $1`, [principal.userId]).catch(() => ({ rows: [] }))
    ).rows[0] as { consent_dont_ask_under: number; prefs: unknown } | undefined;

    // P1.20 (§14.7) — the account/project default chain: a project's explicit rigor/tier wins over
    // the account defaults (project override → per-workflow pref → account default → 'standard');
    // a `model_tier_default` of NULL inherits the account's `defaultModelTier`.
    const userPrefs = parseUserPrefs(user?.prefs);
    const resolvedRigor =
      project.rigor_default ??
      (workflow ? userPrefs.rigorByWorkflow?.[workflow] : undefined) ??
      userPrefs.defaultRigor ??
      "standard";
    const resolvedModelTier = project.model_tier_default ?? userPrefs.defaultModelTier ?? null;

    // EST.1 — the plan rules the sheet's tier select renders against (the run POST re-enforces them
    // server-side; this read is display + defaulting). A failed read fails CLOSED to free/Base-only —
    // the cheaper honest posture (a locked option the user is entitled to reappears on refresh; a
    // fabricated Balanced tier never does).
    const planTier: PlanTier = await effectivePlanTier(deps.db, principal.billingAccountId).catch(
      () => "free" as const,
    );
    // EST.1 — the calibrated duration cells for this sheet's workflow + the head draft's size band
    // (`cost_card_cells` p10..p95 minutes, gate waits excluded — migration 0050). Null ⇒ the shared
    // per-phase prior governs (the sheet/Timeline/card then agree on the fallback too).
    const durations =
      workflow != null
        ? await durationCells(deps.db, workflow, sizeBandFor({ words: head?.word_count ?? undefined })).catch(
            () => null,
          )
        : null;

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
        // P1.21 (REQ-GENRE-3) — the pinned `protocol@version` for the sheet's protocol display; plus
        // the memo marker that gates the user_sources field + confidentiality line.
        protocolVersion: project.protocol_version,
        memoConfidentiality: project.protocol_id === "memo",
        venue: project.venue,
        approvalPolicy: project.approval_policy,
        // P1.20 (§14.7) — the resolved rigor/tier defaults the sheet opens on (a `?rigor=`/`?tier=`
        // query lever still overrides) + the §6.7 "protocol changed" marker for the scope card.
        rigor: resolvedRigor,
        modelTier: resolvedModelTier,
        protocolChanged: project.protocol_changed_at != null,
        // P1.22 W10 — the settings-page protocol overrides ride the context so the sheet can PREFILL
        // (toggle defaults between the rigor defaults and the query levers; stage/length fill unset
        // fields). Validated server-side; a malformed blob yields null, never a 500.
        protocolOverrides: (() => {
          const parsed = projectProtocolOverridesSchema.safeParse(project.protocol_overrides ?? null);
          return parsed.success ? parsed.data : null;
        })(),
        // P1.22 W10 — the SEEDED protocols' own `phase_defaults` keyed by id (e.g. Memo's
        // `discourse:false`), the layer BELOW the stored overrides at launch — the sheet prefills the
        // same layering for the SELECTED protocol (the selector can switch client-side, so all four
        // ship) — booleans + stage only; protocol bodies stay server-side (REQ-ARCH-33).
        protocolDefaults: Object.fromEntries(
          PROTOCOL_SEEDS.map((p) => [
            p.id,
            {
              phaseDefaults: {
                verification: p.phase_defaults.verification,
                discourse: p.phase_defaults.discourse,
                secondRead: p.phase_defaults.second_read,
                grounding: p.phase_defaults.grounding,
                audit: p.phase_defaults.audit,
              },
              stage:
                p.phase_defaults.stage === "near-final"
                  ? "near_final"
                  : p.phase_defaults.stage === "early"
                    ? "early"
                    : null, // `infer` ⇒ unset
            },
          ]),
        ),
      },
      // P1.21 — the four §6.7 protocol options the sheet's selector renders (the §5.3 cards' id+name
      // only — bodies stay server-side, REQ-ARCH-33).
      protocols: PROTOCOL_CARDS.map((card) => ({ id: card.id, name: card.name })),
      // EST.1 — the caller's effective plan + its permitted model tiers (the sheet's tier select locks
      // to this; the run POST's plan gate stays the enforcer). Plus the calibrated duration cells the
      // sheet/lever-matrix render (null ⇒ the shared prior).
      account: {
        planTier,
        allowedModelTiers: allowedModelTiers(planTier) as readonly ModelTier[],
      },
      durations,
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
      entitlement: claimableEntitlement
        ? {
            id: claimableEntitlement.id,
            kind: claimableEntitlement.kind,
            // the cap is a CONFIG fact, not the row's frozen-at-signup value (ADR-042).
            wordCap: PRICING.trial.entitlement.wordCap,
            rigor: claimableEntitlement.rigor,
            modelTier: claimableEntitlement.model_tier,
          }
        : null,
      dontAskUnder: user?.consent_dont_ask_under ?? 0,
      activeRuns: activeRuns.map((r) => ({ id: r.id, workflow: r.workflow, state: r.state, scope: r.scope })),
      blockedBy,
    });
  });

  return app;
}
