// P1.05 — the Timeline / run-report / steering routes (§5.5/§5.6; §6.5; §14.5). Session-authed, thin:
//   GET  /projects/:id/timeline        — the round log: drafts, per-run cards (orchestrator facts only,
//                                        REQ-IDE-11), rounds, the next-step card. Lazily enqueues the
//                                        walkthrough for delivered runs missing one (§5.5 D20).
//   GET  /runs/:id/report              — the Level-3 report; `?advanced=1` adds the Level-4 drill-down.
//   POST /runs/:id/pause               — "Pause after this phase" (the flag commitStep honors).
//   POST /runs/:id/resume              — resume a steering-parked run; body {note?} (Resume-with-note).
//   POST /runs/:id/notes               — queue a note for the next phase → Guidance{queued_message}.
//   POST /runs/:id/stop                — Stop, keep partials (the canonical cancelRun path).
//   POST /runs/:id/walkthrough/retry   — re-enqueue the one package-class walkthrough call after failure.
// No prompt, transcript, reasoning, private memory, or source-note body ever leaves these endpoints —
// the read models come from @rhema/findings-core's whitelisted row shapes.

import { Hono } from "hono";
import type { RunState, WorkflowKey } from "@rhema/contracts";
import {
  buildRunCardView,
  etaBandForPhases,
  groupRounds,
  collapsedRoundParts,
  nextStepVerb,
  queuePosition,
  buildRunReport,
  buildRunReportAdvanced,
  type TimelineDraft,
  type TimelineRun,
  type PhaseProgress,
  type PhaseStatus,
  type DeliverableChip,
  type WalkthroughState,
  type ReportStepRow,
  type ReportUsageRow,
} from "@rhema/findings-core";
import {
  cancelRun,
  requestPause,
  resumePausedRun,
  queueRunNote,
  maybeEnqueueWalkthrough,
  phaseShapeForWorkflow,
  projectState,
  RUN_JOBS,
  type OrchestratorDeps,
} from "@rhema/orchestrator";
import { buildEstimate } from "@rhema/run-sheet";
import type { Principal } from "./run-routes.js";
import type { ContentStore } from "@rhema/mirror";
import type { GateCardWire } from "@rhema/findings-core";
import {
  attachStructuredBody,
  gateDtoBase,
  loadRunDecisions,
  OPEN_GATE_SELECT,
  type OpenGateRow,
} from "./gate-dto.js";

export interface TimelineApiDeps extends OrchestratorDeps {
  principal(c: { req: { header(name: string): string | undefined } }): Principal | null;
  /** P1.09 — content store seams for the gate card's structured sidecar reads (same shape as
   *  RunApiDeps; unset ⇒ cards render without the editable slots). */
  readonly store?: ContentStore;
  contentStoreFor?(workspaceId: string): Promise<ContentStore>;
}

// ---- row shapes (server facts only) ----

interface RunRow {
  id: string;
  workflow: string;
  state: RunState;
  created_at: string | Date;
  started_at: string | Date | null;
  ended_at: string | Date | null;
  estimate_credits: number;
  cap_credits: number;
  spent_credits: number;
  failure: { code?: string } | null;
  walkthrough: { status?: string; text?: string; attempts?: number } | null;
  paused_at: string | Date | null;
  inputs: Record<string, unknown> | string;
}

interface StepRow {
  run_id: string;
  phase: string;
  ordinal: number;
  state: string;
  credits: number;
  started_at: string | Date | null;
  ended_at: string | Date | null;
}

const TERMINAL: Readonly<Set<string>> = new Set(["completed", "completed_partial", "failed", "cancelled"]);

function parseInputs(v: RunRow["inputs"]): Record<string, unknown> {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return v ?? {};
}

function walkthroughState(w: RunRow["walkthrough"], delivered: boolean): WalkthroughState | undefined {
  if (!delivered) return undefined;
  if (w?.status === "ready" && typeof w.text === "string") return { status: "ready", text: w.text };
  if (w?.status === "failed") return { status: "failed" };
  return { status: "pending" };
}

/** Map step rows onto the workflow's manifest phases (off/pending/done/running; counts + credits only). */
function phasesForRun(
  workflow: string,
  inputs: Record<string, unknown>,
  steps: readonly StepRow[],
  runState: RunState,
): PhaseProgress[] {
  const shape = phaseShapeForWorkflow(workflow as WorkflowKey, inputs);
  const byPhase = new Map<string, StepRow>();
  // the latest attempt per phase wins the row (a retried step's newest row carries the outcome)
  for (const s of steps) byPhase.set(s.phase, s);
  const runningStep = runState === "running" || runState === "cancelling" ? [...byPhase.values()].find((s) => s.state === "running") : undefined;
  const seen = new Set<string>();
  const out: PhaseProgress[] = shape.map((p, i) => {
    seen.add(p.key);
    const s = byPhase.get(p.key);
    let status: PhaseStatus = "pending";
    if (p.off) status = "off";
    else if (s?.state === "done") status = "done";
    else if (s?.state === "failed") status = "skipped";
    else if (s != null && s.state === "running") status = "running";
    else if (s != null && runningStep == null && runState === "running") status = "running";
    return {
      key: p.key,
      ordinal: s?.ordinal ?? i + 1,
      status,
      ...(s ? { credits: s.credits } : {}),
      ...(s?.started_at != null && s.ended_at != null
        ? { durationMs: new Date(s.ended_at).getTime() - new Date(s.started_at).getTime() }
        : {}),
    };
  });
  // a phase with a committed step but no manifest entry (renamed/removed) still lists at the end.
  for (const s of steps) {
    if (seen.has(s.phase)) continue;
    out.push({
      key: s.phase,
      ordinal: s.ordinal,
      status: s.state === "done" ? "done" : s.state === "failed" ? "skipped" : s.state === "running" ? "running" : "pending",
      credits: s.credits,
    });
  }
  return out.sort((a, b) => a.ordinal - b.ordinal);
}

export function createTimelineRoutes(deps: TimelineApiDeps): Hono {
  const app = new Hono();

  // ---- the round log (§5.5) ----
  app.get("/projects/:id/timeline", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const projectId = c.req.param("id");

    const view = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const project = (
        await tx.query(
          `select id, slug, title, archived_at, deleted_at, accepted_draft_id from projects
            where id = $1 and workspace_id = $2`,
          [projectId, principal.workspaceId],
        )
      ).rows[0] as
        | { id: string; slug: string; title: string; archived_at: string | Date | null; deleted_at: string | Date | null; accepted_draft_id: string | null }
        | undefined;
      if (!project || project.deleted_at != null) return { kind: "not_found" } as const;

      const drafts = (
        await tx.query(`select id, n, origin from drafts where project_id = $1 order by n`, [projectId])
      ).rows as { id: string; n: number; origin: string }[];
      const draftNById = new Map(drafts.map((d) => [d.id, d.n]));

      const runs = (
        await tx.query(
          `select id, workflow, state, created_at, started_at, ended_at, estimate_credits, cap_credits,
                  spent_credits, failure, walkthrough, paused_at, inputs
             from runs where project_id = $1 order by created_at desc, id`,
          [projectId],
        )
      ).rows as RunRow[];
      const runIds = runs.map((r) => r.id);

      const steps =
        runIds.length === 0
          ? []
          : ((
              await tx.query(
                `select run_id, phase, ordinal, state, credits, started_at, ended_at
                   from steps where run_id = any($1::text[]) order by run_id, ordinal, attempt`,
                [runIds],
              )
            ).rows as StepRow[]);
      const stepsByRun = new Map<string, StepRow[]>();
      for (const s of steps) {
        const l = stepsByRun.get(s.run_id) ?? [];
        l.push(s);
        stepsByRun.set(s.run_id, l);
      }

      // unresolved blocking gate per waiting run — the FULL card row set (P1.09: the Timeline mounts
      // the identical approve-with-deadline card the Needs-you surface renders, §6.4).
      const waitingIds = runs.filter((r) => r.state === "waiting_gate" && r.paused_at == null).map((r) => r.id);
      const gates =
        waitingIds.length === 0
          ? []
          : ((
              await tx.query(
                `${OPEN_GATE_SELECT}
                  where g.run_id = any($1::text[]) and g.resolved_at is null
                  order by g.opened_at`,
                [waitingIds],
              )
            ).rows as OpenGateRow[]);
      const gateByRun = new Map<string, { row: OpenGateRow; dto: GateCardWire }>();
      for (const g of gates) {
        if (gateByRun.has(g.run_id)) continue; // one open gate per run (earliest wins)
        const dto = {
          ...gateDtoBase(g),
          remainingEstimateCredits:
            g.estimate_credits != null ? Math.max(0, g.estimate_credits - g.spent_credits) : null,
        };
        // P1.09 — the kind's structured parts (same loader the Needs-you feed uses).
        await attachStructuredBody(tx, deps, g, dto);
        gateByRun.set(g.run_id, { row: g, dto });
      }

      // P1.09 (§6.4 item 8; REQ-RUN-5) — every run's permanent decision records (resolved gates:
      // approved/auto/expired/skipped) ride the card view so the surfaces render them identically.
      const decisionsByRun = await loadRunDecisions(tx, runIds);

      // undelivered queued-note counts (steer.queued acknowledges the write; only guidance rows know delivery)
      const noteCounts =
        runIds.length === 0
          ? []
          : ((
              await tx.query(
                `select run_id, count(*)::int as n from guidance
                  where run_id = any($1::text[]) and standing = false and active = true
                    and consumed_by = '[]'::jsonb
                  group by run_id`,
                [runIds],
              )
            ).rows as { run_id: string; n: number }[]);
      const notesByRun = new Map(noteCounts.map((r) => [r.run_id, r.n]));

      // deliverable chips for terminal runs: correspondence kind + finding/claim counts + produced kinds
      const terminalIds = runs.filter((r) => TERMINAL.has(r.state)).map((r) => r.id);
      const corr =
        terminalIds.length === 0
          ? []
          : ((
              await tx.query(
                `select ci.run_id, ci.kind,
                        (select count(*)::int from findings f where f.correspondence_id = ci.id) as findings,
                        (select count(*)::int from claims cl where cl.correspondence_id = ci.id) as claims
                   from correspondence_items ci where ci.run_id = any($1::text[])`,
                [terminalIds],
              )
            ).rows as { run_id: string; kind: string; findings: number; claims: number }[]);
      const corrByRun = new Map<string, typeof corr>();
      for (const row of corr) {
        const l = corrByRun.get(row.run_id) ?? [];
        l.push(row);
        corrByRun.set(row.run_id, l);
      }
      const producedKinds =
        terminalIds.length === 0
          ? []
          : ((
              await tx.query(
                `select distinct s.run_id, a.kind from steps s
                   join artifact_versions av on av.id = any(s.produced_version_ids)
                   join artifacts a on a.id = av.artifact_id
                  where s.run_id = any($1::text[]) and s.state = 'done'`,
                [terminalIds],
              )
            ).rows as { run_id: string; kind: string }[]);
      const kindsByRun = new Map<string, Set<string>>();
      for (const k of producedKinds) {
        const s = kindsByRun.get(k.run_id) ?? new Set<string>();
        s.add(k.kind);
        kindsByRun.set(k.run_id, s);
      }

      // refunds (the cost.refunded Σ per run) — read-model input, not inferred from state
      const refunds =
        terminalIds.length === 0
          ? []
          : ((
              await tx.query(
                `select run_id, coalesce(sum((payload->>'credits')::int), 0)::int as refunded
                   from run_events where run_id = any($1::text[]) and type = 'cost.refunded' group by run_id`,
                [terminalIds],
              )
            ).rows as { run_id: string; refunded: number }[]);
      const refundByRun = new Map(refunds.map((r) => [r.run_id, r.refunded]));

      // queue position for queued runs (1 + non-terminal runs created earlier)
      const queuePos = new Map<string, number>();
      for (const r of runs) {
        if (r.state !== "queued") continue;
        const ahead = (
          await tx.query(
            `select count(*)::int as n from runs where workspace_id = $1 and state in ('queued','provisioning','running')
               and created_at < $2`,
            [principal.workspaceId, r.created_at],
          )
        ).rows[0] as { n: number };
        queuePos.set(r.id, queuePosition(ahead.n));
      }

      // project-state inputs for the next-step card (§6.3)
      const reviews = (
        await tx.query(
          `select d.n as draft_n, ci.letter_opened_at
             from correspondence_items ci join drafts d on d.id = ci.draft_id
            where ci.project_id = $1 and ci.kind = 'review'`,
          [projectId],
        )
      ).rows as { draft_n: number; letter_opened_at: string | Date | null }[];
      const responses = (
        await tx.query(
          `select rd.n as review_draft_n
             from correspondence_items resp
             join correspondence_items rev on rev.id = resp.prior_review_id
             join drafts rd on rd.id = rev.draft_id
            where resp.project_id = $1 and resp.kind = 'response'`,
          [projectId],
        )
      ).rows as { review_draft_n: number }[];
      const outlinePresent = (
        await tx.query(`select 1 from artifacts where project_id = $1 and kind = 'outline' limit 1`, [projectId])
      ).rows.length > 0;

      const state = projectState({
        outlinePresent,
        versions: drafts.map((d) => ({ n: d.n, origin: d.origin })),
        reviews: reviews.map((r) => ({ draftN: r.draft_n, letterOpenedAt: r.letter_opened_at })),
        responses: responses.map((r) => ({ reviewDraftN: r.review_draft_n })),
        runs: runs.map((r) => ({ state: r.state })),
        acceptedVersionN: project.accepted_draft_id != null ? (draftNById.get(project.accepted_draft_id) ?? null) : null,
        exports: [],
        archivedAt: project.archived_at,
      });

      const timelineDrafts: TimelineDraft[] = drafts.map((d) => ({ draftId: d.id, n: d.n, origin: d.origin }));

      const timelineRuns: TimelineRun[] = runs.map((r) => {
        const inputs = parseInputs(r.inputs);
        const subjectN = typeof inputs["draftId"] === "string" ? (draftNById.get(inputs["draftId"] as string) ?? null) : null;
        const producedN =
          typeof inputs["nextDraftId"] === "string" ? (draftNById.get(inputs["nextDraftId"] as string) ?? null) : null;
        const runSteps = stepsByRun.get(r.id) ?? [];
        const delivered = TERMINAL.has(r.state);
        const deliverables: DeliverableChip[] = delivered
          ? [
              ...(corrByRun.get(r.id) ?? []).flatMap((row) => [
                { key: row.kind === "response" ? "response" : "letter" },
                ...(row.findings > 0 ? [{ key: "findings", count: row.findings }] : []),
                ...(row.claims > 0 ? [{ key: "claims", count: row.claims }] : []),
              ]),
              ...(kindsByRun.has(r.id)
                ? [...kindsByRun.get(r.id)!]
                    .filter((k) => k !== "letter" && k !== "response")
                    .map((k) => ({ key: k }))
                : []),
            ]
          : [];
        const phases = phasesForRun(r.workflow, inputs, runSteps, r.state);
        const card = buildRunCardView({
          runId: r.id,
          state: r.state,
          phases,
          spentCredits: r.spent_credits,
          capCredits: r.cap_credits,
          refundedCredits: refundByRun.get(r.id) ?? 0,
          ...(r.started_at != null
            ? {
                elapsedMs:
                  (r.ended_at != null ? new Date(r.ended_at).getTime() : deps.clock.now().getTime()) -
                  new Date(r.started_at).getTime(),
              }
            : {}),
          estimateCredits: r.estimate_credits,
          queuePosition: queuePos.get(r.id) ?? null,
          // ledger K4 — the running card's ETA band off this run's committed-step durations
          // (the flat per-phase prior until the run has history).
          ...(r.state === "running" || r.state === "cancelling"
            ? {
                etaBand:
                  etaBandForPhases(
                    phases,
                    runSteps.map((s) => ({
                      durationMs:
                        s.started_at != null && s.ended_at != null
                          ? new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()
                          : null,
                    })),
                  ) ?? undefined,
              }
            : {}),
          paused: r.paused_at != null,
          waitingGate: gateByRun.has(r.id)
            ? {
                kind: gateByRun.get(r.id)!.row.kind,
                deadlineAt:
                  gateByRun.get(r.id)!.row.deadline_at != null
                    ? new Date(gateByRun.get(r.id)!.row.deadline_at as string | Date).toISOString()
                    : null,
              }
            : null,
          // P1.09 — the run's permanent approval-decision records (§6.4 item 8).
          ...(decisionsByRun.has(r.id) ? { decisions: decisionsByRun.get(r.id) } : {}),
          deliverables,
          walkthrough: walkthroughState(r.walkthrough, delivered),
          failureCode: r.failure?.code ?? null,
          resumable: (r.state === "completed_partial" || r.state === "failed" || r.state === "cancelled") && runSteps.some((s) => s.state === "done"),
          queuedNotes: notesByRun.get(r.id) ?? 0,
        });
        return {
          runId: r.id,
          workflow: r.workflow,
          state: r.state,
          createdAt: new Date(r.created_at).toISOString(),
          subjectN,
          producedN,
          card,
          // P1.09 — the identical approval-card DTO the Timeline mounts under the run card (§6.4).
          ...(gateByRun.has(r.id) ? { gate: gateByRun.get(r.id)!.dto } : {}),
        };
      });

      const { rounds, ungrouped } = groupRounds(timelineDrafts, timelineRuns);
      const head = drafts.reduce<(typeof drafts)[number] | null>((b, d) => (b == null || d.n > b.n ? d : b), null);

      // the next-step card's estimate — re-derived for the suggested verb's workflow over the head draft
      // (the same estimator the sheet uses; §5.5 "est. 1,240 cr"); skipped where the verb isn't a run.
      let nextEstimate: number | null = null;
      const verb = nextStepVerb(
        state.suggested.action === "revise_using_edits"
          ? "revise"
          : state.suggested.action === "draft_v1"
            ? "draft"
            : state.suggested.action === "make_outline"
              ? "outline"
              : state.suggested.action === "show_run"
                ? "run"
                : state.suggested.action === "start_or_upload"
                  ? "start"
                  : state.suggested.action,
      );
      if (verb === "review" || verb === "revise" || verb === "draft") {
        try {
          const words =
            head != null
              ? ((
                  await tx.query(
                    `select av.word_count from drafts d join artifact_versions av on av.id = d.promoted_version_id where d.id = $1`,
                    [head.id],
                  )
                ).rows[0] as { word_count: number | null } | undefined)?.word_count ?? 0
              : 0;
          const est = buildEstimate({ workflow: verb, rigor: "standard", modelTier: "balanced", inputs: { words } });
          nextEstimate = est.estimateCredits;
        } catch {
          nextEstimate = null; // estimate is decorative — never fail the read over it
        }
      }
      return {
        kind: "ok" as const,
        project: { id: project.id, slug: project.slug, title: project.title },
        state,
        nextStep: {
          verb,
          label: state.suggested.label,
          estimateCredits: nextEstimate,
          headDraftN: head?.n ?? null,
        },
        rounds: rounds.map((r) => ({
          n: r.n,
          anchor: r.anchor,
          producedN: r.producedN,
          parts: collapsedRoundParts(r),
          runs: r.runs,
        })),
        ungrouped,
        // the Outline/"Imported draft" chip below the oldest round (§5.5)
        originChip: outlinePresent
          ? { kind: "outline" as const }
          : drafts.some((d) => d.origin !== "generated")
            ? { kind: "imported_draft" as const }
            : null,
      };
    });

    if (view.kind === "not_found") return c.json({ error: "not_found" }, 404);

    // lazy walkthrough enqueue (§5.5 D20) — post-read, covering grouped AND ungrouped runs; the singleton
    // key dedupes concurrent renders.
    for (const run of [...view.rounds.flatMap((r) => r.runs), ...view.ungrouped]) {
      const w = run.card.walkthrough;
      if (w?.status === "pending") {
        await maybeEnqueueWalkthrough(deps, {
          runId: run.runId,
          workspaceId: principal.workspaceId,
          state: run.state,
          walkthrough: null,
        });
      }
    }
    return c.json(view);
  });

  // ---- the run report (§14.5; Level 3 + ?advanced=1 Level 4) ----
  app.get("/runs/:id/report", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const runId = c.req.param("id");
    const advanced = c.req.query("advanced") === "1";

    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const run = (
        await tx.query(
          `select r.id, r.project_id, r.workflow, r.state, r.estimate_credits, r.cap_credits,
                  r.spent_credits, r.model_tier, r.inputs, p.slug as project_slug
             from runs r left join projects p on p.id = r.project_id
            where r.id = $1 and r.workspace_id = $2`,
          [runId, principal.workspaceId],
        )
      ).rows[0] as
        | { id: string; project_id: string | null; project_slug: string | null; workflow: string; state: RunState; estimate_credits: number; cap_credits: number; spent_credits: number; model_tier: string; inputs: Record<string, unknown> | string }
        | undefined;
      if (!run) return { kind: "not_found" } as const;

      const steps = (
        await tx.query(
          `select phase, ordinal, state, credits, attempt,
                  extract(epoch from (ended_at - started_at)) * 1000 as duration_ms
             from steps where run_id = $1 order by ordinal`,
          [runId],
        )
      ).rows as { phase: string; ordinal: number; state: string; credits: number; attempt: number; duration_ms: string | null }[];

      // Level-4 usage buckets: phase × seat × model-tier, aggregated from usage_records (step_id → phase).
      const usage = (
        await tx.query(
          `select s.phase, u.role as seat, u.subagent_label, u.model, u.model_tier,
                  sum(u.credits)::int as credits,
                  sum(coalesce(u.searches, 0))::int as searches,
                  sum(coalesce(u.fetches, 0))::int as fetches,
                  sum(coalesce(u.input_tokens, 0))::bigint as input_tokens,
                  sum(coalesce(u.output_tokens, 0))::bigint as output_tokens,
                  sum(coalesce(u.cache_read_tokens, 0))::bigint as cache_read_tokens,
                  sum(coalesce(u.cache_write_tokens, 0))::bigint as cache_write_tokens,
                  array_agg(u.provider_request_id) filter (where u.provider_request_id is not null) as provider_request_ids
             from usage_records u left join steps s on s.id = u.step_id
            where u.run_id = $1
            group by s.phase, u.role, u.subagent_label, u.model, u.model_tier
            order by s.phase nulls last, u.role`,
          [runId],
        )
      ).rows as {
        phase: string | null;
        seat: string;
        subagent_label: string | null;
        model: string;
        model_tier: string;
        credits: number;
        searches: number;
        fetches: number;
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens: number;
        cache_write_tokens: number;
        provider_request_ids: string[] | null;
      }[];

      const refunds = (
        await tx.query(
          `select coalesce(sum((payload->>'credits')::int), 0)::int as refunded
             from run_events where run_id = $1 and type = 'cost.refunded'`,
          [runId],
        )
      ).rows[0] as { refunded: number } | undefined;

      const claims = (
        await tx.query(
          `select count(*)::int as checked,
                  count(*) filter (where cl.verdict in ('verified','verified_against_user_source','substantially_accurate'))::int as verified
             from claims cl join correspondence_items ci on ci.id = cl.correspondence_id
            where ci.run_id = $1`,
          [runId],
        )
      ).rows[0] as { checked: number; verified: number } | undefined;

      const inputs = parseInputs(run.inputs);
      const shape = phaseShapeForWorkflow(run.workflow as WorkflowKey, inputs);
      const stepByPhase = new Map(steps.map((s) => [s.phase, s]));
      const phases = shape.map((p, i) => {
        const s = stepByPhase.get(p.key);
        return {
          key: p.key,
          ordinal: s?.ordinal ?? i + 1,
          status: (p.off ? "off" : s?.state === "done" ? "done" : s?.state === "failed" ? "skipped" : s != null ? "running" : "pending") as PhaseStatus,
          seat: p.seat,
        };
      });
      for (const s of steps) {
        if (!phases.some((p) => p.key === s.phase)) {
          phases.push({ key: s.phase, ordinal: s.ordinal, status: s.state === "done" ? "done" : "skipped", seat: null });
        }
      }

      const reportSteps: ReportStepRow[] = steps.map((s) => ({
        phase: s.phase,
        ordinal: s.ordinal,
        state: s.state,
        credits: s.credits,
        durationMs: s.duration_ms != null ? Math.round(Number(s.duration_ms)) : null,
        attempt: s.attempt,
      }));
      const reportUsage: ReportUsageRow[] = usage.map((u) => ({
        phase: u.phase,
        seat: u.seat,
        subagentLabel: u.subagent_label,
        model: u.model,
        modelTier: u.model_tier,
        credits: u.credits,
        durationMs: null, // per-request durations aren't metered at bucket grain
        searches: u.searches,
        fetches: u.fetches,
        inputTokens: Number(u.input_tokens),
        outputTokens: Number(u.output_tokens),
        cacheReadTokens: Number(u.cache_read_tokens),
        cacheWriteTokens: Number(u.cache_write_tokens),
        providerRequestIds: u.provider_request_ids ?? [],
      }));

      const report = buildRunReport({
        runId,
        workflow: run.workflow,
        state: run.state,
        estimateCredits: run.estimate_credits,
        spentCredits: run.spent_credits,
        capCredits: run.cap_credits,
        refundedCredits: refunds?.refunded ?? 0,
        phases,
        steps: reportSteps,
        usage: reportUsage,
        claims: claims != null && claims.checked > 0 ? { checked: claims.checked, verified: claims.verified } : null,
        modelTier: run.model_tier,
      });
      return {
        kind: "ok" as const,
        report,
        ...(advanced ? { advancedView: buildRunReportAdvanced(runId, reportUsage) } : {}),
        // the owning project's slug — the `/app/usage/r/:run` redirect resolves its /p/ path from it.
        projectSlug: run.project_slug,
      };
    });

    if (res.kind === "not_found") return c.json({ error: "not_found" }, 404);
    return c.json(res);
  });

  // ---- steering (§6.5) ----

  // "Pause after this phase" — the flag commitStep honors at the next boundary.
  app.post("/runs/:id/pause", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await requestPause(deps, { runId: c.req.param("id"), workspaceId: principal.workspaceId });
    if (!res.ok) return c.json({ error: res.reason, ...(res.state != null ? { state: res.state } : {}) }, res.reason === "not_found" ? 404 : 409);
    return c.json(res);
  });

  // Resume a steering-parked run; body {note?} captures Resume-with-note as queued_message guidance.
  app.post("/runs/:id/resume", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { note?: string; projectId?: string };
    const runId = c.req.param("id");
    // the project id is server truth — resolve it from the run row, never trust the body's.
    const projectId = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const r = (await tx.query("select project_id from runs where id = $1 and workspace_id = $2", [runId, principal.workspaceId])).rows[0] as
        | { project_id: string | null }
        | undefined;
      return r?.project_id ?? null;
    });
    if (projectId == null) return c.json({ error: "not_found" }, 404);
    const res = await resumePausedRun(deps, {
      runId,
      workspaceId: principal.workspaceId,
      projectId,
      userId: principal.userId,
      ...(body.note != null ? { note: body.note } : {}),
    });
    if (!res.ok) return c.json({ error: res.reason }, res.reason === "not_found" ? 404 : 409);
    return c.json(res);
  });

  // "Note for the next phase" → Guidance{source:'queued_message', scope:'run'}.
  app.post("/runs/:id/notes", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    if (typeof body.text !== "string" || body.text.trim() === "") return c.json({ error: "empty" }, 400);
    const runId = c.req.param("id");
    const projectId = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const r = (await tx.query("select project_id from runs where id = $1 and workspace_id = $2", [runId, principal.workspaceId])).rows[0] as
        | { project_id: string | null }
        | undefined;
      return r?.project_id ?? null;
    });
    if (projectId == null) return c.json({ error: "not_found" }, 404);
    const res = await queueRunNote(deps, {
      runId,
      workspaceId: principal.workspaceId,
      projectId,
      userId: principal.userId,
      text: body.text,
    });
    if (!res.ok) return c.json({ error: res.reason }, res.reason === "not_found" ? 404 : res.reason === "empty" ? 400 : 409);
    return c.json(res, 201);
  });

  // "Stop, keep partials" — the canonical cancel path (committed artifacts stay; holds release).
  app.post("/runs/:id/stop", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const res = await cancelRun(deps, { runId: c.req.param("id"), workspaceId: principal.workspaceId });
    if (!res.ok) return c.json({ error: res.reason, ...(res.state != null ? { state: res.state } : {}) }, res.reason === "not_found" ? 404 : 409);
    return c.json(res);
  });

  // Walkthrough retry — clears the failed record and re-enqueues the one package-class call.
  app.post("/runs/:id/walkthrough/retry", async (c) => {
    const principal = deps.principal(c);
    if (!principal) return c.json({ error: "unauthenticated" }, 401);
    const runId = c.req.param("id");
    const res = await deps.txRunner.run(principal.workspaceId, async (tx) => {
      const r = (
        await tx.query("select state, walkthrough from runs where id = $1 and workspace_id = $2 for update", [runId, principal.workspaceId])
      ).rows[0] as { state: RunState; walkthrough: { status?: string } | null } | undefined;
      if (!r) return { kind: "not_found" } as const;
      if (!TERMINAL.has(r.state) || (r.state !== "completed" && r.state !== "completed_partial")) {
        return { kind: "not_delivered" } as const;
      }
      if (r.walkthrough?.status === "ready") return { kind: "ready" } as const;
      // clear the record so maybeEnqueueWalkthrough's null-check re-arms the job
      await tx.query("update runs set walkthrough = null where id = $1", [runId]);
      return { kind: "requeued" } as const;
    });
    if (res.kind === "not_found") return c.json({ error: "not_found" }, 404);
    if (res.kind === "not_delivered") return c.json({ error: "not_delivered" }, 409);
    if (res.kind === "ready") return c.json({ status: "ready" });
    await deps.queue.send(RUN_JOBS.walkthrough, { runId, workspaceId: principal.workspaceId }, { singletonKey: `walkthrough:${runId}` });
    return c.json({ status: "requeued" }, 202);
  });

  return app;
}
