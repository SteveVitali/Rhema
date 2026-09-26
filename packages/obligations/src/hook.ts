import type { Actor, RunEventType } from "@rhema/contracts";
import { parseRunEvent } from "@rhema/contracts";
import type { ObligationDeliveryContext, ObligationHook } from "@rhema/mirror";
import type { ObligationCounts } from "./counts.js";
import { computeDeliveryCounts, reconcileCounts } from "./counts.js";
import type { ObligationDeps, SqlExecutor } from "./types.js";
import {
  insertLineageEdge,
  loadLineageFindings,
  loadObligationByFinding,
  loadProjectObligations,
} from "./queries.js";
import { matchFinding, quoteOf, type CandidateFinding, type LineageMatchOptions } from "./lineage.js";
import { bumpSeverity, incrementRoundsOpen, spawnObligationFromFinding, spawnsAtDelivery } from "./spawn.js";
import { dischargeByGapCheck, dischargeByNoMatch, mootObligation, reopenObligation, sweepArrivedDeferrals } from "./discharge.js";
import { routeDisposition, spawnAndRouteMinor } from "./routing.js";
import type { Severity } from "@rhema/contracts";

// The delivery hook (REQ-OBJ-2/3/4; REQ-WF-7). This is the concrete implementation of `@rhema/mirror`'s
// `ObligationHook` seam — it runs INSIDE the REQ-DATA-7 delivery transaction (so spawn/join/transition either
// all commit with the dossier or none do). At a covering REVIEW delivery it, in order:
//   1. returns any deferred obligation whose horizon arrived to `open` (a snooze re-enters — §11.7);
//   2. matches each new blocking/major finding to an existing obligation (the three matchers) — a match onto an
//      addressed/discharged/mooted lineage is a REGRESSION (→ reopened, roundsOpen++), a match onto an active
//      lineage is CARRIED (roundsOpen++), no match spawns a new obligation (root);
//   3. discharges every pre-existing active obligation this covering review did NOT re-raise (REQ-WF-7's
//      "closed" set — verifiedBy 're_review');
//   4. computes carried/closed/new FROM ROWS and reconciles against the Editor's sidecar tally — a mismatch is
//      a delivery-validation WARNING (a `check.result{passed:false}` event), never a failure.
// A non-review delivery (e.g. a Revise `response`) writes no findings, so the hook is a no-op there; the
// response ledger's accept/adapt/rebut/defer moves route obligations via `routeDisposition` (PRB.06 wiring).

/** Append seam (the orchestrator's `SqlEventWriter.append` satisfies it structurally) — for the count warning. */
export interface ObligationEventAppender {
  append(
    exec: SqlExecutor,
    ev: { runId: string; type: RunEventType; payload: unknown; at: Date; agentLabel?: string },
  ): Promise<unknown>;
}

export interface SqlObligationHookOptions {
  readonly ids: ObligationDeps["ids"];
  readonly clock: ObligationDeps["clock"];
  /** optional: emit the REQ-WF-7 count-mismatch warning as a `check.result` event. */
  readonly appendEvent?: ObligationEventAppender;
  /** lineage matcher tuning (matcher 3 default off — REQ-OBJ-4). */
  readonly lineage?: LineageMatchOptions;
}

/** The result the hook records for the caller's report (also what the tests assert). */
export interface ObligationDeliveryOutcome {
  readonly spawned: readonly string[];
  readonly carried: readonly string[];
  readonly reopened: readonly string[];
  readonly discharged: readonly string[];
  /** obligation ids a delivered `response`'s frozen ledger routed (PRB.06; empty on a review delivery). */
  readonly routed: readonly string[];
  readonly counts: ObligationCounts;
  readonly countsMatch: boolean;
}

export class SqlObligationHook implements ObligationHook {
  private readonly deps: ObligationDeps;
  private readonly appendEvent?: ObligationEventAppender;
  private readonly lineageOptions: LineageMatchOptions;
  /** the most recent delivery's outcome (tests + the orchestrator report read it; the hook is single-run/tx). */
  lastOutcome: ObligationDeliveryOutcome | null = null;

  constructor(opts: SqlObligationHookOptions) {
    this.deps = { ids: opts.ids, clock: opts.clock };
    if (opts.appendEvent) this.appendEvent = opts.appendEvent;
    this.lineageOptions = opts.lineage ?? {};
  }

  async onDelivery(ctx: ObligationDeliveryContext): Promise<void> {
    // A `response` delivery writes no findings — but the frozen response ledger it folds in ROUTES the
    // obligations its moves answer (PRB.06; the auto-path of D-P0.12-2). Route before returning.
    if (ctx.correspondenceKind === "response") {
      await this.routeResponseLedger(ctx);
      return;
    }
    // Obligations are review-driven at delivery; a delivery with no findings is a no-op.
    if (ctx.correspondenceKind !== "review" || ctx.findings.length === 0) return;
    const { exec } = ctx;
    const actor: Actor = { kind: "system" };
    const now = this.deps.clock.now();

    // 1. return arrived deferrals to open (and decrement in-flight round countdowns) BEFORE matching. The ids
    //    returned this delivery re-enter as `open` for the USER — a snooze, never a burial (§11.7) — so they
    //    are EXEMPT from step 3's no-match discharge in the same delivery (they get their round next time).
    const returnedFromDefer = new Set(
      await sweepArrivedDeferrals(exec, this.deps, { projectId: ctx.projectId, context: "review", byActor: actor, runId: ctx.runId, at: now }),
    );

    // load the project's obligations + lineage AFTER the deferral sweep (returned-from-defer are now `open`).
    const before = await loadProjectObligations(exec, ctx.projectId);
    const stateById = new Map(before.map((o) => [o.id, o.state]));
    const obligationIds = new Set(before.map((o) => o.id));
    const lineage = await loadLineageFindings(exec, ctx.projectId);

    const matchedObligationIds = new Set<string>();
    const spawned: string[] = [];
    const carried: string[] = [];
    const reopened: string[] = [];

    // 2. match each finding (deterministic order) → carried / regression / spawn.
    for (const f of [...ctx.findings].sort((a, b) => a.ordinal - b.ordinal)) {
      if (f.reconciliation === "rejected") continue; // spawns nothing unless promoted (REQ-IDE-26)
      const candidate: CandidateFinding = {
        findingId: f.findingId,
        kind: f.kind,
        quote: quoteOf(f.anchor as { quote?: string } | null),
        normalizedUrl: f.normalizedUrl ?? null,
        carriesObligationId: f.carriesObligationId ?? null,
      };
      const match = matchFinding(candidate, lineage, obligationIds, this.lineageOptions);
      if (match) {
        // A regression is decided by the ORIGINAL (pre-delivery) state, so a second finding matching the same
        // obligation this round does not see a mid-delivery 'reopened' and attempt an invalid re-transition.
        const original = stateById.get(match.obligationId);
        const isRegression = original === "addressed" || original === "discharged" || original === "mooted";
        // a rebutted lineage is closed WITH AN ARGUMENT ON FILE — a new match neither carries nor reopens it
        // (that is what lets re-review decline to re-raise without losing the record; §11.7). Record the edge
        // for the trail, but do not bump roundsOpen on a closed row or transition it.
        const isRebutted = original === "rebutted";
        await insertLineageEdge(exec, {
          obligationId: match.obligationId,
          findingId: f.findingId,
          correspondenceId: ctx.correspondenceId,
          relation: isRegression ? "regression" : "carried",
        });
        if (!isRebutted) await bumpSeverity(exec, match.obligationId, f.severity as Severity);
        // the STATE transition + roundsOpen bump happen at most ONCE per obligation per delivery.
        if (!isRebutted && !matchedObligationIds.has(match.obligationId)) {
          if (isRegression) {
            await reopenObligation(exec, this.deps, { obligationId: match.obligationId, findingId: f.findingId, byActor: actor, runId: ctx.runId, at: now });
            reopened.push(match.obligationId);
          } else {
            await incrementRoundsOpen(exec, match.obligationId); // survived another covering round
            carried.push(match.obligationId);
          }
        }
        matchedObligationIds.add(match.obligationId);
        continue;
      }
      // no match → spawn a NEW obligation for a blocking/major finding (minor spawns only on accept/adapt).
      if (spawnsAtDelivery(f.severity as Severity)) {
        const id = await spawnObligationFromFinding(exec, this.deps, {
          projectId: ctx.projectId,
          findingId: f.findingId,
          severity: f.severity as Severity,
          kind: f.kind,
          title: f.title,
          correspondenceId: ctx.correspondenceId,
          draftId: ctx.draftId,
          runId: ctx.runId,
          at: now,
        });
        spawned.push(id);
      }
    }

    // 3. discharge the "closed" set: pre-existing active obligations this covering review did NOT re-raise
    //    (REQ-WF-7). Only a WHOLE-DRAFT covering review discharges by omission — a scoped/phase-subset run
    //    (Fact-check, a scoped Review; REQ-WF-13) never discharges obligations outside its scope. Deferred
    //    (snoozed) and already-closed obligations are excluded, as is any deferral just returned to open THIS
    //    delivery (it re-enters for the user, and is not immediately buried).
    const discharged: string[] = [];
    if (ctx.coversAllObligations !== false) {
      for (const o of before) {
        if (matchedObligationIds.has(o.id)) continue;
        if (returnedFromDefer.has(o.id)) continue;
        if (o.state === "open" || o.state === "addressed" || o.state === "reopened") {
          await dischargeByNoMatch(exec, this.deps, { obligationId: o.id, draftId: ctx.draftId, byActor: actor, runId: ctx.runId, at: now });
          discharged.push(o.id);
        }
      }
    }

    // 4. counts (from rows) reconciled with the Editor's sidecar tally → a warning, never a failure (REQ-WF-7).
    const counts = await computeDeliveryCounts(exec, { correspondenceId: ctx.correspondenceId, runId: ctx.runId });
    const reconciliation = reconcileCounts(counts, ctx.sidecarCounts);
    if (!reconciliation.match && this.appendEvent) {
      const ev = parseRunEvent("check.result", { name: "obligation_counts", passed: false });
      await this.appendEvent.append(exec, { runId: ctx.runId, type: ev.type, payload: ev.payload, at: now });
    }

    // 5. `rereview.lineage` (PRB.06; REQ-WF-7): on a re-review — `prior_review_id` set, or any carried /
    //    closed / reopened lineage this round — emit the row-computed tally the run report's
    //    "N carried, M closed, K new" line reads. The counts come from `computeDeliveryCounts` (obligation
    //    rows), never from the sidecar's self-reported numbers.
    if (
      this.appendEvent &&
      (ctx.priorReviewId != null || counts.carried > 0 || counts.closed > 0 || reopened.length > 0)
    ) {
      const ev = parseRunEvent("rereview.lineage", {
        correspondenceId: ctx.correspondenceId,
        ...(ctx.priorReviewId != null ? { priorReviewId: ctx.priorReviewId } : {}),
        carried: counts.carried,
        closed: counts.closed,
        new: counts.new,
        reopened: reopened.length,
      });
      await this.appendEvent.append(exec, { runId: ctx.runId, type: ev.type, payload: ev.payload, at: now });
    }

    this.lastOutcome = { spawned, carried, reopened, discharged, routed: [], counts, countsMatch: reconciliation.match };
  }

  /**
   * Route a delivered `response`'s frozen ledger rows through the obligation transitions (PRB.06 —
   * the auto-path of D-P0.12-2): an accept/adapt move `done` addresses the obligation, `verified`
   * discharges it (gap_check evidence), `mooted` moots it; rebut/defer/escalate route the same way the
   * Triage writes do. `proposed`/`open` rows are plans, not moves — they leave the obligation open.
   */
  private async routeResponseLedger(ctx: ObligationDeliveryContext): Promise<void> {
    const entries = ctx.responseLedger?.entries ?? [];
    if (entries.length === 0) return;
    const { exec } = ctx;
    const actor: Actor = { kind: "system" };
    const now = this.deps.clock.now();
    // the review this response answers — the run-supplied prior_review, else the project's latest review.
    const reviewCorrId =
      ctx.priorReviewId ??
      ((
        await exec.query(
          `select id from correspondence_items where project_id = $1 and kind = 'review' order by delivered_at desc limit 1`,
          [ctx.projectId],
        )
      ).rows[0] as { id: string } | undefined)?.id;
    if (reviewCorrId == null) return;
    const routed: string[] = [];
    for (const entry of [...entries].sort((a, b) => a.findingOrdinal - b.findingOrdinal)) {
      const finding = (
        await exec.query(
          `select id, severity, kind, title from findings where correspondence_id = $1 and ordinal = $2`,
          [reviewCorrId, entry.findingOrdinal],
        )
      ).rows[0] as { id: string; severity: string; kind: string | null; title: string } | undefined;
      if (!finding) continue;
      const d = entry.disposition;
      const obl = await loadObligationByFinding(exec, ctx.projectId, finding.id);
      if (obl == null) {
        // a minor finding carries no obligation until the author accepts/adapts it (REQ-OBJ-2) — a
        // positive move spawns + routes it closed in one step.
        if (d.kind === "accept" || d.kind === "adapt") {
          const id = await spawnAndRouteMinor(exec, this.deps, {
            projectId: ctx.projectId,
            findingId: finding.id,
            kind: finding.kind ?? "other",
            title: finding.title,
            correspondenceId: reviewCorrId,
            draftId: ctx.draftId,
            disposition: {
              kind: d.kind,
              ...(d.status != null ? { status: d.status } : {}),
              ...(d.moveOrdinal != null ? { moveOrdinal: d.moveOrdinal } : {}),
            },
            byActor: actor,
            runId: ctx.runId,
            at: now,
          });
          routed.push(id);
        }
        continue;
      }
      switch (d.kind) {
        case "rebut":
          await routeDisposition(exec, this.deps, {
            obligationId: obl.id,
            kind: "rebut",
            ...(d.rationale != null ? { rationale: d.rationale } : {}),
            findingId: finding.id,
            draftId: ctx.draftId,
            byActor: actor,
            runId: ctx.runId,
            at: now,
          });
          routed.push(obl.id);
          break;
        case "defer":
          await routeDisposition(exec, this.deps, {
            obligationId: obl.id,
            kind: "defer",
            ...(d.rationale != null ? { rationale: d.rationale } : {}),
            findingId: finding.id,
            draftId: ctx.draftId,
            byActor: actor,
            runId: ctx.runId,
            at: now,
          });
          routed.push(obl.id);
          break;
        case "escalate":
          await routeDisposition(exec, this.deps, {
            obligationId: obl.id,
            kind: "escalate",
            findingId: finding.id,
            draftId: ctx.draftId,
            byActor: actor,
            runId: ctx.runId,
            at: now,
          });
          routed.push(obl.id);
          break;
        case "accept":
        case "adapt":
          if (d.status === "verified") {
            // the runner verified the move against its discharge evidence → straight to `discharged`.
            await dischargeByGapCheck(exec, this.deps, {
              obligationId: obl.id,
              draftId: ctx.newDraftId ?? ctx.draftId,
              byActor: actor,
              ...(d.moveOrdinal != null ? { moveOrdinal: d.moveOrdinal } : {}),
              runId: ctx.runId,
              at: now,
            });
            routed.push(obl.id);
          } else if (d.status === "mooted") {
            await mootObligation(exec, this.deps, {
              obligationId: obl.id,
              byActor: actor,
              runId: ctx.runId,
              at: now,
            });
            routed.push(obl.id);
          } else {
            // 'done' addresses; 'proposed'/'open' are a deliberate no-op (the move is planned, not landed).
            const res = await routeDisposition(exec, this.deps, {
              obligationId: obl.id,
              kind: d.kind,
              ...(d.status != null ? { status: d.status } : {}),
              ...(d.moveOrdinal != null ? { moveOrdinal: d.moveOrdinal } : {}),
              ...(d.rationale != null ? { rationale: d.rationale } : {}),
              findingId: finding.id,
              draftId: ctx.draftId,
              byActor: actor,
              runId: ctx.runId,
              at: now,
            });
            if (res.transitioned) routed.push(obl.id);
          }
          break;
      }
    }
    this.lastOutcome = {
      spawned: [],
      carried: [],
      reopened: [],
      discharged: [],
      routed,
      counts: { carried: 0, closed: 0, new: 0 },
      countsMatch: true,
    };
  }
}
