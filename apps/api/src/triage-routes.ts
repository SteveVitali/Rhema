// Triage, dispositions, and the beta decision surfaces (PRB.05; §5.7, §6.4; REQ-IDE-15/27/28, REQ-BETA-6,
// REQ-SPEC-9/18, REQ-OBJ-3/5/7/8). Thin Hono adapters: the five-verb write goes through findings-core's
// validator and the obligations package's router — the ONLY paths that write a disposition or transition an
// obligation (P0.11's "Revise triage rows and Findings-UI verbs both route through here"). Gate cards read
// open gates; decisions read/answer `decision_requests`. All deterministic with PGlite + injected deps.

import { Hono } from "hono";
import {
  REASON_CODES,
  approvalOverridesSchema,
  responseLedgerSidecarSchema,
  type Actor,
  type DispositionKind,
  type GateKind,
  type ReasonCode,
  type ResponseLedgerEntry,
  type Severity,
} from "@rhema/contracts";
import {
  applyGateEdits,
  buildDecisionsList,
  buildPretriageLedger,
  dispositionToLedgerEntry,
  mergeTriageProposals,
  triageTier,
  validateDisposition,
  DISPOSITION_VERBS,
  SEVERITY_ORDER,
  type DispositionState,
  type GateStructuredEdits,
} from "@rhema/findings-core";
import {
  findingObligationState,
  mootObligation,
  ObligationTransitionError,
  routeDisposition,
  spawnAndRouteMinor,
  type DeferHorizon,
  type ObligationDeps,
} from "@rhema/obligations";
import {
  holdGate,
  recordGateActivity,
  resolveGate,
  type GateActivity,
  type GateEdit,
} from "@rhema/orchestrator";
import type { RunApiDeps } from "./run-routes.js";
import {
  attachStructuredBody,
  gateDtoBase,
  loadArtifactSidecar,
  OPEN_GATE_SELECT,
  type GateDtoDeps,
  type OpenGateRow,
} from "./gate-dto.js";
import { showcaseReadOnlyGuard } from "./showcase.js";

/** The disposition write + decision-surface deps: the orchestrator deps (txRunner/ids/clock) + the shell's
 *  raw SqlClient for reads + a content store for approve_triage's ledger read/write-back. */
export type TriageApiDeps = RunApiDeps & {
  /** the raw SQL client for project-scoped reads (the shell's `db`). */
  db: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };
  /** emits `finding.disposed` analytics (REQ-BETA-6) — optional; the live deploy binds the telemetry sink
   *  (`recordAnalyticsEvent`, PRB.08). Carries the envelope ids the analytics writer needs. */
  emitDisposed?: (e: {
    userId: string;
    workspaceId: string;
    projectId: string;
    findingId: string;
    disposition: DispositionKind;
    reason_code?: ReasonCode;
    actor: "user";
  }) => void;
};

/** A frozen (delivered) disposition cannot be changed (§5.7). Exported — the P1.07 Apply/bulk writes map it to 409. */
export class DispositionFrozenError extends Error {
  constructor() {
    super("disposition is frozen (delivered): cards lock at delivery (§5.7)");
    this.name = "DispositionFrozenError";
  }
}

interface RecordDispositionBody {
  kind: DispositionKind;
  rationale?: string;
  adaptedText?: string;
  reasonCode?: string;
  applied?: boolean;
  deferHorizon?: "next_review" | "pre_export";
  deferRounds?: number;
}

interface GateDecisionBody {
  action: "approve" | "approve_autonomous" | "keep_planning" | "edit" | "wait" | "stop" | "hold";
  guidance?: string;
  standingRule?: boolean;
  /** P1.09 (§6.4 item 4; REQ-SPEC-9) — the card's structured edits (`ed.*` deltas the web encodes;
   *  applied to the SERVER-side sidecar — the client never supplies the base document). */
  edits?: GateStructuredEdits;
  /** P1.09 (§6.4) — the per-run deadline override the card's "this run only" fields carry. */
  overrides?: unknown;
}

/** The actions a gate card may POST (§6.4 item 1 + hold). Anything else is a 422 — never resolved. */
const GATE_DECIDE_ACTIONS: readonly string[] = [
  "approve",
  "approve_autonomous",
  "keep_planning",
  "edit",
  "wait",
  "stop",
  "hold",
];

/** The finding row the disposition write + P1.07 Apply/bulk paths share (exported for finding-routes). */
export interface FindingRow {
  id: string;
  correspondence_id: string;
  draft_id: string;
  ordinal: number;
  kind: string;
  severity: string;
  title: string;
  project_id: string;
  workspace_id: string;
}

/** P1.09 — the open-gate row shape is shared with the Timeline (`gate-dto.ts`). */
type GateRow = OpenGateRow;

function deferHorizonOf(body: RecordDispositionBody): DeferHorizon | undefined {
  if (body.kind !== "defer") return undefined;
  if (body.deferRounds != null) return { rounds: body.deferRounds };
  if (body.deferHorizon != null) return { until: body.deferHorizon };
  return undefined; // the router defaults to next_review (§11.7)
}

function dispositionStateFromRow(r: {
  kind: string;
  rationale: string | null;
  adapted_text: string | null;
  reason_code: string | null;
  applied: boolean | null;
  by_actor: unknown;
  created_at: string;
  frozen_at: string | null;
}): DispositionState {
  const by = (typeof r.by_actor === "string" ? JSON.parse(r.by_actor) : r.by_actor) as Actor;
  return {
    kind: r.kind as DispositionKind,
    ...(r.rationale != null ? { rationale: r.rationale } : {}),
    ...(r.adapted_text != null ? { adaptedText: r.adapted_text } : {}),
    ...(r.reason_code != null ? { reasonCode: r.reason_code as ReasonCode } : {}),
    ...(r.applied != null ? { applied: r.applied } : {}),
    by,
    at: r.created_at,
    frozen: r.frozen_at != null,
  };
}

export interface DispositionWriteResult {
  readonly id: string;
  readonly findingId: string;
  readonly kind: DispositionKind;
  readonly status: "proposed";
  readonly rationale?: string;
  readonly adaptedText?: string;
  readonly reasonCode?: ReasonCode;
  readonly applied?: boolean;
}

/**
 * The shared disposition write (§5.7): replace-or-insert the finding's live row (reversible until freeze —
 * a frozen row throws `DispositionFrozenError`) then route the obligation (REQ-OBJ-3/5: accept/adapt hold
 * `proposed`, rebut rebutted, defer parked with its horizon, escalate → a Decisions row; a minor's
 * accept/adapt spawns its obligation on the spot — REQ-OBJ-2). The verb POST, P1.07's Apply, and the bulk
 * dispatch all funnel through here so no second write path drifts.
 */
export async function recordDispositionInTx(
  tx: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  deps: { ids(prefix: string): string; clock: { now(): Date } },
  oblDeps: ObligationDeps,
  args: {
    projectId: string;
    finding: FindingRow;
    normalized: { kind: DispositionKind; rationale?: string; adaptedText?: string; reasonCode?: ReasonCode; applied?: boolean };
    byActor: Actor;
    deferHorizon?: DeferHorizon;
    decisionText?: string;
  },
): Promise<DispositionWriteResult> {
  const { finding, normalized: n, byActor } = args;
  const existing = (
    await tx.query(
      `select id, frozen_at from dispositions where finding_id = $1 and response_id is null`,
      [finding.id],
    )
  ).rows[0] as { id: string; frozen_at: string | null } | undefined;
  if (existing?.frozen_at != null) throw new DispositionFrozenError();

  const byActorJson = JSON.stringify(byActor);
  let dispositionId: string;
  if (existing) {
    dispositionId = existing.id;
    // reversible until freeze: the row is REPLACED in place (§5.7).
    await tx.query(
      `update dispositions
          set kind = $2, status = 'proposed', rationale = $3, adapted_text = $4,
              reason_code = $5, applied = $6, by_actor = $7::jsonb
        where id = $1`,
      [
        dispositionId,
        n.kind,
        n.rationale ?? null,
        n.adaptedText ?? null,
        n.reasonCode ?? null,
        n.applied ?? null,
        byActorJson,
      ],
    );
  } else {
    dispositionId = deps.ids("dsp");
    await tx.query(
      `insert into dispositions
         (id, finding_id, kind, status, rationale, adapted_text, reason_code, applied, by_actor, created_at)
       values ($1,$2,$3,'proposed',$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        dispositionId,
        finding.id,
        n.kind,
        n.rationale ?? null,
        n.adaptedText ?? null,
        n.reasonCode ?? null,
        n.applied ?? null,
        byActorJson,
        deps.clock.now(),
      ],
    );
  }

  // Route the obligation (REQ-OBJ-3/5). accept/adapt stay 'proposed' until the move lands (a no-op
  // transition — the debt stays open); rebut rebutted it; defer parks it with a horizon; escalate
  // links (or creates) a Decisions-inbox request.
  const obl = await findingObligationState(tx, finding.id);
  if (obl) {
    await routeDisposition(tx, oblDeps, {
      obligationId: obl.obligationId,
      kind: n.kind,
      status: "proposed",
      dispositionId,
      findingId: finding.id,
      ...(n.rationale != null ? { rationale: n.rationale } : {}),
      draftId: finding.draft_id,
      byActor,
      ...(args.deferHorizon ? { deferHorizon: args.deferHorizon } : {}),
      decisionText: args.decisionText ?? `Escalated finding: ${finding.title}`,
    });
  } else if (finding.severity === "minor" && (n.kind === "accept" || n.kind === "adapt")) {
    // REQ-OBJ-2: a minor finding spawns its obligation only on accept/adapt.
    await spawnAndRouteMinor(tx, oblDeps, {
      projectId: args.projectId,
      findingId: finding.id,
      kind: finding.kind,
      title: finding.title,
      correspondenceId: finding.correspondence_id,
      draftId: finding.draft_id,
      disposition: { kind: n.kind, status: "proposed", id: dispositionId },
      byActor,
    });
  } else if (n.kind === "escalate") {
    // an escalation with no obligation still lands in the Decisions inbox (project-scoped row).
    await tx.query(
      `insert into decision_requests(id, project_id, obligation_id, text, options, state)
       values ($1,$2,null,$3,$4,'open')`,
      [deps.ids("dcr"), args.projectId, `Escalated finding: ${finding.title}`, ["decide", "dismiss"]],
    );
  }

  return {
    id: dispositionId,
    findingId: finding.id,
    kind: n.kind,
    status: "proposed",
    ...(n.rationale != null ? { rationale: n.rationale } : {}),
    ...(n.adaptedText != null ? { adaptedText: n.adaptedText } : {}),
    ...(n.reasonCode != null ? { reasonCode: n.reasonCode } : {}),
    ...(n.applied != null ? { applied: n.applied } : {}),
  };
}

export function createTriageRoutes(deps: TriageApiDeps): Hono {
  const app = new Hono();
  const oblDeps: ObligationDeps = { ids: deps.ids, clock: deps.clock };

  // P1.17 (§15.4) — dispositions/decisions/gates on the Showcase dossier get 409 showcase_read_only.
  app.use("/projects/:id/*", showcaseReadOnlyGuard(deps.db));

  // Tenant check (the codebase convention: an explicit workspace filter; RLS is the live-deploy backstop).
  // Every project-scoped route below verifies the project belongs to the principal's workspace — a
  // cross-workspace id reads/writes as not_found, never a leak.
  const ownProject = async (c: { req: { param(n: string): string } }, workspaceId: string) => {
    const r = (
      await deps.db.query(`select workspace_id from projects where id = $1`, [c.req.param("id")])
    ).rows[0] as { workspace_id: string } | undefined;
    return r != null && r.workspace_id === workspaceId;
  };

  // ---- the five-verb disposition write (§5.7) — reversible until freeze; routes the obligation. ----
  app.post("/projects/:id/findings/:fid/disposition", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const findingId = c.req.param("fid");
    const body = (await c.req.json()) as RecordDispositionBody;
    if (!DISPOSITION_VERBS.includes(body.kind)) {
      return c.json({ error: "invalid_disposition", detail: `unknown verb '${body.kind}'` }, 422);
    }
    if (body.reasonCode != null && !(REASON_CODES as readonly string[]).includes(body.reasonCode)) {
      return c.json({ error: "invalid_reason_code", detail: `unknown reason_code '${body.reasonCode}'` }, 422);
    }
    const v = validateDisposition({
      kind: body.kind,
      ...(body.rationale != null ? { rationale: body.rationale } : {}),
      ...(body.adaptedText != null ? { adaptedText: body.adaptedText } : {}),
      ...(body.reasonCode != null ? { reasonCode: body.reasonCode as ReasonCode } : {}),
      ...(body.applied != null ? { applied: body.applied } : {}),
    });
    if (!v.ok) return c.json({ error: "invalid_disposition", detail: v.error }, 422);

    const finding = (
      await deps.db.query(
        `select f.id, f.correspondence_id, f.draft_id, f.ordinal, f.kind, f.severity, f.title,
                ci.project_id, p.workspace_id
           from findings f
           join correspondence_items ci on ci.id = f.correspondence_id
           join projects p on p.id = ci.project_id
          where f.id = $1 and ci.project_id = $2 and p.workspace_id = $3`,
        [findingId, projectId, principal.workspaceId],
      )
    ).rows[0] as FindingRow | undefined;
    if (!finding) return c.json({ error: "not_found" }, 404);

    const byActor: Actor = { kind: "user", userId: principal.userId };
    try {
      const dto = await deps.txRunner.run(finding.workspace_id, async (tx) =>
        recordDispositionInTx(tx, deps, oblDeps, {
          projectId,
          finding,
          normalized: v.normalized,
          byActor,
          ...(deferHorizonOf(body) ? { deferHorizon: deferHorizonOf(body)! } : {}),
        }),
      );
      deps.emitDisposed?.({
        userId: principal.userId,
        workspaceId: finding.workspace_id,
        projectId,
        findingId,
        disposition: v.normalized.kind,
        ...(body.reasonCode != null ? { reason_code: body.reasonCode as ReasonCode } : {}),
        actor: "user",
      });
      return c.json(dto, 200);
    } catch (e) {
      if (e instanceof DispositionFrozenError) return c.json({ error: "frozen" }, 409);
      // MAINT.3 (D-STB.5b-4) — a disposition whose obligation can no longer route (it closed under a
      // stale chip — `defer` on a `mooted` debt, `rebut` on `discharged`, …) is a client-visible
      // conflict, never an internal error: the closed-world refusal maps to 409 so the caller can
      // refresh the finding's true state. The disposition write rolls back with the tx.
      if (e instanceof ObligationTransitionError) {
        return c.json({ error: "obligation_not_routable", detail: e.reason }, 409);
      }
      throw e;
    }
  });

  // ---- the Decisions list (§5.7; REQ-OBJ-7/8) — open decision_requests, oldest first. ----
  app.get("/projects/:id/decisions", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const res = await deps.db.query(
      `select id, project_id, obligation_id, text, options, state
         from decision_requests where project_id = $1 order by id`,
      [c.req.param("id")],
    );
    // the shared projection (findings-core): open rows only, stable order.
    const decisions = buildDecisionsList(
      (res.rows as Array<{
        id: string;
        project_id: string | null;
        obligation_id: string | null;
        text: string;
        options: string[];
        state: string;
      }>).map((r) => ({
        id: r.id,
        projectId: r.project_id,
        obligationId: r.obligation_id,
        text: r.text,
        options: r.options,
        state: r.state,
        createdAt: null,
      })),
    );
    return c.json({ decisions });
  });

  // ---- answer a Decisions row (one of the row's own options, or "dismiss"). ----
  // P1.19 — REQ-OBJ-6: a request that carries an obligation resolves through the REAL transition —
  // "re-defer" re-parks it (the §11.7 defer edge, `next_review` horizon), "drop" moots it; "decide"
  // and "dismiss" close the request only (the user picks the obligation up by hand). The transitions
  // are P0.12's ops — never re-implemented here.
  app.post("/projects/:id/decisions/:dcr", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json()) as { answer?: string };
    if (!body.answer) return c.json({ error: "answer required" }, 400);
    const open = (
      await deps.db.query(
        `select options, obligation_id from decision_requests
          where id = $1 and project_id = $2 and state = 'open'`,
        [c.req.param("dcr"), c.req.param("id")],
      )
    ).rows[0] as { options: string[]; obligation_id: string | null } | undefined;
    if (!open) return c.json({ error: "not_found" }, 404);
    const dismissed = body.answer === "dismiss";
    if (!dismissed && !open.options.includes(body.answer)) {
      return c.json({ error: "invalid_answer", detail: `not one of the row's options` }, 422);
    }
    // the obligation leg — best-effort against a row that may already be closed/mooted by another
    // path (a live obligation transitions; a closed one just lets the request answer stand).
    if (open.obligation_id && (body.answer === "re-defer" || body.answer === "drop")) {
      const byActor: Actor = { kind: "user", userId: principal.userId };
      const ob = (
        await deps.db.query(`select state, opened_on_draft_id from revision_obligations where id = $1`, [open.obligation_id])
      ).rows[0] as { state: string; opened_on_draft_id: string | null } | undefined;
      const live = ob != null && (ob.state === "open" || ob.state === "reopened" || ob.state === "deferred");
      try {
        if (live && body.answer === "re-defer") {
          await routeDisposition(deps.db, oblDeps, {
            obligationId: open.obligation_id,
            kind: "defer",
            deferHorizon: { until: "next_review" },
            draftId: ob!.opened_on_draft_id ?? "",
            byActor,
          });
        } else if (live) {
          await mootObligation(deps.db, oblDeps, { obligationId: open.obligation_id, byActor });
        }
      } catch (e) {
        // MAINT.3 (D-STB.5b-4) — the `live` read races the obligation itself (another disposition or
        // a delivery fold may close it between the select and the transition). The leg is best-effort
        // by design: a closed-world refusal lets the request's answer stand.
        if (!(e instanceof ObligationTransitionError)) throw e;
      }
    }
    await deps.db.query(
      `update decision_requests set state = $3, answer = $4
        where id = $1 and project_id = $2 and state = 'open'`,
      [c.req.param("dcr"), c.req.param("id"), dismissed ? "dismissed" : "answered", dismissed ? null : body.answer],
    );
    return c.json({ ok: true });
  });

  // ---- the gate cards for a project's open gates (§6.4; the Needs-you surface feed). ----
  app.get("/projects/:id/gates", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const projectId = c.req.param("id");
    // RUN.1 (ADR-050) — the Needs-you feed carries ACTIONABLE gates only: a blocking gate, or an
    // informational gate whose run somehow still parks (a pre-RUN.1 row — resolvable here; it
    // self-heals on the click). An informational gate on a moving run rides the run's Timeline card
    // instead — it is observability, never a request for input.
    const res = await deps.db.query(
      `${OPEN_GATE_SELECT}
        where r.project_id = $1 and g.resolved_at is null
          and (g.blocking = true or r.state = 'waiting_gate')
        order by g.opened_at, g.id`,
      [projectId],
    );
    const gates = [];
    for (const g of res.rows as GateRow[]) {
      // P1.09 — the shared DTO (gate-dto.ts): identical fields on Needs-you AND the Timeline card.
      const dto = {
        ...gateDtoBase(g),
        remainingEstimateCredits:
          g.estimate_credits != null ? Math.max(0, g.estimate_credits - g.spent_credits) : null,
      };
      // P1.09 — the kind's structured parts (§6.4 item 4; REQ-SPEC-9) from the artifact's sidecar.
      await attachStructuredBody(deps.db, deps as GateDtoDeps, g, dto);
      if (g.kind === "approve_triage") {
        const triage = await loadTriageRows(deps, g, projectId);
        if (triage) (dto as { triage?: unknown }).triage = { rows: triage };
      }
      gates.push(dto);
    }
    return c.json({ gates });
  });

  // ---- a gate card's decision (§6.4 item 1). approve_triage merges the human's disposition rows into the
  // serialized response-ledger write-back (actor: user — REQ-SPEC-9; the Revise phase reads THAT file). ----
  app.post("/projects/:id/gates/:gid/decide", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");
    const gateId = c.req.param("gid");
    const body = (await c.req.json()) as GateDecisionBody;
    if (!body.action) return c.json({ error: "action required" }, 400);
    if (!GATE_DECIDE_ACTIONS.includes(body.action)) {
      return c.json({ error: "invalid_action", detail: `unknown gate action '${body.action}'` }, 422);
    }
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);

    // "Wait for me" — clear the deadline without resolving (§6.4 item 1). The gate must belong to a run
    // of THIS project first — the same scope check the resolve path applies.
    const gateCheck = (
      await deps.db.query(
        `select g.id from gates g join runs r on r.id = g.run_id
          where g.id = $1 and r.project_id = $2 and g.resolved_at is null`,
        [gateId, projectId],
      )
    ).rows[0] as { id: string } | undefined;
    if (!gateCheck) return c.json({ error: "not_found" }, 404);

    if (body.action === "wait" || body.action === "hold") {
      const res = await holdGate(deps, { gateId, workspaceId: principal.workspaceId });
      if (!res.held) return c.json({ error: "not_found" }, 404);
      return c.json({ ok: true, held: true });
    }

    const gate = (
      await deps.db.query(
        `select g.id, g.run_id, g.kind, g.artifact_version_id, g.resolved_at, r.project_id, r.inputs
           from gates g join runs r on r.id = g.run_id where g.id = $1`,
        [gateId],
      )
    ).rows[0] as
      | { id: string; run_id: string; kind: GateKind; artifact_version_id: string | null; resolved_at: string | null; project_id: string | null; inputs: Record<string, unknown> | null }
      | undefined;
    if (!gate || gate.project_id !== projectId) return c.json({ error: "not_found" }, 404);
    if (gate.resolved_at != null) return c.json({ error: "already_resolved" }, 409);

    // P1.09 (§6.4) — the card's per-run deadline override ("this run only") persists to
    // `runs.gate_overrides` BEFORE the resolve (schema-validated; an illegal override 422s).
    if (body.overrides != null) {
      const parsed = approvalOverridesSchema.safeParse(body.overrides);
      if (!parsed.success) {
        return c.json({ error: "invalid_overrides", detail: parsed.error.issues[0]?.message }, 422);
      }
      await deps.db.query(`update runs set gate_overrides = $2::jsonb where id = $1`, [
        gate.run_id,
        JSON.stringify(parsed.data),
      ]);
    }

    // For approve_triage approvals: merge the human's recorded dispositions (actor: user) over the
    // artifact's proposed rows and serialize the merged ledger as the write-back overlay (REQ-SPEC-9).
    let edits: GateEdit | undefined;
    if (
      gate.kind === "approve_triage" &&
      gate.artifact_version_id != null &&
      (body.action === "approve" || body.action === "approve_autonomous" || body.action === "edit")
    ) {
      const merged = await mergedTriageLedger(deps, gate, projectId, {
        correspondenceId: gate.inputs?.correspondenceId as string | undefined,
      });
      if (merged) {
        edits = {
          artifactVersionId: gate.artifact_version_id,
          rows: merged.sidecar,
          changes: merged.userCount,
        };
      }
    }

    // P1.09 (§6.4 item 4; REQ-SPEC-9) — the OTHER editable kinds' structured edits: apply the card's
    // `edits` deltas to the SERVER-side sidecar (the client never supplies the base document) and let
    // the resolver serialize the result into the write-back overlay. Value edits (scope fields, the
    // thesis pick, the apparatus budget) and the change summary compose into the decision's guidance.
    let guidance = body.guidance;
    if (
      body.edits != null &&
      gate.kind !== "approve_triage" &&
      (body.action === "approve" || body.action === "approve_autonomous" || body.action === "edit")
    ) {
      const doc =
        gate.artifact_version_id != null
          ? await loadArtifactSidecar(deps.db, deps as GateDtoDeps, principal.workspaceId, gate.artifact_version_id)
          : null;
      const applied = applyGateEdits(gate.kind, doc, body.edits);
      if (applied.rows !== undefined && gate.artifact_version_id != null) {
        edits = {
          artifactVersionId: gate.artifact_version_id,
          rows: applied.rows,
          changes: applied.changes,
        };
      }
      // the edit note + the applied-change summary ride the decision's guidance record (the standing
      // rule checkbox still scopes it project-wide).
      const lines = [...(body.edits.note ? [body.edits.note] : []), ...applied.summary];
      if (lines.length > 0) {
        guidance = guidance ? `${guidance} — ${lines.join("; ")}` : lines.join("; ");
      }
    }

    const res = await resolveGate(deps, {
      runId: gate.run_id,
      gateId,
      workspaceId: principal.workspaceId,
      userId: principal.userId,
      action: body.action as "approve" | "approve_autonomous" | "keep_planning" | "edit" | "stop",
      ...(guidance != null ? { guidance } : {}),
      ...(body.standingRule != null ? { standingRule: body.standingRule } : {}),
      ...(edits != null ? { edits } : {}),
    });
    if (!res.ok) {
      if (res.reason === "insufficient_balance") return c.json({ error: res.reason }, 402);
      if (res.reason === "account_suspended") return c.json({ error: res.reason }, 403); // REQ-SPEC-24.7
      return c.json({ error: res.reason }, 404);
    }
    if (!res.resolved) return c.json({ resolved: false, reason: res.reason }, 409);
    return c.json({
      resolved: true,
      state: res.state,
      overlayVersionIds: res.overlayVersionIds,
      guidanceId: res.guidanceId,
    });
  });

  // ---- presence/reading pings for the gate card's timer (§6.4 item 2; REQ-SPEC-18). Server-side
  // deadline state only: `present` arms a 10-min presence deadline on auto-proceed gates (never a wait
  // gate), `reading` pauses the countdown, `blur` reverts it. Project-scoped twin of the run route. ----
  app.post("/projects/:id/gates/:gid/activity", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const gateId = c.req.param("gid");
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    // the gate must belong to a run of this project (the card POSTs from the project surface).
    const gate = (
      await deps.db.query(
        `select g.id from gates g join runs r on r.id = g.run_id where g.id = $1 and r.project_id = $2`,
        [gateId, c.req.param("id")],
      )
    ).rows[0] as { id: string } | undefined;
    if (!gate) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { activity?: string };
    const activity = body.activity;
    if (activity !== "present" && activity !== "reading" && activity !== "blur") {
      return c.json({ error: "invalid_activity" }, 422);
    }
    const res = await recordGateActivity(deps, {
      gateId,
      workspaceId: principal.workspaceId,
      activity: activity as GateActivity,
    });
    return c.json(res);
  });

  // ---- the per-project approval-timing opt-in (§6.4 R3): approve_triage waits by default; an override
  // may ADD a ≥2 h deadline → proceed_as_proposed (the project's 24-h opt-in) or REMOVE one (REQ-SPEC-1).
  // Schema-validated before it persists — spend/refusal kinds can never take an override. ----
  app.get("/projects/:id/approval-overrides", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const row = (
      await deps.db.query(`select approval_overrides from projects where id = $1`, [c.req.param("id")])
    ).rows[0] as { approval_overrides: unknown } | undefined;
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ overrides: row.approval_overrides ?? {} });
  });

  app.put("/projects/:id/approval-overrides", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json()) as { overrides?: unknown };
    const parsed = approvalOverridesSchema.safeParse(body.overrides ?? {});
    if (!parsed.success) {
      return c.json({ error: "invalid_overrides", detail: parsed.error.issues[0]?.message }, 422);
    }
    const updated = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const r = await tx.query(
        `update projects set approval_overrides = $2::jsonb where id = $1 returning id`,
        [c.req.param("id"), JSON.stringify(parsed.data)],
      );
      return r.rows.length === 1;
    });
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true, overrides: parsed.data });
  });

  // ---- pre-triage facts for the Revise sheet ("you pre-triaged N of M") + the user ledger rows. ----
  app.get("/projects/:id/pretriage", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    if (!(await ownProject(c, principal.workspaceId))) return c.json({ error: "not_found" }, 404);
    const pre = await loadPretriage(deps.db, c.req.param("id"));
    return c.json(pre);
  });

  return app;
}

/** The latest delivered review correspondence for the project (the dossier being triaged). */
async function latestReviewCorrespondenceId(
  db: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  projectId: string,
): Promise<string | null> {
  const res = await db.query(
    `select id from correspondence_items where project_id = $1 and kind = 'review' order by delivered_at desc limit 1`,
    [projectId],
  );
  return (res.rows[0] as { id: string } | undefined)?.id ?? null;
}

/** The unfrozen user dispositions on a review correspondence's findings (response_id is null = pre-triage). */
async function loadUserDispositions(
  db: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  correspondenceId: string,
): Promise<{ findingId: string; findingOrdinal: number; disposition: DispositionState }[]> {
  const res = await db.query(
    `select f.id as finding_id, f.ordinal, d.kind, d.rationale, d.adapted_text, d.reason_code,
            d.applied, d.by_actor, d.created_at, d.frozen_at
       from findings f
       join dispositions d on d.finding_id = f.id and d.response_id is null
      where f.correspondence_id = $1 and d.frozen_at is null
      order by f.ordinal`,
    [correspondenceId],
  );
  return (
    res.rows as Array<{
      finding_id: string;
      ordinal: number;
      kind: string;
      rationale: string | null;
      adapted_text: string | null;
      reason_code: string | null;
      applied: boolean | null;
      by_actor: unknown;
      created_at: string;
      frozen_at: string | null;
    }>
  ).map((r) => ({
    findingId: r.finding_id,
    findingOrdinal: r.ordinal,
    disposition: dispositionStateFromRow(r),
  }));
}

/** Pre-triage facts + the user-authored ledger rows (actor: user) a Revise run seeds (REQ-IDE-28). */
export async function loadPretriage(
  exec: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  projectId: string,
): Promise<{ correspondenceId: string | null; triaged: number; total: number; entries: unknown[] }> {
  const correspondenceId = await latestReviewCorrespondenceId(exec, projectId);
  if (!correspondenceId) return { correspondenceId: null, triaged: 0, total: 0, entries: [] };
  const findings = (
    await exec.query(
      `select id, ordinal from findings where correspondence_id = $1`,
      [correspondenceId],
    )
  ).rows as Array<{ id: string; ordinal: number }>;
  const userRows = await loadUserDispositions(exec, correspondenceId);
  const ledger = buildPretriageLedger(
    userRows.map((r) => ({ findingOrdinal: r.findingOrdinal, disposition: r.disposition })),
  );
  return {
    correspondenceId,
    triaged: userRows.length,
    total: findings.length,
    entries: ledger.entries,
  };
}

/** Read the response-ledger sidecar under an approve_triage gate's artifact (its `.json` twin). */
async function loadLedgerEntries(
  deps: TriageApiDeps,
  workspaceId: string,
  artifactVersionId: string,
): Promise<ResponseLedgerEntry[] | null> {
  const store = deps.contentStoreFor ? await deps.contentStoreFor(workspaceId) : deps.store;
  if (!store) return null;
  const row = (
    await deps.db.query(
      `select a.mirror_path, a.project_id
         from artifact_versions av join artifacts a on a.id = av.artifact_id where av.id = $1`,
      [artifactVersionId],
    )
  ).rows[0] as { mirror_path: string; project_id: string } | undefined;
  if (!row) return null;
  const jsonPath = row.mirror_path.replace(/\.md$/, ".json");
  const head = (
    await deps.db.query(
      `select av.content_sha256 from artifacts a
         join artifact_versions av on av.id = a.head_version_id
        where a.project_id = $1 and a.mirror_path = $2`,
      [row.project_id, jsonPath],
    )
  ).rows[0] as { content_sha256: string } | undefined;
  if (!head) return null;
  const bytes = await store.get(head.content_sha256);
  if (!bytes) return null;
  try {
    const parsed = responseLedgerSidecarSchema.safeParse(JSON.parse(Buffer.from(bytes).toString("utf8")));
    return parsed.success ? parsed.data.entries : null;
  } catch {
    return null;
  }
}

/** The approve_triage card's ledger rows: findings joined with the merged ledger (user rows win). */
async function loadTriageRows(
  deps: TriageApiDeps,
  gate: GateRow,
  projectId: string,
): Promise<
  | { findingId: string; ordinal: number; title: string; severity: string; disposition?: { kind: string; rationale?: string; actor?: string } }[]
  | null
> {
  const correspondenceId =
    (gate.inputs?.correspondenceId as string | undefined) ??
    (await latestReviewCorrespondenceId(deps.db, projectId));
  if (!correspondenceId) return null;
  const findings = (
    await deps.db.query(
      `select id, ordinal, title, severity from findings where correspondence_id = $1 order by ordinal`,
      [correspondenceId],
    )
  ).rows as Array<{ id: string; ordinal: number; title: string; severity: string }>;

  // the artifact's agent-proposed rows + the human's current rows (user wins — REQ-WF-9).
  const agentEntries =
    gate.artifact_version_id != null
      ? ((await loadLedgerEntries(deps, gate.workspace_id, gate.artifact_version_id)) ?? [])
      : [];
  const userDisps = await loadUserDispositions(deps.db, correspondenceId);
  const userEntries = userDisps.map((r) =>
    dispositionToLedgerEntry(r.findingOrdinal, r.disposition),
  );
  const merged = mergeTriageProposals(agentEntries, userEntries);
  const mergedByOrdinal = new Map(merged.map((e) => [e.findingOrdinal, e]));

  return findings
    .map((f) => {
      const e = mergedByOrdinal.get(f.ordinal);
      return {
        findingId: f.id,
        ordinal: f.ordinal,
        title: f.title,
        severity: f.severity,
        ...(e
          ? {
              disposition: {
                kind: e.disposition.kind,
                ...(e.disposition.rationale != null ? { rationale: e.disposition.rationale } : {}),
                ...(e.disposition.actor != null ? { actor: e.disposition.actor } : {}),
              },
            }
          : {}),
      };
    })
    .sort((a, b) => {
      const t = triageTier(a.disposition ?? null) - triageTier(b.disposition ?? null);
      if (t !== 0) return t;
      const s =
        (SEVERITY_ORDER[a.severity as Severity] ?? 4) - (SEVERITY_ORDER[b.severity as Severity] ?? 4);
      return s !== 0 ? s : a.ordinal - b.ordinal;
    });
}

/** Merge the human's recorded dispositions over the artifact's proposed rows for the write-back overlay. */
async function mergedTriageLedger(
  deps: TriageApiDeps,
  gate: { artifact_version_id: string | null },
  projectId: string,
  hint?: { correspondenceId?: string },
): Promise<{ sidecar: ReturnType<typeof buildPretriageLedger>; userCount: number } | null> {
  if (gate.artifact_version_id == null) return null;
  const corr = (
    await deps.db.query(
      `select a.project_id, a.mirror_path, a.workspace_id
         from artifact_versions av join artifacts a on a.id = av.artifact_id where av.id = $1`,
      [gate.artifact_version_id],
    )
  ).rows[0] as { project_id: string; mirror_path: string; workspace_id: string } | undefined;
  if (!corr) return null;
  const agentEntries =
    (await loadLedgerEntries(deps, corr.workspace_id, gate.artifact_version_id)) ?? [];
  // the SAME correspondence the card read (run inputs first — consistent with loadTriageRows).
  const correspondenceId =
    hint?.correspondenceId ?? (await latestReviewCorrespondenceId(deps.db, projectId));
  if (!correspondenceId) return null;
  const userDisps = await loadUserDispositions(deps.db, correspondenceId);
  if (userDisps.length === 0) return null; // nothing the human wrote → a plain approve, no overlay.
  const userEntries = userDisps.map((r) => dispositionToLedgerEntry(r.findingOrdinal, r.disposition));
  const merged = mergeTriageProposals(agentEntries, userEntries);
  return {
    sidecar: { sidecar: "response_ledger", version: 1, entries: merged },
    userCount: userEntries.length,
  };
}
